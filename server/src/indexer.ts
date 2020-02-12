import { Location, Range, Position, TextDocument, Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';

import { ParserCallbacks, ParsingState, parse } from './parser';
import { IdentifierIndex, VariableReferenceIndex, FlowControlEvent, DocumentScopes, ProjectIndex, ReadonlyIdentifierIndex, SummaryScope } from './index';
import { createDiagnosticFromLocation, comparePositions } from './utilities';

/**
 * Captures information about the current state of indexing
 */
class IndexingState {
	/**
	 * Document being validated
	 */
	textDocument: TextDocument;

	globalVariables: IdentifierIndex = new Map();
	localVariables: IdentifierIndex = new Map();
	variableReferences: VariableReferenceIndex = new Map();
	scenes: Array<string> = [];
	labels: IdentifierIndex = new Map();
	achievements: IdentifierIndex = new Map();
	achievementReferences: VariableReferenceIndex = new Map();
	flowControlEvents: Array<FlowControlEvent> = [];
	parseErrors: Array<Diagnostic> = [];

	checkAchievementLocation: Location | undefined = undefined;
	paramsLocations: Location[] = [];
	choiceScopes: SummaryScope[] = [];

	constructor(textDocument: TextDocument) {
		this.textDocument = textDocument;
	}
}

/**
 * Generate scopes from a fully-indexed project.
 * @param state Indexing state.
 */
function generateScopes(state: IndexingState): DocumentScopes {
	let scopes: DocumentScopes = {
		achievementVarScopes: [],
		paramScopes: [],
		choiceScopes: state.choiceScopes
	};
	let documentLength = state.textDocument.getText().length;
	let documentEndLocation = state.textDocument.positionAt(documentLength);
	if (state.checkAchievementLocation !== undefined) {
		let start = state.checkAchievementLocation.range.start;
		scopes.achievementVarScopes.push(Range.create(
			start, documentEndLocation
		));
	}
	for (let location of state.paramsLocations) {
		let start = location.range.start;
		scopes.paramScopes.push(Range.create(
			start, documentEndLocation
		));
	}

	return scopes;
}

/**
 * Generate identifiers that lie between two positions.
 * @param identifiers Index of identifiers.
 * @param start Start position.
 * @param end End position.
 */
function* identifiersBetweenLocations(
	identifiers: ReadonlyIdentifierIndex, start: Position, end: Position) {
	for (let [identifier, location] of identifiers.entries()) {
		if (comparePositions(location.range.start, start) >= 0 &&
			comparePositions(location.range.start, end) <= 0) {
			yield identifier;
		}
	}
}

/**
 * Find the effective creation location of local variables defined in subroutines.
 * @param state Indexing state.
 */
function findSubroutineVariables(state: IndexingState): IdentifierIndex {
	let events = state.flowControlEvents;
	let returnEvents = events.filter((event: FlowControlEvent) => { return event.command == "return"; });
	let labels = state.labels;
	let localVariables = state.localVariables;
	let subroutineVariables: IdentifierIndex = new Map();

	for (let event of events) {
		if (event.command != "gosub") {
			continue;
		}
		// If a temp variable is defined in a gosubbed label, it's as if it's created
		// at the location of the *gosub
		let labelLocation = labels.get(event.label);
		if (labelLocation === undefined) {
			continue;
		}
		// Find the return that's after that label
		// This trick works b/c the array of events is built from the top of the document down
		let firstReturn = returnEvents.find(
			(event: FlowControlEvent) => { return event.commandLocation.range.start.line > labelLocation!.range.start.line; }
		);
		if (firstReturn === undefined) {
			continue;
		}
		for (let variable of identifiersBetweenLocations(localVariables, labelLocation.range.end, firstReturn.commandLocation.range.start)) {
			if (!subroutineVariables.has(variable)) {
				subroutineVariables.set(variable, event.commandLocation);
			}
		}
	}

	return subroutineVariables;
}

/**
 * Update project index for a document in that project.
 * 
 * @param textDocument Document to index.
 * @param isStartupFile True if the document is the ChoiceScript startup file.
 * @param index Project index to update.
 */
export function updateProjectIndex(textDocument: TextDocument, isStartupFile: boolean, index: ProjectIndex): void {
	let indexingState = new IndexingState(textDocument);

	let callbacks: ParserCallbacks = {
		onCommand: (prefix: string, command: string, spacing: string, line: string, 
			commandLocation: Location, state: ParsingState) => {
			// Record where achievement temporary variables are brought into existence
			if (command == "check_achievements" && indexingState.checkAchievementLocation === undefined) {
				indexingState.checkAchievementLocation = commandLocation;
			}
			// Record where params temporary variables are brought into existence
			if (command == "params") {
				indexingState.paramsLocations.push(commandLocation);
			}
		},

		onGlobalVariableCreate: (symbol: string, location: Location, state: ParsingState) => {
			if (indexingState.globalVariables.has(symbol)) {
				state.callbacks.onParseError(createDiagnosticFromLocation(
					DiagnosticSeverity.Error, location,
					`Variable "${symbol}" was already created`
				));
			}
			else {
				indexingState.globalVariables.set(symbol, location);
			}
		},

		onLocalVariableCreate: (symbol: string, location: Location, state: ParsingState) => {
			if (!indexingState.localVariables.has(symbol))
				indexingState.localVariables.set(symbol, location);
		},

		onLabelCreate: (symbol: string, location: Location, state: ParsingState) => {
			if (indexingState.labels.has(symbol)) {
				state.callbacks.onParseError(createDiagnosticFromLocation(
					DiagnosticSeverity.Error, location,
					`Label "${symbol}" was already created`
				));
			}
			else {
				indexingState.labels.set(symbol, location);
			}
		},

		onVariableReference: (symbol: string, location: Location, state: ParsingState) => {
			// My kingdom for the nullish coalescing operator
			let referenceArray: Array<Location> | undefined = indexingState.variableReferences.get(symbol);
			if (referenceArray === undefined)
				referenceArray = [];
			referenceArray.push(location);
			indexingState.variableReferences.set(symbol, referenceArray);
		},

		onFlowControlEvent: (command: string, commandLocation: Location, label: string, scene: string,
			labelLocation: Location | undefined, sceneLocation: Location | undefined, state: ParsingState) => {
			indexingState.flowControlEvents.push({
				command: command,
				commandLocation: commandLocation,
				label: label,
				labelLocation: labelLocation,
				scene: scene,
				sceneLocation: sceneLocation
			});
		},

		onSceneDefinition: (scenes: string[], location: Location, state: ParsingState) => {
			indexingState.scenes = scenes;
		},

		onAchievementCreate: (codename: string, location: Location, state: ParsingState) => {
			indexingState.achievements.set(codename, location);
		},

		onAchievementReference: (codename: string, location: Location, state: ParsingState) => {
			let referenceArray: Array<Location> | undefined = indexingState.achievementReferences.get(codename);
			if (referenceArray === undefined)
				referenceArray = [];
			referenceArray.push(location);
			indexingState.achievementReferences.set(codename, referenceArray);
		},

		onChoiceScope: (scope: SummaryScope, state: ParsingState) => {
			indexingState.choiceScopes.push(scope);
		},

		onParseError: (error: Diagnostic) => {
			indexingState.parseErrors.push(error);
		}
	}

	parse(textDocument, callbacks);
	let scopes = generateScopes(indexingState);
	let subroutineVariables = findSubroutineVariables(indexingState);

	if (isStartupFile) {
		index.updateGlobalVariables(textDocument.uri, indexingState.globalVariables);
		index.updateSceneList(indexingState.scenes);
		index.updateAchievements(indexingState.achievements);
	}
	index.updateLocalVariables(textDocument.uri, indexingState.localVariables);
	index.updateSubroutineLocalVariables(textDocument.uri, subroutineVariables);
	index.updateVariableReferences(textDocument.uri, indexingState.variableReferences);
	index.updateLabels(textDocument.uri, indexingState.labels);
	index.updateAchievementReferences(textDocument.uri, indexingState.achievementReferences);
	index.updateDocumentScopes(textDocument.uri, scopes);
	index.updateFlowControlEvents(textDocument.uri, indexingState.flowControlEvents);
	index.updateParseErrors(textDocument.uri, indexingState.parseErrors);
}
