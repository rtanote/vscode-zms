import * as vscode from "vscode";

/**
 * ZMUSIC.X のコンパイルエラーを Problems パネルに表示
 * DiagnosticCollection 名は 'zmusic' (静的リント 'zms-lint' と分離)。
 *
 * メッセージ書式 (zm11 §11.2 タグファイル形式):
 *   `<file>? <line> <msg> (No.<n>)?`
 *
 * `_zmusic_copy` 経由のメッセージ書式は `zmusic -c` と異なる可能性があるため、
 * 正規表現に一致しない行はまとめて 0 行目に Diagnostic を作る。
 */
export class Diagnostics implements vscode.Disposable {
  private readonly collection: vscode.DiagnosticCollection;

  static readonly TAG_LINE_RE =
    /^\s*(?<file>\S+?)?\s+(?<line>\d+)\s+(?<msg>.+?)(?:\s*\(No\.(?<no>\d+)\))?\s*$/;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection("zmusic");
  }

  clear(): void {
    this.collection.clear();
  }

  /**
   * 蓄積したドライバ出力 (bPrint) を解析し、対象ドキュメントに Diagnostic をセット。
   */
  reportRawLog(uri: vscode.Uri, log: string): void {
    const diagnostics: vscode.Diagnostic[] = [];
    const orphanLines: string[] = [];

    for (const raw of log.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const m = Diagnostics.TAG_LINE_RE.exec(line);
      if (m && m.groups) {
        const lineNo = Math.max(0, parseInt(m.groups.line ?? "1", 10) - 1);
        const message = (m.groups.msg ?? line).trim();
        const range = new vscode.Range(lineNo, 0, lineNo, Number.MAX_SAFE_INTEGER);
        const d = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
        d.source = "zmusic";
        if (m.groups.no) d.code = `No.${m.groups.no}`;
        diagnostics.push(d);
      } else {
        orphanLines.push(line);
      }
    }

    if (orphanLines.length > 0) {
      const range = new vscode.Range(0, 0, 0, 0);
      const d = new vscode.Diagnostic(
        range,
        orphanLines.join("\n"),
        vscode.DiagnosticSeverity.Error,
      );
      d.source = "zmusic";
      diagnostics.push(d);
    }

    this.collection.set(uri, diagnostics);
  }

  dispose(): void {
    this.collection.dispose();
  }
}
