import * as vscode from "vscode";
import { detectVersion } from "./versionDetection";

// --- Parameter range definitions ---

interface ParamRule {
  pattern: RegExp;
  min: number;
  max: number;
  label: string;
}

interface RuleSet {
  atParamRules: ParamRule[];
  mmlParamRules: ParamRule[];
}

// ── Z-MUSIC v2 ルール (zm05.txt §L584- を参照して修正) ──────
// label は Diagnostic メッセージ内に埋め込まれる → getRuleSet 時点で解決
// (`vscode.l10n.t()` を factory 内で呼ぶ)。
function buildV2Rules(): RuleSet {
  return {
    // @コマンド (大文字小文字不問)。V2 spec は zm05.txt に準拠
    atParamRules: [
      { pattern: /@v(-?\d+)/gi, min: 0, max: 127, label: vscode.l10n.t("@V (absolute volume)") },
      { pattern: /@u(-?\d+)/gi, min: 0, max: 127, label: vscode.l10n.t("@U (velocity)") },
      { pattern: /@q(-?\d+)/gi, min: 0, max: 32768, label: vscode.l10n.t("@Q (absolute keyoff)") },
      { pattern: /@p(-?\d+)/gi, min: 0, max: 127, label: vscode.l10n.t("@P (detailed pan)") },
      { pattern: /@k(-?\d+)/gi, min: -768, max: 768, label: vscode.l10n.t("@K (detune, 1/64 semitone)") },
      { pattern: /@b(-?\d+)/gi, min: -8192, max: 8191, label: vscode.l10n.t("@B (bend, 1/8192 unit)") },
      { pattern: /@g(-?\d+)/gi, min: 0, max: 127, label: vscode.l10n.t("@G (portamento)") },
      { pattern: /@d(-?\d+)/gi, min: 0, max: 1, label: vscode.l10n.t("@D (damper)") },
      { pattern: /@r(-?\d+)/gi, min: 0, max: 1, label: vscode.l10n.t("@R (reverb)") },
      { pattern: /@j(-?\d+)/gi, min: 0, max: 1, label: vscode.l10n.t("@J (tie mode)") },
      { pattern: /@f(-?\d+)/gi, min: 0, max: 6, label: vscode.l10n.t("@F (FM algorithm)") },
    ],
    // 単一文字MMLコマンド。前に英字・@ に加えて `(` も除外 (パレン内は
    // `(t1)` 等のトラック/共通コマンドなので MML パラメータではない)。
    mmlParamRules: [
      { pattern: /(?<![a-zA-Z@(])v(\d+)/gi, min: 0, max: 16, label: vscode.l10n.t("V (FM volume)") },
      { pattern: /(?<![a-zA-Z@(])u(-?\d+)/gi, min: 0, max: 127, label: vscode.l10n.t("U (velocity)") },
      { pattern: /(?<![a-zA-Z@(])o(-?\d+)/gi, min: -1, max: 9, label: vscode.l10n.t("O (octave)") },
      { pattern: /(?<![a-zA-Z@(])q(\d+)/gi, min: 1, max: 8, label: vscode.l10n.t("Q (relative gate n/8)") },
      { pattern: /(?<![a-zA-Z@(])p(\d+)/gi, min: 0, max: 3, label: vscode.l10n.t("P (panpot)") },
      { pattern: /(?<![a-zA-Z@(])t(\d+)/gi, min: 20, max: 300, label: vscode.l10n.t("T (tempo BPM)") },
      { pattern: /(?<![a-zA-Z@(])k(-?\d+)/gi, min: -128, max: 127, label: vscode.l10n.t("K (semitone transpose)") },
    ],
  };
}

const V2_RULES: RuleSet = buildV2Rules();

// ── Z-MUSIC v3 ルール (docs-local/zmusic-v3/ZM5.MAN §5.2 参照) ──
// V3 は V2 の上位互換で、基本 MML は §5.2 で「Ver.2.0 以前から存在する MML の仕様」
// として同じ範囲を継承する (ZM5 §5.2 冒頭)。よって V2_RULES と同一で開始。
//
// V3 独自の拡張 (`[TIMBRE n]`, `[VOLUME n]`, `[VIBRATO.*]` 等の
// [KEYWORD arg] 系) は現状 regex ベースの ParamRule では扱いにくいので、
// Phase 4 で拡張検討 (docs/V3_SUPPORT.md 参照)。
//
// 相違点として v3 では:
//  - `[VOLUME n]` の n は 0-127 (絶対) — 単文字 V (0-16) と区別されるが
//    grammar 側の [KEYWORD] scope で bold 化されるので lint 誤検出は起きない
//  - `[VELOCITY n]` は 0-127 (v0-v127)
//  - MIDI 拡張 (@P@B の範囲は同じ)
const V3_RULES: RuleSet = buildV2Rules();

function getRuleSet(doc: vscode.TextDocument): RuleSet {
  return detectVersion(doc) === "3" ? V3_RULES : V2_RULES;
}

// --- Comment detection (same logic as hoverProvider.ts) ---

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

/** コメント部分を除いた有効テキストを返す */
function getEffectiveText(line: string): string {
  // .comment 行は全体スキップ
  if (/^\s*\.comment\b/i.test(line)) {
    return "";
  }
  const slashIdx = findCommentStart(line);
  if (slashIdx !== -1) {
    return line.substring(0, slashIdx);
  }
  return line;
}

// --- FM 音色定義バリデーション (Form 1 (V n,0,…) / Form 2 (@n,…)) ---
//
// 55 param + mode 指定子 '0' で計 56 個 (Form 1) / 55 param (Form 2) の
// カウントを厳密に検証する。Copilot が Form 1/2 を混合形にしがちで、
// パラメータ数が 56 や 66 になって PAN=0 / OM=0 で無音化する事象を
// 早期に赤波線で検出するのが目的。

export interface VoiceDefIssue {
  offsetStart: number;
  offsetEnd: number;
  message: string;
  form: "V" | "@";
  actualCount: number;
  expectedCount: number;
}

export function findVoiceDefIssues(text: string): VoiceDefIssue[] {
  const issues: VoiceDefIssue[] = [];
  const openerRe = /\((V|@)\s*(\d+)\s*,/gi;
  let m: RegExpExecArray | null;
  while ((m = openerRe.exec(text)) !== null) {
    const form: "V" | "@" = m[1].toUpperCase() === "V" ? "V" : "@";
    const voiceNum = parseInt(m[2], 10);
    const openerStart = m.index;
    const contentStart = m.index + m[0].length;

    // 対応する ')' を探す。'/' から改行までは Z-MUSIC ではコメント
    // 扱い (paren 内でも有効)。
    let depth = 1;
    let i = contentStart;
    let inComment = false;
    while (i < text.length && depth > 0) {
      const c = text[i];
      if (inComment) {
        if (c === "\n") inComment = false;
      } else if (c === "/") {
        inComment = true;
      } else if (c === "(") {
        depth++;
      } else if (c === ")") {
        depth--;
        if (depth === 0) break;
      }
      i++;
    }
    if (depth !== 0) continue; // 閉じ括弧が無い場合は別の lint で扱う
    const closeParen = i;

    // 数値トークンだけ取り出す (コメントは削除済み扱い)
    const inner = text.substring(contentStart, closeParen).replace(/\/[^\n]*/g, " ");
    const nums = inner.match(/-?\d+/g) ?? [];
    const count = nums.length;

    let expected: number;
    let message: string | null = null;

    // Z-MUSIC の音色定義は共通行の末尾がデフォルト付きで大幅に省略可能。
    // 実 X68000 曲データ (電脳倶楽部掲載ZMSファイル等) では OM も省略される
    // ケースがあり、共通行が AL+FB の 2 個だけの 46 param 形式も正当:
    //   Form 1 (V n,0,common,4ops)      : 46 <= count <= 56  (mode + 1-11 common + 44 ops)
    //   Form 2 (@n, 4ops, common)       : 46 <= count <= 55  (44 ops + 2-11 common: 最低 AL+FB)
    // OM 省略時の default は 15 (全 OP 有効)。PAN/WF/SY/SP/PMD/AMD/PMS/AMS
    // すべてデフォルト 0 で省略可。
    if (form === "V") {
      expected = 56;
      const first = nums[0];
      if (first !== undefined && first !== "0") {
        message = vscode.l10n.t(
          "(V{0},…): the second argument must be the mode discriminator '0' but got '{1}' (Form 1 syntax: `(V n,0, v1..v55)`)",
          voiceNum,
          first,
        );
      } else if (count < 46 || count > 56) {
        message = vscode.l10n.t(
          "(V{0},0,…): expected 46..56 params (mode '0' + 1..11 common + 4 op × 11) but got {1}",
          voiceNum,
          count,
        );
      }
    } else {
      expected = 55;
      if (count === 56 && nums[0] === "0") {
        // 特定の Copilot ミス: Form 2 opener + Form 1 のモード指定子 ',0'
        message = vscode.l10n.t(
          "(@{0},0,…): Form 2 opener mixed with Form 1's ',0' mode discriminator. Either drop the leading ',0' to make it '(@{0}, v1..v55)' or change the opener to '(V{0},0,…)'.",
          voiceNum,
        );
      } else if (count < 46 || count > 55) {
        message = vscode.l10n.t(
          "(@{0},…): expected 46..55 params (4 op × 11 + 2..11 common) but got {1}. Trailing OM/PAN/WF/SY/SP/PMD/AMD/PMS/AMS are optional; OM defaults to 15.",
          voiceNum,
          count,
        );
      }
    }

    if (message !== null) {
      issues.push({
        offsetStart: openerStart,
        offsetEnd: closeParen + 1,
        message,
        form,
        actualCount: count,
        expectedCount: expected,
      });
    }
  }
  return issues;
}

function checkVoiceDefinitions(doc: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
  const text = doc.getText();
  for (const issue of findVoiceDefIssues(text)) {
    const range = new vscode.Range(doc.positionAt(issue.offsetStart), doc.positionAt(issue.offsetEnd));
    diagnostics.push(new vscode.Diagnostic(range, issue.message, vscode.DiagnosticSeverity.Error));
  }
}

// --- Validation ---

function validateDocument(doc: vscode.TextDocument): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = [];

  const rules = getRuleSet(doc);

  // ドキュメント全体で 1 回だけ走らせる: FM 音色定義の param 数検証
  checkVoiceDefinitions(doc, diagnostics);

  // ドキュメント全体の構文バランス用
  let braceDepth = 0;
  let braceOpenLine = -1;
  let repeatDepth = 0;
  let repeatOpenLine = -1;

  for (let i = 0; i < doc.lineCount; i++) {
    const lineText = doc.lineAt(i).text;
    const effective = getEffectiveText(lineText);
    if (effective.length === 0) continue;

    // --- パラメータ範囲チェック ---
    checkParamRanges(effective, i, diagnostics, rules.atParamRules);
    checkParamRanges(effective, i, diagnostics, rules.mmlParamRules);

    // --- 行内バランスチェック: [ ] ---
    checkBracketBalance(effective, i, diagnostics);

    // --- 行内バランスチェック: ' ' (和音) ---
    checkChordBalance(effective, i, diagnostics);

    // --- 複数行バランス: { } ---
    for (let j = 0; j < effective.length; j++) {
      if (effective[j] === "{") {
        if (braceDepth === 0) braceOpenLine = i;
        braceDepth++;
      } else if (effective[j] === "}") {
        if (braceDepth > 0) {
          braceDepth--;
        } else {
          diagnostics.push(
            new vscode.Diagnostic(
              new vscode.Range(i, j, i, j + 1),
              vscode.l10n.t("No matching '{'"),
              vscode.DiagnosticSeverity.Error,
            ),
          );
        }
      }
    }

    // --- 複数行バランス: |: :| ---
    checkRepeatMarkers(effective, i, diagnostics, (delta, line, col) => {
      if (delta > 0) {
        // |: open
        if (repeatDepth === 0) repeatOpenLine = line;
        repeatDepth++;
      } else {
        // :| close
        if (repeatDepth > 0) {
          repeatDepth--;
        } else {
          diagnostics.push(
            new vscode.Diagnostic(
              new vscode.Range(line, col, line, col + 2),
              vscode.l10n.t("No matching '|:'"),
              vscode.DiagnosticSeverity.Error,
            ),
          );
        }
      }
    });
  }

  // EOF時の未閉じチェック
  if (braceDepth > 0 && braceOpenLine >= 0) {
    const line = doc.lineAt(braceOpenLine).text;
    const col = line.indexOf("{");
    diagnostics.push(
      new vscode.Diagnostic(
        new vscode.Range(braceOpenLine, col >= 0 ? col : 0, braceOpenLine, (col >= 0 ? col : 0) + 1),
        vscode.l10n.t("No matching '}'"),
        vscode.DiagnosticSeverity.Error,
      ),
    );
  }

  if (repeatDepth > 0 && repeatOpenLine >= 0) {
    const line = doc.lineAt(repeatOpenLine).text;
    const col = line.indexOf("|:");
    diagnostics.push(
      new vscode.Diagnostic(
        new vscode.Range(repeatOpenLine, col >= 0 ? col : 0, repeatOpenLine, (col >= 0 ? col : 0) + 2),
        vscode.l10n.t("No matching ':|'"),
        vscode.DiagnosticSeverity.Error,
      ),
    );
  }

  return diagnostics;
}

function checkParamRanges(
  text: string,
  lineIndex: number,
  diagnostics: vscode.Diagnostic[],
  rules: ParamRule[],
): void {
  for (const rule of rules) {
    // Reset lastIndex for global regex
    rule.pattern.lastIndex = 0;
    let m;
    while ((m = rule.pattern.exec(text)) !== null) {
      const numStr = m[1];
      const value = parseInt(numStr, 10);
      if (value < rule.min || value > rule.max) {
        // m.index はパターン全体の開始。数値部分の位置を計算
        const matchStart = m.index;
        const matchEnd = matchStart + m[0].length;
        diagnostics.push(
          new vscode.Diagnostic(
            new vscode.Range(lineIndex, matchStart, lineIndex, matchEnd),
            vscode.l10n.t(
              "{0}: value {1} is out of range ({2}..{3})",
              rule.label,
              value,
              rule.min,
              rule.max,
            ),
            vscode.DiagnosticSeverity.Warning,
          ),
        );
      }
    }
  }
}

function checkBracketBalance(text: string, lineIndex: number, diagnostics: vscode.Diagnostic[]): void {
  const stack: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "[") {
      stack.push(i);
    } else if (text[i] === "]") {
      if (stack.length > 0) {
        stack.pop();
      } else {
        diagnostics.push(
          new vscode.Diagnostic(
            new vscode.Range(lineIndex, i, lineIndex, i + 1),
            vscode.l10n.t("No matching '['"),
            vscode.DiagnosticSeverity.Error,
          ),
        );
      }
    }
  }
  for (const col of stack) {
    diagnostics.push(
      new vscode.Diagnostic(
        new vscode.Range(lineIndex, col, lineIndex, col + 1),
        vscode.l10n.t("No matching ']'"),
        vscode.DiagnosticSeverity.Error,
      ),
    );
  }
}

function checkChordBalance(text: string, lineIndex: number, diagnostics: vscode.Diagnostic[]): void {
  let openPos = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "'") {
      if (openPos === -1) {
        openPos = i;
      } else {
        openPos = -1; // closed
      }
    }
  }
  if (openPos !== -1) {
    diagnostics.push(
      new vscode.Diagnostic(
        new vscode.Range(lineIndex, openPos, lineIndex, openPos + 1),
        vscode.l10n.t("Chord notation ' is not closed"),
        vscode.DiagnosticSeverity.Error,
      ),
    );
  }
}

function checkRepeatMarkers(
  text: string,
  lineIndex: number,
  _diagnostics: vscode.Diagnostic[],
  callback: (delta: number, line: number, col: number) => void,
): void {
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] === "|" && text[i + 1] === ":") {
      callback(+1, lineIndex, i);
      i++; // skip ':'
    } else if (text[i] === ":" && text[i + 1] === "|") {
      callback(-1, lineIndex, i);
      i++; // skip '|'
    }
  }
}

// --- Activation ---

export function activateDiagnostics(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection("zms-lint");
  context.subscriptions.push(collection);

  // 開いているドキュメントを即座に診断
  if (vscode.window.activeTextEditor) {
    const doc = vscode.window.activeTextEditor.document;
    if (doc.languageId === "zms") {
      collection.set(doc.uri, validateDocument(doc));
    }
  }

  // ドキュメントを開いた時
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (doc.languageId === "zms") {
        collection.set(doc.uri, validateDocument(doc));
      }
    }),
  );

  // ドキュメントを編集した時
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.languageId === "zms") {
        collection.set(e.document.uri, validateDocument(e.document));
      }
    }),
  );

  // ドキュメントを閉じた時
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) => {
      collection.delete(doc.uri);
    }),
  );
}
