import { expect } from 'chai';
import 'mocha';
import { Substitute, SubstituteOf, Arg } from '@fluffy-spoon/substitute';
import { TextDocument, Position, Location, Range } from 'vscode-languageserver';

import { 
	ProjectIndex, 
	IdentifierIndex, 
	VariableReferenceIndex, 
	FlowControlEvent, 
	DocumentScopes 
} from '../../../server/src/index';
import { findDefinition, DefinitionType } from '../../../server/src/searches';

const fakeDocumentUri: string = "file:///faker.txt";
const fakeSceneUri: string = "file:///other-scene.txt";

function createDocument(text: string, uri: string = fakeDocumentUri): SubstituteOf<TextDocument> {
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
	labels?: IdentifierIndex,
	labelsUri?: string,
	sceneList?: string[],
	sceneFileUri?: string,
	achievements?: IdentifierIndex,
	variableReferences?: VariableReferenceIndex,
	flowControlEvents?: FlowControlEvent[],
	scopes?: DocumentScopes
}

function createIndex({
	globalVariables, localVariables, subroutineVariables, startupUri, labels, 
	labelsUri, sceneList, sceneFileUri, achievements, 
	variableReferences, flowControlEvents, scopes}: IndexArgs): SubstituteOf<ProjectIndex> {
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
			sceneFileUri = fakeSceneUri;
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
		fakeIndex.getSceneUri(Arg.any()).returns(sceneFileUri);
		fakeIndex.getSceneList().returns(sceneList);
		if (labelsUri === undefined) {
			fakeIndex.getLabels(Arg.any()).returns(labels);
		}
		else {
			fakeIndex.getLabels(labelsUri).returns(labels);
		}
		fakeIndex.getAchievements(Arg.any()).returns(achievements);
		fakeIndex.getDocumentVariableReferences(Arg.all()).returns(variableReferences);
		fakeIndex.getVariableScopes(Arg.all()).returns(scopes);
		fakeIndex.getFlowControlEvents(Arg.all()).returns(flowControlEvents);
	
		return fakeIndex;
}

describe("Definitions", () => {
	describe("Variable Definitions", () => {
		it("should not give definitions for non-references", () => {
			let createLocation = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let localVariables: Map<string, Location> = new Map([["local_var", createLocation]]);
			let fakeDocument = createDocument("Non-reference local_var");
			let position = Position.create(0, 16);
			let fakeIndex = createIndex({ localVariables: localVariables });
	
			let definition = findDefinition(fakeDocument, position, fakeIndex);
	
			expect(definition.type).to.be.undefined;
			expect(definition.location).to.be.undefined;
		});

		it("should locate local variable references", () => {
			let createLocation = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let localVariables: Map<string, Location> = new Map([["local_var", createLocation]]);
			let variableReferences: VariableReferenceIndex = new Map([["local_var", [referenceLocation]]])
			let fakeDocument = createDocument("placeholder");
			let position = Position.create(2, 2);
			let fakeIndex = createIndex({ localVariables: localVariables, variableReferences: variableReferences });
	
			let definition = findDefinition(fakeDocument, position, fakeIndex);
	
			expect(definition.type).to.equal(DefinitionType.Variable);
			expect(definition.location.range.start).to.eql({line: 1, character: 0});
			expect(definition.location.range.end).to.eql({line: 1, character: 5});
		});

		it("should locate global variable references", () => {
			let createLocation = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let globalVariables: Map<string, Location> = new Map([["global_var", createLocation]]);
			let variableReferences: VariableReferenceIndex = new Map([["global_var", [referenceLocation]]])
			let fakeDocument = createDocument("placeholder");
			let position = Position.create(2, 2);
			let fakeIndex = createIndex({ globalVariables: globalVariables, variableReferences: variableReferences });
	
			let definition = findDefinition(fakeDocument, position, fakeIndex);
	
			expect(definition.type).to.equal(DefinitionType.Variable);
			expect(definition.location.range.start).to.eql({line: 1, character: 0});
			expect(definition.location.range.end).to.eql({line: 1, character: 5});
		});

		it("should locate achievement references", () => {
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let achievementLocation = Location.create(fakeDocumentUri, Range.create(5, 0, 5, 5));
			let variableReferences: VariableReferenceIndex = new Map([["choice_achieved_codename", [referenceLocation]]])
			let achievementsIndex: IdentifierIndex = new Map([["codename", achievementLocation]]);
			let fakeDocument = createDocument("placeholder");
			let position = Position.create(2, 2);
			let fakeIndex = createIndex({ variableReferences: variableReferences, achievements: achievementsIndex });
	
			let definition = findDefinition(fakeDocument, position, fakeIndex);
	
			expect(definition.type).to.equal(DefinitionType.Achievement);
			expect(definition.location.range.start).to.eql({line: 5, character: 0});
			expect(definition.location.range.end).to.eql({line: 5, character: 5});
		});
	});

	describe("Variable Definitions", () => {
		it("should locate local labels", () => {
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "goto",
				commandLocation: Substitute.for<Location>(),
				label: "local_label",
				labelLocation: referenceLocation,
				scene: ""
			}];
			let labelLocation = Location.create(fakeDocumentUri, Range.create(5, 0, 5, 5));
			let labelsIndex: IdentifierIndex = new Map([["local_label", labelLocation]]);
			let fakeDocument = createDocument("placeholder");
			let position = Position.create(2, 2);
			let fakeIndex = createIndex({ labels: labelsIndex, flowControlEvents: events });
	
			let definition = findDefinition(fakeDocument, position, fakeIndex);
	
			expect(definition.type).to.equal(DefinitionType.Label);
			expect(definition.location.range.start).to.eql({line: 5, character: 0});
			expect(definition.location.range.end).to.eql({line: 5, character: 5});
		});

		it("should locate global labels", () => {
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "goto_scene",
				commandLocation: Substitute.for<Location>(),
				label: "other_label",
				labelLocation: referenceLocation,
				scene: "other-scene"
			}];
			let labelLocation = Location.create(fakeSceneUri, Range.create(5, 0, 5, 5));
			let labelsIndex: IdentifierIndex = new Map([["other_label", labelLocation]]);
			let fakeDocument = createDocument("placeholder");
			let position = Position.create(2, 2);
			let fakeIndex = createIndex({ labels: labelsIndex, sceneFileUri: fakeSceneUri, flowControlEvents: events });
	
			let definition = findDefinition(fakeDocument, position, fakeIndex);
	
			expect(definition.type).to.equal(DefinitionType.Label);
			expect(definition.location.uri).to.equal(fakeSceneUri);
			expect(definition.location.range.start).to.eql({line: 5, character: 0});
			expect(definition.location.range.end).to.eql({line: 5, character: 5});
		});
	});
});
