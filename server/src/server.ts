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
	TextDocumentSyncKind,
	DocumentSymbolParams,
	SymbolInformation
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import fs = require('fs');
import url = require('url');
import globby = require('globby');

import { ProjectIndex, Index } from "./index";
import { updateProjectIndex } from './indexer';
import { generateDiagnostics } from './validator';
import { uriIsStartupFile, uriIsChoicescriptStatsFile } from './language';
import { generateInitialCompletions } from './completions';
import { findDefinitions, findReferences, generateRenames } from './searches';
import { countWords } from './parser';
import { generateSymbols } from './structure';

/**
 * Server event arguments about an updated word count in a document.
 */
interface UpdatedWordCount {
	/**
	 * Document URI.
	 */
	uri: string;
	/**
	 * New word count, or undefined if it has none.
	 */
	count?: number;
}

// Create a connection for the server. The connection uses Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);
connection.console.info(`ChoiceScript language server running in node ${process.version}`);

// Create a simple text document manager. The text document manager
// supports full document sync only
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// TODO handle multiple directories with startup.txt
const projectIndex = new Index();

connection.onInitialize((params: InitializeParams) => {  // eslint-disable-line @typescript-eslint/no-unused-vars
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
			renameProvider: true,
			documentSymbolProvider: true
		}
	};
});

connection.onInitialized(() => {
	connection.workspace.getWorkspaceFolders().then(workspaces => {
		if (workspaces && workspaces.length > 0)
			findStartupFiles(workspaces);
	});
	
	// Handle our custom requests from the client for word count
	connection.onRequest("custom/wordcount", onWordCount);
	connection.onRequest("custom/selectionwordcount", onSelectionWordCount);
});

function findStartupFiles(workspaces: WorkspaceFolder[]): void {
	workspaces.forEach((workspace) => {
		const rootPath = url.fileURLToPath(workspace.uri);
		globby('**/startup.txt', {
			cwd: rootPath
		}).then(paths => indexProject(paths));
	});
}

function indexProject(pathsToProjectFiles: string[]): void {
	if (pathsToProjectFiles.length == 0) {
		projectIndex.setProjectIsIndexed(true); // No startup.txt file to index
	}
	pathsToProjectFiles.map(async (path) => {
		// TODO handle multiple startup.txt files in multiple directories

		let projectPath = path;
		const startupFilename = path.split('/').pop();
		if (startupFilename) {
			projectPath = projectPath.replace(startupFilename, '');
		}

		console.info(`Indexing the CS project at ${path}`);

		// Index the startup.txt file
		await indexFile(path);

		// Try to index the stats page (which might not exist)
		indexFile(projectPath+"choicescript_stats.txt");

		// Try to index all of the scene files
		const scenePaths = projectIndex.getSceneList().map(name => projectPath+name+".txt");
		const promises = scenePaths.map(x => indexFile(x));

		await Promise.all(promises);

		projectIndex.setProjectIsIndexed(true);

		// Revalidate all open text documents
		documents.all().forEach(doc => validateTextDocument(doc, projectIndex));
	});
}

async function indexFile(path: string): Promise<void> {
	const fileUri = url.pathToFileURL(path).toString();

	try {
		const data = await fs.promises.readFile(path, 'utf8');
		const textDocument = TextDocument.create(fileUri, 'ChoiceScript', 0, data);
		updateProjectIndex(
			textDocument, uriIsStartupFile(fileUri), uriIsChoicescriptStatsFile(fileUri), projectIndex
		);
	}
	catch (err) {
		connection.console.error(`Could not read file ${path} (${err.name}: ${err.message} ${err.filename} ${err.lineNumber})`);
		return;
	}
}

connection.onDidChangeConfiguration(change => {  // eslint-disable-line @typescript-eslint/no-unused-vars
	// Revalidate all open text documents
	documents.all().forEach(doc => validateTextDocument(doc, projectIndex));
});

documents.onDidOpen(e => {
	updateProjectIndex(
		e.document, uriIsStartupFile(e.document.uri), uriIsChoicescriptStatsFile(e.document.uri), projectIndex
	);
	notifyChangedWordCount(e.document);
});

// A document has been opened or its content has been changed.
documents.onDidChangeContent(change => {
	const isStartupFile = uriIsStartupFile(change.document.uri);

	updateProjectIndex(
		change.document, isStartupFile, uriIsChoicescriptStatsFile(change.document.uri), projectIndex
	);
	notifyChangedWordCount(change.document);

	if (isStartupFile) {
		// Since the startup file defines global variables, if it changes, re-validate all other files
		documents.all().forEach(doc => validateTextDocument(doc, projectIndex));
	}
	else {
		validateTextDocument(change.document, projectIndex);
	}
});

/**
 * Notify the client about a document's word count.
 * @param document Document whose word count is to be sent.
 */
function notifyChangedWordCount(document: TextDocument): void {
	const e: UpdatedWordCount = {
		uri: document.uri,
		count: projectIndex.getWordCount(document.uri)
	};

	connection.sendNotification("custom/updatedwordcount", e);
}

function validateTextDocument(textDocument: TextDocument, projectIndex: ProjectIndex): void {
	const diagnostics = generateDiagnostics(textDocument, projectIndex);
	connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onCompletion(
	(textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
		const document = documents.get(textDocumentPosition.textDocument.uri);
		if (document === undefined) {
			return [];
		}
		return generateInitialCompletions(document, textDocumentPosition.position, projectIndex);
	}
);

connection.onDefinition(
	(textDocumentPosition: TextDocumentPositionParams): Definition | undefined => {
		const document = documents.get(textDocumentPosition.textDocument.uri);
		if (document !== undefined) {
			const definitionAndLocations = findDefinitions(document, textDocumentPosition.position, projectIndex);
			if (definitionAndLocations !== undefined) {
				return definitionAndLocations[0].location;
			}
		}
		return undefined;
	}
);

connection.onReferences(
	(referencesParams: ReferenceParams): Location[] | undefined => {
		const document = documents.get(referencesParams.textDocument.uri);
		if (document === undefined) {
			return undefined;
		}
		const references = findReferences(document, referencesParams.position, referencesParams.context, projectIndex);
		return references?.map(reference => { return reference.location; });
	}
);

connection.onRenameRequest(
	(renameParams: RenameParams): WorkspaceEdit | null => {
		const document = documents.get(renameParams.textDocument.uri);
		if (document === undefined) {
			return null;
		}
		return generateRenames(document, renameParams.position, renameParams.newName, projectIndex);
	}
);

connection.onDocumentSymbol(
	(documentSymbolParams: DocumentSymbolParams): SymbolInformation[] | null => {
		const document = documents.get(documentSymbolParams.textDocument.uri);
		if (document === undefined) {
			return null;
		}
		return generateSymbols(document, projectIndex);
	}
);

function onWordCount(uri: string): number | undefined {
	return projectIndex.getWordCount(uri);
}

function onSelectionWordCount(location: Location): number | undefined {
	const document = documents.get(location.uri);
	if (document === undefined) {
		return undefined;
	}

	const startIndex = document.offsetAt(location.range.start);
	const endIndex = document.offsetAt(location.range.end);
	if (startIndex == endIndex) {
		return undefined;
	}

	const section = document.getText().slice(startIndex, endIndex);
	
	return countWords(section, document);
}

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
