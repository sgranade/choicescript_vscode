import * as path from 'path';

import { type Location, type Diagnostic, DiagnosticSeverity, type DiagnosticRelatedInformation } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';

import type { ProjectIndex } from "./index";
import { findVariableCreationLocations, findLabelLocation } from "./searches";
import {
	builtinVariables,
	paramValues,
	uriIsStartupFile,
	stylePattern,
	variableIsAchievement,
	variableIsPossibleParameter,
	incorrectCommandPattern,
	validCommands,
	reuseCommands,
	commandPattern,
	optionPattern,
	multiStartPattern
} from './language';
import { findLineBegin, comparePositions, createDiagnostic, createDiagnosticFromLocation, rangeInOtherRange, normalizeUri } from './utilities';
import { tokenizeMultireplace } from './tokens';
import type { FileSystemService } from './file-system-service';

const validCommandsLookup: ReadonlyMap<string, number> = new Map(validCommands.map(x => [x, 1]));
const reuseCommandsLookup: ReadonlyMap<string, number> = new Map(reuseCommands.map(x => [x, 1]));
const builtinVariablesLookup: ReadonlyMap<string, number> = new Map(builtinVariables.map(x => [x, 1]));

/**
 * Validation settings.
 */
export interface ValidationSettings {
	/**
	 * Whether to validate against CoG style guides.
	 */
	useCoGStyleGuide: boolean;
}

/**
 * Captures information about the current state of validation
 */
class ValidationState {
	/**
	 * Index for the ChoiceScript project
	 */
	projectIndex: ProjectIndex;
	/**
	 * Document being validated
	 */
	textDocument: TextDocument;
	/**
	 * Normalized URI for the document.
	 */
	textDocumentUri: string;
	/**
	 * Validation settings
	 */
	validationSettings: ValidationSettings;
	/**
	 * Document text as fetched from textDocument
	 */
	text = "";

	constructor(projectIndex: ProjectIndex, textDocument: TextDocument, validationSettings: ValidationSettings) {
		this.projectIndex = projectIndex;
		this.textDocument = textDocument;
		this.textDocumentUri = normalizeUri(textDocument.uri);
		this.validationSettings = validationSettings;
		this.text = textDocument.getText();
	}
}

const startsWithLetterRegex = /^[a-zA-Z]/;

/**
 * Validate all variables' names.
 * @param state Current parsing state.
 */
function validateVariables(state: ValidationState): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];

	// Make sure all variable names start with a letter
	const globalVariables = state.projectIndex.getGlobalVariables();
	for (const [variable, location] of globalVariables.entries())
	{
		if (!startsWithLetterRegex.test(variable)) {
			diagnostics.push(createDiagnosticFromLocation(
				DiagnosticSeverity.Error, location,
				`"${variable}" must start with a letter`
			));
		}
	}
	// Check variable names and make sure no local variables have the same name as global ones or are repeated
	for (const [variable, locations] of state.projectIndex.getLocalVariables(state.textDocumentUri).entries()) {
		if (!startsWithLetterRegex.test(variable)) {
			for (const location of locations) {
				diagnostics.push(createDiagnosticFromLocation(
					DiagnosticSeverity.Error, location,
					`"${variable}" must start with a letter`
				));
			}
		}
		if (locations.length > 1) {
			const relatedInformation: DiagnosticRelatedInformation = {
				location: locations[0],
				message: `First creation of "${variable}"`
			};
			for (const location of locations.slice(1)) {
				const diagnostic = createDiagnosticFromLocation(
					DiagnosticSeverity.Information, location,
					`Local variable "${variable}" was defined earlier`
				);
				diagnostic.relatedInformation = [relatedInformation];
				diagnostics.push(diagnostic);
			}
		}
		const globalLocation = globalVariables.get(variable);
		if (globalLocation !== undefined) {
			const relatedInformation: DiagnosticRelatedInformation = {
				location: globalLocation,
				message: `First creation of "${variable}"`
			};
			for (const location of locations) {
				const diagnostic = createDiagnosticFromLocation(
					DiagnosticSeverity.Information, location,
					`Local variable "${variable}" has the same name as a global variable`
				);
				diagnostic.relatedInformation = [relatedInformation];
				diagnostics.push(diagnostic);
			}
		}
	}

	return diagnostics;
}

/**
 * Validate a reference to a label.
 * @param label Name of the label being referenced.
 * @param scene Scene document where the label should live. If undefined, the textDocument's URI is used.
 * @param location Location of the label reference in the document.
 * @param state Validation state.
 */
