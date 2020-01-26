import {
	createConnection,
	WorkspaceFolder,
	TextDocuments,
	ProposedFeatures,
	InitializeParams,
	ReferenceParams,
	CompletionItem,
	TextDocumentPositionParams,
	Location,
	Definition,
	RenameParams,
	WorkspaceEdit,
	TextDocumentSyncKind
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
const fsPromises = require('fs').promises;
import url = require('url');
import globby = require('globby');

import { updateProjectIndex } from './indexer';
import { ProjectIndex, Index } from "./index";
import { generateDiagnostics } from './validator';
import { uriIsStartupFile } from './language';
import { generateInitialCompletions } from './completions';
import { findDefinition, findReferences, generateRenames } from './searches';

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
		globby('**/startup.txt', {
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

		console.info(`Indexing the CS project at ${path}`);

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
		let document = documents.get(textDocumentPosition.textDocument.uri);
		if (document !== undefined) {
			let definitionAndLocation = findDefinition(document, textDocumentPosition.position, projectIndex);
			if (definitionAndLocation !== undefined) {
				return definitionAndLocation.location;
			}
		}
		return undefined;
	}
);

connection.onReferences(
	(referencesParams: ReferenceParams): Location[] | undefined => {
		let document = documents.get(referencesParams.textDocument.uri);
		if (document === undefined) {
			return undefined;
		}
		let references = findReferences(document, referencesParams.position, referencesParams.context, projectIndex);
		return references?.map(reference => { return reference.location; })
	}
);

connection.onRenameRequest(
	(renameParams: RenameParams): WorkspaceEdit | null => {
		let document = documents.get(renameParams.textDocument.uri);
		if (document === undefined) {
			return null;
		}
		return generateRenames(document, renameParams.position, renameParams.newName, projectIndex);
	}
);

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
