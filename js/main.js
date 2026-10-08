/**
 * main.js — orkestrator EzharQuiz: state machine layar + skor + persistensi.
 *
 * Alur: WELCOME → (CALIBRATION bila mode kamera) → GAME (10 soal) → RESULT
 *  - WELCOME      : input nama P1/P2, mode kontrol (Kamera = default sesuai
 *                   PRD F2 / Keyboard), panel Cara Main, simpan/pulihkan
 *                   localStorage.
 *  - CALIBRATION  : preview kamera besar mirrored + overlay landmark; 2 tangan
 *                   stabil 1,5 detik → LANJUT OTOMATIS ke game (Sprint 7);
 *                   "Main dengan Keyboard" selalu tersedia (ganti mode tanpa reload).
 *  - GAME         : panel pertanyaan + HUD digerakkan callback dari GameRenderer;
 *                   mode kamera: input = HandSource (gesture, Sprint 3) + video
 *                   sebagai LATAR PENUH (Sprint 5 — posisi kursor = posisi tangan
 *                   nyata) + indikator status tangan; mode keyboard:
 *                   KeyboardInputSource (Sprint 1).
 *  - RESULT       : pemenang/seri + confetti + tombol Main Lagi / Ganti Pemain.
 *
 * Skor: +10 per jawaban benar (maks 100 per pemain per sesi) — dihitung di sini,
 * bukan di renderer (sesuai pembagian tanggung jawab implementation-plan).
 *
 * Sprint 2: modul js/hands.js (MediaPipe) HANYA dimuat via dynamic import()
 * saat mode Kamera dipilih — mode keyboard tidak melakukan request jaringan
 * sama sekali. Kegagalan kamera/CDN → notifikasi ramah + auto-switch keyboard.
 * Sprint 3: gameplay gesture penuh — setelah kalibrasi sukses, GameRenderer
 * dibuat dengan sources {1: HandSource, 2: HandSource} yang membaca
 * HandsController; mekanika grab/lock tetap 100% di renderer (paritas F7).
 * Sprint 4: pengawas stream ('ended') — kamera mati di tengah game → sumber
 * input renderer diganti KeyboardInputSource tanpa reload (setSources).
 */

// ?v=7 = cache-busting aset (harus sama dengan versi di index.html). Static
// hosting & server dev sederhana bisa menyajikan modul lama dari cache —
// versi pada SETIAP import internal menjamin satu set aset yang konsisten.
import { loadQuestions, pickRandomQuestions } from './data.js?v=7';
import { GameRenderer, KeyboardInputSource, DEFAULT_KEYMAPS } from './renderer.js?v=7';
import { Confetti, FESTIVE_COLORS } from './confetti.js?v=7';
import { HandSource } from './hand-input.js?v=7';
import { initEditor } from './editor.js?v=7';

/* ---------------- Konstanta ---------------- */

const PLAYER_COLORS = { 1: '#f97316', 2: '#38bdf8' }; // identitas P1/P2 (PRD §7 desain)
const DEFAULT_NAMES = { 1: 'Pemain 1', 2: 'Pemain 2' };
const QUESTIONS_PER_SESSION = 10;
const POINTS_PER_CORRECT = 10;
const CALIB_STABLE_MS = 1500; // 2 tangan harus stabil selama ini di kalibrasi (PRD F6)
const LS_KEYS = { names: 'ezharquiz.names', mode: 'ezharquiz.mode' };

/* ---------------- Referensi DOM ---------------- */

const $ = (id) => document.getElementById(id);

const screens = {
  welcome: $('screen-welcome'),
  calibration: $('screen-calibration'),
  game: $('screen-game'),
  result: $('screen-result'),
  editor: $('screen-editor'),
};

const welcomeForm = $('welcome-form');
const p1NameInput = $('p1-name');
const p2NameInput = $('p2-name');
const welcomeError = $('welcome-error');
const howtoPanel = $('howto-panel');
const btnHowto = $('btn-howto');

const hud = {
  name: { 1: $('hud-p1-name'), 2: $('hud-p2-name') },
  score: { 1: $('hud-p1-score'), 2: $('hud-p2-score') },
};
const questionMeta = $('question-meta');
const questionText = $('question-text');
const questionBox = $('question-box');
const gameCanvas = $('game-canvas');
const gameNotice = $('game-notice');

