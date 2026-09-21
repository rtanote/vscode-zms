/**
 * MML (Z-MUSIC) → ABC notation 変換
 */

export interface ParserState {
  octave: number;
  defaultLength: number; // MML音長数値 (4=四分, 8=八分, etc.)
  keySignature: string;  // ABC調号 ("C", "G", "Bb", etc.) "" = 未設定(自動検出)
  velocities: number[];  // z コマンドで設定されたベロシティ値リスト (サイクル)
  velocityIndex: number; // 現在のサイクル位置
}

export function defaultState(): ParserState {
  return { octave: 4, defaultLength: 4, keySignature: "", velocities: [100], velocityIndex: 0 };
}

// シャープ系調号: #の数 → ABC key
const SHARP_KEYS = ["C", "G", "D", "A", "E", "B", "F#", "C#"];
// フラット系調号: bの数 → ABC key
const FLAT_KEYS  = ["C", "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"];
// シャープの順 (五度圏)
const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
// フラットの順
const FLAT_ORDER  = ["B", "E", "A", "D", "G", "C", "F"];

// [K.SIGN] の名前付きキー → ABC key
const NAMED_KEYS: Record<string, string> = {
  "cmajor": "C", "c-major": "C",
  "gmajor": "G", "g-major": "G",
  "dmajor": "D", "d-major": "D",
  "amajor": "A", "a-major": "A",
  "emajor": "E", "e-major": "E",
  "bmajor": "B", "b-major": "B",
  "f#major": "F#", "f#-major": "F#",
  "fmajor": "F", "f-major": "F",
  "bbmajor": "Bb", "bb-major": "Bb",
  "ebmajor": "Eb", "eb-major": "Eb",
  "abmajor": "Ab", "ab-major": "Ab",
  "dbmajor": "Db", "db-major": "Db",
  "aminor": "Am", "a-minor": "Am",
  "eminor": "Em", "e-minor": "Em",
  "bminor": "Bm", "b-minor": "Bm",
  "f#minor": "F#m", "f#-minor": "F#m",
  "dminor": "Dm", "d-minor": "Dm",
  "gminor": "Gm", "g-minor": "Gm",
  "cminor": "Cm", "c-minor": "Cm",
  "fminor": "Fm", "f-minor": "Fm",
};

export interface ConvertResult {
  abc: string;
  state: ParserState;
  velocities: number[]; // 各音符(休符除く)のベロシティ値
}

/**
 * MML行をABC notation文字列に変換する。
 * 音符・休符・オクターブ・音長・付点・臨時記号・和音・タイに対応。
 */
