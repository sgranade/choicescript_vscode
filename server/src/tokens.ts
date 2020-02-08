import { Diagnostic, TextDocument, DiagnosticSeverity } from 'vscode-languageserver';

import { stringIsNumber, extractToMatchingDelimiter, createDiagnostic } from './utilities';
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

let functionsLookup: ReadonlyMap<string, number> = new Map(functions.map(x => [x, 1]));
let numberFunctionsLookup: ReadonlyMap<string, number> = new Map(numberFunctions.map(x => [x, 1]));
let booleanFunctionsLookup: ReadonlyMap<string, number> = new Map(booleanFunctions.map(x => [x, 1]));
let booleanNamedOperatorsLookup: ReadonlyMap<string, number> = new Map(booleanNamedOperators.map(x => [x, 1]));
let numericNamedOperatorsLookup: ReadonlyMap<string, number> = new Map(numericNamedOperators.map(x => [x, 1]));
let booleanNamedValuesLookup: ReadonlyMap<string, number> = new Map(booleanNamedValues.map(x => [x, 1]));
let mathOperatorsLookup: ReadonlyMap<string, number> = new Map(mathOperators.map(x => [x, 1]));
let comparisonOperatorsLookup: ReadonlyMap<string, number> = new Map(comparisonOperators.map(x => [x, 1]));
let stringOperatorsLookup: ReadonlyMap<string, number> = new Map(stringOperators.map(x => [x, 1]));


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
export enum ExpressionResultType {
	Empty,
	Number,
	Boolean,
	String,
	NumberChange,	// The expression's changing a variable's value through an expression like "+2"
	Unknowable,	// Variable or parentheses or other non-eval'able value
	Error,
	Unprocessed
}

/**
 * Token in an expression.
 */
export interface ExpressionToken {
	text: string,
	type: ExpressionTokenType,
	index: number
}

/**
 * Determine if an expression token is compatible with a number.
 * @param token Token to test.
 */
function isNumberCompatible(token: ExpressionToken): boolean {
	let isNumberFunction = false;
	if (token.type == ExpressionTokenType.Function && numberFunctionsLookup.has(token.text)) {
		isNumberFunction = true;
	}
	else if (token.type == ExpressionTokenType.FunctionAndContents) {
		let functionName = token.text.split('(')[0];
		isNumberFunction = numberFunctionsLookup.has(functionName);
	}
	return (isNumberFunction ||
		token.type == ExpressionTokenType.Number ||
		token.type == ExpressionTokenType.VariableReference ||
		token.type == ExpressionTokenType.Variable ||
		token.type == ExpressionTokenType.Parentheses);
}

/**
 * Determine if an expression token is compatible with a boolean.
 * @param token Token to test.
 */
function isBooleanCompatible(token: ExpressionToken): boolean {
	let isBooleanFunction = false;
	if (token.type == ExpressionTokenType.Function && booleanFunctionsLookup.has(token.text)) {
		isBooleanFunction = true;
	}
	else if (token.type == ExpressionTokenType.FunctionAndContents) {
		let functionName = token.text.split('(')[0];
		isBooleanFunction = booleanFunctionsLookup.has(functionName);
	}
	return (isBooleanFunction ||
		token.type == ExpressionTokenType.BooleanNamedValue ||
		token.type == ExpressionTokenType.VariableReference ||
		token.type == ExpressionTokenType.Variable ||
		token.type == ExpressionTokenType.Parentheses);
}

/**
 * Determine if an expression token is compatible with a string.
 * @param token Token to test.
 */
