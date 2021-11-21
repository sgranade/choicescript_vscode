# TODO

- A way to highlight variables or labels you aren't using
- A way to find variables hiding in "strings".
- Autocomplete is being weird about variables with caps in them like "DEBUG_".
- Add Toggle Block Comment support (right now I only do Toggle Line Comment)
- Rename "Rerun randomtest..." to "Run randomtest again..."
- `*if (var = 1)) #choice` (note the extra end parens) produce, like, three errors (Unknown operator, Incomplete expression, Arguments to an *if before an #option must be in parentheses). Those aren't really correct.
- `[i]Italics or @{true [/i]not.|more italics[/i]}` gives borked italicizing in VS Code.
- Capture warnings that quicktest or randomtest output? (Like defining a `*temp` variable w/the same name as a global.)
- In a choice, `*if variable #This choice has a period. Then it keeps going` doesn't parse right? Needs more investigation
- Increasing indents are an error. (extra space in front of any line)
- Don't use the Variable token type to indicate "I don't know this token's contents"
- Warn about use of ${} in expressions where it isn't allowed