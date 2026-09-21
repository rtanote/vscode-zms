import * as vscode from "vscode";
import * as https from "node:https";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import * as path from "node:path";

/**
 * ZMUSIC.X (v2.08) の取得・SHA-256 検証・キャッシュ
 *
 * 探索順:
 *   1. `zmusic.driver.path` 設定 (優先)
 *   2. `context.globalStorageUri` 直下のキャッシュ
 *   3. QuickPick で 「ダウンロード / ローカル指定」 を提示
 *
 * ダウンロード成功時は SHA-256 を仕様書の既知値と照合し、不一致なら破棄。
 * 初回取得時に著作権通知 (西川善司氏 / Z-MUSIC SYSTEM) を出す。
 */
export class DriverManager {
  /**
   * 仕様書 §2.10 記載の 2026-09-07 時点の toyoshim/z-music.js 収録 ZMUSIC208.X ハッシュ。
   * 実装検証時に再取得して更新することを想定 (const にしているのは意図的固定)。
   */
  static readonly EXPECTED_SHA256 =
    "7f066d4dbbe6e07e91463e78005b2cc01a23b3453ba3c3da178474ef1244efdf";

  static readonly DEFAULT_FILENAME = "ZMUSIC208.X";

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel,
  ) {}

  /**
   * ドライバ本体を返す。未取得の場合はユーザに QuickPick を提示する。
   * ユーザがキャンセルしたら null を返す。
   */
  async ensureDriver(): Promise<{ name: string; bytes: Uint8Array } | null> {
    const configured = this.configuredPath();
    if (configured) {
      const loaded = await this.tryLoadPath(configured);
      if (loaded) return loaded;
      vscode.window.showWarningMessage(
        vscode.l10n.t(
          "Z-MUSIC: Cannot read the file set in 'zmusic.driver.path': {0}",
          configured,
        ),
      );
    }

    const cached = await this.tryLoadPath(this.cachePath());
    if (cached) return cached;

    return this.acquireInteractive();
  }

  /** コマンドパレット `Z-MUSIC: Select ZMUSIC.X` からの手動選択。 */
  async selectFromDialog(): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
      title: vscode.l10n.t("Select ZMUSIC.X"),
      canSelectMany: false,
      openLabel: vscode.l10n.t("Use this file"),
    });
    if (!picked || picked.length === 0) return;
    const loaded = await this.tryLoadPath(picked[0].fsPath);
    if (!loaded) {
      vscode.window.showErrorMessage(
        vscode.l10n.t("Z-MUSIC: Cannot read the selected file."),
      );
      return;
    }
    await this.writeCache(loaded.bytes);
    vscode.window.showInformationMessage(
      vscode.l10n.t("Z-MUSIC: Driver registered ({0} bytes)", loaded.bytes.length),
    );
    this.notifyCopyright();
  }

  // ── 内部実装 ────────────────────────────────────────────────

  private configuredPath(): string {
    return vscode.workspace.getConfiguration("zmusic").get<string>("driver.path", "");
  }

  private downloadUrl(): string {
    return vscode.workspace
      .getConfiguration("zmusic")
      .get<string>(
        "driver.downloadUrl",
        "https://raw.githubusercontent.com/toyoshim/z-music.js/master/x/ZMUSIC208.X",
      );
  }

  private cachePath(): string {
    return path.join(
      this.context.globalStorageUri.fsPath,
      "drivers",
      DriverManager.DEFAULT_FILENAME,
    );
  }

  private async tryLoadPath(
    filePath: string,
  ): Promise<{ name: string; bytes: Uint8Array } | null> {
    try {
      const bytes = await fs.promises.readFile(filePath);
      if (bytes.length === 0) return null;
      return { name: path.basename(filePath), bytes: new Uint8Array(bytes) };
    } catch {
      return null;
    }
  }

  private async writeCache(bytes: Uint8Array): Promise<void> {
    const p = this.cachePath();
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    await fs.promises.writeFile(p, bytes);
  }

  private async acquireInteractive(): Promise<
    { name: string; bytes: Uint8Array } | null
  > {
    const choice = await vscode.window.showQuickPick(
      [
        {
          label: vscode.l10n.t("$(cloud-download) Download from GitHub"),
          description: vscode.l10n.t("ZMUSIC208.X from toyoshim/z-music.js"),
          value: "download" as const,
        },
        {
          label: vscode.l10n.t("$(folder-opened) Choose a local file"),
          description: vscode.l10n.t("Use a ZMUSIC.X you already have"),
          value: "local" as const,
        },
      ],
      {
        title: vscode.l10n.t("Z-MUSIC: Driver not yet installed"),
        placeHolder: vscode.l10n.t("Choose how to obtain ZMUSIC208.X"),
        ignoreFocusOut: true,
      },
    );
    if (!choice) return null;

    if (choice.value === "local") {
      await this.selectFromDialog();
      return this.tryLoadPath(this.cachePath());
    }

    return this.downloadAndVerify();
  }

  private async downloadAndVerify(): Promise<
    { name: string; bytes: Uint8Array } | null
  > {
    const url = this.downloadUrl();
    this.output.appendLine(`[driver] Downloading from ${url}`);

    let bytes: Uint8Array;
    try {
      bytes = await this.httpsGet(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.output.appendLine(`[driver] Download failed: ${msg}`);
      vscode.window.showErrorMessage(
        vscode.l10n.t("Z-MUSIC: Download failed — {0}", msg),
      );
      return null;
    }

    const actual = crypto.createHash("sha256").update(bytes).digest("hex");
    if (actual !== DriverManager.EXPECTED_SHA256) {
      this.output.appendLine(
        `[driver] SHA-256 mismatch. expected=${DriverManager.EXPECTED_SHA256} actual=${actual}`,
      );
      vscode.window.showErrorMessage(
        vscode.l10n.t(
          "Z-MUSIC: SHA-256 does not match the known value. The driver was discarded.",
        ),
      );
      return null;
    }

    await this.writeCache(bytes);
    this.output.appendLine(
      `[driver] Verified & cached to ${this.cachePath()} (${bytes.length} bytes)`,
    );
    this.notifyCopyright();
    return { name: DriverManager.DEFAULT_FILENAME, bytes };
  }

  private httpsGet(url: string): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const req = https.get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(this.httpsGet(new URL(res.headers.location, url).toString()));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
        res.on("error", reject);
      });
      req.on("error", reject);
      req.setTimeout(30_000, () => req.destroy(new Error("timeout after 30s")));
    });
  }

  private notifyCopyright(): void {
    vscode.window.showInformationMessage(
      vscode.l10n.t(
        "ZMUSIC.X v2.08 © Z.Nishikawa / Z-MUSIC SYSTEM. Distributed via toyoshim/z-music.js (BSD-3).",
      ),
    );
  }
}
