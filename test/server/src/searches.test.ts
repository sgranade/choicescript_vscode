import { expect } from 'chai';
import 'mocha';
import { Substitute, SubstituteOf, Arg } from '@fluffy-spoon/substitute';
import { TextDocument, Position, Location, Range, ReferenceContext } from 'vscode-languageserver';

import { 
	ProjectIndex,
	Index,
	IdentifierIndex, 
	VariableReferenceIndex, 
	FlowControlEvent, 
	DocumentScopes
} from '../../../server/src/index';
import { 
	DefinitionType,
	findDefinition,
	findReferences
} from '../../../server/src/searches';

const documentUri: string = "file:///faker.txt";
const otherSceneUri: string = "file:///other-scene.txt";

function createDocument(text: string, uri: string = documentUri): SubstituteOf<TextDocument> {
	let fakeDocument = Substitute.for<TextDocument>();
	fakeDocument.getText(Arg.any()).returns(text);
	fakeDocument.uri.returns(uri);
	fakeDocument.offsetAt(Arg.any()).mimicks((position: Position) => {
		return position.line * 100 + position.character;
	});
	return fakeDocument;
}

interface IndexArgs {
	globalVariables?: IdentifierIndex,
	localVariables?: IdentifierIndex,
	subroutineVariables?: IdentifierIndex,
	startupUri?: string,
	labels?: Map<string, IdentifierIndex>,
	sceneList?: string[],
	sceneFileUri?: string,
	achievements?: IdentifierIndex,
	variableReferences?: VariableReferenceIndex,
	flowControlEvents?: FlowControlEvent[],
	flowControlEventsUri?: string,
	scopes?: DocumentScopes
}

