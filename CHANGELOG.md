# Change Log

Changes to the plugin.

## Unreleased

### [1.4.3] - 2020-09-29

- Variable completion now works properly in multireplaces.
- Multireplace error catching improved.
- Multireplace syntax highlighting now properly handles nested parentheses thanks to [a timely mailing list email from 2007](https://lists.macromates.com/textmate/2007-September/022055.html).
- Can you tell I focused on multireplaces this go-round?

## [1.4.2] - 2020-08-21

### Fixed

- Greatly sped up the extension by refactoring parsing and validation.
- Expression errors inside `*if` blocks and similar are now marked in the proper location.
- Multireplace errors inside `*if` blocks and similar are now marked in the proper location.

## [1.4.1] - 2020-06-30

### Fixed

- Variables in multi-parentheses expressions like `*if (var1) or (var2)` are now indexed correctly.
- Variable references in choice options like `#Option ${var}` are now indexed correctly.
- Variable references in multireplaces inside choice options like `#Option @{var one|two}` are now indexed correctly.
- Variable references in `*bug` commands are now indexed correctly.
- Syntax highlighting now applied to multireplaces in string literals.
- Syntax highlighting now applied to variables and multireplaces in bold and italicized sections.
- More error catching.
  - Flags any arguments to an `*if` before an `#Option` that aren't in parentheses.
  - Flags `*label` names with spaces in them.

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
