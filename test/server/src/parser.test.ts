import { expect } from 'chai';
import 'mocha';
import { Substitute, SubstituteOf, Arg } from '@fluffy-spoon/substitute';
import { TextDocument, Position, Location } from 'vscode-languageserver';

import { ProjectIndex, IdentifierIndex, updateProjectIndex, ReferenceIndex } from '../../../server/src/indexer';
import { ParserCallbacks, ParsingState, parse } from '../../../server/src/parser';

const fakeDocumentUri: string = "file:///faker.txt";

function createDocument(text: string, 
	uri: string = fakeDocumentUri): SubstituteOf<TextDocument> {
	let fakeDocument = Substitute.for<TextDocument>();
	fakeDocument.getText(Arg.any()).returns(text);
	fakeDocument.uri.returns(uri);
	fakeDocument.positionAt(Arg.any()).mimicks((index: number) => { return(Position.create(index, 0)); });
	return fakeDocument;
}

interface Symbol {
	text: string,
	location: Location
}

describe("Symbol-Creation Command Parsing", () => {
	it("should callback on global variable creation", () => {
		let fakeDocument = createDocument("*create variable 3");
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onGlobalVariableCreate(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(1);
		expect(received[0].text).to.equal("variable");
		expect(received[0].location.range.start.line).to.equal(8);
		expect(received[0].location.range.end.line).to.equal(16);
	});

	it("should callback on references in global variable creation", () => {
		let fakeDocument = createDocument("*create variable {other_variable}");
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(1);
		expect(received[0].text).to.equal("other_variable");
		expect(received[0].location.range.start.line).to.equal(18);
		expect(received[0].location.range.end.line).to.equal(32);
	});

	it("should callback on local variable creation", () => {
		let fakeDocument = createDocument("*temp variable 3");
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onLocalVariableCreate(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(1);
		expect(received[0].text).to.equal("variable");
		expect(received[0].location.range.start.line).to.equal(6);
		expect(received[0].location.range.end.line).to.equal(14);
	});

	it("should callback on references in local variable creation", () => {
		let fakeDocument = createDocument("*temp variable {other_variable}");
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(1);
		expect(received[0].text).to.equal("other_variable");
		expect(received[0].location.range.start.line).to.equal(16);
		expect(received[0].location.range.end.line).to.equal(30);
	});

	it("should callback on label creation", () => {
		let fakeDocument = createDocument("*label variable");
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onLabelCreate(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(1);
		expect(received[0].text).to.equal("variable");
		expect(received[0].location.range.start.line).to.equal(7);
		expect(received[0].location.range.end.line).to.equal(15);
	});
})

describe("Symbol-Manipulating Command Parsing", () => {
	it("should callback on bare variables", () => {
		let fakeDocument = createDocument("*set variable 3");
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(1);
		expect(received[0].text).to.equal("variable");
		expect(received[0].location.range.start.line).to.equal(5);
		expect(received[0].location.range.end.line).to.equal(13);
	});

	it("should callback on variable references", () => {
		let fakeDocument = createDocument("*set {variable} 3");
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(1);
		expect(received[0].text).to.equal("variable");
		expect(received[0].location.range.start.line).to.equal(6);
		expect(received[0].location.range.end.line).to.equal(14);
	});

	it("should not callback on strings", () => {
		let fakeDocument = createDocument('*set variable "value"');
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(1);
		expect(received[0].text).to.equal("variable");
	});

	it("should callback on complex variable references", () => {
		let fakeDocument = createDocument('*set {"this" + variable} 3');
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(1);
		expect(received[0].text).to.equal("variable");
		expect(received[0].location.range.start.line).to.equal(15);
		expect(received[0].location.range.end.line).to.equal(23);
	});

	it("should callback on variable replacements in strings", () => {
		let fakeDocument = createDocument('*set variable "${other_variable}"');
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(2);
		expect(received[0].text).to.equal("other_variable");
		expect(received[0].location.range.start.line).to.equal(17);
		expect(received[0].location.range.end.line).to.equal(31);
		expect(received[1].text).to.equal("variable");
	});

	it("should callback on multireplacements in strings", () => {
		let fakeDocument = createDocument('*set variable "@{other_variable this | that}"');
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(2);
		expect(received[0].text).to.equal("other_variable");
		expect(received[0].location.range.start.line).to.equal(17);
		expect(received[0].location.range.end.line).to.equal(31);
		expect(received[1].text).to.equal("variable");
	});

	it("should not callback on variable references in strings", () => {
		let fakeDocument = createDocument('*set variable "{other_variable}"');
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(1);
		expect(received[0].text).to.equal("variable");
	});

	it("should not callback on named operators", () => {
		let fakeDocument = createDocument('*set variable 4 modulo 2');
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(1);
		expect(received[0].text).to.equal("variable");
	});


	it("should not callback on functions", () => {
		let fakeDocument = createDocument('*set variable round(2.3)');
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(1);
		expect(received[0].text).to.equal("variable");
	});

	it("should not callback on named values", () => {
		let fakeDocument = createDocument('*set variable true');
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(1);
		expect(received[0].text).to.equal("variable");
	});
})

describe("Replace Parsing", () => {
	it("should callback on bare variables", () => {
		let fakeDocument = createDocument("${variable}");
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(1);
		expect(received[0].text).to.equal("variable");
		expect(received[0].location.range.start.line).to.equal(2);
		expect(received[0].location.range.end.line).to.equal(10);
	});

	it("should callback on capitalized replacements", () => {
		let fakeDocument = createDocument("$!{variable}");
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(1);
		expect(received[0].text).to.equal("variable");
		expect(received[0].location.range.start.line).to.equal(3);
		expect(received[0].location.range.end.line).to.equal(11);
	});

	it("should callback on all-caps replacements", () => {
		let fakeDocument = createDocument("$!!{variable}");
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(1);
		expect(received[0].text).to.equal("variable");
		expect(received[0].location.range.start.line).to.equal(4);
		expect(received[0].location.range.end.line).to.equal(12);
	});

	it("should callback on multiple variables in the replacement", () => {
		let fakeDocument = createDocument('${var1 + var2}');
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(2);
		expect(received[0].text).to.equal("var1");
		expect(received[0].location.range.start.line).to.equal(2);
		expect(received[0].location.range.end.line).to.equal(6);
		expect(received[1].text).to.equal("var2");
		expect(received[1].location.range.start.line).to.equal(9);
		expect(received[1].location.range.end.line).to.equal(13);
	});

	it("should not callback on strings in the replacement", () => {
		let fakeDocument = createDocument('${"var1" && var2}');
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(1);
		expect(received[0].text).to.equal("var2");
		expect(received[0].location.range.start.line).to.equal(12);
		expect(received[0].location.range.end.line).to.equal(16);
	});

	it("should callback on multireplacements in the replacement", () => {
		let fakeDocument = createDocument('${@{var1 true | false}}');
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(1);
		expect(received[0].text).to.equal("var1");
		expect(received[0].location.range.start.line).to.equal(4);
		expect(received[0].location.range.end.line).to.equal(8);
	});
})

describe("Multireplace Parsing", () => {
	it("should callback on bare variables in the test", () => {
		let fakeDocument = createDocument("@{variable this | that}");
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(1);
		expect(received[0].text).to.equal("variable");
		expect(received[0].location.range.start.line).to.equal(2);
		expect(received[0].location.range.end.line).to.equal(10);
	});

	it("should callback on multiple variables in the test", () => {
		let fakeDocument = createDocument('@{(var1 + var2 > 2) true | false}');
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(2);
		expect(received[0].text).to.equal("var1");
		expect(received[0].location.range.start.line).to.equal(3);
		expect(received[0].location.range.end.line).to.equal(7);
		expect(received[1].text).to.equal("var2");
		expect(received[1].location.range.start.line).to.equal(10);
		expect(received[1].location.range.end.line).to.equal(14);
	});

	it("should not callback on strings in the test", () => {
		let fakeDocument = createDocument('@{("var1" = var2) true | false}');
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(1);
		expect(received[0].text).to.equal("var2");
		expect(received[0].location.range.start.line).to.equal(12);
		expect(received[0].location.range.end.line).to.equal(16);
	});

	it("should callback on variables in the body", () => {
		let fakeDocument = createDocument('@{true true bit | ${var}}');
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(1);
		expect(received[0].text).to.equal("var");
		expect(received[0].location.range.start.line).to.equal(20);
		expect(received[0].location.range.end.line).to.equal(23);
	});
})

describe("Variable-Referencing Command Parsing", () => {
	it("should callback on local variables directly after a reference comand", () => {
		let fakeDocument = createDocument("*if variable > 1");
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(1);
		expect(received[0].text).to.equal("variable");
		expect(received[0].location.range.start.line).to.equal(4);
		expect(received[0].location.range.end.line).to.equal(12);
	});

	it("should not callback on strings", () => {
		let fakeDocument = createDocument('*if variable = "other_variable"');
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(1);
		expect(received[0].text).to.equal("variable");
		expect(received[0].location.range.start.line).to.equal(4);
		expect(received[0].location.range.end.line).to.equal(12);
	});

	it("should callback on variable replacements in strings", () => {
		let fakeDocument = createDocument('*if variable = "${other_variable}"');
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(2);
		expect(received[0].text).to.equal("other_variable");
		expect(received[0].location.range.start.line).to.equal(18);
		expect(received[0].location.range.end.line).to.equal(32);
	});

	it("should callback on complex variable replacements in strings", () => {
		let fakeDocument = createDocument('*if variable = "${"this" & other_variable}"');
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(2);
		expect(received[0].text).to.equal("other_variable");
		expect(received[0].location.range.start.line).to.equal(27);
		expect(received[0].location.range.end.line).to.equal(41);
	});

	it("should callback on multireplacements in strings", () => {
		let fakeDocument = createDocument('*if variable = "@{other_variable this | that}"');
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(2);
		expect(received[0].text).to.equal("other_variable");
		expect(received[0].location.range.start.line).to.equal(18);
		expect(received[0].location.range.end.line).to.equal(32);
	});

	it("should callback on multireplacements with replacements in strings", () => {
		let fakeDocument = createDocument('*if variable = "@{true ${other_variable} | that}"');
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(2);
		expect(received[0].text).to.equal("other_variable");
		expect(received[0].location.range.start.line).to.equal(25);
		expect(received[0].location.range.end.line).to.equal(39);
	});

	it("should not callback on choice text after a reference command", () => {
		let fakeDocument = createDocument("*if variable # This is a choice");
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onReference(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(1);
		expect(received[0].text).to.equal("variable");
		expect(received[0].location.range.start.line).to.equal(4);
		expect(received[0].location.range.end.line).to.equal(12);
	});
})

describe("Scene Parsing", () => {
	it("should callback on scene definitions", () => {
		let fakeDocument = createDocument("*scene_list\n\tscene-1\n\tscene-2\n");
		let received: Array<Array<string>> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onSceneDefinition(Arg.all()).mimicks((s: string[], l: Location, state: ParsingState) => {
			received.push(s);
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received).to.eql([['scene-1', 'scene-2']]);
	});
})

describe("Achievement Parsing", () => {
	it("should callback on an achievement", () => {
		let fakeDocument = createDocument("*achievement code_name");
		let received: Array<Symbol> = [];
		let fakeCallbacks = Substitute.for<ParserCallbacks>();
		fakeCallbacks.onAchievementCreate(Arg.all()).mimicks((s: string, l: Location, state: ParsingState) => {
			received.push({text: s, location: l});
		})

		parse(fakeDocument, fakeCallbacks);

		expect(received.length).to.equal(1);
		expect(received[0].text).to.equal("code_name");
		expect(received[0].location.range.start.line).to.equal(13);
		expect(received[0].location.range.end.line).to.equal(22);
	});
})