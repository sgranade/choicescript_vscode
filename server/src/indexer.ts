import { Range, Location, TextDocument } from 'vscode-languageserver';

import { 
	functions, 
	namedOperators, 
	validCommands, 
	symbolCommandPattern, 
	startupFileSymbolCommandPattern,
	sceneListCommandPattern,
	multiPattern,
	referencePattern,
	symbolReferencePattern
} from './language';
import {
	CaseInsensitiveMap,
	ReadonlyCaseInsensitiveMap,
	findLineEnd,
	extractToMatchingDelimiter
} from './utilities';

/**
 * Type for a mutable index of identifiers.
 */
export type IdentifierIndex = CaseInsensitiveMap<string, Location>;

/**
 * Type for an immutable index of identifiers.
 */
export type ReadonlyIdentifierIndex = ReadonlyCaseInsensitiveMap<string, Location>;

/**
 * Type for a mutable index of references.
 */
export type ReferenceIndex = CaseInsensitiveMap<string, Array<Location>>;

/**
 * Interface for an index of a ChoiceScript project.
 */
export interface ProjectIndex {
	/**
	 * Update the index of global variable definitions from the startup scene.
	 * @param textDocumentUri URI to startup.txt document.
	 * @param newIndex New index of global variables.
	 */
	updateGlobalVariables(textDocumentUri: string, newIndex: IdentifierIndex): void;
	/**
	 * Update the index of variable definitions local to a scene.
	 * @param textDocumentUri URI to document whose index is to be updated.
	 * @param newIndex New index of local variables.
	 */
	updateLocalVariables(textDocumentUri: string, newIndex: IdentifierIndex): void;
	/**
	 * Update the index of references to variables.
	 * @param textDocumentUri URI to document whose index is to be updated.
	 * @param newIndex New index of references to variables.
	 */
	updateReferences(textDocumentUri: string, newIndex: ReferenceIndex): void;
	/**
	 * Update the list of scene names in the project.
	 * @param scenes New list of scene names.
	 */
	updateSceneList(scenes: Array<string>): void;
	/**
	 * Update the index of labels in a scene file.
	 * @param textDocumentUri URI to document whose index is to be updated.
	 * @param newIndex New index of labels.
	 */
	updateLabels(textDocumentUri: string, newIndex: IdentifierIndex): void;
	/**
	 * Get the URI to the project's startup.txt file.
	 */
	getStartupFileUri(): string;
	/**
	 * Get the URI to a scene file.
	 * @param scene Scene name.
	 */
	getSceneUri(scene: string): string | undefined;
	/**
	 * Get global variables in a project.
	 */
	getGlobalVariables(): ReadonlyIdentifierIndex;
	/**
	 * Get list of scenes in the project.
	 */
	getSceneList(): ReadonlyArray<string>;
	/**
	 * Get the local variables in a scene file.
	 * @param textDocumentUri URI to scene document.
	 */
	getLocalVariables(textDocumentUri: string): ReadonlyIdentifierIndex;
	/**
	 * Get the labels in a scene file.
	 * @param textDocumentUri URI to scene document.
	 */
	getLabels(textDocumentUri: string): ReadonlyIdentifierIndex;
	/**
	 * Get all references to a symbol.
	 * @param symbol Symbol to find references to.
	 */
	getReferences(symbol: string): ReadonlyArray<Location>;
	/**
	 * Remove a document from the project index.
	 * @param textDocumentUri URI to document to remove.
	 */
	removeDocument(textDocumentUri: string): void;
}

/**
 * Add a symbol reference to a reference index
 * @param symbol Symbol to add a reference to.
 * @param location Location of the symbol.
 * @param referenceIndex Index to add the reference to.
 */
function addReference(symbol: string, location: Location, referenceIndex: ReferenceIndex) {
	// My kingdom for the nullish coalescing operator
	let referenceArray: Array<Location> | undefined = referenceIndex.get(symbol);
	if (referenceArray === undefined)
		referenceArray = [];
	referenceArray.push(location);
	referenceIndex.set(symbol, referenceArray);
}

/**
 * 
 * @param command Command that defines or references a symbol.
 * @param symbol Symbol being defined or referenced.
 * @param symbolIndex Location of the symbol in the text.
 * @param globalVariables Index of global variables.
 * @param localVariables Index of local variables.
 * @param labels Index of goto/gosub labels.
 * @param references Index of references to variables.
 * @param textDocument Document being indexed.
 */
