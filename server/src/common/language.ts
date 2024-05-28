import { type CompletionItem, CompletionItemKind } from 'vscode-languageserver';

import { getFilenameFromUri, extractToMatchingDelimiter } from './utilities';
import type { ReadonlyAchievementIndex } from "./index";


/* COMMANDS */

/**
 * Commands that can only be used in startup.txt
 */
export const startupCommands: readonly string[] = ["create", "create_array", "scene_list", "title", "author", "achievement", "product", "ifid"];

/**
 * Complete list of valid commands.
 */
export const validCommands: readonly string[] = [
	"comment", "goto", "gotoref", "label", "looplimit", "finish", "abort",
	"choice", "create",	"create_array", "temp", "temp_array", "delete",
	"delete_array", "set", "setref", "print", "if", "selectable_if", "rand",
	"page_break", "line_break", "script", "else", "elseif", "elsif", "reset",
	"goto_scene", "fake_choice", "input_text", "ending", "share_this_game",	"stat_chart",
	"subscribe", "show_password", "gosub", "return", "hide_reuse", "disable_reuse", "allow_reuse",
	"check_purchase", "restore_purchases", "purchase", "restore_game", "advertisement",
	"kindle_search", "kindle_product", "feedback",
	"save_game", "delay_break", "image", "kindle_image", "link", "input_number", "goto_random_scene",
	"restart", "more_games", "delay_ending", "end_trial", "login", "achieve", "scene_list", "title",
	"bug", "link_button", "check_registration", "sound", "author", "gosub_scene", "achievement",
	"check_achievements", "redirect_scene", "print_discount", "purchase_discount", "track_event",
	"timer", "youtube", "product", "text_image", "ai", "params", "config", "ifid",
	"page_break_advertisement", "finish_advertisement",
	"save_checkpoint", "restore_checkpoint",
];

/**
 * Commands that require arguments.
 */
export const argumentRequiredCommands: readonly string[] = [
	"goto", "gotoref", "label", "create", "temp", "delete", "set", "setref", "print", "if", "selectable_if",
	"rand", "script", "elseif", "elsif", "goto_scene", "input_text", "gosub", "save_game", "image", "link",
	"input_number", "achieve", "title", "author", "gosub_scene", "achievement", "timer", "redirect_scene",
	"text_image", "config", "delay_ending", "ifid", "kindle_search", "kindle_product", "save_checkpoint",
	"restore_checkpoint",
];

/**
 * Commands that must not have any arguments.
 */
export const argumentDisallowedCommands: readonly string[] = [
	"else", "page_break_advertisement", "finish_advertisement"
];

/**
 * Commands that silently ignore any arguments.
 */
export const argumentIgnoredCommands: readonly string[] = [
	"line_break", "reset", "ending", "stat_chart", "return", "goto_random_scene",
	"restart", "scene_list", "check_achievements"
];

/**
 * Commands that can be used in front of a choice option.
 */
export const optionAllowedCommands: readonly string[] = [
	"hide_reuse", "disable_reuse", "allow_reuse", "if", "selectable_if"
];

/**
 * Commands that modify display of an option.
 */
export const reuseCommands: readonly string[] = ["allow_reuse", "hide_reuse", "disable_reuse"];

/**
 * Commands that must only be in containing blocks (like "*if" or "*choice")
 */
export const insideBlockCommands: readonly string[] = ["selectable_if", "elseif", "elsif", "else"];

/**
 * Commands that create labels or variables.
 */
export const symbolCreationCommands: readonly string[] = ["temp", "label", "params", "create"];

/**
 * Commands that reference variables that won't otherise be handled if they're outside their proper containing command (like "*if" or "*choice")
 */
export const variableReferenceCommands: readonly string[] = ["selectable_if", "elseif", "elsif"];

/**
 * Commands that manipulate the contents of variables.
 */
export const variableManipulationCommands: readonly string[] = [
	"set", "delete", "rand", "input_text", "input_number"
];

/**
 * Commands that control flow.
 */
export const flowControlCommands: readonly string[] = ["goto", "gosub", "goto_scene", "gosub_scene", "return"];

/**
 * Sub-commands under a *stat_chart command.
 */
export const statChartCommands: readonly string[] = ["text", "percent", "opposed_pair"];

/**
 * Sub-commands under a *stat_chart command that have at least one indented line after.
 */