function validateLabelReference(
	label: string, scene: string | undefined, location: Location, state: ValidationState
): Diagnostic | undefined {
	let diagnostic: Diagnostic | undefined = undefined;

	if (!(label !== undefined && label[0] == '{') && (scene === undefined || scene[0] != '{')) {
		const labelLocation = findLabelLocation(label, scene, state.textDocumentUri, state.projectIndex);

		if (labelLocation === undefined) {
			diagnostic = createDiagnosticFromLocation(
				DiagnosticSeverity.Error, location,
				`Label "${label}" wasn't found`);
		}
	}
	return diagnostic;
}

/**
 * Validate a reference to a scene.
 * @param scene Name of the scene being referenced.
 * @param location Location of the scene reference in the document.
 * @param state Validation state.
 */
function validateSceneReference(
	scene: string, location: Location, state: ValidationState
): Diagnostic | undefined {
	let diagnostic: Diagnostic | undefined = undefined;

	if (!(scene !== undefined && scene[0] == '{')) {
		if (!state.projectIndex.getIndexedScenes().includes(scene)) {
			diagnostic = createDiagnosticFromLocation(
				DiagnosticSeverity.Warning, location,
				`Scene "${scene}" wasn't found in startup.txt or in the game's folder`
			);
		}
	}

	return diagnostic;
}

/**
 * Validate all variable references in a scene document.
 * @param state Validation state.
 */
function validateReferences(state: ValidationState): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	const projectIsIndexed = state.projectIndex.projectIsIndexed();

	// Validate references
	const references = state.projectIndex.getDocumentVariableReferences(state.textDocumentUri);
	let whereDefined = "in this file";
	if (!uriIsStartupFile(state.textDocumentUri)) {
		whereDefined += " or startup.txt";
	}
	for (const [variable, locations] of references.entries()) {
		// Effective creation locations take precedence
		const creationLocations = findVariableCreationLocations(variable, true, state.textDocumentUri, state.projectIndex);

		if (creationLocations !== undefined && creationLocations !== null) {
			// Make sure we don't reference variables before they're created
			const badLocations = locations.filter((location: Location) => {
				for (const creationLocation of creationLocations) {
					if ((location.uri == creationLocation.uri) &&
						(comparePositions(location.range.end, creationLocation.range.start) >= 0)) {
						return false;
					}
				}
				return true;
			});
			if (badLocations.length > 0) {
				// Handle the edge case where a local variable is referenced before it's created,
				// but there's a global variable with the same name
				if (uriIsStartupFile(state.textDocumentUri) || !state.projectIndex.getGlobalVariables().has(variable)) {
					const newDiagnostics = badLocations.map((location: Location): Diagnostic => {
						return createDiagnosticFromLocation(DiagnosticSeverity.Error, location,
							`Variable "${variable}" used before it was created`);
					});
					diagnostics.push(...newDiagnostics);
				}
			}
		}
		else if (!builtinVariablesLookup.has(variable) && !paramValues.test(variable) && projectIsIndexed) {
			const scopes = state.projectIndex.getDocumentScopes(state.textDocumentUri);
			let trimmedLocations = locations;

			// Get rid of any variables that are legal achievement variables
			if (scopes.achievementVarScopes.length > 0 &&
				variableIsAchievement(variable, state.projectIndex.getAchievements()) !== undefined) {
				for (const scopeRange of scopes.achievementVarScopes) {
					trimmedLocations = locations.filter((location: Location) => {
						rangeInOtherRange(location.range, scopeRange);
					});
				}
			}
			// Get rid of any variables that are legal param_1 and similar
			if (scopes.paramScopes.length > 0 &&
				variableIsPossibleParameter(variable)) {
				for (const scopeRange of scopes.paramScopes) {
					trimmedLocations = locations.filter((location: Location) => {
						rangeInOtherRange(location.range, scopeRange);
					});
				}
			}
			const newDiagnostics = trimmedLocations.map((location: Location): Diagnostic => {
				return createDiagnosticFromLocation(DiagnosticSeverity.Error, location,
					`Variable "${variable}" not defined ${whereDefined}`);
			});
			diagnostics.push(...newDiagnostics);
		}
	}

	return diagnostics;
}

/**
 * Validate all flow control events in a scene document.
 * @param state Validation state.
 */
