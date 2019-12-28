import { expect } from 'chai';
import 'mocha';
import { Substitute, SubstituteOf, Arg } from '@fluffy-spoon/substitute';
import { TextDocument, Position } from 'vscode-languageserver';

import { ProjectIndex, IdentifierIndex, updateProjectIndex, ReferenceIndex, LabelIndex } from '../../../server/src/indexer';

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
			let receivedReferences: Array<ReferenceIndex> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateVariableReferences(Arg.all()).mimicks((uri: string, index: ReferenceIndex) => { receivedReferences.push(index) });
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect([...receivedReferences[0].keys()]).to.eql(['variable']);
			expect(receivedReferences[0].get('variable')[0].range.start.line).to.equal(5);
		});
	})
	
	describe("Multireplace Indexing", () => {
		it("should index variables in the test", () => {
			let fakeDocument = createDocument("@{variable this | that}");
			let receivedReferences: Array<ReferenceIndex> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateVariableReferences(Arg.all()).mimicks((uri: string, index: ReferenceIndex) => { receivedReferences.push(index) });
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect([...receivedReferences[0].keys()]).to.eql(['variable']);
			expect(receivedReferences[0].get('variable')[0].range.start.line).to.equal(2);
		});
	})
	
	describe("Reference Command Indexing", () => {
		it("should index local variables directly after a reference command", () => {
			let fakeDocument = createDocument("*if variable > 1");
			let receivedReferences: Array<ReferenceIndex> = [];
			let fakeIndex = Substitute.for<ProjectIndex>();
			fakeIndex.updateVariableReferences(Arg.all()).mimicks((uri: string, index: ReferenceIndex) => { receivedReferences.push(index) });
	
			updateProjectIndex(fakeDocument, true, fakeIndex);
	
			expect([...receivedReferences[0].keys()]).to.eql(['variable']);
			expect(receivedReferences[0].get('variable')[0].range.start.line).to.equal(4);
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
})
