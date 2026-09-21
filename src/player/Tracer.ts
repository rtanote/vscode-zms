import * as vscode from "vscode";
import { lookup, type TrackMap } from "./zmd/SourceMap";

/**
 * トラック別のエディタ装飾管理
 * PlayerController から `setTracks` で SourceMap を渡され、
 * Webview の `position` メッセージを `updatePositions` で流し込む。
 */
export class Tracer implements vscode.Disposable {
  private decorationTypes: vscode.TextEditorDecorationType[] = [];
  private lineDecorationTypes: vscode.TextEditorDecorationType[] = [];
  private trackMaps = new Map<number, TrackMap>();
  private editor: vscode.TextEditor | undefined;
  private lastRanges = new Map<number, string>(); // trk → range signature (skip redundant updates)
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.reloadPalette();
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("zmusic.trace.palette")) this.reloadPalette();
      }),
    );
  }

  /** 再生開始時に呼ぶ。SourceMap の集合と、対象エディタを登録。 */
  setTracks(maps: Map<number, TrackMap>, editor: vscode.TextEditor): void {
    this.clear();
    this.trackMaps = maps;
    this.editor = editor;
  }

  /** Webview の position メッセージ (`p_data_pointer` 群) を反映。 */
  updatePositions(positions: { trk: number; ptr: number; state: number }[]): void {
    if (!this.editor) return;

    // トラック → 描画対象 Range
    const perTypeRanges = new Map<number, vscode.Range[]>();
    for (let i = 0; i < this.decorationTypes.length; i++) perTypeRanges.set(i, []);

    for (const p of positions) {
      const map = this.trackMaps.get(p.trk);
      if (!map || map.quality === "none") continue;
      // state != 0 は演奏していない (1=終了, -1=死亡, $7f=同期待ち, $99=停止中)
      if (p.state !== 0 && p.state !== 0x7f) continue;
      const range = lookup(map, p.ptr);
      if (!range) continue;
      const typeIndex = (p.trk - 1) % this.decorationTypes.length;
      perTypeRanges.get(typeIndex)!.push(range);
    }

    for (const [typeIndex, ranges] of perTypeRanges) {
      const sig = signatureOf(ranges);
      if (this.lastRanges.get(typeIndex) === sig) continue;
      this.lastRanges.set(typeIndex, sig);
      this.editor.setDecorations(this.decorationTypes[typeIndex], ranges);
      if (this.lineHighlightEnabled()) {
        this.editor.setDecorations(this.lineDecorationTypes[typeIndex], ranges);
      }
    }

    if (this.followCursorEnabled() && this.editor) {
      const primary = this.pickPrimaryRange(positions);
      if (primary) this.editor.revealRange(primary, vscode.TextEditorRevealType.Default);
    }
  }

  /** 装飾を消す (停止時 / 編集時)。 */
  clear(): void {
    if (this.editor) {
      for (const dt of this.decorationTypes) this.editor.setDecorations(dt, []);
      for (const dt of this.lineDecorationTypes) this.editor.setDecorations(dt, []);
    }
    this.lastRanges.clear();
  }

  dispose(): void {
    this.clear();
    for (const t of this.decorationTypes) t.dispose();
    for (const t of this.lineDecorationTypes) t.dispose();
    this.decorationTypes = [];
    this.lineDecorationTypes = [];
    for (const d of this.disposables) d.dispose();
  }

  // ── 内部 ────────────────────────────────────────────────

  private reloadPalette(): void {
    for (const t of this.decorationTypes) t.dispose();
    for (const t of this.lineDecorationTypes) t.dispose();
    this.decorationTypes = [];
    this.lineDecorationTypes = [];

    const palette = vscode.workspace
      .getConfiguration("zmusic")
      .get<string[]>("trace.palette", []);
    const colors = palette.length > 0 ? palette : DEFAULT_PALETTE;
    for (const color of colors) {
      this.decorationTypes.push(
        vscode.window.createTextEditorDecorationType({
          backgroundColor: color,
          borderRadius: "2px",
        }),
      );
      this.lineDecorationTypes.push(
        vscode.window.createTextEditorDecorationType({
          backgroundColor: fade(color, 0.15),
          isWholeLine: true,
        }),
      );
    }
    this.lastRanges.clear();
  }

  private lineHighlightEnabled(): boolean {
    return vscode.workspace.getConfiguration("zmusic").get<boolean>("trace.lineHighlight", true);
  }

  private followCursorEnabled(): boolean {
    return vscode.workspace.getConfiguration("zmusic").get<boolean>("trace.followCursor", false);
  }

  private pickPrimaryRange(
    positions: { trk: number; ptr: number; state: number }[],
  ): vscode.Range | undefined {
    // 最小トラック番号の演奏中トラック
    const playing = positions
      .filter((p) => p.state === 0 || p.state === 0x7f)
      .sort((a, b) => a.trk - b.trk);
    for (const p of playing) {
      const map = this.trackMaps.get(p.trk);
      if (!map) continue;
      const range = lookup(map, p.ptr);
      if (range) return range;
    }
    return undefined;
  }
}

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

function signatureOf(ranges: vscode.Range[]): string {
  return ranges
    .map((r) => `${r.start.line}:${r.start.character}-${r.end.line}:${r.end.character}`)
    .join("|");
}

/** rgba(r,g,b,a) を新しい alpha で書き直す (行ハイライトは薄く)。 */
function fade(rgba: string, newAlpha: number): string {
  const m = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*[\d.]+\s*\)$/.exec(rgba);
  if (!m) return rgba;
  return `rgba(${m[1]},${m[2]},${m[3]},${newAlpha})`;
}
