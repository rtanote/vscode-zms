/**
 * ZMS の `/` 行内コメント開始位置を返す。
 *
 * 決定規則:
 *   - `(` `[` `'` の内側にある `/` はコメント開始とみなさない
 *     (voice def `(V n,0,...)` 中の `/` セパレータや、和音 `'a/b'` 記法の
 *     途中の `/` を誤ってコメント扱いしないため)
 *   - `/*` は Z-MUSIC 文法に存在しないので個別扱いしない
 *
 * 用途: TextEditorDecoration 系 (panpot / octave / flowControl / trackPrefix)
 * が regex match する前に、コメント部分をスライスして除外する。
 * ZmsParser.findCommentStart と同じロジックだが、循環参照を避けるため
 * ここに独立して置いてある。
 */
export function findLineCommentStart(line: string): number {
  let paren = 0;
  let bracket = 0;
  let chord = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && paren === 0 && bracket === 0) {
      chord = !chord;
    } else if (!chord) {
      if (ch === "(") paren++;
      else if (ch === ")" && paren > 0) paren--;
      else if (ch === "[") bracket++;
      else if (ch === "]" && bracket > 0) bracket--;
      else if (ch === "/" && paren === 0 && bracket === 0) return i;
    }
  }
  return -1;
}
