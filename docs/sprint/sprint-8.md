# Sprint 8 — Latar Video Cover Penuh Sampai Tepi Kiri-Kanan
Status: Selesai
Rentang: 2026-10-08

## Ringkasan
Masalah pengguna: dengan `object-fit: contain` (Sprint 5), video latar
ter-letterbox — ada bar gelap di kiri-kanan **pas di lokasi zona jawaban**.
Akibatnya saat pemain menggeser balon ke tepi, tangannya tampak keluar dari
gambar video (dan bila melewati tepi frame kamera, tracking hilang → balon
terlepas). Perbaikan: video kini **cover** — memenuhi area sampai tepi
kiri-kanan; zona jawaban berada di DALAM gambar video.

## Yang Dikerjakan
- [x] CSS: `#camera-bg .camera-video { object-fit: cover; }` — scoped hanya
      latar GAME; preview kalibrasi tetap `.camera-video` biasa (aspect-ratio
      disamakan `syncVideoAspect`, jadi tetap tak terpotong).
- [x] `computeVideoRect()` (main.js): skala `Math.max` (cover) — offset boleh
      negatif (bagian video ter-crop). Contoh: video 1280×720 di area
      1280×678 → rect `{x:0, y:-21, w:1280, h:720}` → tepi kiri/kanan video =
      tepi layar; koordinat tangan 0..1 tetap terpetakan akurat, dan
      `nx=0/1` kini jatuh tepat di tepi layar (dalam zona kunci).
- [x] Komentar `setVideoRect` (hand-input.js) disinkronkan (logika tak berubah
      — rect generik {x,y,w,h}).
- [x] Cache-busting `?v=7` → `?v=8`.

## Trade-off yang Diambil
- **Cover memotong atas & bawah frame** sesuai selisih rasio area vs video
  (diamati ±8–9% per sisi pada layout 1280×598; area 1,887:1 vs video 1,778:1).
  Titik jepit tangan secara alami di tengah frame, dan balon hanya bisa
  ditangkap di tengah layar — jadi crop ini tidak memengaruhi mekanika; kursor
  hanya tak terlihat sesaat bila tangan di tepi vertikal ekstrem (grace period
  1,5 dtk sudah menutupinya).
- Bila jendela lebih RASIO TINGGI dari 16:9 (portrait), cover memotong sisi
  kiri-kanan — game didesain landscape ≥1280×720 (PRD §8), kasus ini di luar
  target.

## File Diubah
`css/style.css`, `js/main.js`, `js/hand-input.js` (komentar), `index.html`
(v=8), `docs/PRD.md` (F6), laporan ini.

## Cara Test Manual
Mode Kamera → mulai (kalibrasi lanjut otomatis) → di layar game, video terlihat
menyentuh tepi kiri-kanan (tidak ada bar gelap di zona jawaban); geser tangan
sampai ujung kiri/kanan — kursor tetap di dalam video dan balon bisa dikunci
di zona.

## Hasil Verifikasi
- `node --check` lolos; harness regresi **94/94 LULUS** (mapping rect generik,
  tidak berubah).
- Browser + kamera nyata: rect terkirim ke HandSource `{x:0, y:-21, w:1280,
  h:720}` (persis hitungan cover); tangkapan layar memastikan video sampai
  tepi kiri-kanan tanpa bar gelap di area zona; nol error console.

## Bug/Isu yang Diketahui
Tidak ada.
