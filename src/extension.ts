import * as vscode from "vscode";
import { ZMusicHoverProvider } from "./hoverProvider";
import { ZmusicCompletionProvider } from "./completionProvider";
import { activateDiagnostics } from "./diagnosticProvider";
import { SheetMusicPanel } from "./sheetMusicPanel";
import { mmlToAbc, defaultState, ParserState } from "./mmlToAbc";
import { PlayerController } from "./player/PlayerController";
import { PlayerViewProvider } from "./player/PlayerViewProvider";
import { detectVersion, type ZmusicVersionSetting } from "./versionDetection";
import { setupCopilotInstructions, maybePromptCopilotSetup } from "./copilotSetup";
import { TrackPrefixDecorator } from "./trackPrefixDecorator";
import { FlowControlDecorator } from "./flowControlDecorator";
import { OctaveDecorator } from "./octaveDecorator";
import { PanpotDecorator } from "./panpotDecorator";

const LANG_ID = "zms";

let sheetMusicPanel: SheetMusicPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(LANG_ID, new ZMusicHoverProvider()),
    vscode.languages.registerCompletionItemProvider(
      LANG_ID,
      new ZmusicCompletionProvider(),
      "@",
      "(",
      ".",
      "[",
    ),
  );
  activateDiagnostics(context);

  // (t1) 等トラック prefix をトラック別パレット色で装飾
  const trackPrefixDecorator = new TrackPrefixDecorator();
  context.subscriptions.push(trackPrefixDecorator);

  // [Coda] / |:n / :| などフロー制御 token を bold で上書き
  const flowControlDecorator = new FlowControlDecorator();
  context.subscriptions.push(flowControlDecorator);

  // o5 / < / > オクターブを青色で強制表示
  const octaveDecorator = new OctaveDecorator();
  context.subscriptions.push(octaveDecorator);

  // p0..p3 / @p0..@p127 パンポットを黄色で強制表示
  const panpotDecorator = new PanpotDecorator();
  context.subscriptions.push(panpotDecorator);

  const playerView = new PlayerViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      PlayerViewProvider.viewType,
      playerView,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  const controller = new PlayerController(context, playerView);
  context.subscriptions.push(controller);

  context.subscriptions.push(
    vscode.commands.registerCommand("zmusic.play", () => controller.play()),
    vscode.commands.registerCommand("zmusic.playFromCursor", () => controller.playFromCursor()),
    vscode.commands.registerCommand("zmusic.stop", () => controller.stop()),
    vscode.commands.registerCommand("zmusic.fadeOut", () => controller.fadeOut()),
    vscode.commands.registerCommand("zmusic.toggleTrace", () => controller.toggleTrace()),
    vscode.commands.registerCommand("zmusic.showPlayer", () => controller.showPlayer()),
    vscode.commands.registerCommand("zmusic.dumpZmd", () => controller.dumpZmd()),
    vscode.commands.registerCommand("zmusic.reportIssue", () => controller.reportIssue()),
    vscode.commands.registerCommand("zmusic.selectDriver", () => controller.selectDriver()),
    vscode.commands.registerCommand("zmusic.setupCopilotInstructions", () => setupCopilotInstructions(context)),
  );

  // 初回 .zms オープン時 (activation の active editor / 後続の open) で
  // Copilot 命令ファイルのセットアップを案内する。同一セッション内では
  // 1 度だけ発火させる。
  let promptedThisSession = false;
  const promptOnce = () => {
    if (promptedThisSession) return;
    promptedThisSession = true;
    void maybePromptCopilotSetup(context);
  };
  if (vscode.window.activeTextEditor?.document.languageId === LANG_ID) {
    setTimeout(promptOnce, 3000); // startup 直後は待って落ち着かせる
  }
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (doc.languageId === LANG_ID) promptOnce();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("zmusic.showSheetMusic", () => {
      if (!sheetMusicPanel) {
        sheetMusicPanel = new SheetMusicPanel(context.extensionUri);
        // Live playhead on the sheet music — Player pushes note indices via
        // this callback; SheetMusicPanel disposes → controller clears the hook.
        controller.setSheetMusicHighlighter((idx, color) => sheetMusicPanel?.highlight(idx, color));
      }
      sheetMusicPanel.show();
      updateSheetMusic();
    }),
  );

  // ── バージョン表示ステータスバー + セレクタ ─────────────────
  const versionStatus = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    50,
  );
  versionStatus.command = "zmusic.selectVersion";
  versionStatus.tooltip = vscode.l10n.t("Z-MUSIC syntax version (click to change)");
  context.subscriptions.push(versionStatus);

  const refreshVersionStatus = () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== LANG_ID) {
      versionStatus.hide();
      return;
    }
    const setting = vscode.workspace
      .getConfiguration("zmusic")
      .get<ZmusicVersionSetting>("syntax.version", "auto");
    const detected = detectVersion(editor.document);
    const label = setting === "auto" ? `${detected} (auto)` : setting;
    versionStatus.text = `$(music) Z-MUSIC v${label}`;
    versionStatus.show();
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("zmusic.selectVersion", async () => {
      const picked = await vscode.window.showQuickPick(
        [
          {
            label: vscode.l10n.t("Auto"),
            detail: vscode.l10n.t("Magic comment → content heuristic (recommended)"),
            value: "auto" as const,
          },
          {
            label: vscode.l10n.t("Force V2 (2.08)"),
            detail: vscode.l10n.t("Main target of this project"),
            value: "2" as const,
          },
          {
            label: vscode.l10n.t("Force V3"),
            detail: vscode.l10n.t("ZMSC3 family. Range checks not implemented."),
            value: "3" as const,
          },
        ],
        { title: vscode.l10n.t("Z-MUSIC: Syntax version") },
      );
      if (!picked) return;
      await vscode.workspace
        .getConfiguration("zmusic")
        .update("syntax.version", picked.value, vscode.ConfigurationTarget.Workspace);
      refreshVersionStatus();
    }),
    vscode.window.onDidChangeActiveTextEditor(() => refreshVersionStatus()),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (
        vscode.window.activeTextEditor &&
        e.document === vscode.window.activeTextEditor.document
      ) {
        refreshVersionStatus();
      }
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("zmusic.syntax.version")) refreshVersionStatus();
    }),
  );
  refreshVersionStatus();

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((e) => {
      if (
        e.textEditor.document.languageId === LANG_ID &&
        sheetMusicPanel
      ) {
        updateSheetMusic();
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      const editor = vscode.window.activeTextEditor;
      if (
        editor &&
        e.document === editor.document &&
        e.document.languageId === LANG_ID &&
        sheetMusicPanel
      ) {
        updateSheetMusic();
      }
    }),
  );
}

function parseTrackAssignment(line: string): string[] | null {
  const match = line.match(/\(t(\d+(?:,\s*\d+)*)\)/i);
  if (!match) return null;
  return match[1].split(/,\s*/).map(s => s.trim());
}

function updateSheetMusic(): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !sheetMusicPanel) return;

  const doc = editor.document;
  const cursorLine = editor.selection.active.line;

  const trackStates = new Map<string, ParserState>();
  let activeTracks: string[] = ["_default"];

  for (let i = 0; i <= cursorLine; i++) {
    const line = doc.lineAt(i).text;

    const tracks = parseTrackAssignment(line);
    if (tracks) {
      activeTracks = tracks;
    }

    const primaryTrack = activeTracks[0];
    const state = trackStates.get(primaryTrack) ?? defaultState();

    const result = mmlToAbc(line, state);

    for (const t of activeTracks) {
      trackStates.set(t, { ...result.state });
    }

    if (i === cursorLine) {
      sheetMusicPanel.update(result.abc, result.velocities);
    }
  }
}

export function deactivate() {
  if (sheetMusicPanel) {
    sheetMusicPanel.dispose();
  }
}
