import * as vscode from "vscode";
import { findLineCommentStart } from "./lineComment";

/**
 * 制御フロー系 token (リピート `|:n` `:|` `|n`、ナビゲーション `[Coda]` `[Segno]`
 * `[D.S.]` `[K.SIGN ...]` 等) に bold を上書きする装飾。色は grammar 側で
 * `entity.name.tag.navigation.zmusic` scope に統一済みなので、theme が
 * 割り当てた色をそのまま尊重する — ここでは font-weight bold のみ足す。
 *
 * TextMate grammar には font-weight を強制する手段が無く、theme に依存
 * するのでも安定しない (theme によっては italic を割り当てる場合もある)。
 * TextEditorDecorationType なら確実に bold にできる。
 */
export class FlowControlDecorator implements vscode.Disposable {
  private readonly decoration: vscode.TextEditorDecorationType;
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    // 鮮やか目の黄緑 rgb(132, 244, 132) を bold と合わせて適用。
    // grammar 側の entity.name.tag.navigation.zmusic scope が theme 側で
    // どんな色になっていても、この装飾で上書きするので theme を跨いで一貫。
    this.decoration = vscode.window.createTextEditorDecorationType({
      color: "#84F484",
      fontWeight: "bold",
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
    // Non-nested な [...] ブロック全体。中身の空白・カンマも一緒に bold にする。
    // リピート `|:n` `:|` `|n`、および単独 `|` (小節線/システム内区切り) も含む。
    // 順序: 長いパターン (|:n, |n) を先に、単独 | を最後にして誤 match を防ぐ。
    const re = /\[[^\]\n]*\]|\|:[0-9]*|:\||\|[0-9]+|\|/g;
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
