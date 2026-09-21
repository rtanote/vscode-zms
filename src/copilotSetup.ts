import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";

const MARKER_START = "<!-- zmusic-v2-copilot-setup: managed by vscode-zms extension -->";
const MARKER_END = "<!-- end zmusic-v2-copilot-setup -->";
const DECLINED_KEY = "zmusic.copilotSetupDeclined";

const MANAGED_BLOCK_RE = new RegExp(
  `${escapeRegex(MARKER_START)}[\\s\\S]*?${escapeRegex(MARKER_END)}\\n?`,
);

/**
 * 初回 `.zms` オープン時に、Copilot 命令ファイルがまだ無い workspace で
 * さりげなく Setup コマンドを案内する。「表示しない」で workspaceState に
 * 記録して以降は静かに黙る。end-user が Marketplace 経由でインストールした
 * 時の Setup コマンド発見動線 (仕様書 Phase 3)。
 */
export async function maybePromptCopilotSetup(context: vscode.ExtensionContext): Promise<void> {
  const ws = vscode.workspace.workspaceFolders?.[0];
  if (!ws) return;
  if (context.workspaceState.get<boolean>(DECLINED_KEY, false)) return;

  const instructionsPath = path.join(ws.uri.fsPath, ".github", "copilot-instructions.md");
  if (fs.existsSync(instructionsPath)) {
    const existing = fs.readFileSync(instructionsPath, "utf-8");
    if (existing.includes(MARKER_START)) return; // 既にセットアップ済み
  }

  const setup = vscode.l10n.t("Set up");
  const later = vscode.l10n.t("Later");
  const dontShow = vscode.l10n.t("Don't show again");

  const choice = await vscode.window.showInformationMessage(
    vscode.l10n.t(
      "Z-MUSIC: Set up .github/copilot-instructions.md in this workspace so Copilot suggests code that follows Z-MUSIC v2 syntax.",
    ),
    setup,
    later,
    dontShow,
  );

  if (choice === setup) {
    await vscode.commands.executeCommand("zmusic.setupCopilotInstructions");
  } else if (choice === dontShow) {
    await context.workspaceState.update(DECLINED_KEY, true);
  }
  // 「後で」または dismiss は状態変更なし → 次回セッションで再度案内
}

/**
 * Command `zmusic.setupCopilotInstructions`: workspace に
 * `.github/copilot-instructions.md` を作成/更新して、Copilot が Z-MUSIC v2
 * の文法・音色定義書式に沿ったコード生成をするよう仕向ける。
 *
 * VSIX には `resources/copilot-instructions.md` として同内容を同梱してあり、
 * これを workspace に転写する。既存ファイルがある場合はマーカー付きセクション
 * として追記/差し替えを行う。
 */
export async function setupCopilotInstructions(context: vscode.ExtensionContext): Promise<void> {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace) {
    vscode.window.showErrorMessage(
      vscode.l10n.t("Z-MUSIC: No workspace is open. Please open a ZMS file and retry."),
    );
    return;
  }

  const template = loadTemplate(context);
  if (template === null) {
    vscode.window.showErrorMessage(
      vscode.l10n.t(
        "Z-MUSIC: Instruction template not found (resources/copilot-instructions.md)",
      ),
    );
    return;
  }

  const targetPath = path.join(workspace.uri.fsPath, ".github", "copilot-instructions.md");
  const managedBlock = `${MARKER_START}\n${template.trim()}\n${MARKER_END}\n`;

  const status = await writeInstructions(targetPath, managedBlock);
  if (status === "cancelled") return;

  const update = vscode.l10n.t("Update");
  const later = vscode.l10n.t("Later");
  const settingsPrompt = status === "created"
    ? vscode.l10n.t(
        "Z-MUSIC: Created. Update .vscode/settings.json too so Copilot picks it up reliably?",
      )
    : vscode.l10n.t(
        "Z-MUSIC: Updated. Update .vscode/settings.json too so Copilot picks it up reliably?",
      );
  const settingsChoice = await vscode.window.showInformationMessage(settingsPrompt, update, later);
  if (settingsChoice === update) {
    await ensureVscodeSettings(workspace.uri);
  }

  const doc = await vscode.workspace.openTextDocument(targetPath);
  await vscode.window.showTextDocument(doc, { preview: false });
}

