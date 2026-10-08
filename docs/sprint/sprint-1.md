# Sprint 1 — Fondasi & Alur Game Inti (Keyboard, Tanpa Kamera)
Status: Selesai
Rentang: 2026-10-06

## Ringkasan
Game EzharQuiz kini 100% playable dari awal sampai akhir hanya dengan keyboard:
tiga layar (WELCOME → GAME → RESULT) berjalan penuh, 10 soal acak dari bank 100 soal,
mekanika balon jatuh–tangkap–geser–kunci sesuai PRD F3/F4 (termasuk tiga kondisi akhir
soal dan reveal), skor +10, penentuan pemenang/seri, dan confetti partikel custom dengan
warna dominan identitas pemenang. Tidak ada satu baris pun kode kamera (sesuai scope).
Semua konstanta tuning terkumpul dalam satu objek `CONFIG` di `renderer.js`.

## Yang Dikerjakan
- [x] Struktur project: `index.html`, `css/style.css`, `js/main.js`, `js/data.js`, `js/renderer.js`, `js/confetti.js` (ES Modules murni, tanpa framework/build tools/package.json).
- [x] `data.js`: `fetch('data/questions.json')`, Fisher–Yates shuffle (pure), ambil 10 soal acak tanpa duplikat; **urutan opsi TIDAK diacak** agar indeks `answer` tetap sahih.
- [x] Layar WELCOME: input nama P1/P2 (placeholder fallback, whitespace-only = kosong), radio mode Kamera (**disabled**, label "aktif di Sprint 3") / Keyboard, tombol Mulai, panel Cara Main (toggle), simpan/pulihkan `ezharquiz.names` + `ezharquiz.mode` dari localStorage.
- [x] Layar GAME: panel pertanyaan + meta "Soal X/10 · Kategori", HUD nama+skor P1 kiri (oranye) & P2 kanan (biru), canvas full-area.
- [x] `renderer.js`: game loop rAF 60fps (dt clamp 50ms, DPR-aware); 4 balon spawn stagger 0–1s, x acak berjarak minimal (algoritma retry), jatuh ±55 px/s (varians ±15%), hilang di dasar; teks opsi di-wrap dalam balon (radius adaptif isi teks + fallback perkecil font untuk kata panjang).
- [x] Kursor virtual per pemain (lingkaran + label nama, interpolasi eksponensial); P1 `A`/`D` + `W` toggle jepit, P2 `←`/`→` + `↑` toggle jepit; tahan tombol = gerak terus 600 px/s.
- [x] Logika F4: radius grab = radius balon + toleransi 40px; 1 pemain max 1 balon; 1 balon max 1 pemain; balon mengikuti kursor (x & y); zona kunci pita 12% tepi kiri/kanan yang menyala saat pemain membawa balon (+penanda slot putus-putus); lepas di dalam zona = LOCK (menempel slot, warna identitas, tak bisa diambil), lepas di luar = jatuh lagi; akhir soal via (a) kedua lock, (b) semua balon hilang & tak ada yang dipegang, (c) timeout 25 detik dengan auto-release; REVEAL 2,5 detik (balon benar hijau, terkunci salah merah).
- [x] `main.js`: state machine layar, skor +10/benar (maks 100), pemenang/seri, Main Lagi (soal acak ulang + skor reset + nama tetap), Ganti Pemain (kembali ke WELCOME), cleanup renderer/confetti tanpa leak.
- [x] `confetti.js`: ±150 partikel custom jatuh-berputar dengan sway, didaur ulang (hujan kontinu), palet berbobot (warna identitas pemenang dominan; seri = dua warna), pointer-events none.
- [x] Desain tema gelap playful, identitas P1 `#f97316` / P2 `#38bdf8`, tipografi besar tebal.
- [x] Validasi: `node --check` semua JS lolos (juga diverifikasi `node --input-type=module --check`), referensi file nyambung semua, uji logika full-session lulus (lihat Cara Test).

