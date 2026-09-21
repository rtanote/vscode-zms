export interface CommandInfo {
  label: string;
  syntax: string;
  description: string;
  devices?: string;
  /**
   * バージョン依存の追記。detectVersion(doc) の結果に応じて hover の末尾に
   * 該当エントリだけ追記される (両方定義してもよく、V3 ファイルでは v3 のみ、
   * V2 ファイルでは v2 のみ出る)。両方未定義なら description の共通記述のみ。
   */
  notes?: { v2?: string; v3?: string };
}

// @コマンド (@+英字)
export const atCommands: Record<string, CommandInfo> = {
  v: {
    label: "@V",
    syntax: "@Vn (n: 0-127)",
    description: "絶対音量を設定する。数値が大きいほど音量が大きい。",
    devices: "[FM][ADPCM][MIDI]",
  },
  u: {
    label: "@U",
    syntax: "@Un (n: 0-127)",
    description: "ベロシティ(打鍵の強さ)を設定する。",
    devices: "[FM][ADPCM][MIDI]",
  },
  k: {
    label: "@K",
    syntax: "@Kn (n: -7680～+7680)",
    description: "ディチューンを設定する。64が半音に相当。",
    devices: "[FM][ADPCM][MIDI]",
  },
  b: {
    label: "@B",
    syntax: "@Bn (n: -8192～+8191) / @Bn1,n2,dly,bnd",
    description:
      "ピッチベンド値を設定する。1オクターブ≒8192。パラメータ4つでオートベンド。",
    devices: "[FM][ADPCM][MIDI]",
  },
  g: {
    label: "@G",
    syntax: "@Gn (n: 0-127)",
    description: "ベンドレンジを半音単位で設定する。",
    devices: "[MIDI]",
  },
  p: {
    label: "@P",
    syntax: "@Pn (n: 0-127)",
    description: "パンポットを設定する。0=左, 64=中央, 127=右。",
    devices: "[FM][ADPCM][MIDI]",
  },
  m: {
    label: "@M",
    syntax: "@Mn (深さ) / @Mn1,...,n8 (8段階)",
    description: "ピッチモジュレーション(ビブラート)の深さを設定する。",
    devices: "[FM][ADPCM][MIDI]",
  },
  h: {
    label: "@H",
    syntax: "@Hn1,n2",
    description:
      "モジュレーションのディレイを設定する。n1=ピッチ用, n2=振幅用。",
    devices: "[FM][ADPCM][MIDI]",
  },
  s: {
    label: "@S",
    syntax: "@Sn1,n2",
    description:
      "モジュレーションのスピードを設定する。n1=ピッチ用, n2=振幅用。",
    devices: "[FM][ADPCM][MIDI]",
  },
  c: {
    label: "@C",
    syntax: "@Cn,r,m / @Cm (FM: %0000-%1111)",
    description:
      "ARCC制御番号の設定。MIDIではCC番号を指定。FMではAMオペレータを選択。",
    devices: "[FM][ADPCM][MIDI]",
  },
  a: {
    label: "@A",
    syntax: "@An / @An1,...,n8",
    description:
      "ARCC(Assignable Real-time Control Change)の深さを設定する。",
    devices: "[FM][ADPCM][MIDI]",
  },
  d: {
    label: "@D",
    syntax: "@Dn (n: 0=OFF, 1=ON)",
    description: "ダンパーペダル(ホールド)の ON/OFF を設定する。",
    devices: "[FM][ADPCM][MIDI]",
  },
  r: {
    label: "@R",
    syntax: "@Rn (n: 0=通常, 1=ノートオフ省略)",
    description: "ノートオフ省略モードを設定する。リズムパート等に有用。",
    devices: "[FM][ADPCM][MIDI]",
  },
  w: {
    label: "@W",
    syntax: "@Wl (l: 1-32767)",
    description: "指定時間、前の状態を保持するウェイト。休符と異なりゲートタイムなし。",
    devices: "[FM][ADPCM][MIDI]",
  },
  j: {
    label: "@J",
    syntax: "@Jn (n: 0=通常, 1=FM互換)",
    description: "MIDIパートのタイモードを設定する。1でFM音源部と同様のスラー動作。",
    devices: "[MIDI]",
  },
  q: {
    label: "@Q",
    syntax: "@Qn (n: -32767～32767)",
    description:
      "ゲートタイムを絶対音長で設定する。正値でノートオフを早め、負値で遅らせる。",
    devices: "[FM][ADPCM][MIDI]",
  },
  l: {
    label: "@L",
    syntax: "@Ln (n: 0-32767)",
    description: "デフォルト音長を絶対音長で設定する。",
    devices: "[FM][ADPCM][MIDI]",
  },
  e: {
    label: "@E",
    syntax: "@Er,c,d (GS) / @En1,n2 (MT32)",
    description: "エフェクト設定。GS系ではリバーブ/コーラス/ディレイの送信量を設定。",
    devices: "[MIDI]",
  },
  y: {
    label: "@Y",
    syntax: "@Ya1,a2,d1,d2",
    description: "NRPNを送信する。a1,a2=アドレス上下位, d1,d2=データ上下位。",
    devices: "[MIDI]",
  },
  f: {
    label: "@F",
    syntax: "@Fn (n: 0-6)",
    description:
      "ADPCM再生周波数を設定する。0:3.9kHz, 1:5.2kHz, 2:7.8kHz, 3:10.4kHz, 4:15.6kHz(初期値), 5:20.8kHz, 6:31.2kHz。",
    devices: "[ADPCM]",
  },
  o: {
    label: "@O",
    syntax: "@On (n: 0-31)",
    description: "FM音源のノイズモードを設定する。",
    devices: "[FM]",
  },
  i: {
    label: "@I",
    syntax: "@In1,n2,n3",
    description: "MIDI楽器タイプを登録する。n1=メーカー, n2=デバイス, n3=モデル。",
    devices: "[MIDI]",
  },
  x: {
    label: "@X",
    syntax: "@Xn1,...,ni",
    description:
      "MIDIエクスクルーシブデータを送信する。8ビット単位で指定。",
    devices: "[MIDI]",
  },
  n: {
    label: "@N",
    syntax: "@Nn (n: ノート番号)",
    description: "ノート番号で直接発音する。",
    devices: "[FM][ADPCM][MIDI]",
  },
  z: {
    label: "@Z",
    syntax: "@Zn1,...,n8 (ni: 0-127)",
    description:
      "アフタータッチ・シーケンスを設定する。音符を8等分した時間で値を変化。",
    devices: "[FM][ADPCM][MIDI]",
  },
  t: {
    label: "@T",
    syntax: "@Tn (n: 0-16383)",
    description: "タイマ値を直接設定する。通常はTコマンドを使用。",
    devices: "[FM][ADPCM][MIDI]",
  },
};