export function mmlToAbc(line: string, state: ParserState): ConvertResult {
  const st = { ...state, velocities: [...state.velocities] };

  // [K.SIGN ...] を先にパース（stripNonMmlで消される前に）
  const ksign = parseKSign(line);
  if (ksign !== null) {
    st.keySignature = ksign;
  }

  // z コマンドを stripNonMml の前にパース
  parseZCommands(line, st);

  const effective = expandShortRepeats(stripNonMml(line), st.defaultLength);
  if (effective.length === 0) {
    return { abc: "", state: st, velocities: [] };
  }

  // { abc文字列, MML音長数値, 音長分数(四分音符単位) } のペア
  const tokens: Token[] = [];
  let i = 0;

  while (i < effective.length) {
    const ch = effective[i];

    // --- オクターブ上下 (Z-MUSIC: < = up, > = down) ---
    if (ch === "<") {
      st.octave++;
      i++;
      continue;
    }
    if (ch === ">") {
      st.octave--;
      i++;
      continue;
    }

    // --- オクターブ指定 o<n> ---
    if (/[oO]/.test(ch) && i + 1 < effective.length && /[-\d]/.test(effective[i + 1])) {
      i++; // skip 'o'
      let numStr = "";
      if (effective[i] === "-") {
        numStr += "-";
        i++;
      }
      while (i < effective.length && /\d/.test(effective[i])) {
        numStr += effective[i++];
      }
      if (numStr.length > 0 && numStr !== "-") {
        st.octave = parseInt(numStr, 10);
      }
      continue;
    }

    // --- デフォルト音長 l<n> ---
    if (/[lL]/.test(ch) && i + 1 < effective.length && /\d/.test(effective[i + 1])) {
      i++; // skip 'l'
      let numStr = "";
      while (i < effective.length && /\d/.test(effective[i])) {
        numStr += effective[i++];
      }
      const val = parseInt(numStr, 10);
      if (val > 0) {
        st.defaultLength = val;
      }
      continue;
    }

    // --- 和音 '...' ---
    if (ch === "'") {
      i++; // skip opening '
      const savedOctave = st.octave; // 和音内の <> はローカルスコープ
      const chordParts: { noteCh: string; accPrefix: string; octave: number }[] = [];
      while (i < effective.length && effective[i] !== "'") {
        const noteChar = effective[i];
        if (noteChar === "<") { st.octave++; i++; continue; }
        if (noteChar === ">") { st.octave--; i++; continue; }
        if (/[a-gA-G]/.test(noteChar)) {
          i++;
          const acc = parseAccidental(effective, i);
          i = acc.next;
          chordParts.push({ noteCh: noteChar.toUpperCase(), accPrefix: acc.prefix, octave: st.octave });
        } else {
          i++;
        }
      }
      st.octave = savedOctave; // オクターブを復元
      if (i < effective.length) i++; // skip closing '
      const dur = parseDuration(effective, i, st.defaultLength);
      i = dur.next;
      if (chordParts.length > 0) {
        const chordText = "[" + chordParts.map(p => p.accPrefix + noteToAbc(p.noteCh, p.octave)).join("") + "]" + dur.abcSuffix;
        tokens.push({
          text: chordText,
          mmlLen: dur.mmlLen, durNum: dur.durNum, durDen: dur.durDen, durSuffix: dur.abcSuffix,
          velocity: nextVelocity(st),
          noteInfo: {
            noteCh: chordParts[0].noteCh, accPrefix: "",
            octave: chordParts[0].octave, tieSuffix: "",
          },
          chordParts,
        } as ChordToken);
      }
      continue;
    }

    // --- 音符 a-g ---
    if (/[a-gA-G]/.test(ch)) {
      i++;
      const acc = parseAccidental(effective, i);
      i = acc.next;
      const dur = parseDuration(effective, i, st.defaultLength);
      i = dur.next;
      const tie = parseTie(effective, i);
      i = tie.next;
      tokens.push({
        text: acc.prefix + noteToAbc(ch, st.octave) + dur.abcSuffix + tie.suffix,
        mmlLen: dur.mmlLen, durNum: dur.durNum, durDen: dur.durDen, durSuffix: dur.abcSuffix,
        velocity: nextVelocity(st),
        noteInfo: {
          noteCh: ch.toUpperCase(), accPrefix: acc.prefix,
          octave: st.octave, tieSuffix: tie.suffix,
        },
      });
      continue;
    }

    // --- 休符 r ---
    if (/[rR]/.test(ch)) {
      i++;
      const dur = parseDuration(effective, i, st.defaultLength);
      i = dur.next;
      tokens.push({ text: "z" + dur.abcSuffix, mmlLen: dur.mmlLen, durNum: dur.durNum, durDen: dur.durDen, durSuffix: dur.abcSuffix });
      continue;
    }

    // --- それ以外はスキップ ---
    i++;
  }

  if (tokens.length === 0) {
    return { abc: "", state: st, velocities: [] };
  }

  // 音域に応じて最適な音部記号を選択し、必要ならオクターブシフト
  const { clefStr, shift } = chooseBestClef(tokens);
  if (shift !== 0) {
    applyOctaveShift(tokens, shift);
  }

  // 調号: 明示設定 or 自動検出
  const key = st.keySignature || autoDetectKey(tokens);

  // 調号に含まれる臨時記号を個別の音符から除去
  adjustAccidentalsForKey(tokens, key);

  // 小節線を挿入してから連桁処理
  const withBars = insertBarLines(tokens);
  const body = joinWithBeaming(withBars);
  const abc = `X:1\nM:4/4\nL:1/4\nK:${key} ${clefStr}\n${body}\n`;
  // 音符のみのベロシティ配列を構築（休符・小節線は除外）
  const vels = tokens.filter(t => t.noteInfo != null).map(t => t.velocity ?? 100);
  return { abc, state: st, velocities: vels };
}

