import { Position, Location, TextDocument, ReferenceContext, WorkspaceEdit, TextEdit } from 'vscode-languageserver';

import { ProjectIndex, ReadonlyIdentifierIndex } from "./index";
import { variableIsAchievement, convertAchievementToVariable } from './language';
import { positionInRange, normalizeUri } from './utilities';

/**
 * Type of a symbol.
 */
export enum SymbolType {
	Unknown,
	LocalVariable,
	GlobalVariable,
	Achievement,
	Label
}

/**
 * Location of a symbol.
 */
interface SymbolLocation {
	symbol: string;
	location: Location;
}

/**
 * Full information about an instance of a symbol.
 */
export interface SymbolInformation {
	symbol: string;
	location: Location;
	type: SymbolType;
	isDefinition: boolean;
}

/**
 * Find the location where a variable was created.
 * @param variable Variable to get.
 * @param returnEffectiveLocations Whether to return effective creation locations or not. 
 * @param document Document in which to look for local variables.
 * @param index Project index.
 */
export function findVariableCreationLocation(
	variable: string, considerEffectiveLocation: boolean, 
	document: TextDocument, index: ProjectIndex): Location | undefined {
	// Precedence order: effective location variable location; local; global
	let location: Location | undefined = undefined;
	if (considerEffectiveLocation) {
		location = index.getSubroutineLocalVariables(document.uri).get(variable);
		if (location !== undefined) {
			return location;
		}
	}

	location = index.getLocalVariables(document.uri).get(variable);
	if (location !== undefined) {
		return location;
	}

	location = index.getGlobalVariables().get(variable);

	return location;
}

/**
 * Find the location where a label was defined.
 * @param label Label.
 * @param scene Scene document in which the label should reside, or undefined.
 * @param document Local document.
 * @param index Project index.
 */
export function findLabelLocation(
	label: string, scene: string | undefined, document: TextDocument,
	index: ProjectIndex): Location | undefined {
	let location: Location | undefined = undefined;

	let uri: string | undefined;
	if (scene === undefined || scene == "") {
		uri = document.uri;
	}
	else {
		uri = index.getSceneUri(scene);
	}

	if (uri !== undefined) {
		location = index.getLabels(uri).get(label);
	}

	return location;
}

/**
 * Find where an achievement is defined.
 * @param codename Codename of an achievement.
 * @param index Project index.
 */
function findAchievementLocation(codename: string, index: ProjectIndex): Location | undefined {
	let location = index.getAchievements().get(codename);
	
	return location;
}

/**
 * Find a symbol whose location encompasses the position.
 * @param position Position in the document.
 * @param index Index of symbols and their locations.
 */
function findMatchingSymbol(documentUri: string, position: Position, index: ReadonlyIdentifierIndex): SymbolLocation | undefined {
	documentUri = normalizeUri(documentUri);
	for (let [symbol, location] of index.entries()) {
		if (normalizeUri(location.uri) == documentUri && positionInRange(position, location.range)) {
			return { symbol: symbol, location: location };
		}
	}
	return undefined;
}

/**
 * Find where a symbol at a position is defined in the project.
 * @param document Current document.
 * @param position Position in the document.
 * @param projectIndex Project index.
 * @returns Symbol, location, type, and whether it's a definition (it is!), all undefined if not found.
 */
