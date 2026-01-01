# Change Log

Changes to the plugin.

## Unreleased

### Added

- `@{}` multireplace snippet.

### Changed

- Now optionally allows `*script` commands to execute. By default the command is blocked, but you can change that through the new "Allow Unsafe Script" setting. (MR #34, courtesy Carey Williams.)

### Fixed

- Game panel no longer says "Loading..." if there's no `*title` command. (MR #35, courtesy Carey Williams.)

## [3.1.1] - 2024-10-20

### Changed

- Updated Choicescript to latest version (c9b1a39).

### Fixed

- Creating a variable that starts with `choice_` is now properly flagged as an error.
- `*save_checkpoint` and `*restore_checkpoint` now don't give an error when they don't include a slot's name.
- `*save_checkpoint` and `*restore_checkpoint` now autocomplete properly.
- `choice_just_restored_checkpoint` and `choice_saved_checkpoint` are now properly treated as built-in variables.


## [3.1.0] - 2024-07-21

### Changed

- Games now run inside a tab in VS Code instead of opening a browser window. (Courtesy Carey Williams).

## [3.0.0] - 2024-03-10

While this version includes minor functional changes, the underlying structure has been extensively re-worked to move it towards being a web extension, which is why we're bumping the major version number.

### Added

- Stats can now be generated and saved.
- Achievements are now fully checked for correctness.
- `*image` commands that refer to non-existent files are now flagged.
- `*kindle_search`, `*product`, `*save_checkpoint`, and `*restore_checkpoint` commands are now parsed.

### Changed

- Images can now either be in the same directory as scene files or one directory up (the `mygame` directory).
- Updated Choicescript to latest version (d8d1680).

### Fixed

- Missing choices no longer make document symbols vanish.
- Variables whose name includes `param_count` (but are _not_ `param_count` itself) are now tracked properly.
- `*text_image` is now parsed properly.
- Only the first `startup.txt` file in the project will be indexed. (You shouldn't have multiples of them anyway, but just in case...)

## [2.6.0] - 2022-04-16

### Added

- Ability to turn on showing text for only parts of a randomtest run using `*comment text off` and `*comment text on`.
- Count of the Randomtest test now shows on the status bar while the test is running.

### Changed

- Choices in the outline now include a summary of the first choice.
- Randomtest settings are now updated properly, even when a test fails.

### Fixed

- Changed how the extension fails on array variables.
- The `&` operator combined with non-string values is no longer flagged as an error. (reported by nocturno)
- Auto-generated `*param`-generated variables like `param_count` and `param_1` are no longer flagged as errors. (reported by nocturno)

## [2.5.1] - 2022-01-23

Point release to fix an issue with the Visual Studio Marketplace.

## [2.5.0] - 2022-01-22

### Added

- `*ifid` command now supported.
- The extension now disables auto-complete for text. To get the old behavior back, uncheck the "Disable Quick Suggestions" option in Settings.
- Quicktest and Randomtest record the time when they started and finished.

### Changed

- The game-opening icon now is titled "Open in Browser".

### Fixed

- `*image` with a correct alignment type (such as `left`) is no longer incorrectly flagged as an error. (reported by nocturno)
- `*image` with no alignment type is no longer incorrectly flagged as an error. (reported by nocturno)
- `*if var = "#"` is no longer incorrectly flagged as an error. (reported by nocturno)

## [2.4.0] - 2021-11-30

### Added

- Added support for showing local images when running your game.
- Added support for [nested choices](https://choicescriptdev.fandom.com/wiki/Choice#Nested_choices).
- A new setting allows you to turn off warnings when your game doesn't follow Choice of Games's in-house style guide (like using ellipses and limiting option length to 15 words).

### Changed

- Re-ordered randomtest options in the context menu.
- The extension doesn't get bogged down like it used to on 30k+ word chapters.

### Fixed

- The extension now indexes all scenes referenced anywhere in the game, not just scenes listed in the `*scene_list`.
- Multiple indented `#option`s below an `*if` are no longer flagged as an error. (Fixes #17)
- Fixed numerous problems with variables defined in subroutines being flagged as used before they were defined.
- `*set var &"string"` is no longer flagged as an error. (reported by nocturno)
- Spaces between a function and its parentheses, such as `not  (var)`, are no longer flagged as an error. (reported by nocturno)
- Backslashes in parenthesized expressions or multireplaces no longer cause the extension to flag them incorrectly as an error.
- References in a multireplace test are now handled correctly. (reported by nocturno)
- Multireplaces with references now have proper syntax highlighting.
- Variable completions now properly reflect the variable's capitalization.
- A `*goto_scene` statement with a variable reference for the scene is no longer flagged as an error. (reported by nocturno)
- A `*goto_scene` statement with a variable reference for the label now correctly indexes the reference's location. (reported by nocturno)
- Minor fix to word counting in options with a multireplace.

## [2.3.0] - 2021-08-14

### Added

- You can now re-run Randomtest using the previous run's settings, to make it easier to repeat Randomtest runs with custom settings.
- By default, each Randomtest run that captures output saves it to a unique document. A new setting lets you save results to the same document so it's easier to make changes to your game, re-run Randomtest, and immediately see the results.

### Fixed

- `modulo` is now correctly identified as a numeric operator.
- In an `#option` line with a `*hide_reuse` (or similar reuse variable) and an `*if` statement that references a variable, that reference is no longer mis-located.
- A plain `*if` with no condition in front of a `#option` no longer causes an unhandled parsing error.
- Multireplaces that lack a space between variable and the first option like `@{var"one"|"two"}` are now reported as an error.
- Fixed syntax highlighting to properly color comments, commands, and other similar items inside italic or bold markup.
- Improved Quicktest error message handling to properly identify what file the error occurred in.

## [2.2.0] - 2021-06-12

### Added

- To support [workspace trust](https://code.visualstudio.com/docs/editor/workspace-trust), the extension disables running, quicktesting, or randomtesting games in workspaces you haven't marked as trusted.

### Fixed

- No longer incorrectly flags multireplaces like `@{var dashed-word adjective|}` as potentially missing parentheses.

## [2.1.0] - 2021-04-25

### Changed

- When running Quicktest or Randomtest, all open files are saved so that your latest code is used.
- Better error messages for using negative numbers in comparisons (like `*if var < -2`), which aren't allowed.

### Fixed

- Operators no longer get syntax highlighting in non-code lines. (courtesy Dan Spinola)
- Variables that don't start with a letter, like `_var`, are now reported as an error.
- Error annotations are now removed when a new Quicktest or Randomtest is run.
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