const result = {
  name: { 1: $('result-p1-name'), 2: $('result-p2-name') },
  score: { 1: $('result-p1-score'), 2: $('result-p2-score') },
  correct: { 1: $('result-p1-correct'), 2: $('result-p2-correct') },
  winner: $('result-winner'),
};
const confettiCanvas = $('confetti-canvas');
const btnPlayAgain = $('btn-play-again');
const btnChangePlayers = $('btn-change-players');
const btnEditor = $('btn-editor');

/* ---- Layar kalibrasi & kamera (Sprint 2) ---- */
const calib = {
  videoSlot: $('calib-video-slot'),
  overlay: $('calib-overlay'),
  loading: $('calib-loading'),
  status: $('calib-status'),
  error: $('calib-error'),
  progressFill: $('calib-progress-fill'),
  chip: { 1: $('calib-chip-p1'), 2: $('calib-chip-p2') },
  btnKeyboard: $('btn-calib-keyboard'),
};
const camBg = { box: $('camera-bg'), overlay: $('bg-overlay') };
const handIndicator = { 1: $('hand-ind-p1'), 2: $('hand-ind-p2') };
const btnStopQuiz = $('btn-stop-quiz');

/* ---------------- State aplikasi ---------------- */

const state = {
  screen: 'welcome',
  bank: null, // bank soal penuh (100 soal)
  names: { 1: '', 2: '' }, // nama tampilan (sudah difallback placeholder)
  mode: 'keyboard',
  scores: { 1: 0, 2: 0 },
  correct: { 1: 0, 2: 0 }, // jumlah jawaban benar per pemain (Sprint 4 — ringkasan RESULT)
  sessionQuestions: 0, // jumlah soal sesi berjalan (denominator ringkasan)
  renderer: null,
  confetti: null,
};

/* ---------------- Util layar ---------------- */

function showScreen(name) {
  state.screen = name;
  for (const [key, el] of Object.entries(screens)) {
    el.hidden = key !== name;
  }
}

/** Nama tampilan: whitespace-only dianggap kosong → fallback placeholder (PRD F2). */
function displayName(raw, playerId) {
  const t = String(raw || '').trim();
  return t || DEFAULT_NAMES[playerId];
}

/* ---------------- localStorage ---------------- */

function restoreWelcomeState() {
  try {
    const savedNames = JSON.parse(localStorage.getItem(LS_KEYS.names) || 'null');
    if (savedNames && typeof savedNames === 'object') {
      p1NameInput.value = savedNames.p1 || '';
      p2NameInput.value = savedNames.p2 || '';
    }
  } catch {
    /* data korup → abaikan, pakai default */
  }
  const savedMode = localStorage.getItem(LS_KEYS.mode);
  // Sprint 3: kedua mode fungsional penuh (gesture & keyboard); tanpa simpanan,
  // default radio di HTML = Kamera (PRD F2).
  if (savedMode === 'camera' || savedMode === 'keyboard') syncModeRadios(savedMode);
}

function saveWelcomeState() {
  localStorage.setItem(
    LS_KEYS.names,
    JSON.stringify({ p1: p1NameInput.value.trim(), p2: p2NameInput.value.trim() })
  );
  localStorage.setItem(LS_KEYS.mode, state.mode);
}

/* ---------------- Alur game ---------------- */

function startGame() {
  hideError();
  if (!state.bank) {
    showError('Bank soal belum termuat. Tunggu sebentar lalu coba lagi.');
    return;
  }
  state.names[1] = displayName(p1NameInput.value, 1);
  state.names[2] = displayName(p2NameInput.value, 2);
  const checked = welcomeForm.querySelector('input[name="control-mode"]:checked');
  state.mode = checked ? checked.value : 'keyboard';
  saveWelcomeState();
  if (state.mode === 'camera') {
    openCalibration(); // async — ke GAME OTOMATIS setelah 2 tangan stabil / fallback keyboard
  } else {
    destroyCamera(); // jaga-jaga bila masih ada sesi kamera lama yang hidup
    beginSession();
  }
}