## File Dibuat/Diubah
- `index.html` — 3 layar (section WELCOME/GAME/RESULT) + muat `css/style.css` & `js/main.js` (module).
- `css/style.css` — tema gelap playful, warna identitas, layout HUD/panel/kartu, tombol.
- `js/data.js` — `loadQuestions()`, `shuffleFisherYates()`, `pickRandomQuestions()`.
- `js/renderer.js` — objek `CONFIG`, `KeyboardInputSource`, `DEFAULT_KEYMAPS`, `GameRenderer` (loop, balon, kursor, zona, grab/lock, reveal, timer bar).
- `js/confetti.js` — `Confetti` class + `FESTIVE_COLORS`.
- `js/main.js` — state machine, HUD/hasil DOM, localStorage, tombol, error fetch, debug hook `?debug`.
- `docs/sprint/sprint-1.md` — laporan ini.
- (Tidak ada file lain diubah; `data/questions.json` TIDAK disentuh.)

## Keputusan Desain & Deviasi dari Plan
- **Zona digambar samar permanen** (bukan hanya muncul saat membawa balon) + slot lingkaran putus-putus; PRD hanya mensyaratkan "menyala saat membawa balon" — tetap dipenuhi (membawa balon → zona terang + pulse), pita samar ditambahkan sebagai afordansi agar pemain tahu ke mana harus geser.
- **Pemain yang sudah lock tidak bisa grab lagi** — PRD tidak eksplisit; keputusan ini mencegah double-lock/ambiguitas antara lock pertama dan sisa waktu soal.
- **Kursor keyboard hanya bergerak horizontal** pada y = 62% tinggi canvas (`CONFIG.cursor.yRatio`) — sesuai PRD F7 (hanya tombol kiri/kanan); pemain menangkap dengan timing saat balon melewati garis kursor.
- **Timer bar sisa waktu** ditambah di atas canvas (hijau→kuning→merah). Tidak diwajibkan PRD, membantu pemain menyadari timeout 25 detik.
- **Opsi sangat panjang** (maks 38 karakter, mis. "Jalan Pegangsaan Timur No. 56, Jakarta"): teks di-wrap (lebar baris 118px), radius balon adaptif dari luas blok teks (48–96px), dan kata tunggal yang tetap kelewat lebar otomatis diperkecil fontnya (min 11px).
- **Keyboard memakai `e.code`** (bukan `e.key`) agar konsisten lintas layout, + `preventDefault` agar halaman tidak ikut scroll.
- **Mode Kamera**: radio disabled dengan badge "aktif di Sprint 3"; nilai `ezharquiz.mode` tersimpan tetap `"keyboard"` di sprint ini; restore mode `"camera"` diabaikan sementara (fallback keyboard) sampai Sprint 3 mengaktifkannya.
- **Debug hook `window.__ezharQuiz`** hanya aktif dengan query `?debug` — untuk QA otomatis/manual tanpa memengaruhi game normal (deviasi kecil dari plan, dilaporkan di sini).
- **`js/hands.js` sengaja belum dibuat** (scope Sprint 2); tidak ada import yang menunjuknya.
- Validasi `node --check` ternyata langsung lolos untuk file ESM `.js` di Node versi ini; tetap diverifikasi ulang dengan `node --input-type=module --check` per file — semua PASS.

