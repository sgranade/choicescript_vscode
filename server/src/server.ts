import {
	createConnection,
	WorkspaceFolder,
	TextDocuments,
	TextDocument,
	ProposedFeatures,
	InitializeParams,
	ReferenceParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	TextDocumentPositionParams,
	Position,
	Location,
	Definition,
	ReferenceContext,
	RenameParams,
	WorkspaceEdit,
	TextEdit
} from 'vscode-languageserver';
import { TextDocument as TextDocumentImplementation } from 'vscode-languageserver-textdocument';
const fs = require('fs').promises;
import url = require('url');
import globby = require('globby');

import { ProjectIndex, IdentifierIndex, ReadonlyIdentifierIndex, updateProjectIndex, ReferenceIndex } from './indexer';
import { generateDiagnostics } from './validator';
import { uriIsStartupFile } from './language';
import { generateInitialCompletions } from './completions';
import { normalizeUri } from './utilities';

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
	getReferences(symbol: string): ReadonlyArray<Location> {
		let locations: Location[] = [];

		for (let index of this._references.values()) {
			let partialLocations = index.get(symbol);
			if (partialLocations !== undefined)
				locations.push(...partialLocations);
		}

		return locations;
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
let supportsDocumentChanges: boolean = false;

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
	supportsDocumentChanges = !!(
		capabilities.workspace && 
		capabilities.workspace.workspaceEdit &&
		capabilities.workspace.workspaceEdit.documentChanges
	);

	return {
		capabilities: {
			textDocumentSync: documents.syncKind,
			completionProvider: {
				resolveProvider: false,
				triggerCharacters: [ '*', '{' ]
			},
			definitionProvider: true,
			referencesProvider: true,
			renameProvider: true
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
			(change.settings.choicescriptVsCode || defaultSettings)
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
			section: 'choicescriptVsCode'
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

// A document has been opened or its content has been changed.
documents.onDidChangeContent(change => {
	let isStartupFile = uriIsStartupFile(change.document.uri);

	updateProjectIndex(change.document, isStartupFile, projectIndex);

	if (isStartupFile) {
		// Since the startup file defines global variables, if it changes, re-validate all other files
		documents.all().forEach(doc => validateTextDocument(doc, projectIndex));
	}
	else {
		validateTextDocument(change.document, projectIndex);
	}
});

function validateTextDocument(textDocument: TextDocument, projectIndex: ProjectIndex) {
	let diagnostics = generateDiagnostics(textDocument, projectIndex);
	connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode TODO
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

connection.onReferences(
	(referencesParams: ReferenceParams): Location[] => {
		let document = documents.get(referencesParams.textDocument.uri);
		if (document === undefined) {
			return [];
		}
		return generateReferences(document, referencesParams.position, referencesParams.context, projectIndex);
	}
)

function extractSymbolAtIndex(text: string, index: number): string {
	let start = index;
	while (start >= 0 && /\w/.test(text[start]))
		start--;
	let end = index;
	while (end < text.length && /\w/.test(text[end]))
		end++;

	let symbol = text.slice(start+1, end);
	return symbol;
}

function generateReferences(textDocument: TextDocument, position: Position, context: ReferenceContext, projectIndex: ProjectIndex): Location[] {
	let text = textDocument.getText();
	let index = textDocument.offsetAt(position);
	let symbol = extractSymbolAtIndex(text, index);

	let locations = [...projectIndex.getReferences(symbol)];
	
	if (context.includeDeclaration) {
		let declarationLocation = projectIndex.getLocalVariables(textDocument).get(symbol);
		if (declarationLocation === undefined)
			declarationLocation = projectIndex.getGlobalVariables().get(symbol);

		if (declarationLocation !== undefined)
			locations.push(declarationLocation);
	}

	return locations;
}

connection.onRenameRequest(
	(renameParams: RenameParams): WorkspaceEdit | null => {
		let document = documents.get(renameParams.textDocument.uri);
		if (document === undefined) {
			return null;
		}
		return generateRenames(document, renameParams.position, renameParams.newName, projectIndex);
	}
)

function generateRenames(textDocument: TextDocument, position: Position, newName: string, projectIndex: ProjectIndex): WorkspaceEdit | null {
	let text = textDocument.getText();
	let index = textDocument.offsetAt(position);
	let symbol = extractSymbolAtIndex(text, index);

	let variableDefinition = projectIndex.getGlobalVariables().get(symbol);
	if (variableDefinition === undefined) {
		let localVariables = projectIndex.getLocalVariables(textDocument);
		if (localVariables !== undefined) {
			variableDefinition = localVariables.get(symbol);
		}
	}

	if (variableDefinition === undefined) {
		return null;
	}

	let changes: Map<string, TextEdit[]> = new Map();

	for (let location of projectIndex.getReferences(symbol)) {
		let change = TextEdit.replace(location.range, newName);
		let edits = changes.get(location.uri);
		if (edits === undefined) {
			edits = [];
			changes.set(location.uri, edits);
		}
		edits.push(change);
	}

	let workspaceEdit: WorkspaceEdit = {
		changes: {
		}
	};
	for (let [uri, edits] of changes) {
		workspaceEdit.changes![uri] = edits;
	}

	return workspaceEdit;
}

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
