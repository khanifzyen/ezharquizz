/**
 * confetti.js — sistem partikel confetti custom (tanpa library) untuk layar RESULT.
 *
 * Perilaku (PRD F5):
 *  - ±150 partikel jatuh berputar dengan sway (oleng kiri-kanan), loop 60fps
 *    via requestAnimationFrame, tidak memblokir UI (canvas terpisah).
 *  - Warna dari "palet": array warna yang boleh berulang — entri yang sering
 *    muncul berarti probabilitas lebih tinggi. main.js membangun palet dengan
 *    warna identitas pemenang dominan (seri → dua warna identitas).
 *
 * API:
 *  const c = new Confetti(canvasEl);
 *  c.setPalette(['#f97316', '#f97316', '#38bdf8', ...]);
 *  c.start();  // hujan confetti kontinu (partikel didaur ulang)
 *  c.stop();   // bekukan & bersihkan canvas
 *  c.destroy(); // stop + lepas listener resize
 */

const PARTICLE_COUNT = 150;
const DPR_MAX = 2;

/** Warna-warna festif tambahan (di luar warna identitas pemain). */
export const FESTIVE_COLORS = ['#fbbf24', '#f43f5e', '#a78bfa', '#34d399', '#f472b6', '#facc15'];

export class Confetti {
  /** @param {HTMLCanvasElement} canvas elemen canvas overlay (pointer-events: none) */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.palette = FESTIVE_COLORS.slice();
    this.particles = [];
    this._raf = null;
    this._running = false;
    this._lastTs = 0;
    this._elapsed = 0;

    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
    this._resize();
  }

  /**
   * Set palet warna. Array boleh mengandung warna berulang sebagai bobot.
   * @param {string[]} colors
   */
  setPalette(colors) {
    this.palette = colors && colors.length ? colors.slice() : FESTIVE_COLORS.slice();
  }

  /** Mulai hujan confetti (aman dipanggil berulang). */
  start() {
    if (this._running) return;
    this._running = true;
    this._spawnAll();
    this._lastTs = performance.now();
    const tick = (ts) => {
      if (!this._running) return;
      const dt = Math.min((ts - this._lastTs) / 1000, 0.05);
      this._lastTs = ts;
      this._elapsed += dt;
      this._update(dt);
      this._draw();
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  /** Berhenti & bersihkan canvas. */
  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this.particles = [];
    this.ctx.clearRect(0, 0, this.W, this.H);
  }

  /** stop() + lepas listener resize. */
  destroy() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
  }

  /* ---------------- internal ---------------- */

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
    const rect = this.canvas.getBoundingClientRect();
    this.W = Math.max(1, rect.width);
    this.H = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _pickColor() {
    return this.palette[Math.floor(Math.random() * this.palette.length)];
  }

  _makeParticle(initialBurst) {
    return {
      x: Math.random() * this.W,
      // Saat pertama start, sebar di seluruh tinggi agar layar langsung ramai.
      y: initialBurst ? Math.random() * this.H : -20 - Math.random() * 60,
      w: 7 + Math.random() * 6,
      h: 4 + Math.random() * 5,
      color: this._pickColor(),
      vy: 130 + Math.random() * 160, // kecepatan jatuh px/s
      vx: (Math.random() * 2 - 1) * 30,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() * 2 - 1) * 7, // kecepatan putar rad/s
      swayAmp: 25 + Math.random() * 45, // amplitudo oleng horizontal
      swayFreq: 1 + Math.random() * 1.6,
      phase: Math.random() * Math.PI * 2,
    };
  }

  _spawnAll() {
    this.particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.particles.push(this._makeParticle(true));
    }
  }

  _update(dt) {
    for (const p of this.particles) {
      p.y += p.vy * dt;
      p.x += p.vx * dt + Math.sin(this._elapsed * p.swayFreq + p.phase) * p.swayAmp * dt;
      p.rot += p.vr * dt;
      if (p.y > this.H + 24) {
        // Daur ulang ke atas agar hujan berkesinambungan.
        Object.assign(p, this._makeParticle(false));
      }
    }
  }

  _draw() {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.W, this.H);
    for (const p of this.particles) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, 0.4 + 0.6 * Math.abs(Math.sin(p.rot * 1.7 + p.phase))); // kesan kertas berputar
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
  }
}
