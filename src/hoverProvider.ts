import * as vscode from "vscode";
import {
  CommandInfo,
  atCommands,
  mmlCommands,
  bracketCommands,
  dotCommands,
  parenCommands,
  operatorCommands,
} from "./commandReference";
import { detectVersion, type ZmusicVersion } from "./versionDetection";

/**
 * hover 表示の組み立て。
 *   version は detectVersion(doc) の結果。`info.notes.v2` / `info.notes.v3`
 *   のうち一致する側だけ description の後ろに追記する。両方未定義なら
 *   共通 description のみ。
 */
function formatHover(info: CommandInfo, version: ZmusicVersion): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.appendCodeblock(info.syntax, "");
  md.appendMarkdown(`${info.description}`);
  const note = version === "3" ? info.notes?.v3 : info.notes?.v2;
  if (note) {
    md.appendMarkdown(`\n\n${note}`);
  }
  if (info.devices) {
    md.appendMarkdown(`\n\n${info.devices}`);
  }
  return md;
}

export class ZMusicHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Hover | undefined {
    const line = document.lineAt(position).text;
    const col = position.character;

    // コメント行はスキップ
    const commentDirective = line.match(/^\s*\.comment\b/i);
    if (commentDirective) {
      return undefined;
    }
    // /コメントの中はスキップ
    const slashIdx = findCommentStart(line);
    if (slashIdx !== -1 && col >= slashIdx) {
      return undefined;
    }

    // 検出した version を全 try 系に渡して version-aware な hover を出す。
    // K.SIGN のように V2 と V3 で振る舞い (例: 調名指定の可否) が違うコマンドで、
    // 現在ドキュメントの mode に応じた注意書きを出せるようにする。
    const version = detectVersion(document);

