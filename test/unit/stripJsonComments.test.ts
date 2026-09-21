import { test } from "node:test";
import * as assert from "node:assert";
import { stripJsonComments } from "../../src/copilotSetup";

test("preserves plain JSON", () => {
  const input = `{
  "foo": 1,
  "bar": "baz"
}`;
  assert.strictEqual(stripJsonComments(input), input);
});

test("removes line comments outside strings", () => {
  const input = `{
  "foo": 1, // trailing comment
  // whole-line comment
  "bar": 2
}`;
  const out = stripJsonComments(input);
  assert.match(out, /"foo": 1,\s*\n/);
  assert.doesNotMatch(out, /trailing comment/);
  assert.doesNotMatch(out, /whole-line comment/);
  assert.ok(JSON.parse(out.replace(/,\s*}/g, "}"))); // parseable after trailing comma cleanup
});

test("removes block comments outside strings", () => {
  const input = `{
  "foo": /* inline */ 1,
  /* multi
     line */
  "bar": 2
}`;
  const out = stripJsonComments(input);
  assert.doesNotMatch(out, /inline/);
  assert.doesNotMatch(out, /multi/);
});

test("keeps // inside string literals (URLs, protocol-relative paths)", () => {
  const input = `{
  "url": "https://example.com/path",
  "proto": "//cdn.example.com/x.js"
}`;
  const out = stripJsonComments(input);
  assert.match(out, /https:\/\/example\.com\/path/);
  assert.match(out, /\/\/cdn\.example\.com\/x\.js/);
});

test("keeps /* */ inside string literals", () => {
  const input = `{ "regex": "match /* not a comment */" }`;
  const out = stripJsonComments(input);
  assert.match(out, /match \/\* not a comment \*\//);
});

test("handles escaped quotes in strings", () => {
  const input = `{ "s": "she said \\"//not a comment\\" then" }`;
  const out = stripJsonComments(input);
  // the escaped-quote string should survive untouched (the // inside must not
  // trigger comment stripping either)
  assert.match(out, /she said \\"\/\/not a comment\\" then/);
});

test("real-world Copilot settings shape survives round-trip through JSON.parse", () => {
  const input = `{
  // 拡張のセットアップ済み
  "github.copilot.chat.codeGeneration.useInstructionFiles": true,
  "github.copilot.chat.codeGeneration.instructions": [
    { "file": ".github/copilot-instructions.md" } // main entry
  ]
}`;
  const parsed = JSON.parse(stripJsonComments(input));
  assert.strictEqual(parsed["github.copilot.chat.codeGeneration.useInstructionFiles"], true);
  assert.strictEqual(parsed["github.copilot.chat.codeGeneration.instructions"][0].file, ".github/copilot-instructions.md");
});
