import { expect } from 'chai';
import 'mocha';
import { Substitute, SubstituteOf, Arg } from '@fluffy-spoon/substitute';
import { TextDocument, Position, Location, Diagnostic } from 'vscode-languageserver';

import { ParserCallbacks, ParsingState, parse } from '../../../server/src/parser';

const fakeDocumentUri: string = "file:///startup.txt";

function createDocument(text: string, 
	uri: string = fakeDocumentUri): SubstituteOf<TextDocument> {
	let fakeDocument = Substitute.for<TextDocument>();
	fakeDocument.getText(Arg.any()).returns(text);
	fakeDocument.uri.returns(uri);
	fakeDocument.positionAt(Arg.any()).mimicks((index: number) => { return(Position.create(index, 0)); });
	return fakeDocument;
}

interface CommandLine {
	prefix: string,
	command: string,
	spacing: string,
	line: string,
	location: Location
}

interface Symbol {
	text: string,
	location: Location
}

interface Label {
	label: string,
	scene: string,
	labelLocation: Location | undefined,
	sceneLocation: Location | undefined
}

describe("Parser", () => {
	describe("Command Parsing", () => {
		it("should callback on anything that looks like a command", () => {
			let fakeDocument = createDocument("*fake_command");
			let received: Array<CommandLine> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onCommand(Arg.all()).mimicks(
				(prefix: string, command: string, spacing: string, line: string, l: Location, state: ParsingState) => {
				received.push({
					prefix: prefix, command: command, spacing: spacing, line: line, location: l
				});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].command).to.equal("fake_command");
		});
	
		it("should ignore commands that aren't on a line by themselves", () => {
			let fakeDocument = createDocument("incorrect *fake_command");
			let received: Array<CommandLine> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onCommand(Arg.all()).mimicks(
				(prefix: string, command: string, spacing: string, line: string, l: Location, state: ParsingState) => {
				received.push({
					prefix: prefix, command: command, spacing: spacing, line: line, location: l
				});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(0);
		});
	
		it("should send any spaces before the command", () => {
			let fakeDocument = createDocument("\n  *fake_command");
			let received: Array<CommandLine> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onCommand(Arg.all()).mimicks(
				(prefix: string, command: string, spacing: string, line: string, l: Location, state: ParsingState) => {
				received.push({
					prefix: prefix, command: command, spacing: spacing, line: line, location: l
				});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].prefix).to.equal("\n  ");
		});
	
		it("should capture spacing and the rest of the line", () => {
			let fakeDocument = createDocument("*fake_command  with arguments ");
			let received: Array<CommandLine> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onCommand(Arg.all()).mimicks(
				(prefix: string, command: string, spacing: string, line: string, l: Location, state: ParsingState) => {
				received.push({
					prefix: prefix, command: command, spacing: spacing, line: line, location: l
				});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].spacing).to.equal("  ");
			expect(received[0].line).to.equal("with arguments ");
		});
	})

	describe("Label-Referencing Command Parsing", () => {
		it("should callback on goto", () => {
			let fakeDocument = createDocument("*goto label");
			let received: Array<Label> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onLabelReference(Arg.all()).mimicks(
				(command: string, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
				received.push({label: label, scene: scene, labelLocation: labelLocation, sceneLocation: sceneLocation});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].label).to.equal("label");
			expect(received[0].labelLocation.range.start.line).to.equal(6);
			expect(received[0].labelLocation.range.end.line).to.equal(11);
		})

		it("should callback on gosub", () => {
			let fakeDocument = createDocument("*gosub label");
			let received: Array<Label> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onLabelReference(Arg.all()).mimicks(
				(command: string, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
					received.push({label: label, scene: scene, labelLocation: labelLocation, sceneLocation: sceneLocation});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].label).to.equal("label");
			expect(received[0].labelLocation.range.start.line).to.equal(7);
			expect(received[0].labelLocation.range.end.line).to.equal(12);
		})

		it("should deal with no scene on a goto", () => {
			let fakeDocument = createDocument("*goto label");
			let received: Array<Label> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onLabelReference(Arg.all()).mimicks(
				(command: string, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
					received.push({label: label, scene: scene, labelLocation: labelLocation, sceneLocation: sceneLocation});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].scene).to.equal("");
			expect(received[0].sceneLocation).is.undefined;
		})

		it("should callback on goto_scene", () => {
			let fakeDocument = createDocument("*goto_scene scenename");
			let received: Array<Label> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onLabelReference(Arg.all()).mimicks(
				(command: string, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
					received.push({label: label, scene: scene, labelLocation: labelLocation, sceneLocation: sceneLocation});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].scene).to.equal("scenename");
			expect(received[0].sceneLocation.range.start.line).to.equal(12);
			expect(received[0].sceneLocation.range.end.line).to.equal(21);
		})

		it("should callback on gosub_scene", () => {
			let fakeDocument = createDocument("*gosub_scene scenename");
			let received: Array<Label> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onLabelReference(Arg.all()).mimicks(
				(command: string, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
					received.push({label: label, scene: scene, labelLocation: labelLocation, sceneLocation: sceneLocation});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].scene).to.equal("scenename");
			expect(received[0].sceneLocation.range.start.line).to.equal(13);
			expect(received[0].sceneLocation.range.end.line).to.equal(22);
		})

		it("should deal with no label on goto_scene", () => {
			let fakeDocument = createDocument("*goto_scene scenename");
			let received: Array<Label> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onLabelReference(Arg.all()).mimicks(
				(command: string, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
					received.push({label: label, scene: scene, labelLocation: labelLocation, sceneLocation: sceneLocation});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].label).to.equal("");
			expect(received[0].labelLocation).is.undefined;
		})

		it("should deal with hyphenated scenes on goto_scene", () => {
			let fakeDocument = createDocument("*goto_scene 1-scenename");
			let received: Array<Label> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onLabelReference(Arg.all()).mimicks(
				(command: string, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
					received.push({label: label, scene: scene, labelLocation: labelLocation, sceneLocation: sceneLocation});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].scene).to.equal("1-scenename");
			expect(received[0].sceneLocation.range.start.line).to.equal(12);
			expect(received[0].sceneLocation.range.end.line).to.equal(23);
		})

		it("should send scene and label on goto_scene", () => {
			let fakeDocument = createDocument("*goto_scene scenename labelname");
			let received: Array<Label> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onLabelReference(Arg.all()).mimicks(
				(command: string, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
				received.push({label: label, scene: scene, labelLocation: labelLocation, sceneLocation: sceneLocation});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].label).to.equal("labelname");
			expect(received[0].labelLocation.range.start.line).to.equal(22);
			expect(received[0].labelLocation.range.end.line).to.equal(31);
		})
	})
	
	describe("Symbol-Creation Command Parsing", () => {
		it("should callback on global variable creation", () => {
			let fakeDocument = createDocument("*create variable 3");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onGlobalVariableCreate(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(8);
			expect(received[0].location.range.end.line).to.equal(16);
		});
	
		it("should callback on references in global variable creation", () => {
			let fakeDocument = createDocument("*create variable {other_variable}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("other_variable");
			expect(received[0].location.range.start.line).to.equal(18);
			expect(received[0].location.range.end.line).to.equal(32);
		});
	
		it("should callback on local variable creation", () => {
			let fakeDocument = createDocument("*temp variable 3");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onLocalVariableCreate(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(6);
			expect(received[0].location.range.end.line).to.equal(14);
		});
	
		it("should callback on param variable creation", () => {
			let fakeDocument = createDocument("*params var1 var2");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onLocalVariableCreate(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(2);
			expect(received[0].text).to.equal("var1");
			expect(received[0].location.range.start.line).to.equal(8);
			expect(received[0].location.range.end.line).to.equal(12);
			expect(received[1].text).to.equal("var2");
			expect(received[1].location.range.start.line).to.equal(13);
			expect(received[1].location.range.end.line).to.equal(17);
		});
	
		it("should callback on references in local variable creation", () => {
			let fakeDocument = createDocument("*temp variable {other_variable}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("other_variable");
			expect(received[0].location.range.start.line).to.equal(16);
			expect(received[0].location.range.end.line).to.equal(30);
		});
	
		it("should callback on label creation", () => {
			let fakeDocument = createDocument("*label variable");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onLabelCreate(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(7);
			expect(received[0].location.range.end.line).to.equal(15);
		});
	})
	
	describe("Symbol-Manipulating Command Parsing", () => {
		it("should callback on delete commands", () => {
			let fakeDocument = createDocument("*delete variable");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(8);
			expect(received[0].location.range.end.line).to.equal(16);
		});
	
		it("should callback on rand commands", () => {
			let fakeDocument = createDocument("*rand variable 0 100");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(6);
			expect(received[0].location.range.end.line).to.equal(14);
		});
	
		it("should callback on input_text commands", () => {
			let fakeDocument = createDocument("*input_text variable");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(12);
			expect(received[0].location.range.end.line).to.equal(20);
		});
	
		it("should callback on input_number commands", () => {
			let fakeDocument = createDocument("*input_number variable");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(14);
			expect(received[0].location.range.end.line).to.equal(22);
		});
	
		it("should callback on bare variables", () => {
			let fakeDocument = createDocument("*set variable 3");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(5);
			expect(received[0].location.range.end.line).to.equal(13);
		});
	
		it("should callback on variables that are added to", () => {
			let fakeDocument = createDocument("*set variable+3");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(5);
			expect(received[0].location.range.end.line).to.equal(13);
		});
	
		it("should callback on variable references", () => {
			let fakeDocument = createDocument("*set {variable} 3");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(6);
			expect(received[0].location.range.end.line).to.equal(14);
		});
	
		it("should not callback on strings", () => {
			let fakeDocument = createDocument('*set variable "value"');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
		});
	
		it("should callback on complex variable references", () => {
			let fakeDocument = createDocument('*set {"this" + variable} 3');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(15);
			expect(received[0].location.range.end.line).to.equal(23);
		});
	
		it("should callback on variable replacements in strings", () => {
			let fakeDocument = createDocument('*set variable "${other_variable}"');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(2);
			expect(received[0].text).to.equal("other_variable");
			expect(received[0].location.range.start.line).to.equal(17);
			expect(received[0].location.range.end.line).to.equal(31);
			expect(received[1].text).to.equal("variable");
		});
	
		it("should callback on multireplacements in strings", () => {
			let fakeDocument = createDocument('*set variable "@{other_variable this | that}"');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(2);
			expect(received[0].text).to.equal("other_variable");
			expect(received[0].location.range.start.line).to.equal(17);
			expect(received[0].location.range.end.line).to.equal(31);
			expect(received[1].text).to.equal("variable");
		});
	
		it("should not callback on variable references in strings", () => {
			let fakeDocument = createDocument('*set variable "{other_variable}"');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
		});
	
		it("should not callback on named operators", () => {
			let fakeDocument = createDocument('*set variable 4 modulo 2');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
		});
	
	
		it("should not callback on functions", () => {
			let fakeDocument = createDocument('*set variable round(2.3)');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
		});
	
		it("should not callback on named values", () => {
			let fakeDocument = createDocument('*set variable true');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
		});
	})
	
	describe("Replace Parsing", () => {
		it("should callback on bare variables", () => {
			let fakeDocument = createDocument("${variable}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(2);
			expect(received[0].location.range.end.line).to.equal(10);
		});
	
		it("should callback on capitalized replacements", () => {
			let fakeDocument = createDocument("$!{variable}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(3);
			expect(received[0].location.range.end.line).to.equal(11);
		});
	
		it("should callback on all-caps replacements", () => {
			let fakeDocument = createDocument("$!!{variable}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(4);
			expect(received[0].location.range.end.line).to.equal(12);
		});
	
		it("should callback on multiple variables in the replacement", () => {
			let fakeDocument = createDocument('${var1 + var2}');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(2);
			expect(received[0].text).to.equal("var1");
			expect(received[0].location.range.start.line).to.equal(2);
			expect(received[0].location.range.end.line).to.equal(6);
			expect(received[1].text).to.equal("var2");
			expect(received[1].location.range.start.line).to.equal(9);
			expect(received[1].location.range.end.line).to.equal(13);
		});
	
		it("should not callback on strings in the replacement", () => {
			let fakeDocument = createDocument('${"var1" && var2}');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("var2");
			expect(received[0].location.range.start.line).to.equal(12);
			expect(received[0].location.range.end.line).to.equal(16);
		});
	
		it("should callback on multireplacements in the replacement", () => {
			let fakeDocument = createDocument('${@{var1 true | false}}');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("var1");
			expect(received[0].location.range.start.line).to.equal(4);
			expect(received[0].location.range.end.line).to.equal(8);
		});
	})
	
	describe("Multireplace Parsing", () => {
		it("should callback on bare variables in the test", () => {
			let fakeDocument = createDocument("@{variable this | that}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(2);
			expect(received[0].location.range.end.line).to.equal(10);
		});
	
		it("should callback on multiple variables in the test", () => {
			let fakeDocument = createDocument('@{(var1 + var2 > 2) true | false}');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(2);
			expect(received[0].text).to.equal("var1");
			expect(received[0].location.range.start.line).to.equal(3);
			expect(received[0].location.range.end.line).to.equal(7);
			expect(received[1].text).to.equal("var2");
			expect(received[1].location.range.start.line).to.equal(10);
			expect(received[1].location.range.end.line).to.equal(14);
		});
	
		it("should not callback on strings in the test", () => {
			let fakeDocument = createDocument('@{("var1" = var2) true | false}');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("var2");
			expect(received[0].location.range.start.line).to.equal(12);
			expect(received[0].location.range.end.line).to.equal(16);
		});
	
		it("should callback on variables in the body", () => {
			let fakeDocument = createDocument('@{true true bit | ${var}}');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("var");
			expect(received[0].location.range.start.line).to.equal(20);
			expect(received[0].location.range.end.line).to.equal(23);
		});
	})
	
	describe("Variable-Referencing Command Parsing", () => {
		it("should callback on local variables directly after a reference comand", () => {
			let fakeDocument = createDocument("*if variable > 1");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(4);
			expect(received[0].location.range.end.line).to.equal(12);
		});
	
		it("should callback on local variables in parentheses", () => {
			let fakeDocument = createDocument("*if (variable > 1)");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(5);
			expect(received[0].location.range.end.line).to.equal(13);
		});
	
		it("should not callback on strings", () => {
			let fakeDocument = createDocument('*if variable = "other_variable"');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(4);
			expect(received[0].location.range.end.line).to.equal(12);
		});
	
		it("should callback on variable replacements in strings", () => {
			let fakeDocument = createDocument('*if variable = "${other_variable}"');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(2);
			expect(received[0].text).to.equal("other_variable");
			expect(received[0].location.range.start.line).to.equal(18);
			expect(received[0].location.range.end.line).to.equal(32);
		});
	
		it("should callback on complex variable replacements in strings", () => {
			let fakeDocument = createDocument('*if variable = "${"this" & other_variable}"');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(2);
			expect(received[0].text).to.equal("other_variable");
			expect(received[0].location.range.start.line).to.equal(27);
			expect(received[0].location.range.end.line).to.equal(41);
		});
	
		it("should callback on multireplacements in strings", () => {
			let fakeDocument = createDocument('*if variable = "@{other_variable this | that}"');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(2);
			expect(received[0].text).to.equal("other_variable");
			expect(received[0].location.range.start.line).to.equal(18);
			expect(received[0].location.range.end.line).to.equal(32);
		});
	
		it("should callback on multireplacements with replacements in strings", () => {
			let fakeDocument = createDocument('*if variable = "@{true ${other_variable} | that}"');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(2);
			expect(received[0].text).to.equal("other_variable");
			expect(received[0].location.range.start.line).to.equal(25);
			expect(received[0].location.range.end.line).to.equal(39);
		});
	
		it("should not callback on choice text after a reference command", () => {
			let fakeDocument = createDocument("*if variable # This is a choice");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(4);
			expect(received[0].location.range.end.line).to.equal(12);
		});
	})
	
	describe("Scene Parsing", () => {
		it("should callback on scene definitions", () => {
			let fakeDocument = createDocument("*scene_list\n\tscene-1\n\tscene-2\n");
			let received: Array<Array<string>> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onSceneDefinition(Arg.all()).mimicks((s: string[], l: Location, state: ParsingState) => {
				received.push(s);
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received).to.eql([['scene-1', 'scene-2']]);
		});
	})
	
	describe("Achievement Parsing", () => {
		it("should callback on an achievement", () => {
			let fakeDocument = createDocument("*achievement code_name");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onAchievementCreate(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("code_name");
			expect(received[0].location.range.start.line).to.equal(13);
			expect(received[0].location.range.end.line).to.equal(22);
		});
	})

	describe("Errors", () => {
		it("should flag non-existent commands", () => {
			let fakeDocument = createDocument("*fake_command");
			let received: Array<Diagnostic> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
				received.push(e);
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].message).to.include("*fake_command isn't a valid");
			expect(received[0].range.start.line).to.equal(1);
			expect(received[0].range.end.line).to.equal(13);
		});

		it("should flag commands with missing arguments", () => {
			let fakeDocument = createDocument("*set");
			let received: Array<Diagnostic> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
				received.push(e);
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].message).to.include("*set is missing its");
			expect(received[0].range.start.line).to.equal(1);
			expect(received[0].range.end.line).to.equal(4);
		});

		it("should flag commands that can only be used in startup.txt", () => {
			let fakeDocument = createDocument("*create var 3", "file:///scene.txt");
			let received: Array<Diagnostic> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
				received.push(e);
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].message).to.include("*create can only be used in");
			expect(received[0].range.start.line).to.equal(1);
			expect(received[0].range.end.line).to.equal(7);
		});

		it("should flag an unterminated replace", () => {
			let fakeDocument = createDocument("replace ${ with errors");
			let received: Array<Diagnostic> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
				received.push(e);
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].message).to.include("Replacement is missing its }");
			expect(received[0].range.start.line).to.equal(8);
			expect(received[0].range.end.line).to.equal(22);
		});

		it("should flag an empty replace", () => {
			let fakeDocument = createDocument("replace ${} with errors");
			let received: Array<Diagnostic> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
				received.push(e);
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].message).to.include("Replacement is empty");
			expect(received[0].range.start.line).to.equal(8);
			expect(received[0].range.end.line).to.equal(11);
		});

		it("should flag an unterminated multireplace", () => {
			let fakeDocument = createDocument("multireplace @{ no end in sight");
			let received: Array<Diagnostic> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
				received.push(e);
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].message).to.include("Multireplace is missing its }");
			expect(received[0].range.start.line).to.equal(13);
			expect(received[0].range.end.line).to.equal(31);
		});

		it("should flag an empty multireplace", () => {
			let fakeDocument = createDocument("multireplace @{} with errors");
			let received: Array<Diagnostic> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
				received.push(e);
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].message).to.include("Multireplace is empty");
			expect(received[0].range.start.line).to.equal(13);
			expect(received[0].range.end.line).to.equal(16);
		});

		it("should flag a multireplace with no options", () => {
			let fakeDocument = createDocument("multireplace @{var} with errors");
			let received: Array<Diagnostic> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
				received.push(e);
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].message).to.include("Multireplace has no options");
			expect(received[0].range.start.line).to.equal(18);
			expect(received[0].range.end.line).to.equal(19);
		});

		it("should flag a multireplace with only one option", () => {
			let fakeDocument = createDocument("multireplace @{var true} with errors");
			let received: Array<Diagnostic> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
				received.push(e);
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].message).to.include("Multireplace must have at least two options separated by |");
			expect(received[0].range.start.line).to.equal(23);
			expect(received[0].range.end.line).to.equal(24);
		});
	})
})
