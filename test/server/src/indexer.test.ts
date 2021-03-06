/* eslint-disable */

import { expect } from 'chai';
import 'mocha';
import { Substitute, SubstituteOf, Arg } from '@fluffy-spoon/substitute';
import { Position, Diagnostic } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import {
	ProjectIndex,
	IdentifierIndex,
	IdentifierMultiIndex,
	LabelIndex,
	FlowControlEvent,
	DocumentScopes
} from '../../../server/src/index';
import { updateProjectIndex } from '../../../server/src/indexer';

const fakeDocumentUri = "file:///startup.txt";

function createDocument(text: string,
	uri: string = fakeDocumentUri): SubstituteOf<TextDocument> {
	let fakeDocument = Substitute.for<TextDocument>();
	fakeDocument.getText(Arg.any()).returns(text);
	fakeDocument.uri.returns(uri);
	fakeDocument.positionAt(Arg.any()).mimicks((index: number) => { return (Position.create(index, 0)); });
	return fakeDocument;
}

describe("Indexer", () => {
	describe("Symbol Creation Indexing", () => {
		it("should index locations of created global variables", () => {
			let fakeDocument = createDocument("*create variable 3");
			let received: Array<IdentifierIndex> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setGlobalVariables(Arg.all()).mimicks((uri: string, index: IdentifierIndex) => { received.push(index); });

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect([...received[0].keys()]).to.eql(['variable']);
			expect(received[0].get('variable').range.start.line).to.equal(8);
			expect(received[0].get('variable').range.end.line).to.equal(16);
		});

		it("should index locations of created local variables", () => {
			let fakeDocument = createDocument("*temp variable 3");
			let received: Array<IdentifierMultiIndex> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setLocalVariables(Arg.all()).mimicks((uri: string, index: IdentifierMultiIndex) => { received.push(index); });

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect([...received[0].keys()]).to.eql(['variable']);
			expect(received[0].get('variable').length).to.eql(1);
			expect(received[0].get('variable')[0].range.start.line).to.equal(6);
			expect(received[0].get('variable')[0].range.end.line).to.equal(14);
		});

		it("should index all created locations local variables", () => {
			let fakeDocument = createDocument("*temp variable 3\n*temp variable 1");
			let received: Array<IdentifierMultiIndex> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setLocalVariables(Arg.all()).mimicks((uri: string, index: IdentifierMultiIndex) => { received.push(index); });

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect([...received[0].keys()]).to.eql(['variable']);
			expect(received[0].get('variable').length).to.eql(2);
			expect(received[0].get('variable')[0].range.start.line).to.equal(6);
			expect(received[0].get('variable')[0].range.end.line).to.equal(14);
			expect(received[0].get('variable')[1].range.start.line).to.equal(23);
			expect(received[0].get('variable')[1].range.end.line).to.equal(31);
		});

		it("should index effective locations of local variables created in a subroutine", () => {
			let fakeDocument = createDocument("*gosub subroutine\n*finish\n*label subroutine\n*temp variable 3\n*return\n");
			let received: Array<IdentifierIndex> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setSubroutineLocalVariables(Arg.all()).mimicks((uri: string, index: IdentifierIndex) => { received.push(index); });

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect([...received[0].keys()]).to.eql(['variable']);
			expect(received[0].get('variable').range.start.line).to.equal(1);
			expect(received[0].get('variable').range.end.line).to.equal(6);
		});

	});

	describe("Symbol Command Indexing", () => {
		it("should index bare variables in the command", () => {
			let fakeDocument = createDocument("*set variable 3");
			let receivedReferences: Array<IdentifierMultiIndex> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setVariableReferences(Arg.all()).mimicks((uri: string, index: IdentifierMultiIndex) => { receivedReferences.push(index); });

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect([...receivedReferences[0].keys()]).to.eql(['variable']);
			expect(receivedReferences[0].get('variable')[0].range.start.line).to.equal(5);
		});
	});

	describe("Multireplace Indexing", () => {
		it("should index variables in the test", () => {
			let fakeDocument = createDocument("@{variable this | that}");
			let receivedReferences: Array<IdentifierMultiIndex> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setVariableReferences(Arg.all()).mimicks((uri: string, index: IdentifierMultiIndex) => { receivedReferences.push(index); });

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect([...receivedReferences[0].keys()]).to.eql(['variable']);
			expect(receivedReferences[0].get('variable')[0].range.start.line).to.equal(2);
		});
	});

	describe("Variable Reference Command Indexing", () => {
		it("should index local variables directly after a reference command", () => {
			let fakeDocument = createDocument("*if variable > 1");
			let receivedReferences: Array<IdentifierMultiIndex> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setVariableReferences(Arg.all()).mimicks((uri: string, index: IdentifierMultiIndex) => { receivedReferences.push(index); });

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect([...receivedReferences[0].keys()]).to.eql(['variable']);
			expect(receivedReferences[0].get('variable')[0].range.start.line).to.equal(4);
		});
	});

	describe("Flow Control Event Indexing", () => {
		it("should capture the flow control command", () => {
			let fakeDocument = createDocument("*gosub label");
			let receivedReferences: Array<FlowControlEvent[]> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setFlowControlEvents(Arg.all()).mimicks((uri: string, events: FlowControlEvent[]) => { receivedReferences.push(events); });

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect(receivedReferences.length).to.equal(1);
			expect(receivedReferences[0].length).to.equal(1);
			expect(receivedReferences[0][0].command).to.equal("gosub");
		});

		it("should capture the label", () => {
			let fakeDocument = createDocument("*gosub label");
			let receivedReferences: Array<FlowControlEvent[]> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setFlowControlEvents(Arg.all()).mimicks((uri: string, events: FlowControlEvent[]) => { receivedReferences.push(events); });

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect(receivedReferences[0][0].label).to.equal("label");
		});

		it("should capture the label location", () => {
			let fakeDocument = createDocument("*gosub label");
			let receivedReferences: Array<FlowControlEvent[]> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setFlowControlEvents(Arg.all()).mimicks((uri: string, events: FlowControlEvent[]) => { receivedReferences.push(events); });

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect(receivedReferences[0][0].labelLocation.range.start.line).to.equal(7);
			expect(receivedReferences[0][0].labelLocation.range.end.line).to.equal(12);
		});

		it("should skip the scene when not present", () => {
			let fakeDocument = createDocument("*gosub label");
			let receivedReferences: Array<FlowControlEvent[]> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setFlowControlEvents(Arg.all()).mimicks((uri: string, events: FlowControlEvent[]) => { receivedReferences.push(events); });

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect(receivedReferences[0][0].scene).equals("");
			expect(receivedReferences[0][0].sceneLocation).is.undefined;
		});

		it("should capture the scene", () => {
			let fakeDocument = createDocument("*gosub_scene scene-name");
			let receivedReferences: Array<FlowControlEvent[]> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setFlowControlEvents(Arg.all()).mimicks((uri: string, events: FlowControlEvent[]) => { receivedReferences.push(events); });

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect(receivedReferences[0][0].scene).to.eql("scene-name");
		});

		it("should capture the scene location", () => {
			let fakeDocument = createDocument("*gosub_scene scene-name");
			let receivedReferences: Array<FlowControlEvent[]> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setFlowControlEvents(Arg.all()).mimicks((uri: string, events: FlowControlEvent[]) => { receivedReferences.push(events); });

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect(receivedReferences[0][0].sceneLocation.range.start.line).to.eql(13);
			expect(receivedReferences[0][0].sceneLocation.range.end.line).to.eql(23);
		});

		it("should skip the label when not present", () => {
			let fakeDocument = createDocument("*gosub_scene scene-name");
			let receivedReferences: Array<FlowControlEvent[]> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setFlowControlEvents(Arg.all()).mimicks((uri: string, events: FlowControlEvent[]) => { receivedReferences.push(events); });

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect(receivedReferences[0][0].label).equals("");
			expect(receivedReferences[0][0].labelLocation).is.undefined;
		});

		it("should capture both scene and label if present", () => {
			let fakeDocument = createDocument("*gosub_scene scene-name other_label");
			let receivedReferences: Array<FlowControlEvent[]> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setFlowControlEvents(Arg.all()).mimicks((uri: string, events: FlowControlEvent[]) => { receivedReferences.push(events); });

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect(receivedReferences[0][0].scene).to.eql("scene-name");
			expect(receivedReferences[0][0].label).to.eql("other_label");
		});

		it("should capture both scene and label locations if present", () => {
			let fakeDocument = createDocument("*gosub_scene scene-name other_label");
			let receivedReferences: Array<FlowControlEvent[]> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setFlowControlEvents(Arg.all()).mimicks((uri: string, events: FlowControlEvent[]) => { receivedReferences.push(events); });

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect(receivedReferences[0][0].sceneLocation.range.start.line).to.eql(13);
			expect(receivedReferences[0][0].sceneLocation.range.end.line).to.eql(23);
			expect(receivedReferences[0][0].labelLocation.range.start.line).to.eql(24);
			expect(receivedReferences[0][0].labelLocation.range.end.line).to.eql(35);
		});
	});

	describe("Scene Indexing", () => {
		it("should index scenes in startup files", () => {
			let fakeDocument = createDocument("*scene_list\n\tscene-1\n\tscene-2\n");
			let receivedScenes: Array<Array<string>> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setSceneList(Arg.any()).mimicks((scenes: string[]) => { receivedScenes.push(scenes); });

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect(receivedScenes).to.eql([['scene-1', 'scene-2']]);
		});
	});

	describe("Stats Indexing", () => {
		it("should set has-choicescript-stats for stats files", () => {
			let fakeDocument = createDocument("");
			let receivedCalls: Array<boolean> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setHasChoicescriptStats(Arg.any()).mimicks((canHas: boolean) => { receivedCalls.push(canHas); })

			updateProjectIndex(fakeDocument, false, true, fakeIndex);

			expect(receivedCalls).to.eql([true]);
		});

		it("should not set has-choicescript-stats for non-stats files", () => {
			let fakeDocument = createDocument("");
			let receivedCalls: Array<boolean> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setHasChoicescriptStats(Arg.any()).mimicks((canHas: boolean) => { receivedCalls.push(canHas); })

			updateProjectIndex(fakeDocument, false, false, fakeIndex);

			expect(receivedCalls).to.eql([]);
		});
	});

	describe("Achievement Indexing", () => {
		it("should index an achievement", () => {
			let fakeDocument = createDocument("*achievement code_name");
			let receivedAchievements: IdentifierIndex[] = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setAchievements(Arg.any()).mimicks((index: IdentifierIndex) => { receivedAchievements.push(index); });

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect(receivedAchievements[0].size).to.equal(1);
			expect(receivedAchievements[0]).has.keys(['code_name']);
		});

		it("should index a reference to an achievement", () => {
			let fakeDocument = createDocument("*achieve code_name");
			let receivedAchievementReferences: IdentifierMultiIndex[] = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setAchievementReferences(Arg.any(), Arg.any()).mimicks(
				(uri, index) => {
					receivedAchievementReferences.push(index);
				}
			);

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect(receivedAchievementReferences[0].size).to.equal(1);
			expect(receivedAchievementReferences[0]).has.keys(['code_name']);
		});
	});

	describe("Label Indexing", () => {
		it("should index a label", () => {
			let fakeDocument = createDocument("*label label_name");
			let receivedLabels: LabelIndex[] = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setLabels(Arg.any(), Arg.any()).mimicks((uri: string, index: LabelIndex) => { receivedLabels.push(index); });

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect(receivedLabels[0].size).to.equal(1);
			expect(receivedLabels[0]).has.keys(['label_name']);
		});

		it("should leave a label's scope blank on no return", () => {
			let fakeDocument = createDocument("*label label_name");
			let receivedLabels: LabelIndex[] = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setLabels(Arg.any(), Arg.any()).mimicks((uri: string, index: LabelIndex) => { receivedLabels.push(index); });

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect(receivedLabels[0].size).to.equal(1);
			expect(receivedLabels[0].get('label_name').scope).to.be.undefined;
		});

		it("should add a scope to a label on a *return", () => {
			let fakeDocument = createDocument("*label label_name\nLine 1\n*return\nLine 3");
			let receivedLabels: LabelIndex[] = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setLabels(Arg.any(), Arg.any()).mimicks((uri: string, index: LabelIndex) => { receivedLabels.push(index); });

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect(receivedLabels[0].size).to.equal(1);
			expect(receivedLabels[0].get('label_name').scope.start.line).to.equal(7);
			expect(receivedLabels[0].get('label_name').scope.end.line).to.equal(32);
		});

		it("should add a scope to the most recent label on a *return", () => {
			let fakeDocument = createDocument("*label label_one\nLine 1\n*label label_two\nLine 3\n*return\nLine 5");
			let receivedLabels: LabelIndex[] = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setLabels(Arg.any(), Arg.any()).mimicks((uri: string, index: LabelIndex) => { receivedLabels.push(index); });

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect(receivedLabels[0].size).to.equal(2);
			expect(receivedLabels[0].get('label_one').scope).to.be.undefined;
			expect(receivedLabels[0].get('label_two').scope.start.line).to.equal(31);
			expect(receivedLabels[0].get('label_two').scope.end.line).to.equal(55);
		});
	});

	describe("Variable Scoping", () => {
		it("should capture *check_achievements scopes", () => {
			let fakeDocument = createDocument("Line 0\n*check_achievements\nLine 2");
			let received: Array<DocumentScopes> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setDocumentScopes(Arg.all()).mimicks(
				(uri: string, scope: DocumentScopes) => { received.push(scope); }
			);

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect(received.length).to.equal(1);
			expect(received[0].achievementVarScopes.length).to.equal(1);
		});

		it("should have *check_achievements scope run from definition to document end", () => {
			let fakeDocument = createDocument("Line 0\n*check_achievements\nLine 2\nLast line");
			let received: Array<DocumentScopes> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setDocumentScopes(Arg.all()).mimicks(
				(uri: string, scope: DocumentScopes) => { received.push(scope); }
			);

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			// These positions are due to the fake document converting an index directly into a line number
			expect(received[0].achievementVarScopes[0].start).to.eql({ line: 8, character: 0 });
			expect(received[0].achievementVarScopes[0].end).to.eql({ line: 43, character: 0 });
		});

		it("should capture *params scopes", () => {
			let fakeDocument = createDocument("Line 0\n*params\nLine 2");
			let received: Array<DocumentScopes> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setDocumentScopes(Arg.all()).mimicks(
				(uri: string, scope: DocumentScopes) => { received.push(scope); }
			);

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect(received.length).to.equal(1);
			expect(received[0].paramScopes.length).to.equal(1);
		});

		it("should have *params scope run from definition to document end", () => {
			let fakeDocument = createDocument("Line 0\n*params\nLine 2\nLast line");
			let received: Array<DocumentScopes> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setDocumentScopes(Arg.all()).mimicks(
				(uri: string, scope: DocumentScopes) => { received.push(scope); }
			);

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			// These positions are due to the fake document converting an index directly into a line number
			expect(received[0].paramScopes[0].start).to.eql({ line: 8, character: 0 });
			expect(received[0].paramScopes[0].end).to.eql({ line: 31, character: 0 });
		});
	});

	describe("Label Scoping", () => {
		it("should capture the scope of a *label followed by a *return", () => {
			let fakeDocument = createDocument("Line 0\n*label\nLine 2\n*return\nLine 4");
			let received: Array<DocumentScopes> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setDocumentScopes(Arg.all()).mimicks(
				(uri: string, scope: DocumentScopes) => { received.push(scope); }
			);

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect(received.length).to.equal(1);
			// expect(received[0].labelScopes.length).to.equal(1);
		});

		it("should have *label scope run from *label to *return", () => {
			let fakeDocument = createDocument("Line 0\n*label\nLine 2\n*return\nLine 4");
			let received: Array<DocumentScopes> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setDocumentScopes(Arg.all()).mimicks(
				(uri: string, scope: DocumentScopes) => { received.push(scope); }
			);

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			// These positions are due to the fake document converting an index directly into a line number
			// expect(received[0].labelScopes[0].range.start).to.eql({line: 8, character: 0});
			// expect(received[0].labelScopes[0].range.end).to.eql({line: 43, character: 0});
		});
	});

	describe("Choice Scoping", () => {
		it("should capture a *choice block", () => {
			let fakeDocument = createDocument("Line 0\n*choice\n    #One\n        Text\n    #Two\nEnd");
			let received: Array<DocumentScopes> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setDocumentScopes(Arg.all()).mimicks(
				(uri: string, scope: DocumentScopes) => { received.push(scope); }
			);

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect(received.length).to.equal(1);
		});
	});

	describe("Parse Errors", () => {
		it("should flag attempts to re-create already-created global variables", () => {
			let fakeDocument = createDocument("*create variable 3\n*create variable 9");
			let received: Array<Diagnostic[]> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setParseErrors(Arg.all()).mimicks(
				(uri: string, errors: Diagnostic[]) => { received.push(errors); }
			);

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect(received.length).to.equal(1);
			expect(received[0].length).to.equal(1);
			expect(received[0][0].message).to.include('Variable "variable" was already created');
			expect(received[0][0].range.start.line).to.equal(27);
			expect(received[0][0].range.end.line).to.equal(35);
		});

		it("should flag attempts to re-create already-created labels", () => {
			let fakeDocument = createDocument("*label previous_label\n*label previous_label");
			let received: Array<Diagnostic[]> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setParseErrors(Arg.all()).mimicks(
				(uri: string, errors: Diagnostic[]) => { received.push(errors); }
			);

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect(received.length).to.equal(1);
			expect(received[0].length).to.equal(1);
			expect(received[0][0].message).to.include('Label "previous_label" was already created');
			expect(received[0][0].range.start.line).to.equal(29);
			expect(received[0][0].range.end.line).to.equal(43);
		});

		it("should flag a *return with no label", () => {
			let fakeDocument = createDocument("*return");
			let received: Array<Diagnostic[]> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setParseErrors(Arg.all()).mimicks(
				(uri: string, errors: Diagnostic[]) => { received.push(errors); }
			);

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect(received.length).to.equal(1);
			expect(received[0].length).to.equal(1);
			expect(received[0][0].message).to.include('*return has no associated label');
			expect(received[0][0].range.start.line).to.equal(1);
			expect(received[0][0].range.end.line).to.equal(7);
		});
	});

	describe("Word Counts", () => {
		it("should count words in a document", () => {
			let fakeDocument = createDocument("*create variable 3\nIt's three words\n*comment don't count me");
			let received: Array<number> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.setWordCount(Arg.all()).mimicks(
				(uri: string, count: number) => { received.push(count); }
			);

			updateProjectIndex(fakeDocument, true, false, fakeIndex);

			expect(received.length).to.equal(1);
			expect(received[0]).to.equal(3);
		});
	});
});