function indexSymbolCommand(command: string, symbol: string, symbolIndex: number, globalVariables: IdentifierIndex, 
		localVariables: IdentifierIndex, labels: IdentifierIndex, references: ReferenceIndex, textDocument: TextDocument) {
	let symbolLocation = Location.create(textDocument.uri, Range.create(
		textDocument.positionAt(symbolIndex),
		textDocument.positionAt(symbolIndex + symbol.length)
	));

	switch (command) {
		case "create":
			// *create instantiates global variables
			globalVariables.set(symbol, symbolLocation);
			break;
		case "temp":
			// *temp instantiates variables local to the scene file
			localVariables.set(symbol, symbolLocation);
			break;
		case "label":
			// *label creates a goto/gosub label local to the scene file
			labels.set(symbol, symbolLocation);
			break;
		case "set":
		case "delete":
			// *set and *delete reference a variable
			addReference(symbol, symbolLocation, references);
			break;
	}
}

/**
 * Extract the scenes defined by a *scene_list command.
 * 
 * @param document Document text to scan.
 * @param startIndex Index at the start of the scenes.
 * @returns Array of the scene names, or an empty array if no scene names were found.
 */
function indexScenes(document: string, startIndex: number): Array<string> {
	let sceneList: Array<string> = [];
	let scenePattern = /(\s+)(\$\s+)?(\S+)\s*\r?\n/;
	let lineStart = startIndex;

	// Process the first line to get the indent level and first scene
	let lineEnd = findLineEnd(document, lineStart);
	if (!lineEnd) {
		return sceneList;  // No scene found
	}
	let line = document.slice(lineStart, lineEnd);
	let m = scenePattern.exec(line);
	if (!m) {
		return sceneList;
	}
	let padding = m[1];
	sceneList.push(m[3]);
	lineStart = lineEnd;

	// Now loop as long as the scene pattern matches and the padding is consistent
	while (true) {
		lineEnd = findLineEnd(document, lineStart);
		if (!lineEnd) {
			return sceneList;
		}
		line = document.slice(lineStart, lineEnd);
		m = scenePattern.exec(line);
		if (!m || m[1] != padding) {
			return sceneList;
		}
		sceneList.push(m[3]);
		lineStart = lineEnd;
	}
}

/**
 * Index variable references in a multireplace.
 * @param document Document text to scan.
 * @param startIndex Index at the start of the multireplace.
 * @param referenceIndex Index of references to variables.
 * @param documentObject Document being indexed.
 */
function indexMulti(document: string, startIndex: number, referenceIndex: ReferenceIndex, documentObject: TextDocument) {
	if (document[startIndex] != '(') {
		// The multi-index is referring to just a variable
		let i = startIndex;
		let endIndex: number | undefined = undefined;
		while (i < document.length) {
			if (!/\w/.test(document[i])) {
				endIndex = i;
				break;
			}
			i++;
		}
		if (endIndex !== undefined) {
			let symbol = document.slice(startIndex, endIndex);
			let location = Location.create(documentObject.uri, Range.create(
				documentObject.positionAt(startIndex),
				documentObject.positionAt(endIndex)
			));
			addReference(symbol, location, referenceIndex);
		}
	}
	else {
		// TODO would be better to tokenize this instead
		let documentPiece = document.slice(startIndex+1);
		let comparison = extractToMatchingDelimiter(documentPiece, "(", ")");
		let wordPattern = /\w+/g;
		let m: RegExpExecArray | null;

		if (comparison !== undefined) {
			while (m = wordPattern.exec(comparison)) {
				if (!validCommands.includes(m[0]) && !namedOperators.includes(m[0]) && !functions.includes(m[0])) {
					let location = Location.create(documentObject.uri, Range.create(
						documentObject.positionAt(startIndex + 1 + m.index),
						documentObject.positionAt(startIndex + 1 + m.index + m[0].length)
					));
					addReference(m[0], location, referenceIndex);
				}
			}
		}
	}
}

/**
 * Index a reference to a symbol.
 * @param symbol Symbol being referenced.
 * @param startIndex Index at the start of the symbol.
 * @param referenceIndex Index of references to variables.
 * @param textDocument Document being indexed.
 */
