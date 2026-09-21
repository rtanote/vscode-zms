import { test } from "node:test";
import * as assert from "node:assert";
import * as vscode from "vscode";
import { buildTrackMap, lookup } from "../../src/player/zmd/SourceMap";
import type { ZmdCommand } from "../../src/player/zmd/ZmdDisassembler";
import type { SourceToken } from "../../src/player/zms/ZmsParser";

const note = (offset: number, length = 3): ZmdCommand => ({
  offset,
  length,
  opcode: 0x30,
  kind: "note",
  consumesTime: true,
});

const other = (offset: number, length = 3): ZmdCommand => ({
  offset,
  length,
  opcode: 0x90,
  kind: "other",
  consumesTime: false,
});

const tok = (line: number, start: number, end: number): SourceToken => ({
  kind: "note",
  lineIndex: line,
  range: new vscode.Range(line, start, line, end),
});

test("exact quality when timed-command count == source-token count", () => {
  const zmd = [note(0), other(3), note(6), note(9)];
  const src = [tok(0, 4, 6), tok(0, 6, 8), tok(0, 8, 10)];
  const map = buildTrackMap(1, 0x100, zmd, src);
  assert.strictEqual(map.quality, "exact");
  assert.strictEqual(map.entries.length, 3);
  assert.strictEqual(map.entries[0].endOffset, 3);
  assert.strictEqual(map.entries[1].endOffset, 9);
  assert.strictEqual(map.entries[2].endOffset, 12);
});

test("lineApprox quality when counts differ", () => {
  const zmd = [note(0), note(3), note(6), note(9)];
  const src = [tok(0, 4, 6), tok(1, 4, 6)]; // 2 tokens, 4 timed commands → mismatch
  const map = buildTrackMap(1, 0x100, zmd, src);
  assert.strictEqual(map.quality, "lineApprox");
  assert.strictEqual(map.entries.length, 2);
});

test("lookup: returns null for empty map", () => {
  const map = buildTrackMap(1, 0x100, [], []);
  assert.strictEqual(lookup(map, 0x100), null);
});

test("lookup: returns null when ptr is before any entry", () => {
  const zmd = [note(10), note(13)];
  const src = [tok(0, 0, 2), tok(0, 3, 5)];
  const map = buildTrackMap(1, 0x100, zmd, src);
  // ptr at 0x100 → rel = 0, no entry with endOffset <= 0
  assert.strictEqual(lookup(map, 0x100), null);
});

test("lookup: returns last matching entry (binary search)", () => {
  const zmd = [note(0), note(3), note(6), note(9), note(12)];
  const src = [tok(0, 0, 2), tok(0, 2, 4), tok(0, 4, 6), tok(0, 6, 8), tok(0, 8, 10)];
  const map = buildTrackMap(1, 0x100, zmd, src);
  // ptr = 0x100 + 7 → rel = 7 → largest endOffset <= 7 is entry[1] (endOffset=6)
  const r = lookup(map, 0x100 + 7);
  assert.ok(r);
  assert.strictEqual(r!.start.character, 2);
});

test("lookup: boundary — ptr exactly at endOffset selects that entry", () => {
  const zmd = [note(0), note(3), note(6)];
  const src = [tok(0, 0, 2), tok(0, 2, 4), tok(0, 4, 6)];
  const map = buildTrackMap(1, 0x100, zmd, src);
  // rel = 6 → endOffset 6 (entry[1]) matches; entry[2] has endOffset 9 (>6)
  const r = lookup(map, 0x100 + 6);
  assert.ok(r);
  assert.strictEqual(r!.start.character, 2);
});

test("lookup: past the last entry returns the last entry", () => {
  const zmd = [note(0), note(3)];
  const src = [tok(0, 0, 2), tok(0, 2, 4)];
  const map = buildTrackMap(1, 0x100, zmd, src);
  const r = lookup(map, 0x100 + 999);
  assert.ok(r);
  assert.strictEqual(r!.start.character, 2);
});
