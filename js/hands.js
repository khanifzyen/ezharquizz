/**
 * hands.js — kamera & deteksi tangan MediaPipe HandLandmarker (mode Kamera).
 *
 * Modul ini HANYA dimuat via dynamic import() ketika pengguna memilih mode
 * Kamera (lihat main.js) — mode keyboard tidak memuat modul ini sama sekali,
 * sehingga tidak ada satu pun network request ke CDN MediaPipe (PRD §8).
 *
 * Arsitektur (Sprint 2):
 *  - `initHands(videoEl, options)` → Promise<HandsController>: memuat MediaPipe
 *    Tasks Vision dari CDN (fallback delegate GPU→CPU), membuka getUserMedia,
 *    menancapkan stream ke `videoEl`, lalu menjalankan loop deteksi sendiri
 *    (rAF + dedupe `video.currentTime`) — TERPISAH dari game loop renderer.
 *  - Semua kegagalan (offline/CDN gagal/izin ditolak/kamera absen) dibungkus
 *    menjadi Error bertanda `.friendly` berpesan Indonesia; main.js
 *    menampilkannya sebagai notifikasi + auto-switch ke mode keyboard.
 *
 * Kontrak output per tangan (untuk Sprint 3 — HandSource):
 *    { playerId: 1|2|null, present: boolean,
 *      x: 0..1, y: 0..1,            // MIRRORED (sudah 1-x), titik jepit 4↔8
 *      pinch: 0..1, pinching: boolean,
 *      landmarks: [...21 titik {x,y,z} MIRRORED & ter-EMA],
 *      trackId: number|null }        // identitas track internal (debug/QA)
 *  - `pinch` (kekuatan jepit) = 1 - clamp(rasio, 0, 1) dengan
 *    rasio = dist(4,8) / (0.5 × dist(0,9)) — jarak 2D bidang gambar.
 *  - `pinching` memakai hysteresis: ON saat rasio < 0.45, OFF saat > 0.6,
 *    di antara nilai itu status sebelumnya dipertahankan (anti-flapping).
 *  - Assignment pemain dihitung ULANG tiap frame dari sisi frame:
 *    tangan dengan x mirrored lebih kecil = P1, lebih besar = P2.
 *    Tepat satu tangan terdeteksi → playerId null (tetap present).
 *
 * Bagian pure (tanpa API browser, bisa diuji di Node): HANDS_CONFIG,
 * mirrorLandmarks, pinchPoint, computePinchRatio, pinchStrength,
 * applyPinchHysteresis, ema, HandTracker, createStabilityTracker,
 * handsSignature — dipakai harness uji (lihat laporan sprint-2).
 */

/* ============================================================
 * Konstanta
 * ============================================================ */

/** CDN MediaPipe Tasks Vision versi terkunci (implementation-plan Sprint 2). */
const MP_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MP_WASM = `${MP_CDN}/wasm`;
const MP_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

/** Konstanta tuning deteksi tangan (satu tempat, mudah ditala). */
export const HANDS_CONFIG = {
  numHands: 2,
  emaAlpha: 0.4, // smoothing posisi EMA (plan Sprint 2: α ± 0.4)
  pinchRatioOn: 0.45, // rasio jepit ON di bawah ini
  pinchRatioOff: 0.6, // rasio jepit OFF di atas ini
  graceMs: 150, // hilang < ini tetap present (anti-flicker indikator)
  forgetMs: 900, // hilang > ini track dihapus (state smoothing dibuang)
  matchDist: 0.28, // jarak normalisasi maks pencocokan track antar frame
};

/** Pasangan indeks landmark untuk garis rangka tangan (overlay debug). */
export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],               // jempol
  [0, 5], [5, 6], [6, 7], [7, 8],               // telunjuk
  [5, 9], [9, 10], [10, 11], [11, 12],          // jari tengah
  [9, 13], [13, 14], [14, 15], [15, 16],        // manis
  [13, 17], [17, 18], [18, 19], [19, 20],       // kelingking
  [0, 17],                                       // dasar telapak
];

