# Z-MUSIC v3 (ZMSC3.X) 対応方針

**現在の対応状況** (v0.1.0 時点): **文法検知のみ対応、再生は V2 のみ**

## Z-MUSIC v3 とは

- **ZMSC3.X**: 西川善司氏による Z-MUSIC の v3 系ドライバ (v2.08 と別系統)
- **v2 との主な違い**:
  - ADPCM 8 独立チャンネル対応 (v2 は 1ch)
  - MIDI 制御コマンドの拡張 (SC-55 mkII 対応の音源自動切替等)
  - `[TIMBRE]` `[VOLUME]` `[VIBRATO.*]` `[ARCC.*]` など可読形の拡張 MML 群
  - `[K.SIGN Emajor]` 等の調名指定
  - 波形メモリの振幅解釈が変更 (v2 は無効、v3 は有効)
  - 絶対音長 1 の扱いが変更 (v2 は強制タイ/スラー、v3 は通常音長)
- **配布**: v2 と同様に Vector や X68000 保存アーカイブに歴代版あり

## 本拡張での対応状況

### できること

- **`.zms` の V2/V3 自動判定** — [src/versionDetection.ts](../src/versionDetection.ts)
  で以下の優先順位で解決:
  1. ファイル先頭のマジックコメント `/ zmusic-version: 3`
  2. VS Code 設定 `zmusic.syntax.version`
  3. ヒューリスティック (現状はデフォルト V2)
- **V3 モードのシンタックスハイライト** — grammar が V3 の 100+ 拡張
  `[KEYWORD]` 命令を認識、bold 表示
- **バージョン別 hover 説明** — `[K.SIGN]` `[TIMBRE]` 等、V2 と V3 で
  挙動が違うコマンドは、開いている `.zms` の mode に応じた注意書きを表示
- **静的リント** — V2 モードでは V2 のパラメータ範囲を厳密検証、
  V3 モードでは V2 継承ルールで軽く検証 (V3 固有範囲は未実装)
- **ステータスバー** — 現在のバージョン表示 + クリックで切替 QuickPick

### できないこと

- **V3 (`.zms` に `zmusic-version: 3` マーカーあり) の再生** — F5 を押すと
  「V3 は本 build では再生非対応」の通知が出て中止される。バンドル WASM
  は v2 の ZMUSIC.X 2.08 のみ搭載
- **V3 固有パラメータ範囲の lint** — `[TIMBRE_SPLIT sw b1,t1,m1,n1, ...]`
  の各パラメータ範囲チェックなど。今は grammar での bold 化のみ

## 将来の完全対応の可能性

以下は現時点では未着手だが、コミュニティの動きや個人的興味次第で検討可能:

- **上流動向の監視**: [toyoshim/z-music.js](https://github.com/toyoshim/z-music.js)
  で v3 対応議論があるかチェック
- **代替案 1: 実機/エミュレータ経由の V3 再生** — [`rtanote/vscode-zms-old`](https://github.com/rtanote/vscode-zms-old)
  (前身プロジェクト、非公開) が採用していた F6/F7 リモート再生方式。
  ネットワーク越しに X68000 実機 or XM6TypeG に投げる方式。個人開発者に
  とっては UX が劣るが可能性はある
- **代替案 2: ZMSC3.X の Emscripten セルフビルド** — ZMSC3.X のソース
  入手性次第。M68000 コードは run68 で走らせられるが、ZMSC3.X 側の依存
  (拡張 API 等) の解析が必要

## 参考

- [kg68k/zmusic2](https://github.com/kg68k/zmusic2): v2 マニュアル
  (本拡張の [docs/reference/zm04〜zm13.txt](reference/) に UTF-8 版を同梱)
- [kg68k/zmusic3](https://github.com/kg68k/zmusic3): v3 マニュアル (アーカイブ公開)
