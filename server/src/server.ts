import {
	createConnection,
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

// let startupCommands: Record<string, number> = {
// 	"create":1, "scene_list":1, "title":1, "author":1, "achievement":1, "product":1
// };

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
});

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
	documents.all().forEach(validateTextDocument);
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
/**
 * Global variables defined in startup.txt as a map of variable names to position in startup.txt
 */
let globalVariables: Map<string, Position> = new Map();
/**
 * Local variables per file as a map of file URIs to a map of variable names to positions in the file
 */
let localVariables: Map<string, Map<string, Position>> = new Map();
/**
 * Labels per file as a map of file URIs to a map of label names to positions in the file
 */
let labels: Map<string, Map<string, Position>> = new Map();

// TODO deal with files being deleted, so that they're removed from the above

documents.onDidOpen(e => {
	identifyVariablesAndLabels(e.document);
});

// Only keep settings for open documents
documents.onDidClose(e => {
	documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
	identifyVariablesAndLabels(change.document);
	validateTextDocument(change.document);
});

function* iteratorMap<T>(iterable: Iterable<T>, transform: Function) {
	for (var item of iterable) {
		yield transform(item);
	}
}

function getFilenameFromUri(uri: string): string | undefined {
	/**
	 * Extract the filename portion from a URI.
	 */
	return uri.split('/').pop();
}

function uriIsStartupFile(uri: string): boolean {
	/**
	 * Determine if a URI points to a ChoiceScript startup file.
	 */
	return (getFilenameFromUri(uri) == "startup.txt");
}

function createDiagnostic(severity: DiagnosticSeverity, textDocument: TextDocument, 
	start: number, end: number, message: string): Diagnostic {
		/**
		 * Generate a diagnostic message.
		 * 
		 * @param severity - Diagnostic severity.
		 * @param textDocument - Document to which the diagnostic applies.
		 * @param start - Start location of the diagnostic message.
		 * @param end - End location of the diagnostic message.
		 * @param message - Diagnostic message.
		 */
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

async function identifyVariablesAndLabels(textDocument: TextDocument): Promise<void> {
	let text = textDocument.getText();
	let isStartupFile: boolean = uriIsStartupFile(textDocument.uri);

	let pattern: RegExp | null = null;
	if (isStartupFile) {
		pattern = /(\n\s*)?\*(create|temp|label)\s+(\w+)/g;
	}
	else {
		// *create is not legal except in startup files
		pattern = /(\n\s*)?\*(temp|label)\s+(\w+)/g;
	}
	let m: RegExpExecArray | null;

	let newGlobalVariables: Map<string, Position> = new Map();
	let newLocalVariables: Map<string, Position> = new Map();
	let newLabels: Map<string, Position> = new Map();

	while (m = pattern.exec(text)) {
		let prefix: string = m[1];
		let command: string = m[2];
		let value: string = m[3];
		let commandPosition: Position = textDocument.positionAt(m.index + prefix.length);

		if (!(prefix === undefined && m.index > 0)) {
			switch (command) {
				case "create":
					// *create instantiates global variables
					newGlobalVariables.set(value, commandPosition);
					break;
				case "temp":
					// *temp instantiates variables local to the file
					newLocalVariables.set(value, commandPosition);
					break;
				case "label":
					// *label creates a goto/gosub label local to the file
					newLabels.set(value, commandPosition);
					break;
			}
		}
	}

	if (isStartupFile) {
		globalVariables = newGlobalVariables;
	}
	localVariables.set(textDocument.uri, newLocalVariables);
	labels.set(textDocument.uri, newLabels);
}


async function validateTextDocument(textDocument: TextDocument): Promise<void> {
	// In this simple example we get the settings for every validate run.
	let settings = await getDocumentSettings(textDocument.uri);

	// Validate commands start on a line
	let text = textDocument.getText();
	let commandPattern: RegExp = /(\n\s*)?\*(\w+)(\s+(\w+))?/g;
	let m: RegExpExecArray | null;

	let isStartupFile = uriIsStartupFile(textDocument.uri);
	let currentLabels = labels.get(textDocument.uri);
	let currentGlobalVariables = globalVariables.get(textDocument.uri);
	let currentLocalVariables = localVariables.get(textDocument.uri);

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
		return generateInitialCompletions(textDocumentPosition.textDocument.uri, textDocumentPosition.position);
	}
);

function generateInitialCompletions(documentUri: string, position: Position): CompletionItem[] {
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
				let variablesMap = localVariables.get(documentUri);
				if (variablesMap !== undefined) {
					completions = Array.from(iteratorMap(variablesMap.keys(), (x: string) => ({
							label: x, 
							kind: CompletionItemKind.Keyword, 
							data: "command"
					})));
				}
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
