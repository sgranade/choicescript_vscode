import { Position, Location, TextDocument, ReferenceContext } from 'vscode-languageserver';

import { ProjectIndex } from "./index";
import { variableIsAchievement, extractSymbolAtIndex } from './language';
import { positionInRange } from './utilities';

/**
 * Type of the symbol being defined.
 */
export enum DefinitionType {
	Variable,
	Achievement,
	Label
}

/**
 * A symbol definition.
 */
export interface SymbolDefinition {
	symbol?: string,
	location?: Location,
	type?: DefinitionType
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
 * Find where a symbol at a position is defined in the project.
 * @param document Current document.
 * @param position Position in the document.
 * @param projectIndex Project index.
 * @returns Definition location and type, which are undefined if not found.
 */
export function findDefinition(
	document: TextDocument, position: Position, projectIndex: ProjectIndex): SymbolDefinition {
	let definition: SymbolDefinition = { symbol: undefined, location: undefined, type: undefined };

	// See if we have a created variable at this location
	let localVariables = projectIndex.getLocalVariables(document.uri);
	for (let [variable, location] of localVariables.entries()) {
		if (positionInRange(position, location.range)) {
			definition.symbol = variable;
			definition.location = location;
			definition.type = DefinitionType.Variable;
			return definition;
		}
	}

	// See if we have a variable reference at this location
	let references = projectIndex.getDocumentVariableReferences(document.uri);
	for (let [variable, locations] of references.entries()) {
		let match = locations.find((location) => {
			return (positionInRange(position, location.range));
		})
		if (match !== undefined) {
			definition.location = findVariableCreationLocation(variable, false, document, projectIndex);
			if (definition.location !== undefined) {
				definition.symbol = variable;
				definition.type = DefinitionType.Variable;
			}
			else {
				let achievements = projectIndex.getAchievements();
				let codename = variableIsAchievement(variable, achievements);
				if (codename !== undefined) {
					definition.symbol = codename;
					definition.location = achievements.get(codename);
					definition.type = DefinitionType.Achievement;
				}
			}

			return definition; // Found or not, we had a reference match, so return
		}
	}

	// See if we have a created label at this location
	let labels = projectIndex.getLabels(document.uri);
	for (let [label, location] of labels.entries()) {
		if (positionInRange(position, location.range)) {
			definition.symbol = label;
			definition.location = location;
			definition.type = DefinitionType.Label;
			return definition;
		}
	}

	// See if we have a label reference at this location
	let events = projectIndex.getFlowControlEvents(document.uri);
	let event = events.find((event) => {
		return (event.labelLocation !== undefined && 
			positionInRange(position, event.labelLocation.range));
	});
	if (event !== undefined) {
		definition.location = findLabelLocation(event.label, event.scene, document, projectIndex);
		if (definition.location !== undefined) {
			definition.symbol = event.label;
			definition.type = DefinitionType.Label;
		}

		return definition; // Found or not, we had a reference match, so return
	}

	return definition;
}

/**
 * Find all references, if any, to a symbol at a position in a document.
 * 
 * The symbol can be a variable or label.
 * @param textDocument Document containing the reference.
 * @param position Cursor position in the document.
 * @param context Reference request context.
 * @param projectIndex Project index.
 */
export function findReferences(textDocument: TextDocument, position: Position, context: ReferenceContext, projectIndex: ProjectIndex): Location[] {
	let text = textDocument.getText();
	let cursorIndex = textDocument.offsetAt(position);
	let locations: Location[] = [];

	let definition = findDefinition(textDocument, position, projectIndex);
	if (definition.type == DefinitionType.Variable && definition.symbol !== undefined) {
		locations = [...projectIndex.getVariableReferences(definition.symbol)];
		if (context.includeDeclaration && definition.location !== undefined) {
			locations.push(definition.location);
		}
	}
	else if (definition.type == DefinitionType.Label && definition.symbol !== undefined) {
		locations = [...projectIndex.getLabelReferences(definition.symbol, textDocument.uri)];
		if (context.includeDeclaration && definition.location !== undefined) {
			locations.push(definition.location);
		}

	}

	return locations;
}
