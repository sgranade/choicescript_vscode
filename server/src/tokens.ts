import { Diagnostic, TextDocument, DiagnosticSeverity } from 'vscode-languageserver';

import { stringIsNumber, extractToMatchingDelimiter, createDiagnostic } from './utilities';
import { functions, booleanNamedOperators, numericNamedOperators, booleanNamedValues, operators } from './language';

let functionsLookup: ReadonlyMap<string, number> = new Map(functions.map(x => [x, 1]));
let booleanNamedOperatorsLookup: ReadonlyMap<string, number> = new Map(booleanNamedOperators.map(x => [x, 1]));
let numericNamedOperatorsLookup: ReadonlyMap<string, number> = new Map(numericNamedOperators.map(x => [x, 1]));
let booleanNamedValuesLookup: ReadonlyMap<string, number> = new Map(booleanNamedValues.map(x => [x, 1]));
let operatorsLookup: ReadonlyMap<string, number> = new Map(operators.map(x => [x, 1]));


/**
 * Type of a token in an expression.
 */
export enum ExpressionTokenType {
	Operator,			// +, -, %+
	UnknownOperator,	// Unrecognized symbol
	BooleanNamedOperator,	// and, or
	NumericNamedOperator,	// modulo
	BooleanNamedValue,			// true, false
	Function,			// not, round
	FunctionAndContents,	// not(...), round(...)
	Number,				// 1, 3.4
	VariableReference,	// {var}
	Variable,			// var
	String,				// "I'm a string!"
	Parentheses,		// (1+2)
	Unprocessed			// Haven't processed yet
}

/**
 * Token in an expression.
 */
export interface ExpressionToken {
	text: string,
	type: ExpressionTokenType,
	index: number
}

export class Expression {
	readonly bareExpression: string;
	readonly globalIndex: number;
	readonly tokens: ExpressionToken[];
	readonly combinedTokens: ExpressionToken[];
	readonly parseErrors: Diagnostic[];
	private textDocument: TextDocument;

	constructor(bareExpression: string, globalIndex: number, textDocument: TextDocument) {
		this.parseErrors = [];
		this.bareExpression = bareExpression;
		this.globalIndex = globalIndex;
		this.tokens = this.tokenizeExpression(bareExpression);
		this.combinedTokens = this.combineTokens(this.tokens, globalIndex, textDocument);
		this.textDocument = textDocument;
	}

	/**
	 * Slice an expression into a sub-expression by the tokens.
	 * @param state: Parsing state
     * @param start The beginning token of the specified portion of the expression.
     * @param end The end token of the specified portion of the expression. This is exclusive of the token at the index 'end'.
	 */
	slice(start?: number, end?: number): Expression {
		if (start === undefined || start < 0) {
			start = 0;
		}
		if (end === undefined) {
			end = this.tokens.length;
		}

		let startIndex: number;
		let endIndex: number;
		if (start >= this.tokens.length) {
			startIndex = this.bareExpression.length;
		}
		else {
			startIndex = this.tokens[start].index;
		}
		if (end >= this.tokens.length) {
			endIndex = this.bareExpression.length;
		}
		else {
			endIndex = this.tokens[end].index;
		}
		let subExpression = this.bareExpression.slice(startIndex, endIndex);
		return new Expression(subExpression, this.globalIndex + startIndex, this.textDocument);
	}