/** Array landmark kosong bersama (dipakai slot yang tidak present). */
const EMPTY_LANDMARKS = [];

/* ============================================================
 * Pure helpers — logika geometri/deret (testable tanpa browser)
 * ============================================================ */

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const dist2d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** EMA standar: smoothed = prev + α (next − prev). */
export function ema(prev, next, alpha = HANDS_CONFIG.emaAlpha) {
  return prev + (next - prev) * alpha;
}

/**
 * Membalik koordinat x semua landmark (mirror) agar cocok dengan preview
 * video yang di-mirror CSS `scaleX(-1)` (PRD F6). z tidak dipakai logika
 * apa pun di modul ini dan diteruskan apa adanya.
 * @param {Array<{x:number,y:number,z?:number}>} landmarks 21 titik normalized
 */
export function mirrorLandmarks(landmarks) {
  const out = new Array(landmarks.length);
  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i];
    out[i] = { x: 1 - p.x, y: p.y, z: p.z != null ? p.z : 0 };
  }
  return out;
}

/** Titik jepit = tengah ujung jempol (4) dan ujung telunjuk (8). Input harus sudah mirrored. */
export function pinchPoint(landmarks) {
  const a = landmarks[4];
  const b = landmarks[8];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Rasio jepit = dist(4,8) / (0.5 × dist(0,9)) — dibandingkan terhadap setengah
 * panjang telapak (pergelangan 0 → ruas tengah jari tengah 9) supaya tidak
 * bergantung skala/jarak tangan ke kamera (PRD F6). Jarak 2D (x,y).
 */
export function computePinchRatio(landmarks) {
  const scale = 0.5 * dist2d(landmarks[0], landmarks[9]);
  if (!(scale > 1e-6)) return 1; // landmark degenerate → anggap terbuka
  return dist2d(landmarks[4], landmarks[8]) / scale;
}

/** Kekuatan jepit 0..1 dari rasio: 1 - clamp(rasio, 0, 1). */
export function pinchStrength(ratio) {
  return 1 - clamp01(ratio);
}

/** Hysteresis status jepit: ON < 0.45, OFF > 0.6, di antaranya mempertahankan status. */
export function applyPinchHysteresis(prevPinching, ratio, cfg = HANDS_CONFIG) {
  if (ratio < cfg.pinchRatioOn) return true;
  if (ratio > cfg.pinchRatioOff) return false;
  return prevPinching;
}

/**
 * Tracker "2 tangan stabil N ms" untuk layar kalibrasi (pure, dipakai main.js).
 * update(ok, dtMs) → { stable, progress, elapsed }.
 */
export function createStabilityTracker({ requiredMs = 1500 } = {}) {
  let acc = 0;
  return {
    update(ok, dtMs) {
      acc = ok ? acc + Math.max(0, dtMs) : 0;
      return this.status;
    },
    get status() {
      return {
        stable: acc >= requiredMs,
        progress: Math.min(1, acc / requiredMs),
        elapsed: acc,
      };
    },
    reset() {
      acc = 0;
    },
  };
}

/** Sidik jari state slot tangan — berubah = ada perubahan present/pinch/assignment. */
export function handsSignature(hands) {
  const part = (pid) => {
    const h = hands[pid];
    if (!h || !h.present) return `${pid}:-`;
    return `${pid}:${h.pinching ? 1 : 0}@${h.trackId == null ? '?' : h.trackId}`;
  };
  return `${part(1)}|${part(2)}`;
}

/* ============================================================
 * HandTrack / HandTracker — pelacakan & smoothing (pure)
 * ============================================================ */

let nextTrackId = 1;

/** Satu tangan fisik yang dipantau lintas frame (posisi MIRRORED + EMA). */
class HandTrack {
  constructor(id, mirroredLm, nowMs, cfg) {
    this.id = id;
    this.cfg = cfg;
    // Salinan pertama = raw (frame pertama tidak butuh smoothing).
    this.lm = mirroredLm.map((p) => ({ x: p.x, y: p.y, z: p.z }));
    const raw = pinchPoint(mirroredLm);
    this.rawX = raw.x;
    this.rawY = raw.y;
    const pt = pinchPoint(this.lm);
    this.x = pt.x;
    this.y = pt.y;
    this.ratio = computePinchRatio(this.lm);
    this.pinch = pinchStrength(this.ratio);
    this.pinching = this.ratio < cfg.pinchRatioOn;
    this.seenAt = nowMs;
    this.present = true;
  }

  /** Frame baru untuk tangan yang sama: EMA semua landmark lalu turunkan status. */
  update(mirroredLm, nowMs) {
    const a = this.cfg.emaAlpha;
    for (let i = 0; i < this.lm.length; i++) {
      const s = this.lm[i];
      const r = mirroredLm[i] || s;
      s.x = ema(s.x, r.x, a);
      s.y = ema(s.y, r.y, a);
      s.z = ema(s.z, r.z, a);
    }
    const raw = pinchPoint(mirroredLm);
    this.rawX = raw.x;
    this.rawY = raw.y;
    const pt = pinchPoint(this.lm);
    this.x = pt.x;
    this.y = pt.y;
    // Rasio jepit dihitung dari landmark RAW frame ini, BUKAN hasil EMA:
    // EMA hanya untuk smoothing posisi — menghitung rasio dari landmark yang
    // dihaluskan menambah jeda ON/OFF beberapa frame DI ATAS hysteresis
    // (jepit kuat baru terdaftar setelah ±4 frame ≈ 130 ms @30fps, melanggar
    // syarat respons < 100 ms PRD F6). Anti-flapping sudah ditangani hysteresis.
    this.ratio = computePinchRatio(mirroredLm);
    this.pinch = pinchStrength(this.ratio);
    this.pinching = applyPinchHysteresis(this.pinching, this.ratio, this.cfg);
    this.seenAt = nowMs;
    this.present = true;
  }
}

/**
 * Pelacak tangan pure: menerima hasil `result.landmarks` MediaPipe per frame
 * (array-of-array-of-21-titik normalized RAW), mencocokkannya ke track lama
 * (nearest-neighbor pada titik jepit), meng-EMA posisi, lalu meng-assign
 * slot pemain per frame berdasarkan sisi frame (x mirrored terkecil = P1).
 */
export class HandTracker {
  /** @param {object} [cfg] override HANDS_CONFIG (dipakai harness uji). */
  constructor(cfg = HANDS_CONFIG) {
    this.cfg = cfg;
    this.tracks = [];
    /** Hasil assignment frame terakhir: { 1: track|null, 2: track|null, lone: track|null }. */
    this.assignments = { 1: null, 2: null, lone: null };
  }

  /**
   * Memproses satu frame deteksi.
   * @param {Array<Array<{x,y,z}>>} handsLm hasil `landmarker.detectForVideo().landmarks`
   * @param {number} nowMs waktu frame (ms, monotonik)
   */
  processFrame(handsLm, nowMs) {
    const cfg = this.cfg;

    // 1) Mirror semua landmark masukan.
    const mirrored = [];
    if (Array.isArray(handsLm)) {
      for (const lm of handsLm) {
        if (lm && lm.length >= 21) mirrored.push(mirrorLandmarks(lm));
      }
    }
    const pts = mirrored.map(pinchPoint);

    // 2) Buang track yang terlalu lama tidak terlihat (state-nya hangus).
    this.tracks = this.tracks.filter((t) => nowMs - t.seenAt <= cfg.forgetMs);

    // 3) Pencocokan greedy jarak-terkecil (track pakai posisi RAW frame lalu).
    const cand = [];
    for (let i = 0; i < pts.length; i++) {
      for (const t of this.tracks) {
        const d = Math.hypot(pts[i].x - t.rawX, pts[i].y - t.rawY);
        if (d <= cfg.matchDist) cand.push({ i, t, d });
      }
    }
    cand.sort((a, b) => a.d - b.d);
    const handToTrack = new Map();
    const taken = new Set();
    for (const c of cand) {
      if (handToTrack.has(c.i) || taken.has(c.t)) continue;
      handToTrack.set(c.i, c.t);
      taken.add(c.t);
    }

    // 4) Update track yang cocok / buat track baru.
    for (let i = 0; i < mirrored.length; i++) {
      const t = handToTrack.get(i);
      if (t) t.update(mirrored[i], nowMs);
      else this.tracks.push(new HandTrack(nextTrackId++, mirrored[i], nowMs, cfg));
    }

    // 5) Status present: hilang ≤ graceMs masih dianggap ada (anti-flicker).
    for (const t of this.tracks) t.present = nowMs - t.seenAt <= cfg.graceMs;

    this._assign();
  }

  /** Assignment pemain per frame: urutkan x mirrored, kiri = P1, kanan = P2. */
  _assign() {
    const present = this.tracks.filter((t) => t.present).sort((a, b) => a.x - b.x);
    this.assignments = { 1: null, 2: null, lone: null };
    if (present.length >= 2) {
      this.assignments[1] = present[0];
      this.assignments[2] = present[1];
      if (present.length > 2) this.assignments.lone = present[2]; // pengaman (numHands = 2)
    } else if (present.length === 1) {
      this.assignments.lone = present[0]; // satu tangan → playerId null
    }
  }
}

/* ============================================================
 * Helpers output & error
 * ============================================================ */

/** Objek tangan "kosong" untuk slot pemain yang tangannya tidak terdeteksi. */
function makeEmptyHand(playerId) {
  return {
    playerId,
    present: false,
    x: 0.5,
    y: 0.5,
    pinch: 0,
    pinching: false,
    landmarks: EMPTY_LANDMARKS,
    trackId: null,
  };
}

/** Error dengan pesan ramah (`.friendly = true`) — ditampilkan apa adanya ke user. */
function friendlyError(message, cause) {
  const err = new Error(message);
  err.friendly = true;
  if (cause) err.cause = cause;
  return err;
}

/** Terjemahkan kegagalan getUserMedia menjadi pesan Indonesia yang ramah. */
function cameraErrorMessage(err) {
  switch (err && err.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Izin kamera ditolak. Izinkan kamera untuk halaman ini (ikon kamera di address bar) lalu coba lagi, atau lanjutkan dengan keyboard.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Kamera tidak ditemukan pada perangkat ini. Hubungkan sebuah webcam, atau lanjutkan dengan keyboard.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi itu lalu coba lagi, atau lanjutkan dengan keyboard.';
    default:
      return 'Kamera tidak dapat diakses. Pastikan halaman dibuka via http://localhost atau HTTPS, lalu coba lagi, atau lanjutkan dengan keyboard.';
  }
}

/* ============================================================
 * HandsController — loop deteksi + state output per pemain
 * ============================================================ */

export class HandsController {
  /**
   * Normalnya dibuat lewat initHands(); konstruktor terbuka agar bisa diuji
   * tanpa browser (harness Node memanggil processDetections langsung).
   * @param {object} opts { video, stream, landmarker, delegate, rebuildLandmarker, onFrame, onHandsChange, tracker }
   */
  constructor(opts = {}) {
    this.video = opts.video || null;
    this.stream = opts.stream || null;
    this.onFrame = opts.onFrame || null;
    this.onHandsChange = opts.onHandsChange || null;
    this.tracker = opts.tracker || new HandTracker();

    /** Slot per pemain — objek STABIL, dimutasi di tempat (jangan disimpan lintas frame oleh konsumen). */
    this.hands = { 1: makeEmptyHand(1), 2: makeEmptyHand(2) };
    /** Tangan terdeteksi yang belum bisa di-assign (tepat 1 tangan di frame). */
    this.unassigned = null;
    /** Semua tangan present frame ini ([slot P1, slot P2, unassigned]). */
    this.detectedHands = [];

    this.paused = false; // true → loop deteksi idle (mis. layar RESULT)
    this._landmarker = opts.landmarker || null;
    this._delegate = opts.delegate || null;
    this._rebuildLandmarker = opts.rebuildLandmarker || null; // async (delegate) => landmarker
    this._running = false;
    this._destroyed = false;
    this._raf = null;
    this._lastVideoTime = -1;
    this._lastDetectTs = 0;
    this._lastSig = null;
    this._detectFails = 0;
    this._rebuilding = false;
    this._unassignedState = makeEmptyHand(null);
  }

  /** Delegate aktif ('GPU' | 'CPU' | null) — informatif/QA. */
  get delegate() {
    return this._delegate;
  }

  /** Menjalankan loop deteksi (rAF; aman dipanggil berulang). */
  start() {
    if (this._running || this._destroyed) return;
    this._running = true;
    this._raf = requestAnimationFrame(this._tick);
  }

  /** Jeda/lanjut deteksi tanpa membongkar kamera (dipakai main.js di layar RESULT). */
  setPaused(p) {
    this.paused = !!p;
  }

  /**
   * Memproses satu frame hasil MediaPipe — dipisah dari _tick agar bisa
   * diuji langsung di Node (harness Sprint 2).
   */
  processDetections(handsLm, nowMs) {
    this.tracker.processFrame(handsLm, nowMs);
    this._syncOutputs();
  }

  /** Memberhentikan kamera, loop, dan landmarker. Idempoten. */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    if (this._landmarker) {
      try {
        this._landmarker.close();
      } catch {
        /* abaikan */
      }
    }
    if (this.stream) {
      for (const t of this.stream.getTracks()) {
        try {
          t.stop();
        } catch {
          /* abaikan */
        }
      }
    }
    if (this.video) {
      try {
        this.video.srcObject = null;
      } catch {
        /* abaikan */
      }
    }
    this.hands[1].present = false;
    this.hands[2].present = false;
    this.unassigned = null;
    this.detectedHands = [];
  }

  /* ---------------- internal ---------------- */

  _tick = () => {
    if (!this._running || this._destroyed) return;
    this._raf = requestAnimationFrame(this._tick);
    if (this.paused) return;
    const v = this.video;
    if (!v || v.readyState < 2) return;
    if (v.currentTime === this._lastVideoTime) return; // belum ada frame video baru
    this._lastVideoTime = v.currentTime;

    // Timestamp detectForVideo wajib naik terus — jamin strictly increasing.
    const now = performance.now();
    const ts = now > this._lastDetectTs ? now : this._lastDetectTs + 1;
    this._lastDetectTs = ts;

    let res = null;
    try {
      res = this._landmarker.detectForVideo(v, ts);
    } catch (err) {
      this._handleDetectError(err);
      return;
    }
    this._detectFails = 0;
    this.processDetections((res && res.landmarks) || [], ts);

    if (this.onFrame) {
      this.onFrame({
        hands: this.hands,
        unassigned: this.unassigned,
        detected: this.detectedHands,
        now: ts,
      });
    }
    const sig = handsSignature(this.hands) + `|u:${this.unassigned ? this.unassigned.trackId : '-'}`;
    if (sig !== this._lastSig) {
      const previous = this._lastSig;
      this._lastSig = sig;
      if (this.onHandsChange) {
        this.onHandsChange({ hands: this.hands, unassigned: this.unassigned, signature: sig, previous });
      }
    }
  };

  /** Salin state tracker ke objek kontrak per pemain (slot stabil, dimutasi in-place). */
  _syncOutputs() {
    const a = this.tracker.assignments;
    for (const pid of [1, 2]) {
      const t = a[pid];
      const h = this.hands[pid];
      if (t) {
        h.playerId = pid;
        h.present = true;
        h.x = t.x;
        h.y = t.y;
        h.pinch = t.pinch;
        h.pinching = t.pinching;
        h.landmarks = t.lm;
        h.trackId = t.id;
      } else {
        h.playerId = pid;
        h.present = false;
        h.pinching = false;
        h.pinch = 0;
        h.landmarks = EMPTY_LANDMARKS;
        h.trackId = null;
        // x,y dibiarkan di posisi terakhir diketahui (membeku) — present=false
        // adalah penanda sahnya; Sprint 3 bisa memakainya untuk grace period.
      }
    }
    const lone = a.lone;
    if (lone) {
      const u = this._unassignedState;
      u.playerId = null;
      u.present = true;
      u.x = lone.x;
      u.y = lone.y;
      u.pinch = lone.pinch;
      u.pinching = lone.pinching;
      u.landmarks = lone.lm;
      u.trackId = lone.id;
      this.unassigned = u;
    } else {
      this.unassigned = null;
    }
    this.detectedHands = [this.hands[1], this.hands[2]].filter((h) => h.present);
    if (this.unassigned) this.detectedHands.push(this.unassigned);
  }

  /**
   * detectForVideo gagal berulang (umumnya delegate GPU bermasalah di driver
   * tertentu) → coba bangun ulang landmarker dengan CPU satu kali.
   */
  _handleDetectError(err) {
    this._detectFails += 1;
    console.warn('[EzharQuiz] detectForVideo gagal:', err);
    if (this._detectFails < 3 || this._rebuilding || !this._rebuildLandmarker) return;
    if (this._delegate !== 'GPU') return;
    this._rebuilding = true;
    const old = this._landmarker;
    this._rebuildLandmarker('CPU')
      .then((lm) => {
        // destroy() bisa terjadi di tengah rebuild → jangan menempel landmarker
        // baru ke controller yang sudah mati; tutup saja agar tidak bocor.
        if (this._destroyed) {
          try {
            lm.close();
          } catch {
            /* abaikan */
          }
          return;
        }
        this._landmarker = lm;
        this._delegate = 'CPU';
        this._detectFails = 0;
        try {
          old.close();
        } catch {
          /* abaikan */
        }
      })
      .catch(() => {})
      .finally(() => {
        this._rebuilding = false;
      });
  }
}