// 単文字MMLコマンド (大文字で検索)
export const mmlCommands: Record<string, CommandInfo> = {
  V: {
    label: "V",
    syntax: "Vn (n: 0-16)",
    description: "音量を設定する。初期値8。",
    devices: "[FM][ADPCM][MIDI]",
  },
  L: {
    label: "L",
    syntax: "Ln (音楽的音長) / L*n (絶対音長)",
    description: "デフォルト音長を設定する。初期値4(4分音符)。",
    devices: "[FM][ADPCM][MIDI]",
  },
  Q: {
    label: "Q",
    syntax: "Qn (n: -8～8)",
    description:
      "ゲートタイム(発音時間)を設定する。初期値8(テヌート)。分母は.GATETIME_RESOLUTIONで変更可。",
    devices: "[FM][ADPCM][MIDI]",
  },
  U: {
    label: "U",
    syntax: "Un (n: 0-127)",
    description: "ベロシティを設定する。@Uと同等。",
    devices: "[FM][ADPCM][MIDI]",
  },
  K: {
    label: "K",
    syntax: "Kn (n: -127～127)",
    description: "キートランスポーズ(半音単位の移調)を設定する。初期値0。",
    devices: "[FM][ADPCM][MIDI]",
  },
  P: {
    label: "P",
    syntax: "Pn (n: 0-3)",
    description: "パンポットを設定する。0=消音, 1=左, 2=右, 3=中央。",
    devices: "[FM][ADPCM][MIDI]",
  },
  T: {
    label: "T",
    syntax: "Tn (n: 1-32767) / T±n (相対)",
    description: "テンポ(BPM)を設定する。初期値120。±で相対変更。",
    devices: "[FM][ADPCM][MIDI]",
  },
  O: {
    label: "O",
    syntax: "On (n: -1～9)",
    description: "オクターブを設定する。初期値4。",
    devices: "[FM][ADPCM][MIDI]",
  },
  Z: {
    label: "Z",
    syntax: "Zn1,n2,...,n128 (ni: 0-127)",
    description:
      "ベロシティ・シーケンスを設定する。音符ごとに順番にベロシティが変化。",
    devices: "[FM][ADPCM][MIDI]",
  },
  S: {
    label: "S",
    syntax: "Sn1,n2 (n: 0-4, 8-32767)",
    description:
      "モジュレーション波形タイプを選択する。0:鋸歯波, 1:矩形波, 2:三角波, 3:ワンショット, 4:ランダム。",
    devices: "[FM][ADPCM][MIDI]",
  },
  H: {
    label: "H",
    syntax: "Hn1,n2 (n: 0-1)",
    description:
      "モジュレーション同期/ホールドモードを設定する。0=同期, 1=ホールド。",
    devices: "[FM][ADPCM][MIDI]",
  },
  M: {
    label: "M",
    syntax: "Mp,a (p: 0-2, a: 0-1)",
    description:
      "MIDIモジュレーションモードを設定する。p=ピッチモード, a=ARCCモード。",
    devices: "[MIDI]",
  },
  I: {
    label: "I",
    syntax: "In1,n2 (n: 0-127)",
    description: "バンクセレクト。n1=上位, n2=下位。",
    devices: "[FM][ADPCM][MIDI]",
  },
  Y: {
    label: "Y",
    syntax: "Ya,d (FM: レジスタ) / Ya,d (MIDI: CC)",
    description:
      "FM音源レジスタへの直接書き込み、またはMIDIコントロールチェンジ送信。",
    devices: "[FM][ADPCM][MIDI]",
  },
  W: {
    label: "W",
    syntax: "W (待機) / Wn (同期信号送信)",
    description:
      "同期待ち、またはトラックnへ同期信号を送信する。",
    devices: "[FM][ADPCM][MIDI]",
  },
  J: {
    label: "J",
    syntax: "Jn (n: 1-65535)",
    description: "指定トラックの演奏を強制再開する。",
    devices: "[FM][ADPCM][MIDI]",
  },
  R: {
    label: "R",
    syntax: "Rl,g (l: 音長, g: ゲートタイム)",
    description: "休符。l,gは音符と同様の音長指定。",
    devices: "[FM][ADPCM][MIDI]",
  },
};

