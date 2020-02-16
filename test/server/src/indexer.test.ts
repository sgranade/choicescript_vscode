import { expect } from 'chai';
import 'mocha';
import { Substitute, SubstituteOf, Arg } from '@fluffy-spoon/substitute';
import { TextDocument, Position, Diagnostic } from 'vscode-languageserver';

import { 
	ProjectIndex, 
	IdentifierIndex, 
	VariableReferenceIndex, 
	LabelIndex, 
	FlowControlEvent, 
	DocumentScopes 
} from '../../../server/src/index';
import { updateProjectIndex } from '../../../server/src/indexer';

const fakeDocumentUri: string = "file:///startup.txt";

function createDocument(text: string, 
	uri: string = fakeDocumentUri): SubstituteOf<TextDocument> {
	let fakeDocument = Substitute.for<TextDocument>();
	fakeDocument.getText(Arg.any()).returns(text);
	fakeDocument.uri.returns(uri);
	fakeDocument.positionAt(Arg.any()).mimicks((index: number) => { return(Position.create(index, 0)); });
	return fakeDocument;
}

describe("Indexer", () => {
	describe("Symbol Creation Indexing", () => {
		it("should index locations of created global variables", () => {
			let fakeDocument = createDocument("*create variable 3");
			let received: Array<IdentifierIndex> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateGlobalVariables(Arg.all()).mimicks((uri: string, index: IdentifierIndex) => { received.push(index); });
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect([...received[0].keys()]).to.eql(['variable']);
			expect(received[0].get('variable').range.start.line).to.equal(8);
			expect(received[0].get('variable').range.end.line).to.equal(16);
		});

		it("should index locations of created local variables", () => {
			let fakeDocument = createDocument("*temp variable 3");
			let received: Array<IdentifierIndex> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateLocalVariables(Arg.all()).mimicks((uri: string, index: IdentifierIndex) => { received.push(index); });
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect([...received[0].keys()]).to.eql(['variable']);
			expect(received[0].get('variable').range.start.line).to.equal(6);
			expect(received[0].get('variable').range.end.line).to.equal(14);
		});

		it("should only index first locations of created local variables", () => {
			let fakeDocument = createDocument("*temp variable 3\n*temp variable 1");
			let received: Array<IdentifierIndex> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateLocalVariables(Arg.all()).mimicks((uri: string, index: IdentifierIndex) => { received.push(index); });
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect([...received[0].keys()]).to.eql(['variable']);
			expect(received[0].get('variable').range.start.line).to.equal(6);
			expect(received[0].get('variable').range.end.line).to.equal(14);
		});

		it("should index effective locations of local variables created in a subroutine", () => {
			let fakeDocument = createDocument("*gosub subroutine\n*finish\n*label subroutine\n*temp variable 3\n*return\n");
			let received: Array<IdentifierIndex> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateSubroutineLocalVariables(Arg.all()).mimicks((uri: string, index: IdentifierIndex) => { received.push(index); });
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect([...received[0].keys()]).to.eql(['variable']);
			expect(received[0].get('variable').range.start.line).to.equal(1);
			expect(received[0].get('variable').range.end.line).to.equal(6);
		});

	});
	
	describe("Symbol Command Indexing", () => {
		it("should index bare variables in the command", () => {
			let fakeDocument = createDocument("*set variable 3");
			let receivedReferences: Array<VariableReferenceIndex> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateVariableReferences(Arg.all()).mimicks((uri: string, index: VariableReferenceIndex) => { receivedReferences.push(index); });
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect([...receivedReferences[0].keys()]).to.eql(['variable']);
			expect(receivedReferences[0].get('variable')[0].range.start.line).to.equal(5);
		});
	});
	
	describe("Multireplace Indexing", () => {
		it("should index variables in the test", () => {
			let fakeDocument = createDocument("@{variable this | that}");
			let receivedReferences: Array<VariableReferenceIndex> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateVariableReferences(Arg.all()).mimicks((uri: string, index: VariableReferenceIndex) => { receivedReferences.push(index); });
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect([...receivedReferences[0].keys()]).to.eql(['variable']);
			expect(receivedReferences[0].get('variable')[0].range.start.line).to.equal(2);
		});
	});
	
	describe("Variable Reference Command Indexing", () => {
		it("should index local variables directly after a reference command", () => {
			let fakeDocument = createDocument("*if variable > 1");
			let receivedReferences: Array<VariableReferenceIndex> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateVariableReferences(Arg.all()).mimicks((uri: string, index: VariableReferenceIndex) => { receivedReferences.push(index); });
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect([...receivedReferences[0].keys()]).to.eql(['variable']);
			expect(receivedReferences[0].get('variable')[0].range.start.line).to.equal(4);
		});
	});
	
	describe("Flow Control Event Indexing", () => {
		it("should capture the flow control command", () => {
			let fakeDocument = createDocument("*gosub label");
			let receivedReferences: Array<FlowControlEvent[]> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateFlowControlEvents(Arg.all()).mimicks((uri: string, events: FlowControlEvent[]) => { receivedReferences.push(events); });
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect(receivedReferences.length).to.equal(1);
			expect(receivedReferences[0].length).to.equal(1);
			expect(receivedReferences[0][0].command).to.equal("gosub");
		});

		it("should capture the label", () => {
			let fakeDocument = createDocument("*gosub label");
			let receivedReferences: Array<FlowControlEvent[]> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateFlowControlEvents(Arg.all()).mimicks((uri: string, events: FlowControlEvent[]) => { receivedReferences.push(events); });
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect(receivedReferences[0][0].label).to.equal("label");
		});

		it("should capture the label location", () => {
			let fakeDocument = createDocument("*gosub label");
			let receivedReferences: Array<FlowControlEvent[]> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateFlowControlEvents(Arg.all()).mimicks((uri: string, events: FlowControlEvent[]) => { receivedReferences.push(events); });
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect(receivedReferences[0][0].labelLocation.range.start.line).to.equal(7);
			expect(receivedReferences[0][0].labelLocation.range.end.line).to.equal(12);
		});

		it("should skip the scene when not present", () => {
			let fakeDocument = createDocument("*gosub label");
			let receivedReferences: Array<FlowControlEvent[]> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateFlowControlEvents(Arg.all()).mimicks((uri: string, events: FlowControlEvent[]) => { receivedReferences.push(events); });
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect(receivedReferences[0][0].scene).equals("");
			expect(receivedReferences[0][0].sceneLocation).is.undefined;
		});

		it("should capture the scene", () => {
			let fakeDocument = createDocument("*gosub_scene scene-name");
			let receivedReferences: Array<FlowControlEvent[]> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateFlowControlEvents(Arg.all()).mimicks((uri: string, events: FlowControlEvent[]) => { receivedReferences.push(events); });
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect(receivedReferences[0][0].scene).to.eql("scene-name");
		});

		it("should capture the scene location", () => {
			let fakeDocument = createDocument("*gosub_scene scene-name");
			let receivedReferences: Array<FlowControlEvent[]> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateFlowControlEvents(Arg.all()).mimicks((uri: string, events: FlowControlEvent[]) => { receivedReferences.push(events); });
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect(receivedReferences[0][0].sceneLocation.range.start.line).to.eql(13);
			expect(receivedReferences[0][0].sceneLocation.range.end.line).to.eql(23);
		});

		it("should skip the label when not present", () => {
			let fakeDocument = createDocument("*gosub_scene scene-name");
			let receivedReferences: Array<FlowControlEvent[]> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateFlowControlEvents(Arg.all()).mimicks((uri: string, events: FlowControlEvent[]) => { receivedReferences.push(events); });
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect(receivedReferences[0][0].label).equals("");
			expect(receivedReferences[0][0].labelLocation).is.undefined;
		});

		it("should capture both scene and label if present", () => {
			let fakeDocument = createDocument("*gosub_scene scene-name other_label");
			let receivedReferences: Array<FlowControlEvent[]> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateFlowControlEvents(Arg.all()).mimicks((uri: string, events: FlowControlEvent[]) => { receivedReferences.push(events); });
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect(receivedReferences[0][0].scene).to.eql("scene-name");
			expect(receivedReferences[0][0].label).to.eql("other_label");
		});

		it("should capture both scene and label locations if present", () => {
			let fakeDocument = createDocument("*gosub_scene scene-name other_label");
			let receivedReferences: Array<FlowControlEvent[]> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateFlowControlEvents(Arg.all()).mimicks((uri: string, events: FlowControlEvent[]) => { receivedReferences.push(events); });
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
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
			fakeIndex.updateSceneList(Arg.any()).mimicks((scenes: string[]) => { receivedScenes.push(scenes); });
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect(receivedScenes).to.eql([['scene-1', 'scene-2']]);
		});
	});
	
	describe("Achievement Indexing", () => {
		it("should index an achievement", () => {
			let fakeDocument = createDocument("*achievement code_name");
			let receivedAchievements: IdentifierIndex[] = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateAchievements(Arg.any()).mimicks((index: IdentifierIndex) => { receivedAchievements.push(index); });
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect(receivedAchievements.length).to.equal(1);
			expect(receivedAchievements[0]).has.keys(['code_name']);
		});

		it("should index a reference to an achievement", () => {
			let fakeDocument = createDocument("*achieve code_name");
			let receivedAchievementReferences: VariableReferenceIndex[] = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateAchievementReferences(Arg.any()).mimicks(
				(uri, index) => { receivedAchievementReferences.push(index); }
			);
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect(receivedAchievementReferences.length).to.equal(1);
			expect(receivedAchievementReferences[0]).has.keys(['code_name']);
		});
	});
	
	describe("Label Indexing", () => {
		it("should index a label", () => {
			let fakeDocument = createDocument("*label label_name");
			let receivedLabels: LabelIndex[] = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateLabels(Arg.any()).mimicks((uri: string, index: LabelIndex) => { receivedLabels.push(index); });
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect(receivedLabels.length).to.equal(1);
			expect(receivedLabels[0]).has.keys(['label_name']);
		});
	});

	describe("Variable Scoping", () => {
		it("should capture *check_achievements scopes", () => {
			let fakeDocument = createDocument("Line 0\n*check_achievements\nLine 2");
			let received: Array<DocumentScopes> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateDocumentScopes(Arg.all()).mimicks(
				(uri: string, scope: DocumentScopes) => { received.push(scope); }
			);
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect(received.length).to.equal(1);
			expect(received[0].achievementVarScopes.length).to.equal(1);
		});

		it("should have *check_achievements scope run from definition to document end", () => {
			let fakeDocument = createDocument("Line 0\n*check_achievements\nLine 2\nLast line");
			let received: Array<DocumentScopes> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateDocumentScopes(Arg.all()).mimicks(
				(uri: string, scope: DocumentScopes) => { received.push(scope); }
			);
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			// These positions are due to the fake document converting an index directly into a line number
			expect(received[0].achievementVarScopes[0].start).to.eql({line: 8, character: 0});
			expect(received[0].achievementVarScopes[0].end).to.eql({line: 43, character: 0});
		});

		it("should capture *params scopes", () => {
			let fakeDocument = createDocument("Line 0\n*params\nLine 2");
			let received: Array<DocumentScopes> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateDocumentScopes(Arg.all()).mimicks(
				(uri: string, scope: DocumentScopes) => { received.push(scope); }
			);
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect(received.length).to.equal(1);
			expect(received[0].paramScopes.length).to.equal(1);
		});

		it("should have *params scope run from definition to document end", () => {
			let fakeDocument = createDocument("Line 0\n*params\nLine 2\nLast line");
			let received: Array<DocumentScopes> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateDocumentScopes(Arg.all()).mimicks(
				(uri: string, scope: DocumentScopes) => { received.push(scope); }
			);
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			// These positions are due to the fake document converting an index directly into a line number
			expect(received[0].paramScopes[0].start).to.eql({line: 8, character: 0});
			expect(received[0].paramScopes[0].end).to.eql({line: 31, character: 0});
		});
	});

	// TODO
	describe("Label Scoping", () => {
		it("should capture the scope of a *label followed by a *return", () => {
			let fakeDocument = createDocument("Line 0\n*label\nLine 2\n*return\nLine 4");
			let received: Array<DocumentScopes> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateDocumentScopes(Arg.all()).mimicks(
				(uri: string, scope: DocumentScopes) => { received.push(scope); }
			);
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect(received.length).to.equal(1);
			// expect(received[0].labelScopes.length).to.equal(1);
		});

		it("should have *label scope run from *label to *return", () => {
			let fakeDocument = createDocument("Line 0\n*label\nLine 2\n*return\nLine 4");
			let received: Array<DocumentScopes> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateDocumentScopes(Arg.all()).mimicks(
				(uri: string, scope: DocumentScopes) => { received.push(scope); }
			);
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
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
			fakeIndex.updateDocumentScopes(Arg.all()).mimicks(
				(uri: string, scope: DocumentScopes) => { received.push(scope); }
			);
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect(received.length).to.equal(1);
		});
	});

	describe("Parse Errors", () => {
		it("should flag attempts to re-create already-created global variables", () => {
			let fakeDocument = createDocument("*create variable 3\n*create variable 9");
			let received: Array<Diagnostic[]> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateParseErrors(Arg.all()).mimicks(
				(uri: string, errors: Diagnostic[]) => { received.push(errors); }
			);
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
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
			fakeIndex.updateParseErrors(Arg.all()).mimicks(
				(uri: string, errors: Diagnostic[]) => { received.push(errors); }
			);
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect(received.length).to.equal(1);
			expect(received[0].length).to.equal(1);
			expect(received[0][0].message).to.include('Label "previous_label" was already created');
			expect(received[0][0].range.start.line).to.equal(29);
			expect(received[0][0].range.end.line).to.equal(43);
		});
	});
});
