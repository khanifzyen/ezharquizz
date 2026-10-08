# EzharQuiz 🎈

**Kuis jawaban jatuh untuk 2 pemain, 1 layar, 1 kamera.** Sebuah pertanyaan tampil di
panel atas; 4 balon jawaban jatuh perlahan dari atas layar. Setiap pemain
**menangkap** balon dengan menjepit (gesture di depan webcam, atau tombol
keyboard), **menggeserkannya** ke zona warna mereka (kiri = Pemain 1 oranye,
kanan = Pemain 2 biru), lalu **melepas jepitan** untuk mengunci jawaban. Jawaban
benar +10 poin. Setelah 10 soal, skor tertinggi menang dan dirayakan confetti.

Murni HTML + CSS + JavaScript (ES Modules) — **tanpa framework, tanpa build
tools, tanpa backend**. Cukup disajikan sebagai static files.

---

## Menjalankan

### Kenapa perlu server lokal?

Game harus dibuka lewat `http://localhost` atau HTTPS (bukan membuka
`index.html` langsung via `file://`) karena dua API yang dipakai hanya aktif di
context yang aman:

1. **`fetch()`** — memuat bank soal `data/questions.json`. Browser memblokir
   `fetch` file lokal dari halaman `file://` (kebijakan same-origin/CORS).
2. **`getUserMedia`** — akses webcam *selalu* ditolak dari `file://`.

Mode keyboard pun tetap butuh server lokal: tanpa `fetch` yang berhasil, bank
soal tidak termuat dan game menolak mulai. Jadi: **selalu jalankan lewat server
lokal.**

### Cara menjalankan (pilih satu)

```bash
# Opsi A — dari root project (tanpa instalasi apa pun):
python3 -m http.server 8000
# lalu buka http://localhost:8000/

# Opsi B — pakai npx (butuh Node.js):
npx serve .
# atau
npx http-server -p 8000

# Opsi C — VS Code:
# instal ekstensi "Live Server" (Ritwick Dey), klik kanan index.html →
# "Open with Live Server".
```

Layar ideal: landscape ≥ 1280×720. Browser modern (2 versi terakhir
Chrome/Edge/Firefox/Safari).

---

## Cara Main

### Alur singkat

1. **Layar Selamat Datang** — isi nama Pemain 1 & Pemain 2 (kosongkan untuk
   default "Pemain 1"/"Pemain 2"), pilih mode kontrol, tekan **Mulai**. Nama &
   mode tersimpan di `localStorage` dan dipulihkan saat reload.
2. Mode **Kamera** → layar **Kalibrasi**: berdiri berdua menghadap webcam,
   Pemain 1 di sisi kiri frame, Pemain 2 di sisi kanan, angkat kedua tangan
   hingga terdeteksi stabil 1,5 detik → **Lanjut**. Mode **Keyboard** → langsung
   ke game.
3. **Hitungan 3-2-1**, lalu 10 soal dimulai. Setiap soal berbatas waktu
   25 detik; soal selesai lebih cepat bila kedua pemain sudah mengunci atau
   semua balon sudah hilang/tenggelam.
4. **Reveal** ±2,5 detik: balon jawaban benar menyala hijau, jawaban terkunci
   yang salah menyala merah, efek "+10" mengambang untuk jawaban benar.
5. **Layar Hasil** — pemenang (atau "SERI!"), skor, jumlah benar per pemain
   (mis. "7/10 benar"), dan confetti berwarna identitas pemenang.
   **Main Lagi** (soal diacak ulang) atau **Ganti Pemain**.

### Kontrol keyboard (selalu tersedia)

| | Gerak | Jepit / lepas |
|---|---|---|
| **Pemain 1** | `A` / `D` | `W` (toggle) |
| **Pemain 2** | `←` / `→` | `↑` (toggle) |

Kursor Pemain 1 bergerak horizontal pada sepertiga bawah layar; tangkap balon
dengan menekan jepit tepat saat balon menyentuh kursor, bawa ke pita kiri,
lepas untuk mengunci.

### Kontrol gesture (mode Kamera)

- Kursor = **titik jepit** jempol+telunjuk (ring bidik mengecil mengikuti
  kekuatan jepit). Gerakan tangan mengarahkan kursor di seluruh layar
  (2 dimensi).
- **Jepitkan jempol + telunjuk** saat titik jepit menyentuh balon → balon
  terangkat. **Geser tangan** ke zona warna kamu → zona menyala. **Buka
  jepitan** di dalam zona → terkunci; di luar zona → balon jatuh lagi.
