# Sprint 6 — Editor Quiz (GUI bank soal + gerbang password)
Status: Selesai
Rentang: 2026-10-07

## Ringkasan
Permintaan pengguna: editor user-friendly untuk `data/questions.json`,
dibuka dari tombol di layar depan, dilindungi password (default `12345`,
**wajib ganti** pada pemakaian pertama). Skenario lokal = bisa menyimpan;
 saat di-deploy ke hosting statis tetap terpakai untuk mengedit salinan
lokal + push (hosting statis tidak bisa ditulis dari browser).

## Yang Dikerjakan
- [x] Tombol **🛠 Editor Quiz** di layar WELCOME → layar `#screen-editor`.
- [x] **Gerbang password** (`editor.js`): cek hash SHA-256 di localStorage
      (`ezharquiz.editorAuth`); tanpa hash → bandingkan default `12345` →
      WAJIB lewat gerbang "Ganti Password" (min 4 karakter, ≠ default,
      konfirmasi) sebelum masuk. Password ditanya TIAP kali masuk. Tautan
      dua-klik "reset ke default" saat password custom aktif.
- [x] **Editor utama**: sidebar (cari teks bebas, filter kategori, + Soal
      Baru, daftar soal dengan meta `#id · kategori` + preview, statistik
      "N soal · M kategori · K belum valid") + form (ID readonly, kategori
      dengan datalist, pertanyaan textarea, 4 opsi + radio jawaban benar,
      Duplikat, Hapus dua-klik "Yakin?"). Validasi langsung
      (`validateQuestion`): pertanyaan/4 opsi wajib isi, opsi tak duplikat,
      1 jawaban benar, kategori terisi; soal invalid ditandai merah di
      daftar & menghalangi Simpan (langsung memilih soal bermasalah).
- [x] **Penyimpanan**: mode SIMPAN LANGSUNG via File System Access API
      (`showOpenFilePicker` → `createWritable`), handle disimpan di
      IndexedDB (`ezharquiz-editor`) + auto-reconnect saat izin masih
      granted / chip "klik untuk menghubungkan" bila prompt; fallback
      MODE UNDUH (blob → `questions.json`) untuk Firefox/Safari/belum
      pilih file. `beforeunload` guard saat ada perubahan.
- [x] Simpan → `setBank` ke main.js: **sesi game berikutnya memakai bank
      baru tanpa reload**.
- [x] Serialisasi identik format file asli (satu objek per baris —
      `serializeBank`), `nextQuestionId` = max+1.
- [x] Cache-busting dinaikkan `?v=5` → `?v=6` (index.html + semua import
      main.js) karena semua aset berubah.

## File Dibuat/Diubah
- `js/editor.js` (BARU, ±530 baris) — semua logika editor + pure helpers
  (`validateQuestion`, `nextQuestionId`, `serializeBank`) diekspor untuk uji
- `index.html` — tombol Editor Quiz di WELCOME, section `#screen-editor`
  (2 gerbang + editor utama + toast), `?v=6`
- `css/style.css` — seluruh gaya editor (gate, sidebar, form, toast, chip)
- `js/main.js` — `screens.editor`, inisialisasi `initEditor({onExit,setBank})`
- `docs/PRD.md` — fitur baru **F8 Editor Quiz**; `README.md` — seksi
  "Editor Quiz" + "Mengedit setelah di-deploy"

## Keputusan Desain & Deviasi dari Plan
1. **File System Access API, bukan server lokal** — tetap 100% tanpa
   backend sesuai arsitektur project; menyimpan langsung ke file lokal yang
   DIPILIH pengguna (bukan menimpa sembarang path). Konsekuensi: perlu
   Chrome/Edge untuk simpan langsung; Firefox/Safari mode unduh.
2. **Password = hash SHA-256 localStorage** — gerbang UX (kode client bisa
   dibypass); dicatat jujur di PRD/README/editor.js.
3. **Kotak cari `type="text"`** (bukan `type="search"`) — perilaku clear
   bawaan browser untuk search input tidak konsisten di beberapa build.
4. Hapus memakai pola dua-klik (bukan `confirm()`) — tidak memblokir,
   dan tidak menyulitkan otomasi/iframe.

## Cara Test Manual
1. Buka game → **🛠 Editor Quiz** → password salah ditolak → `12345` →
   diminta ganti password (uji: beda konfirmasi/m terlalu pendek/sama dengan
   default ditolak) → editor terbuka dengan 100 soal.
2. Cari "Puncak Jaya" (1 hasil) → pilih → form terisi. Edit opsi → titik
   "● belum disimpan" muncul. + Soal Baru → ID #101 → isi → radio ✓.
3. **📁 Buka File…** → pilih `data/questions.json` project → chip hijau
   `💾 questions.json` → **💾 Simpan** menulis langsung ke file (cek isi
   file) → mulai game → soal baru bisa muncul.
4. Hapus soal uji (dua klik) → Simpan. Keluar-masuk editor → login dengan
   password baru (tanpa diminta ganti lagi). Lupa? reset dua-klik → default.
5. Firefox/Safari: chip "Mode Unduh" → Simpan mengunduh `questions.json`.

## Hasil Verifikasi (integrator, browser nyata)
- Harness regresi: **94/94 asersi LULUS** (10 baru: validasi soal 7 kasus,
  `nextQuestionId`, `serializeBank` round-trip + format).
- `node --check` 7/7 file JS lolos.
- E2E browser (Chromium embedded): password salah ditolak; `12345` → gerbang
  ganti (konfirmasi beda & <4 karakter ditolak); password baru tersimpan
  (hash di localStorage); login ulang dengan password baru langsung masuk;
  100 soal dimuat; cari → 1 hasil; clear → 100; tambah soal valid ID #101;
  Simpan (mode unduh) → toast + **bank game di memori jadi 101**; hapus
  dua-klik ("⚠ Yakin hapus?") → 100; simpan ulang → bank 100; Kembali →
  WELCOME. **Nol error console** sepanjang alur. Render visual editor
  diverifikasi via tangkapan layar (sidebar/form/chip/tombol lengkap).
- Belum bisa diuji otomatis: dialog file picker asli (perlu interaksi user
  nyata) — logika handle/permission/read/write diuji statis + kode sesuai
  spesifikasi API; silakan uji manual langkah 3 di atas.
- Password editor di-reset ke default (`12345`) sebelum serah terima.

## Bug/Isu yang Diketahui
- `fill('')` pada kotak pencarian tidak berefek di lapisan otomasi browser
  embedded (bukan bug editor — clear via DOM event & backspace normal).
- File System Access API tidak tersedia di Firefox/Safari → otomatis mode
  unduh (chip status menjelaskan).

## Catatan untuk Sprint Berikutnya
- Jika nanti butuh editor multi-file / bank lain, `HANDLE_KEY` IndexedDB
  tinggal diperluas. Pertimbangkan import JSON (merge) & ekspor CSV bila
  kebutuhan muncul.
