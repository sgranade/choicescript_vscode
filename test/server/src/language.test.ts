import { expect } from 'chai';
import 'mocha';

import { extractTokenAtIndex, tokenizeMultireplace, sceneFromUri } from '../../../server/src/language';

describe("Language Routines", () => {
	describe("Token Extraction", () => {
		it("should extract a bare word", () => {
			let text = "bare word";
	
			let token = extractTokenAtIndex(text, 5);
	
			expect(token).to.equal("word");
		})
	
		it("should only extract word characters by default", () => {
			let text = "bare word-ette";
	
			let token = extractTokenAtIndex(text, 5);
	
			expect(token).to.equal("word");
		})
	
		it("should support non-word characters in a token", () => {
			let text = "bare word-ette";
	
			let token = extractTokenAtIndex(text, 5, "{}", "\\w-");
	
			expect(token).to.equal("word-ette");
		})
	
		it("should extract whole tokens based on delimiters", () => {
			let text = "bare {reference with spaces}";
	
			let token = extractTokenAtIndex(text, 5);
	
			expect(token).to.equal("{reference with spaces}");
		})
	
		it("should only use specified delimiters", () => {
			let text = "bare (parens with spaces)";
	
			let token = extractTokenAtIndex(text, 5);
	
			expect(token).to.be.undefined;
		})
	
		it("should support addditional delimiters", () => {
			let text = "bare (parens with spaces)";
	
			let token = extractTokenAtIndex(text, 5, "{}()");
	
			expect(token).to.equal("(parens with spaces)");
		})
	
	})
	
	describe("Multireplace Tokenization", () => {
		it("should extract a bare variable test", () => {
			let text = "variable yes | no} extra content";
	
			let tokens = tokenizeMultireplace(text);
	
			expect(tokens.test.text).to.equal("variable");
			expect(tokens.test.index).to.equal(0);
		});
	
		it("should extract a parenthesized test", () => {
			let text = "(var1 + var2) yes | no} extra content";
	
			let tokens = tokenizeMultireplace(text);
	
			expect(tokens.test.text).to.equal("var1 + var2");
			expect(tokens.test.index).to.equal(1);
		});
	
		it("should extract the bodies", () => {
			let text = "variable yes | no | maybe } extra content";
	
			let tokens = tokenizeMultireplace(text);
	
			expect(tokens.body[0].text).to.equal("yes");
			expect(tokens.body[0].index).to.equal(9);
			expect(tokens.body[1].text).to.equal("no");
			expect(tokens.body[1].index).to.equal(15);
			expect(tokens.body[2].text).to.equal("maybe");
			expect(tokens.body[2].index).to.equal(20);
		});
	
		it("should find the end index", () => {
			let text = "variable yes | no} extra content";
	
			let tokens = tokenizeMultireplace(text);
	
			expect(tokens.endIndex).to.equal(18);
		});
	
		it("should extract starting at a given index", () => {
			let text = "other text @{variable yes | no} extra content";
	
			let tokens = tokenizeMultireplace(text, 13);
	
			expect(tokens.test.text).to.equal("variable");
			expect(tokens.body[0].text).to.equal("yes");
			expect(tokens.body[1].text).to.equal("no");
		});
	
		it("should return indices relative to the global index", () => {
			let text = "other text @{variable yes | no} extra content";
	
			let tokens = tokenizeMultireplace(text, 13);
	
			expect(tokens.test.index).to.equal(13);
			expect(tokens.body[0].index).to.equal(22);
			expect(tokens.body[1].index).to.equal(28);
		});

		it("should return the full text inside the multireplace", () => {
			let text = "other text @{variable yes | no} extra content";
	
			let tokens = tokenizeMultireplace(text, 13);
	
			expect(tokens.fullText).to.equal("variable yes | no");
		});
	})

	describe("Scene Name", () => {
		it("should extract a scene name from a uri", () => {
			let uri = 'file:///path/to/a/scene/file.txt';

			let scene = sceneFromUri(uri);

			expect(scene).to.equal("file");
		});

		it("should return undefined if the uri doesn't match", () => {
			let uri = 'file:///path/to/meme.jpg';

			let scene = sceneFromUri(uri);

			expect(scene).to.be.undefined;
		});
	})
})
