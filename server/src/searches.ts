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
 * Location and type of a symbol definition.
 */
export interface LocationAndType {
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

	let uri: string | undefined = document.uri;
	if (scene !== undefined && scene != "") {
		uri = index.getSceneUri(scene);
	}
	if (uri !== undefined) {
		location = index.getLabels(uri).get(label);
	}

	return location;
}

/**
 * Find all references to a symbol, if any.
 * @param textDocument Document containing the reference.
 * @param position Cursor position in the document.
 * @param context Reference request context.
 * @param projectIndex Project index.
 */
export function findReferences(textDocument: TextDocument, position: Position, context: ReferenceContext, projectIndex: ProjectIndex): Location[] {
	let text = textDocument.getText();
	let cursorIndex = textDocument.offsetAt(position);
	let symbol = extractSymbolAtIndex(text, cursorIndex);

	let locations = [...projectIndex.getVariableReferences(symbol)];
	if (locations.length > 0) {  // It's a variable
		if (context.includeDeclaration) {
			let declarationLocation = projectIndex.getLocalVariables(textDocument.uri).get(symbol);
			if (declarationLocation === undefined)
				declarationLocation = projectIndex.getGlobalVariables().get(symbol);
	
			if (declarationLocation !== undefined)
				locations.push(declarationLocation);
		}
	}
	else {
		let labelDefinitionSceneUri: string | undefined;
		// Get where the symbol is defined. If the cursor's at a label definition, that's easy.
		// See if the cursor is at a label definition
		let labelDefinitionLocation = projectIndex.getLabels(textDocument.uri).get(symbol);
		if (labelDefinitionLocation !== undefined && positionInRange(position, labelDefinitionLocation.range)) {
			labelDefinitionSceneUri = textDocument.uri;
		}
		else {
			// We'll have to see if we can find the definition from flow control events
			let flowControlEvents = projectIndex.getFlowControlEvents(textDocument.uri);
			let matchingEvents = flowControlEvents.filter(event => {
				return (
					event.label == symbol && 
					event.labelLocation !== undefined && 
					positionInRange(position, event.labelLocation.range))
			});
			if (matchingEvents.length == 1) {
				let event = matchingEvents[0];
				if (event.scene == "") {
					labelDefinitionSceneUri = textDocument.uri;
				}
				else {
					labelDefinitionSceneUri = projectIndex.getSceneUri(event.scene);
				}
				if (labelDefinitionSceneUri !== undefined) {
					labelDefinitionLocation = projectIndex.getLabels(labelDefinitionSceneUri).get(symbol);
				}
			}
		}
		if (labelDefinitionSceneUri !== undefined) {
			locations = [...projectIndex.getLabelReferences(symbol, textDocument.uri)];
			if (context.includeDeclaration && labelDefinitionLocation !== undefined) {
				locations.push(labelDefinitionLocation);
			}
		}
	}

	return locations;
}

/**
 * Find where a symbol at a position is defined in the project.
 * @param document Current document.
 * @param position Position in the document.
 * @param projectIndex Project index.
 * @returns Definition location and type, which are undefined if not found.
 */
export function findDefinition(
	document: TextDocument, position: Position, projectIndex: ProjectIndex): LocationAndType {
	let definition: LocationAndType = { location: undefined, type: undefined };

	// See if we have a local reference at this location
	let references = projectIndex.getDocumentVariableReferences(document.uri);
	for (let [variable, locations] of references.entries()) {
		let match = locations.find((location) => {
			return (positionInRange(position, location.range));
		})
		if (match !== undefined) {
			definition.location = findVariableCreationLocation(variable, false, document, projectIndex);
			if (definition.location !== undefined) {
				definition.type = DefinitionType.Variable;
			}
			else {
				let achievements = projectIndex.getAchievements();
				let codename = variableIsAchievement(variable, achievements);
				if (codename !== undefined) {
					definition.location = achievements.get(codename);
					definition.type = DefinitionType.Achievement;
				}
			}

			return definition; // Found or not, we had a reference match, so return
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
			definition.type = DefinitionType.Label;
		}

		return definition; // Found or not, we had a reference match, so return
	}

	return definition;
}