interface Token {
  text: string;
  mmlLen: number;
  durNum: number; // 音長の分子 (四分音符 = 1/1)
  durDen: number; // 音長の分母
  durSuffix: string; // ABC音長サフィックス ("", "2", "/2", "3/2", etc.)
  velocity?: number; // この音符のベロシティ (休符・小節線は undefined)
  // 音符情報 (休符・小節線は undefined)
  noteInfo?: {
    noteCh: string;   // 原音名 (大文字)
    accPrefix: string; // ABC臨時記号 (^, _, =, "")
    octave: number;    // MMLオクターブ
    tieSuffix: string; // タイ ("-" or "")
  };
}

// 4/4拍子: 1小節 = 4四分音符
const BEATS_PER_MEASURE = 4;

// --- Helpers ---

/**
 * z コマンドを行からパースし、state の velocities/velocityIndex を更新する。
 * 形式: z115,110,105,100  または z125,,85,90 (空値は前回値を維持)
 * stripNonMml で除去される前に呼ぶ。
 */
function parseZCommands(line: string, st: ParserState): void {
  const re = /(?<![a-zA-Z])z(\d+(?:,\d*)*)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    const parts = match[1].split(",");
    const newVels: number[] = [];
    let prev = st.velocities.length > 0 ? st.velocities[0] : 100;
    for (const p of parts) {
      if (p === "") {
        // 空値は前回値を維持
        newVels.push(prev);
      } else {
        const v = parseInt(p, 10);
        newVels.push(v);
        prev = v;
      }
    }
    if (newVels.length > 0) {
      st.velocities = newVels;
      st.velocityIndex = 0;
    }
  }
}

/** 現在のベロシティ値を取得してインデックスを進める */
function nextVelocity(st: ParserState): number {
  const vel = st.velocities[st.velocityIndex % st.velocities.length];
  st.velocityIndex++;
  return vel;
}

/**
 * [K.SIGN ...] / [KEY_SIGNATURE ...] をパースしてABC調号を返す。
 * 見つからなければ null。
 *
 * 対応形式:
 *   [K.SIGN +c,+d,+f,+g]     → 個別指定 (シャープ/フラット)
 *   [K.SIGN Gmajor]          → 名前付き
 *   [K.SIGN G-major]         → ハイフン付き名前
 */
function parseKSign(line: string): string | null {
  const match = line.match(/\[(?:K\.SIGN|KEY_SIGNATURE)\s+([^\]]+)\]/i);
  if (!match) return null;
  const arg = match[1].trim();

  // 名前付きキーを試す: "Gmajor", "G-major", "Aminor", etc.
  const namedKey = NAMED_KEYS[arg.toLowerCase().replace(/\s+/g, "")];
  if (namedKey) return namedKey;

  // 個別指定: "+c,+f,+g" or "-b,-e,-a"
  const parts = arg.split(/,\s*/);
  let sharps = 0;
  let flats = 0;
  for (const p of parts) {
    const trimmed = p.trim().toLowerCase();
    if (trimmed.startsWith("+")) sharps++;
    else if (trimmed.startsWith("-")) flats++;
  }

  if (sharps > 0 && sharps < SHARP_KEYS.length) return SHARP_KEYS[sharps];
  if (flats > 0 && flats < FLAT_KEYS.length) return FLAT_KEYS[flats];
  return "C";
}