// 角括弧コマンド (小文字で検索)
export const bracketCommands: Record<string, CommandInfo> = {
  do: {
    label: "[DO]",
    syntax: "[DO]",
    description: "無限ループの開始位置を設定する。[LOOP]と対で使用。",
    devices: "[FM][ADPCM][MIDI]",
  },
  loop: {
    label: "[LOOP]",
    syntax: "[LOOP]",
    description: "無限ループの終了位置。[DO]へ戻る。",
    devices: "[FM][ADPCM][MIDI]",
  },
  end: {
    label: "[END]",
    syntax: "[END]",
    description: "演奏を停止する。",
    devices: "[FM][ADPCM][MIDI]",
  },
  "pcm_mode": {
    label: "[PCM_MODE]",
    syntax: "[PCM_MODE mode] (TIMBRE/RHYTHM)",
    description:
      "ADPCMの動作モードを設定する。TIMBRE=楽器モード(音程変化可), RHYTHM=リズムモード。",
    devices: "[ADPCM]",
  },
  "voice_reserve": {
    label: "[VOICE_RESERVE]",
    syntax: "[VOICE_RESERVEn] (n: 発音数)",
    description: "1トラック内での同時発音数を宣言する。和音演奏に必要。",
    devices: "[FM][ADPCM]",
  },
  "k.sign": {
    label: "[K.SIGN]",
    syntax: "[K.SIGN +c,+f,...]",
    description:
      "調号を設定する。変化記号 (`+` シャープ / `-` フラット) + 音階名 (a-g) をカンマで並べる。\n" +
      "- 例: `[K.SIGN +f,+c,+g]` = A major (♯3)、`[K.SIGN -a,-b,-d,-e]` = A♭ major\n" +
      "- 音階 MML 直後の `!` (ナチュラル) で臨時解除も可 (`[K.SIGN -a] a a!`)",
    devices: "[FM][ADPCM][MIDI]",
    notes: {
      v2:
        "**V2 モード (現在):** 調名指定 (`[K.SIGN Emajor]` 等) は非対応。",
      v3:
        "**V3 モード (現在):** `+/-音名` 形式に加えて `[K.SIGN Emajor]` `[K.SIGN Bbmajor]` 等の**調名指定**も可 (zmusic-v3/ZM5.MAN §5.3)。対応調名: `Cmajor,Gmajor,Dmajor,Amajor,Emajor,Bmajor,F+major,F#major,C+major,C#major,Fmajor,B-major,Bbmajor,E-major,Ebmajor,A-major,Abmajor,D-major,Dbmajor,G-major,Gbmajor,C-major,Cbmajor`。",
    },
  },
  "key_signature": {
    label: "[KEY_SIGNATURE]",
    syntax: "[KEY_SIGNATURE ...]",
    description: "調号を設定する。[K.SIGN]と同義。",
    devices: "[FM][ADPCM][MIDI]",
  },
  pattern: {
    label: "[PATTERN]",
    syntax: "[PATTERN name]",
    description:
      ".PATTERNで定義したパターントラックを呼び出して演奏する。",
    devices: "[FM][ADPCM][MIDI]",
  },
  embed: {
    label: "[EMBED]",
    syntax: "[EMBED name]",
    description:
      ".PATTERNで定義したパターンをその場に展開(インライン埋め込み)する。",
    devices: "[FM][ADPCM][MIDI]",
  },
  jump: {
    label: "[JUMP]",
    syntax: "[JUMP]",
    description: "小節ジャンプを行う。",
    devices: "[FM][ADPCM][MIDI]",
  },
  "d.c.": {
    label: "[D.C.]",
    syntax: "[D.C.]",
    description: "ダ・カーポ。曲の先頭に戻る(1回のみ)。",
    devices: "[FM][ADPCM][MIDI]",
  },
  "d.s.": {
    label: "[D.S.]",
    syntax: "[D.S.]",
    description: "ダル・セーニョ。[SEGNO]の位置に戻る(1回のみ)。",
    devices: "[FM][ADPCM][MIDI]",
  },
  segno: {
    label: "[SEGNO] / [$]",
    syntax: "[SEGNO]",
    description: "セーニョ記号。[D.S.]のジャンプ先。",
    devices: "[FM][ADPCM][MIDI]",
  },
  tocoda: {
    label: "[TOCODA] / [*]",
    syntax: "[TOCODA]",
    description: "コーダへジャンプする。[CODA]の位置に移動。",
    devices: "[FM][ADPCM][MIDI]",
  },
  coda: {
    label: "[CODA]",
    syntax: "[CODA]",
    description: "コーダ(終結部)の開始位置。[TOCODA]のジャンプ先。",
    devices: "[FM][ADPCM][MIDI]",
  },
  fine: {
    label: "[FINE] / [^]",
    syntax: "[FINE]",
    description: "フィーネ。D.C./D.S.後の終了位置。",
    devices: "[FM][ADPCM][MIDI]",
  },
  timbre: {
    label: "[TIMBRE]",
    syntax: "[TIMBRE n] / [TIMBRE n1,n2] / [TIMBRE n1:n2,n3]",
    description:
      "音色を選択する。`@n` の可読性の高い代替表記だが挙動が少し違う ([TIMBRE] は FM 音源のハードウェア LFO・パンポットを保持したまま切替、`@n` はそれらも上書き)。バンク指定は 2/3 引数形式で。",
    devices: "[FM][ADPCM][MIDI]",
    notes: {
      v2: "**V2 モード (現在):** 未対応。V2 では `@n` を使用 (zmusic-v3/ZM5.MAN §5.3 で追加された拡張 MML)。",
      v3: "**V3 モード (現在):** 使用可 (zmusic-v3/ZM5.MAN §5.3)。",
    },
  },
  program: {
    label: "[PROGRAM]",
    syntax: "[PROGRAM n]",
    description: "プログラムチェンジ。[TIMBRE] と同義。",
    devices: "[FM][ADPCM][MIDI]",
    notes: {
      v2: "**V2 モード (現在):** 未対応。V2 では `@n` を使う (V3 で追加された拡張 MML)。",
      v3: "**V3 モード (現在):** 使用可。[TIMBRE] と同じく LFO/パンポットを保持したまま音色本体のみ切替。",
    },
  },
  "timbre_bank": {
    label: "[TIMBRE_BANK]",
    syntax: "[TIMBRE_BANK n1,n2]",
    description: "音色バンクを選択する。",
    devices: "[FM][ADPCM][MIDI]",
    notes: {
      v2: "**V2 モード (現在):** 未対応 (V3 追加 MML)。V2 では `@I` などの相当コマンドで対応。",
      v3: "**V3 モード (現在):** 使用可。",
    },
  },
  "program_bank": {
    label: "[PROGRAM_BANK]",
    syntax: "[PROGRAM_BANK n1,n2]",
    description: "プログラムバンクを選択する。[TIMBRE_BANK] と同義。",
    devices: "[FM][ADPCM][MIDI]",
    notes: {
      v2: "**V2 モード (現在):** 未対応 (V3 追加 MML)。",
      v3: "**V3 モード (現在):** 使用可。",
    },
  },
  "timbre_split": {
    label: "[TIMBRE_SPLIT]",
    syntax: "[TIMBRE_SPLIT sw b1,t1,m1,n1, b2,t2,m2,n2, ... b8,t8,m8,n8]",
    description: "ノート範囲に応じた音色の自動切り替えを設定する。最大 8 分割。",
    devices: "[FM][ADPCM][MIDI]",
    notes: {
      v2: "**V2 モード (現在):** 未対応 (V3 追加 MML)。",
      v3: "**V3 モード (現在):** 使用可。ノート範囲別に音色を自動割当。",
    },
  },
  "program_split": {
    label: "[PROGRAM_SPLIT]",
    syntax: "[PROGRAM_SPLIT sw b1,t1,m1,n1, b2,t2,m2,n2, ... b8,t8,m8,n8]",
    description: "ノート範囲に応じたプログラムの自動切り替え。[TIMBRE_SPLIT] と同義。",
    devices: "[FM][ADPCM][MIDI]",
    notes: {
      v2: "**V2 モード (現在):** 未対応 (V3 追加 MML)。",
      v3: "**V3 モード (現在):** 使用可。",
    },
  },
};

