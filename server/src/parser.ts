import { Range, Location, Position, Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument'

import {
	validCommands,
	multiStartPattern,
	replacementStartPattern,
	optionPattern,
	markupPattern,
	variableManipulationCommands,
	insideBlockCommands,
	flowControlCommands,
	symbolCreationCommands,
	commandPattern,
	argumentRequiredCommands,
	variableReferenceCommands,
	startupCommands,
	uriIsStartupFile,
	extractTokenAtIndex,
	statChartCommands,
	statChartBlockCommands,
	mathOperators,
	comparisonOperators,
	stringOperators,
	booleanFunctions,
	argumentDisallowedCommands,
	argumentIgnoredCommands,
	optionAllowedCommands,
} from './language';
import {
	Expression,
	ExpressionTokenType,
	tokenizeMultireplace,
	ExpressionEvalType
} from './tokens';
import {
	findLineEnd,
	extractToMatchingDelimiter,
	createDiagnostic,
	readLine,
	readNextNonblankLine,
	NewLine,
	summarize,
	extractToMatchingIndent
} from './utilities';
import { SummaryScope } from '.';


const nonWordOperators: ReadonlyArray<string> = mathOperators.concat(comparisonOperators, stringOperators);


const validCommandsLookup: ReadonlyMap<string, number> = new Map(validCommands.map(x => [x, 1]));
const argumentRequiredCommandsLookup: ReadonlyMap<string, number> = new Map(argumentRequiredCommands.map(x => [x, 1]));
const argumentDisallowedCommandsLookup: ReadonlyMap<string, number> = new Map(argumentDisallowedCommands.map(x => [x, 1]));
const argumentIgnoredCommandsLookup: ReadonlyMap<string, number> = new Map(argumentIgnoredCommands.map(x => [x, 1]));
const startupCommandsLookup: ReadonlyMap<string, number> = new Map(startupCommands.map(x => [x, 1]));
const optionAllowedCommandsLookup: ReadonlyMap<string, number> = new Map(optionAllowedCommands.map(x => [x, 1]));
const variableReferenceCommandsLookup: ReadonlyMap<string, number> = new Map(variableReferenceCommands.map(x => [x, 1]));
const symbolManipulationCommandsLookup: ReadonlyMap<string, number> = new Map(symbolCreationCommands.concat(variableManipulationCommands).map(x => [x, 1]));
const insideBlockCommandsLookup: ReadonlyMap<string, number> = new Map(insideBlockCommands.map(x => [x, 1]));
const flowControlCommandsLookup: ReadonlyMap<string, number> = new Map(flowControlCommands.map(x => [x, 1]));
const nonWordOperatorsLookup: ReadonlyMap<string, number> = new Map(nonWordOperators.map(x => [x, 1]));
const booleanFunctionsLookup: ReadonlyMap<string, number> = new Map(booleanFunctions.map(x => [x, 1]));


export interface ParserCallbacks {
	/* Called for anything that looks like a *command, valid or not */
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
	onChoiceScope(scope: SummaryScope, state: ParsingState): void;
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
	 * Global offset into textDocument of the section being parsed
	 */
	sectionGlobalIndex: number;
	/**
	 * Callbacks for parsing events
	 */
	callbacks: ParserCallbacks;
	/**
	 * Whether or not any temp variables have been created.
	 * Needed to validate *create commands don't come after *temp ones
	 */
	createdTempVariables: boolean;
	/**
	 * Enclosing block (for parsing e.g. *if or *choice commands)
	 */
	enclosingBlock: string | undefined;

	constructor(textDocument: TextDocument, callbacks: ParserCallbacks) {
		this.textDocument = textDocument;
		this.sectionGlobalIndex = 0;
		this.callbacks = callbacks;
		this.createdTempVariables = false;
	}
}

/**
 * Get the document-global position based on an offset into the section being parsed.
 * @param offset Offset into the section being parsed.
 * @param state Parsing state.
 */
function parsingPositionAt(offset: number, state: ParsingState): Position {
	return state.textDocument.positionAt(state.sectionGlobalIndex + offset);
}

/**
 * Generate a diagnostic message during parsing.
 * 
 * Start and end locations are 0-based indices into the section.
 * 
 * @param severity Diagnostic severity
 * @param start Diagnostic's start location in the section.
 * @param end Diagnostic's end location in the section.
 * @param message Diagnostic message.
 * @param state Parsing state.
 */
function createParsingDiagnostic(severity: DiagnosticSeverity, start: number, end: number, message: string, state: ParsingState): Diagnostic {
	return createDiagnostic(severity, state.textDocument, start + state.sectionGlobalIndex, end + state.sectionGlobalIndex, message);
}

/**
 * Create a global location from indices into a section.
 * 
 * @param start Start location in the section.
 * @param end End location in the section.
 * @param state Parsing state.
 */
function createParsingLocation(start: number, end: number, state: ParsingState): Location {
	return Location.create(state.textDocument.uri, Range.create(
		parsingPositionAt(start, state), parsingPositionAt(end, state)
	));
}

const stringDelimiterGlobalRegex = RegExp(`${replacementStartPattern}|${multiStartPattern}|(?<!\\\\)\\"`, 'g');

/**
 * Parse a string in an expression as delimited by quote marks.
 * 
 * Strings can either be parsed from the large global document or from a subsection of it.
 * 
 * @param text Section being parsed.
 * @param sectionIndex String content's index in the section being parsed.
 * @param localIndex The content's index in the text. If undefined, sectionIndex is used.
 * @param state Parsing state.
 * @returns Local index to the end of the string.
 */
function parseString(text: string, sectionIndex: number, localIndex: number, state: ParsingState): number {
	if (localIndex === undefined) {
		localIndex = sectionIndex;
	}
	const oldDelimiterLastIndex = stringDelimiterGlobalRegex.lastIndex;

	// Find the end of the string while dealing with any replacements or multireplacements we run into along the way
	stringDelimiterGlobalRegex.lastIndex = localIndex;
	let m: RegExpExecArray | null;
	while ((m = stringDelimiterGlobalRegex.exec(text))) {
		if (m.groups === undefined)
			break;

		const contentsLocalIndex = m.index + m[0].length;
		let newLocalIndex: number;

		if (m.groups.replacement !== undefined) {
			newLocalIndex = parseReplacement(
				text, m.groups.replacement.length, sectionIndex, contentsLocalIndex, state);
		}
		else if (m.groups.multi !== undefined) {
			newLocalIndex = parseMultireplacement(
				text, m.groups.multi.length, sectionIndex + contentsLocalIndex, contentsLocalIndex, state);
		}
		else {
			newLocalIndex = contentsLocalIndex;  // b/c contentsIndex points beyond the end of the string
		}

		stringDelimiterGlobalRegex.lastIndex = newLocalIndex;
		localIndex = newLocalIndex;
	}

	stringDelimiterGlobalRegex.lastIndex = oldDelimiterLastIndex;

	return localIndex;
}

/**
 * Parse a tokenized expression.
 * @param tokenizedExpression Tokenized expression.
 * @param state Parsing state.
 */
function parseTokenizedExpression(tokenizedExpression: Expression, state: ParsingState): void {
	for (const token of tokenizedExpression.tokens) {
		const tokenSectionIndex = tokenizedExpression.globalIndex - state.sectionGlobalIndex + token.index;
		// Parse tokens in ways that aren't handled by the tokenizer
		switch (token.type) {
			case ExpressionTokenType.String:
				parseString(token.text, tokenSectionIndex, 1, state);
				break;
			case ExpressionTokenType.Variable: {
				const location = createParsingLocation(tokenSectionIndex, tokenSectionIndex + token.text.length, state);
				state.callbacks.onVariableReference(token.text, location, state);
				break;
			}
			case ExpressionTokenType.UnknownOperator: {
				const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
					tokenSectionIndex,
					tokenSectionIndex + token.text.length,
					"Unknown operator",
					state);
				state.callbacks.onParseError(diagnostic);
				break;
			}
		}
	}

	for (const error of tokenizedExpression.parseErrors) {
		state.callbacks.onParseError(error);
	}
	for (const error of tokenizedExpression.validateErrors) {
		state.callbacks.onParseError(error);
	}

	// Recursively parse any sub-expressions
	const tokensWithContents = tokenizedExpression.combinedTokens.filter(token => {
		return token.contents !== undefined;
	});
	for (const token of tokensWithContents) {
		if (token.contents) {
			parseTokenizedExpression(token.contents, state);
		}
	}
}


