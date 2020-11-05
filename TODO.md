# TODO

- In a choice, `*if variable #This choice has a period. Then it keeps going` doesn't parse right? Needs more investigation
- Warn on a param variable that has the same name as any other variable in the workspace! (temp or create)
- Doesn't look like it's warning if you create a temp variable twice. Add that.
- Increasing indents are an error. (extra space in front of any line)
- Add user-settable options for warnings
- Investigate syntax highlighting from the plugin itself
- Don't use the Variable token type to indicate "I don't know this token's contents"
- Warn about use of ${} in expressions where it isn't allowed
