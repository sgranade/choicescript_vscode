import { expect } from 'chai';
import 'mocha';

import { extractTokenAtIndex, sceneFromUri, convertAchievementToVariable, uriIsStartupFile, uriIsChoicescriptStatsFile } from '../../../server/src/common/language';

/* eslint-disable */

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

	describe("Achievement Variable Name", () => {
		it("should turn an achievement codename into an achievement variable", () => {
			let codename = 'codename';

			let variable = convertAchievementToVariable(codename);

			expect(variable).to.equal("choice_achieved_codename");
		});
	})

	describe("ChoiceScript URIs", () => {
		it("should recognize the ChoiceScript startup file", () => {
			let uri = 'file:///path/to/a/scene/startup.txt';

			let isStartupFile = uriIsStartupFile(uri);

			expect(isStartupFile).to.be.true;
		});

		it("should recognize the ChoiceScript stats file", () => {
			let uri = 'file:///path/to/a/scene/choicescript_stats.txt';

			let isStatsFile = uriIsChoicescriptStatsFile(uri);

			expect(isStatsFile).to.be.true;
		});
	})
})