/**
 * Parse an expression.
 * @param expression String containing the expression (and only the expression).
 * @param globalIndex Expression's index in the document being indexed.
 * @param state Parsing state.
 * @param isValueSetting True if the expression is part of a value-setting command like *set.
 * @returns Tokenized expression.
 */
function parseExpression(expression: string, globalIndex: number, state: ParsingState, isValueSetting = false): Expression {
	const tokenizedExpression = new Expression(expression, globalIndex, state.textDocument, isValueSetting);
	parseTokenizedExpression(tokenizedExpression, state);
	return tokenizedExpression;
}

/**
 * Parse a variable reference {var}.
 * 
 * Variable references can either be parsed from the large global document or from a subsection of it.
 * 
 * openDelimeterLength is needed in case this is called to parse a replacement.
 * 
 * @param text Text being parsed.
 * @param openDelimiterLength Length of the opening delimiter.
 * @param sectionIndex Reference content's index in the section being parsed.
 * @param localIndex The content's index in the text. If undefined, sectionIndex is used.
 * @param state Parsing state.
 * @returns The local index to the end of the variable reference.
 */
function parseReference(text: string, openDelimiterLength: number, sectionIndex: number,
	localIndex: number | undefined, state: ParsingState): number {

	let textToSectionDelta: number;
	if (localIndex === undefined) {
		localIndex = sectionIndex;
		textToSectionDelta = 0;
	}
	else {
		textToSectionDelta = sectionIndex;
	}
	let newLocalIndex = localIndex;

	const reference = extractToMatchingDelimiter(text, '{', '}', localIndex);
	if (reference === undefined) {
		const lineEndIndex = findLineEnd(text, localIndex);
		const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
			localIndex - openDelimiterLength + textToSectionDelta,
			lineEndIndex + textToSectionDelta,
			"Replacement is missing its }", state);
		state.callbacks.onParseError(diagnostic);
	}
	else if (reference.trim() == "") {
		const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
			localIndex - openDelimiterLength + textToSectionDelta,
			localIndex + reference.length + 1 + textToSectionDelta,
			"Replacement is empty", state);
		state.callbacks.onParseError(diagnostic);
	}
	else {
		// References contain expressions, so let the expression parser handle that
		parseExpression(reference, localIndex + textToSectionDelta + state.sectionGlobalIndex, state);
		newLocalIndex = localIndex + reference.length + 1;
	}

	return newLocalIndex;
}

const bareStringDelimiterGlobalRegex = RegExp(`${replacementStartPattern}|${multiStartPattern}`, 'g');

/**
 * Parse a bare string.
 * 
 * A bare string is a part of the document that we treat as if it were a string, even though
 * it isn't surrounded by quotes. Parsing continues to the end of the string.
 * 
 * @param text Text being parsed.
 * @param startSectionIndex String content's starting index relative to the section being parsed.
 * @param endLocalIndex String content's ending index relative to the start of text.
 * @param state Parsing state.
 */
function parseBareString(
	text: string, startSectionIndex: number, endLocalIndex: number, state: ParsingState): void {
	const subsection = text.slice(0, endLocalIndex);

	// Deal with any replacements or multireplacements
	// Since we're using a single shared regex for speed, and this function can be called recursively,
	// we need to be careful about how we use the regex's lastIndex setting
	const previousLastIndex = bareStringDelimiterGlobalRegex.lastIndex;
	bareStringDelimiterGlobalRegex.lastIndex = 0;  // Reset the global regex
	let m: RegExpExecArray | null;
	while ((m = bareStringDelimiterGlobalRegex.exec(subsection))) {
		if (m.groups === undefined)
			break;

		const contentsLocalIndex = m.index + m[0].length;
		let newLocalIndex: number;

		if (m.groups.replacement !== undefined) {
			newLocalIndex = parseReplacement(
				text, m.groups.replacement.length, startSectionIndex, contentsLocalIndex, state);
		}
		else if (m.groups.multi !== undefined) {
			newLocalIndex = parseMultireplacement(
				text, m.groups.multi.length, startSectionIndex + contentsLocalIndex, contentsLocalIndex, state);
		}
		else {
			newLocalIndex = contentsLocalIndex;  // b/c contentsIndex points beyond the end of the string
		}

		bareStringDelimiterGlobalRegex.lastIndex = newLocalIndex;
	}
	bareStringDelimiterGlobalRegex.lastIndex = previousLastIndex;
}


/**
 * Parse a replacement ${var}.
 * 
 * @param text Section being parsed.
 * @param openDelimiterLength Length of the opening delimiter (${ or $!{ or $!!{).
 * @param sectionIndex Replacement content's index in the section being parsed.
 * @param localIndex The content's index in the text. If undefined, sectionIndex is used.
 * @param state Parsing state.
 * @returns The local index to the end of the replacement.
 */
function parseReplacement(text: string, openDelimiterLength: number, sectionIndex: number,
	localIndex: number | undefined, state: ParsingState): number {
	// Internally, a replacement acts like a reference, so we can forward to it
	return parseReference(text, openDelimiterLength, sectionIndex, localIndex, state);
}

const multiStartRegex = RegExp(multiStartPattern);

/**
 * Parse a multireplacement @{var true | false}.
 * 
 * @param text Text being parsed.
 * @param openDelimiterLength Length of the opening delimiter (@{ or @!{ or @!!{).
 * @param sectionIndex Multireplacement content's index in the section being parsed.
 * @param localIndex The content's index in the section. If undefined, sectionIndex is used.
 * @param state Parsing state.
 * @returns The local index to the end of the multireplacement.
 */
function parseMultireplacement(text: string, openDelimiterLength: number, sectionIndex: number,
	localIndex: number | undefined, state: ParsingState): number {

	let textToSectionDelta: number;
	if (localIndex === undefined) {
		localIndex = sectionIndex;
		textToSectionDelta = 0;
	}
	else {
		textToSectionDelta = sectionIndex - localIndex;
	}

	const tokens = tokenizeMultireplace(
		text, state.textDocument, sectionIndex + state.sectionGlobalIndex, localIndex
	);

	if (tokens === undefined || tokens.unterminated) {
		const lineEndIndex = findLineEnd(text, localIndex);
		const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
			localIndex - openDelimiterLength + textToSectionDelta, localIndex + textToSectionDelta,
			"Multireplace is missing its }", state);
		state.callbacks.onParseError(diagnostic);
	}

	if (tokens !== undefined) {
		// Flag any nested multireplacements
		const m = tokens.text.match(multiStartRegex);
		if (m !== null && m.index !== undefined) {
			const startLocalIndex = localIndex + m.index;
			let endLocalIndex: number;
			const contents = extractToMatchingDelimiter(text, '{', '}', startLocalIndex + m[0].length);
			if (contents !== undefined) {
				// Starting index + opening delimiter length + contents length + closing delimiter length
				endLocalIndex = startLocalIndex + m[0].length + contents.length + 1;
			}
			else {
				endLocalIndex = startLocalIndex + tokens.text.length;
			}
			const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
				startLocalIndex + textToSectionDelta,
				endLocalIndex + textToSectionDelta,
				"Multireplaces cannot be nested",
				state);
			state.callbacks.onParseError(diagnostic);
		}

		if (tokens.test.bareExpression.trim() == "") {
			const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
				localIndex - openDelimiterLength + textToSectionDelta,
				tokens.endIndex + textToSectionDelta,
				"Multireplace is empty",
				state);
			state.callbacks.onParseError(diagnostic);
		}
		else {
			const whitespaceMatch = tokens.text.match(/^\s+/);
			if (whitespaceMatch !== null) {
				const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
					localIndex + textToSectionDelta,
					localIndex + whitespaceMatch[0].length + textToSectionDelta,
					"Spaces aren't allowed at the start of a multireplace",
					state);
				state.callbacks.onParseError(diagnostic);
			}

			// The test portion is an already-tokenized expression
			parseTokenizedExpression(tokens.test, state);

			if (tokens.body.length == 0 || (tokens.body.length == 1 && tokens.body[0].text.trim() == "")) {
				let startLocalIndex = tokens.test.globalIndex - state.sectionGlobalIndex + tokens.test.bareExpression.length;
				if (tokens.text.startsWith("(")) {
					startLocalIndex++;
				}
				const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
					startLocalIndex, tokens.endIndex + textToSectionDelta,
					"Multireplace has no options", state);
				state.callbacks.onParseError(diagnostic);
			}
			else {
				if (
					tokens.bareTest !== undefined &&
					tokens.bareTest.text.endsWith(")") &&
					tokens.body[0].text.trim() !== "" &&
					tokens.bareTest.localIndex + tokens.bareTest.text.length == tokens.body[0].localIndex
				) {
					const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
						tokens.body[0].localIndex - 1 + textToSectionDelta,
						tokens.body[0].localIndex + textToSectionDelta,
						"Multireplace must have a space after parentheses",
						state);
					state.callbacks.onParseError(diagnostic);
				}

				if (tokens.body.length == 1) {
					const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
						tokens.body[0].localIndex + tokens.body[0].text.length + textToSectionDelta,
						tokens.endIndex + textToSectionDelta,
						"Multireplace must have at least two options separated by |",
						state);
					state.callbacks.onParseError(diagnostic);
				}

				// Treat the body portions as strings without surrounding quote marks
				for (const token of tokens.body) {
					// Since we can't nest multireplaces, and we've already flagged them above as errors,
					// get rid of any opening multireplaces in the string
					const text = token.text.replace('@{', '  ');
					parseBareString(text, token.localIndex + textToSectionDelta, token.text.length, state);
				}

				// Check the first body for a leading operator and warn about it if we don't have parens around the test
				// We only check for non-word operators so we don't catch regular English words like "and"
				if (!tokens.text.startsWith("(")) {
					const firstText = tokens.body[0].text.split(' ')[0];
					if (nonWordOperatorsLookup.has(firstText)) {
						const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Information,
							tokens.test.globalIndex - state.sectionGlobalIndex,
							tokens.body[0].localIndex + firstText.length + textToSectionDelta,
							"Potentially missing parentheses",
							state);
						state.callbacks.onParseError(diagnostic);
					}
				}

				localIndex = tokens.endIndex;
			}
		}
	}

	return localIndex;
}

