import { DiagnosticSeverity, Diagnostic, Location } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';

import { statChartCommands } from './language';

/**
 * Metadata for a Choicescript diagnostic.
 */
interface DiagnosticMetadata {
	/**
	 * Diagnostic message.
	 */
	message: string;
	/**
	 * Diagnostic severity. If omitted, `DiagnosticSeverity.Error` is used.
	 */
	severity?: DiagnosticSeverity;
}

/**
 * Choicescript diagnostic codes.
 */
export const DiagnosticCodes = {
	AchievementAlreadyCreated: "achievement-already-created",
	AlwaysTrueExpression: "always-true-expression",
	CapitalLettersWillBeLowercased: "capital-letters-will-be-lowercased",
	CommandNotOnItsOwnLine: "command-not-on-its-own-line",
	EmptyBlock: "empty-block",
	EmptyMultireplace: "empty-multireplace",
	EmptyOption: "empty-option",
	EmptyReplacement: "empty-replacement",
	IfBlockOnlyCommand: "if-block-only-command",
	IgnoredArgument: "argument-is-ignored",
	IncompleteExpression: "incomplete-expression",
	IndentedTooLittle: "indented-too-little",
	IndentedTooMuch: "indented-too-much",
	InvalidAchievementHiddenPreEarnedDesc: "invalid-hidden-pre-earned-description",
	InvalidAchievementPointsValue: "invalid-points-value",
	InvalidAchievementVisibility: "invalid-visibility",
	InvalidCommand: "invalid-command",
	InvalidImageAlignment: "invalid-image-alignment",
	InvalidOperator: "invalid-operator",
	InvalidStatChartCommand: "invalid-stat-chart-command",
	InvalidValue: "invalid-value",
	InvalidVariable: "invalid-variable",
	KindleSearchMissingParentheses: "kindle-search-missing-parentheses",
	LabelAlreadyCreated: "label-already-created",
	LabelNotFound: "label-not-found",
	LocalVariableDefinedEarlier: "local-variable-defined-earlier",
	LocalVariableShadowsGlobalVariable: "local-variable-shadows-global-variable",
	MismatchedGroupSuboptions: "mismatched-group-suboptions",
	MismatchedIfStatements: "mismatched-if-statements",
	MismatchedIndent: "mismatched-indents",
	MissingAchievementCodename: "missing-codename",
	MissingAchievementHiddenPreEarnedDesc: "missing-hidden-pre-earned-desc",
	MissingAchievementPoints: "missing-points",
	MissingAchievementPreEarnedDesc: "missing-pre-earned-desc",
	MissingAchievementTitle: "missing-achievement-title",
	MissingAchievementVisibility: "missing-achievement-visibility",
	MissingButtonName: "missing-button-name",
	MissingCloseBrace: "missing-close-brace",
	MissingCloseQuote: "missing-close-quote",
	MissingCloseParenthesis: "missing-close-parenthesis",
	MissingCommandArguments: "missing-command-arguments",
	MissingFollowingParentheses: "missing-following-parentheses",
	MissingFunctionArguments: "missing-function-arguments",
	MissingGroupSuboption: "missing-group-suboption",
	MissingImageFile: "missing-image-file",
	MissingKindleSearchSearch: "missing-search",
	MissingMultipleGroupSuboptions: "missing-multiple-group-suboptions",
	MissingOptions: "missing-options",
	MissingParentheses: "missing-parentheses",
	MissingSpaceAfterParens: "missing-space-after-parens",
	MissingSpaceAfterVariable: "missing-space-after-variable",
	MissingSpaceBeforeButtonName: "missing-space-before-button-name",
	MissingStat: "missing-stat",
	MissingValueBeforeOperator: "missing-value-before-operator",
	MissingVariableName: "missing-variable-name",
	MissingVariableValue: "missing-variable-value",
	MixedTabsAndSpaces: "mixed-tabs-and-spaces",
	MustBeBooleanValue: "must-be-boolean-value",
	NestedMultireplace: "nested-multireplace",
	NeverTrueExpression: "never-true-expression",
	NoBracketsInAchievement: "no-brackets-in-achievement",
	NoChoiceVariableNames: "no-choice-variable-names",
	NoCreateAfterTemp: "no-create-after-temp",
	NoComparingNegativeNumbers: "no-comparing-negative-numbers",
	NoMultireplaceInAchievement: "no-multireplace-in-achievement",
	NoReplaceInAchievement: "no-replace-in-achievement",
	NoSpacesAtStartOfMultireplace: "no-spaces-at-start-of-multireplace",
	NoSpacesInLabelName: "no-spaces-in-label-name",
	NothingAfterCommand: "nothing-after-command",
	NothingAfterIFID: "nothing-after-ifid",
	NothingBetweenGroupSuboptions: "nothing-between-group-suboptions",
	NotBooleanOperator: "not-boolean-operator",
	NotBooleanOrVariable: "not-boolean-or-variable",
	NotNumberOrVariable: "not-number-or-variable",
	NotNumericOperator: "not-numeric-operator",
	NotNumericOperatorOrValueOrVariable: "not-numeric-operator-value-variable",
	NotOperator: "not-operator",
	NotOptionOrIf: "not-option-or-if",
	NotStringCompatible: "not-string-compatible",
	NotStringOrComparisonOperator: "not-string-or-comparison-operator",
	NotStringOrVariable: "not-string-or-variable",
	NotValueOrVariable: "not-value-or-variable",
	NotVariableOrReference: "not-variable-or-reference",
	OptionInChoiceBlockOnly: "option-in-choice-block-only",
	OptionOnlyCommand: "option-only-command",
	PossibleMissingParens: "possible-missing-parens",
	RedefinedAchievement: "redefined-achievement",
	ReturnWithoutLabel: "return-without-label",
	ReuseAfterIf: "reuse-after-if",
	SceneNotFound: "scene-not-found",
	ScriptIsUnsafe: "script-is-unsafe",
	ScriptWillNotRun: "script-will-not-run",
	StartupOnlyCommand: "startup-only-command",
	SwitchedToSpaces: "switched-to-spaces",
	SwitchedToTabs: "switched-to-tabs",
	TextAfterReuse: "text-after-reuse",
	TooFewOptions: "too-few-options",
	TooLongAchievement: "too-long-achievement",
	TooLongOption: "too-long-option",
	TooManyAchievements: "too-many-achievements",
	TooManyAchievementPoints: "too-many-achievement-points",
	TooManyExpressionElements: "too-many-elements",
	UnallowedCheckpointSlotNameCharacters: "unallowed-slot-name-characters",
	UnallowedCommandBeforeOption: "unallowed-command-before-option",
	UnallowedGroupNameCharacters: "unallowed-group-name-characters",
	UnallowedIFIDCharacters: "unallowed-ifid-characters",
	UnallowedProductIDCharacters: "unallowed-product-id-characters",
	UnicodeEllipsisRequired: "unicode-ellipsis-required",
	UnicodeEmDashRequired: "unicode-emdash-required",
	UnknownError: "unknown-error",
	UnknownFunctionError: "unknown-function-error",
	UnknownOperator: "unknown-operator",
	VariableAlreadyCreated: "variable-already-created",
	VariableMustStartWithLetter: "variable-must-start-with-letter",
	VariableNotDefined: "variable-not-defined",
	VariableUsedBeforeCreation: "variable-used-before-creation",
} as const;

