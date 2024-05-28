import { basename } from 'path';
import type { Location, Range, Diagnostic } from 'vscode-languageserver';

import { CaseInsensitiveMap, type ReadonlyCaseInsensitiveMap, normalizeUri, mapToUnionedCaseInsensitiveMap } from './utilities';
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
export type IdentifierMultiIndex = CaseInsensitiveMap<string, Location[]>;
/**
 * Type for an immutable index of identifiers that can exist in multiple locations.
 */
export type ReadonlyIdentifierMultiIndex = ReadonlyCaseInsensitiveMap<string, readonly Location[]>;
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
export type LabelReferenceIndex = Map<string, Location[]>;
/**
 * Type for an immutable index of references to labels.
 */
export type ReadonlyLabelReferenceIndex = ReadonlyMap<string, readonly Location[]>;
/**
 * Type for a mutable index of achievements.
 */
export type AchievementIndex = Map<string, [Location, number, string]>;
/**
 * Type for an immutable index of achievements.
 */
export type ReadonlyAchievementIndex = ReadonlyMap<string, [Location, number, string]>;

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
	 * Set the platform path to the VS Code workspace containing the project.
	 * @param path Path to the VS Code workspace.
	 */
	setPlatformWorkspacePath(path: string): void;
	/**
	 * Set the platform (as opposed to workspace-relative) path to the project's scenes.
	 * @param path Path to the project.
	 */
	setPlatformScenePath(path: string): void;
	/**
	 * Set the platform (as opposed to workspace-relative) path to the project's images.
	 * @param path Path to the project's images.
	 */
	setPlatformImagePath(path: string): void;
	/**
	 * Set the number of words in a scene.
	 * @param sceneUri URI to document whose word count is to be updated.
	 * @param count New wordcount.
	 */
	setWordCount(sceneUri: string, count: number): void;
	/**
	 * Set the index of global variable definitions from the startup scene.
	 * @param startupUri URI to startup.txt document.
	 * @param newIndex New index of global variables. Keys should _not_ be case insensitive.
	 */
	setGlobalVariables(startupUri: string, newIndex: Map<string, Location>): void;
	/**
	 * Set the index of variable definitions local to a scene.
	 *
	 * Note that local variables can be defined multiple times in a scene.
	 * @param sceneUri URI to document whose index is to be updated.
	 * @param newIndex New index of local variables. Keys should _not_ be case insensitive.
	 */
	setLocalVariables(sceneUri: string, newIndex: Map<string, Location[]>): void;
	/**
	 * Set the index of variables defined in subroutines.
	 * 
	 * These locations are the location of the first *gosub that calls those
	 * subroutines.
	 * @param sceneUri URI to document whose index is to be updated.
	 * @param newIndex New index of subroutine-local variables. Keys should _not_ be case insensitive.
	 */
	setSubroutineLocalVariables(sceneUri: string, newIndex: Map<string, Location>): void;
	/**
	 * Set the index of references to variables.
	 * @param sceneUri URI to document whose index is to be updated.
	 * @param newIndex New index of references to variables.
	 */
	setVariableReferences(sceneUri: string, newIndex: IdentifierMultiIndex | Map<string, Location[]>): void;
	/**
	 * Set the list of scene names in the project.
	 * @param scenes New list of scene names.
	 */
	setSceneList(scenes: string[]): void;
	/**
	 * Set the index of labels in a scene file.
	 * @param sceneUri URI to document whose index is to be updated.
	 * @param newIndex New index of labels.
	 */
	setLabels(sceneUri: string, newIndex: LabelIndex): void;
	/**
	 * Set the index of flow control events in a scene file.
	 * @param sceneUri URI to document whose index is to be updated.
	 * @param newEvents New index of flow control events.
	 */
	setFlowControlEvents(sceneUri: string, newEvents: FlowControlEvent[]): void;
	/**
	 * Set the index of achievement codenames in the project.
	 * @param newIndex New index of achievement codenames. Keys should _not_ be case insensitive.
	 */
	setAchievements(newIndex: AchievementIndex): void;
	/**
	 * Set the index of references to achivements.
	 * 
	 * This index is only to direct references to achievements, not to achievement-variable references
	 * created by the *check_achievements command.
	 * @param sceneUri URI to document whose index is to be updated.
	 * @param newIndex New index of references to achievements.
	 */
	setAchievementReferences(sceneUri: string, newIndex: IdentifierMultiIndex | Map<string, Location[]>): void;
	/**
	 * Set the index of scopes.
	 * @param sceneUri URI to document whose index is to be updated.
	 * @param newScopes New scopes.
	 */
	setDocumentScopes(sceneUri: string, newScopes: DocumentScopes): void;
	/**
	 * Set the index of references to images.
	 * @param sceneUri URI to document whose index is to be updated.
	 * @param newIndex New index of references to image files or URLs.
	 */
	setImages(sceneUri: string, newIndex: IdentifierMultiIndex | Map<string, Location[]>): void;
	/**
	 * Set the list of errors that occured during parsing.
	 * @param sceneUri URI to document whose index is to be updated.
	 * @param errors New list of errors.
	 */
	setParseErrors(sceneUri: string, errors: Diagnostic[]): void;
	/**
	 * Set whether or not the project has been fully indexed.
	 * @param isIndexed True if project indexing is complete.
	 */
	setProjectIsIndexed(isIndexed: boolean): void;
	/**
	 * Set whether or not the project has a choicescript_stats.txt file.
	 * 
	 * This is needed because that file isn't necessarily listed in the startup.txt scene list.
	 * @param hasChoicescriptStats True if project has a choicescript_stats.txt scene.
	 */
	setHasChoicescriptStats(hasChoicescriptStats: boolean): void;
	/**
	 * Determine if a document URI is the project's startup.txt file.
	 */
	isStartupFileUri(uri: string): boolean;
	/**
	 * Get whether or not the project has been fully indexed.
	 */
	projectIsIndexed(): boolean;
	/**
	 * Whether the project has a given scene file URI in its index.
	 */
	hasUri(sceneUri: string): boolean;
	/**
	 * Get all indexed scene names.
	 */
	getIndexedScenes(): readonly string[];
	/**
	 * Get whether or not the project has a choicescripts_stats.txt file.
	 */
	hasChoicescriptStats(): boolean;
	/**
	 * Get the platform path to the VS Code workspace containing the project.
	 */
	getPlatformWorkspacePath(): string;
	/**
	 * Get the platform (as opposed to workspace-relative) path to the project's scenes.
	 */
	getPlatformScenePath(): string;
	/**
	 * Get the platform (as opposed to workspace-relative) path to the project's images.
	 * If the project contains no images or none of the image files are found, then
	 * returns undefined.
	 * @returns Path to the images, or undefined if not known.
	 */
	getPlatformImagePath(): string | undefined;
	/**
	 * Get the URI to a scene file.
	 * @param scene Scene name.
	 */
	getSceneUri(scene: string): string | undefined;
	/**
	 * Get list of scenes in the startup file.
	 */
	getSceneList(): readonly string[];
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
	getAchievements(): ReadonlyAchievementIndex;
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
	getAchievementReferences(achievement: string): readonly Location[];
	/**
	 * Get all references to variables in one scene document.
	 * @param sceneUri Scene document URI.
	 */
	getDocumentVariableReferences(sceneUri: string): ReadonlyIdentifierMultiIndex;
	/**
	 * Get all references to a variable across all documents.
	 * @param variable Variable to find references to.
	 */
	getVariableReferences(variable: string): readonly Location[];
	/**
	 * Get all flow control events in a scene document.
	 * @param sceneUri Scene document URI.
	 */
	getFlowControlEvents(sceneUri: string): readonly FlowControlEvent[];
	/**
	 * Get all scenes listed in the scene list or referenced by flow control events project-wide.
	 */
	getAllReferencedScenes(): readonly string[];
	/**
	 * Get all references to a label.
	 * @param label Label.
	 */
	getLabelReferences(label: string): readonly Location[];
	/**
	 * Get document scopes for a scene file.
	 * @param sceneUri Scene document URI.
	 */
	getDocumentScopes(sceneUri: string): DocumentScopes;
	/**
	 * Get list of all images referenced in the project.
	 * @param sceneUri Scene document URI.
	 */
	getImages(sceneUri: string): ReadonlyIdentifierMultiIndex;
	/**
	 * Get the parse errors.
	 * @param sceneUri Scene document URI.
	 */
	getParseErrors(sceneUri: string): readonly Diagnostic[];
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
	private _projectIsIndexed: boolean;
	private _platformWorkspacePath: string;
	private _platformScenePath: string;
	private _platformImagePath: string | undefined;
	private _startupFileUri: string;
	private _hasChoicescriptStats: boolean;
	private _wordCounts: Map<string, number>;
	private _globalVariables: IdentifierIndex;
	private _localVariables: Map<string, IdentifierMultiIndex>;
	private _subroutineLocalVariables: Map<string, IdentifierIndex>;
	private _variableReferences: Map<string, IdentifierMultiIndex>;
	private _scenes: string[];
	private _localLabels: Map<string, LabelIndex>;
	private _flowControlEvents: Map<string, FlowControlEvent[]>;
	private _achievements: Map<string, [Location, number, string]>;
	private _achievementReferences: Map<string, IdentifierMultiIndex>;
	private _documentScopes: Map<string, DocumentScopes>;
	private _images: Map<string, IdentifierMultiIndex>;
	private _parseErrors: Map<string, Diagnostic[]>;
	constructor() {
		this._projectIsIndexed = false;
		this._platformWorkspacePath = "";
		this._platformScenePath = "";
		this._startupFileUri = "";
		this._hasChoicescriptStats = false;
		this._wordCounts = new Map();
		this._globalVariables = new CaseInsensitiveMap();
		this._localVariables = new Map();
		this._subroutineLocalVariables = new Map();
		this._variableReferences = new Map();
		this._scenes = [];
		this._localLabels = new Map();
		this._flowControlEvents = new Map();
		this._achievements = new CaseInsensitiveMap();
		this._achievementReferences = new Map();
		this._documentScopes = new Map();
		this._images = new Map();
		this._parseErrors = new Map();
	}
	setPlatformWorkspacePath(path: string): void {
		this._platformWorkspacePath = path;
	}
	setPlatformScenePath(path: string): void {
		this._platformScenePath = path;
	}
	setPlatformImagePath(path: string): void {
		this._platformImagePath = path;
	}
	setWordCount(sceneUri: string, count: number): void {
		this._wordCounts.set(sceneUri, count);
	}
	setGlobalVariables(sceneUri: string, newIndex: Map<string, Location>): void {
		this._startupFileUri = sceneUri;
		this._globalVariables = new CaseInsensitiveMap(newIndex);
	}
	setLocalVariables(sceneUri: string, newIndex: Map<string, Location[]>): void {
		this._localVariables.set(sceneUri, mapToUnionedCaseInsensitiveMap(newIndex));
	}
	setSubroutineLocalVariables(sceneUri: string, newIndex: Map<string, Location>): void {
		this._subroutineLocalVariables.set(sceneUri, new CaseInsensitiveMap(newIndex));
	}
	setVariableReferences(sceneUri: string, newIndex: IdentifierMultiIndex | Map<string, Location[]>): void {
		this._variableReferences.set(sceneUri, mapToUnionedCaseInsensitiveMap(newIndex));
	}
	setSceneList(scenes: string[]): void {
		this._scenes = scenes;
	}
	setLabels(sceneUri: string, newIndex: LabelIndex): void {
		this._localLabels.set(sceneUri, new Map(newIndex));
	}
	setFlowControlEvents(sceneUri: string, newIndex: FlowControlEvent[]): void {
		this._flowControlEvents.set(sceneUri, [...newIndex]);
	}
	setAchievements(newIndex: Map<string, [Location, number, string]>): void {
		this._achievements = new CaseInsensitiveMap(newIndex);
	}
	setAchievementReferences(sceneUri: string, newIndex: IdentifierMultiIndex | Map<string, Location[]>): void {
		this._achievementReferences.set(sceneUri, mapToUnionedCaseInsensitiveMap(newIndex));
	}
	setDocumentScopes(sceneUri: string, newScopes: DocumentScopes): void {
		this._documentScopes.set(sceneUri, newScopes);
	}
	setImages(sceneUri: string, newIndex: IdentifierMultiIndex | Map<string, Location[]>): void {
		this._images.set(sceneUri, mapToUnionedCaseInsensitiveMap(newIndex));
	}
	setParseErrors(sceneUri: string, errors: Diagnostic[]): void {
		this._parseErrors.set(sceneUri, [...errors]);
	}
	setProjectIsIndexed(isIndexed: boolean): void {
		this._projectIsIndexed = isIndexed;
	}
	setHasChoicescriptStats(hasChoicescriptStats: boolean): void {
		this._hasChoicescriptStats = hasChoicescriptStats;
	}
	isStartupFileUri(uri: string): boolean {
		return this._startupFileUri == normalizeUri(uri);
	}
	projectIsIndexed(): boolean {
		return this._projectIsIndexed;
	}
	hasUri(sceneUri: string): boolean {
		return this._wordCounts.has(sceneUri) ||
			this._localVariables.has(sceneUri) ||
			this._subroutineLocalVariables.has(sceneUri) ||
			this._variableReferences.has(sceneUri) ||
			this._localLabels.has(sceneUri) ||
			this._achievementReferences.has(sceneUri) ||
			this._documentScopes.has(sceneUri) ||
			this._flowControlEvents.has(sceneUri) ||
			this._parseErrors.has(sceneUri);
	}
	getIndexedScenes(): readonly string[] {
		const sceneUris = [...new Set([
			...this._wordCounts.keys(),
			...this._localVariables.keys(),
			...this._subroutineLocalVariables.keys(),
			...this._variableReferences.keys(),
			...this._localLabels.keys(),
			...this._achievementReferences.keys(),
			...this._documentScopes.keys(),
			...this._flowControlEvents.keys(),
			...this._parseErrors.keys(),
		])];
		return sceneUris.map(uri => { return basename(uri, '.txt'); });
	}
	hasChoicescriptStats(): boolean {
		return this._hasChoicescriptStats;
	}
	getPlatformWorkspacePath(): string {
		return this._platformWorkspacePath;
	}
	getPlatformScenePath(): string {
		return this._platformScenePath;
	}
	getPlatformImagePath(): string | undefined {
		return this._platformImagePath;
	}
	getSceneUri(scene: string): string | undefined {
		if (this._startupFileUri == "") {
			return undefined;
		}
		return this._startupFileUri.replace('startup', scene);
	}
	getSceneList(): readonly string[] {
		return Array.from(this._scenes);
	}
	getWordCount(sceneUri: string): number | undefined {
		// Since this is often called as a one-off, leave the normalizeUri() call here.
		return this._wordCounts.get(normalizeUri(sceneUri));
	}
	getGlobalVariables(): ReadonlyIdentifierIndex {
		return this._globalVariables;
	}
	getLocalVariables(sceneUri: string): ReadonlyIdentifierMultiIndex {
		const index = this._localVariables.get(sceneUri) ?? new CaseInsensitiveMap();
		return index;
	}
	getSubroutineLocalVariables(sceneUri: string): ReadonlyIdentifierIndex {
		const index = this._subroutineLocalVariables.get(sceneUri) ?? new CaseInsensitiveMap();
		return index;
	}
	getLabels(sceneUri: string): ReadonlyLabelIndex {
		const index = this._localLabels.get(sceneUri) ?? new Map();
		return index;
	}
	getAchievements(): ReadonlyAchievementIndex {
		return this._achievements;
	}
	getDocumentAchievementReferences(sceneUri: string): ReadonlyIdentifierMultiIndex {
		const index = this._achievementReferences.get(sceneUri) ?? new CaseInsensitiveMap();
		return index;
	}
	getAchievementReferences(achievement: string): readonly Location[] {
		const locations: Location[] = [];
		for (const index of this._achievementReferences.values()) {
			const partialLocations = index.get(achievement);
			if (partialLocations !== undefined)
				locations.push(...partialLocations);
		}
		return locations;
	}
	getDocumentVariableReferences(sceneUri: string): ReadonlyIdentifierMultiIndex {
		const index = this._variableReferences.get(sceneUri) ?? new CaseInsensitiveMap();
		return index;
	}
	getVariableReferences(variable: string): readonly Location[] {
		const locations: Location[] = [];
		for (const index of this._variableReferences.values()) {
			const partialLocations = index.get(variable);
			if (partialLocations !== undefined)
				locations.push(...partialLocations);
		}
		return locations;
	}
	getFlowControlEvents(sceneUri: string): readonly FlowControlEvent[] {
		const index = this._flowControlEvents.get(sceneUri) ?? [];
		return index;
	}
	getAllReferencedScenes(): readonly string[] {
		const scenes: string[] = [...this.getSceneList()];

		for (const events of this._flowControlEvents.values()) {
			scenes.push(...events.filter(event => {
				return event.command.endsWith("_scene") && event.scene != "" && !event.scene.startsWith("{");
			}).map(event => event.scene));
		}

		return [...new Set(scenes)];
	}
	getLabelReferences(label: string): readonly Location[] {
		const locations: Location[] = [];
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		for (const [documentUri, events] of this._flowControlEvents) {
			const matchingEvents = events.filter(event => {
				return (event.labelLocation !== undefined && event.label == label);
			});
			const matchingLocations = matchingEvents.map(event => {
				return event.labelLocation!;  // This is OK because the filter above gets rid of labelLocations that don't exist
			});
			locations.push(...matchingLocations);
		}
		return locations;
	}
	getDocumentScopes(sceneUri: string): DocumentScopes {
		let scopes = this._documentScopes.get(sceneUri);
		if (scopes === undefined) {
			scopes = {
				achievementVarScopes: [],
				choiceScopes: [],
				paramScopes: [],
			};
		}
		return scopes;
	}
	getImages(sceneUri: string): ReadonlyIdentifierMultiIndex {
		const index = this._images.get(sceneUri) ?? new CaseInsensitiveMap();
		return index;
	}
	getParseErrors(sceneUri: string): readonly Diagnostic[] {
		const errors = this._parseErrors.get(sceneUri) ?? [];
		return errors;
	}
	removeDocument(textDocumentUri: string): void {
		const uri = normalizeUri(textDocumentUri);

		if (uriIsStartupFile(uri)) {
			this._globalVariables = new CaseInsensitiveMap();
			this._scenes = [];
			this._achievements = new CaseInsensitiveMap();
		}

		this._wordCounts.delete(uri);
		this._localVariables.delete(uri);
		this._subroutineLocalVariables.delete(uri);
		this._variableReferences.delete(uri);
		this._localLabels.delete(uri);
		this._flowControlEvents.delete(uri);
		this._achievementReferences.delete(uri);
		this._documentScopes.delete(uri);
		this._images.delete(uri);
		this._parseErrors.delete(uri);
	}
}
