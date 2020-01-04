import { Location, Range, Diagnostic } from 'vscode-languageserver';

import { CaseInsensitiveMap, ReadonlyCaseInsensitiveMap, normalizeUri } from './utilities';
import { uriIsStartupFile } from './language';
import { TextDocument } from 'vscode-languageserver-textdocument';

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
 * Type for an immutable index of references to variables.
 */
export type ReadonlyVariableReferenceIndex = ReadonlyCaseInsensitiveMap<string, Array<Location>>;
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
 * Type for an immutable index of references to labels.
 */
export type ReadonlyLabelReferenceIndex = ReadonlyMap<string, Array<Location>>;

/**
 * *goto, *gosub, *goto_scene, *gosub_scene, and *return events
 */
export interface FlowControlEvent {
	command: string,
	commandLocation: Location,
	label: string,
	labelLocation?: Location,
	scene: string,
	sceneLocation?: Location
}

/**
 * Interface for capturing scopes in a document.
 */
export interface DocumentScopes {
	achievementVarScopes: Range[];
	paramScopes: Range[];
}

// TODO would be good to re-work this interface so it has more consistency
// f'rex, a since index that indexes all references & what type of reference it is

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
	 * Update the index of variables defined in subroutines.
	 * 
	 * These locations are the location of the first *gosub that calls those
	 * subroutines.
	 * @param textDocumentUri URI to document whose index is to be updated.
	 * @param newIndex New index of subroutine-local variables.
	 */
	updateSubroutineLocalVariables(textDocumentUri: string, newIndex: IdentifierIndex): void;
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
	 * Update the index of flow control events in a scene file.
	 * @param textDocumentUri URI to document whose index is to be updated.
	 * @param newEvents New index of flow control events.
	 */
	updateFlowControlEvents(textDocumentUri: string, newEvents: FlowControlEvent[]): void;
    /**
     * Update the index of achievement codenames in the project.
     * @param newIndex New index of achievement codenames.
     */
	updateAchievements(newIndex: IdentifierIndex): void;
    /**
     * Update the index of variable scopes.
     * @param textDocumentUri URI to document whose index is to be updated.
     * @param newScopes New variable scopes.
     */
	updateVariableScopes(textDocumentUri: string, newScopes: DocumentScopes): void;
    /**
     * Update the list of errors that occured during parsing.
     * @param textDocumentUri URI to document whose index is to be updated.
     * @param newIndex New list of errors.
     */
	updateParseErrors(textDocumentUri: string, errors: Diagnostic[]): void;
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
     * @param textDocumentUri Scene document URI.
     */
	getLocalVariables(textDocumentUri: string): ReadonlyIdentifierIndex;
	/**
	 * Get the local variables defined in a scene file's subroutines.
	 * @param textDocumentUri Scene document URI.
	 */
	getSubroutineLocalVariables(textDocumentUri: string): ReadonlyIdentifierIndex;
    /**
     * Get the labels in a scene file.
     * @param textDocumentUri Scene document URI.
     */
	getLabels(textDocumentUri: string): ReadonlyLabelIndex;
    /**
     * Get the achievement codenames.
     */
	getAchievements(): ReadonlyIdentifierIndex;
    /**
     * Get all references to variables in one scene document.
     * @param textDocumentUri Scene document URI.
     */
	getDocumentVariableReferences(textDocumentUri: string): ReadonlyVariableReferenceIndex;
    /**
     * Get all references to a variable across all documents.
     * @param variable Variable to find references to.
     */
	getVariableReferences(variable: string): ReadonlyArray<Location>;
	/**
	 * Get all flow control events in a document.
	 * @param textDocumentUri Scene document URI.
	 */
	getFlowControlEvents(textDocumentUri: string): ReadonlyArray<FlowControlEvent>;
    /**
     * Get document scopes for a scene file.
     * @param textDocumentUri Scene document URI.
     */
	getVariableScopes(textDocumentUri: string): DocumentScopes;
    /**
     * Get the parse errors.
     * @param textDocumentUri Scene document URI.
     */
	getParseErrors(textDocumentUri: string): ReadonlyArray<Diagnostic>;
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
	_subroutineLocalVariables: Map<string, IdentifierIndex>;
	_variableReferences: Map<string, VariableReferenceIndex>;
	_scenes: Array<string>;
	_localLabels: Map<string, IdentifierIndex>;
	_flowControlEvents: Map<string, FlowControlEvent[]>;
	_achievements: IdentifierIndex;
	_documentScopes: Map<string, DocumentScopes>;
	_parseErrors: Map<string, Diagnostic[]>;
	constructor() {
		this._startupFileUri = "";
		this._globalVariables = new Map();
		this._localVariables = new Map();
		this._subroutineLocalVariables = new Map();
		this._variableReferences = new Map();
		this._scenes = [];
		this._localLabels = new Map();
		this._flowControlEvents = new Map();
		this._achievements = new Map();
		this._documentScopes = new Map();
		this._parseErrors = new Map();
	}
	updateGlobalVariables(textDocumentUri: string, newIndex: IdentifierIndex) {
		this._startupFileUri = normalizeUri(textDocumentUri);
		this._globalVariables = new CaseInsensitiveMap(newIndex);
	}
	updateLocalVariables(textDocumentUri: string, newIndex: IdentifierIndex) {
		this._localVariables.set(normalizeUri(textDocumentUri), new CaseInsensitiveMap(newIndex));
	}
	updateSubroutineLocalVariables(textDocumentUri: string, newIndex: IdentifierIndex) {
		this._subroutineLocalVariables.set(normalizeUri(textDocumentUri), new CaseInsensitiveMap(newIndex));
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
	updateFlowControlEvents(textDocumentUri: string, newIndex: FlowControlEvent[]) {
		this._flowControlEvents.set(normalizeUri(textDocumentUri), [...newIndex]);
	}
	updateAchievements(newIndex: IdentifierIndex) {
		this._achievements = new CaseInsensitiveMap(newIndex);
	}
	updateVariableScopes(textDocumentUri: string, newScopes: DocumentScopes) {
		this._documentScopes.set(normalizeUri(textDocumentUri), newScopes);
	}
	updateParseErrors(textDocumentUri: string, errors: Diagnostic[]) {
		this._parseErrors.set(normalizeUri(textDocumentUri), [...errors]);
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
	getSubroutineLocalVariables(textDocumentUri: string): ReadonlyIdentifierIndex {
		let index = this._subroutineLocalVariables.get(normalizeUri(textDocumentUri));
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
	getDocumentVariableReferences(textDocumentUri: string): ReadonlyVariableReferenceIndex {
		let index = this._variableReferences.get(normalizeUri(textDocumentUri));
		if (index === undefined) {
			index = new Map();
		}
		return index;
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
	getFlowControlEvents(textDocumentUri: string): ReadonlyArray<FlowControlEvent> {
		let index = this._flowControlEvents.get(normalizeUri(textDocumentUri));
		if (index === undefined) {
			index = [];
		}
		return index;
	}
	getVariableScopes(textDocumentUri: string): DocumentScopes {
		let scopes = this._documentScopes.get(normalizeUri(textDocumentUri));
		if (scopes === undefined) {
			scopes = {
				achievementVarScopes: [],
				paramScopes: []
			};
		}
		return scopes;
	}
	getParseErrors(textDocumentUri: string): ReadonlyArray<Diagnostic> {
		let errors = this._parseErrors.get(normalizeUri(textDocumentUri));
		if (errors === undefined)
			errors = [];
		return errors;
	}
	removeDocument(textDocumentUri: string) {
		let uri = normalizeUri(textDocumentUri);

		if (uriIsStartupFile(uri)) {
			this._globalVariables = new Map();
			this._scenes = [];
			this._achievements = new Map();
		}

		this._localVariables.delete(uri);
		this._subroutineLocalVariables.delete(uri);
		this._variableReferences.delete(uri);
		this._localLabels.delete(uri);
		this._flowControlEvents.delete(uri);
		this._documentScopes.delete(uri);
		this._parseErrors.delete(uri);
	}
}

/**
 * Get the location where a variable was created.
 * @param variable Variable to get.
 * @param returnEffectiveLocations Whether to return effective creation locations or not. 
 * @param document Document in which to look for local variables.
 * @param index Project index.
 */
export function getVariableCreationLocation(
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
 * Get the location where a label was defined.
 * @param label Label.
 * @param scene Scene document in which the label should reside, or undefined.
 * @param document Local document.
 * @param index Project index.
 */
export function getLabelLocation(
	label: string, scene: string | undefined, document: TextDocument,
	index: ProjectIndex): Location | undefined {
	let location: Location | undefined = undefined;

	let uri: string | undefined = document.uri;
	if (scene !== undefined) {
		uri = index.getSceneUri(scene);
	}
	if (uri !== undefined) {
		location = index.getLabels(uri).get(label);
	}

	return location;
}