import { TextDocument, Location, Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';

import { ProjectIndex } from "./index";
import { findVariableCreationLocations, findLabelLocation } from "./searches";
import { 
	builtinVariables,
	uriIsStartupFile, 
	stylePattern,
	variableIsAchievement,
	variableIsPossibleParameter,
	incorrectCommandPattern,
	validCommands,
	reuseCommands,
	commandPattern,
	choicePattern,
	multiStartPattern
} from './language';
import { findLineBegin, comparePositions, createDiagnostic, createDiagnosticFromLocation, rangeInOtherRange } from './utilities';
import { tokenizeMultireplace } from './tokens';

let validCommandsLookup: ReadonlyMap<string, number> = new Map(validCommands.map(x => [x, 1]));
let reuseCommandsLookup: ReadonlyMap<string, number> = new Map(reuseCommands.map(x => [x, 1]));
let builtinVariablesLookup: ReadonlyMap<string, number> = new Map(builtinVariables.map(x => [x, 1]));

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

	text: string = "";

	constructor(projectIndex: ProjectIndex, textDocument: TextDocument) {
		this.projectIndex = projectIndex;
		this.textDocument = textDocument;
		this.text = textDocument.getText();
	}
}

function validateVariables(state: ValidationState): Diagnostic[] {
	let diagnostics: Diagnostic[] = [];

	// Make sure no local variables have the same name as global ones
	let globalVariables = state.projectIndex.getGlobalVariables();
	for (let [variable, locations] of state.projectIndex.getLocalVariables(state.textDocument.uri).entries()) {
		for (let location of locations) {
			if (globalVariables.has(variable)) {
				diagnostics.push(createDiagnosticFromLocation(
					DiagnosticSeverity.Information, location,
					`*temp variable "${variable}" has the same name as a global variable`
				));
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

	if (!(label !== undefined && label[0] == '{')) {
		let labelLocation = findLabelLocation(label, scene, state.textDocument, state.projectIndex);

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
		if (!state.projectIndex.getSceneList().includes(scene)) {
			diagnostic = createDiagnosticFromLocation(
				DiagnosticSeverity.Warning, location,
				`Scene "${scene}" wasn't found in startup.txt`
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
	let diagnostics: Diagnostic[] = [];

	// Validate references
	let references = state.projectIndex.getDocumentVariableReferences(state.textDocument.uri);
	let whereDefined = "in this file";
	if (!uriIsStartupFile(state.textDocument.uri)) {
		whereDefined += " or startup.txt";
	}
	for (let [variable, locations] of references.entries()) {
		// Effective creation locations take precedence
		let creationLocations = findVariableCreationLocations(variable, true, state.textDocument, state.projectIndex);

		if (creationLocations !== undefined) {
			// Make sure we don't reference variables before they're created
			let badLocations = locations.filter((location: Location) => {
				for (let creationLocation of creationLocations!) {
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
				if (uriIsStartupFile(state.textDocument.uri) || !state.projectIndex.getGlobalVariables().has(variable)) {
					let newDiagnostics = badLocations.map((location: Location): Diagnostic => {
						return createDiagnosticFromLocation(DiagnosticSeverity.Error, location,
							`Variable "${variable}" used before it was created`);
					});
					diagnostics.push(...newDiagnostics);
				}
			}
		}
		else if (!builtinVariablesLookup.has(variable)) {
			let scopes = state.projectIndex.getDocumentScopes(state.textDocument.uri);
			let trimmedLocations = locations;
			
			// Get rid of any variables that are legal achievement variables
			if (scopes.achievementVarScopes.length > 0 && 
				variableIsAchievement(variable, state.projectIndex.getAchievements()) !== undefined) {
				for (let scopeRange of scopes.achievementVarScopes) {
					trimmedLocations = locations.filter((location: Location) => {
						rangeInOtherRange(location.range, scopeRange);
					});
				}
			}
			// Get rid of any variables that are legal param_1 and similar
			if (scopes.paramScopes.length > 0 &&
				variableIsPossibleParameter(variable)) {
				for (let scopeRange of scopes.paramScopes) {
					trimmedLocations = locations.filter((location: Location) => {
						rangeInOtherRange(location.range, scopeRange);
					});
				}
			}
			let newDiagnostics = trimmedLocations.map((location: Location): Diagnostic => {
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
	let diagnostics: Diagnostic[] = [];

	for (let event of state.projectIndex.getFlowControlEvents(state.textDocument.uri)) {
		if (event.scene != "" && event.sceneLocation !== undefined) {
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
		else if (event.label != "" && event.labelLocation !== undefined) {
			let diagnostic = validateLabelReference(
				event.label, undefined, event.labelLocation, state
			);
			if (diagnostic !== undefined)
				diagnostics.push(diagnostic);
		}
	}

	return diagnostics;
}

/**
 * Validate a set of characters against the Choice of Games style manual.
 * 
 * @param characters Characters being evaluated for style.
 * @param index Location of the characters in the document.
 * @param state Validation state.
 * @returns Diagnostic message, if any.
 */
function validateStyle(characters: string, index: number, state: ValidationState): Diagnostic | undefined {
	let lineBegin = findLineBegin(state.text, index-1);
	let line = state.text.substring(lineBegin, index-1);
	let commandSearch = RegExp(commandPattern);
	let m = commandSearch.exec(line);
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
		let lineBegin = findLineBegin(state.text, index-1);
		let line = state.text.substring(lineBegin, index-1);
		let commandSearch = RegExp(commandPattern);
		let m = commandSearch.exec(line);
		let actualCommand = m?.groups?.command;
		if (actualCommand === undefined) {
			actualCommand = "";
		}

		// Anything goes in a comment
		if (actualCommand == "comment") {
			return;
		}

		// Make sure we're not in a situation where we can have another command before this one
		if ((command == "if" || command == "selectable_if") && (reuseCommandsLookup.has(actualCommand))) {
			return;
		}

		diagnostic = createDiagnostic(DiagnosticSeverity.Information, state.textDocument,
			index, index + command.length + 1,
			`*${command} should be on a line by itself`);
	}

	return diagnostic;
}

/**
 * Validate a choice.
 * 
 * @param choice Text of the choice.
 * @param index Location of the choice, starting with its leading "#".
 * @param state Validation state.
 * @returns Diagnostic message, if any.
 */
function validateChoice(choice: string, index: number, state: ValidationState): Diagnostic | undefined {
	let diagnostic: Diagnostic | undefined = undefined;
	let overLimitLocalIndex: number | undefined = undefined;

	// Count words while handling multireplaces
	let runningWordCount = 0;
	let multiPattern = RegExp(multiStartPattern);
	let e: RegExpExecArray | null;
	let remainingChoice = choice;
	let remainingLocalIndex = 0;
	while (e = multiPattern.exec(remainingChoice)) {
		let contentsSublocalIndex = e.index + e[0].length;
		let tokens = tokenizeMultireplace(
			remainingChoice, state.textDocument, index + remainingLocalIndex + contentsSublocalIndex, contentsSublocalIndex
		);
		if (tokens === undefined) {
			// Unterminated multireplace, so give up
			break;
		}
		else {
			// See if the bit before the multireplace has too many words already
			let pretext = remainingChoice.slice(0, e.index);
			// This pattern won't find the last word in the string if it's not followed by a space, but
			// that's what we want b/c it would be followed by the multireplace, which won't introduce a space
			let pretextWordCount = (pretext.match(/\S+?\s+?/g) || []).length;
			if (pretextWordCount > 15 - runningWordCount) {
				let m = pretext.match(`(\\S+?\\s+?){${15 - runningWordCount}}`);
				if (m != null && m[0].length < pretext.length) {
					overLimitLocalIndex = remainingLocalIndex + (m.index ?? 0) + m[0].length;
					break;
				}
			}

			runningWordCount += pretextWordCount;
			let longestBody = tokens.body[0];
			let longestWordCount = longestBody.text.split(/\s+/).length;
			for (let token of tokens.body.slice(1)) {
				let newWordCount = token.text.split(/\s+/).length;
				if (newWordCount > longestWordCount) {
					longestBody = token;
					longestWordCount = newWordCount;
				}
			}
			if (longestWordCount > 15 - runningWordCount) {
				let m = longestBody.text.match(`(\\S+?\\s+?){${15 - runningWordCount}}`);
				if (m != null && m[0].length < longestBody.text.length) {
					overLimitLocalIndex = remainingLocalIndex + longestBody.localIndex + (m.index ?? 0) + m[0].length;
					break;
				}
			}
			runningWordCount += longestWordCount;

			let endIndex = tokens.endIndex;
			// Any characters after the multireplace are part of its word count; don't double-count them
			while (endIndex < remainingChoice.length && remainingChoice[endIndex] != ' ' && remainingChoice[endIndex] != '\t') {
				endIndex++;
			}

			remainingChoice = remainingChoice.slice(endIndex);
			remainingLocalIndex += endIndex;
		}
	}

	if (overLimitLocalIndex === undefined && remainingChoice.trim() != "") {
		let m = remainingChoice.match(`(\\S+?\\s+?){${15 - runningWordCount}}`);
		if (m != null && m[0].length < remainingChoice.length) {
			overLimitLocalIndex = remainingLocalIndex + (m.index ?? 0) + m[0].length;
		}
	}

	// See if we've got more than 15 words
	if (overLimitLocalIndex !== undefined) {
		diagnostic = createDiagnostic(DiagnosticSeverity.Information, state.textDocument,
			index + overLimitLocalIndex, index + choice.length,
			"Choice is more than 15 words long");
	}

	return diagnostic;
}

/**
 * Validate a text file and generate diagnostics against it.
 * 
 * @param textDocument Document to validate and generate diagnostics against
 * @param projectIndex Index of the ChoiceScript project
 * @returns List of diagnostic messages.
 */
export function generateDiagnostics(textDocument: TextDocument, projectIndex: ProjectIndex): Diagnostic[] {
	let state = new ValidationState(projectIndex, textDocument);

	// Start with parse errors
	let diagnostics: Diagnostic[] = [...projectIndex.getParseErrors(textDocument.uri)];

	// Validate variable creations
	diagnostics.push(...validateVariables(state));

	// Validate references
	diagnostics.push(...validateReferences(state));

	// Validate flow control
	diagnostics.push(...validateFlowControlEvents(state));

	// Add suggestions for the user that don't rise to the level of an error
	let matchPattern = RegExp(`${stylePattern}|${incorrectCommandPattern}|${choicePattern}`, 'g');
	let m: RegExpExecArray | null;

	while (m = matchPattern.exec(state.text)) {
		if (m.groups === undefined)
			continue;

		if (m.groups.styleGuide !== undefined) {  // Items against CoG styleguide
			let diagnostic = validateStyle(m.groups.styleGuide, m.index, state);
			if (diagnostic !== undefined)
				diagnostics.push(diagnostic);
		}
		else if (m.groups.command !== undefined) {
			let diagnostic = validateCommandInLine(
				m.groups.command, m.index + m.groups.commandPrefix.length, state
			);
			if (diagnostic !== undefined)
				diagnostics.push(diagnostic);
		}
		else if (m.groups.choice !== undefined) {
			let diagnostic = validateChoice(m.groups.choice, m.index, state);
			if (diagnostic !== undefined)
				diagnostics.push(diagnostic);
		}
	}
	
	return diagnostics;
}
