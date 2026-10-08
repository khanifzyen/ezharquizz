# Sprint 3 — Kontrol Gesture (Gameplay Penuh dengan Tangan)
Status: Selesai
Rentang: 2026-10-06

## Ringkasan
Gameplay kini sepenuhnya dikendalikan gesture: modul baru `js/hand-input.js`
menyediakan `HandSource` yang membungkus slot tangan `HandsController` (kontrak
Sprint 2) menjadi kontrak `InputSource` renderer (kontrak Sprint 1) — x/y piksel
canvas, `pinching`, `present` — tanpa satu baris logika grab/lock baru di
`HandSource` (paritas penuh dengan keyboard, PRD F7; semua mekanika tetap di
renderer). Grace period tangan hilang 1,5 detik sesuai PRD F6 diimplementasikan
(balon membeku tetap dipegang untuk jitter pendek; hilang lama → balon dilepas
JATUH lagi & pemain tak bisa grab sampai tangan kembali — termasuk kasak balon
kebetulan berada di zona saat tangan hilang: tidak terkunci, karena kunci
hanya atas kehendak pemain). Radio mode "Kamera" di WELCOME kini benar-benar
mengaktifkan gameplay gesture dan menjadi default (PRD F2). Validasi: harness
Node ephemeral 70/70 asersi lulus (stabil 8× berurutan), `node --check` lolos
semua file JS.

## Yang Dikerjakan
Pemetaan ke scope Sprint 3 (implementation-plan):
- [x] **Scope 1 — jembatan hands → game**: `js/hand-input.js` baru: class
      `HandSource implements InputSource`. Membaca state `controller.hands[pid]`
      (objek stabil, dimutasi in-place oleh loop deteksi) di dalam `update()`
      tiap frame game — pola **pull**, tanpa subscribe callback → bebas race
      (JavaScript single-threaded; slot dibaca atomik per frame) dan `destroy()`
      trivial. Koordinat: `x/y` tangan 0..1 mirrored × (w,h) yang diterima di
      `update(dt, w, h)` → piksel canvas; `pinching` dari hysteresis hands.js;
      `present` dari status slot + grace period.
- [x] **Scope 2 — grab/drag/lock via gesture**: tanpa logika baru — renderer
      Sprint 1 sudah mendeteksi rising/falling edge `pinching` dan memakai
      kursor tampilan untuk grab (radius balon + 40px), drag (x & y), dan
      lock/drop zona. Pinch gesture = setara tombol `W`/`↑`. Diverifikasi
      harness B1: grab→drag→lock→reveal→session-end penuh via "gesture".
- [x] **Scope 3 — feedback visual**: balon dipegang = glow + warna identitas
      pemain dan zona menyala saat membawa balon sudah ada dari Sprint 1 dan
      terpakai sama persis untuk gesture. Ditambahkan: kursor mode kamera
      digambar sebagai **titik jepit** (ring bidik yang mengecil mengikuti
      kekuatan jepit + 4 garis bidik + label nama), **garis tipis putus-putus
      penghubung tangan→balon** saat memegang (di belakang balon), dan kursor
      otomatis hilang saat `present=false` (tangan hilang > grace) sebagai
      sinyal visual "tangan tidak terlacak". Mode keyboard tidak berubah
      (lingkaran + label, seperti Sprint 1).
- [x] **Scope 4 — grace period 1,5 dtk (PRD F6)**: di `HandSource` memakai
      `HAND_INPUT_CONFIG.graceMs = 1500`. Tangan hilang SELAGI menjepit:
      `pinching` & posisi dibekukan (hands.js memang membekukan x/y slot —
      HandSource sengaja tidak membaca ulang slot saat tidak present agar
      kebal slot liar), balon tetap dipegang (tidak ada falling edge). Hilang
      > 1,5 dtk → `present=false` + `pinching=false` → falling edge di renderer
      → **`_forceDrop`** (metode renderer baru): balon dilepas JATUH lagi,
      TIDAK dicek zona; pemain tak bisa grab baru sampai tangan kembali
      terdeteksi. Hilang saat TIDAK menjepit → langsung `present=false`
      (PRD hanya mensyaratkan grace "saat memegang balon").
