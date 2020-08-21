# TODO

- In a choice, `*if variable #This choice has a period. Then it keeps going` doesn't parse right? Needs more investigation
- Weird syntax highlighting for @{((how_attempted_freedom_e = 8) and broke_free_from_pattern) , and shares a conspiratorial look with you|}
- Tab completion isn't working like it should in a multicomplete like "@{fake_}" or "@{fake_"
- "@{fake_var }" should trigger a problem with "fake_var" even though the multireplace isn't complete.
- Add user-settable options for warnings
- Investigate syntax highlighting from the plugin itself
- Don't use the Variable token type to indicate "I don't know this token's contents"
- Warn about use of ${} in expressions where it isn't allowed
