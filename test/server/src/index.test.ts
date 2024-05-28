import { expect } from 'chai';
import 'mocha';
import { Substitute } from '@fluffy-spoon/substitute';
import { Location, Range } from 'vscode-languageserver/node';

import { 
	Index,
	type FlowControlEvent
} from '../../../server/src/common/index';

const documentUri = "file:///faker.txt";
const otherSceneUri = "file:///other-scene.txt";

describe("Project Index", () => {
	describe("Index", () => {
		describe("Case-Insensitive Tokens", () => {
			it("should store global variables with case insensitivity", () => {
				const creationLocation = Location.create(documentUri, Range.create(1, 0, 1, 5));
				const variableCreation = new Map([
					["vArIaBlE", creationLocation]
				]);
				const index = new Index();
				index.setGlobalVariables(documentUri, variableCreation);
	
				const globalVars = index.getGlobalVariables();
				
				expect(Array.from(globalVars.entries())).to.eql([["variable", creationLocation]]);
			});
	
			it("should allow access to global variables' original capitalization", () => {
				const creationLocation = Location.create(documentUri, Range.create(1, 0, 1, 5));
				const variableCreation = new Map([
					["vArIaBlE", creationLocation]
				]);
				const index = new Index();
				index.setGlobalVariables(documentUri, variableCreation);
	
				const globalVars = index.getGlobalVariables();
				const results = Array.from(globalVars.caseInsensitiveKeysToKeys().entries());
				
				expect(results).to.eql([["variable", "vArIaBlE"]]);
			});
	
			it("should store local variables with case insensitivity", () => {
				const creationLocation1 = Location.create(documentUri, Range.create(1, 0, 1, 5));
				const creationLocation2 = Location.create(documentUri, Range.create(2, 0, 2, 5));
				const variableCreation = new Map([
					["vArIaBlE", [creationLocation1]],
					["VarIabLE", [creationLocation2]]
				]);
				const index = new Index();
				index.setLocalVariables(documentUri, variableCreation);
	
				const localVars = index.getLocalVariables(documentUri);
				
				expect(Array.from(localVars.entries())).to.eql([["variable", [creationLocation1, creationLocation2]]]);
			});
	
			it("should allow access to local variables' original capitalization, with the first capitalization winning", () => {
				const creationLocation1 = Location.create(documentUri, Range.create(1, 0, 1, 5));
				const creationLocation2 = Location.create(documentUri, Range.create(2, 0, 2, 5));
				const variableCreation = new Map([
					["vArIaBlE", [creationLocation1]],
					["VarIabLE", [creationLocation2]]
				]);
				const index = new Index();
				index.setLocalVariables(documentUri, variableCreation);
	
				const localVars = index.getLocalVariables(documentUri);
				const results = Array.from(localVars.caseInsensitiveKeysToKeys().entries());
				
				expect(results).to.eql([["variable", "vArIaBlE"]]);
			});
	
			it("should store subroutine local variables with case insensitivity", () => {
				const creationLocation = Location.create(documentUri, Range.create(1, 0, 1, 5));
				const variableCreation = new Map([
					["vArIaBlE", creationLocation]
				]);
				const index = new Index();
				index.setSubroutineLocalVariables(documentUri, variableCreation);
	
				const subroutineVars = index.getSubroutineLocalVariables(documentUri);
				
				expect(Array.from(subroutineVars.entries())).to.eql([["variable", creationLocation]]);
			});
	
			it("should allow access to subroutine local variables' original capitalization", () => {
				const creationLocation = Location.create(documentUri, Range.create(1, 0, 1, 5));
				const variableCreation = new Map([
					["vArIaBlE", creationLocation]
				]);
				const index = new Index();
				index.setSubroutineLocalVariables(documentUri, variableCreation);
	
				const globalVars = index.getSubroutineLocalVariables(documentUri);
				const results = Array.from(globalVars.caseInsensitiveKeysToKeys().entries());
				
				expect(results).to.eql([["variable", "vArIaBlE"]]);
			});
	
			it("should store variable references with case insensitivity", () => {
				const referenceLocation1 = Location.create(documentUri, Range.create(1, 0, 1, 5));
				const referenceLocation2 = Location.create(documentUri, Range.create(2, 0, 2, 5));
				const originalReferences = new Map([
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
		}),

		it("should only return choicescript_stats once in the scene list if present in the index", () => {
			const index = new Index();
			index.setHasChoicescriptStats(true);
			index.setSceneList(["choicescript_stats"]);

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

		it("should find scene references across all goto- and gosub-scene", () => {
			const localEvents: FlowControlEvent[] = [
				{
					command: "goto_scene",
					commandLocation: Substitute.for<Location>(),
					label: "away_label",
					labelLocation: Location.create(documentUri, Range.create(2, 0, 2, 5)),
					scene: "scene1"
				},
				{
					command: "gosub_scene",
					commandLocation: Substitute.for<Location>(),
					label: "other_label",
					labelLocation: Location.create(documentUri, Range.create(2, 0, 2, 5)),
					scene: "scene2"
				}
			];
			const otherSceneEvents: FlowControlEvent[] = [
				{
					command: "gosub_scene",
					commandLocation: Substitute.for<Location>(),
					label: "local_label",
					labelLocation: Location.create(otherSceneUri, Range.create(7, 0, 7, 7)),
					scene: "scene1",
					sceneLocation: Location.create(otherSceneUri, Range.create(8, 0, 8, 8))
				}
			];
			const index = new Index();
			index.setFlowControlEvents(documentUri, localEvents);
			index.setFlowControlEvents(otherSceneUri, otherSceneEvents);

			const scenes = index.getAllReferencedScenes();

			expect(scenes).to.eql(["scene1", "scene2"]);
		});

		it("should not find scene references that are themselves variable references", () => {
			const localEvents: FlowControlEvent[] = [
				{
					command: "goto_scene",
					commandLocation: Substitute.for<Location>(),
					label: "away_label",
					labelLocation: Location.create(documentUri, Range.create(2, 0, 2, 5)),
					scene: "scene1"
				},
				{
					command: "gosub_scene",
					commandLocation: Substitute.for<Location>(),
					label: "other_label",
					labelLocation: Location.create(documentUri, Range.create(2, 0, 2, 5)),
					scene: "scene2"
				}
			];
			const otherSceneEvents: FlowControlEvent[] = [
				{
					command: "gosub_scene",
					commandLocation: Substitute.for<Location>(),
					label: "local_label",
					labelLocation: Location.create(otherSceneUri, Range.create(7, 0, 7, 7)),
					scene: "{var1}",
					sceneLocation: Location.create(otherSceneUri, Range.create(8, 0, 8, 8))
				}
			];
			const index = new Index();
			index.setFlowControlEvents(documentUri, localEvents);
			index.setFlowControlEvents(otherSceneUri, otherSceneEvents);

			const scenes = index.getAllReferencedScenes();

			expect(scenes).to.eql(["scene1", "scene2"]);
		});

		it("should include explicitly listed scenes in the scene references", () => {
			const localEvents: FlowControlEvent[] = [
				{
					command: "goto_scene",
					commandLocation: Substitute.for<Location>(),
					label: "away_label",
					labelLocation: Location.create(documentUri, Range.create(2, 0, 2, 5)),
					scene: "scene1"
				}
			];
			const index = new Index();
			index.setFlowControlEvents(documentUri, localEvents);
			index.setSceneList(["startup"]);

			const scenes = index.getAllReferencedScenes();

			expect(scenes).to.eql(["startup", "scene1"]);
		});

		it("should find achievement references in a scene", () => {
			const referenceLocation = Location.create(documentUri, Range.create(1, 1, 1, 7));
			const achievementReferences = new Map([["achieve", [referenceLocation]]]);
			const index = new Index();
			index.setAchievementReferences(documentUri, achievementReferences);

			const references = index.getDocumentAchievementReferences(documentUri);
			const achieveReferences = references.get('achieve') ?? [];

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

		describe("Indexed Scenes", () => {
			// Since indexed scenes come from so many sources, group them
			it("should include word count URIs in indexed scenes", () => {
				const index = new Index();
				index.setWordCount(documentUri, 0);

				const scenes = index.getIndexedScenes();

				expect(scenes).to.eql(["faker"]);
			});

			it("should include local variable URIs in indexed scenes", () => {
				const index = new Index();
				index.setLocalVariables(documentUri, new Map());

				const scenes = index.getIndexedScenes();

				expect(scenes).to.eql(["faker"]);
			});

			it("should include subroutine local varable URIs in indexed scenes", () => {
				const index = new Index();
				index.setSubroutineLocalVariables(documentUri, new Map());

				const scenes = index.getIndexedScenes();

				expect(scenes).to.eql(["faker"]);
			});

			it("should include variable reference URIs in indexed scenes", () => {
				const index = new Index();
				index.setVariableReferences(documentUri, new Map());

				const scenes = index.getIndexedScenes();

				expect(scenes).to.eql(["faker"]);
			});

			it("should include label URIs in indexed scenes", () => {
				const index = new Index();
				index.setLabels(documentUri, new Map());

				const scenes = index.getIndexedScenes();

				expect(scenes).to.eql(["faker"]);
			});

			it("should include achievement reference URIs in indexed scenes", () => {
				const index = new Index();
				index.setAchievementReferences(documentUri, new Map());

				const scenes = index.getIndexedScenes();

				expect(scenes).to.eql(["faker"]);
			});

			it("should include document scope URIs in indexed scenes", () => {
				const index = new Index();
				index.setDocumentScopes(documentUri, { achievementVarScopes: [], choiceScopes: [], paramScopes: []});

				const scenes = index.getIndexedScenes();

				expect(scenes).to.eql(["faker"]);
			});

			it("should include flow control event URIs in indexed scenes", () => {
				const index = new Index();
				index.setFlowControlEvents(documentUri, []);

				const scenes = index.getIndexedScenes();

				expect(scenes).to.eql(["faker"]);
			});

			it("should include parse error URIs in indexed scenes", () => {
				const index = new Index();
				index.setParseErrors(documentUri, []);

				const scenes = index.getIndexedScenes();

				expect(scenes).to.eql(["faker"]);
			});

			it("should not return scenes more than once in the indexed scenes", () => {
				const index = new Index();
				index.setWordCount(documentUri, 0);
				index.setParseErrors(documentUri, []);
				index.setParseErrors(otherSceneUri, []);

				const scenes = index.getIndexedScenes();

				expect(scenes).to.eql(["faker", "other-scene"]);
			});
		});

		describe("URIs in the Project", () => {
			// Since URIs come from so many sources, group them
			it("should include word count URIs in captured URIs", () => {
				const index = new Index();
				index.setWordCount(documentUri, 0);

				const result = index.hasUri(documentUri);

				expect(result).to.be.true;
			});

			it("should include local variable URIs in indexed scenes", () => {
				const index = new Index();
				index.setLocalVariables(documentUri, new Map());

				const result = index.hasUri(documentUri);

				expect(result).to.be.true;
			});

			it("should include subroutine local varable URIs in indexed scenes", () => {
				const index = new Index();
				index.setSubroutineLocalVariables(documentUri, new Map());

				const result = index.hasUri(documentUri);

				expect(result).to.be.true;
			});

			it("should include variable reference URIs in indexed scenes", () => {
				const index = new Index();
				index.setVariableReferences(documentUri, new Map());

				const result = index.hasUri(documentUri);

				expect(result).to.be.true;
			});

			it("should include label URIs in indexed scenes", () => {
				const index = new Index();
				index.setLabels(documentUri, new Map());

				const result = index.hasUri(documentUri);

				expect(result).to.be.true;
			});

			it("should include achievement reference URIs in indexed scenes", () => {
				const index = new Index();
				index.setAchievementReferences(documentUri, new Map());

				const result = index.hasUri(documentUri);

				expect(result).to.be.true;
			});

			it("should include document scope URIs in indexed scenes", () => {
				const index = new Index();
				index.setDocumentScopes(documentUri, { achievementVarScopes: [], choiceScopes: [], paramScopes: []});

				const result = index.hasUri(documentUri);

				expect(result).to.be.true;
			});

			it("should include flow control event URIs in indexed scenes", () => {
				const index = new Index();
				index.setFlowControlEvents(documentUri, []);

				const result = index.hasUri(documentUri);

				expect(result).to.be.true;
			});

			it("should include parse error URIs in indexed scenes", () => {
				const index = new Index();
				index.setParseErrors(documentUri, []);

				const result = index.hasUri(documentUri);

				expect(result).to.be.true;
			});
		});
	});
});
