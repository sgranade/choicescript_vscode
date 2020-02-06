import { expect } from 'chai';
import 'mocha';
import { Substitute, SubstituteOf, Arg } from '@fluffy-spoon/substitute';
import { TextDocument, Position } from 'vscode-languageserver';

import { Expression, tokenizeMultireplace, ExpressionTokenType, ExpressionResultType } from '../../../server/src/tokens';

function createDocument(text: string, uri: string = "file:///scene.txt"): SubstituteOf<TextDocument> {
	let fakeDocument = Substitute.for<TextDocument>();
	fakeDocument.getText(Arg.any()).returns(text);
	fakeDocument.uri.returns(uri);
	fakeDocument.positionAt(Arg.any()).mimicks((index: number) => { return(Position.create(index, 0)); });
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
				let text = "not var1";
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
					expect(expression.resultType).to.equal(ExpressionResultType.Empty);
				});
	
				it("should be okay with just a number", () => {
					let text = "1.2";
					let fakeDocument = createDocument(text);
	
					let expression = new Expression(text, 2, fakeDocument);
	
					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.resultType).to.equal(ExpressionResultType.Number);
				});
	
				it("should be okay with a number function", () => {
					let text = "round(1.2)";
					let fakeDocument = createDocument(text);
	
					let expression = new Expression(text, 2, fakeDocument);
	
					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.resultType).to.equal(ExpressionResultType.Number);
				});
	
				it("should be okay with a boolean", () => {
					let text = "true";
					let fakeDocument = createDocument(text);
	
					let expression = new Expression(text, 2, fakeDocument);
	
					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.resultType).to.equal(ExpressionResultType.Boolean);
				});
	
				it("should be okay with a boolean function", () => {
					let text = "not(true)";
					let fakeDocument = createDocument(text);
	
					let expression = new Expression(text, 2, fakeDocument);
	
					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.resultType).to.equal(ExpressionResultType.Boolean);
				});
	
				it("should be okay with a string", () => {
					let text = '"string"';
					let fakeDocument = createDocument(text);
	
					let expression = new Expression(text, 2, fakeDocument);
	
					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.resultType).to.equal(ExpressionResultType.String);
				});
	
				it("should be okay with a variable", () => {
					let text = "var";
					let fakeDocument = createDocument(text);
	
					let expression = new Expression(text, 2, fakeDocument);
	
					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.resultType).to.equal(ExpressionResultType.Unknowable);
				});
	
				it("should be okay with a variable reference", () => {
					let text = "{var}";
					let fakeDocument = createDocument(text);
	
					let expression = new Expression(text, 2, fakeDocument);
	
					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.resultType).to.equal(ExpressionResultType.Unknowable);
				});
	
				it("should be okay with parentheses", () => {
					let text = "(1+2)";
					let fakeDocument = createDocument(text);
	
					let expression = new Expression(text, 2, fakeDocument);
	
					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.resultType).to.equal(ExpressionResultType.Unknowable);
				});
	
				it("should flag a bare operator", () => {
					let text = "+";
					let fakeDocument = createDocument(text);
	
					let expression = new Expression(text, 2, fakeDocument);
	
					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Not a valid value")
					expect(expression.validateErrors[0].range.start.line).to.equal(2);
					expect(expression.validateErrors[0].range.end.line).to.equal(3);
					expect(expression.resultType).to.equal(ExpressionResultType.Error);
				});
	
				it("should ignore an expression that starts with an operator", () => {
					let text = "+ 2";
					let fakeDocument = createDocument(text);
	
					let expression = new Expression(text, 2, fakeDocument);
	
					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.resultType).to.equal(ExpressionResultType.Unprocessed);
				});
	
				it("should flag a too-short expression", () => {
					let text = "1 +";
					let fakeDocument = createDocument(text);
	
					let expression = new Expression(text, 2, fakeDocument);
	
					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Incomplete expression")
					expect(expression.validateErrors[0].range.start.line).to.equal(5);
					expect(expression.validateErrors[0].range.end.line).to.equal(5);
					expect(expression.resultType).to.equal(ExpressionResultType.Error);
				});
	
				it("should flag a too-long expression", () => {
					let text = "1 + 2 + 3";
					let fakeDocument = createDocument(text);
	
					let expression = new Expression(text, 2, fakeDocument);
	
					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Too many elements - are you missing parentheses?")
					expect(expression.validateErrors[0].range.start.line).to.equal(8);
					expect(expression.validateErrors[0].range.end.line).to.equal(11);
					expect(expression.resultType).to.equal(ExpressionResultType.Number);
				});	
			});

			describe("Number", () => {
				it("should be good with numbers and a math operator", () => {
					let text = "1 + 2";
					let fakeDocument = createDocument(text);
	
					let expression = new Expression(text, 2, fakeDocument);
	
					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.resultType).to.equal(ExpressionResultType.Number);
				});
	
				it("should be good with number functions and a math operator", () => {
					let text = "round(1.2) + length(\"yup\")";
					let fakeDocument = createDocument(text);
	
					let expression = new Expression(text, 2, fakeDocument);
	
					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.resultType).to.equal(ExpressionResultType.Number);
				});
	
				it("should flag a number with a boolean operator", () => {
					let text = "1 and 2";
					let fakeDocument = createDocument(text);
	
					let expression = new Expression(text, 2, fakeDocument);
	
					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Not a numeric operator")
					expect(expression.validateErrors[0].range.start.line).to.equal(4);
					expect(expression.validateErrors[0].range.end.line).to.equal(7);
					expect(expression.resultType).to.equal(ExpressionResultType.Error);
				});
	
				it("should flag a number followed by not-an-operator", () => {
					let text = "1 2 3";
					let fakeDocument = createDocument(text);
	
					let expression = new Expression(text, 2, fakeDocument);
	
					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Not a numeric operator")
					expect(expression.validateErrors[0].range.start.line).to.equal(4);
					expect(expression.validateErrors[0].range.end.line).to.equal(5);
					expect(expression.resultType).to.equal(ExpressionResultType.Error);
				});
	
				it("should flag a number with a not-number second value", () => {
					let text = "1 + true";
					let fakeDocument = createDocument(text);
	
					let expression = new Expression(text, 2, fakeDocument);
	
					expect(expression.validateErrors.length).to.equal(1);
					expect(expression.validateErrors[0].message).to.include("Must be a number, variable, or parentheses")
					expect(expression.validateErrors[0].range.start.line).to.equal(6);
					expect(expression.validateErrors[0].range.end.line).to.equal(10);
					expect(expression.resultType).to.equal(ExpressionResultType.Error);
				});
	
				it("should be okay with two numbers and a comparison", () => {
					let text = "1 < 2";
					let fakeDocument = createDocument(text);
	
					let expression = new Expression(text, 2, fakeDocument);
	
					expect(expression.validateErrors.length).to.equal(0);
					expect(expression.resultType).to.equal(ExpressionResultType.Boolean);
				});
			});
		});
	});

	describe("Multireplace Tokenization", () => {
		it("should extract a bare variable test", () => {
			let text = "variable yes | no} extra content";
	
			let tokens = tokenizeMultireplace(text);
	
			expect(tokens.test.text).to.equal("variable");
			expect(tokens.test.index).to.equal(0);
		});
	
		it("should extract a parenthesized test", () => {
			let text = "(var1 + var2) yes | no} extra content";
	
			let tokens = tokenizeMultireplace(text);
	
			expect(tokens.test.text).to.equal("var1 + var2");
			expect(tokens.test.index).to.equal(1);
		});
	
		it("should extract the bodies", () => {
			let text = "variable yes | no | maybe } extra content";
	
			let tokens = tokenizeMultireplace(text);
	
			expect(tokens.body[0].text).to.equal("yes");
			expect(tokens.body[0].index).to.equal(9);
			expect(tokens.body[1].text).to.equal("no");
			expect(tokens.body[1].index).to.equal(15);
			expect(tokens.body[2].text).to.equal("maybe");
			expect(tokens.body[2].index).to.equal(20);
		});
	
		it("should find the end index", () => {
			let text = "variable yes | no} extra content";
	
			let tokens = tokenizeMultireplace(text);
	
			expect(tokens.endIndex).to.equal(18);
		});
	
		it("should extract starting at a given index", () => {
			let text = "other text @{variable yes | no} extra content";
	
			let tokens = tokenizeMultireplace(text, 13);
	
			expect(tokens.test.text).to.equal("variable");
			expect(tokens.body[0].text).to.equal("yes");
			expect(tokens.body[1].text).to.equal("no");
		});
	
		it("should return indices relative to the global index", () => {
			let text = "other text @{variable yes | no} extra content";
	
			let tokens = tokenizeMultireplace(text, 13);
	
			expect(tokens.test.index).to.equal(13);
			expect(tokens.body[0].index).to.equal(22);
			expect(tokens.body[1].index).to.equal(28);
		});

		it("should return the full text inside the multireplace", () => {
			let text = "other text @{variable yes | no} extra content";
	
			let tokens = tokenizeMultireplace(text, 13);
	
			expect(tokens.text).to.equal("variable yes | no");
		});
	});
});
