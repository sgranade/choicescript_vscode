/* eslint-disable */

import { expect } from 'chai';
import 'mocha';
import { Substitute, SubstituteOf, Arg } from '@fluffy-spoon/substitute';
import { Position, Location, Range, ReferenceContext } from 'vscode-languageserver/node';

import {
	ProjectIndex,
	Index,
	IdentifierIndex,
	IdentifierMultiIndex,
	FlowControlEvent,
	DocumentScopes,
	LabelIndex,
	AchievementIndex
} from '../../../server/src/common/index';
import {
	SymbolType,
	findDefinitions,
	findReferences,
	generateRenames
} from '../../../server/src/common/searches';
import {
	CaseInsensitiveMap
} from '../../../server/src/common/utilities';

const documentUri: string = "file:///c:/faker.txt";
const otherSceneUri: string = "file:///c:/other-scene.txt";
const globalUri: string = "file:///c:/startup.txt";

interface IndexArgs {
	globalVariables?: IdentifierIndex;
	localVariables?: CaseInsensitiveMap<string, IdentifierMultiIndex>;
	subroutineVariables?: IdentifierIndex;
	variableReferences?: CaseInsensitiveMap<string, IdentifierMultiIndex>;
	startupUri?: string;
	labels?: CaseInsensitiveMap<string, LabelIndex>;
	sceneList?: string[];
	sceneFileUri?: string;
	achievements?: CaseInsensitiveMap<string, [Location, number, string]>;
	achievementReferences?: CaseInsensitiveMap<string, IdentifierMultiIndex>;
	flowControlEvents?: FlowControlEvent[];
	flowControlEventsUri?: string;
	scopes?: DocumentScopes;
}

function createMockIndex({
	globalVariables, localVariables, subroutineVariables, startupUri, labels,
	sceneList, sceneFileUri, achievements, achievementReferences,
	variableReferences, flowControlEvents, flowControlEventsUri, scopes }: IndexArgs): SubstituteOf<ProjectIndex> {
	if (globalVariables === undefined) {
		globalVariables = new CaseInsensitiveMap();
	}
	if (localVariables === undefined) {
		localVariables = new CaseInsensitiveMap();
	}
	if (subroutineVariables === undefined) {
		subroutineVariables = new CaseInsensitiveMap();
	}
	if (startupUri === undefined) {
		startupUri = globalUri;
	}
	if (labels === undefined) {
		labels = new CaseInsensitiveMap();
	}
	if (sceneList === undefined) {
		sceneList = [];
	}
	if (sceneFileUri === undefined) {
		sceneFileUri = otherSceneUri;
	}
	if (achievements === undefined) {
		achievements = new CaseInsensitiveMap();
	}
	if (achievementReferences === undefined) {
		achievementReferences = new CaseInsensitiveMap();
	}
	if (variableReferences === undefined) {
		variableReferences = new CaseInsensitiveMap();
	}
	if (flowControlEvents === undefined) {
		flowControlEvents = [];
	}
	if (scopes === undefined) {
		scopes = {
			achievementVarScopes: [],
			choiceScopes: [],
			paramScopes: [],
		};
	}

	let fakeIndex = Substitute.for<ProjectIndex>();
	fakeIndex.getGlobalVariables().returns(globalVariables);
	fakeIndex.getLocalVariables(Arg.any()).mimicks((scene) => {
		let vars = localVariables?.get(scene);
		if (vars === undefined) {
			vars = new CaseInsensitiveMap();
		}
		return vars;
	});
	fakeIndex.getSubroutineLocalVariables(Arg.any()).returns(subroutineVariables);
	fakeIndex.isStartupFileUri(Arg.any()).mimicks(uri => {
		return uri == startupUri;
	});
	fakeIndex.getSceneUri(Arg.any()).mimicks(scene => {
		return `file:///c:/${scene}.txt`;
	});
	fakeIndex.getSceneList().returns(sceneList);
	fakeIndex.getLabels(Arg.any()).mimicks((uri: string) => {
		let l = labels?.get(uri);
		if (l !== undefined) {
			return l;
		}
		return new Map();
	});
	fakeIndex.getAchievements().returns(achievements);
	fakeIndex.getDocumentAchievementReferences(Arg.any()).mimicks(scene => {
		let index = achievementReferences?.get(scene);
		if (index === undefined) {
			index = new CaseInsensitiveMap();
		}
		return index;
	});
	fakeIndex.getAchievementReferences(Arg.any()).mimicks(achievement => {
		let locations: Location[] = [];
		for (let index of achievementReferences?.values() ?? []) {
			let partialLocations = index.get(achievement);
			if (partialLocations !== undefined)
				locations.push(...partialLocations);
		}
		return locations;
	});
	fakeIndex.getDocumentVariableReferences(Arg.all()).mimicks(scene => {
		let references = variableReferences?.get(scene);
		if (references === undefined) {
			references = new CaseInsensitiveMap();
		}
		return references;
	});
	fakeIndex.getDocumentScopes(Arg.all()).returns(scopes);
	fakeIndex.getVariableReferences(Arg.all()).mimicks((variable: string) => {
		let locations: Location[] = [];
		for (let index of variableReferences?.values() ?? []) {
			let partialLocations = index.get(variable);
			if (partialLocations !== undefined)
				locations.push(...partialLocations);
		}
		return locations;
	});
	if (flowControlEventsUri === undefined) {
		fakeIndex.getFlowControlEvents(Arg.all()).returns(flowControlEvents);
	}
	else {
		fakeIndex.getFlowControlEvents(flowControlEventsUri).returns(flowControlEvents);
	}

	return fakeIndex;
}