function indexReference(symbol: string, startIndex: number, referenceIndex: ReferenceIndex, textDocument: TextDocument) {
	let location = Location.create(textDocument.uri, Range.create(
		textDocument.positionAt(startIndex),
		textDocument.positionAt(startIndex + symbol.length)
	));
	addReference(symbol, location, referenceIndex);
}

/**
 * 
 * @param command ChoiceScript command, such as "if", that may contain a reference.
 * @param line The rest of the line after the command.
 * @param startIndex Index at the start of the line.
 * @param referenceIndex Index of references to variables.
 * @param textDocument Document being indexed.
 */
function indexReferenceCommand(command: string, line: string, startIndex: number, referenceIndex: ReferenceIndex, textDocument: TextDocument) {
	let wordPattern = /\w+/g;
	let m: RegExpExecArray | null;

	while (m = wordPattern.exec(line)) {
		if (!validCommands.includes(m[0]) && !namedOperators.includes(m[0]) && !functions.includes(m[0])) {
			let location = Location.create(textDocument.uri, Range.create(
				textDocument.positionAt(startIndex + m.index),
				textDocument.positionAt(startIndex + m.index + m[0].length)
			));
			addReference(m[0], location, referenceIndex);
		}
	}
}

/**
 * Update project index for a document in that project.
 * 
 * @param textDocument Document to index.
 * @param isStartupFile True if the document is the ChoiceScript startup file.
 * @param index Project index to update.
 */
export function updateProjectIndex(textDocument: TextDocument, isStartupFile: boolean, index: ProjectIndex): void {
	let text = textDocument.getText();

	let pattern: RegExp | null = null;
	if (isStartupFile) {
		pattern = RegExp(`${startupFileSymbolCommandPattern}|${sceneListCommandPattern}|${multiPattern}|${referencePattern}|${symbolReferencePattern}`, 'g');
	}
	else {
		pattern = RegExp(`${symbolCommandPattern}|${sceneListCommandPattern}|${multiPattern}|${referencePattern}|${symbolReferencePattern}`, 'g');
	}
	let m: RegExpExecArray | null;

	let newGlobalVariables: IdentifierIndex = new Map();
	let newLocalVariables: IdentifierIndex = new Map();
	let newReferences: ReferenceIndex = new Map();
	let newScenes: Array<string> = [];
	let newLabels: IdentifierIndex = new Map();

	while (m = pattern.exec(text)) {
		if (m.groups === undefined) {
			continue;
		}

		// Pattern options: symbolCommand, sceneListCommand, multi (@{}), symbolReference
		if (m.groups.symbolCommand && (m.groups.symbolCommandPrefix || m.index == 0)) {
			let symbolIndex = m.index + 1 + m.groups.symbolCommand.length + m.groups.spacing.length;
			if (m.groups.symbolCommandPrefix !== undefined)
				symbolIndex += m.groups.symbolCommandPrefix.length;
			indexSymbolCommand(m.groups.symbolCommand, m.groups.commandSymbol, symbolIndex, newGlobalVariables, newLocalVariables, newLabels, newReferences, textDocument);
		}
		else if (m.groups.sceneListCommand) {
			newScenes = indexScenes(text, pattern.lastIndex);
		}
		else if (m.groups.multi) {
			indexMulti(text, pattern.lastIndex, newReferences, textDocument);
		}
		else if (m.groups.reference) {
			let symbolIndex = m.index + m.groups.reference.length - m.groups.referenceSymbol.length - 1;
			indexReference(m.groups.referenceSymbol, symbolIndex, newReferences, textDocument);
		}
		else if (m.groups.referenceCommand) {
			let lineIndex = m.index + 1 + m.groups.referenceCommand.length + m.groups.referenceSpacing.length;
			if (m.groups.symbolReferencePrefix !== undefined)
				lineIndex += m.groups.symbolReferencePrefix.length;
			indexReferenceCommand(m.groups.referenceCommand, m.groups.referenceLine, lineIndex, newReferences, textDocument);
		}
	}

	if (isStartupFile) {
		index.updateGlobalVariables(textDocument.uri, newGlobalVariables);
		index.updateSceneList(newScenes);
	}
	index.updateLocalVariables(textDocument.uri, newLocalVariables);
	index.updateReferences(textDocument.uri, newReferences);
	index.updateLabels(textDocument.uri, newLabels);
}
