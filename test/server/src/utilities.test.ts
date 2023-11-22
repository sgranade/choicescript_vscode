import { expect } from 'chai';
import 'mocha';

import { extractToMatchingDelimiter, findLineBegin, findLineEnd, mapToUnionedCaseInsensitiveMap, caseInsensitiveMapToMap, readLine, extractToMatchingIndent, readNextNonblankLine, CaseInsensitiveMap, fileURLToPath, pathToFileURL } from '../../../server/src/common/utilities';

/* eslint-disable */

describe("Utilities", () => {
	describe("Case-Insensitive Map", () => {
		it("should get values based on case-insensitive keys", () => {
			let uut = new CaseInsensitiveMap();

			uut.set('keY', 1);
			let results = uut.get('KEy');
			
			expect(results).to.eql(1);
		});

		it("should keep track of the case-sensitive keys", () => {
			let uut = new CaseInsensitiveMap();

			uut.set('keY', 1);
			uut.set('oTheR', 2);
			let results = Array.from(uut.caseInsensitiveKeysToKeys().entries());
			
			expect(results).to.eql([['key', 'keY'], ['other', 'oTheR']]);
		});

		it("should overwrite values based on case-insensitive keys", () => {
			let uut = new CaseInsensitiveMap();

			uut.set('keY', 1);
			uut.set('KEy', 2);
			let results = uut.get('key');
			
			expect(results).to.eql(2);
		});

		it("should keep track of the last-entered case-sensitive key", () => {
			let uut = new CaseInsensitiveMap();

			uut.set('keY', 1);
			uut.set('KEy', 2);
			let results = Array.from(uut.caseInsensitiveKeysToKeys().entries());
			
			expect(results).to.eql([['key', 'KEy']]);
		});

		it("should create unions from keys that are arrays", () => {
			let map = new Map([['key', [1, 2]], ['kEY', [3, 4]]]);

			let caseInsensitiveMap = mapToUnionedCaseInsensitiveMap(map);

			expect(caseInsensitiveMap.get("key")).to.eql([1, 2, 3, 4]);
		});

		it("should create case-sensitive maps", () => {
			const origMap = new CaseInsensitiveMap([["vaR", 1], ["oTheR", 2]]);

			const newMap = caseInsensitiveMapToMap(origMap);

			expect(Array.from(origMap.entries())).to.eql([["var", 1], ["other", 2]]);
			expect(Array.from(newMap.entries())).to.eql([["vaR", 1], ["oTheR", 2]]);
		});
	});

	describe("Delimiter Extraction", () => {
		it("should handle strings", () => {
			let text = 'string" and not';

			let extract = extractToMatchingDelimiter(text, '"', '"');

			expect(extract).to.equal("string");
		});

		it("should handle parentheses in parentheses", () => {
			let text = "out (in) out) and so on";

			let extract = extractToMatchingDelimiter(text, '(', ')');

			expect(extract).to.equal("out (in) out");
		});

		it("should handle braces in braces", () => {
			let text = "out {in} out} and so on";

			let extract = extractToMatchingDelimiter(text, '{', '}');

			expect(extract).to.equal("out {in} out");
		});

		it("should only match starting at a pased index", () => {
			let text = "(outer (inner) outer) and so on";

			let extract = extractToMatchingDelimiter(text, '(', ')', 8);

			expect(extract).to.equal("inner");
		});
	})

	describe("Finding Line Begin", () => {
		it("should work with a carriage return", () => {
			let text = "line1\nline2";

			let endLocation = findLineBegin(text, 8);

			expect(endLocation).to.equal(6);
		});

		it("should work with CRLF", () => {
			let text = "line1\r\nline2";

			let endLocation = findLineBegin(text, 9);

			expect(endLocation).to.equal(7);
		});
	})

	describe("Finding Line End", () => {
		it("should work with a carriage return", () => {
			let text = "line1\nline2";

			let endLocation = findLineEnd(text, 0);

			expect(endLocation).to.equal(6);
		});

		it("should work with CRLF", () => {
			let text = "line1\r\nline2";

			let endLocation = findLineEnd(text, 0);

			expect(endLocation).to.equal(7);
		});

		it("should be indexable", () => {
			let text = "line1\r\nline2\r\nline3\r\n";

			let endLocation = findLineEnd(text, 7);

			expect(endLocation).to.equal(14);
		});
	});

	describe("Reading Lines", () => {
		describe("Reading Next Lines", () => {
			it("should read a line at the start", () => {
				let text = "line1\nline2";

				let line = readLine(text, 0);

				expect(line).to.eql({ line: "line1\n", index: 0 });
			});

			it("should read a line in the middle", () => {
				let text = "line1\nline2";

				let line = readLine(text, 6);

				expect(line).to.eql({ line: "line2", index: 6 });
			});

			it("should capture leading whitespace", () => {
				let text = "line1\n  line2";

				let line = readLine(text, 6);

				expect(line).to.eql({ line: "  line2", index: 6, splitLine: { padding: "  ", contents: "line2" } });
			});

			it("should capture leading whitespace and a trailing carriage return", () => {
				let text = "  line1\n  line2";

				let line = readLine(text, 0);

				expect(line).to.eql({ line: "  line1\n", index: 0, splitLine: { padding: "  ", contents: "line1" } });
			});
		});

		describe("Reading Next Non-Blank Lines", () => {
			it("should skip empty lines", () => {
				let text = "line1\n\nline2";

				let line = readNextNonblankLine(text, 6);

				expect(line).to.eql({ line: "line2", index: 7 });
			});

			it("should skip lines with spaces", () => {
				let text = "line1\n    \nline2\n";

				let line = readNextNonblankLine(text, 6);

				expect(line).to.eql({ line: "line2\n", index: 11 });
			});
		});
	});


	describe("Extract Block", () => {
		it("should read a block indented by spaces", () => {
			let text = "start\n  line 1\n  line 2\n  line 3\nend";

			let block = extractToMatchingIndent(text, 0, 6);

			expect(block).to.eql("  line 1\n  line 2\n  line 3\n");
		});

		it("should read a block indented by tabs", () => {
			let text = "start\n\tline 1\n\tline 2\n\tline 3\nend";

			let block = extractToMatchingIndent(text, 0, 6);

			expect(block).to.eql("\tline 1\n\tline 2\n\tline 3\n");
		});

		it("should include deeper-indented blocks", () => {
			let text = "start\n\tline 1\n\t\tline a\n\t\tline b\n\tline 2\n\tline 3\nend";

			let block = extractToMatchingIndent(text, 0, 6);

			expect(block).to.eql("\tline 1\n\t\tline a\n\t\tline b\n\tline 2\n\tline 3\n");
		});

		it("should take into account the starting indent value", () => {
			let text = "start\n\tline 1\n\t\tline a\n\t\tline b\n\tline 2\n\tline 3\nend";

			let block = extractToMatchingIndent(text, 1, 14);

			expect(block).to.eql("\t\tline a\n\t\tline b\n");
		});
	});

	describe("Paths and URLs", () => {
		describe("fileURLToPath", () => {
			it("should convert an escaped Windows path with only a drive letter and no remaining slash", () => {
				const uri = "file:///c%3A";
	
				const result = fileURLToPath(uri);
	
				expect(result).to.eql("c:/");
			});
	
			it("should convert an escaped Windows path with a drive letter and trailing slash only", () => {
				const uri = "file:///c%3A/";
	
				const result = fileURLToPath(uri);
	
				expect(result).to.eql("c:/");
			});
	
			it("should convert an escaped Windows path with capitalized escape codes", () => {
				const uri = "file:///c%3A/docs/path";
	
				const result = fileURLToPath(uri);
	
				expect(result).to.eql("c:/docs/path");
			});
	
			it("should convert an escaped Windows path with lower case escape codes", () => {
				const uri = "file:///c%3a/docs/path";
	
				const result = fileURLToPath(uri);
	
				expect(result).to.eql("c:/docs/path");
			});
	
			it("should convert an escaped Posix path", () => {
				const uri = "file:///docs/space%20path";
	
				const result = fileURLToPath(uri);
	
				expect(result).to.eql("/docs/space path");
			});
		});

		describe("pathToFileURL", () => {
			it("should convert a Windows path to an escaped URI", () => {
				const path = "c:/path/to/file.txt";

				const result = pathToFileURL(path);

				expect(result).to.eql("file:///c%3A/path/to/file.txt");
			});

			it("should convert a Posix path to an escaped URI", () => {
				const path = "/space path/to/file.txt";

				const result = pathToFileURL(path);

				expect(result).to.eql("file:///space%20path/to/file.txt");
			});
		});
	});
})