function isStringCompatible(token: ExpressionToken): boolean {
	return (token.type == ExpressionTokenType.String ||
		token.type == ExpressionTokenType.VariableReference ||
		token.type == ExpressionTokenType.Variable ||
		token.type == ExpressionTokenType.Parentheses);
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

	let effectiveType: ExpressionTokenType = token.type;
	// If we've got a function, find out what its effective type is
	if (effectiveType == ExpressionTokenType.FunctionAndContents) {
		let functionName = token.text;
		if (numberFunctionsLookup.has(functionName)) {
			effectiveType = ExpressionTokenType.Number;
		}
		else if (booleanFunctionsLookup.has(functionName)) {
			effectiveType = ExpressionTokenType.BooleanNamedValue;
		}
	}

	switch(effectiveType) {
		case ExpressionTokenType.Number:
			if (operator.type !== ExpressionTokenType.MathOperator &&
				operator.type !== ExpressionTokenType.ComparisonOperator) {
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

	switch(operator.type) {
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
			if (!isStringCompatible(token)) {
				errorMessage = "Must be a string or a variable";
			}
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
 * Determine the return value of an expression with an operator.
 * 
 * The expression is assumed to be error-free.
 * @param first First token.
 * @param operator Operator between the other two tokens.
 * @param second Second token.
 */
function determineReturnValue(first: ExpressionToken, operator: ExpressionToken, second: ExpressionToken): ExpressionResultType {
	switch(operator.type) {
		case ExpressionTokenType.MathOperator:
		case ExpressionTokenType.NumericNamedOperator:
			return ExpressionResultType.Number;

		case ExpressionTokenType.ComparisonOperator:
		case ExpressionTokenType.BooleanNamedOperator:
			return ExpressionResultType.Boolean;

		case ExpressionTokenType.StringOperator:
			return ExpressionResultType.String;
	}

	return ExpressionResultType.Error;
}

export class Expression {
	readonly bareExpression: string;
	readonly globalIndex: number;
	readonly tokens: ExpressionToken[];
	readonly combinedTokens: ExpressionToken[];
	readonly resultType: ExpressionResultType;
	readonly parseErrors: Diagnostic[];
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
	constructor(bareExpression: string, globalIndex: number, textDocument: TextDocument, isValueSetting: boolean=false) {
		this.parseErrors = [];
		this.validateErrors = [];
		this.textDocument = textDocument;
		this.globalIndex = globalIndex;
		this.isValueSetting = isValueSetting;

		this.bareExpression = bareExpression;
		this.tokens = this.tokenizeExpression(bareExpression);
		this.combinedTokens = this.combineTokens(this.tokens, globalIndex, textDocument);
		this.resultType = this.validateExpression();
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
		return new Expression(subExpression, this.globalIndex + startIndex, this.textDocument, this.isValueSetting);
	}

	/**
	 * Create an error from a token.
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
					this.parseErrors.push(this.createTokenError(token, "Function is missing its arguments"));
				}
				else {
					let secondToken = tokens[index];
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
							index: token.index
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
	 * @returns What the expression evaluates to.
	 */
	private validateExpression(): ExpressionResultType {
		if (this.combinedTokens.length == 0) {
			return ExpressionResultType.Empty;
		}

		let lastToken = this.combinedTokens[this.combinedTokens.length - 1];

		if (this.combinedTokens.length == 1) {
			let token = this.combinedTokens[0];
			if (token.type == ExpressionTokenType.FunctionAndContents) {
				token = this.tokens[0];
			}
			return this.validateSingleTokenExpression(token);
		}

		if (this.combinedTokens[0].type == ExpressionTokenType.MathOperator && this.isValueSetting) {
			if (this.combinedTokens.length > 2) {
				let diagnostic = createDiagnostic(DiagnosticSeverity.Error, this.textDocument,
					this.globalIndex + this.combinedTokens[2].index,
					this.globalIndex + lastToken.index + lastToken.text.length,
					"Too many elements - are you missing parentheses?");
				this.validateErrors.push(diagnostic);
			}

			if (!isNumberCompatible(this.combinedTokens[1])) {
				this.validateErrors.push(this.createTokenError(
					this.combinedTokens[1], "Must be a number or a variable"
				));
				return ExpressionResultType.Error;
			}
			return ExpressionResultType.NumberChange;
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
				let index = this.globalIndex + lastToken.index + lastToken.text.length;
				let diagnostic = createDiagnostic(DiagnosticSeverity.Error, this.textDocument,
					index, index,
					"Incomplete expression");
				this.validateErrors.push(diagnostic);
			}
			return ExpressionResultType.Error;
		}

		if (this.combinedTokens.length > 3) {
			let diagnostic = createDiagnostic(DiagnosticSeverity.Error, this.textDocument,
				this.globalIndex + this.combinedTokens[3].index,
				this.globalIndex + lastToken.index + lastToken.text.length,
				"Too many elements - are you missing parentheses?");
			this.validateErrors.push(diagnostic);
		}

		return this.validateThreeTokenExpression(
			this.combinedTokens[0],
			this.combinedTokens[1],
			this.combinedTokens[2]
		);
	}

	/**
	 * Validate a single token expression.
	 * @param token Token to validate
	 */
	private validateSingleTokenExpression(token: ExpressionToken): ExpressionResultType {
		let resultType: ExpressionResultType;

		if (token.type == ExpressionTokenType.Number || numberFunctionsLookup.has(token.text)) {
			resultType = ExpressionResultType.Number;
		}
		else if (token.type == ExpressionTokenType.BooleanNamedValue || booleanFunctionsLookup.has(token.text)) {
			resultType = ExpressionResultType.Boolean;
		}
		else if (token.type == ExpressionTokenType.String) {
			resultType = ExpressionResultType.String;
		}
		else if (token.type == ExpressionTokenType.Variable ||
			token.type == ExpressionTokenType.VariableReference ||
			token.type == ExpressionTokenType.Parentheses) {
			resultType = ExpressionResultType.Unknowable;
		}
		else {
			this.validateErrors.push(this.createTokenError(
				token, "Not a valid value"
			));
			resultType = ExpressionResultType.Error;
		}

		return resultType;
	}

	/**
	 * Validate a three-token expression.
	 * @param first First token.
	 * @param operator Operator between the other two.
	 * @param second Second token.
	 */
	private validateThreeTokenExpression(first: ExpressionToken, operator: ExpressionToken, second: ExpressionToken): ExpressionResultType {
		if (isAnyOperator(first)) {
			this.validateErrors.push(this.createTokenError(
				first,
				"Missing value before the operator"
			));
			return ExpressionResultType.Error;
		}

		if (first.type == ExpressionTokenType.Variable ||
			first.type == ExpressionTokenType.VariableReference ||
			first.type == ExpressionTokenType.Parentheses) {
			if (!isAnyOperator(operator)) {
				this.validateErrors.push(this.createTokenError(
					operator, "Must be an operator"
				));
				return ExpressionResultType.Error;
			}
			let message = checkTokenAgainstOperator(operator, second);
			if (message !== undefined) {
				this.validateErrors.push(this.createTokenError(
					second, message
				));
				return ExpressionResultType.Error;
			}
		}
		else {
			let message = checkOperatorAgainstToken(first, operator);
			if (message !== undefined) {
				this.validateErrors.push(this.createTokenError(
					operator, message
				));
				return ExpressionResultType.Error;
			}
			message = checkTokenAgainstOperator(operator, second);
			if (message !== undefined) {
				this.validateErrors.push(this.createTokenError(
					second, message
				));
				return ExpressionResultType.Error;
			}
		}

		// No errors!
		return determineReturnValue(first, operator, second);
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
