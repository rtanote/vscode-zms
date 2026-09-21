// vscode.TextDocument の最小スタブ。ZmsParser が呼ぶ API のみを実装。
import * as vscode from "vscode";

export function mockDoc(text: string): vscode.TextDocument {
  const lines = text.split(/\r?\n/);
  return {
    lineCount: lines.length,
    lineAt(lineOrPosition: number | vscode.Position) {
      const i = typeof lineOrPosition === "number" ? lineOrPosition : lineOrPosition.line;
      const t = lines[i] ?? "";
      return {
        text: t,
        lineNumber: i,
        range: new vscode.Range(i, 0, i, t.length),
        rangeIncludingLineBreak: new vscode.Range(i, 0, i, t.length),
        firstNonWhitespaceCharacterIndex: t.search(/\S/),
        isEmptyOrWhitespace: /^\s*$/.test(t),
      } as vscode.TextLine;
    },
    getText() {
      return text;
    },
  } as unknown as vscode.TextDocument;
}
