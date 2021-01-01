import { Position, Location, ReferenceContext, WorkspaceEdit, TextEdit } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { ProjectIndex, ReadonlyIdentifierIndex, ReadonlyLabelIndex, ReadonlyIdentifierMultiIndex } from "./index";
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
 * Find the location or locations where a variable was created.
 * @param variable Variable to get.
 * @param returnEffectiveLocations Whether to return effective creation locations or not. 
 * @param document Document in which to look for local variables.
 * @param index Project index.
 */
export function findVariableCreationLocations(
	variable: string, considerEffectiveLocation: boolean,
	document: TextDocument, index: ProjectIndex): Location[] | undefined {
	// Precedence order: effective location variable location; local; global
	let location: Location | undefined = undefined;
	if (considerEffectiveLocation) {
		location = index.getSubroutineLocalVariables(document.uri).get(variable);
		if (location !== undefined) {
			return [location];
		}
	}

	const locations = index.getLocalVariables(document.uri).get(variable);
	if (locations !== undefined && locations.length != 0) {
		return Array.from(locations);
	}

	location = index.getGlobalVariables().get(variable);
	if (location !== undefined) {
		return [location];
	}

	return undefined;
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
		location = index.getLabels(uri).get(label)?.location;
	}

	return location;
}

/**
 * Find where an achievement is defined.
 * @param codename Codename of an achievement.
 * @param index Project index.
 */
function findAchievementLocation(codename: string, index: ProjectIndex): Location | undefined {
	const location = index.getAchievements().get(codename);

	return location;
}

/**
 * Find a symbol whose location encompasses the position.
 * @param documentUri Document's uri.
 * @param position Position in the document.
 * @param index Index of symbols and their locations.
 */
function findMatchingSymbol(documentUri: string, position: Position, index: ReadonlyIdentifierIndex): SymbolLocation | undefined {
	documentUri = normalizeUri(documentUri);
	for (const [symbol, location] of index.entries()) {
		if (normalizeUri(location.uri) == documentUri && positionInRange(position, location.range)) {
			return { symbol: symbol, location: location };
		}
	}
	return undefined;
}

/**
 * Find a symbol with one of multiple locations that encompasses the position.
 * @param documentUri Document's uri.
 * @param position Position in the document.
 * @param index Index of symbols and their locations.
 */
function findMatchingMultiSymbol(documentUri: string, position: Position, index: ReadonlyIdentifierMultiIndex): SymbolLocation[] | undefined {
	documentUri = normalizeUri(documentUri);
	for (const [symbol, locations] of index.entries()) {
		for (const location of locations) {
			if (normalizeUri(location.uri) == documentUri && positionInRange(position, location.range)) {
				return locations.map(location => {
					return { symbol: symbol, location: location };
				});
			}
		}
	}
	return undefined;
}

/**
 * Find a label whose location encompasses the position.
 * @param documentUri Document's uri.
 * @param position Position in the document.
 * @param index Index of labels.
 */
function findMatchingLabel(documentUri: string, position: Position, index: ReadonlyLabelIndex): SymbolLocation | undefined {
	documentUri = normalizeUri(documentUri);
	for (const [symbol, label] of index.entries()) {
		if (normalizeUri(label.location.uri) == documentUri && positionInRange(position, label.location.range)) {
			return { symbol: symbol, location: label.location };
		}
	}
	return undefined;
}

/**
 * Find where a symbol at a position is defined in the project.
 * 
 * Note that, for local variables, multiple definitions are possible.
 * @param document Current document.
 * @param position Position in the document.
 * @param projectIndex Project index.
 * @returns Array of symbol, location, type, and whether it's a definition (it is!), or undefined if not found.
 */
