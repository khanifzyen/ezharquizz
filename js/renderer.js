/**
 * renderer.js — mesin render & logika gameplay pada Canvas 2D.
 *
 * Tanggung jawab modul ini:
 *  - Game loop `requestAnimationFrame` (target 60fps, dt berbasis waktu nyata).
 *  - Siklus per soal: spawn balon → jatuh → (dipegang → dikunci / lepas) → reveal.
 *  - Kursor virtual per pemain + sumber input keyboard.
 *  - Logika grab/drop/lock sesuai PRD F4 (radius + toleransi 40px, zona 12%).
 *
 * Kontrak dengan main.js (callback):
 *  - onQuestionStart({ index, total, category, question, options })
 *  - onQuestionEnd({ index, results }) — dipanggil saat REVEAL dimulai;
 *    results = { [playerId]: { locked, optionIndex, correct } }
 *  - onSessionEnd({ total })
 *
 * Tambahan Sprint 4 (polish & edge case):
 *  - startSession() membuka sesi dengan fase 'countdown' 3-2-1 sebelum soal
 *    pertama (CONFIG.countdown).
 *  - pause()/resume() membekukan/melanjutkan loop & timer soal — dipakai
 *    otomatis saat tab tersembunyi (visibilitychange); resume me-reset
 *    penanda waktu sehingga timer tidak melompat.
 *  - setSources(sources) mengganti sumber input DI TENGAH SESI (kamera mati →
 *    keyboard tanpa reload); balon yang dipegang dilepas jatuh, bukan lock.
 *  - destroy() idempoten sepenuhnya (loop, sumber input, listener resize
 *    & visibilitychange).
 *
 * Kontrak InputSource (dipakai keyboard Sprint 1 & gesture Sprint 3):
 *  Sebuah sumber input cukup menyediakan properti/metode berikut:
 *    get x()        -> Number  posisi px dalam koordinat canvas
 *    get y()        -> Number
 *    get pinching() -> Boolean status jepit (true = menjepit)
 *    get present()  -> Boolean sumber aktif/terdeteksi (keyboard selalu true)
 *    update(dt, w, h)         -> integrasi gerak per frame (SELALU dipanggil,
 *                                termasuk saat present=false — lihat _update)
 *    destroy()                 -> lepas listener saat game berakhir
 *  Opsional: `kind` ('keyboard'|'hand') → gaya kursor (lingkaran vs titik
 *  jepit), `pinch` 0..1 → radius ring kursor mode kamera.
 *  Injeksi lewat options.sources = { 1: InputSource, 2: InputSource }.
 *  Implementasi gesture: `HandSource` di js/hand-input.js; renderer tidak
 *  peduli asal input (PRD F7: mekanika identik keyboard vs gesture).
 */

/* ============================================================
 * CONFIG — SEMUA konstanta tuning dikumpulkan di sini agar
 * mudah ditala di sprint berikutnya (lihat plan Sprint 3.6).
 * ============================================================ */
export const CONFIG = {
  dprMax: 2, // batas devicePixelRatio agar tidak berat di layar retina

  balloon: {
    fallSpeed: 55, // px/detik (PRD F3: ±55 px/s)
    fallVariance: 0.15, // variasi kecepatan per balon (±15%)
    minRadius: 48, // radius balon minimum (px)
    maxRadius: 96, // radius balon maksimum (px)
    wrapWidth: 118, // lebar maksimal baris teks sebelum di-wrap (px)
    lineHeight: 24, // tinggi baris teks (px)
    font: '800 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", sans-serif',
    spawnTop: -110, // y awal balon (di atas layar, px)
    staggerStep: 0.25, // jeda spawn antar balon (detik) — total stagger 0–1 dtk
    staggerJitter: 0.2, // acakan tambahan per balon (detik)
    spawnMargin: 22, // jarak minimum pusat balon dari tepi kiri/kanan (px)
    spawnGap: 26, // jarak tambahan antar tepi balon saat spawn (px)
    maxSpawnTries: 80, // percobaan acak mencari posisi x berjarak minimal
    radiusAreaFactor: 1.35, // faktor luas teks → radius (kalibrasi visual)
    // Sprint 4 (polish visual):
    popIn: 0.3, // durasi animasi pop-in saat balon PERTAMA tampak di layar (detik)
    bobAmp: 5, // amplitudo ayun horizontal halus saat jatuh (px, Sprint 4)
    bobFreq: 1.6, // frekuensi dasar ayunan (rad/s — diacak ±25% per balon)
  },

  grab: {
    tolerance: 40, // toleransi radius grab di luar balon (px, PRD F4)
  },

  zone: {
    widthRatio: 0.12, // lebar zona kunci = 12% lebar layar (PRD F4)
    slotYRatio: 0.46, // posisi y slot kunci (fraksi tinggi canvas)
    slotRadius: 56, // radius penanda slot (lingkaran putus-putus)
    labelMaxWidth: 140, // lebar maksimum label nama di puncak zona sebelum ellipsis (px)
  },

  cursor: {
    speed: 600, // kecepatan gerak kursor keyboard (px/detik, plan Sprint 1)
    yRatio: 0.62, // posisi y kursor keyboard (fraksi tinggi canvas)
    smooth: 16, // kecepatan interpolasi tampilan kursor (semakin besar makin responsif)
    radius: 15, // radius lingkaran kursor (px)
    labelOffset: 30, // jarak label nama di bawah kursor (px)
    // Gaya kursor mode kamera (Sprint 3): titik jepit (pinch point).
    hand: {
      ringMax: 17, // radius ring saat tangan terbuka (mengecil mengikuti kekuatan jepit)
      ringMin: 9, // radius ring saat jepit penuh
      tickLen: 7, // panjang garis bidik di sekeliling ring
      linkAlpha: 0.45, // opasitas garis penghubung tangan→balon saat memegang
      linkWidth: 2, // ketebalan garis penghubung
    },
    handSmooth: 26, // lerp kursor tangan lebih responsif dari keyboard — posisi
    // tangan sudah di-EMA hands.js (α 0,4); lerp renderer tidak boleh
    // menggandakan lag gerak (PRD F6: gerakan terasa instan).
    labelMaxWidth: 150, // lebar maksimum label nama di bawah kursor sebelum ellipsis (px)
  },

  round: {
    timeout: 25, // batas waktu satu soal (detik, PRD F4c)
    revealDuration: 2.5, // durasi reveal (detik, PRD F4)
    lockSettleDelay: 0.35, // jeda setelah kedua pemain lock sebelum reveal (detik)
    lockAnimDuration: 0.22, // durasi animasi balon menempel ke slot (detik)
    questionFade: 0.35, // durasi fade-in awal setiap soal (detik, Sprint 4)
  },

  // Countdown 3-2-1 sebelum soal PERTAMA sesi (Sprint 4; overlay di canvas).
  countdown: {
    duration: 3, // detik — hanya sekali per sesi, bukan per soal
  },

  // Efek skor mengambang "+10" saat reveal jawaban benar (Sprint 4).
  popups: {
    life: 1.1, // umur efek (detik) — lebih pendek dari reveal 2,5 dtk
    rise: 46, // jarak naik sepanjang umur efek (px)
  },

  timerBar: {
    width: 230, // lebar bar sisa waktu di atas canvas (px)
    height: 8,
    warnRatio: 0.45, // < 45% sisa waktu → kuning
    dangerRatio: 0.2, // < 20% sisa waktu → merah
  },
};

