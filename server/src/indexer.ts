import {
	TextDocument,
	Position
} from 'vscode-languageserver';

/**
 * Type for a mutable index of identifiers.
 */
export type IdentifierIndex = Map<string, Position>;

/**
 * Type for an immutable index of identifiers.
 */
export type ReadonlyIdentifierIndex = ReadonlyMap<string, Position>;

/**
 * Interface for an index of a ChoiceScript project.
 */
export interface ProjectIndex {
	updateGlobalVariables(newIndex: IdentifierIndex): void;
	updateLocalVariables(textDocument: TextDocument, newIndex: IdentifierIndex): void;
	updateLabels(textDocument: TextDocument, newIndex: IdentifierIndex): void;
	getGlobalVariables(): ReadonlyIdentifierIndex;
	getLocalVariables(textDocument: TextDocument): ReadonlyIdentifierIndex;
	getLabels(textDocument: TextDocument): ReadonlyIdentifierIndex;
	removeDocument(textDocument: TextDocument): void;
}

/**
 * Update project index for a document in that project.
 * 
 * @param textDocument Document to index.
 * @param isStartupFile True if the document is the ChoiceScript startup file.
 * @param index Project index to update.
 */
export function updateProjectIndex(textDocument: TextDocument, isStartupFile: boolean, index: ProjectIndex): void {
	let text = textDocument.getText();

	let pattern: RegExp | null = null;
	if (isStartupFile) {
		pattern = /(\n\s*)?\*(create|temp|label)\s+(\w+)/g;
	}
	else {
		// *create is not legal except in startup files
		pattern = /(\n\s*)?\*(temp|label)\s+(\w+)/g;
	}
	let m: RegExpExecArray | null;

	let newGlobalVariables: IdentifierIndex = new Map();
	let newLocalVariables: IdentifierIndex = new Map();
	let newLabels: IdentifierIndex = new Map();

	while (m = pattern.exec(text)) {
		let prefix: string = m[1];
		let command: string = m[2];
		let value: string = m[3];
		let commandPosition: Position = textDocument.positionAt(m.index + prefix.length);

		if (!(prefix === undefined && m.index > 0)) {
			switch (command) {
				case "create":
					// *create instantiates global variables
					newGlobalVariables.set(value, commandPosition);
					break;
				case "temp":
					// *temp instantiates variables local to the file
					newLocalVariables.set(value, commandPosition);
					break;
				case "label":
					// *label creates a goto/gosub label local to the file
					newLabels.set(value, commandPosition);
					break;
			}
		}
	}

	if (isStartupFile) {
		index.updateGlobalVariables(newGlobalVariables);
	}
	index.updateLocalVariables(textDocument, newLocalVariables);
	index.updateLabels(textDocument, newLabels);
}
