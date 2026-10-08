# PRD — EzharQuiz: Kuis Jawaban Jatuh 2 Pemain

Versi: 1.0 · Status: Disetujui · Tanggal: 2026-10-06

---

## 1. Ringkasan Produk

**EzharQuiz** adalah game kuis 2 pemain yang dimainkan di satu layar dengan satu kamera.
Sebuah pertanyaan ditampilkan di bagian atas layar, dan 4 balon jawaban (pilihan ganda)
jatuh perlahan dari atas ke bawah. Setiap pemain **menangkap** balon jawaban dengan
gesture menjepit (pinch) di depan kamera, lalu **menggeserkannya** ke zona jawaban
mereka (kiri untuk Pemain 1, kanan untuk Pemain 2) untuk mengunci jawaban. Jawaban
benar mendapat poin. Setelah 10 soal, pemain dengan skor tertinggi menang dan
dirayakan dengan animasi confetti.

Game ini murni berjalan di client (HTML + CSS + JavaScript, tanpa framework, tanpa
build tools, tanpa backend). Bank soal disimpan dalam file JSON.

## 2. Latar Belakang & Tujuan

- Membuat game kuis edukatif yang aktif dan menyenangkan untuk 2 orang di satu layar.
- Memanfaatkan deteksi gerakan tangan (hand tracking) sebagai kontrol utama, dengan
  fallback keyboard agar game tetap bisa dimainkan tanpa kamera.
- Arsitektur sesederhana mungkin: static hosting (GitHub Pages/Netlify/localhost),
  tanpa server-side logic.

**Tujuan produk:**
1. Dua pemain bisa bermain 1 sesi (10 soal acak dari bank 100 soal) dalam ± 3 menit.
2. Kontrol gesture terasa responsif (jeda tangan-ke-layar < 100 ms).
3. Game jalan penuh via keyboard tanpa kamera sama sekali.

## 3. Pengguna & Lingkungan

- **Pengguna:** 2 orang (anak-anak s.d. dewasa) berdiri/duduk berdampingan menghadapi
  satu layar dan satu webcam.
- **Perangkat:** Laptop/PC dengan webcam, layar minimal 1280×720, browser modern
  (Chrome, Edge, Firefox, Safari versi terbaru).
- **Lingkungan:** Harus dijalankan via `http://localhost` atau HTTPS (syarat API
  `getUserMedia`). Mode keyboard tetap jalan di `file://`, tapi tidak disarankan.
- **Internet:** Mode kamera butuh internet saat pertama kali memuat library MediaPipe
  dari CDN. Mode keyboard bisa sepenuhnya offline.

## 4. Tech Stack & Arsitektur

| Lapisan | Teknologi | Catatan |
|---|---|---|
| Struktur & UI | HTML5 + CSS3 | Tanpa framework, ES Modules |
| Logika game & rendering | JavaScript (Canvas 2D) | `requestAnimationFrame`, target 60fps |
| Deteksi tangan | MediaPipe Tasks Vision (`HandLandmarker`) | Via CDN ESM, `numHands: 2`, dynamic import |
| Kamera | `getUserMedia` API | Video latar penuh di belakang kanvas, mirrored |
| Bank soal | `data/questions.json` | Dimuat via `fetch()` |
| Persistensi ringan | `localStorage` | Nama pemain terakhir & mode kontrol |
| Confetti | Canvas partikel custom | Tanpa library |
| Hosting | Static (Live Server / GitHub Pages / Netlify) | Tanpa backend |

**Struktur folder yang disepakati:**

```
ezharquizz/
├── index.html
├── css/style.css
├── js/
│   ├── main.js        → flow layar & state game
│   ├── data.js        → memuat & mengacak soal dari JSON
│   ├── renderer.js    → canvas: balon jatuh, kursor, zona, reveal
│   ├── hands.js       → kamera + MediaPipe (dynamic import)
│   └── confetti.js    → partikel confetti layar hasil
├── data/
│   └── questions.json
└── docs/              → PRD, plan, laporan sprint
```

## 5. Fitur Utama & Kriteria Penerimaan