	/**
	 * Tokenize an unprocessed token.
	 * @param unprocessed Unprocessed token.
	 */
	private tokenizeUnprocessedToken(unprocessed: ExpressionToken): ExpressionToken[] {
		let tokens: ExpressionToken[] = [];

		// Split the unprocessed token at word boundaries and process each cluster
		let wordPattern = /^\w+$/;
		let chunks = unprocessed.text.split(/\b/);
		let splitIndex = unprocessed.index;
		for (let i = 0; i < chunks.length; i++) {
			let chunk = chunks[i];
			// The word boundary split breaks apart floating point numbers because of the period
			// so glue those back together. Numbers are guaranteed to have no spaces around them
			// since that's a word boundary -- a transition from number to space or space to number.
			if (stringIsNumber(chunk) && i + 1 < chunks.length && chunks[i+1] == ".") {
				chunk = chunk + ".";
				i++;
				if (i + 1 < chunks.length && stringIsNumber(chunks[i+1])) {
					chunk = chunk + chunks[i+1];
					i++;
				}
			}
			// Process the cluster
			let tokenPattern = /\S+/g;
			let m: RegExpExecArray | null;
			while (m = tokenPattern.exec(chunk)) {
				let tokenContents = m[0];
				let type: ExpressionTokenType;
				// Need to test numbers separately since floating point numbers don't match the token word pattern
				if (stringIsNumber(tokenContents)) {
					type = ExpressionTokenType.Number;
				}
				else if (wordPattern.test(tokenContents)) {
					// Identify word-based tokens
					if (booleanNamedOperatorsLookup.has(tokenContents)) {
						type = ExpressionTokenType.BooleanNamedOperator;
					}
					else if (numericNamedOperatorsLookup.has(tokenContents)) {
						type = ExpressionTokenType.NumericNamedOperator;
					}
					else if (functionsLookup.has(tokenContents)) {
						type = ExpressionTokenType.Function;
					}
					else if (booleanNamedValuesLookup.has(tokenContents)) {
						type = ExpressionTokenType.BooleanNamedValue;
					}
					else {
						type = ExpressionTokenType.Variable;
					}
				}
				else {
					if (operatorsLookup.has(tokenContents)) {
						type = ExpressionTokenType.Operator;
					}
					else {
						type = ExpressionTokenType.UnknownOperator;
					}
				}
				tokens.push({ text: tokenContents, type: type, index: splitIndex + m.index });
			}
			splitIndex += chunk.length;
		}

		return tokens;
	}

