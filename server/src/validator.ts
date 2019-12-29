import { TextDocument, Location, Position, Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';

import { ProjectIndex } from './indexer';
import { 
	startupCommands, 
	validCommands, 
	variableManipulationCommands,
	variableReferenceCommands,
	labelReferenceCommands,
	functions,
	builtinVariables,
	namedOperators,
	namedValues,
	uriIsStartupFile, 
	commandPattern, 
	referencePattern, 
	stylePattern,
	multiStartPattern,
	extractMultireplaceTest,
	variableIsAchievement,
	stringPattern
} from './language';
import { getFilenameFromUri, stringIsNumber, createDiagnostic, createDiagnosticFromLocation } from './utilities';

let validCommandsLookup: ReadonlyMap<string, number> = new Map(validCommands.map(x => [x, 1]));
let startupCommandsLookup: ReadonlyMap<string, number> = new Map(startupCommands.map(x => [x, 1]));
let variableManipulationCommandsLookup: ReadonlyMap<string, number> = new Map(variableManipulationCommands.map(x => [x, 1]));
let variableReferenceCommandsLookup: ReadonlyMap<string, number> = new Map(variableReferenceCommands.map(x => [x, 1]));
let labelReferenceCommandsLookup: ReadonlyMap<string, number> = new Map(labelReferenceCommands.map(x => [x, 1]));
let functionsLookup: ReadonlyMap<string, number> = new Map(functions.map(x => [x, 1]));
let builtinVariablesLookup: ReadonlyMap<string, number> = new Map(builtinVariables.map(x => [x, 1]));
let namedOperatorsLookup: ReadonlyMap<string, number> = new Map(namedOperators.map(x => [x, 1]));
let namedValuesLookup: ReadonlyMap<string, number> = new Map(namedValues.map(x => [x, 1]));

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
	 * True if *check_achievements has been run, bringing the "choice_achieved_[codename]" variables into scope
	 */
	achievementVariablesExist: boolean = false;

	constructor(projectIndex: ProjectIndex, textDocument: TextDocument) {
		this.projectIndex = projectIndex;
		this.textDocument = textDocument;
	}
}

/**
 * Split a command line into potential tokens at word boundaries.
 * @param line Line to split.
 * @returns Array of potential tokens.
 */
