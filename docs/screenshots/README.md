# Marketplace 用スクリーンショット

README.md から `docs/screenshots/*.png` を参照している。Marketplace 公開時に
以下 4 枚が実際に必要なので、公開前に撮って埋める。

## 撮り方 (macOS Cmd+Shift+4 でウィンドウ / 領域選択)

1. VS Code Reload Window → 拡張ロード状態にする
2. `test-fixtures/hello.zms` を開く
3. F5 → QuickPick で ZMUSIC.X 選択 → 再生
4. 以下 4 枚を撮影して `docs/screenshots/` 直下に配置する:

| ファイル名 | 撮影ターゲット | 推奨サイズ |
|---|---|---|
| `editor-trace.png` | エディタ本体 (シンタックスハイライト + 演奏中のノート ハイライト付き) | 900x600 前後 |
| `player-panel.png` | Player パネル (Z-MUSIC Player view)、5-8 トラック並び、鍵盤ビジュアライザにアクティブキー付き | 1400x400 前後 (横長) |
| `sheet-music.png` | abcjs 譜面プレビュー (Show Sheet Music コマンド)、現在ノート ハイライト付き | 900x400 前後 |
| `copilot-setup.png` | 初回 .zms オープン時の Setup Copilot 通知 (右下) | 500x200 前後 |

## 撮影時の注意

- VS Code の theme は Dark+ (default) を推奨。Marketplace 表示時に一貫感が出る
- 画面録画から静止画切り出しでも OK
- 個人情報 (絶対パス, ユーザ名, `.env`, キー) が写り込まないよう、フルスクリーン
  ではなく VS Code ウィンドウのみを撮る
- ファイルサイズは各 500KB 以下推奨 (Marketplace は許容するが README の表示速度)

## Marketplace ギャラリー画像への流用

同じ画像は `docs/screenshots/` に置いたまま、Marketplace の
Publisher Portal (Manage Extensions) 経由でギャラリー用に upload できる。
package.json の `icon` (resources/icon.png) とは別扱い。
