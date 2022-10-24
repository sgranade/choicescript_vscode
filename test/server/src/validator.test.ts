/* eslint-disable */

import * as path from 'path';

import * as mock from 'mock-fs';
import { expect } from 'chai';
import 'mocha';
import { Substitute, SubstituteOf, Arg } from '@fluffy-spoon/substitute';
import { Location, Range, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { ProjectIndex, IdentifierIndex, IdentifierMultiIndex, DocumentScopes, FlowControlEvent, LabelIndex, Label, AchievementIndex } from '../../../server/src/index';
import { CaseInsensitiveMap } from '../../../server/src/utilities';
import { generateDiagnostics, ValidationSettings } from '../../../server/src/validator';

const fakeDocumentUri: string = "file:///faker.txt";
const fakeSceneUri: string = "file:///other-scene.txt";
const startupUri: string = "file:///startup.txt";

function createDocument(text: string, uri: string = fakeDocumentUri): SubstituteOf<TextDocument> {
	let fakeDocument = Substitute.for<TextDocument>();
	fakeDocument.getText(Arg.any()).returns(text);
	fakeDocument.uri.returns!(uri);
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
	achievements?: AchievementIndex;
	variableReferences?: IdentifierMultiIndex;
	flowControlEvents?: FlowControlEvent[];
	scopes?: DocumentScopes;
	images?: IdentifierMultiIndex;
	projectIsIndexed?: boolean;
}

function createIndex({
	globalVariables, localVariables, subroutineVariables, startupUri, labels,
	labelsUri, sceneList, sceneFileUri, achievements,
	variableReferences, flowControlEvents, scopes, images,
	projectIsIndexed }: IndexArgs): SubstituteOf<ProjectIndex> {
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
		achievements = new CaseInsensitiveMap();
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
	if (images === undefined) {
		images = new CaseInsensitiveMap();
	}
	if (projectIsIndexed === undefined) {
		projectIsIndexed = true;
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
	fakeIndex.getIndexedScenes().returns(sceneList);
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
	fakeIndex.getImages(Arg.any()).returns(images);
	fakeIndex.projectIsIndexed().returns(projectIsIndexed);

	return fakeIndex;
}

function createValidationSettings(useCoGStyleGuide: boolean=true): SubstituteOf<ValidationSettings> {
	let fakeSettings = Substitute.for<ValidationSettings>();
	fakeSettings.useCoGStyleGuide = useCoGStyleGuide;
	return fakeSettings;
}

describe("Validator", () => {
	describe("Style Validation", () => {
		it("should flag ellipses", () => {
			let fakeDocument = createDocument("Ellipses...");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain("ellipsis");
		});

		it("should flag dashes", () => {
			let fakeDocument = createDocument("Dashes--");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain("em-dash");
		});

		it("shouldn't flag dashes in a comment", () => {
			let fakeDocument = createDocument("*comment Dashes--");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(0);
		});

		it("should flag too-long options", () => {
			let fakeDocument = createDocument("*choice\n\t#This option has too many words seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen.");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain("more than 15");
			expect(diagnostics[0].range.start.line).to.equal(102);
			expect(diagnostics[0].range.end.line).to.equal(110);
		});

		it("should not flag shorter options", () => {
			let fakeDocument = createDocument("*choice\n\t#This option has just enough words seven eight nine ten eleven twelve thirteen fourteen fifteen.");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(0);
		});

		it("should not count the # in an option as a word", () => {
			let fakeDocument = createDocument("*choice\n\t# This option has four five six seven eight nine ten eleven twelve thirteen fourteen fifteen.");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(0);
		});

		it("should take multireplaces into account when counting words", () => {
			let fakeDocument = createDocument("*choice\n\t#This option appears to have @{true six seven eight nine ten | eleven twelve thirteen fourteen fifteen} words.");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(0);
		});

		it("should take the max words in the multireplaces into account when counting words", () => {
			let fakeDocument = createDocument("*choice\n\t#This option appears to have @{true six seven eight nine ten eleven twelve thirteen fourteen | six} fifteen words.");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain("more than 15");
			expect(diagnostics[0].range.start.line).to.equal(117);
			expect(diagnostics[0].range.end.line).to.equal(123);
		});

		it("should properly deal with no spaces before a multireplaces when counting words", () => {
			let fakeDocument = createDocument("*choice\n\t#This option appears to ha@{true ve six seven eight nine ten eleven twelve thirteen fourteen | ve six} words.");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(0);
		});

		it("should properly deal with no spaces after a multireplaces when counting words", () => {
			let fakeDocument = createDocument("*choice\n\t#This option appears to ha@{true ve six seven eight nine ten eleven twelve thirteen fourteen | ve six}, words.");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(0);
		});

		it("should properly deal with a multireplace at the start of the line", () => {
			let fakeDocument = createDocument("*choice\n\t#@{romance_expressed_hartmann Even though I like Hartmann, I make ${hartmann_him}|I make Hartmann} look better to Auguste, saying how well ${hartmann_he} @{hartmann_singular upholds|uphold} Gallatin traditions.");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain("more than 15");
			expect(diagnostics[0].range.start.line).to.equal(148);
			expect(diagnostics[0].range.end.line).to.equal(219);
		});

		it("should properly deal with a multireplace at the start of the line and a space at the end", () => {
			let fakeDocument = createDocument("*choice\n\t#@{var It goes against Practicum rules, but |}I talk to Kayla. I wonder if she'll believe in ");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(0);
		});

		it("should handle two multireplaces when counting words", () => {
			let fakeDocument = createDocument("*choice\n\t#This option appears to have @{true six seven eight | six} and @{true ten eleven twelve thirteen fourteen fifteen sixteen | ten} words.");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain("more than 15");
			expect(diagnostics[0].range.start.line).to.equal(123);
			expect(diagnostics[0].range.end.line).to.equal(144);
		});

		it("should ignore multireplaces with no body when counting words", () => {
			let fakeDocument = createDocument("*choice\n\t#This option has @{true} four five six seven eight nine ten eleven twelve thirteen fourteen words.");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(0);
		});

		it("should include a multireplace in the error if it makes the option too long", () => {
			let fakeDocument = createDocument("*choice\n\t#This option appears to have six seven eight nine ten eleven twelve thirteen fourteen @{true fifteen sixteen | fifteen} words.");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain("more than 15");
			expect(diagnostics[0].range.start.line).to.equal(110);
			expect(diagnostics[0].range.end.line).to.equal(135);
		});

		it("should handle two multireplaces, one with no body, when counting words", () => {
			let fakeDocument = createDocument("*choice\n\t#This option appears to have @{true} six seven eight and @{true ten eleven twelve thirteen fourteen fifteen sixteen | ten} words.");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain("more than 15");
			expect(diagnostics[0].range.start.line).to.equal(117);
			expect(diagnostics[0].range.end.line).to.equal(138);
		});
	});

	describe("Variable Reference Validation", () => {
		it("should flag missing variables", () => {
			let location = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["unknown", [location]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ variableReferences: variableReferences });
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.include('"unknown" not defined');
		});

		it("should not flag missing variables if the project hasn't been indexed", () => {
			let location = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["unknown", [location]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ variableReferences: variableReferences, projectIsIndexed: false });
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(0);
		});

		it("should not flag existing local variables", () => {
			let createLocation = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let localVariables = new CaseInsensitiveMap([["local_var", [createLocation]]]);
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["local_var", [referenceLocation]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ localVariables: localVariables, variableReferences: variableReferences });
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(0);
		});

		it("should flag a local variable referenced before it's created", () => {
			let createLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let localVariables = new CaseInsensitiveMap([["local_var", [createLocation]]]);
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["local_var", [referenceLocation]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ localVariables: localVariables, variableReferences: variableReferences });
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.include('"local_var" used before it was created');
		});

		it("should not flag a local variable with a second creation location after the reference", () => {
			let createLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let otherCreateLocation = Location.create(fakeDocumentUri, Range.create(5, 0, 5, 5));
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(3, 0, 3, 5));
			let localVariables = new CaseInsensitiveMap([["local_var", [createLocation, otherCreateLocation]]]);
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["local_var", [referenceLocation]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ localVariables: localVariables, variableReferences: variableReferences });
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			// We do get a warning for the variable re-creation though
			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.include('"local_var" was defined earlier');
		});

		it("should not flag a local variable referenced before it's created if a global variable exists", () => {
			let localCreateLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let globalCreateLocation = Location.create(startupUri, Range.create(2, 0, 2, 5));
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let localVariables = new CaseInsensitiveMap([["var", [localCreateLocation]]]);
			let globalVariables: CaseInsensitiveMap<string, Location> = new CaseInsensitiveMap([["var", globalCreateLocation]]);
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["var", [referenceLocation]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({
				startupUri: startupUri,
				localVariables: localVariables,
				globalVariables: globalVariables,
				variableReferences: variableReferences
			});
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			// We'll get a warning about a local var having the same name as a global var, but no error
			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.include('"var" has the same name as a global');
		});

		it("should not flag a local variable created through a gosub", () => {
			let gosubLocation = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let createLocation = Location.create(fakeDocumentUri, Range.create(21, 0, 21, 5));
			let localVariables = new CaseInsensitiveMap([["local_var", [createLocation]]]);
			let subroutineVariables: CaseInsensitiveMap<string, Location> = new CaseInsensitiveMap([["local_var", gosubLocation]]);
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["local_var", [referenceLocation]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({
				localVariables: localVariables, variableReferences: variableReferences, subroutineVariables: subroutineVariables
			});
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(0);
		});

		it("should not flag existing global variables", () => {
			let createLocation = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let globalVariables: CaseInsensitiveMap<string, Location> = new CaseInsensitiveMap([["global_var", createLocation]]);
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["global_var", [referenceLocation]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ globalVariables: globalVariables, variableReferences: variableReferences });
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(0);
		});

		it("should flag a global variable referenced before it's created", () => {
			let createLocation = Location.create(startupUri, Range.create(2, 0, 2, 5));
			let referenceLocation = Location.create(startupUri, Range.create(1, 0, 1, 5));
			let globalVariables: CaseInsensitiveMap<string, Location> = new CaseInsensitiveMap([["global_var", createLocation]]);
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["global_var", [referenceLocation]]]);
			let fakeDocument = createDocument("placeholder", startupUri);
			let fakeIndex = createIndex({ globalVariables: globalVariables, variableReferences: variableReferences });
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.include('"global_var" used before it was created');
		});

		it("should not flag built-in variables", () => {
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["choice_randomtest", [Substitute.for<Location>()]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ variableReferences: variableReferences });
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(0);
		});

		it("should not flag param count", () => {
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["param_count", [Substitute.for<Location>()]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ variableReferences: variableReferences });
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(0);
		});

		it("should flag a non-param-count variable whose name contains 'param_count'", () => {
			let location1 = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let location2 = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([
				["not_actually_param_count", [location1]],
				["param_counter", [location2]],
			]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ variableReferences: variableReferences });
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(2);
			expect(diagnostics[0].message).to.include('"not_actually_param_count" not defined');
			expect(diagnostics[1].message).to.include('"param_counter" not defined');
		});

		it("should not flag param variables", () => {
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["param_2", [Substitute.for<Location>()]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ variableReferences: variableReferences });
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(0);
		});

		it("should flag a non-param-variable variable whose name contains e.g. 'param_1'", () => {
			let location1 = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let location2 = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([
				["not_param_1", [location1]],
				["param_2e", [location2]],
			]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ variableReferences: variableReferences });
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(2);
			expect(diagnostics[0].message).to.include('"not_param_1" not defined');
			expect(diagnostics[1].message).to.include('"param_2e" not defined');
		});

		it("should flag achievement variables if not instantiated", () => {
			let achievements: CaseInsensitiveMap<string, [Location, number, string]> = new CaseInsensitiveMap([["codename", [Substitute.for<Location>(), 0, ""]]]);
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["choice_achieved_codename", [referenceLocation]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ variableReferences: variableReferences, achievements: achievements });
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('Variable "choice_achieved_codename" not defined');
		});

		it("should not flag achievement variables after instantiation", () => {
			let achievements: CaseInsensitiveMap<string, [Location, number, string]> = new CaseInsensitiveMap([["codename", [Substitute.for<Location>(), 0, ""]]]);
			let scopes: DocumentScopes = {
				achievementVarScopes: [Range.create(1, 0, 4, 0)],
				choiceScopes: [],
				paramScopes: [],
			};
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["choice_achieved_codename", [referenceLocation]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ variableReferences: variableReferences, achievements: achievements, scopes: scopes });
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(0);
		});

		it("should flag incorrect achievement variables", () => {
			let achievements: CaseInsensitiveMap<string, [Location, number, string]> = new CaseInsensitiveMap([["codename", [Substitute.for<Location>(), 0, ""]]]);
			let scopes: DocumentScopes = {
				achievementVarScopes: [Range.create(1, 0, 4, 0)],
				choiceScopes: [],
				paramScopes: [],
			};
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["choice_achieved_othername", [referenceLocation]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ variableReferences: variableReferences, achievements: achievements, scopes: scopes });

			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

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
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["param_1", [referenceLocation]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ variableReferences: variableReferences, scopes: scopes });
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(0);
		});
	});

	describe("All Commands Validation", () => {
		it("should flag commands with text in front of them", () => {
			let fakeDocument = createDocument("Leading text *if This is illegal!");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain("*if should be on a line by itself");
		});

		it("should not flag a command with *hide_reuse or similar before it", () => {
			let fakeDocument = createDocument("*hide_reuse *if var");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(0);
		});
	});

	describe("Variable Creation Commands Validation", () => {
		it("should flag local variables with the same name as global ones", () => {
			let createLocation = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let globalVariables = new CaseInsensitiveMap([["global_var", createLocation]]);
			let localVariables = new CaseInsensitiveMap([["global_var", [Substitute.for<Location>()]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ globalVariables: globalVariables, localVariables: localVariables });
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('"global_var" has the same name as a global variable');
		});

		it("should flag local variables with a repeated name", () => {
			let localVariables = new CaseInsensitiveMap([["local_var", [Substitute.for<Location>(), Substitute.for<Location>()]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ localVariables: localVariables });
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('"local_var" was defined earlier');
		});

		it("should flag global variables that don't start with a letter", () => {
			let globalVariables = new CaseInsensitiveMap([["_invalid_var", Substitute.for<Location>()]]);

			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ globalVariables: globalVariables });
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('"_invalid_var" must start with a letter');
		});

		it("should flag local variables that don't start with a letter", () => {
			let localVariables = new CaseInsensitiveMap([["_invalid_var", [Substitute.for<Location>()]]]);

			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ localVariables: localVariables });
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('"_invalid_var" must start with a letter');
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
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

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
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

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
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

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
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

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
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

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
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

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
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics[0].range.start).to.eql({ line: 2, character: 0 });
			expect(diagnostics[0].range.end).to.eql({ line: 2, character: 5 });
		});

		it("should not flag bad scene names if the project hasn't been indexed", () => {
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "goto_scene",
				commandLocation: Substitute.for<Location>(),
				label: "",
				scene: "missing_scene",
				sceneLocation: referenceLocation
			}];
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ flowControlEvents: events, projectIsIndexed: false });
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(0);
		});

		it("should not flag labels if the scene name contains a reference", () => {
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let events: FlowControlEvent[] = [{
				command: "goto_scene",
				commandLocation: Substitute.for<Location>(),
				label: "",
				scene: "{scene_reference}",
				sceneLocation: referenceLocation
			}];
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ flowControlEvents: events });
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(0);
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
			});			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

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
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

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
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('Label "missing_label" wasn\'t found');
		});

		it("should not flag missing labels in another scene if the project hasn't been indexed", () => {
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
				sceneList: ['other-scene'], sceneFileUri: fakeSceneUri,
				projectIsIndexed: false
			});
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(0);
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
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(0);
		});
	});

	describe("Image Validation", () => {
		it("should flag missing image files", () => {
			let images = new CaseInsensitiveMap (
				[["image.png", [Substitute.for<Location>()]]]
			);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({
				images: images
			});
			fakeIndex.getPlatformImagePath().returns("/workspace/scenes");
			let fakeSettings = createValidationSettings();
			let fakeDir = {};  // Empty directory

			mock(fakeDir);
			const diagnostics = generateDiagnostics(
				fakeDocument, fakeIndex, fakeSettings
			);
			mock.restore();

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.include("Couldn't find the image file");
		});

		it("should not flag image files in the already-determined image directory", () => {
			let images = new CaseInsensitiveMap (
				[["image.png", [Substitute.for<Location>()]]]
			);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({
				images: images
			});
			fakeIndex.getPlatformImagePath().returns("/workspace/scenes");
			let fakeSettings = createValidationSettings();
			let fakeDir = { '/workspace/scenes/image.png': 'empty' };

			mock(fakeDir);
			const diagnostics = generateDiagnostics(
				fakeDocument, fakeIndex, fakeSettings
			);
			mock.restore();

			expect(diagnostics.length).to.equal(0);
		});


		it("should not flag image files in the scene directory", () => {
			let images = new CaseInsensitiveMap (
				[["image.png", [Substitute.for<Location>()]]]
			);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({
				images: images
			});
			fakeIndex.getPlatformImagePath().returns(undefined);
			fakeIndex.getPlatformScenePath().returns("/workspace/scenes");
			let fakeSettings = createValidationSettings();
			let fakeDir = { '/workspace/scenes/image.png': 'empty' };

			mock(fakeDir);
			const diagnostics = generateDiagnostics(
				fakeDocument, fakeIndex, fakeSettings
			);
			mock.restore();

			expect(diagnostics.length).to.equal(0);
		});

		it("should set the image file directory for images in the scene directory", () => {
			let images = new CaseInsensitiveMap (
				[["image.png", [Substitute.for<Location>()]]]
			);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({
				images: images
			});
			fakeIndex.getPlatformImagePath().returns(undefined);
			fakeIndex.getPlatformScenePath().returns("/workspace/scenes");
			let fakeSettings = createValidationSettings();
			let fakeDir = { '/workspace/scenes/image.png': 'empty' };

			mock(fakeDir);
			generateDiagnostics(
				fakeDocument, fakeIndex, fakeSettings
			);
			mock.restore();

			fakeIndex.received(1).setPlatformImagePath("/workspace/scenes");
		});

		it("should not flag image files in the directory above the scene directory if the scene directory isn't the workspace directory", () => {
			let images = new CaseInsensitiveMap (
				[["image.png", [Substitute.for<Location>()]]]
			);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({
				images: images
			});
			fakeIndex.getPlatformImagePath().returns(undefined);
			fakeIndex.getPlatformScenePath().returns("/workspace/scenes");
			fakeIndex.getPlatformWorkspacePath().returns("/workspace");
			let fakeSettings = createValidationSettings();
			let fakeDir = {'/workspace/image.png': 'empty' };

			mock(fakeDir);
			const diagnostics = generateDiagnostics(
				fakeDocument, fakeIndex, fakeSettings
			);
			mock.restore();

			expect(diagnostics.length).to.equal(0);
		});

		it("should set the image file directory for images in the directory above the scene directory", () => {
			let images = new CaseInsensitiveMap (
				[["image.png", [Substitute.for<Location>()]]]
			);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({
				images: images
			});
			fakeIndex.getPlatformImagePath().returns(undefined);
			fakeIndex.getPlatformScenePath().returns("/workspace/scenes");
			fakeIndex.getPlatformWorkspacePath().returns("/workspace");
			let fakeSettings = createValidationSettings();
			let fakeDir = { '/workspace/image.png': 'empty' };

			mock(fakeDir);
			generateDiagnostics(
				fakeDocument, fakeIndex, fakeSettings
			);
			mock.restore();

			fakeIndex.received(1).setPlatformImagePath(path.sep + "workspace");
		});

		it("should flag image files in the directory above the scene directory if the scene directory is the workspace directory", () => {
			let images = new CaseInsensitiveMap (
				[["image.png", [Substitute.for<Location>()]]]
			);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({
				images: images
			});
			fakeIndex.getPlatformImagePath().returns(undefined);
			fakeIndex.getPlatformScenePath().returns("/repo/scenes");
			fakeIndex.getPlatformWorkspacePath().returns("/repo/scenes");
			let fakeSettings = createValidationSettings();
			let fakeDir = { '/repo/image.png': 'empty' };

			mock(fakeDir);
			const diagnostics = generateDiagnostics(
				fakeDocument, fakeIndex, fakeSettings
			);
			mock.restore();

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.include("Couldn't find the image file");
		});

		it("should not try to set the image directory if images aren't found", () => {
			let images = new CaseInsensitiveMap (
				[["image.png", [Substitute.for<Location>()]]]
			);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({
				images: images
			});
			fakeIndex.getPlatformImagePath().returns(undefined);
			fakeIndex.getPlatformScenePath().returns("/repo/scenes");
			fakeIndex.getPlatformWorkspacePath().returns("/repo/scenes");
			let fakeSettings = createValidationSettings();
			let fakeDir = { '/repo/image.png': 'empty' };

			mock(fakeDir);
			generateDiagnostics(
				fakeDocument, fakeIndex, fakeSettings
			);
			mock.restore();

			fakeIndex.didNotReceive().setPlatformImagePath(Arg.any());
		});

		it("should flag images in a different directory than the first image found", () => {
			let images = new CaseInsensitiveMap([
				["image1.png", [Substitute.for<Location>()]],
				["image2.png", [Substitute.for<Location>()]]
			]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({
				images: images
			});
			fakeIndex.getPlatformImagePath().returns(undefined);
			fakeIndex.getPlatformScenePath().returns("/workspace/scenes");
			let fakeSettings = createValidationSettings();
			let fakeDir = { 
				'/workspace/scenes/image1.png': 'empty',
				'/workspace/image2.png': 'empty'
			};

			mock(fakeDir);
			const diagnostics = generateDiagnostics(
				fakeDocument, fakeIndex, fakeSettings
			);
			mock.restore();

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.include("Couldn't find the image file");
		});

		it("should set the image file directory for the first image found", () => {
			let images = new CaseInsensitiveMap([
				["image1.png", [Substitute.for<Location>()]],
				["image2.png", [Substitute.for<Location>()]]
			]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({
				images: images
			});
			fakeIndex.getPlatformImagePath().returns(undefined);
			fakeIndex.getPlatformScenePath().returns("/workspace/scenes");
			let fakeSettings = createValidationSettings();
			let fakeDir = { 
				'/workspace/scenes/image1.png': 'empty',
				'/workspace/image2.png': 'empty'
			};

			mock(fakeDir);
			generateDiagnostics(
				fakeDocument, fakeIndex, fakeSettings
			);
			mock.restore();

			fakeIndex.received(1).setPlatformImagePath("/workspace/scenes");
		});
	});

	describe("Indent Validation", () => {
		it("should flag a switch from spaces to tabs", () => {
			let fakeDocument = createDocument("*if true\n  indent\n*if false\n\tindent");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('Switched from spaces to tabs');
			expect(diagnostics[0].range.start.line).to.equal(28);
			expect(diagnostics[0].range.end.line).to.equal(29);
		});

		it("should flag a switch from tabs to spaces", () => {
			let fakeDocument = createDocument("*if true\n\tindent\n*if false\n  indent");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('Switched from tabs to spaces');
			expect(diagnostics[0].range.start.line).to.equal(27);
			expect(diagnostics[0].range.end.line).to.equal(29);
		});
	});

	describe("Achievement Validation", () => {
		it("should flag achievements with a repeated title", () => {
			let achievements = new CaseInsensitiveMap([
				["ach1", [Substitute.for<Location>(), 1, "Repeated title"]],
				["ach2", [Location.create(fakeDocumentUri, Range.create(2, 0, 3, 5)), 1, "Repeated title"]]
			]) as AchievementIndex;
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ achievements: achievements });
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('the same title was defined earlier');
			expect(diagnostics[0].range.start).to.eql({ line: 2, character: 0 });
			expect(diagnostics[0].range.end).to.eql({ line: 3, character: 5 });
		})

		it("should flag more than 100 achievements", () => {
			let achievements = new Map(
				[...Array(103).keys()].map((v): [string, [Location, number, string]] => 
					[
						`a${v}`, [
							Location.create(fakeDocumentUri, Range.create(v, 0, v, 5)),
							1, 
							v.toString()
						]
					]
				)
			);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ achievements: achievements });
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('No more than 100 achievements allowed');
			expect(diagnostics[0].range.start).to.eql({ line: 100, character: 0 });
			expect(diagnostics[0].range.end).to.eql({ line: 100, character: 5 });
		});

		it("should flag more than 1000 points' worth of achievements", () => {
			let achievements = new Map(
				[...Array(12).keys()].map((v): [string, [Location, number, string]] => 
					[
						`a${v}`, [
							Location.create(fakeDocumentUri, Range.create(v, 0, v, 5)),
							100,
							v.toString()
						]
					]
				)
			);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ achievements: achievements });
			let fakeSettings = createValidationSettings();

			const diagnostics = generateDiagnostics(fakeDocument, fakeIndex, fakeSettings);

			expect(diagnostics.length).to.equal(2);
			expect(diagnostics[0].message).to.contain('Total achievement points must be 1,000 or less (this makes it 1100');
			expect(diagnostics[0].range.start).to.eql({ line: 10, character: 0 });
			expect(diagnostics[0].range.end).to.eql({ line: 10, character: 5 });
			expect(diagnostics[1].message).to.contain('Total achievement points must be 1,000 or less (this makes it 1200');
			expect(diagnostics[1].range.start).to.eql({ line: 11, character: 0 });
			expect(diagnostics[1].range.end).to.eql({ line: 11, character: 5 });
		});
	});
});
