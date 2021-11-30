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
import { readFile } from 'fs/promises';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import * as globby from 'globby';

import { CustomMessages } from "./constants";
import { ProjectIndex, Index } from "./index";
import { updateProjectIndex } from './indexer';
import { generateDiagnostics, ValidationSettings } from './validator';
import { uriIsStartupFile, uriIsChoicescriptStatsFile } from './language';
import { generateInitialCompletions } from './completions';
import { findDefinitions, findReferences, generateRenames } from './searches';
import { countWords } from './parser';
import { generateSymbols } from './structure';
import { normalizeUri } from './utilities';

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

// Queue of documents whose content has changed and who need to be updated
const changedDocuments: Map<string, TextDocument> = new Map();
// Queue of possibly new scenes that need to be indexed
const newScenes: Set<string> = new Set();
// Have the files in the index changed or something happened where re-validation is required?
// (Strictly speaking, those two events don't have to be coupled -- changing startup.txt requires
// revalidation but doesn't indicate that the project files have actually changed) but for simplicity
// I'm combining the concepts into a single "project files have changed" variable
let projectFilesHaveChanged = false;
// Heartbeat ID
let heartbeatId: NodeJS.Timer | undefined = undefined;
// How often to update the documents in the queue, in ms
const heartbeatDelay = 200;
// Minimum heartbeat delay, in ms
const minHeartbeatDelay = 50;
// Last queue update time
let lastHeartbeatTime = -1;

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

	heartbeatId = setInterval(heartbeat, heartbeatDelay);
});

connection.onShutdown(() => {
	if (heartbeatId !== undefined) {
		clearInterval(heartbeatId);
	}
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
		const sceneFilesPath = path.join(workspacePath, ...projectPath.split('/'));
		projectIndex.setPlatformProjectPath(sceneFilesPath);
		connection.sendNotification(CustomMessages.UpdatedSceneFilesPath, sceneFilesPath);

		// Index the startup.txt file
		await indexFile(filePath);

		// Try to index the stats page (which might not exist)
		await indexFile(path.join(projectPath, "choicescript_stats.txt"));

		const scenes = projectIndex.getAllReferencedScenes();
		if (scenes !== undefined) {
			// Try to index all of the scene files
			await indexScenes(scenes);
		}

		projectIndex.setProjectIsIndexed(true);
		connection.sendNotification(CustomMessages.ProjectIndexed);
	});
}

/**
 * Index a list of scenes by name.
 * @param sceneNames List of scene names to index.
 */
async function indexScenes(sceneNames: readonly string[]) {
	const platformProjectPath = projectIndex.getPlatformProjectPath();
	const scenePaths = sceneNames.map(name => path.join(platformProjectPath, name+".txt"));
	const promises = scenePaths.map(x => indexFile(x));
	await Promise.all(promises);
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
		const data = await readFile(path, 'utf8');
		const textDocument = TextDocument.create(fileUri, 'ChoiceScript', 0, data);
		const newFile = !projectIndex.hasUri(normalizeUri(textDocument.uri));
		updateProjectIndex(
			textDocument, uriIsStartupFile(fileUri), uriIsChoicescriptStatsFile(fileUri), projectIndex
		).forEach(newScene => {
			newScenes.add(newScene);
		});
		if (newFile) {
			projectFilesHaveChanged = true;
		}
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
	).forEach(newScene => {
		newScenes.add(newScene);
	});

	notifyChangedWordCount(e.document);
	if (isStartupFile) {
		projectFilesHaveChanged = true;
	}
});

// A document has been opened or its content has been changed.
documents.onDidChangeContent(change => {
	// Put the document on the queue for later processing (so we don't DDOS via updates)
	changedDocuments.set(normalizeUri(change.document.uri), change.document);
});

/**
 * Process the queue of documents that have changed, new-to-us scenes,
 * and any required re-validation or changed-index notification.
 */
async function heartbeat() {
	if (Date.now() - lastHeartbeatTime < minHeartbeatDelay) {
		return;
	}

	try {
		// Process changed documents
		const processingQueue = new Map(changedDocuments);
		changedDocuments.clear();
		let processedStartupFile = false;

		for (const [uri, document] of processingQueue) {
			processChangedDocument(document);
			if (uriIsStartupFile(uri)) {
				processedStartupFile = true;
			}
		}

		// If we processed a startup file, which defines global variables,
		// re-validate all files & notify that scene files may have changed
		if (processedStartupFile) {
			// Since the startup file defines global variables, if it changes,
			// re-validate all other files
			projectFilesHaveChanged = true;
		}
		else {
			for (const document of processingQueue.values()) {
				validateTextDocument(document, projectIndex);
			}
		}

		// Index new scenes
		if (newScenes.size > 0) {
			const scenes = [...newScenes.keys()];
			newScenes.clear();
			await indexScenes(scenes);
		}

		if (projectFilesHaveChanged) {
			projectFilesHaveChanged = false;
			documents.all().forEach(doc => validateTextDocument(doc, projectIndex));
		}
	}
	finally {
		lastHeartbeatTime = Date.now();
	}
}

/**
 * Process a document whose content has changed.
 */
function processChangedDocument(document: TextDocument) {
	updateProjectIndex(
		document, uriIsStartupFile(document.uri), uriIsChoicescriptStatsFile(document.uri), projectIndex
	).forEach(newScene => {
		newScenes.add(newScene);
	});

	notifyChangedWordCount(document);
}

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
			const definitionAndLocations = findDefinitions(normalizeUri(document.uri), textDocumentPosition.position, projectIndex);
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
		const references = findReferences(normalizeUri(document.uri), referencesParams.position, referencesParams.context, projectIndex);
		return references?.map(reference => { return reference.location; });
	}
);

connection.onRenameRequest(
	(renameParams: RenameParams): WorkspaceEdit | null => {
		const document = documents.get(renameParams.textDocument.uri);
		if (document === undefined) {
			return null;
		}
		return generateRenames(normalizeUri(document.uri), renameParams.position, renameParams.newName, projectIndex);
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
