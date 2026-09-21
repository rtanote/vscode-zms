import { test } from "node:test";
import * as assert from "node:assert";
import { getOpcodeSpec } from "../../src/player/zmd/ZmdOpcodes";

const empty = new Uint8Array(0);

test("note range $00-$7F is always 3 bytes / note / consumesTime", () => {
  for (const op of [0x00, 0x40, 0x7f]) {
    const spec = getOpcodeSpec(op, empty, 0);
    assert.strictEqual(spec.length, 3);
    assert.strictEqual(spec.kind, "note");
    assert.strictEqual(spec.consumesTime, true);
  }
});

test("known fixed opcodes have correct length + kind", () => {
  const cases: [number, number, string, boolean][] = [
    [0x80, 3, "rest", true],
    [0x82, 1, "other", false],
    [0x90, 3, "other", false], // @T
    [0xa0, 2, "other", false], // voice change
    [0xb0, 1, "other", false], // pan 0
    [0xb5, 3, "other", false], // Y command
    [0xc0, 2, "other", false], // [~]
    [0xc1, 3, "loopStart", false], // |:
    [0xc2, 3, "loopEnd", false], // :|
    [0xc3, 4, "other", false], // | skip #1
    [0xd0, 3, "wait", true], // @W
    [0xe0, 12, "portamento", true], // (~)
    [0xe2, 14, "chord", true], // '~'
    [0xe3, 9, "other", false], // aftertouch seq
    [0xeb, 4, "other", false], // ID set
    [0xed, 4, "other", false], // effect control
    [0xee, 18, "other", false], // pitch mod 1/8
    [0xef, 10, "other", false], // amp mod 1/8
    [0xf0, 1, "other", false], // NOP
    [0xfe, 6, "absnote", true], // *n abs len
    [0xff, 1, "end", false], // track end
  ];
  for (const [op, len, kind, timed] of cases) {
    const spec = getOpcodeSpec(op, empty, 0);
    assert.strictEqual(spec.length, len, `opcode $${op.toString(16)}: length`);
    assert.strictEqual(spec.kind, kind, `opcode $${op.toString(16)}: kind`);
    assert.strictEqual(spec.consumesTime, timed, `opcode $${op.toString(16)}: consumesTime`);
  }
});

test("$EA (Roland exclusive) length = payload up to and including terminating $FF", () => {
  // $EA, 0x01, 0x02, 0x03, checksum=0x7F, $FF → length 6
  const bytes = new Uint8Array([0xea, 0x01, 0x02, 0x03, 0x7f, 0xff]);
  const spec = getOpcodeSpec(0xea, bytes, 0);
  assert.strictEqual(spec.length, 6);
  assert.strictEqual(spec.kind, "other");
});

test("$EC (MIDI data) length = 3 + count, big-endian word", () => {
  // $EC, count = 5 (0x00 0x05), then 5 bytes of data
  const bytes = new Uint8Array([0xec, 0x00, 0x05, 0xaa, 0xbb, 0xcc, 0xdd, 0xee]);
  const spec = getOpcodeSpec(0xec, bytes, 0);
  assert.strictEqual(spec.length, 8);
});

test("$EC with large count > 255 respects big-endian word", () => {
  // count = 258 (0x01 0x02)
  const bytes = new Uint8Array(3 + 258);
  bytes[0] = 0xec;
  bytes[1] = 0x01;
  bytes[2] = 0x02;
  const spec = getOpcodeSpec(0xec, bytes, 0);
  assert.strictEqual(spec.length, 3 + 258);
});

test("unknown opcode returns 'unknown' kind", () => {
  // $A4 is not defined in zm12
  const spec = getOpcodeSpec(0xa4, empty, 0);
  assert.strictEqual(spec.kind, "unknown");
});

test("$EA without terminating $FF returns 'unknown' (truncated)", () => {
  const bytes = new Uint8Array([0xea, 0x01, 0x02]);
  const spec = getOpcodeSpec(0xea, bytes, 0);
  assert.strictEqual(spec.kind, "unknown");
});
