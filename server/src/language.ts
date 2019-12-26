import * as URI from 'urijs';
import { CompletionItem, CompletionItemKind } from 'vscode-languageserver';

import { getFilenameFromUri, extractToMatchingDelimiter } from './utilities';
import { ReadonlyIdentifierIndex } from './indexer';


/* COMMANDS */

/**
 * Commands that can only be used in startup.txt
 */
export let startupCommands: ReadonlyArray<string> = ["create", "scene_list", "title", "author", "achievement", "product"];
// TODO deal with commands that are only allowed in choicescript_stats.txt

/**
 * Complete list of valid commands
 */
export let validCommands: ReadonlyArray<string> = [
	"comment", "goto", "gotoref", "label", "looplimit", "finish", "abort", "choice", "create", "temp",
	"delete", "set", "setref", "print", "if", "selectable_if", "rand", "page_break", "line_break", "script", "else",
	"elseif", "elsif", "reset", "goto_scene", "fake_choice", "input_text", "ending", "share_this_game",
	"stat_chart", "subscribe", "show_password", "gosub", "return", "hide_reuse", "disable_reuse", "allow_reuse",
	"check_purchase", "restore_purchases", "purchase", "restore_game", "advertisement",
	"feedback", "save_game", "delay_break", "image", "link", "input_number", "goto_random_scene",
	"restart", "more_games", "delay_ending", "end_trial", "login", "achieve", "scene_list", "title",
	"bug", "link_button", "check_registration", "sound", "author", "gosub_scene", "achievement",
	"check_achievements", "redirect_scene", "print_discount", "purchase_discount", "track_event",
	"timer", "youtube", "product", "text_image", "params", "config"
];

/**
 * Commands that create labels or variables.
 */
export let symbolCreationCommands: ReadonlyArray<string> = [
	"temp", "label"
];

/**
 * Commands that create labels or variables in a ChoiceScript startup file.
 */
export let startupFileSymbolCreationCommands: ReadonlyArray<string> = [...symbolCreationCommands, "create"];

/**
 * Commands that manipulate the contents of variables.
 */
export let variableManipulationCommands: ReadonlyArray<string> = [
	"set", "delete", "rand"
];

/**
 * Commands that reference variables.
 */
export let variableReferenceCommands: ReadonlyArray<string> = [ "if", "selectable_if", "elseif", "elsif" ];

/**
 * Commands that reference labels.
 */
export let labelReferenceCommands: ReadonlyArray<string> = [ "goto", "gosub", "goto_scene", "gosub_scene" ];


/* COMPLETIONS */

/**
 * Commands to auto-complete in startup.txt only
 */
export let startupCommandsCompletions: ReadonlyArray<CompletionItem> = ["create", "scene_list", "title", "author", "achievement"].map(x => ({
	label: x,
	kind: CompletionItemKind.Keyword,
	data: "command"
}));

/**
 * Commands to auto-complete
 */
export let validCommandsCompletions: ReadonlyArray<CompletionItem> = [
	"comment", "goto", "label", "finish", "choice", "temp", "delete", "set", "if", "rand", "page_break", "line_break",
	"script", "else", "elseif", "goto_scene", "fake_choice", "input_text", "ending", "stat_chart",
	"gosub", "return", "hide_reuse", "disable_reuse", "allow_reuse", "save_game", "image", "link", "input_number",
	"goto_random_scene", "restart", "achieve", "bug", "sound", "gosub_scene", "check_achievements", "redirect_scene", "params",
].map(x => ({
	label: x,
	kind: CompletionItemKind.Keyword,
	data: "command"
}));


/* RESERVED WORDS */

/**
 * ChoiceScript built-in functions
 */
export let functions: ReadonlyArray<string> = [
	"not", "round", "timestamp", "log", "length", "auto"
];

/**
 * ChoiceScript built-in variables
 */
export let builtinVariables: ReadonlyArray<string> = [
	"choice_subscribe_allowed", "choice_register_allowed", "choice_registered", "choice_is_web", "choice_is_steam",
	"choice_is_ios_app", "choice_is_advertising_supported", "choice_is_trial", "choice_release_date", "choice_prerelease",
	"choice_kindle", "choice_randomtest", "choice_quicktest", "choice_restore_purchases_allowed", "choice_save_allowed",
	"choice_time_stamp", "choice_nightmode"
];

/**
 * ChoiceScript named operators
 */
export let namedOperators: ReadonlyArray<string> = [
	"and", "or", "modulo"
];

/**
 * ChoiceScript named values
 */
export let namedValues: ReadonlyArray<string> = [
	"true", "false"
];


/* PATTERNS */

