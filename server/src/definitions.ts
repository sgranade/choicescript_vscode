import { Position, Location, TextDocument } from 'vscode-languageserver';

import { ProjectIndex, getVariableCreationLocation, getLabelLocation } from "./index";
import { variableIsAchievement } from './language';
import { positionInRange } from './utilities';

/**
 * Get the definition of a symbol at a position.
 * @param document Current document.
 * @param position Position in the document.
 * @param projectIndex Project index.
 */
export function generateDefinition(
	document: TextDocument, position: Position, projectIndex: ProjectIndex): Location | undefined {
	let definition: Location | undefined = undefined;

	// See if we have a local reference at this location
	let references = projectIndex.getDocumentVariableReferences(document.uri);
	for (let [variable, locations] of references.entries()) {
		let match = locations.find((location) => {
			return (positionInRange(position, location.range));
		})
		if (match !== undefined) {
			definition = getVariableCreationLocation(variable, false, document, projectIndex);
			if (definition === undefined) {
				let achievements = projectIndex.getAchievements();
				let codename = variableIsAchievement(variable, achievements);
				if (codename !== undefined) {
					definition = achievements.get(codename);
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
		definition = getLabelLocation(event.label, event.scene, document, projectIndex);

		return definition; // Found or not, we had a reference match, so return
	}

	return definition;
}