### F1 — Bank Soal & Seleksi Acak
- `data/questions.json` berisi **100 soal** pilihan ganda (4 opsi, 1 benar), 10
  kategori (Geografi, Sejarah, Sains, Matematika, Teknologi, Olahraga, Budaya,
  Bahasa & Sastra, Biologi, Umum).
- Setiap sesi mengambil **10 soal acak** (diacak dengan Fisher–Yates, tanpa duplikat).
- ✅ *Acceptance:* 2 sesi berturut-turut menghasilkan set/urutan soal berbeda;
  jawaban benar terdistribusi merata di posisi 0–3.

### F2 — Layar Selamat Datang & Input Nama
- Input nama Pemain 1 dan Pemain 2 (placeholder "Pemain 1"/"Pemain 2" jika kosong,
  tombol Mulai tetap aktif; whitespace-only dianggap kosong).
- Pilihan mode kontrol: **Kamera (gesture)** — default — atau **Keyboard**.
- Tombol "Cara Main" menampilkan ringkasan aturan.
- Nama & mode terakhir disimpan di `localStorage` dan dipulihkan saat reload.
- ✅ *Acceptance:* reload halaman mengembalikan nama & mode; validasi input jalan.

### F3 — Mekanika Jawaban Jatuh (inti gameplay)
- Pertanyaan aktif tampil di panel atas layar sepanjang durasi soal.
- 4 balon jawaban muncul di atas layar pada posisi x acak (berjarak minimal),
  spawn bertahap (stagger 0–1 detik), jatuh kecepatan konstan ± 55 px/detik
  (± 12–13 detik sampai dasar layar 720px).
- Balon yang mencapai dasar layar hilang (tidak bisa ditangkap lagi).
- ✅ *Acceptance:* balon tidak pernah tumpang tindih saat spawn; jatuh halus 60fps.

### F4 — Menangkap, Menggeser, Mengunci (berlaku gesture & keyboard)
- **Zona kunci:** pita vertikal ± 12% lebar layar di tepi kiri (Pemain 1) dan tepi
  kanan (Pemain 2), digambar saat pemain memegang balon (zona menyala).
- **Menangkap:** jepitan (pinch) atau tombol jepit saat titik tangan/kursor berada
  di dalam radius balon (+ toleransi 40 px). Satu pemain hanya memegang 1 balon;
  1 balon hanya bisa dipegang 1 pemain.
- **Menggeser:** saat dipegang, balon mengikuti posisi x tangan/kursor pemain
  (y balon mengikuti y tangan/kursor juga).
- **Mengunci:** melepas jepitan saat pusat balon berada di dalam zona pemain →
  jawaban terkunci (balon menempel di slot zona, berwarna sesuai pemain, tidak bisa
  diambil siapa pun). Melepas di luar zona → balon lepas dan kembali jatuh.
- **Akhir soal:** terjadi saat (a) kedua pemain sudah mengunci, ATAU (b) semua balon
  sudah hilang/tidak ada yang dipegang, ATAU (c) batas waktu 25 detik (auto-release
  balon yang masih dipegang). Pemain yang tidak mengunci dinilai gagal soal tersebut.
- **Reveal:** ± 2,5 detik menampilkan jawaban benar (balon benar menyala hijau;
  jawaban terkunci yang salah menyala merah), lalu soal berikutnya.
- ✅ *Acceptance:* seluruh transisi state (jatuh → dipegang → terkunci/lepas →
  reveal → soal berikutnya) tanpa deadlock; skor akurat.

### F5 — Skor & Layar Hasil + Confetti
- Jawaban benar = **+10 poin**. Maksimal 100 per pemain per sesi.
- Setelah 10 soal → layar hasil: nama & skor kedua pemain, pemenang dinyatakan
  besar ("🏆 [Nama] MENANG!"). Jika seri → "SERI!".
- **Confetti:** animasi partikel canvas custom (warna acak, jatuh berputar). Warna
  confetti mendominasi warna identitas pemenang; jika seri, dua warna.
- Tombol **"Main Lagi"** (nama & mode sama, soal diacak ulang) dan **"Ganti Pemain"**
  (kembali ke layar selamat datang).
