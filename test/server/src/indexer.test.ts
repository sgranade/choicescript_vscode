import { expect } from 'chai';
import 'mocha';
import { Substitute, SubstituteOf, Arg } from '@fluffy-spoon/substitute';
import { TextDocument, Position } from 'vscode-languageserver';

import { ProjectIndex, IdentifierIndex, updateProjectIndex } from '../../../server/src/indexer';

const fakeDocumentUri: string = "file:///faker.txt";

function createDocument(text: string, uri: string = fakeDocumentUri): SubstituteOf<TextDocument> {
	let fakeDocument = Substitute.for<TextDocument>();
	fakeDocument.getText(Arg.any()).returns(text);
	fakeDocument.uri.returns(uri);
	fakeDocument.positionAt(Arg.any()).mimicks((index: number) => { return(Position.create(index, 0)); });
	return fakeDocument;
}

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