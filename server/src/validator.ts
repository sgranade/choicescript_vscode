import { TextDocument, Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';

import { ProjectIndex } from './indexer';
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
 * Validate a text file and generate diagnostics against it.
 * 
 * @param textDocument Document to validate and generate diagnostics against
 * @param projectIndex Index of the ChoiceScript project
 * @returns List of diagnostic messages.
 */
export function generateDiagnostics(textDocument: TextDocument, projectIndex: ProjectIndex): Diagnostic[] {
	let diagnostics: Diagnostic[] = [];
	// TODO clean this up like whoa

	// Validate commands start on a line
	let text = textDocument.getText();
	let commandPattern: RegExp = /(?<prefix>\n\s*)?\*(?<command>\w+)(?<spacingAndData>[ \t]+(?<data>[^\r\n]+))?|(?<!@|@!|@!!){(?<reference>\w+)}|(?<styleGuide>(?<!\.)\.{3}(?!\.)|(?<!-)--(?!-))/g;
	let m: RegExpExecArray | null;

	let isStartupFile = uriIsStartupFile(textDocument.uri);
	let currentLabels = projectIndex.getLabels(textDocument);
	let currentScenes = projectIndex.getSceneList();
	let currentGlobalVariables = projectIndex.getGlobalVariables();
	let currentLocalVariables = projectIndex.getLocalVariables(textDocument);

	while (m = commandPattern.exec(text)) {
		if (m.groups === undefined)
			continue;

		if (m.groups.styleGuide) {  // Items against CoG styleguide
			let characters = m.groups.styleGuide;
			let description = "";
			if (characters == "...")
				description = "ellipsis (…)";
			else
				description = "em-dash (—)";
			diagnostics.push(createDiagnostic(DiagnosticSeverity.Information, textDocument,
				m.index, m.index + m.groups.styleGuide.length,
				`Choice of Games style requires a Unicode ${description}`));
		}
		else if (m.groups.reference !== undefined) {  // {reference} to a variable
			let reference = m.groups.reference;
			if (!currentGlobalVariables.get(reference) && !currentLocalVariables.get(reference)) {
				let referenceStartIndex = m.index + 1;
				let referenceEndIndex = m.index + 1 + reference.length;
				diagnostics.push(createDiagnostic(DiagnosticSeverity.Error, textDocument,
					referenceStartIndex, referenceEndIndex,
					`Variable "${reference}" not defined in this file or startup.txt`));
			}
		}
		else {  // *command
			let prefix = (m.groups.prefix === undefined ? "" : m.groups.prefix);
			let command = m.groups.command;
			let spacingAndData = (m.groups.spacingAndData === undefined ? "" : m.groups.spacingAndData);
			let data = (m.groups.data === undefined ? "" : m.groups.data);
			let commandStartIndex = m.index + prefix.length;
			let commandEndIndex = commandStartIndex + 1 + command.length;
			let dataStartIndex = commandEndIndex + spacingAndData.length - data.length;
			let tokens = data.trimRight().split(/\s+/);
	
			if (!prefix) {
				if (validCommandsLookup.get(command) && m.index > 0) {
					diagnostics.push(createDiagnostic(DiagnosticSeverity.Error, textDocument,
						commandStartIndex, commandEndIndex,
						`Command *${command} must be on a line by itself.`));
				}
			}
			else if (!validCommandsLookup.get(command)) {
				diagnostics.push(createDiagnostic(DiagnosticSeverity.Error, textDocument,
					commandStartIndex, commandEndIndex,
					`*${command} isn't a valid ChoiceScript command.`));
			}
			else {
				// Make sure we don't use commands that are limited to startup.txt in non-startup.txt files
				if (startupCommandsLookup.get(command) && !isStartupFile) {
					diagnostics.push(createDiagnostic(DiagnosticSeverity.Error, textDocument,
						commandStartIndex, commandEndIndex,
						`*${command} can only be used in startup.txt`));
				}
	
				switch (command) {
					case "goto":
					case "gosub":
						// goto and gosub must refer to an existing label in the file
						if (tokens.length == 0) {
							diagnostics.push(createDiagnostic(DiagnosticSeverity.Error, textDocument,
								commandStartIndex, commandEndIndex,
								`Command *${command} requires a label`));
						}
						else if (currentLabels !== undefined && currentLabels.get(tokens[0]) === undefined) {
							diagnostics.push(createDiagnostic(DiagnosticSeverity.Error, textDocument,
								dataStartIndex, dataStartIndex + tokens[0].length,
								`Label "${tokens[0]}" wasn't found in this file`));
						}
						break;
	
					case "goto_scene":
					case "gosub_scene":
						// goto and gosub must refer to an existing scene
						if (tokens.length == 0) {
							diagnostics.push(createDiagnostic(DiagnosticSeverity.Error, textDocument,
								commandStartIndex, commandEndIndex,
								`Command *${command} requires a scene`));
						}
						else if (currentScenes.length > 0 && !currentScenes.includes(tokens[0])) {
							diagnostics.push(createDiagnostic(DiagnosticSeverity.Error, textDocument,
								dataStartIndex, dataStartIndex + tokens[0].length,
								`Scene "${tokens[0]}" wasn't found in startup.txt`));
						}
						else if (tokens.length >= 2) {
							let sceneLabels = projectIndex.getSceneLabels(tokens[0]);
							if (sceneLabels !== undefined && sceneLabels.get(tokens[1]) === undefined) {
								let sceneIndex = data.lastIndexOf(tokens[1]);
								diagnostics.push(createDiagnostic(DiagnosticSeverity.Error, textDocument,
									dataStartIndex + sceneIndex, dataStartIndex + sceneIndex + tokens[1].length,
									`Label "${tokens[1]}" wasn't found in scene ${tokens[0]}`));
							}
						}
						break;
				}
			}
		}
	}
	
	return diagnostics;
}