function beginSession() {
  // Sesi baru: 10 soal acak dari bank, skor reset (Main Lagi = soal diacak ulang).
  const questions = pickRandomQuestions(state.bank, QUESTIONS_PER_SESSION);
  state.scores = { 1: 0, 2: 0 };
  state.correct = { 1: 0, 2: 0 };
  state.sessionQuestions = questions.length;

  // Lepas renderer lama agar tidak bocor listener/rAF (dua kali Main Lagi berturut-turut).
  if (state.renderer) {
    state.renderer.destroy();
    state.renderer = null;
  }
  hideGameNotice();

  updateHud();
  showScreen('game');

  // Sprint 5: mode kamera → video tampil sebagai LATAR PENUH di belakang kanvas
  // (supaya kursor/HUD persis di posisi tangan nyata) + indikator tangan aktif;
  // gameplay dikontrol gesture: sumber input = HandSource yang membaca
  // HandsController (hands.js). Mode keyboard (cam.ctrl mati / mode keyboard)
  // memakai default KeyboardInputSource — renderer tidak peduli asal input
  // (paritas PRD F7).
  const cameraActive = !!cam.ctrl;
  screens.game.classList.toggle('camera-active', cameraActive);
  camBg.box.hidden = !cameraActive;
  if (cameraActive) {
    camBg.box.insertBefore(cam.video, camBg.box.firstChild); // video paling bawah
    cam.ctrl.setPaused(false); // resume bila tadi dijeda di layar RESULT
    cam._lastIndicatorState = null;
    cam._lastVideoRectKey = '';
    startCameraUiLoop();
    attachCameraHealthWatch(); // Sprint 4: deteksi kamera mati di tengah sesi
  }

  state.renderer = new GameRenderer(gameCanvas, {
    // Sumber input gesture hanya dibuat bila controller tangan hidup
    // (kalibrasi sukses / kamera masih aktif saat Main Lagi).
    sources: cameraActive
      ? { 1: new HandSource(1, cam.ctrl), 2: new HandSource(2, cam.ctrl) }
      : undefined, // undefined → default KeyboardInputSource per pemain
    players: [
      { id: 1, name: state.names[1], color: PLAYER_COLORS[1] },
      { id: 2, name: state.names[2], color: PLAYER_COLORS[2] },
    ],
    onQuestionStart: ({ index, total, category, question }) => {
      questionMeta.textContent = `Soal ${index + 1}/${total} · ${category}`;
      questionText.textContent = question;
      // Sprint 4: transisi panel pertanyaan — mainkan ulang animasi masuk.
      questionBox.classList.remove('q-in');
      void questionBox.offsetWidth; // paksa reflow agar animasi bisa restart
      questionBox.classList.add('q-in');
    },
    onQuestionEnd: ({ results }) => {
      for (const pid of [1, 2]) {
        if (results[pid] && results[pid].correct) {
          state.scores[pid] += POINTS_PER_CORRECT;
          state.correct[pid] += 1; // Sprint 4 — ringkasan "x/10 benar" di RESULT
          popScore(pid);
        }
      }
      updateHud();
    },
    onSessionEnd: () => {
      showResult();
    },
  });
  state.renderer.startSession(questions); // renderer membuka sesi dengan countdown 3-2-1
}

function updateHud() {
  for (const pid of [1, 2]) {
    hud.name[pid].textContent = state.names[pid];
    hud.score[pid].textContent = String(state.scores[pid]);
  }
}

/** Animasi "pop" kecil pada angka skor HUD saat bertambah (Sprint 4). */
function popScore(pid) {
  const el = hud.score[pid];
  el.classList.remove('score-pop');
  void el.offsetWidth; // paksa reflow agar animasi bisa restart
  el.classList.add('score-pop');
}

/* ---------------- Layar hasil ---------------- */

/** @returns {0|1|2} 0 = seri, 1/2 = id pemain pemenang */
function decideWinner() {
  if (state.scores[1] === state.scores[2]) return 0;
  return state.scores[1] > state.scores[2] ? 1 : 2;
}