## Cara Test Manual
1. Jalankan server lokal dari root proyek: `python3 -m http.server 8000` (atau Live Server), buka `http://localhost:8000/`.
2. **WELCOME**: isi nama (atau kosongkan → placeholder), klik "Cara Main" → panel muncul; pilih Keyboard; klik Mulai. Reload halaman → nama & mode pulih dari localStorage.
3. **GAME**: baca panel soal; P1 `A`/`D` gerak + `W` jepit/lepas; P2 panah. Jepit saat balon menyentuh kursor → balon terangkat mengikuti kursor → bawa ke pita kiri (P1) / kanan (P2) → lepas jepit → balon terkunci di slot; lepas di tengah → balon jatuh lagi. Uji juga membiarkan balon jatuh ke dasar (hilang), dan diam sampai 25 detik (auto-release).
4. Amati REVEAL ±2,5 detik (balon benar hijau / terkunci salah merah), lalu soal berikutnya; skor +10 tiap benar.
5. **RESULT**: setelah 10 soal muncul pemenang ("🏆 [Nama] MENANG!") atau "🤝 SERI!", confetti berwarna dominan identitas pemenang (seri = oranye+biru). "Main Lagi" → 10 soal baru diacak, skor 0, nama tetap; "Ganti Pemain" → kembali ke WELCOME.
6. **Test otomatis (sudah dijalankan penulis sprint, 22 asersi LULUS)**: harness Node yang meng-stub canvas/window/rAF dan meng-inject `MockSource` (kontrak InputSource) mensimulasikan sesi penuh: grab di luar radius ditolak, balon mengikuti kursor, lock/drop zona, pemain terkunci tak bisa grab, 3 kondisi akhir soal (kedua lock / semua hilang / timeout auto-release), payload hasil per soal, akhir sesi, destroy idempoten. (Harness bersifat ephemeral di `/tmp/ezq-renderer-test.mjs`; mudah direplikasi — lihat kontrak di bawah.)

## Bug/Isu yang Diketahui
- Pengujian visual di browser sungguhan belum bisa dijalankan dari lingkungan subagent (browser tidak tersedia); verifikasi render visual (estetika balon, kontras teks, jarak spawn di layar nyata) diserahkan ke integrator sesuai catatan DoD Sprint 1 ("uji browser oleh integrator").
- Canvas hanya menangani resize `window`; perubahan ukuran area canvas tanpa resize window (mis. teks pertanyaan 2 baris → 3 baris saat ganti soal) tidak memicu re-ukuran (efeknya minor, bitmap hanya ter-stretch sesuai CSS).

## Catatan untuk Sprint Berikutnya
**Kontrak & konstanta yang disediakan Sprint 1 (bangun di atas ini, jangan rombak):**

1. **`CONFIG` (ekspor dari `renderer.js`)** — satu-satunya tempat tuning. Struktur:
   - `CONFIG.dprMax` (2)
   - `CONFIG.balloon` — `{ fallSpeed:55, fallVariance:0.15, minRadius:48, maxRadius:96, wrapWidth:118, lineHeight:24, font, spawnTop:-110, staggerStep:0.25, staggerJitter:0.2, spawnMargin:22, spawnGap:26, maxSpawnTries:80, radiusAreaFactor:1.35 }`
   - `CONFIG.grab` — `{ tolerance:40 }`
   - `CONFIG.zone` — `{ widthRatio:0.12, slotYRatio:0.46, slotRadius:56 }`
   - `CONFIG.cursor` — `{ speed:600, yRatio:0.62, smooth:16, radius:15, labelOffset:30 }`
   - `CONFIG.round` — `{ timeout:25, revealDuration:2.5, lockSettleDelay:0.35, lockAnimDuration:0.22 }`
   - `CONFIG.timerBar` — `{ width:230, height:8, warnRatio:0.45, dangerRatio:0.2 }`
   - Sprint 3 playtest tuning cukup mengubah angka di sini (plan Sprint 3 poin 6).
