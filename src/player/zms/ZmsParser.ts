import * as vscode from "vscode";

/**
 * ZMS の時間消費トークン抽出
 *
 * 目的は完全な MML 解釈ではなく、ZMD 側と 1:1 で数え上げる粒度で
 * トラック別に時間消費トークンとソース範囲を列挙すること。
 *
 * 抽出対象:
 *   note        [a-g] + accidental + length + (^length)*   ← ZMD $00-$7F または $FE
 *   rest        r + length + (^length)*                    ← ZMD $80 または $FE(note=$80)
 *   chord       '…'                                        ← ZMD $E2
 *   portamento  (…)  (行頭以外の丸括弧)                    ← ZMD $E0
 *   wait        @w + length                                 ← ZMD $D0 または $FE(note=$D0)
 *   absnote     *<n> + [a-gr'…']                            ← ZMD $FE
 *
 * `&` は 2 音符コマンドになるためトークン分割 (前音符 gate=255)。
 * `^` は音長加算で 1 トークン。
 *
 * 行分類 (zm04 準拠):
 *   1. `.comment` 行は無視
 *   2. `.xxx` 系ドット命令行は無視
 *   3. `(t1,2,...)` `(T1,2,...)` は MML 行。`)` の後ろから行末までを本文とし、
 *      前アクティブトラックリストを更新。同一トラックへの後続 `(t1)` 行は連結。
 *   4. その他の `(…)` 共通コマンドは無視
 *   5. トラック指定なしの行は前回のアクティブトラックに継続
 *   6. `/` は行内コメント (ただし `(` `'` `[` の内側にある `/` は除く)
 */

export type SourceTokenKind = "note" | "rest" | "chord" | "portamento" | "wait" | "absnote";

export interface SourceToken {
  kind: SourceTokenKind;
  range: vscode.Range;
  lineIndex: number;
}

interface LineClassification {
  kind: "skip" | "trackPrefix" | "continuation";
  activeTracks?: number[];
  bodyStart?: number;
}

const TRACK_PREFIX = /^\s*\([tT]\s*(\d+(?:\s*,\s*\d+)*)\s*\)/;