- **Tombol "Stop Kuis"** selama sesi berjalan *(Sprint 5)*: mengakhiri kuis
  seketika. Bila ≥1 soal sudah selesai → layar hasil dengan skor sementara
  (ringkasan "x/N benar" mengikuti jumlah soal yang selesai); bila belum ada
  soal yang selesai → kembali ke layar selamat datang.
- ✅ *Acceptance:* pemenang/seri selalu benar; confetti jalan 60fps tanpa memblokir
  UI; tombol berfungsi.

### F6 — Kamera & Deteksi Tangan (mode Kamera)
- Kamera diakses via `getUserMedia`; video tampil sebagai **latar penuh** di
  belakang kanvas game (diredupkan agar elemen game terbaca), **mirrored**
  (efek cermin, agar gerakan terasa natural). Posisi kursor/HUD pemain jatuh
  persis pada posisi tangan nyata di layar (koordinat tangan dipetakan ke rect
  letterbox video). *(Revisi Sprint 5: sebelumnya PiP kecil di pojok.)*
- **MediaPipe HandLandmarker**, `numHands: 2`, berjalan pada video frame
  (`detectForVideo`).
- **Kalibrasi pemain:** layar kalibrasi sebelum game — kedua pemain mengangkat
  tangan; tangan di sisi kiri frame = Pemain 1, sisi kanan = Pemain 2. Tombol
  "Lanjut" aktif setelah 2 tangan terdeteksi stabil ± 1,5 detik. Tersedia tombol
  "Main dengan Keyboard" untuk beralih mode.
- **Gesture jepit:** jarak ujung jempol (landmark 4) ke ujung telunjuk (landmark 8)
  < 0,5 × jarak pergelangan (0) ke ruas tengah jari tengah (9) = jepit.
- **Penanganan hilangnya tangan:** indikator status per pemain di HUD (hijau =
  terdeteksi, merah = hilang). Tangan hilang < 1,5 detik saat memegang balon →
  balon membeku tetap dipegang; lebih dari itu → balon dilepaskan.
- Penolakan izin kamera / kamera tidak ada → notifikasi ramah + otomatis beralih ke
  mode keyboard.
- ✅ *Acceptance:* 2 tangan terdeteksi & ter-assign benar; pinch terdaftar < 100 ms;
  salah satu pemain keluar frame tidak merusak game.

### F7 — Fallback Keyboard (selalu tersedia)
- Pemain 1: `A`/`D` gerak kiri-kanan, `W` jepit/lepas (toggle).
- Pemain 2: `←`/`→` gerak kiri-kanan, `↑` jepit/lepas (toggle).
- Kursor virtual masing-masing pemain digambar di canvas (lingkaran berlabel nama).
- Semua mekanika F4 identik antara keyboard dan gesture.
- ✅ *Acceptance:* game 100% selesai dimainkan hanya dengan keyboard.

### F8 — Editor Quiz Lokal *(Sprint 6)*
- Tombol **"🛠 Editor Quiz"** di layar selamat datang membuka layar editor
  bank soal (tambah/ubah/duplikat/hapus soal, cari, filter kategori, validasi
  langsung: pertanyaan & 4 opsi wajib terisi, opsi tak boleh duplikat, 1
  jawaban benar, kategori terisi; soal belum valid ditandai merah dan
  menghalangi penyimpanan).
- **Gerbang password:** diminta setiap kali masuk editor. Password default
  `12345`; pemakaian pertama **wajib ganti password** (min. 4 karakter, tak
  boleh sama dengan default) sebelum masuk. Password disimpan sebagai hash
  SHA-256 di localStorage; tersedia "reset ke default" dua-klik. Catatan:
  ini gerbang UX, bukan keamanan sejati (kode client dapat dibaca).
- **Penyimpanan dua mode (tanpa backend):**
  1. *Simpan langsung* (Chrome/Edge — File System Access API): pilih
     `data/questions.json` sekali via picker; tombol Simpan menulis langsung
     ke file; handle diingat di IndexedDB (sesi berikutnya cukup hubungkan
     ulang satu klik). Tetap berfungsi di halaman yang telah di-deploy —
     yang diedit file LOKAL, lalu push ke repo.
  2. *Mode unduh* (Firefox/Safari / belum pilih file): Simpan mengunduh
     `questions.json` untuk diganti manual.
