import { Range, Location, Position, type Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';

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
	type NewLine,
	summarize,
	extractToMatchingIndent,
	normalizeUri
} from './utilities';
import type { SummaryScope } from '.';


const nonWordOperators: readonly string[] = mathOperators.concat(comparisonOperators, stringOperators);


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
	onAchievementCreate(codename: string, location: Location, points: number, title: string, state: ParsingState): void;
	onAchievementReference(codename: string, location: Location, state: ParsingState): void;
	onChoiceScope(scope: SummaryScope, state: ParsingState): void;
	onImage(symbol: string, location: Location, state: ParsingState): void;
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
	 * Document's normalized URI.
	 */
	textDocumentUri: string;
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

	_enclosingBlockStack: string[];


	constructor(textDocument: TextDocument, callbacks: ParserCallbacks) {
		this.textDocument = textDocument;
		this.textDocumentUri = normalizeUri(textDocument.uri);
		this.sectionGlobalIndex = 0;
		this.callbacks = callbacks;
		this.createdTempVariables = false;
		this._enclosingBlockStack = [];
	}

	/**
	 * Called when entering a new block.
	 */
	enterBlock(block: string): void {
		if (this.enclosingBlock !== undefined) {
			this._enclosingBlockStack.push(this.enclosingBlock);
		}
		this.enclosingBlock = block;
	}

	/**
	 * Called when exiting a block.
	 * 
	 * @returns The new enclosing block, if any.
	 */
	exitBlock(): string | undefined {
		this.enclosingBlock = this._enclosingBlockStack.pop();
		return this.enclosingBlock;
	}
}

/**
 * Information about a group of #options.
 */
interface OptionGroupInfo {
	name: string  // Group's name
	ifText: (string | undefined)[]  // Text of any *if/*selectable_if statements
	optionText: string[]  // Text of each option
	complete: boolean  // Whether we've got a complete group yet or not
}

/**
 * Information about an #option line (including any associated *if statements on their own line)
 */
interface OptionLineInfo {
	lineIndex: number  // Index of the whole option line relative to the parsing state
	optionIndex: number  // Index of the option text, including "#", relative to the parsing state
	optionIndent: number  // Count of whitespace in front of the option
	optionText: string  // Text of the option, not including "#"
	ifIndents: number[]  // Count of whitespace in front of *if statements that are on their own line
	ifText: string | undefined  // Text of *if statements (not including `*if`)
	ifTextStartIndex: number  // Index of the start of *if statements' text relative to the parsing state
	nextLineIndex: number  // Index to the next line after the option
}

/**
 * Information about a choice block.
 */
interface ChoiceInfo {
	commandIndent: number  // How far the *choice/*fake_choice command is indented
	isFakeChoice: boolean  // Whether this is a *fake_choice or not
	isTabs: boolean  // Whether indented using tabs or spaces
	groupInfo: OptionGroupInfo[]  // Information about the choice's option groups
	choiceScopes: SummaryScope[]  // Scopes of choices contained in the block
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
	return Location.create(state.textDocumentUri, Range.create(
		parsingPositionAt(start, state), parsingPositionAt(end, state)
	));
}

/**
 * Verify that a whitespace string has only tabs (or spaces).
 * 
 * @param index Index to the start of the whitespace.
 * @param padding Whitespace.
 * @param isTabs Whether the whitespace should be tabs or spaces.
 * @param state Parsing state.
 * @returns True if no whitespace error was encountered, false otherwise.
 */
