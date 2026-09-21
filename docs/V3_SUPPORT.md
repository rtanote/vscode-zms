# Z-MUSIC v3 (ZMSC3.X) 対応方針

Phase B のうちの一つ、V3 対応方針の決定文書。**現時点 (v1 リリース) は
「文法検知のみ対応、再生は v2 のみ」** とし、V3 での完全再生は Phase 4
(post-1.0) に送る。

## 1. Z-MUSIC v3 とは

- **ZMSC3.X**: 西川善司氏による Z-MUSIC の v3 系ドライバ (v2.08 と別系統)
- **v2 との違い**:
  - ADPCM 8 独立チャンネル対応 (v2 は 1ch)
  - MIDI 制御コマンドの拡張 (@X 系の追加)
  - Roland SC-55 mkII 対応の音源自動切替
  - トラック数の拡張 (v2: 80, v3: ?)
  - 一部 MML 記号の解釈変更
- **配布**: v2 と同様に Vector や X68000 保存アーカイブに歴代版あり

## 2. 現状のスケルトン (v1 の骨組み)

すでに以下が入っている:
- **[src/versionDetection.ts](../src/versionDetection.ts)**: `.zms` の
  version 検出 (magic comment `/ zmusic-version: 3` → 設定 → デフォルト v2)
- **[src/diagnosticProvider.ts](../src/diagnosticProvider.ts)**: `V2_RULES` /
  `V3_RULES` の分岐構造。V3_RULES は現在 **空 = パラメータ範囲チェック無し**
- **`zmusic.syntax.version` 設定**: `"2" | "3" | "auto"` (package.json)
- **ステータスバー**: 現在のバージョン表示 + クリックで切替

## 3. 対応方針の選択肢

### 選択肢 A: 完全 V3 対応 (推奨しない、v1 では)

- **必要作業**:
  - ZMSC3.X の WASM 化 (toyoshim/z-music.js は v2 専用のため fork 拡張が必要)
  - 新しい ZMD opcode 表 (v3 で拡張された部分)
  - ZmsParser の v3 対応 (追加された時間消費コマンド)
  - SourceMap の v3 対応
  - Player Webview の分岐
  - V3 ドライバ取得フロー (ZMUSIC.X の QuickPick に加えて ZMSC3.X 系)
- **工数見積**: 2-4 週間 (WASM ビルド周りが最大の unknown)
- **リスク**: ZMSC3.X のソース入手性、Emscripten でのビルド可否

### 選択肢 B: 静的 V3 対応 (grammar + lint のみ、再生は v2)

- **必要作業**:
  - V3_RULES に param 範囲を記入 (zmusic3 のマニュアル入手要)
  - Grammar の V3 拡張コマンドの追加パターン (新規スニペット)
  - `.zms` に `/ zmusic-version: 3` があると再生を無効化 (or 警告)
- **工数見積**: 3-5 日
- **効果**: V3 の .zms ファイルを開いても、シンタックスハイライトとリントは
  正しく動く。再生はできないが、編集体験は損なわれない
- **UX**: 再生ボタン押下時に「V3 ドキュメントは v1 では再生非対応です」の
  通知 + Preview モード継続

### 選択肢 C: V3 完全スキップ (現状のまま)

- **必要作業**: なし
- **効果**: V3 の `.zms` を開くと v2 として扱われるので誤検出が出る
- **UX**: 悪い (V3 使ってる人が拡張を試したら不具合と感じる)

## 4. 決定: 選択肢 B (静的 V3 対応)

**理由**:
- v1 リリースまでのスケジュール上、選択肢 A は非現実的
- 選択肢 C は「Z-MUSIC 全般対応」を謳う拡張として最低ラインを満たさない
- 選択肢 B なら 1 週間で対応でき、Marketplace 説明にも
  「V3 は文法対応、再生は Phase 4」と明記できる

**具体的な作業内容**:

1. **`docs/reference/zmusic3-manual.txt` の入手** — kg68k アーカイブ等から
   V3 マニュアルを持ってくる
2. **`V3_RULES` の埋め込み** — v3 で拡張されたパラメータ範囲を記入
   - MIDI アフタータッチ関連の追加
   - PCM8 チャンネル指定 (`@e` 等)
   - 追加された @コマンド
3. **`syntaxes/zms.tmLanguage.json` の V3 拡張** — v3 でのみ有効な @コマンド
   を pattern に追加 (existing pattern を汚さないよう `include-if` 分岐は
   TextMate 側では難しいので、両バージョンで有効な広めの regex にする)
4. **Player 側の V3 判定** — `PlayerController.play()` の頭で
   `detectVersion(doc) === "3"` の場合、通知 + 再生キャンセル

## 5. TODO (実装ステップ)

