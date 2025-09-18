/* eslint-disable */

import * as path from 'path';

import * as mock from 'mock-fs';
import { expect } from 'chai';
import 'mocha';
import { Substitute, SubstituteOf, Arg } from '@fluffy-spoon/substitute';
import { Location, Range, Position, DiagnosticSeverity } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { ProjectIndex, IdentifierIndex, IdentifierMultiIndex, DocumentScopes, FlowControlEvent, LabelIndex, Label, AchievementIndex } from '../../../server/src/common/index';
import { CaseInsensitiveMap } from '../../../server/src/common/utilities';
import { generateDiagnostics, ValidationSettings } from '../../../server/src/common/validator';

import { SystemFileProvider } from '../../../server/src/node/system-file-provider';
import { FileSystemService } from '../../../server/src/common/file-system-service';
import { AllowUnsafeScriptOption } from '../../../server/src/common/constants';
import { DiagnosticCodes } from '../../../server/src/common/diagnostics';

const fakeDocumentUri: string = "file:///faker.txt";
const fakeSceneUri: string = "file:///other-scene.txt";
const startupUri: string = "file:///startup.txt";
const fsProvider = new FileSystemService(new SystemFileProvider());

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
	scriptUsages?: Location[]
}

function createIndex({
	globalVariables, localVariables, subroutineVariables, startupUri, labels,
	labelsUri, sceneList, sceneFileUri, achievements,
	variableReferences, flowControlEvents, scopes, images,
	projectIsIndexed, scriptUsages }: IndexArgs): SubstituteOf<ProjectIndex> {
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
	if (scriptUsages === undefined) {
		scriptUsages = [];
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
	fakeIndex.getScriptUsages(Arg.any()).returns(scriptUsages);

	return fakeIndex;
}

function createValidationSettings(useCoGStyleGuide: boolean=true, allowUnsafeScript: AllowUnsafeScriptOption = "allow"): SubstituteOf<ValidationSettings> {
	let fakeSettings = Substitute.for<ValidationSettings>();
	fakeSettings.useCoGStyleGuide = useCoGStyleGuide;
	fakeSettings.allowUnsafeScript = allowUnsafeScript;
	return fakeSettings;
}

describe("Validator", () => {
	describe("Style Validation", () => {
		it("should flag ellipses", async () => {
			let fakeDocument = createDocument("Ellipses...");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].code).to.equal(DiagnosticCodes.UnicodeEllipsisRequired);
		});

		it("should flag dashes", async () => {
			let fakeDocument = createDocument("Dashes--");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].code).to.equal(DiagnosticCodes.UnicodeEmDashRequired);
		});

		it("shouldn't flag dashes in a comment", async () => {
			let fakeDocument = createDocument("*comment Dashes--");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(0);
		});

		it("should flag too-long options", async () => {
			let fakeDocument = createDocument("*choice\n\t#This option has too many words seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen.");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].code).to.equal(DiagnosticCodes.TooLongOption);
			expect(diagnostics[0].range.start.line).to.equal(102);
			expect(diagnostics[0].range.end.line).to.equal(110);
		});

		it("should not flag shorter options", async () => {
			let fakeDocument = createDocument("*choice\n\t#This option has just enough words seven eight nine ten eleven twelve thirteen fourteen fifteen.");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(0);
		});

		it("should not count the # in an option as a word", async () => {
			let fakeDocument = createDocument("*choice\n\t# This option has four five six seven eight nine ten eleven twelve thirteen fourteen fifteen.");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(0);
		});

		it("should take multireplaces into account when counting words", async () => {
			let fakeDocument = createDocument("*choice\n\t#This option appears to have @{true six seven eight nine ten | eleven twelve thirteen fourteen fifteen} words.");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(0);
		});

		it("should take the max words in the multireplaces into account when counting words", async () => {
			let fakeDocument = createDocument("*choice\n\t#This option appears to have @{true six seven eight nine ten eleven twelve thirteen fourteen | six} fifteen words.");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].code).to.equal(DiagnosticCodes.TooLongOption);
			expect(diagnostics[0].range.start.line).to.equal(117);
			expect(diagnostics[0].range.end.line).to.equal(123);
		});

		it("should properly deal with no spaces before a multireplaces when counting words", async () => {
			let fakeDocument = createDocument("*choice\n\t#This option appears to ha@{true ve six seven eight nine ten eleven twelve thirteen fourteen | ve six} words.");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(0);
		});

		it("should properly deal with no spaces after a multireplaces when counting words", async () => {
			let fakeDocument = createDocument("*choice\n\t#This option appears to ha@{true ve six seven eight nine ten eleven twelve thirteen fourteen | ve six}, words.");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(0);
		});

		it("should properly deal with a multireplace at the start of the line", async () => {
			let fakeDocument = createDocument("*choice\n\t#@{romance_expressed_hartmann Even though I like Hartmann, I make ${hartmann_him}|I make Hartmann} look better to Auguste, saying how well ${hartmann_he} @{hartmann_singular upholds|uphold} Gallatin traditions.");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].code).to.equal(DiagnosticCodes.TooLongOption);
			expect(diagnostics[0].range.start.line).to.equal(148);
			expect(diagnostics[0].range.end.line).to.equal(219);
		});

		it("should properly deal with a multireplace at the start of the line and a space at the end", async () => {
			let fakeDocument = createDocument("*choice\n\t#@{var It goes against Practicum rules, but |}I talk to Kayla. I wonder if she'll believe in ");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(0);
		});

		it("should handle two multireplaces when counting words", async () => {
			let fakeDocument = createDocument("*choice\n\t#This option appears to have @{true six seven eight | six} and @{true ten eleven twelve thirteen fourteen fifteen sixteen | ten} words.");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].code).to.equal(DiagnosticCodes.TooLongOption);
			expect(diagnostics[0].range.start.line).to.equal(123);
			expect(diagnostics[0].range.end.line).to.equal(144);
		});

		it("should ignore multireplaces with no body when counting words", async () => {
			let fakeDocument = createDocument("*choice\n\t#This option has @{true} four five six seven eight nine ten eleven twelve thirteen fourteen words.");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(0);
		});

		it("should include a multireplace in the error if it makes the option too long", async () => {
			let fakeDocument = createDocument("*choice\n\t#This option appears to have six seven eight nine ten eleven twelve thirteen fourteen @{true fifteen sixteen | fifteen} words.");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].code).to.equal(DiagnosticCodes.TooLongOption);
			expect(diagnostics[0].range.start.line).to.equal(110);
			expect(diagnostics[0].range.end.line).to.equal(135);
		});

		it("should handle two multireplaces, one with no body, when counting words", async () => {
			let fakeDocument = createDocument("*choice\n\t#This option appears to have @{true} six seven eight and @{true ten eleven twelve thirteen fourteen fifteen sixteen | ten} words.");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].code).to.equal(DiagnosticCodes.TooLongOption);
			expect(diagnostics[0].range.start.line).to.equal(117);
			expect(diagnostics[0].range.end.line).to.equal(138);
		});
	});

	describe("Variable Reference Validation", () => {
		it("should flag missing variables", async () => {
			let location = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["unknown", [location]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ variableReferences: variableReferences });
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].code).to.equal(DiagnosticCodes.VariableNotDefined);
		});

		it("should not flag missing variables if the project hasn't been indexed", async () => {
			let location = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["unknown", [location]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ variableReferences: variableReferences, projectIsIndexed: false });
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(0);
		});

		it("should not flag existing local variables", async () => {
			let createLocation = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let localVariables = new CaseInsensitiveMap([["local_var", [createLocation]]]);
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["local_var", [referenceLocation]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ localVariables: localVariables, variableReferences: variableReferences });
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(0);
		});

		it("should flag a local variable referenced before it's created", async () => {
			let createLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let localVariables = new CaseInsensitiveMap([["local_var", [createLocation]]]);
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["local_var", [referenceLocation]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ localVariables: localVariables, variableReferences: variableReferences });
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].code).to.equal(DiagnosticCodes.VariableUsedBeforeCreation);
		});

		it("should not flag a local variable with a second creation location after the reference", async () => {
			let createLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let otherCreateLocation = Location.create(fakeDocumentUri, Range.create(5, 0, 5, 5));
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(3, 0, 3, 5));
			let localVariables = new CaseInsensitiveMap([["local_var", [createLocation, otherCreateLocation]]]);
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["local_var", [referenceLocation]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ localVariables: localVariables, variableReferences: variableReferences });
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			// We do get a warning for the variable re-creation though
			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].code).to.equal(DiagnosticCodes.LocalVariableDefinedEarlier);
		});

		it("should not flag a local variable referenced before it's created if a global variable exists", async () => {
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

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			// We'll get a warning about a local var having the same name as a global var, but no error
			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].code).to.equal(DiagnosticCodes.LocalVariableShadowsGlobalVariable);
		});

		it("should not flag a local variable created through a gosub", async () => {
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

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(0);
		});

		it("should not flag existing global variables", async () => {
			let createLocation = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let globalVariables: CaseInsensitiveMap<string, Location> = new CaseInsensitiveMap([["global_var", createLocation]]);
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["global_var", [referenceLocation]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ globalVariables: globalVariables, variableReferences: variableReferences });
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(0);
		});

		it("should flag a global variable referenced before it's created", async () => {
			let createLocation = Location.create(startupUri, Range.create(2, 0, 2, 5));
			let referenceLocation = Location.create(startupUri, Range.create(1, 0, 1, 5));
			let globalVariables: CaseInsensitiveMap<string, Location> = new CaseInsensitiveMap([["global_var", createLocation]]);
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["global_var", [referenceLocation]]]);
			let fakeDocument = createDocument("placeholder", startupUri);
			let fakeIndex = createIndex({ globalVariables: globalVariables, variableReferences: variableReferences });
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].code).to.equal(DiagnosticCodes.VariableUsedBeforeCreation);
		});

		it("should not flag built-in variables", async () => {
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["choice_randomtest", [Substitute.for<Location>()]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ variableReferences: variableReferences });
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(0);
		});

		it("should not flag param count", async () => {
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["param_count", [Substitute.for<Location>()]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ variableReferences: variableReferences });
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(0);
		});

		it("should flag a non-param-count variable whose name contains 'param_count'", async () => {
			let location1 = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let location2 = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([
				["not_actually_param_count", [location1]],
				["param_counter", [location2]],
			]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ variableReferences: variableReferences });
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(2);
			expect(diagnostics[0].message).to.include('"not_actually_param_count" not defined');
			expect(diagnostics[1].message).to.include('"param_counter" not defined');
		});

		it("should not flag param variables", async () => {
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["param_2", [Substitute.for<Location>()]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ variableReferences: variableReferences });
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(0);
		});

		it("should flag a non-param-variable variable whose name contains e.g. 'param_1'", async () => {
			let location1 = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let location2 = Location.create(fakeDocumentUri, Range.create(2, 0, 2, 5));
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([
				["not_param_1", [location1]],
				["param_2e", [location2]],
			]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ variableReferences: variableReferences });
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(2);
			expect(diagnostics[0].message).to.include('"not_param_1" not defined');
			expect(diagnostics[1].message).to.include('"param_2e" not defined');
		});

		it("should flag achievement variables if not instantiated", async () => {
			let achievements: CaseInsensitiveMap<string, [Location, number, string]> = new CaseInsensitiveMap([["codename", [Substitute.for<Location>(), 0, ""]]]);
			let referenceLocation = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let variableReferences: IdentifierMultiIndex = new CaseInsensitiveMap([["choice_achieved_codename", [referenceLocation]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ variableReferences: variableReferences, achievements: achievements });
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('Variable "choice_achieved_codename" not defined');
		});

		it("should not flag achievement variables after instantiation", async () => {
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

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(0);
		});

		it("should flag incorrect achievement variables", async () => {
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

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('Variable "choice_achieved_othername" not defined');
		});

		it("should not flag params variables after instantiation", async () => {
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

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(0);
		});
	});

	describe("All Commands Validation", () => {
		it("should flag commands with text in front of them", async () => {
			let fakeDocument = createDocument("Leading text *if This is illegal!");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain("This command should be on a line by itself");
		});

		it("should not flag a command with *hide_reuse or similar before it", async () => {
			let fakeDocument = createDocument("*hide_reuse *if var");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(0);
		});
	});

	describe("Variable Creation Commands Validation", () => {
		it("should flag local variables with the same name as global ones", async () => {
			let createLocation = Location.create(fakeDocumentUri, Range.create(1, 0, 1, 5));
			let globalVariables = new CaseInsensitiveMap([["global_var", createLocation]]);
			let localVariables = new CaseInsensitiveMap([["global_var", [Substitute.for<Location>()]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ globalVariables: globalVariables, localVariables: localVariables });
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('This variable has the same name as a global variable');
		});

		it("should flag local variables with a repeated name", async () => {
			let localVariables = new CaseInsensitiveMap([["local_var", [Substitute.for<Location>(), Substitute.for<Location>()]]]);
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ localVariables: localVariables });
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('This variable was already defined earlier');
		});

		it("should flag global variables that don't start with a letter", async () => {
			let globalVariables = new CaseInsensitiveMap([["_invalid_var", Substitute.for<Location>()]]);

			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ globalVariables: globalVariables });
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('A variable name must start with a letter');
		});

		it("should flag local variables that don't start with a letter", async () => {
			let localVariables = new CaseInsensitiveMap([["_invalid_var", [Substitute.for<Location>()]]]);

			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ localVariables: localVariables });
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('A variable name must start with a letter');
		});
	});

	describe("Label Reference Commands Validation", () => {
		it("should flag missing labels", async () => {
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

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('This label wasn\'t found');
		});

		it("should not flag a reference as missing labels", async () => {
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

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(0);
		});

		it("should flag missing label locations", async () => {
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

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics[0].range.start).to.eql({ line: 2, character: 0 });
			expect(diagnostics[0].range.end).to.eql({ line: 2, character: 5 });
		});

		it("should be good with local labels", async () => {
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

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(0);
		});

		it("should be good with jumping to another scene without a label", async () => {
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

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(0);
		});

		it("should flag bad scene names", async () => {
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

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('This scene wasn\'t found');
		});

		it("should flag the location of bad scene names", async () => {
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

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics[0].range.start).to.eql({ line: 2, character: 0 });
			expect(diagnostics[0].range.end).to.eql({ line: 2, character: 5 });
		});

		it("should not flag bad scene names if the project hasn't been indexed", async () => {
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

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(0);
		});

		it("should not flag labels if the scene name contains a reference", async () => {
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

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(0);
		});

		it("should be good with hyphenated scene names", async () => {
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

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(0);
		});

		it("should be good with labels in another scene", async () => {
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

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(0);
		});

		it("should flag missing labels in another scene", async () => {
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

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('This label wasn\'t found');
		});

		it("should not flag missing labels in another scene if the project hasn't been indexed", async () => {
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

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(0);
		});

		it("should not flag references in labels, even in another scene", async () => {
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

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(0);
		});
	});

	describe("Image Validation", () => {
		it("should flag missing image files", async () => {
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
			const diagnostics = await generateDiagnostics(
				fakeDocument, fakeIndex, fakeSettings, fsProvider
			);
			mock.restore();

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.include("Couldn't find this image file");
		});

		it("should not flag image files in the already-determined image directory", async () => {
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
			const diagnostics = await generateDiagnostics(
				fakeDocument, fakeIndex, fakeSettings, fsProvider
			);
			mock.restore();

			expect(diagnostics.length).to.equal(0);
		});


		it("should not flag image files in the scene directory", async () => {
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
			const diagnostics = await generateDiagnostics(
				fakeDocument, fakeIndex, fakeSettings, fsProvider
			);
			mock.restore();

			expect(diagnostics.length).to.equal(0);
		});

		it("should set the image file directory for images in the scene directory", async () => {
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
			await generateDiagnostics(
				fakeDocument, fakeIndex, fakeSettings, fsProvider
			);
			mock.restore();

			fakeIndex.received(1).setPlatformImagePath("/workspace/scenes");
		});

		it("should not flag image files in the directory above the scene directory if the scene directory isn't the workspace directory", async () => {
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
			const diagnostics = await generateDiagnostics(
				fakeDocument, fakeIndex, fakeSettings, fsProvider
			);
			mock.restore();

			expect(diagnostics.length).to.equal(0);
		});

		it("should set the image file directory for images in the directory above the scene directory", async () => {
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
			await generateDiagnostics(
				fakeDocument, fakeIndex, fakeSettings, fsProvider
			);
			mock.restore();

			fakeIndex.received(1).setPlatformImagePath(path.sep + "workspace");
		});

		it("should flag image files in the directory above the scene directory if the scene directory is the workspace directory", async () => {
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
			const diagnostics = await generateDiagnostics(
				fakeDocument, fakeIndex, fakeSettings, fsProvider
			);
			mock.restore();

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.include("Couldn't find this image file");
		});

		it("should not try to set the image directory if images aren't found", async () => {
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
			await generateDiagnostics(
				fakeDocument, fakeIndex, fakeSettings, fsProvider
			);
			mock.restore();

			fakeIndex.didNotReceive().setPlatformImagePath(Arg.any());
		});

		it("should flag images in a different directory than the first image found", async () => {
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
			const diagnostics = await generateDiagnostics(
				fakeDocument, fakeIndex, fakeSettings, fsProvider
			);
			mock.restore();

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.include("Couldn't find this image file");
		});

		it("should set the image file directory for the first image found", async () => {
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
			await generateDiagnostics(
				fakeDocument, fakeIndex, fakeSettings, fsProvider
			);
			mock.restore();

			fakeIndex.received(1).setPlatformImagePath("/workspace/scenes");
		});
	});

	describe("Indent Validation", () => {
		it("should flag a switch from spaces to tabs", async () => {
			let fakeDocument = createDocument("*if true\n  indent\n*if false\n\tindent");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('Switched from spaces to tabs');
			expect(diagnostics[0].range.start.line).to.equal(28);
			expect(diagnostics[0].range.end.line).to.equal(29);
		});

		it("should flag a switch from tabs to spaces", async () => {
			let fakeDocument = createDocument("*if true\n\tindent\n*if false\n  indent");
			let fakeIndex = createIndex({});
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('Switched from tabs to spaces');
			expect(diagnostics[0].range.start.line).to.equal(27);
			expect(diagnostics[0].range.end.line).to.equal(29);
		});
	});

	describe("Achievement Validation", () => {
		it("should flag achievements with a repeated title", async () => {
			let achievements = new CaseInsensitiveMap([
				["ach1", [Substitute.for<Location>(), 1, "Repeated title"]],
				["ach2", [Location.create(fakeDocumentUri, Range.create(2, 0, 3, 5)), 1, "Repeated title"]]
			]) as AchievementIndex;
			let fakeDocument = createDocument("placeholder");
			let fakeIndex = createIndex({ achievements: achievements });
			let fakeSettings = createValidationSettings();

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('the same title was defined earlier');
			expect(diagnostics[0].range.start).to.eql({ line: 2, character: 0 });
			expect(diagnostics[0].range.end).to.eql({ line: 3, character: 5 });
		})

		it("should flag more than 100 achievements", async () => {
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

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].message).to.contain('No more than 100 achievements allowed');
			expect(diagnostics[0].range.start).to.eql({ line: 100, character: 0 });
			expect(diagnostics[0].range.end).to.eql({ line: 100, character: 5 });
		});

		it("should flag more than 1000 points' worth of achievements", async () => {
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

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, fakeSettings, fsProvider);

			expect(diagnostics.length).to.equal(2);
			expect(diagnostics[0].message).to.contain('Total achievement points must be 1,000 or fewer. (This makes it 1100');
			expect(diagnostics[0].range.start).to.eql({ line: 10, character: 0 });
			expect(diagnostics[0].range.end).to.eql({ line: 10, character: 5 });
			expect(diagnostics[1].message).to.contain('Total achievement points must be 1,000 or fewer. (This makes it 1200');
			expect(diagnostics[1].range.start).to.eql({ line: 11, character: 0 });
			expect(diagnostics[1].range.end).to.eql({ line: 11, character: 5 });
		});
	});

	describe("Script Validation", () => {
		it("should diagnose *script commands with an error if allowUnsafeScript is 'never'", async () => {
			let fakeDocument = createDocument("placeholder");
			let scriptUsages = [
				Location.create(fakeDocument.uri, Range.create(Position.create(0, 0), Position.create(0, 5)))
			];
			let fakeIndex = createIndex({ scriptUsages });

			let settings = {
				"allowUnsafeScript": "never",
				"useCoGStyleGuide": true
			} as ValidationSettings;

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, settings, fsProvider);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].severity === DiagnosticSeverity.Error);
			expect(diagnostics[0].message).to.contain('You need to enable unsafe *script usage in settings');
		});

		it("should diagnose *script commands with a warning if allowUnsafeScript is 'warn'", async () => {
			let fakeDocument = createDocument("placeholder");
			let scriptUsages = [
				Location.create(fakeDocument.uri, Range.create(Position.create(0, 0), Position.create(0, 5)))
			];
			let fakeIndex = createIndex({ scriptUsages });

			let settings = {
				"allowUnsafeScript": "warn",
				"useCoGStyleGuide": true
			} as ValidationSettings;

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, settings, fsProvider);

			expect(diagnostics.length).to.equal(1);
			expect(diagnostics[0].severity === DiagnosticSeverity.Warning);
			expect(diagnostics[0].message).to.contain('Running games that use *script is a security-risk.');
		});

		it("should not validate *script commands if allowUnsafeScript is 'allow'", async () => {
			let fakeDocument = createDocument("placeholder");
			let scriptUsages = [
				Location.create(fakeDocument.uri, Range.create(Position.create(0, 0), Position.create(0, 5)))
			];
			let fakeIndex = createIndex({ scriptUsages });

			let settings = {
				"allowUnsafeScript": "allow",
				"useCoGStyleGuide": true
			} as ValidationSettings;

			const diagnostics = await generateDiagnostics(fakeDocument, fakeIndex, settings, fsProvider);

			expect(diagnostics.length).to.equal(0);
		});
	});
});