2. **Kontrak `InputSource`** — interface yang sudah dipakai renderer (Sprint 3: buat `HandSource` yang sama):
   ```
   { get x(): Number(px canvas), get y(): Number, get pinching(): Boolean,
     get present(): Boolean, update(dt, w, h), destroy() }
   ```
   Injeksi lewat `new GameRenderer(canvas, { sources: {1: src, 2: src} })`. Default: `KeyboardInputSource` (juga diekspor) dengan peta tombol `DEFAULT_KEYMAPS = {1:{left:'KeyA',right:'KeyD',pinch:'KeyW'}, 2:{left:'ArrowLeft',right:'ArrowRight',pinch:'ArrowUp'}}`. Semua deteksi tepi (rising/falling edge `pinching`) sudah ditangani renderer — sumber input cukup melaporkan status jepit saat ini. Catatan: grab memakai posisi kursor **tampilan** (hasil lerp `CONFIG.cursor.smooth`); `HandSource` cukup set `x`/`y` per frame dari landmark yang sudah di-mirror & dinormalisasi ke koordinat canvas (kontrak output tangan Sprint 2: x,y 0..1 → kalikan W,H).
3. **API `GameRenderer`**:
   - `constructor(canvas, { players:[{id,name,color}], sources?, onQuestionStart?, onQuestionEnd?, onSessionEnd? })`
   - `startSession(questions)` — mulai loop + soal pertama; `stop()` — bekukan loop; `destroy()` — stop + lepas semua listener (idempoten, aman dipanggil dua kali).
   - Callback payload:
     - `onQuestionStart({ index /*0-based*/, total, category, question, options })`
     - `onQuestionEnd({ index, results })` — terpanggil saat REVEAL dimulai; `results[playerId] = { locked:Boolean, optionIndex:Number|null, correct:Boolean }`. **Skor BUKAN urusan renderer** — main.js yang menambah +10.
     - `onSessionEnd({ total })`.
   - State internal per sesi (baca-only dari luar): `phase` (`'idle'|'question'|'reveal'`), `qIndex`, `balloons[]`, `held{playerId→balon}`, `locks{playerId→balon}`, `cursors{playerId→{x,y}}`, `sources`, `W/H` (px CSS; DPR sudah ditangani internal via `setTransform`).
   - Objek balon: `{ optionIndex, text, lines[], fontSize, radius, x, y, vy, spawnDelay, active, state:'falling'|'held'|'locked'|'gone', heldBy, lockedBy, lockAnim, lockFrom }`.
4. **`data.js`** — `loadQuestions(url?)`, `shuffleFisherYates(arr)` (pure), `pickRandomQuestions(bank, 10)`. Opsi tidak pernah diacak (indeks `answer` sahih).
5. **`confetti.js`** — `new Confetti(canvas)`, `setPalette(colors[])` (entri ganda = bobot), `start()/stop()/destroy()`, plus ekspor `FESTIVE_COLORS`. Pola palet hasil: pemenang → `[warnaPemenang×5, ...FESTIVE]`; seri → `[p1×3, p2×3, ...FESTIVE]`.
6. **`main.js`** — objek `state` internal: `{ screen, bank, names{1,2}, mode, scores{1,2}, renderer, confetti }`. Warna identitas `PLAYER_COLORS = {1:'#f97316', 2:'#38bdf8'}` — pakai nilai yang sama di `hands.js`/overlay Sprint 2 agar konsisten. Skor +10 dikalkulasi di callback `onQuestionEnd`. `window.__ezharQuiz = { state }` tersedia hanya dengan URL `?debug` (QA tanpa menyentuh game normal).
7. **localStorage**: `ezharquiz.names` = `{"p1":string,"p2":string}` (trim), `ezharquiz.mode` = `"camera"|"keyboard"` (sprint ini selalu menyimpan `"keyboard"`; Sprint 3 aktifkan radio Kamera + pulihkan `"camera"`).
8. **Hal yang perlu diperhatikan Sprint 2/3**: loop deteksi tangan harus terpisah dari game loop (renderer sudah 60fps mandiri — cukup `HandSource` menulis posisi terakhir, jangan blokir `update()` dengan `await`); assignment tangan kiri=P1/kanan=P2 dari Sprint 2 tinggal memetakan ke `sources[1]/[2]`; UI indikator status tangan (hijau/merah, PRD F6) bisa memakai `present` tiap sumber — HUD DOM sudah ada di `index.html` (`hud-p1-name` dll) tinggal ditambah elemen indikator.