function loadTemplate(context: vscode.ExtensionContext): string | null {
  const candidate = path.join(context.extensionUri.fsPath, "resources", "copilot-instructions.md");
  try {
    return fs.readFileSync(candidate, "utf-8");
  } catch {
    return null;
  }
}

type WriteStatus = "created" | "updated" | "cancelled";

async function writeInstructions(targetPath: string, managedBlock: string): Promise<WriteStatus> {
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, managedBlock);
    return "created";
  }

  const existing = fs.readFileSync(targetPath, "utf-8");

  if (MANAGED_BLOCK_RE.test(existing)) {
    const update = vscode.l10n.t("Update");
    const doNothing = vscode.l10n.t("Do nothing");
    const choice = await vscode.window.showInformationMessage(
      vscode.l10n.t(
        "Z-MUSIC: A managed block is already set up. Update to the latest template?",
      ),
      update,
      doNothing,
    );
    if (choice !== update) return "cancelled";
    const updated = existing.replace(MANAGED_BLOCK_RE, managedBlock);
    fs.writeFileSync(targetPath, updated);
    return "updated";
  }

  const append = vscode.l10n.t("Append");
  const cancel = vscode.l10n.t("Cancel");
  const choice = await vscode.window.showWarningMessage(
    vscode.l10n.t(
      "This will append a Z-MUSIC section to the existing .github/copilot-instructions.md. Continue?",
    ),
    append,
    cancel,
  );
  if (choice !== append) return "cancelled";
  fs.writeFileSync(targetPath, existing.trimEnd() + "\n\n" + managedBlock);
  return "updated";
}

async function ensureVscodeSettings(wsUri: vscode.Uri): Promise<void> {
  const settingsPath = path.join(wsUri.fsPath, ".vscode", "settings.json");
  let json: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    const raw = fs.readFileSync(settingsPath, "utf-8");
    try {
      json = JSON.parse(stripJsonComments(raw));
    } catch {
      vscode.window.showWarningMessage(
        vscode.l10n.t(
          'Z-MUSIC: Could not parse the existing .vscode/settings.json. Please add these two entries manually: "github.copilot.chat.codeGeneration.useInstructionFiles": true, "github.copilot.chat.codeGeneration.instructions": [{"file": ".github/copilot-instructions.md"}]',
        ),
      );
      return;
    }
  } else {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  }
  json["github.copilot.chat.codeGeneration.useInstructionFiles"] = true;
  const instructionsKey = "github.copilot.chat.codeGeneration.instructions";
  const arr = Array.isArray(json[instructionsKey]) ? [...(json[instructionsKey] as unknown[])] : [];
  const alreadyRegistered = arr.some(
    (e) => typeof e === "object" && e !== null && (e as Record<string, unknown>).file === ".github/copilot-instructions.md",
  );
  if (!alreadyRegistered) {
    arr.push({ file: ".github/copilot-instructions.md" });
  }
  json[instructionsKey] = arr;
  fs.writeFileSync(settingsPath, JSON.stringify(json, null, 2) + "\n");
  vscode.window.showInformationMessage(
    vscode.l10n.t("Z-MUSIC: Updated {0}", settingsPath),
  );
}

/**
 * JSONC (settings.json) から行/ブロックコメントを除去して素の JSON にする。
 * 文字列リテラル ("...") の中身は保持するので "url": "https://..." の '//' も
 * 誤って削られない。エスケープ '\"' も考慮する。
 * export しているのはユニットテスト用途 (`test/unit/stripJsonComments.test.ts`)。
 */
export function stripJsonComments(raw: string): string {
  return raw.replace(
    /"(?:[^"\\]|\\.)*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    (m) => (m.startsWith('"') ? m : ""),
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