// ドットコマンド (小文字で検索)
export const dotCommands: Record<string, CommandInfo> = {
  initialize: {
    label: ".INITIALIZE",
    syntax: ".INITIALIZE",
    description: "Z-MUSICと音源の初期化を行う。通常はZMS先頭に記述。",
  },
  master_clock: {
    label: ".MASTER_CLOCK",
    syntax: ".MASTER_CLOCK n (n: 1-32767)",
    description:
      "全音符の絶対音長を設定する。初期値192。大きいほど精細だがCPU負荷増。",
  },
  jump: {
    label: ".JUMP",
    syntax: ".JUMP md (ENABLE/DISABLE)",
    description: "ジャンプ系MMLコマンドの生成を制御する。",
  },
  gatetime_resolution: {
    label: ".GATETIME_RESOLUTION",
    syntax: ".GATETIME_RESOLUTION n (8/16/32/64/128)",
    description: "MML Qの最大値(分母)を設定する。初期値8。",
  },
  length_mode: {
    label: ".LENGTH_MODE",
    syntax: ".LENGTH_MODE md (MML/STEP)",
    description:
      "音長指定方式を選択する。MML=音楽的音長, STEP=絶対音長のみ。",
  },
  relative_velocity: {
    label: ".RELATIVE_VELOCITY",
    syntax: ".RELATIVE_VELOCITY md (_‾/@U/U)",
    description: "相対ベロシティの指定方法を選択する。",
  },
  fm_tune_setup: {
    label: ".FM_TUNE_SETUP",
    syntax: ".FM_TUNE_SETUP {t1,...,t128}",
    description:
      "FM音源のチューニングを128ノート個別に設定する。64=半音。",
  },
  adpcm_tune_setup: {
    label: ".ADPCM_TUNE_SETUP",
    syntax: ".ADPCM_TUNE_SETUP {t1,...,t128}",
    description: "ADPCM音源のチューニングをノート個別に設定する。",
  },
  pcm_tune_setup: {
    label: ".PCM_TUNE_SETUP",
    syntax: ".PCM_TUNE_SETUP {t1,...,t128}",
    description: ".ADPCM_TUNE_SETUPと同義。",
  },
  meter: {
    label: ".METER",
    syntax: ".METER m/n",
    description: "拍子を設定する(メタデータ、演奏には影響しない)。",
  },
  key: {
    label: ".KEY",
    syntax: ".KEY {n,type,m} / .KEY str",
    description: "調号を設定する(メタデータ、演奏には影響しない)。",
  },
  performance_time: {
    label: ".PERFORMANCE_TIME",
    syntax: ".PERFORMANCE_TIME hh:mm:ss",
    description: "演奏時間を設定する(メタデータ)。",
  },
  assign: {
    label: ".ASSIGN",
    syntax: ".ASSIGN trk {dev,trkv,trkf,trks,trkm,cmnt}",
    description:
      "トラックの定義とチャンネルアサインを行う。devにFM1-8,ADPCM1-16,MIDI1-1～等を指定。",
  },
  track: {
    label: ".TRACK",
    syntax: ".TRACK n1,...,n8 { MML }",
    description: "指定トラックにMMLをセットする。",
  },
  pattern: {
    label: ".PATTERN",
    syntax: ".PATTERN name,trkf { MML }",
    description:
      "再利用可能なパターントラックを定義する。[PATTERN]や[EMBED]で呼出。",
  },
  play: {
    label: ".PLAY",
    syntax: ".PLAY {n1,...,ni}",
    description: "指定トラックの演奏を開始する。省略時は全トラック。",
  },
  stop: {
    label: ".STOP",
    syntax: ".STOP {n1,...,ni}",
    description: "指定トラックの演奏を停止する。",
  },
  continue: {
    label: ".CONTINUE",
    syntax: ".CONTINUE {n1,...,ni}",
    description: "指定トラックの演奏を再開する。",
  },
  tempo: {
    label: ".TEMPO",
    syntax: ".TEMPO t (t: 1-32767)",
    description: "テンポ(BPM)を設定する。",
  },
  track_mask: {
    label: ".TRACK_MASK",
    syntax: ".TRACK_MASK {trk,mode,...}",
    description: "トラックのマスク/解除をリアルタイムに行う。mode=OFF/ON/REVERSE。",
  },
  master_fader: {
    label: ".MASTER_FADER",
    syntax: ".MASTER_FADER {dev,spd,st,ed,...}",
    description: "マスターフェーダーを制御する。フェードイン/アウト等。",
  },
  track_fader: {
    label: ".TRACK_FADER",
    syntax: ".TRACK_FADER {trk,spd,st,ed,...}",
    description: "トラック単位のフェーダーを制御する。",
  },
  fm_timbre: {
    label: ".FM_TIMBRE",
    syntax: ".FM_TIMBRE n,cmnt {v1,...,v55}",
    description: "FM音源の音色をAL/FB分離形式で定義する。",
  },
  fm_vset: {
    label: ".FM_VSET",
    syntax: ".FM_VSET n,cmnt {v1,...,v55}",
    description: ".FM_TIMBREと同義。",
  },
  "8bitpcm_timbre": {
    label: ".8BITPCM_TIMBRE",
    syntax: ".8BITPCM_TIMBRE b,t,k,str {filename,...}",
    description: "8bit PCMデータを音色として登録する。",
  },
  "16bitpcm_timbre": {
    label: ".16BITPCM_TIMBRE",
    syntax: ".16BITPCM_TIMBRE b,t,k,str {filename,...}",
    description: "16bit PCMデータを音色として登録する。",
  },
  adpcm_timbre: {
    label: ".ADPCM_TIMBRE",
    syntax: ".ADPCM_TIMBRE b,t,k,str {filename,...}",
    description: "ADPCMデータを音色として登録する。",
  },
  adpcm_block_data: {
    label: ".ADPCM_BLOCK_DATA",
    syntax: ".ADPCM_BLOCK_DATA filename",
    description: "ZPDファイルを読み込む。.ZPDと同義。",
  },
  zpd: {
    label: ".ZPD",
    syntax: ".ZPD filename",
    description: "ZPD(ADPCMブロックデータ)ファイルを読み込む。",
  },
  adpcm_list: {
    label: ".ADPCM_LIST",
    syntax: ".ADPCM_LIST filename",
    description: "CNF(コンフィギュレーション)ファイルを読み込む。.CNFと同義。",
  },
  cnf: {
    label: ".CNF",
    syntax: ".CNF filename",
    description: "CNFファイルを読み込む。",
  },
  call: {
    label: ".CALL",
    syntax: ".CALL filename",
    description: "外部ファイルを呼び出して実行する。",
  },
  include: {
    label: ".INCLUDE",
    syntax: ".INCLUDE filename",
    description: "外部ファイルの内容をその場に展開する。",
  },
  comment: {
    label: ".COMMENT",
    syntax: ".COMMENT text",
    description: "コメント行。行全体が無視される。",
  },
  define: {
    label: ".DEFINE",
    syntax: ".DEFINE name value",
    description: "マクロを定義する。",
  },
  wave_form: {
    label: ".WAVE_FORM / .WAVEFORM",
    syntax: ".WAVE_FORM n {d1,...,d128}",
    description: "カスタム波形(ビブラート等)を定義する。",
  },
  waveform: {
    label: ".WAVEFORM",
    syntax: ".WAVEFORM n {d1,...,d128}",
    description: ".WAVE_FORMと同義。",
  },
  current_midi_out: {
    label: ".CURRENT_MIDI_OUT",
    syntax: ".CURRENT_MIDI_OUT n",
    description: "カレントMIDI出力インターフェースを選択する。",
  },
  current_midi_in: {
    label: ".CURRENT_MIDI_IN",
    syntax: ".CURRENT_MIDI_IN n",
    description: "カレントMIDI入力インターフェースを選択する。",
  },
  midi_data: {
    label: ".MIDI_DATA",
    syntax: ".MIDI_DATA {d1,...,di}",
    description: "MIDIデータを直接送信する。",
  },
  exclusive: {
    label: ".EXCLUSIVE",
    syntax: ".EXCLUSIVE {d1,...,di}",
    description: "MIDIエクスクルーシブメッセージを送信する。",
  },
  roland_exclusive: {
    label: ".ROLAND_EXCLUSIVE",
    syntax: ".ROLAND_EXCLUSIVE dev,mdl,n = {d1,...,di}",
    description:
      "ローランド・エクスクルーシブを送信する。チェックサム自動計算。",
  },
  yamaha_exclusive: {
    label: ".YAMAHA_EXCLUSIVE",
    syntax: ".YAMAHA_EXCLUSIVE dev,mdl,n = {d1,...,di}",
    description: "ヤマハ・エクスクルーシブを送信する。",
  },
  sc55_init: {
    label: ".SC55_INIT",
    syntax: ".SC55_INIT dev",
    description: "SC-55系音源を初期化(GSリセット)する。",
  },
  sc55_reset: {
    label: ".SC55_RESET",
    syntax: ".SC55_RESET dev",
    description: ".SC55_INITと同義。",
  },
  gs_init: {
    label: ".GS_INIT",
    syntax: ".GS_INIT dev",
    description: "GS音源を初期化する。.SC55_INITと同義。",
  },
  gs_reset: {
    label: ".GS_RESET",
    syntax: ".GS_RESET dev",
    description: ".GS_INITと同義。",
  },
  sc55_reverb: {
    label: ".SC55_REVERB",
    syntax: ".SC55_REVERB dev = {params}",
    description: "SC-55系のリバーブを設定する。",
  },
  gs_reverb: {
    label: ".GS_REVERB",
    syntax: ".GS_REVERB dev = {params}",
    description: ".SC55_REVERBと同義。",
  },
  sc55_chorus: {
    label: ".SC55_CHORUS",
    syntax: ".SC55_CHORUS dev = {params}",
    description: "SC-55系のコーラスを設定する。",
  },
  gs_chorus: {
    label: ".GS_CHORUS",
    syntax: ".GS_CHORUS dev = {params}",
    description: ".SC55_CHORUSと同義。",
  },
  sc55_part_setup: {
    label: ".SC55_PART_SETUP",
    syntax: ".SC55_PART_SETUP dev = {params}",
    description: "SC-55系のパート設定を行う。",
  },
  gs_part_setup: {
    label: ".GS_PART_SETUP",
    syntax: ".GS_PART_SETUP dev = {params}",
    description: ".SC55_PART_SETUPと同義。",
  },
  sc55_drum_setup: {
    label: ".SC55_DRUM_SETUP",
    syntax: ".SC55_DRUM_SETUP dev = {params}",
    description: "SC-55系のドラムセットアップを行う。",
  },
  gs_drum_setup: {
    label: ".GS_DRUM_SETUP",
    syntax: ".GS_DRUM_SETUP dev = {params}",
    description: ".SC55_DRUM_SETUPと同義。",
  },
  sc55_print: {
    label: ".SC55_PRINT",
    syntax: '.SC55_PRINT "text"',
    description: "SC-55系のディスプレイに文字列を表示する。",
  },
  gs_print: {
    label: ".GS_PRINT",
    syntax: '.GS_PRINT "text"',
    description: ".SC55_PRINTと同義。",
  },
  sc55_display: {
    label: ".SC55_DISPLAY",
    syntax: ".SC55_DISPLAY dev = {bitmap}",
    description: "SC-55系のディスプレイにビットマップを表示する。",
  },
  gs_display: {
    label: ".GS_DISPLAY",
    syntax: ".GS_DISPLAY dev = {bitmap}",
    description: ".SC55_DISPLAYと同義。",
  },
  gm_system_on: {
    label: ".GM_SYSTEM_ON",
    syntax: ".GM_SYSTEM_ON",
    description: "GM音源をリセットする。",
  },
  sc88_mode: {
    label: ".SC88_MODE",
    syntax: ".SC88_MODE dev,n",
    description: "SC-88のモードを設定する。",
  },
  sc88_reverb: {
    label: ".SC88_REVERB",
    syntax: ".SC88_REVERB dev = {params}",
    description: "SC-88のリバーブを設定する。",
  },
  sc88_chorus: {
    label: ".SC88_CHORUS",
    syntax: ".SC88_CHORUS dev = {params}",
    description: "SC-88のコーラスを設定する。",
  },
  sc88_delay: {
    label: ".SC88_DELAY",
    syntax: ".SC88_DELAY dev = {params}",
    description: "SC-88のディレイを設定する。",
  },
  sc88_equalizer: {
    label: ".SC88_EQUALIZER",
    syntax: ".SC88_EQUALIZER dev = {params}",
    description: "SC-88のイコライザを設定する。",
  },
  mt32_init: {
    label: ".MT32_INIT",
    syntax: ".MT32_INIT dev",
    description: "MT-32をリセットする。",
  },
  mt32_reset: {
    label: ".MT32_RESET",
    syntax: ".MT32_RESET dev",
    description: ".MT32_INITと同義。",
  },
  mt32_reverb: {
    label: ".MT32_REVERB",
    syntax: ".MT32_REVERB dev = {params}",
    description: "MT-32のリバーブを設定する。",
  },
  mt32_part_setup: {
    label: ".MT32_PART_SETUP",
    syntax: ".MT32_PART_SETUP dev = {params}",
    description: "MT-32のパート設定を行う。",
  },
  mt32_print: {
    label: ".MT32_PRINT",
    syntax: '.MT32_PRINT "text"',
    description: "MT-32のディスプレイに文字列を表示する。",
  },
  print: {
    label: ".PRINT",
    syntax: '.PRINT "text"',
    description: "コンパイル時にテキストを出力する。",
  },
  dummy: {
    label: ".DUMMY",
    syntax: ".DUMMY",
    description: "何もしないプレースホルダー。",
  },
  smf: {
    label: ".SMF",
    syntax: ".SMF filename",
    description: "スタンダードMIDIファイルに出力する。",
  },
  midi_dump: {
    label: ".MIDI_DUMP",
    syntax: ".MIDI_DUMP filename",
    description: "MIDIデータをSMFファイルにダンプする。",
  },
  erase_timbre: {
    label: ".ERASE_TIMBRE",
    syntax: ".ERASE_TIMBRE b,t",
    description: "登録済み音色を削除する。",
  },
  erase_tone: {
    label: ".ERASE_TONE",
    syntax: ".ERASE_TONE t,k",
    description: "登録済みトーンを削除する。",
  },
};

