import { expect } from 'chai';
import 'mocha';

import { extractToMatchingDelimiter } from '../../../server/src/utilities';

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
});
