# Implementation Plan — EzharQuiz

Turunan dari `docs/PRD.md`. Dikerjakan dalam **4 sprint** berurutan. Setiap sprint
dikerjakan oleh subagent terpisah, dan **wajib** menghasilkan laporan
`docs/sprint/sprint-N.md` yang menjadi acuan sprint berikutnya.

---

## Aturan Kerja (berlaku untuk semua sprint)

1. Ruang kerja: `/home/tifunisnu/Documents/www/ezharquizz`. Tanpa build tools,
   tanpa package.json, tanpa framework — murni HTML/CSS/JS + ES Modules.
2. Sebelum mengerjakan: baca `docs/PRD.md`, `docs/implementation-plan.md`, dan
   semua `docs/sprint/sprint-*.md` sebelumnya. Ikuti struktur folder di PRD §4.
3. Hanya kerjakan scope sprint Anda. Jangan mengerjakan dini scope sprint lain
   (kecuali menyiapkan "seam" — fungsi/konstanta kosong yang jelas kontraknya).
4. Komentar kode seperlunya, Bahasa Indonesia. Penamaan kode Bahasa Inggris.
5. Validasi wajib sebelum dinyatakan selesai:
   - `node --check` lolos untuk semua file `.js` (kecuali file yang berisi
     dynamic import CDN tetap harus lolos — mereka adalah modul ES valid).
   - Struktur folder sesuai PRD §4 (file baru boleh ditambah bila masuk akal).
   - Tidak ada referensi file yang putus (semua `src`/`href`/`import` ada).
6. Tulis laporan sprint sesuai template di bawah.

## Template Laporan Sprint (`docs/sprint/sprint-N.md`)

```markdown
# Sprint N — <Judul>
Status: Selesai | Sebagian | Terblokir
Rentang: <tanggal>

## Ringkasan
<2–4 kalimat apa yang berubah>

## Yang Dikerjakan
- [x] item …

## File Dibuat/Diubah
- `path/file` — <peran singkat>

## Keputusan Desain & Deviasi dari Plan
- <keputusan + alasan; deviasi dari PRD/plan harus eksplisit>

## Cara Test Manual
<langkah konkrit verifikasi hasil sprint ini>

## Bug/Isu yang Diketahui
- <atau "tidak ada">

## Catatan untuk Sprint Berikutnya
- <kontrak fungsi yang tersedia, hal yang perlu diperhatikan>
```

---

## Sprint 1 — Fondasi & Alur Game Inti (Keyboard, Tanpa Kamera)

**Tujuan:** game 100% playable dari awal sampai akhir hanya dengan keyboard.
Kamera belum disentuh sama sekali.

**Scope:**
1. Struktur project: `index.html`, `css/style.css`, `js/main.js`, `js/data.js`,
   `js/renderer.js`, `js/confetti.js`.
2. `js/data.js`: `fetch('data/questions.json')`, Fisher–Yates shuffle, ambil 10
   soal acak (juga acak urutan opsi? **Tidak** — opsi dibiarkan sesuai JSON agar
   indeks `answer` tetap sahih).
3. Layar (section HTML + CSS):
   - **WELCOME**: input nama P1 & P2 (placeholder default), pilihan mode kontrol
     (radio: Kamera [disabled/hidden dulu, aktif di Sprint 3] / Keyboard),
     tombol Mulai, panel "Cara Main" ringkas. Simpan & pulihkan
     `ezharquiz.names` dari localStorage.
   - **GAME**: panel pertanyaan atas, HUD (nama+skor P1 kiri, P2 kanan, indikator
     "Soal X/10"), canvas game full-area, area zone kiri/kanan.
   - **RESULT**: nama & skor kedua pemain, deklarasi pemenang/seri, tombol
     "Main Lagi" dan "Ganti Pemain".