export type DiagnosticCode = (typeof DiagnosticCodes)[keyof typeof DiagnosticCodes];

const DiagnosticMetadata: Record<DiagnosticCode, DiagnosticMetadata> = {
	[DiagnosticCodes.AchievementAlreadyCreated]: {
		message: "Achievement was already created",
	},
	[DiagnosticCodes.AlwaysTrueExpression]: {
		message: "Without parentheses, this expression will always be true.",
		severity: DiagnosticSeverity.Warning,
	},
	[DiagnosticCodes.CapitalLettersWillBeLowercased]: {
		message: "The capital letters in this slot's name will be turned into lowercase values.",
		severity: DiagnosticSeverity.Warning,
	},
	[DiagnosticCodes.CommandNotOnItsOwnLine]: {
		message: "This command should be on a line by itself.",
		severity: DiagnosticSeverity.Information,
	},
	[DiagnosticCodes.EmptyBlock]: {
		message: "Must have an indented line with contents after it.",
	},
	[DiagnosticCodes.EmptyMultireplace]: {
		message: "Multireplace is empty.",
	},
	[DiagnosticCodes.EmptyOption]: {
		message: "An option in a *choice must have contents.",
	},
	[DiagnosticCodes.EmptyReplacement]: {
		message: "Replacement is empty.",
	},
	[DiagnosticCodes.IfBlockOnlyCommand]: {
		message: "Must be part of an *if command block.",
	},
	[DiagnosticCodes.IgnoredArgument]: {
		message: "This will be ignored.",
		severity: DiagnosticSeverity.Warning,
	},
	[DiagnosticCodes.IncompleteExpression]: {
		message: "Incomplete expression.",
	},
	[DiagnosticCodes.IndentedTooLittle]: {
		message: "Line isn't indented enough.",
	},
	[DiagnosticCodes.IndentedTooMuch]: {
		message: "Line is indented too far.",
	},
	[DiagnosticCodes.InvalidAchievementHiddenPreEarnedDesc]: {
		message: 'Hidden *achievement\'s pre-earned description must be "hidden".',
	},
	[DiagnosticCodes.InvalidAchievementPointsValue]: {
		message: "Achievement points must be a number between 1 and 100."
	},
	[DiagnosticCodes.InvalidAchievementVisibility]: {
		message: '*achievement visibility must be "hidden" or "visible".',
	},
	[DiagnosticCodes.InvalidCommand]: {
		message: "Not a valid ChoiceScript command.",
	},
	[DiagnosticCodes.InvalidImageAlignment]: {
		message: 'Must be one of "left", "right", or "center".',
	},
	[DiagnosticCodes.InvalidOperator]: {
		message: "Invalid operator.",
	},
	[DiagnosticCodes.InvalidStatChartCommand]: {
		message: `Must be one of ${statChartCommands.join(", ")}.`,
	},
	[DiagnosticCodes.InvalidValue]: {
		message: "Not a valid value.",
	},
	[DiagnosticCodes.InvalidVariable]: {
		message: "not a valid variable.",
	},
	[DiagnosticCodes.KindleSearchMissingParentheses]: {
		message: "The first argument to *kindle_search must be in parentheses.",
	},
	[DiagnosticCodes.LabelAlreadyCreated]: {
		message: "This label was already created.",
	},
	[DiagnosticCodes.LabelNotFound]: {
		message: "This label wasn't found.",
	},
	[DiagnosticCodes.LocalVariableDefinedEarlier]: {
		message: "This variable was already defined earlier.",
		severity: DiagnosticSeverity.Information,
	},
	[DiagnosticCodes.LocalVariableShadowsGlobalVariable]: {
		message: "This variable has the same name as a global variable.",
		severity: DiagnosticSeverity.Information,
	},
	[DiagnosticCodes.MismatchedGroupSuboptions]: {
		message: "Group sub-options must be exactly the same.",
	},
	[DiagnosticCodes.MismatchedIfStatements]: {
		message: "*if statements in front of group sub-options must all evaluate to the same true or false value.",
		severity: DiagnosticSeverity.Warning,
	},
	[DiagnosticCodes.MismatchedIndent]: {
		message: "Line indent doesn't match earlier indents.",
	},
	[DiagnosticCodes.MissingAchievementCodename]: {
		message: "Command *achievement is missing its codename.",
	},
	[DiagnosticCodes.MissingAchievementHiddenPreEarnedDesc]: {
		message: "Hidden *achievement must have a post-earned description. (Is the indent wrong?)",
	},
	[DiagnosticCodes.MissingAchievementPoints]: {
		message: "Command *achievement is missing its point value.",
	},
	[DiagnosticCodes.MissingAchievementPreEarnedDesc]: {
		message: "Comand *achievement is missing its indented pre-earned description.", 
	},
	[DiagnosticCodes.MissingAchievementTitle]: {
		message: "Command *achievement is missing its title.",
	},
	[DiagnosticCodes.MissingAchievementVisibility]: {
		message: "Command *achievement is missing its visibility.",
	},
	[DiagnosticCodes.MissingButtonName]: {
		message: "Missing button name.",
	},
	[DiagnosticCodes.MissingCloseBrace]: {
		message: "Missing closing }."
	},
	[DiagnosticCodes.MissingCloseQuote]: {
		message: 'Missing closing ".',
	},
	[DiagnosticCodes.MissingCloseParenthesis]: {
		message: "Missing closing ).",
	},
	[DiagnosticCodes.MissingCommandArguments]: {
		message: "Missing arguments.",
	},
	[DiagnosticCodes.MissingFollowingParentheses]: {
		message: "Function must be followed by parentheses.",
	},
	[DiagnosticCodes.MissingFunctionArguments]: {
		message: "Function is missing its arguments.",
	},
	[DiagnosticCodes.MissingGroupSuboption]: {
		message: "Missing options for group.",
	},
	[DiagnosticCodes.MissingImageFile]: {
		message: "Couldn't find this image file.",
		severity: DiagnosticSeverity.Warning,
	},
	[DiagnosticCodes.MissingKindleSearchSearch]: {
		message: "Missing search.",
	},
	[DiagnosticCodes.MissingMultipleGroupSuboptions]: {
		message: "Missing sub-options.",
	},
	[DiagnosticCodes.MissingOptions]: {
		message: "Missing options.",
	},
	[DiagnosticCodes.MissingParentheses]: {
		message: "Arguments to an *if or *selectable_if before an #option must be in parentheses.",
		severity: DiagnosticSeverity.Warning,
	},
	[DiagnosticCodes.MissingSpaceAfterParens]: {
		message: "Multireplace must have a space after its parentheses.",
	},
	[DiagnosticCodes.MissingSpaceAfterVariable]: {
		message: "Multireplace must have a space after its variable.",
	},
	[DiagnosticCodes.MissingSpaceBeforeButtonName]: {
		message: "Missing space before the button name.",
	},
	[DiagnosticCodes.MissingStat]: {
		message: "*stat_chart must have at least one stat.",
	},
	[DiagnosticCodes.MissingValueBeforeOperator]: {
		message: "Missing value before the operator.",
	},
	[DiagnosticCodes.MissingVariableName]: {
		message: "Missing variable name.",
	},
	[DiagnosticCodes.MissingVariableValue]: {
		message: "Missing value to set the variable to.",
	},
	[DiagnosticCodes.MixedTabsAndSpaces]: {
		message: "Tabs and spaces can't be mixed.",
	},
	[DiagnosticCodes.MustBeBooleanValue]: {
		message: "Must be a boolean value.",
	},
	[DiagnosticCodes.NestedMultireplace]: {
		message: "Multireplaces can't be nested.",
	},
	[DiagnosticCodes.NeverTrueExpression]: {
		message: "This will never be true.",
		severity: DiagnosticSeverity.Warning,
	},
	[DiagnosticCodes.NoBracketsInAchievement]: {
		message: "Achievement text can't include [] brackets.",
	},
	[DiagnosticCodes.NoChoiceVariableNames]: {
		message: 'Variable names can\'t start with "choice_".',
	},
	[DiagnosticCodes.NoCreateAfterTemp]: {
		message: "*create must come before all *temp commands.",
	},
	[DiagnosticCodes.NoComparingNegativeNumbers]: {
		message: "Negative numbers can't be used in comparisons.",
	},
	[DiagnosticCodes.NoMultireplaceInAchievement]: {
		message: "Achievement text can't include a @{} multireplace.",
	},
	[DiagnosticCodes.NoReplaceInAchievement]: {
		message: "Achievement text can't include a ${} replacement.",
	},
	[DiagnosticCodes.NoSpacesAtStartOfMultireplace]: {
		message: "Spaces aren't allowed at the start of a multireplace.",
	},
	[DiagnosticCodes.NoSpacesInLabelName]: {
		message: "*label names can't have spaces.",
	},
	[DiagnosticCodes.NothingAfterCommand]: {
		message: "This command can't have any text after it.",
	},
	[DiagnosticCodes.NothingAfterIFID]: {
		message: "No text allowed after an IFID.",
	},
	[DiagnosticCodes.NothingBetweenGroupSuboptions]: {
		message: "Nothing is allowed between group sub-options.",
	},
	[DiagnosticCodes.NotBooleanOperator]: {
		message: "Must be a boolean operator.",
	},
	[DiagnosticCodes.NotBooleanOrVariable]: {
		message: "Must be a boolean value or variable.",
	},
	[DiagnosticCodes.NotNumberOrVariable]: {
		message: "Must be a number or a variable.",
	},
	[DiagnosticCodes.NotNumericOperator]: {
		message: "Must be a numeric operator.",
	},
	[DiagnosticCodes.NotNumericOperatorOrValueOrVariable]: {
		message: "Must be a numeric operator, value, or variable.",
	},
	[DiagnosticCodes.NotOperator]: {
		message: "Must be an operator.",
	},
	[DiagnosticCodes.NotOptionOrIf]: {
		message: "Must be either an #option or an *if.",
	},
	[DiagnosticCodes.NotStringCompatible]: {
		message: "Not compatible with strings.",
	},
	[DiagnosticCodes.NotStringOrComparisonOperator]: {
		message: "Must be a string or comparison operator.",
	},
	[DiagnosticCodes.NotStringOrVariable]: {
		message: "Must be a string or a variable.",
	},
	[DiagnosticCodes.NotValueOrVariable]: {
		message: "Must be a value or a variable.",
	},
	[DiagnosticCodes.NotVariableOrReference]: {
		message: "Must be a variable or variable reference.",
	},
	[DiagnosticCodes.OptionInChoiceBlockOnly]: {
		message: "An #option must only appear inside a *choice or *fake_choice.",
	},
	[DiagnosticCodes.OptionOnlyCommand]: {
		message: "This command must be in front of an #option.",
	},
	[DiagnosticCodes.PossibleMissingParens]: {
		message: "Potentially missing parentheses.",
		severity: DiagnosticSeverity.Information,
	},
	[DiagnosticCodes.RedefinedAchievement]: {
		message: "An achievement with the same title was defined earlier.",
	},
	[DiagnosticCodes.ReturnWithoutLabel]: {
		message: "This *return has no associated label.",
	},
	[DiagnosticCodes.ReuseAfterIf]: {
		message: "A reuse command must come before an *if or *selectable_if.",
	},
	[DiagnosticCodes.SceneNotFound]: {
		message: "This scene wasn't found in startup.txt or in the game's folder.",
		severity: DiagnosticSeverity.Warning,
	},
	[DiagnosticCodes.ScriptIsUnsafe]: {
		message: "Running games that use *script is a security-risk. Use caution.",
		severity: DiagnosticSeverity.Warning,
	},
	[DiagnosticCodes.ScriptWillNotRun]: {
		message: "You need to enable unsafe *script usage in settings.",
	},
	[DiagnosticCodes.StartupOnlyCommand]: {
		message: "This command can only be used in startup.txt.",
	},
	[DiagnosticCodes.SwitchedToSpaces]: {
		message: "Switched from tabs to spaces.",
	},
	[DiagnosticCodes.SwitchedToTabs]: {
		message: "Switched from spaces to tabs.",
	},
	[DiagnosticCodes.TextAfterReuse]: {
		message: "Nothing except an *if or *selectable_if is allowed between a reuse command and the #option.",
	},
	[DiagnosticCodes.TooFewOptions]: {
		message: "Multireplace must have at least two options separated by |.",
	},
	[DiagnosticCodes.TooLongAchievement]: {
		message: "This achievement has too many characters.",
	},
	[DiagnosticCodes.TooLongOption]: {
		message: "Option is more than 15 words long.",
		severity: DiagnosticSeverity.Information,
	},
	[DiagnosticCodes.TooManyAchievements]: {
		message: "No more than 100 achievements allowed.",
	},
	[DiagnosticCodes.TooManyAchievementPoints]: {
		message: "Total achievement points must be 1,000 or fewer.",
	},
	[DiagnosticCodes.TooManyExpressionElements]: {
		message: "Too many elements - are you missing parentheses?",
	},
	[DiagnosticCodes.UnallowedCheckpointSlotNameCharacters]: {
		message: "A checkpoint slot's name can only contain letters, numbers or an underscore.",
	},
	[DiagnosticCodes.UnallowedCommandBeforeOption]: {
		message: "Only *if, *selectable_if, or one of the reuse commands allowed in front of an option",
	},
	[DiagnosticCodes.UnallowedGroupNameCharacters]: {
		message: "Choice group names can only have letters, numbers, or _",
	},
	[DiagnosticCodes.UnallowedIFIDCharacters]: {
		message: "An IFID must have only hexidecimal characters (0-9 or a-f) in a 8-4-4-4-12 pattern.",
	},
	[DiagnosticCodes.UnallowedProductIDCharacters]: {
		message: "A product ID can only contain lower-case letters.",
	},
	[DiagnosticCodes.UnicodeEllipsisRequired]: {
		message: "Choice of Games style requires a Unicode ellipsis (…).",
		severity: DiagnosticSeverity.Information,
	},
	[DiagnosticCodes.UnicodeEmDashRequired]: {
		message: "Choice of Games style requires a Unicode em-dash (—).",
		severity: DiagnosticSeverity.Information,
	},
	[DiagnosticCodes.UnknownError]: {
		message: "Unknown error.",
	},
	[DiagnosticCodes.UnknownFunctionError]: {
		message: "Unknown function error.",
	},
	[DiagnosticCodes.UnknownOperator]: {
		message: "Unknown operator.",
	},
	[DiagnosticCodes.VariableAlreadyCreated]: {
		message: "This variable was created earlier.",
	},
	[DiagnosticCodes.VariableMustStartWithLetter]: {
		message: "A variable name must start with a letter.",
	},
	[DiagnosticCodes.VariableNotDefined]: {
		message: "This variable hasn't been defined.",
	},
	[DiagnosticCodes.VariableUsedBeforeCreation]: {
		message: "This variable is used before it is created.",
	},
}

