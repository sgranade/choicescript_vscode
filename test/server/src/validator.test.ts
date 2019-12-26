import { expect } from 'chai';
import 'mocha';
import { Substitute, SubstituteOf, Arg } from '@fluffy-spoon/substitute';
import { Location, TextDocument } from 'vscode-languageserver';

import { ProjectIndex, IdentifierIndex } from '../../../server/src/indexer';
import { generateDiagnostics } from '../../../server/src/validator';

const fakeDocumentUri: string = "file:///faker.txt";
const fakeSceneUri: string = "file:///other-scene.txt";

function createDocument(text: string, uri: string = fakeDocumentUri): SubstituteOf<TextDocument> {
	let fakeDocument = Substitute.for<TextDocument>();
	fakeDocument.getText(Arg.any()).returns(text);
	fakeDocument.uri.returns(uri);
	return fakeDocument;
}

function createIndex(globalVariables: IdentifierIndex | undefined = undefined,
		localVariables: IdentifierIndex | undefined = undefined,
		startupUri: string | undefined = undefined, 
		labels: IdentifierIndex | undefined = undefined,
		labelsUri: string | undefined = undefined,
		sceneList: string[] | undefined = undefined,
		sceneFileUri: string | undefined = undefined): SubstituteOf<ProjectIndex> {
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
	fakeIndex.getReferences(Arg.any()).returns([]);

	return fakeIndex;
	
}

describe("Style Validation", () => {
	it("should flag ellipses", () => {
		let fakeDocument = createDocument("Ellipses...");
		let fakeIndex = createIndex();

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(1);
		expect(diagnostics[0].message).to.contain("ellipsis");
	});

	it("should flag dashes", () => {
		let fakeDocument = createDocument("Dashes--");
		let fakeIndex = createIndex();

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(1);
		expect(diagnostics[0].message).to.contain("em-dash");
	})
});

describe("Variable Validation", () => {
	it("should find local variables", () => {
		let localVariables: Map<string, Location> = new Map([["local_reference", Substitute.for<Location>()]]);
		let fakeDocument = createDocument("{local_reference}");
		let fakeIndex = createIndex(undefined, localVariables);

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});

	it("should find global variables", () => {
		let globalVariables: Map<string, Location> = new Map([["global_reference", Substitute.for<Location>()]]);
		let fakeDocument = createDocument("{global_reference}");
		let fakeIndex = createIndex(globalVariables = globalVariables);

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});

	it("should find built-in variables", () => {
		let fakeDocument = createDocument("{choice_randomtest}");
		let fakeIndex = createIndex();

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});

	it("should flag undefined variables in references", () => {
		let fakeDocument = createDocument("{undefined}");
		let fakeIndex = createIndex();

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(1);
		expect(diagnostics[0].message).to.contain('Variable "undefined" not defined');
	});

	it("should flag undefined variables in replacements", () => {
		let fakeDocument = createDocument("${undefined}");
		let fakeIndex = createIndex();

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(1);
		expect(diagnostics[0].message).to.contain('Variable "undefined" not defined');
	});

	it("should flag undefined variables in capitalized replacements", () => {
		let fakeDocument = createDocument("$!{undefined}");
		let fakeIndex = createIndex();

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(1);
		expect(diagnostics[0].message).to.contain('Variable "undefined" not defined');
	});

	it("should flag undefined variables in all-caps replacements", () => {
		let fakeDocument = createDocument("$!!{undefined}");
		let fakeIndex = createIndex();

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(1);
		expect(diagnostics[0].message).to.contain('Variable "undefined" not defined');
	});
});

describe("All Commands Validation", () => {
	it("should flag commands with text in front of them", () => {
		let fakeDocument = createDocument("Leading text *comment This is illegal!");
		let fakeIndex = createIndex();

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(1);
		expect(diagnostics[0].message).to.contain("Command *comment can't have other text");
	});

	it("should flag invalid commands", () => {
		let fakeDocument = createDocument("*fakecommand");
		let fakeIndex = createIndex();

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(1);
		expect(diagnostics[0].message).to.contain("*fakecommand isn't a valid");
	});

	it("should flag startup commands used in non-startup files", () => {
		let fakeDocument = createDocument("*create variable");
		let fakeIndex = createIndex();

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(1);
		expect(diagnostics[0].message).to.contain("*create can only be used in startup.txt");
	});

	it("should allow startup commands in startup.txt", () => {
		let fakeDocument = createDocument("*create variable", "file:///startup.txt");
		let fakeIndex = createIndex(undefined, undefined);

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});
});

