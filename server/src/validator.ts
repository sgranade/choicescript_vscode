import { TextDocument, Location, Range, Position, Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';

import { ProjectIndex } from "./index";
import { 
	builtinVariables,
	uriIsStartupFile, 
	stylePattern,
	variableIsAchievement,
	variableIsPossibleParameter,
	incorrectCommandPattern,
	validCommands
} from './language';
import { getFilenameFromUri, createDiagnostic, createDiagnosticFromLocation } from './utilities';

let validCommandsLookup: ReadonlyMap<string, number> = new Map(validCommands.map(x => [x, 1]));
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

	constructor(projectIndex: ProjectIndex, textDocument: TextDocument) {
		this.projectIndex = projectIndex;
		this.textDocument = textDocument;
	}
}

/**
 * Get the location where a variable was created.
 * @param variable Variable to get.
 * @param state Validation state.
 */
function getVariableCreationLocation(variable: string, state: ValidationState): Location | undefined {
	let location = state.projectIndex.getGlobalVariables().get(variable);
	if (location !== undefined) {
		return location;
	}

	location = state.projectIndex.getLocalVariables(state.textDocument.uri).get(variable);

	return location;
}

/**
 * Validate a reference to a label.
 * @param label Name of the label being referenced.
 * @param labelSourceUri Document where the label should live. If undefined, the textDocument's URI is used.
 * @param location Location of the label reference in the document.
 * @param state Validation state.
 */
function validateLabelReference(
	label: string, labelSourceUri: string | undefined, location: Location, state: ValidationState
	): Diagnostic | undefined {
	let diagnostic: Diagnostic | undefined = undefined;
	if (labelSourceUri === undefined)
		labelSourceUri = state.textDocument.uri;

	if (!state.projectIndex.getLabels(labelSourceUri).get(label)) {
		diagnostic = createDiagnosticFromLocation(
			DiagnosticSeverity.Error, location,
			`Label "${label}" wasn't found in ${getFilenameFromUri(labelSourceUri)}`);
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

	if (!state.projectIndex.getSceneList().includes(scene)) {
		diagnostic = createDiagnosticFromLocation(
			DiagnosticSeverity.Error, location,
			`Scene "${scene}" wasn't found in startup.txt`
			);
	}

	return diagnostic;
}

/**
 * Compare two positions.
 * @param pos1 First position.
 * @param pos2 Second position.
 * @returns -1 if pos1 is before pos2, 0 if they're equal, 1 if pos1 is after pos2.
 */
function comparePositions(pos1: Position, pos2: Position): number {
	if (pos1.line == pos2.line && pos1.character == pos2.character) {
		return 0;
	}
	return (pos1.line > pos2.line || (pos1.line == pos2.line && pos1.character > pos2.character)) ? 1 : -1;
}

/**
 * Determine if one range is completely contained by a second.
 * @param range1 First range.
 * @param range2 Second range.
 */
function rangeInOtherRange(range1: Range, range2: Range): boolean {
	return (comparePositions(range1.start, range2.start) >= 0 &&
		comparePositions(range1.end, range2.end) <= 0);
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
		let creationLocation = getVariableCreationLocation(variable, state);

		if (creationLocation) {
			// Make sure we don't reference variables before they're created
			let badLocations = locations.filter((location: Location) => {
				return ((location.uri == creationLocation!.uri) && 
				(comparePositions(location.range.end, creationLocation!.range.start) < 0))
			});
			if (badLocations.length > 0) {
				let newDiagnostics = badLocations.map((location: Location): Diagnostic => {
					return createDiagnosticFromLocation(DiagnosticSeverity.Error, location,
						`Variable "${variable}" used before it was created`);
				})
				diagnostics.push(...newDiagnostics);
			}
		}
		else if (!builtinVariablesLookup.get(variable)) {
			let scopes = state.projectIndex.getVariableScopes(state.textDocument.uri);
			let trimmedLocations = locations;
			
			// Get rid of any variables that are legal achievement variables
			if (scopes.achievementVarScopes.length > 0 && 
				variableIsAchievement(variable, state.projectIndex.getAchievements())) {
				for (let scopeRange of scopes.achievementVarScopes) {
					trimmedLocations = locations.filter((location: Location) => {
						rangeInOtherRange(location.range, scopeRange)
					});
				}
			}
			// Get rid of any variables that are legal param_1 and similar
			if (scopes.paramScopes.length > 0 &&
				variableIsPossibleParameter(variable)) {
				for (let scopeRange of scopes.paramScopes) {
					trimmedLocations = locations.filter((location: Location) => {
						rangeInOtherRange(location.range, scopeRange)
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
				let sceneDocumentUri = state.projectIndex.getSceneUri(event.scene);
				if (sceneDocumentUri !== undefined) {
					diagnostic = validateLabelReference(
						event.label, sceneDocumentUri, event.labelLocation, state
					);
					if (diagnostic !== undefined)
						diagnostics.push(diagnostic);
				}
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

	if (validCommandsLookup.get(command)) {
		diagnostic = createDiagnostic(DiagnosticSeverity.Information, state.textDocument,
			index, index + command.length + 1,
			`*${command} should be on a line by itself`);
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

	// Validate references
	diagnostics.push(...validateReferences(state));

	// Validate flow control
	diagnostics.push(...validateFlowControlEvents(state));

	// TODO fix below this line
	let text = textDocument.getText();
	let matchPattern = RegExp(`${stylePattern}|${incorrectCommandPattern}`, 'g');
	let m: RegExpExecArray | null;

	while (m = matchPattern.exec(text)) {
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
	}
	
	return diagnostics;
}