    return (
      this.tryDotCommand(line, col, position, version) ??
      this.tryBracketCommand(line, col, position, version) ??
      this.tryPortamento(line, col, position, version) ??
      this.tryBrace(line, col, position, version) ??
      this.tryParenCommand(line, col, position, version) ??
      this.tryAtCommand(line, col, position, version) ??
      this.tryOperator(line, col, position, version) ??
      this.tryMmlCommand(line, col, position, version)
    );
  }

  /**
   * ポルタメント `(k1,k2)n,dly,prt` のホバー。
   * k1, k2 は音名 (a-g) + 任意の臨時記号。カンマ区切り or 連続記述どちらも可。
   * 小文字音名で始まる括弧ブロックとして検出する (大文字で始まる `(A...)`
   * 等は他コマンドなので tryParenCommand に委ねる)。
   */
  private tryPortamento(
    line: string,
    col: number,
    pos: vscode.Position,
    version: ZmusicVersion,
  ): vscode.Hover | undefined {
    // 括弧内容は音符・オクターブ・調号・長さ等を含む自由形式 (ZM5.txt L1093 参照)。
    // 先頭が小文字 a-g なら ports/tracks 等の大文字始まりコマンドではないので
    // ポルタメントと判定する。
    const regex = /\(\s*[a-g][^)]*\)(?:\s*\*?\d+\.*)?(?:\s*,\s*-?\d+)*/gi;
    let m;
    while ((m = regex.exec(line)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (col < start || col >= end) continue;

      const info: CommandInfo = {
        label: "ポルタメント",
        syntax: "(k1,k2)n,dly,prt",
        description:
          "ポルタメント演奏。k1 (開始音階) から k2 (終了音階) へ滑らかに音程を変化させる。\n" +
          "- k1, k2: 音階 (c,d,e,f,g,a,b)。カンマ区切りまたは連続記述可 (例: `(a-b-)` `(o4g2<g)` `(o3d*96,e)`)\n" +
          "- 括弧内に書ける MML: 調号 (# + - !) / 音長 / 絶対音長 (*n) / オクターブ (o, <, >)\n" +
          "- n: 絶対音長 (1–32767、省略時はデフォルト音長)\n" +
          "- dly: 遅延時間 (0–32767)\n" +
          "- prt: (正) 変化所用時間 / (負) 継続時間 / (0) いずれも設定しない\n\n" +
          "`[k1,k2]n,dly,prt` 形式もある。和音と違いオクターブスイッチは () 外にも影響。",
        devices: "[FM][ADPCM][MIDI]",
      };
      const range = new vscode.Range(pos.line, start, pos.line, end);
      return new vscode.Hover(formatHover(info, version), range);
    }
    return undefined;
  }

  /** 連符 `{MML}n[.*]` (ZM5.txt ■連符) のホバー。 */
  private tryBrace(
    line: string,
    col: number,
    pos: vscode.Position,
    version: ZmusicVersion,
  ): vscode.Hover | undefined {
    const regex = /\{[^}]*\}(?:\*?\d+\.*)?/g;
    let m;
    while ((m = regex.exec(line)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (col < start || col >= end) continue;

      const info: CommandInfo = {
        label: "連符",
        syntax: "{~}n",
        description:
          "連符。`{` と `}` で囲まれた MML 群を、合計の音長が n 分音符になるよう均等配分して演奏する。\n" +
          "- n: 1–32767、付点 `.` や `*絶対音長` 指定も可\n" +
          "- 省略時はデフォルト音長 (`l`) が使われる\n" +
          "- 内部には音長操作 MML (`.`, `l`, `@L` 等) は記述不可\n\n" +
          "例: `{cdef}2`, `{abc}4..`, `{cd&de}*192`",
        devices: "[FM][ADPCM][MIDI]",
      };
      const range = new vscode.Range(pos.line, start, pos.line, end);
      return new vscode.Hover(formatHover(info, version), range);
    }
    return undefined;
  }

  private tryDotCommand(
    line: string,
    col: number,
    pos: vscode.Position,
    version: ZmusicVersion,
  ): vscode.Hover | undefined {
    const match = line.match(/^\s*\.([a-z_][a-z0-9_]*)/i);
    if (!match) return undefined;
    const start = line.indexOf("." + match[1]);
    const end = start + 1 + match[1].length;
    if (col < start || col >= end) return undefined;

    const key = match[1].toLowerCase();
    const info = dotCommands[key];
    if (!info) return undefined;

    const range = new vscode.Range(pos.line, start, pos.line, end);
    return new vscode.Hover(formatHover(info, version), range);
  }

  private tryBracketCommand(
    line: string,
    col: number,
    pos: vscode.Position,
    version: ZmusicVersion,
  ): vscode.Hover | undefined {
    const regex = /\[([^\]]+)\]/gi;
    let m;
    while ((m = regex.exec(line)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (col < start || col >= end) continue;

      const inner = m[1].trim();
      // 括弧内のコマンド名部分を抽出 (スペースや数字より前)
      const cmdMatch = inner.match(/^([a-z_.]+)/i);
      if (!cmdMatch) continue;

      const key = cmdMatch[1].toLowerCase();
      const info = bracketCommands[key];
      if (!info) continue;

      const range = new vscode.Range(pos.line, start, pos.line, end);
      return new vscode.Hover(formatHover(info, version), range);
    }
    return undefined;
  }

  private tryParenCommand(
    line: string,
    col: number,
    pos: vscode.Position,
    version: ZmusicVersion,
  ): vscode.Hover | undefined {
    const regex = /\(([A-Za-z])([^)]*)\)/g;
    let m;
    while ((m = regex.exec(line)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (col < start || col >= end) continue;

      const cmd = m[1].toUpperCase();
      const info = parenCommands[cmd];
      if (!info) continue;

      const range = new vscode.Range(pos.line, start, pos.line, end);
      return new vscode.Hover(formatHover(info, version), range);
    }
    return undefined;
  }

  private tryAtCommand(
    line: string,
    col: number,
    pos: vscode.Position,
    version: ZmusicVersion,
  ): vscode.Hover | undefined {
    const regex = /@([a-z]+)/gi;
    let m;
    while ((m = regex.exec(line)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (col < start || col >= end) continue;

      const key = m[1].toLowerCase();
      const info = atCommands[key];
      if (!info) continue;

      const range = new vscode.Range(pos.line, start, pos.line, end);
      return new vscode.Hover(formatHover(info, version), range);
    }

    // @数値 (音色番号)
    const numRegex = /@(\d+)/g;
    let nm;
    while ((nm = numRegex.exec(line)) !== null) {
      const start = nm.index;
      const end = start + nm[0].length;
      if (col < start || col >= end) continue;

      const info: CommandInfo = {
        label: "@n",
        syntax: "@n (n: 1-32768)",
        description: "音色/プログラム番号を選択する。",
        devices: "[FM][ADPCM][MIDI]",
      };
      const range = new vscode.Range(pos.line, start, pos.line, end);
      return new vscode.Hover(formatHover(info, version), range);
    }

    return undefined;
  }

  private tryOperator(
    line: string,
    col: number,
    pos: vscode.Position,
    version: ZmusicVersion,
  ): vscode.Hover | undefined {
    const ch = line[col];
    if (!ch) return undefined;

    // |: or :|
    if (ch === "|" && col + 1 < line.length && line[col + 1] === ":") {
      const info = operatorCommands["|:"];
      if (info) {
        const range = new vscode.Range(pos.line, col, pos.line, col + 2);
        return new vscode.Hover(formatHover(info, version), range);
      }
    }
    if (ch === ":" && col + 1 < line.length && line[col + 1] === "|") {
      const info = operatorCommands["|:"];
      if (info) {
        const range = new vscode.Range(pos.line, col, pos.line, col + 2);
        return new vscode.Hover(formatHover(info, version), range);
      }
    }

    const info = operatorCommands[ch];
    if (info) {
      const range = new vscode.Range(pos.line, col, pos.line, col + 1);
      return new vscode.Hover(formatHover(info, version), range);
    }
    return undefined;
  }

  private tryMmlCommand(
    line: string,
    col: number,
    pos: vscode.Position,
    version: ZmusicVersion,
  ): vscode.Hover | undefined {
    const ch = line[col];
    if (!ch) return undefined;

    // 英字でなければスキップ
    if (!/[a-zA-Z]/.test(ch)) return undefined;

    // 直前が英字/アンダースコアなら単語の途中 → スキップ
    if (col > 0 && /[a-zA-Z_]/.test(line[col - 1])) return undefined;

    const key = ch.toUpperCase();
    const info = mmlCommands[key];
    if (!info) return undefined;

    const range = new vscode.Range(pos.line, col, pos.line, col + 1);
    return new vscode.Hover(formatHover(info, version), range);
  }
}

/**
 * 行内のコメント開始位置を探す。
 * シングルクォート(和音)やカッコ内の / はコメントではない点に注意が必要だが、
 * 簡易実装としてトップレベルの / を探す。
 */
function findCommentStart(line: string): number {
  let inParen = 0;
  let inBracket = 0;
  let inChord = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inParen && !inBracket) {
      inChord = !inChord;
    } else if (!inChord) {
      if (ch === "(") inParen++;
      else if (ch === ")" && inParen > 0) inParen--;
      else if (ch === "[") inBracket++;
      else if (ch === "]" && inBracket > 0) inBracket--;
      else if (ch === "/" && inParen === 0 && inBracket === 0) {
        return i;
      }
    }
  }
  return -1;
}
