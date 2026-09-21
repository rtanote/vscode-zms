import * as vscode from "vscode";
import * as iconv from "iconv-lite";
import { Diagnostics } from "./Diagnostics";
import { DriverManager } from "./DriverManager";
import type { PlayerViewProvider } from "./PlayerViewProvider";
import { Tracer } from "./Tracer";
import { disassemble, ZmdDisassemblyError, type ZmdCommand } from "./zmd/ZmdDisassembler";
import { buildTrackMap, lookup as sourceMapLookup, setPtrAdjust, type TrackMap } from "./zmd/SourceMap";
import { parseZms, type SourceToken } from "./zms/ZmsParser";
import { decodeBase64, encodeBase64, type TrackInfo, type WebviewToHost } from "./protocol";
import { detectVersion } from "../versionDetection";

type State = "idle" | "compiling" | "playing" | "playingNoTrace" | "error";

const DEFAULT_PALETTE = [
  "rgba(255,170,0,0.45)",
  "rgba(80,200,255,0.45)",
  "rgba(150,255,120,0.45)",
  "rgba(255,120,200,0.45)",
  "rgba(200,160,255,0.45)",
  "rgba(255,230,90,0.45)",
  "rgba(120,255,230,0.45)",
  "rgba(255,140,110,0.45)",
];

/**
 * ドキュメント先頭からカーソル行まで走査して、その行時点で active な
 * トラック番号を返す。`(t1,2,3)` の複数指定なら最初のトラック番号。
 * `(t...)` prefix が見つからない (= ヘッダ部) なら null。
 */
function findActiveTrackAtLine(
  doc: vscode.TextDocument,
  cursorLine: number,
): number | null {
  let active: number | null = null;
  for (let i = 0; i <= cursorLine && i < doc.lineCount; i++) {
    const text = doc.lineAt(i).text;
    const m = /^\s*\([tT]\s*(\d+)/.exec(text);
    if (m) active = parseInt(m[1], 10);
  }
  return active;
}

/**
 * ZMD コマンドの step_time バイトを抽出。命令種別ごとにオフセットが違う
 */
function stepOf(bytes: Uint8Array, cmd: ZmdCommand): number {
  const o = cmd.offset;
  switch (cmd.kind) {
    case "note":       // $00-$7F: note(.B), step(.B), gate(.B)
    case "rest":       // $80: $80, step, gate
    case "wait":       // $D0: $D0, step, $00
      return bytes[o + 1] ?? 0;
    case "absnote":    // $FE: $FE, note(.B), step(.W), gate(.W)
      return ((bytes[o + 2] ?? 0) << 8) | (bytes[o + 3] ?? 0);
    case "chord":      // $E2: $E2, step(.W), gate(.W), delay(.B), note1..8
      return ((bytes[o + 1] ?? 0) << 8) | (bytes[o + 2] ?? 0);
    case "portamento": // $E0: $E0, note(.B), step(.W), gate(.W), delay(.W), ...
      return ((bytes[o + 2] ?? 0) << 8) | (bytes[o + 3] ?? 0);
    default:
      return 0;
  }
}

function boostAlpha(rgba: string, newAlpha: number): string {
  const m = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*[\d.]+\s*\)$/.exec(rgba);
  if (!m) return rgba;
  return `rgba(${m[1]},${m[2]},${m[3]},${newAlpha})`;
}

/**
 * 状態機械・コマンド受付・ドキュメント監視
 * DriverManager / Diagnostics / Tracer / SourceMap を統合する。
 */
export class PlayerController implements vscode.Disposable {
  private state: State = "idle";
  private currentDoc: vscode.TextDocument | undefined;
  private currentEditor: vscode.TextEditor | undefined;
  private currentTracks: TrackInfo[] = [];
  private trackMaps = new Map<number, TrackMap>();
  private currentSourceByTrack = new Map<number, SourceToken[]>();
  private sheetMusicHighlighter: ((noteIndex: number, color?: string) => void) | undefined;
  private lastSheetHighlight = -1;
  private lastLineByTrack = new Map<number, number>();
  private endStreak = 0;

