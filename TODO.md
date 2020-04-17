# TODO

- Investigate outlining if blocks in the outline
- Make sure it handles the following:
    *if (this_thing)
        *allow_reuse *selectable_if (if_condition) #Choice.
            Inside the choice.
- Error on mixed tabs and spaces
- Flag a missing line in an *if/*elseif/*else block (must have at least one line)
- Add user-settable options for warnings
- Investigate syntax highlighting from the plugin itself
- Don't use the Variable token type to indicate "I don't know this token's contents"
- Warn about use of ${} in expressions where it isn't allowed
- "@{fake_var }" should trigger a problem with "fake_var" even though the multireplace isn't complete.
- *selectable_if can be combined with *hide_reuse, *disable_reuse or *allow_reuse
  - In fact, follow the info at https://forum.choiceofgames.com/t/join-commands-if-and-selectable-if-and-allow-reuse/675/30 to fix this