function createMockIndex({
    globalVariables, localVariables, subroutineVariables, startupUri, labels, 
    sceneList, sceneFileUri, achievements, 
    variableReferences, flowControlEvents, flowControlEventsUri, scopes}: IndexArgs): SubstituteOf<ProjectIndex> {
	if (globalVariables === undefined) {
		globalVariables = new Map();
	}
	if (localVariables === undefined) {
		localVariables = new Map();
	}
	if (subroutineVariables === undefined) {
		subroutineVariables = new Map();
	}
	if (startupUri === undefined) {
		startupUri = "";
	}
	if (labels === undefined) {
		labels = new Map();
	}
	if (sceneList === undefined) {
		sceneList = [];
	}
	if (sceneFileUri === undefined) {
		sceneFileUri = otherSceneUri;
	}
	if (achievements === undefined) {
		achievements = new Map();
	}
	if (variableReferences === undefined) {
		variableReferences = new Map();
	}
	if (flowControlEvents === undefined) {
		flowControlEvents = [];
	}
	if (scopes === undefined) {
		scopes = {
			achievementVarScopes: [],
			paramScopes: []
		}
	}

	let fakeIndex = Substitute.for<ProjectIndex>();
	fakeIndex.getGlobalVariables().returns(globalVariables);
	fakeIndex.getLocalVariables(Arg.any()).returns(localVariables);
	fakeIndex.getSubroutineLocalVariables(Arg.any()).returns(subroutineVariables);
	fakeIndex.getStartupFileUri().returns(startupUri);
	fakeIndex.getSceneUri(Arg.any()).mimicks(scene => {
		return `file:///${scene}.txt`;
	});
	fakeIndex.getSceneList().returns(sceneList);
	fakeIndex.getLabels(Arg.any()).mimicks((uri: string) => {
		let l = labels.get(uri);
		if (l !== undefined) {
			return l;
		}
		return new Map();
	});
	fakeIndex.getAchievements(Arg.any()).returns(achievements);
	fakeIndex.getDocumentVariableReferences(Arg.all()).returns(variableReferences);
	fakeIndex.getVariableScopes(Arg.all()).returns(scopes);
	fakeIndex.getVariableReferences(Arg.all()).mimicks((variable: string) => {
		let locations = variableReferences.get(variable);
		if (locations) {
			return locations;
		}
		return [];
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
			let localVariables: Map<string, Location> = new Map([["local_var", createLocation]]);
			let fakeDocument = createDocument("Non-reference local_var");
			let position = Position.create(0, 16);
			let fakeIndex = createMockIndex({ localVariables: localVariables });
	
			let definition = findDefinition(fakeDocument, position, fakeIndex);
	
			expect(definition.type).to.be.undefined;
			expect(definition.location).to.be.undefined;
		});

		it("should locate local variable references", () => {
			let createLocation = Location.create(documentUri, Range.create(1, 0, 1, 5));
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let localVariables: Map<string, Location> = new Map([["local_var", createLocation]]);
			let variableReferences: VariableReferenceIndex = new Map([["local_var", [referenceLocation]]])
			let fakeDocument = createDocument("placeholder");
			let position = Position.create(2, 2);
			let fakeIndex = createMockIndex({ localVariables: localVariables, variableReferences: variableReferences });
	
			let definition = findDefinition(fakeDocument, position, fakeIndex);
	
			expect(definition.type).to.equal(DefinitionType.Variable);
			expect(definition.location.range.start).to.eql({line: 1, character: 0});
			expect(definition.location.range.end).to.eql({line: 1, character: 5});
		});

		it("should locate local variable references on a variable definition", () => {
			let createLocation = Location.create(documentUri, Range.create(1, 0, 1, 5));
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let localVariables: Map<string, Location> = new Map([["local_var", createLocation]]);
			let variableReferences: VariableReferenceIndex = new Map([["local_var", [referenceLocation]]])
			let fakeDocument = createDocument("placeholder");
			let position = Position.create(1, 2);
			let fakeIndex = createMockIndex({ localVariables: localVariables, variableReferences: variableReferences });
	
			let definition = findDefinition(fakeDocument, position, fakeIndex);
	
			expect(definition.type).to.equal(DefinitionType.Variable);
			expect(definition.location.range.start).to.eql({line: 1, character: 0});
			expect(definition.location.range.end).to.eql({line: 1, character: 5});
		});

		it("should return local variable symbol names", () => {
			let createLocation = Location.create(documentUri, Range.create(1, 0, 1, 5));
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let localVariables: Map<string, Location> = new Map([["local_var", createLocation]]);
			let variableReferences: VariableReferenceIndex = new Map([["local_var", [referenceLocation]]])
			let fakeDocument = createDocument("placeholder");
			let position = Position.create(2, 2);
			let fakeIndex = createMockIndex({ localVariables: localVariables, variableReferences: variableReferences });
	
			let definition = findDefinition(fakeDocument, position, fakeIndex);
	
			expect(definition.symbol).to.equal("local_var");
		});

		it("should locate global variable references", () => {
			let createLocation = Location.create(documentUri, Range.create(1, 0, 1, 5));
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let globalVariables: Map<string, Location> = new Map([["global_var", createLocation]]);
			let variableReferences: VariableReferenceIndex = new Map([["global_var", [referenceLocation]]])
			let fakeDocument = createDocument("placeholder");
			let position = Position.create(2, 2);
			let fakeIndex = createMockIndex({ globalVariables: globalVariables, variableReferences: variableReferences });
	
			let definition = findDefinition(fakeDocument, position, fakeIndex);
	
			expect(definition.type).to.equal(DefinitionType.Variable);
			expect(definition.location.range.start).to.eql({line: 1, character: 0});
			expect(definition.location.range.end).to.eql({line: 1, character: 5});
		});

		it("should return global variable names", () => {
			let createLocation = Location.create(documentUri, Range.create(1, 0, 1, 5));
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let globalVariables: Map<string, Location> = new Map([["global_var", createLocation]]);
			let variableReferences: VariableReferenceIndex = new Map([["global_var", [referenceLocation]]])
			let fakeDocument = createDocument("placeholder");
			let position = Position.create(2, 2);
			let fakeIndex = createMockIndex({ globalVariables: globalVariables, variableReferences: variableReferences });
	
			let definition = findDefinition(fakeDocument, position, fakeIndex);
	
			expect(definition.symbol).to.equal("global_var");
		});

		it("should locate achievement references", () => {
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let achievementLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let variableReferences: VariableReferenceIndex = new Map([["choice_achieved_codename", [referenceLocation]]])
			let achievementsIndex: IdentifierIndex = new Map([["codename", achievementLocation]]);
			let fakeDocument = createDocument("placeholder");
			let position = Position.create(2, 2);
			let fakeIndex = createMockIndex({ variableReferences: variableReferences, achievements: achievementsIndex });
	
			let definition = findDefinition(fakeDocument, position, fakeIndex);
	
			expect(definition.type).to.equal(DefinitionType.Achievement);
			expect(definition.location.range.start).to.eql({line: 5, character: 0});
			expect(definition.location.range.end).to.eql({line: 5, character: 5});
		});

		it("should return achievement codenames", () => {
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let achievementLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
			let variableReferences: VariableReferenceIndex = new Map([["choice_achieved_codename", [referenceLocation]]])
			let achievementsIndex: IdentifierIndex = new Map([["codename", achievementLocation]]);
			let fakeDocument = createDocument("placeholder");
			let position = Position.create(2, 2);
			let fakeIndex = createMockIndex({ variableReferences: variableReferences, achievements: achievementsIndex });
	
			let definition = findDefinition(fakeDocument, position, fakeIndex);
	
			expect(definition.symbol).to.equal("codename");
			expect(definition.location.range.start).to.eql({line: 5, character: 0});
			expect(definition.location.range.end).to.eql({line: 5, character: 5});
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
			let labelsIndex: IdentifierIndex = new Map([["local_label", labelLocation]]);
			let labels = new Map([[documentUri, labelsIndex]]);
			let fakeDocument = createDocument("placeholder");
			let position = Position.create(2, 2);
			let fakeIndex = createMockIndex({ labels: labels, flowControlEvents: events });
	
			let definition = findDefinition(fakeDocument, position, fakeIndex);
	
			expect(definition.type).to.equal(DefinitionType.Label);
			expect(definition.location.range.start).to.eql({line: 5, character: 0});
			expect(definition.location.range.end).to.eql({line: 5, character: 5});
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
			let labelsIndex: IdentifierIndex = new Map([["local_label", labelLocation]]);
			let labels = new Map([[documentUri, labelsIndex]]);
			let fakeDocument = createDocument("placeholder");
			let position = Position.create(5, 2);
			let fakeIndex = createMockIndex({ labels: labels, flowControlEvents: events });
	
			let definition = findDefinition(fakeDocument, position, fakeIndex);
	
			expect(definition.type).to.equal(DefinitionType.Label);
			expect(definition.location.range.start).to.eql({line: 5, character: 0});
			expect(definition.location.range.end).to.eql({line: 5, character: 5});
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
			let labelsIndex: IdentifierIndex = new Map([["local_label", labelLocation]]);
			let labels = new Map([[documentUri, labelsIndex]]);
			let fakeDocument = createDocument("placeholder");
			let position = Position.create(2, 2);
			let fakeIndex = createMockIndex({ labels: labels, flowControlEvents: events });
	
			let definition = findDefinition(fakeDocument, position, fakeIndex);
	
			expect(definition.symbol).to.equal("local_label");
		});

		it("should locate global labels", () => {
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "goto_scene",
				commandLocation: Substitute.for<Location>(),
				label: "other_label",
				labelLocation: referenceLocation,
				scene: "other-scene"
			}];
			let labelLocation = Location.create(otherSceneUri, Range.create(5, 0, 5, 5));
			let labelsIndex: IdentifierIndex = new Map([["other_label", labelLocation]]);
			let labels = new Map([[otherSceneUri, labelsIndex]]);
			let fakeDocument = createDocument("placeholder");
			let position = Position.create(2, 2);
			let fakeIndex = createMockIndex({ labels: labels, sceneFileUri: otherSceneUri, flowControlEvents: events });
	
			let definition = findDefinition(fakeDocument, position, fakeIndex);
	
			expect(definition.type).to.equal(DefinitionType.Label);
			expect(definition.location.uri).to.equal(otherSceneUri);
			expect(definition.location.range.start).to.eql({line: 5, character: 0});
			expect(definition.location.range.end).to.eql({line: 5, character: 5});
		});

		it("should return global label names", () => {
			let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "goto_scene",
				commandLocation: Substitute.for<Location>(),
				label: "other_label",
				labelLocation: referenceLocation,
				scene: "other-scene"
			}];
			let labelLocation = Location.create(otherSceneUri, Range.create(5, 0, 5, 5));
			let labelsIndex: IdentifierIndex = new Map([["other_label", labelLocation]]);
			let labels = new Map([[otherSceneUri, labelsIndex]]);
			let fakeDocument = createDocument("placeholder");
			let position = Position.create(2, 2);
			let fakeIndex = createMockIndex({ labels: labels, sceneFileUri: otherSceneUri, flowControlEvents: events });
	
			let definition = findDefinition(fakeDocument, position, fakeIndex);
	
			expect(definition.symbol).to.equal("other_label");
		});
	});
});

