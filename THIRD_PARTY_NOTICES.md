# Third-Party Notices — Z-MUSIC v2 Player

This document lists the copyright and license terms of every component
bundled in the VSIX or acquired at runtime. Provided so the extension
satisfies each upstream's attribution requirement and so downstream
users can trace the licensing situation independently.

## Summary

| Component | License | How it's delivered |
| --- | --- | --- |
| **This extension** (source in [src/](src/), [media/](media/)) | GPL v2 or later | Bundled in VSIX |
| **abcjs** — sheet-music renderer | MIT | Bundled ([media/abcjs-basic-min.js](media/abcjs-basic-min.js)) |
| **iconv-lite** — SJIS conversion | MIT | Bundled (npm dependency) |
| **z-music.js** — WASM Z-MUSIC system | BSD 3-Clause | Bundled ([media/player/zmusic.js](media/player/zmusic.js) + `.wasm`) |
| **X68Sound** — FM/ADPCM emulator | Permissive (upstream statement below) | Statically linked inside `zmusic.wasm` |
| **run68 / run68as** — 68000 emulator | **GPL v2** | Statically linked inside `zmusic.wasm` |
| **ZMUSIC.X v2.08** — original driver | Licence rights waived by the author (details below) | Not bundled; fetched at first launch with user consent |

## Why the VSIX is GPL v2 or later

`media/player/zmusic.wasm` is produced by compiling `run68` (GPL v2)
together with `X68Sound` (permissive) and the `z-music.js` C++ wrapper
(BSD-3) through Emscripten into a single WebAssembly binary. The
resulting WASM statically links `run68`, so the VSIX that bundles it is
a derivative work of a GPL v2 program and must be distributed under
GPL v2 or a later version as a whole.

- [LICENSE](LICENSE) applies to the extension source and the combined
  VSIX distribution.
- [docs/GPL-2.txt](docs/GPL-2.txt) is the full text of GNU General
  Public License version 2, bundled to satisfy the "must include a
  copy of this License" clause.