/**
 * 臨時記号の出現パターンから調号を自動推定する。
 * 五度圏順にシャープ/フラットの数をカウントして最も近い調を返す。
 * 転調があると不正確になるが、単一キーの曲では実用的。
 */
function autoDetectKey(tokens: Token[]): string {
  // 各音名に対するシャープ/フラット出現を集計
  const sharpNotes = new Set<string>();
  const flatNotes = new Set<string>();

  for (const t of tokens) {
    if (!t.noteInfo || !t.noteInfo.accPrefix) continue;
    const note = t.noteInfo.noteCh; // "C", "D", etc.
    if (t.noteInfo.accPrefix === "^") sharpNotes.add(note);
    else if (t.noteInfo.accPrefix === "_") flatNotes.add(note);

    if (isChordToken(t)) {
      for (const p of t.chordParts) {
        if (p.accPrefix === "^") sharpNotes.add(p.noteCh);
        else if (p.accPrefix === "_") flatNotes.add(p.noteCh);
      }
    }
  }

  // シャープが五度圏順に何個連続するか数える
  if (sharpNotes.size > 0 && flatNotes.size === 0) {
    let count = 0;
    for (const note of SHARP_ORDER) {
      if (sharpNotes.has(note)) count++;
      else break;
    }
    if (count > 0 && count < SHARP_KEYS.length) return SHARP_KEYS[count];
  }

  // フラットが順に何個連続するか
  if (flatNotes.size > 0 && sharpNotes.size === 0) {
    let count = 0;
    for (const note of FLAT_ORDER) {
      if (flatNotes.has(note)) count++;
      else break;
    }
    if (count > 0 && count < FLAT_KEYS.length) return FLAT_KEYS[count];
  }

  return "C";
}

/**
 * 調号 → 各音名の期待される臨時記号マップを返す。
 * 例: "G" → { F: "^" }, "Bb" → { B: "_", E: "_" }
 */
function getKeyAccidentals(key: string): Map<string, string> {
  const acc = new Map<string, string>();
  // key名 → シャープ数(正) / フラット数(負)
  const keyToNum: Record<string, number> = {
    "C": 0, "G": 1, "D": 2, "A": 3, "E": 4, "B": 5, "F#": 6, "C#": 7,
    "F": -1, "Bb": -2, "Eb": -3, "Ab": -4, "Db": -5, "Gb": -6, "Cb": -7,
    "Am": 0, "Em": 1, "Bm": 2, "F#m": 3, "C#m": 4, "G#m": 5,
    "Dm": -1, "Gm": -2, "Cm": -3, "Fm": -4, "Bbm": -5,
  };
  const n = keyToNum[key];
  if (n === undefined) return acc;
  if (n > 0) {
    for (let i = 0; i < n && i < SHARP_ORDER.length; i++) {
      acc.set(SHARP_ORDER[i], "^");
    }
  } else if (n < 0) {
    for (let i = 0; i < -n && i < FLAT_ORDER.length; i++) {
      acc.set(FLAT_ORDER[i], "_");
    }
  }
  return acc;
}

/**
 * 調号に含まれる臨時記号を個別の音符から除去し、textを再構築する。
 * 例: K:G のとき f+ (^F) → F (シャープ不要), f! (=F) → =F (ナチュラル維持)
 */
function adjustAccidentalsForKey(tokens: Token[], key: string): void {
  const keyAcc = getKeyAccidentals(key);
  if (keyAcc.size === 0) return;

  for (const t of tokens) {
    if (isChordToken(t)) {
      let changed = false;
      for (const p of t.chordParts) {
        const expected = keyAcc.get(p.noteCh) ?? "";
        if (p.accPrefix === expected && expected !== "") {
          p.accPrefix = "";
          changed = true;
        }
      }
      if (changed) {
        t.text = "[" + t.chordParts.map(p => p.accPrefix + noteToAbc(p.noteCh, p.octave)).join("") + "]" + t.durSuffix;
      }
    } else if (t.noteInfo) {
      const expected = keyAcc.get(t.noteInfo.noteCh) ?? "";
      if (t.noteInfo.accPrefix === expected && expected !== "") {
        t.noteInfo.accPrefix = "";
        t.text = noteToAbc(t.noteInfo.noteCh, t.noteInfo.octave) + t.durSuffix + t.noteInfo.tieSuffix;
      }
    }
  }
}

