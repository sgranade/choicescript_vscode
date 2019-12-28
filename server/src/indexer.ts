import { Location, TextDocument } from 'vscode-languageserver';

import {
	CaseInsensitiveMap,
	ReadonlyCaseInsensitiveMap,
	normalizeUri
} from './utilities';
import { ParserCallbacks, ParsingState, parse } from './parser';

/**
 * Type for a mutable index of identifiers.
 */
export type IdentifierIndex = CaseInsensitiveMap<string, Location>;

/**
 * Type for an immutable index of identifiers.
 */
export type ReadonlyIdentifierIndex = ReadonlyCaseInsensitiveMap<string, Location>;

/**
 * Type for a mutable index of references to variables.
 */
export type VariableReferenceIndex = CaseInsensitiveMap<string, Array<Location>>;

/**
 * Type for a mutable index of labels.
 */
export type LabelIndex = Map<string, Location>;

/**
 * Type for an immutable index of labels.
 */
export type ReadonlyLabelIndex = ReadonlyMap<string, Location>;

/**
 * Type for a mutable index of references to labels.
 */
export type LabelReferenceIndex = Map<string, Array<Location>>;

/**
 * Interface for an index of a ChoiceScript project.
 */
export interface ProjectIndex {
	/**
	 * Update the index of global variable definitions from the startup scene.
	 * @param textDocumentUri URI to startup.txt document.
	 * @param newIndex New index of global variables.
	 */
	updateGlobalVariables(textDocumentUri: string, newIndex: IdentifierIndex): void;
	/**
	 * Update the index of variable definitions local to a scene.
	 * @param textDocumentUri URI to document whose index is to be updated.
	 * @param newIndex New index of local variables.
	 */
	updateLocalVariables(textDocumentUri: string, newIndex: IdentifierIndex): void;
	/**
	 * Update the index of references to variables.
	 * @param textDocumentUri URI to document whose index is to be updated.
	 * @param newIndex New index of references to variables.
	 */
	updateVariableReferences(textDocumentUri: string, newIndex: VariableReferenceIndex): void;
	/**
	 * Update the list of scene names in the project.
	 * @param scenes New list of scene names.
	 */
	updateSceneList(scenes: Array<string>): void;
	/**
	 * Update the index of labels in a scene file.
	 * @param textDocumentUri URI to document whose index is to be updated.
	 * @param newIndex New index of labels.
	 */
	updateLabels(textDocumentUri: string, newIndex: LabelIndex): void;
	/**
	 * Update the index of references to labels.
	 * @param textDocumentUri URI to document whose index is to be updated.
	 * @param newIndex New index of references to labels.
	 */
	updateLabelReferences(textDocumentUri: string, newIndex: LabelReferenceIndex): void;
	/**
	 * Update the index of achievement codenames in the project.
	 * @param newIndex New index of achievement codenames.
	 */
	updateAchievements(newIndex: IdentifierIndex): void;
	/**
	 * Get the URI to the project's startup.txt file.
	 */
	getStartupFileUri(): string;
	/**
	 * Get the URI to a scene file.
	 * @param scene Scene name.
	 */
	getSceneUri(scene: string): string | undefined;
	/**
	 * Get global variables in a project.
	 */
	getGlobalVariables(): ReadonlyIdentifierIndex;
	/**
	 * Get list of scenes in the project.
	 */
	getSceneList(): ReadonlyArray<string>;
	/**
	 * Get the local variables in a scene file.
	 * @param textDocumentUri URI to scene document.
	 */
	getLocalVariables(textDocumentUri: string): ReadonlyIdentifierIndex;
	/**
	 * Get the labels in a scene file.
	 * @param textDocumentUri URI to scene document.
	 */
	getLabels(textDocumentUri: string): ReadonlyLabelIndex;
	/**
	 * Get the achievement codenames.
	 */
	getAchievements(): ReadonlyIdentifierIndex;
	/**
	 * Get all references to a variable.
	 * @param variable Variable to find references to.
	 */
	getVariableReferences(variable: string): ReadonlyArray<Location>;
	/**
	 * Get all references to a label.
	 * @param label Label to find references to.
	 */
	getLabelReferences(label: string): ReadonlyArray<Location>;
	/**
	 * Remove a document from the project index.
	 * @param textDocumentUri URI to document to remove.
	 */
	removeDocument(textDocumentUri: string): void;
}

/**
 * Instantiable index class
 */
export class Index implements ProjectIndex {
	_startupFileUri: string;
	_globalVariables: IdentifierIndex;
	_localVariables: Map<string, IdentifierIndex>;
	_variableReferences: Map<string, VariableReferenceIndex>;
	_scenes: Array<string>;
	_localLabels: Map<string, IdentifierIndex>;
	_labelReferences: Map<string, LabelReferenceIndex>;
	_achievements: IdentifierIndex;

