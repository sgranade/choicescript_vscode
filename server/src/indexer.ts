import { Location, Range, TextDocument, Diagnostic } from 'vscode-languageserver';

import { ParserCallbacks, ParsingState, parse } from './parser';
import { IdentifierIndex, VariableReferenceIndex, LabelReferenceIndex, FlowControlEvent, DocumentScopes, ProjectIndex } from './index';

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
	flowControlEvents: Array<FlowControlEvent> = [];
	parseErrors: Array<Diagnostic> = [];

	checkAchievementLocation: Location | undefined = undefined;
	paramsLocations: Location[] = [];

	constructor(textDocument: TextDocument) {
		this.textDocument = textDocument;
	}
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
			indexingState.globalVariables.set(symbol, location);
			state.callbacks.onVariableReference(symbol, location, state);
		},

		onLocalVariableCreate: (symbol: string, location: Location, state: ParsingState) => {
			indexingState.localVariables.set(symbol, location);
			state.callbacks.onVariableReference(symbol, location, state);
		},

		onLabelCreate: (symbol: string, location: Location, state: ParsingState) => {
			indexingState.labels.set(symbol, location);
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

		onParseError: (error: Diagnostic) => {
			indexingState.parseErrors.push(error);
		}
	}

	parse(textDocument, callbacks);

	let scopes: DocumentScopes = {
		achievementVarScopes: [],
		paramScopes: []
	};
	let documentLength = textDocument.getText().length;
	let documentEndLocation = textDocument.positionAt(documentLength);
	if (indexingState.checkAchievementLocation !== undefined) {
		let start = indexingState.checkAchievementLocation.range.start;
		scopes.achievementVarScopes.push(Range.create(
			start, documentEndLocation
		));
	}
	for (let location of indexingState.paramsLocations) {
		let start = location.range.start;
		scopes.paramScopes.push(Range.create(
			start, documentEndLocation
		));
	}

	if (isStartupFile) {
		index.updateGlobalVariables(textDocument.uri, indexingState.globalVariables);
		index.updateSceneList(indexingState.scenes);
		index.updateAchievements(indexingState.achievements);
	}
	index.updateLocalVariables(textDocument.uri, indexingState.localVariables);
	index.updateVariableReferences(textDocument.uri, indexingState.variableReferences);
	index.updateLabels(textDocument.uri, indexingState.labels);
	index.updateVariableScopes(textDocument.uri, scopes);
	index.updateFlowControlEvents(textDocument.uri, indexingState.flowControlEvents);
	index.updateParseErrors(textDocument.uri, indexingState.parseErrors);
}
