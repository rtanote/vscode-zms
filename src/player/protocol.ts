/**
 * Host ↔ Webview メッセージプロトコル
 * Uint8Array の受け渡しは base64 文字列に統一。
 */

export interface TrackInfo {
  trk: number;
  ch: number;
  zmdStart: number;
  zmdB64: string;
}

export type HostToWebview =
  | { type: "init"; driverName: string; driverB64: string; bufferSize: number; driverArgs: string[] }
  | { type: "compile"; zmsB64: string; requestId: number }
  | { type: "start"; targetStep?: number }
  | { type: "stop" }
  | { type: "fadeOut"; speed: number }
  | { type: "setSampling"; enabled: boolean; intervalMs: number }
  | { type: "fileResponse"; requestId: number; dataB64: string | null }
  | { type: "maskTracks"; mutedTrks: number[] }
  | { type: "lineMap"; tracks: { trk: number; line: number }[] }
  | { type: "restoreSoloMute"; mutedTrks: number[]; soloedTrks: number[] }
  | { type: "trackColors"; colors: { trk: number; color: string }[] };

export type WebviewToHost =
  | { type: "ready"; version: string }
  | { type: "compiled"; requestId: number; ok: boolean; code: number; tracks: TrackInfo[] }
  | { type: "started" }
  | { type: "stopped" }
  | { type: "position"; step: number; tracks: { trk: number; ptr: number; state: number; pgm?: number; vol?: number; note?: number }[] }
  | { type: "log"; text: string }
  | { type: "error"; where: string; message: string }
  | { type: "fileRequest"; requestId: number; name: string }
  | { type: "audioState"; state: "running" | "suspended" }
  | { type: "userAction"; action: "play" | "stop" | "fadeOut" }
  | { type: "soloMuteChanged"; mutedTrks: number[]; soloedTrks: number[] };

export function encodeBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return Buffer.from(s, "binary").toString("base64");
}

export function decodeBase64(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}
