import { expect } from 'chai';
import 'mocha';
import { Substitute, SubstituteOf, Arg } from '@fluffy-spoon/substitute';
import { TextDocument, Position } from 'vscode-languageserver';

import { ProjectIndex, IdentifierIndex, updateProjectIndex, ReferenceIndex } from '../../../server/src/indexer';

const fakeDocumentUri: string = "file:///faker.txt";

function createDocument(text: string, 
	uri: string = fakeDocumentUri): SubstituteOf<TextDocument> {
	let fakeDocument = Substitute.for<TextDocument>();
	fakeDocument.getText(Arg.any()).returns(text);
	fakeDocument.uri.returns(uri);
	fakeDocument.positionAt(Arg.any()).mimicks((index: number) => { return(Position.create(index, 0)); });
	return fakeDocument;
}

describe("Symbol Command Indexing", () => {
	it("should index bare variables in the command", () => {
		let fakeDocument = createDocument("*set variable 3");
		let receivedReferences: Array<ReferenceIndex> = [];
		let fakeIndex = Substitute.for<ProjectIndex>();
		fakeIndex.updateReferences(Arg.all()).mimicks((uri: string, index: ReferenceIndex) => { receivedReferences.push(index) });

		updateProjectIndex(fakeDocument, true, fakeIndex);

		expect([...receivedReferences[0].keys()]).to.eql(['variable']);
		expect(receivedReferences[0].get('variable')[0].range.start.line).to.equal(5);
	});

	it("should index variable references in the command", () => {
		let fakeDocument = createDocument("*set {variable} 3");
		let receivedReferences: Array<ReferenceIndex> = [];
		let fakeIndex = Substitute.for<ProjectIndex>();
		fakeIndex.updateReferences(Arg.all()).mimicks((uri: string, index: ReferenceIndex) => { receivedReferences.push(index) });

		updateProjectIndex(fakeDocument, true, fakeIndex);

		expect([...receivedReferences[0].keys()]).to.eql(['variable']);
		expect(receivedReferences[0].get('variable')[0].range.start.line).to.equal(6);
	});

	it("should index complex variable references in the command", () => {
		let fakeDocument = createDocument('*set {"this" + variable} 3');
		let receivedReferences: Array<ReferenceIndex> = [];
		let fakeIndex = Substitute.for<ProjectIndex>();
		fakeIndex.updateReferences(Arg.all()).mimicks((uri: string, index: ReferenceIndex) => { receivedReferences.push(index) });

		updateProjectIndex(fakeDocument, true, fakeIndex);

		expect([...receivedReferences[0].keys()]).to.eql(['variable']);
		expect(receivedReferences[0].get('variable')[0].range.start.line).to.equal(15);
	});

	it("should index variable replacements in strings in the command", () => {
		let fakeDocument = createDocument('*set variable "${other_variable}"');
		let receivedReferences: Array<ReferenceIndex> = [];
		let fakeIndex = Substitute.for<ProjectIndex>();
		fakeIndex.updateReferences(Arg.all()).mimicks((uri: string, index: ReferenceIndex) => { receivedReferences.push(index) });

		updateProjectIndex(fakeDocument, true, fakeIndex);

		expect([...receivedReferences[0].keys()]).to.eql(['other_variable', 'variable']);
		expect(receivedReferences[0].get('variable')[0].range.start.line).to.equal(5);
		expect(receivedReferences[0].get('other_variable')[0].range.start.line).to.equal(17);
	});

	it("should index multireplaces in strings in the command", () => {
		let fakeDocument = createDocument('*set variable "@{other_variable this | that}"');
		let receivedReferences: Array<ReferenceIndex> = [];
		let fakeIndex = Substitute.for<ProjectIndex>();
		fakeIndex.updateReferences(Arg.all()).mimicks((uri: string, index: ReferenceIndex) => { receivedReferences.push(index) });

		updateProjectIndex(fakeDocument, true, fakeIndex);

		expect([...receivedReferences[0].keys()]).to.eql(['other_variable', 'variable']);
		expect(receivedReferences[0].get('variable')[0].range.start.line).to.equal(5);
		expect(receivedReferences[0].get('other_variable')[0].range.start.line).to.equal(17);
	});
})

describe("Multireplace Indexing", () => {
	it("should index variables in the test", () => {
		let fakeDocument = createDocument("@{variable this | that}");
		let receivedReferences: Array<ReferenceIndex> = [];
		let fakeIndex = Substitute.for<ProjectIndex>();
		fakeIndex.updateReferences(Arg.all()).mimicks((uri: string, index: ReferenceIndex) => { receivedReferences.push(index) });

		updateProjectIndex(fakeDocument, true, fakeIndex);

		expect([...receivedReferences[0].keys()]).to.eql(['variable']);
		expect(receivedReferences[0].get('variable')[0].range.start.line).to.equal(2);
	});

	it("should index multiple variables in a single test", () => {
		let fakeDocument = createDocument('@{(var1 + var2 > 2) true | false}');
		let receivedReferences: Array<ReferenceIndex> = [];
		let fakeIndex = Substitute.for<ProjectIndex>();
		fakeIndex.updateReferences(Arg.all()).mimicks((uri: string, index: ReferenceIndex) => { receivedReferences.push(index) });

		updateProjectIndex(fakeDocument, true, fakeIndex);

		expect([...receivedReferences[0].keys()]).to.eql(['var1', 'var2']);
		expect(receivedReferences[0].get('var2').length).to.equal(1);
		expect(receivedReferences[0].get('var2')[0].range.start.line).to.equal(10);
	});

	it("should not index variable names in strings", () => {
		let fakeDocument = createDocument('@{("var1" = var2) true | false}');
		let receivedReferences: Array<ReferenceIndex> = [];
		let fakeIndex = Substitute.for<ProjectIndex>();
		fakeIndex.updateReferences(Arg.all()).mimicks((uri: string, index: ReferenceIndex) => { receivedReferences.push(index) });

		updateProjectIndex(fakeDocument, true, fakeIndex);

		expect([...receivedReferences[0].keys()]).to.eql(['var2']);
		expect(receivedReferences[0].get('var2')[0].range.start.line).to.equal(12);
	});

	it("should index variables replacements in the body", () => {
		let fakeDocument = createDocument('@{(known) true | ${unknown}}');
		let receivedReferences: Array<ReferenceIndex> = [];
		let fakeIndex = Substitute.for<ProjectIndex>();
		fakeIndex.updateReferences(Arg.all()).mimicks((uri: string, index: ReferenceIndex) => { receivedReferences.push(index) });

		updateProjectIndex(fakeDocument, true, fakeIndex);

		expect([...receivedReferences[0].keys()]).to.eql(['known', 'unknown']);
		expect(receivedReferences[0].get('unknown').length).to.equal(1);
		expect(receivedReferences[0].get('unknown')[0].range.start.line).to.equal(19);
	});
})

