# ChoiceScript VS Code

[![Build Status](https://travis-ci.com/sgranade/choicescript_vscode.svg?branch=master)](https://travis-ci.com/sgranade/choicescript_vscode.svg?branch=master)
[![Coverage](https://codecov.io/gh/sgranade/choicescript_vscode/branch/master/graph/badge.svg)](https://codecov.io/gh/sgranade/choicescript_vscode)


A VS Code plugin for [ChoiceScript](https://github.com/dfabulich/choicescript/), a language for writing choose-your-own-path text games.

## Features

- Autocomplete
- Syntax highlighting
- Error highlighting
- Go to definition
- Highlight usage
- Scene outline
- Rename variables project-wide
- Snippets to match Choice of Games style rules
- Italicizing and bolding text
- Word count that counts only what the player will see

## Installation

[Install from the VSCode extension marketplace](https://marketplace.visualstudio.com/items?itemName=StephenGranade.choicescript-vscode).

## Use

Open your ChoiceScript folder, often named `mygame`, and the language server will index the entire project.

Note that, since ChoiceScript files are just text files, the extension treats all `.txt` files as ChoiceScript files. To avoid that, only enable the extension for workspaces that contain your ChoiceScript game.

## Settings

To use the style snippets that turn `...` into an ellipsis and `--` into an em-dash, [enable snippet tab completion](https://code.visualstudio.com/docs/editor/userdefinedsnippets#_creating-your-own-snippets). Then type three periods and hit tab to turn them into an ellipsis.

For writing ChoiceScript games, VS Code's auto-word suggestions can be annoying. To turn it off for ChoiceScript:

- Press `F1` to open the command palette
- Type in `Preferences: Configure Language Specific Settings...` and run that command
- Select "ChoiceScript" from the dropdown
- Add the following text to the `settings.json` file that VS Code opens
```
{
    "[choicescript]": {
        "editor.quickSuggestions": {
            "other": false,
            "comments": false,
            "strings": false
        }
    }
}
```

## Currently Unsupported Features

- [Array notation](https://forum.choiceofgames.com/t/new-choicescript-features-for-programmers/8423). Right now it ignores arrays entirely.

## Release Notes

### [1.5.0]

- Warn when a `*temp` variable has the same name as an earlier-created one.
- `*create`, `*temp`, `*gosub`, and `*gosub_scene` now properly provide variable completions.

### [1.4.3]

- Variable completion now works properly in multireplaces.
- Multireplace error catching improved.
- Multireplace syntax highlighting now properly handles nested parentheses thanks to [a timely mailing list email from 2007](https://lists.macromates.com/textmate/2007-September/022055.html).
- Can you tell I focused on multireplaces this go-round?

### [1.4.2]

- Greatly sped up the extension by refactoring parsing and validation.
- Expression errors inside `*if` blocks and similar are now marked in the proper location.
- Multireplace errors inside `*if` blocks and similar are now marked in the proper location.

### [1.4.1]

- Bug fixes to symbol indexing and syntax highlighting.
- Improved error handling for `*label` and `*if` in front of an `#option`.

### [1.4.0]

- Word counter added that skips code but counts words shown to the reader.
- Improved parsing and error checking of `*choice` and `*if`/`*elseif`/`*else` blocks.

### [1.3.0]

- The document outline now lists all individual options in a choice.

### [1.2.0]

- The document outline lets you see the flow of choices, labels, and variables in your game.
- Expanded error checking in expressions to commands like `*if`.
- Expanded warnings on text that will be ignored.

### [1.1.0]

- Added ability to italicize text using `Ctrl`+`i` or `Ctrl`+`Shift`+`i` and bold text using `Ctrl`+`Shift`+`b`.
- Labels and achievements can now be found and renamed.
- Choices with more than 15 words are now flagged for review.
- Error catching greatly expanded.

### [1.0.0]

Created a language server for ChoiceScript, which provides the following features:

- IntelliSense automatic code completion for ChoiceScript commands like `*choice`
- Diagnostics to highlight errors
- Variable name changes project-wide
- Auto-indention after commands that require it, like `*choice` and `*if`
- Snippets to turn ... into an ellipsis and -- into an em-dash to match Choice of Games typography