describe("Variable Manipulation Commands Validation", () => {
	it("should flag missing arguments", () => {
		let fakeDocument = createDocument("*set");
		let fakeIndex = createIndex();

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(1);
		expect(diagnostics[0].message).to.contain("*set is missing its arguments");
	});

	it("should flag an incorrect variable reference", () => {
		let fakeDocument = createDocument("*delete  missing_variable");
		let fakeIndex = createIndex();

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(1);
		expect(diagnostics[0].message).to.contain('Variable "missing_variable" not defined');
	});

	it("should be good with local variables", () => {
		let localVariables: Map<string, Location> = new Map([["known_variable", Substitute.for<Location>()]]);
		let fakeDocument = createDocument("*rand known_variable");
		let fakeIndex = createIndex(undefined, localVariables);

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});

	it("should be good with global variables", () => {
		let globalVariables: Map<string, Location> = new Map([["known_variable", Substitute.for<Location>()]]);
		let fakeDocument = createDocument("*rand known_variable");
		let fakeIndex = createIndex(globalVariables);

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});
});

describe("Variable Reference Commands Validation", () => {
	it("should flag missing arguments", () => {
		let fakeDocument = createDocument("*if");
		let fakeIndex = createIndex();

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(1);
		expect(diagnostics[0].message).to.contain("*if is missing its arguments");
	});

	it("should be okay with numbers", () => {
		let fakeDocument = createDocument("*elseif 1");
		let fakeIndex = createIndex();

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});

	it("should be okay with comparisons", () => {
		let fakeDocument = createDocument("*elseif 1 >= 2");
		let fakeIndex = createIndex();

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});

	it("should be okay with functions", () => {
		let fakeDocument = createDocument("*selectable_if round(1.2)");
		let fakeIndex = createIndex();

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});

	it("should be okay with named operators", () => {
		let fakeDocument = createDocument("*if 4 modulo 7");
		let fakeIndex = createIndex();

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});

	it("should be okay with named values", () => {
		let fakeDocument = createDocument("*if false");
		let fakeIndex = createIndex();

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});

	it("should not flag text in a trailing #choice", () => {
		let fakeDocument = createDocument("*if 1 #I should not cause any issues");
		let fakeIndex = createIndex();

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});

	it("should be good with local variables", () => {
		let localVariables: Map<string, Location> = new Map([["known_variable", Substitute.for<Location>()]]);
		let fakeDocument = createDocument("*if known_variable > 7");
		let fakeIndex = createIndex(undefined, localVariables);

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});

	it("should be good with global variables", () => {
		let globalVariables: Map<string, Location> = new Map([["known_variable", Substitute.for<Location>()]]);
		let fakeDocument = createDocument("*elseif known_variable < 3");
		let fakeIndex = createIndex(globalVariables);

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});

	it("should be good with string comparisons", () => {
		let globalVariables: Map<string, Location> = new Map([["known_variable", Substitute.for<Location>()]]);
		let fakeDocument = createDocument('*elseif known_variable = "string"');
		let fakeIndex = createIndex(globalVariables);

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});

	it("should be good with parens", () => {
		let globalVariables: Map<string, Location> = new Map([["known_variable", Substitute.for<Location>()]]);
		let fakeDocument = createDocument("*elseif (known_variable < 3)");
		let fakeIndex = createIndex(globalVariables);

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});

	it("should be good with parens and no space", () => {
		let globalVariables: Map<string, Location> = new Map([["known_variable", Substitute.for<Location>()]]);
		let fakeDocument = createDocument("*if(known_variable < 3)");
		let fakeIndex = createIndex(globalVariables);

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});
});

describe("Label Reference Commands Validation", () => {
	it("should flag missing arguments", () => {
		let fakeDocument = createDocument("*goto");
		let fakeIndex = createIndex();

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(1);
		expect(diagnostics[0].message).to.contain("*goto is missing its arguments");
	});

	it("should be good with local labels", () => {
		let localLabels: Map<string, Location> = new Map([["local_label", Substitute.for<Location>()]]);
		let fakeDocument = createDocument("*gosub local_label");
		let fakeIndex = createIndex(undefined, undefined, undefined, localLabels, fakeDocumentUri);

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});

	it("should be good with jumping to another scene without a label", () => {
		let fakeDocument = createDocument("*goto_scene scene_name");
		let fakeIndex = createIndex(undefined, undefined, undefined, undefined, undefined, ['scene_name']);

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});

	it("should be flag bad scene names", () => {
		let fakeDocument = createDocument("*goto_scene missing_scene");
		let fakeIndex = createIndex();

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(1);
		expect(diagnostics[0].message).to.contain('Scene "missing_scene" wasn\'t found');
	});

	it("should be good with hyphenated scene names", () => {
		let fakeDocument = createDocument("*goto_scene scene-name");
		let fakeIndex = createIndex(undefined, undefined, undefined, undefined, undefined, ['scene-name']);

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});

	it("should be good with labels in another scene", () => {
		let sceneLabels: Map<string, Location> = new Map([["scene_label", Substitute.for<Location>()]]);
		let fakeDocument = createDocument("*goto_scene other-scene scene_label");
		let fakeIndex = createIndex(undefined, undefined, undefined, sceneLabels, fakeSceneUri, ["other-scene"], fakeSceneUri);

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});

	it("should flag missing labels in another scene", () => {
		let sceneLabels: Map<string, Location> = new Map([["scene_label", Substitute.for<Location>()]]);
		let fakeDocument = createDocument("*goto_scene other-scene missing_label");
		let fakeIndex = createIndex(undefined, undefined, undefined, sceneLabels, fakeSceneUri, ["other-scene"], fakeSceneUri);

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(1);
		expect(diagnostics[0].message).to.contain('Label "missing_label" wasn\'t found');
	});
});

