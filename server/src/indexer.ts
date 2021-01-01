import { Location, Range, Position, Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument'

import { ParserCallbacks, ParsingState, parse } from './parser';
import { IdentifierIndex, IdentifierMultiIndex, FlowControlEvent, DocumentScopes, ProjectIndex, SummaryScope, LabelIndex, Label, ReadonlyIdentifierMultiIndex } from './index';
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
	localVariables: IdentifierMultiIndex = new Map();
	variableReferences: IdentifierMultiIndex = new Map();
	scenes: Array<string> = [];
	labels: LabelIndex = new Map();
	achievements: IdentifierIndex = new Map();
	achievementReferences: IdentifierMultiIndex = new Map();
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
	const scopes: DocumentScopes = {
		achievementVarScopes: [],
		choiceScopes: state.choiceScopes,
		paramScopes: [],
	};
	const documentLength = state.textDocument.getText().length;
	const documentEndLocation = state.textDocument.positionAt(documentLength);
	if (state.checkAchievementLocation !== undefined) {
		const start = state.checkAchievementLocation.range.start;
		scopes.achievementVarScopes.push(Range.create(
			start, documentEndLocation
		));
	}
	for (const location of state.paramsLocations) {
		const start = location.range.start;
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
	identifiers: ReadonlyIdentifierMultiIndex, start: Position, end: Position): IterableIterator<string> {
	for (const [identifier, locations] of identifiers.entries()) {
		for (const location of locations) {
			if (comparePositions(location.range.start, start) >= 0 &&
				comparePositions(location.range.start, end) <= 0) {
				yield identifier;
			}
		}
	}
}

/**
 * Find the effective creation location of local variables defined in subroutines.
 * @param state Indexing state.
 */
function findSubroutineVariables(state: IndexingState): IdentifierIndex {
	const events = state.flowControlEvents;
	const returnEvents = events.filter((event: FlowControlEvent) => { return event.command == "return"; });
	const labels = state.labels;
	const localVariables = state.localVariables;
	const subroutineVariables: IdentifierIndex = new Map();

	for (const event of events) {
		if (event.command != "gosub") {
			continue;
		}
		// If a temp variable is defined in a gosubbed label, it's as if it's created
		// at the location of the *gosub
		const labelLocation = labels.get(event.label);
		if (labelLocation === undefined || labelLocation === null) {
			continue;
		}
		// Find the return that's after that label
		// This trick works b/c the array of events is built from the top of the document down
		const firstReturn = returnEvents.find(
			(event: FlowControlEvent) => { return event.commandLocation.range.start.line > labelLocation.location.range.start.line; }
		);
		if (firstReturn === undefined) {
			continue;
		}
		for (const variable of identifiersBetweenLocations(localVariables, labelLocation.location.range.end, firstReturn.commandLocation.range.start)) {
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
 * @param isChoicescriptStatsFile True if the document is the ChoiceScript stats file.
 * @param index Project index to update.
 */
export function updateProjectIndex(textDocument: TextDocument, isStartupFile: boolean, isChoicescriptStatsFile: boolean, index: ProjectIndex): void {
	const indexingState = new IndexingState(textDocument);

	const callbacks: ParserCallbacks = {
		onCommand: (prefix: string, command: string, spacing: string, line: string,
			commandLocation: Location, state: ParsingState) => { // eslint-disable-line @typescript-eslint/no-unused-vars
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

		onLocalVariableCreate: (symbol: string, location: Location, state: ParsingState) => { // eslint-disable-line @typescript-eslint/no-unused-vars
			const locations = indexingState.localVariables.get(symbol) ?? [];
			locations.push(location);
			indexingState.localVariables.set(symbol, locations);
		},

		onLabelCreate: (symbol: string, location: Location, state: ParsingState) => {
			if (indexingState.labels.has(symbol)) {
				state.callbacks.onParseError(createDiagnosticFromLocation(
					DiagnosticSeverity.Error, location,
					`Label "${symbol}" was already created`
				));
			}
			else {
				const label: Label = {
					label: symbol,
					location: location
				};
				indexingState.labels.set(symbol, label);
			}
		},

		onVariableReference: (symbol: string, location: Location, state: ParsingState) => { // eslint-disable-line @typescript-eslint/no-unused-vars
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

			if (command == "return") {
				const size = indexingState.labels.size;
				if (size == 0) {
					const location = Location.create(commandLocation.uri, commandLocation.range);
					location.range.start.character--;
					state.callbacks.onParseError(createDiagnosticFromLocation(
						DiagnosticSeverity.Error, location,
						`*return has no associated label`
					));
				}
				else {
					const label = Array.from(indexingState.labels)[size - 1][1];
					label.scope = Range.create(
						label.location.range.start, commandLocation.range.end);
				}
			}
		},

		onSceneDefinition: (scenes: string[], location: Location, state: ParsingState) => { // eslint-disable-line @typescript-eslint/no-unused-vars
			indexingState.scenes = scenes;
		},

		onAchievementCreate: (codename: string, location: Location, state: ParsingState) => { // eslint-disable-line @typescript-eslint/no-unused-vars
			indexingState.achievements.set(codename, location);
		},

		onAchievementReference: (codename: string, location: Location, state: ParsingState) => { // eslint-disable-line @typescript-eslint/no-unused-vars
			let referenceArray: Array<Location> | undefined = indexingState.achievementReferences.get(codename);
			if (referenceArray === undefined)
				referenceArray = [];
			referenceArray.push(location);
			indexingState.achievementReferences.set(codename, referenceArray);
		},

		onChoiceScope: (scope: SummaryScope, state: ParsingState) => { // eslint-disable-line @typescript-eslint/no-unused-vars
			indexingState.choiceScopes.push(scope);
		},

		onParseError: (error: Diagnostic) => {
			indexingState.parseErrors.push(error);
		}
	};

	const wordCount = parse(textDocument, callbacks);
	const scopes = generateScopes(indexingState);
	const subroutineVariables = findSubroutineVariables(indexingState);

	if (isStartupFile) {
		index.setGlobalVariables(textDocument.uri, indexingState.globalVariables);
		index.setSceneList(indexingState.scenes);
		index.setAchievements(indexingState.achievements);
	}
	if (isChoicescriptStatsFile) {
		index.setHasChoicescriptStats(true);
	}
	index.setWordCount(textDocument.uri, wordCount);
	index.setLocalVariables(textDocument.uri, indexingState.localVariables);
	index.setSubroutineLocalVariables(textDocument.uri, subroutineVariables);
	index.setVariableReferences(textDocument.uri, indexingState.variableReferences);
	index.setLabels(textDocument.uri, indexingState.labels);
	index.setAchievementReferences(textDocument.uri, indexingState.achievementReferences);
	index.setDocumentScopes(textDocument.uri, scopes);
	index.setFlowControlEvents(textDocument.uri, indexingState.flowControlEvents);
	index.setParseErrors(textDocument.uri, indexingState.parseErrors);
}
