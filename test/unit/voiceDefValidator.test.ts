import { test } from "node:test";
import * as assert from "node:assert";
import { findVoiceDefIssues } from "../../src/diagnosticProvider";

// --- Correct definitions: should produce zero issues ---

test("Form 1 (V n,0,…) with exactly 56 numbers has no issue", () => {
  const nums = [0, ...Array(55).fill(1)]; // mode 0 + 55 params
  const text = `(V1,${nums.join(",")})`;
  assert.deepStrictEqual(findVoiceDefIssues(text), []);
});

test("Form 2 (@n,…) with exactly 55 numbers has no issue", () => {
  const nums = Array(55).fill(1);
  const text = `(@1,${nums.join(",")})`;
  assert.deepStrictEqual(findVoiceDefIssues(text), []);
});

test("Multi-line Form 1 with comments and header labels has no issue", () => {
  const text = `
(V1,0
/        AF  OM  WF  SY  SP PMD AMD PMS AMS PAN
	 60, 15,  2,  0,210, 40,  0,  2,  0,  3,  0
/        AR  DR  SR  RR  SL  OL  KS  ML DT1 DT2 AME
	 31,  5,  0, 12,  2, 30,  1,  2,  7,  0,  0
	 31,  5,  0, 12,  8,  6,  1,  2,  5,  0,  0
	 31,  5,  0, 12,  8, 28,  1,  2,  3,  0,  0
	 31,  5,  0, 12,  8,  6,  1,  2,  5,  0,  0)`;
  assert.deepStrictEqual(findVoiceDefIssues(text), []);
});

// --- Copilot mash-up bugs: the point of this validator ---

test("(@1,0,…) with 56 numbers is flagged as Form 1/2 mash-up", () => {
  const nums = [0, ...Array(55).fill(1)];
  const text = `(@1,${nums.join(",")})`;
  const issues = findVoiceDefIssues(text);
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].form, "@");
  assert.strictEqual(issues[0].actualCount, 56);
  assert.match(issues[0].message, /Form 2.*Form 1|混合形/);
});

test("(@1,…) with 66 numbers (Form 1 common line duplicated) is flagged", () => {
  const nums = Array(66).fill(1);
  const text = `(@1,${nums.join(",")})`;
  const issues = findVoiceDefIssues(text);
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].actualCount, 66);
  assert.strictEqual(issues[0].expectedCount, 55);
});

test("(V1,60,…) missing the mode-0 discriminator is flagged specifically", () => {
  const nums = [60, ...Array(54).fill(1)]; // 55 numbers but first isn't 0
  const text = `(V1,${nums.join(",")})`;
  const issues = findVoiceDefIssues(text);
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].form, "V");
  assert.match(issues[0].message, /mode discriminator|モード指定子/);
});

test("(V1,0,…) with only 40 params is flagged as count mismatch", () => {
  const nums = [0, ...Array(39).fill(1)];
  const text = `(V1,${nums.join(",")})`;
  const issues = findVoiceDefIssues(text);
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].actualCount, 40);
  assert.strictEqual(issues[0].expectedCount, 56);
});

// --- 実データでよくある短縮形 (共通行末尾省略) は許容する ---

test("(@1, 4 ops + AL/FB/OM only) 47-param Form 2 is accepted", () => {
  // P.ZMS 由来: 共通行を AL/FB/OM の 3 個で打ち切り、PAN 以降デフォルト。
  const text = `(@1,
    31,  6,  5,  7,  4, 30,  0,  0,  7,  0,  0
    31,  6,  5,  7,  4, 40,  0,  3,  0,  0,  0
    29,  6,  2,  7,  2, 30,  0,  0,  3,  0,  0
    31,  5,  5,  8,  3,  0,  0,  1,  0,  0,  0
     0,  5, 15)`;
  assert.deepStrictEqual(findVoiceDefIssues(text), []);
});

test("(@1, 4 ops + AL/FB only) 46-param Form 2 is accepted (YZ.ZMS repro)", () => {
  // 電脳倶楽部掲載の YZ.ZMS で使われている書式: 共通行を AL+FB の 2 個だけで
  // 打ち切り、OM 以降は省略 (OM 省略時 default 15 = 全 OP 有効)。
  const text = `(@1,24,2,1,3,0,29,0,2,3,0,0
22,3,1,4,0,2,0,3,3,0,0
28,2,1,3,0,27,1,1,7,0,0
20,3,1,6,0,3,0,2,7,0,0
4,7)`;
  assert.deepStrictEqual(findVoiceDefIssues(text), []);
});

test("(V1,0, minimal common + 4 ops) 46-param Form 1 is accepted", () => {
  // Form 1 の最短形: mode 0 + 共通行 1 (AF のみ) + 4 op × 11 = 46
  const op = [31, 0, 0, 8, 0, 25, 0, 1, 0, 0, 0];
  const nums = [0, 60, ...op, ...op, ...op, ...op]; // mode + AF + 4×11 = 46
  const text = `(V1,${nums.join(",")})`;
  assert.deepStrictEqual(findVoiceDefIssues(text), []);
});

test("(@1, 45 params) below minimum is still flagged", () => {
  const nums = Array(45).fill(1);
  const text = `(@1,${nums.join(",")})`;
  const issues = findVoiceDefIssues(text);
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].actualCount, 45);
});

// --- Real reproducer from the session ---

test("reproduces the actual Copilot 66-param output silence bug", () => {
  const text = `
(@1,                    60, 15,  2,  0,210, 40,  0,  2,  0,  3,  0
                       31,  5,  0, 12,  2, 30,  1,  2,  7,  0,  0
                       31,  5,  0, 12,  8,  6,  1,  2,  5,  0,  0
                       31,  5,  0, 12,  8, 28,  1,  2,  3,  0,  0
                       31,  5,  0, 12,  8,  6,  1,  2,  5,  0,  0
/        AL  FB  OM PAN  WF  SY  SP PMD AMD PMS AMS
                       5,  7, 15,  3,  0,  0,  0,  0,  0,  0,  0)`;
  const issues = findVoiceDefIssues(text);
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].actualCount, 66);
});

// --- No false positives ---

test("plain MML with (t1) (m1,3000) (a1,1) is not flagged", () => {
  const text = `(I)
(m1,3000)
(a1,1)
(t1) @1 v14 o5 l4 c d e f`;
  assert.deepStrictEqual(findVoiceDefIssues(text), []);
});

test("multiple voice definitions in one file are validated independently", () => {
  const good = `(V1,${[0, ...Array(55).fill(1)].join(",")})`;
  const bad = `(@2,${Array(66).fill(1).join(",")})`;
  const text = `${good}\n${bad}`;
  const issues = findVoiceDefIssues(text);
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].form, "@");
  assert.strictEqual(issues[0].actualCount, 66);
});

test("comments containing digits do not affect parameter count", () => {
  const text = `(V1,0,${Array(55).fill(1).join(",")}) / test 42 with numbers 999`;
  assert.deepStrictEqual(findVoiceDefIssues(text), []);
});