/* ============================================================
 * Util kecil
 * ============================================================ */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
/** Ease "overshoot" untuk animasi pop-in (sedikit melebihi 1 lalu settle). */
const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** Warna latar game (disamakan dengan --bg di css/style.css) untuk overlay fade. */
const BG_OVERLAY = 'rgba(11,16,32,'; // diakhungi alpha saat dipakai (Sprint 4)

/** String font yang dipakai berulang — dibuat SEKALI agar tidak ada
 *  alokasi string per frame (audit performa Sprint 4). */
const FONT_LABEL = '800 13px -apple-system, "Segoe UI", Roboto, sans-serif';
const FONT_POPUP = '900 30px -apple-system, "Segoe UI", Roboto, sans-serif';
const FONT_COUNTDOWN = '900 128px -apple-system, "Segoe UI", Roboto, sans-serif';
const FONT_COUNTDOWN_CAPTION = '800 22px -apple-system, "Segoe UI", Roboto, sans-serif';

/** Warna timer bar (konstanta — dulu string inline per frame). */
const TIMER_GREEN = '#4ade80';
const TIMER_YELLOW = '#fbbf24';
const TIMER_RED = '#ef4444';

/** "#rrggbb" → "rgba(r,g,b,a)". */
function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Wrap teks menjadi baris-baris yang muat maxWidth (greedy word wrap). */
function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (!line || ctx.measureText(test).width <= maxWidth) {
      line = test;
    } else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Pemecah darurat untuk kata tunggal yang TETAP lebih lebar dari maxWidth
 * walau font sudah diperkecil (mis. tanpa spasi & sangat panjang): pecah per
 * karakter. Baris yang sudah muat tidak disentuh. (Sprint 4 — edge case.)
 */