- [x] **Scope 5 — aktifkan mode Kamera + default**: radio "Kamera" di WELCOME
      kini `checked` secara default (PRD F2), badge berubah dari "uji kalibrasi"
      menjadi "default"; badge "siap" pada keyboard dihapus (penyederhanaan).
      Setelah kalibrasi sukses & tombol Lanjut → `beginSession()` membuat
      `GameRenderer` dengan `sources {1: HandSource(1,ctrl), 2: HandSource(2,ctrl)}`.
      Mode keyboard tetap `KeyboardInputSource` (default renderer). Semua jalur
      fallback (izin ditolak / CDN gagal / tombol "Main dengan Keyboard")
      menghasilkan `cam.ctrl = null` → otomatis keyboard. `ezharquiz.mode`
      tersimpan & dipulihkan.
- [x] **Scope 6 — tuning**: lihat "Keputusan Desain" poin 7 — nilai gameplay
      (kecepatan jatuh, ukuran balon, radius grab) TIDAK diubah; yang ditambah
      hanya konstanta baru `CONFIG.cursor.hand` (gaya kursor titik jepit) dan
      `CONFIG.cursor.handSmooth = 26` (lerp kursor tangan lebih responsif).
- [x] **Paritas keyboard vs kamera** (DoD): sumber input hanya beda asal;
      harness B5 memverifikasi default keyboard utuh + kontrak update().
- [x] **Validasi**: `node --check` + `node --input-type=module --check` lolos
      untuk semua `js/*.js`; harness `/tmp/ezq-sprint3-test.mjs` — **70/70
      asersi PASS**, stabil 8× berurutan (rincian di Cara Test A); tidak ada
      referensi file putus (`hand-input.js` di-import main.js;
      `hand-input.js` sendiri nol import).

## File Dibuat/Diubah
- `js/hand-input.js` (BARU, ±120 baris) — `HAND_INPUT_CONFIG { graceMs }` +
  `HandSource` (kontrak InputSource; pull dari `controller.hands[pid]`; grace
  period 1,5 dtk; getter opsional `pinch` 0..1 & `kind = 'hand'`).
- `js/renderer.js` (diubah kecil):
  - `CONFIG.cursor.hand` `{ ringMax, ringMin, tickLen, linkAlpha, linkWidth }`
    dan `CONFIG.cursor.handSmooth` (26) — konstanta baru Sprint 3.
  - `KeyboardInputSource` menandai `this.kind = 'keyboard'`.
  - `_update()`: `src.update(dt, w, h)` kini SELALU dipanggil walau
    `present === false` (dulu di-skip) — syarat deteksi tangan kembali.
  - `_draw()`: memanggil `_drawHandLinks()` baru (garis tangan→balon, hanya
    `kind === 'hand'` & present).
  - `_drawCursor()`: gaya titik jepit untuk `kind === 'hand'` (radius ring
    mengikuti `src.pinch`), disembunyikan saat `present === false`; keyboard
    tetap lingkaran Sprint 1.
  - `_updateQuestion()`: falling edge pinch kini dibedakan asalnya — jepitan
    dibuka sadar (`present=true`) → `_tryRelease` (cek zona: lock/drop);
    tangan hilang (`present=false`) → `_forceDrop` baru (selalu jatuh lagi).
  - Komentar header kontrak InputSource diperbarui.
- `js/main.js` (diubah) — import `HandSource`; `beginSession()` membangun
  `sources` gesture bila `cam.ctrl` hidup; komentar header & restore mode.
- `index.html` (diubah) — radio Kamera `checked` (default) + badge "default",
  badge keyboard dihapus; teks panel "Cara Main" dirombak (menjepit via gesture
  atau keyboard, penjelasan grace 1,5 dtk).
- `docs/sprint/sprint-3.md` — laporan ini.
- Tidak diubah: `js/hands.js`, `js/data.js`, `js/confetti.js`, `css/style.css`,
  `data/questions.json`.

## Keputusan Desain & Deviasi dari Plan
1. **Pull, bukan subscribe** — `HandSource` membaca `controller.hands[pid]`
   langsung di `update()` per frame game, bukan berlangganan
   `onFrame`/`onHandsChange`. Alasan: slot adalah objek stabil yang dimutasi
   in-place (desain Sprint 2), pembacaan per-frame bebas race dan tanpa
   listener yang harus dilepas; `destroy()` tinggal melepas referensi.