  private readonly statusBar: vscode.StatusBarItem;
  private readonly outputChannel: vscode.OutputChannel;
  private readonly driverManager: DriverManager;
  private readonly diagnostics: Diagnostics;
  private readonly tracer: Tracer;
  private readonly disposables: vscode.Disposable[] = [];

  private compileRequestSeq = 0;
  private compileWaiters = new Map<number, (msg: Extract<WebviewToHost, { type: "compiled" }>) => void>();
  private driverInitialized = false;
  private logBuffer = "";

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly view: PlayerViewProvider,
  ) {
    this.outputChannel = vscode.window.createOutputChannel("Z-MUSIC");
    this.driverManager = new DriverManager(context, this.outputChannel);
    this.diagnostics = new Diagnostics();
    this.tracer = new Tracer();

    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBar.text = "$(circle-slash) Z-MUSIC";
    this.statusBar.tooltip = "Z-MUSIC: Idle";
    this.statusBar.show();

    this.view.onMessage((msg) => this.handleWebviewMessage(msg));

    // Apply the initial ptrAdjust and keep it in sync with config changes.
    this.applyPtrAdjust();

    this.disposables.push(
      this.statusBar,
      this.outputChannel,
      this.diagnostics,
      this.tracer,
      vscode.workspace.onDidChangeTextDocument((e) => this.onDocChanged(e)),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("zmusic.trace.ptrAdjust")) this.applyPtrAdjust();
      }),
    );
  }

  private applyPtrAdjust(): void {
    const v = vscode.workspace.getConfiguration("zmusic").get<number>("trace.ptrAdjust", 0);
    setPtrAdjust(v);
  }

  // ── コマンド ───────────────────────────────────────

  async play(fromCursor = false): Promise<void> {
    // Debounce: if we're already compiling, drop the extra request. Prevents
    // a runaway [sourceMap] log flood when the user mashes the play button.
    if (this.state === "compiling") {
      this.outputChannel.appendLine("[play] ignored — already compiling");
      return;
    }
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "zms") {
      vscode.window.showWarningMessage(
        vscode.l10n.t("Z-MUSIC: Please activate a ZMS document first."),
      );
      return;
    }
    // V3 (ZMSC3.X) は現状再生非対応 (docs/V3_SUPPORT.md 参照)。
    // 文法チェック・シンタックスハイライトは動くが、compile/再生は v2 の
    // ZMUSIC.X ドライバでは扱えないので中止して案内を出す。
    if (detectVersion(editor.document) === "3") {
      const learnMore = vscode.l10n.t("Learn more");
      const choice = await vscode.window.showWarningMessage(
        vscode.l10n.t(
          "Z-MUSIC: This .zms is tagged as v3 (ZMSC3.X). Playback of v3 documents is not supported in v1 (lint still works).",
        ),
        learnMore,
      );
      if (choice === learnMore) {
        void vscode.env.openExternal(
          vscode.Uri.parse("https://github.com/rtanote/vscode-zms/blob/main/docs/V3_SUPPORT.md"),
        );
      }
      return;
    }
    const cursorLine = fromCursor ? editor.selection.active.line : -1;
    const cursorCharacter = fromCursor ? editor.selection.active.character : 0;
    if (this.state !== "idle") await this.stopInternal();
    this.setState("compiling");
    this.logBuffer = "";

    const driver = await this.driverManager.ensureDriver();
    if (!driver) {
      this.setState("idle");
      return;
    }

    if (vscode.workspace.getConfiguration("zmusic").get<boolean>("player.revealOnPlay", true)) {
      await this.view.reveal(true);
    }

    if (!this.driverInitialized) {
      const args = vscode.workspace
        .getConfiguration("zmusic")
        .get<string[]>("driverArgs", ["-T100", "-P400", "-W100"]);
      const bufferSize = vscode.workspace
        .getConfiguration("zmusic")
        .get<number>("audio.bufferSize", 2048);
      // Prepend the driver name so ZMUSIC.install() knows which file to run.
      const effectiveArgs = [driver.name, ...args];
      await this.view.postMessage({
        type: "init",
        driverName: driver.name,
        driverB64: encodeBase64(driver.bytes),
        bufferSize,
        driverArgs: effectiveArgs,
      });
      try {
        await this.view.whenReady();
        this.driverInitialized = true;
      } catch (e) {
        this.setState("error");
        vscode.window.showErrorMessage(
          vscode.l10n.t("Z-MUSIC: Initialization failed — {0}", String(e)),
        );
        return;
      }
    }

    this.currentEditor = editor;
    this.currentDoc = editor.document;
    this.diagnostics.clear();

    // SJIS + CRLF に正規化
    const utf8Text = editor.document.getText().replace(/\r\n?|\n/g, "\r\n");
    const zmsBytes = iconv.encode(utf8Text, "shift_jis");

    const requestId = ++this.compileRequestSeq;
    const compilePromise = new Promise<Extract<WebviewToHost, { type: "compiled" }>>(
      (resolve) => this.compileWaiters.set(requestId, resolve),
    );
    await this.view.postMessage({
      type: "compile",
      zmsB64: encodeBase64(new Uint8Array(zmsBytes)),
      requestId,
    });
    const compiled = await compilePromise;

    if (!compiled.ok) {
      this.diagnostics.reportRawLog(editor.document.uri, this.logBuffer);
      this.setState("idle");
      vscode.window.showErrorMessage(
        vscode.l10n.t("Z-MUSIC: Compilation failed (see Problems panel)"),
      );
      return;
    }

    this.currentTracks = compiled.tracks;
    this.buildSourceMaps(editor.document, compiled.tracks);

    // 各トラックのパレット色を webview に渡す (キーボードビジュアライザで
    // アクティブキーを塗る用途、mmdsp テイストの視覚化)。
    await this.view.postMessage({
      type: "trackColors",
      colors: compiled.tracks.map((t) => ({ trk: t.trk, color: this.trackColor(t.trk) })),
    });

    // 前回このファイルで設定した Solo/Mute があれば復元 (webview 側は
    // 新規コンパイル時に自分の Set を clear するので、その後で送る)。
    const saved = this.loadSoloMute(editor.document.uri);
    if (saved.mutedTrks.length > 0 || saved.soloedTrks.length > 0) {
      await this.view.postMessage({ type: "restoreSoloMute", ...saved });
    }
    if (vscode.workspace.getConfiguration("zmusic").get<boolean>("trace.enabled", true)) {
      this.tracer.setTracks(this.trackMaps, editor);
    }

    const targetStep = fromCursor
      ? this.computeTargetStep(editor.document, cursorLine, cursorCharacter)
      : 0;
    if (targetStep > 0) {
      this.outputChannel.appendLine(
        `[play] fast-forward to step ${targetStep} (cursor line ${cursorLine + 1})`,
      );
    }
    await this.view.postMessage({ type: "start", targetStep });
    await this.view.postMessage({ type: "setSampling", enabled: true, intervalMs: 33 });
    this.endStreak = 0;
    this.setState("playing");
  }

  async playFromCursor(): Promise<void> {
    return this.play(true);
  }

  async stop(): Promise<void> {
    await this.stopInternal();
    this.setState("idle");
  }

  /**
   * カーソル行の active track における累積 step_time を先頭から数えて、
   * カーソル文字位置直前までのステップ数を求める。ZMD 側の step_time を
   * バイト単位で取り出して合算する (トラック内 timed command と source
   * token が exact マッチしている前提)。
   *
   * 見つからない/quality!=exact/カーソルがヘッダ部 → 0 を返して先頭再生。
   */
  private computeTargetStep(
    doc: vscode.TextDocument,
    cursorLine: number,
    cursorCharacter: number,
  ): number {
    if (cursorLine < 0) return 0;

    // カーソル行までの (t...) prefix から active track を判定
    const activeTrk = findActiveTrackAtLine(doc, cursorLine);
    if (activeTrk == null) return 0;

    const tokens = this.currentSourceByTrack.get(activeTrk) ?? [];
    if (tokens.length === 0) return 0;

    // カーソル位置より前にある token 数を数える
    let cursorIdx = tokens.length;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (
        t.lineIndex > cursorLine ||
        (t.lineIndex === cursorLine && t.range.start.character >= cursorCharacter)
      ) {
        cursorIdx = i;
        break;
      }
    }
    if (cursorIdx === 0) return 0;

    const trackInfo = this.currentTracks.find((t) => t.trk === activeTrk);
    if (!trackInfo) return 0;
    const zmdBytes = decodeBase64(trackInfo.zmdB64);
    let cmds: ZmdCommand[];
    try {
      cmds = disassemble(zmdBytes);
    } catch {
      return 0;
    }
    const timed = cmds.filter((c) => c.consumesTime);
    if (timed.length !== tokens.length) return 0; // exact でなければ諦め

    let sum = 0;
    for (let i = 0; i < cursorIdx; i++) sum += stepOf(zmdBytes, timed[i]);
    return sum;
  }

  async fadeOut(): Promise<void> {
    if (this.state !== "playing" && this.state !== "playingNoTrace") return;
    await this.view.postMessage({ type: "fadeOut", speed: 20 });
  }

  toggleTrace(): void {
    const cfg = vscode.workspace.getConfiguration("zmusic");
    const current = cfg.get<boolean>("trace.enabled", true);
    cfg.update("trace.enabled", !current, vscode.ConfigurationTarget.Workspace);
    if (current) {
      this.tracer.clear();
    } else if (this.state === "playing" && this.currentEditor) {
      this.tracer.setTracks(this.trackMaps, this.currentEditor);
    }
    vscode.window.showInformationMessage(
      current
        ? vscode.l10n.t("Z-MUSIC: Trace OFF")
        : vscode.l10n.t("Z-MUSIC: Trace ON"),
    );
  }

  async showPlayer(): Promise<void> {
    await this.view.reveal(true);
  }

  async dumpZmd(): Promise<void> {
    const dump = this.buildDumpString();
    if (dump === null) {
      vscode.window.showInformationMessage(
        vscode.l10n.t("Z-MUSIC: No compile history yet."),
      );
      return;
    }
    const doc = await vscode.workspace.openTextDocument({
      content: dump,
      language: "plaintext",
    });
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
  }

  /**
   * 逆アセンブル + SourceMap 統計を組み立てて文字列で返す。
   * `dumpZmd()` (エディタ表示) と `reportIssue()` (クリップボード転送) の
   * 双方から呼ばれる。currentTracks が空なら null。
   */
  buildDumpString(): string | null {
    if (this.currentTracks.length === 0) return null;
    const lines: string[] = [];
    for (const t of this.currentTracks) {
      const bytes = decodeBase64(t.zmdB64);
      lines.push(`; ── Track ${t.trk} (ch=${t.ch}, zmdStart=0x${t.zmdStart.toString(16)}, ${bytes.length} bytes)`);
      try {
        const cmds = disassemble(bytes);
        for (const c of cmds) {
          lines.push(
            `  +0x${c.offset.toString(16).padStart(4, "0")}  $${c.opcode.toString(16).padStart(2, "0")}  len=${c.length}  ${c.kind}${c.consumesTime ? " *" : ""}`,
          );
        }
      } catch (e) {
        if (e instanceof ZmdDisassemblyError) {
          lines.push(`  ERROR at offset ${e.offset}: ${e.message}`);
        } else {
          lines.push(`  ERROR: ${e}`);
        }
      }
      const map = this.trackMaps.get(t.trk);
      if (map) {
        try {
          const cmds = disassemble(bytes);
          const timed = cmds.filter((c) => c.consumesTime).length;
          const tokens = this.currentSourceByTrack.get(t.trk) ?? [];
          const delta = timed - tokens.length;
          const sign = delta === 0 ? "match" : delta > 0 ? `+${delta} ZMD > ZMS` : `${delta} ZMS > ZMD`;
          lines.push(
            `  SourceMap quality=${map.quality}, entries=${map.entries.length}  (ZMD timed=${timed}, ZMS tokens=${tokens.length}, delta=${sign})`,
          );
          if (delta !== 0 && this.currentDoc) {
            const perLine = new Map<number, number>();
            for (const tok of tokens) perLine.set(tok.lineIndex, (perLine.get(tok.lineIndex) ?? 0) + 1);
            const sortedLines = Array.from(perLine.entries()).sort((a, b) => a[0] - b[0]);
            for (const [lineIdx, count] of sortedLines) {
              const text = this.currentDoc.lineAt(lineIdx).text;
              const trimmed = text.length > 90 ? text.slice(0, 87) + "..." : text;
              lines.push(`    L${(lineIdx + 1).toString().padStart(4, " ")}  ZMS=${count.toString().padStart(3, " ")}  ${trimmed}`);
            }
          }
        } catch {
          lines.push(`  SourceMap quality=${map.quality}, entries=${map.entries.length}`);
        }
      }
      lines.push("");
    }
    return lines.join("\n");
  }

  /**
   * 環境情報 + 直近 compile の逆アセンブルをまとめて Markdown で返す。
   * `reportIssue` コマンドがクリップボードに転送する本体。
   * 個人特定に繋がる情報 (ワークスペースパス等) は含めない。
   */
  buildIssueReport(): string {
    const cfg = vscode.workspace.getConfiguration("zmusic");
    const settingsSnapshot: Record<string, unknown> = {
      "syntax.version": cfg.get("syntax.version"),
      "driver.version": cfg.get("driver.version"),
      "trace.enabled": cfg.get("trace.enabled"),
      "trace.ptrAdjust": cfg.get("trace.ptrAdjust"),
      "audio.bufferSize": cfg.get("audio.bufferSize"),
    };
    const extVersion = vscode.extensions.getExtension("rtanote.vscode-zms")?.packageJSON?.version ?? "unknown";
    const dump = this.buildDumpString();
    const parts: string[] = [];
    parts.push("## Environment");
    parts.push("");
    parts.push(`- Extension: rtanote.vscode-zms ${extVersion}`);
    parts.push(`- VS Code: ${vscode.version} (${vscode.env.appName})`);
    parts.push(`- OS: ${process.platform} ${process.arch}`);
    parts.push(`- Locale: ${vscode.env.language}`);
    parts.push("");
    parts.push("## Settings (zmusic.*)");
    parts.push("");
    parts.push("```json");
    parts.push(JSON.stringify(settingsSnapshot, null, 2));
    parts.push("```");
    parts.push("");
    parts.push("## Last Compile Dump");
    parts.push("");
    if (dump) {
      parts.push("```");
      parts.push(dump.length > 60000 ? dump.slice(0, 60000) + "\n\n[... truncated, full dump is longer than 60KB]" : dump);
      parts.push("```");
    } else {
      parts.push("_(No recent compile — press F5 on a .zms document to generate ZMD, then run Report Issue again.)_");
    }
    parts.push("");
    parts.push("## Describe the problem");
    parts.push("");
    parts.push("<!-- Please describe what you did, what you expected, and what actually happened. -->");
    parts.push("");
    parts.push("## ZMS snippet (optional)");
    parts.push("");
    parts.push("<!-- Paste the minimum .zms that reproduces the issue, if you can share it. -->");
    return parts.join("\n");
  }

  /**
   * VS Code 標準の Issue Reporter を開き、拡張のレポート内容 (env + 逆アセ)
   * をクリップボードに転送する。ユーザは reporter 内でレポート本文を貼り付け、
   * `bugs.url` (package.json) の Issue ページに送信できる。
   */
  async reportIssue(): Promise<void> {
    const body = this.buildIssueReport();
    await vscode.env.clipboard.writeText(body);
    await vscode.commands.executeCommand("workbench.action.openIssueReporter", {
      extensionId: "rtanote.vscode-zms",
      issueTitle: "",
    });
    vscode.window.showInformationMessage(
      vscode.l10n.t(
        "Z-MUSIC: Diagnostic report copied to the clipboard. Paste it into the issue body when the reporter opens.",
      ),
    );
  }

  async selectDriver(): Promise<void> {
    await this.driverManager.selectFromDialog();
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }

  // ── 内部 ───────────────────────────────────────────

  private setState(next: State): void {
    this.state = next;
    const labels: Record<State, string> = {
      idle: "$(circle-slash) Z-MUSIC: Idle",
      compiling: "$(sync~spin) Z-MUSIC: Compiling",
      playing: "$(play) Z-MUSIC: Playing",
      playingNoTrace: "$(play) Z-MUSIC: Playing (trace stopped)",
      error: "$(error) Z-MUSIC: Error",
    };
    this.statusBar.text = labels[next];
  }

  private async stopInternal(): Promise<void> {
    await this.view.postMessage({ type: "setSampling", enabled: false, intervalMs: 0 });
    await this.view.postMessage({ type: "stop" });
    this.tracer.clear();
    this.endStreak = 0;
  }

  /**
   * 譜面プレビュー用の highlight フックを外部から差し込む。
   * 呼び出し側 (extension.ts) が SheetMusicPanel.highlight を橋渡し。
   * null で解除。
   */
  setSheetMusicHighlighter(
    cb: ((noteIndex: number, color?: string) => void) | undefined,
  ): void {
    this.sheetMusicHighlighter = cb;
    this.lastSheetHighlight = -1;
  }

  private buildSourceMaps(doc: vscode.TextDocument, tracks: TrackInfo[]): void {
    this.trackMaps.clear();
    this.lastLineByTrack.clear();
    const sourceByTrack = parseZms(doc);
    this.currentSourceByTrack = sourceByTrack;
    // Aggregated stats for the post-compile sanity warning.
    // - silentDrops: ZMS side had tokens but ZMD emitted zero timed cmds →
    //   Z-MUSIC almost certainly hit a compile error mid-track and truncated
    //   with no `bPrint` error message (e.g. [K.SIGN Amajor] in V2 mode,
    //   octave overflow past MIDI 127, invalid bracket keyword).
    // - lineApproxTracks: SourceMap fell back — highlight still works but at
    //   line resolution not per-note. Usually a milder tokenization mismatch.
    const silentDrops: number[] = [];
    const lineApproxTracks: number[] = [];

    // First-byte hex for quick post-mortem — a "01 remain" style report on
    // its own doesn't tell us whether ZMD came back empty vs the wrong
    // memory being read.
    for (const t of tracks) {
      const zmdBytes = decodeBase64(t.zmdB64);
      const previewHex = Array.from(zmdBytes.slice(0, 16))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ");
      this.outputChannel.appendLine(
        `[sourceMap] Track ${t.trk}: ch=${t.ch} start=0x${t.zmdStart.toString(16)} zmd=${zmdBytes.length}B [${previewHex}]`,
      );
      let zmdCmds;
      try {
        zmdCmds = disassemble(zmdBytes);
      } catch (e) {
        this.outputChannel.appendLine(
          `[sourceMap] Track ${t.trk}: disassembly failed: ${e}. Falling back to quality=none`,
        );
        this.trackMaps.set(t.trk, {
          trk: t.trk,
          zmdStart: t.zmdStart,
          entries: [],
          quality: "none",
        });
        continue;
      }
      const tokens = sourceByTrack.get(t.trk) ?? [];
      const timed = zmdCmds.filter((c) => c.consumesTime).length;
      const map = buildTrackMap(t.trk, t.zmdStart, zmdCmds, tokens);
      if (map.quality === "lineApprox") {
        this.outputChannel.appendLine(
          `[sourceMap] Track ${t.trk}: lineApprox fallback (ZMD timed=${timed}, ZMS tokens=${tokens.length})`,
        );
        lineApproxTracks.push(t.trk);
      }
      if (timed === 0 && tokens.length > 0) {
        silentDrops.push(t.trk);
      }
      this.trackMaps.set(t.trk, map);
    }

    this.warnOnSilentCompileIssues(silentDrops, lineApproxTracks);
  }

  /**
   * ZMS 側にはトークンがあるのに ZMD が空 (compile が silent truncation) だった
   * トラックが 1 つでもあれば、警告 notification を出す。ユーザに気付かせて
   * `Dump Compiled ZMD (debug)` にすぐ飛べるようにする。
   *
   * lineApprox 落ちだけの場合は音は鳴るがハイライト精度が下がるだけなので、
   * 出力 channel にだけログして notification は出さない (煩わしくなるため)。
   */
  private warnOnSilentCompileIssues(silentDrops: number[], lineApproxTracks: number[]): void {
    if (silentDrops.length === 0) return;

    const trackList = silentDrops.join(", ");
    const summary = vscode.l10n.t(
      "Z-MUSIC: {0} track(s) compiled to empty ZMD (silent drop): t{1}. Likely an invalid MML token stopped compile mid-file. Extra: {2} track(s) fell to lineApprox highlight.",
      silentDrops.length,
      trackList,
      lineApproxTracks.length,
    );
    const showDump = vscode.l10n.t("Show Dump");
    void vscode.window.showWarningMessage(summary, showDump).then((choice) => {
      if (choice === showDump) {
        void vscode.commands.executeCommand("zmusic.dumpZmd");
      }
    });
  }

  private handleWebviewMessage(msg: WebviewToHost): void {
    switch (msg.type) {
      case "log": {
        this.outputChannel.appendLine(msg.text);
        this.logBuffer += msg.text + "\n";
        return;
      }
      case "error": {
        this.outputChannel.appendLine(`[error:${msg.where}] ${msg.message}`);
        vscode.window.showErrorMessage(
          vscode.l10n.t("Z-MUSIC: {0} — {1}", msg.where, msg.message),
        );
        return;
      }
      case "compiled": {
        const waiter = this.compileWaiters.get(msg.requestId);
        if (waiter) {
          this.compileWaiters.delete(msg.requestId);
          waiter(msg);
        }
        return;
      }
      case "position": {
        if (this.state === "playing") {
          this.tracer.updatePositions(msg.tracks);
          this.updateSheetMusicHighlight(msg.tracks);
          this.pushLineMapToView(msg.tracks);
        }
        this.checkEndCondition(msg.tracks);
        return;
      }
      case "stopped": {
        // Webview 主導の停止 (Webview 破棄など)
        return;
      }
      case "started": return;
      case "audioState": {
        if (msg.state === "suspended") {
          const showView = vscode.l10n.t("Show view");
          vscode.window
            .showWarningMessage(
              vscode.l10n.t(
                'Z-MUSIC: Audio is suspended. Please click "Enable audio" in the Player view.',
              ),
              showView,
            )
            .then((v) => {
              if (v === showView) void this.view.reveal(true);
            });
        }
        return;
      }
      case "fileRequest": {
        this.handleFileRequest(msg.requestId, msg.name);
        return;
      }
      case "ready": return;
      case "userAction": {
        if (msg.action === "play") void this.play();
        else if (msg.action === "stop") void this.stop();
        else if (msg.action === "fadeOut") void this.fadeOut();
        return;
      }
      case "soloMuteChanged": {
        if (this.currentDoc) {
          this.saveSoloMute(this.currentDoc.uri, msg.mutedTrks, msg.soloedTrks);
        }
        return;
      }
    }
  }

  private soloMuteKey(uri: vscode.Uri): string {
    return `zmusic.soloMute:${uri.toString()}`;
  }

  private loadSoloMute(uri: vscode.Uri): { mutedTrks: number[]; soloedTrks: number[] } {
    const raw = this.context.workspaceState.get<{ mutedTrks?: number[]; soloedTrks?: number[] }>(
      this.soloMuteKey(uri),
    );
    return {
      mutedTrks: raw?.mutedTrks ?? [],
      soloedTrks: raw?.soloedTrks ?? [],
    };
  }

  private saveSoloMute(uri: vscode.Uri, mutedTrks: number[], soloedTrks: number[]): void {
    if (mutedTrks.length === 0 && soloedTrks.length === 0) {
      // クリーンな状態は保存しない (キー爆発防止)
      void this.context.workspaceState.update(this.soloMuteKey(uri), undefined);
      return;
    }
    void this.context.workspaceState.update(this.soloMuteKey(uri), {
      mutedTrks,
      soloedTrks,
    });
  }

  /**
   * カーソル行と発音位置が一致するトラックがあれば、その行の N 番目の
   * 時間消費トークンとして SheetMusicPanel に highlight を通知する。
   * abcjs は `.abcjs-note` を発生順に付けるので、同じ index で正しくヒットする。
   */
  private updateSheetMusicHighlight(
    tracks: { trk: number; ptr: number; state: number }[],
  ): void {
    if (!this.sheetMusicHighlighter) return;
    const editor = this.currentEditor ?? vscode.window.activeTextEditor;
    if (!editor || editor.document !== this.currentDoc) return;
    const cursorLine = editor.selection.active.line;

    for (const p of tracks) {
      if (p.state !== 0 && p.state !== 0x7f) continue;
      const map = this.trackMaps.get(p.trk);
      if (!map || map.quality === "none") continue;
      const range = sourceMapLookup(map, p.ptr);
      if (!range || range.start.line !== cursorLine) continue;

      const tokens = this.currentSourceByTrack.get(p.trk) ?? [];
      const lineTokens = tokens.filter((t) => t.lineIndex === cursorLine);
      const idx = lineTokens.findIndex(
        (t) => t.range.start.character === range.start.character,
      );
      if (idx >= 0 && idx !== this.lastSheetHighlight) {
        this.lastSheetHighlight = idx;
        this.sheetMusicHighlighter(idx, this.trackColor(p.trk));
      }
      return;
    }

    // 該当なし → highlight クリア
    if (this.lastSheetHighlight !== -1) {
      this.lastSheetHighlight = -1;
      this.sheetMusicHighlighter(-1);
    }
  }

  /**
   * 各トラックの p_data_pointer を SourceMap で ZMS 行番号 (1-indexed) に変換し、
   * 変化があったトラックだけ Player Webview に送る (T3.1)。
   * 30Hz の position サイクルの一部として動くので、送信量を抑えるため
   * 差分のみを push する。
   */
  private pushLineMapToView(positions: { trk: number; ptr: number; state: number }[]): void {
    const changed: { trk: number; line: number }[] = [];
    for (const p of positions) {
      const map = this.trackMaps.get(p.trk);
      if (!map || map.quality === "none") continue;
      const range = sourceMapLookup(map, p.ptr);
      if (!range) continue;
      const line = range.start.line + 1;
      if (this.lastLineByTrack.get(p.trk) !== line) {
        this.lastLineByTrack.set(p.trk, line);
        changed.push({ trk: p.trk, line });
      }
    }
    if (changed.length > 0) {
      void this.view.postMessage({ type: "lineMap", tracks: changed });
    }
  }

  /**
   * トラック番号に対応するパレット色を返す。
   * Tracer と同じ 8 色循環 (`zmusic.trace.palette`)。
   * SVG fill 用に alpha を 0.85 に持ち上げる (エディタ装飾用の 0.45 だと薄すぎる)。
   */
  private trackColor(trk: number): string {
    const palette = vscode.workspace
      .getConfiguration("zmusic")
      .get<string[]>("trace.palette", DEFAULT_PALETTE);
    const colors = palette.length > 0 ? palette : DEFAULT_PALETTE;
    const base = colors[(trk - 1) % colors.length];
    return boostAlpha(base, 0.85);
  }

  private checkEndCondition(tracks: { trk: number; ptr: number; state: number }[]): void {
    if (this.state !== "playing" && this.state !== "playingNoTrace") return;
    const alive = tracks.some((t) => t.state === 0 || t.state === 0x7f);
    if (alive) {
      this.endStreak = 0;
      return;
    }
    this.endStreak++;
    if (this.endStreak >= 3) {
      void this.stopInternal().then(() => this.setState("idle"));
    }
  }

  private onDocChanged(e: vscode.TextDocumentChangeEvent): void {
    if (this.state !== "playing") return;
    if (e.document !== this.currentDoc) return;
    this.tracer.clear();
    this.setState("playingNoTrace");
    void this.view.postMessage({ type: "setSampling", enabled: false, intervalMs: 0 });
  }

  private async handleFileRequest(requestId: number, name: string): Promise<void> {
    if (!this.currentDoc) {
      await this.view.postMessage({ type: "fileResponse", requestId, dataB64: null });
      return;
    }
    const docDir = vscode.Uri.joinPath(this.currentDoc.uri, "..");
    try {
      const entries = await vscode.workspace.fs.readDirectory(docDir);
      const lower = name.toLowerCase();
      const match = entries.find(([n]) => n.toLowerCase() === lower);
      if (!match) {
        this.outputChannel.appendLine(`[file] not found: ${name}`);
        await this.view.postMessage({ type: "fileResponse", requestId, dataB64: null });
        return;
      }
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(docDir, match[0]));
      await this.view.postMessage({
        type: "fileResponse",
        requestId,
        dataB64: encodeBase64(new Uint8Array(bytes)),
      });
    } catch (e) {
      this.outputChannel.appendLine(`[file] read failed for ${name}: ${e}`);
      await this.view.postMessage({ type: "fileResponse", requestId, dataB64: null });
    }
  }
}