function hardWrapLines(ctx, lines, maxWidth) {
  const out = [];
  for (const line of lines) {
    if (ctx.measureText(line).width <= maxWidth) {
      out.push(line);
      continue;
    }
    let cur = '';
    for (const ch of line) {
      if (cur && ctx.measureText(cur + ch).width > maxWidth) {
        out.push(cur);
        cur = ch;
      } else {
        cur += ch;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

/**
 * Memotong teks dengan ellipsis "…" bila lebih lebar dari maxWidth.
 * Dipakai untuk label nama di kursor & zona — nama super panjang tidak boleh
 * menutupi layar (Sprint 4 — edge case; HUD/RESULT memakai ellipsis CSS).
 */
function truncateLabel(ctx, text, maxWidth) {
  const t = String(text);
  if (ctx.measureText(t).width <= maxWidth) return t;
  const ellipsis = '…';
  let lo = 0;
  let hi = t.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ctx.measureText(t.slice(0, mid) + ellipsis).width <= maxWidth) lo = mid + 1;
    else hi = mid;
  }
  const cut = Math.max(0, lo - 1);
  return t.slice(0, cut) + ellipsis;
}

/* ============================================================
 * KeyboardInputSource — sumber input keyboard per pemain.
 * Implementasi konkret dari kontrak InputSource (lihat header).
 * ============================================================ */
export class KeyboardInputSource {
  /**
   * @param {number} playerId 1 | 2
   * @param {{left:string, right:string, pinch:string}} codes kode `KeyboardEvent.code`
   */
  constructor(playerId, codes) {
    this.playerId = playerId;
    this.kind = 'keyboard'; // penanda gaya kursor bagi renderer (lingkaran)
    this.codes = codes;
    this.x = -1; // ditetapkan pada update() pertama (posisi awal per sisi)
    this.y = 0;
    this.pinching = false;
    this.present = true; // keyboard selalu "terdeteksi"
    this._down = new Set();

    this._onKeyDown = (e) => {
      // Saat tab tersembunyi game di-pause (Sprint 4) — abaikan tombol agar
      // tidak ada toggle jepit "hantu" yang menumpuk selama jeda.
      if (typeof document !== 'undefined' && document.hidden) return;
      if (e.code === this.codes.pinch) {
        if (!e.repeat) this.pinching = !this.pinching; // toggle jepit (PRD F7)
        e.preventDefault();
      } else if (e.code === this.codes.left || e.code === this.codes.right) {
        this._down.add(e.code); // tahan = gerak terus
        e.preventDefault();
      }
    };
    this._onKeyUp = (e) => this._down.delete(e.code);

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  /** Integrasi gerak: dipanggil renderer tiap frame. */
  update(dt, w, h) {
    if (this.x < 0) this.x = w * (this.playerId === 1 ? 0.25 : 0.75); // posisi awal
    this.y = h * CONFIG.cursor.yRatio; // kursor keyboard hanya bergerak horizontal
    let dir = 0;
    if (this._down.has(this.codes.left)) dir -= 1;
    if (this._down.has(this.codes.right)) dir += 1;
    this.x = clamp(
      this.x + dir * CONFIG.cursor.speed * dt,
      CONFIG.cursor.radius,
      Math.max(CONFIG.cursor.radius, w - CONFIG.cursor.radius)
    );
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }
}

/** Peta tombol default per pemain (PRD F7). */
export const DEFAULT_KEYMAPS = {
  1: { left: 'KeyA', right: 'KeyD', pinch: 'KeyW' },
  2: { left: 'ArrowLeft', right: 'ArrowRight', pinch: 'ArrowUp' },
};

/* ============================================================
 * GameRenderer — mesin per-soal pada satu canvas.
 * ============================================================ */
export class GameRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [options]
   * @param {Array<{id:number, name:string, color:string}>} options.players
   * @param {object} [options.sources] override InputSource per playerId (seam Sprint 3)
   * @param {Function} [options.onQuestionStart]
   * @param {Function} [options.onQuestionEnd]
   * @param {Function} [options.onSessionEnd]
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.players = options.players || [
      { id: 1, name: 'Pemain 1', color: '#f97316' },
      { id: 2, name: 'Pemain 2', color: '#38bdf8' },
    ];
    this.onQuestionStart = options.onQuestionStart || (() => {});
    this.onQuestionEnd = options.onQuestionEnd || (() => {});
    this.onSessionEnd = options.onSessionEnd || (() => {});

    this.W = 0;
    this.H = 0;
    this._raf = null;
    this._running = false;
    this._lastTs = 0;
    this._destroyed = false; // Sprint 4: destroy() benar-benar idempoten

    // State sesi / soal
    this.questions = [];
    this.total = 0;
    this.qIndex = -1;
    this.phase = 'idle'; // 'idle' | 'countdown' | 'question' | 'reveal'
    this.phaseTime = 0;
    this.balloons = [];
    this.held = { 1: null, 2: null }; // playerId -> balon yang dipegang
    this.locks = { 1: null, 2: null }; // playerId -> balon terkunci
    this._bothLockedAt = null;

    // Sprint 4 (polish): efek skor mengambang + fade antar soal.
    this._popups = []; // { x, y, t, color, text }
    this._fadeT = 0; // waktu sejak soal aktif (untuk fade-in awal soal)

    // Sumber input (dapat diganti HandSource di Sprint 3, atau ditukar ke
    // keyboard di tengah sesi via setSources() — Sprint 4 edge case kamera mati).
    this.sources =
      options.sources ||
      Object.fromEntries(
        this.players.map((p) => [p.id, new KeyboardInputSource(p.id, DEFAULT_KEYMAPS[p.id])])
      );

    // Kursor tampilan (di-interpolasi agar halus)
    this.cursors = {};
    this._prevPinch = {};
    for (const p of this.players) {
      this.cursors[p.id] = { x: -1, y: -1 };
      this._prevPinch[p.id] = false;
    }

    /* Audit performa Sprint 4: semua string warna/font yang bergantung hanya
     * pada warna identitas pemain (konstan sepanjang sesi) dihitung SEKALI di
     * sini — bukan tiap frame di _drawZones/_drawCursor/_drawBalloon. */
    this._playerById = new Map(this.players.map((p) => [p.id, p]));
    this.ctx.font = FONT_LABEL;
    for (const p of this.players) {
      p._cursorLabel = truncateLabel(this.ctx, p.name, CONFIG.cursor.labelMaxWidth);
      p._zoneLabel = truncateLabel(this.ctx, p.name.toUpperCase(), CONFIG.zone.labelMaxWidth);
      p._zoneFillIdle = hexToRgba(p.color, 0.05);
      p._zoneFillActive = hexToRgba(p.color, 0.22);
      p._zoneEdgeIdle = hexToRgba(p.color, 0.22);
      p._zoneEdgeActive = hexToRgba(p.color, 0.85);
      p._zoneSlotIdle = hexToRgba(p.color, 0.3);
      p._zoneSlotLocked = hexToRgba(p.color, 0.7);
      p._zoneSlotActive = hexToRgba(p.color, 0.95);
      p._zoneLabelIdle = hexToRgba(p.color, 0.55);
      p._zoneLabelActive = hexToRgba(p.color, 1);
      p._heldFillA = lightenHex(p.color, 0.4);
      p._heldFillB = lightenHex(p.color, 0.05);
      p._lockedFillA = lightenHex(p.color, 0.25);
      p._lockedFillB = p.color;
      p._lockedStroke = darkenHex(p.color, 0.25);
      p._curFillOpen = hexToRgba(p.color, 0.3);
      p._curFillPinch = hexToRgba(p.color, 0.95);
      p._linkStyle = hexToRgba(p.color, CONFIG.cursor.hand.linkAlpha);
    }

    this._onResize = () => this._resizeCanvas();
    window.addEventListener('resize', this._onResize);
    this._resizeCanvas();

    // Sprint 4 (edge case): tab blur/hidden → pause loop & timer soal.
    // Resume LANGSUNG saat tab kembali terlihat (tanpa overlay konfirmasi):
    // paling sederhana dan aman dari kecurangan timer — selama tersembunyi
    // loop tidak berjalan sama sekali sehingga phaseTime tidak maju.
    this._onVisibility = () => {
      if (typeof document !== 'undefined' && document.hidden) this.pause();
      else this.resume();
    };
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', this._onVisibility);
    }
  }

  /** Satu frame game loop (dipakai rAF; juga bisa dipanggil harness uji). */
  _tick = (ts) => {
    if (!this._running) return;
    const dt = Math.min((ts - this._lastTs) / 1000, 0.05); // clamp dt agar stabil
    this._lastTs = ts;
    this._update(dt);
    this._draw();
    this._raf = requestAnimationFrame(this._tick);
  };

  /* ---------------- API publik ---------------- */

  /**
   * Memulai sesi baru dengan daftar soal (biasanya 10 hasil acakan data.js).
   * Sprint 4: sesi dibuka dengan countdown 3-2-1 (fase 'countdown') SEBELUM
   * soal pertama; soal ke-2 dst. langsung tanpa countdown.
   */
  startSession(questions) {
    this.questions = questions;
    this.total = questions.length;
    this.qIndex = -1;
    this._popups = [];
    this._fadeT = 0;
    this._startLoop();
    if (this.total > 0) {
      this.phase = 'countdown';
      this.phaseTime = 0;
    } else {
      this.phase = 'idle';
      this._nextQuestion(); // sesi kosong → langsung onSessionEnd
    }
  }

  /** Menghentikan loop render (canvas membeku, listener input tetap). */
  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  /**
   * Membekukan game loop & semua timer soal (Sprint 4 — dipakai saat tab
   * tersembunyi). phaseTime tidak bertambah selama pause; input keyboard
   * diabaikan. Aman dipanggil berulang.
   */
  pause() {
    if (this._destroyed) return;
    this.stop();
  }

  /**
   * Melanjutkan loop setelah pause(). dt dihitung ulang dari sekarang
   * (_lastTs di-reset) sehingga tidak ada lompatan waktu besar — timer soal
   * berlanjut tepat dari titik jeda.
   */
  resume() {
    if (this._destroyed || this._running) return;
    this._startLoop();
  }

  /**
   * Mengganti sumber input DI TENGAH SESI (Sprint 4 — kamera mati mid-game →
   * lanjut keyboard tanpa reload). Sumber lama di-destroy; balon yang sedang
   * dipegang DILEPAS JATUH lagi (bukan lock — pergantian sumber bukan kehendak
   * pemain melepas jepitan); kursor tampilan & deteksi tepi pinch di-reset
   * agar tidak ada edge palsu dari sumber baru.
   * @param {object} sources { 1: InputSource, 2: InputSource }
   */
  setSources(sources) {
    if (this._destroyed) return;
    for (const key of Object.keys(this.sources)) {
      const src = this.sources[key];
      if (src && typeof src.destroy === 'function') src.destroy();
    }
    this.sources = sources;
    for (const p of this.players) {
      this.cursors[p.id] = { x: -1, y: -1 };
      this._prevPinch[p.id] = false;
      this._forceDrop(p.id);
    }
  }

  /** Bersih-bersih total: loop, listener input, listener resize/visibility. Idempoten. */
  destroy() {
    if (this._destroyed) return; // Sprint 4: benar-benar sekali-jalan
    this._destroyed = true;
    this.stop();
    for (const key of Object.keys(this.sources)) {
      const src = this.sources[key];
      if (src && typeof src.destroy === 'function') src.destroy();
    }
    this.sources = {};
    window.removeEventListener('resize', this._onResize);
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', this._onVisibility);
    }
  }

  /* ---------------- Internal: ukuran & loop ---------------- */

  _resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.dprMax);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = w;
    this.H = h;
    // Posisi slot zona dikaitkan pada ukuran canvas — cache agar _slotPos()
    // tidak mengalokasikan objek baru per frame (audit performa Sprint 4).
    const zoneW = w * CONFIG.zone.widthRatio;
    this._zoneW = zoneW;
    this._slots = {
      1: { x: zoneW / 2, y: h * CONFIG.zone.slotYRatio },
      2: { x: w - zoneW / 2, y: h * CONFIG.zone.slotYRatio },
    };
  }

  _startLoop() {
    if (this._running) return;
    this._running = true;
    this._lastTs = performance.now(); // reset penanda waktu (anti lompatan dt setelah pause)
    this._raf = requestAnimationFrame(this._tick);
  }

  /* ---------------- Internal: siklus soal ---------------- */

  _nextQuestion() {
    this.qIndex += 1;
    if (this.qIndex >= this.total) {
      this.phase = 'idle';
      this.balloons = [];
      this._popups = [];
      this.onSessionEnd({ total: this.total });
      return;
    }
    const q = this.questions[this.qIndex];
    this.phase = 'question';
    this.phaseTime = 0;
    this._fadeT = 0; // transisi fade-in awal soal (Sprint 4)
    this._popups = []; // buang sisa efek skor soal lama (normalnya sudah mati)
    this._bothLockedAt = null;
    this.held = { 1: null, 2: null };
    this.locks = { 1: null, 2: null };
    this.balloons = this._createBalloons(q);
    this.onQuestionStart({
      index: this.qIndex, // 0-based
      total: this.total,
      category: q.category,
      question: q.question,
      options: q.options,
    });
  }

  /** Membuat 4 balon jawaban: teks di-wrap, radius menyesuaikan, x acak berjarak minimal. */
  _createBalloons(q) {
    const B = CONFIG.balloon;
    this.ctx.font = B.font;
    const placed = []; // { x, r } yang sudah ditempatkan (untuk jarak minimal)
    const balloons = [];

    for (let i = 0; i < q.options.length; i++) {
      const text = String(q.options[i]);
      let lines = wrapText(this.ctx, text, B.wrapWidth);
      let maxLineW = Math.max(...lines.map((l) => this.ctx.measureText(l).width));
      let fontSize = 18;

      // Kata tunggal yang tak terpecah & tetap kelewat lebar → kecilkan font agar muat.
      if (maxLineW > B.wrapWidth) {
        fontSize = Math.max(11, Math.floor((18 * B.wrapWidth) / maxLineW));
        this.ctx.font = B.font.replace('18px', `${fontSize}px`);
        lines = wrapText(this.ctx, text, B.wrapWidth);
        // Sprint 4 (edge case): kata tanpa spasi yang MASIH lebih lebar walau font
        // sudah minimum → pecah per karakter agar tetap muat di balon.
        lines = hardWrapLines(this.ctx, lines, B.wrapWidth);
        maxLineW = Math.max(...lines.map((l) => this.ctx.measureText(l).width));
        this.ctx.font = B.font;
      }

      const area = maxLineW * lines.length * B.lineHeight;
      // Radius adaptif: dari luas blok teks, DITAMBAH batas bawah separuh
      // tinggi/lebar blok + padding (Sprint 4: blok teks tinggi/kata panjang
      // tidak lagi meluber dari balon) — tetap dibatasi min/max.
      let radius = Math.sqrt(area / Math.PI) * B.radiusAreaFactor;
      radius = Math.max(
        radius,
        (lines.length * B.lineHeight) / 2 + 12,
        maxLineW / 2 + 12
      );
      radius = clamp(radius, B.minRadius, B.maxRadius);

      // Posisi x acak dengan jarak minimal antar balon (PRD F3: tidak tumpang tindih).
      const margin = radius + B.spawnMargin;
      let x = null;
      for (let t = 0; t < B.maxSpawnTries; t++) {
        const cx = margin + Math.random() * Math.max(1, this.W - 2 * margin);
        const ok = placed.every((p) => Math.abs(p.x - cx) >= p.r + radius + B.spawnGap);
        if (ok) {
          x = cx;
          break;
        }
      }
      if (x === null) x = margin + Math.random() * Math.max(1, this.W - 2 * margin); // fallback (jarang)

      placed.push({ x, r: radius });
      balloons.push({
        optionIndex: i,
        text,
        lines,
        fontSize,
        font: B.font.replace('18px', `${fontSize}px`), // string font final — hindari replace() per frame (Sprint 4)
        radius,
        x,
        baseX: x, // pusat ayunan bob (x = baseX + sin(...)·amp)
        y: B.spawnTop - radius - Math.random() * 40,
        vy: B.fallSpeed * (1 + (Math.random() * 2 - 1) * B.fallVariance),
        spawnDelay: i * B.staggerStep + Math.random() * B.staggerJitter, // stagger total 0–1 dtk
        active: false, // belum muncul (menunggu spawnDelay)
        state: 'falling', // 'falling' | 'held' | 'locked' | 'gone'
        heldBy: null,
        lockedBy: null,
        lockAnim: 0,
        lockFrom: null,
        // Sprint 4 (polish): ayunan halus + pop-in saat pertama tampak.
        bobT: 0,
        bobFreq: B.bobFreq * (0.75 + Math.random() * 0.5),
        bobPhase: Math.random() * Math.PI * 2,
        seen: false, // sudah masuk area pandang (memicu animasi pop-in)
        seenT: 0,
      });
    }
    return balloons;
  }

  /* ---------------- Internal: update per frame ---------------- */

  _update(dt) {
    // 0) Countdown 3-2-1 sebelum soal pertama (Sprint 4). Kursor tetap hidup
    //    agar pemain bisa menempatkan diri; tidak ada balon/timer soal.
    if (this.phase === 'countdown') {
      this.phaseTime += dt;
      this._updateInput(dt);
      this._updatePopups(dt);
      if (this.phaseTime >= CONFIG.countdown.duration) this._nextQuestion();
      return;
    }

    this._updateInput(dt);
    this._updatePopups(dt);

    // 2) Update spesifik fase.
    if (this.phase === 'question') {
      this._updateQuestion(dt);
    } else if (this.phase === 'reveal') {
      this.phaseTime += dt;
      this._updateLockAnims(dt);
      if (this.phaseTime >= CONFIG.round.revealDuration) this._nextQuestion();
    }
  }

  /** Bagian 1 dari _update: sumber input, kursor tampilan, balon mengikuti kursor. */
  _updateInput(dt) {
    for (const p of this.players) {
      const src = this.sources[p.id];
      if (src) src.update(dt, this.W, this.H);

      const cur = this.cursors[p.id];
      const sx = src ? src.x : this.W / 2;
      const sy = src ? src.y : this.H / 2;
      if (cur.x < 0) {
        // inisialisasi posisi tampilan = posisi sumber (tanpa lompatan)
        cur.x = sx;
        cur.y = sy;
      }
      // Interpolasi eksponensial: kursor tangan (mode kamera) memakai konstanta
      // lebih responsif karena posisi tangan sudah dihaluskan hands.js.
      const smooth = src && src.kind === 'hand' ? CONFIG.cursor.handSmooth : CONFIG.cursor.smooth;
      const k = 1 - Math.exp(-smooth * dt);
      cur.x += (sx - cur.x) * k;
      cur.y += (sy - cur.y) * k;

      // Balon yang dipegang mengikuti kursor (x & y, PRD F4).
      const hb = this.held[p.id];
      if (hb) {
        hb.x = cur.x;
        hb.y = cur.y;
      }
    }
  }

  _updatePopups(dt) {
    for (const pu of this._popups) pu.t += dt;
    this._popups = this._popups.filter((pu) => pu.t < CONFIG.popups.life);
  }

  _updateQuestion(dt) {
    this.phaseTime += dt;
    this._fadeT = Math.min(this._fadeT + dt, CONFIG.round.questionFade);

    // Balon yang sudah lewat masa stagger muncul.
    for (const b of this.balloons) {
      if (!b.active && this.phaseTime >= b.spawnDelay) b.active = true;
    }

    // Deteksi tepi pinch (rising = coba grab, falling = coba lock/drop).
    for (const p of this.players) {
      const src = this.sources[p.id];
      const present = !!(src && src.present !== false);
      const pinching = present && !!(src && src.pinching);
      const prev = this._prevPinch[p.id];
      if (pinching && !prev) this._tryGrab(p.id);
      else if (!pinching && prev) {
        if (present) this._tryRelease(p.id); // jepitan dibuka sadar → cek zona (lock/drop)
        else this._forceDrop(p.id); // tangan hilang > grace → PRD F6: balon dilepas JATUH lagi
      }
      this._prevPinch[p.id] = pinching;
    }

    // Gerak balon jatuh + animasi balon terkunci.
    let anyUnresolved = false; // ada balon belum hilang/belum terselesaikan
    for (const b of this.balloons) {
      if (!b.active) {
        anyUnresolved = true; // masih menunggu spawn
        continue;
      }
      if (b.state === 'falling') {
        b.y += b.vy * dt;
        // Sprint 4: ayunan horizontal halus (bob) di sekitar baseX — kecepatan
        // jatuh vertikal tetap konstan (PRD F3), bob hanya polish visual.
        b.bobT += dt;
        b.x = b.baseX + Math.sin(b.bobT * b.bobFreq + b.bobPhase) * CONFIG.balloon.bobAmp;
        // Pop-in dipicu saat balon PERTAMA masuk area pandang (bukan saat spawn
        // di atas layar — di sana tidak terlihat mata).
        if (!b.seen && b.y + b.radius >= 0) {
          b.seen = true;
          b.seenT = 0;
        }
        if (b.seen) b.seenT += dt;
        if (b.y - b.radius > this.H) b.state = 'gone'; // hilang di dasar layar
        else anyUnresolved = true;
      } else if (b.state === 'held') {
        anyUnresolved = true; // posisi sudah mengikuti kursor di _update()
      } else if (b.state === 'locked') {
        this._animateLock(b, dt);
      }
    }

    // Kondisi akhir soal (PRD F4): (a) kedua lock, (b) semua balon hilang & tak ada yang dipegang, (c) timeout.
    if (this.locks[1] && this.locks[2]) {
      if (this._bothLockedAt === null) this._bothLockedAt = this.phaseTime;
      if (this.phaseTime - this._bothLockedAt >= CONFIG.round.lockSettleDelay) {
        this._endQuestion();
      }
    } else if (!anyUnresolved) {
      this._endQuestion();
    } else if (this.phaseTime >= CONFIG.round.timeout) {
      // (c) timeout → auto-release balon yang masih dipegang, lalu akhiri soal.
      for (const pid of Object.keys(this.held)) {
        const b = this.held[pid];
        if (b) {
          this._resetBob(b);
          b.state = 'falling';
          b.heldBy = null;
          this.held[pid] = null;
        }
      }
      this._endQuestion();
    }
  }

  /** Kembalikan ayunan bob ke posisi saat ini (dipakai saat balon kembali jatuh). */
  _resetBob(b) {
    b.baseX = b.x;
    b.bobT = 0;
  }

  _tryGrab(playerId) {
    if (this.locks[playerId]) return; // sudah mengunci jawaban — tidak boleh lagi
    if (this.held[playerId]) return; // satu pemain maksimal memegang 1 balon
    const cur = this.cursors[playerId];
    let best = null;
    let bestDist = Infinity;
    for (const b of this.balloons) {
      if (!b.active || b.state !== 'falling') continue; // 1 balon hanya untuk 1 pemain
      const d = Math.hypot(b.x - cur.x, b.y - cur.y);
      if (d <= b.radius + CONFIG.grab.tolerance && d < bestDist) {
        best = b;
        bestDist = d;
      }
    }
    if (best) {
      best.state = 'held';
      best.heldBy = playerId;
      this.held[playerId] = best;
    }
  }

  _tryRelease(playerId) {
    const b = this.held[playerId];
    if (!b) return; // melepas jepitan tanpa memegang apa pun → tidak terjadi apa-apa
    this.held[playerId] = null;
    b.heldBy = null;

    const zoneW = this.W * CONFIG.zone.widthRatio;
    const inZone = playerId === 1 ? b.x <= zoneW : b.x >= this.W - zoneW;
    if (inZone) {
      // LOCK: balon menempel slot zona, berwarna identitas pemain, tak bisa diambil.
      b.state = 'locked';
      b.lockedBy = playerId;
      b.lockFrom = { x: b.x, y: b.y };
      b.lockAnim = 0;
      this.locks[playerId] = b;
    } else {
      this._resetBob(b); // lanjut ayunan dari titik dilepas (Sprint 4)
      b.state = 'falling'; // dilepas di luar zona → jatuh lagi
    }
  }

  /**
   * Pelepasan paksa karena TANGAN HILANG (present=false setelah grace 1,5 dtk,
   * PRD F6) — berbeda dari _tryRelease: balon selalu JATUH lagi, TIDAK pernah
   * terkunci walau kebetulan berada di dalam zona (kunci hanya atas kehendak
   * pemain melepas jepitan; sumber keyboard selalu present → tak pernah ke sini).
   */
  _forceDrop(playerId) {
    const b = this.held[playerId];
    if (!b) return;
    this.held[playerId] = null;
    b.heldBy = null;
    if (b.state === 'held') this._resetBob(b); // jatuh lagi dari titik ini
    b.state = 'falling';
  }

  _slotPos(playerId) {
    return this._slots[playerId]; // di-cache _resizeCanvas (tanpa alokasi per frame)
  }

  _animateLock(b, dt) {
    b.lockAnim = Math.min(1, b.lockAnim + dt / CONFIG.round.lockAnimDuration);
    const t = easeOutCubic(b.lockAnim);
    const target = this._slotPos(b.lockedBy);
    b.x = b.lockFrom.x + (target.x - b.lockFrom.x) * t;
    b.y = b.lockFrom.y + (target.y - b.lockFrom.y) * t;
  }

  _updateLockAnims(dt) {
    for (const b of this.balloons) {
      if (b.state === 'locked') this._animateLock(b, dt);
    }
  }

  _endQuestion() {
    this.phase = 'reveal';
    this.phaseTime = 0;
    const answer = this.questions[this.qIndex].answer;
    const results = {};
    for (const p of this.players) {
      const b = this.locks[p.id];
      results[p.id] = b
        ? { locked: true, optionIndex: b.optionIndex, correct: b.optionIndex === answer }
        : { locked: false, optionIndex: null, correct: false }; // tak lock = gagal soal
    }
    // Sprint 4: efek skor mengambang "+10" di slot pemain yang menjawab benar.
    // (Teks mengikuti PRD F5: +10 poin per jawaban benar.)
    for (const p of this.players) {
      if (results[p.id].correct) {
        const slot = this._slotPos(p.id);
        this._popups.push({
          x: slot.x,
          y: slot.y - CONFIG.zone.slotRadius - 10,
          t: 0,
          color: p.color,
          text: '+10',
        });
      }
    }
    this.onQuestionEnd({ index: this.qIndex, results });
  }

  /* ---------------- Internal: render ---------------- */

  _draw() {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.W, this.H);

    this._drawZones();
    this._drawHandLinks(); // garis tipis tangan→balon (mode kamera, di belakang balon)

    for (const b of this.balloons) {
      if (b.active && b.state !== 'gone') this._drawBalloon(b);
    }

    this._drawPopups(); // efek skor "+10" mengambang (Sprint 4)

    if (this.phase === 'question') this._drawTimerBar();

    for (const p of this.players) this._drawCursor(p);

    this._drawQuestionFade(); // transisi fade awal soal (Sprint 4)
    if (this.phase === 'countdown') this._drawCountdown(); // 3-2-1 (Sprint 4)
  }

  _drawZones() {
    const { ctx } = this;
    const zoneW = this._zoneW;
    for (const p of this.players) {
      const x0 = p.id === 1 ? 0 : this.W - zoneW;
      const carrying = !!this.held[p.id];
      const locked = !!this.locks[p.id];
      const slot = this._slots[p.id];

      // Pita dasar zona: sangat tipis saat idle, menyala saat membawa balon (PRD F4).
      // (String warna di-cache per pemain — audit performa Sprint 4.)
      ctx.fillStyle = carrying ? p._zoneFillActive : p._zoneFillIdle;
      ctx.fillRect(x0, 0, zoneW, this.H);

      // Garis tepi dalam zona.
      ctx.fillStyle = carrying ? p._zoneEdgeActive : p._zoneEdgeIdle;
      const edgeX = p.id === 1 ? zoneW : this.W - zoneW;
      ctx.fillRect(edgeX - 2, 0, 4, this.H);

      // Slot kunci: lingkaran putus-putus (lebih terang saat membawa balon).
      ctx.save();
      ctx.setLineDash([9, 8]);
      ctx.lineWidth = carrying ? 3 : 2;
      ctx.strokeStyle = carrying ? p._zoneSlotActive : locked ? p._zoneSlotLocked : p._zoneSlotIdle;
      ctx.beginPath();
      ctx.arc(slot.x, slot.y, CONFIG.zone.slotRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Label nama pemain di puncak zona (nama panjang → ellipsis, Sprint 4).
      ctx.save();
      ctx.font = FONT_LABEL;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = carrying ? p._zoneLabelActive : p._zoneLabelIdle;
      ctx.fillText(p._zoneLabel, slot.x, 12);
      ctx.restore();
    }
  }

  _drawBalloon(b) {
    const { ctx } = this;
    // Pop-in hanya relevan setelah balon masuk area pandang; sebelum itu balon
    // berada di atas layar — skip menggambar (hemat render, Sprint 4).
    if (!b.seen && b.state === 'falling') return;

    const answer = this.questions[this.qIndex].answer;
    const isCorrect = b.optionIndex === answer;
    const inReveal = this.phase === 'reveal';

    // ---- Palet warna sesuai state (string di-cache per pemain — Sprint 4) ----
    let fillA, fillB, stroke, textColor, glow = null;
    if (inReveal) {
      if (b.state === 'locked') {
        // Terkunci: benar → hijau, salah → merah (PRD F4 reveal).
        if (isCorrect) {
          fillA = '#86efac'; fillB = '#22c55e'; stroke = '#15803d'; glow = '#4ade80';
        } else {
          fillA = '#fca5a5'; fillB = '#ef4444'; stroke = '#b91c1c'; glow = '#f87171';
        }
        textColor = '#ffffff';
      } else if (isCorrect) {
        // Balon jawaban benar yang tak sempat dikunci → tetap disorot hijau.
        fillA = '#d1fae5'; fillB = '#34d399'; stroke = '#15803d'; glow = '#4ade80';
        textColor = '#052e16';
      } else {
        fillA = '#cbd5e1'; fillB = '#94a3b8'; stroke = '#64748b';
        textColor = '#334155';
      }
    } else if (b.state === 'locked') {
      // Terkunci (belum reveal): selalu warna identitas pemain — JANGAN bocorkan benar/salah.
      const p = this._playerById.get(b.lockedBy);
      fillA = p._lockedFillA;
      fillB = p._lockedFillB;
      stroke = p._lockedStroke;
      textColor = '#0b1020';
      glow = p._lockedFillB;
    } else if (b.state === 'held') {
      const p = this._playerById.get(b.heldBy);
      fillA = p._heldFillA;
      fillB = p._heldFillB;
      stroke = p.color;
      textColor = '#0b1020';
      glow = p.color;
    } else {
      // Netral (jatuh): putih keunguan.
      fillA = '#fdfdff'; fillB = '#cdd7f0'; stroke = '#8b98bd';
      textColor = '#101a33';
    }

    ctx.save();

    // Sprint 4: animasi pop-in — balon "muncul" dengan sedikit overshoot
    // saat pertama tampak di layar (transform ke origin lokal balon).
    const pop = b.seen ? Math.min(1, b.seenT / CONFIG.balloon.popIn) : 1;
    const s = pop >= 1 ? 1 : Math.max(0.01, easeOutBack(pop));
    ctx.translate(b.x, b.y);
    ctx.scale(s, s);

    if (glow) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = 22;
    }

    // Badan balon: lingkaran dengan gradasi radial (kesan volumetrik).
    const r = b.radius;
    const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.15, 0, 0, r);
    grad.addColorStop(0, fillA);
    grad.addColorStop(1, fillB);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Outline + simpul (knot) balon di bagian bawah.
    ctx.lineWidth = 3;
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-6, r - 2);
    ctx.lineTo(6, r - 2);
    ctx.lineTo(0, r + 10);
    ctx.closePath();
    ctx.fillStyle = stroke;
    ctx.fill();

    // Kilau kecil di kiri atas.
    ctx.beginPath();
    ctx.ellipse(-r * 0.38, -r * 0.45, r * 0.16, r * 0.09, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();

    // Teks opsi (wrap, tengah balon). Font final sudah di-cache di b.font.
    const lh = CONFIG.balloon.lineHeight;
    ctx.font = b.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = textColor;
    const startY = -((b.lines.length - 1) * lh) / 2;
    for (let i = 0; i < b.lines.length; i++) {
      ctx.fillText(b.lines[i], 0, startY + i * lh);
    }
    ctx.restore();
  }

  _drawTimerBar() {
    const { ctx } = this;
    const T = CONFIG.timerBar;
    const remain = clamp(1 - this.phaseTime / CONFIG.round.timeout, 0, 1);
    const x = (this.W - T.width) / 2;
    const y = 12;

    let color = TIMER_GREEN; // konstanta module — tanpa alokasi string per frame
    if (remain < T.dangerRatio) color = TIMER_RED;
    else if (remain < T.warnRatio) color = TIMER_YELLOW;

    ctx.fillStyle = 'rgba(148,163,184,0.18)';
    roundRect(ctx, x, y, T.width, T.height, T.height / 2);
    ctx.fill();
    if (remain > 0) {
      ctx.fillStyle = color;
      roundRect(ctx, x, y, Math.max(T.height, T.width * remain), T.height, T.height / 2);
      ctx.fill();
    }
  }

  /** Garis tipis penghubung titik jepit → balon yang sedang dipegang (PRD F4/plan Sprint 3.3). */
  _drawHandLinks() {
    const { ctx } = this;
    const L = CONFIG.cursor.hand;
    for (const p of this.players) {
      const b = this.held[p.id];
      if (!b || b.state !== 'held') continue;
      const src = this.sources[p.id];
      if (!src || src.kind !== 'hand' || src.present === false) continue;
      const x0 = src.x;
      const y0 = src.y;
      if (!(x0 >= 0)) continue; // sumber belum pernah update
      ctx.save();
      ctx.strokeStyle = p._linkStyle; // string di-cache per pemain (Sprint 4)
      ctx.lineWidth = L.linkWidth;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawCursor(p) {
    const { ctx } = this;
    const cur = this.cursors[p.id];
    if (cur.x < 0) return;
    const src = this.sources[p.id];
    const isHand = !!src && src.kind === 'hand';
    if (isHand && src.present === false) return; // tangan hilang > grace → kursor tak digambar (PRD F6)
    const pinching = !!(src && src.pinching);

    ctx.save();
    if (isHand) {
      // Mode kamera: kursor = TITIK JEPIT — ring bidik yang mengecil mengikuti
      // kekuatan jepit (semakin jepit semakin kecil & terisi), plus 4 garis bidik.
      const HC = CONFIG.cursor.hand;
      const strength = typeof src.pinch === 'number' ? Math.min(1, Math.max(0, src.pinch)) : pinching ? 1 : 0;
      const r = HC.ringMax + (HC.ringMin - HC.ringMax) * strength;

      ctx.beginPath();
      ctx.arc(cur.x, cur.y, r, 0, Math.PI * 2);
      ctx.fillStyle = pinching ? p._curFillPinch : p._curFillOpen; // di-cache (Sprint 4)
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = p.color;
      ctx.stroke();

      // 4 garis bidik di sekeliling ring (kesan "penjepit").
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (Math.PI / 2) * i;
        const c = Math.cos(a);
        const s = Math.sin(a);
        ctx.moveTo(cur.x + c * (r + 4), cur.y + s * (r + 4));
        ctx.lineTo(cur.x + c * (r + 4 + HC.tickLen), cur.y + s * (r + 4 + HC.tickLen));
      }
      ctx.stroke();

      if (!pinching) {
        ctx.beginPath();
        ctx.arc(cur.x, cur.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      }
    } else {
      // Mode keyboard: lingkaran kursor, terisi penuh saat menjepit (Sprint 1).
      const r = CONFIG.cursor.radius - (pinching ? 3 : 0);
      ctx.beginPath();
      ctx.arc(cur.x, cur.y, r, 0, Math.PI * 2);
      ctx.fillStyle = pinching ? p._curFillPinch : p._curFillOpen; // di-cache (Sprint 4)
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = p.color;
      ctx.stroke();
      if (!pinching) {
        ctx.beginPath();
        ctx.arc(cur.x, cur.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      }
    }

    // Label nama pemain di bawah kursor (nama panjang → ellipsis, Sprint 4).
    ctx.font = FONT_LABEL;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(2,6,23,0.9)';
    ctx.strokeText(p._cursorLabel, cur.x, cur.y + CONFIG.cursor.labelOffset);
    ctx.fillStyle = p.color;
    ctx.fillText(p._cursorLabel, cur.x, cur.y + CONFIG.cursor.labelOffset);
    ctx.restore();
  }

  /* ---------------- Render efek Sprint 4 ---------------- */

  /** Efek skor "+10" mengambang: naik & memudar dari slot pemain yang benar. */
  _drawPopups() {
    if (this._popups.length === 0) return;
    const { ctx } = this;
    const P = CONFIG.popups;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = FONT_POPUP;
    for (const pu of this._popups) {
      const t = pu.t / P.life; // 0..1
      ctx.save();
      ctx.globalAlpha = clamp(1 - t * t, 0, 1);
      ctx.translate(pu.x, pu.y - P.rise * t);
      const scale = 0.8 + 0.4 * (pu.t < 0.25 ? easeOutBack(pu.t / 0.25) : 1);
      ctx.scale(scale, scale);
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(2,6,23,0.85)';
      ctx.strokeText(pu.text, 0, 0);
      ctx.fillStyle = pu.color;
      ctx.fillText(pu.text, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  /** Overlay countdown 3-2-1 sebelum soal pertama (digambar di canvas GAME). */
  _drawCountdown() {
    const { ctx } = this;
    const C = CONFIG.countdown;
    const remain = Math.max(0, C.duration - this.phaseTime);
    const num = Math.max(1, Math.ceil(remain));
    const tIn = this.phaseTime - Math.floor(this.phaseTime); // progres detik berjalan

    ctx.save();
    ctx.fillStyle = 'rgba(11,16,32,0.55)'; // redupkan arena saat bersiap
    ctx.fillRect(0, 0, this.W, this.H);

    // Angka besar dengan efek "pop" tiap detik.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const scale = 1.18 - 0.18 * easeOutCubic(Math.min(1, tIn * 2.4));
    ctx.translate(this.W / 2, this.H * 0.46);
    ctx.scale(scale, scale);
    ctx.font = FONT_COUNTDOWN;
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(2,6,23,0.9)';
    ctx.strokeText(String(num), 0, 0);
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(String(num), 0, 0);
    ctx.restore();

    // Caption kecil di atas angka.
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = FONT_COUNTDOWN_CAPTION;
    ctx.fillStyle = 'rgba(148,163,184,0.95)';
    ctx.fillText('Bersiap!', this.W / 2, this.H * 0.46 - 100);
    ctx.restore();
  }

  /** Transisi fade-in awal soal: arena muncul mulus dari warna latar (Sprint 4). */
  _drawQuestionFade() {
    if (this.phase !== 'question') return;
    const F = CONFIG.round.questionFade;
    if (this._fadeT >= F) return;
    const a = (1 - this._fadeT / F) * 0.9;
    this.ctx.fillStyle = BG_OVERLAY + a.toFixed(3) + ')';
    this.ctx.fillRect(0, 0, this.W, this.H);
  }
}

/* ============================================================
 * Helper warna/shape untuk gambar balon
 * ============================================================ */

/** Mencerahkan hex ke arah putih sebanyak `t` (0..1). */
function lightenHex(hex, t) {
  const h = hex.replace('#', '');
  const ch = (i) => parseInt(h.slice(i, i + 2), 16);
  const mix = (c) => Math.round(c + (255 - c) * t);
  return `rgb(${mix(ch(0))},${mix(ch(2))},${mix(ch(4))})`;
}

/** Menggelapkan hex ke arah hitam sebanyak `t` (0..1). */
function darkenHex(hex, t) {
  const h = hex.replace('#', '');
  const ch = (i) => parseInt(h.slice(i, i + 2), 16);
  const mix = (c) => Math.round(c * (1 - t));
  return `rgb(${mix(ch(0))},${mix(ch(2))},${mix(ch(4))})`;
}

/** Rounded rectangle path (untuk timer bar). */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