describe("Reference Command Indexing", () => {
	it("should index local variables directly after a reference command", () => {
		let fakeDocument = createDocument("*if variable > 1");
		let receivedReferences: Array<ReferenceIndex> = [];
		let fakeIndex = Substitute.for<ProjectIndex>();
		fakeIndex.updateReferences(Arg.all()).mimicks((uri: string, index: ReferenceIndex) => { receivedReferences.push(index) });

		updateProjectIndex(fakeDocument, true, fakeIndex);

		expect([...receivedReferences[0].keys()]).to.eql(['variable']);
		expect(receivedReferences[0].get('variable')[0].range.start.line).to.equal(4);
	});

	it("should not index variable names in strings", () => {
		let fakeDocument = createDocument('*if variable = "other_variable"');
		let receivedReferences: Array<ReferenceIndex> = [];
		let fakeIndex = Substitute.for<ProjectIndex>();
		fakeIndex.updateReferences(Arg.all()).mimicks((uri: string, index: ReferenceIndex) => { receivedReferences.push(index) });

		updateProjectIndex(fakeDocument, true, fakeIndex);

		expect([...receivedReferences[0].keys()]).to.eql(['variable']);
		expect(receivedReferences[0].get('variable')[0].range.start.line).to.equal(4);
	});

	it("should index variable references in strings", () => {
		let fakeDocument = createDocument('*if variable = "${other_variable}"');
		let receivedReferences: Array<ReferenceIndex> = [];
		let fakeIndex = Substitute.for<ProjectIndex>();
		fakeIndex.updateReferences(Arg.all()).mimicks((uri: string, index: ReferenceIndex) => { receivedReferences.push(index) });

		updateProjectIndex(fakeDocument, true, fakeIndex);

		expect(receivedReferences[0].get('other_variable').length).to.equal(1);
		expect(receivedReferences[0].get('other_variable')[0].range.start.line).to.equal(18);
	});

	it("should index complex variable references in strings", () => {
		let fakeDocument = createDocument('*if variable = "${"this" & other_variable}"');
		let receivedReferences: Array<ReferenceIndex> = [];
		let fakeIndex = Substitute.for<ProjectIndex>();
		fakeIndex.updateReferences(Arg.all()).mimicks((uri: string, index: ReferenceIndex) => { receivedReferences.push(index) });

		updateProjectIndex(fakeDocument, true, fakeIndex);

		expect(receivedReferences[0].get('other_variable').length).to.equal(1);
		expect(receivedReferences[0].get('other_variable')[0].range.start.line).to.equal(27);
	});

	it("should index multireplaces in strings", () => {
		let fakeDocument = createDocument('*if variable = "@{other_variable this | that}"');
		let receivedReferences: Array<ReferenceIndex> = [];
		let fakeIndex = Substitute.for<ProjectIndex>();
		fakeIndex.updateReferences(Arg.all()).mimicks((uri: string, index: ReferenceIndex) => { receivedReferences.push(index) });

		updateProjectIndex(fakeDocument, true, fakeIndex);

		expect(receivedReferences[0].get('other_variable').length).to.equal(1);
		expect(receivedReferences[0].get('other_variable')[0].range.start.line).to.equal(18);
	});

	it("should index multireplaces with replacements in strings", () => {
		let fakeDocument = createDocument('*if variable = "@{other_variable ${other_variable} | that}"');
		let receivedReferences: Array<ReferenceIndex> = [];
		let fakeIndex = Substitute.for<ProjectIndex>();
		fakeIndex.updateReferences(Arg.all()).mimicks((uri: string, index: ReferenceIndex) => { receivedReferences.push(index) });

		updateProjectIndex(fakeDocument, true, fakeIndex);

		expect(receivedReferences[0].get('other_variable').length).to.equal(2);
		expect(receivedReferences[0].get('other_variable')[1].range.start.line).to.equal(35);
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

	it("should get the right position for the achievement", () => {
		let fakeDocument = createDocument("*achievement code_name");
		let receivedAchievements: IdentifierIndex[] = [];
		let fakeIndex = Substitute.for<ProjectIndex>();
		fakeIndex.updateAchievements(Arg.any()).mimicks((index: IdentifierIndex) => { receivedAchievements.push(index) });

		updateProjectIndex(fakeDocument, true, fakeIndex);

		// The fake document stores the index passed to positionAt in the line property of a position
		expect(receivedAchievements[0].get('code_name').range.start.line).to.equal(13);
		expect(receivedAchievements[0].get('code_name').range.end.line).to.equal(22);
	});
});