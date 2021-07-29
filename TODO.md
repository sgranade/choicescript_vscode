# TODO

- A way to highlight variables or labels you aren't using
- A way to find variables hiding in "strings".
- `[i]Italics or @{true [/i]not.|more italics[/i]}` gives borked italicizing in VS Code.
- When running randomtest, if you change the values, remember those for the session.
- Capture warnings that quicktest or randomtest output? (Like defining a `*temp` variable w/the same name as a global.)
- In a choice, `*if variable #This choice has a period. Then it keeps going` doesn't parse right? Needs more investigation
- Increasing indents are an error. (extra space in front of any line)
- Don't use the Variable token type to indicate "I don't know this token's contents"
- Warn about use of ${} in expressions where it isn't allowed