import { Position, Location, TextDocument } from 'vscode-languageserver';

import { ProjectIndex, getVariableCreationLocation, getLabelLocation } from "./index";
import { variableIsAchievement } from './language';
import { positionInRange } from './utilities';

export enum DefinitionType {
	Variable,
	Achievement,
	Label
}

export interface LocationAndType {
	location?: Location,
	type?: DefinitionType
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
			definition.location = getVariableCreationLocation(variable, false, document, projectIndex);
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
		definition.location = getLabelLocation(event.label, event.scene, document, projectIndex);
		if (definition.location !== undefined) {
			definition.type = DefinitionType.Label;
		}

		return definition; // Found or not, we had a reference match, so return
	}

	return definition;
}