function showResult() {
  // Renderer sudah selesai (phase idle) — bersihkan agar listener keyboard lepas.
  if (state.renderer) {
    state.renderer.destroy();
    state.renderer = null;
  }

  // Kamera: jeda deteksi di layar hasil (hemat CPU); Main Lagi melanjutkannya.
  if (cam.ctrl) cam.ctrl.setPaused(true);
  stopCameraUiLoop();
  hideGameNotice();

  const winner = decideWinner();
  for (const pid of [1, 2]) {
    result.name[pid].textContent = state.names[pid];
    result.score[pid].textContent = String(state.scores[pid]);
    // Sprint 4: ringkasan jumlah benar per pemain ("7/10 benar").
    result.correct[pid].textContent = `${state.correct[pid]}/${state.sessionQuestions} benar`;
  }
  result.winner.textContent =
    winner === 0 ? '🤝 SERI!' : `🏆 ${state.names[winner]} MENANG!`;

  showScreen('result');

  if (!state.confetti) state.confetti = new Confetti(confettiCanvas);
  state.confetti.setPalette(buildResultPalette(winner));
  state.confetti.start();
}

/**
 * Palet confetti: warna identitas pemenang dominan; seri → dua warna identitas
 * (PRD F5). Entri ganda = bobot probabilitas lebih besar.
 */
function buildResultPalette(winner) {
  const c1 = PLAYER_COLORS[1];
  const c2 = PLAYER_COLORS[2];
  if (winner === 0) return [c1, c1, c1, c2, c2, c2, ...FESTIVE_COLORS];
  const wc = PLAYER_COLORS[winner];
  return [wc, wc, wc, wc, wc, ...FESTIVE_COLORS];
}

function playAgain() {
  // Main Lagi: nama & mode tetap, soal diacak ulang, skor reset.
  stopConfetti();
  beginSession();
}

/**
 * Tombol "Stop Kuis" (Sprint 5): akhiri sesi yang sedang berjalan.
 *  - ≥1 soal selesai → layar RESULT dengan skor sementara (denominator ringkasan
 *    "x/N benar" disesuaikan ke jumlah soal yang benar-benar selesai).
 *  - belum ada satu soal pun selesai (masih countdown/soal pertama) → tidak ada
 *    yang bisa dilaporkan → kembali ke WELCOME.
 */
function stopQuiz() {
  if (!state.renderer) return;
  const r = state.renderer;
  const completed = Math.max(0, r.qIndex + (r.phase === 'reveal' ? 1 : 0));
  if (completed >= 1) {
    state.sessionQuestions = completed;
    showResult();
  } else {
    changePlayers();
  }
}

function changePlayers() {
  // Ganti Pemain: kembali ke WELCOME (input masih berisi nama terakhir).
  stopConfetti();
  destroyCamera(); // matikan kamera sepenuhnya (privasinya dihormati)
  if (state.renderer) {
    state.renderer.destroy();
    state.renderer = null;
  }
  hideGameNotice();
  hideError();
  showScreen('welcome');
}

function stopConfetti() {
  if (state.confetti) state.confetti.stop();
}

/* ---------------- Kamera & deteksi tangan (Sprint 2) ----------------
 * js/hands.js (MediaPipe) HANYA dimuat dynamic import saat mode Kamera
 * dipilih — mode keyboard tidak melakukan request jaringan sama sekali
 * (PRD §8). Hasil deteksi dipakai untuk kalibrasi, overlay debug PiP,
 * indikator status tangan di HUD, dan (Sprint 3) sumber input gameplay
 * gesture via HandSource (js/hand-input.js).
 */

const cam = {
  module: null, // modul hands.js (cache hasil dynamic import)
  ctrl: null, // HandsController aktif (null = kamera mati)
  video: null, // elemen <video> tunggal, dipindah kalibrasi ↔ PiP
  uiRaf: 0, // loop UI overlay/indikator (terpisah dari game loop & loop deteksi)
  stability: null, // akumulator "2 tangan stabil" layar kalibrasi
  _autoStarted: false, // guard lanjut-otomatis kalibrasi (Sprint 7 — sekali saja)
  flowSeq: 0, // token pembatalan alur async (mis. tombol ditekan saat loading)
  noticeTimer: 0, // timeout auto-hide notifikasi GAME (Sprint 4 — anti leak)
  _onStreamEnded: null, // handler 'ended' track/video (Sprint 4 — kamera mati)
  _streamDead: false, // guard agar notifikasi kamera mati hanya sekali
  _lastChipState: null,
  _lastIndicatorState: null,
  _lastVideoRectKey: '', // cache rect letterbox video (Sprint 5 — latar penuh)
  _lastVideoRect: null,
};