/**
 * Parse parameters created by *params.
 * @param line Line after *params that contains the parameters.
 * @param lineSectionIndex Location of the line in the section being parsed.
 * @param state Indexing state.
 */
function parseParams(line: string, lineSectionIndex: number, state: ParsingState): void {
	// Split into words
	const wordsPattern = /\w+/g;
	let m: RegExpExecArray | null;
	while ((m = wordsPattern.exec(line))) {
		if (m === null)
			continue;

		const location = createParsingLocation(lineSectionIndex + m.index, lineSectionIndex + m.index + m[0].length, state);
		state.callbacks.onLocalVariableCreate(m[0], location, state);
	}
}

/**
 * Parse a *set command.
 * @param line Line after *set that contains the variable and the value to set it to.
 * @param lineSectionIndex Location of the line in the section being parsed.
 * @param state Indexing state.
 */
function parseSet(line: string, lineSectionIndex: number, state: ParsingState): void {
	const tokenizedExpression = new Expression(
		line, lineSectionIndex + state.sectionGlobalIndex, state.textDocument, true
	);
	const tokens = tokenizedExpression.tokens;

	if (tokens.length == 0) {
		const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
			lineSectionIndex, lineSectionIndex,
			"Missing variable name", state);
		state.callbacks.onParseError(diagnostic);
		return;
	}
	// The first token must be a variable or a variable reference
	if (tokens[0].type != ExpressionTokenType.Variable && tokens[0].type != ExpressionTokenType.VariableReference) {
		const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
			lineSectionIndex + tokens[0].index,
			lineSectionIndex + tokens[0].index + tokens[0].text.length,
			"Not a variable or variable reference",
			state);
		state.callbacks.onParseError(diagnostic);
	}
	else {
		parseTokenizedExpression(tokenizedExpression.slice(0, 1), state);
	}

	// Now parse the remaining elements as an expression and then validate them as part of a *set command
	const remainingExpression = tokenizedExpression.slice(1);
	if (remainingExpression.tokens.length == 0) {
		const index = lineSectionIndex + tokens[0].index + tokens[0].text.length;
		const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
			index, index,
			"Missing value to set the variable to", state);
		state.callbacks.onParseError(diagnostic);
	}
	else {
		parseTokenizedExpression(remainingExpression, state);
	}
}

/**
 * Parse a symbol creating or manipulating command.
 * @param command Command that defines or references a symbol.
 * @param commandSectionIndex Location of the command in the section being parsed.
 * @param line Remainder of the line after the command. Guaranteed to have content.
 * @param lineSectionIndex Location of the line in the section being parsed.
 * @param state Indexing state.
 */
function parseSymbolManipulationCommand(command: string, commandSectionIndex: number, line: string, lineSectionIndex: number, state: ParsingState): void {
	// The *params command is odd in that it takes an entire expression, and *set has two
	// different expressions to handle, so parse them separately
	if (command == "params") {
		parseParams(line, lineSectionIndex, state);
	}
	else if (command == "set") {
		parseSet(line, lineSectionIndex, state);
	}
	else {
		var linePattern = /(?<symbol>\w+)((?<spacing>\s+?)(?<expression>.+))?/;
		if (command == "label") {
			// *label accepts *any* punctuation in the label so we need a different regex
			linePattern = /(?<symbol>\S+)((?<spacing>\s+?)(?<expression>.+))?/;
		}
		const lineMatch = linePattern.exec(line);
		if (lineMatch === null || lineMatch.groups === undefined) {
			return;
		}
		const symbol: string = lineMatch.groups.symbol;
		const symbolLocation = createParsingLocation(lineSectionIndex, lineSectionIndex + symbol.length, state);
		const expression: string | undefined = lineMatch.groups.expression;
		const spacing: string | undefined = lineMatch.groups.spacing;
		let expressionSectionIndex = lineSectionIndex + symbol.length;
		if (spacing) {
			expressionSectionIndex += lineMatch.groups.spacing.length;
		}
		switch (command) {
			case "create":
				// *create instantiates global variables
				state.callbacks.onGlobalVariableCreate(symbol, symbolLocation, state);
				// Warn about using *create after *temp in startup.txt
				if (state.createdTempVariables && uriIsStartupFile(state.textDocument.uri)) {
					const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
						commandSectionIndex, commandSectionIndex + command.length,
						"Must come before any *temp commands", state);
					state.callbacks.onParseError(diagnostic);
				}
				if (expression === undefined) {
					const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
						lineSectionIndex + symbol.length, lineSectionIndex + symbol.length,
						"Missing value to set the variable to", state);
					state.callbacks.onParseError(diagnostic);
				}
				else {
					parseExpression(expression, expressionSectionIndex + state.sectionGlobalIndex, state);
				}
				break;
			case "temp":
				// *temp instantiates variables local to the scene file
				state.callbacks.onLocalVariableCreate(symbol, symbolLocation, state);
				state.createdTempVariables = true;
				if (expression !== undefined) {
					parseExpression(expression, expressionSectionIndex + state.sectionGlobalIndex, state);
				}
				break;
			case "label":
				// *label creates a goto/gosub label local to the scene file.
				state.callbacks.onLabelCreate(symbol, symbolLocation, state);
				// A label's name can't contain spaces and then extra info
				if (expression !== undefined && expression.trim() !== "" && spacing !== undefined) {
					const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
						expressionSectionIndex - spacing.length, expressionSectionIndex,
						"*label names can't have spaces", state);
					state.callbacks.onParseError(diagnostic);
				}
				break;
			case "delete":
			case "rand":
			case "input_text":
			case "input_number":
				// these reference a variable
				state.callbacks.onVariableReference(symbol, symbolLocation, state);
				break;
			default:
				throw Error(`Unexpected command ${command} in parseSymbolManipulatingCommand`);
		}
	}
}

const commandRegex = RegExp(commandPattern);

/**
 * Parse text before an #option.
 * @param preText Text before the #option.
 * @param preTextIndex Index of that text in the global document.
 * @param state Parsing state.
 */
