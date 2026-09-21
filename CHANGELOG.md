# Change Log

All notable changes to the Z-MUSIC v2 Player extension are recorded
here. The format follows [Keep a Changelog](https://keepachangelog.com/)
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0]

Initial public release.

### Editor and language

- Syntax highlighting for `.zms` files (language id `zms`), tuned so
  the eye can separate the different families of MML tokens at a
  glance: notes / rests / dynamics / panpot / octave / flow-control
  each get their own colour, and per-track `(t1)` prefixes take the
  matching track palette.
- Hover reference — hovering over any MML command shows its syntax
  and a short description sourced from the Z-MUSIC manual.
- Static lint (`zms-lint`):
  - Parameter range checks for `V`, `Q`, `L`, `U`, `P`, `K`, `T`, `O`
    and the `@`-family (`@V`, `@U`, `@P`, `@K`, `@B`, `@G`, `@Q`, …).
  - Structural balance checks for `{}`, `[]`, `'…'`, `|:`/`:|`.
  - Voice-definition validator — inspects Form 1 `(V n,0,…)` and
    Form 2 `(@n,…)` FM voice blocks and enforces the 46..56 /
    46..55 parameter counts, catches the Form 1 / Form 2 mash-up
    Copilot and other LLMs tend to emit.
- Code completion + snippets (`zmsinit`, `voice`, `malloc`, `assign`,
  `loop`, `chord`, …). Triggered on `@`, `(`, `.`, `[`.
- Syntax version selector — switches lint rules between v2 and v3
  (v3 currently uses the v2 base range set; v3-specific
  `[KEYWORD arg]` commands are recognised by the grammar).

### Playback

- F5 — compiles the current editor content (unsaved edits included)
  through the bundled Z-MUSIC WASM engine and starts playback. FM
  (OPM 8ch) and ADPCM are audible.
- Shift+F5 — plays from the current cursor position by
  fast-forwarding silently to the corresponding step count.
- F9 — stop. Shift+F9 — fade out.
- Ctrl/Cmd+F5 — toggle the editor-highlight follow-along.
- 30 Hz trace highlight — the currently sounding note in each
  playing track is coloured by track palette in the editor.
- `Dump Compiled ZMD (debug)` command — disassembles the last
  compiled ZMD and prints ZMD-vs-ZMS token deltas per track. Useful
  when the SourceMap falls back to `lineApprox` and the highlight
  jumps by lines instead of notes.

### Player panel

- Panel-area WebviewView with per-track rows.
- Each row shows: current voice `@n`, current volume `vNN`, current
  ZMS line `LNN`, playback state, and a mmdsp-style piano keyboard
  visualiser (MIDI 0..127, fixed proportions) where the actually
  sounding note lights up in the track palette colour.
- S / M buttons per track for solo and mute; per-file persistence
  through workspaceState.
- First-launch driver acquisition via QuickPick (download from
  GitHub with pinned SHA-256 verification, or point at a local
  ZMUSIC.X). Copyright banner shown on first successful load.

### Sheet-music preview

- `Show Sheet Music` command opens an abcjs-rendered notation view.
- The current sounding note is highlighted in the track palette
  colour and follows playback in real time.
- Automatic clef selection based on the melodic centre of the line.

### Copilot integration

- `Setup Copilot Instructions for Z-MUSIC v2` command deploys a
  `.github/copilot-instructions.md` describing Z-MUSIC v2 syntax
  rules (including canonical sine / piano voice-definition
  templates) into the current workspace and updates
  `.vscode/settings.json` to enable Copilot's instruction-file
  awareness.
- The first time a `.zms` file is opened, a subtle notification
  offers to run the command. "Don't show again" is remembered per
  workspace.
- The bundled test fixture `test-fixtures/voices.zms` provides
  ready-to-copy correct voice definitions that Copilot Chat's
  workspace search will find, further reducing hallucinations.

### Localization

- English and Japanese for command titles, settings descriptions,
  QuickPick items, notifications, warnings and lint messages.
- Follows the VS Code UI language automatically.

### Licensing

- Extension distributed under GPL v2 or later, driven by the static
  linkage of run68 (GPL v2) inside the bundled WASM engine.
- Full third-party attribution and licence terms are documented in
  [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- ZMUSIC.X handling: not bundled by default; the extension shows a
  QuickPick on first launch so the user selects between fetching
  the copy from the toyoshim/z-music.js repository (with SHA-256
  verification) or pointing at an existing local file. The
  underlying licence status of ZMUSIC.X is explained in
  [docs/ZMUSIC_X_RIGHTS.md](docs/ZMUSIC_X_RIGHTS.md).