/**
 * `|:n ... :|m` 形式のリピートを、内容が 1 小節未満の場合に限ってインライン展開する。
 *
 * 動機: `L8|:3gb:|<d4` のような短い反復 MML をそのまま楽譜化すると `gb<d` と
 *   1 回しか表示されず音楽的に不正確。1 小節未満の短いフレーズは展開したほうが
 *   直感的に読める。逆に 1 小節以上のフレーズはリピート記号として残したほうが
 *   譜面が簡潔になるので展開しない (現状は abcjs へのリピート記号投入は未実装、
 *   unexpanded のまま後段でスキップ扱い)。
 *
 * 反復回数 n の取得優先順位: `|:n` の n → `:|m` の m → default 2 (ZM5.txt L2322〜)。
 * 非貪欲マッチ `[^|]*?` により、ネストしたリピートは内側から順に展開される。
 */
function expandShortRepeats(line: string, defaultLength: number): string {
  let prev: string;
  let out = line;
  do {
    prev = out;
    out = out.replace(
      /\|:(\d*)([^|]*?):\|(\d*)/g,
      (full, openN: string, content: string, closeN: string) => {
        const n = parseInt(openN || closeN || "2", 10);
        if (!Number.isFinite(n) || n < 1) return full;
        const dur = measureContentDuration(content, defaultLength);
        if (dur > 0 && dur < BEATS_PER_MEASURE) {
          return content.repeat(n);
        }
        return full;
      },
    );
  } while (prev !== out);
  return out;
}

/**
 * リピート内容の総演奏時間を四分音符単位で概算する。
 * note / rest / chord を集計、内部の `l<n>` 変更も追跡。
 * 連符 `{...}N` や複雑な構文は近似扱い (カーソル内に展開するか否かの閾値判定用なので粗くて良い)。
 */
