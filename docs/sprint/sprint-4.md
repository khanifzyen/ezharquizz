# Sprint 4 — Polish & QA Final
Status: Selesai
Rentang: 2026-10-06

## Ringkasan
Sprint penutup: pengalaman game dipoles (countdown 3-2-1 sebelum soal pertama,
pop-in balon, ayunan bob halus saat jatuh, transisi fade antar soal, efek skor
"+10" mengambang, animasi panel pertanyaan & angka skor HUD, ringkasan
"x/10 benar" di layar hasil, tips pencahayaan di kalibrasi) dan diperkuat
terhadap edge case: tab blur/hidden otomatis mem-pause loop & timer soal,
kamera mati di tengah game melanjutkan permainan dengan keyboard TANPA reload,
nama super panjang terpotong ellipsis di kursor/zona canvas, opsi kata tunggal
super panjang di-hard-wrap per karakter dengan radius adaptif yang lebih aman,
dan `destroy()` renderer kini sepenuhnya idempoten. Audit performa memindahkan
semua string warna/font yang bergantung warna pemain + posisi slot ke cache
(dihitung sekali per sesi, bukan per frame). `README.md` lengkap ditulis di
root. QA: harness baru `/tmp/ezq-sprint4-test.mjs` — **72/72 asersi LULUS**
(stabil ≥6× berurutan), harness sprint lama tetap hijau (sprint-3: 70/70 setelah
patch kecil untuk countdown; hands: 71/71), `node --check` lolos semua file JS.
Lingkungan pengerjaan tidak memiliki browser/kamera — semua verifikasi adalah
logika murni (Node) + audit statis; uji visual/kamera nyata diserahkan ke
integrator (panduan di bagian Cara Test Manual).

## Yang Dikerjakan
Pemetaan ke scope Sprint 4 (implementation-plan):
- [x] **Scope 1 — Polish visual** (semua canvas/CSS native, tanpa library):
  - **Pop-in balon**: animasi scale `easeOutBack` (overshoot kecil) 0,3 dtk
    (`CONFIG.balloon.popIn`) yang dipicu saat balon PERTAMA masuk area pandang
    (`b.seen/seenT`) — bukan saat spawn di atas layar yang tak terlihat mata.
  - **Bob halus saat jatuh**: ayunan horizontal sinusoidal ±5 px di sekitar
    `baseX` (`CONFIG.balloon.bobAmp/bobFreq`, frekuensi/phase diacak per balon);
    kecepatan jatuh vertikal tetap konstan (PRD F3). Saat balon dilepas/di-drop,
    ayunan di-reset dari titik lepas (`_resetBob`).
  - **Transisi fade antar soal**: overlay warna latar muncul-menghilang 0,35 dtk
    di awal setiap soal (`CONFIG.round.questionFade`, `_fadeT`).
  - **Efek skor "+10" mengambang**: muncul di slot zona pemain yang mengunci
    jawaban BENAR saat reveal (`CONFIG.popups.life/rise`), naik & memudar.
  - **Styling panel & HUD final**: animasi slide-fade panel pertanyaan tiap ganti
    soal (`q-in`), "pop" angka skor HUD saat bertambah (`score-pop`), styling
    notifikasi arena game, ringkasan hasil, dan tips kalibrasi (CSS).
- [x] **Scope 2 — UX**: countdown 3-2-1 (fase `countdown` di renderer, overlay
  di canvas layar GAME — sekali per sesi sebelum soal pertama, kursor tetap
  hidup agar pemain bisa bersiap); tips pencahayaan singkat di layar kalibrasi
  (terang, hindari contre-jour, tangan setinggi dada); layar RESULT menambah
  ringkasan jumlah benar per pemain ("7/10 benar") — dihitung main.js dari
  callback `onQuestionEnd` yang sudah ada (`state.correct`).
