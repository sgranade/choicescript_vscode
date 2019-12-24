import { TextDocument, Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';

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
	stylePattern
} from './language';
import { getFilenameFromUri } from './utilities';

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
 * Split a command line into potential tokens.
 * @param line Line to split.
 * @returns Array of potential tokens.
 */
function splitLine(line: string): string[] {
	return line.trimRight().split(/\s+/);
}

/**
 * Generate a diagnostic message.
 * 
 * Pass start and end locations as 0-based indexes into the document's text.
 * 
 * @param severity Diagnostic severity
 * @param textDocument Document to which the diagnostic applies.
 * @param start Start location in the text of the diagnostic message.
 * @param end End location in the text of the diagnostic message.
 * @param message Diagnostic message.
 */
function createDiagnostic(severity: DiagnosticSeverity, textDocument: TextDocument, 
		start: number, end: number, message: string): Diagnostic {
	let diagnostic: Diagnostic = {
		severity: severity,
		range: {
			start: textDocument.positionAt(start),
			end: textDocument.positionAt(end)
		},
		message: message,
		source: 'ChoiceScript'
	};

	return diagnostic;
}

/**
 * Validate a set of characters against the Choice of Games style manual.
 * 
 * @param characters Characters being evaluated for style.
 * @param index Location of the characters in the document.
 * @param textDocument Document being validated.
 * @returns Diagnostic message, if any.
 */
function validateStyle(characters: string, index: number, textDocument: TextDocument): Diagnostic | undefined {
	let description = "";
	if (characters == '...')
		description = "ellipsis (…)";
	else
		description = "em-dash (—)";
	return createDiagnostic(DiagnosticSeverity.Information, textDocument,
		index, index + characters.length,
		`Choice of Games style requires a Unicode ${description}`);
}

/**
 * Validate a reference to a variable.
 * 
 * @param variable Name of the variable being referenced.
 * @param index Location of the reference in the document.
 * @param projectIndex Index of the ChoiceScript project.
 * @param textDocument Document being validated.
 * @returns Diagnostic message, if any.
 */
function validateVariableReference(variable: string, index: number, projectIndex: ProjectIndex,
		textDocument: TextDocument): Diagnostic | undefined {
	let diagnostic: Diagnostic | undefined = undefined;
	if (!projectIndex.getGlobalVariables().get(variable) && 
			!projectIndex.getLocalVariables(textDocument.uri).get(variable) &&
			!builtinVariablesLookup.get(variable)) {
		let referenceStartIndex = index;
		let referenceEndIndex = index + variable.length;
		diagnostic = createDiagnostic(DiagnosticSeverity.Error, textDocument,
			referenceStartIndex, referenceEndIndex,
			`Variable "${variable}" not defined in this file or startup.txt`);
	}
	return diagnostic;
}

/**
 * Validate a reference to a label.
 * @param label Name of the label being referenced.
 * @param index Location of the label reference in the document.
 * @param projectIndex Index of the ChoiceScript project.
 * @param textDocument Document being validated.
 * @param labelSourceUri Document where the label should live. If undefined, the textDocument's URI is used.
 */
function validateLabelReference(label: string, index: number, projectIndex: ProjectIndex,
		textDocument: TextDocument, labelSourceUri: string | undefined): Diagnostic | undefined {
	let diagnostic: Diagnostic | undefined = undefined;
	if (labelSourceUri === undefined)
		labelSourceUri = textDocument.uri;
	if (!projectIndex.getLabels(labelSourceUri).get(label)) {
		diagnostic = createDiagnostic(DiagnosticSeverity.Error, textDocument,
			index, index + label.length,
			`Label "${label}" wasn't found in ${getFilenameFromUri(labelSourceUri)}`);
	}
	return diagnostic;
}

/**
 * Validate a reference to a scene.
 * @param scene Name of the scene being referenced.
 * @param index Location of the scene reference in the document.
 * @param projectIndex Index of the ChoiceScript project.
 * @param textDocument Document being validated.
 */