function validateFlowControlEvents(state: ValidationState): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	const projectIsIndexed = state.projectIndex.projectIsIndexed();

	for (const event of state.projectIndex.getFlowControlEvents(state.textDocumentUri)) {
		if (event.scene != "" && event.sceneLocation !== undefined) {
			// We can only validate flow control events that reference another scene once the full project's been indexed
			if (projectIsIndexed) {
				let diagnostic = validateSceneReference(event.scene, event.sceneLocation, state);
				if (diagnostic) {
					diagnostics.push(diagnostic);
				}
				else if (event.label != "" && event.labelLocation !== undefined) {
					diagnostic = validateLabelReference(
						event.label, event.scene, event.labelLocation, state
					);
					if (diagnostic !== undefined)
						diagnostics.push(diagnostic);
				}
			}
		}
		else if (event.label != "" && event.labelLocation !== undefined) {
			const diagnostic = validateLabelReference(
				event.label, undefined, event.labelLocation, state
			);
			if (diagnostic !== undefined)
				diagnostics.push(diagnostic);
		}
	}

	return diagnostics;
}

const commandRegex = RegExp(commandPattern);

/**
 * Validate a set of characters against the Choice of Games style manual.
 * 
 * @param characters Characters being evaluated for style.
 * @param index Location of the characters in the document.
 * @param state Validation state.
 * @returns Diagnostic message, if any.
 */
function validateStyle(characters: string, index: number, state: ValidationState): Diagnostic | undefined {
	const lineBegin = findLineBegin(state.text, index - 1);
	const line = state.text.substring(lineBegin, index - 1);
	const m = commandRegex.exec(line);
	let actualCommand = m?.groups?.command;
	if (actualCommand === undefined) {
		actualCommand = "";
	}

	// Anything goes in a comment
	if (actualCommand == "comment") {
		return;
	}

	let description = "";
	if (characters == '...')
		description = "ellipsis (…)";
	else
		description = "em-dash (—)";
	return createDiagnostic(DiagnosticSeverity.Information, state.textDocument,
		index, index + characters.length,
		`Choice of Games style requires a Unicode ${description}`);
}

/**
 * Validate a potential command in the middle of a line.
 * 
 * @param command Possible command.
 * @param index Location of the command, starting with its leading "*".
 * @param state Validation state.
 * @returns Diagnostic message, if any.
 */
function validateCommandInLine(command: string, index: number, state: ValidationState): Diagnostic | undefined {
	let diagnostic: Diagnostic | undefined = undefined;

	if (validCommandsLookup.has(command)) {
		const lineBegin = findLineBegin(state.text, index - 1);
		const line = state.text.substring(lineBegin, index - 1);
		const m = commandRegex.exec(line);
		const actualCommand = m?.groups?.command ?? "";

		// Anything goes in a comment
		if (actualCommand == "comment") {
			return;
		}

		// Make sure we're not in a situation where we can have another command before this one
		if ((command == "if" || command == "selectable_if") && (reuseCommandsLookup.has(actualCommand))) {
			return;
		}

		// Throw out this corner case since it's an error that's caught in parsing
		if (reuseCommandsLookup.has(command) && (actualCommand == "if" || actualCommand == "selectable_if")) {
			return;
		}

		diagnostic = createDiagnostic(DiagnosticSeverity.Information, state.textDocument,
			index, index + command.length + 1,
			`*${command} should be on a line by itself`);
	}

	return diagnostic;
}

const mulitStartRegex = RegExp(multiStartPattern);

/**
 * Validate a choice option.
 * 
 * @param option Text of the option right after the starting "#".
 * @param index Location of the option right after its leading "#".
 * @param state Validation state.
 * @returns Diagnostic message, if any.
 */