- [x] **Scope 3 — Edge case**:
  - (a) **Tab blur/hidden** → `visibilitychange` di renderer: `pause()`
    (stop loop + cancel rAF; `phaseTime` membeku) / `resume()` (langsung,
    `_lastTs` di-reset → tanpa lompatan dt; clamp dt 0,05 dtk tetap sebagai
    lapis kedua). Pilihan "resume langsung" (tanpa overlay "Lanjutkan?")
    diambil karena paling sederhana dan aman dari cheat timer — selama
    tersembunyi loop tidak berjalan sama sekali sehingga waktu tidak bisa
    dihabiskan/dihentikan curang. Bonus: `KeyboardInputSource` mengabaikan
    keydown saat `document.hidden` (anti toggle jepit hantu).
  - (b) **Kamera mati mid-game** → `main.js` memasang health-watch
    (`attachCameraHealthWatch`): listener `ended` pada SEMUA track stream +
    elemen video → `handleCameraStreamEnded`: di layar GAME →
    `switchGameInputToKeyboard()` (destroyCamera + `renderer.setSources()`
    dengan `KeyboardInputSource` — skor & soal berjalan lanjut tanpa reload)
    + notifikasi di arena; di kalibrasi → jalur gagal-kamera lama (pesan ramah
    + auto keyboard); di layar lain → cukup matikan kamera. `track.stop()`
    memang tidak meng-fire `ended` (spesifikasi) + listener dilepas lebih dulu
    di `destroyCamera`, jadi tidak ada false-positive saat pembongkaran normal.
  - (c) **Nama super panjang** → HUD & RESULT sudah ellipsis via CSS (Sprint 1);
    kini label nama di KURSOR dan ZONA (canvas) juga dipotong ellipsis
    (`truncateLabel`, `CONFIG.cursor/zone.labelMaxWidth`, dihitung sekali di
    konstruktor — input UI memang dibatasi `maxlength=18`, ini pengaman).
  - (d) **Main Lagi berulang tanpa leak** → audit + harness: renderer kini
    menambah tepat 1 listener `resize` + 1 `visibilitychange` + 2 keydown/keyup
    per sumber keyboard; `destroy()` benar-benar sekali-jalan (flag
    `_destroyed`, `sources` dikosongkan) dan 3× Main Lagi berturut-turut
    mengembalikan semua listener ke baseline; timeout notifikasi game
    (`cam.noticeTimer`) ikut dibersihkan.
  - (e) **Opsi terpanjang tetap muat** → `hardWrapLines`: kata tunggal yang
    masih lebih lebar dari `wrapWidth` walau font sudah minimum (11px) dipecah
    PER KARAKTER; radius adaptif mendapat batas bawah baru
    `max(luas, tinggiBlok/2+12, lebarBaris/2+12)` sehingga blok teks tinggi
    tidak lagi meluber dari balon (masih dibatasi `maxRadius`).
- [x] **Scope 4 — Performa** (audit alokasi per frame, tanpa mengubah perilaku):
  pindahan ke cache — string warna zona/kursor/link/palet held/locked per pemain
  (dulu ±20 alokasi string `hexToRgba`/`lightenHex`/`darkenHex` per frame),
  string font (`FONT_LABEL/POPUP/COUNTDOWN`, warna timer bar, `b.font` per balon
  menggantikan `font.replace()` per frame), posisi slot zona (`_slots`, dihitung
  ulang hanya saat resize), lookup pemain (`_playerById` menggantikan
  `players.find()` per balon per frame), label kursor/zona (dihitung sekali).
  Yang tetap per frame (disadari, tidak dihindari): `createRadialGradient` per
  balon (posisinya bergerak), objek popup hanya selama efek aktif.
  `measureText` tetap hanya saat pembuatan balon (bukan di loop render).
- [x] **Scope 5 — `README.md`** di root: deskripsi, cara menjalankan (Live
  Server / `npx serve` / `python3 -m http.server`) + alasan server lokal
  (`fetch` JSON + `getUserMedia` butuh http/HTTPS), cara main keyboard &
  gesture, cara edit `data/questions.json` (format + aturan `answer`/4 opsi),
  catatan HTTPS untuk deploy, kamera butuh internet pertama kali (CDN
  MediaPipe, mode keyboard offline), struktur folder, troubleshooting (kamera
  ditolak, tangan tidak terdeteksi → pencahayaan, dsb.), hook `?debug`.
