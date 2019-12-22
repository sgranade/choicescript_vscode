import {
	createConnection,
	WorkspaceFolder,
	TextDocuments,
	TextDocument,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	TextDocumentPositionParams,
	Position,
	Definition
} from 'vscode-languageserver';
import { TextDocument as TextDocumentImplementation } from 'vscode-languageserver-textdocument';
const fs = require('fs').promises;
import url = require('url');
import * as URI from 'urijs';
import globby = require('globby');

import { ProjectIndex, IdentifierIndex, ReadonlyIdentifierIndex, updateProjectIndex, ReferenceIndex } from './indexer';
import { generateDiagnostics } from './validator';
import { uriIsStartupFile } from './language';
import { generateInitialCompletions } from './completions';

class Index implements ProjectIndex {
	_startupFileUri: string;
	_globalVariables: IdentifierIndex;
	_localVariables: Map<string, IdentifierIndex>;
	_references: Map<string, ReferenceIndex>;
	_scenes: Array<string>;
	_localLabels: Map<string, IdentifierIndex>;

	constructor() {
		this._startupFileUri = "";
		this._globalVariables = new Map();
		this._localVariables = new Map();
		this._references = new Map();
		this._scenes = [];
		this._localLabels = new Map();
	}

	updateGlobalVariables(textDocument: TextDocument, newIndex: IdentifierIndex) {
		this._startupFileUri = normalizeUri(textDocument.uri);
		this._globalVariables = newIndex;
	}
	updateLocalVariables(textDocument: TextDocument, newIndex: IdentifierIndex) {
		this._localVariables.set(normalizeUri(textDocument.uri), newIndex);
	}
	updateReferences(textDocument: TextDocument, newIndex: ReferenceIndex) {
		this._references.set(normalizeUri(textDocument.uri), newIndex);
	}
	updateSceneList(scenes: Array<string>) {
		this._scenes = scenes;
	}
	updateLabels(textDocument: TextDocument, newIndex: IdentifierIndex) {
		this._localLabels.set(normalizeUri(textDocument.uri), newIndex);
	}
	getStartupFileUri(): string {
		return this._startupFileUri;
	}
	getGlobalVariables(): ReadonlyIdentifierIndex {
		return this._globalVariables;
	}
	getLocalVariables(textDocument: TextDocument): ReadonlyIdentifierIndex {
		let index = this._localVariables.get(normalizeUri(textDocument.uri));
		if (index === undefined)
			index = new Map();
		
		return index;
	}
	getSceneList(): ReadonlyArray<string> {
		return this._scenes;
	}
	getLabels(textDocument: TextDocument): ReadonlyIdentifierIndex {
		let index = this._localLabels.get(normalizeUri(textDocument.uri));
		if (index === undefined)
			index = new Map();

		return index;
	}
	getSceneVariables(scene: string): ReadonlyIdentifierIndex | undefined {
		let sceneUri: string | undefined = undefined;
		for (let key of this._localVariables.keys()) {
			if (key.includes(scene)) {
				sceneUri = key;
				break;
			}
		}
		if (sceneUri === undefined) {
			return undefined;
		}
		return this._localVariables.get(sceneUri);
	}
	getSceneLabels(scene: string): ReadonlyIdentifierIndex | undefined {
		let sceneUri: string | undefined = undefined;
		for (let key of this._localLabels.keys()) {
			if (key.includes(scene)) {
				sceneUri = key;
				break;
			}
		}
		if (sceneUri === undefined) {
			return undefined;
		}
		return this._localLabels.get(sceneUri);
	}
	removeDocument(textDocument: TextDocument) {
		this._localVariables.delete(normalizeUri(textDocument.uri));
		this._references.delete(normalizeUri(textDocument.uri));
		this._localLabels.delete(normalizeUri(textDocument.uri));
	}
}

// Create a connection for the server. The connection uses Node's IPC as a transport.
// Also include all preview / proposed LSP features.
let connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let hasDiagnosticRelatedInformationCapability: boolean = false;

// TODO handle multiple directories with startup.txt
let projectIndex = new Index();

connection.onInitialize((params: InitializeParams) => {
	let capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we will fall back using global settings
	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);

	return {
		capabilities: {
			textDocumentSync: documents.syncKind,
			// Tell the client that the server supports code completion
			completionProvider: {
				resolveProvider: false,
				triggerCharacters: [ '*', '{' ]
			},
			definitionProvider: true,
			referencesProvider: true
		}
	};
});

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}

	// TODO this should be handled through server-to-client communications
	// using custom messages like "workspace/xfind" or the like
	// see https://stackoverflow.com/questions/51041337/vscode-language-client-extension-how-to-send-a-message-from-the-server-to-the/51081743#51081743
	// and https://stackoverflow.com/questions/51806347/visual-studio-language-extension-how-do-i-call-my-own-functions?noredirect=1&lq=1
	// for examples
	connection.workspace.getWorkspaceFolders().then(workspaces => {
		if (workspaces && workspaces.length > 0)
			findStartupFiles(workspaces)
	});
});

function findStartupFiles(workspaces: WorkspaceFolder[]) {
	workspaces.forEach((workspace) => {
		let rootPath = url.fileURLToPath(workspace.uri);
		globby('startup.txt', {
			cwd: rootPath
		}).then(paths => indexProject(paths))
	});
}

