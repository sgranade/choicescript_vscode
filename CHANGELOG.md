# Change Log
Changes to the plugin.

## [Unreleased]
### Added
- Italicize text using `Ctrl`+`i` or `Ctrl`+`Shift`+`i`.
- Bold text using `Ctrl`+`Shift`+`b`.
- Choices with more than 15 words are now flagged for review.
- Highlight label usage.
- Local *temp variables with the same name as *global variables now generate a warning.
- Error catching greatly expanded.
	- Re-creating variables or labels are now flagged.
	- *stat_chart commands are now parsed and errors flagged.
	- Nested multireplaces are now flagged.
	- Invalid operators are now flagged.

### Fixed
- Experimental array syntax is no longer flagged as an error.
- Properly indexes files when the workspace isn't opened in the scenes folder.
- Definitions now only allowed on actual variable or label references, not any old text in the document.
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