- Tangan hilang sesaat (< 1,5 detik) saat memegang balon: balon membeku
  menunggu tangan kembali. Hilang lebih lama: balon dilepas jatuh lagi.
- Video kamera tampil sebagai **latar penuh** di belakang arena (mirrored,
  diredupkan) — kursor pemain digambar persis di posisi tangan nyata di layar,
  lengkap dengan rangka tangan dan indikator status tangan di HUD
  (hijau = terdeteksi, merah = hilang).

### Catatan edge case

- **Ganti tab / minimize** → game otomatis **pause** (loop & timer soal
  membeku); kembali ke tab → lanjut langsung dari titik jeda, tanpa bisa
  "menghabiskan" waktu lawan.
- **Kamera mati/tercabut di tengah game** → notifikasi muncul dan permainan
  otomatis dilanjutkan dengan **keyboard** tanpa reload (skor & soal berjalan
  lanjut).
- Penolakan izin kamera / kamera absen / gagal memuat pustaka deteksi → pesan
  ramah + otomatis lanjut keyboard.

---

## Mengedit Bank Soal

Soal ada di [`data/questions.json`](data/questions.json) — array datar berisi
100 objek dengan bentuk:

```json
{
  "id": 1,
  "category": "Geografi",
  "question": "Ibu kota Provinsi Jawa Barat adalah...",
  "options": ["Jakarta", "Semarang", "Bandung", "Serang"],
  "answer": 2
}
```

- `options`: **harus tepat 4 item**.
- `answer`: indeks `0–3` jawaban benar (**urutan opsi tidak diacak oleh game**,
  jadi indeks ini selalu sahih).
- `category`: tampil sebagai label kecil di HUD ("Soal 3/10 · Geografi").
- Setiap sesi mengambil **10 soal acak** (Fisher–Yates, tanpa duplikat) —
  menambah/mengubah isi bank langsung terpakai tanpa build apa pun.
- Teks opsi panjang otomatis di-*wrap* di dalam balon; kata tunggal yang sangat
  panjang dipecah per karakter dan radius balon menyesuaikan.

### Editor Quiz (GUI, tanpa edit JSON manual)

Di layar depan ada tombol **🛠 Editor Quiz** — antarmuka untuk mengelola bank
soal langsung dari browser:

- **Gerbang password** setiap masuk. Password default: **`12345`** — pada
  pemakaian pertama Anda **wajib mengganti password** (min. 4 karakter).
  Lupa password? Tautan *reset ke default* (dua klik) tersedia di layar login.
  Catatan jujur: password ini gerbang UX (hash SHA-256 di localStorage),
  bukan keamanan sejati — siapa pun yang membaca kode bisa melewatkannya.
- Fitur: cari & filter kategori, tambah soal baru (ID otomatis), ubah
  pertanyaan/opsi/jawaban benar (radio ✓), duplikat, hapus (konfirmasi dua
  klik), validasi langsung (soal belum valid ditandai merah + tidak bisa
  disimpan), dan statistik bank.
- **Menyimpan, dua mode otomatis:**
  1. **Simpan langsung** (Chrome/Edge): klik **📁 Buka File…** sekali dan pilih
     `data/questions.json` di folder project → tombol 💾 Simpan menulis
     langsung ke file itu. File "diingat" (IndexedDB) — sesi berikutnya cukup
     klik chip status untuk menghubungkan ulang.
  2. **Mode unduh** (Firefox/Safari, atau sebelum memilih file): 💾 Simpan
     mengunduh `questions.json` — ganti file di `data/` secara manual.
- Setelah menyimpan, **sesi game berikutnya langsung memakai bank baru**
  tanpa reload.

### Mengedit setelah di-deploy (GitHub Pages/Netlify)?

Hosting statis hanya *melayani* file — browser **tidak bisa menimpa file di
server**. Tapi editor tetap berguna: buka halaman yang sudah di-deploy, masuk
editor, **📁 Buka File…** → pilih `data/questions.json` salinan lokal repo
Anda → Simpan menulis ke file lokal itu → `git add data/questions.json &&
git commit && git push` → deploy otomatis terbarui. Di browser tanpa File
System Access API, alurnya sama tapi lewat Unduh JSON.

## Struktur Folder

