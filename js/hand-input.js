/**
 * hand-input.js — jembatan deteksi tangan (hands.js) → kontrak InputSource
 * renderer (Sprint 3: kontrol gesture).
 *
 * `HandSource` membungkus state SATU pemain dari `HandsController.hands[pid]`
 * (kontrak Sprint 2) menjadi kontrak InputSource Sprint 1:
 *
 *   { get x, get y,      // posisi piksel canvas (x/y tangan 0..1 × W,H)
 *     get pinching,      // status jepit (hysteresis hands.js)
 *     get present,       // tangan terdeteksi (dengan grace period PRD F6)
 *     update(dt, w, h), destroy() }
 *
 * Tidak ada logika grab/lock/lock-zone di sini — SEMUA mekanika F4 tetap di
 * renderer (paritas keyboard vs gesture, PRD F7). Renderer hanya mendeteksi
 * tepi naik/turun `pinching`; sumber ini cukup melaporkan status saat ini.
 *
 * Pola pembacaan: PULL — state slot `controller.hands[pid]` dibaca di
 * `update()` tiap frame game (slot objek stabil yang dimutasi di tempat oleh
 * loop deteksi; JavaScript single-threaded sehingga bebas race). Tanpa
 * subscribe/callback → `destroy()` trivial dan tidak ada listener bocor.
 *
 * Grace period tangan hilang (PRD F6, plan Sprint 3.4):
 *  - Tangan hilang SELAGI pemain menjepit (membawa balon): pinching & posisi
 *    dibekukan (x/y slot memang membeku di hands.js) selama < `graceMs`;
 *    balon TIDAK dilepas untuk jitter deteksi singkat.
 *  - Hilang lebih dari `graceMs` → `present=false` + `pinching=false` →
 *    falling edge di renderer → balon dilepas jatuh lagi; pemain tidak bisa
 *    grab baru sampai tangan kembali terdeteksi.
 *  - Tangan hilang saat TIDAK menjepit → langsung `present=false`
 *    (tidak ada balon yang perlu dibekukan; PRD hanya mensyaratkan grace
 *    "saat memegang balon").
 */

/** Konstanta tuning jembatan tangan→input (satu tempat, mudah ditala). */
export const HAND_INPUT_CONFIG = {
  graceMs: 1500, // batas pembekuan tangan hilang saat menjepit (PRD F6: 1,5 dtk)
};

export class HandSource {
  /**
   * @param {number} playerId 1 | 2
   * @param {object} controller HandsController aktif (hands.js); hanya dibaca
   *   properti `hands[playerId]` — tidak menyentuh video/landmarker.
   * @param {object} [cfg] override HAND_INPUT_CONFIG (dipakai harness uji).
   */
  constructor(playerId, controller, cfg = HAND_INPUT_CONFIG) {
    this.playerId = playerId;
    this.kind = 'hand'; // penanda gaya kursor bagi renderer (titik jepit)
    this._controller = controller;
    this._cfg = cfg;

    // State terakhir yang diketahui dari tangan (normalisasi 0..1 mirrored).
    this._nx = 0.5;
    this._ny = 0.4;
    this._pinch = 0; // kekuatan jepit 0..1 (untuk feedback visual kursor)
    this._pinching = false;
    this._present = false;

    // Posisi piksel canvas (hasil update() terakhir).
    this._px = -1;
    this._py = -1;

    // Rect tampilan video dalam kanvas (latar penuh; null = seluruh kanvas).
    this._rect = null;

    this._missing = 0; // akumulator durasi tangan tidak terdeteksi (detik)
    this._destroyed = false;
  }

  /* ---------------- Kontrak InputSource ---------------- */

  /** Posisi x piksel canvas (titik jepit tangan mirrored × lebar canvas). */
  get x() {
    return this._px;
  }

  /** Posisi y piksel canvas. */
  get y() {
    return this._py;
  }

  /** Status jepit saat ini (true = menjepit). Selama grace: dibekukan. */
  get pinching() {
    return this._pinching;
  }

  /**
   * Tangan sah dipakai? true = terdeteksi, ATAU hilang sesaat (< graceMs)
   * selama masih menjepit (pembekuan). false = tidak bisa grab.
   */
  get present() {
    return this._present;
  }

  /** Kekuatan jepit 0..1 (opsional — dipakai renderer untuk kursor mode kamera). */
  get pinch() {
    return this._pinch;
  }

  /**
   * Rect tampilan video di dalam kanvas (letterbox object-fit: contain).
   * Video kamera tampil sebagai LATAR PENUH di belakang kanvas game; agar kursor
   * jatuh persis di posisi tangan nyata di layar, koordinat normalisasi 0..1
   * harus dipetakan ke rect video yang benar-benar terlihat — bukan ke seluruh
   * kanvas. Dipanggil main.js tiap frame UI kamera (cache per ukuran).
   * @param {{x:number,y:number,w:number,h:number}|null} rect px kanvas; null = seluruh kanvas
   */
  setVideoRect(rect) {
    this._rect = rect ? { x: rect.x, y: rect.y, w: rect.w, h: rect.h } : null;
  }

  /**
   * Dipanggil renderer tiap frame. Membaca slot tangan segar dari controller,
   * lalu menghitung posisi piksel + status grace period.
   * Aman dipanggil walau tangan hilang lama (renderer selalu memanggil ini —
   * deteksi "tangan kembali" harus tetap jalan saat present=false).
   */
  update(dt, w, h) {
    if (this._destroyed) return;
    const slot =
      this._controller && this._controller.hands
        ? this._controller.hands[this.playerId]
        : null;

    if (slot && slot.present) {
      // Tangan terdeteksi: salin status terbaru (slot stabil, dibaca tiap frame).
      this._missing = 0;
      this._nx = slot.x;
      this._ny = slot.y;
      this._pinch = +slot.pinch || 0;
      this._pinching = !!slot.pinching;
      this._present = true;
    } else {
      // Tangan tidak terdeteksi: akumulasi durasi hilang, lalu terapkan grace.
      this._missing += Math.max(0, dt);
      const frozen = this._pinching && this._missing * 1000 <= this._cfg.graceMs;
      this._present = frozen;
      if (!frozen) this._pinching = false;
      // Saat hilang, x/y slot memang membeku di hands.js — kita tidak membaca
      // ulang agar kebal terhadap slot yang berubah posisi saat tidak sah.
    }

    // Mapping ke px kanvas: pakai rect video bila ada (latar penuh), jika tidak
    // seluruh kanvas (perilaku lama — harness & kalibrasi tetap sahih).
    if (this._rect) {
      this._px = this._rect.x + this._nx * this._rect.w;
      this._py = this._rect.y + this._ny * this._rect.h;
    } else {
      this._px = this._nx * w;
      this._py = this._ny * h;
    }
  }

  /** Melepas referensi controller. Idempoten. */
  destroy() {
    this._destroyed = true;
    this._controller = null;
  }
}