- [x] **Scope 6 — QA final**: harness gabungan `/tmp/ezq-sprint4-test.mjs`
  (72/72), regresi harness sprint 2–3 (71/71 & 70/70), `node --check` +
  `node --input-type=module --check` semua JS, audit referensi DOM/import
  nyambung semua (42 id terverifikasi ada). Rincian daftar cek F1–F7 di bawah.

## File Dibuat/Diubah
- `js/renderer.js` (diubah, inti sprint) — `CONFIG` bertambah
  (`balloon.popIn/bobAmp/bobFreq`, `zone.labelMaxWidth`,
  `cursor.labelMaxWidth`, `round.questionFade`, `countdown.duration`,
  `popups.life/rise`); helper baru `easeOutBack`, `hardWrapLines`,
  `truncateLabel`; fase baru `countdown`; API baru `pause()`, `resume()`,
  `setSources()`; `destroy()` idempoten + lepas listener `visibilitychange`;
  `_tick` menjadi field kelas; `_update` dipecah (`_updateInput`,
  `_updatePopups`); bob + seen/pop-in + `_resetBob` + `_fadeT`; batas bawah
  radius; render baru `_drawPopups`/`_drawCountdown`/`_drawQuestionFade`;
  pop-in via translate+scale di `_drawBalloon`; semua cache performa; balon di
  atas layar tidak digambar (`!b.seen` → skip).
- `js/main.js` (diubah) — import `KeyboardInputSource`/`DEFAULT_KEYMAPS`;
  `state.correct`/`state.sessionQuestions`; ringkasan "x/10 benar" di RESULT;
  animasi `q-in` panel soal + `popScore` HUD; health-watch kamera
  (`attach/detachCameraHealthWatch`, `handleCameraStreamEnded`,
  `switchGameInputToKeyboard`); notifikasi arena `showGameNotice/hideGameNotice`
  (+ pembersihan timeout anti-leak); `hideGameNotice` di beginSession/
  showResult/changePlayers.
- `index.html` (diubah) — `id="question-box"`; `#game-notice` di arena GAME;
  `rp-correct` ("x/10 benar") per pemain di RESULT; blok tips pencahayaan di
  kalibrasi; item Cara Main menyebut hitungan 3-2-1.
- `css/style.css` (diubah) — animasi `q-in` & `score-pop` (+keyframes),
  `.game-notice`, `.rp-correct`, `.calib-tips`.
- `README.md` (BARU) — dokumentasi pengguna/deploy lengkap.
- `docs/sprint/sprint-4.md` — laporan ini.
- Tidak diubah: `js/hands.js`, `js/hand-input.js`, `js/data.js`,
  `js/confetti.js`, `data/questions.json`.