export const statChartBlockCommands: readonly string[] = ["opposed_pair"];

/* COMPLETIONS */

/**
 * Commands to auto-complete in startup.txt only
 */
export const startupCommandsCompletions: CompletionItem[] = ["create", "scene_list", "title", "author", "achievement"].map(x => ({
	label: x,
	kind: CompletionItemKind.Keyword,
	data: "command"
}));

/**
 * Commands to auto-complete
 */
export const validCommandsCompletions: CompletionItem[] = [
	"comment", "goto", "label", "finish", "choice", "temp", "delete", "set", "if", "rand", "page_break", "line_break",
	"script", "else", "elseif", "goto_scene", "fake_choice", "input_text", "ending", "stat_chart",
	"gosub", "return", "hide_reuse", "disable_reuse", "allow_reuse", "save_game", "image", "link", "input_number",
	"goto_random_scene", "restart", "achieve", "bug", "sound", "gosub_scene", "check_achievements", "redirect_scene", "text_image", "params", "delay_break", "delay_ending"
].map(x => ({
	label: x,
	kind: CompletionItemKind.Keyword,
	data: "command"
}));


/* RESERVED WORDS */

/**
 * ChoiceScript built-in functions
 */
export const functions: readonly string[] = [
	"not", "round", "timestamp", "log", "length", "auto"
];

/**
 * ChoiceScript functions that take numbers
 */
export const numberFunctions: readonly string[] = [
	"round", "length", "log", "timestamp"
];

/**
 * ChoiceScript functions that take booleans
 */
export const booleanFunctions: readonly string[] = [
	"not"
];

/**
 * ChoiceScript built-in variables
 */
export const builtinVariables: readonly string[] = [
	"choice_subscribe_allowed", "choice_register_allowed", "choice_registered",
	"choice_is_web", "choice_is_steam", "choice_is_steam_deck", "choice_is_ios_app",
	"choice_is_ipad_app", "choice_is_android_app", "choice_is_omnibus_app",
	"choice_is_amazon_app",
	"choice_is_advertising_supported", "choice_is_trial", "choice_release_date",
	"choice_prerelease", "choice_kindle", "choice_randomtest", "choice_quicktest",
	"choice_linenum", "choice_scene",
	"choice_restore_purchases_allowed", "choice_save_allowed",
	"choice_time_stamp", "choice_nightmode", "choice_title",
	"choice_purchase_supported", "choice_purchased_adfree",
	"choice_saved_checkpoint"
];

/**
 * ChoiceScript param variables
 */
export const paramValues = new RegExp("^param_(count|\\d+)$");

/**
 * Math operators
 */
export const mathOperators: readonly string[] = [
	"+", "-", "*", "/", "%", "^", "%+", "%-",
];

/**
 * Comparison operators
 */
export const comparisonOperators: readonly string[] = [
	"=", "<", ">", "<=", ">=", "!="
];

/**
 * String operators
 */
export const stringOperators: readonly string[] = [
	"&", "#"
];

/**
 * Numeric named operators
 */
export const numericNamedOperators: readonly string[] = [
	"modulo"
];

/**
 * ChoiceScript named operators
 */
export const booleanNamedOperators: readonly string[] = [
	"and", "or"
];

/**
 * ChoiceScript named values
 */
export const booleanNamedValues: readonly string[] = [
	"true", "false"
];


/* PATTERNS */

/**
 * Pattern to find legal commands.
 */
export const commandPattern = "(?<commandPrefix>(\\n|^)[ \t]*?)\\*(?<command>\\w+)((?<commandSpacing>[ \t]*)(?<commandLine>.+))?";
/**
 * Pattern to find commands that aren't on a line by themselves.
 */
export const incorrectCommandPattern = "(?<=\\S)(?<commandPrefix>[ \t]+)\\*(?<command>\\w+)";
/**
 * Pattern to find the start of a multireplace.
 */
export const multiStartPattern = "(?<multi>@!?!?{)";
/**
 * Pattern to find the start of a replacement.
 */
export const replacementStartPattern = "(?<replacement>\\$!?!?{)";
/**
 * Pattern to find a choice option line, along with allowed commands.
 */
export const optionPattern = "(\\n|^)(?<optionPrefix>[ \t]*?)(\\*(disable|enable|hide)_reuse\\s+)?(\\*(selectable_)?if\\s+[^#*]+?)?(?<option>#(?<optionContents>.*))";
/**
 * Pattern to find a markup element like bold or italic.
 */
