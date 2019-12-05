# ChoiceScript VSCode README

This is a syntax highlighter extension for the interactive fiction/multiple choice language, ChoiceScript.

## Features

* Syntax highlighting for ChoiceScript, including variables, commands, comments, etc.

## Requirements

None as of now, though as this extension only adds syntax highlighting, you will need to set up the ChoiceScript project structure yourself.

As of now, it defaults to any file with a txt extension. However, as the commands are very specific to ChoiceScript, it isn't likely this will highlight anything in a non-ChoiceScript file! That is, unless, you write crazy things like *comment in your text files...

### More info:

[ChoiceScript Home](https://www.choiceofgames.com/make-your-own-games/choicescript-intro/)

Initial syntax highlighting based off of the tmLanguage files here: [github](https://github.com/cerey/choicescript)


## Extension Settings

None yet.

## Known Issues

None(?) yet.

## Release Notes

## [0.0.1 - 0.0.2]
### Intial release and minor icon tweaks
Basic syntax highlighting.

## [0.0.3]
### Minor changes to extra files, including changelog

## [0.0.4]
### Fixes thanks to Stephen Granade
- Now highlights *stat_chart (regex typo on my part), *bug, and *redirect_scene.
- No longer highlights text between two or more ${variables}.
- Recognizes the new variable format that drops the $ symbol, {variable}.
- Correctly highlights uppercase variable syntax of $!{variable}, $!!{variable}, !{variable}, and !!{variable}.
- An initial multireplace highlight. It's a greedy highlight and I will break it down so it doesn't highlight the entire line in one color later (as in the variables will stand out versus the multireplace text), but for now it will at least show a multireplace text exists and stands out from other commands.

## [0.0.5]
### Additional keywords added