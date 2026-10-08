# Sprint 2 — Kamera & Deteksi Tangan (Belum Mengontrol Game)
Status: Selesai
Rentang: 2026-10-06

## Ringkasan
Modul baru `js/hands.js` menyalakan kamera + MediaPipe HandLandmarker (CDN, dynamic
import hanya di mode Kamera) dengan layar CALIBRATION (2 tangan stabil 1,5 detik →
tombol Lanjut), video PiP mirrored di layar GAME, overlay debug rangka 21 landmark,
dan indikator status tangan hijau/merah di HUD. Gameplay tetap `KeyboardInputSource`
(seperti scope: kontrol gesture adalah Sprint 3). Sprint ini dikerjakan dua tahap:
sebagian besar kode ditulis subagent sprint-2 sebelumnya yang terputus di tengah jalan;
subagent lanjutan (penulis laporan ini) meng-audit seluruh implementasi item-per-item
terhadap implementation-plan, memperbaiki 3 bug nyata, membuat & menjalankan harness
uji logika murni (71 asersi lulus), dan menulis laporan ini. Status keseluruhan
dilaporkan apa adanya: kode inti dari subagent pertama, perbaikan + verifikasi dari
subagent kedua.

## Yang Dikerjakan
Audit terhadap scope Sprint 2 (implementation-plan), item per item — semua terpenuhi:
- [x] **Scope 1 — `js/hands.js` dynamic import CDN**: `@mediapipe/tasks-vision@0.10.14`
      (jsdelivr, URL sama persis dengan plan; WASM `/wasm`; model `hand_landmarker.task`
      float16/1), `runningMode: 'VIDEO'`, `numHands: 2`, delegate GPU dengan fallback
      CPU saat `createFromOptions` gagal, plus fallback runtime ke CPU bila
      `detectForVideo` gagal 3× berulang (pengaman ekstra untuk driver GPU bermasalah).
- [x] **Scope 2 — getUserMedia & PiP mirrored**: `facingMode:'user'`, ideal 1280×720;
      elemen `<video>` tunggal di-reparent antara slot kalibrasi (besar) dan PiP pojok
      kanan-bawah layar GAME; mirror via CSS `transform: scaleX(-1)`; semua kegagalan
      (izin ditolak / kamera absen / dipakai app lain / konteks insecure / CDN gagal)
      dibungkus `Error` bertanda `.friendly` berpesan Indonesia → notifikasi + auto
      switch ke mode keyboard.
- [x] **Scope 3 — loop deteksi terpisah**: rAF sendiri di `HandsController._tick`
      (dedupe `video.currentTime`, timestamp strictly-increasing), TERPISAH dari game
      loop renderer dan dari loop UI overlay; posisi di-smoothing EMA α = 0,4.
- [x] **Scope 4 — kontrak output tangan**: `{playerId, present, x 0..1 (MIRRORED 1−x,
      titik jepit tengah 4↔8), y 0..1, pinch 0..1, pinching, landmarks[21] (mirrored +
      EMA), trackId}`; `pinch = 1 − clamp(dist(4,8)/(0.5·dist(0,9)))`; hysteresis
      ON < 0,45 / OFF > 0,6. (Bug ditemukan & diperbaiki — lihat bawah.)
- [x] **Scope 5 — layar CALIBRATION**: preview besar + overlay landmark berlabel P1/P2,
      instruksi sisi kiri/kanan, chip status per pemain, progress bar; 2 tangan stabil
      1,5 detik (`createStabilityTracker`, reset penuh bila sejenak tidak 2 tangan)
      → tombol Lanjut aktif; assignment dihitung ULANG tiap frame dari sisi frame
      (x mirrored terkecil = P1), bukan sekali di awal; tangan tunggal → slot
      `unassigned` dengan `playerId = null`; tombol "Main dengan Keyboard" selalu ada.
- [x] **Scope 6 — overlay debug + HUD**: `drawHandSkeleton` menggambar 21 landmark +
      garis koneksi (versi ringan di PiP, versi label P1/P2/"?" di kalibrasi);
      indikator "Tangan" hijau/merah di HUD layar GAME (hanya tampil saat kamera aktif).
