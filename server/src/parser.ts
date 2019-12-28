import { Range, Location, Position, TextDocument, Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';

import { 
	functions, 
	namedOperators,
	namedValues,
	validCommands, 
	multiStartPattern,
	replacementStartPattern,
	TokenizeMultireplace,
	variableManipulationCommands,
	variableReferenceCommands,
	labelReferenceCommands,
	startupFileSymbolCreationCommands,
	commandPattern,
	argumentRequiringCommands,
	startupCommands,
	uriIsStartupFile
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
let symbolManipulationCommandsLookup: ReadonlyMap<string, number> = new Map(startupFileSymbolCreationCommands.concat(variableManipulationCommands).map(x => [x, 1]));
let variableReferenceCommandsLookup: ReadonlyMap<string, number> = new Map(variableReferenceCommands.map(x => [x, 1]));
let labelReferenceCommandsLookup: ReadonlyMap<string, number> = new Map(labelReferenceCommands.map(x => [x, 1]));
let functionsLookup: ReadonlyMap<string, number> = new Map(functions.map(x => [x, 1]));
let namedOperatorsLookup: ReadonlyMap<string, number> = new Map(namedOperators.map(x => [x, 1]));
let namedValuesLookup: ReadonlyMap<string, number> = new Map(namedValues.map(x => [x, 1]));


export interface ParserCallbacks {
	/** Called for anything that looks like a *command, valid or not */
	onCommand(prefix: string, command: string, spacing: string, line: string, commandLocation: Location, state: ParsingState): void;
	onGlobalVariableCreate(symbol: string, location: Location, state: ParsingState): void;
	onLocalVariableCreate(symbol: string, location: Location, state: ParsingState): void;
	onLabelCreate(symbol: string, location: Location, state: ParsingState): void;
	onVariableReference(symbol: string, location: Location, state: ParsingState): void;
	/**
	 * Called when a *goto, *gosub, *goto_scene, or *gosub_scene is called.
	 * @param command Command.
	 * @param label Label being referenced, or empty string if there is no reference.
	 * @param scene Scene name being referenced, or empty string if there is no reference.
	 * @param labelLocation Location of the label.
	 * @param sceneLocation Location of the scene.
	 * @param state Parsing state.
	 */
	onLabelReference(command: string, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState): void;
	onSceneDefinition(scenes: string[], location: Location, state: ParsingState): void;
	onAchievementCreate(codename: string, location: Location, state: ParsingState): void;
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
			endGlobalIndex = parseReference(m.groups.remainder, globalIndex + remainderLocalIndex, 0, state);
		}
		else {
			endGlobalIndex = parseString(m.groups.remainder, globalIndex + remainderLocalIndex, 0, state);
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
			state.callbacks.onVariableReference(m[0], location, state);
		}
	}
}

/**
 * Parse a variable reference {var}.
 * 
 * Variable references can either be parsed from the large global document or from a subsection of it.
 * 
 * @param section Section being parsed.
 * @param globalIndex Reference content's index in the global document.
 * @param localIndex The content's index in the section. If undefined, globalIndex is used.
 * @param state Parsing state.
 */
function parseReference(section: string, globalIndex: number, localIndex: number | undefined, state: ParsingState): number {
	let sectionToDocumentDelta = globalIndex;
	if (localIndex === undefined) {
		localIndex = globalIndex;
		sectionToDocumentDelta = 0;
	}

	let reference = extractToMatchingDelimiter(section, '{', '}', localIndex);
	if (reference !== undefined) {
		// References contain expressions, so let the expression indexer handle that
		parseExpression(reference, localIndex + sectionToDocumentDelta, state);
		globalIndex = sectionToDocumentDelta + localIndex + reference.length + 1;
	}

	return globalIndex;
}

/**
 * Parse a string.
 * 
 * Strings can either be parsed from the large global document or from a subsection of it.
 * 
 * @param section Section being parsed.
 * @param globalIndex String contents's index in the global document.
 * @param localIndex The content's index in the section. If undefined, globalIndex is used.
 * @param state Parsing state.
 * @returns Global index to the end of the string.
 */
