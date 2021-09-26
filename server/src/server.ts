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
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import fs = require('fs');
import path = require('path');
import { fileURLToPath, pathToFileURL } from 'url';
import globby = require('globby');

import { CustomMessages } from "./constants";
import { ProjectIndex, Index } from "./index";
import { updateProjectIndex } from './indexer';
import { generateDiagnostics, ValidationSettings } from './validator';
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

const connection = createConnection(ProposedFeatures.all);
connection.console.info(`ChoiceScript language server running in node ${process.version}`);

// Create a simple text document manager. The text document manager
// supports full document sync only
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// TODO handle multiple directories with startup.txt
const projectIndex = new Index();

const validationSettings: ValidationSettings = {
	useCoGStyleGuide: true
};

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
	
	// Handle custom requests from the client
	connection.onNotification(CustomMessages.CoGStyleGuide, onCoGStyleGuide);
	connection.onRequest(CustomMessages.WordCountRequest, onWordCount);
	connection.onRequest(CustomMessages.SelectionWordCountRequest, onSelectionWordCount);
});

function findStartupFiles(workspaces: WorkspaceFolder[]): void {
	workspaces.forEach((workspace) => {
		const rootPath = fileURLToPath(workspace.uri);
		globby('**/startup.txt', {
			cwd: rootPath
		}).then(paths => indexProject(rootPath, paths));
	});
}

function indexProject(workspacePath: string, pathsToProjectFiles: string[]): void {
	if (pathsToProjectFiles.length == 0) {
		projectIndex.setProjectIsIndexed(true); // No startup.txt file to index
	}
	pathsToProjectFiles.map(async (filePath) => {
		// TODO handle multiple startup.txt files in multiple directories

		const projectPath = path.dirname(filePath);
		// Filenames from globby are posix paths regardless of platform
		const platformFullProjectPath = path.join(workspacePath, ...projectPath.split('/'));
		projectIndex.setPlatformProjectPath(platformFullProjectPath);
		
		// Index the startup.txt file
		await indexFile(filePath);

		// Try to index the stats page (which might not exist)
		await indexFile(projectPath+"/choicescript_stats.txt");

		const scenes = projectIndex.getSceneList();
		if (scenes !== undefined) {
			// Try to index all of the scene files
			const scenePaths = projectIndex.getSceneList().map(name => projectPath+"/"+name+".txt");
			const promises = scenePaths.map(x => indexFile(x));
			await Promise.all(promises);
		}

		projectIndex.setProjectIsIndexed(true);

		notifyUpdatedProjectFiles();

		// Revalidate all open text documents
		documents.all().forEach(doc => validateTextDocument(doc, projectIndex));
	});
}

/**
 * Index a scene file.
 * 
 * @param path Path to the file to index.
 * @returns True if the file indexed properly.
 */
async function indexFile(path: string): Promise<boolean> {
	const fileUri = pathToFileURL(path).toString();

	try {
		const data = await fs.promises.readFile(path, 'utf8');
		const textDocument = TextDocument.create(fileUri, 'ChoiceScript', 0, data);
		updateProjectIndex(
			textDocument, uriIsStartupFile(fileUri), uriIsChoicescriptStatsFile(fileUri), projectIndex
		);
		return true;
	}
	catch (err) {
		connection.console.error(`Could not read file ${path} (${err})`);
		return false;
	}
}

connection.onDidChangeConfiguration(change => {  // eslint-disable-line @typescript-eslint/no-unused-vars
	// Revalidate all open text documents
	documents.all().forEach(doc => validateTextDocument(doc, projectIndex));
});

documents.onDidOpen(e => {
	const isStartupFile = uriIsStartupFile(e.document.uri);

	updateProjectIndex(
		e.document, isStartupFile, uriIsChoicescriptStatsFile(e.document.uri), projectIndex
	);
	
	notifyChangedWordCount(e.document);
	if (isStartupFile) {
		notifyUpdatedProjectFiles();
	}
});

// A document has been opened or its content has been changed.
documents.onDidChangeContent(change => {
	const isStartupFile = uriIsStartupFile(change.document.uri);

	updateProjectIndex(
		change.document, isStartupFile, uriIsChoicescriptStatsFile(change.document.uri), projectIndex
	);

	notifyChangedWordCount(change.document);
	if (isStartupFile) {
		// Since the startup file defines global variables, if it changes, re-validate all other files & notify that scene files may have changed
		notifyUpdatedProjectFiles();
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

	connection.sendNotification(CustomMessages.UpdatedWordCount, e);
}

/**
 * Notify the client about the project's files.
 */
function notifyUpdatedProjectFiles(): void {
	const platformProjectPath = projectIndex.getPlatformProjectPath();
	const projectFiles = projectIndex.getSceneList().map(
		name => path.join(platformProjectPath, name+".txt")
	);
	connection.sendNotification(CustomMessages.UpdatedProjectFiles, projectFiles);
}

function validateTextDocument(textDocument: TextDocument, projectIndex: ProjectIndex): void {
	const diagnostics = generateDiagnostics(textDocument, projectIndex, validationSettings);
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

function onCoGStyleGuide(useCoGStyleGuide: boolean) {
	validationSettings.useCoGStyleGuide = useCoGStyleGuide;
	documents.all().forEach(doc => validateTextDocument(doc, projectIndex));
}

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

documents.listen(connection);

connection.listen();
