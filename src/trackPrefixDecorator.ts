import * as vscode from "vscode";
import { findLineCommentStart } from "./lineComment";

const DEFAULT_PALETTE = [
  "rgba(255,170,0,0.45)",
  "rgba(80,200,255,0.45)",
  "rgba(150,255,120,0.45)",
  "rgba(255,120,200,0.45)",
  "rgba(200,160,255,0.45)",
  "rgba(255,230,90,0.45)",
  "rgba(120,255,230,0.45)",
  "rgba(255,140,110,0.45)",
];

/** (t1) 等トラック prefix の文字色を、`zmusic.trace.palette` の per-track 色で
 * 塗る TextEditor 装飾管理。Tracer / SheetMusic の音符色と同期させることで、
 * ドキュメント上の「どのトラックの MML か」が一目で分かるようになる。 */
export class TrackPrefixDecorator implements vscode.Disposable {
  private decorationTypes: vscode.TextEditorDecorationType[] = [];
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.reloadPalette();
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("zmusic.trace.palette")) {
          this.reloadPalette();
          this.updateAll();
        }
      }),
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

  private reloadPalette(): void {
    for (const dt of this.decorationTypes) dt.dispose();
    this.decorationTypes = [];
    const configured = vscode.workspace
      .getConfiguration("zmusic")
      .get<string[]>("trace.palette", []);
    const source = configured.length > 0 ? configured : DEFAULT_PALETTE;
    // Tracer は背景装飾なので alpha 0.45 で薄くしているが、こちらは
    // 文字色 (前景) なので同じ透明度だと読めない。alpha を持ち上げる。
    for (const color of source) {
      this.decorationTypes.push(
        vscode.window.createTextEditorDecorationType({
          color: boostAlpha(color, 0.95),
          fontWeight: "bold",
        }),
      );
    }
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
    const N = this.decorationTypes.length;
    if (N === 0) return;
    const rangesByColor: vscode.Range[][] = Array.from({ length: N }, () => []);
    // `(t 1 , 2 , ...)` を許容 (空白許容、大文字小文字不問)。先頭の track 番号で
    // 色を決めるので、複数 track prefix (t1,5) は最若番 (1) の色で塗る。
    const re = /\(\s*[tT]\s*(\d+)(?:\s*,\s*\d+)*\s*\)/g;
    const doc = editor.document;
    for (let li = 0; li < doc.lineCount; li++) {
      const raw = doc.lineAt(li).text;
      const commentAt = findLineCommentStart(raw);
      const text = commentAt >= 0 ? raw.slice(0, commentAt) : raw;
      let m: RegExpExecArray | null;
      re.lastIndex = 0;
      while ((m = re.exec(text)) !== null) {
        const trk = parseInt(m[1], 10);
        if (!Number.isFinite(trk) || trk < 1) continue;
        const idx = (trk - 1) % N;
        rangesByColor[idx].push(new vscode.Range(li, m.index, li, m.index + m[0].length));
      }
    }
    for (let i = 0; i < N; i++) {
      editor.setDecorations(this.decorationTypes[i], rangesByColor[i]);
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    for (const dt of this.decorationTypes) dt.dispose();
    this.decorationTypes = [];
  }
}

/** `rgba(r,g,b,a)` の alpha を書き換える。パレットの背景用 0.45 を前景用 0.95 等に持ち上げる。 */
function boostAlpha(rgba: string, newAlpha: number): string {
  const m = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*[\d.]+\s*\)$/.exec(rgba);
  if (!m) return rgba;
  return `rgba(${m[1]},${m[2]},${m[3]},${newAlpha})`;
}
