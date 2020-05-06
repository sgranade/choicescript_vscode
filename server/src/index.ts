import { Location, Range, Diagnostic } from 'vscode-languageserver';

import { CaseInsensitiveMap, ReadonlyCaseInsensitiveMap, normalizeUri, mapToUnionedCaseInsensitiveMap } from './utilities';
import { uriIsStartupFile } from './language';

/**
 * Type for a mutable index of identifiers.
 */
export type IdentifierIndex = CaseInsensitiveMap<string, Location>;
/**
 * Type for an immutable index of identifiers.
 */
export type ReadonlyIdentifierIndex = ReadonlyCaseInsensitiveMap<string, Location>;
/**
 * Type for a mutable index of identifiers that can exist in multiple locations, like references to variables.
 */
export type IdentifierMultiIndex = CaseInsensitiveMap<string, Array<Location>>;
/**
 * Type for an immutable index of identifiers that can exist in multiple locations.
 */
export type ReadonlyIdentifierMultiIndex = ReadonlyCaseInsensitiveMap<string, ReadonlyArray<Location>>;
/**
 * Type for a mutable index of labels.
 */
export type LabelIndex = Map<string, Label>;
/**
 * Type for an immutable index of labels.
 */
export type ReadonlyLabelIndex = ReadonlyMap<string, Label>;
/**
 * Type for a mutable index of references to labels.
 */
export type LabelReferenceIndex = Map<string, Array<Location>>;
/**
 * Type for an immutable index of references to labels.
 */
export type ReadonlyLabelReferenceIndex = ReadonlyMap<string, ReadonlyArray<Location>>;

/**
 * *goto, *gosub, *goto_scene, *gosub_scene, and *return events
 */
export interface FlowControlEvent {
	command: string;
	commandLocation: Location;
	label: string;
	labelLocation?: Location;
	scene: string;
	sceneLocation?: Location;
}

/**
 * A label, which can have an optional scope
 */
export interface Label {
	label: string;
	location: Location;
	scope?: Range;
}

/**
 * A scope with a summary description
 */
export interface SummaryScope {
	summary: string;
	range: Range;
}

/**
 * Interface for capturing scopes in a document.
 */
export interface DocumentScopes {
	achievementVarScopes: Range[];
	choiceScopes: SummaryScope[];
	paramScopes: Range[];
}

// TODO would be good to re-work this interface so it has more consistency
// f'rex, a since index that indexes all references & what type of reference it is

/**
 * Interface for an index of a ChoiceScript project.
 */