/**
 * Pattern to find commands, legal or otherwise.
 */
export let commandPattern = "(?<commandPrefix>(\\n|^)[ \t]*?)?\\*(?<command>\\w+)((?<commandSpacing>[ \t]*)(?<commandLine>.+))?";
/**
 * Pattern to find legal commands that create labels or variables or directly manipulate those variables.
 */
export let symbolCommandPattern = "(?<symbolCommandPrefix>(\\n|^)[ \t]*?)\\*(?<symbolCommand>" + symbolCreationCommands.concat(variableManipulationCommands).join('|') + ")(?<spacing>\\s+)(?<commandSymbol>\\w+)";
/**
 * Pattern to find legal commands that create labels or variables in a ChoiceScript startup file.
 */
export let startupFileSymbolCommandPattern = "(?<symbolCommandPrefix>(\\n|^)[ \t]*?)\\*(?<symbolCommand>" + startupFileSymbolCreationCommands.concat(variableManipulationCommands).join('|') + ")(?<spacing>\\s+)(?<commandSymbol>\\w+)";
/**
 * Pattern to find commands that create scene lists.
 */
export let sceneListCommandPattern = "(?<sceneListCommand>scene_list)[ \t]*?\\r?\\n?";
/**
 * Pattern to find the start of a multireplace.
 */
export let multiPattern = "(?<multi>@!?!?{)";
/**
 * Pattern to find a reference to a variable.
 */
export let referencePattern = "(?<!@|@!|@!!)(?<reference>(\\$!?!?)?{(?<referenceSymbol>\\w+)})";
/**
 * Pattern to find a legal command that might reference a symbol.
 */
export let symbolReferencePattern = "(?<symbolReferencePrefix>(\\n|^)\\s*?)\\*(?<referenceCommand>" + variableReferenceCommands.join('|') + ")(?<referenceSpacing>\\s+)(?<referenceLine>.+)";
/**
 * Pattern to find an achievement definition.
 */
export let achievementPattern = "\\*achievement[ \\t]+(?<achievement>\\S+)";
/**
 * Pattern to find elements that go against Choice of Games style guide.
 */
export let stylePattern = "(?<styleGuide>(?<!\\.)\\.{3}(?!\\.)|(?<!-)--(?!-))";


/* FUNCTIONS */

/**
 * Extract a ChoiceScript symbol from text at a given index.
 * @param text Text.
 * @param index Index inside the symbol to be extracted.
 * @returns The symbol.
 */
export function extractSymbolAtIndex(text: string, index: number): string {
	let start = index;
	while (start >= 0 && /\w/.test(text[start]))
		start--;
	let end = index;
	while (end < text.length && /\w/.test(text[end]))
		end++;

	let symbol = text.slice(start+1, end);
	return symbol;
}

/**
 * Extract the test portion of a multireplace (the bit right after "@{").
 * @param document Document containing the multireplace.
 * @param startIndex Index to the multireplace's contents (after the "@{" part).
 * @returns The test portion and its index in the document.
 */
export function extractMultireplaceTest(document: string, 
	startIndex: number): { testContents: string | undefined; index: number } {
	let testContents: string | undefined = undefined;
	let testIndex: number = startIndex;

	if (document[startIndex] != '(') {
		// The multireplace only has a bare symbol as its test
		let i = startIndex;
		let endIndex: number | undefined = undefined;
		while (i < document.length) {
			if (!/\w/.test(document[i])) {
				endIndex = i;
				break;
			}
			i++;
		}
		if (endIndex !== undefined) {
			testContents = document.slice(startIndex, endIndex);
		}
	}
	else {
		// TODO tokenizing would potentially give better performance
		testIndex++;
		let documentPiece = document.slice(testIndex);
		testContents = extractToMatchingDelimiter(documentPiece, "(", ")");
	}

	return { testContents: testContents, index: testIndex };
}

/**
 * Determine if a variable name references an auto-created achievement variable.
 * @param variable Variable name.
 * @param achievements Index of achievements.
 */
export function variableIsAchievement(variable: string, achievements: ReadonlyIdentifierIndex): boolean {
	let achievementVariablePattern = /^choice_achieved_(?<codename>\w+)$/;

	let m = achievementVariablePattern.exec(variable);
	return (m !== null && m.groups !== undefined && achievements.get(m.groups.codename) !== undefined);
}

/**
 * Determine if a URI points to a ChoiceScript startup file.
 * 
 * @param uriString URI to see if it refers to the startup file.
 * @returns True if the URI is to the startup file, false otherwise.
 */
export function uriIsStartupFile(uriString: string): boolean {
	return (getFilenameFromUri(uriString) == "startup.txt");
}
