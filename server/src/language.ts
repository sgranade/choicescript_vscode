import * as URI from 'urijs';
import { CompletionItem, CompletionItemKind } from 'vscode-languageserver';

import { getFilenameFromUri } from './utilities';

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
 * ChoiceScript named operators
 */
export let namedOperators: ReadonlyArray<string> = [
	"and", "or", "modulo"
];

/* PATTERNS */

/**
 * Pattern to find commands.
 */
export let commandPattern = "?<commandPrefix>(\\n|^)\\s*?)\\*(?<command>\\w+)";
/**
 * Pattern to find commands that create labels or variables or directly manipulate those variables.
 */
export let symbolCommandPattern = "(?<symbolCommandPrefix>(\\n|^)\\s*?)\\*(?<symbolCommand>temp|label|set|delete|rand)(?<spacing>\\s+)(?<commandSymbol>\\w+)";
/**
 * Pattern to find commands that create labels or variables in a ChoiceScript startup file.
 */
export let startupFileSymbolCommandPattern = symbolCommandPattern.replace("temp|", "create|temp|");
/**
 * Pattern to find commands that create scene lists.
 */
export let sceneListCommandPattern = "(?<sceneListCommand>scene_list)\\s*?\\r?\\n?";
/**
 * Pattern to find the start of a multireplace.
 */
export let multiPattern = "(?<multi>@!?!?{)";
/**
 * Pattern to find a reference to a variable.
 */
export let referencePattern = "(?<!@|@!|@!!)(?<reference>(\\$!?!?)?{(?<referenceSymbol>\\w+)})";
/**
 * Pattern to find a command that might reference a symbol.
 */
export let symbolReferencePattern = "(?<symbolReferencePrefix>(\\n|^)\\s*?)\\*(?<referenceCommand>(selectable_)?if|elseif|elsif)(?<referenceSpacing>\\s+)(?<referenceLine>.+)";
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
 * Determine if a URI points to a ChoiceScript startup file.
 * 
 * @param uriString URI to see if it refers to the startup file.
 * @returns True if the URI is to the startup file, false otherwise.
 */
export function uriIsStartupFile(uriString: string): boolean {
	return (getFilenameFromUri(uriString) == "startup.txt");
}
