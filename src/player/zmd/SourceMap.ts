import * as vscode from "vscode";
import type { ZmdCommand } from "./ZmdDisassembler";
import type { SourceToken } from "../zms/ZmsParser";

/**
 * ZMD ↔ ZMS の整列と ptr → Range 逆引き
 *
 * 構築規則:
 *   Z = ZmdCommand[].filter(c => c.consumesTime)
 *   S = SourceToken[]
 *   Z.length === S.length なら quality='exact'。
 *   entries[i] = { endOffset: Z[i].offset + Z[i].length, range: S[i].range }
 *
 *   不一致なら quality='lineApprox':
 *     S を lineIndex でグルーピング。Z を行数で比例配分し、各行に属する Z の
 *     終端オフセットを、その行の SourceToken の全域を包む Range に対応付ける。
 *
 * lookup(map, ptr): rel = ptr - zmdStart + PTR_ADJUST。
 * entries は endOffset 昇順に並んでいるので二分探索で endOffset <= rel の最大要素を返す。
 */

export interface TrackMap {
  trk: number;
  zmdStart: number;
  entries: { endOffset: number; range: vscode.Range }[];
  quality: "exact" | "lineApprox" | "none";
}

/**
 * `p_data_pointer` が「次に実行するコマンド」を指すか「今実行中のコマンド」を
 * 指すかは Phase0 試作で試行済み
 * 現在の想定は「次コマンド」で 0。実測でずれた場合は VS Code 設定
 * `zmusic.trace.ptrAdjust` で上書きできる (負値可)。
 * lookup() は呼び出し時にこの値を読むので、設定変更は即座に反映される。
 */
export const DEFAULT_PTR_ADJUST = 0;

let currentPtrAdjust = DEFAULT_PTR_ADJUST;

/** 呼び出し側 (Tracer / PlayerController 等) が VS Code 設定から取り出して反映する。 */
export function setPtrAdjust(value: number): void {
  currentPtrAdjust = Number.isFinite(value) ? value : DEFAULT_PTR_ADJUST;
}

export function getPtrAdjust(): number {
  return currentPtrAdjust;
}

export function buildTrackMap(
  trk: number,
  zmdStart: number,
  zmdCommands: ZmdCommand[],
  sourceTokens: SourceToken[],
): TrackMap {
  const timed = zmdCommands.filter((c) => c.consumesTime);

  if (timed.length === 0 && sourceTokens.length === 0) {
    return { trk, zmdStart, entries: [], quality: "exact" };
  }

  if (timed.length === sourceTokens.length) {
    const entries = timed.map((c, i) => ({
      endOffset: c.offset + c.length,
      range: sourceTokens[i].range,
    }));
    return { trk, zmdStart, entries, quality: "exact" };
  }

  // lineApprox: proportionally distribute Z across ZMS lines.
  const linesInS = groupTokensByLine(sourceTokens);
  if (linesInS.length === 0) {
    return { trk, zmdStart, entries: [], quality: "none" };
  }

  const entries: { endOffset: number; range: vscode.Range }[] = [];
  for (let li = 0; li < linesInS.length; li++) {
    const lo = Math.floor((li * timed.length) / linesInS.length);
    const hi = Math.floor(((li + 1) * timed.length) / linesInS.length);
    if (hi <= lo) continue;
    const lastCmd = timed[hi - 1];
    entries.push({
      endOffset: lastCmd.offset + lastCmd.length,
      range: linesInS[li].fullRange,
    });
  }

  entries.sort((a, b) => a.endOffset - b.endOffset);
  return { trk, zmdStart, entries, quality: "lineApprox" };
}

function groupTokensByLine(
  tokens: SourceToken[],
): { lineIndex: number; fullRange: vscode.Range }[] {
  const byLine = new Map<number, vscode.Range[]>();
  for (const t of tokens) {
    const arr = byLine.get(t.lineIndex) ?? [];
    arr.push(t.range);
    byLine.set(t.lineIndex, arr);
  }
  const out: { lineIndex: number; fullRange: vscode.Range }[] = [];
  for (const [lineIndex, ranges] of byLine) {
    const start = ranges.reduce((a, r) => (r.start.isBefore(a) ? r.start : a), ranges[0].start);
    const end = ranges.reduce((a, r) => (r.end.isAfter(a) ? r.end : a), ranges[0].end);
    out.push({ lineIndex, fullRange: new vscode.Range(start, end) });
  }
  out.sort((a, b) => a.lineIndex - b.lineIndex);
  return out;
}

export function lookup(map: TrackMap, ptr: number): vscode.Range | null {
  if (map.entries.length === 0) return null;
  const rel = ptr - map.zmdStart + currentPtrAdjust;

  // Binary search: largest entry with endOffset <= rel.
  let lo = 0;
  let hi = map.entries.length - 1;
  let result: vscode.Range | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (map.entries[mid].endOffset <= rel) {
      result = map.entries[mid].range;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}