function validateSceneReference(scene: string, index: number, projectIndex: ProjectIndex,
		textDocument: TextDocument): Diagnostic | undefined {
	let diagnostic: Diagnostic | undefined = undefined;
	if (!projectIndex.getSceneList().includes(scene)) {
		diagnostic = createDiagnostic(DiagnosticSeverity.Error, textDocument,
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
 * @param projectIndex Index of the ChoiceScript project.
 * @param textDocument Document being validated.
 */
function validateVariableManipulationCommand(command: string, commandIndex: number, line: string | undefined, 
	lineIndex: number, projectIndex: ProjectIndex, textDocument: TextDocument): Diagnostic[] {
	let diagnostics: Diagnostic[] = [];

	if (line === undefined) {
		diagnostics.push(createDiagnostic(DiagnosticSeverity.Error, textDocument, 
			commandIndex, commandIndex + command.length + 1,
			`Command *${command} is missing its arguments`));
	}
	else {
		let tokens = splitLine(line);
		let diagnostic = validateVariableReference(tokens[0], lineIndex, projectIndex, textDocument);
		if (diagnostic !== undefined)
			diagnostics.push(diagnostic);
	}

	return diagnostics;
}

/**
 * Validate commands like *if that reference variables.
 * @param command Command to validate.
 * @param commandIndex Location of the command in the document.
 * @param line Remainder of the line after the command.
 * @param lineIndex Location of the line in the document.
 * @param projectIndex Index of the ChoiceScript project.
 * @param textDocument Document being validated.
 */
function validateVariableReferenceCommand(command: string, commandIndex: number, line: string | undefined,
	lineIndex: number, projectIndex: ProjectIndex, textDocument: TextDocument): Diagnostic[] {
	let diagnostics: Diagnostic[] = [];

	if (line === undefined) {
		diagnostics.push(createDiagnostic(DiagnosticSeverity.Error, textDocument, 
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

		// Get rid of any quoted strings from the line
		line = line.replace(/(?<!\\)".*?(?<!\\)"/g, '');
		console.log(line);

		let tokenPattern = /\w+/g;
		let globalVariables = projectIndex.getGlobalVariables();
		if (globalVariables === undefined)
			globalVariables = new Map();
		let localVariables = projectIndex.getLocalVariables(textDocument.uri);
		if (localVariables === undefined)
			localVariables = new Map();
		let m: RegExpExecArray | null;
		while (m = tokenPattern.exec(line)) {
			if (!(functionsLookup.get(m[0]) || builtinVariablesLookup.get(m[0]) || namedOperatorsLookup.get(m[0]) || 
			globalVariables.get(m[0]) || localVariables.get(m[0]) || namedValuesLookup.get(m[0]))
			&& Number.isNaN(Number(m[0]))) {
				diagnostics.push(createDiagnostic(DiagnosticSeverity.Error, textDocument,
					lineIndex + m.index, lineIndex + m.index + m[0].length,
					`"${m[0]}" is not a variable, function, or named operator`));
			}
		}
	}

	return diagnostics;
}

/**
 * Validate commands like *goto and *gosub_scene that reference labels.
 * @param command Command to validate.
 * @param commandIndex Location of the command in the document.
 * @param line Remainder of the line after the command.
 * @param lineIndex Location of the line in the document.
 * @param projectIndex Index of the ChoiceScript project.
 * @param textDocument Document being validated.
 */
function validateLabelReferenceCommands(command: string, commandIndex: number, line: string | undefined,
	lineIndex: number, projectIndex: ProjectIndex, textDocument: TextDocument): Diagnostic[] {
	let diagnostics: Diagnostic[] = [];

	if (line === undefined) {
		diagnostics.push(createDiagnostic(DiagnosticSeverity.Error, textDocument, 
			commandIndex, commandIndex + command.length + 1,
			`Command *${command} is missing its arguments`));
	}
	else {
		let tokens = splitLine(line);
		let referencesScene = command.includes("_scene");

		if (referencesScene) {
			let diagnostic = validateSceneReference(tokens[0], lineIndex,
				projectIndex, textDocument);
			if (diagnostic !== undefined)
				diagnostics.push(diagnostic);
			
			if (tokens.length < 2) {
				diagnostics.push(createDiagnostic(DiagnosticSeverity.Error, textDocument, 
					lineIndex + line.length, lineIndex + line.length,
					`Command *${command} requires a label`));
			}
			else {
				let sceneDocumentUri = projectIndex.getSceneUri(tokens[0]);
				if (sceneDocumentUri !== undefined) {
					diagnostic = validateLabelReference(tokens[1], lineIndex + line.indexOf(tokens[1]),
						projectIndex, textDocument, sceneDocumentUri);
					if (diagnostic !== undefined)
						diagnostics.push(diagnostic);
				}
			}
		}
		else {
			let diagnostic = validateLabelReference(tokens[0], lineIndex,
				projectIndex, textDocument, undefined);
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
 * @param projectIndex Index of the ChoiceScript project.
 * @param textDocument Doucment being validated.
 * @returns Diagnostic message, if any.
 */
function validateCommand(command: string, index: number, prefix: string | undefined, spacing: string | undefined,
		line: string | undefined, projectIndex: ProjectIndex, textDocument: TextDocument): Diagnostic[] {
	let diagnostics: Diagnostic[] = [];
	
	let commandStartIndex = index;
	let commandEndIndex = commandStartIndex + 1 + command.length;
	let lineStartIndex = commandEndIndex;
	if (spacing !== undefined)
		lineStartIndex += spacing.length;

	if (prefix === undefined && validCommandsLookup.get(command) && index > 0) {
		diagnostics.push(createDiagnostic(DiagnosticSeverity.Error, textDocument,
			commandStartIndex, commandEndIndex,
			`Command *${command} can't have other text in front of it.`));
	}
	else if (!validCommandsLookup.get(command)) {
		diagnostics.push(createDiagnostic(DiagnosticSeverity.Error, textDocument,
			commandStartIndex, commandEndIndex,
			`*${command} isn't a valid ChoiceScript command.`));
	}
	else if (startupCommandsLookup.get(command) && !uriIsStartupFile(textDocument.uri)) {
		diagnostics.push(createDiagnostic(DiagnosticSeverity.Error, textDocument,
			commandStartIndex, commandEndIndex,
			`*${command} can only be used in startup.txt`));
	}
	else {
		if (variableManipulationCommandsLookup.get(command)) {
			diagnostics.push(...validateVariableManipulationCommand(command, commandStartIndex, line,
				lineStartIndex, projectIndex, textDocument));
		}
		else if (variableReferenceCommandsLookup.get(command)) {
			diagnostics.push(...validateVariableReferenceCommand(command, commandStartIndex, line,
				lineStartIndex, projectIndex, textDocument));
		}
		else if (labelReferenceCommandsLookup.get(command)) {
			diagnostics.push(...validateLabelReferenceCommands(command, commandStartIndex, line,
				lineStartIndex, projectIndex, textDocument));
		}

	}

	return diagnostics;
}

/**
 * Validate a text file and generate diagnostics against it.
 * 
 * @param textDocument Document to validate and generate diagnostics against
 * @param projectIndex Index of the ChoiceScript project
 * @returns List of diagnostic messages.
 */
export function generateDiagnostics(textDocument: TextDocument, projectIndex: ProjectIndex): Diagnostic[] {
	let diagnostics: Diagnostic[] = [];

	let text = textDocument.getText();
	let matchPattern = RegExp(`${commandPattern}|${referencePattern}|${stylePattern}`, 'g');
	let m: RegExpExecArray | null;

	while (m = matchPattern.exec(text)) {
		if (m.groups === undefined)
			continue;

		if (m.groups.styleGuide !== undefined) {  // Items against CoG styleguide
			let diagnostic = validateStyle(m.groups.styleGuide, m.index, textDocument);
			if (diagnostic !== undefined)
				diagnostics.push(diagnostic);
		}
		else if (m.groups.reference !== undefined) {  // {reference} to a variable
			let diagnostic = validateVariableReference(m.groups.referenceSymbol, 
				m.index + m.groups.reference.length - m.groups.referenceSymbol.length - 1, projectIndex, textDocument);
			if (diagnostic !== undefined)
				diagnostics.push(diagnostic);
		}
		else if (m.groups.command !== undefined) {  // *command
			let commandPrefix = m.groups.commandPrefix;
			let commandIndex = m.index;
			if (commandPrefix !== undefined)
				commandIndex += commandPrefix.length;
			diagnostics.push(...validateCommand(m.groups.command, commandIndex, commandPrefix, m.groups.commandSpacing,
				m.groups.commandLine, projectIndex, textDocument));
		}
	}
	
	return diagnostics;
}
