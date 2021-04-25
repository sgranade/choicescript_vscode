# Change Log

Changes to the plugin.

## [2.1.0] - 2021-04-25

### Changed

- When running quicktest or randomtest, all open files are saved so that your latest code is used.
- Better error messages for using negative numbers in comparisons (like `*if var < -2`), which aren't allowed.

### Fixed

- Operators no longer get syntax highlighting in non-code lines. (courtesy Dan Spinola)
- Variables that don't start with a letter, like `_var`, are now reported as an error.
- Error annotations are now removed when a new quicktest or randomtest is run.
- Error annotations are now removed when the document with the error is edited.
- Missing parentheses in multireplace tests without spaces, like `@{var=2 yes|no}`, are now reported properly.
- Randomtest full-text output no longer loses the occasional blank line.

## [2.0.0] - 2021-02-11

This update brings big new features: the ability to run your game in a browser for live-testing, and a way to run ChoiceScript Quicktest and Randomtest utilities from VS Code without having to download ChoiceScript.

### Added

- Open game in a browser for live testing.
- Run ChoiceScript's built-in Quicktest and Randomtest against a game.

### Fixed

- Empty multireplaces in an option (like `#Option @{true}`) no longer cause the extension to stop validating.

## [1.6.0] - 2021-01-01

### Changed

- Empty `*if`/`*elseif`/`*else` errors now don't put the error squigglies on the whole line.

### Fixed

- Variables aren't flagged as not existing until the full project has been indexed, getting rid of the flash of errors on startup.
- choicescript_stats is now recognized as a scene, allowing autocomplete and fixing erroneous warning messages.
- Functions in multireplaces, like `@{not(var) one|two}`, are now parsed correctly.
- Label indexing now properly handles labels with punctuation.

## [1.5.0] - 2020-11-06

### Added

- Warn when a `*temp` variable has the same name as an earlier-created one.
- `*create`, `*temp`, `*gosub`, and `*gosub_scene` now properly provide variable completions.
- More error catching.
  - #Options outside of a `*choice` command are flagged as an error.
  - #Options in a `*choice` command must have contents.
  - Multireplaces with no space between the parentheses and the options, like `@{(true)one|two}`, are now properly flagged as an error.

### Fixed

- Multireplace syntax highlighting updated to properly highlight variables in parentheses.
- Italic and bold text in a multireplace now show as italic and bold.

## [1.4.3] - 2020-09-29

### Added

- Multireplace error catching improved.

### Fixed

- Variable completion now works properly in multireplaces.
- Multireplace syntax highlighting now properly handles nested parentheses thanks to [a timely mailing list email from 2007](https://lists.macromates.com/textmate/2007-September/022055.html).
- Can you tell I focused on multireplaces this go-round?

## [1.4.2] - 2020-08-21

### Fixed

- Greatly sped up the extension by refactoring parsing and validation.
- Expression errors inside `*if` blocks and similar are now marked in the proper location.
- Multireplace errors inside `*if` blocks and similar are now marked in the proper location.

## [1.4.1] - 2020-06-30

### Added

- More error catching.
  - Flags any arguments to an `*if` before an `#Option` that aren't in parentheses.
  - Flags `*label` names with spaces in them.

### Fixed

- Variables in multi-parentheses expressions like `*if (var1) or (var2)` are now indexed correctly.
- Variable references in choice options like `#Option ${var}` are now indexed correctly.
- Variable references in multireplaces inside choice options like `#Option @{var one|two}` are now indexed correctly.
- Variable references in `*bug` commands are now indexed correctly.
- Syntax highlighting now applied to multireplaces in string literals.
- Syntax highlighting now applied to variables and multireplaces in bold and italicized sections.

## [1.4.0] - 2020-05-11

### Added

- Word count appears in the status bar.
- More error catching.
  - Properly checks the use of `*disable/enable/hide_reuse`, and `*if`/`*selectable_if` commands before #options.
  - Catches `*create` commands used after `*temp` commands.
  - Flags `*else` and `*elseif` used outside of an `*if` block.
  - Catches `*if`, `*elseif`, and `*if` commands with no contents.
  - Catches a switch from spaces to tabs (or vice versa)

### Fixed

- `todo` now highlighted in multireplaces

## [1.3.0] - 2020-04-19

### Added

- Can now auto-complete variables after a `*rand` command.

### Changed

- Outline now lists all #options in a `*choice`.

### Fixed

- `*rand` command now syntax highlights its contents correctly.

## [1.2.0] - 2020-03-05

### Added

- The document outline lets you see the flow of choices, labels, and variables in your game.
- Error catching expanded.
  - Parentheses' contents are now inspected for errors.
  - Problems with `*set` commands.
  - Problems with `*if` and `*elseif` commands.
  - Errors with comparisons like `1 < 2`.
  - Errors with values passed to functions like `not()`.
  - Commands with arguments that don't allow them.
  - Incorrectly-indented choices.
  - Choices with text in front of them.
- Warnings expanded.
  - Any text after commands that ignore that text.
  - Multireplaces that may need parentheses.

### Fixed

- References to variables in `*gosub` and `*gosub_scene` are now indexed properly.
- All local variable creation locations are now indexed.
- Word count warning for options now considers multireplaces properly.
- Variable completions in multireplaces now work properly.
- Missing commands added to syntax highlighter.

## [1.1.0] - 2020-02-01

### Added

- Italicize text using `Ctrl`+`i` or `Ctrl`+`Shift`+`i`.
- Bold text using `Ctrl`+`Shift`+`b`.
- Find where labels are referenced.
- Rename labels.
- Find where achievements are referenced.
- Rename achievements.
- Choices with more than 15 words are now flagged for review.
- Error catching greatly expanded.
  - Local `*temp` variables with the same name as `*create`d global variables now generate a warning.
  - Re-creating variables or labels are now flagged.
  - `*stat_chart` commands are now parsed and errors flagged.
  - Nested multireplaces are now flagged.
  - Invalid operators are now flagged.

### Fixed

- Experimental array syntax is no longer flagged as an error.
- Properly indexes files when the workspace isn't opened in the scenes folder.
- Definitions now only allowed on actual variable, label, or achievement references, not any old text in the document.
- References in `*goto` and `*gosub` commands are now indexed.
- References in `*stat_chart` are now indexed.
- Fixed potential endless recursion in parser.

## [1.0.0] - 2019-12-31

### Added

- IntelliSense automatic code completion for ChoiceScript commands like `*choice`.
- Diagnostics to highlight errors.
- Go to variable definition.
- Highlight variable usage.
- Rename variables project-wide.
- Auto-indention after commands that require it, like `*choice` and `*if`.
- Snippets to turn ... into an ellipsis and -- into an em-dash to match Choice of Games typography.
