import { Location, Range, type Position, type Diagnostic, DiagnosticSeverity, type DiagnosticRelatedInformation } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';

import { type ParserCallbacks, type ParsingState, parse } from './parser';
import type { FlowControlEvent, DocumentScopes, ProjectIndex, SummaryScope, LabelIndex, Label, AchievementIndex } from './index';
import { createDiagnosticFromLocation, comparePositions, normalizeUri } from './utilities';

/**
 * Captures information about the current state of indexing
 */
class IndexingState {
	/**
	 * Document being validated
	 */
	textDocument: TextDocument;

	globalVariables: Map<string, Location> = new Map();
	localVariables: Map<string, Location[]> = new Map();
	variableReferences: Map<string, Location[]> = new Map();
	scenes: string[] = [];
	labels: LabelIndex = new Map();
	achievements: AchievementIndex = new Map();
	achievementReferences: Map<string, Location[]> = new Map();
	flowControlEvents: FlowControlEvent[] = [];
	referencedScenes: string[] = [];
	images: Map<string, Location[]> = new Map();
	parseErrors: Diagnostic[] = [];

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
 * Generate identifiers whose first location lies between two positions.
 * @param identifiers Index of identifiers.
 * @param start Start position.
 * @param end End position.
 */
function* identifiersFirstLocationBetweenLocations(
	identifiers: ReadonlyMap<string, Location[]>, start: Position, end: Position): IterableIterator<string> {
	for (const [identifier, locations] of identifiers.entries()) {
		let foundInRange = false;

		for (const location of locations) {
			// If we find one location that's before the range, we don't return this identifier
			if (comparePositions(location.range.start, start) < 0) {
				foundInRange = false;
				break;
			}
			if (comparePositions(location.range.start, end) <= 0) {
				foundInRange = true;
			}
		}
		if (foundInRange) {
			yield identifier;
		}
	}
}

/**
 * Find the effective creation location of local variables defined in subroutines.
 * @param state Indexing state.
 */
function findSubroutineVariables(state: IndexingState): Map<string, Location> {
	const events = state.flowControlEvents;
	const returnEvents = events.filter((event: FlowControlEvent) => { return event.command == "return"; });
	const labels = state.labels;
	const localVariables = state.localVariables;
	const subroutineVariables: Map<string, Location> = new Map();

	for (const event of events) {
		if (event.command != "gosub") {
			continue;
		}
		// If a temp variable is defined in a gosubbed label, it's as if it's created
		// at the location of the *gosub _assuming the *gosub location is earlier_
		// (That last bit isn't strictly true, but it's a good enough hack w/o
		// me figuring out the full execution flow of CS)
		const labelLocation = labels.get(event.label);
		if (labelLocation === undefined || labelLocation === null) {
			continue;
		}
		if (comparePositions(labelLocation.location.range.end, event.commandLocation.range.start) < 0) {
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
		for (const variable of identifiersFirstLocationBetweenLocations(localVariables, labelLocation.location.range.end, firstReturn.commandLocation.range.start)) {
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
 * @returns A list of scenes that are referenced but not yet indexed.
 */
export function updateProjectIndex(textDocument: TextDocument, isStartupFile: boolean, isChoicescriptStatsFile: boolean, index: ProjectIndex): string[] {
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
			const prevLocation = indexingState.globalVariables.get(symbol);
			if (prevLocation !== undefined) {
				const relatedInformation: DiagnosticRelatedInformation = {
					location: prevLocation,
					message: "Previously-created variable"
				};
				const diagnostic = createDiagnosticFromLocation(
					DiagnosticSeverity.Error, location,
					`Variable "${symbol}" was already created`
				);
				diagnostic.relatedInformation = [relatedInformation];
				state.callbacks.onParseError(diagnostic);
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
			const prevLabel = indexingState.labels.get(symbol);
			if (prevLabel !== undefined) {
				const relatedInformation: DiagnosticRelatedInformation = {
					location: prevLabel.location,
					message: "Previously-created label"
				};
				const diagnostic = createDiagnosticFromLocation(
					DiagnosticSeverity.Error, location,
					`Label "${symbol}" was already created`
				);
				diagnostic.relatedInformation = [relatedInformation];
				state.callbacks.onParseError(diagnostic);
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
			const referenceArray: Location[] = indexingState.variableReferences.get(symbol) ?? [];
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

		onAchievementCreate: (codename: string, location: Location, points: number, title: string, state: ParsingState) => {
			const prevAchievement = indexingState.achievements.get(codename);
			if (prevAchievement !== undefined) {
				const relatedInformation: DiagnosticRelatedInformation = {
					location: prevAchievement[0],
					message: "Previously-created achievement"
				};
				const diagnostic = createDiagnosticFromLocation(
					DiagnosticSeverity.Error, location,
					`Achievement "${codename}" was already created`
				);
				diagnostic.relatedInformation = [relatedInformation];
				state.callbacks.onParseError(diagnostic);
			}
			else {
				indexingState.achievements.set(codename, [location, points, title]);
			}
		},

		onAchievementReference: (codename: string, location: Location, state: ParsingState) => { // eslint-disable-line @typescript-eslint/no-unused-vars
			const referenceArray: Location[] = indexingState.achievementReferences.get(codename) ?? [];
			referenceArray.push(location);
			indexingState.achievementReferences.set(codename, referenceArray);
		},

		onChoiceScope: (scope: SummaryScope, state: ParsingState) => { // eslint-disable-line @typescript-eslint/no-unused-vars
			indexingState.choiceScopes.push(scope);
		},

		onImage: (symbol: string, location: Location, state: ParsingState) => { // eslint-disable-line @typescript-eslint/no-unused-vars
			const locations: Location[] = indexingState.achievementReferences.get(symbol) ?? [];
			locations.push(location);
			indexingState.images.set(symbol, locations);
		},

		onParseError: (error: Diagnostic) => {
			indexingState.parseErrors.push(error);
		}
	};

	const wordCount = parse(textDocument, callbacks);
	const scopes = generateScopes(indexingState);
	const subroutineVariables = findSubroutineVariables(indexingState);

	const uri = normalizeUri(textDocument.uri);
	if (isStartupFile) {
		if (index.hasChoicescriptStats() && !indexingState.scenes.includes('choicescript_stats')) {
			indexingState.scenes.push('choicescript_stats');
		}
		index.setGlobalVariables(uri, indexingState.globalVariables);
		index.setSceneList(indexingState.scenes);
		index.setAchievements(indexingState.achievements);
	}
	if (isChoicescriptStatsFile) {
		index.setHasChoicescriptStats(true);
	}
	index.setWordCount(uri, wordCount);
	index.setLocalVariables(uri, indexingState.localVariables);
	index.setSubroutineLocalVariables(uri, subroutineVariables);
	index.setVariableReferences(uri, indexingState.variableReferences);
	index.setLabels(uri, indexingState.labels);
	index.setAchievementReferences(uri, indexingState.achievementReferences);
	index.setDocumentScopes(uri, scopes);
	index.setFlowControlEvents(uri, indexingState.flowControlEvents);
	index.setImages(uri, indexingState.images);
	index.setParseErrors(uri, indexingState.parseErrors);

	const newScenes: string[] = [];
	const indexedScenes = new Set(index.getIndexedScenes());
	index.getAllReferencedScenes().forEach(scene => {
		if (!indexedScenes.has(scene)) {
			newScenes.push(scene);
		}
	});

	return newScenes;
}