function validIndentWhitespace(index: number, padding: string, isTabs: boolean, state: ParsingState): boolean {
	let diagnostic: Diagnostic | undefined;

	if (isTabs && / /.test(padding)) {
		diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
			index, index + padding.length,
			"Spaces used instead of tabs", state);
		
	}
	else if (!isTabs && /\t/.test(padding)) {
		diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
			index, index + padding.length,
			"Tabs used instead of spaces", state);
	}

	if (diagnostic !== undefined) {
		state.callbacks.onParseError(diagnostic);
		return false;
	}

	return true;
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
// This is a bit of a hack: I want to glue all non-word operators together for a regex, but some
// are regex special characters, like ^ and *. So stick backslashes in front of all of them.
const nonWordOperatorsStartsWithRegex = RegExp("^(\\"+nonWordOperators.join("|\\")+")");

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
					tokens.body[0].text.trim() !== "" &&
					tokens.bareTest.localIndex + tokens.bareTest.text.length == tokens.body[0].localIndex
				) {
					let errorStart, errorEnd, errorTypeMsg;
					if (tokens.bareTest.text.endsWith(")")) {
						errorStart = tokens.body[0].localIndex - 1 + textToSectionDelta;
						errorEnd = tokens.body[0].localIndex + textToSectionDelta;
						errorTypeMsg = "parentheses";
					}
					else {
						errorStart = localIndex + textToSectionDelta;
						errorEnd = tokens.body[0].localIndex + tokens.body[0].text.split(' ')[0].length + textToSectionDelta;
						errorTypeMsg = "its variable";
					}
					const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
						errorStart,
						errorEnd,
						`Multireplace must have a space after ${errorTypeMsg}`,
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
					if (nonWordOperatorsStartsWithRegex.test(firstText)) {
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
		let linePattern = /(?<symbol>\w+)((?<spacing>\s+?)(?<expression>.+))?/;
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
				if (state.createdTempVariables && uriIsStartupFile(state.textDocumentUri)) {
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
 * @param preTextIndex Index of that text in the current parsing state.
 * @param state Parsing state.
 * @returns The contents of any inline *if statement in the text, or undefined if none.
 */
function parseTextBeforeAnOption(preText: string, preTextIndex: number, state: ParsingState): { ifText: string | undefined, ifTextRelativeIndex: number } {
	let ifText: string | undefined = undefined;
	let ifTextRelativeIndex = -1;

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
			const commandLineIndex = commandIndex + 1 + m.groups.command.length + (m.groups.commandSpacing?.length ?? 0);
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
		// Save off our *if contents to return
		ifText = preText.slice(m.groups.command.length+1).trim();
		ifTextRelativeIndex = preText.indexOf(ifText);

		// No other commands can come after an "if", so parse it as a single line. Add in a "#"
		// so that the parsing knows it's an *if before an #option
		state.enterBlock("option");
		parseSection(preText + "#fake", state.sectionGlobalIndex + preTextIndex, state);
		state.exitBlock();
	}
	else {  // *hide_reuse and similar
		// There should be no other text after the *_reuse command other than an *if/*selectable_if
		if (m.groups.commandLine?.trim() ?? "" !== "") {
			const commandIndex = m.groups.commandPrefix.length;
			const commandLineIndex = commandIndex + 1 + m.groups.command.length + (m.groups.commandSpacing?.length ?? 0);

			if (m.groups.commandLine.startsWith("*if") || m.groups.commandLine.startsWith("*selectable_if")) {
				state.enterBlock("option");
				parseSection(m.groups.commandLine + "#fake", state.sectionGlobalIndex + preTextIndex + commandLineIndex, state);
				state.exitBlock();
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

	return { ifText, ifTextRelativeIndex };
}

/**
 * Parse a single #option line, including any associated *if statements on their own line.
 * 
 * @param text Document text.
 * @param choiceInfo Information about the choice block.
 * @param optionLine Line containing the titular opton.
 * @param state Parsing state
 * @returns Information about the option line.
 */
function parseSingleOptionLine(
	text: string, choiceInfo: ChoiceInfo, optionLine: NewLine, state: ParsingState
): OptionLineInfo | undefined {
	if (optionLine.splitLine === undefined) {  // We gotta have some indent
		return undefined;
	}
	// Bomb out on mixed tabs and spaces
	if (!validIndentWhitespace(optionLine.index, optionLine.splitLine.padding, choiceInfo.isTabs, state)) {
		return undefined;
	}
	// Bomb out if our indent level is at or smaller than the *choice command itself
	if (optionLine.splitLine.padding.length <= choiceInfo.commandIndent) {
		return undefined;
	}

	const optionLineStartIndex = optionLine.index;
	const ifIndents: number[] = [];
	let ifText: string | undefined;
	let ifTextStartIndex = -1;

	// Line should either contain an #option or a bare *if statement
	let hashIndex = optionLine.splitLine.contents.indexOf("#");
	while (hashIndex == -1) {
		// This better be an *if statement
		if (optionLine.splitLine.contents.startsWith("*if ")) {
			// If there are multiple *if statements, each needs to be indented from the previous
			if ((ifIndents.length > 0) && (optionLine.splitLine.padding.length <= ifIndents[ifIndents.length-1])) {
				const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
					optionLine.index, optionLine.index + optionLine.splitLine.padding.length,
					"Line is not indented far enough", state);
				state.callbacks.onParseError(diagnostic);
			}
			else {
				ifIndents.push(optionLine.splitLine.padding.length);
			}

			const currentIfText = optionLine.splitLine.contents.replace(/\*if\s+/, '').trim();
			if (ifText === undefined) {
				ifText = currentIfText;
				ifTextStartIndex = optionLine.index + optionLine.splitLine.padding.length + optionLine.splitLine.contents.indexOf(currentIfText);
			}
			else {
				// A hacky for-now way to handle multiple nested if statements
				ifText += "~" + currentIfText;
			}

			state.enterBlock("option");
			parseSection(optionLine.line, state.sectionGlobalIndex + optionLine.index, state);
			state.exitBlock();

			const nextOptionLine = readLine(text, optionLine.index + optionLine.line.length);
			if (nextOptionLine === undefined) {
				return undefined;
			}
			optionLine = nextOptionLine;
			if (optionLine.splitLine === undefined) {  // This works as a type guard, so don't combine w/the above nextOptionLine check
				return undefined;
			}
			hashIndex = optionLine.splitLine.contents.indexOf("#");
		}
		else {
			const startIndex = optionLine.index + optionLine.splitLine.padding.length;
			const endIndex = optionLine.index + optionLine.line.length;
			const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
				startIndex, endIndex,
				"Must be either an #option or an *if", state);
			state.callbacks.onParseError(diagnostic);
			return {
				lineIndex: optionLineStartIndex,
				optionIndex: startIndex,
				optionIndent: optionLine.splitLine.padding.length,
				optionText: "",
				ifIndents: ifIndents,
				ifText: ifText,
				ifTextStartIndex: ifTextStartIndex,
				nextLineIndex: optionLine.index + optionLine.line.length
			};
		}
	}

	const optionText = optionLine.splitLine.contents.slice(hashIndex).trim();
	if (hashIndex > 0) {
		// There's text in front of the option. Check it.
		const preText = optionLine.splitLine.contents.slice(0, hashIndex);
		const preTextIndex = optionLine.index + optionLine.splitLine.padding.length;
		const preTextIfInformation = parseTextBeforeAnOption(preText, preTextIndex, state);
		if (preTextIfInformation.ifText !== undefined) {
			if (ifText === undefined) {
				ifText = preTextIfInformation.ifText;
				ifTextStartIndex = optionLine.index + optionLine.splitLine.padding.length + preTextIfInformation.ifTextRelativeIndex;
			}
			else {
				// A hacky for-now way to handle multiple nested if statements
				ifText += "~" + preTextIfInformation;
			}
		}
	}
	// Parse the option as if it were a string, since it can have ${references}
	parseBareString(optionText, optionLine.index + optionLine.splitLine.padding.length + hashIndex, optionText.length, state);

	return {
		lineIndex: optionLineStartIndex,
		optionIndex: optionLine.index + optionLine.splitLine.padding.length,
		optionIndent: optionLine.splitLine.padding.length,
		optionText: optionText,
		ifIndents: ifIndents,
		ifText: ifText,
		ifTextStartIndex: ifTextStartIndex,
		nextLineIndex: optionLine.index + optionLine.line.length
	};
}

/**
 * Skip contents of a subgroup that isn't the innermost subgroup.
 * 
 * Any content is flagged as an error, since subgroups can't have any contents.
 * 
 * @param text Document text.
 * @param choiceInfo Information about the current choice block.
 * @param parsedOption Information about the option.
 * @param state Parsing state.
 * @returns The next line after any option contents and its start index.
 */
function skipOptionContents(text: string, choiceInfo: ChoiceInfo, parsedOption: OptionLineInfo, state: ParsingState): {
	nextLine: NewLine | undefined, nextLineStartIndex: number
} {
	let nextLine: NewLine | undefined;
	let nextLineStartIndex = parsedOption.nextLineIndex;
	let contentsStart = -1;

	while (true) {
		nextLine = readNextNonblankLine(text, nextLineStartIndex);
		if (nextLine === undefined) {
			break;
		}

		const lineContents = nextLine.splitLine !== undefined ? nextLine.splitLine.contents : nextLine.line;
		if (
			lineContents.includes('#') || 
			lineContents.startsWith('*if ') || 
			nextLine.splitLine === undefined || 
			nextLine.splitLine.padding.length <= choiceInfo.commandIndent
		) {
			break;
		}
		if (contentsStart == -1) {
			contentsStart = nextLine.index;
		}
		nextLineStartIndex += nextLine.line.length;
	}
	if (contentsStart != -1) {
		const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
			contentsStart, nextLineStartIndex - 1,
			"Nothing is allowed between group sub-options", state);
		state.callbacks.onParseError(diagnostic);
	}

	return { nextLine, nextLineStartIndex };
}

/**
 * Verify an option's indent.
 * 
 * @param choiceInfo Information about the current choice block.
 * @param parsedOption Information about the option.
 * @param allowableIndents Allowable indents in the current subgroup.
 * @param state Parsing state.
 * @returns True if the option is contained within the current subgroup; false otherwise.
 */
function verifyOptionIndent(choiceInfo: ChoiceInfo, parsedOption: OptionLineInfo, allowableIndents: number[], state: ParsingState): boolean {
	const leftmostIndent = parsedOption.ifIndents.length > 0 ? parsedOption.ifIndents[0] : parsedOption.optionIndent;
	if (allowableIndents.indexOf(leftmostIndent) == -1) {
		let errorMessage: string;
		if (leftmostIndent < allowableIndents[0]) {
			// If we're part of multiple subgroups, shorter indent means leaving the group
			if (choiceInfo.groupInfo.length > 1) {
				return false;
			}
			errorMessage = "Line is not indented far enough";
		}
		else if (leftmostIndent > allowableIndents[allowableIndents.length-1]) {
			errorMessage = "Line is indented too far";
		}
		else {
			errorMessage = "Line indent doesn't match earlier indents";
		}
		const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
			parsedOption.lineIndex,
			parsedOption.lineIndex + leftmostIndent,
			errorMessage, state);
		state.callbacks.onParseError(diagnostic);
	}

	return true;
}

/**
 * 
 * @param choiceInfo Information about the current choice block.
 * @param parsedOption Information about the option.
 * @param allowableIndents Allowable indents in the current subgroup.
 * @param isFirstGroupOption If true, this is the first option in a subgroup.
 * @param state Parsing state.
 * @returns True if the indents indicate that the option is contained within the current subgroup; false otherwise.
 */
function processOptionIndents(choiceInfo: ChoiceInfo, parsedOption: OptionLineInfo, allowableIndents: number[], isFirstGroupOption: boolean, state: ParsingState): {
	allowableIndents: number[], isPartOfSubgroup: boolean
} {
	let isPartOfSubgroup = true;

	if (isFirstGroupOption) {
		// First option sets the allowable indent for the group
		if (parsedOption.ifIndents.length > 0) {
			allowableIndents = allowableIndents.concat(parsedOption.ifIndents);
		}
		allowableIndents.push(parsedOption.optionIndent);
	}
	else {
		if (!verifyOptionIndent(choiceInfo, parsedOption, allowableIndents, state)) {
			isPartOfSubgroup = false;
		}
		else {
			// Store additional indent values
			if (parsedOption.ifIndents.length > 0) {
				allowableIndents = allowableIndents.concat(parsedOption.ifIndents);
			}
			allowableIndents.push(parsedOption.optionIndent);
		}
	}
	// Sort results and get rid of any indents less than the option indent while also
	// removing any duplicates
	allowableIndents = allowableIndents.sort().filter((x, i, a) => (!i || x != a[i-1]) && x <= parsedOption.optionIndent);

	return { allowableIndents, isPartOfSubgroup };
}

/**
 * Recursively parse a subgroup of options.
 * 
 * @param text Document text.
 * @param choiceInfo Information about the current choice block.
 * @param currentLine Current line containing the first option in the subgroup.
 * @param currentGroupNum Current subgroup number.
 * @param state Parsing state.
 * @returns The next line after the subgroup and the index at the end of the subgroup.
 */
function parseOptionSubgroup(text: string, choiceInfo: ChoiceInfo, currentLine: NewLine, currentGroupNum: number, state: ParsingState): { 
		nextLine: NewLine | undefined, endIndex: number 
} {
	const currentGroupInfo = choiceInfo.groupInfo[currentGroupNum];
	let nextLine: NewLine | undefined;
	let allowableIndents: number[] = [];
	let memberCount = 0;
	let groupContentsEndIndex = currentLine.index + currentLine.line.trimRight().length;

	while (true) {
		// parse the line: should be an option
		const parsedOption = parseSingleOptionLine(text, choiceInfo, currentLine, state);
		if (parsedOption === undefined) {
			return { nextLine: undefined, endIndex: groupContentsEndIndex };
		}

		let isPartOfSubgroup = true;
		({allowableIndents, isPartOfSubgroup} = processOptionIndents(choiceInfo, parsedOption, allowableIndents, memberCount == 0, state));
		if (!isPartOfSubgroup) {
			break;
		}

		// if not complete, stash the option and if text in the group info
		// else, compare if and option text
		if (!currentGroupInfo.complete) {
			currentGroupInfo.optionText.push(parsedOption.optionText);
			currentGroupInfo.ifText.push(parsedOption.ifText);
		}
		else {
			if (parsedOption.ifText != currentGroupInfo.ifText[memberCount]) {
				const errorStartIndex = (parsedOption.ifText !== undefined) ? parsedOption.ifTextStartIndex : (currentLine.index + ((parsedOption.ifIndents.length > 0) ? parsedOption.ifIndents[0] : parsedOption.optionIndent));
				const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Warning,
					errorStartIndex,
					errorStartIndex + (parsedOption.ifText?.length ?? 1),
					"*if statements in front of group sub-options must all evaluate to the same true or false value",
					state);
				state.callbacks.onParseError(diagnostic);
			}
			if (parsedOption.optionText != currentGroupInfo.optionText[memberCount]) {
				const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
					parsedOption.optionIndex + 1, parsedOption.optionIndex + parsedOption.optionText.length,
					"Group sub-options must be exactly the same", state);
				state.callbacks.onParseError(diagnostic);
			}
		}

		const optionStartGlobalPosition = parsingPositionAt(currentLine.index, state);
		let optionContentsEndIndex = parsedOption.nextLineIndex;
		if (currentLine.line.endsWith("\n")) {  // If there's a CR, move back one
			optionContentsEndIndex -= 1;
		}
		if (currentGroupNum + 1 == choiceInfo.groupInfo.length) {
			// We're in the inner-most group, which should have actual content
			let lastContentLine: NewLine | undefined;
			[lastContentLine, nextLine] = parseSingleOptionContents(text, parsedOption.nextLineIndex, allowableIndents[allowableIndents.length-1], choiceInfo.isTabs, state);

			if (lastContentLine === undefined) {
				// If this is a choice, it has to have contents
				if (!choiceInfo.isFakeChoice) {
					const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
						optionContentsEndIndex, optionContentsEndIndex + 1,
						"An option in a *choice must have contents", state);
					state.callbacks.onParseError(diagnostic);
				}
				if (nextLine !== undefined) {
					optionContentsEndIndex = nextLine.index - 1;
				}
			}
			else {
				optionContentsEndIndex = lastContentLine.index + lastContentLine.line.trimRight().length;
			}
			groupContentsEndIndex = optionContentsEndIndex;
		}
		else {
			// Non-terminating subgroups should have no contents
			let nextLineStartIndex: number;

			({ nextLine, nextLineStartIndex } = skipOptionContents(text, choiceInfo, parsedOption, state));

			optionContentsEndIndex = nextLineStartIndex - 1;
			groupContentsEndIndex = optionContentsEndIndex;

			if ((nextLine === undefined) || ((nextLine.splitLine?.padding.length ?? 0) <= allowableIndents[allowableIndents.length-1])) {
				const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
					parsedOption.nextLineIndex - 1, nextLineStartIndex,
					`Missing options for group ${choiceInfo.groupInfo.slice(currentGroupNum+1).map(gi => gi.name).join(', ')}`, state);
				state.callbacks.onParseError(diagnostic);
			}
			else {
				// Parse the next-level-down subgroup
				const subgroupParseResults = parseOptionSubgroup(text, choiceInfo, nextLine, currentGroupNum + 1, state);
				nextLine = subgroupParseResults.nextLine;
				optionContentsEndIndex = subgroupParseResults.endIndex;
				groupContentsEndIndex = optionContentsEndIndex;
			}
		}

		choiceInfo.choiceScopes.push({
			summary: summarize(parsedOption.optionText ? parsedOption.optionText : "<missing>", 35),
			range: Range.create(optionStartGlobalPosition, parsingPositionAt(optionContentsEndIndex, state))
		});

		// Should we continue y/n?
		if (nextLine === undefined) {
			break;
		}
		if (currentGroupInfo.complete && (memberCount + 1 == currentGroupInfo.optionText.length)) {
			break;
		}
		if ((nextLine.splitLine?.padding.length ?? 0) < choiceInfo.commandIndent) {
			break;
		}

		memberCount += 1;
		currentLine = nextLine;
	}

	currentGroupInfo.complete = true;
	if (memberCount + 1 < currentGroupInfo.optionText.length) {
		const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
			currentLine.index - 1, currentLine.index,
			`Group ${currentGroupInfo.name} is missing ${currentGroupInfo.optionText.length - memberCount - 1} options`, state);
		state.callbacks.onParseError(diagnostic);
	}

	return { nextLine: nextLine, endIndex: groupContentsEndIndex };
}

