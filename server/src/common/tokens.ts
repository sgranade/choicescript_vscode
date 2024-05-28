import { type Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';

import { stringIsNumber, extractToMatchingDelimiter, createDiagnostic, readLine } from './utilities';
import {
	functions,
	booleanNamedOperators,
	numericNamedOperators,
	booleanNamedValues,
	mathOperators,
	comparisonOperators,
	stringOperators,
	numberFunctions,
	booleanFunctions
} from './language';

const functionsLookup: ReadonlyMap<string, number> = new Map(functions.map(x => [x, 1]));
const numberFunctionsLookup: ReadonlyMap<string, number> = new Map(numberFunctions.map(x => [x, 1]));
const booleanFunctionsLookup: ReadonlyMap<string, number> = new Map(booleanFunctions.map(x => [x, 1]));
const booleanNamedOperatorsLookup: ReadonlyMap<string, number> = new Map(booleanNamedOperators.map(x => [x, 1]));
const numericNamedOperatorsLookup: ReadonlyMap<string, number> = new Map(numericNamedOperators.map(x => [x, 1]));
const booleanNamedValuesLookup: ReadonlyMap<string, number> = new Map(booleanNamedValues.map(x => [x, 1]));
const mathOperatorsLookup: ReadonlyMap<string, number> = new Map(mathOperators.map(x => [x, 1]));
const comparisonOperatorsLookup: ReadonlyMap<string, number> = new Map(comparisonOperators.map(x => [x, 1]));
const stringOperatorsLookup: ReadonlyMap<string, number> = new Map(stringOperators.map(x => [x, 1]));


/**
 * Type of a token in an expression.
 */
export enum ExpressionTokenType {
	MathOperator,		// +, -, %+
	ComparisonOperator,	// <, >=, !=
	StringOperator,		// &, #
	BooleanNamedOperator,	// and, or
	NumericNamedOperator,	// modulo
	UnknownOperator,	// Unrecognized symbol
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
 * Result of evaluating the expression
 */
export enum ExpressionEvalType {
	Empty,
	Number,
	Boolean,
	String,
	NumberChange,	// The expression's changing a variable's value through an expression like "+2"
	StringChange,	// The expression's changing a variable's value through an expression like "&'string'"
	Unknowable,	// Variable or parentheses or other non-eval'able value
	Error,
	Unprocessed
}

/**
 * Token in an expression.
 */
export interface ExpressionToken {
	/** Actual text of the token */
	text: string;
	/** Token's type */
	type: ExpressionTokenType;
	/** Location of the start of the token relative to the entire expression */
	index: number;
	/** Tokenized contents, if any */
	contents?: Expression;
}

/**
 * Find the type of argument a function takes.
 * @param token Function token.
 */
function functionArgumentType(token: ExpressionToken): ExpressionEvalType {
	let type: ExpressionEvalType;

	const functionName = token.text.split('(')[0].trimRight();
	if (numberFunctionsLookup.has(functionName)) {
		// Special case length(), which takes a string
		if (functionName.includes("length")) {
			type = ExpressionEvalType.String;
		}
		else {
			type = ExpressionEvalType.Number;
		}
	}
	else if (booleanFunctionsLookup.has(functionName)) {
		type = ExpressionEvalType.Boolean;
	}
	else {
		type = ExpressionEvalType.Error;
	}

	return type;
}

/**
 * Determine if an expression token is compatible with a number.
 * @param token Token to test.
 */
function isNumberCompatible(token: ExpressionToken): boolean {
	const effectiveType = tokenEffectiveType(token);

	return (effectiveType == ExpressionTokenType.Number ||
		effectiveType == ExpressionTokenType.VariableReference ||
		effectiveType == ExpressionTokenType.Variable);
}

/**
 * Determine if an expression token is compatible with a boolean.
 * @param token Token to test.
 */
function isBooleanCompatible(token: ExpressionToken): boolean {
	const effectiveType = tokenEffectiveType(token);

	return (effectiveType == ExpressionTokenType.BooleanNamedValue ||
		effectiveType == ExpressionTokenType.VariableReference ||
		effectiveType == ExpressionTokenType.Variable);
}

/**
 * Determine if an expression token is compatible with a string.
 * @param token Token to test.
 */
function isStringCompatible(token: ExpressionToken): boolean {
	const effectiveType = tokenEffectiveType(token);

	return (effectiveType == ExpressionTokenType.String ||
		effectiveType == ExpressionTokenType.VariableReference ||
		effectiveType == ExpressionTokenType.Variable);
}

/**
 * Determine if an expression token is any kind of operator.
 * @param token Token to test.
 */
function isAnyOperator(token: ExpressionToken): boolean {
	return (token.type == ExpressionTokenType.MathOperator ||
		token.type == ExpressionTokenType.ComparisonOperator ||
		token.type == ExpressionTokenType.StringOperator ||
		token.type == ExpressionTokenType.BooleanNamedOperator ||
		token.type == ExpressionTokenType.NumericNamedOperator);
}

/**
 * Determine if an expression token is any kind of definite value.
 * @param token Token to test.
 */
function isAnyDefiniteValue(token: ExpressionToken): boolean {
	return (token.type == ExpressionTokenType.Number ||
		token.type == ExpressionTokenType.BooleanNamedValue ||
		token.type == ExpressionTokenType.String);
}

/**
 * Find the effective type of a token.
 * 
 * This converts functions and parenthesized expressions to their
 * effective type.
 * @param token Token to find the type of.
 */
export function tokenEffectiveType(token: ExpressionToken): ExpressionTokenType {
	let effectiveType = token.type;

	// If we've got a function, find out what its effective type is
	if (effectiveType == ExpressionTokenType.FunctionAndContents ||
		effectiveType == ExpressionTokenType.Function) {
		const functionName = token.text.split('(')[0].trimRight();
		if (numberFunctionsLookup.has(functionName)) {
			effectiveType = ExpressionTokenType.Number;
		}
		else if (booleanFunctionsLookup.has(functionName)) {
			effectiveType = ExpressionTokenType.BooleanNamedValue;
		}
	}

	// Ditto for parentheses
	if (effectiveType == ExpressionTokenType.Parentheses && token.contents !== undefined) {
		switch (token.contents.evalType) {
			case ExpressionEvalType.Number:
				effectiveType = ExpressionTokenType.Number;
				break;
			case ExpressionEvalType.Boolean:
				effectiveType = ExpressionTokenType.BooleanNamedValue;
				break;
			case ExpressionEvalType.String:
				effectiveType = ExpressionTokenType.String;
				break;
			case ExpressionEvalType.Empty:
			case ExpressionEvalType.Unknowable:
			case ExpressionEvalType.Error:
				effectiveType = ExpressionTokenType.Variable;
				break;
		}
	}

	return effectiveType;
}

/**
 * Check if an operator is compatible with a token.
 * @param token Token.
 * @param operator Operator to compare against the token.
 * @returns Diagnostic error message if the token doesn't match the operator,
 * or undefined otherwise.
 */
function checkOperatorAgainstToken(
	token: ExpressionToken,
	operator: ExpressionToken): string | undefined {
	let errorMessage: string | undefined = undefined;

	const effectiveType = tokenEffectiveType(token);

	// The string operator "&" coerces everything to be a string
	if (operator.text !== "&") {
		switch (effectiveType) {
			case ExpressionTokenType.Number:
				if (operator.type !== ExpressionTokenType.MathOperator &&
					operator.type !== ExpressionTokenType.ComparisonOperator &&
					operator.type !== ExpressionTokenType.NumericNamedOperator) {
					errorMessage = "Not a numeric operator";
				}
				break;
			case ExpressionTokenType.BooleanNamedValue:
				if (operator.type !== ExpressionTokenType.BooleanNamedOperator) {
					errorMessage = "Not a boolean operator";
				}
				break;
			case ExpressionTokenType.String:
				if (operator.type == ExpressionTokenType.ComparisonOperator) {
					if (operator.text != "!=" && operator.text != "=") {
						errorMessage = "Not compatible with strings";
					}
				}
				else if (operator.type != ExpressionTokenType.StringOperator) {
					errorMessage = "Not a string or comparison operator";
				}
				break;
		}
	}

	return errorMessage;
}

/**
 * Check if a token is compatible with an operator.
 * @param operator Operator token.
 * @param token Token to compare against the operator.
 * @returns Diagnostic error message if the token doesn't match the operator,
 * or undefined otherwise.
 */
function checkTokenAgainstOperator(
	operator: ExpressionToken,
	token: ExpressionToken): string | undefined {
	let errorMessage: string | undefined = undefined;

	switch (operator.type) {
		case ExpressionTokenType.MathOperator:
		case ExpressionTokenType.NumericNamedOperator:
			if (!isNumberCompatible(token)) {
				errorMessage = "Must be a number or a variable";
			}
			break;
		case ExpressionTokenType.ComparisonOperator:
			if (operator.text != "!=" && operator.text != "=") {
				// Inequality check
				if (!isNumberCompatible(token)) {
					errorMessage = "Must be a number or a variable";
				}
			}
			break;
		case ExpressionTokenType.StringOperator:
			// String operators are a special case, since the "#" operator works on numbers
			if (operator.text == "#") {
				if (!isNumberCompatible(token)) {
					errorMessage = "Must be a number or a variable";
				}
			}
			// and the "&" operator coerces everything to strings
			// so requires no other checks
			break;
		case ExpressionTokenType.BooleanNamedOperator:
			if (!isBooleanCompatible(token)) {
				errorMessage = "Must be a boolean value or a variable";
			}
			break;
	}

	return errorMessage;
}

/**
 * Determine the type of an expression's evaluated value based on a token.
 * 
 * The expression is assumed to be error-free.
 * 
 * For long expressions, pass the operator token.
 * 
 * @param token Token.
 */
function determineEvalType(token: ExpressionToken): ExpressionEvalType {
	// Special case the situation where the token has a sub-expression that has an error
	if (token.contents !== undefined && token.contents.evalType == ExpressionEvalType.Error) {
		return ExpressionEvalType.Error;
	}

	switch (tokenEffectiveType(token)) {
		case ExpressionTokenType.Number:
		case ExpressionTokenType.MathOperator:
		case ExpressionTokenType.NumericNamedOperator:
			return ExpressionEvalType.Number;

		case ExpressionTokenType.BooleanNamedValue:
		case ExpressionTokenType.ComparisonOperator:
		case ExpressionTokenType.BooleanNamedOperator:
			return ExpressionEvalType.Boolean;

		case ExpressionTokenType.String:
		case ExpressionTokenType.StringOperator:
			return ExpressionEvalType.String;

		case ExpressionTokenType.Variable:
		case ExpressionTokenType.VariableReference:
			return ExpressionEvalType.Unknowable;
	}

	return ExpressionEvalType.Error;
}

export class Expression {
	// The raw text of the expression
	readonly bareExpression: string;
	// The global index to the start of the expression in the document
	readonly globalIndex: number;
	// The tokenized expression
	readonly tokens: ExpressionToken[];
	// The tokenized expression with e.g. functions combined with their parentheses
	readonly combinedTokens: ExpressionToken[];
	// What the expression evaluates to
	readonly evalType: ExpressionEvalType;
	// Any errors found while parsing the expression
	readonly parseErrors: Diagnostic[];
	// Any errors found while validating the expression
	readonly validateErrors: Diagnostic[];
	private textDocument: TextDocument;
	private isValueSetting: boolean;

	/**
	 * 
	 * @param bareExpression Text containing the expression.
	 * @param globalIndex Global index in the document to the start of the expression.
	 * @param textDocument Document containing the expression.
	 * @param isValueSetting If true, expression is being used to set a variable's value.
	 */
	constructor(bareExpression: string, globalIndex: number, textDocument: TextDocument, isValueSetting = false) {
		this.parseErrors = [];
		this.validateErrors = [];
		this.textDocument = textDocument;
		this.globalIndex = globalIndex;
		this.isValueSetting = isValueSetting;

		this.bareExpression = bareExpression;
		this.tokens = this.tokenizeExpression(bareExpression);
		this.combinedTokens = this.combineTokens(this.tokens);
		this.evalType = this.validateExpression();
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
		const subExpression = this.bareExpression.slice(startIndex, endIndex);
		return new Expression(subExpression, this.globalIndex + startIndex, this.textDocument, this.isValueSetting);
	}

	/**
	 * Create an error that covers a token.
	 * @param token Token to create an error about.
	 * @param message Error message.
	 */
	private createTokenError(token: ExpressionToken, message: string): Diagnostic {
		return createDiagnostic(DiagnosticSeverity.Error,
			this.textDocument,
			this.globalIndex + token.index,
			this.globalIndex + token.index + token.text.length,
			message);
	}

	/**
	 * Tokenize an unprocessed token.
	 * @param unprocessed Unprocessed token.
	 */
	private tokenizeUnprocessedToken(unprocessed: ExpressionToken): ExpressionToken[] {
		const tokens: ExpressionToken[] = [];

		// Split the unprocessed token at word boundaries and process each cluster
		const wordPattern = /^\w+$/;
		const chunks = unprocessed.text.split(/\b/);
		let splitIndex = unprocessed.index;
		for (let i = 0; i < chunks.length; i++) {
			let chunk = chunks[i];
			// The word boundary split breaks apart floating point numbers because of the period
			// so glue those back together. Numbers are guaranteed to have no spaces around them
			// since that's a word boundary -- a transition from number to space or space to number.
			if (stringIsNumber(chunk) && i + 1 < chunks.length && chunks[i + 1] == ".") {
				chunk = chunk + ".";
				i++;
				if (i + 1 < chunks.length && stringIsNumber(chunks[i + 1])) {
					chunk = chunk + chunks[i + 1];
					i++;
				}
			}
			// Process the cluster
			const tokenPattern = /\S+/g;
			let m: RegExpExecArray | null;
			while ((m = tokenPattern.exec(chunk))) {
				const tokenContents = m[0];
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
					if (mathOperatorsLookup.has(tokenContents)) {
						type = ExpressionTokenType.MathOperator;
					}
					else if (comparisonOperatorsLookup.has(tokenContents)) {
						type = ExpressionTokenType.ComparisonOperator;
					}
					else if (stringOperatorsLookup.has(tokenContents)) {
						type = ExpressionTokenType.StringOperator;
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
		const partialTokens: ExpressionToken[] = [];

		// Expressions can contain numbers, strings, operators, built-in variables, variables, and variable references
		// As variable references, strings, and parentheses can contain other things, tokenize them first
		const recursivePatterns = /^(?<prefix>.*?)(?<delimiter>["{(])(?<remainder>.*)$/;
		let tokenizingIndex = 0;
		let tokenizingExpression = expression;
		let m: RegExpExecArray | null;
		while ((m = recursivePatterns.exec(tokenizingExpression))) {
			if (m.groups === undefined || m.groups.remainder === undefined)
				continue;

			const openDelimiter = m.groups.delimiter;
			let openDelimiterIndex = 0;
			// Save the prefix string, if it exists
			if (m.groups.prefix !== undefined && m.groups.prefix != "") {
				partialTokens.push({ text: m.groups.prefix, index: tokenizingIndex, type: ExpressionTokenType.Unprocessed });
				openDelimiterIndex += m.groups.prefix.length;
			}

			let closeDelimiter = '';
			let tokenType: ExpressionTokenType;
			let tokenizedContents: Expression | undefined = undefined;
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
				if (tokenType != ExpressionTokenType.String) {
					tokenizedContents = new Expression(
						contents,
						this.globalIndex + tokenizingIndex + openDelimiterIndex + 1,
						this.textDocument);
				}
				contents += closeDelimiter;
			}
			contents = openDelimiter + contents;
			partialTokens.push({ text: contents, index: tokenizingIndex + openDelimiterIndex, type: tokenType, contents: tokenizedContents });
			tokenizingExpression = tokenizingExpression.slice(openDelimiterIndex + contents.length);
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
		const arrayPattern = /(\w+)\[/;
		while ((m = arrayPattern.exec(expression))) {
			let localIndex = m.index + m[0].length - 1;
			while (expression[localIndex] == '[') {  // To deal with multi-dimensional arrays
				localIndex++;
				const reference = extractToMatchingDelimiter(expression, '[', ']', localIndex);
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
		const partialTokens: ExpressionToken[] = this.tokenizeRecursiveExpressions(expression);

		// Now go back and tokenize the non-processed bits
		const tokens: ExpressionToken[] = [];
		for (const token of partialTokens) {
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
		 */
	private combineTokens(tokens: ExpressionToken[]): ExpressionToken[] {
		const combinedTokens: ExpressionToken[] = [];
		let index = -1;

		while (++index < tokens.length) {
			let token = tokens[index];
			if (token.type == ExpressionTokenType.Function) {
				// Combine functions and parentheses, or flag an error if they're missing
				// We're about to combine tokens, so move the index forward
				index++;
				if (index >= tokens.length) {
					this.parseErrors.push(this.createTokenError(token, "Function is missing its arguments"));
				}
				else {
					const secondToken = tokens[index];
					if (secondToken.type != ExpressionTokenType.Parentheses) {
						this.parseErrors.push(this.createTokenError(token, "Function must be followed by parentheses"));
					}
					else {
						// Replace the token with a combined token
						token = {
							type: ExpressionTokenType.FunctionAndContents,
							text: token.text +
								' '.repeat(secondToken.index - token.index - token.text.length) +
								secondToken.text,
							index: token.index,
							contents: secondToken.contents
						};
					}
				}
			}
			combinedTokens.push(token);
		}
		return combinedTokens;
	}

	/**
	 * Validate the expression.
	 * 
	 * Validation errors are stored in the validateErrors property.
	 * 
	 * @returns The type of the value the expression evaluates to.
	 */
	private validateExpression(): ExpressionEvalType {
		if (this.combinedTokens.length == 0) {
			return ExpressionEvalType.Empty;
		}

		const lastToken = this.combinedTokens[this.combinedTokens.length - 1];

		if (this.combinedTokens.length == 1) {
			return this.validateSingleTokenExpression(this.combinedTokens[0]);
		}

		if ((this.combinedTokens[0].type == ExpressionTokenType.MathOperator || this.combinedTokens[0].type == ExpressionTokenType.StringOperator) && this.isValueSetting) {
			const isNumberOperation = (this.combinedTokens[0].type == ExpressionTokenType.MathOperator);
			if (this.combinedTokens.length > 2) {
				const diagnostic = createDiagnostic(DiagnosticSeverity.Error, this.textDocument,
					this.globalIndex + this.combinedTokens[2].index,
					this.globalIndex + lastToken.index + lastToken.text.length,
					"Too many elements - are you missing parentheses?");
				this.validateErrors.push(diagnostic);
			}

			if (isNumberOperation && !isNumberCompatible(this.combinedTokens[1])) {
				this.validateErrors.push(this.createTokenError(
					this.combinedTokens[1], "Must be a number or a variable"
				));
				return ExpressionEvalType.Error;
			}
			if (!isNumberOperation && !isStringCompatible(this.combinedTokens[1])) {
				this.validateErrors.push(this.createTokenError(
					this.combinedTokens[1], "Must be a string or a variable"
				));
				return ExpressionEvalType.Error;
			}

			return isNumberOperation ? ExpressionEvalType.NumberChange : ExpressionEvalType.StringChange;
		}

		if (this.combinedTokens.length == 2) {
			if (isAnyOperator(this.combinedTokens[0])) {
				let message = "Must be a value or variable";
				if (this.isValueSetting) {
					message = "Must be a numeric operator, value, or variable";
				}
				this.validateErrors.push(this.createTokenError(
					this.combinedTokens[0], message
				));
			}
			else {
				const index = this.globalIndex + lastToken.index + lastToken.text.length;
				const diagnostic = createDiagnostic(DiagnosticSeverity.Error, this.textDocument,
					index, index,
					"Incomplete expression");
				this.validateErrors.push(diagnostic);
			}
			return ExpressionEvalType.Error;
		}

		if (this.combinedTokens.length > 3) {
			// Handle the corner case where someone's trying an expression like "-2 < 3" because
			// Choicescript doesn't recognize negative numbers in expressions like that
			let diagnostic: Diagnostic;

			if (
				this.combinedTokens[2].type == ExpressionTokenType.ComparisonOperator &&
				this.combinedTokens[0].text == '-' &&
				this.combinedTokens[1].type == ExpressionTokenType.Number
			) {
				diagnostic = createDiagnostic(DiagnosticSeverity.Error, this.textDocument,
					this.globalIndex + this.combinedTokens[0].index,
					this.globalIndex + this.combinedTokens[1].index + this.combinedTokens[1].text.length,
					"Negative numbers can't be used in comparisons");
			}
			else if (
				this.combinedTokens[1].type == ExpressionTokenType.ComparisonOperator &&
				this.combinedTokens[2].text == '-' &&
				this.combinedTokens[3].type == ExpressionTokenType.Number
			) {
				diagnostic = createDiagnostic(DiagnosticSeverity.Error, this.textDocument,
					this.globalIndex + this.combinedTokens[2].index,
					this.globalIndex + this.combinedTokens[3].index + this.combinedTokens[3].text.length,
					"Negative numbers can't be used in comparisons");
			}
			else {
				diagnostic = createDiagnostic(DiagnosticSeverity.Error, this.textDocument,
					this.globalIndex + this.combinedTokens[3].index,
					this.globalIndex + lastToken.index + lastToken.text.length,
					"Too many elements - are you missing parentheses?");
			}
			this.validateErrors.push(diagnostic);

			return ExpressionEvalType.Error;
		}
		else {
			return this.validateThreeTokenExpression(
				this.combinedTokens[0],
				this.combinedTokens[1],
				this.combinedTokens[2]
			);
		}
	}

	/**
	 * Validate a single token in isolation for errors.
	 * @param token Token being validated.
	 * @returns True if valid, false if there was an error.
	 */
	private validateSingleToken(token: ExpressionToken): boolean {
		// Flag bad operators
		if (token.type == ExpressionTokenType.UnknownOperator) {
			this.validateErrors.push(this.createTokenError(
				token, "Invalid operator"
			));
			return false;
		}

		// Flag missing end delimeters, which are marked by the tokens having empty tokenized contents
		if ((token.type == ExpressionTokenType.Parentheses || token.type == ExpressionTokenType.FunctionAndContents)
			&& token.contents === undefined) {
			this.validateErrors.push(this.createTokenError(
				token, "Missing end )"
			));
			return false;
		}
		else if (token.type == ExpressionTokenType.VariableReference && token.contents === undefined) {
			this.validateErrors.push(this.createTokenError(
				token, "Missing end }"
			));
			return false;
		}
		// ...except for strings
		else if (token.type == ExpressionTokenType.String && token.text[token.text.length - 1] != '"') {
			this.validateErrors.push(this.createTokenError(
				token, 'Missing end "'
			));
			return false;
		}

		// Validate functions match their contents
		if (token.type == ExpressionTokenType.FunctionAndContents && token.contents !== undefined) {
			let errorMessage: string | undefined = undefined;
			// We can only determine this if we know definitively what the content's type is
			if (token.contents.evalType != ExpressionEvalType.Empty &&
				token.contents.evalType != ExpressionEvalType.Unknowable) {
				const argumentType = functionArgumentType(token);
				if (argumentType != token.contents.evalType) {
					switch (argumentType) {
						case ExpressionEvalType.Number:
							errorMessage = "Not a number or variable";
							break;
						case ExpressionEvalType.Boolean:
							errorMessage = "Not a boolean or variable";
							break;
						case ExpressionEvalType.String:
							errorMessage = "Not a string or variable";
							break;
						case ExpressionEvalType.Error:
							errorMessage = "Unknown function error";
							break;
					}
				}
			}
			if (errorMessage !== undefined) {
				const diagnostic = createDiagnostic(DiagnosticSeverity.Error, this.textDocument,
					token.contents.globalIndex,
					token.contents.globalIndex + token.contents.bareExpression.length,
					errorMessage);
				this.validateErrors.push(diagnostic);
				return false;
			}
		}

		return true;
	}

	/**
	 * Validate a single token expression.
	 * @param token Token to validate
	 */
	private validateSingleTokenExpression(token: ExpressionToken): ExpressionEvalType {
		if (!this.validateSingleToken(token)) {
			return ExpressionEvalType.Error;
		}

		const returnValue = determineEvalType(token);

		// Operators have a valid eval type, but aren't allowed as a single token
		if (returnValue == ExpressionEvalType.Error || isAnyOperator(token)) {
			this.validateErrors.push(this.createTokenError(
				token, "Not a valid value"
			));
			return ExpressionEvalType.Error;
		}

		return returnValue;
	}

	/**
	 * Validate a three-token expression.
	 * @param first First token.
	 * @param operator Operator between the other two.
	 * @param second Second token.
	 */
	private validateThreeTokenExpression(first: ExpressionToken, operator: ExpressionToken, second: ExpressionToken): ExpressionEvalType {
		if (isAnyOperator(first)) {
			this.validateErrors.push(this.createTokenError(
				first,
				"Missing value before the operator"
			));
			return ExpressionEvalType.Error;
		}

		if (!this.validateSingleToken(first) || !this.validateSingleToken(second)) {
			return ExpressionEvalType.Error;
		}

		const firstType = tokenEffectiveType(first);
		if (firstType == ExpressionTokenType.Variable ||
			firstType == ExpressionTokenType.VariableReference) {
			if (!isAnyOperator(operator)) {
				this.validateErrors.push(this.createTokenError(
					operator, "Must be an operator"
				));
				return ExpressionEvalType.Error;
			}
			const message = checkTokenAgainstOperator(operator, second);
			if (message !== undefined) {
				this.validateErrors.push(this.createTokenError(
					second, message
				));
				return ExpressionEvalType.Error;
			}
		}
		else {
			let message = checkOperatorAgainstToken(first, operator);
			if (message !== undefined) {
				this.validateErrors.push(this.createTokenError(
					operator, message
				));
				return ExpressionEvalType.Error;
			}
			message = checkTokenAgainstOperator(operator, second);
			if (message !== undefined) {
				this.validateErrors.push(this.createTokenError(
					second, message
				));
				return ExpressionEvalType.Error;
			}
		}

		// If either of the non-operator tokens have contents with an error, return error
		if ((first.contents !== undefined && first.contents.evalType == ExpressionEvalType.Error) ||
			(second.contents !== undefined && second.contents.evalType == ExpressionEvalType.Error)) {
			return ExpressionEvalType.Error;
		}

		// Make sure the two tokens being compared are compatible
		// This is needed because we're checking each token separately against the operator, and
		// comparison operators work with multiple token types
		let neverTrue = false;
		if (operator.type == ExpressionTokenType.ComparisonOperator && isAnyDefiniteValue(first)) {
			if (isNumberCompatible(first) && !isNumberCompatible(second)) {
				neverTrue = true;
			}
			else if (isBooleanCompatible(first) && !isBooleanCompatible(second)) {
				neverTrue = true;
			}
			else if (isStringCompatible(first) && !isStringCompatible(second)) {
				neverTrue = true;
			}
		}
		if (neverTrue) {
			const diagnostic = createDiagnostic(DiagnosticSeverity.Warning,
				this.textDocument,
				this.globalIndex,
				this.globalIndex + this.bareExpression.length,
				"This will never be true");
			this.validateErrors.push(diagnostic);
		}

		const returnValue = determineEvalType(operator);
		if (returnValue == ExpressionEvalType.Error) {
			// This shouldn't happen, so just in case...
			const diagnostic = createDiagnostic(DiagnosticSeverity.Error, this.textDocument,
				this.globalIndex + first.index,
				this.globalIndex + second.index + second.text.length,
				"Unknown error");
			this.validateErrors.push(diagnostic);
		}
		return returnValue;
	}
}

/**
 * A simple token with text and its index.
 */
export interface TextWithIndex {
	text: string;
	localIndex: number;
}

/**
 * A tokenized multireplace @{variable if-true | if-false}
 */
interface Multireplace {
	unterminated: boolean;
	text: string;
	test: Expression;
	bareTest: TextWithIndex | undefined;
	body: TextWithIndex[];
	endIndex: number;
}

/**
 * Break a multireplace into tokens.
 * 
 * @param section Document section.
 * @param textDocument: Document the section is in.
 * @param contentsGlobalIndex: Global index where the multireplace contents begin (right inside the @{)).
 * @param contentsLocalIndex Index into the section where the multireplace contents begin.
 * @returns Tokenized multireplace, or undefined if there is no content to tokenize.
 */
export function tokenizeMultireplace(
	section: string, textDocument: TextDocument, contentsGlobalIndex: number, contentsLocalIndex = 0
): Multireplace | undefined {
	let test: Expression;
	let bareTest: TextWithIndex | undefined = undefined;
	const body: TextWithIndex[] = [];
	let unterminated = false;

	let workingText = extractToMatchingDelimiter(section, "{", "}", contentsLocalIndex);
	if (workingText === undefined) {
		unterminated = true;
		const fullLine = readLine(section, contentsLocalIndex);
		if (fullLine === undefined)
			return undefined;
		workingText = fullLine.line;
	}
	const fullText = workingText;

	const multireplaceEndLocalIndex = workingText.length + 1;
	let testEndLocalIndex = 0;

	if (workingText[0] == '(' || workingText[0] == '{')
	{
		const openDelimiter = workingText[0];
		const closeDelimiter = (openDelimiter == '(') ? ')' : '}';
		let testContents = extractToMatchingDelimiter(
			workingText.slice(1),
			openDelimiter,
			closeDelimiter);
		if (testContents === undefined) {
			testContents = "";
		}
		else {
			bareTest = {
				text: openDelimiter + testContents + closeDelimiter,
				localIndex: contentsLocalIndex
			};
		}
		test = new Expression(testContents, contentsGlobalIndex + 1, textDocument);
		testEndLocalIndex = testContents.length + 2;
	}
	else {
		// The multireplace only has a bare symbol or a function as its test
		// Skip over any leading whitespace
		let testStartLocalIndex = 0;
		while (testStartLocalIndex < workingText.length) {
			if (/\w/.test(workingText[testStartLocalIndex])) {
				break;
			}
			testStartLocalIndex++;
		}

		if (testStartLocalIndex == workingText.length) {
			testStartLocalIndex = 0;
			testEndLocalIndex = workingText.length;
		}
		else {
			testEndLocalIndex = testStartLocalIndex;
			while (testEndLocalIndex < workingText.length) {
				if (/\W/.test(workingText[testEndLocalIndex])) {
					break;
				}
				testEndLocalIndex++;
			}
			// We may have a function
			if (
				workingText[testEndLocalIndex] == "(" && 
				functionsLookup.has(workingText.slice(testStartLocalIndex, testEndLocalIndex))
			) {
				const functionContents = extractToMatchingDelimiter(
					workingText, "(", ")", testEndLocalIndex + 1
				);
				if (functionContents === undefined) {
					testEndLocalIndex = workingText.length;
				}
				else {
					testEndLocalIndex += functionContents.length + 2;
				}
			}
		}
		bareTest = {
			text: workingText.slice(testStartLocalIndex, testEndLocalIndex),
			localIndex: testStartLocalIndex + contentsLocalIndex
		};
		test = new Expression(bareTest.text, testStartLocalIndex + contentsGlobalIndex, textDocument);
	}

	workingText = workingText.slice(testEndLocalIndex);
	if (workingText.trim() != "") {
		const bareTokens = workingText.split('|');
		let runningIndex = 0;
		for (const bareToken of bareTokens) {
			const trimmed = bareToken.trim();
			body.push({
				text: trimmed,
				localIndex: contentsLocalIndex + testEndLocalIndex + runningIndex + bareToken.indexOf(trimmed)
			});
			runningIndex += bareToken.length + 1;
		}
	}

	return {
		unterminated: unterminated,
		text: fullText,
		test: test,
		bareTest: bareTest,
		body: body,
		endIndex: contentsLocalIndex + multireplaceEndLocalIndex
	};
}
