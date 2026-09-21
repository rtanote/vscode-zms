import { test } from "node:test";
import * as assert from "node:assert";
import { disassemble, ZmdDisassemblyError } from "../../src/player/zmd/ZmdDisassembler";

test("simple note sequence terminated by $FF", () => {
  // c4 (note 0x24=36, step 4, gate 4), r8 ($80 step 8 gate 8), $FF
  const bytes = new Uint8Array([0x24, 0x04, 0x04, 0x80, 0x08, 0x08, 0xff]);
  const cmds = disassemble(bytes);
  assert.strictEqual(cmds.length, 3);
  assert.deepStrictEqual(cmds[0], {
    offset: 0,
    length: 3,
    opcode: 0x24,
    kind: "note",
    consumesTime: true,
  });
  assert.deepStrictEqual(cmds[1], {
    offset: 3,
    length: 3,
    opcode: 0x80,
    kind: "rest",
    consumesTime: true,
  });
  assert.deepStrictEqual(cmds[2], {
    offset: 6,
    length: 1,
    opcode: 0xff,
    kind: "end",
    consumesTime: false,
  });
});

test("stops at $FF, ignores trailing bytes", () => {
  const bytes = new Uint8Array([0xff, 0xde, 0xad, 0xbe, 0xef]);
  const cmds = disassemble(bytes);
  assert.strictEqual(cmds.length, 1);
  assert.strictEqual(cmds[0].kind, "end");
});

test("$EA contains inner $FF terminator — not confused with track end", () => {
  // Roland exclusive: $EA, data..., checksum, $FF  then real note then track-end $FF
  const bytes = new Uint8Array([0xea, 0x41, 0x30, 0x10, 0x00, 0x7f, 0xff, 0x30, 0x04, 0x04, 0xff]);
  const cmds = disassemble(bytes);
  assert.strictEqual(cmds.length, 3);
  assert.strictEqual(cmds[0].opcode, 0xea);
  assert.strictEqual(cmds[0].length, 7); // $EA + 5 payload + $FF
  assert.strictEqual(cmds[1].opcode, 0x30); // note after
  assert.strictEqual(cmds[2].opcode, 0xff); // real track end
});

test("$E6 with $FF-valued parameter must not be treated as track end (GAVOTTE.ZMS repro)", () => {
  // $E6 (mod depth) is a 3-byte opcode. Real repro from GAVOTTE.ZMS had the
  // very first opcode as $E6 with $FF in parameter position — the old
  // webview-side .indexOf(0xff) truncation cut the buffer to 2 bytes and
  // the disassembler then failed with "3 bytes needed, 2 remain".
  const bytes = new Uint8Array([0xe6, 0xff, 0x40, 0x30, 0x04, 0x04, 0xff]);
  const cmds = disassemble(bytes);
  assert.strictEqual(cmds.length, 3);
  assert.strictEqual(cmds[0].opcode, 0xe6);
  assert.strictEqual(cmds[0].length, 3);
  assert.strictEqual(cmds[1].opcode, 0x30); // note that follows
  assert.strictEqual(cmds[2].opcode, 0xff); // real track end
});

test("$EC MIDI data with count.W is skipped correctly", () => {
  // $EC, count=3, 3 data bytes, then $FF
  const bytes = new Uint8Array([0xec, 0x00, 0x03, 0x90, 0x40, 0x60, 0xff]);
  const cmds = disassemble(bytes);
  assert.strictEqual(cmds.length, 2);
  assert.strictEqual(cmds[0].opcode, 0xec);
  assert.strictEqual(cmds[0].length, 6);
  assert.strictEqual(cmds[1].opcode, 0xff);
});

test("unknown opcode throws ZmdDisassemblyError with offset", () => {
  const bytes = new Uint8Array([0x30, 0x04, 0x04, 0xa4, 0xff]);
  //                                             ^^^^ $A4 is undefined
  assert.throws(
    () => disassemble(bytes),
    (err: unknown) => {
      if (!(err instanceof ZmdDisassemblyError)) return false;
      assert.strictEqual(err.offset, 3);
      assert.strictEqual(err.opcode, 0xa4);
      return true;
    },
  );
});

test("truncated fixed-length opcode throws", () => {
  // $E0 needs 12 bytes but only 5 provided
  const bytes = new Uint8Array([0xe0, 0x01, 0x02, 0x03, 0x04]);
  assert.throws(() => disassemble(bytes), ZmdDisassemblyError);
});

test("counts consumesTime commands correctly", () => {
  // note ($30), other ($90 tempo), rest ($80), wait ($D0), $FF
  const bytes = new Uint8Array([
    0x30, 0x04, 0x04, // note
    0x90, 0x01, 0x00, // @T (not timed)
    0x80, 0x04, 0x04, // rest (timed)
    0xd0, 0x04, 0x00, // @W wait (timed)
    0xff,
  ]);
  const cmds = disassemble(bytes);
  const timed = cmds.filter((c) => c.consumesTime);
  assert.strictEqual(timed.length, 3);
});