	constructor() {
		this._startupFileUri = "";
		this._globalVariables = new Map();
		this._localVariables = new Map();
		this._variableReferences = new Map();
		this._scenes = [];
		this._localLabels = new Map();
		this._labelReferences = new Map();
		this._achievements = new Map();
	}

	updateGlobalVariables(textDocumentUri: string, newIndex: IdentifierIndex) {
		this._startupFileUri = normalizeUri(textDocumentUri);
		this._globalVariables = new CaseInsensitiveMap(newIndex);
	}
	updateLocalVariables(textDocumentUri: string, newIndex: IdentifierIndex) {
		this._localVariables.set(normalizeUri(textDocumentUri), new CaseInsensitiveMap(newIndex));
	}
	updateVariableReferences(textDocumentUri: string, newIndex: VariableReferenceIndex) {
		this._variableReferences.set(normalizeUri(textDocumentUri), new CaseInsensitiveMap(newIndex));
	}
	updateSceneList(scenes: Array<string>) {
		this._scenes = scenes;
	}
	updateLabels(textDocumentUri: string, newIndex: LabelIndex) {
		this._localLabels.set(normalizeUri(textDocumentUri), new Map(newIndex));
	}
	updateLabelReferences(textDocumentUri: string, newIndex: LabelReferenceIndex) {
		this._labelReferences.set(normalizeUri(textDocumentUri), new Map(newIndex));
	}
	updateAchievements(newIndex: IdentifierIndex) {
		this._achievements = new CaseInsensitiveMap(newIndex);
	}
	getStartupFileUri(): string {
		return this._startupFileUri;
	}
	getSceneUri(scene: string): string | undefined {
		let sceneUri: string | undefined = undefined;
		for (let key of this._localVariables.keys()) {
			if (key.includes(scene)) {
				sceneUri = key;
				break;
			}
		}
		return sceneUri;
	}
	getGlobalVariables(): ReadonlyIdentifierIndex {
		return this._globalVariables;
	}
	getLocalVariables(textDocumentUri: string): ReadonlyIdentifierIndex {
		let index = this._localVariables.get(normalizeUri(textDocumentUri));
		if (index === undefined)
			index = new Map();
		
		return index;
	}
	getSceneList(): ReadonlyArray<string> {
		return this._scenes;
	}
	getLabels(textDocumentUri: string): ReadonlyLabelIndex {
		let index = this._localLabels.get(normalizeUri(textDocumentUri));
		if (index === undefined)
			index = new Map();

		return index;
	}
	getAchievements(): ReadonlyIdentifierIndex {
		return this._achievements;
	}
	getVariableReferences(symbol: string): ReadonlyArray<Location> {
		let locations: Location[] = [];

		for (let index of this._variableReferences.values()) {
			let partialLocations = index.get(symbol);
			if (partialLocations !== undefined)
				locations.push(...partialLocations);
		}

		return locations;
	}
	getLabelReferences(symbol: string): ReadonlyArray<Location> {
		let locations: Location[] = [];

		for (let index of this._labelReferences.values()) {
			let partialLocations = index.get(symbol);
			if (partialLocations !== undefined)
				locations.push(...partialLocations);
		}

		return locations;
	}
	removeDocument(textDocumentUri: string) {
		this._localVariables.delete(normalizeUri(textDocumentUri));
		this._variableReferences.delete(normalizeUri(textDocumentUri));
		this._localLabels.delete(normalizeUri(textDocumentUri));
	}
}

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
	labelReferences: LabelReferenceIndex = new Map();
	achievements: IdentifierIndex = new Map();

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

		onLabelReference: (command: string, label: string, scene: string, labelLocation: Location | undefined, 
			sceneLocation: Location | undefined, state: ParsingState) => {
			if (label != "" && labelLocation !== undefined) {
				let referenceArray: Array<Location> | undefined = indexingState.labelReferences.get(label);
				if (referenceArray === undefined)
					referenceArray = [];
				referenceArray.push(labelLocation);
				indexingState.labelReferences.set(label, referenceArray);
			}
		},

		onSceneDefinition: (scenes: string[], location: Location, state: ParsingState) => {
			indexingState.scenes = scenes;
		},

		onAchievementCreate: (codename: string, location: Location, state: ParsingState) => {
			indexingState.achievements.set(codename, location);
		}
	}

	parse(textDocument, callbacks);

	if (isStartupFile) {
		index.updateGlobalVariables(textDocument.uri, indexingState.globalVariables);
		index.updateSceneList(indexingState.scenes);
		index.updateAchievements(indexingState.achievements);
	}
	index.updateLocalVariables(textDocument.uri, indexingState.localVariables);
	index.updateVariableReferences(textDocument.uri, indexingState.variableReferences);
	index.updateLabels(textDocument.uri, indexingState.labels);
	index.updateLabelReferences(textDocument.uri, indexingState.labelReferences);
}
