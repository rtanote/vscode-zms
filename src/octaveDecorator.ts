import * as vscode from "vscode";
import { findLineCommentStart } from "./lineComment";

/**
 * オクターブ token (`o5`, `o-1`, `<`, `>`) を青系 (#3F51FF) で強制表示する
 * 装飾。grammar は `keyword.control.octave.zmusic` scope を割り当てるので
 * theme customization からも触れるが、こちらの装飾がデフォルト値を上書きする。
 *
 * 色は純青 #0000FF ではなく若干明度を持ち上げた #3F51FF で、dark theme でも
 * ある程度読みやすく、light theme でも青と識別可能。
 */
export class OctaveDecorator implements vscode.Disposable {
  private readonly decoration: vscode.TextEditorDecorationType;
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    this.decoration = vscode.window.createTextEditorDecorationType({
      color: "#3F51FF",
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
    // `o` + 符号 + 1 桁以上の数字、または `<` / `>` を単独。
    const re = /o-?[0-9]+|[<>]/gi;
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
