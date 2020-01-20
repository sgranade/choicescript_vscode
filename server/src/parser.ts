import { Range, Location, Position, TextDocument, Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';

import { 
	functions, 
	namedOperators,
	namedValues,
	validCommands, 
	multiStartPattern,
	replacementStartPattern,
	tokenizeMultireplace,
	variableManipulationCommands,
	variableReferenceCommands,
	flowControlCommands,
	symbolCreationCommands,
	commandPattern,
	argumentRequiringCommands,
	startupCommands,
	uriIsStartupFile,
	extractTokenAtIndex,
	statChartCommands,
	statChartBlockCommands,
	operators
} from './language';
import {
	findLineEnd,
	extractToMatchingDelimiter,
	stringIsNumber,
	createDiagnostic
} from './utilities';


let validCommandsLookup: ReadonlyMap<string, number> = new Map(validCommands.map(x => [x, 1]));
let argumentRequiringCommandsLookup: ReadonlyMap<string, number> = new Map(argumentRequiringCommands.map(x => [x, 1]));
let startupCommandsLookup: ReadonlyMap<string, number> = new Map(startupCommands.map(x => [x, 1]));
let symbolManipulationCommandsLookup: ReadonlyMap<string, number> = new Map(symbolCreationCommands.concat(variableManipulationCommands).map(x => [x, 1]));
let variableReferenceCommandsLookup: ReadonlyMap<string, number> = new Map(variableReferenceCommands.map(x => [x, 1]));
let flowControlCommandsLookup: ReadonlyMap<string, number> = new Map(flowControlCommands.map(x => [x, 1]));
let functionsLookup: ReadonlyMap<string, number> = new Map(functions.map(x => [x, 1]));
let namedOperatorsLookup: ReadonlyMap<string, number> = new Map(namedOperators.map(x => [x, 1]));
let namedValuesLookup: ReadonlyMap<string, number> = new Map(namedValues.map(x => [x, 1]));
let operatorsLookup: ReadonlyMap<string, number> = new Map(operators.map(x => [x, 1]));


export interface ParserCallbacks {
	/** Called for anything that looks like a *command, valid or not */
	onCommand(prefix: string, command: string, spacing: string, line: string, commandLocation: Location, state: ParsingState): void;
	onGlobalVariableCreate(symbol: string, location: Location, state: ParsingState): void;
	onLocalVariableCreate(symbol: string, location: Location, state: ParsingState): void;
	onLabelCreate(symbol: string, location: Location, state: ParsingState): void;
	onVariableReference(symbol: string, location: Location, state: ParsingState): void;
	onFlowControlEvent(command: string, commandLocation: Location, label: string, scene: string,
		labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState): void;
	onSceneDefinition(scenes: string[], location: Location, state: ParsingState): void;
	onAchievementCreate(codename: string, location: Location, state: ParsingState): void;
	onAchievementReference(codename: string, location: Location, state: ParsingState): void;
	onParseError(error: Diagnostic): void;
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
	// Deal with arrays first
	let arrayPattern = /\w+\[/;
	let m: RegExpExecArray | null;
	while (m = arrayPattern.exec(expression)) {
		let localIndex = m.index + m[0].length - 1;
		while (expression[localIndex] == '[') {  // To deal with multi-dimensional arrays
			localIndex++;
			let reference = extractToMatchingDelimiter(expression, '[', ']', localIndex);
			if (reference !== undefined) {
				parseExpression(reference, globalIndex + localIndex, state);
				localIndex += reference.length + 1;
			}
			else {
				localIndex++;
			}
		}
		// blank out the matched string
		expression = expression.slice(0, m.index) + " ".repeat(localIndex - m.index) + expression.slice(localIndex);
	}

	// Expressions can contain numbers, strings, operators, built-in variables, variables, and variable references
	// As variable references and strings can contain other things, handle them and remove them from the expression
	// Also handle parentheses
	let recursivePatterns = /^(?<prefix>.*?)(?<delimiter>["{(])(?<remainder>.*)$/;

	while (m = recursivePatterns.exec(expression)) {
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
			endGlobalIndex = parseReference(m.groups.remainder, 1, globalIndex + remainderLocalIndex, 0, state);
		}
		else if (openDelimiter == '"') {
			endGlobalIndex = parseString(m.groups.remainder, globalIndex + remainderLocalIndex, 0, state);
		}
		else {
			let parensContents = extractToMatchingDelimiter(m.groups.remainder, '(', ')', 0);
			if (parensContents === undefined) {
				let diagnostic = createDiagnostic(DiagnosticSeverity.Error, state.textDocument,
					globalIndex + openDelimiterLocalIndex,
					globalIndex + openDelimiterLocalIndex + 1 + m.groups.remainder.length,
					"Missing close parentheses");
				state.callbacks.onParseError(diagnostic);
				endGlobalIndex = globalIndex + remainderLocalIndex;
			}
			else {
				parseExpression(parensContents, globalIndex + remainderLocalIndex, state);
				endGlobalIndex = globalIndex + remainderLocalIndex + parensContents.length + 1;
			}
		}
		let endLocalIndex = endGlobalIndex - globalIndex;

		// blank out the matched string
		expression = expression.slice(0, openDelimiterLocalIndex) + " ".repeat(endLocalIndex - openDelimiterLocalIndex) + expression.slice(endLocalIndex);
	}

	// Split the remaining expression at word boundaries and process each cluster
	let wordPattern = /^\w+$/;
	let chunks = expression.split(/\b/);
	let splitGlobalIndex = globalIndex;
	for (let chunk of chunks) {
		let tokenPattern = /\S+/g;
		while (m = tokenPattern.exec(chunk)) {
			let token = m[0];
			if (wordPattern.test(token)) {
				if (!validCommandsLookup.has(token) && !namedOperatorsLookup.has(token) 
					&& !functionsLookup.has(token) && !namedValuesLookup.has(token) && !stringIsNumber(token)) {
					let location = Location.create(state.textDocument.uri, Range.create(
						state.textDocument.positionAt(splitGlobalIndex + m.index),
						state.textDocument.positionAt(splitGlobalIndex + m.index + token.length)
					));
					state.callbacks.onVariableReference(token, location, state);
				}
			}
			else if (!operatorsLookup.has(token)) {
				let diagnostic = createDiagnostic(DiagnosticSeverity.Error, state.textDocument,
					splitGlobalIndex + m.index,
					splitGlobalIndex + m.index + token.length,
					"Unknown operator");
				state.callbacks.onParseError(diagnostic);
			}
		}
		splitGlobalIndex += chunk.length;
	}
}

/**
 * Parse a variable reference {var}.
 * 
 * Variable references can either be parsed from the large global document or from a subsection of it.
 * 
 * openDelimeterLength is needed in case this is called to parse a replacement.
 * 
 * @param section Section being parsed.
 * @param openDelimiterLength Length of the opening delimiter.
 * @param globalIndex Reference content's index in the global document.
 * @param localIndex The content's index in the section. If undefined, globalIndex is used.
 * @param state Parsing state.
 */
function parseReference(section: string, openDelimiterLength: number, globalIndex: number,
	localIndex: number | undefined, state: ParsingState): number {
	let sectionToDocumentDelta: number;
	if (localIndex === undefined) {
		localIndex = globalIndex;
		sectionToDocumentDelta = 0;
	}
	else {
		sectionToDocumentDelta = globalIndex - localIndex;
	}

	let reference = extractToMatchingDelimiter(section, '{', '}', localIndex);
	if (reference === undefined) {
		let lineEndIndex = findLineEnd(section, localIndex);
		if (lineEndIndex === undefined)
			lineEndIndex = section.length;
		let diagnostic = createDiagnostic(DiagnosticSeverity.Error, state.textDocument,
			localIndex - openDelimiterLength + sectionToDocumentDelta,
			lineEndIndex + sectionToDocumentDelta,
			"Replacement is missing its }");
		state.callbacks.onParseError(diagnostic);
	}
	else if (reference.trim() == "") {
		let diagnostic = createDiagnostic(DiagnosticSeverity.Error, state.textDocument,
			localIndex - openDelimiterLength + sectionToDocumentDelta,
			localIndex + reference.length + 1 + sectionToDocumentDelta,
			"Replacement is empty");
		state.callbacks.onParseError(diagnostic);
	}
	else {
		// References contain expressions, so let the expression indexer handle that
		parseExpression(reference, localIndex + sectionToDocumentDelta, state);
		globalIndex = sectionToDocumentDelta + localIndex + reference.length + 1;
	}

	return globalIndex;
}

/**
 * Parse a bare string.
 * 
 * @param section Section being parsed.
 * @param startGlobalIndex String content's starting index relative to the global document.
 * @param startLocalIndex String content's starting index relative to the section.
 * @param endLocalIndex String content's ending index relative to the section.
 * @param state Parsing state.
 */
function parseBareString(
	section: string, startGlobalIndex: number, startLocalIndex: number, endLocalIndex: number, state: ParsingState) {
	let sectionToDocumentDelta = startGlobalIndex - startLocalIndex;

	let subsection = section.slice(startLocalIndex, endLocalIndex);

	// Deal with any replacements or multireplacements
	let delimiterPattern = RegExp(`${replacementStartPattern}|${multiStartPattern}`, 'g');
	delimiterPattern.lastIndex = startLocalIndex;
	let m: RegExpExecArray | null;
	while (m = delimiterPattern.exec(subsection)) {
		if (m.groups === undefined)
			break;

		let contentsLocalIndex = m.index + m[0].length;
		let newGlobalIndex: number;

		if (m.groups.replacement !== undefined) {
			newGlobalIndex = parseReplacement(
				section, m.groups.replacement.length, contentsLocalIndex + sectionToDocumentDelta, contentsLocalIndex, state);
		}
		else if (m.groups.multi !== undefined) {
			newGlobalIndex = parseMultireplacement(
				section, m.groups.multi.length, contentsLocalIndex + sectionToDocumentDelta, contentsLocalIndex, state);
		}
		else {
			newGlobalIndex = contentsLocalIndex + sectionToDocumentDelta;  // b/c contentsIndex points beyond the end of the string
		}

		delimiterPattern.lastIndex = newGlobalIndex - sectionToDocumentDelta;
		startGlobalIndex = newGlobalIndex;
	}
}

/**
 * Parse a string in an expression as delimited by quote marks.
 * 
 * Strings can either be parsed from the large global document or from a subsection of it.
 * 
 * @param section Section being parsed.
 * @param globalIndex String content's index in the global document.
 * @param localIndex The content's index in the section. If undefined, globalIndex is used.
 * @param state Parsing state.
 * @returns Global index to the end of the string.
 */
function parseString(section: string, globalIndex: number, localIndex: number, state: ParsingState): number {
	let sectionToDocumentDelta: number;
	if (localIndex === undefined) {
		localIndex = globalIndex;
		sectionToDocumentDelta = 0;
	}
	else {
		sectionToDocumentDelta = globalIndex - localIndex;
	}

	// Find the end of the string while dealing with any replacements or multireplacements we run into along the way
	let delimiterPattern = RegExp(`${replacementStartPattern}|${multiStartPattern}|(?<!\\\\)\\"`, 'g');
	delimiterPattern.lastIndex = localIndex;
	let m: RegExpExecArray | null;
	while (m = delimiterPattern.exec(section)) {
		if (m.groups === undefined)
			break;

		let contentsLocalIndex = m.index + m[0].length;
		let newGlobalIndex: number;

		if (m.groups.replacement !== undefined) {
			newGlobalIndex = parseReplacement(
				section, m.groups.replacement.length, contentsLocalIndex + sectionToDocumentDelta, contentsLocalIndex, state);
		}
		else if (m.groups.multi !== undefined) {
			newGlobalIndex = parseMultireplacement(
				section, m.groups.multi.length, contentsLocalIndex + sectionToDocumentDelta, contentsLocalIndex, state);
		}
		else {
			newGlobalIndex = contentsLocalIndex + sectionToDocumentDelta;  // b/c contentsIndex points beyond the end of the string
		}

		delimiterPattern.lastIndex = newGlobalIndex - sectionToDocumentDelta;
		globalIndex = newGlobalIndex;
	}

	return globalIndex;
}

/**
 * Parse a replacement ${var}.
 * 
 * Replacements can either be parsed from the large global document or from a subsection of it.
 * 
 * @param section Section being parsed.
 * @param openDelimiterLength Length of the opening delimiter (${ or $!{ or $!!{).
 * @param globalIndex Replacement content's index in the global document.
 * @param localIndex The content's index in the section. If undefined, globalIndex is used.
 * @param state Parsing state.
 * @returns The global index to the end of the replacement.
 */
function parseReplacement(section: string, openDelimiterLength: number, globalIndex: number, 
	localIndex: number | undefined, state: ParsingState): number {
	// Internally, a replacement acts like a reference, so we can forward to it
	return parseReference(section, openDelimiterLength, globalIndex, localIndex, state);
}

/**
 * Parse a multireplacement @{var true | false}.
 * 
 * Multireplacements can either be parsed from the large global document or from a subsection of it.
 * 
 * @param section Section being parsed.
 * @param openDelimiterLength Length of the opening delimiter (@{ or @!{ or @!!{).
 * @param globalIndex Multireplacement content's index in the global document.
 * @param localIndex The content's index in the section. If undefined, globalIndex is used.
 * @param state Parsing state.
 * @returns The global index to the end of the multireplacement.
 */
function parseMultireplacement(section: string, openDelimiterLength: number, globalIndex: number, 
	localIndex: number | undefined, state: ParsingState): number {
	let sectionToDocumentDelta: number;
	if (localIndex === undefined) {
		localIndex = globalIndex;
		sectionToDocumentDelta = 0;
	}
	else {
		sectionToDocumentDelta = globalIndex - localIndex;
	}

	let tokens = tokenizeMultireplace(section, localIndex);

	if (tokens === undefined) {
		let lineEndIndex = findLineEnd(section, localIndex);
		if (lineEndIndex === undefined)
			lineEndIndex = section.length;
		let diagnostic = createDiagnostic(DiagnosticSeverity.Error, state.textDocument,
			localIndex - openDelimiterLength + sectionToDocumentDelta, lineEndIndex + sectionToDocumentDelta,
			"Multireplace is missing its }");
		state.callbacks.onParseError(diagnostic);
		return globalIndex;
	}

	// Flag any nested multireplacements
	let multiPattern = RegExp(multiStartPattern);
	let m = tokens.fullText.match(multiPattern);
	if (m !== null && m.index !== undefined) {
		let startLocalIndex = localIndex + m.index;
		let endLocalIndex: number;
		let contents = extractToMatchingDelimiter(section, '{', '}', startLocalIndex + m[0].length);
		if (contents !== undefined) {
			// Starting index + opening delimiter length + contents length + closing delimiter length
			endLocalIndex = startLocalIndex + m[0].length + contents.length + 1;
		}
		else {
			endLocalIndex = startLocalIndex + tokens.fullText.length;
		}
		let diagnostic = createDiagnostic(DiagnosticSeverity.Error, state.textDocument,
			startLocalIndex + sectionToDocumentDelta,
			endLocalIndex + sectionToDocumentDelta,
			"Multireplaces cannot be nested");
		state.callbacks.onParseError(diagnostic);
	}

	if (tokens.test.text.trim() == "") {
		let diagnostic = createDiagnostic(DiagnosticSeverity.Error, state.textDocument,
			localIndex - openDelimiterLength + sectionToDocumentDelta,
			tokens.endIndex + sectionToDocumentDelta,
			"Multireplace is empty");
		state.callbacks.onParseError(diagnostic);
	}
	else if (tokens.body.length == 0 || (tokens.body.length == 1 && tokens.body[0].text.trim() == "")) {
		let diagnostic = createDiagnostic(DiagnosticSeverity.Error, state.textDocument,
			tokens.test.index + tokens.test.text.length + sectionToDocumentDelta,
			tokens.endIndex + sectionToDocumentDelta,
			"Multireplace has no options");
		state.callbacks.onParseError(diagnostic);
	}
	else if (tokens.body.length == 1) {
		let diagnostic = createDiagnostic(DiagnosticSeverity.Error, state.textDocument,
			tokens.body[0].index + tokens.body[0].text.length + sectionToDocumentDelta,
			tokens.endIndex + sectionToDocumentDelta,
			"Multireplace must have at least two options separated by |");
		state.callbacks.onParseError(diagnostic);
	}
	else {
		// The test portion is an expression
		parseExpression(tokens.test.text, tokens.test.index + sectionToDocumentDelta, state);

		// The body portions are strings
		for (let token of tokens.body) {
			// Since we can't nest multireplaces, and we've already flagged them above as errors,
			// get rid of any opening multireplaces in the string
			let text = token.text.replace('@{', '  ');
			parseBareString(text, token.index + sectionToDocumentDelta, 0, token.text.length, state);
		}
		globalIndex = tokens.endIndex + sectionToDocumentDelta;
	}

	return globalIndex;
}

/**
 * Parse parameters created by *params
 * @param line Line after *params that contains the parameters.
 * @param lineGlobalIndex Location of the line in the text.
 * @param state Indexing state.
 */
function parseParams(line: string, lineGlobalIndex: number, state: ParsingState) {
	// Split into words
	let wordsPattern = /\w+/g;
	let m: RegExpExecArray | null;
	while (m = wordsPattern.exec(line)) {
		if (m === null)
			continue;

		let location = Location.create(state.textDocument.uri, Range.create(
			state.textDocument.positionAt(lineGlobalIndex + m.index),
			state.textDocument.positionAt(lineGlobalIndex + m.index + m[0].length)
		));
		state.callbacks.onLocalVariableCreate(m[0], location, state);
	}
}

/**
 * Parse a symbol creating or manipulating command
 * @param command Command that defines or references a symbol.
 * @param line Remainder of the line after the command.
 * @param lineGlobalIndex Location of the line in the text.
 * @param state Indexing state.
 */
function parseSymbolManipulationCommand(command: string, line: string, lineGlobalIndex: number, state: ParsingState) {
	// The set and params commands are odd in that they take an entire expression, so handle them differently
	if (command == "set") {
		parseExpression(line, lineGlobalIndex, state);
	}
	else if (command == "params") {
		parseParams(line, lineGlobalIndex, state);
	}
	else {
		let linePattern = /(?<symbol>\w+)((?<spacing>\s+?)(?<expression>.+))?/g;
		linePattern.lastIndex = 0;
		let lineMatch = linePattern.exec(line);
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
			case "rand":
			case "input_text":
			case "input_number":
				// these reference a variable
				if (symbol !== undefined) {
					state.callbacks.onVariableReference(symbol, symbolLocation, state);
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
 * Parse a stat chart.
 * @param document Document text to scan.
 * @param commandIndex Index after the "*" in the *stat_chart command.
 * @param contentStartIndex Index at the start of the stat chart contents.
 * @param state Parsing state.
 */
function parseStatChart(document: string, commandIndex: number, contentStartIndex: number, state: ParsingState) {
	let subcommandPattern = /(?<padding>[ \t]+)(?<command>\S+)((?<spacing>[ \t]*)(?<remainder>.*))?(\r?\n)?/g;
	let lineStart = contentStartIndex;

	// No need to worry about ${} references in the stat chart, as the top-level parser
	// will go back over the lines after the *stat_chart command and process them

	subcommandPattern.lastIndex = lineStart;
	let padding = "NONE";
	let m: RegExpExecArray | null;

	while (m = subcommandPattern.exec(document)) {
		if (m.index !== lineStart) {
			break;
		}
		if (padding == "NONE") {
			padding = m.groups!.padding;
		}
		else if (m.groups!.padding.length < padding.length) {
			break;
		}
		else if (m.groups!.padding != padding) {
			let diagnostic = createDiagnostic(DiagnosticSeverity.Error, state.textDocument,
				m.index, m.index + m[0].length,
				"Line is indented too far.");
			state.callbacks.onParseError(diagnostic);
			break;
		}

		let command = m.groups!.command;
		let commandStart = m.index + padding.length;

		if (statChartCommands.includes(command)) {
			let spacing = m.groups!.spacing;
			if (spacing === undefined) {
				let diagnostic = createDiagnostic(DiagnosticSeverity.Error, state.textDocument,
					commandStart, commandStart + command.length,
					`Missing variable after ${command}`);
				state.callbacks.onParseError(diagnostic);
			}
			else {
				let remainderStart = commandStart + command.length + spacing.length;
				let variable = extractTokenAtIndex(document, remainderStart);
				if (variable === undefined) {
					let diagnostic = createDiagnostic(DiagnosticSeverity.Error, state.textDocument,
						remainderStart, remainderStart,
						"Not a valid variable.");
					state.callbacks.onParseError(diagnostic);
				}
				else if (variable[0] == '{') {
					parseExpression(variable?.slice(1, -1), remainderStart+1, state);
				}
				else {
					let location = Location.create(state.textDocument.uri, Range.create(
						state.textDocument.positionAt(remainderStart),
						state.textDocument.positionAt(remainderStart + variable.length)
					));
					state.callbacks.onVariableReference(variable, location, state);
				}
			}

			if (statChartBlockCommands.includes(command)) {
				// Consume any sub-indented lines
				lineStart = subcommandPattern.lastIndex;
				while (lineStart < document.length) {
					let nextLineStart = findLineEnd(document, lineStart);
					if (nextLineStart === undefined) {
						break;
					}
					let line = document.slice(lineStart, nextLineStart);
					let paddingMatch = line.match(/^(?<padding>\s+)/);
					if (!paddingMatch || paddingMatch.groups!.padding.length <= padding.length) {
						break;
					}
					lineStart = nextLineStart;
				}
				subcommandPattern.lastIndex = lineStart;
			}
		}
		else {
			let diagnostic = createDiagnostic(DiagnosticSeverity.Error, state.textDocument,
				commandStart, commandStart + command.length,
				`Must be one of ${statChartCommands.join(", ")}`);
			state.callbacks.onParseError(diagnostic);
		}

		lineStart = subcommandPattern.lastIndex;
	}

	if (lineStart == contentStartIndex) {
		let diagnostic = createDiagnostic(DiagnosticSeverity.Error, state.textDocument,
			commandIndex - 1, commandIndex + "stat_chart".length,
			`*stat_chart must have at least one stat`);
		state.callbacks.onParseError(diagnostic);
	}
}

/**
 * Parse a command that can reference variables, such as *if.
 * @param command ChoiceScript command, such as "if", that may contain a reference.
 * @param line The rest of the line after the command.
 * @param lineGlobalIndex Index at the start of the line.
 * @param state Parsing state.
 */
function parseVariableReferenceCommand(command: string, line: string, lineGlobalIndex: number, state: ParsingState) {
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
 * Parse a command that references labels, such as *goto.
 * @param command Command.
 * @param commandGlobalIndex: Index of the command in the document.
 * @param line Line after the command.
 * @param lineGlobalIndex Index of the line in the document.
 * @param state Parsing state.
 */
function parseFlowControlCommand(command: string, commandGlobalIndex: number, line: string, lineGlobalIndex: number, state: ParsingState) {
	let commandLocation = Location.create(state.textDocument.uri, Range.create(
		state.textDocument.positionAt(commandGlobalIndex),
		state.textDocument.positionAt(commandGlobalIndex + command.length)
	));
	let label = "";
	let scene = "";
	let labelLocation: Location | undefined = undefined;
	let sceneLocation: Location | undefined = undefined;

	if (command != "return") {
		let firstToken = "";
		let secondToken = "";
		let spacing = "";
		// Get the first token, which may be a {} reference
		let token = extractTokenAtIndex(line, 0, "{}", "\\w-");
		firstToken = (token !== undefined) ? token : "";
		if (firstToken != "") {
			line = line.substring(firstToken.length);
			let m = line.match(/^(?<spacing>[ \t]+)/);
			if (m !== null && m.groups !== undefined) {
				spacing = m.groups.spacing;
				token = extractTokenAtIndex(line, spacing.length);
				secondToken = (token !== undefined) ? token : "";
			}
		}

		// Evaluate expressions (if any)
		if (firstToken != "" && firstToken[0] == '{') {
			parseExpression(firstToken.slice(1, -1), lineGlobalIndex+1, state);
		}
		if (secondToken != "" && secondToken[0] == '{') {
			parseExpression(secondToken.slice(1, -1), lineGlobalIndex+firstToken.length+spacing.length+1, state);
		}
	
		if (command.includes("_scene")) {
			scene = firstToken;
			sceneLocation = Location.create(state.textDocument.uri, Range.create(
				state.textDocument.positionAt(lineGlobalIndex),
				state.textDocument.positionAt(lineGlobalIndex + scene.length)
			));

			if (secondToken != "") {
				label = secondToken;
				let labelIndex = lineGlobalIndex + scene.length + spacing.length;
				labelLocation = Location.create(state.textDocument.uri, Range.create(
					state.textDocument.positionAt(labelIndex),
					state.textDocument.positionAt(labelIndex + label.length)
				));
			}
		}
		else {
			label = firstToken;
			labelLocation = Location.create(state.textDocument.uri, Range.create(
				state.textDocument.positionAt(lineGlobalIndex),
				state.textDocument.positionAt(lineGlobalIndex + label.length)
			));
		}
	}

	state.callbacks.onFlowControlEvent(command, commandLocation, label, scene, labelLocation, sceneLocation, state);
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
 * Parse an achievement reference.
 * @param codename Achievement's codename
 * @param startIndex Index at the start of the codename.
 * @param state Parsing state.
 */
function parseAchievementReference(codename: string, startIndex: number, state: ParsingState) {
	let location = Location.create(state.textDocument.uri, Range.create(
		state.textDocument.positionAt(startIndex),
		state.textDocument.positionAt(startIndex + codename.length)
	));
	state.callbacks.onAchievementReference(codename, location, state);
}

/**
 * Parse a command line.
 * 
 * @param document Document being parsed.
 * @param prefix Spaces before the command.
 * @param command Command.
 * @param spacing Spaces after the command, if any.
 * @param line The rest of the line after the command, if any.
 * @param commandIndex Index of the command in the document.
 * @param state Parsing state.
 */
function parseCommand(document: string, prefix: string, command: string, spacing: string, line: string, commandIndex: number, state: ParsingState) {
	let commandLocation = Location.create(state.textDocument.uri, Range.create(
		state.textDocument.positionAt(commandIndex),
		state.textDocument.positionAt(commandIndex + command.length)
	));

	state.callbacks.onCommand(prefix, command, spacing, line, commandLocation, state);

	if (!validCommandsLookup.has(command)) {
		let diagnostic = createDiagnostic(DiagnosticSeverity.Error, state.textDocument,
			commandIndex, commandIndex + command.length,
			`Command *${command} isn't a valid ChoiceScript command.`);
		state.callbacks.onParseError(diagnostic);
	}
	else if (argumentRequiringCommandsLookup.has(command) && line.trim() == "") {
		let diagnostic = createDiagnostic(DiagnosticSeverity.Error, state.textDocument,
			commandIndex, commandIndex + command.length,
			`Command *${command} is missing its arguments.`);
		state.callbacks.onParseError(diagnostic);
	}
	else if (startupCommandsLookup.has(command) && !uriIsStartupFile(state.textDocument.uri)) {
		let diagnostic = createDiagnostic(DiagnosticSeverity.Error, state.textDocument,
			commandIndex, commandIndex + command.length,
			`Command *${command} can only be used in startup.txt.`);
		state.callbacks.onParseError(diagnostic);
	}

	let lineIndex = commandIndex + command.length + spacing.length;

	if (symbolManipulationCommandsLookup.has(command)) {
		parseSymbolManipulationCommand(command, line, lineIndex, state);
	}
	else if (variableReferenceCommandsLookup.has(command)) {
		parseVariableReferenceCommand(command, line, lineIndex, state);
	}
	else if (flowControlCommandsLookup.has(command)) {
		parseFlowControlCommand(command, commandIndex, line, lineIndex, state);
	}
	else if (command == "scene_list") {
		let nextLineIndex = findLineEnd(document, commandIndex);
		if (nextLineIndex !== undefined) {
			parseScenes(document, nextLineIndex, state);
		}
	}
	else if (command == "stat_chart") {
		let nextLineIndex = findLineEnd(document, commandIndex);
		if (nextLineIndex !== undefined) {
			parseStatChart(document, commandIndex, nextLineIndex, state);
		}
	}
	else if (command == "achievement") {
		let codenameMatch = line.match(/^\S+/);
		if (codenameMatch) {
			let codename = codenameMatch[0];
			parseAchievement(codename, lineIndex, state);
		}
	}
	else if (command == "achieve") {
		let codenameMatch = line.match(/^\S+/);
		if (codenameMatch) {
			let codename = codenameMatch[0];
			parseAchievementReference(codename, lineIndex, state);
		}
	}
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

	let pattern = RegExp(`${commandPattern}|${replacementStartPattern}|${multiStartPattern}`, 'g');
	let m: RegExpExecArray | null;

	while (m = pattern.exec(text)) {
		if (m.groups === undefined) {
			continue;
		}

		// Pattern options: command, replacement (${}), multi (@{})
		if (m.groups.command) {
			let command = m.groups.command;
			let prefix = m.groups.commandPrefix ? m.groups.commandPrefix : "";
			let spacing = m.groups.commandSpacing ? m.groups.commandSpacing : "";
			let line = m.groups.commandLine ? m.groups.commandLine : "";
			let commandIndex = m.index + prefix.length + 1;
			parseCommand(text, prefix, command, spacing, line, commandIndex, state);
		}
		else if (m.groups.replacement) {
			let sectionGlobalIndex = m.index + m[0].length;
			// Since the match doesn't consume the whole replacement, jigger the pattern's last index by hand
			let endIndex = parseReplacement(text, m[0].length, sectionGlobalIndex, undefined, state);
			pattern.lastIndex = endIndex;
		}
		else if (m.groups.multi) {
			let sectionGlobalIndex = m.index + m[0].length;
			// Since the match doesn't consume the whole replacement, jigger the pattern's last index by hand
			let endIndex = parseMultireplacement(text, m[0].length, sectionGlobalIndex, undefined, state);
			pattern.lastIndex = endIndex;
		}
	}
}
