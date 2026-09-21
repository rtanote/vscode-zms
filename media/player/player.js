// Z-MUSIC Player Webview 本体
// 拡張ホストとの messaging + zmusic.js (WASM) の起動 + 30Hz 位置サンプリングを担当する。
(function () {
  "use strict";
  const vscode = acquireVsCodeApi();

  const $ = (id) => document.getElementById(id);
  const btnPlay = $("btn-play");
  const btnStop = $("btn-stop");
  const btnFade = $("btn-fade");
  const btnEnableAudio = $("btn-enable-audio");
  const statusEl = $("status");
  const tracksEl = $("tracks");

  let installedPromise = null; // ZMUSIC.install の Promise
  let currentTracks = []; // { trk, ch, zmdStart, zmdBytes }
  let samplingHandle = null; // setInterval id
  let lastPosSignature = "";
  let audioResumeShownAt = 0;

  // solo/mute のユーザ操作状態。ZMUSIC.X ドライバ側の状態と一致させる
  // 責務は applyMask() が持つ。renderTracks() で新規コンパイル時にクリア。
  const mutedByUser = new Set(); // trk 番号
  const soloedByUser = new Set(); // trk 番号

  // トラック番号 → パレット色 (host から compile 直後に届く)
  const trackColorMap = new Map();

  // キーボードビジュアライザ: MIDI 全域 0..127 (10⅔ オクターブ、白鍵 75)。
  // 固定比率で描画するので、白鍵幅 4 / 高さ 20 = 5:1 の縦横比を保つ。
  const KB_MIN_NOTE = 0;
  const KB_MAX_NOTE = 127;
  const KB_WHITE_SEMIS = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
  const KB_WHITE_UNITS = 4;
  const KB_HEIGHT_UNITS = 20;
  const KB_BLACK_W_UNITS = KB_WHITE_UNITS * 0.6;
  const KB_BLACK_H_UNITS = KB_HEIGHT_UNITS * 0.6;

  function isWhiteNote(midi) {
    return KB_WHITE_SEMIS.indexOf(midi % 12) >= 0;
  }

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function bytesToB64(u8) {
    let s = "";
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
  }

  function post(msg) { vscode.postMessage(msg); }
  function setStatus(text, isError) {
    statusEl.textContent = text;
    statusEl.classList.toggle("error", !!isError);
  }

  // ── メッセージ処理 ─────────────────────────────────────────
  const fileRequests = new Map(); // requestId → resolver

  window.addEventListener("message", async (e) => {
    const msg = e.data;
    try {
      switch (msg.type) {
        case "init": return handleInit(msg);
        case "compile": return handleCompile(msg);
        case "start": return handleStart(msg);
        case "stop": return handleStop();
        case "fadeOut": return handleFadeOut(msg.speed);
        case "setSampling": return handleSetSampling(msg.enabled, msg.intervalMs);
        case "fileResponse": return handleFileResponse(msg);
        case "maskTracks": return handleMaskTracks(msg);
        case "lineMap": return handleLineMap(msg);
        case "restoreSoloMute": return handleRestoreSoloMute(msg);
        case "trackColors": return handleTrackColors(msg);
      }
    } catch (err) {
      post({ type: "error", where: msg && msg.type, message: String(err && err.stack || err) });
    }
  });

  async function handleInit(msg) {
    if (installedPromise) return; // idempotent
    if (typeof ZMUSIC === "undefined") {
      post({ type: "error", where: "init", message: "zmusic.js が読み込めていません (media/player/zmusic.js 未配置?)" });
      return;
    }
    ZMUSIC.onMessage = (line) => post({ type: "log", text: line });
    ZMUSIC.setFileOpenCallback((name) => new Promise((resolve) => {
      const requestId = Math.floor(Math.random() * 1e9);
      fileRequests.set(requestId, resolve);
      post({ type: "fileRequest", requestId, name });
    }));

    const driverBytes = b64ToBytes(msg.driverB64);
    try {
      // AudioContext を自前で作って install に渡す (FF 用に destination を握るため)。
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      const ownedCtx = new AudioCtor();
      window.__ZMUSIC_AUDIO_CTX__ = ownedCtx;
      installedPromise = ZMUSIC.install(msg.driverArgs, {
        buffer: msg.bufferSize || 2048,
        midi: false,
        driver: { name: msg.driverName, data: driverBytes.buffer },
        context: ownedCtx,
      });
      await installedPromise;
      post({ type: "ready", version: ZMUSIC.version || "?" });
      setStatus("Ready");
      reportAudioState();
    } catch (err) {
      installedPromise = null;
      post({ type: "error", where: "install", message: String(err) });
      setStatus("Init failed", true);
    }
  }

  async function handleCompile(msg) {
    if (!installedPromise) {
      post({ type: "compiled", requestId: msg.requestId, ok: false, code: -1, tracks: [] });
      return;
    }
    await installedPromise;
    const zms = b64ToBytes(msg.zmsB64);
    try {
      const code = await ZMUSIC.compile(zms.buffer);
      if (code !== 0) {
        post({ type: "compiled", requestId: msg.requestId, ok: false, code, tracks: [] });
        return;
      }
      currentTracks = collectTracks();
      post({
        type: "compiled",
        requestId: msg.requestId,
        ok: true,
        code: 0,
        tracks: currentTracks.map((t) => ({
          trk: t.trk,
          ch: t.ch,
          zmdStart: t.zmdStart,
          zmdB64: bytesToB64(t.zmdBytes),
        })),
      });
      renderTracks(currentTracks);
      setStatus("Compiled");
    } catch (err) {
      post({ type: "compiled", requestId: msg.requestId, ok: false, code: -1, tracks: [] });
      post({ type: "error", where: "compile", message: String(err) });
    }
  }

  // trap $45 → buffer_info、trap $3a → get_trk_tbl
  //
  // NOTE: ZMUSIC.peekBytes() は HEAPU8 の直接 subarray を返すため、
  // run68 の prog_ptr オフセット越しの 68k アドレスに対して間違ったメモリを
  // 読んでしまう (実測で常にゼロ埋め領域を返した)。代わりに 1 バイトずつ
  // ZMUSIC.peek(addr+i, 0) で読む (= run68 の _mem_get 経由で正しく翻訳)。
  // 遅いが正しい。
  function peekBytesSafe(addr, len) {
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++) out[i] = ZMUSIC.peek(addr + i, 0) & 0xff;
    return out;
  }

  function collectTracks() {
    // trap $45 buffer_info
    ZMUSIC.trap(0x45, 0, 0, 0, 0, null);
    const info = ZMUSIC.areg(0);
    const seq_wk_tbl = ZMUSIC.peek(info + 48, 2);   // LONG
    const trk_po_tbl = ZMUSIC.peek(info + 68, 2);
    const trk_len_tbl = ZMUSIC.peek(info + 72, 2);

    // trap $3a get_trk_tbl → a0 = 演奏トラック番号列 (trk-1, 終端 $FF, 最大 32)
    ZMUSIC.trap(0x3a, 0, 0, 0, 0, null);
    const listAddr = ZMUSIC.areg(0);
    const raw = peekBytesSafe(listAddr, 40);
    const trkNums = [];
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === 0xff) break;
      trkNums.push(raw[i] + 1); // 1-based
    }

    return trkNums.map((trk) => {
      const start = ZMUSIC.peek(trk_po_tbl + (trk - 1) * 4, 2);
      const limit = ZMUSIC.peek(trk_len_tbl + (trk - 1) * 4, 2);
      // trk_len_tbl は m_alloc で確保したバッファサイズ。ZMD 本体はその中の
      // 途中で opcode $FF (end) で終わる。
      //
      // ここでは $FF を「終端」として naive に .indexOf(0xff) で切り取る
      // ことは絶対にしない — $FF は他 opcode のパラメータ (step count が
      // 255、note number、$E6 系の内部データ等) に普通に出現するため、
      // opcode 構造を知らずにスキャンすると mid-opcode で truncate してしまう。
      // 実測例: GAVOTTE.ZMS では $E6 の 2 バイト目に $FF が入っており、
      // このループが 2 バイトで打ち切られて disassembler が "3 bytes needed"
      // エラーを吐いていた。
      //
      // 正しい終端検出は opcode 長を知っている ZmdDisassembler だけができる
      // ので、ここではバッファ全域を渡し、host 側で walk しながら $FF opcode で
      // 停止させる。8 KB キャップは万一の buffer 誤読で無限ループさせない
      // ための保険。
      const scanLen = Math.min(limit || 0, 8192);
      const zmdBytes = peekBytesSafe(start, scanLen);
      const ch = ZMUSIC.peek(seq_wk_tbl + (trk - 1) * 256 + 0x09, 0) & 0xff;
      return { trk, ch, zmdStart: start, zmdBytes, seq_wk_tbl };
    });
  }

  async function handleStart(msg) {
    try {
      const targetStep = (msg && msg.targetStep) || 0;
      // AudioContext が suspended のままだと最初のバッファが処理されず
      // 一音目のアタックが欠ける。ここで確実に resume してから再生開始。
      const ctx = window.__ZMUSIC_AUDIO_CTX__;
      if (ctx && ctx.state === "suspended") {
        try { await ctx.resume(); } catch (e) {
          post({ type: "log", text: "[start] audio resume warning: " + e });
        }
      }
      if (targetStep > 0) {
        setStatus("Fast-forwarding…");
        await fastForwardTo(targetStep);
      } else {
        ZMUSIC.start();
      }
      post({ type: "started" });
      setStatus("Playing");
    } catch (err) {
      post({ type: "error", where: "start", message: String(err) });
    }
  }

  // "無音早送り": ZMUSIC.start() 後、audio を出力から切り離した
  // まま zmusic_update() を高速でループ回して p_data_pointer を進めさせ、
  // $50 zm_status のステップカウンタが target に届いた時点で audio を出力に
  // 再接続する。ドライバに手を入れず fast-forward を実現する仕組み。
  async function fastForwardTo(targetStep) {
    const dest = audioContextDestination();
    post({ type: "log", text: `[ff] entering, targetStep=${targetStep}` });

    try {
      ZMUSIC.disconnect(dest);
      post({ type: "log", text: "[ff] audio disconnected" });
    } catch (e) {
      post({ type: "log", text: "[ff] disconnect err: " + e });
    }

    // 1 回の update() は 1 audio buffer 分 (~4 tick 実測 @tempo 120) 進む。
    // 適応バッチで、target 手前で細かく進める:
    //   - target まで > 200 tick: batch=20 (高速前進)
    //   - target まで  50-200: batch=5
    //   - target まで  < 50   : batch=1 (最大 ~4 tick の精度で着地)
    //
    // UNDERSHOOT=0: raw target ぴったりを狙う。適応バッチにより実際は 0〜4
    // tick オーバーシュート (cursor 音符の先頭を数十 ms 削るだけ、アタック
    // トランジェント自体は保たれる)。undershoot するほうが「前音符のリリース
    // が聴こえる」問題が出やすいので、僅かに overshoot 側に寄せる方針。
    const UNDERSHOOT_TICKS = 0;
    ZMUSIC.start();
    const before = getStep();
    const rawTarget = before + targetStep;
    const target = Math.max(before, rawTarget - UNDERSHOOT_TICKS);
    post({
      type: "log",
      text: `[ff] started; step=${before} → target=${target} (raw=${rawTarget}, undershoot=${UNDERSHOOT_TICKS})`,
    });

    const deadline = performance.now() + 5000;
    let iter = 0;
    let lastLoggedStep = before;
    let totalUpdates = 0;
    while (performance.now() < deadline) {
      iter++;
      const currentBefore = getStep();
      if (currentBefore >= target) {
        const finalOvershoot = currentBefore - target;
        post({
          type: "log",
          text: `[ff] reached step=${currentBefore} iter=${iter} updates=${totalUpdates} (overshoot from adj=${finalOvershoot}, from raw=${currentBefore - rawTarget})`,
        });
        break;
      }
      const remaining = target - currentBefore;
      const batchSize = remaining > 200 ? 20 : remaining > 50 ? 5 : 1;
      for (let k = 0; k < batchSize; k++) ZMUSIC.update();
      totalUpdates += batchSize;
      if (iter % 100 === 0) {
        post({
          type: "log",
          text: `[ff] iter=${iter} step=${getStep()} (Δ=${getStep() - lastLoggedStep}, batch=${batchSize})`,
        });
        lastLoggedStep = getStep();
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    if (performance.now() >= deadline) {
      post({
        type: "log",
        text: `[ff] TIMEOUT after ${iter} iter, step=${getStep()} target=${target}`,
      });
    }

    try {
      ZMUSIC.connect(dest);
      post({ type: "log", text: "[ff] audio reconnected" });
    } catch (e) {
      post({ type: "log", text: "[ff] connect err: " + e });
    }
  }

  function getStep() {
    try {
      ZMUSIC.trap(0x50, 0, 0, 0, 0, null);
      const status = ZMUSIC.areg(0);
      return ZMUSIC.peek(status - 0x0c, 2) >>> 0;
    } catch (_) { return 0; }
  }

  function audioContextDestination() {
    // ZMUSIC 内部の AudioContext.destination を取得する経路が公式 API に無い
    // ので、install 時にキャッシュしたものを触る (下の init で保持)。
    return window.__ZMUSIC_AUDIO_CTX__.destination;
  }

  function handleStop() {
    try {
      ZMUSIC.stop();
      post({ type: "stopped" });
      setStatus("Idle");
    } catch (err) {
      post({ type: "error", where: "stop", message: String(err) });
    }
  }

  function handleFadeOut(speed) {
    try {
      // trap $1a fade_out. speed in d2 (1..85)
      ZMUSIC.trap(0x1a, Math.max(1, Math.min(85, speed || 20)), 0, 0, 0, null);
      setStatus("Fading");
    } catch (err) {
      post({ type: "error", where: "fadeOut", message: String(err) });
    }
  }

  function handleSetSampling(enabled, intervalMs) {
    if (samplingHandle) {
      clearInterval(samplingHandle);
      samplingHandle = null;
    }
    if (!enabled) return;
    const iv = intervalMs > 0 ? intervalMs : 33;
    samplingHandle = setInterval(() => sampleAndSend(), iv);
  }

  function sampleAndSend() {
    if (currentTracks.length === 0) return;
    let step = 0;
    try {
      ZMUSIC.trap(0x50, 0, 0, 0, 0, null);
      const status = ZMUSIC.areg(0);
      step = ZMUSIC.peek(status - 0x0c, 2);
    } catch (_) { /* ignore */ }

    const tracks = currentTracks.map((t) => {
      const workBase = t.seq_wk_tbl + (t.trk - 1) * 256;
      const ptr = ZMUSIC.peek(workBase + 0x04, 2);
      const state = ZMUSIC.peek(workBase + 0x0a, 0);
      const pgm = ZMUSIC.peek(workBase + 0x1d, 0); // p_pgm (spec App. B)
      const vol = ZMUSIC.peek(workBase + 0x1f, 0); // p_vol (0=最大, 127=最小)
      const note = ZMUSIC.peek(workBase + 0x42, 0); // p_note[0] (spec App. B)
      return { trk: t.trk, ptr, state, pgm, vol, note };
    });

    // 差分のみ送信 (pgm/vol/note も追跡)
    const sig = step + "|" + tracks.map((t) => `${t.trk}:${t.ptr}:${t.state}:${t.pgm}:${t.vol}:${t.note}`).join(",");
    if (sig === lastPosSignature) return;
    lastPosSignature = sig;
    post({ type: "position", step, tracks });

    // ステータス表示
    updateTrackDisplay(tracks);
  }

  function handleFileResponse(msg) {
    const resolver = fileRequests.get(msg.requestId);
    if (!resolver) return;
    fileRequests.delete(msg.requestId);
    resolver(msg.dataB64 ? b64ToBytes(msg.dataB64).buffer : null);
  }

  function handleTrackColors(msg) {
    trackColorMap.clear();
    for (const c of msg.colors || []) trackColorMap.set(c.trk | 0, c.color);
    // 既にレンダー済みの行のキーボードに CSS var で色を反映しておく
    for (const row of tracksEl.querySelectorAll(".track")) {
      const trk = parseInt(row.dataset.trk, 10);
      const color = trackColorMap.get(trk);
      if (color) row.style.setProperty("--track-color", color);
    }
  }

  function handleRestoreSoloMute(msg) {
    mutedByUser.clear();
    soloedByUser.clear();
    for (const trk of msg.mutedTrks || []) mutedByUser.add(trk | 0);
    for (const trk of msg.soloedTrks || []) soloedByUser.add(trk | 0);
    applyMask();
    updateMuteSoloVisuals();
  }

  function reportSoloMute() {
    post({
      type: "soloMuteChanged",
      mutedTrks: [...mutedByUser],
      soloedTrks: [...soloedByUser],
    });
  }

  function handleLineMap(msg) {
    // Host が SourceMap で解決した「今演奏中の ZMS 行」を反映。
    // 差分だけ届くので、届いたトラックのみ書き換える。
    for (const t of msg.tracks || []) {
      const row = tracksEl.querySelector(`.track[data-trk="${t.trk}"]`);
      if (!row) continue;
      const el = row.querySelector(".line");
      if (el) el.textContent = "L" + t.line;
    }
  }

  function handleMaskTracks(msg) {
    // Host から明示的に mute 集合を送られた場合はそれで置き換える。
    // 通常は Webview 内 UI (Mute/Solo ボタン) が applyMask() を直接呼ぶ。
    mutedByUser.clear();
    if (Array.isArray(msg.mutedTrks)) {
      for (const trk of msg.mutedTrks) mutedByUser.add(trk | 0);
    }
    applyMask();
    updateMuteSoloVisuals();
  }

  /** 現在の Solo/Mute 設定から driver に反映すべきミュート集合を算出。
   * Solo が 1 つでも立っていれば「soloed 以外を mute」する DAW 慣習。 */
  function effectiveMutedSet() {
    if (soloedByUser.size > 0) {
      const s = new Set();
      for (const t of currentTracks) {
        if (!soloedByUser.has(t.trk)) s.add(t.trk);
      }
      return s;
    }
    return new Set(mutedByUser);
  }

  /** ZMUSIC.X トラップ $4b (mask_tracks) は per-track コマンド:
   * d2 = 0 で全解除, d2 = +n でトラック n を解除, d2 = -n でトラック n をマスク。
   * まず全解除 → ミュート対象を 1 個ずつ再マスクする。 */
  function applyMask() {
    if (typeof ZMUSIC === "undefined" || !ZMUSIC.trap) return;
    try {
      ZMUSIC.trap(0x4b, 0, 0, 0, 0, null); // 全アンマスク
      const muted = effectiveMutedSet();
      for (const trk of muted) {
        ZMUSIC.trap(0x4b, (-trk) | 0, 0, 0, 0, null);
      }
    } catch (err) {
      post({ type: "error", where: "applyMask", message: String(err) });
    }
  }

  function toggleMute(trk) {
    if (mutedByUser.has(trk)) mutedByUser.delete(trk);
    else mutedByUser.add(trk);
    applyMask();
    updateMuteSoloVisuals();
    reportSoloMute();
  }

  function toggleSolo(trk) {
    if (soloedByUser.has(trk)) soloedByUser.delete(trk);
    else soloedByUser.add(trk);
    applyMask();
    updateMuteSoloVisuals();
    reportSoloMute();
  }

  function updateMuteSoloVisuals() {
    const muted = effectiveMutedSet();
    for (const row of tracksEl.querySelectorAll(".track")) {
      const trk = parseInt(row.dataset.trk, 10);
      const btnM = row.querySelector(".btn-mute");
      const btnS = row.querySelector(".btn-solo");
      if (btnM) btnM.classList.toggle("active", mutedByUser.has(trk));
      if (btnS) btnS.classList.toggle("active", soloedByUser.has(trk));
      row.classList.toggle("muted", muted.has(trk));
    }
  }

  function renderTracks(tracks) {
    tracksEl.innerHTML = "";
    // 新規コンパイル = driver 側もリセットされているので UI 状態もクリア
    mutedByUser.clear();
    soloedByUser.clear();
    for (const t of tracks) {
      const row = document.createElement("div");
      row.className = "track";
      row.dataset.trk = String(t.trk);
      const color = trackColorMap.get(t.trk);
      if (color) row.style.setProperty("--track-color", color);
      row.innerHTML =
        `<button class="btn-solo" title="Solo (このトラックだけ鳴らす)">S</button>` +
        `<button class="btn-mute" title="Mute (このトラックを消す)">M</button>` +
        `<span>T${t.trk}</span>` +
        `<span>c${t.ch}</span>` +
        `<span class="pgm" title="音色番号 (@n)">@?</span>` +
        `<span class="vol" title="音量 (v127=最大 / v0=最小、MML 慣例で反転表示)">v?</span>` +
        `<span class="line" title="現在の ZMS 行 (SourceMap 解決)">L?</span>` +
        `<span class="state state-idle">idle</span>` +
        buildKeyboardSvg() +
        `<span class="ptr" title="p_data_pointer (hex)"></span>`;
      row.querySelector(".btn-solo").addEventListener("click", () => toggleSolo(t.trk));
      row.querySelector(".btn-mute").addEventListener("click", () => toggleMute(t.trk));
      tracksEl.appendChild(row);
    }
  }

  /** mmdsp 風の MIDI 全域 (0..127) 鍵盤 SVG。preserveAspectRatio="xMidYMid meet"
   * で鍵の縦横比を固定 (リキッド化させない)。stroke は vector-effect:
   * non-scaling-stroke で SVG スケーリングに関係なく常に一定の CSS px 幅で描く。 */
  function buildKeyboardSvg() {
    const whiteIdx = new Map(); // MIDI → 白鍵 index (0-based)
    const whiteRects = [];
    let wi = 0;
    for (let m = KB_MIN_NOTE; m <= KB_MAX_NOTE; m++) {
      if (!isWhiteNote(m)) continue;
      whiteIdx.set(m, wi);
      const x = wi * KB_WHITE_UNITS;
      whiteRects.push(
        `<rect class="key key-white" data-note="${m}" x="${x}" y="0" width="${KB_WHITE_UNITS}" height="${KB_HEIGHT_UNITS}"/>`,
      );
      wi++;
    }
    const blackRects = [];
    for (let m = KB_MIN_NOTE; m <= KB_MAX_NOTE; m++) {
      if (isWhiteNote(m)) continue;
      const leftIdx = whiteIdx.get(m - 1); // 黒鍵の直前は必ず白鍵 (C#-1=C, D#-1=D, ...)
      if (leftIdx === undefined) continue;
      const x = leftIdx * KB_WHITE_UNITS + KB_WHITE_UNITS - KB_BLACK_W_UNITS / 2;
      blackRects.push(
        `<rect class="key key-black" data-note="${m}" x="${x}" y="0" width="${KB_BLACK_W_UNITS}" height="${KB_BLACK_H_UNITS}"/>`,
      );
    }
    const vbWidth = wi * KB_WHITE_UNITS;
    return (
      `<svg class="keyboard" viewBox="0 0 ${vbWidth} ${KB_HEIGHT_UNITS}" preserveAspectRatio="xMinYMid meet" aria-hidden="true">` +
      whiteRects.join("") +
      blackRects.join("") +
      `</svg>`
    );
  }

  function updateKeyboardNote(row, note) {
    // 前のアクティブキーを解除
    for (const k of row.querySelectorAll(".key.active")) k.classList.remove("active");
    if (note === undefined || note === 0) return; // 無音
    const key = row.querySelector(`.keyboard .key[data-note="${note}"]`);
    if (key) key.classList.add("active");
  }

  function updateTrackDisplay(positions) {
    for (const p of positions) {
      const row = tracksEl.querySelector(`.track[data-trk="${p.trk}"]`);
      if (!row) continue;
      const s = row.querySelector(".state");
      const cls = p.state === 0 ? "playing" : p.state === 1 ? "ended" : p.state === 0xff || p.state === -1 ? "dead" : "idle";
      s.textContent = cls;
      s.className = "state state-" + cls;
      row.querySelector(".ptr").textContent = "0x" + p.ptr.toString(16);
      if (p.pgm !== undefined) {
        // p_pgm (spec App. B) は driver 内部 0-indexed。MML の @n は 1-indexed
        // なので表示側で +1 して MML と揃える。
        row.querySelector(".pgm").textContent = "@" + (((p.pgm & 0xff) + 1) & 0xff);
      }
      if (p.vol !== undefined) {
        // p_vol は 0=最大, 127=最小 の反転値。MML 慣例 (高いほど大音量) に
        // 揃えて 127 - vol で表示する。
        const raw = p.vol & 0xff;
        const shown = Math.max(0, 127 - raw);
        row.querySelector(".vol").textContent = "v" + shown;
      }
      if (p.note !== undefined) {
        updateKeyboardNote(row, p.note & 0xff);
      }
    }
  }

  function reportAudioState() {
    // ZMUSIC の内部で AudioContext を保持しているため、その状態を推測。
    // ここでは初回のクリック要求は toolbar 側で扱う。
    // TODO: 実際の AudioContext 状態を直接読める API があれば置き換える。
    try {
      const ctx = (window.__ZMUSIC_AUDIO_CTX__) || null;
      if (ctx && ctx.state === "suspended") {
        showAudioResume();
        post({ type: "audioState", state: "suspended" });
      } else {
        post({ type: "audioState", state: "running" });
      }
    } catch (_) { /* ignore */ }
  }

  function showAudioResume() {
    if (Date.now() - audioResumeShownAt < 5000) return;
    audioResumeShownAt = Date.now();
    btnEnableAudio.hidden = false;
  }

  // ── UI イベント → Host コマンドプロキシ ───────────────────
  btnPlay.addEventListener("click", () => vscode.postMessage({ type: "userAction", action: "play" }));
  btnStop.addEventListener("click", () => vscode.postMessage({ type: "userAction", action: "stop" }));
  btnFade.addEventListener("click", () => vscode.postMessage({ type: "userAction", action: "fadeOut" }));
  btnEnableAudio.addEventListener("click", () => {
    try { ZMUSIC.resume(); } catch (_) {}
    btnEnableAudio.hidden = true;
    post({ type: "audioState", state: "running" });
  });
})();
