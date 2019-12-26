import { expect } from 'chai';
import 'mocha';
import { Substitute, SubstituteOf, Arg } from '@fluffy-spoon/substitute';
import { TextDocument, Position } from 'vscode-languageserver';

import { ProjectIndex, IdentifierIndex, updateProjectIndex } from '../../../server/src/indexer';

const fakeDocumentUri: string = "file:///faker.txt";

function createDocument(text: string, 
	uri: string = fakeDocumentUri): SubstituteOf<TextDocument> {
	let fakeDocument = Substitute.for<TextDocument>();
	fakeDocument.getText(Arg.any()).returns(text);
	fakeDocument.uri.returns(uri);
	fakeDocument.positionAt(Arg.any()).mimicks((index: number) => { return(Position.create(index, 0)); });
	return fakeDocument;
}

describe("Scene Indexing", () => {
	it("should index scenes in startup files", () => {
		let fakeDocument = createDocument("*scene_list\n\tscene-1\n\tscene-2\n");
		let receivedScenes: Array<Array<string>> = [];
		let fakeIndex = Substitute.for<ProjectIndex>();
		fakeIndex.updateSceneList(Arg.any()).mimicks((scenes: string[]) => { receivedScenes.push(scenes) });
		fakeIndex.getStatsFileUri().returns("");

		updateProjectIndex(fakeDocument, true, fakeIndex);

		expect(receivedScenes).to.eql([['scene-1', 'scene-2']]);
	});

	it("should add stats file to list of scenes if it exists", () => {
		let fakeDocument = createDocument("*scene_list\n\tscene-1\n\tscene-2\n");
		let receivedScenes: Array<Array<string>> = [];
		let fakeIndex = Substitute.for<ProjectIndex>();
		fakeIndex.updateSceneList(Arg.any()).mimicks((scenes: string[]) => { receivedScenes.push(scenes) });
		fakeIndex.getStatsFileUri().returns("file:///choicescript_stats.txt");

		updateProjectIndex(fakeDocument, true, fakeIndex);

		expect(receivedScenes.length).to.equal(1);
		expect(receivedScenes).to.eql([['scene-1', 'scene-2', 'choicescript_stats']]);
	});
})

describe("Achievement Indexing", () => {
	it("should index an achievement", () => {
		let fakeDocument = createDocument("*achievement code_name");
		let receivedAchievements: IdentifierIndex[] = [];
		let fakeIndex = Substitute.for<ProjectIndex>();
		fakeIndex.updateAchievements(Arg.any()).mimicks((index: IdentifierIndex) => { receivedAchievements.push(index) });
		fakeIndex.getStatsFileUri().returns("");

		updateProjectIndex(fakeDocument, true, fakeIndex);

		expect(receivedAchievements.length).to.equal(1);
		expect(receivedAchievements[0]).has.keys(['code_name']);
	});

	it("should get the right position for the achievement", () => {
		let fakeDocument = createDocument("*achievement code_name");
		let receivedAchievements: IdentifierIndex[] = [];
		let fakeIndex = Substitute.for<ProjectIndex>();
		fakeIndex.updateAchievements(Arg.any()).mimicks((index: IdentifierIndex) => { receivedAchievements.push(index) });
		fakeIndex.getStatsFileUri().returns("");

		updateProjectIndex(fakeDocument, true, fakeIndex);

		// The fake document stores the index passed to positionAt in the line property of a position
		expect(receivedAchievements[0].get('code_name').range.start.line).to.equal(13);
		expect(receivedAchievements[0].get('code_name').range.end.line).to.equal(22);
	});
});