/* ============================================================
 * initHands — pabrik HandsController (MediaPipe + getUserMedia)
 * ============================================================ */

/**
 * Mengaktifkan kamera + deteksi tangan.
 * @param {HTMLVideoElement} videoEl elemen video tujuan stream (dipakai juga loop deteksi)
 * @param {{onFrame?:Function, onHandsChange?:Function}} [options] callback (boleh juga diset belakangan di controller)
 * @returns {Promise<HandsController>} reject dengan Error `.friendly` berpesan Indonesia
 */
export async function initHands(videoEl, options = {}) {
  if (!videoEl) throw friendlyError('Elemen video kamera tidak tersedia.');

  // 1) Muat pustaka MediaPipe Tasks Vision dari CDN (satu-satunya butuh internet).
  let mp;
  try {
    mp = await import(MP_CDN);
  } catch (cause) {
    throw friendlyError(
      'Gagal memuat pustaka deteksi tangan dari internet (butuh koneksi saat pertama kali memuat). ' +
        'Periksa koneksi lalu coba lagi, atau main dengan keyboard.',
      cause
    );
  }

  let fileset;
  try {
    fileset = await mp.FilesetResolver.forVisionTasks(MP_WASM);
  } catch (cause) {
    throw friendlyError(
      'Gagal menyiapkan modul WASM deteksi tangan. Periksa koneksi internet lalu coba lagi, atau main dengan keyboard.',
      cause
    );
  }

  const createLandmarker = (delegate) =>
    mp.HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MP_MODEL, delegate },
      runningMode: 'VIDEO',
      numHands: HANDS_CONFIG.numHands,
    });

  // 2) Landmarker: coba GPU dulu, fallback CPU (plan Sprint 2).
  let delegate = 'GPU';
  let landmarker;
  try {
    landmarker = await createLandmarker('GPU');
  } catch (cause) {
    console.warn('[EzharQuiz] Delegate GPU gagal, beralih ke CPU:', cause);
    try {
      delegate = 'CPU';
      landmarker = await createLandmarker('CPU');
    } catch (cause2) {
      throw friendlyError(
        'Gagal menyiapkan deteksi tangan (model tidak dapat dimuat). Periksa koneksi internet lalu coba lagi, atau main dengan keyboard.',
        cause2
      );
    }
  }

  // 3) Kamera. (Kegagalan di sini harus menutup landmarker yang sudah dibuat —
  //    tidak ada controller yang akan memilikinya, jadi tutup manual agar tidak bocor.)
  const closeLandmarker = () => {
    try {
      landmarker.close();
    } catch {
      /* abaikan */
    }
  };
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    closeLandmarker();
    throw friendlyError(
      'Browser tidak mengizinkan akses kamera dari konteks ini (kamera butuh http://localhost atau HTTPS). Silakan main dengan keyboard.'
    );
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
  } catch (cause) {
    closeLandmarker();
    throw friendlyError(cameraErrorMessage(cause), cause);
  }

  // 4) Tancapkan stream & mainkan (muted + playsinline → autoplay diizinkan).
  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.srcObject = stream;
  try {
    await videoEl.play();
  } catch (cause) {
    // Video muted umumnya autoplay; bila tertunda, loop menunggu readyState.
    console.warn('[EzharQuiz] video.play() tertunda:', cause);
  }

  const controller = new HandsController({
    video: videoEl,
    stream,
    landmarker,
    delegate,
    rebuildLandmarker: createLandmarker,
    onFrame: options.onFrame || null,
    onHandsChange: options.onHandsChange || null,
  });
  controller.start();
  return controller;
}