function measureContentDuration(content: string, defaultLength: number): number {
  let total = 0;
  let curLen = defaultLength;
  let i = 0;
  while (i < content.length) {
    const ch = content[i];
    if (/[lL]/.test(ch) && i + 1 < content.length && /\d/.test(content[i + 1])) {
      i++;
      let s = "";
      while (i < content.length && /\d/.test(content[i])) s += content[i++];
      const v = parseInt(s, 10);
      if (v > 0) curLen = v;
      continue;
    }
    if (ch === "'") {
      i++;
      while (i < content.length && content[i] !== "'") i++;
      if (i < content.length) i++;
      const dur = parseDuration(content, i, curLen);
      total += dur.durNum / dur.durDen;
      i = dur.next;
      continue;
    }
    if (/[a-gA-GrR]/.test(ch)) {
      i++;
      if (i < content.length && /[+\-#!]/.test(content[i])) i++;
      const dur = parseDuration(content, i, curLen);
      total += dur.durNum / dur.durDen;
      i = dur.next;
      while (i < content.length && (content[i] === "&" || content[i] === "^")) {
        i++;
        while (i < content.length && /[a-gA-GrR\d.*+\-#!]/.test(content[i])) i++;
      }
      continue;
    }
    i++;
  }
  return total;
}

/** MML以外の要素（コメント、ドットコマンド、括弧コマンド、@コマンド等）を除去 */
function stripNonMml(line: string): string {
  // .command 行はスキップ
  if (/^\s*\.([a-z_])/i.test(line)) {
    return "";
  }

  let result = line;

  // /コメント除去
  const slashIdx = findCommentStart(result);
  if (slashIdx !== -1) {
    result = result.substring(0, slashIdx);
  }

  // 括弧コマンド [xxx] を除去 (和音の[]とは区別: MMLの[]はコマンド名が入る)
  result = result.replace(/\[[^\]]*[a-z]{2,}[^\]]*\]/gi, " ");

  // (Tn) 等のカッココマンドを除去
  result = result.replace(/\([A-Za-z][^)]*\)/g, " ");

  // @コマンドを除去 (@v, @u, @123 等)
  result = result.replace(/@[a-z]\s*-?\d+/gi, " ");
  result = result.replace(/@\d+/g, " ");

  // v, q, t, p, k, u 等の非音符パラメータコマンドを除去 (音符a-gと休符r以外)
  // ただし o, l は状態変更のため残す
  result = result.replace(/(?<![a-zA-Z])([vqtpkuVQTPKU])\s*-?\d+/g, " ");

  // z コマンド (z100,60,...) を除去
  result = result.replace(/(?<![a-zA-Z])z-?\d+(?:,-?\d+)*/gi, " ");

  return result;
}

/** 臨時記号をパース */
function parseAccidental(
  text: string,
  pos: number,
): { prefix: string; next: number } {
  if (pos >= text.length) return { prefix: "", next: pos };
  const ch = text[pos];
  if (ch === "+" || ch === "#") return { prefix: "^", next: pos + 1 };
  if (ch === "-") return { prefix: "_", next: pos + 1 };
  if (ch === "!") return { prefix: "=", next: pos + 1 };
  return { prefix: "", next: pos };
}

/** 音長をパース（数値 + 付点）。mmlLen と実音長(分数)も返す */
function parseDuration(
  text: string,
  pos: number,
  defaultLen: number,
): { abcSuffix: string; mmlLen: number; durNum: number; durDen: number; next: number } {
  let i = pos;
  let numStr = "";
  while (i < text.length && /\d/.test(text[i])) {
    numStr += text[i++];
  }
  const mmlLen = numStr.length > 0 ? parseInt(numStr, 10) : defaultLen;

  // 付点カウント
  let dots = 0;
  while (i < text.length && text[i] === ".") {
    dots++;
    i++;
  }

  const suffix = durationToAbc(mmlLen, dots);
  const dur = durationFraction(mmlLen, dots);
  return { abcSuffix: suffix, mmlLen, durNum: dur.num, durDen: dur.den, next: i };
}

/** タイをパース */
function parseTie(
  text: string,
  pos: number,
): { suffix: string; next: number } {
  if (pos < text.length && text[pos] === "&") {
    return { suffix: "-", next: pos + 1 };
  }
  return { suffix: "", next: pos };
}

/**
 * MML音長 → ABC音長サフィックス
 * L:1/4 基準: MML c4→"", c2→"2", c1→"4", c8→"/2", c16→"/4"
 * 付点: 1.5倍 → 分数表記
 */
function durationToAbc(mmlLen: number, dots: number): string {
  if (mmlLen <= 0) return "";

  // 基本: ABC倍率 = 4 / mmlLen
  let num = 4;
  let den = mmlLen;

  // 付点: 各付点で (元の長さの半分)^n を加算
  // 付点1つ: 3/2倍, 付点2つ: 7/4倍, 付点3つ: 15/8倍
  for (let d = 0; d < dots; d++) {
    // num/den に num/(den * 2^(d+1)) を加算
    const addNum = 4;
    const addDen = mmlLen * Math.pow(2, d + 1);
    // 通分: num/den + addNum/addDen
    num = num * addDen + addNum * den;
    den = den * addDen;
  }

  // 最大公約数で約分
  const g = gcd(num, den);
  num /= g;
  den /= g;

  if (den === 1) {
    return num === 1 ? "" : String(num);
  }
  if (num === 1) {
    return "/" + String(den);
  }
  return num + "/" + den;
}

/** 音名をABC表記に変換 (オクターブ考慮) */
function noteToAbc(noteCh: string, octave: number): string {
  const base = noteCh.toUpperCase();

  // ABC notation: C (大文字) = C4 (中央ド), c (小文字) = C5
  // Z-MUSIC MML: o4 = 中央ド → ABC 大文字 C
  if (octave <= 4) {
    // 大文字 + コンマ (o4=C, o3=C,, o2=C,,, o1=C,,,)
    let result = base;
    for (let i = octave; i < 4; i++) {
      result += ",";
    }
    return result;
  } else {
    // 小文字 + アポストロフィ (o5=c, o6=c', o7=c'')
    let result = base.toLowerCase();
    for (let i = 5; i < octave; i++) {
      result += "'";
    }
    return result;
  }
}

/** コメント開始位置を探す (hoverProvider.ts と同等ロジック) */
function findCommentStart(line: string): number {
  let inParen = 0;
  let inBracket = 0;
  let inChord = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inParen && !inBracket) {
      inChord = !inChord;
    } else if (!inChord) {
      if (ch === "(") inParen++;
      else if (ch === ")" && inParen > 0) inParen--;
      else if (ch === "[") inBracket++;
      else if (ch === "]" && inBracket > 0) inBracket--;
      else if (ch === "/" && inParen === 0 && inBracket === 0) {
        return i;
      }
    }
  }
  return -1;
}

