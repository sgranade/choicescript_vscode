# TODO

## Features

- `$${var}` doesn't show the leading dollar sign when run.
- A way to highlight variables or labels you aren't using
- A way to find variables hiding in "strings".
- Update `.gitignore` to ignore game stats `.csv` files.
- `*if (var = 1)) #choice` (note the extra end parens) produce, like, three errors (Unknown operator, Incomplete expression, Arguments to an *if before an #option must be in parentheses). Those aren't really correct.
- `[i]Italics or @{true [/i]not.|more italics[/i]}` gives borked italicizing in VS Code.
- Here's something weird: change the name of one variable to the name of an already-existing variable. Then, with the cursor still on the original variable, search for references. The reference search finds nothing. Huh.
- Capture warnings that quicktest or randomtest output? (Like defining a `*temp` variable w/the same name as a global.)
- In a choice, `*if variable #This choice has a period. Then it keeps going` doesn't parse right? Needs more investigation
- Increasing indents are an error. (extra space in front of any line)
- Don't use the Variable token type to indicate "I don't know this token's contents"
- Warn about use of ${} in expressions where it isn't allowed

## Infrastructure

- Node 22 build task is failing.
- `chai` v5+ is ESM-only, which doesn't play nice with VS Code extensions. See [this discussion](https://github.com/chaijs/chai/issues/1568) for more info. Once we can handle ESM in VS Code extensions, upgrade to `chai` v5.
- Other ESM-only libraries: `date-fns`, `eslint`, `nyc`, `uuid`