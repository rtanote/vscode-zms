# vscode-zms アーキテクチャ / ファイル役割一覧

コードレビューのための成果物マップ。ディレクトリ・ファイル単位で「何を
担当しているか」を一覧化した。深堀りしたい部分は末尾の
[レビュー推奨順序](#レビューの推奨順序) 参照。

## 目次

- [リポジトリトップレベル](#リポジトリトップレベル)
- [docs/](#docs)
- [src/ — 拡張ホスト (Node.js / TypeScript)](#src--拡張ホスト-nodejs--typescript)
  - [エントリ・言語機能](#エントリ言語機能)
  - [エディタ装飾 (色ルール)](#エディタ装飾-色ルール)
  - [譜面プレビュー](#譜面プレビュー)
- [src/player/ — 再生サブシステム](#srcplayer--再生サブシステム)
  - [ZMD (バイナリ) 解析](#zmd-バイナリ-解析)
  - [ZMS (テキスト) 解析](#zms-テキスト-解析)
- [media/ — Webview アセット (VSIX 同梱)](#media--webview-アセット-vsix-同梱)
- [test/ — 単体テスト (node:test)](#test--単体テスト-nodetest)
- [patches/ + third_party/ (VSIX 除外)](#patches--third_party-vsix-除外)
- [scripts/ + resources/](#scripts--resources)
- [test-fixtures/ + test-local/ + docs-local/ (VSIX 除外)](#test-fixtures--test-local--docs-local-vsix-除外)
- [CI](#ci)
- [レビューの推奨順序](#レビューの推奨順序)
- [注意ポイント (非自明な落とし穴)](#注意ポイント-非自明な落とし穴)

## リポジトリトップレベル

| ファイル/ディレクトリ | 役割 |
|---|---|
| [package.json](../package.json) | 拡張定義。commands / keybindings / settings / snippets / language / Marketplace metadata |
| [tsconfig.json](../tsconfig.json) | TypeScript 設定。`rootDir: "."` で src/ 構造を維持 |
| [LICENSE](../LICENSE) | GPL v2 or later (run68 の派生物として) |
| [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) | 同梱コンポーネントのライセンス整理 |
| [README.md](../README.md) | ユーザー向けドキュメント |
| [CHANGELOG.md](../CHANGELOG.md) | リリースノート |
| [CLAUDE.md](../CLAUDE.md) | Claude Code 用ハンドオフメモ (人間が読んでも有用) |
| [language-configuration.json](../language-configuration.json) | zms 言語の brackets / autoClosingPairs / コメント |
| [.vscodeignore](../.vscodeignore) | VSIX 除外設定 (test-local/, test-fixtures/, src/ 等) |
| [.gitignore](../.gitignore) | git 除外 (test-local, docs-local, out/ 等) |

## docs/

| ファイル | 役割 |
|---|---|
| [docs/GPL-2.txt](GPL-2.txt) | GPL v2 全文 (VSIX 同梱の唯一 docs/ ファイル) |
| [docs/ZMUSIC_X_RIGHTS.md](ZMUSIC_X_RIGHTS.md) | 権利者打診の準備文書 |
| [docs/V3_SUPPORT.md](V3_SUPPORT.md) | V3 対応方針決定 |
| [docs/ARCHITECTURE.md](ARCHITECTURE.md) | (本ファイル) 成果物マップ |
| [docs/reference/zm04〜zm13.txt](reference/) | Z-MUSIC v2 マニュアル (UTF-8 化済み) |
| [docs/screenshots/](screenshots/) | Marketplace 用スクショ + hero-template.html |
| [.docs/zmusic-vscode-player-spec.md](../.docs/zmusic-vscode-player-spec.md) | 一次仕様書 (KIRO 形式、公開しない) |

## src/ — 拡張ホスト (Node.js / TypeScript)

### エントリ・言語機能

| ファイル | 役割 |
|---|---|
| [src/extension.ts](../src/extension.ts) | activate() 本体。全 provider / controller / decorator の登録 |
| [src/hoverProvider.ts](../src/hoverProvider.ts) | ホバーで MML コマンド説明を出す |
| [src/completionProvider.ts](../src/completionProvider.ts) | `@` `(` `.` `[` トリガの補完 |
| [src/commandReference.ts](../src/commandReference.ts) | @/(/./[ 各コマンド辞書 (完成品) |
| [src/diagnosticProvider.ts](../src/diagnosticProvider.ts) | zms-lint (静的リント + 音色定義 55/56 検証)。V2_RULES / V3_RULES |
| [src/versionDetection.ts](../src/versionDetection.ts) | v2/v3 判定 (magic comment / 設定 / 既定 v2) |
| [src/copilotSetup.ts](../src/copilotSetup.ts) | Setup Copilot Instructions コマンド + 初回オープン通知 |

### エディタ装飾 (色ルール)

| ファイル | 役割 |
|---|---|
| [src/trackPrefixDecorator.ts](../src/trackPrefixDecorator.ts) | `(t1)` トラック prefix をパレット色で表示 |
| [src/flowControlDecorator.ts](../src/flowControlDecorator.ts) | `[Coda]` `\|:n` `:\|` `\|` を黄緑 + bold |
| [src/octaveDecorator.ts](../src/octaveDecorator.ts) | `o5` `<` `>` を青 (`#3F51FF`) |
| [src/panpotDecorator.ts](../src/panpotDecorator.ts) | `p0..p3` `@p0..@p127` を黄 (`#FFD700`) |

### 譜面プレビュー

| ファイル | 役割 |
|---|---|
| [src/mmlToAbc.ts](../src/mmlToAbc.ts) | MML → abcjs 記法変換 |
| [src/sheetMusicPanel.ts](../src/sheetMusicPanel.ts) | Show Sheet Music コマンドの WebviewPanel + playhead |

## src/player/ — 再生サブシステム

| ファイル | 役割 |
|---|---|
| [src/player/PlayerController.ts](../src/player/PlayerController.ts) | 状態機械 (idle→compiling→playing)、SJIS変換、SourceMap 構築、Solo/Mute 永続化。**中核** (~700 行) |
| [src/player/PlayerViewProvider.ts](../src/player/PlayerViewProvider.ts) | パネル領域の "Z-MUSIC Player" WebviewView。CSP + localResourceRoots 制限 |
| [src/player/protocol.ts](../src/player/protocol.ts) | Host ↔ Webview メッセージ型 (compile / start / position / lineMap / trackColors / soloMuteChanged 等) |
| [src/player/DriverManager.ts](../src/player/DriverManager.ts) | ZMUSIC.X の QuickPick 取得 + SHA-256 検証 + globalStorage キャッシュ |
| [src/player/Diagnostics.ts](../src/player/Diagnostics.ts) | Compile エラーの Problems パネル反映 (`zmusic` collection) |
| [src/player/Tracer.ts](../src/player/Tracer.ts) | 8 色 TextEditorDecoration、30Hz 反映、編集で自動停止 |

### ZMD (バイナリ) 解析

| ファイル | 役割 |
|---|---|
| [src/player/zmd/ZmdOpcodes.ts](../src/player/zmd/ZmdOpcodes.ts) | zm12 §12.4 全 opcode 表 (`$EA`/`$EC` 可変長) |
| [src/player/zmd/ZmdDisassembler.ts](../src/player/zmd/ZmdDisassembler.ts) | ZMD バイト列 → コマンド列。`$FF` 終端検出 |
| [src/player/zmd/SourceMap.ts](../src/player/zmd/SourceMap.ts) | ZMD ↔ ZMS 整列 (exact / lineApprox) + 二分探索 lookup |

### ZMS (テキスト) 解析

| ファイル | 役割 |
|---|---|
| [src/player/zms/ZmsParser.ts](../src/player/zms/ZmsParser.ts) | ZMS → 時間消費トークン列。`&` `^` chord porta `@w` `*n` `!` 対応 |

## media/ — Webview アセット (VSIX 同梱)

| ファイル | 役割 |
|---|---|
| [media/abcjs-basic-min.js](../media/abcjs-basic-min.js) | abcjs (譜面レンダリング、MIT) |
| [media/player/player.html](../media/player/player.html) | Player Webview の骨組み |
| [media/player/player.css](../media/player/player.css) | Player のスタイル (grid, keyboard SVG, S/M ボタン等) |
| [media/player/player.js](../media/player/player.js) | Player Webview の JS 本体。WASM 初期化、30Hz サンプリング、鍵盤ビジュアライザ描画 |
| [media/player/zmusic.js](../media/player/zmusic.js) | z-music.js WASM ローダ (CI 生成) |
| [media/player/zmusic.wasm](../media/player/zmusic.wasm) | run68 + X68Sound + ZMUSIC ラッパの WASM (CI 生成、~2 MB) |

## test/ — 単体テスト (node:test)

| ファイル | 役割 |
|---|---|
| [test/vscode-mock.js](../test/vscode-mock.js) | vscode API モック (Range / Position のみ) |
| [test/mockDoc.ts](../test/mockDoc.ts) | TextDocument スタブ |
| [test/setup.js](../test/setup.js) | node:test の前処理 |
| test/unit/*.test.ts | 各機能の単体テスト (79 tests) |

## patches/ + third_party/ (VSIX 除外)

| ディレクトリ | 役割 |
|---|---|
| [patches/z-music.js/](../patches/z-music.js/) | 上流 z-music.js への差分パッチ (01 = regs + runtime driver + Makefile fixes / 02 = public API 追加) |
| [third_party/z-music.js/](../third_party/z-music.js/) | submodule。上流 `toyoshim/z-music.js` @ fd6ad1c |

## scripts/ + resources/

| ファイル | 役割 |
|---|---|
| [scripts/build-zmusic.sh](../scripts/build-zmusic.sh) | Docker (emscripten/emsdk:3.1.61) で WASM を焼く |
| [scripts/rasterize-icon.sh](../scripts/rasterize-icon.sh) | icon.svg → icon.png (rsvg-convert / inkscape / magick 自動選択) |
| [scripts/capture-hero.sh](../scripts/capture-hero.sh) | hero-template.html → hero.png (headless Chrome) |
| [resources/icon.svg](../resources/icon.svg) | Marketplace アイコンのデザインソース |
| [resources/icon.png](../resources/icon.png) | 128×128 PNG (VSIX に含まれる唯一の resources) |
| [resources/copilot-instructions.md](../resources/copilot-instructions.md) | Setup Copilot コマンドで workspace に配置するテンプレ (drift 検知テスト付き) |

## test-fixtures/ + test-local/ + docs-local/ (VSIX 除外)

| ディレクトリ | 役割 |
|---|---|
| [test-fixtures/hello.zms](../test-fixtures/hello.zms) | 動作確認用の 3-track サンプル |
| [test-fixtures/voices.zms](../test-fixtures/voices.zms) | 音色定義サンプル (Copilot workspace search 用) |
| [test-fixtures/ascii-min.zms](../test-fixtures/ascii-min.zms) | 極小 ASCII サンプル |
| [test-fixtures/minimal.zms](../test-fixtures/minimal.zms) | バイセクト用最小サンプル |
| test-local/ | ユーザ個人テスト用 (.gitignore) |
| docs-local/ | V3 マニュアル等の参考資料 (© Z.Nishikawa、.gitignore) |

## CI

| ファイル | 役割 |
|---|---|
| [.github/workflows/build-wasm.yml](../.github/workflows/build-wasm.yml) | WASM の週次 + 手動再ビルド |
| [.github/copilot-instructions.md](../.github/copilot-instructions.md) | 本リポで Copilot が Z-MUSIC v2 の書式を守るよう指示 (Marketplace 版は Setup コマンドで workspace に別途配置) |

---

## レビューの推奨順序

**まず全体像を掴むなら**:

1. [CLAUDE.md](../CLAUDE.md) → [package.json](../package.json) → [.docs/zmusic-vscode-player-spec.md](../.docs/zmusic-vscode-player-spec.md) の順に読む
2. [src/extension.ts](../src/extension.ts) で登録している provider / controller を全体マップ

**再生の核を追うなら**:

1. [src/player/PlayerController.ts](../src/player/PlayerController.ts) の `play()` メソッド → SJIS 変換 → webview に `compile` メッセージ送信
2. [media/player/player.js](../media/player/player.js) の `handleCompile` → `collectTracks()` (peekBytesSafe の理由)
3. [src/player/zmd/ZmdDisassembler.ts](../src/player/zmd/ZmdDisassembler.ts) + [SourceMap.ts](../src/player/zmd/SourceMap.ts) で整列

**カラーリング系を追うなら**:

1. [syntaxes/zms.tmLanguage.json](../syntaxes/zms.tmLanguage.json) の scope 定義
2. `src/*Decorator.ts` 4 本の TextEditorDecorationType

## 注意ポイント (非自明な落とし穴)

CLAUDE.md にも記載している非自明な仕様:

- **`ZMUSIC.peekBytes` 使用禁止** — 上流 prolog.js は
  `Module.HEAPU8.subarray(addr, addr+len)` を返すが、これは 68k アドレスを
  WASM ヒープオフセットとして直に読んでしまい prog_ptr オフセット越しの
  正しい 68k アドレスに翻訳しない。代わりに `ZMUSIC.peek(addr+i, 0)` を
  byte-by-byte でループする ([media/player/player.js](../media/player/player.js)
  の `peekBytesSafe` 参照)
- **ZMD の `$FF` 終端は naive scan 禁止** — `$FF` は他 opcode のパラメータ
  (step count 255、note number、`$E6` 系の内部データ等) にも普通に出現する。
  opcode 長を知っている `ZmdDisassembler` だけが正しく track_end を判定できる
- **SJIS + CRLF 正規化必須** — VS Code 側は UTF-8 で扱うが、ドライバに渡す時は
  `iconv-lite` で SJIS 化 + CRLF 化する
  ([PlayerController#play](../src/player/PlayerController.ts) 参照)
- **上流 z-music.js の Makefile / src/*.{js,cpp} は CRLF** — こちらのパッチは
  LF なので `git apply` が silent reject する。ビルドスクリプト側で
  `tr -d '\r'` してから apply する ([scripts/build-zmusic.sh](../scripts/build-zmusic.sh))
- **emsdk 3.1.60+ の clang は K&R / SJIS 文字列 / int-conversion を hard error 扱い** —
  Makefile パッチで `-Wno-error=...` を並べて回避
  ([patches/z-music.js/01-*.patch](../patches/z-music.js/01-export-regs-runtime-driver.patch))
- **上流の `make all` は asm.js も焼く**が `--memory-init-file` が廃止済でエラー。
  `make zmusic.js` に限定してある
- **DiagnosticCollection 名は 2 つ** — 静的リント側 `zms-lint`
  ([diagnosticProvider.ts](../src/diagnosticProvider.ts)) と、Compile エラー用
  `zmusic` ([Diagnostics.ts](../src/player/Diagnostics.ts))。混同禁物
- **`main` は `./out/src/extension.js`** — tsc の `rootDir: "."` で src/ を
  保持するため。test/ を tsc の `include` に入れているのでこの構造
- **ZMS で音を出すには `@n` (音色指定) が必要** — `@1` は ZMUSIC.X 内蔵の
  ピアノ相当。`@n` なしだと ZMD には note command は生成されるが FM が
  無音波形で発音するため聞こえない
- **Z-MUSIC v2 のオクターブ記号は業界標準と逆** (zm05 L201): `<` = octave +1
  (UP), `>` = octave -1 (DOWN)
- **最小 ZMS の必須要素** — `(I)` 初期化 → `(m1,3000)` バッファ確保 →
  `(a1,1)` チャンネル割当 → `(t1) @1 ...` 音色付き MML。この 4 段が揃わないと
  発音しない
- **V3 は静的対応のみ** — grammar / lint は動くが、`PlayerController.play()`
  で v3 検出 → 通知 + 中止 (docs/V3_SUPPORT.md 参照)
