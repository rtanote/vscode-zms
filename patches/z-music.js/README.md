# z-music.js fork patches

toyoshim/z-music.js の upstream への差分。ビルド前に順番に `git apply` する。

## パッチ一覧

1. **01-export-regs.patch** — レジスタ読み取り関数の追加
   - `src/zmusic.cpp` に `zmusic_get_areg` / `zmusic_get_dreg` を追加
   - `Makefile` の `ZMFUNCS` に `_zmusic_get_areg`, `_zmusic_get_dreg` を追加
2. **02-runtime-driver-load.patch** — ドライバの起動時ロード対応
   - `Makefile` から `--embed-file x/ZMUSIC208.X` を撤去
   - `-s EXPORTED_RUNTIME_METHODS=['FS']` を追加
   - `src/prolog.js` の `ZMUSIC.install()` に `options.driver = { name, data }` 対応
3. **03-public-api-additions.patch** — JS 側 public API の拡張
   - `ZMUSIC.peek` / `peekBytes` / `areg` / `dreg` / `onMessage` / `setFileOpenCallback`
   - `ZMUSIC.compile()` と `ZMUSIC.start()` の分割 API
   - 既定で `midi: false` を渡す

## 生成手順

upstream で編集 → `git diff > ../patches/z-music.js/NN-<name>.patch`
