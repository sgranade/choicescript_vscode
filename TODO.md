# TODO

- Update `ts-node` to 8.10 when the bug in the Mocha Test Runner extension for VS Code gets ironed out.
- Add user-settable options for warnings
- Investigate syntax highlighting from the plugin itself
- Don't use the Variable token type to indicate "I don't know this token's contents"
- Warn about use of ${} in expressions where it isn't allowed
- "@{fake_var }" should trigger a problem with "fake_var" even though the multireplace isn't complete.
