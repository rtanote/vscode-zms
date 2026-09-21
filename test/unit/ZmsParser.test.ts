import { test } from "node:test";
import * as assert from "node:assert";
import { parseZms } from "../../src/player/zms/ZmsParser";
import { mockDoc } from "../mockDoc";

test("simple (t1) line produces one token list", () => {
  const map = parseZms(mockDoc("(t1)c4d4e4"));
  const t1 = map.get(1);
  assert.ok(t1);
  assert.strictEqual(t1!.length, 3);
  assert.deepStrictEqual(
    t1!.map((t) => t.kind),
    ["note", "note", "note"],
  );
});

test("(t1,2,...)[k.sign +f,+c,+g,+d] emits zero tokens (GAVOTTE.ZMS repro)", () => {
  // The bracketed key-signature declaration contains letters that look
  // like MML notes (g in "sign", f/c/g/d after '+') but Z-MUSIC treats
  // [K.SIGN ...] as an untimed declaration — none of them should be
  // tokenized. Real repro from GAVOTTE.ZMS where all 8 tracks got the
  // same +5 spurious tokens because the line prefix was (t1,2,...,8).
  const map = parseZms(mockDoc("(t1,2,3,4,5,6,7,8)[k.sign +f,+c,+g,+d] @m-1 @s2"));
  for (let trk = 1; trk <= 8; trk++) {
    assert.strictEqual(map.get(trk)?.length ?? 0, 0, `track ${trk} should have 0 tokens`);
  }
});

test("[do] navigation marker emits zero tokens", () => {
  const map = parseZms(mockDoc("(t1)c4 [do] d4 [loop]"));
  const t1 = map.get(1) ?? [];
  assert.strictEqual(t1.length, 2, "only c4 and d4 count; markers are untimed");
  assert.deepStrictEqual(t1.map((t) => t.kind), ["note", "note"]);
});

test("@X control commands don't leak the letter as a note", () => {
  // @c (chorus?) @a (amp mod?) @b (bend switch) etc. previously slipped
  // through as spurious notes because only @W was recognized. Trace a real
  // repro: (t2)@6v11@k1@c%1010@s,2@a10@m10 L16o5d+d+ — expected 2 timed
  // tokens (d+ d+), not 4 (@c-c, @a-a, d+, d+).
  const map = parseZms(mockDoc("(t2)@6v11@k1@c%1010@s,2@a10@m10 L16o5d+d+"));
  const t2 = map.get(2) ?? [];
  assert.strictEqual(t2.length, 2);
  assert.deepStrictEqual(t2.map((t) => t.kind), ["note", "note"]);
});

test("@W with length spec is a wait token, @F with digits is skipped", () => {
  const map = parseZms(mockDoc("(t1)@F3 @w4 c4 @w*192 d4"));
  const t1 = map.get(1) ?? [];
  // @F3 skipped, @w4 wait, c4 note, @w*192 wait, d4 note
  assert.deepStrictEqual(t1.map((t) => t.kind), ["wait", "note", "wait", "note"]);
});

test("*n length suffix (c*48, r*96, b*386) does not truncate token range", () => {
  const map = parseZms(mockDoc("(t1)c*48 r*96 b*386"));
  const t1 = map.get(1) ?? [];
  assert.strictEqual(t1.length, 3);
  assert.deepStrictEqual(t1.map((t) => t.kind), ["note", "rest", "note"]);
  // token range should include the *n suffix so highlight covers "c*48" fully
  const c = t1[0];
  assert.strictEqual(c.range.end.character - c.range.start.character, 4, "c*48 = 4 chars");
});

test("! (natural) is part of the accidental cluster", () => {
  const map = parseZms(mockDoc("(t1)c!4 d!"));
  const t1 = map.get(1) ?? [];
  assert.strictEqual(t1.length, 2);
  // c!4 = 3 chars including natural + length
  assert.strictEqual(t1[0].range.end.character - t1[0].range.start.character, 3);
});

test("(t1,2) shares tokens across both tracks", () => {
  const map = parseZms(mockDoc("(t1,2)c4"));
  assert.strictEqual(map.get(1)?.length, 1);
  assert.strictEqual(map.get(2)?.length, 1);
});

test("^ length concatenation is one token; & tie splits into two", () => {
  const single = parseZms(mockDoc("(t1)c4^8"));
  assert.strictEqual(single.get(1)?.length, 1);

  const tied = parseZms(mockDoc("(t1)c4&d4"));
  assert.strictEqual(tied.get(1)?.length, 2);
});

test("chord '~' is one token even with inner note letters", () => {
  const map = parseZms(mockDoc("(t1)'ceg'"));
  const t1 = map.get(1);
  assert.strictEqual(t1?.length, 1);
  assert.strictEqual(t1?.[0].kind, "chord");
});

test("portamento (~) mid-line is one token, not a track prefix", () => {
  const map = parseZms(mockDoc("(t1)c4(c e)d4"));
  const t1 = map.get(1);
  assert.ok(t1);
  assert.deepStrictEqual(
    t1!.map((t) => t.kind),
    ["note", "portamento", "note"],
  );
});

test("@w<n> emits wait token; parameter chars around it are skipped", () => {
  const map = parseZms(mockDoc("(t1)v10@w48c4"));
  const t1 = map.get(1);
  assert.ok(t1);
  assert.deepStrictEqual(
    t1!.map((t) => t.kind),
    ["wait", "note"],
  );
});

test("*n absnote emits one absnote token", () => {
  const map = parseZms(mockDoc("(t1)*48c"));
  const t1 = map.get(1);
  assert.strictEqual(t1?.length, 1);
  assert.strictEqual(t1?.[0].kind, "absnote");
});

test("comments after / are stripped", () => {
  const map = parseZms(mockDoc("(t1)c4 / this is c'e'g comment"));
  const t1 = map.get(1);
  assert.strictEqual(t1?.length, 1);
});

test(".comment and other dot commands skip the line entirely", () => {
  const map = parseZms(
    mockDoc([".comment abcde", "(t1)c4", ".title fake"].join("\n")),
  );
  assert.strictEqual(map.get(1)?.length, 1);
});

test("continuation lines (no (t) prefix) append to previous active tracks", () => {
  const map = parseZms(mockDoc(["(t1)c4", "d4e4"].join("\n")));
  const t1 = map.get(1);
  assert.strictEqual(t1?.length, 3);
});

test("no tracks active before first (t...) — bare MML lines are ignored", () => {
  const map = parseZms(mockDoc(["c4d4", "(t1)e4"].join("\n")));
  assert.strictEqual(map.get(1)?.length, 1);
});