- Ephemeral (di luar project): `/tmp/ezq-sprint4-test.mjs` (BARU, 72 asersi);
  `/tmp/ezq-sprint3-test.mjs` dipatch kecil (lihat Deviasi #4).

## Keputusan Desain & Deviasi dari Plan
1. **Countdown di renderer (fase `countdown`), bukan DOM main.js** — sesuai
   instruksi "overlay di canvas/layar GAME"; memilih canvas agar ikut teruji
   harness, ikut pause saat tab hidden, dan konsisten dengan timer soal yang
   memang hidup di renderer. Hanya SEKALI per sesi (sebelum soal pertama),
   sesuai plan; soal ke-2 dst. langsung.
2. **Pause = stop loop, resume langsung tanpa overlay konfirmasi** — opsi
   paling sederhana & aman dari cheat timer: selama hidden tidak ada frame
   yang diproses sehingga `phaseTime` (timer 25 dtk) membeku sempurna; saat
   kembali, dt dihitung dari waktu resume (clamp 0,05 dtk sebagai lapis kedua).
   Trade-off: pemain yang menyembunyikan tab juga "menghentikan waktu lawan",
   tapi ia juga tidak bisa bermain — tidak ada keuntungan yang bisa dicuri.
3. **Kamera mati → sumber ditukar, balon dipegang DILEPAS JATUH (bukan lock)** —
   `setSources()` memakai jalur `_forceDrop` yang sama dengan tangan hilang
   (PRD F6): pergantian sumber bukan kehendak pemain melepas jepitan, jadi
   tidak boleh mengunci. Kursor tampilan & deteksi tepi pinch di-reset agar
   sumber baru tidak mewarisi edge palsu. `switchToKeyboardMode()` juga dipanggil
   agar `ezharquiz.mode` tersimpan konsisten dengan jalur fallback lain.
4. **Patch kecil pada harness ephemeral sprint-3** (`/tmp/ezq-sprint3-test.mjs`):
   sesi kini dibuka countdown sehingga asersi pertamanya (soal langsung aktif)
   perlu pump 3 dtk di awal. Harness berada di luar project dan perilaku baru
   memang disengaja — patch ini hanya menjaga suite regresi tetap hijau (70/70).
5. **Batas bawah radius balon (perilaku visual, bukan gameplay)** — radius kini
   `max(rumus-luas, tinggiBlok/2+12, lebarBarisTerlebar/2+12)` (tetap clamp
   min/max). Untuk opsi bank yang ada (maks 38 karakter, ber-spasi) radius
   tidak berubah (floor lebih kecil dari hasil rumus luas); floor hanya aktif
   untuk blok teks tinggi/kata ekstrem — melindungi teks agar tidak meluber.
   Deviasi kecil dari kalibrasi visual Sprint 1, dinyatakan di sini.
6. **Teks "+10" hardcode di renderer** — PRD F5 mematok +10 poin per benar;
   jika `POINTS_PER_CORRECT` di main.js suatu saat diubah, teks efek harus
   diubah bersama (diberi komentar di kedua tempat).
7. **Pop-in memakai radius logis untuk grab** — selama 0,3 dtk animasi, hitungan
   jarak grab tetap memakai radius penuh (bukan radius terskala). Balon baru
   tampak di tepi atas layar sehingga praktis tidak memengaruhi permainan;
   kesederhanaan dipilih.
8. **Bob hanya visual pada sumbu-x di sekitar `baseX`** — `b.x` tetap menjadi
   posisi logis (grab/lock mengikuti `b.x`) sehingga mekanika F4 tidak berubah;
   amplitudo 5 px < spawnGap 26 px sehingga jaminan non-tumpang tindih spawn
   tetap sahih.
9. **`detectForVideo` tetap sinkron di main thread** (warisan Sprint 2) —
   di luar scope refactor; dicatat ulang di known issues.
10. **Tidak menambah tombol/opsi baru di UI** — notifikasi kamera mati bersifat
    informatif (auto-switch), bukan dialog pilihan, sesuai prinsip tanpa
    scope-creep.

## Cara Test Manual
**A. Otomatis (sudah dijalankan penulis sprint — 72/72 PASS, stabil ≥6×):**
`node /tmp/ezq-sprint4-test.mjs`. Sepuluh seksi:
- **A. Countdown** (9): sesi dibuka fase `countdown`; soal pertama aktif tepat
  setelah 3 dtk; soal kedua TANPA countdown; `CONFIG.countdown.duration = 3`.
- **B. Sesi penuh 10 soal sumber CAMPURAN** (8): P1 `KeyboardInputSource`
  (event keydown nyata via stub window) + P2 `HandSource` (mock controller) —
  10 `onQuestionStart` berurutan 0..9, 10 `onQuestionEnd`, 1 `onSessionEnd`;
  payload results konsisten dengan `answer`; skor = jumlah benar × 10; tanpa
  deadlock.
- **C. Pause/resume visibility** (10): hidden → loop berhenti & rAF dibatalkan;
  frame "nyasar" saat hidden tidak majukan timer (5 dtk beku); keydown diabaikan
  saat hidden & berfungsi setelahnya; visible → resume langsung, `_lastTs`
  reset, frame pertama pasca-resume hanya maju 1 frame (0,0167 dtk); pause saat
  countdown ikut membekukan countdown lalu lanjut.
- **D. Switch kamera→keyboard mid-game** (9): P1 gesture memegang balon →
  tangan hilang > grace → balon lepas → `setSources(keyboard)`: sumber lama
  di-destroy, kursor & tepi pinch reset, KeyD menggerakkan kursor, KeyW
  menjepit, soal tetap selesai tanpa reload.
- **E. Main Lagi 3×** (3): 3 sesi penuh berturut-turut selesai & listener
  (resize/keydown/keyup/visibilitychange) kembali ke baseline setiap kali.
- **F. Ellipsis nama** (4): nama 38 karakter → label kursor & zona terpotong
  "…" dan lebarnya (stub) ≤ maksimum; nama pendek utuh.
- **G. Opsi panjang** (6): kata tunggal 44 karakter tanpa spasi → hard-wrap per
  karakter (semua baris ≤ wrapWidth), radius ≥ floor tinggi/lebar blok (atau
  mentok maxRadius), semua radius dalam [48,96]; opsi ber-spasi wrap normal.
- **H. Efek "+10"** (9): P1 lock benar + P2 lock salah → tepat 1 popup, teks
  "+10", warna identitas P1, di slot P1; mati setelah `popups.life`.
- **I. Logika polish** (9): balon jatuh monoton; x dalam ±bobAmp dari baseX;
  seen/seenT terpicu tepat saat masuk pandangan; lepas di luar zona → baseX
  di-reset ke titik lepas (bukan posisi spawn); `_fadeT` mentok questionFade.
- **J. Destroy & paritas** (6): default keyboard utuh; tepat +1 resize, +2
  keydown, +1 visibilitychange per renderer; destroy 3× panggil → semua
  kembali baseline; flag konsisten.

Regresi: `node /tmp/ezq-sprint3-test.mjs` → 70/70; `node /tmp/ezq-hands-test.mjs`
→ 71/71. `node --check` semua `js/*.js` PASS (juga
`node --input-type=module --check`).

**B. Manual dengan kamera nyata (butuh webcam + internet pertama kali —
dilakukan integrator):**
1. `python3 -m http.server 8000` → `http://localhost:8000/`.
2. **Keyboard penuh**: pilih Keyboard → Mulai → **perhatikan countdown 3-2-1**
   di tengah canvas → main 10 soal → perhatikan pop-in balon saat muncul di
   tepi atas, ayunan halus saat jatuh, fade antar soal, animasi panel soal,
   "+10" mengambang + angka skor HUD membesar saat benar, ringkasan "x/10
   benar" di RESULT.
3. **Pause**: saat soal berjalan, ganti tab/minimize ±10 dtk → kembali → game
   melanjutkan dari titik yang sama (timer tidak habis/berulang).
4. **Main Lagi 3×** berturut-turut → tiap sesi normal, tidak makin berat
   (cek DevTools Performance/console bebas error).
5. **Kamera**: mode Kamera → kalibrasi (perhatikan blok TIPS pencahayaan baru)
   → Lanjut → main penuh dengan gesture. Di tengah soal, **cabut kamera**
   (atau matikan dari sistem) → notifikasi merah "Kamera terputus…" muncul,
   PiP hilang, permainan BISA DILANJUTKAN DENGAN KEYBOARD tanpa reload; balon
   yang sedang dipegang jatuh kembali (tidak terkunci).
6. Nama panjang (18 karakter) → HUD/RESULT terpotong "…", label kursor & zona
   di canvas juga terpotong rapi.
7. Estetika & kenyamanan: ukuran balon dengan opsi terpanjang ("Jalan
   Pegangsaan Timur No. 56, Jakarta"), keterbacaan countdown, kontras
   notifikasi — verifikasi mata.

## Hasil QA — daftar cek F1–F7 PRD
| Fitur | Status | Dasar |
|---|---|---|
| **F1** Bank soal & seleksi acak | **LULUS** (logika) | 100 soal/10 kategori/4 opsi terverifikasi; Fisher–Yates & 10-acak-tanpa-duplikat teruji harness Sprint 1; urutan opsi tak diacak |
| **F2** Welcome & input nama | **LULUS** (statis+logika) | placeholder/whitespace, localStorage, mode default Kamera — audit statis + pola Sprint 1; verifikasi visual browser menyusul |
| **F3** Jawaban jatuh | **LULUS** (logika) | spawn stagger/x berjarak/jatuh konstan/hilang di dasar — harness Sprint 1 & 4 (monoton y, bob ±5 px) |
| **F4** Tangkap–geser–kunci | **LULUS** (logika) | harness Sprint 1/3/4: grab radius+40, zona 12%, lock/drop, 3 kondisi akhir soal, reveal 2,5 dtk, tanpa deadlock |
| **F5** Skor & hasil + confetti | **LULUS** (logika; visual confetti BELUM terlihat) | +10/benar, maks 100, pemenang/seri, palet confetti — logika sesuai PRD; render visual menunggu browser |
| **F6** Kamera & deteksi tangan | **LULUS (logika) / BELUM-DIUJI (kamera nyata)** | 71 asersi hands.js (mirror, pinch hysteresis, tracker, stabil kalibrasi, destroy) + grace 1,5 dtk via renderer; kalibrasi/PiP/izin/fps NYATA butuh hardware |
| **F7** Fallback keyboard | **LULUS** (logika) | sesi penuh 100% keyboard diuji harness; paritas gesture≈keyboard (satu antarmuka InputSource) |

Tambahan Sprint 4: countdown (LULUS-logika), pause/resume (LULUS-logika),
kamera-mati→keyboard (LULUS-logika; wiring main.js diverifikasi statis —
main.js tak bisa diimpor Node karena coupling DOM), anti-leak (LULUS),
ellipsis (LULUS), opsi panjang (LULUS-logika dengan stub metrik font).
`node --check` semua file JS: PASS.

## Bug/Isu yang Diketahui
- **Pengujian kamera nyata & visual browser belum dilakukan** — lingkungan
  subagent tanpa browser/webcam. Semua verifikasi = logika murni (72+70+71
  asersi) + audit statis. Uji kamera/fps/estetika adalah tugas integrator
  (Bagian B atas).
- **`detectForVideo` sinkron di main thread** (warisan Sprint 2) — jank minor
  possible di mesin lambat; mitigasi dedupe frame + loop terpisah; pengukuran
  fps nyata menunggu browser.
- **Tangan menyilang menukar slot pemain seketika** (karakter desain sisi,
  warisan Sprint 3) — kursor ikut "terbang" melewati layar (lerp meredam);
  tidak dipoles sprint ini agar tidak mengubah model assignment PRD F6.
- **Opsi kata tunggal ekstrem (>±50 karakter)**: hard-wrap + floor radius
  menjamin lebar, namun bila floor melebihi `maxRadius` 96 px teks masih bisa
  sedikit meluber vertikal — bank soal nyata (maks 38 karakter ber-spasi) tidak
  menyentuh kasus ini.
- **Popup "+10" hardcode** — lihat Keputusan #6.
- **rAF throttling browser saat hidden** juga membekukan loop deteksi tangan &
  overlay (tanpa penanganan khusus) — aman: game loop juga pause; semuanya
  resume saat tab kembali.
- Event `visibilitychange` diuji via handler internal harness (bukan event
  browser sungguhan) — perilaku event asli standar dan rendah risiko, tetap
  masuk daftar uji manual integrator.

## Catatan untuk Sprint Berikutnya
Tidak ada sprint berikutnya — proyek 4 sprint selesai. Jika akan dilanjutkan
(tuning/playtest), titik masuknya: `CONFIG` (renderer.js),
`HANDS_CONFIG` (hands.js), `HAND_INPUT_CONFIG` (hand-input.js); API renderer
terbaru: `pause()/resume()/setSources()`; fase baru `countdown`; flag
`_destroyed`; kontrak `InputSource` tidak berubah (backward-compatible).

---

## Status Proyek Akhir
**Keempat sprint SELESAI** (fondasi keyboard → kamera/deteksi → kontrol
gesture → polish & QA). Game playable penuh dua mode, siap di-host static
tanpa perubahan kode.

**Cara menjalankan** (rincian di `README.md`):
```bash
cd ezharquizz && python3 -m http.server 8000   # atau: npx serve . / Live Server
# buka http://localhost:8000/
```
Deploy publik: GitHub Pages/Netlify (HTTPS otomatis — wajib untuk kamera).

**Yang perlu diuji user dengan kamera nyata** (hal yang TIDAK bisa diverifikasi
penulis sprint):
1. Kalibrasi 2 tangan nyata (stabilitas 1,5 dtk, assignment kiri/kanan,
   re-assign saat tukar sisi) dan kualitas deteksi pinch < 100 ms.
2. Kenyamanan jangkauan gesture full-2D + grace period 1,5 dtk saat tangan
   hilang; indikator HUD hijau/merah; overlay rangka tangan di PiP.
3. Fallback nyata: tolak izin kamera, matikan jaringan saat memuat CDN,
   cabut kamera DI TENGAH GAME (notifikasi + lanjut keyboard tanpa reload).
4. Performa 60 fps nyata saat deteksi aktif (mesin sasaran) + jank
   `detectForVideo`.
5. Verifikasi visual semua polish Sprint 4: countdown, pop-in, bob, fade,
   "+10", animasi panel/skor, ringkasan hasil, tips kalibrasi, ellipsis nama,
   serta pause/resume saat ganti tab di browser nyata.

---

## Lampiran: Uji Integrasi Browser oleh Integrator (2026-10-06)

Smoke test di browser nyata (in-app browser, viewport 1280×800,
`python3 -m http.server` di localhost, mode keyboard, `?debug`):

| Cek | Hasil |
|---|---|
| Halaman dimuat, semua ES module resolve, tidak ada error fatal | ✅ |
| Layar WELCOME: input nama, radio mode (Kamera default ter-check), tombol Mulai/Cara Main | ✅ |
| Isi nama → pilih Keyboard → Mulai → layar GAME tampil | ✅ |
| Countdown "Bersiap! 3" tampil & transisi ke fase soal | ✅ |
| Render canvas: panel soal + kategori ("SOAL 1/10 · SAINS — Lambang kimia untuk emas..."), 4 balon opsi terbaca (Cu/Fe/Ag/Au), HUD Budi/Sari + skor, kursor berlabel, zona kiri/kanan berwarna, timer bar | ✅ |
| localStorage: `ezharquiz.names` {"p1":"Budi","p2":"Sari"} & `ezharquiz.mode` "keyboard" tersimpan | ✅ |
| Interaktif gameplay real-time di browser | ⚠️ Tidak dapat diuji penuh — pane browser embedded me-throttle rAF ke ±2 fps (game slow-motion). Ini keterbatasan lingkungan pengujian, bukan bug game: state machine, fisika, dan sesi penuh (termasuk grab→lock→reveal→skor→Main Lagi) telah diverifikasi harness Node (72 asersi sprint ini). Perlu dikonfirmasi user di browser normal. |
| Catatan kosmetik | Satu balon sempat tumpang tindih di atas area sidebar zona saat jatuh — by design (balon jatuh bebas di seluruh canvas; zona adalah area drop, bukan penghalang). |

**Uji lanjutan (hari yang sama) — mode KAMERA dengan kamera nyata:**
- Perangkat: `Integrated Camera (0c45:64ab)` terdeteksi OS & browser;
  `getUserMedia` langsung live **1280×720 @30fps** tanpa error izin.
- Pipeline penuh game terverifikasi: MediaPipe Tasks Vision termuat dari CDN →
  layar kalibrasi menampilkan preview + skeleton rangka tangan → status
  "Siap! Kedua tangan stabil" & tombol Lanjut aktif (2 tangan nyata terdeteksi) →
  layar GAME mode kamera: PiP pojok berisi feed kamera dengan overlay skeleton
  (oranye P1 kiri / biru P2 kanan), indikator "TANGAN" hijau di HUD kedua pemain,
  kursor kedua pemain aktif mengikuti tangan nyata, balon & zona render normal,
  tanpa error console.
- Harness regresi terkonsolidasi dibuat ulang oleh integrator setelah harness
  ephemeral sprint terhapus: **78 asersi LULUS** (data.js, pure helpers hands.js,
  HandTracker, HandSource+grace, sesi penuh renderer, pause/resume, forceDrop,
  setSources, timeout, destroy) — stabil ≥2× run.
- Keterbatasan tersisa: pane browser embedded men-throttle rAF (~2fps) sehingga
  kecepatan gameplay real-time penuh perlu dicoba user di browser normal.