```
ezharquizz/
├── index.html            # 4 layar: WELCOME / CALIBRATION / GAME / RESULT
├── css/style.css         # tema gelap playful, warna identitas P1/P2
├── js/
│   ├── main.js           # orkestrator: state machine layar, skor, localStorage,
│   │                     #   kalibrasi, latar kamera penuh, tombol Stop Kuis,
│   │                     #   fallback & swap input mid-game
│   ├── editor.js         # Editor Quiz: gerbang password (default 12345 + ganti
│   │                     #   wajib), CRUD soal, simpan via File System Access
│   │                     #   API / unduh JSON
│   ├── data.js           # memuat & mengacak soal (fetch + Fisher–Yates)
│   ├── renderer.js       # mesin game Canvas 2D: loop 60fps, balon jatuh,
│   │                     #   grab/drag/lock, reveal, countdown, efek +10, pause
│   ├── hands.js          # kamera + MediaPipe HandLandmarker (dynamic import CDN)
│   ├── hand-input.js     # HandSource: jembatan deteksi tangan → input renderer
│   └── confetti.js       # partikel confetti custom (tanpa library)
├── data/questions.json   # bank soal (100 soal, 10 kategori)
└── docs/                 # PRD, implementation plan, laporan sprint 1–4
```

Konstanta tuning (kecepatan jatuh, radius balon, zona, grace period, durasi
countdown/reveal, dsb.) terkumpul di objek `CONFIG` pada `js/renderer.js`,
`HANDS_CONFIG` pada `js/hands.js`, dan `HAND_INPUT_CONFIG` pada
`js/hand-input.js`.

---

## Catatan Deploy & Jaringan

- **Hosting statis**: GitHub Pages / Netlify / Vercel / `npx serve` — tidak
  perlu perubahan kode. Untuk hosting publik wajib **HTTPS** (syarat
  `getUserMedia`; GitHub Pages/Netlify sudah HTTPS otomatis).
- **Internet**: mode Kamera butuh internet **saat pertama kali** memuat pustaka
  [MediaPipe Tasks Vision](https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14)
  dan model `hand_landmarker.task` dari CDN (dynamic import — hanya dimuat bila
  mode Kamera dipilih). Mode **Keyboard sepenuhnya offline** setelah halaman
  terbuka. Gagal memuat CDN → pesan ramah + fallback keyboard otomatis.
- Semua pemrosesan berjalan lokal di browser; tidak ada data yang dikirim ke
  mana pun.

## Troubleshooting

| Gejala | Penyebab umum & solusi |
|---|---|
| "Gagal memuat bank soal…" | Halaman dibuka via `file://` — jalankan lewat server lokal (lihat atas). |
| Kamera ditolak / tidak muncul | (1) Izinkan kamera untuk halaman ini (ikon kamera di address bar); (2) pastikan buka via `http://localhost`/HTTPS; (3) kamera mungkin dipakai aplikasi lain — tutup aplikasi itu. Ada tombol **"Main dengan Keyboard"** di layar kalibrasi. |
| Tangan tidak terdeteksi / sering hilang | Pastikan ruangan **cukup terang**; hindari cahaya kuat **dari belakang** (jendela/lampu di belakang punggung); angkat tangan setinggi dada agar seluruh telapak masuk frame; jarak ±0,5–1,5 m dari webcam. Tips ini juga tampil di layar kalibrasi. |
| Balon sulit ditangkap | Kecepatan jatuh & radius grab bisa ditala di `CONFIG.balloon` dan `CONFIG.grab` (`js/renderer.js`) — mis. perbesar `grab.tolerance`. |
| Game terasa berat (fps rendah) | Turunkan `CONFIG.dprMax`, atau main mode keyboard (deteksi tangan adalah beban terbesar; `detectForVideo` berjalan di main thread). |
| Dua tangan tertukar pemain | Assignment mengikuti sisi frame per-frame — jangan saling menyilang tangan; kembali ke sisi masing-masing. |

## QA & Debug

Tambahkan `?debug` pada URL (mis. `http://localhost:8000/?debug`) untuk hook
`window.__ezharQuiz` (`state` internal + `cam` controller tangan) — dipakai
pengujian manual/otomatis tanpa memengaruhi game normal.

---

Dibuat sebagai project 4 sprint; lihat `docs/PRD.md` (kebutuhan produk),
`docs/implementation-plan.md` (rencana), dan `docs/sprint/sprint-1..4.md`
(laporan per sprint).