/** Elemen video kamera dibuat SEKALI & dipakai berulang (reparent ≠ putus stream). */
function ensureCameraVideo() {
  if (!cam.video) {
    const v = document.createElement('video');
    v.className = 'camera-video';
    v.autoplay = true;
    v.muted = true;
    v.setAttribute('playsinline', '');
    cam.video = v;
  }
  return cam.video;
}

/** Memuat (dan meng-cache) modul hands.js — hanya pernah dipanggil mode kamera. */
async function loadHandsModule() {
  if (!cam.module) cam.module = await import('./hands.js?v=6');
  return cam.module;
}

/** Menandai radio mode di WELCOME sesuai nilai (dipakai restore & fallback). */
function syncModeRadios(mode) {
  const radio = welcomeForm.querySelector(`input[name="control-mode"][value="${mode}"]`);
  if (radio) radio.checked = true;
}

/** Auto-fallback: paksa mode keyboard, simpan, dan sinkronkan radio di WELCOME. */
function switchToKeyboardMode() {
  state.mode = 'keyboard';
  saveWelcomeState();
  syncModeRadios('keyboard');
}

/** Membuka layar kalibrasi: mulai kamera + deteksi (semua kegagalan ditangani). */
async function openCalibration() {
  const flow = ++cam.flowSeq;
  showScreen('calibration');
  cam._autoStarted = false;
  calib.error.hidden = true;
  calib.loading.hidden = false;
  calib.loading.textContent = 'Menyiapkan kamera…';
  calib.status.textContent = 'Menunggu kamera aktif…';
  calib.videoSlot.dataset.aspectSet = '';
  setCalibProgress(0);
  updateCalibChips({ 1: false, 2: false });

  const video = ensureCameraVideo();
  calib.videoSlot.insertBefore(video, calib.videoSlot.firstChild); // di bawah overlay

  try {
    const hands = await loadHandsModule();
    if (flow !== cam.flowSeq) return;
    calib.loading.textContent = 'Memuat pustaka deteksi tangan…';
    cam.stability = hands.createStabilityTracker({ requiredMs: CALIB_STABLE_MS });
    cam.ctrl = await hands.initHands(video, {});
    attachCameraHealthWatch(); // Sprint 4: kamera bisa mati kapan saja setelah ini
  } catch (err) {
    if (flow !== cam.flowSeq) return;
    handleCameraFailure(err);
    return;
  }
  if (flow !== cam.flowSeq) {
    // Dibatalkan selama menunggu → bersihkan controller yang baru saja jadi.
    if (cam.ctrl) {
      cam.ctrl.destroy();
      cam.ctrl = null;
    }
    return;
  }
  calib.loading.hidden = true;
  calib.status.textContent = 'Angkat kedua tangan menghadap kamera.';
  startCameraUiLoop();
}

/** Kamera/CDN gagal → notifikasi ramah + auto-switch keyboard (game tetap jalan). */
function handleCameraFailure(err) {
  console.error('[EzharQuiz] Kamera gagal diaktifkan:', err);
  const msg = err && err.friendly ? err.message : 'Kamera tidak dapat diaktifkan.';
  calib.error.textContent = `${msg} Game dilanjutkan dengan keyboard…`;
  calib.error.hidden = false;
  calib.loading.hidden = true;
  switchToKeyboardMode();
  const flow = cam.flowSeq;
  window.setTimeout(() => {
    if (flow !== cam.flowSeq) return;
    beginSession();
  }, 3200);
}

/** Kalibrasi selesai (2 tangan stabil 1,5 dtk → LANJUT OTOMATIS, Sprint 7):
 *  masuk ke GAME dengan kamera tetap hidup. */
function continueFromCalibration() {
  if (!cam.ctrl || state.screen !== 'calibration') return;
  stopCameraUiLoop(); // direstart oleh beginSession setelah layar GAME tampil
  beginSession();
}

/** Tombol "Main dengan Keyboard": matikan kamera, ganti mode tanpa reload. */
function calibrationFallbackToKeyboard() {
  destroyCamera();
  switchToKeyboardMode();
  beginSession();
}

/** Memberhentikan kamera + loop UI + deteksi sepenuhnya. */
function destroyCamera() {
  cam.flowSeq++; // batalkan openCalibration/handleCameraFailure yang sedang melayang
  detachCameraHealthWatch();
  stopCameraUiLoop();
  if (cam.ctrl) {
    cam.ctrl.destroy();
    cam.ctrl = null;
  }
  if (cam.video) cam.video.remove();
  camBg.box.hidden = true;
  screens.game.classList.remove('camera-active');
  cam.stability = null;
  cam._lastChipState = null;
  cam._lastIndicatorState = null;
  cam._streamDead = false;
}

