import {
	createConnection,
	WorkspaceFolder,
	TextDocuments,
	TextDocument,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	Position
} from 'vscode-languageserver';
import { TextDocument as TextDocumentImplementation } from 'vscode-languageserver-textdocument';
import { readFile } from 'fs';
import { ErrnoException } from '@nodelib/fs.stat/out/types';
import url = require('url');
import * as URI from 'urijs';
import globby = require('globby');

import { ProjectIndex, IdentifierIndex, ReadonlyIdentifierIndex, updateProjectIndex } from './indexer';

class Index implements ProjectIndex {
	_globalVariables: IdentifierIndex;
	_localVariables: Map<string, IdentifierIndex>;
	_localLabels: Map<string, IdentifierIndex>;

	constructor() {
		this._globalVariables = new Map();
		this._localVariables = new Map();
		this._localLabels = new Map();
	}

	updateGlobalVariables(newIndex: IdentifierIndex) {
		this._globalVariables = newIndex;
	}
	updateLocalVariables(textDocument: TextDocument, newIndex: IdentifierIndex) {
		this._localVariables.set(textDocument.uri, newIndex);
	}
	updateLabels(textDocument: TextDocument, newIndex: IdentifierIndex) {
		this._localLabels.set(textDocument.uri, newIndex);
	}
	getGlobalVariables(): ReadonlyIdentifierIndex {
		return this._globalVariables;
	}
	getLocalVariables(textDocument: TextDocument) {
		let index = this._localVariables.get(textDocument.uri);
		if (index === undefined)
			index = new Map();
		
		return index;
	}
	getLabels(textDocument: TextDocument) {
		let index = this._localLabels.get(textDocument.uri);
		if (index === undefined)
			index = new Map();

		return index;
	}
	removeDocument(textDocument: TextDocument) {
		this._localVariables.delete(textDocument.uri);
		this._localLabels.delete(textDocument.uri);
	}
}

/**
 * Commands that can only be used in startup.txt
 */
let startupCommands: Array<string> = ["create", "scene_list", "title", "author", "achievement", "product"];
/**
 * Complete list of valid commands
 */
let validCommands: Array<string> = [
	"comment", "goto", "gotoref", "label", "looplimit", "finish", "abort", "choice", "create", "temp", "delete", "set", "setref", "print", "if", "rand", "page_break", "line_break", "script", "else", "elseif", "elsif", "reset",
	"goto_scene", "fake_choice", "input_text", "ending", "share_this_game", "stat_chart",
	"subscribe", "show_password", "gosub", "return", "hide_reuse", "disable_reuse", "allow_reuse",
	"check_purchase","restore_purchases","purchase","restore_game","advertisement",
	"feedback", "save_game","delay_break","image","link","input_number","goto_random_scene",
	"restart","more_games","delay_ending","end_trial","login","achieve","scene_list","title",
	"bug","link_button","check_registration","sound","author","gosub_scene","achievement",
	"check_achievements","redirect_scene","print_discount","purchase_discount","track_event",
	"timer","youtube","product","text_image","params","config"
];
/**
 * Commands to auto-complete in startup.txt only
 */
let startupCommandsCompletions: Array<CompletionItem> = ["create", "scene_list", "title", "author", "achievement"].map(
	x => ({
		label: x, 
		kind: CompletionItemKind.Keyword, 
		data: "command"
}));
/**
 * Commands to auto-complete
 */
let validCommandsCompletions: Array<CompletionItem> = [
	"comment", "goto", "label", "finish", "choice", "temp", "delete", "set", "if", "rand", "page_break", "line_break", "script", "else", "elseif", "goto_scene", "fake_choice", "input_text", "ending", "stat_chart",
	"gosub", "return", "hide_reuse", "disable_reuse", "allow_reuse","save_game","image","link","input_number","goto_random_scene","restart","achieve","bug","sound","gosub_scene","check_achievements","redirect_scene","params",
].map(
	x => ({
		label: x, 
		kind: CompletionItemKind.Keyword, 
		data: "command"
}));
let startupCommandsLookup: Map<string, number> = new Map(startupCommands.map(x => [x, 1]));
let validCommandsLookup: Map<string, number> = new Map(validCommands.map(x => [x, 1]));

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
				resolveProvider: true,
				triggerCharacters: [ '*', '{' ]
			}
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
			searchWorkspaces(workspaces)
	});
});

