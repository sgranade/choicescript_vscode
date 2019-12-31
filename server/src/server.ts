import {
	createConnection,
	WorkspaceFolder,
	TextDocuments,
	ProposedFeatures,
	InitializeParams,
	ReferenceParams,
	CompletionItem,
	TextDocumentPositionParams,
	Position,
	Location,
	Definition,
	ReferenceContext,
	RenameParams,
	WorkspaceEdit,
	TextEdit,
	TextDocumentSyncKind
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
const fsPromises = require('fs').promises;
import url = require('url');
import globby = require('globby');

import { updateProjectIndex } from './indexer';
import { ProjectIndex, Index } from "./index";
import { generateDiagnostics } from './validator';
import { extractSymbolAtIndex, uriIsStartupFile, variableIsAchievement } from './language';
import { generateInitialCompletions } from './completions';

// Create a connection for the server. The connection uses Node's IPC as a transport.
// Also include all preview / proposed LSP features.
let connection = createConnection(ProposedFeatures.all);
connection.console.info(`ChoiceScript language server running in node ${process.version}`);

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// TODO handle multiple directories with startup.txt
let projectIndex = new Index();

connection.onInitialize((params: InitializeParams) => {
	const syncKind: TextDocumentSyncKind = TextDocumentSyncKind.Full;
	return {
		capabilities: {
			textDocumentSync: {
				openClose: true,
				change: syncKind,
				willSaveWaitUntil: false,
				save: {
					includeText: false
				}
			},
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
		let data = await fsPromises.readFile(path, 'utf8');
		let textDocument = TextDocument.create(fileUri, 'ChoiceScript', 0, data);
		updateProjectIndex(textDocument, uriIsStartupFile(fileUri), projectIndex);
	}
	catch (err) {
		connection.console.error(`Could not read file ${path} (${err.name}: ${err.message} ${err.filename} ${err.lineNumber})`);
		return;
	}
}

connection.onDidChangeConfiguration(change => {
	// Revalidate all open text documents
	documents.all().forEach(doc => validateTextDocument(doc, projectIndex));
});

// TODO deal with files being deleted, so that they're removed from the above

documents.onDidOpen(e => {
	updateProjectIndex(e.document, uriIsStartupFile(e.document.uri), projectIndex);
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

	let document = documents.get(documentUri);
	if (document === undefined) {
		return definition;
	}
	let text = document.getText();
	let index = document.offsetAt(position);
	
	// Get the symbol at this location
	let symbol = extractSymbolAtIndex(text, index);

	if (symbol !== undefined) {
		let location = projectIndex.getLocalVariables(document.uri).get(symbol);
		if (location === undefined) {
			location = projectIndex.getGlobalVariables().get(symbol);
		}
		if (location === undefined) {
			let achievements = projectIndex.getAchievements();
			let codename = variableIsAchievement(symbol, achievements);
			if (codename !== undefined) {
				location = achievements.get(codename);
			}
		}
	
		if (location !== undefined) {
			definition = location;
		}
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

function generateReferences(textDocument: TextDocument, position: Position, context: ReferenceContext, projectIndex: ProjectIndex): Location[] {
	let text = textDocument.getText();
	let index = textDocument.offsetAt(position);
	let symbol = extractSymbolAtIndex(text, index);

	let locations = [...projectIndex.getVariableReferences(symbol)];
	
	if (context.includeDeclaration) {
		let declarationLocation = projectIndex.getLocalVariables(textDocument.uri).get(symbol);
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
		let localVariables = projectIndex.getLocalVariables(textDocument.uri);
		if (localVariables !== undefined) {
			variableDefinition = localVariables.get(symbol);
		}
	}

	if (variableDefinition === undefined) {
		return null;
	}

	let changes: Map<string, TextEdit[]> = new Map();

	for (let location of projectIndex.getVariableReferences(symbol)) {
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