- Corresponding source code required by GPL v2 §3(a) is hosted at
  the [GitHub repository](https://github.com/rtanote/vscode-zms)
  linked from [package.json](package.json).

MIT and BSD-3 licenses of the other bundled components are compatible
with GPL v2 (upstream files retain their original headers).

## Component details

### This extension

Copyright (C) 2026 TAGAYA Ryo

Licensed under the **GNU General Public License version 2 or later**.
See [LICENSE](LICENSE) for the exact terms.

### abcjs

Copyright © 2009-2026 Paul Rosen and Gregory Dyke

MIT License. Bundled as `media/abcjs-basic-min.js` (v6.7.1), a verbatim
copy of the package's `dist/abcjs-basic-min.js`. The npm entry is a dev
dependency only, since `vsce` bundles production dependencies alone and a
webview can load only files inside the extension.
Upstream: <https://github.com/paulrosen/abcjs>

### iconv-lite

Copyright (c) 2011 Alexander Shtuchkin

MIT License. Bundled as an npm production dependency.
Upstream: <https://github.com/ashtuchkin/iconv-lite>

### z-music.js

Copyright (c) 2016 Takashi Toyoshima

BSD 3-Clause License. Full text: `third_party/z-music.js/LICENSE`

This extension uses a fork with local patches applied through
[scripts/build-zmusic.sh](scripts/build-zmusic.sh); the patches are
kept in [patches/z-music.js/](patches/z-music.js/) for reference and
reproducibility. Notable modifications:

- Registers `zmusic_get_areg` / `zmusic_get_dreg` for the trace-loop
  read paths.
- Removes `--embed-file` so the ZMUSIC.X driver can be loaded at
  runtime instead of being frozen into the WASM binary.
- Adds `peek`, `peekBytes`, `areg`, `dreg`, `onMessage`,
  `setFileOpenCallback`, split `compile()` / `start()`, and
  `update()` to the public JS surface.
- Adjusts the Makefile for Emscripten 3.1.60+ (turns off the K&R,
  SJIS-string and int-conversion errors that later clang treats as
  hard failures).

### X68Sound

Original author: m_puusan · Additional maintenance: rururutan and
others. Upstream: <https://github.com/rururutan/X68Sound>

The upstream readme grants:

> 本ソースの改変および改変物の公開、自作ソフト等への組み込みおよびそのソフトの
> 配布は自由です。m_puusanへの報告は必要ありません。
> 本ソフトウェアの使用または使用不能から生じるいかなる損害(…)に関する
> m_puusanは一切責任を負わない。

(Free to modify, redistribute, embed in your own software and
redistribute that software. No notification to m_puusan required.
Warranty disclaimed.)

Effectively equivalent to an MIT-style permissive license; compatible
with BSD-3 and with GPL v2 or later.

### run68 / run68as

Original run68: Yokko. GNU General Public License version 2.

- run68: <https://github.com/rururutan/run68>
- Emscripten-oriented fork run68as: <https://github.com/toyoshim/run68as>

The full GPL v2 text is included at
[docs/GPL-2.txt](docs/GPL-2.txt). Source availability required by
GPL v2 §3(a) is provided through the repository URL above (the
z-music.js submodule points to the fork used at build time).

### ZMUSIC.X

Copyright © Z.Nishikawa / Z-MUSIC SYSTEM. **All licence rights have
been waived by the original author.** The manuals shipped with
Z-MUSIC state so directly.

From `ZM1.MAN` (common to v2 and v3 manuals):

> 法律上、日本では著作権の放棄ができませんので、著作権は作者西川善司に保留されます。
> しかし、プログラムの性質上、「ＺＭＵＳＩＣ．Ｘ」のオリジナルを開発した私西川善司は
> 「ＺＭＵＳＩＣ．Ｘ」及びこれらを支援するプログラム(サブルーチンを含む)全ての
> 使用権に関するライセンス権を放棄します。よってとくに断わらずに商的利用が出来ます。

(Because Japanese law does not permit an author to abandon copyright
itself, copyright remains with Nishikawa. However, given the nature
of the program, he waives all licence rights over ZMUSIC.X and its
supporting programs. Commercial use is therefore permitted without
seeking permission.)

From `ZMVER_UP.DOC` bundled with the v2.08 archive (signed 西川善司):

> 本アーカイブに含まれるZMUSIC.Xおよびその関連ファイルの転載／配布は自由に行って
> 構いません。特に報告もいりません。またライセンスを放棄していますのでプログラムの
> 全部、または一部を使用したものを販売しても結構です。改造に関しても自由としますが、
> そういった特殊バージョンは個人的な使用、または内輪の使用にとどめて下さい。
> ディスクマガジンなどのメディアへの使用も歓迎いたします。

(Redistribution and further distribution of ZMUSIC.X and its
associated files inside this archive is free. No notification
required. Sale of software that uses the whole or part of it is
permitted because the licence has been waived. Modification is also
free, but publicly distributed modifications should be kept to
personal or private-circle use. Inclusion in media such as disk
magazines is welcomed.)

**Practical implications for this extension:**

1. Copyright attribution `© Z.Nishikawa / Z-MUSIC SYSTEM` is
   retained in the README, the first-launch notification, and this
   document.
2. The extension ships and executes an unmodified `ZMUSIC208.X`
   binary — no modifications are made, so the "keep modifications to
   private-circle use" reservation does not apply.
3. Redistribution, commercial use, and Marketplace distribution are
   permitted without further permission.

**Current runtime handling.** `ZMUSIC208.X` is not bundled in the
VSIX at the moment. At first launch, a QuickPick offers the user two
choices:

1. Download from GitHub — the copy hosted in the toyoshim/z-music.js
   repository is fetched, verified with a pinned SHA-256, cached in
   the extension's global storage, and the copyright banner above is
   shown.
2. Pick a local file — the user selects an existing `ZMUSIC.X` on
   their machine.

Override paths are available via the `zmusic.driver.downloadUrl` and
`zmusic.driver.path` settings.

**Prior art operating under the same licence text:**

- kg68k/zmusic2 (<https://github.com/kg68k/zmusic2>) redistributes
  the v2 manual set citing the same clause.
- kg68k/zmusic3 (<https://github.com/kg68k/zmusic3>) does the same
  for v3.
- Community-modified builds such as MZL's v2.08e and 鷹之人's
  v2.09+01 also inherit the original author's stance.
