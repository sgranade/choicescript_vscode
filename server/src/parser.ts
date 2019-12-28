import { Range, Location, Position, TextDocument } from 'vscode-languageserver';

import { 
	functions, 
	namedOperators,
	namedValues,
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
	findLineEnd,
	extractToMatchingDelimiter,
	stringIsNumber
} from './utilities';

let validCommandsLookup: ReadonlyMap<string, number> = new Map(validCommands.map(x => [x, 1]));
let functionsLookup: ReadonlyMap<string, number> = new Map(functions.map(x => [x, 1]));
let namedOperatorsLookup: ReadonlyMap<string, number> = new Map(namedOperators.map(x => [x, 1]));
let namedValuesLookup: ReadonlyMap<string, number> = new Map(namedValues.map(x => [x, 1]));


export interface ParserCallbacks {
	onGlobalVariableCreate(symbol: string, location: Location, state: ParsingState): void;
	onLocalVariableCreate(symbol: string, location: Location, state: ParsingState): void;
	onLabelCreate(symbol: string, location: Location, state: ParsingState): void;
	onReference(symbol: string, location: Location, state: ParsingState): void;
	onSceneDefinition(scenes: string[], location: Location, state: ParsingState): void;
	onAchievementCreate(codename: string, location: Location, state: ParsingState): void;
}

/**
 * Captures information about the current state of parsing
 */
export class ParsingState {
	/**
	 * Document being validated
	 */
	textDocument: TextDocument;
	/**
	 * Callbacks for parsing events
	 */
	callbacks: ParserCallbacks;

	constructor(textDocument: TextDocument, callbacks: ParserCallbacks) {
		this.textDocument = textDocument;
		this.callbacks = callbacks;
	}
}

/**
 * Parse an expression.
 * @param expression String containing the expression (and only the expression).
 * @param globalIndex Expression's index in the document being indexed.
 * @param state Parsing state.
 */
function parseExpression(expression: string, globalIndex: number, state: ParsingState) {
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
			endGlobalIndex = parseReference(m.groups.remainder, globalIndex + remainderLocalIndex, state);
		}
		else {
			endGlobalIndex = parseString(m.groups.remainder, globalIndex + remainderLocalIndex, state);
		}
		let endLocalIndex = endGlobalIndex - globalIndex;

		// blank out the matched string
		expression = expression.slice(0, openDelimiterLocalIndex) + " ".repeat(endLocalIndex - openDelimiterLocalIndex) + expression.slice(endLocalIndex);
	}

	// Split the remaining expression into words, since that's all we care about
	let wordPattern = /\w+/g;
	
	while (m = wordPattern.exec(expression)) {
		if (!validCommandsLookup.get(m[0]) && !namedOperatorsLookup.get(m[0]) && !functionsLookup.get(m[0]) && !namedValuesLookup.get(m[0]) && !stringIsNumber(m[0])) {
			let location = Location.create(state.textDocument.uri, Range.create(
				state.textDocument.positionAt(globalIndex + m.index),
				state.textDocument.positionAt(globalIndex + m.index + m[0].length)
			));
			state.callbacks.
			onReference(m[0], location, state);
		}
	}
}

/**
 * Parse a variable reference {var}.
 * @param referenceSection Section containing the reference, starting after the { but including the }.
 * @param globalIndex Reference's index in the document being indexed.
 * @param state Parsing state.
 */
function parseReference(referenceSection: string, globalIndex: number, state: ParsingState): number {
	let reference = extractToMatchingDelimiter(referenceSection, '{', '}');
	if (reference !== undefined) {
		// References contain expressions, so let the expression indexer handle that
		parseExpression(reference, globalIndex, state);
		globalIndex += reference.length + 1;
	}

	return globalIndex;
}

/**
 * Parse a string.
 * @param stringSection Section containing the string, starting after the opening " but including the closing ".
 * @param globalIndex String's index in the document being indexed.
 * @param state Parsing state.
 */
