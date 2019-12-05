# Change Log
All notable changes to the "cs" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

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