# ChoiceScript VS Code

A plugin for VS Code for [ChoiceScript](https://github.com/dfabulich/choicescript/), a language for writing choose-your-own-path text games.

## Features

* Autocomplete
* Syntax highlighting
* Error highlighting
* Go to definition
* Highlight usage
* Rename variables project-wide
* Snippets to match Choice of Games style rules

## Installation

[Install from the VSCode extension marketplace](https://marketplace.visualstudio.com/items?itemName=KLNeidecker.choicescript-vscode).

## Use

Open your ChoiceScript folder, often named `mygame`, and the language server will index the entire project.

## Settings

To use the style snippets that turn `...` into an ellipsis and `--` into an em-dash, [enable snippet tab completion](https://code.visualstudio.com/docs/editor/userdefinedsnippets#_creating-your-own-snippets). Then type three periods and hit tab to turn them into an ellipsis.

For writing ChoiceScript games, VS Code's auto-word suggestions can be annoying. To turn it off for ChoiceScript:

* Press `F1` to open the command palette
* Type in `Preferences: Configure Language Specific Settings...` and run that command
* Select "ChoiceScript" from the dropdown
* Add the following text to the `settings.json` file that VS Code opens
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

## Release Notes

### [1.0.0]

Created a language server for ChoiceScript, which added the following features:

* IntelliSense automatic code completion for ChoiceScript commands like `*choice`
* Diagnostics to highlight errors
* Variable name changes project-wide
* Auto-indention after commands that require it, like `*choice` and `*if`
* Snippets to turn ... into an ellipsis and -- into an em-dash to match Choice of Games typography

### [0.0.5]

Added additional ChoiceScript keywords.

### [0.0.4]

* Now highlights `*stat_chart` (regex typo on my part), `*bug`, and` *redirect_scene`.
* No longer highlights text between two or more `${variables}`.
* Recognizes the new variable format that drops the `$` symbol, `{variable}`.
* Correctly highlights uppercase variable syntax of `$!{variable}`, `$!!{variable}`, `!{variable}`, and `!!{variable}`.
* An initial multireplace highlight. It's a greedy highlight and I will break it down so it doesn't highlight the entire line in one color later (as in the variables will stand out versus the multireplace text), but for now it will at least show a multireplace text exists and stands out from other commands.

### [0.0.3]

Minor changes to extra files, including changelog.

### [0.0.1 - 0.0.2]

Initial release and minor icon tweaks.

Basic syntax highlighting.