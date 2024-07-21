import { expect } from 'chai';
import 'mocha';
import { Substitute } from '@fluffy-spoon/substitute';
import { URI as Uri } from 'vscode-uri';

import { ChoiceScriptCompiler } from '../../../client/src/common/choicescript-compiler';
import { IWorkspaceProvider } from '../../../client/src/common/interfaces/vscode-workspace-provider';

describe("ChoiceScript Compiler", () => {

	it("Compiles all scene files", async () => {
		const fakeSceneRoot = '/a/b/';
		const fakeSceneNames = [
			'startup',
			'scene1',
			'scene2'
		];
		const fakeSceneUris = fakeSceneNames.map(name =>
			Uri.file(`${fakeSceneRoot}${name}.txt`)
		);
		const fakeWorkspaceProvider = Substitute.for<IWorkspaceProvider>();
		fakeWorkspaceProvider.fs.returns!(
			{
				readFile: () => new Promise(r => r(new TextEncoder().encode("Test Content")))
			}
		);
		const csc = new ChoiceScriptCompiler(fakeWorkspaceProvider);
		return Promise.resolve(csc.compile(fakeSceneUris))
			.then(function(result) {
				expect(Object.keys(result.scenes).length === fakeSceneNames.length);
				for (const scene in result.scenes) {
					expect(fakeSceneNames).to.include(scene);
				}
			})
			.catch(function(err) { throw new Error(err); });
	});

	it("Compiles all scene files on Windows", async () => {
		const fakeSceneRoot = 'file:\\a\\b\\';
		const fakeSceneNames = [
			'startup',
			'scene1',
			'scene2'
		];
		const fakeSceneUris = fakeSceneNames.map(name =>
			Uri.file(`${fakeSceneRoot}${name}`)
		);
		const fakeWorkspaceProvider = Substitute.for<IWorkspaceProvider>();
		fakeWorkspaceProvider.fs.returns!(
			{
				readFile: () => new Promise(r => r(new TextEncoder().encode("Test Content")))
			}
		);
		const csc = new ChoiceScriptCompiler(fakeWorkspaceProvider);
		return Promise.resolve(csc.compile(fakeSceneUris))
			.then(function(result) {
				expect(Object.keys(result.scenes).length === fakeSceneNames.length);
				for (const scene in result.scenes) {
					expect(fakeSceneNames).to.include(scene);
				}
			})
			.catch(function(err) { throw new Error(err); });
	});

	it("Sets the game title", async () => {
		const title = 'My Awesome Game';
		const fakeSceneContent = `
		*create var 5
		*create another4
		*title ${title}
		*label start
		Text Text Text`;
		const fakeWorkspaceProvider = Substitute.for<IWorkspaceProvider>();
		fakeWorkspaceProvider.fs.returns!(
			{
				readFile: () => new Promise(r => r(new TextEncoder().encode(fakeSceneContent)))
			}
		);
		const csc = new ChoiceScriptCompiler(fakeWorkspaceProvider);
		return Promise.resolve(csc.compile([Uri.file('/a/b/startup.txt')]))
			.then(function(result) {
				expect(result.title).to.equal(title);
			})
			.catch(function(err) { throw new Error(err); });
	});

	it("Populates labels correctly", async () => {
		const fakeSceneContent = `
		*create var 5
		*create another4
		*label start
		Text Text Text
		*label mid
		*choice
			# Option 1
				*label c1
				*goto end
			# Option 2
				*label c2
				*goto end
		*label end
		*goto_scene next`;
		const fakeWorkspaceProvider = Substitute.for<IWorkspaceProvider>();
		fakeWorkspaceProvider.fs.returns!(
			{
				readFile: () => new Promise(r => r(new TextEncoder().encode(fakeSceneContent)))
			}
		);
		const csc = new ChoiceScriptCompiler(fakeWorkspaceProvider);
		return Promise.resolve(csc.compile([Uri.file('/a/b/startup.txt')]))
			.then(function(result) {
				expect(Object.keys(result.scenes.startup.labels)).to.have.members([
					'start',
					'mid',
					'c1',
					'c2',
					'end'
				]);
			})
			.catch(function(err) { throw new Error(err); });
	});
});