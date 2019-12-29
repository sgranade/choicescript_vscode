import { expect } from 'chai';
import 'mocha';
import { Substitute, SubstituteOf, Arg } from '@fluffy-spoon/substitute';
import { Location, Range, TextDocument } from 'vscode-languageserver';

import { ProjectIndex, IdentifierIndex, VariableReferenceIndex, DocumentScopes, LabelReferenceIndex, FlowControlEvent } from '../../../server/src/index';
import { generateDiagnostics } from '../../../server/src/validator';

const fakeDocumentUri: string = "file:///faker.txt";
const fakeSceneUri: string = "file:///other-scene.txt";

function createDocument(text: string, uri: string = fakeDocumentUri): SubstituteOf<TextDocument> {
	let fakeDocument = Substitute.for<TextDocument>();
	fakeDocument.getText(Arg.any()).returns(text);
	fakeDocument.uri.returns(uri);
	return fakeDocument;
}

interface IndexArgs {
	globalVariables?: IdentifierIndex,
	localVariables?: IdentifierIndex,
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
	globalVariables, localVariables, startupUri, labels, 
	labelsUri, sceneList, sceneFileUri, achievements, 
	variableReferences, flowControlEvents, scopes}: IndexArgs): SubstituteOf<ProjectIndex> {
		if (globalVariables === undefined) {
			globalVariables = new Map();
		}
		if (localVariables === undefined) {
			localVariables = new Map();
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

describe("Validator", () => {
	describe("Style Validation", () => {
		it("should flag ellipses", () => {
			let fakeDocument = createDocument("Ellipses...");
			let fakeIndex = createIndex({});
	
			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);
	
			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain("ellipsis");
		});
	
		it("should flag dashes", () => {
			let fakeDocument = createDocument("Dashes--");
			let fakeIndex = createIndex({});
	
			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);
	
			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain("em-dash");
		})
	});
	
	describe("Variable Validation", () => {
		it("should flag missing variables", () => {
			let location = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let variableReferences: VariableReferenceIndex = new Map([["unknown", [location]]])
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ variableReferences: variableReferences });
	
			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.include('"unknown" not defined');
		});

		it("should not flag existing local variables", () => {
			let createLocation = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let localVariables: Map<string, Location> = new Map([["local_var", createLocation]]);
			let variableReferences: VariableReferenceIndex = new Map([["local_var", [referenceLocation]]])
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ localVariables: localVariables, variableReferences: variableReferences });
	
			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(0);
		});

		it("should flag a local variable referenced before it's created", () => {
			let createLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let localVariables: Map<string, Location> = new Map([["local_var", createLocation]]);
			let variableReferences: VariableReferenceIndex = new Map([["local_var", [referenceLocation]]])
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ localVariables: localVariables, variableReferences: variableReferences });
	
			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.include('"local_var" used before it was created');
		});

		it("should not flag existing global variables", () => {
			let createLocation = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let globalVariables: Map<string, Location> = new Map([["global_var", createLocation]]);
			let variableReferences: VariableReferenceIndex = new Map([["global_var", [referenceLocation]]])
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ globalVariables: globalVariables, variableReferences: variableReferences });
	
			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(0);
		});

		it("should flag a global variable referenced before it's created", () => {
			let createLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let globalVariables: Map<string, Location> = new Map([["global_var", createLocation]]);
			let variableReferences: VariableReferenceIndex = new Map([["global_var", [referenceLocation]]])
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ globalVariables: globalVariables, variableReferences: variableReferences });
	
			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.include('"global_var" used before it was created');
		});

		it("should not flag built-in variables", () => {
			let variableReferences: VariableReferenceIndex = new Map([["choice_randomtest", [Substitute.for<Location>()]]])
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ variableReferences: variableReferences });
	
			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(0);
		});

		it("should flag achievement variables if not instantiated", () => {
			let achievements: Map<string, Location> = new Map([["codename", Substitute.for<Location>()]]);
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let variableReferences: VariableReferenceIndex = new Map([["choice_achieved_codename", [referenceLocation]]])
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({variableReferences: variableReferences, achievements: achievements});
	
			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);
	
			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('Variable "choice_achieved_codename" not defined');
		});
	
		it("should not flag achievement variables after instantiation", () => {
			let achievements: Map<string, Location> = new Map([["codename", Substitute.for<Location>()]]);
			let scopes: DocumentScopes = {
				achievementVarScopes: [Range.create(1, 0, 4, 0)],
				paramScopes: []
			};
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let variableReferences: VariableReferenceIndex = new Map([["choice_achieved_codename", [referenceLocation]]])
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({variableReferences: variableReferences, achievements: achievements, scopes: scopes});
	
			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);
	
			expect(diagnostics.length).to.equal(0);
		});
	
		it("should flag incorrect achievement variables", () => {
			let achievements: Map<string, Location> = new Map([["codename", Substitute.for<Location>()]]);
			let scopes: DocumentScopes = {
				achievementVarScopes: [Range.create(1, 0, 4, 0)],
				paramScopes: []
			};
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let variableReferences: VariableReferenceIndex = new Map([["choice_achieved_othername", [referenceLocation]]])
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({variableReferences: variableReferences, achievements: achievements, scopes: scopes});

			
			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);
	
			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('Variable "choice_achieved_othername" not defined');
		});

		it("should not flag params variables after instantiation", () => {
			let scopes: DocumentScopes = {
				achievementVarScopes: [],
				paramScopes: [Range.create(1, 0, 4, 0)]
			};
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let variableReferences: VariableReferenceIndex = new Map([["param_1", [referenceLocation]]])
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({variableReferences: variableReferences, scopes: scopes});
	
			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);
	
			expect(diagnostics.length).to.equal(0);
		});
	});
	
	describe("All Commands Validation", () => {
		it("should flag commands with text in front of them", () => {
			// TODO FIX ME
			let fakeDocument = createDocument("Leading text *comment This is illegal!");
			let fakeIndex = createIndex({});
	
			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);
	
			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain("Command *comment can't have other text");
		});
	});
	
	describe("Label Reference Commands Validation", () => {
		it("should flag missing labels", () => {
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "goto",
				commandLocation: Substitute.for<Location>(),
				label: "local_label",
				labelLocation: referenceLocation,
				scene: ""
			}];
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ flowControlEvents: events });
	
			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);
	
			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('Label "local_label" wasn\'t found');
		});
	
		it("should flag missing label locations", () => {
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "goto",
				commandLocation: Substitute.for<Location>(),
				label: "local_label",
				labelLocation: referenceLocation,
				scene: ""
			}];
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ flowControlEvents: events });
	
			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);
	
			expect(diagnostics[0].range.start).to.eql({line: 2, character: 0});
			expect(diagnostics[0].range.end).to.eql({line: 2, character: 5});
		});
		
		it("should be good with local labels", () => {
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "goto",
				commandLocation: Substitute.for<Location>(),
				label: "local_label",
				labelLocation: referenceLocation,
				scene: ""
			}];
			let localLabels: Map<string, Location> = new Map([["local_label", Substitute.for<Location>()]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({
				labels: localLabels, labelsUri: fakeDocumentUri, flowControlEvents: events
			});
	
			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);
	
			expect(diagnostics.length).to.equal(0);
		});
	
		it("should be good with jumping to another scene without a label", () => {
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "goto_scene",
				commandLocation: Substitute.for<Location>(),
				label: "",
				scene: "scene_name",
				sceneLocation: referenceLocation
			}];
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({
				sceneList: ['scene_name'], flowControlEvents: events
			});
	
			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);
	
			expect(diagnostics.length).to.equal(0);
		});
	
		it("should flag bad scene names", () => {
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "goto_scene",
				commandLocation: Substitute.for<Location>(),
				label: "",
				scene: "missing_scene",
				sceneLocation: referenceLocation
			}];
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({flowControlEvents: events});
	
			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);
	
			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('Scene "missing_scene" wasn\'t found');
		});
	
		it("should flag the location of bad scene names", () => {
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "goto_scene",
				commandLocation: Substitute.for<Location>(),
				label: "",
				scene: "missing_scene",
				sceneLocation: referenceLocation
			}];
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({flowControlEvents: events});
	
			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);
	
			expect(diagnostics[0].range.start).to.eql({line: 2, character: 0});
			expect(diagnostics[0].range.end).to.eql({line: 2, character: 5});
		});
	
		it("should be good with hyphenated scene names", () => {
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "gosub_scene",
				commandLocation: Substitute.for<Location>(),
				label: "",
				scene: "scene-name",
				sceneLocation: referenceLocation
			}];
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({
				sceneList: ['scene-name'], flowControlEvents: events
			});	
			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);
	
			expect(diagnostics.length).to.equal(0);
		});
	
		it("should be good with labels in another scene", () => {
			let sceneLabels: Map<string, Location> = new Map([["scene_label", Substitute.for<Location>()]]);
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "gosub_scene",
				commandLocation: Substitute.for<Location>(),
				label: "scene_label",
				labelLocation: referenceLocation,
				scene: "other-scene",
				sceneLocation: referenceLocation
			}];
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({
				flowControlEvents: events,
				labels: sceneLabels, labelsUri: fakeSceneUri, 
				sceneList: ['other-scene'], sceneFileUri: fakeSceneUri
			});
	
			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);
	
			expect(diagnostics.length).to.equal(0);
		});
	
		it("should flag missing labels in another scene", () => {
			let sceneLabels: Map<string, Location> = new Map([["scene_label", Substitute.for<Location>()]]);
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "gosub_scene",
				commandLocation: Substitute.for<Location>(),
				label: "missing_label",
				labelLocation: referenceLocation,
				scene: "other-scene",
				sceneLocation: referenceLocation
			}];
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({
				flowControlEvents: events,
				labels: sceneLabels, labelsUri: fakeSceneUri, 
				sceneList: ['other-scene'], sceneFileUri: fakeSceneUri})
	
			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);
	
			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('Label "missing_label" wasn\'t found');
		});
	});
})