- [x] V3 マニュアル入手 (`docs-local/zmusic-v3/` に配置、gitignore 済)
- [x] `V3_RULES` の atParamRules / mmlParamRules を埋める (V2 継承分)
- [x] Grammar に V3 拡張 `[KEYWORD]` 命令を追加 (100+ 語)
- [x] `PlayerController.play()` で v3 検出 → 通知 + 中止
- [ ] `versionDetection.test.ts` の V3 分岐テスト追加
- [ ] README に「V3 は文法対応のみ、再生は Phase 4」明記
- [ ] V3 独自 `[KEYWORD arg]` の範囲 lint (Phase 4 — 現在の regex ベース
  ParamRule では表現しづらいため、`[K]P(arse)` トークナイザ の追加が必要)

## 5.1 V3 で識別する [KEYWORD] コマンド (grammar での bold 化対象)

100 個超の V3 拡張命令を grammar の bracket-command scope で
navigation として認識する。以下カテゴリ別:

- **基本 MML 等価物**: `[VOLUME]`, `[VELOCITY]`, `[TEMPO]`, `[TIMBRE]`,
  `[PROGRAM]`, `[PANPOT]`, `[BEND]`, `[PORTAMENT]`, `[DAMPER]`,
  `[NOISE]`, `[TIE_MODE]`, `[KEY]`, `[K.SIGN]`, `[KEY_SIGNATURE]`,
  `[METER]`, `[MEASURE]`, `[BAR]`, `[JUMP]`, `[EMBED]`, `[COMMENT]`
- **ナビゲーション** (V2 継承): `[DO]`, `[LOOP]`, `[CODA]`, `[D.C.]`,
  `[D.S.]`, `[SEGNO]`, `[FINE]`, `[TOCODA]`, `[PATTERN]`
- **VIBRATO ファミリ** (V3): `[VIBRATO.DEEPEN]`, `[VIBRATO.DELAY]`,
  `[VIBRATO.DEPTH]`, `[VIBRATO.MODE]`, `[VIBRATO.SPEED]`,
  `[VIBRATO.SWITCH]`, `[VIBRATO.SYNC]`, `[VIBRATO.WAVEFORM]`
- **AGOGIK ファミリ** (V3, テンポ揺らぎ): `[AGOGIK.*]` (8種)
- **VELOCITY ファミリ** (V3, 音量エンベロープ): `[VELOCITY.*]` (9種)
- **AFTERTOUCH ファミリ** (V3): `[AFTERTOUCH.*]` (4種)
- **MIDI-GS** (V3, Roland GS 対応): `[GS_INIT]`, `[GS_RESET]`,
  `[GS_CHORUS]`, `[GS_REVERB]`, `[GS_DISPLAY]`, `[GS_DRUM_*]`,
  `[GS_PART_*]`, `[GS_PARTIAL_RESERVE]`, `[GS_PRINT]`, `[GS_V_RESERVE]`
- **トラック/チャンネル管理** (V3): `[TRACK_FADER]`, `[TRACK_DELAY]`,
  `[TRACK_MODE]`, `[CH_FADER]`, `[CH_ASSIGN]`, `[MASTER_FADER]`,
  `[ASSIGN]`, `[CH_PRESSURE]`, `[POLYPHONIC_PRESSURE]`
- **エフェクト** (V3): `[EFFECT.CHORUS]`, `[EFFECT.DELAY]`,
  `[EFFECT.REVERB]`, `[ECHO]`
- **エクスクルーシブ** (V3): `[ROLAND_EXCLUSIVE]`, `[YAMAHA_EXCLUSIVE]`,
  `[MIDI_DATA]`, `[NRPN]`, `[SEND_TO_M]`, `[SC]`, `[MT]`
- **その他**: `[OPM]`, `[OPM.LFO]`, `[SLOT_SEPARRATION]` (原文タイポ),
  `[FREQUENCY]`, `[PITCH]`, `[EFFECT]`, `[ARCC]`, `[SYNCHRONIZE]`,
  `[TIMER]`, `[EVENT]`, `[POKE]`, `[PCM_MODE]`, `[CONTROL]`,
  `[ALL_SOUND_OFF]`, `[GM_SYSTEM_ON]`, `[REPLAY]`, `[FM]`, `[ADPCM]`,
  `[MIDI]`, `[DUMMY]`, `[INSTRUMENT_ID]`

## 6. Phase 4 でのフル V3 対応の準備

- **上流動向の監視**: toyoshim/z-music.js の v3 対応議論があるかチェック
- **代替案**: 実機/エミュレータ経由の V3 再生 (旧 rtanote/vscode-zms-old の
  F6/F7 リモート再生方式)。ネットワーク越しに X68000 実機 or XM6TypeG に
  投げる方式。個人開発者にとっては UX が劣るが可能性はある
- **代替案 2**: ZMSC3.X を Emscripten でセルフビルド (ZMSC3.X のソース
  入手性次第)

## 7. 参考

- kg68k/zmusic2: v2 マニュアル (docs/reference/zm04〜zm13.txt に UTF-8 版を同梱)
- kg68k/zmusic3: v3 マニュアル (未同梱、Phase B で入手予定)
- rtanote/vscode-zms-old: 予算内で削除したが、V3 対応時の参考実装として GitHub
  に残っている (F6/F7 リモート再生の仕組み)
