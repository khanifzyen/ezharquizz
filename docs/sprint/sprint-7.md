# Sprint 7 — Kalibrasi: Lanjut Otomatis (tanpa tombol)
Status: Selesai
Rentang: 2026-10-08

## Ringkasan
Perubahan kecil atas permintaan pengguna: di layar kalibrasi, begitu **2 tangan
terdeteksi stabil 1,5 detik**, permainan **dimulai otomatis** — tombol "Lanjut"
dihapus total (tidak akan sempat diklik karena auto-start terpicu tepat saat
tombol itu akan aktif).

## Yang Dikerjakan
- [x] `updateCalibrationUi`: saat `stability.stable` → set guard
      `cam._autoStarted` (sekali saja) → status "Siap! Kedua tangan stabil —
      memulai permainan…" → `continueFromCalibration()` langsung.
- [x] Tombol `#btn-calib-next` dihapus dari HTML; semua referensi `calib.btnNext`
      dibersihkan (refs, listener, `openCalibration`).
- [x] `continueFromCalibration()` disederhanakan: guard `cam.ctrl` + harus di
      layar kalibrasi (dipanggil dari loop UI; aman dari double-fire).
- [x] Teks instruksi kalibrasi: "Pertahankan selama 1,5 detik — permainan
      dimulai **otomatis**."
- [x] Cache-busting `?v=6` → `?v=7` (index.html + import main.js).
- [x] PRD F6 & README disinkronkan (dicatat sebagai revisi Sprint 7).

## File Diubah
- `index.html` — teks instruksi, hapus tombol Lanjut, `?v=7`
- `js/main.js` — auto-continue + pembersihan btnNext + `?v=7`
- `docs/PRD.md`, `README.md`

## Keputusan Desain
- **Auto-start seketika saat stabil** ("langsung lanjutkan" sesuai permintaan) —
  syarat stabil 1,5 detik kontinu sudah merupakan sinyal intensi yang cukup;
  progress bar tetap memberi umpan balik sebelum tercapai.
- Tombol dihapus (bukan sekadar disembunyikan) agar tidak ada UI mati;
  "Main dengan Keyboard" tetap tersedia sebagai jalur keluar manual.
- Guard `cam._autoStarted` di-reset di `openCalibration()` sehingga sesi
  kalibrasi berikutnya (Main Lagi / Ganti Pemain) berperilaku sama.

## Cara Test Manual
Mode Kamera → Mulai → angkat 2 tangan stabil 1,5 detik → layar langsung
beralih ke GAME (countdown) tanpa klik apa pun. Coba juga: tangan hilang
sebelum 1,5 detik → progress reset & tetap di kalibrasi.

## Hasil Verifikasi
- `node --check` lolos; tidak ada referensi `btnNext`/`btn-calib-next` tersisa
  (diluar laporan sprint historis); harness regresi 94/94 tetap lulus
  (tidak ada modul teruji yang berubah).
- E2E browser dengan kamera nyata: 2 tangan stabil → layar berganti ke GAME
  otomatis (`state.screen === 'game'`, fase countdown) tanpa interaksi klik.

## Bug/Isu yang Diketahui
Tidak ada.
