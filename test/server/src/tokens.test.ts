/* eslint-disable */

import { expect } from 'chai';
import 'mocha';
import { Substitute, SubstituteOf, Arg } from '@fluffy-spoon/substitute';
import { Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { Expression, tokenizeMultireplace, ExpressionTokenType, ExpressionEvalType } from '../../../server/src/tokens';

function createDocument(text: string, uri: string = "file:///scene.txt"): SubstituteOf<TextDocument> {
	let fakeDocument = Substitute.for<TextDocument>();
	fakeDocument.getText(Arg.any()).returns(text);
	fakeDocument.uri.returns(uri);
	fakeDocument.positionAt(Arg.any()).mimicks((index: number) => { return (Position.create(index, 0)); });
	return fakeDocument;
}

describe("Tokenizing", () => {
	describe("Expressions", () => {
		describe("Token Creation", () => {
			it("should tokenize floating point numbers", () => {
				let text = "1.1";
				let fakeDocument = createDocument(text);

				let expression = new Expression(text, 2, fakeDocument);

				expect(expression.tokens.length).to.equal(1);
				expect(expression.tokens[0].type).to.equal(ExpressionTokenType.Number);
			});

			it("should set the global index of tokenized parentheses properly", () => {
				let text = "(1) and (2)";
				let fakeDocument = createDocument(text);

				let expression = new Expression(text, 2, fakeDocument);

				expect(expression.tokens.length).to.equal(3);
				expect(expression.tokens[0].contents.globalIndex).to.equal(3);
				expect(expression.tokens[2].contents.globalIndex).to.equal(11);
			});

			it("should flag functions with no arguments", () => {
				let text = "true & not";
				let fakeDocument = createDocument(text);

				let expression = new Expression(text, 2, fakeDocument);

				expect(expression.parseErrors.length).to.equal(1);
				expect(expression.parseErrors[0].message).to.include("Function is missing its arguments");
				expect(expression.parseErrors[0].range.start.line).to.equal(9);
				expect(expression.parseErrors[0].range.end.line).to.equal(12);
			});

			it("should flag functions with no parentheses", () => {
				let text = "not true";
				let fakeDocument = createDocument(text);

				let expression = new Expression(text, 2, fakeDocument);

				expect(expression.parseErrors.length).to.equal(1);
				expect(expression.parseErrors[0].message).to.include("Function must be followed by parentheses");
				expect(expression.parseErrors[0].range.start.line).to.equal(2);
				expect(expression.parseErrors[0].range.end.line).to.equal(5);
			});
		});

		describe("Validation", () => {
			describe("Basic", () => {
				it("should note an empty expression", () => {
					let text = "";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.evalType).to.equal(ExpressionEvalType.Empty);
				});

				it("should be okay with just a number", () => {
					let text = "1.2";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.evalType).to.equal(ExpressionEvalType.Number);
				});

				it("should be okay with a number function", () => {
					let text = "round(1.2)";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.evalType).to.equal(ExpressionEvalType.Number);
				});

				it("should be okay with a boolean", () => {
					let text = "true";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.evalType).to.equal(ExpressionEvalType.Boolean);
				});

				it("should be okay with a boolean function", () => {
					let text = "not(true)";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.evalType).to.equal(ExpressionEvalType.Boolean);
				});

				it("should be okay with a string", () => {
					let text = '"string"';
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.evalType).to.equal(ExpressionEvalType.String);
				});

				it("should be okay with a variable", () => {
					let text = "var";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.evalType).to.equal(ExpressionEvalType.Unknowable);
				});

				it("should be okay with a variable reference", () => {
					let text = "{var}";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.evalType).to.equal(ExpressionEvalType.Unknowable);
				});

				it("should be okay with parentheses", () => {
					let text = "(1+2)";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.evalType).to.equal(ExpressionEvalType.Number);
				});

				it("should flag a bare operator", () => {
					let text = "+";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Not a valid value")
					expect(expression.validateErrors[0].range.start.line).to.equal(2);
					expect(expression.validateErrors[0].range.end.line).to.equal(3);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				});

				it("should flag an expression that starts with an operator", () => {
					let text = "+ 2";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Must be a value")
					expect(expression.validateErrors[0].range.start.line).to.equal(2);
					expect(expression.validateErrors[0].range.end.line).to.equal(3);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				});

				it("should flag a too-short expression", () => {
					let text = "1 +";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Incomplete expression")
					expect(expression.validateErrors[0].range.start.line).to.equal(5);
					expect(expression.validateErrors[0].range.end.line).to.equal(5);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				});

				it("should flag a too-long expression", () => {
					let text = "1 + 2 + 3";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Too many elements - are you missing parentheses?")
					expect(expression.validateErrors[0].range.start.line).to.equal(8);
					expect(expression.validateErrors[0].range.end.line).to.equal(11);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				});
			});

			describe("Number", () => {
				it("should be good with numbers and a math operator", () => {
					let text = "1 + 2";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.evalType).to.equal(ExpressionEvalType.Number);
				});

				it("should be good with number functions and a math operator", () => {
					let text = "round(1.2) + length(\"yup\")";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.evalType).to.equal(ExpressionEvalType.Number);
				});

				it("should flag a number with a boolean operator", () => {
					let text = "1 and 2";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Not a numeric operator")
					expect(expression.validateErrors[0].range.start.line).to.equal(4);
					expect(expression.validateErrors[0].range.end.line).to.equal(7);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				});

				it("should be okay with named numeric operators", () => {
					let text = "3 modulo 2";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(0);
				});

				it("should flag a boolean with a named numeric operator", () => {
					let text = "2 modulo false";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Must be a number or a variable")
					expect(expression.validateErrors[0].range.start.line).to.equal(11);
					expect(expression.validateErrors[0].range.end.line).to.equal(16);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				});

				it("should flag a number followed by not-an-operator", () => {
					let text = "1 2 3";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Not a numeric operator")
					expect(expression.validateErrors[0].range.start.line).to.equal(4);
					expect(expression.validateErrors[0].range.end.line).to.equal(5);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				});

				it("should flag a number with a not-number second value", () => {
					let text = "1 + true";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Must be a number or a variable")
					expect(expression.validateErrors[0].range.start.line).to.equal(6);
					expect(expression.validateErrors[0].range.end.line).to.equal(10);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				});

				it("should be okay with two numbers and a comparison", () => {
					let text = "1 < 2";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.evalType).to.equal(ExpressionEvalType.Boolean);
				});
			});

			describe("Boolean", () => {
				it("should be good with booleans and a boolean operator", () => {
					let text = "true and false";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.evalType).to.equal(ExpressionEvalType.Boolean);
				});

				it("should be good with boolean functions and a boolean operator", () => {
					let text = "not(false) and true";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.evalType).to.equal(ExpressionEvalType.Boolean);
				});

				it("should flag a boolean with a math operator", () => {
					let text = "true + false";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Not a boolean operator")
					expect(expression.validateErrors[0].range.start.line).to.equal(7);
					expect(expression.validateErrors[0].range.end.line).to.equal(8);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				});

				it("should flag a boolean followed by not-an-operator", () => {
					let text = "true false true";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Not a boolean operator")
					expect(expression.validateErrors[0].range.start.line).to.equal(7);
					expect(expression.validateErrors[0].range.end.line).to.equal(12);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				});

				it("should flag a boolean with a not-boolean second value", () => {
					let text = "true and 1";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Must be a boolean value or a variable")
					expect(expression.validateErrors[0].range.start.line).to.equal(11);
					expect(expression.validateErrors[0].range.end.line).to.equal(12);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				});
			});

			describe("String", () => {
				it("should flag an unterminated string", () => {
					let text = '"content';
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include('Missing end "');
					expect(expression.validateErrors[0].range.start.line).to.equal(2);
					expect(expression.validateErrors[0].range.end.line).to.equal(10);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				});

				it("should be good with strings and a string operator", () => {
					let text = '"string1" & "string2"';
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.evalType).to.equal(ExpressionEvalType.String);
				});

				it("should be good with strings and a comparison operator", () => {
					let text = '"string1" = "string2"';
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.evalType).to.equal(ExpressionEvalType.Boolean);
				});

				it("should flag a string with a math operator", () => {
					let text = '"s1" + "s2"';
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Not a string or comparison operator")
					expect(expression.validateErrors[0].range.start.line).to.equal(7);
					expect(expression.validateErrors[0].range.end.line).to.equal(8);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				});

				it("should flag a string followed by not-an-operator", () => {
					let text = '"s1" "s2" "s3"';
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Not a string or comparison operator")
					expect(expression.validateErrors[0].range.start.line).to.equal(7);
					expect(expression.validateErrors[0].range.end.line).to.equal(11);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				});

				it("should flag a string with a not-string second value", () => {
					let text = '"s1" & 2';
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Must be a string or a variable")
					expect(expression.validateErrors[0].range.start.line).to.equal(9);
					expect(expression.validateErrors[0].range.end.line).to.equal(10);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				});

				it("should be good with a string and index operator with a number second value", () => {
					let text = '"s1"#2';
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(0);
				});

				it("should flag a string and index operator with a not-number second value", () => {
					let text = '"s1"#"s2"';
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Must be a number or a variable")
					expect(expression.validateErrors[0].range.start.line).to.equal(7);
					expect(expression.validateErrors[0].range.end.line).to.equal(11);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				});
			});

			describe("Variable", () => {
				it("should be good with a number and a math operator", () => {
					let text = 'var + 1';
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.evalType).to.equal(ExpressionEvalType.Number);
				});

				it("should be good with a boolean and a boolean operator", () => {
					let text = 'var and true';
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.evalType).to.equal(ExpressionEvalType.Boolean);
				});

				it("should be good with a string and a string operator", () => {
					let text = 'var & "string2"';
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.evalType).to.equal(ExpressionEvalType.String);
				});

				it("should be good with a number and a comparison operator", () => {
					let text = 'var > 2';
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.evalType).to.equal(ExpressionEvalType.Boolean);
				});

				it("should flag a string and a non-equal comparison operator", () => {
					let text = 'var > "str"';
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Must be a number or a variable")
					expect(expression.validateErrors[0].range.start.line).to.equal(8);
					expect(expression.validateErrors[0].range.end.line).to.equal(13);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				});

				it("should be good with a string and a comparison operator", () => {
					let text = 'var = "string2"';
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.evalType).to.equal(ExpressionEvalType.Boolean);
				});

				it("should flag a string with a math operator", () => {
					let text = 'var1 + "s2"';
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Must be a number or a variable")
					expect(expression.validateErrors[0].range.start.line).to.equal(9);
					expect(expression.validateErrors[0].range.end.line).to.equal(13);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				});

				it("should flag a number with a boolean operator", () => {
					let text = 'var1 and 3';
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Must be a boolean value or a variable")
					expect(expression.validateErrors[0].range.start.line).to.equal(11);
					expect(expression.validateErrors[0].range.end.line).to.equal(12);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				});

				it("should flag a number with a string operator", () => {
					let text = 'var1 & 3';
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Must be a string or a variable")
					expect(expression.validateErrors[0].range.start.line).to.equal(9);
					expect(expression.validateErrors[0].range.end.line).to.equal(10);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				});

				it("should flag a variable followed by not-an-operator", () => {
					let text = 'var1 7 var3';
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Must be an operator")
					expect(expression.validateErrors[0].range.start.line).to.equal(7);
					expect(expression.validateErrors[0].range.end.line).to.equal(8);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				});
			});

			describe("Variable Reference", () => {
				it("should flag an unterminated variable reference", () => {
					let text = '{var';
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Missing end }");
					expect(expression.validateErrors[0].range.start.line).to.equal(2);
					expect(expression.validateErrors[0].range.end.line).to.equal(6);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				});
			});

			describe("Variable Setting", () => {
				it("should be good with a math operator and a number", () => {
					let text = "+ 2";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument, true);

					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.evalType).to.equal(ExpressionEvalType.NumberChange);
				});

				it("should flag extra values", () => {
					let text = "+ 2 + 3";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument, true);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Too many elements - are you missing parentheses?")
					expect(expression.validateErrors[0].range.start.line).to.equal(6);
					expect(expression.validateErrors[0].range.end.line).to.equal(9);
					expect(expression.evalType).to.equal(ExpressionEvalType.NumberChange);
				});

				it("should be good with a math operator and a number function", () => {
					let text = "- length(\"yup\")";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument, true);

					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.evalType).to.equal(ExpressionEvalType.NumberChange);
				});

				it("should flag a boolean operator", () => {
					let text = "and true";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument, true);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Must be a numeric operator, value, or variable")
					expect(expression.validateErrors[0].range.start.line).to.equal(2);
					expect(expression.validateErrors[0].range.end.line).to.equal(5);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				});

				it("should flag a number followed by not-an-operator", () => {
					let text = "1 2";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument, true);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Incomplete expression")
					expect(expression.validateErrors[0].range.start.line).to.equal(5);
					expect(expression.validateErrors[0].range.end.line).to.equal(5);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				});

				it("should flag a not-number second value", () => {
					let text = "+ true";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument, true);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Must be a number or a variable")
					expect(expression.validateErrors[0].range.start.line).to.equal(4);
					expect(expression.validateErrors[0].range.end.line).to.equal(8);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				});
			});

			describe("Comparisons", () => {
				it("should be good with comparing numbers", () => {
					let text = "2 < 3";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.evalType).to.equal(ExpressionEvalType.Boolean);
				});

				it("should flag that negative numbers can't be used before comparisons", () => {
					let text = "-2 > 1";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Negative numbers can't be used in comparisons");
					expect(expression.validateErrors[0].range.start.line).to.equal(2);
					expect(expression.validateErrors[0].range.end.line).to.equal(4);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				})


				it("should flag that negative numbers can't be used after comparisons", () => {
					let text = "2 > -1";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Negative numbers can't be used in comparisons");
					expect(expression.validateErrors[0].range.start.line).to.equal(6);
					expect(expression.validateErrors[0].range.end.line).to.equal(8);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				})

				it("should be good with comparing strings", () => {
					let text = '"this" = "that"';
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.evalType).to.equal(ExpressionEvalType.Boolean);
				});

				it("should flag comparing strings using less/greater than", () => {
					let text = '"this" < "that"';
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Not compatible with strings");
					expect(expression.validateErrors[0].range.start.line).to.equal(9);
					expect(expression.validateErrors[0].range.end.line).to.equal(10);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				});

				it("should flag comparing incompatible values", () => {
					let text = '1 = "that"';
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("This will never be true");
					expect(expression.validateErrors[0].range.start.line).to.equal(2);
					expect(expression.validateErrors[0].range.end.line).to.equal(12);
					expect(expression.evalType).to.equal(ExpressionEvalType.Boolean);
				});
			});

			describe("Parentheses", () => {
				it("should flag unbalanced parentheses", () => {
					let text = "(2 + 3";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Missing end )");
					expect(expression.validateErrors[0].range.start.line).to.equal(2);
					expect(expression.validateErrors[0].range.end.line).to.equal(8);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				});

				it("should flag unbalanced parentheses in a function", () => {
					let text = "round(2.2 + 3.3";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Missing end )");
					expect(expression.validateErrors[0].range.start.line).to.equal(2);
					expect(expression.validateErrors[0].range.end.line).to.equal(17);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				});

				it("should flag complex unbalanced parentheses in a function", () => {
					let text = "not(var1 and (var2 or var3)";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Missing end )");
					expect(expression.validateErrors[0].range.start.line).to.equal(2);
					expect(expression.validateErrors[0].range.end.line).to.equal(29);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				});

				it("should be good with parenthesized number expressions", () => {
					let text = "(2 + 3)";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);
					let subexpression = expression.combinedTokens[0].contents;

					expect(subexpression.validateErrors.length).to.equal(0);
					expect(subexpression.evalType).to.equal(ExpressionEvalType.Number);
				});

				it("should be good with parenthesized boolean expressions", () => {
					let text = "(false or true)";
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);
					let subexpression = expression.combinedTokens[0].contents;

					expect(subexpression.validateErrors.length).to.equal(0);
					expect(subexpression.evalType).to.equal(ExpressionEvalType.Boolean);
				});

				it("should be good with parenthesized string expressions", () => {
					let text = '("this" & "that")';
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);
					let subexpression = expression.combinedTokens[0].contents;

					expect(subexpression.validateErrors.length).to.equal(0);
					expect(subexpression.evalType).to.equal(ExpressionEvalType.String);
				});

				it("should flag errors in parentheses", () => {
					let text = '1 + (2 + false)';
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);
					let subexpression = expression.combinedTokens[2].contents;

					expect(subexpression.validateErrors.length).to.equal(1);
					expect(subexpression.validateErrors[0].message).to.include("Must be a number or a variable")
					expect(subexpression.validateErrors[0].range.start.line).to.equal(11);
					expect(subexpression.validateErrors[0].range.end.line).to.equal(16);
					expect(subexpression.evalType).to.equal(ExpressionEvalType.Error);
				});

				it("should flag parenthesized expressions that don't match a function", () => {
					let text = 'not(2)';
					let fakeDocument = createDocument(text);

					let expression = new Expression(text, 2, fakeDocument);

					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Not a boolean or variable")
					expect(expression.validateErrors[0].range.start.line).to.equal(6);
					expect(expression.validateErrors[0].range.end.line).to.equal(7);
					expect(expression.evalType).to.equal(ExpressionEvalType.Error);
				});
			});
		});
	});

	describe("Multireplace Tokenization", () => {
		it("should extract a multiexpression with just a variable", () => {
			let text = "variable}"
			let fakeDocument = createDocument(text);

			let tokens = tokenizeMultireplace(text, fakeDocument, 2);

			expect(tokens.unterminated).to.be.false;
			expect(tokens.test.bareExpression).to.equal("variable");
			expect(tokens.body.length).to.equal(0);
		});

		it("should extract an unterminated multiexpression with just a variable", () => {
			let text = "variable"
			let fakeDocument = createDocument(text);

			let tokens = tokenizeMultireplace(text, fakeDocument, 2);

			expect(tokens.unterminated).to.be.true;
			expect(tokens.test.bareExpression).to.equal("variable");
			expect(tokens.body.length).to.equal(0);
		});

		it("should extract a bare variable test", () => {
			let text = "variable yes | no} extra content";
			let fakeDocument = createDocument(text);

			let tokens = tokenizeMultireplace(text, fakeDocument, 2);

			expect(tokens.unterminated).to.be.false;
			expect(tokens.test.bareExpression).to.equal("variable");
			expect(tokens.test.globalIndex).to.equal(2);
		});

		it("should extract a bare variable test with an extra leading space", () => {
			let text = " variable yes | no} extra content";
			let fakeDocument = createDocument(text);

			let tokens = tokenizeMultireplace(text, fakeDocument, 2);

			expect(tokens.unterminated).to.be.false;
			expect(tokens.test.bareExpression).to.equal("variable");
			expect(tokens.test.globalIndex).to.equal(3);
		});

		it("should save a bare variable test with an extra leading space in bareTest without that space", () => {
			let text = " variable yes | no} extra content";
			let fakeDocument = createDocument(text);

			let tokens = tokenizeMultireplace(text, fakeDocument, 2);

			expect(tokens.bareTest.text).to.equal("variable")
			expect(tokens.bareTest.localIndex).to.equal(1);
		});

		it("should extract a parenthesized test", () => {
			let text = "(var1 + var2) yes | no} extra content";
			let fakeDocument = createDocument(text);

			let tokens = tokenizeMultireplace(text, fakeDocument, 2);

			expect(tokens.unterminated).to.be.false;
			expect(tokens.test.bareExpression).to.equal("var1 + var2");
			expect(tokens.test.globalIndex).to.equal(3);
		});

		it("should save a test's parentheses in bareTest", () => {
			let text = "(var1 + var2) yes | no} extra content";
			let fakeDocument = createDocument(text);

			let tokens = tokenizeMultireplace(text, fakeDocument, 2);

			expect(tokens.bareTest.text).to.equal("(var1 + var2)")
			expect(tokens.bareTest.localIndex).to.equal(0);
		});

		it("should extract a function test", () => {
			let text = "not(var1) yes | no} extra content";
			let fakeDocument = createDocument(text);

			let tokens = tokenizeMultireplace(text, fakeDocument, 2);

			expect(tokens.unterminated).to.be.false;
			expect(tokens.test.bareExpression).to.equal("not(var1)");
			expect(tokens.test.globalIndex).to.equal(2);
		});

		it("should save a function test in bareTest", () => {
			let text = "not(var1) yes | no} extra content";
			let fakeDocument = createDocument(text);

			let tokens = tokenizeMultireplace(text, fakeDocument, 2);

			expect(tokens.bareTest.text).to.equal("not(var1)")
			expect(tokens.bareTest.localIndex).to.equal(0);
		});

		it("should extract the bodies", () => {
			let text = "variable yes | no | maybe } extra content";
			let fakeDocument = createDocument(text);

			let tokens = tokenizeMultireplace(text, fakeDocument, 2);

			expect(tokens.unterminated).to.be.false;
			expect(tokens.body[0].text).to.equal("yes");
			expect(tokens.body[0].localIndex).to.equal(9);
			expect(tokens.body[1].text).to.equal("no");
			expect(tokens.body[1].localIndex).to.equal(15);
			expect(tokens.body[2].text).to.equal("maybe");
			expect(tokens.body[2].localIndex).to.equal(20);
		});

		it("should find the end index", () => {
			let text = "variable yes | no} extra content";
			let fakeDocument = createDocument(text);

			let tokens = tokenizeMultireplace(text, fakeDocument, 2);

			expect(tokens.endIndex).to.equal(18);
		});

		it("should extract starting at a given index", () => {
			let text = "other text @{variable yes | no} extra content";
			let fakeDocument = createDocument(text);

			let tokens = tokenizeMultireplace(text, fakeDocument, 2, 13);

			expect(tokens.unterminated).to.be.false;
			expect(tokens.test.bareExpression).to.equal("variable");
			expect(tokens.body[0].text).to.equal("yes");
			expect(tokens.body[1].text).to.equal("no");
		});

		it("should return indices relative to the global index", () => {
			let text = "other text @{variable yes | no} extra content";
			let fakeDocument = createDocument(text);

			let tokens = tokenizeMultireplace(text, fakeDocument, 27, 13);

			expect(tokens.test.globalIndex).to.equal(27);
			expect(tokens.body[0].localIndex).to.equal(22);
			expect(tokens.body[1].localIndex).to.equal(28);
		});

		it("should return indices relative to the global index for parenthesized tests", () => {
			let text = "other text @{(variable) yes | no} extra content";
			let fakeDocument = createDocument(text);

			let tokens = tokenizeMultireplace(text, fakeDocument, 27, 13);

			expect(tokens.test.globalIndex).to.equal(28);
			expect(tokens.body[0].localIndex).to.equal(24);
			expect(tokens.body[1].localIndex).to.equal(30);
		});

		it("should return the full text inside the multireplace", () => {
			let text = "other text @{variable yes | no} extra content";
			let fakeDocument = createDocument(text);

			let tokens = tokenizeMultireplace(text, fakeDocument, 2, 13);

			expect(tokens.text).to.equal("variable yes | no");
		});
	});
});