function parseTextBeforeAnOption(preText: string, preTextIndex: number, state: ParsingState): void {
	// Text before an #option must be either a single allowed command or a *_reuse *if set of commands (in that order)
	const m = commandRegex.exec(preText);
	if (!m || m.groups === undefined || !optionAllowedCommandsLookup.has(m.groups.command)) {
		const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
			preTextIndex, preTextIndex + preText.trimRight().length,
			"Only *if, *selectable_if, or one of the reuse commands allowed in front of an option", state);
		state.callbacks.onParseError(diagnostic);
	}
	else if (m.groups.command == "if" || m.groups.command == "selectable_if") {
		// If there's a *(disable|enable|hide)_reuse command in the string, flag that separately & don't parse that bit 
		const mReuse = /(?<=\s|^)\*(disable|enable|hide)_reuse(?=\s|$)/.exec(m.groups.commandLine ?? "");
		if (mReuse !== null) {
			const commandIndex = m.groups.commandPrefix.length;
			const commandLineIndex = commandIndex + 1 + m.groups.command.length + m.groups.commandSpacing?.length ?? 0;
			const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
				preTextIndex + commandLineIndex + mReuse.index,
				preTextIndex + commandLineIndex + mReuse.index + mReuse[0].length,
				`${mReuse[0]} must be before *${m.groups.command}`, state);
			state.callbacks.onParseError(diagnostic);
			// Take the command out of the string
			preText = preText.slice(0, commandLineIndex + mReuse.index)
				+ " ".repeat(m[0].length)
				+ preText.slice(commandLineIndex + mReuse.index + mReuse[0].length);
		}
		// No other commands can come after an "if", so parse it as a single line. Add in a "#"
		// so that the parsing knows it's an *if before an #option
		const oldEnclosingBlock = state.enclosingBlock;
		state.enclosingBlock = "option";
		parseSection(preText + "#fake", state.sectionGlobalIndex + preTextIndex, state);
		state.enclosingBlock = oldEnclosingBlock;
	}
	else {  // *hide_reuse and similar
		// There should be no other text after the *_reuse command other than an *if/*selectable_if
		if (m.groups.commandLine?.trim() ?? "" !== "") {
			const commandIndex = m.groups.commandPrefix.length;
			const commandLineIndex = commandIndex + 1 + m.groups.command.length + m.groups.commandSpacing?.length ?? 0;

			if (m.groups.commandLine.startsWith("*if") || m.groups.commandLine.startsWith("*selectable_if")) {
				const oldEnclosingBlock = state.enclosingBlock;
				state.enclosingBlock = "option";
				parseSection(m.groups.commandLine + "#fake", state.sectionGlobalIndex + commandLineIndex, state);
				state.enclosingBlock = oldEnclosingBlock;
			}
			else {
				const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
					preTextIndex + commandLineIndex,
					preTextIndex + commandLineIndex + m.groups.commandLine.trimRight().length,
					`Nothing except an *if or *selectable_if is allowed between *${m.groups.command} and the #option`, state);
				state.callbacks.onParseError(diagnostic);
			}
		}
	}
}

/**
 * Parse a single line containing an #option.
 * @param text Document text.
 * @param optionLine Line containing the titular option.
 * @param commandIndent Spacing in front of the *choice command.
 * @param optionIndent Number of whitespace characters in front of the #option.
 * @param isTabs True if whitespace in front of lines should be tabs.
 * @param state Parsing state.
 * @returns Text of the option, index of the line containing the option's contents, and the number of whitespace characters for the block.
 */
function parseSingleOptionLine(text: string, optionLine: NewLine, commandIndent: number,
	optionIndent: number, isTabs: boolean, state: ParsingState): { optionText: string; optionContentsIndex: number; blockIndent: number } | undefined {
	if (optionLine.splitLine === undefined) {  // We gotta have some indent
		return undefined;
	}
	const padding = optionLine.splitLine.padding;
	// Bomb out on mixed tabs and spaces
	if (isTabs && / /.test(padding)) {
		const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
			optionLine.index, optionLine.index + padding.length,
			"Spaces used instead of tabs", state);
		state.callbacks.onParseError(diagnostic);
		return undefined;
	}
	else if (!isTabs && /\t/.test(padding)) {
		const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
			optionLine.index, optionLine.index + padding.length,
			"Tabs used instead of spaces", state);
		state.callbacks.onParseError(diagnostic);
		return undefined;
	}
	// Bomb out if our indent level is at or smaller than the *choice command itself
	if (padding.length <= commandIndent) {
		return undefined;
	}

	// Flag problems with indents
	if (padding.length < optionIndent) {
		const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
			optionLine.index, optionLine.index + padding.length,
			"Line is not indented far enough", state);
		state.callbacks.onParseError(diagnostic);
	}
	else if (padding.length > optionIndent) {
		const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
			optionLine.index, optionLine.index + padding.length,
			"Line is indented too far", state);
		state.callbacks.onParseError(diagnostic);
	}

	// The line should either contain an #option or a bare *if statement
	const hashIndex = optionLine.splitLine.contents.indexOf("#");
	if (hashIndex == -1) {
		// This better be an *if statement
		if (optionLine.splitLine.contents.startsWith("*if ")) {
			const oldEnclosingBlock = state.enclosingBlock;
			state.enclosingBlock = "option";
			parseSection(optionLine.line, state.sectionGlobalIndex + optionLine.index, state);
			state.enclosingBlock = oldEnclosingBlock;
			const nextOptionLine = readLine(text, optionLine.index + optionLine.line.length);
			if (nextOptionLine === undefined || nextOptionLine.splitLine === undefined) {
				return undefined;
			}

			if (nextOptionLine.splitLine.padding.length <= optionIndent) {
				const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
					nextOptionLine.index, nextOptionLine.index + nextOptionLine.splitLine.padding.length,
					"Line is not indented far enough", state);
				state.callbacks.onParseError(diagnostic);
				return { optionText: "", optionContentsIndex: optionLine.index + optionLine.line.length, blockIndent: optionIndent };
			}
			else {
				return parseSingleOptionLine(
					text, nextOptionLine, commandIndent,
					nextOptionLine.splitLine.padding.length,
					isTabs, state
				);
			}
		}
		else {
			const startIndex = optionLine.index + (optionLine.splitLine?.padding.length ?? 0);
			const endIndex = optionLine.index + optionLine.line.length;
			const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
				startIndex, endIndex,
				"Must be either an #option or an *if", state);
			state.callbacks.onParseError(diagnostic);
			return { optionText: "", optionContentsIndex: optionLine.index + optionLine.line.length, blockIndent: optionIndent };
		}
	}
	else {
		const optionText = optionLine.splitLine.contents.slice(hashIndex).trim();
		if (hashIndex > 0) {
			// There's text in front of the option. Check it.
			const preText = optionLine.splitLine.contents.slice(0, hashIndex);
			const preTextIndex = optionLine.index + padding.length;
			parseTextBeforeAnOption(preText, preTextIndex, state);
		}
		// Parse the option as if it were a string, since it can have ${references}
		parseBareString(optionText, optionLine.index + optionLine.splitLine.padding.length + hashIndex, optionText.length, state);

		return { optionText: optionText, optionContentsIndex: optionLine.index + optionLine.line.length, blockIndent: optionIndent };
	}
}

/**
 * Parse the contents of a single option.
 * 
 * Returns the last content line and the next line after the contents.
 * Last content line is undefined if there were no contents.
 * Next line is undefined if we had an unrecoverable error or reached the end of the document.
 * @param text Text containing the option.
 * @param optionContentsIndex Index of the option's contents in text.
 * @param optionIndent Number of whitespace characters the option (*not* the contents) is indented.
 * @param isTabs Whether the indention is tabs (as opposed to spaces).
 * @param state Parsing state.
 * @returns Tuple containing the last content line and the next line after the contents.
 */
function parseSingleOptionContents(text: string, optionContentsIndex: number, optionIndent: number,
	isTabs: boolean, state: ParsingState): [NewLine | undefined, NewLine | undefined] {
	let optionContents = "";
	let optionContentsIndent = -1;
	let lastContentLine: NewLine | undefined;
	let nextLine: NewLine | undefined = undefined;
	let lineStart = optionContentsIndex;

	while (true) {
		nextLine = readLine(text, lineStart);
		if (nextLine === undefined) {
			break;
		}

		if (nextLine.line.trim() != "") {
			if (nextLine.splitLine === undefined) {
				break;
			}
			const padding = nextLine.splitLine.padding;
			// Bomb out on a switch from tabs to spaces or vice versa
			if (isTabs && / /.test(padding)) {
				const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
					nextLine.index, nextLine.index + padding.length,
					"Spaces used instead of tabs", state);
				state.callbacks.onParseError(diagnostic);
				// Treat the line as content so we don't try to re-parse
				lastContentLine = nextLine;
				nextLine = undefined;
				break;
			}
			else if (!isTabs && /\t/.test(padding)) {
				const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
					nextLine.index, nextLine.index + padding.length,
					"Tabs used instead of spaces", state);
				state.callbacks.onParseError(diagnostic);
				// Treat the line as content so we don't try to re-parse
				lastContentLine = nextLine;
				nextLine = undefined;
				break;
			}
			if (padding.length <= optionIndent) {
				break;
			}

			if (optionContentsIndent == -1) {
				optionContentsIndent = padding.length;
			}

			// Flag lines that are indented too little
			if (padding.length < optionContentsIndent) {
				const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
					lineStart, lineStart + padding.length,
					"Line is not indented far enough", state);
				state.callbacks.onParseError(diagnostic);
			}
		}
		lastContentLine = nextLine;
		optionContents += lastContentLine.line;
		lineStart += lastContentLine.line.length;
	}

	if (optionContents != "") {
		parseSection(optionContents, state.sectionGlobalIndex + optionContentsIndex, state);
	}

	return [lastContentLine, nextLine];
}