/* ----- Sprint 4: kamera mati di tengah jalan (track 'ended' / video 'ended') ----- */

/**
 * Memasang pengawas kesehatan stream: track video yang berakhir (kamera
 * dicabut/diambil alih OS) atau elemen video 'ended' → handleCameraStreamEnded.
 * Dipanggil setiap kali controller kamera baru berhasil dibuat.
 */
function attachCameraHealthWatch() {
  detachCameraHealthWatch(); // jangan pernah dobel
  cam._streamDead = false;
  const stream = cam.ctrl && cam.ctrl.stream;
  const video = cam.video;
  if (!stream && !video) return;
  cam._onStreamEnded = () => handleCameraStreamEnded();
  if (stream) {
    for (const t of stream.getTracks()) t.addEventListener('ended', cam._onStreamEnded);
  }
  if (video) video.addEventListener('ended', cam._onStreamEnded); // pengaman tambahan
}

function detachCameraHealthWatch() {
  if (!cam._onStreamEnded) return;
  const stream = cam.ctrl && cam.ctrl.stream;
  if (stream) {
    for (const t of stream.getTracks()) {
      try {
        t.removeEventListener('ended', cam._onStreamEnded);
      } catch {
        /* abaikan */
      }
    }
  }
  if (cam.video) cam.video.removeEventListener('ended', cam._onStreamEnded);
  cam._onStreamEnded = null;
}

/**
 * Kamera terputus DI TENGAH sesi (Sprint 4 — edge case):
 *  - di layar GAME   : matikan kamera, ganti sumber input renderer menjadi
 *                      KeyboardInputSource (TANPA reload — skor & soal berjalan
 *                      lanjut), tampilkan notifikasi.
 *  - di kalibrasi    : jalur gagal-kamera yang sudah ada (pesan + auto keyboard).
 *  - di layar lain   : cukup matikan kamera (sesi berikutnya otomatis keyboard).
 */
function handleCameraStreamEnded() {
  if (!cam.ctrl || cam._streamDead) return; // sudah ditangani / memang dibongkar
  cam._streamDead = true;
  console.warn('[EzharQuiz] Stream kamera berakhir di tengah sesi.');

  if (state.screen === 'game' && state.renderer) {
    switchGameInputToKeyboard();
    showGameNotice('Kamera terputus — permainan dilanjutkan dengan keyboard.');
  } else if (state.screen === 'calibration') {
    const err = new Error('Kamera terputus saat kalibrasi.');
    err.friendly = true;
    destroyCamera();
    handleCameraFailure(err); // pesan ramah + auto lanjut keyboard
  } else {
    destroyCamera();
  }
}

/** Menukar sumber input sesi berjalan dari gesture → keyboard (tanpa reload). */
function switchGameInputToKeyboard() {
  destroyCamera(); // matikan controller + PiP + indikator tangan
  switchToKeyboardMode();
  if (state.renderer) {
    state.renderer.setSources({
      1: new KeyboardInputSource(1, DEFAULT_KEYMAPS[1]),
      2: new KeyboardInputSource(2, DEFAULT_KEYMAPS[2]),
    });
  }
}

/** Notifikasi kecil di atas arena GAME (Sprint 4) — auto-hide ±6 detik. */
function showGameNotice(msg) {
  gameNotice.textContent = msg;
  gameNotice.hidden = false;
  if (cam.noticeTimer) window.clearTimeout(cam.noticeTimer);
  cam.noticeTimer = window.setTimeout(() => hideGameNotice(), 6000);
}

function hideGameNotice() {
  if (cam.noticeTimer) {
    window.clearTimeout(cam.noticeTimer);
    cam.noticeTimer = 0;
  }
  gameNotice.hidden = true;
}

/* ----- loop UI kamera (overlay + indikator; terpisah dari game loop) ----- */

