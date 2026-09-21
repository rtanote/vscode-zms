import { test } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * `resources/copilot-instructions.md` は VSIX に同梱されて end-user の
 * `zmusic.setupCopilotInstructions` コマンドで workspace に書き出される。
 * `.github/copilot-instructions.md` は本リポの Copilot 向けで、こちらが
 * 一次ソース。両者は常に同一内容でなければならない。
 *
 * 更新手順: `.github/copilot-instructions.md` を編集した後に、
 * `cp .github/copilot-instructions.md resources/copilot-instructions.md`
 */
test("resources/copilot-instructions.md mirrors .github/copilot-instructions.md", () => {
  const repoRoot = path.join(__dirname, "..", "..", "..");
  const source = fs.readFileSync(path.join(repoRoot, ".github", "copilot-instructions.md"), "utf-8");
  const bundled = fs.readFileSync(path.join(repoRoot, "resources", "copilot-instructions.md"), "utf-8");
  assert.strictEqual(
    bundled,
    source,
    "copilot-instructions.md drifted — run:\n" +
      "  cp .github/copilot-instructions.md resources/copilot-instructions.md",
  );
});