/**
 * Parse the options defined by a *choice or *fake_choice command.
 * @param text Document text to scan.
 * @param command Command that is being parsed.
 * @param commandPadding Spacing before the *choice command.
 * @param commandSectionIndex Index at the start of the *choice command.
 * @param optionsSectionIndex Index at the start of the options.
 * @param state Parsing state.
 * @returns Index at the end of the choice block.
 */
function parseChoice(text: string, command: string, commandPadding: string, commandSectionIndex: number, optionsSectionIndex: number, state: ParsingState): number {
	const isFakeChoice = (command == "fake_choice");
	// commandPadding can include a leading \n, so don't count that
	const commandIndent = commandPadding.replace("\n", "").length;
	let setPaddingType = false;
	let isTabs = /\t/.test(commandPadding);
	let optionIndent = -1;
	let contentsEndIndex: number | undefined = undefined;
	const startGlobalPosition = parsingPositionAt(commandSectionIndex, state);
	let endGlobalPosition: Position;
	const choiceScopes: SummaryScope[] = [];

	// Get the padding type if we can
	if (commandIndent) {
		setPaddingType = true;
		if (isTabs && / /.test(commandPadding)) {
			const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
				commandSectionIndex, commandSectionIndex + commandPadding.length,
				"Tabs and spaces can't be mixed", state);
			state.callbacks.onParseError(diagnostic);
			return optionsSectionIndex;
		}
	}

	// Get the first option and its indent
	let nextLine = readNextNonblankLine(text, optionsSectionIndex);
	if (nextLine === undefined || nextLine.splitLine === undefined || nextLine.splitLine.padding.length <= commandIndent) {
		return optionsSectionIndex;
	}
	if (!setPaddingType) {
		isTabs = /\t/.test(nextLine.splitLine.padding);
		setPaddingType = true;
		if ((isTabs && / /.test(nextLine.splitLine.padding)) || (!isTabs && /\t/.test(nextLine.splitLine.padding))) {
			const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
				nextLine.index, nextLine.index + nextLine.splitLine.padding.length,
				"Tabs and spaces can't be mixed", state);
			state.callbacks.onParseError(diagnostic);
			return optionsSectionIndex;
		}
	}
	optionIndent = nextLine.splitLine.padding.length;

	// Loop over each option until there are no more options
	while (true) {
		if (nextLine === undefined) {
			break;
		}

		const endOptionIndex = nextLine.index + nextLine.line.trimRight().length;
		const parseOptionResults = parseSingleOptionLine(
			text, nextLine, commandIndent, optionIndent, isTabs, state
		);
		if (parseOptionResults === undefined) {  // Something went wrong
			break;
		}

		const optionStartGlobalPosition = parsingPositionAt(nextLine.index, state);
		contentsEndIndex = nextLine.index + nextLine.line.trimRight().length;
		let lastContentLine: NewLine | undefined;
		[lastContentLine, nextLine] = parseSingleOptionContents(text, parseOptionResults.optionContentsIndex, parseOptionResults.blockIndent, isTabs, state);
		if (lastContentLine == undefined) {
			const contentsEndGlobalPosition = parsingPositionAt(endOptionIndex, state);
			// Add this option to the list of scopes, trimming the description if necessary
			choiceScopes.push({
				summary: summarize(parseOptionResults.optionText, 35),
				range: Range.create(optionStartGlobalPosition, contentsEndGlobalPosition)
			});
			// If this is a choice, it has to have contents
			if (!isFakeChoice) {
				const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
					endOptionIndex, endOptionIndex + 1,
					"An option in a *choice must have contents", state);
				state.callbacks.onParseError(diagnostic);
			}
		}
		else {
			contentsEndIndex = lastContentLine.index + lastContentLine.line.trimRight().length;
			const contentsEndGlobalPosition = parsingPositionAt(contentsEndIndex, state);
			// Add this option to the list of scopes, trimming the description if necessary
			choiceScopes.push({
				summary: summarize(parseOptionResults.optionText, 35),
				range: Range.create(optionStartGlobalPosition, contentsEndGlobalPosition)
			});
		}
	}

	if (contentsEndIndex === undefined) {
		contentsEndIndex = optionsSectionIndex;
		endGlobalPosition = parsingPositionAt(commandSectionIndex, state);
	}
	else {
		endGlobalPosition = parsingPositionAt(contentsEndIndex, state);
	}

	const range = Range.create(startGlobalPosition, endGlobalPosition);
	const scope: SummaryScope = { summary: command, range: range };
	state.callbacks.onChoiceScope(scope, state);

	// Add the option scopes
	choiceScopes.forEach(scope => { state.callbacks.onChoiceScope(scope, state); });

	return contentsEndIndex;
}

/**
 * Parse the scenes defined by a *scene_list command.
 * @param text Document text to scan.
 * @param startSectionIndex Index at the start of the scenes.
 * @param state Parsing state.
 */
function parseScenes(text: string, startSectionIndex: number, state: ParsingState): void {
	const sceneList: Array<string> = [];
	const scenePattern = /(\s+)(\$\s+)?(\S+)\s*\r?\n/;
	let lineStart = startSectionIndex;

	// Process the first line to get the indent level and first scene
	let lineEnd = findLineEnd(text, lineStart);
	if (!lineEnd) {
		return;  // No scene found
	}
	let line = text.slice(lineStart, lineEnd);
	let m = scenePattern.exec(line);
	if (!m) {
		return;
	}
	const padding = m[1];
	sceneList.push(m[3]);
	lineStart = lineEnd;

	// Now loop as long as the scene pattern matches and the padding is consistent
	while (true) {
		lineEnd = findLineEnd(text, lineStart);
		if (!lineEnd) {
			break;
		}
		line = text.slice(lineStart, lineEnd);
		m = scenePattern.exec(line);
		if (!m || m[1] != padding) {
			break;
		}
		sceneList.push(m[3]);
		lineStart = lineEnd;
	}

	const startPosition = parsingPositionAt(startSectionIndex, state);
	const endPosition = Position.create(
		startPosition.line + sceneList.length, 0
	);
	const range = Range.create(
		startPosition, endPosition
	);
	const location = Location.create(state.textDocument.uri, range);
	state.callbacks.onSceneDefinition(sceneList, location, state);
}

/**
 * Parse a stat chart.
 * @param text Text to scan.
 * @param commandSectionIndex Index after the "*" in the *stat_chart command.
 * @param contentStartSectionIndex Index at the start of the stat chart contents.
 * @param state Parsing state.
 */
function parseStatChart(text: string, commandSectionIndex: number, contentStartSectionIndex: number, state: ParsingState): void {
	const subcommandPattern = /(?<padding>[ \t]+)(?<command>\S+)((?<spacing>[ \t]*)(?<remainder>.*))?(\r?\n)?/g;
	let lineStart = contentStartSectionIndex;

	// No need to worry about ${} references in the stat chart, as the top-level parser
	// will go back over the lines after the *stat_chart command and process them

	subcommandPattern.lastIndex = lineStart;
	let padding = "NONE";
	let m: RegExpExecArray | null;

	while ((m = subcommandPattern.exec(text))) {
		// m.groups should always exist, but to keep us from having to check types...
		if (!m.groups) {
			continue;
		}
		if (m.index !== lineStart) {
			break;
		}
		if (padding == "NONE") {
			padding = m.groups.padding;
		}
		else if (m.groups.padding.length < padding.length) {
			break;
		}
		else if (m.groups.padding != padding) {
			const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
				m.index, m.index + m[0].length,
				"Line is indented too far.", state);
			state.callbacks.onParseError(diagnostic);
			break;
		}

		const command = m.groups.command;
		const commandStart = m.index + padding.length;

		if (statChartCommands.includes(command)) {
			const spacing = m.groups.spacing;
			if (spacing === undefined) {
				const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
					commandStart, commandStart + command.length,
					`Missing variable after ${command}`, state);
				state.callbacks.onParseError(diagnostic);
			}
			else {
				const remainderStart = commandStart + command.length + spacing.length;
				const variable = extractTokenAtIndex(text, remainderStart);
				if (variable === undefined) {
					const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
						remainderStart, remainderStart,
						"Not a valid variable.", state);
					state.callbacks.onParseError(diagnostic);
				}
				else if (variable[0] == '{') {
					parseExpression(variable?.slice(1, -1), remainderStart + 1 + state.sectionGlobalIndex, state);
				}
				else {
					const location = createParsingLocation(remainderStart, remainderStart + variable.length, state);
					state.callbacks.onVariableReference(variable, location, state);
				}
			}

			if (statChartBlockCommands.includes(command)) {
				// Consume any sub-indented lines
				lineStart = subcommandPattern.lastIndex;
				while (lineStart < text.length) {
					const nextLineStart = findLineEnd(text, lineStart);
					if (nextLineStart === undefined) {
						break;
					}
					const line = text.slice(lineStart, nextLineStart);
					const paddingMatch = line.match(/^(?<padding>\s+)/);
					if (!paddingMatch || !paddingMatch.groups || paddingMatch.groups.padding.length <= padding.length) {
						break;
					}
					lineStart = nextLineStart;
				}
				subcommandPattern.lastIndex = lineStart;
			}
		}
		else {
			const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
				commandStart, commandStart + command.length,
				`Must be one of ${statChartCommands.join(", ")}`, state);
			state.callbacks.onParseError(diagnostic);
		}

		lineStart = subcommandPattern.lastIndex;
	}

	if (lineStart == contentStartSectionIndex) {
		const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
			commandSectionIndex - 1, commandSectionIndex + "stat_chart".length,
			`*stat_chart must have at least one stat`, state);
		state.callbacks.onParseError(diagnostic);
	}
}

