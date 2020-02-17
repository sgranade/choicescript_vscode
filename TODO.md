# TODO

- *params aren't handled properly: having multiple *params in different labels with the same name overwrite each other
- Add user-settable options for warnings
- Warn about use of ${} in expressions where it isn't allowed
- Flag chained and/or operators as an error
- TODO should be highlighted in all cases
- Collapse on choices, labels/returns?
- "@{fake_var }" should trigger a problem with "fake_var" even though the multireplace isn't complete.
- Add warning for things like @{var > 50 stuff|other stuff} (i.e. if you have an operator in the first part of a multireplace)
- Fix syntax highlighting of *if (condition)  # choice
- Flag "*if not(condition) #choice" as a warning since it should be *if (not(condition)) when the *if isn't on a line of its own
- *selectable_if can be combined with *hide_reuse, *disable_reuse or *allow_reuse

- Adjust parseReplacement and parseMultireplacement and parseParentheses to return the new LOCAL index. Then update parseString not to use newGlobalIndex but newLocalIndex instead. Also remove the commented-out section in parseString()
- Make tokenizeMultireplace work like Expression