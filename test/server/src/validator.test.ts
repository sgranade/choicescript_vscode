import { expect } from 'chai';
import 'mocha';
import { Substitute, SubstituteOf, Arg } from '@fluffy-spoon/substitute';
import { Location, TextDocument } from 'vscode-languageserver';

import { ProjectIndex, IdentifierIndex } from '../../../server/src/indexer';
import { generateDiagnostics } from '../../../server/src/validator';

const fakeUri: string = "file:///faker.txt";

function createDocument(text: string, uri: string = fakeUri): SubstituteOf<TextDocument> {
	let fakeDocument = Substitute.for<TextDocument>();
	fakeDocument.getText(Arg.any()).returns(text);
	fakeDocument.uri.returns(uri);
	return fakeDocument;
}

function createIndex(globalVariables: IdentifierIndex | undefined = undefined,
		localVariables: IdentifierIndex | undefined = undefined,
		startupUri: string | undefined = undefined): SubstituteOf<ProjectIndex> {
	if (globalVariables === undefined) {
		globalVariables = new Map();
	}
	if (localVariables === undefined) {
		localVariables = new Map();
	}
	if (startupUri === undefined) {
		startupUri = "";
	}

	let fakeIndex = Substitute.for<ProjectIndex>();
	fakeIndex.getGlobalVariables().returns(globalVariables);
	fakeIndex.getLocalVariables(Arg.any()).returns(localVariables);
	fakeIndex.getStartupFileUri().returns(startupUri);
	fakeIndex.getSceneList().returns([]);
	fakeIndex.getLabels(Arg.any()).returns(new Map());
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
	it("should find global variables", () => {
		let globalVariables: Map<string, Location> = new Map([["global_reference", Substitute.for<Location>()]]);
		let fakeDocument = createDocument("{global_reference}");
		let fakeIndex = createIndex(globalVariables = globalVariables);

		let diagnostics = generateDiagnostics(fakeDocument, fakeIndex);

		expect(diagnostics.length).to.equal(0);
	});

	it("should find local variables", () => {
		let localVariables: Map<string, Location> = new Map([["local_reference", Substitute.for<Location>()]]);
		let fakeDocument = createDocument("{local_reference}");
		let fakeIndex = createIndex(undefined, localVariables);

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