/**
 * Validate an expression that's being tested for true/falseness.
 * 
 * @param tokenizedExpression The expression that's being tested.
 * @param state Parsing state.
 */
function validateConditionExpression(tokenizedExpression: Expression, state: ParsingState): void {
	if (tokenizedExpression.evalType != ExpressionEvalType.Boolean &&
		tokenizedExpression.evalType != ExpressionEvalType.Empty &&
		tokenizedExpression.evalType != ExpressionEvalType.Unknowable) {
		const lastToken = tokenizedExpression.combinedTokens[tokenizedExpression.combinedTokens.length - 1];
		const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
			tokenizedExpression.globalIndex + tokenizedExpression.combinedTokens[0].index,
			tokenizedExpression.globalIndex + lastToken.index + lastToken.text.length,
			"Must be a boolean value",
			state);
		state.callbacks.onParseError(diagnostic);
	}
}

/**
 * Parse a command that can reference variables, such as *if.
 * @param command ChoiceScript command, such as "if", that may contain a reference.
 * @param line The rest of the line after the command.
 * @param lineSectionIndex Index at the start of the line.
 * @param state Parsing state.
 */
function parseVariableReferenceCommand(command: string, line: string, lineSectionIndex: number, state: ParsingState): void {
	let optionOnLineWithIf = false;
	// The *if and *selectable_if commands can be used with options, so take that into account
	if (command == "if" || command == "selectable_if") {
		const choiceSplit = line.split('#');
		if (choiceSplit.length > 1) {
			line = choiceSplit[0];
			optionOnLineWithIf = true;
		}
	}
	// The line that follows a command that can reference a variable is an expression
	const tokenizedExpression = parseExpression(line, lineSectionIndex + state.sectionGlobalIndex, state);
	if (tokenizedExpression.evalType != ExpressionEvalType.Error) {
		validateConditionExpression(tokenizedExpression, state);
	}

	// For an *if on the line with an #option, we need to perform extra checks.
	if (optionOnLineWithIf) {
		const tokenizedExpressionSectionIndex = tokenizedExpression.globalIndex - state.sectionGlobalIndex;
		// *if not(var) #option will always be true and needs parentheses
		if (booleanFunctionsLookup.has(tokenizedExpression.tokens[0].text) &&
			tokenizedExpression.evalType == ExpressionEvalType.Boolean) {
			const lastToken = tokenizedExpression.combinedTokens[tokenizedExpression.combinedTokens.length - 1];
			const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Warning,
				tokenizedExpressionSectionIndex + tokenizedExpression.combinedTokens[0].index,
				tokenizedExpressionSectionIndex + lastToken.index + lastToken.text.length,
				"Without parentheses, this expression will always be true",
				state);
			state.callbacks.onParseError(diagnostic);
		}
		// In fact, everything has to be in parentheses for an *if on the line with an #option
		else if (tokenizedExpression.combinedTokens.length > 1 || tokenizedExpression.combinedTokens[0].type != ExpressionTokenType.Parentheses) {
			const lastToken = tokenizedExpression.combinedTokens[tokenizedExpression.combinedTokens.length - 1];
			const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Warning,
				tokenizedExpressionSectionIndex,
				tokenizedExpressionSectionIndex + lastToken.index + lastToken.text.length,
				`Arguments to ${command == "selectable_if" ? "a" : "an"} *${command} before an #option must be in parentheses`,
				state);
			state.callbacks.onParseError(diagnostic);
		}
	}
}

/**
 * 
 * @param text Document text to scan.
 * @param command Command that is being parsed.
 * @param commandPadding: Spacing before the *if command.
 * @param commandSectionIndex Index at the start of the *if command.
 * @param line The rest of the line following the *if command
 * @param lineSectionIndex Index to the rest of the line
 * @param contentsIndex Index at the start of the *if block contents.
 * @param state Parsing state.
 * @returns Index at the end of the choice block.
 */
function parseIfBlock(text: string, command: string, commandPadding: string, commandSectionIndex: number, line: string, lineSectionIndex: number, contentsIndex: number, state: ParsingState): number {
	// commandPadding can include a leading \n, so don't count that
	const commandIndent = commandPadding.replace("\n", "").length;

	// Parse the command itself
	parseVariableReferenceCommand(command, line, lineSectionIndex, state);

	// Parse the block's contents
	const blockContents = extractToMatchingIndent(text, commandIndent, contentsIndex);
	if (blockContents.trim() == "" && state.enclosingBlock != "option") {
		const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
			lineSectionIndex + line.length, lineSectionIndex + line.length,
			`*${command} must have an indented line with contents after it.`, state);
		state.callbacks.onParseError(diagnostic);
	}
	else {
		parseSection(blockContents, state.sectionGlobalIndex + contentsIndex, state);
	}

	// As long as we have a next line w/an equal indent and it has an *elseif or an *else, keep going!
	let nextLine: NewLine | undefined;
	let m: RegExpExecArray | null;
	let currentIndex = contentsIndex + blockContents.length;
	while (true) {
		nextLine = readNextNonblankLine(text, currentIndex);
		// The next line must exist and be a command
		if (nextLine === undefined || !(m = commandRegex.exec(nextLine.line))) {
			break;
		}
		// It must have the same indent
		if ((nextLine.splitLine?.padding.length ?? 0) != commandIndent) {
			break;
		}
		// It must be an elseif, elsif, or else
		if (m.groups === undefined || (m.groups.command != "elseif" && m.groups.command != "elsif" && m.groups.command != "else")) {
			break;
		}

		const newCommand = m.groups.command;
		const newCommandIndex = nextLine.index + (m.groups.commandPrefix?.length ?? 0) + 1;
		const newCommandSpacing = m.groups.commandSpacing || "";
		const newCommandLine = m.groups.commandLine || "";
		const newCommandLineIndex = newCommandIndex + newCommand.length + newCommandSpacing.length;

		// Check the command for errors
		checkCommandArgumentContents(newCommand, newCommandIndex, newCommandLine, newCommandLineIndex, state);

		// Parse the command if needed
		if (m.groups.command == "elseif" || m.groups.command == "elsif") {
			parseVariableReferenceCommand(newCommand, newCommandLine, newCommandLineIndex, state);
		}

		// Parse the block
		contentsIndex = nextLine.index + nextLine.line.length;
		currentIndex = contentsIndex;
		const blockContents = extractToMatchingIndent(text, commandIndent, contentsIndex);
		if (blockContents.trim() == "") {
			const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
				newCommandLineIndex + newCommandLine.length,
				newCommandLineIndex + newCommandLine.length,
				`*${newCommand} must have an indented line with contents after it.`, state);
			state.callbacks.onParseError(diagnostic);
		}
		else {
			parseSection(blockContents, state.sectionGlobalIndex + contentsIndex, state);
		}

		currentIndex += blockContents.length;

		if (m.groups.command == "else") {
			break;
		}
	}

	// If we didn't bomb out on account of reaching the end of the file, back the index up one
	// to before the \n of the previous line, so the parsing regex will work properly
	if (nextLine !== undefined) {
		currentIndex--;
	}

	return currentIndex;
}