describe("Definitions", () => {
	describe("Variable Definitions", () => {
		it("should not give definitions for non-references", () => {
			let createLocation = Location.create(documentUri, Range.create(1, 0, 1, 5));
			let localVariablesIndex: CaseInsensitiveMap<string, Location[]> = new CaseInsensitiveMap([["local_var", [createLocation]]]);
			let localVariables = new CaseInsensitiveMap([[documentUri, localVariablesIndex]]);
			let position = Position.create(0, 16);
			let fakeIndex = createMockIndex({ localVariables: localVariables });

			let definition = findDefinitions(documentUri, position, fakeIndex);

			expect(definition).to.be.undefined;
		});

		it("should locate a definition from a local variable reference", () => {
			let createLocation = Location.create(documentUri, Range.create(1, 0, 1, 5));
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let localVariablesIndex: CaseInsensitiveMap<string, Location[]> = new CaseInsensitiveMap([["local_var", [createLocation]]]);
			let localVariables = new CaseInsensitiveMap([[documentUri, localVariablesIndex]]);
			let localVariableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["local_var", [referenceLocation]]]);
			let variableReferences = new CaseInsensitiveMap([[documentUri, localVariableReferences]]);
			let position = Position.create(2, 2);
			let fakeIndex = createMockIndex({ localVariables: localVariables, variableReferences: variableReferences });

			let definition = (findDefinitions(documentUri, position, fakeIndex) ?? [])[0];

			expect(definition.type).to.equal(SymbolType.LocalVariable);
			expect(definition.location.range.start).to.eql({ line: 1, character: 0 });
			expect(definition.location.range.end).to.eql({ line: 1, character: 5 });
		});

		it("should locate all definition from a local variable reference", () => {
			let createLocation = Location.create(documentUri, Range.create(1, 0, 1, 5));
			let otherCreateLocation = Location.create(documentUri, Range.create(3, 0, 3, 5));
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let localVariablesIndex: CaseInsensitiveMap<string, Location[]> = new CaseInsensitiveMap([["local_var", [createLocation, otherCreateLocation]]]);
			let localVariables = new CaseInsensitiveMap([[documentUri, localVariablesIndex]]);
			let localVariableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["local_var", [referenceLocation]]]);
			let variableReferences = new CaseInsensitiveMap([[documentUri, localVariableReferences]]);
			let position = Position.create(2, 2);
			let fakeIndex = createMockIndex({ localVariables: localVariables, variableReferences: variableReferences });

			let definitions = findDefinitions(documentUri, position, fakeIndex) ?? [];

			expect(definitions.length).to.equal(2);
			expect(definitions[0].type).to.equal(SymbolType.LocalVariable);
			expect(definitions[0].location.range.start).to.eql({ line: 1, character: 0 });
			expect(definitions[0].location.range.end).to.eql({ line: 1, character: 5 });
			expect(definitions[1].type).to.equal(SymbolType.LocalVariable);
			expect(definitions[1].location.range.start).to.eql({ line: 3, character: 0 });
			expect(definitions[1].location.range.end).to.eql({ line: 3, character: 5 });
		});

		it("should locate a definition from a local variable definition", () => {
			let createLocation = Location.create(documentUri, Range.create(1, 0, 1, 5));
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let localVariablesIndex: CaseInsensitiveMap<string, Location[]> = new CaseInsensitiveMap([["local_var", [createLocation]]]);
			let localVariables = new CaseInsensitiveMap([[documentUri, localVariablesIndex]]);
			let localVariableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["local_var", [referenceLocation]]]);
			let variableReferences = new CaseInsensitiveMap([[documentUri, localVariableReferences]]);
			let position = Position.create(1, 2);
			let fakeIndex = createMockIndex({ localVariables: localVariables, variableReferences: variableReferences });

			let definition = (findDefinitions(documentUri, position, fakeIndex) ?? [])[0];

			expect(definition.type).to.equal(SymbolType.LocalVariable);
			expect(definition.location.range.start).to.eql({ line: 1, character: 0 });
			expect(definition.location.range.end).to.eql({ line: 1, character: 5 });
		});

		it("should return local variable symbol names", () => {
			let createLocation = Location.create(documentUri, Range.create(1, 0, 1, 5));
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let localVariablesIndex: CaseInsensitiveMap<string, Location[]> = new CaseInsensitiveMap([["local_var", [createLocation]]]);
			let localVariables = new CaseInsensitiveMap([[documentUri, localVariablesIndex]]);
			let localVariableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["local_var", [referenceLocation]]]);
			let variableReferences = new CaseInsensitiveMap([[documentUri, localVariableReferences]]);
			let position = Position.create(2, 2);
			let fakeIndex = createMockIndex({ localVariables: localVariables, variableReferences: variableReferences });

			let definition = (findDefinitions(documentUri, position, fakeIndex) ?? [])[0];

			expect(definition.symbol).to.equal("local_var");
		});

		it("should mark a definition from a local variable reference as being a reference", () => {
			let createLocation = Location.create(documentUri, Range.create(1, 0, 1, 5));
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let localVariablesIndex: CaseInsensitiveMap<string, Location[]> = new CaseInsensitiveMap([["local_var", [createLocation]]]);
			let localVariables = new CaseInsensitiveMap([[documentUri, localVariablesIndex]]);
			let localVariableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["local_var", [referenceLocation]]]);
			let variableReferences = new CaseInsensitiveMap([[documentUri, localVariableReferences]]);
			let position = Position.create(2, 2);
			let fakeIndex = createMockIndex({ localVariables: localVariables, variableReferences: variableReferences });

			let definition = (findDefinitions(documentUri, position, fakeIndex) ?? [])[0];

			expect(definition.isDefinition).to.be.true;
		});

		it("should locate a definition from a global variable reference", () => {
			let createLocation = Location.create(globalUri, Range.create(1, 0, 1, 5));
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let globalVariables: CaseInsensitiveMap<string, Location> = new CaseInsensitiveMap([["global_var", createLocation]]);
			let localVariableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["global_var", [referenceLocation]]]);
			let variableReferences = new CaseInsensitiveMap([[documentUri, localVariableReferences]]);
			let position = Position.create(2, 2);
			let fakeIndex = createMockIndex({ globalVariables: globalVariables, variableReferences: variableReferences });

			let definition = (findDefinitions(documentUri, position, fakeIndex) ?? [])[0];

			expect(definition.type).to.equal(SymbolType.GlobalVariable);
			expect(definition.location.range.start).to.eql({ line: 1, character: 0 });
			expect(definition.location.range.end).to.eql({ line: 1, character: 5 });
		});

		it("should locate a definition from a global variable definition", () => {
			let createLocation = Location.create(globalUri, Range.create(1, 0, 1, 5));
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let globalVariables: CaseInsensitiveMap<string, Location> = new CaseInsensitiveMap([["global_var", createLocation]]);
			let localVariableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["global_var", [referenceLocation]]]);
			let variableReferences = new CaseInsensitiveMap([[documentUri, localVariableReferences]]);
			let position = Position.create(1, 2);
			let fakeIndex = createMockIndex({ globalVariables: globalVariables, variableReferences: variableReferences });

			let definition = (findDefinitions(globalUri, position, fakeIndex) ?? [])[0];

			expect(definition.type).to.equal(SymbolType.GlobalVariable);
			expect(definition.location.range.start).to.eql({ line: 1, character: 0 });
			expect(definition.location.range.end).to.eql({ line: 1, character: 5 });
		});

		it("should return global variable names", () => {
			let createLocation = Location.create(documentUri, Range.create(1, 0, 1, 5));
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let globalVariables: CaseInsensitiveMap<string, Location> = new CaseInsensitiveMap([["global_var", createLocation]]);
			let localVariableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["global_var", [referenceLocation]]]);
			let variableReferences = new CaseInsensitiveMap([[documentUri, localVariableReferences]]);
			let position = Position.create(2, 2);
			let fakeIndex = createMockIndex({ globalVariables: globalVariables, variableReferences: variableReferences });

			let definition = (findDefinitions(documentUri, position, fakeIndex) ?? [])[0];

			expect(definition.symbol).to.equal("global_var");
		});

		it("should mark global variable definitions as a definition", () => {
			let createLocation = Location.create(documentUri, Range.create(1, 0, 1, 5));
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let globalVariables: CaseInsensitiveMap<string, Location> = new CaseInsensitiveMap([["global_var", createLocation]]);
			let localVariableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["global_var", [referenceLocation]]]);
			let variableReferences = new CaseInsensitiveMap([[documentUri, localVariableReferences]]);
			let position = Position.create(2, 2);
			let fakeIndex = createMockIndex({ globalVariables: globalVariables, variableReferences: variableReferences });

			let definition = (findDefinitions(documentUri, position, fakeIndex) ?? [])[0];

			expect(definition.isDefinition).to.be.true;
		});

		it("should locate a local variable definition from a local variable reference when a global variable has the same name", () => {
			let localCreateLocation = Location.create(documentUri, Range.create(1, 0, 1, 5));
			let localReferenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let globalCreateLocation = Location.create(globalUri, Range.create(3, 0, 3, 5));
			let globalVariables: CaseInsensitiveMap<string, Location> = new CaseInsensitiveMap([["shared_var_name", globalCreateLocation]]);
			let localVariablesIndex = new CaseInsensitiveMap([["shared_var_name", [localCreateLocation]]]);
			let localVariables = new CaseInsensitiveMap([[documentUri, localVariablesIndex]]);
			let localVariableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["shared_var_name", [localReferenceLocation]]]);
			let variableReferences = new CaseInsensitiveMap([[documentUri, localVariableReferences]]);
			let position = Position.create(2, 2);
			let fakeIndex = createMockIndex({
				localVariables: localVariables, globalVariables: globalVariables, variableReferences: variableReferences
			});

			let definition = (findDefinitions(documentUri, position, fakeIndex) ?? [])[0];

			expect(definition.type).to.equal(SymbolType.LocalVariable);
			expect(definition.location.range.start).to.eql({ line: 1, character: 0 });
			expect(definition.location.range.end).to.eql({ line: 1, character: 5 });
		});

		it("should locate a definition from an achievement variable reference", () => {
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let achievementLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let localVariableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["choice_achieved_codename", [referenceLocation]]]);
			let variableReferences = new CaseInsensitiveMap([[documentUri, localVariableReferences]]);
			let achievementIndex: CaseInsensitiveMap<string, [Location, number, string]> = new CaseInsensitiveMap([["codename", [achievementLocation, 0, ""]]]);
			let position = Position.create(2, 2);
			let fakeIndex = createMockIndex({ variableReferences: variableReferences, achievements: achievementIndex });

			let definition = (findDefinitions(documentUri, position, fakeIndex) ?? [])[0];

			expect(definition.type).to.equal(SymbolType.Achievement);
			expect(definition.location.range.start).to.eql({ line: 5, character: 0 });
			expect(definition.location.range.end).to.eql({ line: 5, character: 5 });
		});
	});

	describe("Achievement Definitions", () => {
		it("should locate an achievement from its definition", () => {
			let achievementLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let achievementIndex: CaseInsensitiveMap<string, [Location, number, string]> = new CaseInsensitiveMap([["codename", [achievementLocation, 0, ""]]]);
			let position = Position.create(5, 2);
			let fakeIndex = createMockIndex({ achievements: achievementIndex });

			let definition = (findDefinitions(documentUri, position, fakeIndex) ?? [])[0];

			expect(definition.symbol).to.equal("codename");
			expect(definition.location.range.start).to.eql({ line: 5, character: 0 });
			expect(definition.location.range.end).to.eql({ line: 5, character: 5 });
			expect(definition.isDefinition).to.be.true;
		});

		it("should locate an achievement from its reference", () => {
			let achievementLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let achievementIndex: CaseInsensitiveMap<string, [Location, number, string]> = new CaseInsensitiveMap([["codename", [achievementLocation, 0, ""]]]);
			let referenceLocations = [Location.create(documentUri, Range.create(7, 0, 7, 5))];
			let referencesIndex: IdentifierMultiIndex = new CaseInsensitiveMap([["codename", referenceLocations]]);
			let references = new CaseInsensitiveMap([[documentUri, referencesIndex]]);
			let position = Position.create(7, 2);
			let fakeIndex = createMockIndex({ achievements: achievementIndex, achievementReferences: references });

			let definition = (findDefinitions(documentUri, position, fakeIndex) ?? [])[0];

			expect(definition.symbol).to.equal("codename");
			expect(definition.location.range.start).to.eql({ line: 5, character: 0 });
			expect(definition.location.range.end).to.eql({ line: 5, character: 5 });
			expect(definition.isDefinition).to.be.true;
		});

		it("should locate an achievement from its reference in another scene", () => {
			let achievementLocation = Location.create(otherSceneUri, Range.create(5, 0, 5, 5));
			let achievementIndex: CaseInsensitiveMap<string, [Location, number, string]> = new CaseInsensitiveMap([["codename", [achievementLocation, 0, ""]]]);
			let referenceLocations = [Location.create(documentUri, Range.create(7, 0, 7, 5))];
			let referencesIndex: IdentifierMultiIndex = new CaseInsensitiveMap([["codename", referenceLocations]]);
			let references = new CaseInsensitiveMap([[documentUri, referencesIndex]]);
			let position = Position.create(7, 2);
			let fakeIndex = createMockIndex({ achievements: achievementIndex, achievementReferences: references });

			let definition = (findDefinitions(documentUri, position, fakeIndex) ?? [])[0];

			expect(definition.symbol).to.equal("codename");
			expect(definition.location.uri).to.equal(otherSceneUri);
			expect(definition.location.range.start).to.eql({ line: 5, character: 0 });
			expect(definition.location.range.end).to.eql({ line: 5, character: 5 });
			expect(definition.isDefinition).to.be.true;
		});

		it("should locate an achievement from its variable reference", () => {
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let achievementLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let localVariableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["choice_achieved_codename", [referenceLocation]]]);
			let variableReferences = new CaseInsensitiveMap([[documentUri, localVariableReferences]]);
			let achievementIndex: CaseInsensitiveMap<string, [Location, number, string]> = new CaseInsensitiveMap([["codename", [achievementLocation, 0, ""]]]);
			let position = Position.create(2, 2);
			let fakeIndex = createMockIndex({ variableReferences: variableReferences, achievements: achievementIndex });

			let definition = (findDefinitions(documentUri, position, fakeIndex) ?? [])[0];

			expect(definition.symbol).to.equal("codename");
			expect(definition.location.range.start).to.eql({ line: 5, character: 0 });
			expect(definition.location.range.end).to.eql({ line: 5, character: 5 });
			expect(definition.isDefinition).to.be.true;
		});
	});

	describe("Label Definitions", () => {
		it("should locate local labels", () => {
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "goto",
				commandLocation: Substitute.for<Location>(),
				label: "local_label",
				labelLocation: referenceLocation,
				scene: ""
			}];
			let labelLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let labelsIndex: LabelIndex = new CaseInsensitiveMap([["local_label", { label: "local_label", location: labelLocation }]]);
			let labels = new CaseInsensitiveMap([[documentUri, labelsIndex]]);
			let position = Position.create(2, 2);
			let fakeIndex = createMockIndex({ labels: labels, flowControlEvents: events });

			let definition = (findDefinitions(documentUri, position, fakeIndex) ?? [])[0];

			expect(definition.type).to.equal(SymbolType.Label);
			expect(definition.location.range.start).to.eql({ line: 5, character: 0 });
			expect(definition.location.range.end).to.eql({ line: 5, character: 5 });
		});

		it("should locate local labels on a label definition", () => {
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "goto",
				commandLocation: Substitute.for<Location>(),
				label: "local_label",
				labelLocation: referenceLocation,
				scene: ""
			}];
			let labelLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let labelsIndex: LabelIndex = new CaseInsensitiveMap([["local_label", { label: "local_label", location: labelLocation }]]);
			let labels = new CaseInsensitiveMap([[documentUri, labelsIndex]]);
			let position = Position.create(5, 2);
			let fakeIndex = createMockIndex({ labels: labels, flowControlEvents: events });

			let definition = (findDefinitions(documentUri, position, fakeIndex) ?? [])[0];

			expect(definition.type).to.equal(SymbolType.Label);
			expect(definition.location.range.start).to.eql({ line: 5, character: 0 });
			expect(definition.location.range.end).to.eql({ line: 5, character: 5 });
		});

		it("should return local label names", () => {
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "goto",
				commandLocation: Substitute.for<Location>(),
				label: "local_label",
				labelLocation: referenceLocation,
				scene: ""
			}];
			let labelLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let labelsIndex: LabelIndex = new CaseInsensitiveMap([["local_label", { label: "local_label", location: labelLocation }]]);
			let labels = new CaseInsensitiveMap([[documentUri, labelsIndex]]);
			let position = Position.create(2, 2);
			let fakeIndex = createMockIndex({ labels: labels, flowControlEvents: events });

			let definition = (findDefinitions(documentUri, position, fakeIndex) ?? [])[0];

			expect(definition.symbol).to.equal("local_label");
		});

		it("should mark local label definitions as a definition", () => {
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "goto",
				commandLocation: Substitute.for<Location>(),
				label: "local_label",
				labelLocation: referenceLocation,
				scene: ""
			}];
			let labelLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let labelsIndex: LabelIndex = new CaseInsensitiveMap([["local_label", { label: "local_label", location: labelLocation }]]);
			let labels = new CaseInsensitiveMap([[documentUri, labelsIndex]]);
			let position = Position.create(2, 2);
			let fakeIndex = createMockIndex({ labels: labels, flowControlEvents: events });

			let definition = (findDefinitions(documentUri, position, fakeIndex) ?? [])[0];

			expect(definition.isDefinition).to.be.true;
		});

		it("should locate labels in other scenes", () => {
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "goto_scene",
				commandLocation: Substitute.for<Location>(),
				label: "other_label",
				labelLocation: referenceLocation,
				scene: "other-scene"
			}];
			let labelLocation = Location.create(otherSceneUri, Range.create(5, 0, 5, 5));
			let labelsIndex: LabelIndex = new CaseInsensitiveMap([["other_label", { label: "other_label", location: labelLocation }]]);
			let labels = new CaseInsensitiveMap([[otherSceneUri, labelsIndex]]);
			let position = Position.create(2, 2);
			let fakeIndex = createMockIndex({ labels: labels, sceneFileUri: otherSceneUri, flowControlEvents: events });

			let definition = (findDefinitions(documentUri, position, fakeIndex) ?? [])[0];

			expect(definition.type).to.equal(SymbolType.Label);
			expect(definition.location.uri).to.equal(otherSceneUri);
			expect(definition.location.range.start).to.eql({ line: 5, character: 0 });
			expect(definition.location.range.end).to.eql({ line: 5, character: 5 });
		});

		it("should return a label definition from other scenes", () => {
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "goto_scene",
				commandLocation: Substitute.for<Location>(),
				label: "other_label",
				labelLocation: referenceLocation,
				scene: "other-scene"
			}];
			let labelLocation = Location.create(otherSceneUri, Range.create(5, 0, 5, 5));
			let labelsIndex: LabelIndex = new CaseInsensitiveMap([["other_label", { label: "other_label", location: labelLocation }]]);
			let labels = new CaseInsensitiveMap([[otherSceneUri, labelsIndex]]);
			let position = Position.create(2, 2);
			let fakeIndex = createMockIndex({ labels: labels, sceneFileUri: otherSceneUri, flowControlEvents: events });

			let definition = (findDefinitions(documentUri, position, fakeIndex) ?? [])[0];

			expect(definition.symbol).to.equal("other_label");
		});

		it("should mark label definitions from other scenes as a definition", () => {
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "goto_scene",
				commandLocation: Substitute.for<Location>(),
				label: "other_label",
				labelLocation: referenceLocation,
				scene: "other-scene"
			}];
			let labelLocation = Location.create(otherSceneUri, Range.create(5, 0, 5, 5));
			let labelsIndex: LabelIndex = new CaseInsensitiveMap([["other_label", { label: "other_label", location: labelLocation }]]);
			let labels = new CaseInsensitiveMap([[otherSceneUri, labelsIndex]]);
			let position = Position.create(2, 2);
			let fakeIndex = createMockIndex({ labels: labels, sceneFileUri: otherSceneUri, flowControlEvents: events });

			let definition = (findDefinitions(documentUri, position, fakeIndex) ?? [])[0];

			expect(definition.isDefinition).to.be.true;
		});
	});
});

