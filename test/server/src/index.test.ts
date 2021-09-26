import { expect } from 'chai';
import 'mocha';
import { Substitute } from '@fluffy-spoon/substitute';
import { Location, Range } from 'vscode-languageserver/node';

import { 
	Index,
	FlowControlEvent,
	IdentifierMultiIndex, 
} from '../../../server/src/index';

const documentUri = "file:///faker.txt";
const otherSceneUri = "file:///other-scene.txt";

describe("Project Index", () => {
	describe("Index", () => {
		it("should combine variable references with differing capitalizations", () => {
			const referenceLocation1 = Location.create(documentUri, Range.create(1, 0, 1, 5));
			const referenceLocation2 = Location.create(documentUri, Range.create(2, 0, 2, 5));
			const originalReferences: IdentifierMultiIndex = new Map([
				["variable", [referenceLocation1]],
				["vArIaBlE", [referenceLocation2]]
			]);
			const index = new Index();
			index.setVariableReferences(documentUri, originalReferences);

			const references = index.getVariableReferences("variable");

			expect(references.length).to.equal(2);
			expect(references[0].range.start).to.eql({line: 1, character: 0});
			expect(references[0].range.end).to.eql({line: 1, character: 5});
			expect(references[1].range.start).to.eql({line: 2, character: 0});
			expect(references[1].range.end).to.eql({line: 2, character: 5});
		});

		it("should return choicescript_stats in the scene list if present in the index", () => {
			const index = new Index();
			index.setHasChoicescriptStats(true);

			const scenes = index.getSceneList();

			expect(scenes).to.eql(["choicescript_stats"]);
		});

		it("should find label references in a scene", () => {
			const events: FlowControlEvent[] = [
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
			const index = new Index();
			index.setFlowControlEvents(documentUri, events);

			const references = index.getLabelReferences("local_label");

			expect(references.length).to.equal(2);
			expect(references[0].range.start).to.eql({line: 2, character: 0});
			expect(references[0].range.end).to.eql({line: 2, character: 5});
			expect(references[1].range.start).to.eql({line: 7, character: 0});
			expect(references[1].range.end).to.eql({line: 7, character: 7});
		});

		it("should find label references across all scenes", () => {
			const localEvents: FlowControlEvent[] = [
				{
					command: "goto",
					commandLocation: Substitute.for<Location>(),
					label: "local_label",
					labelLocation: Location.create(documentUri, Range.create(2, 0, 2, 5)),
					scene: ""
				}
			];
			const otherSceneEvents: FlowControlEvent[] = [
				{
					command: "gosub-scene",
					commandLocation: Substitute.for<Location>(),
					label: "local_label",
					labelLocation: Location.create(otherSceneUri, Range.create(7, 0, 7, 7)),
					scene: "faker",
					sceneLocation: Location.create(otherSceneUri, Range.create(8, 0, 8, 8))
				}
			];
			const index = new Index();
			index.setFlowControlEvents(documentUri, localEvents);
			index.setFlowControlEvents(otherSceneUri, otherSceneEvents);

			const references = index.getLabelReferences('local_label');

			expect(references.length).to.equal(2);
			expect(references[0].range.start).to.eql({line: 2, character: 0});
			expect(references[0].range.end).to.eql({line: 2, character: 5});
			expect(references[1].range.start).to.eql({line: 7, character: 0});
			expect(references[1].range.end).to.eql({line: 7, character: 7});
		});

		it("should find achievement references in a scene", () => {
			const referenceLocation = Location.create(documentUri, Range.create(1, 1, 1, 7));
			const achievementReferences = new Map([["achieve", [referenceLocation]]]);
			const index = new Index();
			index.setAchievementReferences(documentUri, achievementReferences);

			const references = index.getDocumentAchievementReferences(documentUri);
			const achieveReferences = references.get('achieve');

			expect(Array.from(references.keys())).to.eql(["achieve"]);
			expect(achieveReferences.length).to.equal(1);
			expect(achieveReferences[0].range.start).to.eql({line: 1, character: 1});
			expect(achieveReferences[0].range.end).to.eql({line: 1, character: 7});
		});

		it("should find achievement references across all scenes", () => {
			const localReferenceLocation = Location.create(documentUri, Range.create(1, 1, 1, 7));
			const localAchievementReferences = new Map([["achieve", [localReferenceLocation]]]);
			const otherReferenceLocation = Location.create(otherSceneUri, Range.create(9, 1, 9, 7));
			const otherAchievementReferences = new Map([["achieve", [otherReferenceLocation]]]);
			const index = new Index();
			index.setAchievementReferences(documentUri, localAchievementReferences);
			index.setAchievementReferences(otherSceneUri, otherAchievementReferences);

			const references = index.getAchievementReferences("achieve");

			expect(references.length).to.equal(2);
			expect(references[0].range.start).to.eql({line: 1, character: 1});
			expect(references[0].range.end).to.eql({line: 1, character: 7});
			expect(references[1].range.start).to.eql({line: 9, character: 1});
			expect(references[1].range.end).to.eql({line: 9, character: 7});
		});
	});
});