/**
 * Parse a command that references labels, such as *goto.
 * @param command Command.
 * @param commandSectionIndex: Index of the command in the section being parsed.
 * @param line Line after the command.
 * @param lineSectionIndex Index of the line in the section being parsed.
 * @param state Parsing state.
 */
function parseFlowControlCommand(command: string, commandSectionIndex: number, line: string, lineSectionIndex: number, state: ParsingState): void {
	const commandLocation = createParsingLocation(commandSectionIndex, commandSectionIndex + command.length, state);
	let label = "";
	let scene = "";
	let labelLocation: Location | undefined = undefined;
	let sceneLocation: Location | undefined = undefined;

	if (command != "return") {
		let firstToken = "";
		let secondToken = "";
		let secondTokenLocalIndex = 0;
		let remainderLine = "";
		let remainderLineLocalIndex = 0;
		const sceneCommand = command.endsWith("_scene");

		let tokenDelimiters = "\\w-"
		// If it's a scene command, then the first token is a scene file (word characters + dash). Otherwise, it's a label (non-space characters)
		if (!sceneCommand) {
			tokenDelimiters = "\\S";
		}
		// Get the first token, which may be a {} reference
		let token = extractTokenAtIndex(line, 0, "{}", tokenDelimiters);
		firstToken = (token !== undefined) ? token : "";
		if (firstToken != "") {
			remainderLineLocalIndex = firstToken.length;
			remainderLine = line.substring(remainderLineLocalIndex);
		}

		// Evaluate first token expression (if any)
		if (firstToken != "" && firstToken[0] == '{') {
			parseExpression(firstToken.slice(1, -1), state.sectionGlobalIndex + lineSectionIndex + 1, state);
		}

		if (sceneCommand) {
			// There's a optional second token
			const m = remainderLine.match(/^(?<spacing>[ \t]+)/);
			if (m !== null && m.groups !== undefined) {
				const spacing = m.groups.spacing;
				token = extractTokenAtIndex(remainderLine, spacing.length, undefined, "\\S");
				secondToken = (token !== undefined) ? token : "";
				secondTokenLocalIndex = remainderLineLocalIndex + spacing.length;
				remainderLineLocalIndex = secondTokenLocalIndex + secondToken.length;
				remainderLine = remainderLine.substring(spacing.length + secondToken.length);
			}

			scene = firstToken;
			sceneLocation = createParsingLocation(lineSectionIndex, lineSectionIndex + scene.length, state);

			if (secondToken != "") {
				// Parse the second token if necessary
				if (secondToken[0] == '{') {
					parseExpression(secondToken.slice(1, -1), lineSectionIndex + secondTokenLocalIndex + 1, state);
				}
				label = secondToken;
				const labelIndex = lineSectionIndex + secondTokenLocalIndex;
				labelLocation = createParsingLocation(labelIndex, labelIndex + label.length, state);
			}
		}
		else {
			label = firstToken;
			labelLocation = createParsingLocation(lineSectionIndex, lineSectionIndex + label.length, state);
		}

		if (command.startsWith("gosub") && remainderLine.trim() != "") {
			// Handle potential parameters by tokenizing them as if they were an expression, but then consider them
			// one at a time
			const remainderLineGlobalIndex = lineSectionIndex + remainderLineLocalIndex + state.sectionGlobalIndex;
			const expression = new Expression(remainderLine, remainderLineGlobalIndex, state.textDocument);
			for (const token of expression.combinedTokens) {
				// Let the expression parsing handle each token
				parseExpression(token.text, token.index + remainderLineGlobalIndex, state);
			}
		}
	}

	state.callbacks.onFlowControlEvent(command, commandLocation, label, scene, labelLocation, sceneLocation, state);
}

/**
 * Parse an achievement.
 * @param codename Achievement's codename
 * @param startSectionIndex Index at the start of the codename.
 * @param state Parsing state.
 */
function parseAchievement(codename: string, startSectionIndex: number, state: ParsingState): void {
	const location = createParsingLocation(startSectionIndex, startSectionIndex + codename.length, state);
	state.callbacks.onAchievementCreate(codename, location, state);
}

/**
 * Parse an achievement reference.
 * @param codename Achievement's codename
 * @param startSectionIndex Index at the start of the codename.
 * @param state Parsing state.
 */
function parseAchievementReference(codename: string, startSectionIndex: number, state: ParsingState): void {
	const location = createParsingLocation(startSectionIndex, startSectionIndex + codename.length, state);
	state.callbacks.onAchievementReference(codename, location, state);
}

/**
 * Check a command to see if its arguments are incorrect
 * @param command Command to check.
 * @param commandSectionIndex Location of the command in the document section.
 * @param commandLine Line after the command.
 * @param commandLineSectionIndex Location of the line in the document section.
 * @param state Parsing state.
 * @returns False if the command's arguments are wrong and there's no need to continue parsing; true otherwise.
 */
function checkCommandArgumentContents(command: string, commandSectionIndex: number, commandLine: string, commandLineSectionIndex: number, state: ParsingState): boolean {
	if (argumentRequiredCommandsLookup.has(command) && commandLine.trim() == "") {
		const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
			commandSectionIndex, commandSectionIndex + command.length,
			`Command *${command} is missing its arguments.`, state);
		state.callbacks.onParseError(diagnostic);
		return false;
	}

	if (argumentDisallowedCommandsLookup.has(command) && commandLine.trim() != "") {
		const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
			commandLineSectionIndex, commandLineSectionIndex + commandLine.length,
			`Command *${command} must not have anything after it.`, state);
		state.callbacks.onParseError(diagnostic);
		return false;
	}

	if (argumentIgnoredCommandsLookup.has(command) && commandLine.trim() != "") {
		const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Warning,
			commandLineSectionIndex, commandLineSectionIndex + commandLine.length,
			`This will be ignored.`, state);
		state.callbacks.onParseError(diagnostic);
	}

	return true;
}

/**
 * Parse a command line.
 * 
 * @param document Document being parsed.
 * @param prefix Spaces before the command.
 * @param command Command.
 * @param spacing Spaces after the command, if any.
 * @param line The rest of the line after the command, if any.
 * @param commandSectionIndex Index of the command in the section being parsed.
 * @param state Parsing state.
 */
function parseCommand(document: string, prefix: string, command: string, spacing: string, line: string, commandSectionIndex: number, state: ParsingState): number {
	const lineSectionIndex = commandSectionIndex + command.length + spacing.length;
	// By default a command's parsing ends at the end of the line
	let endParseIndex = lineSectionIndex + line.length;

	const commandLocation = createParsingLocation(commandSectionIndex, commandSectionIndex + command.length, state);

	state.callbacks.onCommand(prefix, command, spacing, line, commandLocation, state);

	if (!validCommandsLookup.has(command)) {
		const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
			commandSectionIndex, commandSectionIndex + command.length,
			`Command *${command} isn't a valid ChoiceScript command.`, state);
		state.callbacks.onParseError(diagnostic);
		return endParseIndex;  // Short-circuit: Nothing more to be done
	}

	if (startupCommandsLookup.has(command) && !uriIsStartupFile(state.textDocument.uri)) {
		const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
			commandSectionIndex, commandSectionIndex + command.length,
			`Command *${command} can only be used in startup.txt.`, state);
		state.callbacks.onParseError(diagnostic);
	}

	if (!checkCommandArgumentContents(command, commandSectionIndex, line, lineSectionIndex, state)) {
		return endParseIndex;
	}

	if (insideBlockCommandsLookup.has(command)) {
		if ((command == "selectable_if" && state.enclosingBlock !== "option") ||
			(command != "selectable_if" && state.enclosingBlock !== "if")) {
			const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
				commandSectionIndex, commandSectionIndex + command.length,
				`Command *${command} must be ${(command == "selectable_if" ? "in front of an #option" : "part of an *if command block")}.`,
				state);
			state.callbacks.onParseError(diagnostic);
		}
	}

	if (command == "if") {
		const nextLineIndex = findLineEnd(document, commandSectionIndex);
		endParseIndex = parseIfBlock(document, command, prefix, commandSectionIndex, line, lineSectionIndex, nextLineIndex, state);
	}
	else if (symbolManipulationCommandsLookup.has(command)) {
		parseSymbolManipulationCommand(command, commandSectionIndex, line, lineSectionIndex, state);
	}
	else if (variableReferenceCommandsLookup.has(command)) {
		parseVariableReferenceCommand(command, line, lineSectionIndex, state);
	}
	else if (flowControlCommandsLookup.has(command)) {
		parseFlowControlCommand(command, commandSectionIndex, line, lineSectionIndex, state);
	}
	else if (command == "choice" || command == "fake_choice") {
		const nextLineIndex = findLineEnd(document, commandSectionIndex);
		if (nextLineIndex !== undefined) {
			endParseIndex = parseChoice(document, command, prefix, commandSectionIndex, nextLineIndex, state);
		}
	}
	else if (command == "bug" || command == "page_break") {
		// Both *bug and *page_break commands treat the rest of the line as regular text output, which may contain variable references
		parseBareString(line, lineSectionIndex, line.length, state);
	}
	else if (command == "scene_list") {
		const nextLineIndex = findLineEnd(document, commandSectionIndex);
		if (nextLineIndex !== undefined) {
			parseScenes(document, nextLineIndex, state);
		}
	}
	else if (command == "stat_chart") {
		const nextLineIndex = findLineEnd(document, commandSectionIndex);
		if (nextLineIndex !== undefined) {
			parseStatChart(document, commandSectionIndex, nextLineIndex, state);
		}
	}
	else if (command == "achievement") {
		const codenameMatch = line.match(/^\S+/);
		if (codenameMatch) {
			const codename = codenameMatch[0];
			parseAchievement(codename, lineSectionIndex, state);
		}
	}
	else if (command == "achieve") {
		const codenameMatch = line.match(/^\S+/);
		if (codenameMatch) {
			const codename = codenameMatch[0];
			parseAchievementReference(codename, lineSectionIndex, state);
		}
	}

	return endParseIndex;
}