describe("Symbol References", () => {
	describe("Variable References", () => {
		it("should give all local variable references", () => {
			let createLocation = Location.create(documentUri, Range.create(1, 0, 1, 5));
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let localVariablesIndex = new CaseInsensitiveMap([["local_var", [createLocation]]]);
			let localVariables = new CaseInsensitiveMap([[documentUri, localVariablesIndex]]);
			let localVariableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["local_var", [referenceLocation]]]);
			let variableReferences = new CaseInsensitiveMap([[documentUri, localVariableReferences]]);
			let position = Position.create(2, 1);
			let fakeContext = Substitute.for<ReferenceContext>();
			fakeContext.includeDeclaration.returns!(false);
			let fakeIndex = createMockIndex({ localVariables: localVariables, variableReferences: variableReferences });

			let references = findReferences(documentUri, position, fakeContext, fakeIndex) ?? [];

			expect(references.length).to.equal(1);
			expect(references[0].location.range.start).to.eql({ line: 2, character: 0 });
			expect(references[0].location.range.end).to.eql({ line: 2, character: 5 });
		});

		it("should include the local variable definition location at the end of the array if requested", () => {
			let createLocation = Location.create(documentUri, Range.create(1, 0, 1, 5));
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let localVariablesIndex = new CaseInsensitiveMap([["local_var", [createLocation]]]);
			let localVariables = new CaseInsensitiveMap([[documentUri, localVariablesIndex]]);
			let localVariableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["local_var", [referenceLocation]]]);
			let variableReferences = new CaseInsensitiveMap([[documentUri, localVariableReferences]]);
			let position = Position.create(2, 1);
			let fakeContext = Substitute.for<ReferenceContext>();
			fakeContext.includeDeclaration.returns!(true);
			let fakeIndex = createMockIndex({ localVariables: localVariables, variableReferences: variableReferences });

			let references = findReferences(documentUri, position, fakeContext, fakeIndex) ?? [];

			expect(references.length).to.equal(2);
			expect(references[1].isDefinition).to.be.true;
			expect(references[1].location.range.start).to.eql({ line: 1, character: 0 });
			expect(references[1].location.range.end).to.eql({ line: 1, character: 5 });
		});

		it("should include all local variable definition locations at the end of the array if requested", () => {
			let createLocation = Location.create(documentUri, Range.create(1, 0, 1, 5));
			let otherCreateLocation = Location.create(documentUri, Range.create(3, 0, 3, 5));
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let localVariablesIndex = new CaseInsensitiveMap([["local_var", [createLocation, otherCreateLocation]]]);
			let localVariables = new CaseInsensitiveMap([[documentUri, localVariablesIndex]]);
			let localVariableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["local_var", [referenceLocation]]]);
			let variableReferences = new CaseInsensitiveMap([[documentUri, localVariableReferences]]);
			let position = Position.create(2, 1);
			let fakeContext = Substitute.for<ReferenceContext>();
			fakeContext.includeDeclaration.returns!(true);
			let fakeIndex = createMockIndex({ localVariables: localVariables, variableReferences: variableReferences });

			let references = findReferences(documentUri, position, fakeContext, fakeIndex) ?? [];

			expect(references.length).to.equal(3);
			expect(references[1].isDefinition).to.be.true;
			expect(references[1].location.range.start).to.eql({ line: 1, character: 0 });
			expect(references[1].location.range.end).to.eql({ line: 1, character: 5 });
			expect(references[2].isDefinition).to.be.true;
			expect(references[2].location.range.start).to.eql({ line: 3, character: 0 });
			expect(references[2].location.range.end).to.eql({ line: 3, character: 5 });
		});

		it("should give all variable references for global variables on a reference", () => {
			let createLocation = Location.create(globalUri, Range.create(1, 0, 1, 5));
			let localReferenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let globalReferenceLocation = Location.create(globalUri, Range.create(3, 0, 3, 5));
			let globalVariablesIndex: CaseInsensitiveMap<string, Location> = new CaseInsensitiveMap([["global_var", createLocation]]);
			let localVariableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["global_var", [localReferenceLocation]]]);
			let globalVariableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["global_var", [globalReferenceLocation]]]);
			let variableReferences = new CaseInsensitiveMap([[documentUri, localVariableReferences], [globalUri, globalVariableReferences]]);
			let position = Position.create(2, 1);
			let fakeContext = Substitute.for<ReferenceContext>();
			fakeContext.includeDeclaration.returns!(false);
			let fakeIndex = createMockIndex({ globalVariables: globalVariablesIndex, variableReferences: variableReferences });

			let references = findReferences(documentUri, position, fakeContext, fakeIndex) ?? [];

			expect(references.length).to.equal(2);
			expect(references[0].location.uri).to.equal(documentUri);
			expect(references[0].location.range.start).to.eql({ line: 2, character: 0 });
			expect(references[0].location.range.end).to.eql({ line: 2, character: 5 });
			expect(references[1].location.uri).to.equal(globalUri);
			expect(references[1].location.range.start).to.eql({ line: 3, character: 0 });
			expect(references[1].location.range.end).to.eql({ line: 3, character: 5 });
		});

		it("should give all variable references for a global variable on its creation", () => {
			let createLocation = Location.create(globalUri, Range.create(1, 0, 1, 5));
			let localReferenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let globalReferenceLocation = Location.create(globalUri, Range.create(3, 0, 3, 5));
			let globalVariablesIndex: CaseInsensitiveMap<string, Location> = new CaseInsensitiveMap([["global_var", createLocation]]);
			let localVariableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["global_var", [localReferenceLocation]]]);
			let globalVariableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["global_var", [globalReferenceLocation]]]);
			let variableReferences = new CaseInsensitiveMap([[documentUri, localVariableReferences], [globalUri, globalVariableReferences]]);
			let position = Position.create(1, 1);
			let fakeContext = Substitute.for<ReferenceContext>();
			fakeContext.includeDeclaration.returns!(false);
			let fakeIndex = createMockIndex({ globalVariables: globalVariablesIndex, variableReferences: variableReferences });

			let references = findReferences(globalUri, position, fakeContext, fakeIndex) ?? [];

			expect(references.length).to.equal(2);
			expect(references[0].location.uri).to.equal(documentUri);
			expect(references[0].location.range.start).to.eql({ line: 2, character: 0 });
			expect(references[0].location.range.end).to.eql({ line: 2, character: 5 });
			expect(references[1].location.uri).to.equal(globalUri);
			expect(references[1].location.range.start).to.eql({ line: 3, character: 0 });
			expect(references[1].location.range.end).to.eql({ line: 3, character: 5 });
		});

		it("should only give local variable references when a local and global variable share the same name", () => {
			let globalCreateLocation = Location.create(globalUri, Range.create(1, 0, 1, 5));
			let localCreateLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let localReferenceLocation = Location.create(documentUri, Range.create(3, 0, 3, 5));
			let globalReferenceLocation = Location.create(globalUri, Range.create(4, 0, 4, 5));
			let globalVariablesIndex: CaseInsensitiveMap<string, Location> = new CaseInsensitiveMap([["shared_var_name", globalCreateLocation]]);
			let localVariablesIndex = new CaseInsensitiveMap([["shared_var_name", [localCreateLocation]]]);
			let localVariables = new CaseInsensitiveMap([[documentUri, localVariablesIndex]]);
			let localVariableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["shared_var_name", [localReferenceLocation]]]);
			let globalVariableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["shared_var_name", [globalReferenceLocation]]]);
			let variableReferences = new CaseInsensitiveMap([[documentUri, localVariableReferences], [globalUri, globalVariableReferences]]);
			let position = Position.create(2, 1);
			let fakeContext = Substitute.for<ReferenceContext>();
			fakeContext.includeDeclaration.returns!(false);
			let fakeIndex = createMockIndex({
				localVariables: localVariables, globalVariables: globalVariablesIndex, variableReferences: variableReferences
			});

			let references = findReferences(documentUri, position, fakeContext, fakeIndex) ?? [];

			expect(references.length).to.equal(1);
			expect(references[0].location.range.start).to.eql({ line: 3, character: 0 });
			expect(references[0].location.range.end).to.eql({ line: 3, character: 5 });
		});

		it("should include the global variable definition location at the end of the array if requested", () => {
			let createLocation = Location.create(documentUri, Range.create(1, 0, 1, 5));
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let globalVariables: CaseInsensitiveMap<string, Location> = new CaseInsensitiveMap([["global_var", createLocation]]);
			let localVariableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["global_var", [referenceLocation]]]);
			let variableReferences = new CaseInsensitiveMap([[documentUri, localVariableReferences]]);
			let position = Position.create(2, 1);
			let fakeContext = Substitute.for<ReferenceContext>();
			fakeContext.includeDeclaration.returns!(true);
			let fakeIndex = createMockIndex({ globalVariables: globalVariables, variableReferences: variableReferences });

			let references = findReferences(documentUri, position, fakeContext, fakeIndex) ?? [];

			expect(references.length).to.equal(2);
			expect(references[1].isDefinition).to.be.true;
			expect(references[1].location.range.start).to.eql({ line: 1, character: 0 });
			expect(references[1].location.range.end).to.eql({ line: 1, character: 5 });
		});
	});

	describe("Label References", () => {
		it("should give all matching label references on a label definition", () => {
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "goto",
				commandLocation: Substitute.for<Location>(),
				label: "local_label",
				labelLocation: referenceLocation,
				scene: ""
			}];
			let labelLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let documentLabelsIndex: LabelIndex = new CaseInsensitiveMap([["local_label", { label: "local_label", location: labelLocation }]]);
			// The logic for finding label references is complex enough that I'll use an actual Index
			let index = new Index();
			index.setFlowControlEvents(documentUri, events);
			index.setLabels(documentUri, documentLabelsIndex);
			let position = Position.create(5, 1);
			let fakeContext = Substitute.for<ReferenceContext>();
			fakeContext.includeDeclaration.returns!(false);

			let references = findReferences(documentUri, position, fakeContext, index) ?? [];

			expect(references.length).to.equal(1);
			expect(references[0].location.range.start).to.eql({ line: 2, character: 0 });
			expect(references[0].location.range.end).to.eql({ line: 2, character: 5 });
		});

		it("should give all matching label references on a label reference", () => {
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "goto",
				commandLocation: Substitute.for<Location>(),
				label: "local_label",
				labelLocation: referenceLocation,
				scene: ""
			}];
			let definitionLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let documentLabelsIndex: LabelIndex = new CaseInsensitiveMap([["local_label", { label: "local_label", location: definitionLocation }]]);
			// The logic for finding label references is complex enough that I'll use an actual Index
			let index = new Index();
			index.setFlowControlEvents(documentUri, events);
			index.setLabels(documentUri, documentLabelsIndex);
			let position = Position.create(2, 1);
			let fakeContext = Substitute.for<ReferenceContext>();
			fakeContext.includeDeclaration.returns!(false);

			let references = findReferences(documentUri, position, fakeContext, index) ?? [];

			expect(references.length).to.equal(1);
			expect(references[0].location.range.start).to.eql({ line: 2, character: 0 });
			expect(references[0].location.range.end).to.eql({ line: 2, character: 5 });
		});

		it("should give all matching label references on a label definition with creation location at the end of the array when requested", () => {
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "goto",
				commandLocation: Substitute.for<Location>(),
				label: "local_label",
				labelLocation: referenceLocation,
				scene: ""
			}];
			let labelLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let documentLabelsIndex: LabelIndex = new CaseInsensitiveMap([["local_label", { label: "local_label", location: labelLocation }]]);
			// The logic for finding label references is complex enough that I'll use an actual Index
			let index = new Index();
			index.setFlowControlEvents(documentUri, events);
			index.setLabels(documentUri, documentLabelsIndex);
			let position = Position.create(5, 1);
			let fakeContext = Substitute.for<ReferenceContext>();
			fakeContext.includeDeclaration.returns!(true);

			let references = findReferences(documentUri, position, fakeContext, index) ?? [];

			expect(references.length).to.equal(2);
			expect(references[1].isDefinition).to.be.true;
			expect(references[1].location.range.start).to.eql({ line: 5, character: 0 });
			expect(references[1].location.range.end).to.eql({ line: 5, character: 5 });
		});

		it("should ignore labels with the same name in a different scene", () => {
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "goto",
				commandLocation: Substitute.for<Location>(),
				label: "local_label",
				labelLocation: referenceLocation,
				scene: ""
			}];
			let labelLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let documentLabelsIndex: LabelIndex = new CaseInsensitiveMap([["local_label", { label: "local_label", location: labelLocation }]]);
			let otherSceneLabelLocation = Location.create(otherSceneUri, Range.create(7, 0, 7, 7));
			let otherSceneLabelsIndex: LabelIndex = new CaseInsensitiveMap([["local_label", { label: "local_label", location: otherSceneLabelLocation }]]);
			// The logic for finding label references is complex enough that I'll use an actual Index
			let index = new Index();
			index.setFlowControlEvents(documentUri, events);
			index.setLabels(documentUri, documentLabelsIndex);
			index.setLabels(otherSceneUri, otherSceneLabelsIndex);
			let position = Position.create(5, 1);
			let fakeContext = Substitute.for<ReferenceContext>();
			fakeContext.includeDeclaration.returns!(false);

			let references = findReferences(documentUri, position, fakeContext, index) ?? [];

			expect(references.length).to.equal(1);
			expect(references[0].location.range.start).to.eql({ line: 2, character: 0 });
			expect(references[0].location.range.end).to.eql({ line: 2, character: 5 });
		});

		it("should find labels in a different scene on a reference", () => {
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "goto-scene",
				commandLocation: Substitute.for<Location>(),
				label: "other_label",
				labelLocation: referenceLocation,
				scene: "other-scene"
			}];
			let labelLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let documentLabelsIndex: LabelIndex = new CaseInsensitiveMap([["local_label", { label: "local_label", location: labelLocation }]]);
			let otherSceneLabelLocation = Location.create(otherSceneUri, Range.create(7, 0, 7, 7));
			let otherSceneLabelsIndex: LabelIndex = new CaseInsensitiveMap([["other_label", { label: "other_label", location: otherSceneLabelLocation }]]);
			// The logic for finding label references is complex enough that I'll use an actual Index
			let index = new Index();
			index.setGlobalVariables('file:///c:/startup.txt', new CaseInsensitiveMap());
			index.setFlowControlEvents(documentUri, events);
			index.setLabels(documentUri, documentLabelsIndex);
			index.setLabels(otherSceneUri, otherSceneLabelsIndex);
			index.setSceneList([documentUri, otherSceneUri]);
			let position = Position.create(2, 1);
			let fakeContext = Substitute.for<ReferenceContext>();
			fakeContext.includeDeclaration.returns!(false);

			let references = findReferences(documentUri, position, fakeContext, index) ?? [];

			expect(references.length).to.equal(1);
			expect(references[0].location.range.start).to.eql({ line: 2, character: 0 });
			expect(references[0].location.range.end).to.eql({ line: 2, character: 5 });
		});

		it("should find label references in a different scene on a label definition", () => {
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "goto-scene",
				commandLocation: Substitute.for<Location>(),
				label: "local_label",
				labelLocation: referenceLocation,
				scene: "faker"
			}];
			let labelLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let documentLabelsIndex: LabelIndex = new CaseInsensitiveMap([["local_label", { label: "local_label", location: labelLocation }]]);
			let otherSceneLabelLocation = Location.create(otherSceneUri, Range.create(7, 0, 7, 7));
			let otherSceneLabelsIndex: LabelIndex = new CaseInsensitiveMap([["local_label", { label: "local_label", location: otherSceneLabelLocation }]]);
			// The logic for finding label references is complex enough that I'll use an actual Index
			let index = new Index();
			index.setFlowControlEvents(documentUri, events);
			index.setLabels(documentUri, documentLabelsIndex);
			index.setLabels(otherSceneUri, otherSceneLabelsIndex);
			let position = Position.create(5, 1);
			let fakeContext = Substitute.for<ReferenceContext>();
			fakeContext.includeDeclaration.returns!(false);

			let references = findReferences(documentUri, position, fakeContext, index) ?? [];

			expect(references.length).to.equal(1);
			expect(references[0].location.range.start).to.eql({ line: 2, character: 0 });
			expect(references[0].location.range.end).to.eql({ line: 2, character: 5 });
		});
	});

	describe("Achievement References", () => {
		it("should find achievement references from the achievement's definition", () => {
			let achievementLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let achievementIndex: CaseInsensitiveMap<string, [Location, number, string]> = new CaseInsensitiveMap([["codename", [achievementLocation, 0, ""]]]);
			let achievementReferenceLocations = [Location.create(documentUri, Range.create(7, 0, 7, 5))];
			let achievementReferencesIndex: IdentifierMultiIndex = new CaseInsensitiveMap([["codename", achievementReferenceLocations]]);
			let achievementReferences = new CaseInsensitiveMap([[documentUri, achievementReferencesIndex]]);
			let position = Position.create(5, 2);
			let fakeIndex = createMockIndex({ achievements: achievementIndex, achievementReferences: achievementReferences });
			let fakeContext = Substitute.for<ReferenceContext>();
			fakeContext.includeDeclaration.returns!(false);

			let references = findReferences(documentUri, position, fakeContext, fakeIndex) ?? [];

			expect(references.length).to.equal(1);
			expect(references[0].location.range.start).to.eql({ line: 7, character: 0 });
			expect(references[0].location.range.end).to.eql({ line: 7, character: 5 });
		});

		it("should find achievement references from an achievement reference", () => {
			let achievementLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let achievementIndex: CaseInsensitiveMap<string, [Location, number, string]> = new CaseInsensitiveMap([["codename", [achievementLocation, 0, ""]]]);
			let achievementReferenceLocations = [Location.create(documentUri, Range.create(7, 0, 7, 5))];
			let achievementReferencesIndex: IdentifierMultiIndex = new CaseInsensitiveMap([["codename", achievementReferenceLocations]]);
			let achievementReferences = new CaseInsensitiveMap([[documentUri, achievementReferencesIndex]]);
			let position = Position.create(7, 2);
			let fakeIndex = createMockIndex({ achievements: achievementIndex, achievementReferences: achievementReferences });
			let fakeContext = Substitute.for<ReferenceContext>();
			fakeContext.includeDeclaration.returns!(false);

			let references = findReferences(documentUri, position, fakeContext, fakeIndex) ?? [];

			expect(references.length).to.equal(1);
			expect(references[0].location.range.start).to.eql({ line: 7, character: 0 });
			expect(references[0].location.range.end).to.eql({ line: 7, character: 5 });
		});

		it("should find achievement reference variables from the achievement's definition", () => {
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let achievementLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let achievementIndex: CaseInsensitiveMap<string, [Location, number, string]> = new CaseInsensitiveMap([["codename", [achievementLocation, 0, ""]]]);
			let localVariableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["choice_achieved_codename", [referenceLocation]]]);
			let variableReferences = new CaseInsensitiveMap([[documentUri, localVariableReferences]]);
			let position = Position.create(5, 2);
			let fakeIndex = createMockIndex({ achievements: achievementIndex, variableReferences: variableReferences });
			let fakeContext = Substitute.for<ReferenceContext>();
			fakeContext.includeDeclaration.returns!(false);

			let references = findReferences(documentUri, position, fakeContext, fakeIndex) ?? [];

			expect(references.length).to.equal(1);
			expect(references[0].location.range.start).to.eql({ line: 2, character: 0 });
			expect(references[0].location.range.end).to.eql({ line: 2, character: 5 });
		});

		it("should mark achievement reference variables as being local variables", () => {
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let achievementLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let achievementIndex: CaseInsensitiveMap<string, [Location, number, string]> = new CaseInsensitiveMap([["codename", [achievementLocation, 0, ""]]]);
			let localVariableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["choice_achieved_codename", [referenceLocation]]]);
			let variableReferences = new CaseInsensitiveMap([[documentUri, localVariableReferences]]);
			let position = Position.create(5, 2);
			let fakeIndex = createMockIndex({ achievements: achievementIndex, variableReferences: variableReferences });
			let fakeContext = Substitute.for<ReferenceContext>();
			fakeContext.includeDeclaration.returns!(false);

			let references = findReferences(documentUri, position, fakeContext, fakeIndex) ?? [];

			expect(references[0].type).to.eql(SymbolType.LocalVariable);
		});

		it("should find achievement references from an achievement reference variable", () => {
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let achievementLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let achievementIndex: CaseInsensitiveMap<string, [Location, number, string]> = new CaseInsensitiveMap([["codename", [achievementLocation, 0, ""]]]);
			let achievementReferenceLocations = [Location.create(documentUri, Range.create(7, 0, 7, 5))];
			let achievementReferencesIndex: IdentifierMultiIndex = new CaseInsensitiveMap([["codename", achievementReferenceLocations]]);
			let achievementReferences = new CaseInsensitiveMap([[documentUri, achievementReferencesIndex]]);
			let localVariableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["choice_achieved_codename", [referenceLocation]]]);
			let variableReferences = new CaseInsensitiveMap([[documentUri, localVariableReferences]]);
			let position = Position.create(7, 2);
			let fakeIndex = createMockIndex({
				achievements: achievementIndex, achievementReferences: achievementReferences, variableReferences: variableReferences
			});
			let fakeContext = Substitute.for<ReferenceContext>();
			fakeContext.includeDeclaration.returns!(false);

			let references = findReferences(documentUri, position, fakeContext, fakeIndex) ?? [];

			expect(references.length).to.equal(2);
			expect(references[0].location.range.start).to.eql({ line: 7, character: 0 });
			expect(references[0].location.range.end).to.eql({ line: 7, character: 5 });
			expect(references[1].location.range.start).to.eql({ line: 2, character: 0 });
			expect(references[1].location.range.end).to.eql({ line: 2, character: 5 });
		});

		it("should find achievement references in another scene from the achievement's definition", () => {
			let achievementLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let achievementIndex: CaseInsensitiveMap<string, [Location, number, string]> = new CaseInsensitiveMap([["codename", [achievementLocation, 0, ""]]]);
			let achievementReferenceLocations = [Location.create(otherSceneUri, Range.create(7, 0, 7, 5))];
			let achievementReferencesIndex: IdentifierMultiIndex = new CaseInsensitiveMap([["codename", achievementReferenceLocations]]);
			let achievementReferences = new CaseInsensitiveMap([[otherSceneUri, achievementReferencesIndex]]);
			let position = Position.create(5, 2);
			let fakeIndex = createMockIndex({ achievements: achievementIndex, achievementReferences: achievementReferences });
			let fakeContext = Substitute.for<ReferenceContext>();
			fakeContext.includeDeclaration.returns!(false);

			let references = findReferences(documentUri, position, fakeContext, fakeIndex) ?? [];

			expect(references.length).to.equal(1);
			expect(references[0].location.uri).to.equal(otherSceneUri);
			expect(references[0].location.range.start).to.eql({ line: 7, character: 0 });
			expect(references[0].location.range.end).to.eql({ line: 7, character: 5 });
		});

		it("should include the achievement creation location at the end of the array when requested", () => {
			let achievementLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let achievementIndex: CaseInsensitiveMap<string, [Location, number, string]> = new CaseInsensitiveMap([["codename", [achievementLocation, 0, ""]]]);
			let achievementReferenceLocations = [Location.create(documentUri, Range.create(7, 0, 7, 5))];
			let achievementReferencesIndex: IdentifierMultiIndex = new CaseInsensitiveMap([["codename", achievementReferenceLocations]]);
			let achievementReferences = new CaseInsensitiveMap([[documentUri, achievementReferencesIndex]]);
			let position = Position.create(7, 2);
			let fakeIndex = createMockIndex({ achievements: achievementIndex, achievementReferences: achievementReferences });
			let fakeContext = Substitute.for<ReferenceContext>();
			fakeContext.includeDeclaration.returns!(true);

			let references = findReferences(documentUri, position, fakeContext, fakeIndex) ?? [];

			expect(references.length).to.equal(2);
			expect(references[1].isDefinition).to.be.true;
			expect(references[1].location.range.start).to.eql({ line: 5, character: 0 });
			expect(references[1].location.range.end).to.eql({ line: 5, character: 5 });
		});
	});
});

