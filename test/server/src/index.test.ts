import { expect } from 'chai';
import 'mocha';
import { Substitute } from '@fluffy-spoon/substitute';
import { Location, Range } from 'vscode-languageserver';

import { 
	Index,
	FlowControlEvent,
	IdentifierMultiIndex, 
} from '../../../server/src/index';

const documentUri: string = "file:///faker.txt";
const otherSceneUri: string = "file:///other-scene.txt";

describe("Project Index", () => {
	describe("Index", () => {
		it("should combine variable references with differing capitalizations", () => {
			let referenceLocation1 = Location.create(documentUri, Range.create(1, 0, 1, 5));
			let referenceLocation2 = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let originalReferences: IdentifierMultiIndex = new Map([
				["variable", [referenceLocation1]],
				["vArIaBlE", [referenceLocation2]]
			]);
			let index = new Index();
			index.updateVariableReferences(documentUri, originalReferences);

			let references = index.getVariableReferences("variable");

			expect(references.length).to.equal(2);
			expect(references[0].range.start).to.eql({line: 1, character: 0});
			expect(references[0].range.end).to.eql({line: 1, character: 5});
			expect(references[1].range.start).to.eql({line: 2, character: 0});
			expect(references[1].range.end).to.eql({line: 2, character: 5});
		});


		it("should find label references in a scene", () => {
			let events: FlowControlEvent[] = [
				{
					command: "goto",
					commandLocation: Substitute.for<Location>(),
					label: "local_label",
					labelLocation: Location.create(documentUri, Range.create(2, 0, 2, 5)),
					scene: ""
				},
				{
					command: "gosub",
					commandLocation: Substitute.for<Location>(),
					label: "local_label",
					labelLocation: Location.create(documentUri, Range.create(7, 0, 7, 7)),
					scene: ""
				}
			];
			let index = new Index();
			index.updateFlowControlEvents(documentUri, events);

			let references = index.getLabelReferences("local_label", documentUri);

			expect(references.length).to.equal(2);
			expect(references[0].range.start).to.eql({line: 2, character: 0});
			expect(references[0].range.end).to.eql({line: 2, character: 5});
			expect(references[1].range.start).to.eql({line: 7, character: 0});
			expect(references[1].range.end).to.eql({line: 7, character: 7});
		});

		it("should find label references across all scenes", () => {
			let localEvents: FlowControlEvent[] = [
				{
					command: "goto",
					commandLocation: Substitute.for<Location>(),
					label: "local_label",
					labelLocation: Location.create(documentUri, Range.create(2, 0, 2, 5)),
					scene: ""
				}
			];
			let otherSceneEvents: FlowControlEvent[] = [
				{
					command: "gosub-scene",
					commandLocation: Substitute.for<Location>(),
					label: "local_label",
					labelLocation: Location.create(otherSceneUri, Range.create(7, 0, 7, 7)),
					scene: "faker",
					sceneLocation: Location.create(otherSceneUri, Range.create(8, 0, 8, 8))
				}
			];
			let index = new Index();
			index.updateFlowControlEvents(documentUri, localEvents);
			index.updateFlowControlEvents(otherSceneUri, otherSceneEvents);

			let references = index.getLabelReferences('local_label', documentUri);

			expect(references.length).to.equal(2);
			expect(references[0].range.start).to.eql({line: 2, character: 0});
			expect(references[0].range.end).to.eql({line: 2, character: 5});
			expect(references[1].range.start).to.eql({line: 7, character: 0});
			expect(references[1].range.end).to.eql({line: 7, character: 7});
		});

		it("should find achievement references in a scene", () => {
			let referenceLocation = Location.create(documentUri, Range.create(1, 1, 1, 7));
			let achievementReferences = new Map([["achieve", [referenceLocation]]]);
			let index = new Index();
			index.updateAchievementReferences(documentUri, achievementReferences);

			let references = index.getDocumentAchievementReferences(documentUri);
			let achieveReferences = references.get('achieve');

			expect(Array.from(references.keys())).to.eql(["achieve"]);
			expect(achieveReferences.length).to.equal(1);
			expect(achieveReferences[0].range.start).to.eql({line: 1, character: 1});
			expect(achieveReferences[0].range.end).to.eql({line: 1, character: 7});
		});

		it("should find achievement references across all scenes", () => {
			let localReferenceLocation = Location.create(documentUri, Range.create(1, 1, 1, 7));
			let localAchievementReferences = new Map([["achieve", [localReferenceLocation]]]);
			let otherReferenceLocation = Location.create(otherSceneUri, Range.create(9, 1, 9, 7));
			let otherAchievementReferences = new Map([["achieve", [otherReferenceLocation]]]);
			let index = new Index();
			index.updateAchievementReferences(documentUri, localAchievementReferences);
			index.updateAchievementReferences(otherSceneUri, otherAchievementReferences);

			let references = index.getAchievementReferences("achieve");

			expect(references.length).to.equal(2);
			expect(references[0].range.start).to.eql({line: 1, character: 1});
			expect(references[0].range.end).to.eql({line: 1, character: 7});
			expect(references[1].range.start).to.eql({line: 9, character: 1});
			expect(references[1].range.end).to.eql({line: 9, character: 7});
		});
	});
});