export function findDefinitions(
	document: TextDocument,
	position: Position,
	projectIndex: ProjectIndex): SymbolInformation[] | undefined {
	let definitions: SymbolInformation[] | undefined = undefined;
	const uri = document.uri;

	// See if we have a created local variable at this location
	const localVariables = projectIndex.getLocalVariables(uri);
	const symbolLocations = findMatchingMultiSymbol(uri, position, localVariables);
	if (symbolLocations !== undefined) {
		let type = SymbolType.LocalVariable;
		if (projectIndex.isStartupFileUri(uri)) {
			type = SymbolType.GlobalVariable;
		}
		definitions = symbolLocations.map(symbolLocation => {
			return {
				symbol: symbolLocation.symbol,
				location: symbolLocation.location,
				type: type,
				isDefinition: true
			};
		});
		return definitions;
	}

	// See if we have a created global variable at this location
	if (projectIndex.isStartupFileUri(uri)) {
		const symbolLocation = findMatchingSymbol(uri, position, projectIndex.getGlobalVariables());
		if (symbolLocation !== undefined) {
			definitions = [{
				symbol: symbolLocation.symbol,
				location: symbolLocation.location,
				type: SymbolType.GlobalVariable,
				isDefinition: true
			}];
			return definitions;
		}
	}

	// See if we have a variable reference at this location
	const references = projectIndex.getDocumentVariableReferences(uri);
	for (const [variable, locations] of references.entries()) {
		const match = locations.find((location) => {
			return (positionInRange(position, location.range));
		});
		if (match !== undefined) {
			const locations = findVariableCreationLocations(variable, false, document, projectIndex);
			if (locations !== undefined) {
				let type = SymbolType.LocalVariable;
				if (projectIndex.isStartupFileUri(locations[0].uri)) {
					type = SymbolType.GlobalVariable;
				}
				definitions = locations.map(location => {
					return {
						symbol: variable,
						location: location,
						type: type,
						isDefinition: true
					};
				});
			}
			else {
				const achievements = projectIndex.getAchievements();
				const codename = variableIsAchievement(variable, achievements);
				if (codename !== undefined) {
					const location = achievements.get(codename);
					if (location !== undefined) {
						definitions = [{
							symbol: codename,
							location: location,
							type: SymbolType.Achievement,
							isDefinition: true
						}];
					}
				}
			}

			return definitions; // Found or not, we had a reference match, so return
		}
	}

	// See if we have a created label at this location
	const labels = projectIndex.getLabels(uri);
	let symbolLocation = findMatchingLabel(uri, position, labels);
	if (symbolLocation !== undefined) {
		definitions = [{
			symbol: symbolLocation.symbol,
			location: symbolLocation.location,
			type: SymbolType.Label,
			isDefinition: true
		}];
		return definitions;
	}

	// See if we have a label reference at this location
	const events = projectIndex.getFlowControlEvents(uri);
	const event = events.find((event) => {
		return (event.labelLocation !== undefined &&
			positionInRange(position, event.labelLocation.range));
	});
	if (event !== undefined) {
		const location = findLabelLocation(event.label, event.scene, document, projectIndex);
		if (location !== undefined) {
			definitions = [{
				symbol: event.label,
				location: location,
				type: SymbolType.Label,
				isDefinition: true
			}];
		}

		return definitions; // Found or not, we had a reference match, so return
	}

	// See if we have an achievement definition at this location
	const achievements = projectIndex.getAchievements();
	symbolLocation = findMatchingSymbol(uri, position, achievements);
	if (symbolLocation !== undefined) {
		definitions = [{
			symbol: symbolLocation.symbol,
			location: symbolLocation.location,
			type: SymbolType.Achievement,
			isDefinition: true
		}];
		return definitions;
	}

	// See if we have an achievement reference at this location
	const achievementReferences = projectIndex.getDocumentAchievementReferences(uri);
	for (const [codename, locations] of achievementReferences.entries()) {
		const match = locations.find(location => {
			return (positionInRange(position, location.range));
		});
		if (match !== undefined) {
			const location = findAchievementLocation(codename, projectIndex);
			if (location !== undefined) {
				definitions = [{
					symbol: codename,
					location: location,
					type: SymbolType.Achievement,
					isDefinition: true
				}];
			}
			return definitions;
		}
	}

	return definitions;
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
		const localReferences = projectIndex.getDocumentVariableReferences(definition.location.uri);
		const possibleLocations = localReferences.get(definition.symbol);
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
	const information = projectIndex.getLabelReferences(definition.symbol).map(reference => {
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
	const information = projectIndex.getAchievementReferences(definition.symbol).map(reference => {
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

	const definitions = findDefinitions(textDocument, position, projectIndex);
	if (definitions === undefined) {
		return undefined;
	}

	const firstDefinition = definitions[0];
	if (firstDefinition.type == SymbolType.GlobalVariable || firstDefinition.type == SymbolType.LocalVariable) {
		information = findVariableReferences(firstDefinition, projectIndex);
	}
	else if (firstDefinition.type == SymbolType.Label) {
		information = findLabelReferences(firstDefinition, projectIndex);
	}
	else if (firstDefinition.type == SymbolType.Achievement) {
		information = findAchievementReferences(firstDefinition, projectIndex);
	}

	if (context.includeDeclaration) {
		information.push(...definitions);
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

	const referencesToChange = findReferences(textDocument, position, { includeDeclaration: true }, projectIndex);

	if (referencesToChange === undefined) {
		return null;
	}

	// The definition should be included and is guaranteed to be at the end of the array
	const definition = referencesToChange[referencesToChange.length - 1];
	const changes: Map<string, TextEdit[]> = new Map();

	for (const reference of referencesToChange) {
		const change = TextEdit.replace(reference.location.range, newName);
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

	const workspaceEdit: WorkspaceEdit = {
		changes: {
		}
	};
	for (const [uri, edits] of changes) {
		if (workspaceEdit.changes) {
			workspaceEdit.changes[uri] = edits;
		}
	}

	return workspaceEdit;
}
