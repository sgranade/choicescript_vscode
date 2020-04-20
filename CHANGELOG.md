# Change Log

Changes to the plugin.

## [1.3.0] - 2020-04-19

### Added

- Can now auto-complete variables after a *rand command.

### Changed

- Outline now lists all #options in a *choice.

### Fixed

- *rand command now syntax highlights its contents correctly.

## [1.2.0] - 2020-03-05

### Added

- The document outline lets you see the flow of choices, labels, and variables in your game.
- Error catching expanded.
  - Parentheses' contents are now inspected for errors.
  - Problems with *set commands.
  - Problems with *if and *elseif commands.
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
  - Local *temp variables with the same name as *global variables now generate a warning.
  - Re-creating variables or labels are now flagged.
  - *stat_chart commands are now parsed and errors flagged.
  - Nested multireplaces are now flagged.
  - Invalid operators are now flagged.

### Fixed

- Experimental array syntax is no longer flagged as an error.
- Properly indexes files when the workspace isn't opened in the scenes folder.
- Definitions now only allowed on actual variable, label, or achievement references, not any old text in the document.
- References in *goto and *gosub commands are now indexed.
- References in *stat_chart are now indexed.
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
