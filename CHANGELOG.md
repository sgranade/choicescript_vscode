# Change Log
Changes to the plugin.

## [Unreleased]
### Added
- Local *temp variables with the same name as *global variables now generate a warning.
- *stat_chart commands are now parsed and errors flagged.

### Fixed
- Experimental array syntax is no longer flagged as an error.
- Properly indexes files when the workspace isn't opened in the scenes folder.
- Definitions now only allowed on actual variable or label references, not any old text in the document.
- References in *goto and *gosub commands are now indexed.
- References in *stat_chart are now indexed.

## [1.0.0] - 2019-12-31
### Added
- IntelliSense automatic code completion for ChoiceScript commands like `*choice`.
- Diagnostics to highlight errors.
- Go to variable definition.
- Highlight variable usage.
- Rename variables project-wide.
- Auto-indention after commands that require it, like `*choice` and `*if`.
- Snippets to turn ... into an ellipsis and -- into an em-dash to match Choice of Games typography.
