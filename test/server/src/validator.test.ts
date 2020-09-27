/* eslint-disable */

import { expect } from 'chai';
import 'mocha';
import { Substitute, SubstituteOf, Arg } from '@fluffy-spoon/substitute';
import { Location, Range, Position } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { ProjectIndex, IdentifierIndex, IdentifierMultiIndex, DocumentScopes, FlowControlEvent, LabelIndex, Label } from '../../../server/src/index';
import { generateDiagnostics } from '../../../server/src/validator';

const fakeDocumentUri: string = "file:///faker.txt";
const fakeSceneUri: string = "file:///other-scene.txt";
const startupUri: string = "file:///startup.txt";

function createDocument(text: string, uri: string = fakeDocumentUri): SubstituteOf<TextDocument> {
	let fakeDocument = Substitute.for<TextDocument>();
	fakeDocument.getText(Arg.any()).returns(text);
	fakeDocument.uri.returns(uri);
	fakeDocument.positionAt(Arg.any()).mimicks((index: number) => { return (Position.create(index, 0)); });
	return fakeDocument;
}

interface IndexArgs {
	globalVariables?: IdentifierIndex;
	localVariables?: IdentifierMultiIndex;
	subroutineVariables?: IdentifierIndex;
	startupUri?: string;
	labels?: LabelIndex;
	labelsUri?: string;
	sceneList?: string[];
	sceneFileUri?: string;
	achievements?: IdentifierIndex;
	variableReferences?: IdentifierMultiIndex;
	flowControlEvents?: FlowControlEvent[];
	scopes?: DocumentScopes;
}