- [x] **Scope 7 — flow main.js**: WELCOME → CALIBRATION → GAME (mode kamera) atau
      langsung GAME (keyboard); mode tersimpan/ dipulihkan `ezharquiz.mode`.
- [x] **DoD audit statis**: mode keyboard tidak pernah menyentuh hands.js/MediaPipe —
      `import('./hands.js')` hanya di `loadHandsModule()`, hanya dipanggil
      `openCalibration()` (jalur mode kamera saja); `renderer.js` tidak diubah sama
      sekali (masih `KeyboardInputSource` — benar untuk Sprint 2).

## File Dibuat/Diubah
- `js/hands.js` (BARU, ±740 baris) — seluruh lapisan kamera/deteksi: konstanta
  `HANDS_CONFIG`, helper murni (`ema`, `mirrorLandmarks`, `pinchPoint`,
  `computePinchRatio`, `pinchStrength`, `applyPinchHysteresis`,
  `createStabilityTracker`, `handsSignature`), `HandTracker` (pencocokan track
  antar-frame nearest-neighbor + EMA + assignment per frame), `HandsController`
  (loop deteksi, slot output per pemain, lifecycle), `initHands(videoEl, options)`
  (CDN + GPU/CPU + getUserMedia), `drawHandSkeleton` (overlay debug).
- `js/main.js` — flow WELCOME→CALIBRATION→GAME, orkestrasi kamera (`cam` state,
  video tunggal di-reparent kalibrasi↔PiP, loop UI overlay/indikator terpisah),
  fallback keyboard otomatis saat gagal, jeda deteksi di layar RESULT, pembersihan
  menyeluruh di "Ganti Pemain".
- `index.html` — section CALIBRATION (chip, slot video, overlay, progress, status,
  tombol Lanjut/Main dengan Keyboard), PiP + overlay di layar GAME, indikator tangan
  di HUD, radio mode Kamera di WELCOME (badge "uji kalibrasi").
- `css/style.css` — styling layar kalibrasi, chip/indikator hijau-merah, video
  mirrored `scaleX(-1)`, PiP, progress bar.
- `docs/sprint/sprint-2.md` — laporan ini.
- Tidak diubah: `js/renderer.js`, `js/data.js`, `js/confetti.js`, `data/questions.json`.
- **Provenance (jujur):** file-file di atas pada dasarnya ditulis oleh subagent
  sprint-2 pertama yang terputus (implementasi sudah lolos `node --check` saat
  ditemukan). Subagent kedua (penulis laporan) tidak me-rewrite, melainkan
  meng-audit, memperbaiki 3 bug (di `hands.js`), dan memverifikasi ulang semuanya.

## Keputusan Desain & Deviasi dari Plan
- **Radio "Kamera" di WELCOME diaktifkan di Sprint 2** (badge "uji kalibrasi"),
  padahal plan menempatkan "aktifkan opsi Kamera" di Sprint 3 poin 5. Deviasi ini
  disengaja dan kecil: layar kalibrasi (scope Sprint 2) tidak bisa diuji tanpa cara
  memilih mode kamera. Gameplay TETAP keyboard; Sprint 3 tinggal mengganti badge dan
  menjadikan Kamera default sesuai PRD.
- **Rasio jepit dihitung dari landmark RAW, EMA hanya untuk posisi** (perbaikan bug,
  lihat bawah). Plan menyebut EMA untuk "smoothing posisi"; menghitung rasio dari
  landmark ter-EMA terbukti menunda ON/OFF jepit ±4 frame di atas hysteresis
  (melanggar PRD F6 < 100 ms). Anti-flapping jepit memang sudah tugas hysteresis.
- **Konstanta tambahan di `HANDS_CONFIG`** (tidak disebut plan, dibutuhkan robustness):
  `graceMs: 150` (tangan hilang sesaat tetap present — anti-flicker indikator),
  `forgetMs: 900` (track hangus & smoothing direset setelah hilang lama),
  `matchDist: 0.28` (radius pencocokan track antar-frame pada titik jepit).