function validateOption(option: string, index: number, state: ValidationState): Diagnostic | undefined {
	let diagnostic: Diagnostic | undefined = undefined;
	let overLimitLocalIndex: number | undefined = undefined;

	// Count words while handling multireplaces (assuming we're following CoG style guide requirements)
	if (state.validationSettings.useCoGStyleGuide) {
		let runningWordCount = 0;
		let e: RegExpExecArray | null;
		let remainingOption = option;
		let remainingLocalIndex = 0;
		while ((e = mulitStartRegex.exec(remainingOption))) {
			const contentsSublocalIndex = e.index + e[0].length;
			const tokens = tokenizeMultireplace(
				remainingOption, state.textDocument, index + remainingLocalIndex + contentsSublocalIndex, contentsSublocalIndex
			);
			if (tokens === undefined || tokens.unterminated) {
				// Content-free or unterminated multireplace, so give up
				break;
			}
	
			// See if the bit before the multireplace has too many words already
			const pretext = remainingOption.slice(0, e.index);
			// This pattern won't find the last word in the string if it's not followed by a space, but
			// that's what we want b/c it would be followed by the multireplace, which won't introduce a space
			const pretextWordCount = (pretext.match(/\S+?\s+?/g) || []).length;
			if (pretextWordCount > 15 - runningWordCount) {
				const m = pretext.match(`(\\S+?\\s+?){${15 - runningWordCount}}`);
				if (m != null && m[0].length < pretext.length) {
					overLimitLocalIndex = remainingLocalIndex + (m.index ?? 0) + m[0].length;
					break;
				}
			}
	
			runningWordCount += pretextWordCount;
			if (tokens.body.length > 0) {
				let longestBody = tokens.body[0];
				let longestWordCount = longestBody.text.split(/\s+/).length;
				for (const token of tokens.body.slice(1)) {
					const newWordCount = token.text.split(/\s+/).length;
					if (newWordCount > longestWordCount) {
						longestBody = token;
						longestWordCount = newWordCount;
					}
				}
				if (longestWordCount > 15 - runningWordCount) {
					const m = longestBody.text.match(`(\\S+?\\s+?){${15 - runningWordCount}}`);
					if (m != null && m[0].length < longestBody.text.length) {
						overLimitLocalIndex = remainingLocalIndex + longestBody.localIndex + (m.index ?? 0) + m[0].length;
						break;
					}
				}
				runningWordCount += longestWordCount;
			}
	
			let endIndex = tokens.endIndex;
			// Any characters after the multireplace are part of its word count; don't double-count them
			while (endIndex < remainingOption.length && remainingOption[endIndex] != ' ' && remainingOption[endIndex] != '\t') {
				endIndex++;
			}
	
			remainingOption = remainingOption.slice(endIndex);
			remainingLocalIndex += endIndex;
		}
	
		if (overLimitLocalIndex === undefined && remainingOption.trim() != "") {
			const m = remainingOption.match(`(\\S+?\\s+?){${15 - runningWordCount}}`);
			if (m != null && m[0].length + (m.index ?? 0) < remainingOption.length) {
				overLimitLocalIndex = remainingLocalIndex + (m.index ?? 0) + m[0].length;
			}
		}
	
		// See if we've got more than 15 words
		if (overLimitLocalIndex !== undefined) {
			diagnostic = createDiagnostic(DiagnosticSeverity.Information, state.textDocument,
				index + overLimitLocalIndex, index + option.length,
				"Option is more than 15 words long");
		}
	}

	return diagnostic;
}

/**
 * Validate whether or not images exist.
 * @param state Current parsing state.
 * @param fsProvider File system provider.
 */
async function validateImages(state: ValidationState, fsProvider: FileSystemService): Promise<Diagnostic[]> {
	const diagnostics: Diagnostic[] = [];
	let imagePath = state.projectIndex.getPlatformImagePath();

	for (const [image, locations] of state.projectIndex.getImages(state.textDocumentUri)) {
		let found = false;

		if (imagePath === undefined) {
			// Our logic: First look in the scene files' directory.
			// If the image isn't found, and the scene directory isn't the
			// workspace directory, check the directory above the scene
			// directory.
			imagePath = state.projectIndex.getPlatformScenePath();
			found = await fsProvider.fileExists(path.join(imagePath, image));
			if (!found && (
				path.relative(
					state.projectIndex.getPlatformWorkspacePath(),
					imagePath
				) != ""
			)) {
				imagePath = path.normalize(path.join(imagePath, '..'));
				found = await fsProvider.fileExists(path.join(imagePath, image));
			}
			if (found) {
				state.projectIndex.setPlatformImagePath(imagePath);
			}
		}
		else {
			found = await fsProvider.fileExists(path.join(imagePath, image));
		}

		if (!found) {
			diagnostics.push(...locations.map(l => createDiagnosticFromLocation(
				DiagnosticSeverity.Warning, l,
				`Couldn't find the image file`
			)));
		}
	}

	return diagnostics;
}

/**
 * Validate there are no swaps between tabs and spaces.
 * @param state Current parsing state.
 */