/**
 * Create a diagnostic message.
 *
 * Pass start and end locations as 0-based indexes into the document's text.
 *
 * @param code Code for the diagnostic.
 * @param textDocument Document to which the diagnostic applies.
 * @param start Start location in the text of the diagnostic message.
 * @param end End location in the text of the diagnostic message.
 * @param message Diagnostic message to override the default message associated with the code.
 */
export function createDiagnostic(code: DiagnosticCode,
	textDocument: TextDocument, start: number, end: number, message?: string): Diagnostic {
	const diagnostic: Diagnostic = {
		code: code,
		severity: DiagnosticMetadata[code].severity || DiagnosticSeverity.Error,
		range: {
			start: textDocument.positionAt(start),
			end: textDocument.positionAt(end)
		},
		message: message || DiagnosticMetadata[code].message,
		source: 'ChoiceScript'
	};

	return diagnostic;
}

/**
 * Create a diagnostic message given a location.
 *
 * @param code Code for the diagnostic.
 * @param location Location of the message in the document.
 * @param message Diagnostic message t ooverride the default message associated with the code.
 */
export function createDiagnosticFromLocation(
	code: DiagnosticCode,
	location: Location,
	message?: string): Diagnostic {
	const diagnostic: Diagnostic = {
		code: code,
		severity: DiagnosticMetadata[code].severity || DiagnosticSeverity.Error,
		range: location.range,
		message: message || DiagnosticMetadata[code].message,
		source: 'ChoiceScript'
	};

	return diagnostic;
}