- **Saat tangan hilang, `x`/`y` slot membeku di posisi terakhir** (`present=false`
  tetap penanda sahnya) — disiapkan untuk grace period 1,5 detik Sprint 3 (PRD F6).
- **Slot output stabil & dimutasi in-place** (`controller.hands[1/2]` tidak pernah
  diganti objeknya) agar konsumen bisa memegang referensi tanpa GC churn per frame;
  konsekuensinya konsumen harus membaca nilai tiap frame, tidak menyalin sekali.
- **Fallback CPU dua lapis**: saat pembuatan landmarker (plan) DAN saat
  `detectForVideo` gagal berulang saat runtime (kasus driver GPU rusak setelah init
  sukses) — pengaman praktis yang ditemui umum di lapangan.
- **Tiga loop terpisah**: game loop renderer (60fps), loop deteksi (`_tick`, ikut
  fps video), loop UI overlay/indikator (`cam.uiRaf` di main.js) — sesuai NFR
  "deteksi 15–30fps, game tetap 60fps".
- **Deteksi dijeda di layar RESULT** (`setPaused(true)`, kamera tetap hidup) dan
  dimatikan penuh di "Ganti Pemain" (`destroy()` + elemen video dihapus) — hemat
  CPU dan menghormati privasi.

## Cara Test Manual
**A. Otomatis (sudah dijalankan penulis sprint — 71/71 asersi LULUS):**
`node /tmp/ezq-hands-test.mjs` — harness ephemeral (tidak disimpan di project) yang
mengimpor bagian murni `hands.js` dan menguji: konvergensi `ema`, `mirrorLandmarks`
(x'=1−x, tidak termutasi, dua kali mirror = identitas), `computePinchRatio`/
`pinchStrength`/`applyPinchHysteresis` (terbuka tidak jepit → jepit kuat ON → sedikit
terbuka TETAP ON → terbuka lebar OFF; batas tepat 0,45/0,6 mempertahankan status),
`HandTracker` (kiri=P1/kanan=P2, tangan hilang → present=false & lone, muncul lagi
di sisi berlawanan → re-assign per frame, EMA melandakan lompatan posisi, frame
kosong/null aman), `createStabilityTracker` (butuh 1,5 s kontinu, interupsi reset,
dt negatif diabaikan), `HandsController` (kontrak bidang lengkap, x membeku saat
hilang, `destroy()` idempoten), `handsSignature`. Replikasi: salin isi laporan/
repo tidak perlu — harness hanya butuh `node` dan path ke `js/hands.js`.

**B. Manual dengan kamera nyata (butuh webcam + internet pertama kali):**
1. `python3 -m http.server 8000` dari root proyek → buka `http://localhost:8000/`.
2. **Cek mode keyboard = 0 network ke MediaPipe**: buka DevTools → tab Network,
   main satu sesi penuh dengan Keyboard → tidak ada request ke `cdn.jsdelivr.net`
   maupun `storage.googleapis.com`.
3. Pilih mode **Kamera** → Mulai → layar Kalibrasi: izinkan kamera. Berdiri berdua:
   P1 kiri, P2 kanan, angkat kedua tangan → chip menjadi hijau, progress bar mengisi
   1,5 detik → tombol **Lanjut** aktif → layar GAME dengan PiP mirrored pojok
   kanan-bawah + overlay rangka tangan (oranye = P1, biru = P2).
4. Uji indikator HUD: turunkan satu tangan → indikator pemain itu merah (setelah
   sesaat); angkat lagi di sisi yang benar → hijau. Tukar sisi dengan pasangan →
   warna rangka mengikuti sisi (re-assign per frame).
5. Uji fallback: (a) tolak izin kamera → pesan ramah + otomatis lanjut keyboard
   (±3 detik); (b) matikan jaringan lalu pilih mode Kamera → pesan gagal memuat
   pustaka + fallback keyboard; (c) tombol "Main dengan Keyboard" di kalibrasi.
6. Selesaikan sesi dengan keyboard (gameplay Sprint 2 tetap keyboard) → RESULT →
   "Main Lagi" (kamera lanjut tanpa hidupkan ulang) dan "Ganti Pemain" (kamera
   mati total — lampu kamera padam).
7. QA lanjutan: buka `http://localhost:8000/?debug` → `window.__ezharQuiz.cam.ctrl`
   berisi `HandsController` aktif (cek `.hands`, `.delegate` GPU/CPU, `.destroy()`).

## Bug/Isu yang Diketahui
Ditemukan & **diperbaiki saat audit** (semua oleh subagent kedua, di `js/hands.js`):
1. **Rasio jepit dari landmark EMA** — jepit kuat baru terdaftar setelah ±4 frame
   (≈130 ms @30fps) karena EMA posisi ikut menghaluskan jarak 4↔8; melanggar PRD F6
   (<100 ms) dan menumpuk jeda di atas hysteresis. Diperbaiki: rasio dihitung dari
   landmark RAW; ditemukan langsung oleh harness (4 asersi gagal sebelum perbaikan).
2. **Leak landmarker di jalur kegagalan kamera** — `initHands` membuat landmarker
   sebelum `getUserMedia`; jika kamera gagal (izin ditolak dsb.) throw terjadi tanpa
   `landmarker.close()`. Diperbaiki: landmarker ditutup sebelum melempar.
3. **Race destroy-vs-rebuild** — jika `destroy()` dipanggil saat rebuild landmarker
   CPU (fallback runtime) sedang berjalan, landmarker baru menempel ke controller
   mati dan tidak pernah ditutup. Diperbaiki: guard `_destroyed` menutup landmarker
   hasil rebuild.

Isu tersisa (belum bisa diverifikasi di lingkungan ini):
- **Pengujian kamera nyata belum dilakukan** — lingkungan subagent tanpa hardware/
  browser; seluruh verifikasi adalah logika murni (71 asersi) + audit statis jalur
  kode. Uji browser nyata (kamera, CDN, izin, fps) diserahkan ke integrator via
  panduan Bagian B di atas.
- **`detectForVideo` sinkron di main thread** (arsitektur MediaPipe Tasks Vision
  tanpa worker) — bisa menyebabkan jank minor pada mesin lambat; dedupe frame +
  loop terpisah meminimalkannya, pengukuran fps nyata menunggu Sprint 4 (QA performa).
- rAF berhenti saat tab hidden → deteksi & kalibrasi ikut berhenti (perilaku wajar,
  dicatat; penanganan pause/blur sistematis memang scope Sprint 4).

## Catatan untuk Sprint Berikutnya
**KONTRAK LENGKAP `js/hands.js` untuk Sprint 3 (HandSource):**

1. **Objek per tangan** — `controller.hands[1]` & `controller.hands[2]` (objek STABIL,
   dimutasi in-place tiap frame deteksi — baca nilainya tiap frame, jangan simpan
   salinan lintas frame):
   ```js
   {
     playerId: 1|2,          // tetap terisi meski present=false
     present: boolean,        // tangan terdeteksi (dengan grace 150 ms anti-flicker)
     x: 0..1, y: 0..1,        // MIRRORED (1−x), titik jepit tengah landmark 4↔8, sudah EMA α 0.4
     pinch: 0..1,             // 1 − clamp(dist(4,8)/(0.5·dist(0,9)))
     pinching: boolean,       // hysteresis ON<0.45 / OFF>0.6 dari rasio RAW (instan)
     landmarks: [...21 {x,y,z}], // MIRRORED + EMA; [] saat tidak present (jangan dimutasi!)
     trackId: number|null     // identitas track internal (debug/QA)
   }
   ```
   Saat `present=false`: `pinch=0`, `pinching=false`, `landmarks=[]`, dan **x/y
   membeku di posisi terakhir** — pakai untuk grace period 1,5 detik PRD F6
   (bandingkan `performance.now()` terhadap waktu `present` berubah `false`, atau
   deteksi lewat callback di bawah). Tangan tunggal ada di `controller.unassigned`
   (bentuk sama, `playerId=null`) — Sprint 3 boleh mengabaikannya (pemain tanpa sisi
   tidak valid).
2. **Inisialisasi** — `import('./hands.js')` lalu `await initHands(videoEl, options)`
   → `Promise<HandsController>`; reject dengan `Error` bertanda `.friendly` (pesan
   Indonesia siap tampil). `options = { onFrame?, onHandsChange? }` (boleh juga
   di-set belakangan: `controller.onFrame = fn`). Elemen `<video>` apa pun yang
   bisa di-reparent (main.js memakai satu video untuk kalibrasi↔PiP; HandSource
   cukup membaca `controller.hands`, TIDAK perlu menyentuh video).
3. **Berlangganan per frame**:
   - `onFrame({ hands, unassigned, detected, now })` — dipanggil tiap frame deteksi
     yang diproses (±15–30fps, mengikuti video). Cukup untuk menulis posisi terakhir;
     JANGAN `await`/kerja berat di dalamnya.
   - `onHandsChange({ hands, unassigned, signature, previous })` — hanya saat
     kehadiran/pinch/track berubah (hemat untuk UI/logika edge).
4. **Lifecycle** — `controller.setPaused(bool)` (jeda deteksi tanpa membongkar
   kamera), `controller.destroy()` (idempoten: stop loop rAF, `landmarker.close()`,
   stop semua track stream, lepas `video.srcObject`). `controller.delegate`
   → `'GPU'|'CPU'|null` (informatif). Konstanta tuning: `HANDS_CONFIG`
   `{ numHands:2, emaAlpha:0.4, pinchRatioOn:0.45, pinchRatioOff:0.6, graceMs:150,
   forgetMs:900, matchDist:0.28 }`. Overlay debug: `drawHandSkeleton(ctx, hand,
   {color,width,height,lineWidth,dotRadius,label})` — landmark sudah mirrored,
   gambar langsung di atas video CSS-mirrored.
5. **Pengingat kontrak `InputSource` dari Sprint 1** (harus diimplementasi
   `HandSource` Sprint 3 — renderer tidak peduli asal input):
   ```js
   { get x(), get y(),        // POSISI DALAM PIKSEL CANVAS (x,y tangan 0..1 × W,H)
     get pinching(), get present(), update(dt, w, h), destroy() }
   ```
   Injeksi via `new GameRenderer(canvas, { sources: {1: src, 2: src} })` (default
   `KeyboardInputSource` + `DEFAULT_KEYMAPS` tetap diekspor renderer). Renderer
   sendiri yang mendeteksi rising/falling edge `pinching`; grab memakai posisi
   kursor tampilan (hasil lerp `CONFIG.cursor.smooth`) — `HandSource.update()`
   cukup menyalin `hands[pid].x*w`, `.y*h`, `.pinching`, `.present` dari
   `controller` ke field-nya, tanpa blocking. `present=false` → pemain dianggap
   tidak bisa grab (plus grace 1,5 s sesuai PRD F6 — lihat poin 1).
6. **Konteks main.js saat ini**: `state.mode` `'camera'|'keyboard'`; mode kamera
   menyala via `openCalibration()` → `cam.ctrl` (HandsController aktif) tetap hidup
   selama GAME/RESULT sampai "Ganti Pemain". Loop UI (`cam.uiRaf`) sudah membaca
   `ctrl.hands` per frame — Sprint 3 bisa melempar sumber yang sama ke renderer.
   Radio "Kamera" WELCOME sudah aktif (badge "uji kalibrasi") — tugas Sprint 3:
   jadikan Kamera default sesuai PRD + ganti badge, dan ganti
   `KeyboardInputSource` → `HandSource` di `beginSession()`. Hook QA:
   `?debug` → `window.__ezharQuiz = { state, cam }`.
7. **Warna identitas** konsisten: P1 `#f97316`, P2 `#38bdf8` (sama dengan
   `PLAYER_COLORS` main.js & overlay — pertahankan di kursor HandSource Sprint 3).