function indexProject(pathsToProjectFiles: string[]) {
	pathsToProjectFiles.map(async (path) => {
		// TODO handle multiple startup.txt files in multiple directories

		let projectPath = path;
		let startupFilename = path.split('/').pop();
		if (startupFilename) {
			projectPath = projectPath.replace(startupFilename, '');
		}

		// Index the startup.txt file
		await indexFile(path);

		// Try to index the stats page (which might not exist)
		indexFile(projectPath+"choicescript_stats.txt");

		// Try to index all of the scene files
		let scenePaths = projectIndex.getSceneList().map(name => projectPath+name+".txt");
		const promises = scenePaths.map(x => indexFile(x));

		await Promise.all(promises);

		// Revalidate all open text documents
		documents.all().forEach(doc => validateTextDocument(doc, projectIndex));
	});
}

async function indexFile(path: string) {
	let fileUri = url.pathToFileURL(path).toString();

	try {
		let data = await fs.readFile(path, 'utf8');
		let textDocument = TextDocumentImplementation.create(fileUri, 'ChoiceScript', 0, data);
		updateProjectIndex(textDocument, uriIsStartupFile(fileUri), projectIndex);
	}
	catch (err) {
		connection.console.error(`Could not read file ${path} (${err.name}: ${err.message} ${err.filename} ${err.lineNumber})`);
		return;
	}
}

// The example settings
interface ExampleSettings {
	maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
let documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
	if (hasConfigurationCapability) {
		// Reset all cached document settings
		documentSettings.clear();
	} else {
		globalSettings = <ExampleSettings>(
			(change.settings.languageServerExample || defaultSettings)
		);
	}

	// Revalidate all open text documents
	documents.all().forEach(doc => validateTextDocument(doc, projectIndex));
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}
	let result = documentSettings.get(resource);
	if (!result) {
		result = connection.workspace.getConfiguration({
			scopeUri: resource,
			section: 'languageServerExample'
		});
		documentSettings.set(resource, result);
	}
	return result;
}

// TODO deal with files being deleted, so that they're removed from the above

documents.onDidOpen(e => {
	updateProjectIndex(e.document, uriIsStartupFile(e.document.uri), projectIndex);
});

// Only keep settings for open documents
documents.onDidClose(e => {
	documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
	updateProjectIndex(change.document, uriIsStartupFile(change.document.uri), projectIndex);
	validateTextDocument(change.document, projectIndex);
});

/**
 * Normalize a URI.
 * 
 * @param uriString URI to normalize.
 */
function normalizeUri(uriString: string): string {
	let uri = new URI(uriString);
	return uri.normalize().toString();
}

function validateTextDocument(textDocument: TextDocument, projectIndex: ProjectIndex) {
	let diagnostics = generateDiagnostics(textDocument, projectIndex);
	connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	connection.console.log('We received an file change event');
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
	(textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
		let document = documents.get(textDocumentPosition.textDocument.uri);
		if (document === undefined) {
			return [];
		}
		return generateInitialCompletions(document, textDocumentPosition.position, projectIndex);
	}
);

connection.onDefinition(
	(textDocumentPosition: TextDocumentPositionParams): Definition | undefined => {
		return generateDefinition(textDocumentPosition.textDocument.uri, textDocumentPosition.position, projectIndex);
	}
);

function generateDefinition(documentUri: string, position: Position, projectIndex: ProjectIndex): Definition | undefined {
	let definition: Definition | undefined = undefined;

	// Find out what trigger character started this by loading the document and scanning backwards
	let document = documents.get(documentUri);
	if (document === undefined) {
		return definition;
	}
	let text = document.getText();
	let index = document.offsetAt(position);
	
	let start: number | null = null;
	let end: number | null = null;

	// Get the symbol at this location
	let symbolPattern = /[\w-]/;

	for (var i = index; i >= 0; i--) {
		if (!symbolPattern.test(text[i])) {
			start = i+1;
			break;
		}
	}
	for (var i = index; i < text.length; i++) {
		if (!symbolPattern.test(text[i])) {
			end = i;
			break;
		}
	}
	if (!start || !end) {
		return definition;
	}
	let symbol = text.substring(start, end);

	let location = projectIndex.getLocalVariables(document).get(symbol);
	if (location === undefined) {
		location = projectIndex.getGlobalVariables().get(symbol);
	}

	if (location !== undefined) {
		definition = location;
	}

	return definition;
}

/*
connection.onDidOpenTextDocument((params) => {
	// A text document got opened in VSCode.
	// params.textDocument.uri uniquely identifies the document. For documents store on disk this is a file URI.
	// params.textDocument.text the initial full content of the document.
	connection.console.log(`${params.textDocument.uri} opened.`);
});
connection.onDidChangeTextDocument((params) => {
	// The content of a text document did change in VSCode.
	// params.textDocument.uri uniquely identifies the document.
	// params.contentChanges describe the content changes to the document.
	connection.console.log(`${params.textDocument.uri} changed: ${JSON.stringify(params.contentChanges)}`);
});
connection.onDidCloseTextDocument((params) => {
	// A text document got closed in VSCode.
	// params.textDocument.uri uniquely identifies the document.
	connection.console.log(`${params.textDocument.uri} closed.`);
});
*/

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();