export function findDefinition(
	document: TextDocument, 
	position: Position, 
	projectIndex: ProjectIndex): SymbolInformation | undefined {
	let definition: SymbolInformation | undefined = undefined;
	let uri = document.uri;

	// See if we have a created local variable at this location
	let localVariables = projectIndex.getLocalVariables(uri);
	let symbolLocation = findMatchingSymbol(uri, position, localVariables);
	if (symbolLocation !== undefined) {
		let type = SymbolType.LocalVariable;
		if (projectIndex.isStartupFileUri(uri)) {
			type = SymbolType.GlobalVariable;
		}
		definition = {
			symbol: symbolLocation.symbol,
			location: symbolLocation.location,
			type: type,
			isDefinition: true
		};
		return definition;
	}

	// See if we have a created global variable at this location
	if (projectIndex.isStartupFileUri(uri)) {
		symbolLocation = findMatchingSymbol(uri, position, projectIndex.getGlobalVariables());
		if (symbolLocation !== undefined) {
			definition = {
				symbol: symbolLocation.symbol,
				location: symbolLocation.location,
				type: SymbolType.GlobalVariable,
				isDefinition: true
			};
			return definition;
		}
	}

	// See if we have a variable reference at this location
	let references = projectIndex.getDocumentVariableReferences(uri);
	for (let [variable, locations] of references.entries()) {
		let match = locations.find((location) => {
			return (positionInRange(position, location.range));
		});
		if (match !== undefined) {
			let location = findVariableCreationLocation(variable, false, document, projectIndex);
			if (location !== undefined) {
				let type = SymbolType.LocalVariable;
				if (projectIndex.isStartupFileUri(location.uri)) {
					type = SymbolType.GlobalVariable;
				}
				definition = {
					symbol: variable,
					location: location,
					type: type,
					isDefinition: true
				};
			}
			else {
				let achievements = projectIndex.getAchievements();
				let codename = variableIsAchievement(variable, achievements);
				if (codename !== undefined) {
					let location = achievements.get(codename);
					if (location !== undefined) {
						definition = {
							symbol: codename,
							location: location,
							type: SymbolType.Achievement,
							isDefinition: true
						};
					}
				}
			}

			return definition; // Found or not, we had a reference match, so return
		}
	}

	// See if we have a created label at this location
	let labels = projectIndex.getLabels(uri);
	symbolLocation = findMatchingSymbol(uri, position, labels);
	if (symbolLocation !== undefined) {
		definition = {
			symbol: symbolLocation.symbol,
			location: symbolLocation.location,
			type: SymbolType.Label,
			isDefinition: true
		};
		return definition;
	}

	// See if we have a label reference at this location
	let events = projectIndex.getFlowControlEvents(uri);
	let event = events.find((event) => {
		return (event.labelLocation !== undefined && 
			positionInRange(position, event.labelLocation.range));
	});
	if (event !== undefined) {
		let location = findLabelLocation(event.label, event.scene, document, projectIndex);
		if (location !== undefined) {
			definition = {
				symbol: event.label,
				location: location,
				type: SymbolType.Label,
				isDefinition: true
			};
		}

		return definition; // Found or not, we had a reference match, so return
	}

	// See if we have an achievement definition at this location
	let achievements = projectIndex.getAchievements();
	symbolLocation = findMatchingSymbol(uri, position, achievements);
	if (symbolLocation !== undefined) {
		definition = {
			symbol: symbolLocation.symbol,
			location: symbolLocation.location,
			type: SymbolType.Achievement,
			isDefinition: true
		};
		return definition;
	}

	// See if we have an achievement reference at this location
	let achievementReferences = projectIndex.getDocumentAchievementReferences(uri);
	for (let [codename, locations] of achievementReferences.entries()) {
		let match = locations.find(location => {
			return (positionInRange(position, location.range));
		});
		if (match !== undefined) {
			let location = findAchievementLocation(codename, projectIndex);
			if (location !== undefined) {
				definition = {
					symbol: codename,
					location: location,
					type: SymbolType.Achievement,
					isDefinition: true
				};
			}
			return definition;
		}
	}

	return definition;
}

/**
 * Find all references to a variable.
 * @param definition Variable definition.
 * @param projectIndex Project index.
 */
function findVariableReferences(definition: SymbolInformation, projectIndex: ProjectIndex): SymbolInformation[] {
	let information: SymbolInformation[] = [];

	if (definition.type == SymbolType.GlobalVariable) {
		information = projectIndex.getVariableReferences(definition.symbol).map(reference => {
			return { 
				symbol: definition.symbol, 
				location: reference, 
				type: definition.type, 
				isDefinition: false 
			};
		});
	}
	else {
		let localReferences = projectIndex.getDocumentVariableReferences(definition.location.uri);
		let possibleLocations = localReferences.get(definition.symbol);
		if (possibleLocations !== undefined) {
			information = possibleLocations.map((reference: Location): SymbolInformation => {
				return { 
					symbol: definition.symbol, 
					location: reference, 
					type: definition.type, 
					isDefinition: false 
				};
			});
		}
	}
	return information;
}