function parseString(section: string, globalIndex: number, localIndex: number, state: ParsingState): number {
	let sectionToDocumentDelta = globalIndex;
	if (localIndex === undefined) {
		localIndex = globalIndex;
		sectionToDocumentDelta = 0;
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
			newGlobalIndex = parseReplacement(section, sectionToDocumentDelta, contentsLocalIndex, state);
		}
		else if (m.groups.multi !== undefined) {
			newGlobalIndex = parseMultireplacement(section, sectionToDocumentDelta, contentsLocalIndex, state);
		}
		else {
			globalIndex = contentsLocalIndex + sectionToDocumentDelta;  // b/c contentsIndex points beyond the end of the string
			break;
		}

		delimiterPattern.lastIndex = newGlobalIndex;
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
 * @param globalIndex Replacement content's index in the global document.
 * @param localIndex The content's index in the section. If undefined, globalIndex is used.
 * @param state Parsing state.
 * @returns The global index to the end of the replacement.
 */
function parseReplacement(section: string, globalIndex: number, localIndex: number | undefined, state: ParsingState): number {
	// Internally, a replacement acts like a reference, so we can forward to it
	return parseReference(section, globalIndex, localIndex, state);
}

/**
 * Parse a multireplacement @{var true | false}.
 * 
 * Multireplacements can either be parsed from the large global document or from a subsection of it.
 * 
 * @param section Section being parsed.
 * @param globalIndex Multireplacement content's index in the global document.
 * @param localIndex The content's index in the section. If undefined, globalIndex is used.
 * @param state Parsing state.
 * @returns The global index to the end of the multireplacement.
 */
function parseMultireplacement(section: string, globalIndex: number, localIndex: number | undefined, state: ParsingState): number {
	let sectionToDocumentDelta = globalIndex;
	if (localIndex === undefined) {
		localIndex = globalIndex;
		sectionToDocumentDelta = 0;
	}

	let tokens = TokenizeMultireplace(section, localIndex);

	if (tokens !== undefined) {
		// The test portion is an expression
		parseExpression(tokens.test.text, tokens.test.index + sectionToDocumentDelta, state);

		// The body portions are strings
		for (let token of tokens.body) {
			// Gotta append a quote mark so it'll behave properly
			parseString(token.text + '"', token.index + sectionToDocumentDelta, 0, state);
		}
		globalIndex = tokens.endIndex + sectionToDocumentDelta;
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
function parseSymbolManipulationCommand(command: string, line: string, lineGlobalIndex: number, state: ParsingState) {
	// The set command is odd in that it takes an entire expression, so handle that differently
	if (command == "set") {
		parseExpression(line, lineGlobalIndex, state);
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
 * @param line Line after the command.
 * @param lineGlobalIndex Index of the line in the document.
 * @param state Parsing state.
 */
function parseLabelReferenceCommand(command: string, line: string, lineGlobalIndex: number, state: ParsingState) {
	let label = "";
	let scene = "";
	let labelLocation: Location | undefined = undefined;
	let sceneLocation: Location | undefined = undefined;

	let m = line.match(/^(?<firstToken>[\w-]+)((?<spacing>[ \t]+)(?<secondToken>\w+))?/);
	if (m !== null && m.groups !== undefined) {
		if (command.includes("_scene")) {
			scene = m.groups.firstToken;
			sceneLocation = Location.create(state.textDocument.uri, Range.create(
				state.textDocument.positionAt(lineGlobalIndex),
				state.textDocument.positionAt(lineGlobalIndex + scene.length)
			));

			if (m.groups.secondToken !== undefined) {
				label = m.groups.secondToken;
				let labelIndex = lineGlobalIndex + scene.length + m.groups.spacing.length;
				labelLocation = Location.create(state.textDocument.uri, Range.create(
					state.textDocument.positionAt(labelIndex),
					state.textDocument.positionAt(labelIndex + label.length)
				));
			}
		}
		else {
			label = m.groups.firstToken;
			labelLocation = Location.create(state.textDocument.uri, Range.create(
				state.textDocument.positionAt(lineGlobalIndex),
				state.textDocument.positionAt(lineGlobalIndex + label.length)
			));
		}
	}

	state.callbacks.onLabelReference(command, label, scene, labelLocation, sceneLocation, state);
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

	if (!validCommandsLookup.get(command)) {
		let diagnostic = createDiagnostic(DiagnosticSeverity.Error, state.textDocument,
			commandIndex, commandIndex + command.length,
			`Command *${command} isn't a valid ChoiceScript command.`);
		state.callbacks.onParseError(diagnostic);
	}
	else if (argumentRequiringCommandsLookup.get(command) && line.trim() == "") {
		let diagnostic = createDiagnostic(DiagnosticSeverity.Error, state.textDocument,
			commandIndex, commandIndex + command.length,
			`Command *${command} is missing its arguments.`);
		state.callbacks.onParseError(diagnostic);
	}
	else if (startupCommandsLookup.get(command) && !uriIsStartupFile(state.textDocument.uri)) {
		let diagnostic = createDiagnostic(DiagnosticSeverity.Error, state.textDocument,
			commandIndex, commandIndex + command.length,
			`Command *${command} can only be used in startup.txt.`);
		state.callbacks.onParseError(diagnostic);
	}

	let lineIndex = commandIndex + command.length + spacing.length;

	if (symbolManipulationCommandsLookup.get(command)) {
		parseSymbolManipulationCommand(command, line, lineIndex, state);
	}
	else if (variableReferenceCommandsLookup.get(command)) {
		parseVariableReferenceCommand(command, line, lineIndex, state);
	}
	else if (labelReferenceCommandsLookup.get(command)) {
		parseLabelReferenceCommand(command, line, lineIndex, state);
	}
	else if (command == "scene_list") {
		let nextLineIndex = findLineEnd(document, commandIndex);
		if (nextLineIndex !== undefined) {
			parseScenes(document, nextLineIndex, state);
		}
	}
	else if (command == "achievement") {
		let codenameMatch = line.match(/^\S+/);
		if (codenameMatch) {
			let codename = codenameMatch[0];
			parseAchievement(codename, lineIndex, state);
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
			let endIndex = parseReplacement(text, sectionGlobalIndex, undefined, state);
			pattern.lastIndex = endIndex;
		}
		else if (m.groups.multi) {
			let sectionGlobalIndex = m.index + m[0].length;
			// Since the match doesn't consume the whole replacement, jigger the pattern's last index by hand
			let endIndex = parseMultireplacement(text, sectionGlobalIndex, undefined, state);
			pattern.lastIndex = endIndex;
		}
	}
}
