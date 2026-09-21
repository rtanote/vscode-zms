// vscode API の最小モック (Range / Position のみ)。
// src/player/zms/ZmsParser.ts と src/player/zmd/SourceMap.ts が使う API のみを実装する。
"use strict";

class Position {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }
  isBefore(other) {
    return this.line < other.line || (this.line === other.line && this.character < other.character);
  }
  isAfter(other) {
    return this.line > other.line || (this.line === other.line && this.character > other.character);
  }
  isEqual(other) {
    return this.line === other.line && this.character === other.character;
  }
}

class Range {
  constructor(startOrLine, characterOrEnd, endLine, endCharacter) {
    if (startOrLine instanceof Position && characterOrEnd instanceof Position) {
      this.start = startOrLine;
      this.end = characterOrEnd;
    } else {
      this.start = new Position(startOrLine, characterOrEnd);
      this.end = new Position(endLine, endCharacter);
    }
  }
}

/**
 * vscode.l10n の最小モック。テストでは常に「英語 = source」を返す簡易実装。
 * placeholder ({0}, {1}, ...) は args で置換する。
 */
const l10n = {
  t(message, ...args) {
    if (typeof message === "object" && message !== null) {
      const tpl = message.message;
      const params = message.args ?? {};
      return tpl.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`));
    }
    return message.replace(/\{(\d+)\}/g, (_, i) => {
      const idx = Number(i);
      return idx < args.length ? String(args[idx]) : `{${i}}`;
    });
  },
};

module.exports = { Position, Range, l10n };