function startCameraUiLoop() {
  if (cam.uiRaf) return;
  let lastTs = performance.now();
  const tick = (ts) => {
    cam.uiRaf = requestAnimationFrame(tick);
    const dt = Math.min((ts - lastTs) / 1000, 0.1); // clamp agar stabil
    lastTs = ts;
    if (!cam.ctrl) {
      stopCameraUiLoop();
      return;
    }
    if (state.screen === 'calibration') updateCalibrationUi(dt);
    else if (state.screen === 'game') updateGameCameraUi();
  };
  cam.uiRaf = requestAnimationFrame(tick);
}

function stopCameraUiLoop() {
  if (cam.uiRaf) cancelAnimationFrame(cam.uiRaf);
  cam.uiRaf = 0;
}

/** UI kalibrasi per frame: chip status, progress stabil, teks, overlay landmark. */
function updateCalibrationUi(dt) {
  const ctrl = cam.ctrl;
  syncVideoAspect(calib.videoSlot, cam.video);
  const present = { 1: ctrl.hands[1].present, 2: ctrl.hands[2].present };
  updateCalibChips(present);

  const st = cam.stability.update(present[1] && present[2], dt * 1000);
  setCalibProgress(st.progress);

  // Sprint 7: 2 tangan stabil 1,5 detik → masuk GAME OTOMATIS (tanpa tombol).
  if (st.stable) {
    if (!cam._autoStarted) {
      cam._autoStarted = true;
      calib.status.textContent = 'Siap! Kedua tangan stabil — memulai permainan…';
      continueFromCalibration();
    }
    return; // layar sedang berganti — jangan gambar overlay lagi
  }

  let text;
  if (present[1] && present[2]) {
    text = 'Dua tangan terdeteksi — tahan posisi…';
  } else if (ctrl.unassigned && ctrl.unassigned.present) {
    text = 'Satu tangan terdeteksi — pemain kedua ikut mengangkat tangan.';
  } else {
    text = 'Belum ada tangan terdeteksi — angkat tangan menghadap kamera.';
  }
  calib.status.textContent = text;

  drawCameraOverlay(calib.overlay, ctrl, { big: true });
}

/** UI kamera di GAME per frame: overlay rangka tangan di latar penuh + indikator
 *  tangan HUD + sinkronisasi rect video → HandSource (agar kursor = posisi tangan). */
function updateGameCameraUi() {
  const ctrl = cam.ctrl;
  const rect = computeVideoRect();
  if (rect) {
    // Push rect ke sumber input gesture (kursor digambar di posisi tangan NYATA).
    for (const pid of [1, 2]) {
      const src = state.renderer && state.renderer.sources[pid];
      if (src && typeof src.setVideoRect === 'function') src.setVideoRect(rect);
    }
  }
  drawCameraOverlay(camBg.overlay, ctrl, { light: true, rect });

  const key = `${ctrl.hands[1].present ? '1' : '0'}${ctrl.hands[2].present ? '1' : '0'}`;
  if (cam._lastIndicatorState !== key) {
    cam._lastIndicatorState = key;
    for (const pid of [1, 2]) {
      handIndicator[pid].classList.toggle('is-ok', ctrl.hands[pid].present);
    }
  }
}

/**
 * Rect video yang benar-benar terlihat di dalam area bermain (letterbox
 * object-fit: contain). Koordinat tangan 0..1 dipetakan ke rect INI, bukan ke
 * seluruh kanvas, sehingga kursor/HUD jatuh persis pada tangan di layar.
 * @returns {{x:number,y:number,w:number,h:number}|null} null bila video belum siap.
 */
function computeVideoRect() {
  const v = cam.video;
  if (!v || !v.videoWidth || !v.videoHeight) return null;
  const areaW = camBg.box.clientWidth;
  const areaH = camBg.box.clientHeight;
  if (areaW < 2 || areaH < 2) return null;
  const key = `${v.videoWidth}x${v.videoHeight}@${areaW}x${areaH}`;
  if (cam._lastVideoRectKey === key) return cam._lastVideoRect;
  const scale = Math.min(areaW / v.videoWidth, areaH / v.videoHeight);
  const w = v.videoWidth * scale;
  const h = v.videoHeight * scale;
  const rect = { x: (areaW - w) / 2, y: (areaH - h) / 2, w, h };
  cam._lastVideoRectKey = key;
  cam._lastVideoRect = rect;
  return rect;
}