/* ============================================================
 * Overlay debug — gambar rangka tangan di atas preview/PiP
 * ============================================================ */

/**
 * Menggambar 21 landmark + garis koneksi satu tangan ke ctx (koordinat CSS px;
 * pemanggil menangani setTransform DPR). `hand.landmarks` sudah MIRRORED,
 * sehingga digambar langsung di atas video yang di-mirror CSS.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} hand objek kontrak tangan (present/landmarks)
 * @param {object} [opts] { color, width, height, lineWidth, dotRadius, label }
 */
export function drawHandSkeleton(ctx, hand, opts = {}) {
  if (!hand || !hand.present || !hand.landmarks || hand.landmarks.length < 21) return;
  const {
    color = '#e2e8f0',
    width = 320,
    height = 180,
    lineWidth = 2.5,
    dotRadius = 3,
    label = null,
  } = opts;
  const lm = hand.landmarks;
  const px = (i) => lm[i].x * width;
  const py = (i) => lm[i].y * height;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;

  // Garis rangka.
  ctx.beginPath();
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.moveTo(px(a), py(a));
    ctx.lineTo(px(b), py(b));
  }
  ctx.stroke();

  // Titik landmark (ujung jepit 4 & 8 diperbesar).
  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  for (let i = 0; i < 21; i++) {
    const r = i === 4 || i === 8 ? dotRadius * 1.5 : dotRadius;
    ctx.beginPath();
    ctx.arc(px(i), py(i), r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Label (mis. "P1"/"P2"/"?") di dekat pergelangan, dijauhkan dari tepi.
  if (label) {
    const lx = Math.min(Math.max(px(0), 36), width - 36);
    const ly = Math.min(Math.max(py(0) - 16, 14), height - 6);
    ctx.font = '800 13px -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(2,6,23,0.85)';
    ctx.strokeText(label, lx, ly);
    ctx.fillStyle = color;
    ctx.fillText(label, lx, ly);
  }
  ctx.restore();
}
