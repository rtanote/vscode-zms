import * as vscode from "vscode";
import {
  atCommands,
  bracketCommands,
  dotCommands,
  parenCommands,
  type CommandInfo,
} from "./commandReference";

/**
 * Z-MUSIC の言語補完
 *
 * VS Code ネイティブ CompletionItemProvider として登録。Copilot の
 * 推測補完とは別レイヤーで、辞書ベースの正確な補完を提供する。
 *
 * トリガ文字:
 *   `@` → @コマンド (atCommands)
 *   `(` → 共通/演奏制御コマンド (parenCommands)
 *   `.` → ドット命令 (dotCommands)
 *   `[` → 反復/演奏制御 (bracketCommands)
 *
 * commandReference の各辞書を CompletionItem に変換して返す。
 * description は Markdown 化されて Suggest ポップアップで見える。
 */
export class ZmusicCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    context: vscode.CompletionContext,
  ): vscode.CompletionItem[] {
    const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
    // 「直前文字」= トリガ文字または明示補完起動時のプレフィックス末尾
    const trigger =
      context.triggerCharacter ??
      (linePrefix.length > 0 ? linePrefix[linePrefix.length - 1] : "");

    switch (trigger) {
      case "@":
        return buildItems(atCommands, "@", vscode.CompletionItemKind.Function);
      case "(":
        return buildItems(parenCommands, "(", vscode.CompletionItemKind.Constructor);
      case ".":
        return buildItems(dotCommands, ".", vscode.CompletionItemKind.Struct);
      case "[":
        return buildItems(bracketCommands, "[", vscode.CompletionItemKind.Keyword);
      default:
        // Ctrl+Space での明示起動の場合は全辞書を返す
        if (context.triggerKind === vscode.CompletionTriggerKind.Invoke) {
          return [
            ...buildItems(atCommands, "@", vscode.CompletionItemKind.Function),
            ...buildItems(parenCommands, "(", vscode.CompletionItemKind.Constructor),
            ...buildItems(dotCommands, ".", vscode.CompletionItemKind.Struct),
            ...buildItems(bracketCommands, "[", vscode.CompletionItemKind.Keyword),
          ];
        }
        return [];
    }
  }
}

function buildItems(
  dict: Record<string, CommandInfo>,
  prefix: string,
  kind: vscode.CompletionItemKind,
): vscode.CompletionItem[] {
  const out: vscode.CompletionItem[] = [];
  for (const info of Object.values(dict)) {
    // label は既に `@V` `(I)` `.INITIALIZE` `[DO]` の完全形になっている。
    // ユーザは prefix (`@` `(` `.` `[`) をすでに打ち込んでいるので、
    // label 先頭のその 1 文字だけ削って残りを insert する。
    const insertText = info.label.startsWith(prefix)
      ? info.label.slice(prefix.length)
      : info.label;
    const item = new vscode.CompletionItem(info.label, kind);
    item.detail = info.syntax;
    const md = new vscode.MarkdownString();
    md.appendCodeblock(info.syntax, "");
    md.appendMarkdown(info.description);
    if (info.devices) md.appendMarkdown(`\n\n${info.devices}`);
    item.documentation = md;
    item.insertText = insertText;
    // filter マッチ対象を label (`@V` 等) にする。
    // これで `@V` タイプ中でも正しく絞り込まれる。
    item.filterText = info.label;
    out.push(item);
  }
  return out;
}