4. `js/renderer.js` (Canvas 2D + `requestAnimationFrame`):
   - Game loop 60fps, koordinat dunia berbasis ukuran canvas (responsive).
   - 4 balon jawaban: spawn stagger, x acak berjarak minimal, jatuh ±55 px/s,
     hilang di dasar. Teks opsi digambar & di-wrap di dalam balon.
   - Kursor virtual per pemain (lingkaran + label nama), gerak halus
     (interpolasi) dengan keyboard: P1 `A`/`D` + `W` toggle jepit, P2 `←`/`→` +
     `↑` toggle jepit. Tahan tombol gerak = gerak berkelanjutan (kecepatan cursor
     ± 600 px/s).
   - Logika grab/drop/lock sesuai PRD F4: radius grab 40px, zona kiri/kanan 12%,
     balon mengikuti kursor saat dipegang, kunci saat lepas di zona, freeze saat
     locked, auto-end soal (kedua lock / semua balon hilang / 25 detik).
   - REVEAL ± 2,5 detik: balon jawaban benar hijau, jawaban terkunci salah merah,
   jawaban terkunci benar hijau; lalu soal berikutnya.
5. `js/main.js`: state machine layar (WELCOME → GAME → RESULT), skor (+10 benar),
   penentuan pemenang/seri, tombol Main Lagi (soal diacak ulang) & Ganti Pemain.
6. `js/confetti.js`: sistem partikel custom (± 150 partikel, warna, rotasi, jatuh
   dengan sway), warna dominan = warna identitas pemenang; seri = dua warna.
   Dipakai di layar RESULT.
7. Desain visual: tema gelap playfull, dua warna identitas pemain (mis. P1 oranye
   `#f97316`, P2 biru `#38bdf8`), tipografi jelas terbaca dari jarak 1–2 meter.

**Definition of Done (Sprint 1):**
- [ ] `node --check` lolos semua JS; semua link file nyambung.
- [ ] Bisa: isi nama → main 10 soal dengan keyboard → skor benar → confetti &
      pemenang muncul → Main Lagi berfungsi.
- [ ] Reload halaman memulihkan nama dari localStorage.
- [ ] Tidak ada error console saat mode keyboard (dilacak manual via komentar
      kode yang bersih; uji browser oleh integrator).

## Sprint 2 — Kamera & Deteksi Tangan (Belum Mengontrol Game)

**Tujuan:** kamera hidup, 2 tangan terdeteksi & ter-assign ke pemain, dengan
layar kalibrasi dan overlay debug. Gameplay masih keyboard.

**Scope:**
1. `js/hands.js` (baru), di-load **dynamic import** hanya saat mode Kamera:
   ```js
   import { HandLandmarker, FilesetResolver } from
     "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
   const vision = await FilesetResolver.forVisionTasks(
     "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
   const landmarker = await HandLandmarker.createFromOptions(vision, {
     baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task", delegate: "GPU" },
     runningMode: "VIDEO", numHands: 2 });
   ```
   (fallback `delegate: "CPU"` bila GPU gagal).
2. Akses kamera `getUserMedia` (1280×720 ideal), elemen `<video>` PiP pojok bawah
   CSS `transform: scaleX(-1)` (mirror). Penolakan izin → pesan ramah + auto
   switch mode keyboard.
3. Loop deteksi terpisah dari game loop: `detectForVideo(video, performance.now())`
   tiap frame video; hasil di-smoothing posisi (EMA, α ± 0,4).
4. Kontrak output (untuk Sprint 3) — objek per tangan:
   ```js
   { playerId: 1|2|null, present: bool, x: 0..1, y: 0..1,  // koordinat MIRRORED (sudah 1-x)
     pinch: 0..1, pinching: bool, landmarks: [...21] }
   ```
   `pinch strength` = 1 - clamp(dist(4,8) / (0.5 * dist(0,9)) …) — jepit saat
   `dist(4,8) < 0.5 * dist(0,9)`; hysteresis: on di 0.45, off di 0.6.
5. Layar **CALIBRATION** (mode kamera saja, sebelum GAME): preview kamera besar,
   instruksi "Pemain 1 angkat tangan di sisi kiri, Pemain 2 di sisi kanan";
   deteksi 2 tangan stabil 1,5 detik → aktifkan tombol "Lanjut". Assignment:
   tangan dengan x mirrored lebih kecil = P1. Re-assign otomatis setiap frame
   (sisi frame), bukan sekali di awal. Tombol "Main dengan Keyboard".
6. Overlay debug di preview kamera: gambar 21 landmark + garis koneksi; HUD game
   menampilkan indikator status tangan P1/P2 (hijau/merah).
7. `js/main.js`: state WELCOME → CALIBRATION → GAME (mode kamera) atau langsung
   GAME (keyboard). Mode disimpan `ezharquiz.mode`.