function searchWorkspaces(workspaces: WorkspaceFolder[]) {
	workspaces.forEach((workspace) => {
		let rootPath = url.fileURLToPath(workspace.uri);
		connection.console.log(`${rootPath}`); // TODO DEBUG
		globby('startup.txt', {
			cwd: rootPath
		}).then(paths => initializeIndices(paths))
	});
}

function initializeIndices(pathsToStartupFiles: string[]) {
	pathsToStartupFiles.forEach((path) => {
		// TODO handle multiple startup.txt files in multiple directories
		let startupUri = url.pathToFileURL(path).toString();
		connection.console.log(`Processing ${startupUri}`); // TODO DEBUG
		readFile(path, 'utf8', (err: ErrnoException | null, data: string) => {
			if (err) {
				connection.console.error(`${err.name}: ${err.message}`);
			}
			else {
				let textDocument = TextDocumentImplementation.create(startupUri, 'ChioceScript', 0, data);
				connection.console.log("Created textDocument."); // TODO DEBUG
				updateProjectIndex(textDocument, true, projectIndex);
				connection.console.log("Indexed that document."); // TODO DEBUG
			}
		})
	});
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


/**
 * URI to the startup file, or null if it hasn't been loaded.
 */
let startupFileUri: string | null = null;


// TODO deal with files being deleted, so that they're removed from the above

documents.onDidOpen(e => {
	if (uriIsStartupFile(e.document.uri)) {
		startupFileUri = e.document.uri;
	}
	// else if (!startupFileUri) {
	// 	startupFileUri = processStartupFile(e.document.uri);
	// }
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

function* iteratorMap<T>(iterable: Iterable<T>, transform: Function) {
	for (var item of iterable) {
		yield transform(item);
	}
}

/**
 * Extract the filename portion from a URI.
 * 
 * Note that, for URIs with no filename (such as file:///path/to/file), the final portion of the
 * path is returned.
 * 
 * @param uriString URI to extract the filename from.
 * @returns The filename, or null if none is found.
 */
function getFilenameFromUri(uriString: string): string | undefined {
	let uri = URI(uriString);
	return uri.filename();
}

/**
 * Determine if a URI points to a ChoiceScript startup file.
 * 
 * @param uriString URI to see if it refers to the startup file.
 * @returns True if the URI is to the startup file, false otherwise.
 */
function uriIsStartupFile(uriString: string): boolean {
	return (getFilenameFromUri(uriString) == "startup.txt");
}

/**
 * Given a URI to a ChoiceScript file, find the URI to the ChoiceScript
 * startup file.
 * 
 * @param uriString URI to turn into the startup file.
 * @returns The potential URI to the startup file.
 */
function createStartupUri(uriString: string): string {
	let uri = URI(uriString);
	uri.filename('startup.txt');
	return uri.valueOf();
}

/**
 * Generate a diagnostic message.
 * 
 * Pass start and end locations as 0-based indexes into the document's text.
 * 
 * @param severity Diagnostic severity
 * @param textDocument Document to which the diagnostic applies.
 * @param start Start location in the text of the diagnostic message.
 * @param end End location in the text of the diagnostic message.
 * @param message Diagnostic message.
 */
function createDiagnostic(severity: DiagnosticSeverity, textDocument: TextDocument, 
		start: number, end: number, message: string): Diagnostic {
	let diagnostic: Diagnostic = {
		severity: severity,
		range: {
			start: textDocument.positionAt(start),
			end: textDocument.positionAt(end)
		},
		message: message,
		source: 'ChoiceScript'
	};

	return diagnostic;
}

// /**
//  * Given a potential ChoiceScript text file, find the startup.txt file that should be alongside it.
//  * If it exists, process it and return it.
//  * 
//  * @param otherFileUri URI to the possible ChoiceScript file.
//  * @returns URI to the startup.txt file, or null if not found.
//  */
// function processStartupFile(otherFileUri: string): string | null {
// 	let startupFileUri = createStartupUri(otherFileUri);
// 	startupDocument = connection.
// }


async function validateTextDocument(textDocument: TextDocument, projectIndex: ProjectIndex): Promise<void> {
	// In this simple example we get the settings for every validate run.
	let settings = await getDocumentSettings(textDocument.uri);

	// Validate commands start on a line
	let text = textDocument.getText();
	let commandPattern: RegExp = /(\n\s*)?\*(\w+)(\s+(\w+))?/g;
	let m: RegExpExecArray | null;

	let isStartupFile = uriIsStartupFile(textDocument.uri);
	let currentLabels = projectIndex.getLabels(textDocument);
	let currentGlobalVariables = projectIndex.getGlobalVariables();
	let currentLocalVariables = projectIndex.getLocalVariables(textDocument);

	let diagnostics: Diagnostic[] = [];
	while (m = commandPattern.exec(text)) {
		let prefix = (m[1] === undefined ? "" : m[1]);
		let command = m[2];
		let spacingAndData = (m[3] === undefined ? "" : m[3]);
		let data = (m[4] === undefined ? "" : m[4]);
		let commandStartIndex = m.index + prefix.length;
		let commandEndIndex = commandStartIndex + 1 + command.length;
		let dataStartIndex = commandEndIndex + spacingAndData.length - data.length;
		let dataEndIndex = dataStartIndex + data.length;

		if (prefix === undefined) {
			if (validCommandsLookup.get(command) && m.index > 0) {
				diagnostics.push(createDiagnostic(DiagnosticSeverity.Error, textDocument,
					commandStartIndex, commandEndIndex,
					`Command *${command} must be on a line by itself.`));
			}
		}
		else if (!validCommandsLookup.get(command)) {
			diagnostics.push(createDiagnostic(DiagnosticSeverity.Error, textDocument,
				commandStartIndex, commandEndIndex,
				`*${command} isn't a valid ChoiceScript command.`));
		}
		else {
			// Make sure we don't use commands that are limited to startup.txt in non-startup.txt files
			if (startupCommandsLookup.get(command) && !isStartupFile) {
				diagnostics.push(createDiagnostic(DiagnosticSeverity.Error, textDocument,
					commandStartIndex, commandEndIndex,
					`*${command} can only be used in startup.txt`));
			}

			switch (command) {
				case "goto":
				case "gosub":
					// goto and gosub must refer to an existing label in the file
					if (currentLabels !== undefined && currentLabels.get(data) === undefined) {
						diagnostics.push(createDiagnostic(DiagnosticSeverity.Error, textDocument,
							dataStartIndex, dataEndIndex,
							`Label wasn't found in this file`));
					}
					break;

				case "goto_scene":
				case "gosub_scene":
					// TODO handle this!
					break;
			}
		}
	}

	// Send the computed diagnostics to VSCode.
	connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	connection.console.log('We received an file change event');
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
	(textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
		return generateInitialCompletions(textDocumentPosition.textDocument.uri, textDocumentPosition.position, projectIndex);
	}
);

function generateInitialCompletions(documentUri: string, position: Position, projectIndex: ProjectIndex): CompletionItem[] {
	let completions: CompletionItem[] = [];

	// Find out what trigger character started this by loading the document and scanning backwards
	let document = documents.get(documentUri);
	if (document === undefined) {
		return completions;
	}
	let text = document.getText();
	let index = document.offsetAt(position);

	let start: number | null = null;

	for (var i = index; i >= 0; i--) {
		if (text[i] == '*' || text[i] == '{') {
			start = i;
			break;
		}
		// Don't go further back than the current line
		if (text[i] == '\n') {
			break;
		}
	}
	if (start !== null) {
		// Auto-complete commands
		if (text[start] == '*') {
			completions = [...validCommandsCompletions];  // makin' copies
			// Add in startup-only commands if valid
			if (uriIsStartupFile(documentUri)) {
				completions.push(...startupCommandsCompletions);
			}
		}
		// TODO auto-complete labels for goto/gosub &c.
		// Auto-complete variables
		if (text[start] == '{') {
			// Only auto-complete if we're not a multi-replace like @{} or @!{} or @!!{}
			var isMultireplace = false;
			for (var i = start-1; i >= 0 && i >= start-3; i--) {
				if (text[i] == '@') {
					isMultireplace = true;
					break;
				}
			}
			if (!isMultireplace) {
				let variablesMap = projectIndex.getLocalVariables(document);
				if (variablesMap !== undefined) {
					completions = Array.from(iteratorMap(variablesMap.keys(), (x: string) => ({
							label: x, 
							kind: CompletionItemKind.Variable, 
							data: "variable-local"
					})));
				}
				variablesMap = projectIndex.getGlobalVariables();
				completions.push(...Array.from(iteratorMap(variablesMap.keys(), (x: string) => ({
					label: x,
					kind: CompletionItemKind.Variable,
					data: "variable-global"
				}))));
			}
		}
	}
	return completions;
}

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
	(item: CompletionItem): CompletionItem => {
		if (item.data === 1) {
			item.detail = 'TypeScript details';
			item.documentation = 'TypeScript documentation';
		} else if (item.data === 2) {
			item.detail = 'JavaScript details';
			item.documentation = 'JavaScript documentation';
		}
		return item;
	}
);

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
