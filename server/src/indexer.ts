import { Range, Location, TextDocument } from 'vscode-languageserver';

import { 
	functions, 
	namedOperators, 
	validCommands, 
	symbolManipulateCommandPattern, 
	startupFileSymbolCommandPattern,
	sceneListCommandPattern,
	multiStartPattern,
	variableReferenceCommandPattern,
	achievementPattern,
	replacementStartPattern,
	TokenizeMultireplace
} from './language';
import {
	CaseInsensitiveMap,
	ReadonlyCaseInsensitiveMap,
	normalizeUri,
	findLineEnd,
	extractToMatchingDelimiter,
	stringIsNumber
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
	 * Update the index of achievement codenames in the project.
	 * @param newIndex New index of achievement codenames.
	 */
	updateAchievements(newIndex: IdentifierIndex): void;
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
	 * Get the achievement codenames.
	 */
	getAchievements(): ReadonlyIdentifierIndex;
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
 * Instantiable index class
 */
export class Index implements ProjectIndex {
	_startupFileUri: string;
	_globalVariables: IdentifierIndex;
	_localVariables: Map<string, IdentifierIndex>;
	_references: Map<string, ReferenceIndex>;
	_scenes: Array<string>;
	_localLabels: Map<string, IdentifierIndex>;
	_achievements: IdentifierIndex;

	constructor() {
		this._startupFileUri = "";
		this._globalVariables = new Map();
		this._localVariables = new Map();
		this._references = new Map();
		this._scenes = [];
		this._localLabels = new Map();
		this._achievements = new Map();
	}

	updateGlobalVariables(textDocumentUri: string, newIndex: IdentifierIndex) {
		this._startupFileUri = normalizeUri(textDocumentUri);
		this._globalVariables = new CaseInsensitiveMap(newIndex);
	}
	updateLocalVariables(textDocumentUri: string, newIndex: IdentifierIndex) {
		this._localVariables.set(normalizeUri(textDocumentUri), new CaseInsensitiveMap(newIndex));
	}
	updateReferences(textDocumentUri: string, newIndex: ReferenceIndex) {
		this._references.set(normalizeUri(textDocumentUri), new CaseInsensitiveMap(newIndex));
	}
	updateSceneList(scenes: Array<string>) {
		this._scenes = scenes;
	}
	updateLabels(textDocumentUri: string, newIndex: IdentifierIndex) {
		this._localLabels.set(normalizeUri(textDocumentUri), new CaseInsensitiveMap(newIndex));
	}
	updateAchievements(newIndex: IdentifierIndex) {
		this._achievements = new CaseInsensitiveMap(newIndex);
	}
	getStartupFileUri(): string {
		return this._startupFileUri;
	}
	getSceneUri(scene: string): string | undefined {
		let sceneUri: string | undefined = undefined;
		for (let key of this._localVariables.keys()) {
			if (key.includes(scene)) {
				sceneUri = key;
				break;
			}
		}
		return sceneUri;
	}
	getGlobalVariables(): ReadonlyIdentifierIndex {
		return this._globalVariables;
	}
	getLocalVariables(textDocumentUri: string): ReadonlyIdentifierIndex {
		let index = this._localVariables.get(normalizeUri(textDocumentUri));
		if (index === undefined)
			index = new Map();
		
		return index;
	}
	getSceneList(): ReadonlyArray<string> {
		return this._scenes;
	}
	getLabels(textDocumentUri: string): ReadonlyIdentifierIndex {
		let index = this._localLabels.get(normalizeUri(textDocumentUri));
		if (index === undefined)
			index = new Map();

		return index;
	}
	getAchievements(): ReadonlyIdentifierIndex {
		return this._achievements;
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
	removeDocument(textDocumentUri: string) {
		this._localVariables.delete(normalizeUri(textDocumentUri));
		this._references.delete(normalizeUri(textDocumentUri));
		this._localLabels.delete(normalizeUri(textDocumentUri));
	}
}

/**
 * Captures information about the current state of indexing
 */
class IndexingState {
	/**
	 * Document being validated
	 */
	textDocument: TextDocument;

	globalVariables: IdentifierIndex = new Map();
	localVariables: IdentifierIndex = new Map();
	references: ReferenceIndex = new Map();
	scenes: Array<string> = [];
	labels: IdentifierIndex = new Map();
	achievements: IdentifierIndex = new Map();

	constructor(textDocument: TextDocument) {
		this.textDocument = textDocument;
	}
}

/**
 * Add a symbol reference to a reference index
 * @param symbol Symbol to add a reference to.
 * @param location Location of the symbol in the document being indexed.
 * @param state Indexing state.
 */
function addReference(symbol: string, location: Location, state: IndexingState) {
	// My kingdom for the nullish coalescing operator
	let referenceArray: Array<Location> | undefined = state.references.get(symbol);
	if (referenceArray === undefined)
		referenceArray = [];
	referenceArray.push(location);
	state.references.set(symbol, referenceArray);
}

/**
 * Index an expression.
 * @param expression String containing the expression (and only the expression).
 * @param globalIndex Expression's index in the document being indexed.
 * @param state Indexing state.
 */
function indexExpression(expression: string, globalIndex: number, state: IndexingState) {
	// Expressions can contain numbers, strings, operators, built-in variables, variables, and variable references
	// As variable references and strings can contain other things, first handle them and remove them from the expression
	let referenceOrStringPattern = /^(?<prefix>.*?)(?<delimiter>["{])(?<remainder>.*)$/;

	let m: RegExpExecArray | null;
	while (m = referenceOrStringPattern.exec(expression)) {
		if (m.groups === undefined || m.groups.remainder === undefined)
			continue;

		let openDelimiter = m.groups.delimiter;
		let openDelimiterLocalIndex = 0;
		let remainderLocalIndex = 1;
		if (m.groups.prefix !== undefined) {
			openDelimiterLocalIndex += m.groups.prefix.length;
			remainderLocalIndex += m.groups.prefix.length;
		}
		let endGlobalIndex = 0;
		if (openDelimiter == '{') {
			endGlobalIndex = indexReference(m.groups.remainder, globalIndex + remainderLocalIndex, state);
		}
		else {
			endGlobalIndex = indexString(m.groups.remainder, globalIndex + remainderLocalIndex, state);
		}
		let endLocalIndex = endGlobalIndex - globalIndex;

		// blank out the matched string
		expression = expression.slice(0, openDelimiterLocalIndex) + " ".repeat(endLocalIndex - openDelimiterLocalIndex) + expression.slice(endLocalIndex);
	}

	// Split the remaining expression into words, since that's all we care about
	let wordPattern = /\w+/g;
	
	while (m = wordPattern.exec(expression)) {
		if (!validCommands.includes(m[0]) && !namedOperators.includes(m[0]) && !functions.includes(m[0]) && !stringIsNumber(m[0])) {
			let location = Location.create(state.textDocument.uri, Range.create(
				state.textDocument.positionAt(globalIndex + m.index),
				state.textDocument.positionAt(globalIndex + m.index + m[0].length)
			));
			addReference(m[0], location, state);
		}
	}
}

/**
 * Index a variable reference {var}.
 * @param referenceSection Section containing the reference, starting after the { but including the }.
 * @param globalIndex Reference's index in the document being indexed.
 * @param state Indexing state.
 */
function indexReference(referenceSection: string, globalIndex: number, state: IndexingState): number {
	let reference = extractToMatchingDelimiter(referenceSection, '{', '}');
	if (reference !== undefined) {
		// References contain expressions, so let the expression indexer handle that
		indexExpression(reference, globalIndex, state);
		globalIndex += reference.length + 1;
	}

	return globalIndex;
}

/**
 * Index a string.
 * @param stringSection Section containing the string, starting after the opening " but including the closing ".
 * @param globalIndex String's index in the document being indexed.
 * @param state Indexing state.
 */
function indexString(stringSection: string, globalIndex: number, state: IndexingState): number {
	// Find the end of the string while dealing with any replacements or multireplacements we run into along the way
	let delimiterPattern = RegExp(`${replacementStartPattern}|${multiStartPattern}|(?<!\\\\)\\"`);
	let m: RegExpExecArray | null;
	while (m = delimiterPattern.exec(stringSection)) {
		if (m.groups === undefined)
			break;

		let contentsLocalIndex = m.index + m[0].length;
		let subsection = stringSection.slice(contentsLocalIndex);
		let newGlobalIndex: number;

		if (m.groups.replacement !== undefined) {
			newGlobalIndex = indexReplacement(subsection, globalIndex + contentsLocalIndex, state);
		}
		else if (m.groups.multi !== undefined) {
			newGlobalIndex = indexMultireplacement(subsection, globalIndex + contentsLocalIndex, state);
		}
		else {
			globalIndex += contentsLocalIndex;  // b/c contentsLocalIndex points beyond the end of the string
			break;
		}

		let endLocalIndex = newGlobalIndex - globalIndex;
		globalIndex = newGlobalIndex;
		stringSection = stringSection.slice(endLocalIndex);
	}

	return globalIndex;
}

/**
 * Index a replacement ${var}.
 * @param replacementSection Section containing the replacement, starting after the ${ but including the closing }.
 * @param globalIndex Replacement's index in the document being indexed.
 * @param state Indexing state.
 */
function indexReplacement(replacementSection: string, globalIndex: number, state: IndexingState): number {
	// Internally, a replacement acts like a reference, so we can forward to it
	return indexReference(replacementSection, globalIndex, state);
}

function indexMultireplacement(multiSection: string, globalIndex: number, state: IndexingState): number {
	let tokens = TokenizeMultireplace(multiSection);

	if (tokens !== undefined) {
		// The test portion is an expression
		indexExpression(tokens.test.text, globalIndex + tokens.test.index, state);

		// The body portions are strings
		for (let token of tokens.body) {
			// Gotta append a quote mark so it'll behave properly
			indexString(token.text + '"', globalIndex + token.index, state);
		}
		globalIndex += tokens.endIndex;
	}

	return globalIndex;
}

/**
 * Index a symbol creating or manipulating command
 * @param command Command that defines or references a symbol.
 * @param line Remainder of the line after the command.
 * @param lineGlobalIndex Location of the line in the text.
 * @param state Indexing state.
 */
function indexSymbolManipulatingCommand(command: string, line: string, lineGlobalIndex: number, state: IndexingState) {
	let lineLocation = Location.create(state.textDocument.uri, Range.create(
		state.textDocument.positionAt(lineGlobalIndex),
		state.textDocument.positionAt(lineGlobalIndex + line.length)
	));
	let bareSymbolMatch = line.match(/^\w+/);
	let bareSymbol: string | null = null;
	if (bareSymbolMatch !== null)
		bareSymbol = bareSymbolMatch[0];

	switch (command) {
		case "create":
			// *create instantiates global variables
			if (bareSymbol !== null) {
				state.globalVariables.set(bareSymbol, lineLocation);
				addReference(bareSymbol, lineLocation, state);
			}
			break;
		case "temp":
			// *temp instantiates variables local to the scene file
			if (bareSymbol !== null) {
				state.localVariables.set(bareSymbol, lineLocation);
				addReference(bareSymbol, lineLocation, state);
			}
			break;
		case "label":
			// *label creates a goto/gosub label local to the scene file
			if (bareSymbol !== null) {
				state.labels.set(bareSymbol, lineLocation);
			}
			break;
		case "set":
			// A *set command has a full expression
			indexExpression(line, lineGlobalIndex, state);
			break;
		case "delete":
			// *delete references a variable
			if (bareSymbol !== null) {
				addReference(bareSymbol, lineLocation, state);
			}
			break;
	}
}

/**
 * Extract the scenes defined by a *scene_list command.
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
 * Index a command that can reference variables, such as *if.
 * @param command ChoiceScript command, such as "if", that may contain a reference.
 * @param line The rest of the line after the command.
 * @param lineGlobalIndex Index at the start of the line.
 * @param state Indexing state.
 */
function indexReferenceCommand(command: string, line: string, lineGlobalIndex: number, state: IndexingState) {
	// The line that follows a command that can reference a variable is an expression
	indexExpression(line, lineGlobalIndex, state);
}

function indexAchievement(codename: string, startIndex: number, state: IndexingState) {
	let location = Location.create(state.textDocument.uri, Range.create(
		state.textDocument.positionAt(startIndex),
		state.textDocument.positionAt(startIndex + codename.length)
	));
	state.achievements.set(codename, location);
}

/**
 * Update project index for a document in that project.
 * 
 * @param textDocument Document to index.
 * @param isStartupFile True if the document is the ChoiceScript startup file.
 * @param index Project index to update.
 */
export function updateProjectIndex(textDocument: TextDocument, isStartupFile: boolean, index: ProjectIndex): void {
	let state = new IndexingState(textDocument);
	let text = textDocument.getText();

	let pattern: RegExp | null = null;
	if (isStartupFile) {
		pattern = RegExp(`${startupFileSymbolCommandPattern}|${sceneListCommandPattern}|${multiStartPattern}|${variableReferenceCommandPattern}|${achievementPattern}`, 'g');
	}
	else {
		pattern = RegExp(`${symbolManipulateCommandPattern}|${sceneListCommandPattern}|${multiStartPattern}|${variableReferenceCommandPattern}`, 'g');
	}
	let m: RegExpExecArray | null;

	while (m = pattern.exec(text)) {
		if (m.groups === undefined) {
			continue;
		}

		// TODO ADVANCE THE MATCH LOCATION INDEX BASED ON TOKENIZING

		// Pattern options: symbolManipulateCommand, sceneListCommand, multi (@{}), symbolReference, achievement
		if (m.groups.symbolManipulateCommand && (m.groups.symbolManipulateCommandPrefix || m.index == 0)) {
			let symbolIndex = m.index + 1 + m.groups.symbolManipulateCommand.length + m.groups.spacing.length;
			if (m.groups.symbolManipulateCommandPrefix !== undefined)
				symbolIndex += m.groups.symbolManipulateCommandPrefix.length;
			indexSymbolManipulatingCommand(m.groups.symbolManipulateCommand, m.groups.manipulateCommandLine, symbolIndex, state);
		}
		else if (m.groups.sceneListCommand) {
			state.scenes = indexScenes(text, pattern.lastIndex);
		}
		else if (m.groups.multi) {
			let sectionGlobalIndex = m.index + m[0].length;
			let section = text.slice(sectionGlobalIndex);
			indexMultireplacement(section, sectionGlobalIndex, state);
		}
		else if (m.groups.variableReferenceCommand) {
			let lineIndex = m.index + 1 + m.groups.variableReferenceCommand.length + m.groups.referenceCommandSpacing.length;
			if (m.groups.symbolReferencePrefix !== undefined)
				lineIndex += m.groups.symbolReferencePrefix.length;
			indexReferenceCommand(m.groups.variableReferenceCommand, m.groups.referenceCommandLine, lineIndex, state);
		}
		else if (m.groups.achievement) {
			let codenameIndex = m.index + m[0].length - m.groups.achievement.length;
			indexAchievement(m.groups.achievement, codenameIndex, state);
		}
	}

	if (isStartupFile) {
		index.updateGlobalVariables(textDocument.uri, state.globalVariables);
		index.updateSceneList(state.scenes);
		index.updateAchievements(state.achievements);
	}
	index.updateLocalVariables(textDocument.uri, state.localVariables);
	index.updateReferences(textDocument.uri, state.references);
	index.updateLabels(textDocument.uri, state.labels);
}
