import * as vscode from "vscode";

export type ZmusicVersion = "2" | "3";

/** VS Code 設定 `zmusic.syntax.version` の値。 */
export type ZmusicVersionSetting = "auto" | ZmusicVersion;

/**
 * ZMS ドキュメントの Z-MUSIC バージョン判定
 *
 * 優先順位:
 *   1. ファイル先頭 (最初の 10 行以内) の magic comment
 *      例: `/ zmusic-version: 2`  `/ zmusic-version: 3`
 *   2. VS Code 設定 `zmusic.syntax.version` が "2" | "3" ならそれ
 *   3. "auto" ならヒューリスティック検出 (V3 固有トークンの有無)
 *   4. 判定不能なら v2 (本プロジェクトのメイン)
 */
export function detectVersion(doc: vscode.TextDocument): ZmusicVersion {
  const marker = readMagicComment(doc);
  if (marker) return marker;

  const setting = vscode.workspace
    .getConfiguration("zmusic")
    .get<ZmusicVersionSetting>("syntax.version", "auto");
  if (setting === "2" || setting === "3") return setting;

  return heuristicDetect(doc);
}

const MAGIC_RE = /^\s*\/\s*zmusic[-_]?version\s*[:=]\s*([23])(?:\.\d+)?\b/i;

function readMagicComment(doc: vscode.TextDocument): ZmusicVersion | undefined {
  const scanLines = Math.min(doc.lineCount, 10);
  for (let i = 0; i < scanLines; i++) {
    const m = MAGIC_RE.exec(doc.lineAt(i).text);
    if (m) return m[1] as ZmusicVersion;
  }
  return undefined;
}

/**
 * 内容からのヒューリスティック検出。
 * TODO: V3 固有トークンをもっと洗い出して精度を上げる。現状は v2 デフォルト。
 */
function heuristicDetect(_doc: vscode.TextDocument): ZmusicVersion {
  return "2";
}