describe("Multireplace Validation", () => {
	it("should allow a bare global variable at the start", () => {
		let globalVariables: Map<string, Location> = new Map([["known_variable", Substitute.for<Location>()]]);
		let fakeDocument = createDocument("@{known_variable yes | no}");
		let fakeIndex = createIndex(globalVariables);

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});

	it("should allow a bare local variable at the start", () => {
		let localVariables: Map<string, Location> = new Map([["known_variable", Substitute.for<Location>()]]);
		let fakeDocument = createDocument("@{known_variable yes | no}");
		let fakeIndex = createIndex(undefined, localVariables);

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});

	it("should allow spaces and then a bare variable at the start", () => {
		let globalVariables: Map<string, Location> = new Map([["known_variable", Substitute.for<Location>()]]);
		let fakeDocument = createDocument("@{   known_variable yes | no}");
		let fakeIndex = createIndex(globalVariables);

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});

	it("should flag missing bare variables", () => {
		let globalVariables: Map<string, Location> = new Map([["known_variable", Substitute.for<Location>()]]);
		let fakeDocument = createDocument("@{unknown_variable yes | no}");
		let fakeIndex = createIndex(globalVariables);

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(1);
		expect(diagnostics[0].message).to.contain('"unknown_variable" is not a variable');
	});

	it("should flag missing bare variables in a capitalized multireplace", () => {
		let globalVariables: Map<string, Location> = new Map([["known_variable", Substitute.for<Location>()]]);
		let fakeDocument = createDocument("@!{unknown_variable yes | no}");
		let fakeIndex = createIndex(globalVariables);

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(1);
		expect(diagnostics[0].message).to.contain('"unknown_variable" is not a variable');
	});

	it("should flag missing bare variables in an all-caps multireplace", () => {
		let globalVariables: Map<string, Location> = new Map([["known_variable", Substitute.for<Location>()]]);
		let fakeDocument = createDocument("@!!{unknown_variable yes | no}");
		let fakeIndex = createIndex(globalVariables);

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(1);
		expect(diagnostics[0].message).to.contain('"unknown_variable" is not a variable');
	});

	it("should allow parenthesized global variables", () => {
		let globalVariables: Map<string, Location> = new Map([["known_variable", Substitute.for<Location>()]]);
		let fakeDocument = createDocument("@{(1 + known_variable) yes | no}");
		let fakeIndex = createIndex(globalVariables);

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});

	it("should allow parenthesized local variables", () => {
		let localVariables: Map<string, Location> = new Map([["known_variable", Substitute.for<Location>()]]);
		let fakeDocument = createDocument("@{(1 + known_variable) yes | no}");
		let fakeIndex = createIndex(undefined, localVariables);

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});

	it("should flag missing parenthesized variables", () => {
		let globalVariables: Map<string, Location> = new Map([["known_variable", Substitute.for<Location>()]]);
		let fakeDocument = createDocument("@{(1 + unknown_variable) yes | no}");
		let fakeIndex = createIndex(globalVariables);

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(1);
		expect(diagnostics[0].message).to.contain('"unknown_variable" is not a variable');
	});

	it("should allow spaces before parenthesized global variables", () => {
		let globalVariables: Map<string, Location> = new Map([["known_variable", Substitute.for<Location>()]]);
		let fakeDocument = createDocument("@{    (1 + known_variable) yes | no}");
		let fakeIndex = createIndex(globalVariables);

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});

	it("should be okay with functions", () => {
		let fakeDocument = createDocument("@{(round(1.2) always | never}");
		let fakeIndex = createIndex();

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});

	it("should be okay with named operators", () => {
		let fakeDocument = createDocument("@{(4 modulo 7) maybe | maybe not}");
		let fakeIndex = createIndex();

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});

	it("should be okay with named values", () => {
		let fakeDocument = createDocument("@{false never | always}");
		let fakeIndex = createIndex();

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});

	it("should be good with string comparisons", () => {
		let globalVariables: Map<string, Location> = new Map([["known_variable", Substitute.for<Location>()]]);
		let fakeDocument = createDocument('@{(known_variable = "string") matches | doesn\'t}');
		let fakeIndex = createIndex(globalVariables);

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});
});