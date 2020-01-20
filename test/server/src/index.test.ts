import { expect } from 'chai';
import 'mocha';
import { Substitute } from '@fluffy-spoon/substitute';
import { Location, Range } from 'vscode-languageserver';

import { 
	Index,
	FlowControlEvent, 
} from '../../../server/src/index';

const documentUri: string = "file:///faker.txt";
const otherSceneUri: string = "file:///other-scene.txt";

describe("Project Index", () => {
	describe("Index", () => {
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
	});
});