/** MML音長+付点 → 四分音符単位の分数を返す */
function durationFraction(mmlLen: number, dots: number): { num: number; den: number } {
  if (mmlLen <= 0) return { num: 0, den: 1 };
  // 基本: 4/mmlLen 四分音符
  let num = 4;
  let den = mmlLen;
  for (let d = 0; d < dots; d++) {
    const addNum = 4;
    const addDen = mmlLen * Math.pow(2, d + 1);
    num = num * addDen + addNum * den;
    den = den * addDen;
  }
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

/** 和音トークン (chordParts を保持) */
interface ChordToken extends Token {
  chordParts: { noteCh: string; accPrefix: string; octave: number }[];
}

function isChordToken(t: Token): t is ChordToken {
  return "chordParts" in t;
}

/**
 * 全トークンの音域から最適な音部記号を選択する。
 * 加線の総数が最小になる記号を選ぶ。
 *
 * 各記号の「快適範囲」(加線0-1本):
 *   treble+8 : o6–o7  (表示シフト -2)
 *   treble   : o4–o5
 *   bass     : o2–o3   ← o3 は慣習的にヘ音記号側で書く (中央ハ以下)
 *   bass-8   : o0–o1  (表示シフト +2)
 *
 * center は快適範囲の中央だが、o3/o4 境界の tie-break で o3 が bass、
 * o4 が treble に落ちるよう若干上寄せ (treble center 5.0 / bass center 3.0)
 * にしている。
 */
function chooseBestClef(tokens: Token[]): { clefStr: string; shift: number } {
  const octaves: number[] = [];
  for (const t of tokens) {
    if (t.noteInfo) {
      octaves.push(t.noteInfo.octave);
    }
    if (isChordToken(t)) {
      for (let j = 1; j < t.chordParts.length; j++) {
        octaves.push(t.chordParts[j].octave);
      }
    }
  }
  if (octaves.length === 0) return { clefStr: "clef=treble", shift: 0 };

  // 各記号: 快適中心。center を o3/o4 境界を跨ぐ形にして tie-break を回避
  // (o3 → bass, o4 → treble)。8va/8vb は微小 bias で標準記号を優先。
  const candidates: { clef: string; shift: number; center: number; bias: number }[] = [
    { clef: "clef=treble",   shift:  0, center: 5.0, bias: 0 },
    { clef: "clef=bass",     shift:  0, center: 3.0, bias: 0 },
    { clef: "clef=treble+8", shift: -2, center: 7.0, bias: 0.5 },
    { clef: "clef=bass-8",   shift: +2, center: 1.0, bias: 0.5 },
  ];

  let bestClef = candidates[0]; // default: treble
  let bestCost = Infinity;

  for (const cand of candidates) {
    // コスト = 快適範囲(center±1.5)外の音ごとに距離の二乗 + 8va/8vb偏りコスト
    let cost = cand.bias;
    for (const oct of octaves) {
      const dist = Math.abs(oct - cand.center);
      if (dist > 1.5) {
        cost += (dist - 1.5) * (dist - 1.5);
      }
    }
    if (cost < bestCost) {
      bestCost = cost;
      bestClef = cand;
    }
  }

  return { clefStr: bestClef.clef, shift: bestClef.shift };
}

/** 全音符トークンにオクターブシフトを適用し、ABC文字列を再生成する */
function applyOctaveShift(tokens: Token[], shift: number): void {
  for (const t of tokens) {
    if (isChordToken(t)) {
      for (const p of t.chordParts) {
        p.octave += shift;
      }
      const dur = t.text.match(/\](.*)$/)?.[1] ?? "";
      t.text = "[" + t.chordParts.map(p => p.accPrefix + noteToAbc(p.noteCh, p.octave)).join("") + "]" + dur;
    } else if (t.noteInfo) {
      t.noteInfo.octave += shift;
      const dur = t.text.replace(/^[_^=]*[a-gA-G][',]*/, "");
      t.text = t.noteInfo.accPrefix + noteToAbc(t.noteInfo.noteCh, t.noteInfo.octave) + dur;
    }
  }
}

/** 小節線 "|" を表すセンチネルトークン */
const BAR_TOKEN: Token = { text: "|", mmlLen: 0, durNum: 0, durDen: 1, durSuffix: "" };

/**
 * トークン列に小節線を挿入する。
 * 4/4拍子 = 4四分音符ごとに "|" を挿入。
 */
function insertBarLines(tokens: Token[]): Token[] {
  const result: Token[] = [];
  // 累積拍を分数で追跡 (beatNum / beatDen 四分音符)
  let beatNum = 0;
  let beatDen = 1;

  for (const tok of tokens) {
    result.push(tok);

    // 拍を加算: beatNum/beatDen + tok.durNum/tok.durDen
    beatNum = beatNum * tok.durDen + tok.durNum * beatDen;
    beatDen = beatDen * tok.durDen;
    const g1 = gcd(beatNum, beatDen);
    beatNum /= g1;
    beatDen /= g1;

    // BEATS_PER_MEASURE (= 4) に達したら小節線
    // beatNum/beatDen >= 4 → beatNum >= 4 * beatDen
    while (beatNum >= BEATS_PER_MEASURE * beatDen) {
      result.push(BAR_TOKEN);
      beatNum -= BEATS_PER_MEASURE * beatDen;
      const g2 = gcd(beatNum, beatDen);
      if (g2 > 0) {
        beatNum /= g2;
        beatDen /= g2;
      }
    }
  }
  return result;
}

/**
 * 連桁(ビーム)を考慮してトークンを連結する。
 * ABC notation ではスペースなしの音符がビームで繋がる。
 * 八分音符以下 (MML音長 >= 8) が連続する区間をスペースなしで連結。
 * 四分音符以上や休符はビームを切る。
 */
function joinWithBeaming(tokens: Token[]): string {
  if (tokens.length === 0) return "";

  let result = tokens[0].text;
  for (let i = 1; i < tokens.length; i++) {
    const prev = tokens[i - 1];
    const curr = tokens[i];

    // 小節線は前後にスペースを入れる
    if (curr.text === "|" || prev.text === "|") {
      result += " " + curr.text;
      continue;
    }

    // 両方とも八分音符以下（mmlLen >= 8）かつ休符でなければ連桁
    const prevBeamable = prev.mmlLen >= 8 && !prev.text.startsWith("z");
    const currBeamable = curr.mmlLen >= 8 && !curr.text.startsWith("z");
    if (prevBeamable && currBeamable) {
      result += curr.text; // スペースなし → 連桁
    } else {
      result += " " + curr.text; // スペースあり → ビーム切断
    }
  }
  return result;
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}
