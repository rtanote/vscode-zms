/**
 * ZMD オペコード仕様 (zm12.txt §12.4 準拠, Z-MUSIC v2.08)。
 *
 * $00-$7F は音符 (3 バイト)。残りは FIXED_SPECS で個別定義。
 * $EA (ローランド・エクスクルーシブ) と $EC (MIDI データ送信) のみ可変長。
 *
 * 未知オペコードに遭遇したら 'unknown' を返し、呼び出し側 (Disassembler) が
 * そのトラックを quality='none' に落とす。
 */

export type ZmdCommandKind =
  | "note"
  | "rest"
  | "chord"
  | "portamento"
  | "wait"
  | "absnote"
  | "loopStart"
  | "loopEnd"
  | "other"
  | "end"
  | "unknown";

export interface OpcodeSpec {
  length: number;
  kind: ZmdCommandKind;
  consumesTime: boolean;
}

const NOTE_SPEC: OpcodeSpec = { length: 3, kind: "note", consumesTime: true };

const FIXED_SPECS: Partial<Record<number, OpcodeSpec>> = {
  // ── $80-$8F ─────────────────────────────────────────
  0x80: { length: 3, kind: "rest", consumesTime: true },
  0x82: { length: 1, kind: "other", consumesTime: false }, // noise mode off
  0x83: { length: 1, kind: "other", consumesTime: false }, // sync wait (W)
  0x84: { length: 1, kind: "other", consumesTime: false }, // temp velocity restore

  // ── $90-$9F ─────────────────────────────────────────
  0x90: { length: 3, kind: "other", consumesTime: false }, // @T tempo
  0x91: { length: 3, kind: "other", consumesTime: false }, // T tempo
  0x92: { length: 3, kind: "other", consumesTime: false }, // @T+
  0x93: { length: 3, kind: "other", consumesTime: false }, // @T-
  0x94: { length: 3, kind: "other", consumesTime: false }, // T+
  0x95: { length: 3, kind: "other", consumesTime: false }, // T-
  0x96: { length: 3, kind: "other", consumesTime: false }, // rel pitch bend up
  0x97: { length: 3, kind: "other", consumesTime: false }, // rel pitch bend down
  0x98: { length: 3, kind: "other", consumesTime: false }, // modulation waveform
  0x99: { length: 3, kind: "other", consumesTime: false }, // MIDI pitch mod mode
  0x9a: { length: 4, kind: "other", consumesTime: false }, // ARCC CC number
  0x9b: { length: 3, kind: "other", consumesTime: false }, // ADPCM play (Y2)
  0x9c: { length: 3, kind: "other", consumesTime: false }, // modulation sync

  // ── $A0-$AF ─────────────────────────────────────────
  0xa0: { length: 2, kind: "other", consumesTime: false }, // voice @
  0xa1: { length: 2, kind: "other", consumesTime: false }, // voice change 2
  0xa2: { length: 2, kind: "other", consumesTime: false }, // ADPCM freq (Y13)
  0xa3: { length: 2, kind: "other", consumesTime: false }, // channel assign
  0xa5: { length: 2, kind: "other", consumesTime: false }, // noise
  0xa6: { length: 2, kind: "other", consumesTime: false }, // fade in/out
  0xa7: { length: 2, kind: "other", consumesTime: false }, // damper
  0xa8: { length: 2, kind: "other", consumesTime: false }, // bend range
  0xa9: { length: 2, kind: "other", consumesTime: false }, // ADPCM freq (@F)
  0xaa: { length: 2, kind: "other", consumesTime: false }, // rel volume up
  0xab: { length: 2, kind: "other", consumesTime: false }, // rel volume down
  0xac: { length: 2, kind: "other", consumesTime: false }, // keyoff none mode
  0xad: { length: 2, kind: "other", consumesTime: false }, // *0 forced sound (step=0)
  0xae: { length: 2, kind: "other", consumesTime: false }, // amplitude mod / ARCC
  0xaf: { length: 2, kind: "other", consumesTime: false }, // sync signal send

  // ── $B0-$BF ─────────────────────────────────────────
  0xb0: { length: 1, kind: "other", consumesTime: false }, // pan 0
  0xb1: { length: 1, kind: "other", consumesTime: false }, // pan 1
  0xb2: { length: 1, kind: "other", consumesTime: false }, // pan 2
  0xb3: { length: 1, kind: "other", consumesTime: false }, // pan 3
  0xb4: { length: 2, kind: "other", consumesTime: false }, // multi-step pan
  0xb5: { length: 3, kind: "other", consumesTime: false }, // Y command
  0xb6: { length: 2, kind: "other", consumesTime: false }, // volume
  0xb7: { length: 2, kind: "other", consumesTime: false }, // ADPCM pan
  0xb8: { length: 2, kind: "other", consumesTime: false }, // ADPCM effect mode
  0xb9: { length: 2, kind: "other", consumesTime: false }, // velocity
  0xbb: { length: 2, kind: "other", consumesTime: false }, // pitch mod switch
  0xbc: { length: 2, kind: "other", consumesTime: false }, // amp mod / ARCC switch
  0xbd: { length: 2, kind: "other", consumesTime: false }, // autobend switch
  0xbe: { length: 2, kind: "other", consumesTime: false }, // aftertouch switch
  0xbf: { length: 1, kind: "other", consumesTime: false }, // forced key off (`)

  // ── $C0-$CF ─────────────────────────────────────────
  0xc0: { length: 2, kind: "other", consumesTime: false }, // [~] commands
  0xc1: { length: 3, kind: "loopStart", consumesTime: false }, // |:  (payload $CF, count)
  0xc2: { length: 3, kind: "loopEnd", consumesTime: false }, // :|
  0xc3: { length: 4, kind: "other", consumesTime: false }, // | skip #1
  0xc4: { length: 3, kind: "other", consumesTime: false }, // | skip #2
  0xc5: { length: 2, kind: "other", consumesTime: false }, // MIDI tie mode
  0xc7: { length: 2, kind: "other", consumesTime: false }, // special cmd switch
  0xc8: { length: 2, kind: "other", consumesTime: false }, // rel pan up
  0xc9: { length: 2, kind: "other", consumesTime: false }, // rel pan down
  0xca: { length: 2, kind: "other", consumesTime: false }, // rel vel up
  0xcb: { length: 2, kind: "other", consumesTime: false }, // rel vel down
  0xcc: { length: 2, kind: "other", consumesTime: false }, // all tracks fade
  0xcd: { length: 2, kind: "other", consumesTime: false }, // chord *0&
  0xce: { length: 2, kind: "other", consumesTime: false }, // forced replay (J)

  // ── $D0-$DF ─────────────────────────────────────────
  0xd0: { length: 3, kind: "wait", consumesTime: true }, // @W
  0xd1: { length: 5, kind: "other", consumesTime: false }, // transpose/detune
  0xd2: { length: 5, kind: "other", consumesTime: false }, // NRPN
  0xd3: { length: 3, kind: "other", consumesTime: false }, // variation/bank (I)
  0xd5: { length: 3, kind: "other", consumesTime: false }, // work direct write
  0xd6: { length: 5, kind: "other", consumesTime: false }, // mod speed
  0xd7: { length: 3, kind: "other", consumesTime: false }, // work direct write +
  0xd8: { length: 3, kind: "other", consumesTime: false }, // work direct write -
  0xd9: { length: 2, kind: "other", consumesTime: false }, // temp velocity
  0xda: { length: 2, kind: "other", consumesTime: false }, // temp vel up
  0xdb: { length: 2, kind: "other", consumesTime: false }, // temp vel down

  // ── $E0-$EF ─────────────────────────────────────────
  0xe0: { length: 12, kind: "portamento", consumesTime: true }, // (~)
  0xe1: { length: 12, kind: "other", consumesTime: false }, // autobend
  0xe2: { length: 14, kind: "chord", consumesTime: true }, // '~'
  0xe3: { length: 9, kind: "other", consumesTime: false }, // aftertouch seq
  0xe6: { length: 3, kind: "other", consumesTime: false }, // mod depth
  0xe8: { length: 5, kind: "other", consumesTime: false }, // delay set
  // 0xea: variable-length (see getOpcodeSpec)
  0xeb: { length: 4, kind: "other", consumesTime: false }, // ID set
  // 0xec: variable-length (see getOpcodeSpec)
  0xed: { length: 4, kind: "other", consumesTime: false }, // effect control
  0xee: { length: 18, kind: "other", consumesTime: false }, // pitch mod depth 1/8
  0xef: { length: 10, kind: "other", consumesTime: false }, // amp mod / ARCC depth 1/8

  // ── $F0-$FF ─────────────────────────────────────────
  0xf0: { length: 1, kind: "other", consumesTime: false }, // NOP
  0xf1: { length: 3, kind: "other", consumesTime: false }, // skip forward
  0xf2: { length: 3, kind: "other", consumesTime: false }, // skip backward
  0xfc: { length: 3, kind: "other", consumesTime: false }, // note off (MIDI only)
  0xfd: { length: 3, kind: "other", consumesTime: false }, // note on (MIDI only)
  0xfe: { length: 6, kind: "absnote", consumesTime: true }, // *n abs len
  0xff: { length: 1, kind: "end", consumesTime: false }, // track end
};

