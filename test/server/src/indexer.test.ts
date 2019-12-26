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
	fakeDocument.positionAt(Arg.any()).returns(Position.create(1, 2));
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

});