/**
 * Find all references to a label.
 * @param definition Label definition.
 * @param projectIndex Project index.
 */
function findLabelReferences(definition: SymbolInformation, projectIndex: ProjectIndex): SymbolInformation[] {
	let information = projectIndex.getLabelReferences(definition.symbol, definition.location.uri).map(reference => {
		return { 
			symbol: definition.symbol, 
			location: reference, 
			type: definition.type, 
			isDefinition: false 
		};
	});

	return information;
}

/**
 * Find all references to an achievement.
 * @param definition Achievement definition.
 * @param projectIndex Project index.
 */
function findAchievementReferences(definition: SymbolInformation, projectIndex: ProjectIndex): SymbolInformation[] {
	let information = projectIndex.getAchievementReferences(definition.symbol).map(reference => {
		return { 
			symbol: definition.symbol, 
			location: reference, 
			type: definition.type, 
			isDefinition: false 
		};
	});
	// Add variable-based references, if any
	information.push(...projectIndex.getVariableReferences(
		convertAchievementToVariable(definition.symbol)).map(reference => {
			return { 
				symbol: definition.symbol, 
				location: reference, 
				type: SymbolType.LocalVariable, 
				isDefinition: false 
			};
		})
	);

	return information;
}

/**
 * Find all references, if any, to a symbol at a position in a document.
 * 
 * The symbol can be a variable or label.
 * 
 * If the definition is included as a reference, it is located at the end of the returned array.
 * @param textDocument Document containing the reference.
 * @param position Cursor position in the document.
 * @param context Reference request context.
 * @param projectIndex Project index.
 */
export function findReferences(
		textDocument: TextDocument,
		position: Position,
		context: ReferenceContext,
		projectIndex: ProjectIndex
	): SymbolInformation[] | undefined {
	let information: SymbolInformation[] = [];

	let definition = findDefinition(textDocument, position, projectIndex);
	if (definition === undefined) {
		return undefined;
	}

	if (definition.type == SymbolType.GlobalVariable || definition.type == SymbolType.LocalVariable) {
		information = findVariableReferences(definition, projectIndex);
	}
	else if (definition.type == SymbolType.Label) {
		information = findLabelReferences(definition, projectIndex);
	}
	else if (definition.type == SymbolType.Achievement) {
		information = findAchievementReferences(definition, projectIndex);
	}

	if (context.includeDeclaration) {
		information.push(definition);
	}

	if (information.length == 0) {
		return undefined;
	}
	return information;
}

/**
 * Generate renames for a symbol.
 * @param textDocument Document containing the symbol to rename.
 * @param position Cursor position.
 * @param newName New name for the symbol.
 * @param projectIndex Project index.
 */
export function generateRenames(
	textDocument: TextDocument, position: Position, newName: string, projectIndex: ProjectIndex
	): WorkspaceEdit | null {

	let referencesToChange = findReferences(textDocument, position, {includeDeclaration: true}, projectIndex);

	if (referencesToChange === undefined) {
		return null;
	}

	// The definition should be included and is guaranteed to be at the end of the array
	let definition = referencesToChange[referencesToChange.length - 1];
	let changes: Map<string, TextEdit[]> = new Map();

	for (let reference of referencesToChange) {
		let change = TextEdit.replace(reference.location.range, newName);
		// Local variables that refer to achievements have to be handled differently
		if (definition.type == SymbolType.Achievement && reference.type == SymbolType.LocalVariable) {
			change.newText = convertAchievementToVariable(newName);
		}
		let edits = changes.get(reference.location.uri);
		if (edits === undefined) {
			edits = [];
			changes.set(reference.location.uri, edits);
		}
		edits.push(change);
	}

	let workspaceEdit: WorkspaceEdit = {
		changes: {
		}
	};
	for (let [uri, edits] of changes) {
		workspaceEdit.changes![uri] = edits;
	}

	return workspaceEdit;
}
