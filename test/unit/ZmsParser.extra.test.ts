import { test } from "node:test";
import * as assert from "node:assert";
import { parseZms } from "../../src/player/zms/ZmsParser";
import { mockDoc } from "../mockDoc";

test("(T1,2,3) with capital T is treated the same as (t1,2,3)", () => {
  const map = parseZms(mockDoc("(T1,2,3)c4"));
  assert.strictEqual(map.get(1)?.length, 1);
  assert.strictEqual(map.get(2)?.length, 1);
  assert.strictEqual(map.get(3)?.length, 1);
});

test("comment / inside a chord literal is not treated as line comment", () => {
  // '/' would otherwise cut the line, but findCommentStart skips inside '...'
  const map = parseZms(mockDoc("(t1)'a/b'c4"));
  const t1 = map.get(1);
  assert.deepStrictEqual(
    t1?.map((t) => t.kind),
    ["chord", "note"],
  );
});

test("comment / inside portamento parens is skipped", () => {
  const map = parseZms(mockDoc("(t1)(c/d)e4"));
  const t1 = map.get(1);
  assert.deepStrictEqual(
    t1?.map((t) => t.kind),
    ["portamento", "note"],
  );
});

test("accidentals (# + -) do not create extra tokens", () => {
  const map = parseZms(mockDoc("(t1)c#4d+8e-16"));
  const t1 = map.get(1);
  assert.strictEqual(t1?.length, 3);
});

test("dotted length c4. is one token", () => {
  const map = parseZms(mockDoc("(t1)c4."));
  assert.strictEqual(map.get(1)?.length, 1);
});

test("multi-line MML with (t1) followed by (t2) tracks separately", () => {
  const map = parseZms(
    mockDoc(["(t1)c4d4", "(t2)e4f4"].join("\n")),
  );
  assert.strictEqual(map.get(1)?.length, 2);
  assert.strictEqual(map.get(2)?.length, 2);
});

test("(t1,2) then bare line: continuation goes to both t1 and t2", () => {
  const map = parseZms(
    mockDoc(["(t1,2)c4", "d4"].join("\n")),
  );
  assert.strictEqual(map.get(1)?.length, 2);
  assert.strictEqual(map.get(2)?.length, 2);
});

test("case-insensitive: (T1) A4 R4 works", () => {
  const map = parseZms(mockDoc("(T1)A4R4"));
  const t1 = map.get(1);
  assert.deepStrictEqual(
    t1?.map((t) => t.kind),
    ["note", "rest"],
  );
});

test("empty MML body after (t1) line produces no tokens", () => {
  const map = parseZms(mockDoc("(t1)"));
  // Might be undefined or empty
  assert.strictEqual((map.get(1) ?? []).length, 0);
});

test("unclosed chord literal stops tokenizer without crash", () => {
  // Second quote missing — should not throw or hang
  const map = parseZms(mockDoc("(t1)'ceg c4"));
  // Behavior: no tokens after the unclosed chord open
  const t1 = map.get(1) ?? [];
  assert.ok(t1.length <= 1);
});