export const markupPattern = "\\[\\/?(i|b)\\]";
/**
 * Pattern to find elements that go against Choice of Games style guide.
 */
export const stylePattern = "(?<styleGuide>(?<!\\.)\\.{3}(?!\\.)|(?<!-)--(?!-))";


/* FUNCTIONS */

/**
 * Extract a ChoiceScript symbol from text at a given index.
 * @param text Text to extract symbol from.
 * @param index Index inside the symbol to be extracted.
 * @param isScene True if the symbol to be extracted is a scene.
 * @returns The symbol.
 */
export function extractSymbolAtIndex(text: string, index: number): string {
	const symbolCharacter = /\w/;
	let start = index;
	while (start >= 0 && symbolCharacter.test(text[start]))
		start--;
	let end = index;
	while (end < text.length && symbolCharacter.test(text[end]))
		end++;

	const symbol = text.slice(start + 1, end);
	return symbol;
}

const wordCharGlobalRegex = /\w+/g;

/**
 * Extract a token from a string.
 * 
 * The token must be at the given index, or else `undefined` is returned.
 * 
 * Returns `undefined` if an opening delimiter is matched with no maching close delimiter found.
 * @param text Text to extract a token from.
 * @param index Index into the text from which to extract the token.
 * @param delimiters Open/close delimiters to consider as a token. Uses {} by default.
 * @param symbolChars Characters that are considered to make up a symbol. Uses \w by default.
 */
export function extractTokenAtIndex(
	text: string,
	index: number,
	delimiters = "{}",
	symbolChars = "\\w"
): string | undefined {
	if (delimiters.length % 2) {
		throw Error(`Delimiters ${delimiters} are not paired`);
	}
	for (let i = 0; i < delimiters.length; i += 2) {
		if (text[index] == delimiters[i]) {
			const match = extractToMatchingDelimiter(text, delimiters[i], delimiters[i + 1], index + 1);
			if (match !== undefined) {
				return delimiters[i] + match + delimiters[i + 1];
			}
			return undefined;
		}
	}

	let pattern: RegExp;
	if (symbolChars == "\\w") {
		pattern = wordCharGlobalRegex;
	}
	else {
		pattern = RegExp(`[${symbolChars}]+`, 'g');
	}
	pattern.lastIndex = index;
	const m = pattern.exec(text);
	if (m !== null && m.index == index) {
		return m[0];
	}

	return undefined;
}

/**
 * Determine if a variable name references an auto-created achievement variable.
 * @param variable Variable name.
 * @param achievements Index of achievements.
 * @returns The achievement codename, or undefined if it's not an achievement variable.
 */
export function variableIsAchievement(variable: string, achievements: ReadonlyAchievementIndex): string | undefined {
	let codename: string | undefined = undefined;

	const achievementVariablePattern = /^choice_achieved_(?<codename>\w+)$/;
	const m = achievementVariablePattern.exec(variable);
	if (m !== null && m.groups !== undefined && achievements.has(m.groups.codename)) {
		codename = m.groups.codename;
	}

	return codename;
}

/**
 * Convert an achievement codename into the name of its auto-created achievement variable.
 * @param achievement The achievement codename.
 * @returns The achievement variable related to the codename.
 */
export function convertAchievementToVariable(achievement: string): string {
	return `choice_achieved_${achievement}`;
}

/**
 * Determine if a variable name could be an auto-created parameter variable.
 * @param variable Variable name.
 */
export function variableIsPossibleParameter(variable: string): boolean {
	return /^param_\d+$/.test(variable);
}

/**
 * Extract the scene name from a URI to a scene file.
 * @param uri URI to the scene file.
 */
export function sceneFromUri(uri: string): string | undefined {
	const m = /([\w-]+).txt$/.exec(uri);
	if (m == null) {
		return undefined;
	}
	else {
		return m[1];
	}
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

/**
 * Determine if a URI points to a ChoiceScript stats file.
 * 
 * @param uriString URI to see if it refers to the stats file.
 * @returns True if the URI is to the stats file, false otherwise.
 */
export function uriIsChoicescriptStatsFile(uriString: string): boolean {
	return (getFilenameFromUri(uriString) == "choicescript_stats.txt");
}