function splitLine(line: string): string[] {
	return line.trimRight().split(/\b/);
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
 * Determine if a variable name references an actual variable.
 * @param variable Variable name.
 * @param state Validation state.
 */
function isVariableReference(variable: string, state: ValidationState): boolean {
	let isAchievementVariable = false;

	if (state.achievementVariablesExist) {
		isAchievementVariable = variableIsAchievement(variable, state.projectIndex.getAchievements());
	}
	return (!!(
		state.projectIndex.getGlobalVariables().get(variable) ||
		state.projectIndex.getLocalVariables(state.textDocument.uri).get(variable) ||
		builtinVariablesLookup.get(variable) ||
		isAchievementVariable
	));
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
 * Validate a reference to a variable.
 * 
 * @param variable Name of the variable being referenced.
 * @param index Location of the reference in the document.
 * @param state Validation state.
 * @returns Diagnostic message, if any.
 */
function validateVariableReference(variable: string, index: number, state: ValidationState): Diagnostic | undefined {
	let diagnostic: Diagnostic | undefined = undefined;
	if (!isVariableReference(variable, state)) {
		let referenceStartIndex = index;
		let referenceEndIndex = index + variable.length;
		diagnostic = createDiagnostic(DiagnosticSeverity.Error, state.textDocument,
			referenceStartIndex, referenceEndIndex,
			`Variable "${variable}" not defined in this file or startup.txt`);
	}
	return diagnostic;
}

/**
 * Validate a reference to a label.
 * @param label Name of the label being referenced.
 * @param index Location of the label reference in the document.
 * @param state Validation state.
 * @param labelSourceUri Document where the label should live. If undefined, the textDocument's URI is used.
 */
function validateLabelReference(label: string, index: number, state: ValidationState,
	 labelSourceUri: string | undefined): Diagnostic | undefined {
	let diagnostic: Diagnostic | undefined = undefined;
	if (labelSourceUri === undefined)
		labelSourceUri = state.textDocument.uri;
	if (!state.projectIndex.getLabels(labelSourceUri).get(label)) {
		diagnostic = createDiagnostic(DiagnosticSeverity.Error, state.textDocument,
			index, index + label.length,
			`Label "${label}" wasn't found in ${getFilenameFromUri(labelSourceUri)}`);
	}
	return diagnostic;
}

/**
 * Validate a reference to a scene.
 * @param scene Name of the scene being referenced.
 * @param index Location of the scene reference in the document.
 * @param state Validation state.
 */
function validateSceneReference(scene: string, index: number, state: ValidationState): Diagnostic | undefined {
	let diagnostic: Diagnostic | undefined = undefined;
	if (!state.projectIndex.getSceneList().includes(scene)) {
		diagnostic = createDiagnostic(DiagnosticSeverity.Error, state.textDocument,
			index, index + scene.length,
			`Scene "${scene}" wasn't found in startup.txt`);
	}
	return diagnostic;
}

/**
 * Validate commands that manipulate variables like *set.
 * @param command Command to validate.
 * @param commandIndex Location of the command in the document.
 * @param line Remainder of the line after the command.
 * @param lineIndex Location of the line in the document.
 * @param state Validation state.
 */
function validateVariableManipulationCommand(command: string, commandIndex: number,	line: string | undefined,
	lineIndex: number, state: ValidationState): Diagnostic[] {
	let diagnostics: Diagnostic[] = [];

	if (line === undefined) {
		diagnostics.push(createDiagnostic(DiagnosticSeverity.Error, state.textDocument, 
			commandIndex, commandIndex + command.length + 1,
			`Command *${command} is missing its arguments`));
	}
	else {
		let tokens = splitLine(line);
		let diagnostic = validateVariableReference(tokens[0], lineIndex, state);
		if (diagnostic !== undefined)
			diagnostics.push(diagnostic);
	}

	return diagnostics;
}

/**
 * Validate any references in a string.
 * @param s String to validate.
 * @param index Location of the string in the document.
 * @param state Validation state.
 */
function validateString(s: string, index: number, state: ValidationState): Diagnostic[] {
	let diagnostics: Diagnostic[] = [];

	let pattern = RegExp(referencePattern, 'g');
	let m: RegExpExecArray | null;
	while (m = pattern.exec(s)) {
		if (m.groups === undefined)
			continue;
		if (m.groups.referenceSymbol !== undefined) {
			let diagnostic = validateVariableReference(m.groups.referenceSymbol, index + m.index, state);
			if (diagnostic !== undefined)
				diagnostics.push(diagnostic);
		}
	}

	return diagnostics;
}

/**
 * Validate an expression such as (variable > 3).
 * @param expression Expression to validate.
 * @param index Location of the expression in the document.
 * @param state Validation state.
 */
function validateExpression(expression: string, index: number, state: ValidationState): Diagnostic[] {
	let diagnostics: Diagnostic[] = [];

	// Extract and validate any quoted strings from the line
	let quotePattern = RegExp(stringPattern, 'g');
	let m: RegExpExecArray | null;
	while (m = quotePattern.exec(expression)) {
		// Only look for references
		if (m.groups !== undefined) {
			diagnostics.push(...validateString(m.groups.quote, index + m.index, state));
		}
	}

	// Now get rid of all of those strings
	expression = expression.replace(RegExp(stringPattern, 'g'), '');

	let tokenPattern = /\w+/g;
	while (m = tokenPattern.exec(expression)) {
		if (!(
			functionsLookup.get(m[0]) || 
			namedOperatorsLookup.get(m[0]) || 
			namedValuesLookup.get(m[0]) ||
			isVariableReference(m[0], state) ||
			stringIsNumber(m[0])
		)) {
			diagnostics.push(createDiagnostic(DiagnosticSeverity.Error, state.textDocument,
				index + m.index, index + m.index + m[0].length,
				`"${m[0]}" is not a variable, function, or named operator`));
		}
	}

	return diagnostics;
}

/**
 * Validate commands like *if that reference variables.
 * @param command Command to validate.
 * @param commandIndex Location of the command in the document.
 * @param line Remainder of the line after the command.
 * @param lineIndex Location of the line in the document.
 * @param state Validation state.
 */
function validateVariableReferenceCommand(command: string, commandIndex: number, line: string | undefined,
	lineIndex: number, state: ValidationState): Diagnostic[] {
	let diagnostics: Diagnostic[] = [];

	if (line === undefined) {
		diagnostics.push(createDiagnostic(DiagnosticSeverity.Error, state.textDocument, 
			commandIndex, commandIndex + command.length + 1,
			`Command *${command} is missing its arguments`));
	}
	else {
		// The *if and *selectable_if commands can be used with options, so take that into account
		if (command == "if" || command == "selectable_if") {
			let choiceSplit = line.split('#');
			if (choiceSplit !== undefined)
				line = choiceSplit[0];
		}

		diagnostics = validateExpression(line, lineIndex, state);
	}

	return diagnostics;
}

/**
 * Validate commands like *goto and *gosub_scene that reference labels.
 * @param command Command to validate.
 * @param commandIndex Location of the command in the document.
 * @param line Remainder of the line after the command.
 * @param lineIndex Location of the line in the document.
 * @param state Validation state.
 */
function validateLabelReferenceCommands(command: string, commandIndex: number, line: string | undefined,
	lineIndex: number, state: ValidationState): Diagnostic[] {
	let diagnostics: Diagnostic[] = [];

	if (line === undefined) {
		diagnostics.push(createDiagnostic(DiagnosticSeverity.Error, state.textDocument, 
			commandIndex, commandIndex + command.length + 1,
			`Command *${command} is missing its arguments`));
	}
	else {
		let tokens = splitLine(line);
		// Label references can include dashes, so glue those back together if needed
		let firstToken = "";
		let secondToken = "";
		for (let i = 0; i < tokens.length; i++) {
			if (tokens[i].trim().length == 0) {
				if (i + 1 < tokens.length) {
					secondToken = tokens[i + 1];
				}
				break;
			}
			firstToken += tokens[i];
		}
		let referencesScene = command.includes("_scene");

		if (referencesScene) {
			let diagnostic = validateSceneReference(firstToken, lineIndex, state);
			if (diagnostic !== undefined)
				diagnostics.push(diagnostic);
			
			if (secondToken.length > 0) {
				let sceneDocumentUri = state.projectIndex.getSceneUri(firstToken);
				if (sceneDocumentUri !== undefined) {
					diagnostic = validateLabelReference(secondToken, lineIndex + line.indexOf(secondToken),
						state, sceneDocumentUri);
					if (diagnostic !== undefined)
						diagnostics.push(diagnostic);
				}
			}
		}
		else {
			let diagnostic = validateLabelReference(firstToken, lineIndex, state, undefined);
			if (diagnostic !== undefined)
				diagnostics.push(diagnostic);
		}
	}

	return diagnostics;
}

/**
 * 
 * @param command Command to validate.
 * @param index Location of the reference in the document.
 * @param prefix Optional spaces before the command.
 * @param spacing Optional spaces after the command.
 * @param line Optional line continuing after the command and its spacing.
 * @param state Validation state.
 * @returns Diagnostic message, if any.
 */
function validateCommand(command: string, index: number, prefix: string | undefined, spacing: string | undefined,
		line: string | undefined, state: ValidationState): Diagnostic[] {
	let diagnostics: Diagnostic[] = [];
	
	let commandStartIndex = index;
	let commandEndIndex = commandStartIndex + 1 + command.length;
	let lineStartIndex = commandEndIndex;
	if (spacing !== undefined)
		lineStartIndex += spacing.length;

	// Handle commands that change validation state
	if (command == "check_achievements") {
		state.achievementVariablesExist = true;
	}

	if (prefix === undefined && validCommandsLookup.get(command) && index > 0) {
		diagnostics.push(createDiagnostic(DiagnosticSeverity.Error, state.textDocument,
			commandStartIndex, commandEndIndex,
			`Command *${command} can't have other text in front of it.`));
	}
	else if (!validCommandsLookup.get(command)) {
		diagnostics.push(createDiagnostic(DiagnosticSeverity.Error, state.textDocument,
			commandStartIndex, commandEndIndex,
			`*${command} isn't a valid ChoiceScript command.`));
	}
	else if (startupCommandsLookup.get(command) && !uriIsStartupFile(state.textDocument.uri)) {
		diagnostics.push(createDiagnostic(DiagnosticSeverity.Error, state.textDocument,
			commandStartIndex, commandEndIndex,
			`*${command} can only be used in startup.txt`));
	}
	else {
		if (variableManipulationCommandsLookup.get(command)) {
			diagnostics.push(...validateVariableManipulationCommand(command, commandStartIndex, line,
				lineStartIndex, state));
		}
		else if (variableReferenceCommandsLookup.get(command)) {
			diagnostics.push(...validateVariableReferenceCommand(command, commandStartIndex, line,
				lineStartIndex, state));
		}
		else if (labelReferenceCommandsLookup.get(command)) {
			diagnostics.push(...validateLabelReferenceCommands(command, commandStartIndex, line,
				lineStartIndex, state));
		}

	}

	return diagnostics;
}

/**
 * Validate a multi-replace.
 * 
 * @param index Location of the start of the multi-replacement's contents.
 * @param state Validation state.
 * @returns Diagnostic message, if any.
 */
function validateMultireplace(text: string, index: number, state: ValidationState): Diagnostic[] {
	let diagnostics: Diagnostic[] = [];

	let { testContents: multiTestContents, index: testIndex } = extractMultireplaceTest(text, index);
	if (multiTestContents !== undefined) {
		diagnostics = validateExpression(multiTestContents, testIndex, state);
	}

	return diagnostics;
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
	let references = projectIndex.getDocumentVariableReferences(textDocument.uri);
	let whereDefined = "in this file";
	if (!uriIsStartupFile(textDocument.uri)) {
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
		else {
			// TODO handle block-scoped variables!
			if (!builtinVariablesLookup.get(variable)) {
				let newDiagnostics = locations.map((location: Location): Diagnostic => {
					return createDiagnosticFromLocation(DiagnosticSeverity.Error, location,
						`Variable "${variable}" not defined ${whereDefined}`);
				});
				diagnostics.push(...newDiagnostics);
			}
		}
	}

	// TODO fix below this line
	let text = textDocument.getText();
	let matchPattern = RegExp(`${commandPattern}|${referencePattern}|${stylePattern}|${multiStartPattern}`, 'g');
	let m: RegExpExecArray | null;

	while (m = matchPattern.exec(text)) {
		if (m.groups === undefined)
			continue;

		if (m.groups.styleGuide !== undefined) {  // Items against CoG styleguide
			let diagnostic = validateStyle(m.groups.styleGuide, m.index, state);
			if (diagnostic !== undefined)
				diagnostics.push(diagnostic);
		}
		else if (m.groups.reference !== undefined) {  // {reference} to a variable
			let diagnostic = validateVariableReference(m.groups.referenceSymbol, 
				m.index + m.groups.reference.length - m.groups.referenceSymbol.length - 1, state);
			if (diagnostic !== undefined)
				diagnostics.push(diagnostic);
		}
		else if (m.groups.command !== undefined) {  // *command
			let commandPrefix = m.groups.commandPrefix;
			let commandIndex = m.index;
			if (commandPrefix !== undefined)
				commandIndex += commandPrefix.length;
			diagnostics.push(...validateCommand(m.groups.command, commandIndex, commandPrefix, m.groups.commandSpacing,
				m.groups.commandLine, state));
		}
		else if (m.groups.multi !== undefined) {  // @{variable true replacement | false replacement}
			diagnostics.push(...validateMultireplace(text, m.index + m[0].length, state));
		}
	}
	
	return diagnostics;
}
