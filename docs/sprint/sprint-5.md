# Sprint 5 — Latar Video Penuh + Tombol Stop Kuis (perubahan pasca-rilis)
Status: Selesai
Rentang: 2026-10-07

## Ringkasan
Dua permintaan perubahan dari pengguna setelah Sprint 4: (1) video kamera tidak
lagi tampil sebagai PiP kecil di pojok, tetapi sebagai **latar penuh** di
belakang arena game sehingga posisi kursor/HUD pemain persis berada pada posisi
tangan nyata di layar; (2) **tombol "Stop Kuis"** untuk mengakhiri kuis yang
sedang berjalan.

## Yang Dikerjakan
- [x] `#camera-pip` (pojok) diganti `#camera-bg`: kontainer latar penuh di
      dalam `.canvas-wrap`, berisi video (dinamis), dimmer radial, dan canvas
      overlay rangka tangan full-size — semuanya DI BAWAH `#game-canvas`
      (kanvas game memang transparan: `clearRect` awal, hanya zona/tepa yang
      dilukis, sehingga video tembus sebagai latar).
- [x] **Mapping letterbox**: video ditampilkan `object-fit: contain`; rect
      video yang benar-benar terlihat dihitung `computeVideoRect()` (cache
      per dimensi) lalu (a) di-push ke `HandSource.setVideoRect()` agar kursor
      pemain jatuh persis di posisi tangan, (b) dipakai `drawCameraOverlay()`
      (opsi `rect` baru + translate) agar rangka tangan tergambar di tempat
      yang sama dengan tangan nyata.
- [x] `hand-input.js`: method `setVideoRect(rect|null)` — mapping
      `px = rect.x + nx*rect.w`; `null` = perilaku lama (seluruh kanvas),
      backward-compatible dengan kontrak InputSource & harness.
- [x] Tombol **⏹ Stop Kuis** (bawah-tengah arena, merah translusen):
      ≥1 soal selesai → RESULT dengan skor sementara (denominator "x/N benar"
      disesuaikan); belum ada soal selesai → WELCOME (via `changePlayers`).
- [x] Semua jalur kamera lama dipakai ulang (destroy/fallback/swap-input
      mid-game hanya berganti referensi `pip` → `camBg`).
- [x] **Cache-busting aset `?v=5`**: ditemukan saat verifikasi bahwa static
      hosting/server dev menyajikan modul lama dari cache HTTP (HTML baru +
      JS lama = crash `null.hidden` di main.js). Versi dipasang di tag
      `<script>`/`<link>` index.html DAN pada semua import internal main.js
      (`./data.js?v=5`, `./renderer.js?v=5`, `./confetti.js?v=5`,
      `./hand-input.js?v=5`, dynamic `./hands.js?v=5`) — naikkan `v` setiap
      kali aset berubah.

## File Dibuat/Diubah
- `index.html` — blok `#camera-bg` + `#btn-stop-quiz` menggantikan `#camera-pip`
- `css/style.css` — `.camera-bg`, `.camera-bg__dim`, `.btn-stop` (menggantikan `.camera-pip`)
- `js/hand-input.js` — `setVideoRect()` + mapping rect di `update()`
- `js/main.js` — `camBg`, `computeVideoRect()`, `drawCameraOverlay(rect)`,
  `stopQuiz()` + wiring, cache `_lastVideoRect(Key)`
- `docs/PRD.md` — F5 (tombol Stop) & F6 (latar penuh) diamendemen
- `README.md` — deskripsi tampilan kamera & struktur folder disinkronkan

## Keputusan Desain & Deviasi dari Plan
1. **object-fit: contain (letterbox), bukan cover** — cover memotong tepi
   video; tangan di tepi atas/bawah frame akan berada di luar layar.
   Letterbox menjamin SELURUH area kamera terlihat & terpetakan.
2. **Zona kunci tetap relatif ke KANVAS penuh** (12% tepi layar), bukan rect
   video — tepi kiri/kanan video (offset ± puluhan px) masih berada di dalam
   zona, jadi tidak ada perubahan mekanika F4.
3. **Stop saat 0 soal selesai → WELCOME, bukan RESULT** — menghindari layar
   hasil "0/0 benar · SERI!" yang membingungkan.
4. Kanvas game tidak diubah sama sekali — semua alignment diselesaikan di
   sisi sumber input (HandSource) & overlay, sesuai semangat kontrak
   InputSource (renderer tidak peduli asal input).

## Cara Test Manual
1. Jalankan server lokal, pilih mode Kamera, selesaikan kalibrasi → layar GAME:
   video tampil penuh sebagai latar (gelap), rangka tangan tergambar TEPAT di
   posisi tangan nyata, kursor pemain mengikuti tangan 1:1.
2. Mode keyboard: latar video tersembunyi (tampilan seperti sebelumnya).
3. Klik "⏹ Stop Kuis" di tengah pertandingan → layar hasil dengan skor
   sementara & "x/N benar" (N = soal yang selesai); klik saat countdown/soal
   pertama belum selesai → kembali ke layar selamat datang.
4. Resize jendela saat mode kamera → posisi kursor tetap sejajar (rect
   dihitung ulang per frame UI, ter-cache per dimensi).

## Bug/Isu yang Diketahui
- Video latar diredupkan merata (radial); pada ruangan sangat terang balon
  mungkin butuh kontras ekstra — calibratable via `.camera-bg__dim`.

## Hasil Verifikasi (integrator, browser nyata + kamera nyata)
- Harness regresi: **82/82 asersi LULUS** (4 asersi baru mapping
  `setVideoRect`: sudut (0,0)/(1,1), titik tengah, dan `null` = perilaku lama).
- `node --check` lolos semua file; tidak ada referensi `pip` tersisa.
- Browser (mode kamera, tangan nyata): **nol error**; video tampil sebagai
  latar penuh ter-redup; rect letterbox terkirim ke HandSource
  (`37,0,1205,678` untuk stream 1280×720 di area 1280×678 — sesuai hitungan);
  rangka tangan & kursor pemain sejajar dengan tangan nyata di layar.
- Tombol **Stop Kuis** diuji setelah 2 soal selesai: → layar RESULT, renderer
  dibersihkan, ringkasan "1/2 benar" & "0/2 benar" (denominator = soal
  selesai, bukan 10) — sesuai desain. Cabang "0 soal selesai → WELCOME"
  diverifikasi via logika kode (alur setara `changePlayers`).
- Catatan: pane browser embedded men-throttle rAF (~2fps) — verifikasi visual
  tetap sahih (posisi/render tidak tergantung kecepatan), tapi kecepatan
  gameplay penuh perlu dicoba di browser normal.

## Catatan untuk Sprint Berikutnya
- Harness regresi `/tmp/ezq-regression.mjs` kini 82 asersi. `syncVideoAspect`
  kini hanya dipakai layar kalibrasi.
- Setiap perubahan aset ke depannya: naikkan `?v=N` di index.html DAN import
  main.js secara seragam.