function classifyLine(line: string): LineClassification {
  if (/^\s*\.comment\b/i.test(line)) return { kind: "skip" };
  if (/^\s*\./.test(line)) return { kind: "skip" };

  const m = line.match(TRACK_PREFIX);
  if (m) {
    const tracks = m[1].split(/\s*,\s*/).map((s) => parseInt(s, 10));
    return { kind: "trackPrefix", activeTracks: tracks, bodyStart: m[0].length };
  }
  if (/^\s*\(/.test(line)) return { kind: "skip" };
  return { kind: "continuation" };
}

function findCommentStart(line: string): number {
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

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}

function isNoteLetter(c: string): boolean {
  const lc = c.toLowerCase();
  return lc >= "a" && lc <= "g";
}

/** length spec: digits, dots, `^<digits>.*` chains, および `*n` 絶対長 suffix。
 * zm05 L92-102: `b*386`, `r*96` のように音符/休符の後に `*n` (n = 0-65534) を
 * つけて絶対音長を指定できる。 */
function skipLength(body: string, i: number): number {
  const n = body.length;
  while (i < n) {
    const c = body[i];
    if (isDigit(c) || c === ".") {
      i++;
    } else if (c === "^") {
      i++;
      while (i < n && (isDigit(body[i]) || body[i] === ".")) i++;
    } else if (c === "*") {
      i++;
      while (i < n && isDigit(body[i])) i++;
    } else {
      break;
    }
  }
  return i;
}

/** accidental: `#` `+` `-` (sharp/flat) と `!` (natural、zm05 L165-)。 */
function skipAccidental(body: string, i: number): number {
  while (
    i < body.length &&
    (body[i] === "#" || body[i] === "+" || body[i] === "-" || body[i] === "!")
  ) i++;
  return i;
}

interface RawToken {
  kind: SourceTokenKind;
  start: number;
  end: number;
}

function tokenizeBody(body: string): RawToken[] {
  const out: RawToken[] = [];
  const n = body.length;
  let i = 0;
  while (i < n) {
    const c = body[i];
    const lc = c.toLowerCase();

    if (c === "[") {
      // [K.SIGN +c,+d,...] 調号宣言、[do]/[loop]/[d.c.]/[segno]/[tocoda]/
      // [coda]/[fine]/[end] などのナビゲーション記号 (zm05 §L150-, L1926-)。
      // すべて untimed。中身に音階アルファベット (a-g) が並ぶことがあるが
      // 「時間消費トークン」ではないので、'[' から対応する ']' までをまるごと
      // スキップして token 化しない。実測: GAVOTTE.ZMS の `[k.sign +f,+c,+g,+d]`
      // 内の 'g' (from sign), 'f','c','g','d' がそれぞれ note と誤認され、
      // 全 8 track で delta -5 (ZmsParser overcount) の直接原因になっていた。
      i++;
      while (i < n && body[i] !== "]") i++;
      if (i < n) i++;
      continue;
    }

    if (c === "'") {
      // chord: read until matching '
      const start = i;
      i++;
      while (i < n && body[i] !== "'") i++;
      if (i >= n) break;
      i++;
      out.push({ kind: "chord", start, end: i });
      continue;
    }

    if (c === "(") {
      // portamento: read until matching )
      const start = i;
      let depth = 1;
      i++;
      while (i < n && depth > 0) {
        if (body[i] === "(") depth++;
        else if (body[i] === ")") depth--;
        i++;
      }
      out.push({ kind: "portamento", start, end: i });
      continue;
    }

    if (c === "*") {
      // absolute length: *<digits> then note/rest/chord
      const start = i;
      i++;
      while (i < n && isDigit(body[i])) i++;
      if (i < n) {
        const nc = body[i].toLowerCase();
        if (nc === "'") {
          // *n'chord'
          i++;
          while (i < n && body[i] !== "'") i++;
          if (i < n) i++;
          out.push({ kind: "chord", start, end: i });
        } else if (nc === "r") {
          i++;
          out.push({ kind: "rest", start, end: i });
        } else if (nc >= "a" && nc <= "g") {
          i++;
          i = skipAccidental(body, i);
          out.push({ kind: "absnote", start, end: i });
        } else {
          // orphan *<n>: skip
        }
      }
      continue;
    }

    if (c === "@") {
      // @W (wait) だけが時間消費コマンド。それ以外は untimed 制御命令
      // (@V, @U, @K, @C, @A, @D, @F, @G, @T, @L, @P, @Q, @B, @R, @J, @M,
      // @S, @H, @I, @E, @O, @N など)、または音色参照 @<数値> (@1..@200)。
      //
      // 重要: @<letter> で letter が a-g だと従来は '@' だけスキップして
      // その次の文字を音符として拾ってしまっていた (実測: 実 X68000 ZMS の
      // `@c%1010`、`@a10` 等でトラック 1 の melody が lineApprox に落ちる
      // 原因)。ここでは @ + 任意の文字を 1 単位として消費する。
      const next = i + 1 < n ? body[i + 1].toLowerCase() : "";
      if (next === "w") {
        const start = i;
        i += 2;
        i = skipLength(body, i);
        out.push({ kind: "wait", start, end: i });
        continue;
      }
      if (next >= "a" && next <= "z") {
        // @<letter> の後ろに符号付き整数が続く形式を丸ごとスキップ
        i += 2;
        if (i < n && (body[i] === "+" || body[i] === "-")) i++;
        while (i < n && isDigit(body[i])) i++;
        continue;
      }
      // @<digits> = 音色参照。'@' だけスキップして数字は line 203 で消化
      i++;
      continue;
    }

    if (isNoteLetter(c)) {
      const start = i;
      i++;
      i = skipAccidental(body, i);
      i = skipLength(body, i);
      out.push({ kind: "note", start, end: i });
      continue;
    }

    if (lc === "r") {
      const start = i;
      i++;
      i = skipLength(body, i);
      out.push({ kind: "rest", start, end: i });
      continue;
    }

    // Non-candidate char: advance 1. `&` (tie) does not emit a token itself
    // — the next note/rest emits its own token, which matches the ZMD encoding
    // where `c&d` becomes 2 note commands (first with gate=255).
    i++;
  }
  return out;
}

export function parseZms(doc: vscode.TextDocument): Map<number, SourceToken[]> {
  const perTrack = new Map<number, SourceToken[]>();
  let activeTracks: number[] = [];

  for (let lineIndex = 0; lineIndex < doc.lineCount; lineIndex++) {
    const raw = doc.lineAt(lineIndex).text;
    const commentAt = findCommentStart(raw);
    const effective = commentAt >= 0 ? raw.slice(0, commentAt) : raw;
    const cls = classifyLine(effective);
    if (cls.kind === "skip") continue;

    let bodyStart = 0;
    if (cls.kind === "trackPrefix" && cls.activeTracks && cls.bodyStart !== undefined) {
      activeTracks = cls.activeTracks;
      bodyStart = cls.bodyStart;
    }
    if (activeTracks.length === 0) continue;

    const body = effective.slice(bodyStart);
    const tokens = tokenizeBody(body);
    if (tokens.length === 0) continue;

    // Convert to SourceToken with absolute positions.
    const converted: SourceToken[] = tokens.map((t) => ({
      kind: t.kind,
      lineIndex,
      range: new vscode.Range(lineIndex, bodyStart + t.start, lineIndex, bodyStart + t.end),
    }));

    // Share same token list across all tracks named on this MML line (spec §2.6.1
    // rule 4 + §2.7 chord tracks) — SourceMap builder handles per-track ZMD
    // matching independently, so appending the same objects to multiple tracks
    // preserves ordering per track.
    for (const trk of activeTracks) {
      const arr = perTrack.get(trk) ?? [];
      arr.push(...converted);
      perTrack.set(trk, arr);
    }
  }

  return perTrack;
}