const sectionParsingGlobalRegex = RegExp(`${commandPattern}|${replacementStartPattern}|${multiStartPattern}|${optionPattern}`, 'g');

/**
 * Parse a section of a ChoiceScript document
 * 
 * @param section Section of the document.
 * @param sectionGlobalIndex Index of the section in the document.
 * @param state Parsing state.
 */
function parseSection(section: string, sectionGlobalIndex: number, state: ParsingState): void {
	// Since we recursively parse sections, save off the old section index
	// and put the new one in the parsing state. Also do the same for the section-parsing regex
	const oldSectionIndex = state.sectionGlobalIndex;
	state.sectionGlobalIndex = sectionGlobalIndex;
	const oldPatternLastIndex = sectionParsingGlobalRegex.lastIndex;
	sectionParsingGlobalRegex.lastIndex = 0;

	let m: RegExpExecArray | null;

	while ((m = sectionParsingGlobalRegex.exec(section))) {
		if (m.groups === undefined) {
			continue;
		}

		// Pattern options: command, replacement (${}), multi (@{}), option (#)
		if (m.groups.command) {
			const command = m.groups.command;
			const prefix = m.groups.commandPrefix ? m.groups.commandPrefix : "";
			const spacing = m.groups.commandSpacing ? m.groups.commandSpacing : "";
			const line = m.groups.commandLine ? m.groups.commandLine : "";
			const commandIndex = m.index + prefix.length + 1;
			// Command parsing occasionally consumes more than one line
			const endIndex = parseCommand(section, prefix, command, spacing, line, commandIndex, state);
			sectionParsingGlobalRegex.lastIndex = endIndex;
		}
		else if (m.groups.replacement) {
			const subsectionIndex = m.index + m[0].length;
			// Since the match doesn't consume the whole replacement, jigger the pattern's last index by hand
			const endIndex = parseReplacement(section, m[0].length, subsectionIndex, undefined, state);
			sectionParsingGlobalRegex.lastIndex = endIndex;
		}
		else if (m.groups.multi) {
			const subsectionIndex = m.index + m[0].length;
			// Since the match doesn't consume the whole replacement, jigger the pattern's last index by hand
			const endIndex = parseMultireplacement(section, m[0].length, subsectionIndex, undefined, state);
			sectionParsingGlobalRegex.lastIndex = endIndex;
		}
		else if (m.groups.option) {
			// An option outside a *choice isn't allowed, so mark it as an error
			const optionIndex = m.index + m[0].length - m.groups.option.length;
			const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
				optionIndex, optionIndex + 1,
				"An #option must only appear inside a *choice or *fake_choice (check that indention is correct)",
				state);
			state.callbacks.onParseError(diagnostic);
			// The match consumes the entire line, so back up the index to just after the "#"
			sectionParsingGlobalRegex.lastIndex = optionIndex + 1;
		}
	}

	sectionParsingGlobalRegex.lastIndex = oldPatternLastIndex;
	state.sectionGlobalIndex = oldSectionIndex;
}

const markupGlobalRegex = RegExp(markupPattern, 'g');
const optionGlobalRegex = RegExp(optionPattern, 'g');
const commandLineGlobalRegex = RegExp(commandPattern, 'g');
const replacementMultiStartGlobalRegex = RegExp(`${replacementStartPattern}|${multiStartPattern}`, 'g');

/**
 * Count the number of words in a section of the document.
 * 
 * Skips commands and properly deals with multireplaces.
 * @param section Section of the document to count words on.
 * @param textDocument TextDocument the section comes from.
 */
export function countWords(section: string, textDocument: TextDocument): number {
	// Get rid of every bit of markup
	const oldMarkupLastIndex = markupGlobalRegex.lastIndex;
	markupGlobalRegex.lastIndex = 0;
	section = section.replace(markupGlobalRegex, "");
	markupGlobalRegex.lastIndex = oldMarkupLastIndex;

	// Get rid of every leading option character & allowed commands
	// (so that we don't mis-count "# I'm an option!" as having 4 words
	// or miss options that have an *if in front of them)
	// Keep the leading newline (if it exists)
	const oldOptionLastIndex = optionGlobalRegex.lastIndex;
	optionGlobalRegex.lastIndex = 0;
	// The option regex eats the leading newline, so put it back in
	section = section.replace(optionGlobalRegex, "\n$<optionContents>");
	optionGlobalRegex.lastIndex = oldOptionLastIndex;

	// Get rid of every line that's a command
	// Keep the leading newline (if it exists)
	const oldCommandLineLastIndex = commandLineGlobalRegex.lastIndex;
	commandLineGlobalRegex.lastIndex = 0;
	section = section.replace(commandLineGlobalRegex, "$1");
	commandLineGlobalRegex.lastIndex = oldCommandLineLastIndex;

	// Go through and reduce each multi pattern or replacement to its equivalent words
	const oldReplacementMultiLastIndex = replacementMultiStartGlobalRegex.lastIndex;
	replacementMultiStartGlobalRegex.lastIndex = 0;
	let m: RegExpExecArray | null;
	const portions = [];
	let lastIndex = 0;

	while ((m = replacementMultiStartGlobalRegex.exec(section))) {
		if (m.groups === undefined) {
			continue;
		}

		portions.push(section.slice(lastIndex, m.index));

		if (m.groups.replacement) {
			const replacement = extractToMatchingDelimiter(section, '{', '}', m.index + m[0].length);
			if (replacement !== undefined) {
				replacementMultiStartGlobalRegex.lastIndex += replacement.length;
			}
		}
		else if (m.groups.multi) {
			const contentsIndex = m.index + m[0].length;
			const multiTokens = tokenizeMultireplace(section, textDocument, contentsIndex, contentsIndex);
			if (multiTokens !== undefined) {
				for (let i = 0, len = multiTokens.body.length; i < len; i++) {
					let text = multiTokens.body[i].text;
					if (i > 0) {
						// Add space so we count multi-replace portions properly
						text = ` ${text}`;
					}
					portions.push(text);
				}
				replacementMultiStartGlobalRegex.lastIndex = multiTokens.endIndex;
			}
		}

		lastIndex = replacementMultiStartGlobalRegex.lastIndex;
	}
	portions.push(section.slice(lastIndex));
	replacementMultiStartGlobalRegex.lastIndex = oldReplacementMultiLastIndex;

	// Rejoin the portions
	section = portions.join("").trim();

	// Special case the empty string
	if (section === "") {
		return 0;
	}

	return section.trim().split(/\s+/).length;
}

/**
 * Parse a ChoiceScript document.
 * 
 * @param textDocument Document to parse.
 * @param callbacks Parser event callbacks.
 * @returns Number of words in the document.
 */
export function parse(textDocument: TextDocument, callbacks: ParserCallbacks): number {
	const state = new ParsingState(textDocument, callbacks);
	const text = textDocument.getText();

	parseSection(text, 0, state);

	return countWords(text, textDocument);
}
