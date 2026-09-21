import { getOpcodeSpec, type ZmdCommandKind } from "./ZmdOpcodes";

/**
 * ZMD バイト列 → コマンド列
 * 入力はトラック 1 本分の切り出し済バイト列 (先頭が $00-$FF のいずれかのコマンド)。
 * $FF (トラック終了) を検出するかバッファ末尾に達するまで走査。
 * 未知オペコードに遭遇したら {@link ZmdDisassemblyError} を投げる。
 * 呼び出し側はこれを catch して quality='none' に落とす (REQ-TRACE-4)。
 */

export interface ZmdCommand {
  offset: number;
  length: number;
  opcode: number;
  kind: ZmdCommandKind;
  consumesTime: boolean;
}

export class ZmdDisassemblyError extends Error {
  constructor(
    message: string,
    readonly offset: number,
    readonly opcode: number,
  ) {
    super(message);
    this.name = "ZmdDisassemblyError";
  }
}

export function disassemble(bytes: Uint8Array): ZmdCommand[] {
  const commands: ZmdCommand[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const opcode = bytes[offset];
    const spec = getOpcodeSpec(opcode, bytes, offset);
    if (spec.kind === "unknown") {
      throw new ZmdDisassemblyError(
        `Unknown opcode $${opcode.toString(16).padStart(2, "0").toUpperCase()} at offset ${offset}`,
        offset,
        opcode,
      );
    }
    if (offset + spec.length > bytes.length) {
      throw new ZmdDisassemblyError(
        `Truncated opcode $${opcode.toString(16).padStart(2, "0").toUpperCase()} at offset ${offset}: needs ${spec.length} bytes, ${bytes.length - offset} remain`,
        offset,
        opcode,
      );
    }
    commands.push({
      offset,
      length: spec.length,
      opcode,
      kind: spec.kind,
      consumesTime: spec.consumesTime,
    });
    offset += spec.length;
    if (spec.kind === "end") break;
  }
  return commands;
}
