import { expect } from 'chai';
import 'mocha';
import { Substitute, SubstituteOf, Arg } from '@fluffy-spoon/substitute';
import { TextDocument, Position, Range, Diagnostic } from 'vscode-languageserver';

import { ProjectIndex, IdentifierIndex, updateProjectIndex, VariableReferenceIndex, LabelIndex, LabelReferenceIndex, DocumentScopes } from '../../../server/src/indexer';

const fakeDocumentUri: string = "file:///faker.txt";

function createDocument(text: string, 
	uri: string = fakeDocumentUri): SubstituteOf<TextDocument> {
	let fakeDocument = Substitute.for<TextDocument>();
	fakeDocument.getText(Arg.any()).returns(text);
	fakeDocument.uri.returns(uri);
	fakeDocument.positionAt(Arg.any()).mimicks((index: number) => { return(Position.create(index, 0)); });
	return fakeDocument;
}

describe("Indexer", () => {
	describe("Symbol Command Indexing", () => {
		it("should index bare variables in the command", () => {
			let fakeDocument = createDocument("*set variable 3");
			let receivedReferences: Array<VariableReferenceIndex> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateVariableReferences(Arg.all()).mimicks((uri: string, index: VariableReferenceIndex) => { receivedReferences.push(index) });
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect([...receivedReferences[0].keys()]).to.eql(['variable']);
			expect(receivedReferences[0].get('variable')[0].range.start.line).to.equal(5);
		});
	})
	
	describe("Multireplace Indexing", () => {
		it("should index variables in the test", () => {
			let fakeDocument = createDocument("@{variable this | that}");
			let receivedReferences: Array<VariableReferenceIndex> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateVariableReferences(Arg.all()).mimicks((uri: string, index: VariableReferenceIndex) => { receivedReferences.push(index) });
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect([...receivedReferences[0].keys()]).to.eql(['variable']);
			expect(receivedReferences[0].get('variable')[0].range.start.line).to.equal(2);
		});
	})
	
	describe("Variable Reference Command Indexing", () => {
		it("should index local variables directly after a reference command", () => {
			let fakeDocument = createDocument("*if variable > 1");
			let receivedReferences: Array<VariableReferenceIndex> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateVariableReferences(Arg.all()).mimicks((uri: string, index: VariableReferenceIndex) => { receivedReferences.push(index) });
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect([...receivedReferences[0].keys()]).to.eql(['variable']);
			expect(receivedReferences[0].get('variable')[0].range.start.line).to.equal(4);
		});
	})
	
	describe("Label Reference Command Indexing", () => {
		it("should index labels directly after a reference command", () => {
			let fakeDocument = createDocument("*gosub label");
			let receivedReferences: Array<LabelReferenceIndex> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateLabelReferences(Arg.all()).mimicks((uri: string, index: LabelReferenceIndex) => { receivedReferences.push(index) });
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect([...receivedReferences[0].keys()]).to.eql(['label']);
			expect(receivedReferences[0].get('label')[0].range.start.line).to.equal(7);
		});
	})
		
	describe("Scene Indexing", () => {
		it("should index scenes in startup files", () => {
			let fakeDocument = createDocument("*scene_list\n\tscene-1\n\tscene-2\n");
			let receivedScenes: Array<Array<string>> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateSceneList(Arg.any()).mimicks((scenes: string[]) => { receivedScenes.push(scenes) });
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect(receivedScenes).to.eql([['scene-1', 'scene-2']]);
		});
	})
	
	describe("Achievement Indexing", () => {
		it("should index an achievement", () => {
			let fakeDocument = createDocument("*achievement code_name");
			let receivedAchievements: IdentifierIndex[] = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateAchievements(Arg.any()).mimicks((index: IdentifierIndex) => { receivedAchievements.push(index) });
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect(receivedAchievements.length).to.equal(1);
			expect(receivedAchievements[0]).has.keys(['code_name']);
		});
	})
	
	describe("Label Indexing", () => {
		it("should index a label", () => {
			let fakeDocument = createDocument("*label label_name");
			let receivedLabels: LabelIndex[] = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateLabels(Arg.any()).mimicks((uri: string, index: LabelIndex) => { receivedLabels.push(index) });
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect(receivedLabels.length).to.equal(1);
			expect(receivedLabels[0]).has.keys(['label_name']);
		});
	})

	describe("Variable Scoping", () => {
		it("should capture *check_achievements scopes", () => {
			let fakeDocument = createDocument("Line 0\n*check_achievements\nLine 2");
			let received: Array<DocumentScopes> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateVariableScopes(Arg.all()).mimicks(
				(uri: string, scope: DocumentScopes) => { received.push(scope) }
			);
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect(received.length).to.equal(1);
			expect(received[0].achievementVarScopes.length).to.equal(1);
		})

		it("should have *check_achievements scope run from definition to document end", () => {
			let fakeDocument = createDocument("Line 0\n*check_achievements\nLine 2\nLast line");
			let received: Array<DocumentScopes> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateVariableScopes(Arg.all()).mimicks(
				(uri: string, scope: DocumentScopes) => { received.push(scope) }
			);
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			// These positions are due to the fake document converting an index directly into a line number
			expect(received[0].achievementVarScopes[0].start).to.eql({line: 8, character: 0});
			expect(received[0].achievementVarScopes[0].end).to.eql({line: 43, character: 0});
		})
	})

	describe("Parse Errors", () => {
		it("should flag non-existent commands", () => {
			let fakeDocument = createDocument("*fake_command");
			let received: Array<Diagnostic[]> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateParseErrors(Arg.all()).mimicks(
				(uri: string, errors: Diagnostic[]) => { received.push(errors) }
			);
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect(received.length).to.equal(1);
			expect(received[0].length).to.equal(1);
			expect(received[0][0].message).to.include("*fake_command isn't a valid");
			expect(received[0][0].range.start.line).to.equal(1);
			expect(received[0][0].range.end.line).to.equal(13);
		});
	})
})