**Definition of Done (Sprint 2):**
- [ ] Mode keyboard tidak memuat MediaPipe sama sekali (cek: tanpa network).
- [ ] Kalibrasi meng-assign 2 tangan benar (kiri=P1); tangan hilang → indikator
      merah; muncul lagi → hijau & ter-assign ulang.
- [ ] Gagal kamera/CDN → peringatan + fallback keyboard, game tetap jalan.
- [ ] Game loop tetap 60fps saat deteksi aktif.

## Sprint 3 — Kontrol Gesture (Gameplay Penuh dengan Tangan)

**Tujuan:** mekanika F4 sepenuhnya dikendalikan gesture; keyboard tetap berfungsi.

**Scope:**
1. Jembatan hands → game: posisi tangan mirrored dinormalisasi ke koordinat
   canvas; substitusi kursor: input pemain jadi satu antarmuka (`InputSource`)
   dengan implementasi `KeyboardSource` dan `HandSource` — renderer tidak peduli
   asalnya. Pinch = jepit (setara `W`/`↑`).
2. Grab: jepit saat titik jepit (posisi tangan) dalam radius balon + 40px → balon
   mengikuti tangan (x & y). Pelepasan jepitan → cek zona: di dalam zona pemain =
   LOCK, di luar = jatuh lagi.
3. Feedback visual: balon dipegang = glow + warna pemain; zona pemain menyala
   saat balon dibawa; garis tipis penghubung tangan→balon opsional.
4. Grace period tangan hilang 1,5 detik saat memegang balon (balon membeku),
   lebih dari itu balon dilepas; pemain tanpa tangan tidak bisa grab.
5. Aktifkan opsi mode "Kamera" di layar WELCOME; default Kamera sesuai PRD.
6. Playtest tuning: kecepatan jatuh, ukuran balon, radius grab — calibratable
   lewat konstanta di satu tempat (mis. `CONFIG` di `renderer.js`).

**Definition of Done (Sprint 3):**
- [ ] Satu sesi penuh 10 soal dimainkan 2 pemain hanya dengan gesture.
- [ ] Keyboard dan kamera menghasilkan perilaku identik (kontrak InputSource).
- [ ] Tangan hilang/masuk frame tidak menghasilkan state aneh (balon nyangkut,
      double-grab, dsb).
- [ ] `node --check` lolos; tidak ada error console.

## Sprint 4 — Polish & QA Final

**Tujuan:** pengalaman terasa finished dan tahan edge case.

**Scope:**
1. Polish visual: animasi masuk balon (pop-in), bob halus saat jatuh, transisi
   antar soal (fade), efek skor bertambah (floating "+10"), styling panel
   pertanyaan & HUD final.
2. UX: countdown 3-2-1 sebelum soal pertama; ringkasan jawaban benar di layar
   hasil (skor per soal opsional sederhana); tips pencahayaan di kalibrasi.
3. Edge case: tab blur → pause loop & timer; kamera mati di tengah game →
   tawarkan lanjut dengan keyboard; nama super panjang di-potong ellipsis;
   dua kali Main Lagi berturut-turut tanpa leak objek/timer (cek listener &
   rAF dibersihkan).
4. Performa: pastikan 60fps (hindari alokasi per frame, cache font/measure),
   cek dengan banyak teks opsi terpanjang.
5. `README.md`: cara menjalankan (Live Server/`npx serve`/`python3 -m
   http.server`), cara main, cara edit soal, catatan HTTPS/kamera & CDN.
6. QA final: jalan penuh mode keyboard & kamera (bila hardware ada), semua
   kriteria F1–F7 PRD terpenuhi, catat hasil di laporan sprint.

**Definition of Done (Sprint 4):**
- [ ] Semua item QA di atas lulus atau didokumentasikan sebagai known issue.
- [ ] README lengkap & akurat.
- [ ] Game siap di-host static (GitHub Pages/Netlify) tanpa perubahan kode.

---

## Ketergantungan Antar Sprint

```
Sprint 1 (game core, keyboard)
   └─► Sprint 2 (kamera + hands.js, kontrak output tangan)
          └─► Sprint 3 (InputSource: HandSource memakai kontrak Sprint 2)
                 └─► Sprint 4 (polish, QA, README)
```

Sprint 2 dan 3 sengaja dipisah agar risiko terbesar (deteksi tangan) terisolasi:
kalau Sprint 2 bermasalah, Sprint 1 tetap produk yang bisa dimainkan.