function parseString(stringSection: string, globalIndex: number, state: ParsingState): number {
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
			newGlobalIndex = parseReplacement(subsection, globalIndex + contentsLocalIndex, state);
		}
		else if (m.groups.multi !== undefined) {
			newGlobalIndex = parseMultireplacement(subsection, globalIndex + contentsLocalIndex, state);
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
 * Parse a replacement ${var}.
 * @param replacementSection Section containing the replacement, starting after the ${ but including the closing }.
 * @param globalIndex Replacement's index in the document being indexed.
 * @param state Parsing state.
 */
function parseReplacement(replacementSection: string, globalIndex: number, state: ParsingState): number {
	// Internally, a replacement acts like a reference, so we can forward to it
	return parseReference(replacementSection, globalIndex, state);
}

function parseMultireplacement(multiSection: string, globalIndex: number, state: ParsingState): number {
	let tokens = TokenizeMultireplace(multiSection);

	if (tokens !== undefined) {
		// The test portion is an expression
		parseExpression(tokens.test.text, globalIndex + tokens.test.index, state);

		// The body portions are strings
		for (let token of tokens.body) {
			// Gotta append a quote mark so it'll behave properly
			parseString(token.text + '"', globalIndex + token.index, state);
		}
		globalIndex += tokens.endIndex;
	}

	return globalIndex;
}

/**
 * Parse a symbol creating or manipulating command
 * @param command Command that defines or references a symbol.
 * @param line Remainder of the line after the command.
 * @param lineGlobalIndex Location of the line in the text.
 * @param state Indexing state.
 */
function parseSymbolManipulatingCommand(command: string, line: string, lineGlobalIndex: number, state: ParsingState) {
	// The set command is odd in that it takes an entire expression, so handle that differently
	if (command == "set") {
		parseExpression(line, lineGlobalIndex, state);
	}
	else {
		let lineMatch = line.match(/^(?<symbol>\w+)((?<spacing>\s+?)(?<expression>.+))?/);
		if (lineMatch === null || lineMatch.groups === undefined) {
			return;
		}
		let symbol: string = lineMatch.groups.symbol;
		let symbolLocation = Location.create(state.textDocument.uri, Range.create(
			state.textDocument.positionAt(lineGlobalIndex),
			state.textDocument.positionAt(lineGlobalIndex + symbol.length)
		));
		let expression: string | undefined = lineMatch.groups.expression;
		let expressionGlobalIndex = lineGlobalIndex + symbol.length;
		if (lineMatch.groups.spacing) {
			expressionGlobalIndex += lineMatch.groups.spacing.length;
		}
	
		switch (command) {
			case "create":
				// *create instantiates global variables
				if (symbol !== undefined) {
					state.callbacks.onGlobalVariableCreate(symbol, symbolLocation, state);
					if (expression !== undefined) {
						parseExpression(expression, expressionGlobalIndex, state);
					}
				}
				break;
			case "temp":
				// *temp instantiates variables local to the scene file
				if (symbol !== undefined) {
					state.callbacks.onLocalVariableCreate(symbol, symbolLocation, state);
					if (expression !== undefined) {
						parseExpression(expression, expressionGlobalIndex, state);
					}
				}
				break;
			case "label":
				// *label creates a goto/gosub label local to the scene file
				if (symbol !== undefined) {
					state.callbacks.onLabelCreate(symbol, symbolLocation, state);
				}
				break;
			case "delete":
				// *delete references a variable
				if (symbol !== undefined) {
					state.callbacks.onReference(symbol, symbolLocation, state);
				}
				break;
			default:
				throw Error(`Unexpected command ${command} in parseSymbolManipulatingCommand`);
		}
	}
}

/**
 * Parse the scenes defined by a *scene_list command.
 * @param document Document text to scan.
 * @param startIndex Index at the start of the scenes.
 * @param state Parsing state.
 */
function parseScenes(document: string, startIndex: number, state: ParsingState) {
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
			break;
		}
		line = document.slice(lineStart, lineEnd);
		m = scenePattern.exec(line);
		if (!m || m[1] != padding) {
			break;
		}
		sceneList.push(m[3]);
		lineStart = lineEnd;
	}
	
	let startPosition = state.textDocument.positionAt(startIndex);
	let endPosition = Position.create(
		startPosition.line + sceneList.length, 0
	);
	let range = Range.create(
		startPosition, endPosition
	);
	let location = Location.create(state.textDocument.uri, range);
	state.callbacks.onSceneDefinition(sceneList, location, state);
}

/**
 * Parse a command that can reference variables, such as *if.
 * @param command ChoiceScript command, such as "if", that may contain a reference.
 * @param line The rest of the line after the command.
 * @param lineGlobalIndex Index at the start of the line.
 * @param state Parsing state.
 */
function parseReferenceCommand(command: string, line: string, lineGlobalIndex: number, state: ParsingState) {
	// The *if and *selectable_if commands can be used with options, so take that into account
	if (command == "if" || command == "selectable_if") {
		let choiceSplit = line.split('#');
		if (choiceSplit !== undefined)
			line = choiceSplit[0];
	}
	// The line that follows a command that can reference a variable is an expression
	parseExpression(line, lineGlobalIndex, state);
}

/**
 * Parse an achievement.
 * @param codename Achievement's codename
 * @param startIndex Index at the start of the codename.
 * @param state Parsing state.
 */
function parseAchievement(codename: string, startIndex: number, state: ParsingState) {
	let location = Location.create(state.textDocument.uri, Range.create(
		state.textDocument.positionAt(startIndex),
		state.textDocument.positionAt(startIndex + codename.length)
	));
	state.callbacks.onAchievementCreate(codename, location, state);
}

/**
 * Parse a ChoiceScript document.
 * 
 * @param textDocument Document to parse.
 * @param callbacks Parser event callbacks.
 */
export function parse(textDocument: TextDocument, callbacks: ParserCallbacks): void {
	let state = new ParsingState(textDocument, callbacks);
	let text = textDocument.getText();

	let pattern = RegExp(`${startupFileSymbolCommandPattern}|${sceneListCommandPattern}|${multiStartPattern}|${variableReferenceCommandPattern}|${achievementPattern}`, 'g');
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
			parseSymbolManipulatingCommand(m.groups.symbolManipulateCommand, m.groups.manipulateCommandLine, symbolIndex, state);
		}
		else if (m.groups.sceneListCommand) {
			parseScenes(text, pattern.lastIndex, state);
		}
		else if (m.groups.multi) {
			let sectionGlobalIndex = m.index + m[0].length;
			let section = text.slice(sectionGlobalIndex);
			parseMultireplacement(section, sectionGlobalIndex, state);
		}
		else if (m.groups.variableReferenceCommand) {
			let lineIndex = m.index + 1 + m.groups.variableReferenceCommand.length + m.groups.referenceCommandSpacing.length;
			if (m.groups.symbolReferencePrefix !== undefined)
				lineIndex += m.groups.symbolReferencePrefix.length;
			parseReferenceCommand(m.groups.variableReferenceCommand, m.groups.referenceCommandLine, lineIndex, state);
		}
		else if (m.groups.achievement) {
			let codenameIndex = m.index + m[0].length - m.groups.achievement.length;
			parseAchievement(m.groups.achievement, codenameIndex, state);
		}
	}
}