- Setelah simpan, bank soal di memori game diperbarui tanpa reload.
- ✅ *Acceptance:* soal baru tersimpan muncul di sesi game berikutnya;
  format file identik (satu objek per baris); perubahan tak tersimpan
  memunculkan peringatan sebelum keluar/reload.

## 6. Alur Layar & State Game

```
LOADING (ambil JSON, init)
   ↓
WELCOME (input nama, pilih mode)
   ↓                          ↘ (mode keyboard)
CALIBRATION (mode kamera)      |
   ↓                          ↓
QUESTION_LOOP ──► REVEAL ──┐ (× 10 soal)
   ↑                       ↓
   └───────────────────────┘
   ↓ setelah 10 soal
RESULT (pemenang + confetti)
   ↓ Main Lagi → QUESTION_LOOP (soal baru)
   ↓ Ganti Pemain → WELCOME
```

State internal per soal: `FALLING` → (opsional `HELD` per pemain) → `LOCKED` per
pemain → `REVEAL` → soal berikutnya.

## 7. Model Data

`data/questions.json` — array datar 100 objek:

```json
[
  {
    "id": 1,
    "category": "Geografi",
    "question": "Ibu kota Provinsi Jawa Barat adalah...",
    "options": ["Jakarta", "Bandung", "Semarang", "Serang"],
    "answer": 1
  }
]
```

- `options`: selalu 4 item; `answer`: indeks 0–3 jawaban benar (terdistribusi merata).
- `category` untuk keperluan label kecil di HUD (opsional ditampilkan).

`localStorage` keys: `ezharquiz.names` (`{p1, p2}`), `ezharquiz.mode`
(`"camera" | "keyboard"`).

## 8. Kebutuhan Non-Fungsional

- **Performa:** 60fps pada laptop biasa; loop render terpisah dari deteksi tangan
  (deteksi bisa 15–30fps, game tetap 60fps).
- **Tanpa build tools:** murni ES Modules; library kamera di-load via dynamic
  `import()` hanya saat mode kamera dipilih (mode keyboard tetap jalan offline).
- **Kompatibilitas:** 2 browser terakhir Chrome/Edge/Firefox/Safari.
- **Keamanan:** tanpa data pribadi yang dikirim ke mana pun; semua proses lokal.
- **Kualitas kode:** modul kecil dengan tanggung jawab jelas, komentar seperlunya
  dalam Bahasa Indonesia, penamaan konsisten Bahasa Inggris.

## 9. Di Luar Cakupan (Out of Scope)

- Backend, akun pemain, leaderboard global/online, multi-device.
- Penyuntingan soal dari dalam game (bank soal diedit langsung di file JSON).
- Suara/efek audio (opsional di masa depan).
- Dukungan mobile/portrait (game didesain landscape ≥ 1280×720).
- Lebih dari 2 pemain.

## 10. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Deteksi tangan lambat/tidak stabil di perangkat lemah | Mode keyboard selalu tersedia; auto-fallback |
| Pencahayaan buruk | Layar kalibrasi menampilkan preview + tips; indikator status tangan |
| Dua tangan tertukar pemain | Assignment berdasarkan sisi frame + kalibrasi eksplisit |
| CDN MediaPipe tidak terjangkau (offline) | Dynamic import; gagal load → tawarkan mode keyboard |
| Balon sulit ditangkap (koordinasi tangan-layar) | Toleransi radius 40px; kecepatan jatuh pelan; balon besar |

## 11. Milestone Eksekusi

Rincian breakdown per sprint ada di `docs/implementation-plan.md`:
Sprint 1 (fondasi & alur inti + keyboard), Sprint 2 (kamera & deteksi tangan),
Sprint 3 (kontrol gesture), Sprint 4 (polish & QA). Setiap sprint
didokumentasikan di `docs/sprint/sprint-N.md`.
