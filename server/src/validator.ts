import { TextDocument, Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';

import { ProjectIndex, ReadonlyIdentifierIndex } from './indexer';
import { startupCommands, validCommands, uriIsStartupFile } from './language';

let startupCommandsLookup: ReadonlyMap<string, number> = new Map(startupCommands.map(x => [x, 1]));
let validCommandsLookup: ReadonlyMap<string, number> = new Map(validCommands.map(x => [x, 1]));

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
 * @param reference Name of the variable being referenced.
 * @param index Location of the reference in the document.
 * @param projectIndex Index of the ChoiceScript project.
 * @param localVariables Index of local variables.
 * @param textDocument Document being validated.
 * @returns Diagnostic message, if any.
 */
function validateReference(reference: string, index: number, projectIndex: ProjectIndex,
		textDocument: TextDocument): Diagnostic | undefined {
	let diagnostic: Diagnostic | undefined = undefined;
	if (!projectIndex.getGlobalVariables().get(reference) && 
			!projectIndex.getLocalVariables(textDocument).get(reference)) {
		let referenceStartIndex = index;
		let referenceEndIndex = index + reference.length;
		diagnostic = createDiagnostic(DiagnosticSeverity.Error, textDocument,
			referenceStartIndex, referenceEndIndex,
			`Variable "${reference}" not defined in this file or startup.txt`);
	}
	return diagnostic;
}

/**
 * 
 * @param command Command to validate.
 * @param index Location of the reference in the document.
 * @param prefix Optional spacing before the command.
 * @param spacingAndData Optional spaces plus other data after the command.
 * @param projectIndex Index of the ChoiceScript project.
 * @param textDocument Doucment being validated.
 * @returns Diagnostic message, if any.
 */
function validateCommand(command: string, index: number, prefix: string | undefined, spacingAndData: string | undefined,
		projectIndex: ProjectIndex, textDocument: TextDocument): Diagnostic | undefined {
	let diagnostic = undefined;
	
	prefix = prefix ?? "";
	spacingAndData = spacingAndData ?? "";
	let commandStartIndex = index;
	let commandEndIndex = commandStartIndex + 1 + command.length;
	let data = spacingAndData.trimLeft();
	let dataStartIndex = commandEndIndex + spacingAndData.length - data.length;
	let tokens = data.trimRight().split(/\s+/);

	if (!prefix) {
		if (validCommandsLookup.get(command) && index > 0) {
			diagnostic = createDiagnostic(DiagnosticSeverity.Error, textDocument,
				commandStartIndex, commandEndIndex,
				`Command *${command} must be on a line by itself.`);
		}
	}
	else if (!validCommandsLookup.get(command)) {
		diagnostic = createDiagnostic(DiagnosticSeverity.Error, textDocument,
			commandStartIndex, commandEndIndex,
			`*${command} isn't a valid ChoiceScript command.`);
	}
	else {
		// Make sure we don't use commands that are limited to startup.txt in non-startup.txt files
		if (startupCommandsLookup.get(command) && uriIsStartupFile(textDocument.uri)) {
			diagnostic = createDiagnostic(DiagnosticSeverity.Error, textDocument,
				commandStartIndex, commandEndIndex,
				`*${command} can only be used in startup.txt`);
		}

		switch (command) {
			case "goto":
			case "gosub":
				// goto and gosub must refer to an existing label in the file
				if (tokens.length == 0) {
					diagnostic = createDiagnostic(DiagnosticSeverity.Error, textDocument,
						commandStartIndex, commandEndIndex,
						`Command *${command} requires a label`);
				}
				else if (!projectIndex.getLabels(textDocument).get(tokens[0])) {
					diagnostic = createDiagnostic(DiagnosticSeverity.Error, textDocument,
						dataStartIndex, dataStartIndex + tokens[0].length,
						`Label "${tokens[0]}" wasn't found in this file`);
				}
				break;

			case "goto_scene":
			case "gosub_scene":
				// goto and gosub must refer to an existing scene
				if (tokens.length == 0) {
					diagnostic = createDiagnostic(DiagnosticSeverity.Error, textDocument,
						commandStartIndex, commandEndIndex,
						`Command *${command} requires a scene`);
				}
				else if (!projectIndex.getSceneList().includes(tokens[0])) {
					diagnostic = createDiagnostic(DiagnosticSeverity.Error, textDocument,
						dataStartIndex, dataStartIndex + tokens[0].length,
						`Scene "${tokens[0]}" wasn't found in startup.txt`);
				}
				else if (tokens.length >= 2) {
					let sceneLabels = projectIndex.getSceneLabels(tokens[0]);
					if (sceneLabels !== undefined && sceneLabels.get(tokens[1]) === undefined) {
						let sceneIndex = data.lastIndexOf(tokens[1]);
						diagnostic = createDiagnostic(DiagnosticSeverity.Error, textDocument,
							dataStartIndex + sceneIndex, dataStartIndex + sceneIndex + tokens[1].length,
							`Label "${tokens[1]}" wasn't found in scene ${tokens[0]}`);
					}
				}
				break;
		}
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
	let diagnostics: Diagnostic[] = [];

	let text = textDocument.getText();
	let matchPattern: RegExp = /(?<prefix>\n\s*)?\*(?<command>\w+)(?<spacingAndData>[ \t]+(?<data>[^\r\n]+))?|(?<!@|@!|@!!){(?<reference>\w+)}|(?<styleGuide>(?<!\.)\.{3}(?!\.)|(?<!-)--(?!-))/g;
	let m: RegExpExecArray | null;

	while (m = matchPattern.exec(text)) {
		let diagnostic: Diagnostic | undefined = undefined;

		if (m.groups === undefined)
			continue;

		if (m.groups.styleGuide) {  // Items against CoG styleguide
			diagnostic = validateStyle(m.groups.styleGuide, m.index, textDocument);
		}
		else if (m.groups.reference !== undefined) {  // {reference} to a variable
			diagnostic = validateReference(m.groups.reference, m.index + 1, projectIndex, textDocument);
		}
		else {  // *command
			let prefix = m.groups.prefix ?? "";
			diagnostic = validateCommand(m.groups.command, m.index + prefix.length, prefix, m.groups.spacingAndData,
				projectIndex, textDocument);
		}
		
		if (diagnostic)
			diagnostics.push(diagnostic);
	}
	
	return diagnostics;
}