describe("Symbol References", () => {
	it("should give all variable references", () => {
		let createLocation = Location.create(documentUri, Range.create(1, 0, 1, 5));
		let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
		let localVariables: Map<string, Location> = new Map([["local_var", createLocation]]);
		let variableReferences: VariableReferenceIndex = new Map([["local_var", [referenceLocation]]])
		let fakeDocument = createDocument("Placeholder");
		let position = Position.create(2, 1);
		let fakeContext = Substitute.for<ReferenceContext>();
		fakeContext.includeDeclaration.returns(false);
		let fakeIndex = createMockIndex({ localVariables: localVariables, variableReferences: variableReferences });

		let references = findReferences(fakeDocument, position, fakeContext, fakeIndex);

		expect(references.length).to.equal(1);
		expect(references[0].range.start).to.eql({line: 2, character: 0});
		expect(references[0].range.end).to.eql({line: 2, character: 5});
	});

	it("should include the local variable definition location if requested", () => {
		let createLocation = Location.create(documentUri, Range.create(1, 0, 1, 5));
		let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
		let localVariables: Map<string, Location> = new Map([["local_var", createLocation]]);
		let variableReferences: VariableReferenceIndex = new Map([["local_var", [referenceLocation]]])
		let fakeDocument = createDocument("Placeholder");
		let position = Position.create(2, 1);
		let fakeContext = Substitute.for<ReferenceContext>();
		fakeContext.includeDeclaration.returns(true);
		let fakeIndex = createMockIndex({ localVariables: localVariables, variableReferences: variableReferences });

		let references = findReferences(fakeDocument, position, fakeContext, fakeIndex);

		expect(references.length).to.equal(2);
		expect(references[0].range.start).to.eql({line: 2, character: 0});
		expect(references[0].range.end).to.eql({line: 2, character: 5});
		expect(references[1].range.start).to.eql({line: 1, character: 0});
		expect(references[1].range.end).to.eql({line: 1, character: 5});
	});

	it("should include the global variable definition location if requested", () => {
		let createLocation = Location.create(documentUri, Range.create(1, 0, 1, 5));
		let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
		let globalVariables: Map<string, Location> = new Map([["global_var", createLocation]]);
		let variableReferences: VariableReferenceIndex = new Map([["global_var", [referenceLocation]]])
		let fakeDocument = createDocument("Placeholder");
		let position = Position.create(2, 1);
		let fakeContext = Substitute.for<ReferenceContext>();
		fakeContext.includeDeclaration.returns(true);
		let fakeIndex = createMockIndex({ globalVariables: globalVariables, variableReferences: variableReferences });

		let references = findReferences(fakeDocument, position, fakeContext, fakeIndex);

		expect(references.length).to.equal(2);
		expect(references[0].range.start).to.eql({line: 2, character: 0});
		expect(references[0].range.end).to.eql({line: 2, character: 5});
		expect(references[1].range.start).to.eql({line: 1, character: 0});
		expect(references[1].range.end).to.eql({line: 1, character: 5});
	});

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
		let documentLabelsIndex: IdentifierIndex = new Map([["local_label", labelLocation]]);
		// The logic for finding label references is complex enough that I'll use an actual Index
		let index = new Index();
		index.updateFlowControlEvents(documentUri, events);
		index.updateLabels(documentUri, documentLabelsIndex);
		let fakeDocument = createDocument("Line 0\nLine 1\nLine 2\nLine 3\nLine 4\nlocal_label");
		let position = Position.create(5, 1);
		let fakeContext = Substitute.for<ReferenceContext>();
		fakeContext.includeDeclaration.returns(false);

		let references = findReferences(fakeDocument, position, fakeContext, index);

		expect(references.length).to.equal(1);
		expect(references[0].range.start).to.eql({line: 2, character: 0});
		expect(references[0].range.end).to.eql({line: 2, character: 5});
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
		let documentLabelsIndex: IdentifierIndex = new Map([["local_label", definitionLocation]]);
		// The logic for finding label references is complex enough that I'll use an actual Index
		let index = new Index();
		index.updateFlowControlEvents(documentUri, events);
		index.updateLabels(documentUri, documentLabelsIndex);
		let fakeDocument = createDocument("Line 0\nLine 1\nlocal_label");
		let position = Position.create(2, 1);
		let fakeContext = Substitute.for<ReferenceContext>();
		fakeContext.includeDeclaration.returns(false);

		let references = findReferences(fakeDocument, position, fakeContext, index);

		expect(references.length).to.equal(1);
		expect(references[0].range.start).to.eql({line: 2, character: 0});
		expect(references[0].range.end).to.eql({line: 2, character: 5});
	});

	it("should give all matching label references on a label definition with creation location when requested", () => {
		let referenceLocation = Location.create(documentUri, Range.create(2, 0, 2, 5));
		let events: FlowControlEvent[] = [{
			command: "goto",
			commandLocation: Substitute.for<Location>(),
			label: "local_label",
			labelLocation: referenceLocation,
			scene: ""
		}];
		let labelLocation = Location.create(documentUri, Range.create(5, 0, 5, 5));
		let documentLabelsIndex: IdentifierIndex = new Map([["local_label", labelLocation]]);
		// The logic for finding label references is complex enough that I'll use an actual Index
		let index = new Index();
		index.updateFlowControlEvents(documentUri, events);
		index.updateLabels(documentUri, documentLabelsIndex);
		let fakeDocument = createDocument("Line 0\nLine 1\nLine 2\nLine 3\nLine 4\nlocal_label");
		let position = Position.create(5, 1);
		let fakeContext = Substitute.for<ReferenceContext>();
		fakeContext.includeDeclaration.returns(true);

		let references = findReferences(fakeDocument, position, fakeContext, index);

		expect(references.length).to.equal(2);
		expect(references[0].range.start).to.eql({line: 2, character: 0});
		expect(references[0].range.end).to.eql({line: 2, character: 5});
		expect(references[1].range.start).to.eql({line: 5, character: 0});
		expect(references[1].range.end).to.eql({line: 5, character: 5});
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
		let documentLabelsIndex: IdentifierIndex = new Map([["local_label", labelLocation]]);
		let otherSceneLabelLocation = Location.create(otherSceneUri, Range.create(7, 0, 7, 7));
		let otherSceneLabelsIndex: IdentifierIndex = new Map([["local_label", otherSceneLabelLocation]]);
		// The logic for finding label references is complex enough that I'll use an actual Index
		let index = new Index();
		index.updateFlowControlEvents(documentUri, events);
		index.updateLabels(documentUri, documentLabelsIndex);
		index.updateLabels(otherSceneUri, otherSceneLabelsIndex);
		let fakeDocument = createDocument("Line 0\nLine 1\nLine 2\nLine 3\nLine 4\nlocal_label");
		let position = Position.create(5, 1);
		let fakeContext = Substitute.for<ReferenceContext>();
		fakeContext.includeDeclaration.returns(false);

		let references = findReferences(fakeDocument, position, fakeContext, index);

		expect(references.length).to.equal(1);
		expect(references[0].range.start).to.eql({line: 2, character: 0});
		expect(references[0].range.end).to.eql({line: 2, character: 5});
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
		let documentLabelsIndex: IdentifierIndex = new Map([["local_label", labelLocation]]);
		let otherSceneLabelLocation = Location.create(otherSceneUri, Range.create(7, 0, 7, 7));
		let otherSceneLabelsIndex: IdentifierIndex = new Map([["other_label", otherSceneLabelLocation]]);
		// The logic for finding label references is complex enough that I'll use an actual Index
		let index = new Index();
		index.updateGlobalVariables('file:///startup.txt', new Map());
		index.updateFlowControlEvents(documentUri, events);
		index.updateLabels(documentUri, documentLabelsIndex);
		index.updateLabels(otherSceneUri, otherSceneLabelsIndex);
		index.updateSceneList([documentUri, otherSceneUri]);
		let fakeDocument = createDocument("Line 0\nLine 1\nother_label");
		let position = Position.create(2, 1);
		let fakeContext = Substitute.for<ReferenceContext>();
		fakeContext.includeDeclaration.returns(false);

		let references = findReferences(fakeDocument, position, fakeContext, index);

		expect(references.length).to.equal(1);
		expect(references[0].range.start).to.eql({line: 2, character: 0});
		expect(references[0].range.end).to.eql({line: 2, character: 5});
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
		let documentLabelsIndex: IdentifierIndex = new Map([["local_label", labelLocation]]);
		let otherSceneLabelLocation = Location.create(otherSceneUri, Range.create(7, 0, 7, 7));
		let otherSceneLabelsIndex: IdentifierIndex = new Map([["other_label", otherSceneLabelLocation]]);
		// The logic for finding label references is complex enough that I'll use an actual Index
		let index = new Index();
		index.updateFlowControlEvents(documentUri, events);
		index.updateLabels(documentUri, documentLabelsIndex);
		index.updateLabels(otherSceneUri, otherSceneLabelsIndex);
		let fakeDocument = createDocument("Line 0\nLine 1\nLine 2\nLine 3\nLine 4\nlocal_label");
		let position = Position.create(5, 1);
		let fakeContext = Substitute.for<ReferenceContext>();
		fakeContext.includeDeclaration.returns(false);

		let references = findReferences(fakeDocument, position, fakeContext, index);

		expect(references.length).to.equal(1);
		expect(references[0].range.start).to.eql({line: 2, character: 0});
		expect(references[0].range.end).to.eql({line: 2, character: 5});
	});
});