export interface ProjectIndex {
	/**
	 * Update the number of words in a scene.
	 * @param textDocumentUri URI to document whose word count is to be updated.
	 * @param count New wordcount.
	 */
	updateWordCount(textDocumentUri: string, count: number): void;
	/**
	 * Update the index of global variable definitions from the startup scene.
	 * @param textDocumentUri URI to startup.txt document.
	 * @param newIndex New index of global variables.
	 */
	updateGlobalVariables(textDocumentUri: string, newIndex: IdentifierIndex): void;
	/**
	 * Update the index of variable definitions local to a scene.
	 *
	 * Note that local variables can be defined multiple times in a scene.
	 * @param textDocumentUri URI to document whose index is to be updated.
	 * @param newIndex New index of local variables.
	 */
	updateLocalVariables(textDocumentUri: string, newIndex: IdentifierMultiIndex): void;
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
	updateVariableReferences(textDocumentUri: string, newIndex: IdentifierMultiIndex): void;
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
	 * Update the index of references to achivements.
	 * 
	 * This index is only to direct references to achievements, not to achievement-variable references
	 * created by the *check_achievements command.
	 * @param textDocumentUri URI to document whose index is to be updated.
	 * @param newIndex New index of references to achievements.
	 */
	updateAchievementReferences(textDocumentUri: string, newIndex: IdentifierMultiIndex): void;
	/**
	 * Update the index of scopes.
	 * @param textDocumentUri URI to document whose index is to be updated.
	 * @param newScopes New scopes.
	 */
	updateDocumentScopes(textDocumentUri: string, newScopes: DocumentScopes): void;
	/**
	 * Update the list of errors that occured during parsing.
	 * @param textDocumentUri URI to document whose index is to be updated.
	 * @param newIndex New list of errors.
	 */
	updateParseErrors(textDocumentUri: string, errors: Diagnostic[]): void;
	/**
	 * Determine if a document URI is the project's startup.txt file.
	 */
	isStartupFileUri(uri: string): boolean;
	/**
	 * Get the URI to a scene file.
	 * @param scene Scene name.
	 */
	getSceneUri(scene: string): string | undefined;
	/**
	 * Get list of scenes in the project.
	 */
	getSceneList(): ReadonlyArray<string>;
	/**
	 * Get the number of words in a scene, or undefined if the scene doesn't exist.
	 */
	getWordCount(sceneUri: string): number | undefined;
	/**
	 * Get global variables in a project.
	 */
	getGlobalVariables(): ReadonlyIdentifierIndex;
	/**
	 * Get the local variables in a scene file.
	 * @param sceneUri Scene document URI.
	 */
	getLocalVariables(sceneUri: string): ReadonlyIdentifierMultiIndex;
	/**
	 * Get the local variables defined in a scene file's subroutines.
	 * @param sceneUri Scene document URI.
	 */
	getSubroutineLocalVariables(sceneUri: string): ReadonlyIdentifierIndex;
	/**
	 * Get the labels in a scene file.
	 * @param sceneUri Scene document URI.
	 */
	getLabels(sceneUri: string): ReadonlyLabelIndex;
	/**
	 * Get the achievement codenames.
	 */
	getAchievements(): ReadonlyIdentifierIndex;
	/**
	 * Get all references to achievements in one scene document.
	 * 
	 * This only finds direct references to an achievement, not to achievement variables
	 * created by *check_achivement commands.
	 * @param sceneUri Scene document URI.
	 */
	getDocumentAchievementReferences(sceneUri: string): ReadonlyIdentifierMultiIndex;
	/**
	 * Get all references to an achievement across all documents.
	 * 
	 * This only finds direct references to an achievement, not to achievement variables
	 * created by *check_achivement commands.
	 * @param achievement Achievement to find references to.
	 */
	getAchievementReferences(achievement: string): ReadonlyArray<Location>;
	/**
	 * Get all references to variables in one scene document.
	 * @param sceneUri Scene document URI.
	 */
	getDocumentVariableReferences(sceneUri: string): ReadonlyIdentifierMultiIndex;
	/**
	 * Get all references to a variable across all documents.
	 * @param variable Variable to find references to.
	 */
	getVariableReferences(variable: string): ReadonlyArray<Location>;
	/**
	 * Get all flow control events in a scene document.
	 * @param sceneUri Scene document URI.
	 */
	getFlowControlEvents(sceneUri: string): ReadonlyArray<FlowControlEvent>;
	/**
	 * Get all references to a label.
	 * @param label Label.
	 */
	getLabelReferences(label: string): ReadonlyArray<Location>;
	/**
	 * Get document scopes for a scene file.
	 * @param sceneUri Scene document URI.
	 */
	getDocumentScopes(sceneUri: string): DocumentScopes;
	/**
	 * Get the parse errors.
	 * @param sceneUri Scene document URI.
	 */
	getParseErrors(sceneUri: string): ReadonlyArray<Diagnostic>;
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
	_wordCounts: Map<string, number>;
	_globalVariables: IdentifierIndex;
	_localVariables: Map<string, IdentifierMultiIndex>;
	_subroutineLocalVariables: Map<string, IdentifierIndex>;
	_variableReferences: Map<string, IdentifierMultiIndex>;
	_scenes: Array<string>;
	_localLabels: Map<string, LabelIndex>;
	_flowControlEvents: Map<string, FlowControlEvent[]>;
	_achievements: IdentifierIndex;
	_achievementReferences: Map<string, IdentifierMultiIndex>;
	_documentScopes: Map<string, DocumentScopes>;
	_parseErrors: Map<string, Diagnostic[]>;
	constructor() {
		this._startupFileUri = "";
		this._wordCounts = new Map();
		this._globalVariables = new Map();
		this._localVariables = new Map();
		this._subroutineLocalVariables = new Map();
		this._variableReferences = new Map();
		this._scenes = [];
		this._localLabels = new Map();
		this._flowControlEvents = new Map();
		this._achievements = new Map();
		this._achievementReferences = new Map();
		this._documentScopes = new Map();
		this._parseErrors = new Map();
	}
	updateWordCount(textDocumentUri: string, count: number): void {
		this._wordCounts.set(normalizeUri(textDocumentUri), count);
	}
	updateGlobalVariables(textDocumentUri: string, newIndex: IdentifierIndex): void {
		this._startupFileUri = normalizeUri(textDocumentUri);
		this._globalVariables = new CaseInsensitiveMap(newIndex);
	}
	updateLocalVariables(textDocumentUri: string, newIndex: IdentifierMultiIndex): void {
		this._localVariables.set(normalizeUri(textDocumentUri), new CaseInsensitiveMap(newIndex));
	}
	updateSubroutineLocalVariables(textDocumentUri: string, newIndex: IdentifierIndex): void {
		this._subroutineLocalVariables.set(normalizeUri(textDocumentUri), new CaseInsensitiveMap(newIndex));
	}
	updateVariableReferences(textDocumentUri: string, newIndex: IdentifierMultiIndex): void {
		this._variableReferences.set(normalizeUri(textDocumentUri), mapToUnionedCaseInsensitiveMap(newIndex));
	}
	updateSceneList(scenes: Array<string>): void {
		this._scenes = scenes;
	}
	updateLabels(textDocumentUri: string, newIndex: LabelIndex): void {
		this._localLabels.set(normalizeUri(textDocumentUri), new Map(newIndex));
	}
	updateFlowControlEvents(textDocumentUri: string, newIndex: FlowControlEvent[]): void {
		this._flowControlEvents.set(normalizeUri(textDocumentUri), [...newIndex]);
	}
	updateAchievements(newIndex: IdentifierIndex): void {
		this._achievements = new CaseInsensitiveMap(newIndex);
	}
	updateAchievementReferences(textDocumentUri: string, newIndex: IdentifierMultiIndex): void {
		this._achievementReferences.set(normalizeUri(textDocumentUri), mapToUnionedCaseInsensitiveMap(newIndex));
	}
	updateDocumentScopes(textDocumentUri: string, newScopes: DocumentScopes): void {
		this._documentScopes.set(normalizeUri(textDocumentUri), newScopes);
	}
	updateParseErrors(textDocumentUri: string, errors: Diagnostic[]): void {
		this._parseErrors.set(normalizeUri(textDocumentUri), [...errors]);
	}
	isStartupFileUri(uri: string): boolean {
		return this._startupFileUri == normalizeUri(uri);
	}
	getSceneUri(scene: string): string | undefined {
		if (this._startupFileUri == "") {
			return undefined;
		}
		return this._startupFileUri.replace('startup', scene);
	}
	getSceneList(): ReadonlyArray<string> {
		return this._scenes;
	}
	getWordCount(sceneUri: string): number | undefined {
		return this._wordCounts.get(normalizeUri(sceneUri));
	}
	getGlobalVariables(): ReadonlyIdentifierIndex {
		return this._globalVariables;
	}
	getLocalVariables(sceneUri: string): ReadonlyIdentifierMultiIndex {
		let index = this._localVariables.get(normalizeUri(sceneUri));
		if (index === undefined)
			index = new Map();
		return index;
	}
	getSubroutineLocalVariables(sceneUri: string): ReadonlyIdentifierIndex {
		let index = this._subroutineLocalVariables.get(normalizeUri(sceneUri));
		if (index === undefined)
			index = new Map();
		return index;
	}
	getLabels(sceneUri: string): ReadonlyLabelIndex {
		let index = this._localLabels.get(normalizeUri(sceneUri));
		if (index === undefined)
			index = new Map();
		return index;
	}
	getAchievements(): ReadonlyIdentifierIndex {
		return this._achievements;
	}
	getDocumentAchievementReferences(sceneUri: string): ReadonlyIdentifierMultiIndex {
		let index = this._achievementReferences.get(normalizeUri(sceneUri));
		if (index === undefined) {
			index = new Map();
		}
		return index;
	}
	getAchievementReferences(achievement: string): ReadonlyArray<Location> {
		const locations: Location[] = [];
		for (const index of this._achievementReferences.values()) {
			const partialLocations = index.get(achievement);
			if (partialLocations !== undefined)
				locations.push(...partialLocations);
		}
		return locations;
	}
	getDocumentVariableReferences(sceneUri: string): ReadonlyIdentifierMultiIndex {
		let index = this._variableReferences.get(normalizeUri(sceneUri));
		if (index === undefined) {
			index = new Map();
		}
		return index;
	}
	getVariableReferences(variable: string): ReadonlyArray<Location> {
		const locations: Location[] = [];
		for (const index of this._variableReferences.values()) {
			const partialLocations = index.get(variable);
			if (partialLocations !== undefined)
				locations.push(...partialLocations);
		}
		return locations;
	}
	getFlowControlEvents(sceneUri: string): ReadonlyArray<FlowControlEvent> {
		let index = this._flowControlEvents.get(normalizeUri(sceneUri));
		if (index === undefined) {
			index = [];
		}
		return index;
	}
	getLabelReferences(label: string): ReadonlyArray<Location> {
		const locations: Location[] = [];
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		for (const [documentUri, events] of this._flowControlEvents) {
			const matchingEvents = events.filter(event => {
				return (event.labelLocation !== undefined && event.label == label);
			});
			const matchingLocations = matchingEvents.map(event => {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				return event.labelLocation!;  // This is OK because the filter above gets rid of labelLocations that don't exist
			});
			locations.push(...matchingLocations);
		}
		return locations;
	}
	getDocumentScopes(textDocumentUri: string): DocumentScopes {
		let scopes = this._documentScopes.get(normalizeUri(textDocumentUri));
		if (scopes === undefined) {
			scopes = {
				achievementVarScopes: [],
				choiceScopes: [],
				paramScopes: [],
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
	removeDocument(textDocumentUri: string): void {
		const uri = normalizeUri(textDocumentUri);

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