function updateCalibChips(present) {
  const key = `${present[1] ? '1' : '0'}${present[2] ? '1' : '0'}`;
  if (cam._lastChipState === key) return;
  cam._lastChipState = key;
  for (const pid of [1, 2]) {
    calib.chip[pid].classList.toggle('is-ok', present[pid]);
  }
}

function setCalibProgress(ratio) {
  calib.progressFill.style.width = `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`;
}

/** Samakan aspek kotak video dengan stream asli agar overlay 1:1 dengan gambar. */
function syncVideoAspect(container, video) {
  if (!video || !video.videoWidth) return;
  const key = `${video.videoWidth}x${video.videoHeight}`;
  if (container.dataset.aspectSet === key) return;
  container.dataset.aspectSet = key;
  container.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
}

/** Gambar overlay landmark (debug) di atas preview kalibrasi / latar GAME.
 *  `opts.rect` (Sprint 5): rect letterbox video — rangka tangan digambar di
 *  posisi yang sama dengan tangan NYATA di latar penuh. */
function drawCameraOverlay(canvas, ctrl, opts = {}) {
  if (!cam.module) return;
  const { drawHandSkeleton } = cam.module;
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, canvas.clientWidth);
  const h = Math.max(1, canvas.clientHeight);
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const rect = opts.rect || { x: 0, y: 0, w, h };
  const lineWidth = opts.light ? 1.4 : 2.6;
  const dotRadius = opts.light ? 1.8 : 3.2;
  const draw = (hand, color, label) => {
    ctx.save();
    ctx.translate(rect.x, rect.y);
    drawHandSkeleton(ctx, hand, {
      color,
      width: rect.w,
      height: rect.h,
      lineWidth,
      dotRadius,
      label,
    });
    ctx.restore();
  };
  for (const pid of [1, 2]) {
    const hand = ctrl.hands[pid];
    if (hand.present) draw(hand, PLAYER_COLORS[pid], opts.light ? null : `P${pid}`);
  }
  const lone = ctrl.unassigned;
  if (lone && lone.present) draw(lone, '#e2e8f0', opts.light ? null : '?');
}

/* ---------------- Pesan error kecil di WELCOME ---------------- */

function showError(msg) {
  welcomeError.textContent = msg;
  welcomeError.hidden = false;
}
function hideError() {
  welcomeError.hidden = true;
}

/* ---------------- Wiring event ---------------- */

welcomeForm.addEventListener('submit', (e) => {
  e.preventDefault();
  startGame();
});

btnHowto.addEventListener('click', () => {
  howtoPanel.hidden = !howtoPanel.hidden;
  btnHowto.textContent = howtoPanel.hidden ? 'Cara Main' : 'Tutup';
});

btnPlayAgain.addEventListener('click', playAgain);
btnChangePlayers.addEventListener('click', changePlayers);
btnStopQuiz.addEventListener('click', stopQuiz);
calib.btnKeyboard.addEventListener('click', calibrationFallbackToKeyboard);

/* ---------------- Editor Quiz (Sprint 6) ----------------
 * Layar editor dibuka dari WELCOME, dilindungi gerbang password di dalam
 * editor.js (default "12345", pemakaian pertama wajib ganti). Bank hasil
 * simpan langsung dipakai sesi game berikutnya tanpa reload.
 */
const editor = initEditor({
  onExit: () => showScreen('welcome'),
  setBank: (questions) => {
    state.bank = questions; // sesi game berikutnya memakai bank hasil edit
  },
});
btnEditor.addEventListener('click', () => {
  showScreen('editor');
  editor.open();
});

/* ---------------- Init ---------------- */

restoreWelcomeState();
showScreen('welcome');

// Hook debug/QA: hanya aktif dengan `?debug` pada URL. Dipakai pengujian otomatis
// (membaca state internal) dan QA manual sprint berikutnya — tidak memengaruhi
// jalannya game normal sama sekali. `cam.ctrl` = HandsController (Sprint 2).
if (new URLSearchParams(location.search).has('debug')) {
  window.__ezharQuiz = { state, cam };
}

loadQuestions()
  .then((bank) => {
    state.bank = bank;
  })
  .catch((err) => {
    console.error('[EzharQuiz] Gagal memuat bank soal:', err);
    showError(
      'Gagal memuat bank soal. Pastikan game dijalankan lewat server lokal ' +
        '(mis. Live Server atau python3 -m http.server), bukan dibuka langsung sebagai file.'
    );
  });