/**
 * Parse the options defined by a *choice or *fake_choice command.
 * @param text Document text to scan.
 * @param command Command that is being parsed.
 * @param commandPadding Spacing before the *choice command.
 * @param commandSectionIndex Index at the start of the *choice command.
 * @param line The rest of the line following the *if command
 * @param lineSectionIndex Index to the rest of the line
 * @param optionsSectionIndex Index at the start of the options.
 * @param state Parsing state.
 * @returns Index at the end of the choice block.
 */
function parseChoice(text: string, command: string, commandPadding: string, commandSectionIndex: number, line: string, lineSectionIndex: number, optionsSectionIndex: number, state: ParsingState): number {
	const isFakeChoice = (command == "fake_choice");
	// commandPadding can include a leading \n, so don't count that
	const commandIndent = commandPadding.replace("\n", "").length;
	let paddingTypeIsKnown = false;
	let isTabs = /\t/.test(commandPadding);
	let groupNames: string[] = line.trim().split(/\s+/);
	const groupInfo: OptionGroupInfo[] = [];
	const choiceScopes: SummaryScope[] = [];
	const startGlobalPosition = parsingPositionAt(commandSectionIndex, state);
	let contentsEndIndex: number | undefined = undefined;

	// Get the padding type if we can
	if (commandIndent) {
		paddingTypeIsKnown = true;
		if (isTabs && / /.test(commandPadding)) {
			const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
				commandSectionIndex, commandSectionIndex + commandPadding.length,
				"Tabs and spaces can't be mixed", state);
			state.callbacks.onParseError(diagnostic);
			return optionsSectionIndex;
		}
	}

	// See if we have any choice group names and if they're okay
	groupNames = groupNames.filter(elem => elem.trim() !== "");
	let badGroupNameIndex = -1;
	for (let i = 0; i < groupNames.length; i++) {
		if ((/\W/.test(groupNames[i]))) {
			badGroupNameIndex += 1;
			badGroupNameIndex += line.substr(badGroupNameIndex).search(groupNames[i]);
			const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
				lineSectionIndex + badGroupNameIndex,
				lineSectionIndex + badGroupNameIndex + groupNames[i].length,
				"Choice group names can only have letters, numbers, or _",
				state);
			state.callbacks.onParseError(diagnostic);
		}
	}
	// Plain *choices have no group names, so fake the funk and add one in
	if (groupNames.length == 0) {
		groupNames.push("");
	}

	// Get the first option and its indent
	let nextLine = readNextNonblankLine(text, optionsSectionIndex);
	if (nextLine === undefined || nextLine.splitLine === undefined || nextLine.splitLine.padding.length <= commandIndent) {
		return optionsSectionIndex;
	}
	if (!paddingTypeIsKnown) {
		isTabs = /\t/.test(nextLine.splitLine.padding);
		paddingTypeIsKnown = true;
		if (!validIndentWhitespace(nextLine.index, nextLine.splitLine.padding, isTabs, state)) {
			return optionsSectionIndex;
		}
	}

	// Recursively parse the options subgroup by subgroup
	for (let i = 0; i < groupNames.length; i++) {
		groupInfo.push({
			name: groupNames[i],
			ifText: [],
			optionText: [],
			complete: false
		});
	}
	const choiceInfo: ChoiceInfo = {
		commandIndent, isFakeChoice, isTabs, groupInfo, choiceScopes
	};
	({ nextLine: nextLine, endIndex: contentsEndIndex } = parseOptionSubgroup(
		text, choiceInfo, nextLine, 0, state
	));

	const range = Range.create(startGlobalPosition, parsingPositionAt(contentsEndIndex, state));
	const summary = `${command} (${choiceScopes[0]?.summary || 'none'})`;
	const scope: SummaryScope = { summary: summary, range: range };
	state.callbacks.onChoiceScope(scope, state);

	// Add the option scopes
	choiceScopes.forEach(scope => { state.callbacks.onChoiceScope(scope, state); });

	return contentsEndIndex;
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
			if (!validIndentWhitespace(nextLine.index, padding, isTabs, state)) {
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
		state.enterBlock("option");
		parseSection(optionContents, state.sectionGlobalIndex + optionContentsIndex, state);
		state.exitBlock();
	}

	return [lastContentLine, nextLine];
}