function validateIndents(state: ValidationState): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];

	let m = /(?:^|\n)([ \t])/.exec(state.text);

	if (m !== null) {
		const indentChar = m[1];

		let searchRegex: RegExp;
		let errorMessage: string;

		if (indentChar == " ") {
			// Look for tabs
			searchRegex = /(?:^|\n) *(\t+)/g;
			errorMessage = "Switched from spaces to tabs";
		}
		else {
			searchRegex = /(?:^|\n)\t*( +)/g;
			errorMessage = "Switched from tabs to spaces";
		}

		while ((m = searchRegex.exec(state.text))) {
			const diagnostic = createDiagnostic(DiagnosticSeverity.Error, state.textDocument,
				m.index + m[0].length - m[1].length, m.index + m[0].length,
				errorMessage);
			diagnostics.push(diagnostic);
		}
	}

	return diagnostics;
}

/**
 * Validate all achievements.
 * @param state Current parsing state.
 */
function validateAchievements(state: ValidationState): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];

	const achievements = state.projectIndex.getAchievements();
	let count = 0;
	let totalPoints = 0;
	const seenTitles: Map<string, Location> = new Map();
	let prevLocation: Location | undefined;
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	for (const [codename, [location, points, title]] of achievements) { 
		if (count == 100) {
			diagnostics.push(createDiagnosticFromLocation(
				DiagnosticSeverity.Error, location,
				"No more than 100 achievements allowed"
			));
		}
		count++;
		totalPoints += points;
		if (totalPoints > 1000) {
			diagnostics.push(createDiagnosticFromLocation(
				DiagnosticSeverity.Error, location,
				`Total achievement points must be 1,000 or less (this makes it ${totalPoints} points)`
			));
		}
		prevLocation = seenTitles.get(title);
		if (prevLocation !== undefined) {
			const relatedInformation: DiagnosticRelatedInformation = {
				location: prevLocation,
				message: "First achievement with that title"
			};
			const diagnostic = createDiagnosticFromLocation(
				DiagnosticSeverity.Error, location,
				"An achievement with the same title was defined earlier"
			);
			diagnostic.relatedInformation = [relatedInformation];
			diagnostics.push(diagnostic);
		}
		else {
			seenTitles.set(title, location);
		}
	}

	return diagnostics;
}

const matchPattern = RegExp(`${stylePattern}|${incorrectCommandPattern}|${optionPattern}`, 'g');

/**
 * Validate a text file and generate diagnostics against it.
 * 
 * @param textDocument Document to validate and generate diagnostics against
 * @param projectIndex Index of the ChoiceScript project
 * @param validationSettings Current validation settings
 * @param fsProvider File system provider
 * @returns List of diagnostic messages.
 */
export async function generateDiagnostics(textDocument: TextDocument, projectIndex: ProjectIndex, validationSettings: ValidationSettings, fsProvider: FileSystemService): Promise<Diagnostic[]> {
	const state = new ValidationState(projectIndex, textDocument, validationSettings);

	// Start with parse errors
	const diagnostics: Diagnostic[] = [...projectIndex.getParseErrors(state.textDocumentUri)];

	// Validate variable creations
	diagnostics.push(...validateVariables(state));

	// Validate references
	diagnostics.push(...validateReferences(state));

	// Validate flow control
	diagnostics.push(...validateFlowControlEvents(state));

	// Validate image existence
	diagnostics.push(...(await validateImages(state, fsProvider)));

	// Validate tabs/spaces
	diagnostics.push(...validateIndents(state));

	// Validate achievements
	diagnostics.push(...validateAchievements(state));

	// Add suggestions for the user that don't rise to the level of an error
	matchPattern.lastIndex = 0;
	let m: RegExpExecArray | null;

	while ((m = matchPattern.exec(state.text))) {
		if (m.groups === undefined)
			continue;

		if (m.groups.styleGuide !== undefined && state.validationSettings.useCoGStyleGuide) {  // Items against CoG styleguide
			const diagnostic = validateStyle(m.groups.styleGuide, m.index, state);
			if (diagnostic !== undefined)
				diagnostics.push(diagnostic);
		}
		else if (m.groups.command !== undefined) {
			const diagnostic = validateCommandInLine(
				m.groups.command, m.index + m.groups.commandPrefix.length, state
			);
			if (diagnostic !== undefined)
				diagnostics.push(diagnostic);
		}
		else if (m.groups.option !== undefined) {
			// The option match captures the entire line including the "#", so throw that away
			const diagnostic = validateOption(m.groups.option.slice(1), m.index + m[0].length - m.groups.option.length + 1, state);
			if (diagnostic !== undefined)
				diagnostics.push(diagnostic);
		}
	}

	return diagnostics;
}