2. **Grace period di `HandSource`, bukan renderer/hands.js** — hands.js sudah
   membekukan x/y slot saat hilang (disiapkan Sprint 2); HandSource-lah yang
   memutuskan kapan `present`/`pinching` sah. Grace hanya berlaku SELAGI
   pemain menjepit ("saat memegang balon", PRD F6); tanpa jepitan, hilang =
   langsung `present=false`. Batas `<= 1500 ms` masih dianggap grace.
3. **BUG DITEMUKAN & DIPERBAIKI: pelepasan karena tangan hilang ≠ pelepasan
   sadar** — implementasi pertama merutekan semua falling edge pinch ke
   `_tryRelease`, sehingga balon yang kebetulan berada DI DALAM zona saat
   tangannya hilang > 1,5 dtk ikut TERKUNCI — melanggar PRD F6 ("balon
   dilepas jatuh lagi") dan instruksi sprint. Harness non-deterministik
   (posisi spawn balon acak) menangkapnya. Perbaikan: `_updateQuestion`
   membedakan asal falling edge — `present=true` → `_tryRelease` (cek zona),
   `present=false` → `_forceDrop` baru (selalu jatuh). Keyboard tidak pernah
   `present=false` → perilaku keyboard tak berubah (paritas F7 tetap).
4. **Deviasi kecil renderer: `update()` selalu dipanggil** — Sprint 1 men-skip
   `src.update()` saat `present === false`. Jika dipertahankan, `HandSource`
   tidak pernah dipanggil lagi setelah grace hangus → tangan yang kembali tak
   pernah terdeteksi (pemain permanen tak bisa grab — deadlock). Perubahan ini
   aman untuk `KeyboardInputSource` (present selalu true) dan MockSource apa
   pun (dipverifikasi harness B5).
5. **Properti opsional `kind` & `pinch` pada sumber** — renderer melakukan
   duck-typing (`src.kind === 'hand'`, `typeof src.pinch === 'number'`) untuk
   gaya kursor; kontrak inti InputSource tidak berubah (sumber lama tetap
   valid). `renderer.js` tidak meng-import `hand-input.js` (tanpa coupling).
6. **`handSmooth: 26` khusus kursor tangan** — posisi tangan sudah di-EMA
   (α 0,4) hands.js; memakai lerp `smooth: 16` yang sama dengan keyboard
   menggandakan lag gerak. Kursor tangan memakai 26 (konstanta waktu ± 38 ms);
   rasa keyboard tidak disentuh.
7. **Nilai gameplay TIDAK ditune ulang** (dokumentasi wajib plan Sprint 3.6) —
   `balloon.fallSpeed/minRadius/maxRadius` dan `grab.tolerance` dipertahankan:
   jangkauan gesture full-2D tidak menambah konstrain baru, toleransi grab
   40px sudah lega, dan tanpa playtest kamera nyata di lingkungan subagent
   perubahan buta lebih berisiko merusak keseimbangan keyboard. Playtest
   nyata + penalaan menyusul di Sprint 4 (tempatnya memang QA).
8. **`hand-input.js` di-import statis main.js, nol dependensi** — modul ini
   TIDAK meng-import `hands.js` (controller diinjeksi via konstruktor), jadi
   mode keyboard tetap TANPA request jaringan ke CDN MediaPipe (DoD Sprint 2
   tetap terpenuhi; hanya file lokal kecil yang ikut termuat).
9. **Tangan kembali masih menjepit setelah grace hangus** → rising edge →
   renderer mencoba grab di posisi kursor (yang mengejar tangan baru).
   Perilaku wajar (tangan sudah sah kembali); pemain tinggal membuka jepitan.
   Dicatat sebagai perilaku diterima, bukan bug.
10. **Kursor disembunyikan saat `present === false`** (hanya kind 'hand') —
   sinyal jelas "tangan tidak terlacak" berdampingan dengan indikator HUD
   merah; kursor keyboard selalu tampil (PRD F7).

## Cara Test Manual
**A. Otomatis (sudah dijalankan penulis sprint — 70/70 PASS, stabil 8×):**
`node /tmp/ezq-sprint3-test.mjs` (harness ephemeral di luar project). Cakupan:
- Unit `HandSource` (mock controller): konversi 0..1 → px (termasuk re-konversi
  setelah resize), propagasi `pinching`/`present`/`pinch`, grace 1,0 dtk tetap
  present+membeku (posisi & pinching beku, slot liar diabaikan), 2,05 dtk →
  `present=false`+`pinching=false`, tangan kembali → present pulih, hilang tanpa
  menjepit → langsung false, jitter 0,42 dtk → tanpa perubahan status, batas
  tepat 1,500 dtk masih grace / 1,517 dtk hangus, `destroy()` idempoten +
  controller null aman.
- Integrasi `GameRenderer` + `HandSource` + mock controller (satu soal penuh):
  chase-balon → pinch → held → drag ke zona → release → LOCK P1 & P2 → payload
  `onQuestionEnd` benar → REVEAL → `onSessionEnd`; pemain locked tak bisa grab
  lagi; grace via renderer (hilang 1,0 dtk: balon membeku dipegang, kembali:
  lanjut & lock normal); hilang 1,8 dtk **saat balon sudah berada di dalam
  zona**: balon dilepas JATUH lagi (bukan lock), tak bisa grab sampai tangan
  kembali (lalu bisa grab lagi); pemain tanpa tangan dari awal tak pernah
  menjepit & soal tetap selesai tanpa deadlock; paritas — default
  `KeyboardInputSource` utuh & `update()` tetap dipanggil saat `present=false`.

**B. Manual dengan kamera nyata (butuh webcam + internet pertama kali):**
1. `python3 -m http.server 8000` dari root proyek → `http://localhost:8000/`.
2. WELCOME: radio **Kamera** tercentang default (badge "default"). Isi nama →
   Mulai → izinkan kamera → kalibrasi (2 tangan stabil 1,5 dtk) → **Lanjut**.
3. Di GAME, gerakkan tangan: kursor = **titik jepit** (ring bidik + label nama)
   mengikuti tangan di seluruh layar (2 penuh dimensi, bukan hanya horizontal).
4. **Jepitkan jempol+telunjuk** saat titik jepit menyentuh balon → balon
   terangkat (glow warna pemain) + garis putus-putus tangan→balon; **geser
   tangan** ke zona kiri (P1/oranye) / kanan (P2/biru) — zona menyala; **buka
   jepitan** di dalam zona → balon terkunci di slot; di luar zona → jatuh lagi.
5. **Grace period**: sambil memegang balon, sembunyikan tangan < 1,5 dtk →
   balon membeku tetap dipegang, kursor membeku; tangan muncul kembali →
   lanjut. Hilang > 1,5 dtk → balon dilepas jatuh, kursor hilang, indikator
   HUD merah; tangan kembali → kursor muncul & bisa grab lagi.
6. Selesaikan 10 soal penuh hanya dengan gesture → RESULT → "Main Lagi"
   (kamera tetap hidup, tetap gesture) & "Ganti Pemain" (kamera mati total).
7. Fallback: tolak izin kamera / matikan jaringan saat memuat → pesan ramah +
   otomatis lanjut KEYBOARD (gameplay tetap selesai); tombol "Main dengan
   Keyboard" di kalibrasi juga bekerja tanpa reload.

**C. Manual keyboard (paritas):** pilih **Keyboard** di WELCOME → main sesi
penuh seperti Sprint 1 (`A`/`D`+`W`, panah) — perilaku identik, kursor tetap
lingkaran. DevTools → Network: TIDAK ada request ke `cdn.jsdelivr.net` /
`storage.googleapis.com`. Reload halaman → nama & mode pulih dari localStorage
(termasuk `ezharquiz.mode = "camera"`).

**D. QA hook:** `http://localhost:8000/?debug` → `window.__ezharQuiz.cam.ctrl`
(HandsController), `__ezharQuiz.state.renderer.sources[1]` (HandSource aktif —
cek `.present`, `.pinching`, `.kind`).

## Bug/Isu yang Diketahui
- **Pengujian kamera nyata belum bisa dilakukan dari lingkungan subagent** —
  seluruh verifikasi adalah logika murni (68 asersi) + audit statis jalur kode;
  uji browser/kamera nyata (respons < 100 ms, kenyamanan jangkauan, estetika
  kursor titik jepit & garis penghubung) diserahkan ke integrator via Bagian B.
- **Tangan menyilang/tukar sisi** — assignment per-frame berbasis sisi (PRD F6)
  bisa menukar slot P1↔P2 seketika saat dua tangan saling menyilang; balon yang
  dipegang ikut "terbang" lintas layar (lerp meredam, tapi terlihat). Karakter
  desain sisi; kandidat polish Sprint 4.
- **Tangan kembali masih menjepit setelah grace hangus** → langsung mencoba
  grab di posisi kursor lama (lihat Keputusan poin 9) — minor, perilaku diterima.
- **Kamera mati di tengah sesi** (unplug/track berakhir) → deteksi membeku,
  slot tetap `present=true` lama → pemain seolah membeku. Penanganan "kamera
  mati → tawarkan keyboard" memang scope Sprint 4 (edge case).
- `detectForVideo` sinkron di main thread (warisan Sprint 2) — jank minor di
  mesin lambat; pengukuran fps nyata menunggu QA performa Sprint 4.

## Catatan untuk Sprint Berikutnya
**Sprint 4 (polish & QA) — hook, CONFIG, dan API baru dari Sprint 3:**
1. **`js/hand-input.js`** — ekspor `HandSource` & `HAND_INPUT_CONFIG
   { graceMs: 1500 }`. Konstruktor `new HandSource(playerId, controller, cfg?)`;
   controller duck-typed (cukup punya `.hands[pid]` sesuai kontrak Sprint 2).
   Properti tambahan di luar kontrak InputSource: `kind = 'hand'` dan getter
   `pinch` (0..1) — dipakai renderer untuk kursor titik jepit.
2. **`CONFIG` renderer bertambah**: `CONFIG.cursor.hand = { ringMax:17,
   ringMin:9, tickLen:7, linkAlpha:0.45, linkWidth:2 }` dan
   `CONFIG.cursor.handSmooth = 26` (lerp khusus kursor tangan; keyboard tetap
   `CONFIG.cursor.smooth = 16`). Semua tuning visual gesture di dua tempat ini.
3. **Kontrak InputSource diperluas (backward-compatible)**: `update(dt,w,h)`
   kini SELALU dipanggil renderer walau `present === false` — sumber input baru
   harus idempoten dan tetap bisa pulih dari status tidak present; properti
   opsional `kind` ('hand'|'keyboard') & `pinch` (number) untuk gaya kursor.
4. **Perilaku present=false yang bisa dimanfaatkan Sprint 4**: kursor kind
   'hand' otomatis disembunyikan; edge detection pinch otomatis nonaktif; dan
   falling edge pinch DIBEDAKAN asalnya di `_updateQuestion()` —
   `present=true` → `_tryRelease` (cek zona lock/drop), `present=false` →
   `_forceDrop` (selalu jatuh lagi, PRD F6). Timeout soal juga memakai
   drop-paksa (perilaku Sprint 1, kini via jalur yang sama).
   Indikator HUD tetap membaca `ctrl.hands[pid].present` langsung (loop UI
   main.js), TIDAK melalui HandSource — dua sumber status ini disengaja beda
   (indikator pakai anti-flicker 150 ms hands.js, gameplay pakai grace 1,5 dtk).
5. **Hal yang perlu dipoles Sprint 4**: playtest kamera nyata lalu tala
   `balloon.fallSpeed/minRadius/maxRadius`, `grab.tolerance`,
   `cursor.handSmooth`, `HANDS_CONFIG.emaAlpha` (belum ada perubahan gameplay
   di Sprint 3 — lihat Keputusan poin 7); animasi pop-in balon, transisi
   antar-soal, floating "+10", countdown 3-2-1; edge case tab blur, kamera
   mati mid-game (deteksi: stream track `ended` → tawarkan keyboard), swap
   sisi tangan saat menyilang; README.md (cara jalankan/main/edit soal,
   catatan HTTPS/kamera/CDN). QA akhir F1–F7 via `?debug`
   (`window.__ezharQuiz = { state, cam }`; `state.renderer.sources[1]`
   = HandSource saat mode kamera).