function createIndex({
	globalVariables, localVariables, subroutineVariables, startupUri, labels,
	labelsUri, sceneList, sceneFileUri, achievements,
	variableReferences, flowControlEvents, scopes }: IndexArgs): SubstituteOf<ProjectIndex> {
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
			choiceScopes: [],
			paramScopes: [],
		};
	}

	let fakeIndex = Substitute.for<ProjectIndex>();
	fakeIndex.getGlobalVariables().returns(globalVariables);
	fakeIndex.getLocalVariables(Arg.any()).returns(localVariables);
	fakeIndex.getSubroutineLocalVariables(Arg.any()).returns(subroutineVariables);
	fakeIndex.isStartupFileUri(Arg.any()).mimicks(uri => {
		return uri == startupUri;
	});
	fakeIndex.getSceneUri(Arg.any()).returns(sceneFileUri);
	fakeIndex.getSceneList().returns(sceneList);
	if (labelsUri === undefined) {
		fakeIndex.getLabels(Arg.any()).returns(labels);
	}
	else {
		fakeIndex.getLabels(labelsUri).returns(labels);
	}
	fakeIndex.getAchievements().returns(achievements);
	fakeIndex.getDocumentVariableReferences(Arg.all()).returns(variableReferences);
	fakeIndex.getDocumentScopes(Arg.all()).returns(scopes);
	fakeIndex.getFlowControlEvents(Arg.all()).returns(flowControlEvents);
	fakeIndex.getParseErrors(Arg.any()).returns([]);

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
		});

		it("shouldn't flag dashes in a comment", () => {
			let fakeDocument = createDocument("*comment Dashes--");
			let fakeIndex = createIndex({});

			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(0);
		});

		it("should flag too-long options", () => {
			let fakeDocument = createDocument("*choice\n\t#This option has too many words seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen.");
			let fakeIndex = createIndex({});

			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain("more than 15");
			expect(diagnostics[0].range.start.line).to.equal(102);
			expect(diagnostics[0].range.end.line).to.equal(110);
		});

		it("should not flag shorter options", () => {
			let fakeDocument = createDocument("*choice\n\t#This option has just enough words seven eight nine ten eleven twelve thirteen fourteen fifteen.");
			let fakeIndex = createIndex({});

			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(0);
		});

		it("should take multireplaces into account when counting words", () => {
			let fakeDocument = createDocument("*choice\n\t#This option appears to have @{true six seven eight nine ten | eleven twelve thirteen fourteen fifteen} words.");
			let fakeIndex = createIndex({});

			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(0);
		});

		it("should take the max words in the multireplaces into account when counting words", () => {
			let fakeDocument = createDocument("*choice\n\t#This option appears to have @{true six seven eight nine ten eleven twelve thirteen fourteen | six} fifteen words.");
			let fakeIndex = createIndex({});

			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain("more than 15");
			expect(diagnostics[0].range.start.line).to.equal(117);
			expect(diagnostics[0].range.end.line).to.equal(123);
		});

		it("should properly deal with no spaces before a multireplaces when counting words", () => {
			let fakeDocument = createDocument("*choice\n\t#This option appears to ha@{true ve six seven eight nine ten eleven twelve thirteen fourteen | ve six} words.");
			let fakeIndex = createIndex({});

			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(0);
		});

		it("should properly deal with no spaces after a multireplaces when counting words", () => {
			let fakeDocument = createDocument("*choice\n\t#This option appears to ha@{true ve six seven eight nine ten eleven twelve thirteen fourteen | ve six}, words.");
			let fakeIndex = createIndex({});

			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(0);
		});

		it("should properly deal with a multireplace at the start of the line", () => {
			let fakeDocument = createDocument("*choice\n\t#@{romance_expressed_hartmann Even though I like Hartmann, I make ${hartmann_him}|I make Hartmann} look better to Auguste, saying how well ${hartmann_he} @{hartmann_singular upholds|uphold} Gallatin traditions.");
			let fakeIndex = createIndex({});

			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain("more than 15");
			expect(diagnostics[0].range.start.line).to.equal(148);
			expect(diagnostics[0].range.end.line).to.equal(219);
		});

		it("should handle two multireplaces when counting words", () => {
			let fakeDocument = createDocument("*choice\n\t#This option appears to have @{true six seven eight | six} and @{true ten eleven twelve thirteen fourteen fifteen sixteen | ten} words.");
			let fakeIndex = createIndex({});

			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain("more than 15");
			expect(diagnostics[0].range.start.line).to.equal(123);
			expect(diagnostics[0].range.end.line).to.equal(144);
		});

		it("should include a multireplace in the error if it makes the option too long", () => {
			let fakeDocument = createDocument("*choice\n\t#This option appears to have six seven eight nine ten eleven twelve thirteen fourteen @{true fifteen sixteen | fifteen} words.");
			let fakeIndex = createIndex({});

			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain("more than 15");
			expect(diagnostics[0].range.start.line).to.equal(110);
			expect(diagnostics[0].range.end.line).to.equal(135);
		});
	});

	describe("Variable Reference Validation", () => {
		it("should flag missing variables", () => {
			let location = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let variableReferences: IdentifierMultiIndex = new Map([["unknown", [location]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ variableReferences: variableReferences });

			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.include('"unknown" not defined');
		});

		it("should not flag existing local variables", () => {
			let createLocation = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let localVariables = new Map([["local_var", [createLocation]]]);
			let variableReferences: IdentifierMultiIndex = new Map([["local_var", [referenceLocation]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ localVariables: localVariables, variableReferences: variableReferences });

			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(0);
		});

		it("should flag a local variable referenced before it's created", () => {
			let createLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let localVariables = new Map([["local_var", [createLocation]]]);
			let variableReferences: IdentifierMultiIndex = new Map([["local_var", [referenceLocation]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ localVariables: localVariables, variableReferences: variableReferences });

			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.include('"local_var" used before it was created');
		});

		it("should not flag a local variable with a second creation location after the reference", () => {
			let createLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let otherCreateLocation = Location.create(fakeDocumentUri, Range.create(5, 0, 5, 5));
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(3, 0, 3, 5));
			let localVariables = new Map([["local_var", [createLocation, otherCreateLocation]]]);
			let variableReferences: IdentifierMultiIndex = new Map([["local_var", [referenceLocation]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ localVariables: localVariables, variableReferences: variableReferences });

			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(0);
		});

		it("should not flag a local variable referenced before it's created if a global variable exists", () => {
			let localCreateLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let globalCreateLocation = Location.create(startupUri, Range.create(2, 0, 2, 5));
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let localVariables = new Map([["var", [localCreateLocation]]]);
			let globalVariables: Map<string, Location> = new Map([["var", globalCreateLocation]]);
			let variableReferences: IdentifierMultiIndex = new Map([["var", [referenceLocation]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({
				startupUri: startupUri,
				localVariables: localVariables,
				globalVariables: globalVariables,
				variableReferences: variableReferences
			});

			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			// We'll get a warning about a local var having the same name as a global var, but no error
			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.include('"var" has the same name as a global');
		});

		it("should not flag a local variable created through a gosub", () => {
			let gosubLocation = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let createLocation = Location.create(fakeDocumentUri, Range.create(21, 0, 21, 5));
			let localVariables = new Map([["local_var", [createLocation]]]);
			let subroutineVariables: Map<string, Location> = new Map([["local_var", gosubLocation]]);
			let variableReferences: IdentifierMultiIndex = new Map([["local_var", [referenceLocation]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({
				localVariables: localVariables, variableReferences: variableReferences, subroutineVariables: subroutineVariables
			});

			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(0);
		});

		it("should not flag existing global variables", () => {
			let createLocation = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let globalVariables: Map<string, Location> = new Map([["global_var", createLocation]]);
			let variableReferences: IdentifierMultiIndex = new Map([["global_var", [referenceLocation]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ globalVariables: globalVariables, variableReferences: variableReferences });

			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(0);
		});

		it("should flag a global variable referenced before it's created", () => {
			let createLocation = Location.create(startupUri, Range.create(2, 0, 2, 5));
			let referenceLocation = Location.create(startupUri, Range.create(1, 0, 1, 5));
			let globalVariables: Map<string, Location> = new Map([["global_var", createLocation]]);
			let variableReferences: IdentifierMultiIndex = new Map([["global_var", [referenceLocation]]]);
			let fakeDocument = createDocument("placeholder", startupUri);
			let fakeIndex = createIndex({ globalVariables: globalVariables, variableReferences: variableReferences });

			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.include('"global_var" used before it was created');
		});

		it("should not flag built-in variables", () => {
			let variableReferences: IdentifierMultiIndex = new Map([["choice_randomtest", [Substitute.for<Location>()]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ variableReferences: variableReferences });

			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(0);
		});

		it("should flag achievement variables if not instantiated", () => {
			let achievements: Map<string, Location> = new Map([["codename", Substitute.for<Location>()]]);
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let variableReferences: IdentifierMultiIndex = new Map([["choice_achieved_codename", [referenceLocation]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ variableReferences: variableReferences, achievements: achievements });

			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('Variable "choice_achieved_codename" not defined');
		});

		it("should not flag achievement variables after instantiation", () => {
			let achievements: Map<string, Location> = new Map([["codename", Substitute.for<Location>()]]);
			let scopes: DocumentScopes = {
				achievementVarScopes: [Range.create(1, 0, 4, 0)],
				choiceScopes: [],
				paramScopes: [],
			};
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let variableReferences: IdentifierMultiIndex = new Map([["choice_achieved_codename", [referenceLocation]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ variableReferences: variableReferences, achievements: achievements, scopes: scopes });

			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(0);
		});

		it("should flag incorrect achievement variables", () => {
			let achievements: Map<string, Location> = new Map([["codename", Substitute.for<Location>()]]);
			let scopes: DocumentScopes = {
				achievementVarScopes: [Range.create(1, 0, 4, 0)],
				choiceScopes: [],
				paramScopes: [],
			};
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let variableReferences: IdentifierMultiIndex = new Map([["choice_achieved_othername", [referenceLocation]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ variableReferences: variableReferences, achievements: achievements, scopes: scopes });


			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('Variable "choice_achieved_othername" not defined');
		});

		it("should not flag params variables after instantiation", () => {
			let scopes: DocumentScopes = {
				achievementVarScopes: [],
				paramScopes: [Range.create(1, 0, 4, 0)],
				choiceScopes: []
			};
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let variableReferences: IdentifierMultiIndex = new Map([["param_1", [referenceLocation]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ variableReferences: variableReferences, scopes: scopes });

			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(0);
		});
	});

	describe("All Commands Validation", () => {
		it("should flag commands with text in front of them", () => {
			let fakeDocument = createDocument("Leading text *if This is illegal!");
			let fakeIndex = createIndex({});

			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain("*if should be on a line by itself");
		});

		it("should not flag a command with *hide_reuse or similar before it", () => {
			let fakeDocument = createDocument("*hide_reuse *if var");
			let fakeIndex = createIndex({});

			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(0);
		});
	});

	describe("Variable Creation Commands Validation", () => {
		it("should flag local variables with the same name as global ones", () => {
			let createLocation = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let globalVariables = new Map([["global_var", createLocation]]);
			let localVariables = new Map([["global_var", [Substitute.for<Location>()]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ globalVariables: globalVariables, localVariables: localVariables });

			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('"global_var" has the same name as a global variable');
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

		it("should not flag a reference as missing labels", () => {
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "goto",
				commandLocation: Substitute.for<Location>(),
				label: "{local_label}",
				labelLocation: referenceLocation,
				scene: ""
			}];
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ flowControlEvents: events });

			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(0);
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

			expect(diagnostics[0].range.start).to.eql({ line: 2, character: 0 });
			expect(diagnostics[0].range.end).to.eql({ line: 2, character: 5 });
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
			let localLabels: Map<string, Label> = new Map([["local_label", Substitute.for<Label>()]]);
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
			let fakeIndex = createIndex({ flowControlEvents: events });

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
			let fakeIndex = createIndex({ flowControlEvents: events });

			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics[0].range.start).to.eql({ line: 2, character: 0 });
			expect(diagnostics[0].range.end).to.eql({ line: 2, character: 5 });
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
			let sceneLabels: Map<string, Label> = new Map([["scene_label", Substitute.for<Label>()]]);
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
			let sceneLabels: Map<string, Label> = new Map([["scene_label", Substitute.for<Label>()]]);
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
				sceneList: ['other-scene'], sceneFileUri: fakeSceneUri
			});

			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('Label "missing_label" wasn\'t found');
		});

		it("should not flag references in labels, even in another scene", () => {
			let sceneLabels: Map<string, Label> = new Map([["scene_label", Substitute.for<Label>()]]);
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "gosub_scene",
				commandLocation: Substitute.for<Location>(),
				label: "{missing_label}",
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
	});

	describe("Indent Validation", () => {
		it("should flag a switch from spaces to tabs", () => {
			let fakeDocument = createDocument("*if true\n  indent\n*if false\n\tindent");
			let fakeIndex = createIndex({});

			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('Switched from spaces to tabs');
			expect(diagnostics[0].range.start.line).to.equal(28);
			expect(diagnostics[0].range.end.line).to.equal(29);
		});

		it("should flag a switch from tabs to spaces", () => {
			let fakeDocument = createDocument("*if true\n\tindent\n*if false\n  indent");
			let fakeIndex = createIndex({});

			let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('Switched from tabs to spaces');
			expect(diagnostics[0].range.start.line).to.equal(27);
			expect(diagnostics[0].range.end.line).to.equal(29);
		});
	});
});
