# ChoiceScript VS Code

[![Build Status](https://travis-ci.com/sgranade/choicescript_vscode.svg?branch=master)](https://travis-ci.com/sgranade/choicescript_vscode.svg?branch=master)

A plugin for VS Code for [ChoiceScript](https://github.com/dfabulich/choicescript/), a language for writing choose-your-own-path text games.

## Features

- Autocomplete
- Syntax highlighting
- Error highlighting
- Go to definition
- Highlight usage
- Rename variables project-wide
- Snippets to match Choice of Games style rules
- Italicizing and bolding text

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
- Variables are not identified in stat charts

## Release Notes

### [1.0.0]

Created a language server for ChoiceScript, which provides the following features:

- IntelliSense automatic code completion for ChoiceScript commands like `*choice`
- Diagnostics to highlight errors
- Variable name changes project-wide
- Auto-indention after commands that require it, like `*choice` and `*if`
- Snippets to turn ... into an ellipsis and -- into an em-dash to match Choice of Games typography
