import { expect } from 'chai';
import 'mocha';

import { extractToMatchingDelimiter, findLineEnd } from '../../../server/src/utilities';

describe("Utilities", () => {
	describe("Delimiter Extraction", () => {
		it("should handle parentheses in parentheses", () => {
			let text = "out (in) out) and so on";
	
			let extract = extractToMatchingDelimiter(text, '(', ')');
	
			expect(extract).to.equal("out (in) out");
		});
	
		it("should handle escaped open parens in parentheses", () => {
			let text = "out \\(in out) and so on";
	
			let extract = extractToMatchingDelimiter(text, '(', ')');
	
			expect(extract).to.equal("out \\(in out");
		});
	
		it("should handle escaped close parens in parentheses", () => {
			let text = "out in\\) out) and so on";
	
			let extract = extractToMatchingDelimiter(text, '(', ')');
	
			expect(extract).to.equal("out in\\) out");
		});
	
		it("should handle braces in braces", () => {
			let text = "out {in} out} and so on";
	
			let extract = extractToMatchingDelimiter(text, '{', '}');
	
			expect(extract).to.equal("out {in} out");
		});
	
		it("should handle escaped open braces in braces", () => {
			let text = "out \\{in out} and so on";
	
			let extract = extractToMatchingDelimiter(text, '{', '}');
	
			expect(extract).to.equal("out \\{in out");
		});
	
		it("should handle escaped close parens in parentheses", () => {
			let text = "out in\\} out} and so on";
	
			let extract = extractToMatchingDelimiter(text, '{', '}');
	
			expect(extract).to.equal("out in\\} out");
		});
	
		it("should only match starting at a pased index", () => {
			let text = "(outer (inner) outer) and so on";
	
			let extract = extractToMatchingDelimiter(text, '(', ')', 8);
	
			expect(extract).to.equal("inner");
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
	})
})
