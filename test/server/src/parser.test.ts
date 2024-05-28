import { expect } from 'chai';
import 'mocha';
import { Substitute, type SubstituteOf, Arg } from '@fluffy-spoon/substitute';
import { Position, type Location, type Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';

import { type ParserCallbacks, type ParsingState, parse } from '../../../server/src/common/parser';
import type { FlowControlEvent, SummaryScope } from '../../../server/src/common';

/* eslint-disable */

const fakeDocumentUri = "file:///startup.txt";

function createDocument(text: string,
	uri: string = fakeDocumentUri): SubstituteOf<TextDocument> {
	let fakeDocument = Substitute.for<TextDocument>();
	fakeDocument.getText(Arg.any()).returns(text);
	fakeDocument.uri.returns!(uri);
	fakeDocument.positionAt(Arg.any()).mimicks((index: number) => { return (Position.create(index, 0)); });
	return fakeDocument;
}

interface CommandLine {
	prefix: string;
	command: string;
	spacing: string;
	line: string;
	location: Location;
}

interface Symbol {
	text: string;
	location: Location;
}

interface Achievement {
	text: string;
	location: Location;
	points: number;
	title: string;
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
				});

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
				});

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
				});

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
				});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].spacing).to.equal("  ");
			expect(received[0].line).to.equal("with arguments ");
		});
	});

	describe("Flow Control Command Parsing", () => {
		it("should callback on return", () => {
			let fakeDocument = createDocument("*return");
			let received: Array<FlowControlEvent> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onFlowControlEvent(Arg.all()).mimicks(
				(command: string, commandLocation: Location, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
					received.push({ command: command, commandLocation: commandLocation, label: label, scene: scene, labelLocation: labelLocation, sceneLocation: sceneLocation });
				});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
		});

		it("should callback on goto", () => {
			let fakeDocument = createDocument("*goto label");
			let received: Array<FlowControlEvent> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onFlowControlEvent(Arg.all()).mimicks(
				(command: string, commandLocation: Location, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
					received.push({ command: command, commandLocation: commandLocation, label: label, scene: scene, labelLocation: labelLocation, sceneLocation: sceneLocation });
				});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].label).to.equal("label");
			expect(received[0].labelLocation?.range.start.line).to.equal(6);
			expect(received[0].labelLocation?.range.end.line).to.equal(11);
		});

		it("should callback on goto with a punctuated label", () => {
			let fakeDocument = createDocument("*goto l'abel");
			let received: Array<FlowControlEvent> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onFlowControlEvent(Arg.all()).mimicks(
				(command: string, commandLocation: Location, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
					received.push({ command: command, commandLocation: commandLocation, label: label, scene: scene, labelLocation: labelLocation, sceneLocation: sceneLocation });
				});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].label).to.equal("l'abel");
			expect(received[0].labelLocation?.range.start.line).to.equal(6);
			expect(received[0].labelLocation?.range.end.line).to.equal(12);
		});

		it("should callback on gosub", () => {
			let fakeDocument = createDocument("*gosub label");
			let received: Array<FlowControlEvent> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onFlowControlEvent(Arg.all()).mimicks(
				(command: string, commandLocation: Location, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
					received.push({ command: command, commandLocation: commandLocation, label: label, scene: scene, labelLocation: labelLocation, sceneLocation: sceneLocation });
				});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].label).to.equal("label");
			expect(received[0].labelLocation?.range.start.line).to.equal(7);
			expect(received[0].labelLocation?.range.end.line).to.equal(12);
		});

		it("should callback on gosub with a punctuated label", () => {
			let fakeDocument = createDocument("*gosub l'abel");
			let received: Array<FlowControlEvent> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onFlowControlEvent(Arg.all()).mimicks(
				(command: string, commandLocation: Location, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
					received.push({ command: command, commandLocation: commandLocation, label: label, scene: scene, labelLocation: labelLocation, sceneLocation: sceneLocation });
				});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].label).to.equal("l'abel");
			expect(received[0].labelLocation?.range.start.line).to.equal(7);
			expect(received[0].labelLocation?.range.end.line).to.equal(13);
		});

		it("should create a reference on goto with a reference label", () => {
			let fakeDocument = createDocument("*goto {variable}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(7);
			expect(received[0].location.range.end.line).to.equal(15);
		});

		it("should create a reference on goto with a reference label in a section", () => {
			let fakeDocument = createDocument("*choice\n\t#Option\n\t\t*goto {variable}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(26);
			expect(received[0].location.range.end.line).to.equal(34);
		});

		it("should create a reference on gosub with a reference label", () => {
			let fakeDocument = createDocument("*gosub {variable}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(8);
			expect(received[0].location.range.end.line).to.equal(16);
		});

		it("should create a variable reference for parameters passed to gosub", () => {
			let fakeDocument = createDocument("*gosub label param");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("param");
			expect(received[0].location.range.start.line).to.equal(13);
			expect(received[0].location.range.end.line).to.equal(18);
		});

		it("should deal with no scene on a goto", () => {
			let fakeDocument = createDocument("*goto label");
			let received: Array<FlowControlEvent> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onFlowControlEvent(Arg.all()).mimicks(
				(command: string, commandLocation: Location, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
					received.push({ command: command, commandLocation: commandLocation, label: label, scene: scene, labelLocation: labelLocation, sceneLocation: sceneLocation });
				});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].scene).to.equal("");
			expect(received[0].sceneLocation).is.undefined;
		});

		it("should deal with no scene on a gosub", () => {
			let fakeDocument = createDocument("*gosub label");
			let received: Array<FlowControlEvent> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onFlowControlEvent(Arg.all()).mimicks(
				(command: string, commandLocation: Location, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
					received.push({ command: command, commandLocation: commandLocation, label: label, scene: scene, labelLocation: labelLocation, sceneLocation: sceneLocation });
				});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].scene).to.equal("");
			expect(received[0].sceneLocation).is.undefined;
		});

		it("should callback on goto_scene", () => {
			let fakeDocument = createDocument("*goto_scene scenename");
			let received: Array<FlowControlEvent> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onFlowControlEvent(Arg.all()).mimicks(
				(command: string, commandLocation: Location, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
					received.push({ command: command, commandLocation: commandLocation, label: label, scene: scene, labelLocation: labelLocation, sceneLocation: sceneLocation });
				});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].scene).to.equal("scenename");
			expect(received[0].sceneLocation?.range.start.line).to.equal(12);
			expect(received[0].sceneLocation?.range.end.line).to.equal(21);
		});

		it("should callback on gosub_scene", () => {
			let fakeDocument = createDocument("*gosub_scene scenename");
			let received: Array<FlowControlEvent> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onFlowControlEvent(Arg.all()).mimicks(
				(command: string, commandLocation: Location, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
					received.push({ command: command, commandLocation: commandLocation, label: label, scene: scene, labelLocation: labelLocation, sceneLocation: sceneLocation });
				});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].scene).to.equal("scenename");
			expect(received[0].sceneLocation?.range.start.line).to.equal(13);
			expect(received[0].sceneLocation?.range.end.line).to.equal(22);
		});

		it("should deal with no label on goto_scene", () => {
			let fakeDocument = createDocument("*goto_scene scenename");
			let received: Array<FlowControlEvent> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onFlowControlEvent(Arg.all()).mimicks(
				(command: string, commandLocation: Location, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
					received.push({ command: command, commandLocation: commandLocation, label: label, scene: scene, labelLocation: labelLocation, sceneLocation: sceneLocation });
				});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].label).to.equal("");
			expect(received[0].labelLocation).is.undefined;
		});

		it("should deal with no label on gosub_scene", () => {
			let fakeDocument = createDocument("*gosub_scene scenename");
			let received: Array<FlowControlEvent> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onFlowControlEvent(Arg.all()).mimicks(
				(command: string, commandLocation: Location, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
					received.push({ command: command, commandLocation: commandLocation, label: label, scene: scene, labelLocation: labelLocation, sceneLocation: sceneLocation });
				});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].label).to.equal("");
			expect(received[0].labelLocation).is.undefined;
		});

		it("should deal with hyphenated scenes on goto_scene", () => {
			let fakeDocument = createDocument("*goto_scene 1-scenename");
			let received: Array<FlowControlEvent> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onFlowControlEvent(Arg.all()).mimicks(
				(command: string, commandLocation: Location, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
					received.push({ command: command, commandLocation: commandLocation, label: label, scene: scene, labelLocation: labelLocation, sceneLocation: sceneLocation });
				});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].scene).to.equal("1-scenename");
			expect(received[0].sceneLocation?.range.start.line).to.equal(12);
			expect(received[0].sceneLocation?.range.end.line).to.equal(23);
		});

		it("should send scene and label on goto_scene", () => {
			let fakeDocument = createDocument("*goto_scene scenename l'abelname");
			let received: Array<FlowControlEvent> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onFlowControlEvent(Arg.all()).mimicks(
				(command: string, commandLocation: Location, label: string, scene: string, labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
					received.push({ command: command, commandLocation: commandLocation, label: label, scene: scene, labelLocation: labelLocation, sceneLocation: sceneLocation });
				});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].label).to.equal("l'abelname");
			expect(received[0].labelLocation?.range.start.line).to.equal(22);
			expect(received[0].labelLocation?.range.end.line).to.equal(32);
		});

		it("should create a reference if necessary from a goto_scene label", () => {
			let fakeDocument = createDocument("*goto_scene scenename {variable}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(23);
			expect(received[0].location.range.end.line).to.equal(31);

		});

		it("should create a reference from a parameter passed to gosub_scene", () => {
			let fakeDocument = createDocument("*gosub_scene scenename label parameter");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("parameter");
			expect(received[0].location.range.start.line).to.equal(29);
			expect(received[0].location.range.end.line).to.equal(38);
		});
	});

	describe("Image Parsing", () => {
		it("should callback on a local image", () => {
			let fakeDocument = createDocument("Line 0\n*image local.png");
			let received: [string, Location][] = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onImage(Arg.all()).mimicks((image: string, location: Location, state: ParsingState) => {
				received.push([image, location]);
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0][0]).to.equal("local.png");
			expect(received[0][1].range.start.line).to.equal(14);
			expect(received[0][1].range.end.line).to.equal(23);
		});

		it("should callback on a remote image", () => {
			let fakeDocument = createDocument("Line 0\n*image http://faker.com/img.png");
			let received: [string, Location][] = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onImage(Arg.all()).mimicks((image: string, location: Location, state: ParsingState) => {
				received.push([image, location]);
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0][0]).to.equal("http://faker.com/img.png");
			expect(received[0][1].range.start.line).to.equal(14);
			expect(received[0][1].range.end.line).to.equal(38);
		});
		
		it("should callback on a local text_image", () => {
			let fakeDocument = createDocument("Line 0\n*text_image local.png");
			let received: [string, Location][] = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onImage(Arg.all()).mimicks((image: string, location: Location, state: ParsingState) => {
				received.push([image, location]);
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0][0]).to.equal("local.png");
			expect(received[0][1].range.start.line).to.equal(19);
			expect(received[0][1].range.end.line).to.equal(28);
		});

		it("should callback on a remote text_image", () => {
			let fakeDocument = createDocument("Line 0\n*text_image http://faker.com/img.png");
			let received: [string, Location][] = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onImage(Arg.all()).mimicks((image: string, location: Location, state: ParsingState) => {
				received.push([image, location]);
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0][0]).to.equal("http://faker.com/img.png");
			expect(received[0][1].range.start.line).to.equal(19);
			expect(received[0][1].range.end.line).to.equal(43);
		});

		it("should callback on a local kindle_image", () => {
			let fakeDocument = createDocument("Line 0\n*kindle_image local.png");
			let received: [string, Location][] = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onImage(Arg.all()).mimicks((image: string, location: Location, state: ParsingState) => {
				received.push([image, location]);
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0][0]).to.equal("local.png");
			expect(received[0][1].range.start.line).to.equal(21);
			expect(received[0][1].range.end.line).to.equal(30);
		});

		it("should callback on a remote kindle_image", () => {
			let fakeDocument = createDocument("Line 0\n*kindle_image http://faker.com/img.png");
			let received: [string, Location][] = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onImage(Arg.all()).mimicks((image: string, location: Location, state: ParsingState) => {
				received.push([image, location]);
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0][0]).to.equal("http://faker.com/img.png");
			expect(received[0][1].range.start.line).to.equal(21);
			expect(received[0][1].range.end.line).to.equal(45);
		});
	});

	describe("Choice Command Parsing", () => {
		it("should callback on a choice with spaces", () => {
			let fakeDocument = createDocument("Line 0\n*choice\n    #One\n        Text\n    #Two\nEnd");
			let received: Array<SummaryScope> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onChoiceScope(Arg.all()).mimicks((scope: SummaryScope, state: ParsingState) => {
				received.push(scope);
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(3);
			expect(received[0].range.start.line).to.equal(8);
			expect(received[0].range.end.line).to.equal(45);
			expect(received[1].range.start.line).to.equal(15);
			expect(received[1].range.end.line).to.equal(36);
			expect(received[2].range.start.line).to.equal(37);
			expect(received[2].range.end.line).to.equal(45);
		});

		it("should callback on a choice with tabs", () => {
			let fakeDocument = createDocument("Line 0\n*choice\n\t#One\n\t\tText\n\t#Two\nEnd");
			let received: Array<SummaryScope> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onChoiceScope(Arg.all()).mimicks((scope: SummaryScope, state: ParsingState) => {
				received.push(scope);
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(3);
			expect(received[0].range.start.line).to.equal(8);
			expect(received[0].range.end.line).to.equal(33);
			expect(received[1].range.start.line).to.equal(15);
			expect(received[1].range.end.line).to.equal(27);
			expect(received[2].range.start.line).to.equal(28);
			expect(received[2].range.end.line).to.equal(33);
		});

		it("should callback on a choice at the end of the document", () => {
			let fakeDocument = createDocument("Line 0\n*choice\n\t#One\n\t\tText\n\t#Two");
			let received: Array<SummaryScope> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onChoiceScope(Arg.all()).mimicks((scope: SummaryScope, state: ParsingState) => {
				received.push(scope);
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(3);
			expect(received[0].range.start.line).to.equal(8);
			expect(received[0].range.end.line).to.equal(33);
			expect(received[1].range.start.line).to.equal(15);
			expect(received[1].range.end.line).to.equal(27);
			expect(received[2].range.start.line).to.equal(28);
			expect(received[2].range.end.line).to.equal(33);
		});

		it("should cut the choice short at mixed tabs and spaces", () => {
			let fakeDocument = createDocument("Line 0\n*choice\n\t#One\n        Text\n\t#Two\nEnd");
			let received: Array<SummaryScope> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onChoiceScope(Arg.all()).mimicks((scope: SummaryScope, state: ParsingState) => {
				received.push(scope);
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(2);
			expect(received[0].range.start.line).to.equal(8);
			expect(received[0].range.end.line).to.equal(33);
			expect(received[1].range.start.line).to.equal(15);
			expect(received[1].range.end.line).to.equal(33);
		});

		it("should callback on a choice with blank lines", () => {
			let fakeDocument = createDocument("Line 0\n*choice\n\t#One\n\n\t#Two\nEnd");
			let received: Array<SummaryScope> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onChoiceScope(Arg.all()).mimicks((scope: SummaryScope, state: ParsingState) => {
				received.push(scope);
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(3);
			expect(received[0].range.start.line).to.equal(8);
			expect(received[0].range.end.line).to.equal(27);
			expect(received[1].range.start.line).to.equal(15);
			expect(received[1].range.end.line).to.equal(21);
			expect(received[2].range.start.line).to.equal(22);
			expect(received[2].range.end.line).to.equal(27);
		});

		it("should callback on nested choice blocks", () => {
			let fakeDocument = createDocument("Line 0\n*choice\n\t#One\n\t\t*choice\n\t\t\t#Nest\n\t\t\t\tText\n\t#Two\nEnd");
			let received: Array<SummaryScope> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onChoiceScope(Arg.all()).mimicks((scope: SummaryScope, state: ParsingState) => {
				received.push(scope);
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(5);
			expect(received[0].range.start.line).to.equal(24);
			expect(received[0].range.end.line).to.equal(48);
			expect(received[1].range.start.line).to.equal(31);
			expect(received[1].range.end.line).to.equal(48);
			expect(received[2].range.start.line).to.equal(8);
			expect(received[2].range.end.line).to.equal(54);
			expect(received[3].range.start.line).to.equal(15);
			expect(received[3].range.end.line).to.equal(48);
			expect(received[4].range.start.line).to.equal(49);
			expect(received[4].range.end.line).to.equal(54);
		});

		it("should include subgroup options", () => {
			let fakeDocument = createDocument("Line 0\n*fake_choice a b c\n\t#One\n\t\t#SubOne\n\t\t\t#SubSubOne\n\t\t#SubTwo\n\t\t\t#SubSubOne\n\t#Two\n\t\t#SubOne\n\t\t\t#SubSubOne\n\t\t#SubTwo\n\t\t\t#SubSubOne\nEnd");
			let received: Array<SummaryScope> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onChoiceScope(Arg.all()).mimicks((scope: SummaryScope, state: ParsingState) => {
				received.push(scope);
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(11);
			expect(received[0].range.start.line).to.equal(8); // full choice
			expect(received[0].range.end.line).to.equal(133);
			expect(received[1].range.start.line).to.equal(42);  // #SubSubOne (SubOne)
			expect(received[1].range.end.line).to.equal(55);
			expect(received[2].range.start.line).to.equal(32);  // #SubOne
			expect(received[2].range.end.line).to.equal(55);
			expect(received[3].range.start.line).to.equal(66);  // #SubSubOne (SubTwo)
			expect(received[3].range.end.line).to.equal(79);
			expect(received[4].range.start.line).to.equal(56);  // #SubTwo
			expect(received[4].range.end.line).to.equal(79);
			expect(received[5].range.start.line).to.equal(26);  // #One + contents
			expect(received[5].range.end.line).to.equal(79);
			expect(received[6].range.start.line).to.equal(96);  // #SubSubOne (SubOne)
			expect(received[6].range.end.line).to.equal(109);
			expect(received[7].range.start.line).to.equal(86);  // #SubOne
			expect(received[7].range.end.line).to.equal(109);
			expect(received[8].range.start.line).to.equal(120);  // #SubSubOne (SubTwo)
			expect(received[8].range.end.line).to.equal(133);
			expect(received[9].range.start.line).to.equal(110);  // #SubTwo
			expect(received[9].range.end.line).to.equal(133);
			expect(received[10].range.start.line).to.equal(80);  // #Two
			expect(received[10].range.end.line).to.equal(133);
		});

		it("should parse the line right after a choice block", () => {
			let fakeDocument = createDocument("Line 0\n*choice\n    #One\n        Text\n    #Two\n*comment parsed");
			let received: Array<string> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onCommand(Arg.all()).mimicks((prefix: string, command: string, spacing: string, line: string, commandLocation: Location, state: ParsingState) => {
				received.push(command);
				received.push(line);
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received).to.eql(["choice", "", "comment", "parsed"]);
		});

		it("should summarize a choice with the command's name", () => {
			let fakeDocument = createDocument("Line 0\n*choice\n\t#One\n\t\tText\n\t#Two\nEnd");
			let received: Array<SummaryScope> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onChoiceScope(Arg.all()).mimicks((scope: SummaryScope, state: ParsingState) => {
				received.push(scope);
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received[0].summary).to.equal("choice (#One)");
		});

		it("should summarize a fake choice with the command's name", () => {
			let fakeDocument = createDocument("Line 0\n*fake_choice\n\t#One\n\t\tText\n\t#Two\nEnd");
			let received: Array<SummaryScope> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onChoiceScope(Arg.all()).mimicks((scope: SummaryScope, state: ParsingState) => {
				received.push(scope);
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received[0].summary).to.equal("fake_choice (#One)");
		});

		it("should summarize an option with its comments", () => {
			let fakeDocument = createDocument("Line 0\n*choice\n\t#One\n\t\tText\n\t#Two\nEnd");
			let received: Array<SummaryScope> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onChoiceScope(Arg.all()).mimicks((scope: SummaryScope, state: ParsingState) => {
				received.push(scope);
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received[1].summary).to.equal("#One");
		});

		it("should limit an option summary's length", () => {
			let fakeDocument = createDocument("Line 0\n*choice\n\t#A very long first choice, it runs on and on and on\n\t\tText\n\t#Two\nEnd");
			let received: Array<SummaryScope> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onChoiceScope(Arg.all()).mimicks((scope: SummaryScope, state: ParsingState) => {
				received.push(scope);
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received[1].summary).to.equal("#A very long first choice, it runs…");
		});
	});

	describe("Symbol-Creation Command Parsing", () => {
		it("should callback on global variable creation", () => {
			let fakeDocument = createDocument("*create variable 3");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onGlobalVariableCreate(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

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
				received.push({ text: s, location: l });
			});

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
				received.push({ text: s, location: l });
			});

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
				received.push({ text: s, location: l });
			});

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
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("other_variable");
			expect(received[0].location.range.start.line).to.equal(16);
			expect(received[0].location.range.end.line).to.equal(30);
		});

		it("should callback on references in local variable creation inside a containing block", () => {
			let fakeDocument = createDocument("*choice\n\t#Option\n\t\t*temp variable {other_variable}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("other_variable");
			expect(received[0].location.range.start.line).to.equal(35);
			expect(received[0].location.range.end.line).to.equal(49);
		});

		it("should callback on label creation", () => {
			let fakeDocument = createDocument("*label variable");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onLabelCreate(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(7);
			expect(received[0].location.range.end.line).to.equal(15);
		});

		it("should callback on labels with allowed punctuation", () => {
			let fakeDocument = createDocument("*label don't");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onLabelCreate(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("don't");
			expect(received[0].location.range.start.line).to.equal(7);
			expect(received[0].location.range.end.line).to.equal(12);
		});

		it("should callback on local variables created inside choices", () => {
			let fakeDocument = createDocument("Line 0\n*choice\n\t#One\n\t\t*temp variable\n\t#Two");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onLocalVariableCreate(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(29);
			expect(received[0].location.range.end.line).to.equal(37);
		});
	});

	describe("Symbol-Manipulating Command Parsing", () => {
		it("should callback on delete commands", () => {
			let fakeDocument = createDocument("*delete variable");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

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
				received.push({ text: s, location: l });
			});

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
				received.push({ text: s, location: l });
			});

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
				received.push({ text: s, location: l });
			});

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
				received.push({ text: s, location: l });
			});

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
				received.push({ text: s, location: l });
			});

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
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(6);
			expect(received[0].location.range.end.line).to.equal(14);
		});

		it("should callback on more complex variable references", () => {
			let fakeDocument = createDocument("*comment \n*set {var1} {var2 & \"hi\"}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(2);
			expect(received[0].text).to.equal("var1");
			expect(received[0].location.range.start.line).to.equal(16);
			expect(received[0].location.range.end.line).to.equal(20);
			expect(received[1].text).to.equal("var2");
			expect(received[1].location.range.start.line).to.equal(23);
			expect(received[1].location.range.end.line).to.equal(27);
		});

		it("should not callback on strings", () => {
			let fakeDocument = createDocument('*set variable "value"');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
		});

		it("should callback on complex variable references", () => {
			let fakeDocument = createDocument('*set {"this" + variable} 3');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

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
				received.push({ text: s, location: l });
			});

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
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(2);
			expect(received[0].text).to.equal("variable");
			expect(received[1].text).to.equal("other_variable");
			expect(received[1].location.range.start.line).to.equal(17);
			expect(received[1].location.range.end.line).to.equal(31);
		});

		it("should callback on set commands in choices", () => {
			let fakeDocument = createDocument("*choice\n\t#First\n\t\t*set variable 3");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(23);
			expect(received[0].location.range.end.line).to.equal(31);
		});

		it("should not callback on variable references in strings", () => {
			let fakeDocument = createDocument('*set variable "{other_variable}"');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
		});

		it("should not callback on named operators", () => {
			let fakeDocument = createDocument('*set variable 4 modulo 2');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
		});


		it("should not callback on functions", () => {
			let fakeDocument = createDocument('*set variable round(2.3)');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
		});

		it("should not callback on named values", () => {
			let fakeDocument = createDocument('*set variable true');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
		});

		it("should not callback on arrays", () => {
			let fakeDocument = createDocument("*set variable[other_var] 3");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(0);
		});

		it("should not callback on 2D array references", () => {
			let fakeDocument = createDocument("*set variable[other_var][another_var] final_var");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("final_var");
		});
	});

	describe("Replace Parsing", () => {
		it("should callback on bare variables", () => {
			let fakeDocument = createDocument("${variable}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

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
				received.push({ text: s, location: l });
			});

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
				received.push({ text: s, location: l });
			});

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
				received.push({ text: s, location: l });
			});

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
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("var2");
			expect(received[0].location.range.start.line).to.equal(12);
			expect(received[0].location.range.end.line).to.equal(16);
		});

		it("should callback on replacements in a page_break", () => {
			let fakeDocument = createDocument("*page_break ${variable}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(14);
			expect(received[0].location.range.end.line).to.equal(22);
		});

		it("should callback on replacements in an option", () => {
			let fakeDocument = createDocument("*choice\n\t#One\n\t\t${variable}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(18);
			expect(received[0].location.range.end.line).to.equal(26);
		});

		it("should callback on multireplacements in the replacement", () => {
			let fakeDocument = createDocument('${@{var1 true | false}}');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("var1");
			expect(received[0].location.range.start.line).to.equal(4);
			expect(received[0].location.range.end.line).to.equal(8);
		});
	});

	describe("Multireplace Parsing", () => {
		it("should callback on bare variables in the test", () => {
			let fakeDocument = createDocument("@{variable this | that}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(2);
			expect(received[0].location.range.end.line).to.equal(10);
		});

		it("should callback on bare variables in the test with leading spaces", () => {
			let fakeDocument = createDocument("@{  variable this | that}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(4);
			expect(received[0].location.range.end.line).to.equal(12);
		});

		it("should callback on bare variables in multireplaces with no choices", () => {
			let fakeDocument = createDocument("@{variable text}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(2);
			expect(received[0].location.range.end.line).to.equal(10);
		});

		it("should callback on bare variables in incomplete multireplace", () => {
			let fakeDocument = createDocument("@{variable text");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(2);
			expect(received[0].location.range.end.line).to.equal(10);
		});

		it("should callback on variables in a function in the test", () => {
			let fakeDocument = createDocument("@{not(variable) this | that}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(6);
			expect(received[0].location.range.end.line).to.equal(14);
		});

		it("should callback on variables in a reference in the test", () => {
			let fakeDocument = createDocument("@{{variable} this | that}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(3);
			expect(received[0].location.range.end.line).to.equal(11);
		});

		it("should callback on multiple variables in the test", () => {
			let fakeDocument = createDocument('@{(var1 + var2 > 2) true | false}');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

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
				received.push({ text: s, location: l });
			});

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
				received.push({ text: s, location: l });
			});

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
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("var1");
			expect(received[0].location.range.start.line).to.equal(2);
			expect(received[0].location.range.end.line).to.equal(6);
		});

		it("should callback on multireplace in a *page_break", () => {
			let fakeDocument = createDocument("*page_break @{variable this|that}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(14);
			expect(received[0].location.range.end.line).to.equal(22);
		});

		it("should callback on multireplace in a *choice", () => {
			let fakeDocument = createDocument("*choice\n\t#One\n\t\t@{variable this|that}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(18);
			expect(received[0].location.range.end.line).to.equal(26);
		});

		it("should callback on multireplace in a *choice's #option", () => {
			let fakeDocument = createDocument("*choice\n\t#One @{variable this|that}\n\t\tContents");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(16);
			expect(received[0].location.range.end.line).to.equal(24);
		});
	});

	describe("Variable-Referencing Command Parsing", () => {
		it("should callback on local variables directly after a reference comand", () => {
			let fakeDocument = createDocument("*if variable > 1");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(4);
			expect(received[0].location.range.end.line).to.equal(12);
		});

		it("should callback on all local variables after a reference comand", () => {
			let fakeDocument = createDocument("*if var1 > var2");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(2);
			expect(received[0].text).to.equal("var1");
			expect(received[0].location.range.start.line).to.equal(4);
			expect(received[0].location.range.end.line).to.equal(8);
			expect(received[1].text).to.equal("var2");
			expect(received[1].location.range.start.line).to.equal(11);
			expect(received[1].location.range.end.line).to.equal(15);
		});

		it("should callback on local variables in parentheses", () => {
			let fakeDocument = createDocument("*if (variable > 1)");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(5);
			expect(received[0].location.range.end.line).to.equal(13);
		});

		it("should callback on variables in multiple parentheses", () => {
			let fakeDocument = createDocument("*if (var1 > 1) or (var2 < 3)");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(2);
			expect(received[0].text).to.equal("var1");
			expect(received[0].location.range.start.line).to.equal(5);
			expect(received[0].location.range.end.line).to.equal(9);
			expect(received[1].text).to.equal("var2");
			expect(received[1].location.range.start.line).to.equal(19);
			expect(received[1].location.range.end.line).to.equal(23);
		});

		it("should not callback on strings", () => {
			let fakeDocument = createDocument('*if variable = "other_variable"');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

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
				received.push({ text: s, location: l });
			});

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
				received.push({ text: s, location: l });
			});

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
				received.push({ text: s, location: l });
			});

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
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(2);
			expect(received[1].text).to.equal("other_variable");
			expect(received[1].location.range.start.line).to.equal(25);
			expect(received[1].location.range.end.line).to.equal(39);
		});

		it("should callback on a reference command inside a choice command", () => {
			let fakeDocument = createDocument("*choice\n\t*if variable\n\t\t# This is a choice");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(13);
			expect(received[0].location.range.end.line).to.equal(21);
		});

		it("should callback on a reference command as part of a choice option", () => {
			let fakeDocument = createDocument("*choice\n\t*hide_reuse #Option ${variable}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(31);
			expect(received[0].location.range.end.line).to.equal(39);
		});

		it("should callback on a variable in an *if before an option", () => {
			let fakeDocument = createDocument("*choice\n\t*if variable # This is a choice");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(13);
			expect(received[0].location.range.end.line).to.equal(21);
		});

		it("should callback on a variable in an *if before an option and after a reuse command", () => {
			let fakeDocument = createDocument("*choice\n\t*hide_reuse *if variable # This is a choice");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("variable");
			expect(received[0].location.range.start.line).to.equal(25);
			expect(received[0].location.range.end.line).to.equal(33);
		});

		it("should callback on local variables in nested reference comands", () => {
			let fakeDocument = createDocument("*if variable > 1\n  *if other_variable < 1\n    Content");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(2);
			expect(received[1].text).to.equal("other_variable");
			expect(received[1].location.range.start.line).to.equal(23);
			expect(received[1].location.range.end.line).to.equal(37);
		});

		it("should callback on variables referenced as parameters in a *gosub", () => {
			let fakeDocument = createDocument("*if true\n\t*gosub label {reference}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("reference");
			expect(received[0].location.range.start.line).to.equal(24);
			expect(received[0].location.range.end.line).to.equal(33);
		});

		it("should callback on variables referenced as a scene in a *gosub_scene", () => {
			let fakeDocument = createDocument("*if true\n\t*gosub_scene {scene} label");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("scene");
			expect(received[0].location.range.start.line).to.equal(24);
			expect(received[0].location.range.end.line).to.equal(29);
		});

		it("should callback on variables referenced as a label in a *gosub_scene", () => {
			let fakeDocument = createDocument("*if true\n\t*gosub_scene scene {label}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("label");
			expect(received[0].location.range.start.line).to.equal(30);
			expect(received[0].location.range.end.line).to.equal(35);
		});

		it("should callback on variables referenced in non-specialized commands", () => {
			let fakeDocument = createDocument("*bug Here's a ${reference}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("reference");
			expect(received[0].location.range.start.line).to.equal(16);
			expect(received[0].location.range.end.line).to.equal(25);
		});

		it("should parse the line right after an *if block", () => {
			let fakeDocument = createDocument("*if variable\n  Content\n*comment parsed");
			let received: Array<string> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onCommand(Arg.all()).mimicks((prefix: string, command: string, spacing: string, line: string, commandLocation: Location, state: ParsingState) => {
				received.push(command);
				received.push(line);
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received).to.eql(["if", "variable", "comment", "parsed"]);
		});

		it("should not callback on array references", () => {
			let fakeDocument = createDocument('*if variable[other_var] = "other_variable"');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(0);
		});

		it("should not callback on 2D arrays", () => {
			let fakeDocument = createDocument('*if variable[other_var][another_var] = "other_variable"');
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(0);
		});
	});

	describe("Scene Parsing", () => {
		it("should callback on scene definitions", () => {
			let fakeDocument = createDocument("*scene_list\n\tscene-1\n\tscene-2\n");
			let received: Array<Array<string>> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onSceneDefinition(Arg.all()).mimicks((s: string[], l: Location, state: ParsingState) => {
				received.push(s);
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received).to.eql([['scene-1', 'scene-2']]);
		});
	});

	describe("Stat Chart Command Parsing", () => {
		it("should callback on references in text commands", () => {
			let fakeDocument = createDocument("*stat_chart\n\ttext text_var");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("text_var");
			expect(received[0].location.range.start.line).to.equal(18);
			expect(received[0].location.range.end.line).to.equal(26);
		});

		it("should callback on sub-references in text commands", () => {
			let fakeDocument = createDocument("*stat_chart\n\ttext {text_var}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("text_var");
			expect(received[0].location.range.start.line).to.equal(19);
			expect(received[0].location.range.end.line).to.equal(27);
		});

		it("should callback on sub-references in text commands that are in a section", () => {
			let fakeDocument = createDocument("*choice\n\t#Option\n\t\t*stat_chart\n\t\t\ttext {text_var}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("text_var");
			expect(received[0].location.range.start.line).to.equal(40);
			expect(received[0].location.range.end.line).to.equal(48);
		});

		it("should handle variable references in text commands", () => {
			let fakeDocument = createDocument("*stat_chart\n\ttext {text_var}");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onVariableReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

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
				received.push({ text: s, location: l });
			});

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
				received.push({ text: s, location: l });
			});

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
				received.push({ text: s, location: l });
			});

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
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(3);
			expect(received[1].text).to.equal("text_var");
			expect(received[1].location.range.start.line).to.equal(55);
			expect(received[1].location.range.end.line).to.equal(63);
			expect(received[2].text).to.equal("percent_var");
			expect(received[2].location.range.start.line).to.equal(73);
			expect(received[2].location.range.end.line).to.equal(84);
		});
	});

	describe("Achievement Parsing", () => {
		it("should callback on an achievement", () => {
			let fakeDocument = createDocument("*achievement code_name visible 12 Display title.");
			let received: Array<Achievement> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onAchievementCreate(Arg.all()).mimicks((s: string, l: Location, p: number, t: string, state: ParsingState) => {
				received.push({ text: s, location: l, points: p, title: t });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("code_name");
			expect(received[0].location.range.start.line).to.equal(13);
			expect(received[0].location.range.end.line).to.equal(22);
			expect(received[0].points).to.equal(12);
			expect(received[0].title).to.equal("Display title.");
		});

		it("should callback on a reference to an achievement", () => {
			let fakeDocument = createDocument("*achieve code_name");
			let received: Array<Symbol> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onAchievementReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
				received.push({ text: s, location: l });
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(1);
			expect(received[0].text).to.equal("code_name");
			expect(received[0].location.range.start.line).to.equal(9);
			expect(received[0].location.range.end.line).to.equal(18);
		});
	});

	describe("IFID Parsing", () => {
		it("should parse an IFID", () => {
			let fakeDocument = createDocument("*ifid 12345678-abcd-ef12-3456-7890abcdef01");
			let received: Array<Diagnostic> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
				received.push(e);
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(0);
		});
	});

	describe("Product Parsing", () => {
		it("should parse a product", () => {
			let fakeDocument = createDocument("*product aaaa");
			let received: Array<Diagnostic> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
				received.push(e);
			});

			parse(fakeDocument, fakeCallbacks);

			expect(received.length).to.equal(0);
		});
	});

	describe("Errors", () => {
		describe("Commands", () => {
			it("should flag non-existent commands", () => {
				let fakeDocument = createDocument("*fake_command");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

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
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("*set is missing its");
				expect(received[0].range.start.line).to.equal(1);
				expect(received[0].range.end.line).to.equal(4);
			});

			it("should flag commands with arguments that don't allow them", () => {
				let fakeDocument = createDocument("*if true\n  stuff\n*else true\n  stuff");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("must not have anything after it");
				expect(received[0].range.start.line).to.equal(23);
				expect(received[0].range.end.line).to.equal(27);
			});

			it("should warn commands with arguments that silently ignore them", () => {
				let fakeDocument = createDocument("*return ignored");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].severity).to.equal(DiagnosticSeverity.Warning);
				expect(received[0].message).to.include("This will be ignored");
				expect(received[0].range.start.line).to.equal(8);
				expect(received[0].range.end.line).to.equal(15);
			});

			it("should flag commands that can only be used in startup.txt", () => {
				let fakeDocument = createDocument("*create var 3", "file:///scene.txt");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("*create can only be used in");
				expect(received[0].range.start.line).to.equal(1);
				expect(received[0].range.end.line).to.equal(7);
			});
		});

		describe("Flow Control", () => {
			it("should flag empty lines in an *if statement", () => {
				let fakeDocument = createDocument("*if true\n\n*elseif false\n\tThis is okay.\n*else\n\n");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(2);
				expect(received[0].message).to.include("*if must have an indented line with contents after it");
				expect(received[0].range.start.line).to.equal(8);
				expect(received[0].range.end.line).to.equal(8);
				expect(received[1].message).to.include("*else must have an indented line with contents after it");
				expect(received[1].range.start.line).to.equal(44);
				expect(received[1].range.end.line).to.equal(44);
			});

			it("should flag an *elseif after an *else", () => {
				let fakeDocument = createDocument("*if true\n\  content\n*else\n  content\n*elseif false\n  stuff");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Command *elseif must be part of an *if");
				expect(received[0].range.start.line).to.equal(36);
				expect(received[0].range.end.line).to.equal(42);
			});

			it("should flag a bare *else", () => {
				let fakeDocument = createDocument("*else\n  content");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Command *else must be part of an *if");
				expect(received[0].range.start.line).to.equal(1);
				expect(received[0].range.end.line).to.equal(5);
			});

			it("should flag a bare *elseif", () => {
				let fakeDocument = createDocument("*elseif true\n  content");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Command *elseif must be part of an *if");
				expect(received[0].range.start.line).to.equal(1);
				expect(received[0].range.end.line).to.equal(7);
			});

			it("should flag bad parameters passed to a gosub", () => {
				let fakeDocument = createDocument("*gosub label -param");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Not a valid value");
				expect(received[0].range.start.line).to.equal(13);
				expect(received[0].range.end.line).to.equal(14);
			});

			it("should flag bad parameters passed to a gosub_scene", () => {
				let fakeDocument = createDocument("*gosub_scene scene label *");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Not a valid value");
				expect(received[0].range.start.line).to.equal(25);
				expect(received[0].range.end.line).to.equal(26);
			});

			it("should flag labels with spaces in them", () => {
				let fakeDocument = createDocument("*label this_is wrong");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("*label names can't have spaces");
				expect(received[0].range.start.line).to.equal(14);
				expect(received[0].range.end.line).to.equal(15);
			});

			it("should be okay with labels that have only spaces after them", () => {
				let fakeDocument = createDocument("*label this_is  ");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(0);
			});
		});

		describe("Choice Command", () => {
			describe("Simple Choices", () => {
				it("should flag text in front of an option", () => {
					let fakeDocument = createDocument("Line 0\n*choice\n    nope #One\n        Text\n    #Two\n        Text\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(1);
					expect(received[0].message).to.include("Only *if, *selectable_if, or one of the reuse commands allowed in front of an option");
					expect(received[0].range.start.line).to.equal(19);
					expect(received[0].range.end.line).to.equal(23);
				});

				it("should be okay with a reuse command in front of an option", () => {
					let fakeDocument = createDocument("Line 0\n*choice\n    *hide_reuse #One\n        Text\n    #Two\n        Text\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(0);
				});

				it("should flag text after a reuse command and in front of an option", () => {
					let fakeDocument = createDocument("Line 0\n*choice\n    *hide_reuse bad #One\n        Text\n    #Two\n        Text\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(1);
					expect(received[0].message).to.include("Nothing except an *if or *selectable_if is allowed between *hide_reuse and the #option");
					expect(received[0].range.start.line).to.equal(31);
					expect(received[0].range.end.line).to.equal(34);
				});

				it("should be okay with an if command in front of an option", () => {
					let fakeDocument = createDocument("Line 0\n*choice\n    *if (1 < 2) #One\n        Text\n    #Two\n        Text\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(0);
				});

				it("should not mistake a hash mark inside a string as part of an if statement as an option", () => {
					let fakeDocument = createDocument("Line 0\n*if (v = \"#\")\n    Text\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(0);
				});

				it("should flag an if command in front of an option that has no parentheses", () => {
					let fakeDocument = createDocument("Line 0\n*choice\n    *if false #One\n        Text\n    #Two\n        Text\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(1);
					expect(received[0].message).to.include("Arguments to an *if before an #option must be in parentheses");
					expect(received[0].range.start.line).to.equal(23);
					expect(received[0].range.end.line).to.equal(28);
				});

				it("should be okay with a selectable_if command in front of an option", () => {
					let fakeDocument = createDocument("Line 0\n*choice\n    *selectable_if (1 < 2) #One\n        Text\n    #Two\n        Text\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(0);
				});

				it("should flag a selectable_if command in front of an option that needs parentheses", () => {
					let fakeDocument = createDocument("Line 0\n*choice\n    *selectable_if 1 < 2 #One\n        Text\n    #Two\n        Text\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(1);
					expect(received[0].message).to.include("Arguments to a *selectable_if before an #option must be in parentheses");
					expect(received[0].range.start.line).to.equal(34);
					expect(received[0].range.end.line).to.equal(39);
				});

				it("should be okay with a *_reuse followed by a *selectable_if in front of an option", () => {
					let fakeDocument = createDocument("Line 0\n*choice\n    *hide_reuse *if (1 < 2) #One\n        Text\n    #Two\n        Text\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(0);
				});

				it("should flag a *selectable_if followed by a *_reuse in front of an option", () => {
					let fakeDocument = createDocument("Line 0\n*choice\n    *selectable_if (false) *disable_reuse #One\n        Text\n    #Two\n        Text\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(1);
					expect(received[0].message).to.include("*disable_reuse must be before *selectable_if");
					expect(received[0].range.start.line).to.equal(42);
					expect(received[0].range.end.line).to.equal(56);
				});

				it("should flag a non-choice non-*if line", () => {
					let fakeDocument = createDocument("Line 0\n*choice\n    Nope\n        Text\n    #Two\n        Text\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(1);
					expect(received[0].message).to.include("Must be either an #option or an *if");
					expect(received[0].range.start.line).to.equal(19);
					expect(received[0].range.end.line).to.equal(24);
				});

				it("should flag another option in a choice with no contents", () => {
					let fakeDocument = createDocument("Line 0\n*choice\n    #Option one\n    #Option 2\n        Contents\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(1);
					expect(received[0].message).to.include("An option in a *choice must have contents");
					expect(received[0].range.start.line).to.equal(30);
					expect(received[0].range.end.line).to.equal(31);
				});

				it("should flag an option in a choice with no contents", () => {
					let fakeDocument = createDocument("Line 0\n*choice\n\t#Totally Empty\n\t#Two\n\t\tContents\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(1);
					expect(received[0].message).to.include("An option in a *choice must have contents");
					expect(received[0].range.start.line).to.equal(30);
					expect(received[0].range.end.line).to.equal(31);
				});

				it("should not flag an option in a fake choice with no contents", () => {
					let fakeDocument = createDocument("Line 0\n*fake_choice\n\t#Empty\n\t#Two\n\t\tContentsEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(0);
				});

				it("should be okay with an if command on the line before an option", () => {
					let fakeDocument = createDocument("Line 0\n*choice\n  *if (1 < 2)\n    #One\n      Text\n  #Two\n        Text\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(0);
				});

				it("should be okay with multiple indented options after an if command", () => {
					let fakeDocument = createDocument("Line 0\n*choice\n\t#One\n\t\tText1\n\t*if (1 < 2)\n\t\t#Two\n\t\t\tText2\n\t\t#Three\n\t\t\tText3\n\t#Four\n\t\tText4\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(0);
				});

				it("should be okay with indented options after an *if command inside another indented option", () => {
					let fakeDocument = createDocument("Line 0\n*choice\n\t#One\n\t\tText1\n\t*if (1 < 2)\n\t\t#Two\n\t\t\tText2\n\t\t*if (true)\n\t\t\t#Three\n\t\t\t\tText3\n\t\t#Four\n\t\t\tText4\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(0);
				});

				it("should flag a too-indented option after an if command and indented block", () => {
					let fakeDocument = createDocument("Line 0\n*choice\n\t#One\n\t\tText1\n\t*if (1 < 2)\n\t\t#Two\n\t\t\tText2\n\t#Three\n\t\tText3\n\t\t#Four\n\t\t\tText4\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(1);
					expect(received[0].message).to.include("This #option is too indented");
					expect(received[0].range.start.line).to.equal(74);
					expect(received[0].range.end.line).to.equal(76);
				});

				it("should flag inconsistently-indented multiple options after an if command", () => {
					let fakeDocument = createDocument("Line 0\n*choice\n *if (1 < 2)\n  #One\n   Text1\n   #Two\n   Text2\n #Three\n  Text3\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(1);
					expect(received[0].message).to.include("This #option is too indented");
					expect(received[0].range.start.line).to.equal(44);
					expect(received[0].range.end.line).to.equal(47);
				});

				it("should flag a not-enough-indented choice", () => {
					let fakeDocument = createDocument("Line 0\n*choice\n    #One\n        Text\n   #Two\n        Text\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(1);
					expect(received[0].message).to.include("Line is not indented far enough");
					expect(received[0].range.start.line).to.equal(37);
					expect(received[0].range.end.line).to.equal(40);
				});

				it("should flag mixed tabs and spaces", () => {
					let fakeDocument = createDocument("Line 0\n*choice\n\t #One\n\t    Text\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(1);
					expect(received[0].message).to.include("Spaces used instead of tabs");
					expect(received[0].range.start.line).to.equal(15);
					expect(received[0].range.end.line).to.equal(17);
				});

				it("should flag a switch from tabs to spaces", () => {
					let fakeDocument = createDocument("Line 0\n*choice\n\t#One\n  Text\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(1);
					expect(received[0].message).to.include("Spaces used instead of tabs");
					expect(received[0].range.start.line).to.equal(21);
					expect(received[0].range.end.line).to.equal(23);
				});

				it("should flag a switch from spaces to tabs", () => {
					let fakeDocument = createDocument("Line 0\n*choice\n  #One\n\t\tText\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(1);
					expect(received[0].message).to.include("Tabs used instead of spaces");
					expect(received[0].range.start.line).to.equal(22);
					expect(received[0].range.end.line).to.equal(24);
				});
			});

			describe("Choice Groups", () => {
				it("should not flag allowable choice group names", () => {
					let fakeDocument = createDocument("Line 0\n*fake_choice g1 g2\n\t#One\n\t\t#Subone\n\t#Two\n\t\t#Subone\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(0);
				});

				it("should flag bad choice group names", () => {
					let fakeDocument = createDocument("Line 0\n*choice nope's\n\t#One\n\t\tText\n\t#Two\n\t\tText\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(1);
					expect(received[0].message).to.include("Choice group names can only have letters, numbers, or _");
					expect(received[0].range.start.line).to.equal(15);
					expect(received[0].range.end.line).to.equal(21);
				});

				it("should flag repeated bad choice group names", () => {
					let fakeDocument = createDocument("Line 0\n*fake_choice nope's  nope's\n\t#One\n\t\t#SubOne\n\t#Two\n\t\t#SubOne\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(2);
					expect(received[0].message).to.include("Choice group names can only have letters, numbers, or _");
					expect(received[0].range.start.line).to.equal(20);
					expect(received[0].range.end.line).to.equal(26);
					expect(received[1].message).to.include("Choice group names can only have letters, numbers, or _");
					expect(received[1].range.start.line).to.equal(28);
					expect(received[1].range.end.line).to.equal(34);
				});

				it("should flag missing group sub-options", () => {
					let fakeDocument = createDocument("Line 0\n*fake_choice a b\n\t#One\n\t#Two\n\t\t#SubOne\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(1);
					expect(received[0].message).to.include("Missing options for group b");
					expect(received[0].range.start.line).to.equal(29);
					expect(received[0].range.end.line).to.equal(30);
				});

				it("should flag missing group sub-options at the end of the choice block without running over", () => {
					let fakeDocument = createDocument("Line 0\n*fake_choice a b c\n\t#One\n\t\t#subone\n\t\t\t#subsubone\n\t#Two\n\t\t#subone\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(1);
					expect(received[0].message).to.include("Missing options for group c");
					expect(received[0].range.start.line).to.equal(71);
					expect(received[0].range.end.line).to.equal(72);
				});

				it("should flag too-intented sub-options in the same subgroup", () => {
					let fakeDocument = createDocument("Line 0\n*fake_choice a b\n\t#One\n\t\t#SubOne\n\t\t\t#SubTwo\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(1);
					expect(received[0].message).to.include("This #option is too indented");
					expect(received[0].range.start.line).to.equal(40);
					expect(received[0].range.end.line).to.equal(43);
				});

				it("should be okay with different indented sub-options in different subgroups", () => {
					let fakeDocument = createDocument("Line 0\n*fake_choice a b\n\t#One\n\t\t#SubOne\n\t\t#SubTwo\n\t#Two\n\t\t\t#SubOne\n\t\t\t#SubTwo\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(0);
				});

				it("should flag group sub-options with different text", () => {
					let fakeDocument = createDocument("Line 0\n*fake_choice a b\n\t#One\n\t\t#SubOne\n\t#Two\n\t\t#SubOn\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(1);
					expect(received[0].message).to.include("Group sub-options must be exactly the same");
					expect(received[0].range.start.line).to.equal(49);
					expect(received[0].range.end.line).to.equal(54);
				});

				it("should flag text before group sub-options", () => {
					let fakeDocument = createDocument("Line 0\n*fake_choice a b\n\t#One\n\t\tbad #SubOne\n\t\t#SubTwo\n\t#Two\n\t\t#SubOne\n\t\t#SubTwo\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(1);
					expect(received[0].message).to.include("Only *if, *selectable_if, or one of the reuse commands allowed in front of an option");
					expect(received[0].range.start.line).to.equal(32);
					expect(received[0].range.end.line).to.equal(35);
				});

				it("should flag text in between group sub-options", () => {
					let fakeDocument = createDocument("Line 0\n*fake_choice a b c\n\t#One\n\t\tText\n\t\t#SubOne\n\t\t\t#SubSubOne\n\t#Two\n\t\t#SubOne\n\t\t\tText\n\t\t\t#SubSubOne\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(2);
					expect(received[0].message).to.include("Nothing is allowed between group sub-options");
					expect(received[0].range.start.line).to.equal(32);
					expect(received[0].range.end.line).to.equal(38);
					expect(received[1].message).to.include("Nothing is allowed between group sub-options");
					expect(received[1].range.start.line).to.equal(79);
					expect(received[1].range.end.line).to.equal(86);
				});

				it("should warn on missing inline *if statements in front of group sub-options", () => {
					let fakeDocument = createDocument("Line 0\n*fake_choice a b\n\t#One\n\t\t*if (true) #SubOne\n\t#Two\n\t\t#SubOne\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(1);
					expect(received[0].severity).to.equal(DiagnosticSeverity.Warning);
					expect(received[0].message).to.include("*if statements in front of group sub-options must all evaluate to the same true or false value");
					expect(received[0].range.start.line).to.equal(59);
					expect(received[0].range.end.line).to.equal(60);
				});

				it("should warn on missing *if statements on a separate line in front of group sub-options", () => {
					let fakeDocument = createDocument("Line 0\n*fake_choice a b\n\t#One\n\t\t*if (true)\n\t\t\t#SubOne\n\t#Two\n\t\t#SubOne\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(1);
					expect(received[0].severity).to.equal(DiagnosticSeverity.Warning);
					expect(received[0].message).to.include("*if statements in front of group sub-options must all evaluate to the same true or false value");
					expect(received[0].range.start.line).to.equal(62);
					expect(received[0].range.end.line).to.equal(63);
				});

				it("should warn on mis-matched inline *if statements in front of group sub-options", () => {
					let fakeDocument = createDocument("Line 0\n*fake_choice a b\n\t#One\n\t\t*if (var1) #SubOne\n\t#Two\n\t\t*if (var2) #SubOne\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(1);
					expect(received[0].severity).to.equal(DiagnosticSeverity.Warning);
					expect(received[0].message).to.include("*if statements in front of group sub-options must all evaluate to the same true or false value");
					expect(received[0].range.start.line).to.equal(63);
					expect(received[0].range.end.line).to.equal(69);
				});

				it("should warn on mis-matched *if statements in front of group sub-options", () => {
					let fakeDocument = createDocument("Line 0\n*fake_choice a b\n\t#One\n\t\t*if (var1)\n\t\t\t#SubOne\n\t#Two\n\t\t*if (var2)\n\t\t\t#SubOne\nEnd");
					let received: Array<Diagnostic> = [];
					let fakeCallbacks = Substitute.for<ParserCallbacks>();
					fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
						received.push(e);
					});

					parse(fakeDocument, fakeCallbacks);

					expect(received.length).to.equal(1);
					expect(received[0].severity).to.equal(DiagnosticSeverity.Warning);
					expect(received[0].message).to.include("*if statements in front of group sub-options must all evaluate to the same true or false value");
					expect(received[0].range.start.line).to.equal(66);
					expect(received[0].range.end.line).to.equal(72);
				});
			});
		});

		describe("Replacements", () => {
			it("should flag an unterminated replace", () => {
				let fakeDocument = createDocument("replace ${ with errors");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Replacement is missing its }");
				expect(received[0].range.start.line).to.equal(8);
				expect(received[0].range.end.line).to.equal(22);
			});

			it("should flag an unterminated replace in a block", () => {
				let fakeDocument = createDocument("*if true\n\treplace ${ with errors");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Replacement is missing its }");
				expect(received[0].range.start.line).to.equal(18);
				expect(received[0].range.end.line).to.equal(32);
			});

			it("should flag an empty replace", () => {
				let fakeDocument = createDocument("replace ${} with errors");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Replacement is empty");
				expect(received[0].range.start.line).to.equal(8);
				expect(received[0].range.end.line).to.equal(11);
			});

			it("should flag an empty replace in a block", () => {
				let fakeDocument = createDocument("*if true\n\treplace ${} with errors");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Replacement is empty");
				expect(received[0].range.start.line).to.equal(18);
				expect(received[0].range.end.line).to.equal(21);
			});
		});

		describe("Multireplaces", () => {
			it("should flag an unterminated multireplace", () => {
				let fakeDocument = createDocument("multireplace @{no end|in sight");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Multireplace is missing its }");
				expect(received[0].range.start.line).to.equal(13);
				expect(received[0].range.end.line).to.equal(15);
			});

			it("should flag an unterminated multireplace in a block", () => {
				let fakeDocument = createDocument("*if true\n\tmultireplace @{no end|in sight");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Multireplace is missing its }");
				expect(received[0].range.start.line).to.equal(23);
				expect(received[0].range.end.line).to.equal(25);
			});

			it("should not flag a terminated multireplace with a backslash at the end", () => {
				let fakeDocument = createDocument("multireplace @{var this|is okay\\}");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(0);
			});

			it("should flag an empty multireplace", () => {
				let fakeDocument = createDocument("multireplace @{} with errors");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Multireplace is empty");
				expect(received[0].range.start.line).to.equal(13);
				expect(received[0].range.end.line).to.equal(16);
			});

			it("should flag an empty multireplace in a block", () => {
				let fakeDocument = createDocument("*if true\n\tmultireplace @{} with errors");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Multireplace is empty");
				expect(received[0].range.start.line).to.equal(23);
				expect(received[0].range.end.line).to.equal(26);
			});

			it("should flag a multireplace with a space before its variable", () => {
				let fakeDocument = createDocument("multireplace @{ var one|two}");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Spaces aren't allowed at the start of a multireplace");
				expect(received[0].range.start.line).to.equal(15);
				expect(received[0].range.end.line).to.equal(16);
			});

			it("should flag a multireplace with no options", () => {
				let fakeDocument = createDocument("@{(var > 2) }");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Multireplace has no options");
				expect(received[0].range.start.line).to.equal(11);
				expect(received[0].range.end.line).to.equal(13);
			});

			it("should flag a multireplace in an if block with no options", () => {
				let fakeDocument = createDocument("*if true\n\t@{(var > 2) }");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Multireplace has no options");
				expect(received[0].range.start.line).to.equal(21);
				expect(received[0].range.end.line).to.equal(23);
			});

			it("should flag a multireplace with only one option", () => {
				let fakeDocument = createDocument("multireplace @{var true} with errors");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Multireplace must have at least two options separated by |");
				expect(received[0].range.start.line).to.equal(23);
				expect(received[0].range.end.line).to.equal(24);
			});

			it("should flag a multireplace with only one option in a block", () => {
				let fakeDocument = createDocument("*if true\n\tmultireplace @{var true} with errors");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Multireplace must have at least two options separated by |");
				expect(received[0].range.start.line).to.equal(33);
				expect(received[0].range.end.line).to.equal(34);
			});

			it("should flag a multireplace with no space after its variable", () => {
				let fakeDocument = createDocument("multireplace @{var\"one and\"|\"two\"}");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Multireplace must have a space after its variable");
				expect(received[0].range.start.line).to.equal(15);
				expect(received[0].range.end.line).to.equal(22);
			});

			it("should flag a multireplace with no space after its parentheses", () => {
				let fakeDocument = createDocument("multireplace @{(var)true|false}");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Multireplace must have a space after parentheses");
				expect(received[0].range.start.line).to.equal(19);
				expect(received[0].range.end.line).to.equal(20);
			});

			it("should flag a multireplace with no space after its parentheses in a block", () => {
				let fakeDocument = createDocument("*if true\n\tmultireplace @{(var)true|false}");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Multireplace must have a space after parentheses");
				expect(received[0].range.start.line).to.equal(29);
				expect(received[0].range.end.line).to.equal(30);
			});

			it("should not flag a multireplace with a blank first option", () => {
				let fakeDocument = createDocument("multireplace @{(var) |, the redsmith's son,}");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(0);
			});

			it("should flag a mistakenly nested multi-replace", () => {
				let fakeDocument = createDocument('Previous line that is very very long\n@{var1 true bit | @{var2 other true bit | false bit}}\nNext line');
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Multireplaces cannot be nested");
				expect(received[0].range.start.line).to.equal(55);
				expect(received[0].range.end.line).to.equal(89);
			});

			it("should flag a mistakenly nested multi-replace in a block", () => {
				let fakeDocument = createDocument('Previous line that is very very long\n*if true\n\t@{var1 true bit | @{var2 other true bit | false bit}}\nNext line');
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Multireplaces cannot be nested");
				expect(received[0].range.start.line).to.equal(65);
				expect(received[0].range.end.line).to.equal(99);
			});

			it("should flag an operator in a bare multireplace", () => {
				let fakeDocument = createDocument("@{var > 2 yes | no}");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Potentially missing parentheses");
				expect(received[0].range.start.line).to.equal(2);
				expect(received[0].range.end.line).to.equal(7);
			});

			it("should flag an operator in a bare multireplace even without spaces", () => {
				let fakeDocument = createDocument("@{var>2 yes | no}");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(2);
				expect(received[1].message).to.include("Potentially missing parentheses");
				expect(received[1].range.start.line).to.equal(2);
				expect(received[1].range.end.line).to.equal(7);
			});

			it("should flag an operator in a bare multireplace inside a block", () => {
				let fakeDocument = createDocument("*if true\n\t@{var > 2 yes | no}");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Potentially missing parentheses");
				expect(received[0].range.start.line).to.equal(12);
				expect(received[0].range.end.line).to.equal(17);
			});

			it("should not flag a word operator in a bare multireplace", () => {
				let fakeDocument = createDocument("@{var and true yes | no}");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(0);
			});

			it("should not flag a dashed compound word in a bare multireplace", () => {
				let fakeDocument = createDocument("@{var compound-word|}");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

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
				});

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
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(0);
			});

			it("should flag *create commands in a non-startup file", () => {
				let fakeDocument = createDocument("*create variable true", "file:///scene.txt");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("can only be used in startup.txt");
				expect(received[0].range.start.line).to.equal(1);
				expect(received[0].range.end.line).to.equal(7);
			});

			it("should flag *create commands after a *temp command", () => {
				let fakeDocument = createDocument("*temp var1 false\n*create var2 true");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Must come before any *temp commands");
				expect(received[0].range.start.line).to.equal(18);
				expect(received[0].range.end.line).to.equal(24);
			});
		});

		describe("Variable Reference Commands", () => {
			it("should flag *if not(condition) before an #option", () => {
				let fakeDocument = createDocument("*choice\n\t*if not(false) #Choice\n\t\tHi.");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Without parentheses, this expression will always be true");
				expect(received[0].range.start.line).to.equal(13);
				expect(received[0].range.end.line).to.equal(23);
			});

			it("should be okay with *if (not(condition)) before a #choice", () => {
				let fakeDocument = createDocument("*choice\n\t*if (not(false)) #Choice\n\t\tHi.");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(0);
			});

			it("should flag non-boolean results", () => {
				let fakeDocument = createDocument("*if 1\n\tHi.");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Must be a boolean value");
				expect(received[0].range.start.line).to.equal(4);
				expect(received[0].range.end.line).to.equal(5);
			});

			it("should flag non-boolean functions", () => {
				let fakeDocument = createDocument("*if round(2)\n\tHi.");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Must be a boolean value");
				expect(received[0].range.start.line).to.equal(4);
				expect(received[0].range.end.line).to.equal(12);
			});

			it("should flag unbalanced parentheses", () => {
				let fakeDocument = createDocument("*if not(var1&(var2&var3)\n\tHi.");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Missing end )");
				expect(received[0].range.start.line).to.equal(4);
				expect(received[0].range.end.line).to.equal(24);
			});

			it("should flag chained conditions", () => {
				let fakeDocument = createDocument("*if true and false and true\n\tHi.");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Too many elements - are you missing parentheses");
				expect(received[0].range.start.line).to.equal(19);
				expect(received[0].range.end.line).to.equal(27);
			});

			it("should not flag properly parenthesized conditions", () => {
				let fakeDocument = createDocument("*if true and (false and true)\n\tHi.");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(0);
			});

			it("should flag a not that's missing parentheses", () => {
				let fakeDocument = createDocument("*if not true\n\tHi.");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Function must be followed by");
				expect(received[0].range.start.line).to.equal(4);
				expect(received[0].range.end.line).to.equal(7);
			});

			it("should flag a non-boolean function", () => {
				let fakeDocument = createDocument("*if round(1.1)\n\tHi.");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Must be a boolean value");
				expect(received[0].range.start.line).to.equal(4);
				expect(received[0].range.end.line).to.equal(14);
			});

			it("should be good with number comparisons", () => {
				let fakeDocument = createDocument("*if 1 > 3\n\tHi.");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(0);
			});

			it("should be good with truth comparisons", () => {
				let fakeDocument = createDocument("*if variable and true\n\tHi.");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

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
				});

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
				});

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
				});

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
				});

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
				});

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
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(0);
			});

			it("should flag a missing operator", () => {
				let fakeDocument = createDocument('*set var 1 4');
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

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
				});

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
				});

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
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Not a string or comparison operator");
				expect(received[0].range.start.line).to.equal(15);
				expect(received[0].range.end.line).to.equal(16);
			});

			it("should flag a not-number value after a string and the index operator", () => {
				let fakeDocument = createDocument('*set var other_var#"hi"');
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Must be a number or a variable");
				expect(received[0].range.start.line).to.equal(19);
				expect(received[0].range.end.line).to.equal(23);
			});

			it("should flag a non-number operator at the start of the expression", () => {
				let fakeDocument = createDocument("*set variable and true");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

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
				});

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
				});

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
				});

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
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(0);
			});

			it("should flag a not that's missing parentheses", () => {
				let fakeDocument = createDocument("*set variable not 1");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Function must be followed by parentheses");
				expect(received[0].range.start.line).to.equal(14);
				expect(received[0].range.end.line).to.equal(17);
			});

			it("should locate expression errors properly inside an *if block", () => {
				let fakeDocument = createDocument("*if true\n\t*set variable and true");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Must be a numeric operator");
				expect(received[0].range.start.line).to.equal(24);
				expect(received[0].range.end.line).to.equal(27);
			});

		});

		describe("Stat Charts", () => {
			it("should raise an error for an empty *stat_chart", () => {
				let fakeDocument = createDocument("*stat_chart\nI didn't enter any data");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

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
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Must be one of text, percent, opposed_pair");
				expect(received[0].range.start.line).to.equal(13);
				expect(received[0].range.end.line).to.equal(25);
			});
		});

		describe("Achievements", () => {
			it("should raise an error on a missing codename", () => {
				let fakeDocument = createDocument("*achievement \n  Desc");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Command *achievement is missing its arguments");
				expect(received[0].range.start.line).to.equal(1);
				expect(received[0].range.end.line).to.equal(12);
			});

			it("should raise an error on a missing visibility", () => {
				let fakeDocument = createDocument("*achievement codename \n  Desc");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Command *achievement is missing its visibility");
				expect(received[0].range.start.line).to.equal(21);
				expect(received[0].range.end.line).to.equal(21);
			});

			it("should raise an error on missing points", () => {
				let fakeDocument = createDocument("*achievement codename visible \n  Desc");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Command *achievement is missing its points value");
				expect(received[0].range.start.line).to.equal(29);
				expect(received[0].range.end.line).to.equal(29);
			});

			it("should raise an error on a missing title", () => {
				let fakeDocument = createDocument("*achievement codename visible 20 \n  Desc");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Command *achievement is missing its title");
				expect(received[0].range.start.line).to.equal(32);
				expect(received[0].range.end.line).to.equal(33);
			});
			
			it("should raise an error on an incorrect visibility", () => {
				let fakeDocument = createDocument("*achievement codename imvisible 20 Title\n  Desc");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("*achievement visibility must be 'hidden' or 'visible'");
				expect(received[0].range.start.line).to.equal(22);
				expect(received[0].range.end.line).to.equal(31);
			});

			it("should raise an error on non-integer points", () => {
				let fakeDocument = createDocument("*achievement codename visible plp Title\n  Desc");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("*achievement points must be a number");
				expect(received[0].range.start.line).to.equal(30);
				expect(received[0].range.end.line).to.equal(33);
			});

			it("should raise an error on too many points", () => {
				let fakeDocument = createDocument("*achievement codename visible 101 Title\n  Desc");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("*achievement points must be 100 or less");
				expect(received[0].range.start.line).to.equal(30);
				expect(received[0].range.end.line).to.equal(33);
			});

			it("should raise an error on too few points", () => {
				let fakeDocument = createDocument("*achievement codename visible 0 Title\n  Desc");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("*achievement points must be 1 or more");
				expect(received[0].range.start.line).to.equal(30);
				expect(received[0].range.end.line).to.equal(31);
			});

			it("should raise an error on a title with a replacement", () => {
				let fakeDocument = createDocument("*achievement codename visible 20 A ${replace}\n  Desc");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("*achievement title can't include a ${} replace");
				expect(received[0].range.start.line).to.equal(35);
				expect(received[0].range.end.line).to.equal(37);
			});
			
			it("should raise an error on a title with a multireplacement", () => {
				let fakeDocument = createDocument("*achievement codename visible 20 A @{multi rep|lace}\n  Desc");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("*achievement title can't include a @{} multireplace");
				expect(received[0].range.start.line).to.equal(35);
				expect(received[0].range.end.line).to.equal(37);
			});
			
			it("should raise an error on a title with brackets", () => {
				let fakeDocument = createDocument("*achievement codename visible 20 A [bracket]\n  Desc");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("*achievement title can't include [] brackets");
				expect(received[0].range.start.line).to.equal(35);
				expect(received[0].range.end.line).to.equal(36);
			});
			
			it("should raise an error on too-long titles", () => {
				let fakeDocument = createDocument("*achievement codename visible 20 123456789012345678921234567893123456789412345678951\n  Desc");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("*achievement title can't be longer than 50 characters");
				expect(received[0].range.start.line).to.equal(33+50);
				expect(received[0].range.end.line).to.equal(33+51);
			});
			
			it("should raise an error on a missing pre-earned description", () => {
				let fakeDocument = createDocument("*achievement codename visible 20 T\nNot a desc");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("*achievement is missing its indented pre-earned description");
				expect(received[0].range.start.line).to.equal(34);
				expect(received[0].range.end.line).to.equal(34);
			});
			
			it("should raise an error on a pre-earned description with a replace", () => {
				let fakeDocument = createDocument("*achievement codename visible 20 T\n  A ${replace}");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("*achievement pre-earned description can't include a ${} replace");
				expect(received[0].range.start.line).to.equal(39);
				expect(received[0].range.end.line).to.equal(41);
			});
			
			it("should raise an error on a pre-earned description with a multireplace", () => {
				let fakeDocument = createDocument("*achievement codename visible 20 T\n  A @{multi re|place}");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("*achievement pre-earned description can't include a @{} multireplace");
				expect(received[0].range.start.line).to.equal(39);
				expect(received[0].range.end.line).to.equal(41);
			});
			
			it("should raise an error on a pre-earned description with brackets", () => {
				let fakeDocument = createDocument("*achievement codename visible 20 T\n  A [bracket]");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("*achievement pre-earned description can't include [] brackets");
				expect(received[0].range.start.line).to.equal(39);
				expect(received[0].range.end.line).to.equal(40);
			});
			
			it("should raise an error on a too-long pre-earned description", () => {
				let fakeDocument = createDocument(`*achievement codename visible 20 T\n  ${"1".repeat(202)}`);
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("*achievement pre-earned description can't be longer than 200 characters");
				expect(received[0].range.start.line).to.equal(37+200);
				expect(received[0].range.end.line).to.equal(37+202);
			});
			
			it("should not raise an error on a visible achievement with no post-earned description", () => {
				let fakeDocument = createDocument("*achievement codename visible 20 T\n  A\n");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(0);
			});
			
			it("should raise an error on a hidden achievement with no post-earned description", () => {
				let fakeDocument = createDocument("*achievement codename hidden 20 T\n  hIdDeN\n");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Hidden *achievement must have a post-earned description");
				expect(received[0].range.start.line).to.equal(43);
				expect(received[0].range.end.line).to.equal(43);
			});
			
			it("should raise an error on a hidden achievement with an improperly-indented post-earned description", () => {
				let fakeDocument = createDocument("*achievement codename hidden 20 T\n  hIdDeN\nPost-earned desc");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Hidden *achievement must have a post-earned description");
				expect(received[0].range.start.line).to.equal(43);
				expect(received[0].range.end.line).to.equal(43);
			});
			
			it("should raise an error on a hidden achievement with a pre-earned description that isn't 'hidden'", () => {
				let fakeDocument = createDocument("*achievement codename hidden 20 T\n  A\n  B");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Hidden *achievement's pre-earned description must be 'hidden'");
				expect(received[0].range.start.line).to.equal(36);
				expect(received[0].range.end.line).to.equal(37);
			});
			
			it("should raise an error on a post-earned description with a replace", () => {
				let fakeDocument = createDocument("*achievement codename visible 20 T\n  A\n  A ${replace}");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("*achievement post-earned description can't include a ${} replace");
				expect(received[0].range.start.line).to.equal(43);
				expect(received[0].range.end.line).to.equal(45);
			});
			
			it("should raise an error on a post-earned description with a multireplace", () => {
				let fakeDocument = createDocument("*achievement codename visible 20 T\n  A\n  A @{multi re|place}");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("*achievement post-earned description can't include a @{} multireplace");
				expect(received[0].range.start.line).to.equal(43);
				expect(received[0].range.end.line).to.equal(45);
			});
			
			it("should raise an error on a post-earned description with brackets", () => {
				let fakeDocument = createDocument("*achievement codename visible 20 T\n  A\n  A [bracket]");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("*achievement post-earned description can't include [] brackets");
				expect(received[0].range.start.line).to.equal(43);
				expect(received[0].range.end.line).to.equal(44);
			});
			
			it("should raise an error on a too-long post-earned description", () => {
				let fakeDocument = createDocument(`*achievement codename visible 20 T\n  A\n  ${"1".repeat(203)}`);
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("*achievement post-earned description can't be longer than 200 characters");
				expect(received[0].range.start.line).to.equal(41+200);
				expect(received[0].range.end.line).to.equal(41+203);
			});
		});

		describe("Images", () => {
			it("should raise an error on a missing image url", () => {
				let fakeDocument = createDocument("*image ");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Command *image is missing its arguments");
				expect(received[0].range.start.line).to.equal(1);
				expect(received[0].range.end.line).to.equal(6);
			});

			it("should not raise an error if there is no alignment", () => {
				let fakeDocument = createDocument("*image cover.png ");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(0);
			});

			it("should raise an error for an incorrect alignment", () => {
				let fakeDocument = createDocument("*image cover.png leftttt");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Must be one of left, right, or center");
				expect(received[0].range.start.line).to.equal(17);
				expect(received[0].range.end.line).to.equal(24);
			});

			it("should not raise an error for a correct alignment", () => {
				let fakeDocument = createDocument("*image cover.png left");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(0);
			});

			it("should not raise an error for alt text", () => {
				let fakeDocument = createDocument("*image cover.png left This is alt text.");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(0);
			});

			it("should not raise an error for alt text but do so for a bad alignment", () => {
				let fakeDocument = createDocument("*image cover.png leftt This is alt text.");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Must be one of left, right, or center");
				expect(received[0].range.start.line).to.equal(17);
				expect(received[0].range.end.line).to.equal(22);
			});
		});

		describe("Text Images", () => {
			it("should raise an error on a missing image url", () => {
				let fakeDocument = createDocument("*text_image ");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Command *text_image is missing its arguments");
				expect(received[0].range.start.line).to.equal(1);
				expect(received[0].range.end.line).to.equal(11);
			});

			it("should not raise an error if there is no alignment", () => {
				let fakeDocument = createDocument("*text_image cover.png ");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(0);
			});

			it("should raise an error for an incorrect alignment", () => {
				let fakeDocument = createDocument("*text_image cover.png flooble alt text");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Must be one of left, right, or center");
				expect(received[0].range.start.line).to.equal(22);
				expect(received[0].range.end.line).to.equal(29);
			});

			it("should not raise an error for a correct alignment", () => {
				let fakeDocument = createDocument("*text_image cover.png left");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(0);
			});

			it("should not raise an error for alt text", () => {
				let fakeDocument = createDocument("*text_image cover.png left This is alt text.");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(0);
			});
		});

		describe("IFID", () => {
			it("should flag an IFID that doesn't follow the proper pattern", () => {
				let fakeDocument = createDocument("*ifid 1");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("An IFID must have only hexidecimal characters (0-9 or a-f) in a 8-4-4-4-12 pattern");
				expect(received[0].range.start.line).to.equal(6);
				expect(received[0].range.end.line).to.equal(7);
			});

			it("should flag an IFID identifier that has non-hexidecimal characters", () => {
				let fakeDocument = createDocument("*ifid 12345678-abcd-ef12-3456-7890abcdefgh");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("An IFID must have only hexidecimal characters (0-9 or a-f) in a 8-4-4-4-12 pattern");
				expect(received[0].range.start.line).to.equal(6);
				expect(received[0].range.end.line).to.equal(42);
			});

			it("should flag text after an IFID identifier", () => {
				let fakeDocument = createDocument("*ifid 12345678-abcd-ef12-3456-7890abcdef01 whoops");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Nothing can follow an IFID");
				expect(received[0].range.start.line).to.equal(43);
				expect(received[0].range.end.line).to.equal(49);
			});
		});

		describe("Kindle Search", () => {
			it("should not flag kindle searches with a parenthesized search and a button name", () => {
				let fakeDocument = createDocument("*kindle_search (ok) button name");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(0);
			});

			it("should flag kindle searches with unparenthesized arguments", () => {
				let fakeDocument = createDocument("*kindle_search missing parens");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("The first argument to kindle_search must be in parentheses");
				expect(received[0].range.start.line).to.equal(15);
				expect(received[0].range.end.line).to.equal(29);
			});

			it("should flag kindle searches with a missing close parenthesis", () => {
				let fakeDocument = createDocument("*kindle_search (missing parens");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Missing close parenthesis");
				expect(received[0].range.start.line).to.equal(30);
				expect(received[0].range.end.line).to.equal(31);
			});

			it("should flag kindle searches with empty searches", () => {
				let fakeDocument = createDocument("*kindle_search ()");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Missing search");
				expect(received[0].range.start.line).to.equal(16);
				expect(received[0].range.end.line).to.equal(16);
			});

			it("should flag kindle searches with a missing button name", () => {
				let fakeDocument = createDocument("*kindle_search (parens) ");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Missing button name");
				expect(received[0].range.start.line).to.equal(24);
				expect(received[0].range.end.line).to.equal(24);
			});

			it("should flag kindle searches with no space before the button name", () => {
				let fakeDocument = createDocument("*kindle_search (parens)button");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("Missing space before the button name");
				expect(received[0].range.start.line).to.equal(23);
				expect(received[0].range.end.line).to.equal(23);
			});
		});

		describe("Product", () => {
			it("should flag a product id with an upper case letter", () => {
				let fakeDocument = createDocument("*product aAa");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("A product ID can only contain lower-case letters");
				expect(received[0].range.start.line).to.equal(9);
				expect(received[0].range.end.line).to.equal(12);
			});

			it("should flag a product id with a number", () => {
				let fakeDocument = createDocument("*product a1a");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("A product ID can only contain lower-case letters");
				expect(received[0].range.start.line).to.equal(9);
				expect(received[0].range.end.line).to.equal(12);
			});

			it("should flag a product id with punctuation", () => {
				let fakeDocument = createDocument("*product a#a");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("A product ID can only contain lower-case letters");
				expect(received[0].range.start.line).to.equal(9);
				expect(received[0].range.end.line).to.equal(12);
			});
		});

		describe("Checkpoints", () => {
			it("should flag a save_checkpoint with symbols other than letters, numbers, or underscores", () => {
				let fakeDocument = createDocument("*save_checkpoint azAZ_19*");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("A checkpoint slot's name can only contain letters, numbers or an underscore");
				expect(received[0].range.start.line).to.equal(17);
				expect(received[0].range.end.line).to.equal(25);
			});

			it("should flag a restore_checkpoint with symbols other than letters, numbers, or underscores", () => {
				let fakeDocument = createDocument("*restore_checkpoint azAZ_19*");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("A checkpoint slot's name can only contain letters, numbers or an underscore");
				expect(received[0].range.start.line).to.equal(20);
				expect(received[0].range.end.line).to.equal(28);
			});
		});

		describe("Other", () => {
			it("should flag an #option outside of a *choice", () => {
				let fakeDocument = createDocument("#This option isn't part of a *choice");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("An #option must only appear inside a *choice or *fake_choice");
				expect(received[0].range.start.line).to.equal(0);
				expect(received[0].range.end.line).to.equal(1);
			});

			it("should flag an #option outside of a *choice but inside a block", () => {
				let fakeDocument = createDocument("*if true\n\t#This option isn't part of a *choice");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(1);
				expect(received[0].message).to.include("An #option must only appear inside a *choice or *fake_choice");
				expect(received[0].range.start.line).to.equal(10);
				expect(received[0].range.end.line).to.equal(11);
			});

			it("should not flag a pound sign inside regular text as a misplaced #option", () => {
				let fakeDocument = createDocument("No #error here");
				let received: Array<Diagnostic> = [];
				let fakeCallbacks = Substitute.for<ParserCallbacks>();
				fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
					received.push(e);
				});

				parse(fakeDocument, fakeCallbacks);

				expect(received.length).to.equal(0);
			});
		});
	});

	describe("Word Count", () => {
		it("should count words", () => {
			let fakeDocument = createDocument("This sentence contains\neight words over two lines.");
			let received: Array<Diagnostic> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
				received.push(e);
			});

			const wordCount = parse(fakeDocument, fakeCallbacks);

			expect(wordCount).to.equal(8);
		});

		it("should return no words for a blank document", () => {
			let fakeDocument = createDocument("  \n  \n\t\t");
			let received: Array<Diagnostic> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
				received.push(e);
			});

			const wordCount = parse(fakeDocument, fakeCallbacks);

			expect(wordCount).to.equal(0);
		});

		it("should skip commands", () => {
			let fakeDocument = createDocument("Sentence one.\n*comment a command!\nSentence two.");
			let received: Array<Diagnostic> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
				received.push(e);
			});

			const wordCount = parse(fakeDocument, fakeCallbacks);

			expect(wordCount).to.equal(4);
		});

		it("should count words in options but not the # option character", () => {
			let fakeDocument = createDocument("*choice\n\t#One two three.\n\t\tFour five.\n\t# Six.\n\t\tSeven eight\n");
			let received: Array<Diagnostic> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
				received.push(e);
			});

			const wordCount = parse(fakeDocument, fakeCallbacks);

			expect(wordCount).to.equal(8);
		});

		it("should count words in options that have a leading *if", () => {
			let fakeDocument = createDocument("*choice\n\t#One two three.\n\t\tFour five.\n\t*if (true) # Six.\n\t\tSeven eight\n");
			let received: Array<Diagnostic> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
				received.push(e);
			});

			const wordCount = parse(fakeDocument, fakeCallbacks);

			expect(wordCount).to.equal(8);
		});

		it("should count words in options that have a leading *disable_reuse", () => {
			let fakeDocument = createDocument("*choice\n\t*disable_reuse #One two three.\n\t\tFour five.\n\t# Six.\n\t\tSeven eight\n");
			let received: Array<Diagnostic> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
				received.push(e);
			});

			const wordCount = parse(fakeDocument, fakeCallbacks);

			expect(wordCount).to.equal(8);
		});

		it("should count words in options that have both a *hide_reuse and a *selectable_if", () => {
			let fakeDocument = createDocument("*choice\n\t*disable_reuse *selectable_if (condition) #One two three.\n\t\tFour five.\n\t# Six.\n\t\tSeven eight\n");
			let received: Array<Diagnostic> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
				received.push(e);
			});

			const wordCount = parse(fakeDocument, fakeCallbacks);

			expect(wordCount).to.equal(8);
		});

		it("should miss options that have a *hide_reuse and a *selectable_if in the wrong order", () => {
			let fakeDocument = createDocument("*choice\n\t*selectable_if (condition) *disable_reuse #Won't see me.\n\t\tOne two.\n\t# Three.\n\t\tFour five\n");
			let received: Array<Diagnostic> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
				received.push(e);
			});

			const wordCount = parse(fakeDocument, fakeCallbacks);

			expect(wordCount).to.equal(5);
		});

		it("should count variables as one word", () => {
			let fakeDocument = createDocument("Contained herein: a ${variable}.");
			let received: Array<Diagnostic> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
				received.push(e);
			});

			const wordCount = parse(fakeDocument, fakeCallbacks);

			expect(wordCount).to.equal(4);
		});

		it("should count variables embedded in other text as one word", () => {
			let fakeDocument = createDocument("A one-${variable} word.");
			let received: Array<Diagnostic> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
				received.push(e);
			});

			const wordCount = parse(fakeDocument, fakeCallbacks);

			expect(wordCount).to.equal(3);
		});

		it("should count only the contents of a multireplace", () => {
			let fakeDocument = createDocument("Multireplace: @{(2 > 3) first bit|longer second bit|super longer third bit}");
			let received: Array<Diagnostic> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
				received.push(e);
			});

			const wordCount = parse(fakeDocument, fakeCallbacks);

			expect(wordCount).to.equal(10);
		});

		it("should count multireplaces embedded in other text properly", () => {
			let fakeDocument = createDocument("re@{(2 > 3) diculous|markable|-do the count}");
			let received: Array<Diagnostic> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
				received.push(e);
			});

			const wordCount = parse(fakeDocument, fakeCallbacks);

			expect(wordCount).to.equal(5);
		});

		it("should not count bold or italic markup symbols", () => {
			let fakeDocument = createDocument("So [b] this is bold [/b] while [i] this is italics [/i] okay?");
			let received: Array<Diagnostic> = [];
			let fakeCallbacks = Substitute.for<ParserCallbacks>();
			fakeCallbacks.onParseError(Arg.all()).mimicks((e: Diagnostic) => {
				received.push(e);
			});

			const wordCount = parse(fakeDocument, fakeCallbacks);

			expect(wordCount).to.equal(9);
		});
	});
});