/**
 * Parse the scenes defined by a *scene_list command.
 * @param text Document text to scan.
 * @param startSectionIndex Index at the start of the scenes.
 * @param state Parsing state.
 */
function parseScenes(text: string, startSectionIndex: number, state: ParsingState): void {
	const sceneList: string[] = [];
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
	const location = Location.create(state.textDocumentUri, range);
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


const balancedString = RegExp(`"(?:[^"\\\\]|\\\\.)*"`, 'g');

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
		// Deal with the case where a hash mark is in a string by blanking out strings, just for now.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const stringlessLine = line.replace(balancedString, (match: string, ...args: unknown[]) => ' '.repeat(match.length));
		const choiceIndex = stringlessLine.indexOf(' #');
		if (choiceIndex > 0) {
			line = line.substring(0, choiceIndex);
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
		if (booleanFunctionsLookup.has(tokenizedExpression.tokens[0]?.text) &&
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
		else if (
			tokenizedExpression.combinedTokens.length > 1 || 
			(tokenizedExpression.combinedTokens.length > 0 && tokenizedExpression.combinedTokens[0].type != ExpressionTokenType.Parentheses)) {
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
 * @param line The rest of the line following the *if command.
 * @param lineSectionIndex Index at the start of the rest of the line.
 * @param contentsIndex Index at the start of the *if block contents.
 * @param state Parsing state.
 * @returns Index at the end of the choice block.
 */
function parseIfBlock(text: string, command: string, commandPadding: string, line: string, lineSectionIndex: number, contentsIndex: number, state: ParsingState): number {
	// commandPadding can include a leading \n, so don't count that
	const commandIndent = commandPadding.replace("\n", "").length;

	// Parse the command itself
	parseVariableReferenceCommand(command, line, lineSectionIndex, state);

	// Parse the block's contents
	const blockContents = extractToMatchingIndent(text, commandIndent, contentsIndex);
	if (blockContents.trim() == "" && !(state.enclosingBlock?.startsWith("option"))) {
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

		let tokenDelimiters = "\\w-";
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
					parseExpression(secondToken.slice(1, -1), state.sectionGlobalIndex + lineSectionIndex + secondTokenLocalIndex + 1, state);
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
 * Check the text in an achievement (such as a title) for illegal characters or length, raising a parse error if found.
 * 
 * @param text Text to check.
 * @param textTypeDesc Type of achievement text, such as "title" or "pre-earned description".
 * @param maxLen Maximum number of characters in the text.
 * @param textIndex Index of the text in the document.
 * @param state Parsing state.
 */
function checkAchievementText(text: string, textTypeDesc: string, maxLen: number, textIndex: number, state: ParsingState) {
	// I really should look for an entire ${} replace &c., but
	// this is what ChoiceScript does, so
	let delimIndex = text.indexOf("${");
	if (delimIndex != -1) {
		const diagnostic = createParsingDiagnostic(
			DiagnosticSeverity.Error,
			textIndex + delimIndex,
			textIndex + delimIndex + 2,
			`*achievement ${textTypeDesc} can't include a \${} replace`,
			state
		);
		state.callbacks.onParseError(diagnostic);
	}
	delimIndex = text.indexOf("@{");
	if (delimIndex != -1) {
		const diagnostic = createParsingDiagnostic(
			DiagnosticSeverity.Error,
			textIndex + delimIndex,
			textIndex + delimIndex + 2,
			`*achievement ${textTypeDesc} can't include a @{} multireplace`,
			state
		);
		state.callbacks.onParseError(diagnostic);
	}
	delimIndex = text.indexOf("[");
	if (delimIndex != -1) {
		const diagnostic = createParsingDiagnostic(
			DiagnosticSeverity.Error,
			textIndex + delimIndex,
			textIndex + delimIndex + 1,
			`*achievement ${textTypeDesc} can't include [] brackets`,
			state
		);
		state.callbacks.onParseError(diagnostic);
	}
	if (text.trimStart().length > maxLen) {
		const startIndex = text.search(/\S/);
		const diagnostic = createParsingDiagnostic(
			DiagnosticSeverity.Error,
			textIndex + startIndex + maxLen,
			textIndex + text.length,
			`*achievement ${textTypeDesc} can't be longer than ${maxLen} characters`,
			state
		);
		state.callbacks.onParseError(diagnostic);
	}
}

/**
 * 
 * @param text Document text to scan.
 * @param commandPadding Spacing before the *achievement command.
 * @param line The rest of the line following the command.
 * @param lineSectionIndex Index at the start of the rest of the line.
 * @param contentsIndex Index at the start of the line after the command.
 * @param state Parsing state.
 * @returns Index at the end of the achievement block.
 */
function parseAchievement(text: string, commandPadding: string, line: string, lineSectionIndex: number, contentsIndex: number, state: ParsingState): number {
	// Chomp the line one element at a time
	const tokenPattern = /(\s*?)(\S+)/g;
	let currentTokenIndex = 0;
	let points = 0;
	let title = "";
	let visibility: string | undefined = undefined;

	let m = tokenPattern.exec(line);
	// If no codename, don't continue
	if (m === null) {
		const diagnostic = createParsingDiagnostic(
			DiagnosticSeverity.Error,
			lineSectionIndex,
			lineSectionIndex,
			"Command *achievement is missing its codename", 
			state
		);
		state.callbacks.onParseError(diagnostic);
		return contentsIndex;
	}
	const codename = m[2];
	const location = createParsingLocation(
		lineSectionIndex + currentTokenIndex + m[1].length,
		lineSectionIndex + tokenPattern.lastIndex,
		state
	);
	currentTokenIndex = tokenPattern.lastIndex;

	do {
		m = tokenPattern.exec(line);
		if (m === null) {
			const diagnostic = createParsingDiagnostic(
				DiagnosticSeverity.Error,
				lineSectionIndex + currentTokenIndex,
				lineSectionIndex + currentTokenIndex,
				"Command *achievement is missing its visibility", 
				state
			);
			state.callbacks.onParseError(diagnostic);
			break;
		}
		visibility = m[2].toLowerCase();
		if (visibility !== "visible" && visibility !== "hidden") {
			const diagnostic = createParsingDiagnostic(
				DiagnosticSeverity.Error,
				lineSectionIndex + currentTokenIndex + m[1].length,
				lineSectionIndex + tokenPattern.lastIndex,
				"*achievement visibility must be 'hidden' or 'visible'",
				state
			);
			state.callbacks.onParseError(diagnostic);
		}
		currentTokenIndex = tokenPattern.lastIndex;

		m = tokenPattern.exec(line);
		if (m === null) {
			const diagnostic = createParsingDiagnostic(
				DiagnosticSeverity.Error,
				lineSectionIndex + currentTokenIndex,
				lineSectionIndex + currentTokenIndex,
				"Command *achievement is missing its points value",
				state
			);
			state.callbacks.onParseError(diagnostic);
			break;
		}
		points = Number(m[2]);
		let pointsError: string | undefined = undefined;
		if (isNaN(points)) {
			pointsError = "*achievement points must be a number";
			points = 0;
		}
		else if (points < 1) {
			pointsError = "*achievement points must be 1 or more";
		}
		else if (points > 100) {
			pointsError = "*achievement points must be 100 or less";
		}
		if (pointsError !== undefined) {
			const diagnostic = createParsingDiagnostic(
				DiagnosticSeverity.Error,
				lineSectionIndex + currentTokenIndex + m[1].length,
				lineSectionIndex + tokenPattern.lastIndex,
				pointsError,
				state
			);
			state.callbacks.onParseError(diagnostic);
		}
		currentTokenIndex = tokenPattern.lastIndex;

		title = line.slice(tokenPattern.lastIndex);
		if (title.trim() === "") {
			const diagnostic = createParsingDiagnostic(
				DiagnosticSeverity.Error,
				lineSectionIndex + currentTokenIndex,
				lineSectionIndex + currentTokenIndex + title.length,
				"Command *achievement is missing its title",
				state
			);
			state.callbacks.onParseError(diagnostic);
		}
		else {
			checkAchievementText(title, "title", 50, lineSectionIndex + currentTokenIndex, state);
			title = title.trimStart();
		}
	// eslint-disable-next-line no-constant-condition
	} while (false);

	state.callbacks.onAchievementCreate(codename, location, points, title, state);

	// Parse the block's contents
	// commandPadding can include a leading \n, so don't count that
	const commandIndent = commandPadding.replace("\n", "").length;
	const blockContents = extractToMatchingIndent(text, commandIndent, contentsIndex);
	let currentIndex = 0;
	if (blockContents.trim() == "") {
		const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
			lineSectionIndex + line.length, lineSectionIndex + line.length,
			"*achievement is missing its indented pre-earned description", state);
		state.callbacks.onParseError(diagnostic);
	}
	else {
		let nextLine: NewLine | undefined = readLine(blockContents, currentIndex);
		if (nextLine !== undefined && nextLine.splitLine !== undefined) {
			if (visibility === "hidden" && nextLine.splitLine.contents.toLowerCase() !== "hidden") {
				const diagnostic = createParsingDiagnostic(
					DiagnosticSeverity.Error,
					contentsIndex + nextLine.splitLine.padding.length, 
					contentsIndex + nextLine.line.trimEnd().length,
					"Hidden *achievement's pre-earned description must be 'hidden'", 
					state
				);
				state.callbacks.onParseError(diagnostic);
			}
			else {
				checkAchievementText(
					nextLine.splitLine.contents,
					"pre-earned description",
					200,
					contentsIndex + currentIndex + nextLine.splitLine.padding.length,
					state
				);
			}
			currentIndex += nextLine.line.length;
			nextLine = readLine(blockContents, currentIndex);
			if (nextLine === undefined || nextLine.splitLine === undefined) {
				if (visibility === "hidden") {
					const diagnostic = createParsingDiagnostic(
						DiagnosticSeverity.Error,
						contentsIndex + currentIndex, 
						contentsIndex + currentIndex,
						"Hidden *achievement must have a post-earned description (is the indent wrong?)", 
						state
					);
					state.callbacks.onParseError(diagnostic);
				}
			}
			else {
				checkAchievementText(
					nextLine.splitLine.contents,
					"post-earned description",
					200,
					contentsIndex + currentIndex + nextLine.splitLine.padding.length,
					state
				);
				currentIndex += nextLine.line.length;
			}
			if (blockContents[currentIndex - 1] == "\n") {
				// The -1 is so we back up to before the \n at the end so the next round of parsing works
				currentIndex--;
			}
		}
	}

	return contentsIndex + currentIndex;
}

/**
 * Parse an achievement reference.
 * @param codename Achievement's codename.
 * @param startSectionIndex Index at the start of the codename.
 * @param state Parsing state.
 */
function parseAchievementReference(codename: string, startSectionIndex: number, state: ParsingState): void {
	const location = createParsingLocation(startSectionIndex, startSectionIndex + codename.length, state);
	state.callbacks.onAchievementReference(codename, location, state);
}

/**
 * Parse an image.
 * @param image Image.
 * @param remainingLine Remaining line after the image, if any.
 * @param startSectionIndex Index at the start of the image.
 * @param state Parsing state.
 */
function parseImage(image: string, remainingLine: string, startSectionIndex: number, state: ParsingState): void {
	if (remainingLine.trim() != '' && !/^(\s+?)(left|right|center)(?=\s|$)/.test(remainingLine)) {
		const firstCharacterIndex = remainingLine.search(/\S/);
		const startIndex = startSectionIndex + image.length + firstCharacterIndex;
		let endCharacterIndex = remainingLine.slice(firstCharacterIndex).search(/\s/);
		if (endCharacterIndex == -1) {
			endCharacterIndex = remainingLine.length;
		}
		else {
			endCharacterIndex++;
		}
		const endIndex = startSectionIndex + image.length + endCharacterIndex;
		const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
			startIndex, endIndex,
			`Must be one of left, right, or center.`, state);
		state.callbacks.onParseError(diagnostic);
	}
	const location = createParsingLocation(startSectionIndex, startSectionIndex + image.length, state);
	state.callbacks.onImage(image, location, state);
}

/**
 * Parse an IFID.
 * @param ifid IFID value.
 * @param remainingLine Remaining line after the IFID, if any.
 * @param startSectionIndex Index at the start of the IFID.
 * @param state Parsing state.
 */
function parseIfid(ifid: string, remainingLine: string, startSectionIndex: number, state: ParsingState): void {
	const ifidRegex = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
	if (!ifidRegex.test(ifid)) {
		const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
			startSectionIndex, startSectionIndex + ifid.length,
			"An IFID must have only hexidecimal characters (0-9 or a-f) in a 8-4-4-4-12 pattern.", state);
		state.callbacks.onParseError(diagnostic);
	}
	if (remainingLine.trim() != '') {
		const firstCharacterIndex = remainingLine.search(/\S/);
		const startIndex = startSectionIndex + ifid.length + firstCharacterIndex;
		const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
			startIndex, startIndex + remainingLine.length - firstCharacterIndex,
			`Nothing can follow an IFID.`, state);
		state.callbacks.onParseError(diagnostic);
	}
}

/**
 * Parse a kindle_search command.
 * @param line Line after the command.
 * @param startSectionIndex Index at the start of the line.
 * @param state Parsing state.
 */
function parseKindleSearch(line: string, startSectionIndex: number, state: ParsingState): void {
	if (line.search(/^\(.+\) [^)]+/) == -1) {
		let startIndex = startSectionIndex;
		let endIndex = -1;
		let message = "";
		const parenthesizedSearch = /^\((.*)\)( )?/.exec(line);

		if (parenthesizedSearch) {
			if (!parenthesizedSearch[1]) {
				startIndex += 1;
				endIndex = startIndex;
				message = "Missing search.";
	
			}
			else if (parenthesizedSearch[2] === undefined) {
				startIndex += parenthesizedSearch[1].length + 2;
				endIndex = startIndex;
				message = "Missing space before the button name.";
			}
			else {
				startIndex += parenthesizedSearch[0].length;
				endIndex = startIndex;
				message = "Missing button name.";
			}
		}
		else {
			const openParensMatch = line.match(/^\((.+)/);
			if (openParensMatch) {
				startIndex += openParensMatch[0].length;
				endIndex = startIndex + 1;
				message = "Missing close parenthesis.";
			}
			else {
				endIndex = startIndex + line.length;
				message = "The first argument to kindle_search must be in parentheses.";
			}
		}

		if (endIndex != -1) {
			const diagnostic = createParsingDiagnostic(
				DiagnosticSeverity.Error, startIndex, endIndex, message, state
			);
			state.callbacks.onParseError(diagnostic);
		}
	}
}

/**
 * Parse a product command.
 * @param line Line after the command.
 * @param startSectionIndex Index at the start of line.
 * @param state Parsing state.
 */
function parseProduct(line: string, startSectionIndex: number, state: ParsingState): void {
	if (!/^[a-z]+$/.test(line)) {
		const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
			startSectionIndex, startSectionIndex + line.length,
			"A product ID can only contain lower-case letters.", state);
		state.callbacks.onParseError(diagnostic);
	}
}

/**
 * Parse a save_ or restore_checkpoint command.
 * @param line Line after the command.
 * @param startSectionIndex Index at the start of line.
 * @param state Parsing state.
 */
function parseCheckpoint(line: string, startSectionIndex: number, state: ParsingState): void {
	if (!/^[a-zA-Z0-9_]+$/.test(line)) {
		const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
			startSectionIndex, startSectionIndex + line.length,
			"A checkpoint slot's name can only contain letters, numbers or an underscore.", state);
		state.callbacks.onParseError(diagnostic);
	}
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

	if (startupCommandsLookup.has(command) && !uriIsStartupFile(state.textDocumentUri)) {
		const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
			commandSectionIndex, commandSectionIndex + command.length,
			`Command *${command} can only be used in startup.txt.`, state);
		state.callbacks.onParseError(diagnostic);
	}

	if (!checkCommandArgumentContents(command, commandSectionIndex, line, lineSectionIndex, state)) {
		return endParseIndex;
	}

	if (insideBlockCommandsLookup.has(command)) {
		if ((command == "selectable_if" && !(state.enclosingBlock?.startsWith("option"))) ||
			(command != "selectable_if" && state.enclosingBlock != "if")) {
			const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
				commandSectionIndex, commandSectionIndex + command.length,
				`Command *${command} must be ${(command == "selectable_if" ? "in front of an #option" : "part of an *if command block")}.`,
				state);
			state.callbacks.onParseError(diagnostic);
		}
	}

	if (command == "if") {
		const nextLineIndex = findLineEnd(document, commandSectionIndex);
		endParseIndex = parseIfBlock(document, command, prefix, line, lineSectionIndex, nextLineIndex, state);
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
			endParseIndex = parseChoice(document, command, prefix, commandSectionIndex, line, lineSectionIndex, nextLineIndex, state);
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
		const nextLineIndex = findLineEnd(document, commandSectionIndex);
		if (nextLineIndex !== undefined) {
			endParseIndex = parseAchievement(document, prefix, line, lineSectionIndex, nextLineIndex, state);
		}
	}
	else if (command == "achieve") {
		const codenameMatch = line.match(/^\S+/);
		if (codenameMatch) {
			const codename = codenameMatch[0];
			parseAchievementReference(codename, lineSectionIndex, state);
		}
	}
	else if (command == "image" || command == "text_image" || command == "kindle_image") {
		const imageMatch = line.match(/^\S+/);
		if (imageMatch) {
			const image = imageMatch[0];
			parseImage(image, line.slice(image.length), lineSectionIndex, state);
		}
	}
	else if (command == "ifid") {
		const ifidMatch = line.match(/^\S+/);
		if (ifidMatch) {
			const ifid = ifidMatch[0];
			parseIfid(ifid, line.slice(ifid.length), lineSectionIndex, state);
		}
	}
	else if (command == "kindle_search" || command == "kindle_product") {
		if (line)
			parseKindleSearch(line, lineSectionIndex, state);
	}
	else if (command == "product") {
		if (line)
			parseProduct(line, lineSectionIndex, state);
	}
	else if (command == "save_checkpoint" || command == "restore_checkpoint") {
		if (line)
			parseCheckpoint(line, lineSectionIndex, state);
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
			let errorMessage: string;
			let errorStartIndex: number;
			let errorEndIndex: number;
			const optionIndex = m.index + m[0].length - m.groups.option.length;
			if (state.enclosingBlock?.startsWith("option")) {
				errorMessage = "This #option is too indented";
				errorStartIndex = optionIndex - m.groups.optionPrefix.length;
				errorEndIndex = optionIndex;
			}
			else {
				errorMessage = "An #option must only appear inside a *choice or *fake_choice";
				errorStartIndex = optionIndex;
				errorEndIndex = errorStartIndex + 1;
			}
			const diagnostic = createParsingDiagnostic(DiagnosticSeverity.Error,
				errorStartIndex, errorEndIndex,
				errorMessage, state);
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