// 丸括弧コマンド (大文字で検索)
export const parenCommands: Record<string, CommandInfo> = {
  I: {
    label: "(I)",
    syntax: "(I)",
    description: "Z-MUSICと音源の初期化。.INITIALIZEの短縮形。",
  },
  A: {
    label: "(A)",
    syntax: "(A dev,trk,trkv,trkf,trks,trkm,cmnt)",
    description: "トラック定義/チャンネルアサイン。.ASSIGNの短縮形。",
  },
  P: {
    label: "(P)",
    syntax: "(Pn1,n2,...,ni)",
    description: "指定トラックの演奏を開始する。.PLAYの短縮形。",
  },
  S: {
    label: "(S)",
    syntax: "(Sn1,n2,...,ni)",
    description: "指定トラックの演奏を停止する。.STOPの短縮形。",
  },
  C: {
    label: "(C)",
    syntax: "(Cn1,n2,...,ni)",
    description: "指定トラックの演奏を再開する。.CONTINUEの短縮形。",
  },
  O: {
    label: "(O)",
    syntax: "(Ot) (t: テンポ値)",
    description: "テンポを設定する。.TEMPOの短縮形。",
  },
  T: {
    label: "(T)",
    syntax: "(Tn1,...,n8)",
    description: "指定トラックにMMLをセットする。.TRACKの短縮形。",
  },
  V: {
    label: "(V)",
    syntax: "(Vn,0,v1,...,v55)",
    description: "FM音色定義(OPMDRV互換形式)。",
  },
  B: {
    label: "(B)",
    syntax: "(Bn)",
    description: "バンク設定。",
  },
  D: {
    label: "(D)",
    syntax: "(Dn)",
    description: "デバイス指定。",
  },
  Z: {
    label: "(Z)",
    syntax: "(Zn)",
    description: "マスタークロック設定。.MASTER_CLOCKの短縮形。",
  },
};

// オペレータ/記号
export const operatorCommands: Record<string, CommandInfo> = {
  "&": {
    label: "&",
    syntax: "音符&音符",
    description:
      "タイ/スラー。同音高ならタイ(音を繋ぐ)、異音高ならスラー(滑らかに音程変化)。",
    devices: "[FM][ADPCM][MIDI]",
  },
  "^": {
    label: "^",
    syntax: "音符^n",
    description: "加算式タイ。音符の直後に書き、n分音符長を音長に加算する。",
    devices: "[FM][ADPCM][MIDI]",
  },
  "<": {
    label: "<",
    syntax: "<",
    description: "オクターブを1つ上げる。",
    devices: "[FM][ADPCM][MIDI]",
  },
  ">": {
    label: ">",
    syntax: ">",
    description: "オクターブを1つ下げる。",
    devices: "[FM][ADPCM][MIDI]",
  },
  "|:": {
    label: "|: :|",
    syntax: "|:n ... :|",
    description: "繰り返し。n回リピートする(省略時2回)。|1,|2等で番号付き括弧。",
    devices: "[FM][ADPCM][MIDI]",
  },
  "/": {
    label: "/",
    syntax: "/ テキスト",
    description: "コメント。この記号以降、行末までが無視される。",
  },
};