const UNKNOWN_SPEC: OpcodeSpec = { length: 1, kind: "unknown", consumesTime: false };

/**
 * オペコード仕様を返す。$EA / $EC のみ入力バイト列から長さを計算する。
 * bytes / offset は可変長解決のみに使い、固定長オペコードでは無視する。
 */
export function getOpcodeSpec(
  opcode: number,
  bytes: Uint8Array,
  offset: number,
): OpcodeSpec {
  if (opcode <= 0x7f) return NOTE_SPEC;

  if (opcode === 0xea) {
    // Roland exclusive: read forward until terminating $FF (inclusive).
    // Inside $EA the byte stream may contain other $FF bytes that are NOT the
    // terminator, so `.indexOf(0xff)` from the very top is unsafe — start scanning
    // one byte after $EA and consume until the first following $FF.
    let i = offset + 1;
    while (i < bytes.length && bytes[i] !== 0xff) i++;
    if (i >= bytes.length) return UNKNOWN_SPEC; // truncated
    return { length: i - offset + 1, kind: "other", consumesTime: false };
  }

  if (opcode === 0xec) {
    // MIDI data send: $EC, count.W (big-endian), data...
    if (offset + 2 >= bytes.length) return UNKNOWN_SPEC;
    const count = (bytes[offset + 1] << 8) | bytes[offset + 2];
    const total = 3 + count;
    if (offset + total > bytes.length) return UNKNOWN_SPEC;
    return { length: total, kind: "other", consumesTime: false };
  }

  const spec = FIXED_SPECS[opcode];
  return spec ?? UNKNOWN_SPEC;
}
