# TODO

- Investigate outlining if blocks in the outline
- Error on mixed tabs and spaces
- Flag as error extra words after a *command that doesn't allow extra words- *if (party_number = 1): gives me two errors: unknown operator and incomplete expression
- Flag a missing line in an *if/*elseif/*else block (must have at least one line)
- Add user-settable options for warnings
- Investigate incorporating a spelling plugin?
- Investigate syntax highlighting from the plugin itself
- Don't use the Variable token type to indicate "I don't know this token's contents"
- Warn about use of ${} in expressions where it isn't allowed
- "@{fake_var }" should trigger a problem with "fake_var" even though the multireplace isn't complete.
- *selectable_if can be combined with *hide_reuse, *disable_reuse or *allow_reuse
- In findDefinition() in searches.ts (and maybe elsewhere), we determine if a variable is global by if it is in startup.txt. That won't work with *temp vars defined in startup.txt. Fix that!
- [cannot reproduce] Line 2922 of 1_arrival.txt: Couldn't find the definition for working_with_e!!! And trying to go to party_number led me back to working_with_e. Going to the symbol through ctrl+shift+O works, though.

