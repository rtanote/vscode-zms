import { test } from "node:test";
import * as assert from "node:assert";
import { getOpcodeSpec } from "../../src/player/zmd/ZmdOpcodes";

const empty = new Uint8Array(0);

test("MIDI-only opcodes ($FC/$FD) do not consume time", () => {
  for (const op of [0xfc, 0xfd]) {
    const spec = getOpcodeSpec(op, empty, 0);
    assert.strictEqual(spec.length, 3);
    assert.strictEqual(spec.consumesTime, false);
  }
});

test("depth-1/8 mod opcodes have the correct fixed length", () => {
  // spec zm12 §12.4: $EE = 18 bytes, $EF = 10 bytes
  assert.strictEqual(getOpcodeSpec(0xee, empty, 0).length, 18);
  assert.strictEqual(getOpcodeSpec(0xef, empty, 0).length, 10);
});

test("$FE (absnote) is 6 bytes and consumes time", () => {
  const spec = getOpcodeSpec(0xfe, empty, 0);
  assert.strictEqual(spec.length, 6);
  assert.strictEqual(spec.kind, "absnote");
  assert.strictEqual(spec.consumesTime, true);
});

test("$CE (forced replay J) is 2 bytes / other", () => {
  const spec = getOpcodeSpec(0xce, empty, 0);
  assert.strictEqual(spec.length, 2);
  assert.strictEqual(spec.kind, "other");
  assert.strictEqual(spec.consumesTime, false);
});

test("loop markers $C1/$C2/$C3/$C4 have distinct kinds", () => {
  assert.strictEqual(getOpcodeSpec(0xc1, empty, 0).kind, "loopStart");
  assert.strictEqual(getOpcodeSpec(0xc2, empty, 0).kind, "loopEnd");
  assert.strictEqual(getOpcodeSpec(0xc3, empty, 0).kind, "other");
  assert.strictEqual(getOpcodeSpec(0xc4, empty, 0).kind, "other");
});

test("$EA (Roland exclusive) with immediate $FF has length 2", () => {
  const bytes = new Uint8Array([0xea, 0xff]);
  const spec = getOpcodeSpec(0xea, bytes, 0);
  assert.strictEqual(spec.length, 2);
});

test("$EC with count == 0 has length 3 (header only)", () => {
  const bytes = new Uint8Array([0xec, 0x00, 0x00]);
  const spec = getOpcodeSpec(0xec, bytes, 0);
  assert.strictEqual(spec.length, 3);
});

test("undefined slots in each range return 'unknown'", () => {
  // $A4, $BA, $C6, $D4, $E4, $E5, $E7, $E9 are gaps in zm12.txt
  for (const op of [0xa4, 0xba, 0xc6, 0xd4, 0xe4, 0xe5, 0xe7, 0xe9]) {
    assert.strictEqual(getOpcodeSpec(op, empty, 0).kind, "unknown", `opcode $${op.toString(16)}`);
  }
});
