import { expect } from 'chai';
import 'mocha';
import { Substitute, SubstituteOf, Arg } from '@fluffy-spoon/substitute';
import { TextDocument, Position, Location, Diagnostic } from 'vscode-languageserver';

import { ParserCallbacks, ParsingState, parse } from '../../../server/src/parser';
import { FlowControlEvent } from '../../../server/src';

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

	describe("Flow Control Command Parsing", () => {
		it("should callback on return", () => {
			let fakeDocument = createDocument("*return");
			let received: Array<FlowControlEvent> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onFlowControlEvent(Arg.all()).mimicks(
				(command: string, commandLocation: Location, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
				received.push({command: command, commandLocation: commandLocation, label: label, scene: scene, labelLocation: labelLocation, sceneLocation: sceneLocation});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
		})

		it("should callback on goto", () => {
			let fakeDocument = createDocument("*goto label");
			let received: Array<FlowControlEvent> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onFlowControlEvent(Arg.all()).mimicks(
				(command: string, commandLocation: Location, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
					received.push({command: command, commandLocation: commandLocation, label: label, scene: scene, labelLocation: labelLocation, sceneLocation: sceneLocation});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].label).to.equal("label");
			expect(received[0].labelLocation.range.start.line).to.equal(6);
			expect(received[0].labelLocation.range.end.line).to.equal(11);
		})

		it("should callback on gosub", () => {
			let fakeDocument = createDocument("*gosub label");
			let received: Array<FlowControlEvent> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onFlowControlEvent(Arg.all()).mimicks(
				(command: string, commandLocation: Location, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
					received.push({command: command, commandLocation: commandLocation, label: label, scene: scene, labelLocation: labelLocation, sceneLocation: sceneLocation});	
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].label).to.equal("label");
			expect(received[0].labelLocation.range.start.line).to.equal(7);
			expect(received[0].labelLocation.range.end.line).to.equal(12);
		})

		it("should create a reference on goto with a reference scene", () => {
			let fakeDocument = createDocument("*goto {variable}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(7);
			expect(received[0].location.range.end.line).to.equal(15);
		})

		it("should deal with no scene on a goto", () => {
			let fakeDocument = createDocument("*goto label");
			let received: Array<FlowControlEvent> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onFlowControlEvent(Arg.all()).mimicks(
				(command: string, commandLocation: Location, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
					received.push({command: command, commandLocation: commandLocation, label: label, scene: scene, labelLocation: labelLocation, sceneLocation: sceneLocation});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].scene).to.equal("");
			expect(received[0].sceneLocation).is.undefined;
		})

		it("should callback on goto_scene", () => {
			let fakeDocument = createDocument("*goto_scene scenename");
			let received: Array<FlowControlEvent> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onFlowControlEvent(Arg.all()).mimicks(
				(command: string, commandLocation: Location, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
					received.push({command: command, commandLocation: commandLocation, label: label, scene: scene, labelLocation: labelLocation, sceneLocation: sceneLocation});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].scene).to.equal("scenename");
			expect(received[0].sceneLocation.range.start.line).to.equal(12);
			expect(received[0].sceneLocation.range.end.line).to.equal(21);
		})

		it("should callback on gosub_scene", () => {
			let fakeDocument = createDocument("*gosub_scene scenename");
			let received: Array<FlowControlEvent> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onFlowControlEvent(Arg.all()).mimicks(
				(command: string, commandLocation: Location, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
					received.push({command: command, commandLocation: commandLocation, label: label, scene: scene, labelLocation: labelLocation, sceneLocation: sceneLocation});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].scene).to.equal("scenename");
			expect(received[0].sceneLocation.range.start.line).to.equal(13);
			expect(received[0].sceneLocation.range.end.line).to.equal(22);
		})

		it("should deal with no label on goto_scene", () => {
			let fakeDocument = createDocument("*goto_scene scenename");
			let received: Array<FlowControlEvent> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onFlowControlEvent(Arg.all()).mimicks(
				(command: string, commandLocation: Location, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
					received.push({command: command, commandLocation: commandLocation, label: label, scene: scene, labelLocation: labelLocation, sceneLocation: sceneLocation});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].label).to.equal("");
			expect(received[0].labelLocation).is.undefined;
		})

		it("should deal with hyphenated scenes on goto_scene", () => {
			let fakeDocument = createDocument("*goto_scene 1-scenename");
			let received: Array<FlowControlEvent> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onFlowControlEvent(Arg.all()).mimicks(
				(command: string, commandLocation: Location, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
					received.push({command: command, commandLocation: commandLocation, label: label, scene: scene, labelLocation: labelLocation, sceneLocation: sceneLocation});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].scene).to.equal("1-scenename");
			expect(received[0].sceneLocation.range.start.line).to.equal(12);
			expect(received[0].sceneLocation.range.end.line).to.equal(23);
		})

		it("should send scene and label on goto_scene", () => {
			let fakeDocument = createDocument("*goto_scene scenename labelname");
			let received: Array<FlowControlEvent> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onFlowControlEvent(Arg.all()).mimicks(
				(command: string, commandLocation: Location, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
					received.push({command: command, commandLocation: commandLocation, label: label, scene: scene, labelLocation: labelLocation, sceneLocation: sceneLocation});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].label).to.equal("labelname");
			expect(received[0].labelLocation.range.start.line).to.equal(22);
			expect(received[0].labelLocation.range.end.line).to.equal(31);
		})

		it("should create a reference if necessary from the label", () => {
			let fakeDocument = createDocument("*goto_scene scenename {variable}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(23);
			expect(received[0].location.range.end.line).to.equal(31);

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
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(5);
			expect(received[0].location.range.end.line).to.equal(13);
			expect(received[1].text).to.equal("other_variable");
			expect(received[1].location.range.start.line).to.equal(17);
			expect(received[1].location.range.end.line).to.equal(31);
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
			expect(received[0].text).to.equal("variable");
			expect(received[1].text).to.equal("other_variable");
			expect(received[1].location.range.start.line).to.equal(17);
			expect(received[1].location.range.end.line).to.equal(31);
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

		it("should not callback on arrays", () => {
			let fakeDocument = createDocument("*set variable[other_var] 3");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(0);
		});

		it("should not callback on 2D array references", () => {
			let fakeDocument = createDocument("*set variable[other_var][another_var] final_var");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("final_var");
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

		it("should not choke on a mistakenly nested multi-replace", () => {
			let fakeDocument = createDocument('@{var1 true bit | @{var2 other true bit | false bit}}');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("var1");
			expect(received[0].location.range.start.line).to.equal(2);
			expect(received[0].location.range.end.line).to.equal(6);
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
			expect(received[1].text).to.equal("other_variable");
			expect(received[1].location.range.start.line).to.equal(18);
			expect(received[1].location.range.end.line).to.equal(32);
		});
	
		it("should callback on complex variable replacements in strings", () => {
			let fakeDocument = createDocument('*if variable = "${other_variable}"');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(2);
			expect(received[1].text).to.equal("other_variable");
			expect(received[1].location.range.start.line).to.equal(18);
			expect(received[1].location.range.end.line).to.equal(32);
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
			expect(received[1].text).to.equal("other_variable");
			expect(received[1].location.range.start.line).to.equal(18);
			expect(received[1].location.range.end.line).to.equal(32);
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
			expect(received[1].text).to.equal("other_variable");
			expect(received[1].location.range.start.line).to.equal(25);
			expect(received[1].location.range.end.line).to.equal(39);
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

		it("should not callback on array references", () => {
			let fakeDocument = createDocument('*if variable[other_var] = "other_variable"');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(0);
		});
	
		it("should not callback on 2D arrays", () => {
			let fakeDocument = createDocument('*if variable[other_var][another_var] = "other_variable"');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(0);
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
	
	describe("Stat Chart Command Parsing", () => {
		it("should callback on references in text commands", () => {
			let fakeDocument = createDocument("*stat_chart\n\ttext text_var");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("text_var");
			expect(received[0].location.range.start.line).to.equal(18);
			expect(received[0].location.range.end.line).to.equal(26);
		});

		it("should handle variable references in text commands", () => {
			let fakeDocument = createDocument("*stat_chart\n\ttext {text_var}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("text_var");
			expect(received[0].location.range.start.line).to.equal(19);
			expect(received[0].location.range.end.line).to.equal(27);
		});

		it("should handle variable replacements in text commands", () => {
			let fakeDocument = createDocument("*stat_chart\n\ttext text_var ${title_var}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(2);
			expect(received[1].text).to.equal("title_var");
			expect(received[1].location.range.start.line).to.equal(29);
			expect(received[1].location.range.end.line).to.equal(38);
		});

		it("should callback on references in percent commands", () => {
			let fakeDocument = createDocument("*stat_chart\n\tpercent percent_var New Name");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("percent_var");
			expect(received[0].location.range.start.line).to.equal(21);
			expect(received[0].location.range.end.line).to.equal(32);
		});

		it("should callback on references in opposed_pair commands", () => {
			let fakeDocument = createDocument("*stat_chart\n\topposed_pair pair_var\n\t\tThis\n\t\tThat");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("pair_var");
			expect(received[0].location.range.start.line).to.equal(26);
			expect(received[0].location.range.end.line).to.equal(34);
		});

		it("should callback on all references in a stat chart", () => {
			let fakeDocument = createDocument("*stat_chart\n\topposed_pair pair_var\n\t\tThis\n\t\tThat\n\ttext text_var\n\tpercent percent_var Percentile");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(3);
			expect(received[1].text).to.equal("text_var");
			expect(received[1].location.range.start.line).to.equal(55);
			expect(received[1].location.range.end.line).to.equal(63);
			expect(received[2].text).to.equal("percent_var");
			expect(received[2].location.range.start.line).to.equal(73);
			expect(received[2].location.range.end.line).to.equal(84);
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

		it("should callback on a reference to an achievement", () => {
			let fakeDocument = createDocument("*achieve code_name");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onAchievementReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({text: s, location: l});
			})
	
			parse(fakeDocument, fakeCallbacks);
	
			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("code_name");
			expect(received[0].location.range.start.line).to.equal(9);
			expect(received[0].location.range.end.line).to.equal(18);
		});
	})

	describe("Errors", () => {
		describe("Commands", () => {
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
		});

		describe("Replacements", () => {
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
	
			it("should not flag a multireplace with a blank first option", () => {
				let fakeDocument = createDocument("multireplace @{(var) |, the redsmith's son,}");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(0);
			});
	
			it("should flag a mistakenly nested multi-replace", () => {
				let fakeDocument = createDocument('Previous line that is very very long\n@{var1 true bit | @{var2 other true bit | false bit}}\nNext line');
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Multireplaces cannot be nested");
				expect(received[0].range.start.line).to.equal(55);
				expect(received[0].range.end.line).to.equal(89);
			});
		});

		describe("Multireplaces", () => {
			it("should flag an operator in a bare multireplace", () => {
				let fakeDocument = createDocument("@{var > 2 yes | no}");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Potentially missing parentheses");
				expect(received[0].range.start.line).to.equal(2);
				expect(received[0].range.end.line).to.equal(7);
			});

			it("should not flag a word operator in a bare multireplace", () => {
				let fakeDocument = createDocument("@{var and true yes | no}");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(0);
			});
		});
	
		describe("Variable Creation Commands", () => {
			it("should flag *create commands with no value to set the variable to", () => {
				let fakeDocument = createDocument("*create variable");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Missing value to set the variable to");
				expect(received[0].range.start.line).to.equal(16);
				expect(received[0].range.end.line).to.equal(16);
			});

			it("should be okay with *temp commands with no value to set the variable to", () => {
				let fakeDocument = createDocument("*temp variable");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(0);
			});
		});

		describe("Variable Reference Commands", () => {
			it("should flag non-boolean results", () => {
				let fakeDocument = createDocument("*if 1");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Must be a boolean value");
				expect(received[0].range.start.line).to.equal(4);
				expect(received[0].range.end.line).to.equal(5);
			});
	
			it("should flag non-boolean functions", () => {
				let fakeDocument = createDocument("*if round(2)");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Must be a boolean value");
				expect(received[0].range.start.line).to.equal(4);
				expect(received[0].range.end.line).to.equal(12);
			});
	
			it("should flag unbalanced parentheses", () => {
				let fakeDocument = createDocument("*if not(var1&(var2&var3)");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Missing end )");
				expect(received[0].range.start.line).to.equal(4);
				expect(received[0].range.end.line).to.equal(24);
			});
	
			it("should flag chained conditions", () => {
				let fakeDocument = createDocument("*if true and false and true");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Too many elements - are you missing parentheses");
				expect(received[0].range.start.line).to.equal(19);
				expect(received[0].range.end.line).to.equal(27);
			});
	
			it("should not flag properly parenthesized conditions", () => {
				let fakeDocument = createDocument("*if true and (false and true)");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(0);
			});
	
			it("should flag a not that's missing parentheses", () => {
				let fakeDocument = createDocument("*if not true");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Function must be followed by");
				expect(received[0].range.start.line).to.equal(4);
				expect(received[0].range.end.line).to.equal(7);
			});

			it("should flag a non-boolean function", () => {
				let fakeDocument = createDocument("*if round(1.1)");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Must be a boolean value");
				expect(received[0].range.start.line).to.equal(4);
				expect(received[0].range.end.line).to.equal(14);
			});

			it("should be good with number comparisons", () => {
				let fakeDocument = createDocument("*if 1 > 3");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(0);
			});

			it("should be good with truth comparisons", () => {
				let fakeDocument = createDocument("*if variable and true");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(0);
			});
		});

		describe("*set Command", () => {
			it("should flag a bad variable name", () => {
				let fakeDocument = createDocument("*set +1");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Not a variable or variable reference");
				expect(received[0].range.start.line).to.equal(5);
				expect(received[0].range.end.line).to.equal(6);
			});
	
			it("should flag a missing symbol after a bare math operator", () => {
				let fakeDocument = createDocument("*set var +");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Not a valid value");
				expect(received[0].range.start.line).to.equal(9);
				expect(received[0].range.end.line).to.equal(10);
			});
	
			it("should flag too many symbols after a bare math operator", () => {
				let fakeDocument = createDocument("*set var +1 + 2");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Too many elements");
				expect(received[0].range.start.line).to.equal(12);
				expect(received[0].range.end.line).to.equal(15);
			});
	
			it("should flag a non-number symbol after a bare math operator", () => {
				let fakeDocument = createDocument('*set var +"nope"');
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Must be a number or a variable");
				expect(received[0].range.start.line).to.equal(10);
				expect(received[0].range.end.line).to.equal(16);
			});
	
			it("should flag when there's no value to set the variable to", () => {
				let fakeDocument = createDocument("*set variable");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Missing value to set the variable to");
				expect(received[0].range.start.line).to.equal(13);
				expect(received[0].range.end.line).to.equal(13);
			});
	
			it("should allow unbalanced operators", () => {
				let fakeDocument = createDocument("*set variable +1");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(0);
			});
	
			it("should flag a missing operator", () => {
				let fakeDocument = createDocument('*set var 1 4');
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Incomplete expression");
				expect(received[0].range.start.line).to.equal(12);
				expect(received[0].range.end.line).to.equal(12);
			});
	
			it("should flag a missing number after an operator", () => {
				let fakeDocument = createDocument('*set var 1 +');
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Incomplete expression");
				expect(received[0].range.start.line).to.equal(12);
				expect(received[0].range.end.line).to.equal(12);
			});
	
			it("should flag a not-number after a math operator", () => {
				let fakeDocument = createDocument('*set var 1 + "nope"');
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Must be a number");
				expect(received[0].range.start.line).to.equal(13);
				expect(received[0].range.end.line).to.equal(19);
			});
	
			it("should flag a not-string operator after a string", () => {
				let fakeDocument = createDocument('*set var "yep" + "nope"');
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Not a string or comparison operator");
				expect(received[0].range.start.line).to.equal(15);
				expect(received[0].range.end.line).to.equal(16);
			});
	
			it("should flag a not-string value after a string operator", () => {
				let fakeDocument = createDocument('*set var "yep" & 1');
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Must be a string");
				expect(received[0].range.start.line).to.equal(17);
				expect(received[0].range.end.line).to.equal(18);
			});
	
			it("should flag a non-number operator at the start of the expression", () => {
				let fakeDocument = createDocument("*set variable and true");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Must be a numeric operator");
				expect(received[0].range.start.line).to.equal(14);
				expect(received[0].range.end.line).to.equal(17);
			});
	
			it("should flag unknown operators", () => {
				let fakeDocument = createDocument("*set variable !var1");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(2);
				expect(received[0].message).to.include("Unknown operator");
				expect(received[0].range.start.line).to.equal(14);
				expect(received[0].range.end.line).to.equal(15);
				expect(received[1].message).to.include("Incomplete expression");
				expect(received[1].range.start.line).to.equal(19);
				expect(received[1].range.end.line).to.equal(19);
			});
	
			it("should flag unbalanced parentheses", () => {
				let fakeDocument = createDocument("*set variable (1 + 2");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Missing end )");
				expect(received[0].range.start.line).to.equal(14);
				expect(received[0].range.end.line).to.equal(20);
			});
	
			it("should flag chained operators", () => {
				let fakeDocument = createDocument("*set variable 1 + 2 + 3");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Too many elements");
				expect(received[0].range.start.line).to.equal(20);
				expect(received[0].range.end.line).to.equal(23);
			});
	
			it("should not flag properly parenthesized operations", () => {
				let fakeDocument = createDocument("*set variable true and (false and true)");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(0);
			});
	
			it("should flag a not that's missing parentheses", () => {
				let fakeDocument = createDocument("*set variable not 1");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Function must be followed by parentheses");
				expect(received[0].range.start.line).to.equal(14);
				expect(received[0].range.end.line).to.equal(17);
			});
		});
		
		describe("Stat Charts", () => {
			it("should raise an error for an empty *stat_chart", () => {
				let fakeDocument = createDocument("*stat_chart\nI didn't enter any data");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("*stat_chart must have at least one stat");
				expect(received[0].range.start.line).to.equal(0);
				expect(received[0].range.end.line).to.equal(11);
			});
	
			it("should raise an error for an unrecognized *stat_chart sub-command", () => {
				let fakeDocument = createDocument("*stat_chart\n\tunrecognized command");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				})
		
				parse(fakeDocument, fakeCallbacks);
		
				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Must be one of text, percent, opposed_pair");
				expect(received[0].range.start.line).to.equal(13);
				expect(received[0].range.end.line).to.equal(25);
			});	
		});
	})
})
