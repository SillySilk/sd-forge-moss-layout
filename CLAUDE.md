# MOSS Layout: working notes

This folder is part of a **public** repo. Before anything here is committed, pushed,
screenshotted or written up, check it for personal material.

## Public vs personal: always check

The owner uses this extension for personal prompts and keeps a personal character roster.
None of that belongs in public. On every change, check:

- **Screenshots and GIFs:** the Characters file dropdown must show `examples.jbcast`, and the
  editor must show an example character. Captions, Summary, Meta and Extra must hold neutral
  sample text written for the shot, never a prompt that was already on the page. Look at the
  finished image before saving it. An open dropdown lists every personal file name, so keep
  dropdowns closed in shots.
- **Example data:** `characters/examples.jbcast` holds made-up, neutral characters only (marked
  `"example": true`). Never copy a personal character into it.
- **Commits:** `git diff --cached --stat` before committing. A personal `.jbcast`, a saved
  layout, an exported prompt JSON or a test image must never be staged. Every `.jbcast` except
  `examples.jbcast` is gitignored; keep it that way.
- **Tests and docs:** sample prompts, character names and descriptions in tests, README,
  CHANGELOG and commit messages are generic and made up.
- **Upstream PRs and forum posts:** same rules. They are public too.

If something personal has already gone public, stop and tell the owner. Don't quietly rewrite history.

## Where things are

- `scripts/moss_layout.py`: the tab (`MOSS Layout`, DOM id `tab_moss-layout`) and the character routes `/moss_layout/characters/*`.
- `lib_moss_layout/characters.py`: the `.jbcast` store.
- `lib_moss_layout/scenes.py`: Save JSON / Load JSON read and write `JSONscenes/` (subfolders allowed, routes `/moss_layout/scenes/*`). The folder is gitignored (saved layouts are personal) except `JSONscenes/Templates/`, the panel templates, which ship; regenerate them with `python tools/make_panel_templates.py`, never by hand, and keep them free of personal content. Load JSON opens the real Windows Open dialog through `/moss_layout/scenes/pick`, which runs Tk's `askopenfilename` in a child process (Tk must own its thread) starting in `JSONscenes/` or the last scene's subfolder. The dialog shows on the PC running Forge, so it only suits local use.
- `javascript/main.js`: the whole UI; helpers in `editing.js`, `fields.js`, `characters.js`; `compile.js` / `decompile.js` turn a layout into the MOSS prompt and back.
- Every name is prefixed `ml` / `ml-` (CSS classes, `--ml-*` variables, localStorage keys, JS globals) so this runs beside Forge Neo's stock JSON Builder (`jb-`, `compilePrompt`). Keep new names prefixed.
- Fork-only hooks must stay optional: `window.forgeCanvasInstances`, `#txt2img_lora_folder_select`.
- `.ml-root button` outranks a bare `.ml-…` button class; scope new button rules under `.ml-root`.
- Forge links each extension's CSS/JS with the file's mtime from startup: after an edit, restart or hard-refresh (Ctrl+F5).
- Tests: `node tests/test_*_js.js` (`test_templates_js.js` loads every panel template), and `tests/test_characters.py` with Forge's venv python.
