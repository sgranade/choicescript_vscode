# TODO

- In a choice, `*if variable #This choice has a period. Then it keeps going` doesn't parse right?
- We need to flag a label with extra stuff: "*label this is not valid"
- Add user-settable options for warnings
- Investigate syntax highlighting from the plugin itself
- Don't use the Variable token type to indicate "I don't know this token's contents"
- Warn about use of ${} in expressions where it isn't allowed
- "@{fake_var }" should trigger a problem with "fake_var" even though the multireplace isn't complete.
