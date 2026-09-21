import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import type { HostToWebview, WebviewToHost } from "./protocol";

/**
 * パネル領域の "Z-MUSIC Player" WebviewView
 * media/player/{html,css,js} を CSP 付きで配信し、zmusic.js/.wasm への
 * localResourceRoots を制限する。
 */
export class PlayerViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "zmusic.playerView";

  private view: vscode.WebviewView | undefined;
  private messageHandler: ((msg: WebviewToHost) => void) | undefined;
  private readyPromise: Promise<void> | undefined;
  private readyResolve: (() => void) | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media", "player")],
    };
    view.webview.html = this.getHtml(view.webview);

    view.webview.onDidReceiveMessage((msg: WebviewToHost) => {
      if (msg.type === "ready" && this.readyResolve) {
        this.readyResolve();
        this.readyResolve = undefined;
      }
      this.messageHandler?.(msg);
    });

    view.onDidDispose(() => {
      this.view = undefined;
      this.readyPromise = undefined;
      this.readyResolve = undefined;
    });
  }

  onMessage(handler: (msg: WebviewToHost) => void): void {
    this.messageHandler = handler;
  }

  postMessage(msg: HostToWebview): Thenable<boolean> {
    if (!this.view) return Promise.resolve(false);
    return this.view.webview.postMessage(msg);
  }

  /** Webview の `ready` イベント (install 完了) まで待つ。 */
  whenReady(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = new Promise((r) => (this.readyResolve = r));
    }
    return this.readyPromise;
  }

  async reveal(preserveFocus = true): Promise<void> {
    if (this.view) {
      this.view.show(preserveFocus);
      return;
    }
    await vscode.commands.executeCommand("workbench.view.extension.zmusicPanel");
  }

  isVisible(): boolean {
    return !!this.view?.visible;
  }

  private getHtml(webview: vscode.Webview): string {
    const mediaRoot = vscode.Uri.joinPath(this.context.extensionUri, "media", "player");
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, "player.css")).toString();
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, "player.js")).toString();
    const zmusicJsPath = vscode.Uri.joinPath(mediaRoot, "zmusic.js");
    const zmusicUri = fs.existsSync(zmusicJsPath.fsPath)
      ? webview.asWebviewUri(zmusicJsPath).toString()
      : webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, "player.js")).toString(); // fallback: skip loader

    const template = fs.readFileSync(
      path.join(mediaRoot.fsPath, "player.html"),
      "utf-8",
    );

    // CSP。wasm-unsafe-eval は WASM 初期化に必要。
    const csp = [
      "default-src 'none'",
      `script-src ${webview.cspSource} 'wasm-unsafe-eval'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `img-src ${webview.cspSource}`,
      `connect-src ${webview.cspSource}`,
    ].join("; ");

    return template
      .replace("__CSS__", cssUri)
      .replace("__ZMUSIC_JS__", zmusicUri)
      .replace("__PLAYER_JS__", jsUri)
      .replace(
        /<head>/,
        `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`,
      );
  }
}
