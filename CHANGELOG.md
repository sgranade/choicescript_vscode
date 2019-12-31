# Change Log
Changes to the plugin.

## [Unreleased]

## [1.0.0] - 2019-12-30
### Added
- IntelliSense automatic code completion for ChoiceScript commands like `*choice`.
- Diagnostics to highlight errors.
- Go to variable definition.
- Highlight variable usage.
- Rename variables project-wide.
- Auto-indention after commands that require it, like `*choice` and `*if`.
- Snippets to turn ... into an ellipsis and -- into an em-dash to match Choice of Games typography.

### Changed
- Syntax highlighting now properly highlights multireplace.

## [0.0.4]
### Added
#### Syntax Highlighting
- Recognizes the new variable format that drops the $ symbol, {variable}.
- Correctly highlights uppercase variable syntax of $!{variable}, $!!{variable}, !{variable}, and !!{variable}.
- An initial multireplace highlight.

### Changed
#### Syntax Highlighting
- Now highlights *stat_chart, *bug, and *redirect_scene.
- No longer highlights text between two or more ${variables}.

## [0.0.3]
### Added
- Now includes a changelog.

## [0.0.1 - 0.0.2]
### Added
- Basic syntax highlighting.


## [0.0.5]
### Additional keywords added