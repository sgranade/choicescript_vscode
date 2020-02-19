# TODO

- Add user-settable options for warnings
- Warn about use of ${} in expressions where it isn't allowed
- "@{fake_var }" should trigger a problem with "fake_var" even though the multireplace isn't complete.
- *selectable_if can be combined with *hide_reuse, *disable_reuse or *allow_reuse
- In findDefinition() in searches.ts (and maybe elsewhere), we determine if a variable is global by if it is in startup.txt. That won't work with *temp vars defined in startup.txt. Fix that!
- Make tokenizeMultireplace work like Expression