describe("Symbol Renames", () => {
	describe("Variable Renames", () => {
		it("should rename local variables at definitions", () => {
			let createLocalLocation = Location.create(documentUri, Range.create(1, 0, 1, 5));
			let localVariablesIndex = new CaseInsensitiveMap([["local_var", [createLocalLocation]]]);
			let localVariables = new CaseInsensitiveMap([[documentUri, localVariablesIndex]]);
			let position = Position.create(1, 1);
			let fakeIndex = createMockIndex({ localVariables: localVariables });

			let renames = generateRenames(documentUri, position, "local_var", fakeIndex);
			let allChanges = renames?.changes ?? {};
			let changes = allChanges[documentUri];

			expect(Object.keys(allChanges)).to.eql([documentUri]);
			expect(changes.length).to.equal(1);
			expect(changes[0].range.start).to.eql({ line: 1, character: 0 });
			expect(changes[0].range.end).to.eql({ line: 1, character: 5 });
		});

		it("should rename local variables at references", () => {
			let createLocalLocation = Location.create(documentUri, Range.create(1, 0, 1, 5));
			let localReferenceLocation = Location.create(documentUri, Range.create(3, 0, 3, 5));
			let localVariablesIndex = new CaseInsensitiveMap([["local_var", [createLocalLocation]]]);
			let localVariables = new CaseInsensitiveMap([[documentUri, localVariablesIndex]]);
			let localVariableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["local_var", [localReferenceLocation]]]);
			let variableReferences = new CaseInsensitiveMap([[documentUri, localVariableReferences]]);
			let position = Position.create(3, 1);
			let fakeIndex = createMockIndex({ localVariables: localVariables, variableReferences: variableReferences });

			let renames = generateRenames(documentUri, position, "new_var_name", fakeIndex);
			let allChanges = renames?.changes ?? {};
			let changes = allChanges[documentUri];

			expect(Object.keys(allChanges)).to.eql([documentUri]);
			expect(changes.length).to.equal(2);
			expect(changes[0].range.start).to.eql({ line: 3, character: 0 });
			expect(changes[0].range.end).to.eql({ line: 3, character: 5 });
			expect(changes[1].range.start).to.eql({ line: 1, character: 0 });
			expect(changes[1].range.end).to.eql({ line: 1, character: 5 });
		});

		it("should rename global variables at references", () => {
			let createGlobalLocation = Location.create(globalUri, Range.create(2, 0, 2, 5));
			let globalVariables: CaseInsensitiveMap<string, Location> = new CaseInsensitiveMap([["global_var", createGlobalLocation]]);
			let localReferenceLocation = Location.create(documentUri, Range.create(3, 0, 3, 5));
			let localVariableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["global_var", [localReferenceLocation]]]);
			let variableReferences = new CaseInsensitiveMap([[documentUri, localVariableReferences]]);
			let position = Position.create(3, 1);
			let fakeIndex = createMockIndex({ globalVariables: globalVariables, variableReferences: variableReferences });

			let renames = generateRenames(documentUri, position, "new_var_name", fakeIndex);
			let allChanges = renames?.changes ?? {};
			let localChanges = allChanges[documentUri];
			let globalChanges = allChanges[globalUri];

			expect(Object.keys(allChanges)).to.eql([documentUri, globalUri]);
			expect(localChanges.length).to.equal(1);
			expect(globalChanges.length).to.equal(1);
			expect(localChanges[0].range.start).to.eql({ line: 3, character: 0 });
			expect(localChanges[0].range.end).to.eql({ line: 3, character: 5 });
			expect(globalChanges[0].range.start).to.eql({ line: 2, character: 0 });
			expect(globalChanges[0].range.end).to.eql({ line: 2, character: 5 });
		});

		it("should only rename local variables locally", () => {
			let createLocalLocation = Location.create(documentUri, Range.create(1, 0, 1, 5));
			let createGlobalLocation = Location.create(globalUri, Range.create(2, 0, 2, 5));
			let localReferenceLocation = Location.create(documentUri, Range.create(3, 0, 3, 5));
			let localVariablesIndex = new CaseInsensitiveMap([["shared_var_name", [createLocalLocation]]]);
			let localVariables = new CaseInsensitiveMap([[documentUri, localVariablesIndex]]);
			let globalVariables: CaseInsensitiveMap<string, Location> = new CaseInsensitiveMap([["shared_var_name", createGlobalLocation]]);
			let localVariableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["shared_var_name", [localReferenceLocation]]]);
			let variableReferences = new CaseInsensitiveMap([[documentUri, localVariableReferences]]);
			let position = Position.create(3, 1);
			let fakeIndex = createMockIndex({
				localVariables: localVariables, globalVariables: globalVariables, variableReferences: variableReferences
			});

			let renames = generateRenames(documentUri, position, "new_var_name", fakeIndex);
			let allChanges = renames?.changes ?? {};
			let localChanges = allChanges[documentUri];

			expect(Object.keys(allChanges)).to.eql([documentUri]);
			expect(localChanges.length).to.equal(2);
			expect(localChanges[0].range.start).to.eql({ line: 3, character: 0 });
			expect(localChanges[0].range.end).to.eql({ line: 3, character: 5 });
			expect(localChanges[1].range.start).to.eql({ line: 1, character: 0 });
			expect(localChanges[1].range.end).to.eql({ line: 1, character: 5 });
		});
	});

	describe("Label Renames", () => {
		it("should rename all matching label references on a label definition", () => {
			let referenceLocation1 = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let referenceLocation2 = Location.create(documentUri, Range.create(4, 0, 4, 5));
			let events: FlowControlEvent[] = [{
				command: "goto",
				commandLocation: Substitute.for<Location>(),
				label: "local_label",
				labelLocation: referenceLocation1,
				scene: ""
			},
			{
				command: "gosub",
				commandLocation: Substitute.for<Location>(),
				label: "local_label",
				labelLocation: referenceLocation2,
				scene: ""
			}];
			let labelLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let documentLabelsIndex: LabelIndex = new CaseInsensitiveMap([["local_label", { label: "local_label", location: labelLocation }]]);
			// The logic for finding label references is complex enough that I'll use an actual Index
			let index = new Index();
			index.setFlowControlEvents(documentUri, events);
			index.setLabels(documentUri, documentLabelsIndex);
			let position = Position.create(5, 1);

			let renames = generateRenames(documentUri, position, "new_label", index);
			let allChanges = renames?.changes ?? {};
			let localChanges = allChanges[documentUri];

			expect(Object.keys(allChanges)).to.eql([documentUri]);
			expect(localChanges.length).to.equal(3);
			expect(localChanges[0].range.start).to.eql({ line: 2, character: 0 });
			expect(localChanges[0].range.end).to.eql({ line: 2, character: 5 });
			expect(localChanges[1].range.start).to.eql({ line: 4, character: 0 });
			expect(localChanges[1].range.end).to.eql({ line: 4, character: 5 });
			expect(localChanges[2].range.start).to.eql({ line: 5, character: 0 });
			expect(localChanges[2].range.end).to.eql({ line: 5, character: 5 });
		});

		it("should rename all matching label references on a label reference", () => {
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "goto",
				commandLocation: Substitute.for<Location>(),
				label: "local_label",
				labelLocation: referenceLocation,
				scene: ""
			}];
			let definitionLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let documentLabelsIndex: LabelIndex = new CaseInsensitiveMap([["local_label", { label: "local_label", location: definitionLocation }]]);
			// The logic for finding label references is complex enough that I'll use an actual Index
			let index = new Index();
			index.setFlowControlEvents(documentUri, events);
			index.setLabels(documentUri, documentLabelsIndex);
			let position = Position.create(2, 1);

			let renames = generateRenames(documentUri, position, "new_label", index);
			let allChanges = renames?.changes ?? {};
			let localChanges = allChanges[documentUri];

			expect(Object.keys(allChanges)).to.eql([documentUri]);
			expect(localChanges.length).to.equal(2);
			expect(localChanges[0].range.start).to.eql({ line: 2, character: 0 });
			expect(localChanges[0].range.end).to.eql({ line: 2, character: 5 });
			expect(localChanges[1].range.start).to.eql({ line: 5, character: 0 });
			expect(localChanges[1].range.end).to.eql({ line: 5, character: 5 });
		});

		it("should not rename labels with the same name in a different scene", () => {
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "goto",
				commandLocation: Substitute.for<Location>(),
				label: "local_label",
				labelLocation: referenceLocation,
				scene: ""
			}];
			let labelLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let documentLabelsIndex: LabelIndex = new CaseInsensitiveMap([["local_label", { label: "local_label", location: labelLocation }]]);
			let otherSceneLabelLocation = Location.create(otherSceneUri, Range.create(7, 0, 7, 7));
			let otherSceneLabelsIndex: LabelIndex = new CaseInsensitiveMap([["local_label", { label: "local_label", location: otherSceneLabelLocation }]]);
			// The logic for finding label references is complex enough that I'll use an actual Index
			let index = new Index();
			index.setFlowControlEvents(documentUri, events);
			index.setLabels(documentUri, documentLabelsIndex);
			index.setLabels(otherSceneUri, otherSceneLabelsIndex);
			let position = Position.create(5, 1);

			let renames = generateRenames(documentUri, position, "new_label", index);
			let allChanges = renames?.changes ?? {};
			let localChanges = allChanges[documentUri];

			expect(Object.keys(allChanges)).to.eql([documentUri]);
			expect(localChanges.length).to.equal(2);
			expect(localChanges[0].range.start).to.eql({ line: 2, character: 0 });
			expect(localChanges[0].range.end).to.eql({ line: 2, character: 5 });
			expect(localChanges[1].range.start).to.eql({ line: 5, character: 0 });
			expect(localChanges[1].range.end).to.eql({ line: 5, character: 5 });
		});

		it("should rename labels in a different scene on a reference", () => {
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "goto-scene",
				commandLocation: Substitute.for<Location>(),
				label: "other_label",
				labelLocation: referenceLocation,
				scene: "other-scene"
			}];
			let labelLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let documentLabelsIndex: LabelIndex = new CaseInsensitiveMap([["local_label", { label: "local_label", location: labelLocation }]]);
			let otherSceneLabelLocation = Location.create(otherSceneUri, Range.create(7, 0, 7, 7));
			let otherSceneLabelsIndex: LabelIndex = new CaseInsensitiveMap([["other_label", { label: "other_label", location: otherSceneLabelLocation }]]);
			// The logic for finding label references is complex enough that I'll use an actual Index
			let index = new Index();
			index.setGlobalVariables('file:///c:/startup.txt', new CaseInsensitiveMap());
			index.setFlowControlEvents(documentUri, events);
			index.setLabels(documentUri, documentLabelsIndex);
			index.setLabels(otherSceneUri, otherSceneLabelsIndex);
			index.setSceneList([documentUri, otherSceneUri]);
			let position = Position.create(2, 1);

			let renames = generateRenames(documentUri, position, "new_label", index);
			let allChanges = renames?.changes ?? {};
			let otherChanges = allChanges[otherSceneUri];

			expect(Object.keys(allChanges)).to.eql([documentUri, otherSceneUri]);
			expect(otherChanges.length).to.equal(1);
			expect(otherChanges[0].range.start).to.eql({ line: 7, character: 0 });
			expect(otherChanges[0].range.end).to.eql({ line: 7, character: 7 });
		});

		it("should rename label references in a different scene on a label definition", () => {
			let referenceLocation = Location.create(otherSceneUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "goto-scene",
				commandLocation: Substitute.for<Location>(),
				label: "local_label",
				labelLocation: referenceLocation,
				scene: "faker"
			}];
			let labelLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let documentLabelsIndex: LabelIndex = new CaseInsensitiveMap([["local_label", { label: "local_label", location: labelLocation }]]);
			// The logic for finding label references is complex enough that I'll use an actual Index
			let index = new Index();
			index.setFlowControlEvents(otherSceneUri, events);
			index.setLabels(documentUri, documentLabelsIndex);
			let position = Position.create(5, 1);

			let renames = generateRenames(documentUri, position, "new_label", index);
			let allChanges = renames?.changes ?? {};
			let otherChanges = allChanges[otherSceneUri];

			expect(Object.keys(allChanges)).to.eql([otherSceneUri, documentUri]);
			expect(otherChanges.length).to.equal(1);
			expect(otherChanges[0].range.start).to.eql({ line: 2, character: 0 });
			expect(otherChanges[0].range.end).to.eql({ line: 2, character: 5 });
		});
	});

	describe("Achievement Renames", () => {
		it("should rename all matching achievement references on an achievement definition", () => {
			let achievementLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let achievementIndex: CaseInsensitiveMap<string, [Location, number, string]> = new CaseInsensitiveMap([["codename", [achievementLocation, 0, ""]]]);
			let achievementReferenceLocations = [
				Location.create(documentUri, Range.create(6, 0, 6, 5)),
				Location.create(documentUri, Range.create(7, 0, 7, 5))
			];
			let achievementReferencesIndex: IdentifierMultiIndex = new CaseInsensitiveMap([["codename", achievementReferenceLocations]]);
			let achievementReferences = new CaseInsensitiveMap([[documentUri, achievementReferencesIndex]]);
			let position = Position.create(5, 2);
			let fakeIndex = createMockIndex({ achievements: achievementIndex, achievementReferences: achievementReferences });

			let renames = generateRenames(documentUri, position, "new_achievement", fakeIndex);
			let allChanges = renames?.changes ?? {};
			let localChanges = allChanges[documentUri];

			expect(Object.keys(allChanges)).to.eql([documentUri]);
			expect(localChanges.length).to.equal(3);
			expect(localChanges[0].range.start).to.eql({ line: 6, character: 0 });
			expect(localChanges[0].range.end).to.eql({ line: 6, character: 5 });
			expect(localChanges[1].range.start).to.eql({ line: 7, character: 0 });
			expect(localChanges[1].range.end).to.eql({ line: 7, character: 5 });
			expect(localChanges[2].range.start).to.eql({ line: 5, character: 0 });
			expect(localChanges[2].range.end).to.eql({ line: 5, character: 5 });
		});

		it("should rename all matching achievement references on an achievement reference", () => {
			let achievementLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let achievementIndex: CaseInsensitiveMap<string, [Location, number, string]> = new CaseInsensitiveMap([["codename", [achievementLocation, 0, ""]]]);
			let achievementReferenceLocations = [
				Location.create(documentUri, Range.create(6, 0, 6, 5)),
				Location.create(documentUri, Range.create(7, 0, 7, 5))
			];
			let achievementReferencesIndex: IdentifierMultiIndex = new CaseInsensitiveMap([["codename", achievementReferenceLocations]]);
			let achievementReferences = new CaseInsensitiveMap([[documentUri, achievementReferencesIndex]]);
			let position = Position.create(7, 2);
			let fakeIndex = createMockIndex({ achievements: achievementIndex, achievementReferences: achievementReferences });

			let renames = generateRenames(documentUri, position, "new_achievement", fakeIndex);
			let allChanges = renames?.changes ?? {};
			let localChanges = allChanges[documentUri];

			expect(Object.keys(allChanges)).to.eql([documentUri]);
			expect(localChanges.length).to.equal(3);
			expect(localChanges[0].range.start).to.eql({ line: 6, character: 0 });
			expect(localChanges[0].range.end).to.eql({ line: 6, character: 5 });
			expect(localChanges[1].range.start).to.eql({ line: 7, character: 0 });
			expect(localChanges[1].range.end).to.eql({ line: 7, character: 5 });
			expect(localChanges[2].range.start).to.eql({ line: 5, character: 0 });
			expect(localChanges[2].range.end).to.eql({ line: 5, character: 5 });
		});

		it("should rename achievement reference variable on an achievement definition", () => {
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let achievementLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let achievementIndex: CaseInsensitiveMap<string, [Location, number, string]> = new CaseInsensitiveMap([["codename", [achievementLocation, 0, ""]]]);
			let localVariableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["choice_achieved_codename", [referenceLocation]]]);
			let variableReferences = new CaseInsensitiveMap([[documentUri, localVariableReferences]]);
			let position = Position.create(5, 2);
			let fakeIndex = createMockIndex({
				achievements: achievementIndex,
				variableReferences: variableReferences
			});

			let renames = generateRenames(documentUri, position, "new_achievement", fakeIndex);
			let allChanges = renames?.changes ?? {};
			let localChanges = allChanges[documentUri];

			expect(Object.keys(allChanges)).to.eql([documentUri]);
			expect(localChanges.length).to.equal(2);
			expect(localChanges[0].range.start).to.eql({ line: 2, character: 0 });
			expect(localChanges[0].range.end).to.eql({ line: 2, character: 5 });
			expect(localChanges[1].range.start).to.eql({ line: 5, character: 0 });
			expect(localChanges[1].range.end).to.eql({ line: 5, character: 5 });
		});

		it("should properly rename an achievement and its references", () => {
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let achievementLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let achievementIndex: CaseInsensitiveMap<string, [Location, number, string]> = new CaseInsensitiveMap([["codename", [achievementLocation, 0, ""]]]);
			let achievementReferenceLocations = [
				Location.create(documentUri, Range.create(6, 0, 6, 5))
			];
			let achievementReferencesIndex: IdentifierMultiIndex = new CaseInsensitiveMap([["codename", achievementReferenceLocations]]);
			let achievementReferences = new CaseInsensitiveMap([[documentUri, achievementReferencesIndex]]);
			let localVariableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["choice_achieved_codename", [referenceLocation]]]);
			let variableReferences = new CaseInsensitiveMap([[documentUri, localVariableReferences]]);
			let position = Position.create(5, 2);
			let fakeIndex = createMockIndex({
				achievements: achievementIndex,
				achievementReferences: achievementReferences,
				variableReferences: variableReferences
			});

			let renames = generateRenames(documentUri, position, "new_achievement", fakeIndex);
			let allChanges = renames?.changes ?? {};
			let localChanges = allChanges[documentUri];

			expect(Object.keys(allChanges)).to.eql([documentUri]);
			expect(localChanges.length).to.equal(3);
			expect(localChanges[0].newText).to.eql("new_achievement");
			expect(localChanges[1].newText).to.eql("choice_achieved_new_achievement");
			expect(localChanges[2].newText).to.eql("new_achievement");
		});
	});
});