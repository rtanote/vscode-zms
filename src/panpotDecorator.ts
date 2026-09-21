import * as vscode from "vscode";
import { findLineCommentStart } from "./lineComment";

/**
 * パンポット token (`p0`〜`p3`、`@p0`〜`@p127`) を黄色で強制表示する装飾。
 * grammar 側で `variable.parameter.panpot.zmusic` scope を独立させてあるので、
 * 用途に応じて `editor.tokenColorCustomizations` からユーザが差し替えることも可能。
 */
export class PanpotDecorator implements vscode.Disposable {
  private readonly decoration: vscode.TextEditorDecorationType;
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    this.decoration = vscode.window.createTextEditorDecorationType({
      color: "#FFD700",
    });
    this.disposables.push(
      this.decoration,
      vscode.window.onDidChangeVisibleTextEditors(() => this.updateAll()),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.languageId === "zms") this.updateForDoc(e.document);
      }),
      vscode.workspace.onDidOpenTextDocument((doc) => {
        if (doc.languageId === "zms") this.updateForDoc(doc);
      }),
    );
    this.updateAll();
  }

  private updateAll(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.languageId === "zms") this.updateEditor(editor);
    }
  }

  private updateForDoc(doc: vscode.TextDocument): void {
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document === doc) this.updateEditor(editor);
    }
  }

  private updateEditor(editor: vscode.TextEditor): void {
    const ranges: vscode.Range[] = [];
    const doc = editor.document;
    // `@P` + digits (詳細パンポット、0-127) を先にマッチさせないと単独 `p` +
    // digits と競合する。lookbehind で `p` 単体は先行 letter が無いときだけ拾う。
    const re = /@p[0-9]+|(?<![a-zA-Z_])p[0-9]+/gi;
    for (let li = 0; li < doc.lineCount; li++) {
      const raw = doc.lineAt(li).text;
      const commentAt = findLineCommentStart(raw);
      const text = commentAt >= 0 ? raw.slice(0, commentAt) : raw;
      let m: RegExpExecArray | null;
      re.lastIndex = 0;
      while ((m = re.exec(text)) !== null) {
        ranges.push(new vscode.Range(li, m.index, li, m.index + m[0].length));
      }
    }
    editor.setDecorations(this.decoration, ranges);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