	/**
	 * Tokenize an expression to pull out recursive expressions like {}, "", and ().
	 * @param expression Expression to tokenize.
	 * @returns Unprocessed and recursive expression tokens.
	 */
	private tokenizeRecursiveExpressions(expression: string): ExpressionToken[] {
		let partialTokens: ExpressionToken[] = [];

		// Expressions can contain numbers, strings, operators, built-in variables, variables, and variable references
		// As variable references, strings, and parentheses can contain other things, tokenize them first
		let recursivePatterns = /^(?<prefix>.*?)(?<delimiter>["{(])(?<remainder>.*)$/;
		let tokenizingIndex = 0;
		let tokenizingExpression = expression;
		let m: RegExpExecArray | null;
		while (m = recursivePatterns.exec(tokenizingExpression)) {
			if (m.groups === undefined || m.groups.remainder === undefined)
				continue;

			let openDelimiter = m.groups.delimiter;
			let openDelimiterIndex = 0;
			// Save the prefix string, if it exists
			if (m.groups.prefix !== undefined && m.groups.prefix != "") {
				partialTokens.push({ text: m.groups.prefix, index: tokenizingIndex, type: ExpressionTokenType.Unprocessed });
				openDelimiterIndex += m.groups.prefix.length;
			}

			let closeDelimiter = '';
			let tokenType: ExpressionTokenType;
			if (openDelimiter == '{') {
				closeDelimiter = '}';
				tokenType = ExpressionTokenType.VariableReference;
			}
			else if (openDelimiter == '"') {
				closeDelimiter = '"';
				tokenType = ExpressionTokenType.String;
			}
			else {
				closeDelimiter = ')';
				tokenType = ExpressionTokenType.Parentheses;
			}
			let contents = extractToMatchingDelimiter(m.groups.remainder, openDelimiter, closeDelimiter, 0);
			if (contents === undefined) {
				contents = m.groups.remainder;
			}
			else {
				contents += closeDelimiter;

			}
			contents = openDelimiter + contents;
			partialTokens.push({ text: contents, index: tokenizingIndex + openDelimiterIndex, type: tokenType });
			tokenizingExpression = tokenizingExpression.slice(openDelimiterIndex +  contents.length);
			tokenizingIndex += openDelimiterIndex + contents.length;
		}

		// Put the remaining unmatched text on the token stack
		partialTokens.push({ text: tokenizingExpression, index: tokenizingIndex, type: ExpressionTokenType.Unprocessed });

		return partialTokens;
	}

	/**
	 * Tokenize an expression.
	 * @param expression Expression to tokenize.
	 */
	private tokenizeExpression(expression: string): ExpressionToken[] {
		let m: RegExpExecArray | null;

		// Deal with arrays first by not dealing with them at all
		let arrayPattern = /(\w+)\[/;
		while (m = arrayPattern.exec(expression)) {
			let localIndex = m.index + m[0].length - 1;
			while (expression[localIndex] == '[') {  // To deal with multi-dimensional arrays
				localIndex++;
				let reference = extractToMatchingDelimiter(expression, '[', ']', localIndex);
				if (reference !== undefined) {
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
		// As variable references, strings, and parentheses can contain other things, tokenize them first
		let partialTokens: ExpressionToken[] = this.tokenizeRecursiveExpressions(expression);

		// Now go back and tokenize the non-processed bits
		let tokens: ExpressionToken[] = [];
		for (let token of partialTokens) {
			if (token.type == ExpressionTokenType.Unprocessed) {
				tokens.push(...this.tokenizeUnprocessedToken(token));
			}
			else {
				tokens.push(token);
			}
		}

		return tokens;
	}

	/**
 	 * Combine tokens as needed.
  	 * 
  	 * Tokens like functions are combined with their following parentheses.
  	 * @param tokens Tokens to process.
  	 * @param globalIndex Starting global index of the list of tokens.
  	 * @param textDocument Document being parsed.
  	 */
	private combineTokens(tokens: ExpressionToken[], globalIndex: number, textDocument: TextDocument): ExpressionToken[] {
		let combinedTokens: ExpressionToken[] = [];
		let index = -1;

		while (++index < tokens.length) {
			let token = tokens[index];
			if (token.type == ExpressionTokenType.Function) {
				// Combine functions and parentheses, or flag an error if they're missing
				// We're about to combine tokens, so move the index forward
				index++;
				if (index >= tokens.length) {
					let diagnostic = createDiagnostic(DiagnosticSeverity.Error, textDocument,
						globalIndex + token.index, globalIndex + token.index + token.text.length,
						"Function is missing its arguments");
					this.parseErrors.push(diagnostic);
				}
				else {
					let secondToken = tokens[index];
					if (secondToken.type != ExpressionTokenType.Parentheses) {
						let diagnostic = createDiagnostic(DiagnosticSeverity.Error, textDocument,
							globalIndex + token.index, globalIndex + token.index + token.text.length,
							"Function must be followed by parentheses");
						this.parseErrors.push(diagnostic);
					}
					else {
						// Replace the token with a combined token
						token = {
							type: ExpressionTokenType.FunctionAndContents,
							text: token.text +
								' '.repeat(secondToken.index - token.index - token.text.length) +
								secondToken.text,
							index: token.index
						};
					}
				}
			}
			combinedTokens.push(token);
		}
		return combinedTokens;
	}
}

/**
 * A multireplace token.
 */
interface MultireplaceToken {
	text: string,
	index: number
}

/**
 * A tokenized multireplace @{variable if-true | if-false}
 */
interface Multireplace {
	text: string,
	test: MultireplaceToken,
	body: MultireplaceToken[],
	endIndex: number
}

/**
 * Break a multireplace into tokens.
 * 
 * @param section Document section beginning with the text right inside @{ and including the close }.
 * @param localIndex Index into the section where the multireplace contents begin.
 */
export function tokenizeMultireplace(section: string, localIndex: number = 0): Multireplace | undefined {
	let fullText: string;
	let test: MultireplaceToken;
	let body: MultireplaceToken[] = [];

	let workingText = extractToMatchingDelimiter(section, "{", "}", localIndex);
	if (workingText === undefined)
		return undefined;
	fullText = workingText;

	let multireplaceEndLocalIndex = workingText.length + 1;
	let testEndLocalIndex = 0;

	if (workingText[0] != '(') {
		// The multireplace only has a bare symbol as its test
		while (testEndLocalIndex < section.length) {
			if (!/\w/.test(workingText[testEndLocalIndex])) {
				break;
			}
			testEndLocalIndex++;
		}
		test = {
			text: workingText.slice(0, testEndLocalIndex),
			index: localIndex
		};
	}
	else {
		let testContents = extractToMatchingDelimiter(workingText.slice(1), "(", ")");
		if (testContents === undefined) {
			testContents = "";
		}
		test = {
			text: testContents,
			index: localIndex + 1
		}
		testEndLocalIndex = testContents.length + 2;
	}

	workingText = workingText.slice(testEndLocalIndex);
	let bareTokens = workingText.split('|');
	let runningIndex = 0;
	for (let bareToken of bareTokens) {
		let trimmed = bareToken.trim();
		body.push({
			text: trimmed,
			index: localIndex + testEndLocalIndex + runningIndex + bareToken.indexOf(trimmed)
		});
		runningIndex += bareToken.length + 1;
	}

	return {
		text: fullText,
		test: test,
		body: body,
		endIndex: localIndex + multireplaceEndLocalIndex
	};
}
