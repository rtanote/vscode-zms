import { test } from "node:test";
import * as assert from "node:assert";
import * as iconv from "iconv-lite";

/**
 * ドライバに渡す ZMS は **SJIS + CRLF** でなければならない
 * ([PlayerController#play](../../src/player/PlayerController.ts) の
 * 「SJIS + CRLF に正規化」参照):
 *
 *   const utf8Text = doc.getText().replace(/\r\n?|\n/g, "\r\n");
 *   const zmsBytes = iconv.encode(utf8Text, "shift_jis");
 *
 * iconv-lite は VSIX に同梱される唯一の production 依存で、0.1.1 では
 * 同梱漏れで拡張が activate できなくなった当事者。CI の同梱チェックは
 * 「ファイルが在る」ことしか見ないので、**変換結果そのもの**をここで固定する。
 * (0.6.3 → 0.7.3 の更新時に、この経路を検証する手段が無かったため追加。)
 */

/** PlayerController が行う正規化と同じ変換。 */
function toDriverBytes(text: string): Buffer {
  return Buffer.from(iconv.encode(text.replace(/\r\n?|\n/g, "\r\n"), "shift_jis"));
}

test("shift_jis エンコーディングが利用可能である", () => {
  assert.ok(iconv.encodingExists("shift_jis"), "iconv-lite が shift_jis を認識しない");
});

test("日本語が既知の SJIS バイト列になる", () => {
  // .zms のコメントに実際に出る種類の文字。全角カナ / 漢字 / 記号。
  const cases: Array<[string, string]> = [
    ["テスト", "836583588367"],
    ["ドレミ", "8368838c837e"],
    ["日本語", "93fa967b8cea"],
    ["曲", "8bc8"],
    ["：", "8146"],
  ];
  for (const [text, hex] of cases) {
    assert.strictEqual(
      Buffer.from(iconv.encode(text.replace(/\r\n?|\n/g, "\r\n"), "shift_jis")).toString("hex"),
      hex,
      `"${text}" の SJIS バイト列が期待と違う`,
    );
  }
});

test("改行が LF / CR / CRLF いずれからも CRLF に正規化される", () => {
  const expected = Buffer.from("a\r\nb\r\nc\r\n", "latin1");
  for (const src of ["a\nb\nc\n", "a\r\nb\r\nc\r\n", "a\rb\rc\r"]) {
    assert.deepStrictEqual(
      toDriverBytes(src),
      expected,
      `改行 ${JSON.stringify(src)} が CRLF に正規化されない`,
    );
  }
});

test("ASCII の MML は 1 バイト 1 文字のまま通る", () => {
  // ZMD の step 計算は MML のバイト位置に依存するので、ASCII が
  // マルチバイト化されると SourceMap が全滅する。
  const mml = "(t1) @1 o4 cdefgab<c q8 v12";
  const bytes = toDriverBytes(mml);
  assert.strictEqual(bytes.length, mml.length, "ASCII 部分のバイト長が文字数と一致しない");
  assert.strictEqual(bytes.toString("latin1"), mml);
});

test("日本語コメント入りの ZMS が round-trip する", () => {
  const zms = "/ テスト曲 (c) 2026\n(I)\n(m1,3000)\n(a1,1)\n(t1) @1 cde\n";
  const bytes = toDriverBytes(zms);
  assert.strictEqual(
    iconv.decode(bytes, "shift_jis"),
    zms.replace(/\n/g, "\r\n"),
    "SJIS 往復で内容が変わる",
  );
});
