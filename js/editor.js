/**
 * editor.js — Editor Quiz lokal (Sprint 6): melihat/menambah/mengubah/menghapus
 * soal pada bank `data/questions.json` lewat UI (bukan edit JSON mentah).
 *
 * Alur: tombol "🛠 Editor Quiz" (WELCOME) → gerbang password (default "12345";
 * pemakaian pertama WAJIB ganti password) → editor.
 *
 * Penyimpanan dua mode (deteksi otomatis, tanpa backend — murni client):
 *  1. **Simpan langsung** (Chrome/Edge, File System Access API): tombol Simpan
 *     menulis ke file `questions.json` lokal yang dipilih sekali via file
 *     picker; handle file diingat di IndexedDB sehingga sesi berikutnya cukup
 *     "hubungkan ulang" satu klik. Bekerja juga di halaman yang sudah
 *     di-deploy (HTTPS) — yang diedit tetap file LOKAL, lalu push ke repo.
 *  2. **Mode Unduh** (Firefox/Safari / belum pilih file): Simpan mengunduh
 *     `questions.json` untuk menggantikan file di project/repo manual.
 *
 * Catatan kejujuran keamanan: password disimpan sebagai hash SHA-256 di
 * localStorage — ini gerbang UX untuk mencegah akses tak sengaja, BUKAN
 * keamanan sejati (kode client selalu bisa dibaca/dibypass orang yang paham).
 */

const AUTH_KEY = 'ezharquiz.editorAuth'; // SHA-256 hex password custom (null = default)
const DEFAULT_PW = '12345';
const IDB_NAME = 'ezharquiz-editor';
const IDB_STORE = 'handles';
const HANDLE_KEY = 'questions';

/* ============================================================
 * Pure helpers — diekspor untuk harness uji (tanpa DOM)
 * ============================================================ */

/**
 * Validasi satu soal.
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateQuestion(q) {
  const errors = [];
  if (!q || typeof q !== 'object') return { ok: false, errors: ['Soal tidak valid.'] };
  if (!String(q.question || '').trim()) errors.push('Pertanyaan masih kosong.');
  const opts = q.options || [];
  if (!Array.isArray(opts) || opts.length !== 4) {
    errors.push('Harus ada tepat 4 pilihan jawaban.');
  } else {
    const emptyIdx = opts.map((o, i) => (String(o || '').trim() ? -1 : i)).filter((i) => i >= 0);
    if (emptyIdx.length) errors.push(`Opsi ${emptyIdx.map((i) => 'ABCD'[i]).join(', ')} masih kosong.`);
    const seen = new Set();
    for (let i = 0; i < 4; i++) {
      const t = String(opts[i] || '').trim().toLowerCase();
      if (t && seen.has(t)) {
        errors.push(`Opsi berulang: "${String(opts[i]).trim()}" (hampir sama dengan opsi lain).`);
        break;
      }
      seen.add(t);
    }
  }
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) {
    errors.push('Jawaban benar belum dipilih (harus salah satu dari A–D).');
  }
  if (!String(q.category || '').trim()) errors.push('Kategori kosong (isi mis. "Umum").');
  return { ok: errors.length === 0, errors };
}

/** ID berikutnya = max(id)+1 (mulai 1 bila list kosong). */
export function nextQuestionId(list) {
  return list.reduce((max, q) => Math.max(max, Number(q.id) || 0), 0) + 1;
}

/**
 * Serialisasi bank ke format file asli: satu objek ringkas per baris
 * (ramah diff git, identik format `data/questions.json` saat ini).
 */
export function serializeBank(questions) {
  return '[\n' + questions.map((q) => '  ' + JSON.stringify(q)).join(',\n') + '\n]\n';
}

/* ============================================================
 * Auth (gerbang password)
 * ============================================================ */

async function sha256Hex(text) {
  if (crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Konteks non-secure (sangat jarang — game sendiri butuh localhost/HTTPS):
  // hash fallback sederhana supaya editor tetap terpakai (bukan pengaman kuat).
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return 'x' + h.toString(16);
}

/** @returns {'ok'|'default'|'bad'} ok = password custom benar; default = password default (wajib ganti); bad = salah */
async function checkPassword(pw) {
  const stored = localStorage.getItem(AUTH_KEY);
  if (stored) return (await sha256Hex(pw)) === stored ? 'ok' : 'bad';
  return pw === DEFAULT_PW ? 'default' : 'bad';
}

async function saveNewPassword(pw) {
  localStorage.setItem(AUTH_KEY, await sha256Hex(pw));
}

/* ============================================================
 * IndexedDB — menyimpan FileSystemFileHandle antar sesi
 * ============================================================ */

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  try {
    const db = await idbOpen();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
      tx.onsuccess = () => resolve(tx.result || null);
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return null;
  }
}

async function idbSet(key, value) {
  try {
    const db = await idbOpen();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(value, key);
      tx.onsuccess = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* handle tak tersimpan — editor tetap jalan, cuma perlu pilih file lagi */
  }
}

async function idbDel(key) {
  try {
    const db = await idbOpen();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).delete(key);
      tx.onsuccess = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* abaikan */
  }
}

/* ============================================================
 * Editor — initEditor(deps) dipanggil main.js
 * ============================================================ */

/**
 * @param {object} deps
 * @param {() => void} deps.onExit kembali ke layar sebelumnya (WELCOME)
 * @param {(questions: Array) => void} deps.setBank main.js memakai bank hasil
 *   edit untuk sesi berikutnya (tanpa reload halaman)
 */
export function initEditor(deps) {
  const $ = (id) => document.getElementById(id);

  const el = {
    gateLogin: $('editor-gate-login'),
    loginForm: $('editor-login-form'),
    loginPw: $('editor-login-pw'),
    loginErr: $('editor-login-error'),
    loginCancel: $('btn-editor-login-cancel'),
    resetPw: $('btn-editor-reset-pw'),
    gateNewpass: $('editor-gate-newpass'),
    newpassForm: $('editor-newpass-form'),
    np1: $('editor-np1'),
    np2: $('editor-np2'),
    npErr: $('editor-np-error'),
    main: $('editor-main'),
    back: $('btn-editor-back'),
    dirty: $('editor-dirty'),
    fileStatus: $('editor-file-status'),
    openFile: $('btn-editor-open-file'),
    download: $('btn-editor-download'),
    save: $('btn-editor-save'),
    search: $('editor-search'),
    catFilter: $('editor-cat-filter'),
    add: $('btn-editor-add'),
    list: $('editor-list'),
    stats: $('editor-stats'),
    form: $('editor-form'),
    fId: $('ef-id'),
    fCat: $('ef-category'),
    catList: $('editor-cat-list'),
    fQuestion: $('ef-question'),
    fOpts: [ $('ef-o0'), $('ef-o1'), $('ef-o2'), $('ef-o3') ],
    fRadios: [ $('ef-c0'), $('ef-c1'), $('ef-c2'), $('ef-c3') ],
    validation: $('ef-validation'),
    dup: $('btn-editor-dup'),
    del: $('btn-editor-del'),
    toast: $('editor-toast'),
  };

  const canDirectSave = typeof window.showOpenFilePicker === 'function';

  // State editor (bukan bagian dari state game).
  const st = {
    questions: null,
    selected: -1,
    dirty: false,
    handle: null, // FileSystemFileHandle (mode simpan langsung)
    fileName: '',
    authed: false,
    toastTimer: 0,
    delArmed: false, // hapus butuh 2 klik ("Yakin?")
    resetArmed: false,
  };

  /* ---------- util UI ---------- */

  function toast(msg, warn = false) {
    el.toast.textContent = msg;
    el.toast.classList.toggle('is-warn', warn);
    el.toast.hidden = false;
    if (st.toastTimer) clearTimeout(st.toastTimer);
    st.toastTimer = setTimeout(() => (el.toast.hidden = true), 4200);
  }

  function setDirty(v) {
    st.dirty = v;
    el.dirty.hidden = !v;
  }

  function updateFileStatus(clickableReconnect = false) {
    const chip = el.fileStatus;
    chip.classList.remove('is-ok', 'is-warn');
    if (!canDirectSave) {
      chip.textContent = '⬇ Mode Unduh (browser ini tanpa simpan-langsung)';
      return;
    }
    if (st.handle && st.fileName) {
      chip.textContent = `💾 ${st.fileName}`;
      chip.classList.add('is-ok');
    } else if (clickableReconnect) {
      chip.textContent = '⚡ Klik untuk menghubungkan kembali file';
      chip.classList.add('is-warn');
    } else {
      chip.textContent = '📁 Belum terhubung — Simpan = Unduh JSON';
      chip.classList.add('is-warn');
    }
  }

  /* ---------- gerbang password ---------- */

  function showGate(which) {
    el.gateLogin.hidden = which !== 'login';
    el.gateNewpass.hidden = which !== 'newpass';
    el.main.hidden = which !== 'main';
    if (which === 'login') {
      el.loginPw.value = '';
      el.loginErr.hidden = true;
      el.loginPw.focus();
    }
  }

  async function tryLogin(e) {
    e.preventDefault();
    el.loginErr.hidden = true;
    const res = await checkPassword(el.loginPw.value);
    if (res === 'bad') {
      el.loginErr.textContent = 'Password salah.';
      el.loginErr.hidden = false;
      return;
    }
    if (res === 'default') {
      // Password default dipakai → WAJIB ganti sebelum masuk editor.
      el.np1.value = '';
      el.np2.value = '';
      el.npErr.hidden = true;
      showGate('newpass');
      el.np1.focus();
      return;
    }
    enterEditor();
  }

  async function tryNewpass(e) {
    e.preventDefault();
    el.npErr.hidden = true;
    const p1 = el.np1.value;
    const p2 = el.np2.value;
    const fail = (msg) => {
      el.npErr.textContent = msg;
      el.npErr.hidden = false;
    };
    if (p1.length < 4) return fail('Password baru minimal 4 karakter.');
    if (p1 !== DEFAULT_PW && p1 !== p2) return fail('Konfirmasi password tidak sama.');
    if (p1 === DEFAULT_PW) return fail('Password baru tidak boleh sama dengan default (12345).');
    await saveNewPassword(p1);
    toast('Password editor berhasil diganti. 📌 Catat password baru Anda!');
    enterEditor();
  }

  function armResetPw() {
    if (!st.resetArmed) {
      st.resetArmed = true;
      el.resetPw.textContent = 'Yakin? Klik lagi untuk reset ke default (12345)';
      setTimeout(() => {
        st.resetArmed = false;
        el.resetPw.textContent = 'Lupa password? Reset ke default';
      }, 3500);
      return;
    }
    st.resetArmed = false;
    localStorage.removeItem(AUTH_KEY);
    el.resetPw.textContent = 'Lupa password? Reset ke default';
    toast('Password di-reset ke default (12345).', true);
  }

  /* ---------- data ---------- */

  async function ensureData() {
    if (st.questions) return;
    try {
      const res = await fetch('data/questions.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) throw new Error('bank kosong');
      st.questions = data;
    } catch (err) {
      console.error('[EzharQuiz:editor] Gagal memuat bank soal:', err);
      st.questions = [];
      toast('Gagal memuat bank soal dari server — mulai dengan bank kosong.', true);
    }
  }

  async function enterEditor() {
    st.authed = true;
    await ensureData();
    await tryReconnectHandle(); // handle tersimpan + izin masih granted → sambung otomatis
    showGate('main');
    renderAll();
  }

  /* ---------- file handle ---------- */

  async function tryReconnectHandle() {
    if (!canDirectSave) return;
    const handle = await idbGet(HANDLE_KEY);
    if (!handle) return;
    try {
      const perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        st.handle = handle;
        st.fileName = handle.name || 'questions.json';
        await readFromHandle(); // muat isi terbaru dari file
        updateFileStatus();
      } else {
        updateFileStatus(true); // tampilkan chip "klik untuk menghubungkan"
      }
    } catch {
      /* handle basi (mis. file dipindah) → lupakan */
      await idbDel(HANDLE_KEY);
      updateFileStatus();
    }
  }

  async function openQuestionFile() {
    if (!canDirectSave) {
      toast('Browser ini tidak mendukung simpan langsung — pakai tombol Unduh JSON.', true);
      return;
    }
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{ description: 'Bank soal JSON', accept: { 'application/json': ['.json'] } }],
      });
      st.handle = handle;
      st.fileName = handle.name || 'questions.json';
      await idbSet(HANDLE_KEY, handle);
      await readFromHandle();
      updateFileStatus();
      toast(`Terhubung ke ${st.fileName}. Simpan menulis langsung ke file ini.`);
    } catch (err) {
      if (err && err.name === 'AbortError') return; // user batal — bukan error
      console.error('[EzharQuiz:editor] Gagal membuka file:', err);
      toast('Gagal membuka file: ' + (err && err.message ? err.message : err), true);
    }
  }

  async function readFromHandle() {
    const file = await st.handle.getFile();
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error('File bukan array soal.');
    st.questions = data;
    st.selected = -1;
    setDirty(false);
  }

  async function reconnectFromChip() {
    if (!(st.fileStatus.classList.contains('is-warn') && canDirectSave)) return;
    const handle = await idbGet(HANDLE_KEY);
    if (!handle) return openQuestionFile();
    try {
      const perm = await handle.requestPermission({ mode: 'readwrite' }); // butuh gesture ✓
      if (perm === 'granted') {
        st.handle = handle;
        st.fileName = handle.name || 'questions.json';
        await readFromHandle();
        updateFileStatus();
        renderAll();
        toast(`Terhubung kembali ke ${st.fileName}.`);
      }
    } catch {
      toast('Tidak bisa menghubungkan file — coba Buka File…', true);
    }
  }

  /** Izin 'prompt' bisa diminta dalam gesture klik Simpan. */
  async function ensurePermission() {
    if (!st.handle) return false;
    if ((await st.handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
    try {
      return (await st.handle.requestPermission({ mode: 'readwrite' })) === 'granted';
    } catch {
      return false;
    }
  }

  /* ---------- render ---------- */

  function categories() {
    return [...new Set(st.questions.map((q) => String(q.category || '').trim() || 'Umum'))].sort();
  }

  function rebuildCatFilter() {
    const current = el.catFilter.value;
    el.catFilter.innerHTML =
      '<option value="">Semua kategori</option>' +
      categories().map((c) => `<option${c === current ? ' selected' : ''}>${c}</option>`).join('');
    el.catList.innerHTML = categories().map((c) => `<option value="${c}">`).join('');
  }

  function visibleIndexes() {
    const q = el.search.value.trim().toLowerCase();
    const cat = el.catFilter.value;
    const out = [];
    st.questions.forEach((item, i) => {
      if (cat && String(item.category || '').trim() !== cat) return;
      if (q) {
        const hay = (item.question + ' ' + (item.options || []).join(' ') + ' ' + item.category).toLowerCase();
        if (!hay.includes(q)) return;
      }
      out.push(i);
    });
    return out;
  }

  function renderList() {
    const scroll = el.list.scrollTop;
    const sel = st.selected;
    const idxs = visibleIndexes();
    el.list.innerHTML = idxs
      .map((i) => {
        const q = st.questions[i];
        const invalid = !validateQuestion(q).ok;
        const cat = String(q.category || '').trim() || 'Umum';
        return `<li data-i="${i}" class="${i === sel ? 'is-selected' : ''}${invalid ? ' is-invalid' : ''}" title="${invalid ? 'Soal belum valid' : ''}"><span class="li-meta">#${q.id} · ${cat}</span>${escapeHtml(String(q.question || '(kosong)'))}</li>`;
      })
      .join('');
    el.list.scrollTop = scroll;
    const invalidTotal = st.questions.filter((q) => !validateQuestion(q).ok).length;
    el.stats.textContent = `${st.questions.length} soal · ${categories().length} kategori${invalidTotal ? ` · ${invalidTotal} belum valid` : ''}`;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderForm() {
    const q = st.questions[st.selected];
    if (!q) {
      el.form.reset();
      el.fId.value = '';
      el.validation.hidden = true;
      return;
    }
    el.fId.value = '#' + q.id;
    el.fCat.value = String(q.category || '');
    el.fQuestion.value = String(q.question || '');
    for (let i = 0; i < 4; i++) {
      el.fOpts[i].value = String((q.options && q.options[i]) || '');
      el.fRadios[i].checked = q.answer === i;
    }
    showValidation(q);
  }

  function showValidation(q) {
    const v = validateQuestion(q);
    el.validation.textContent = v.ok ? '' : '⚠ ' + v.errors.join('\n');
    el.validation.hidden = v.ok;
    return v.ok;
  }

  function renderAll() {
    rebuildCatFilter();
    renderList();
    renderForm();
  }

  /** Kumpulkan isi form ke soal terpilih (dipanggil tiap input). */
  function collectForm() {
    const q = st.questions[st.selected];
    if (!q) return;
    q.category = el.fCat.value.trim() || 'Umum';
    q.question = el.fQuestion.value.trim();
    for (let i = 0; i < 4; i++) q.options[i] = el.fOpts[i].value.trim();
    const checked = el.fRadios.findIndex((r) => r.checked);
    q.answer = checked >= 0 ? checked : q.answer;
    setDirty(true);
    showValidation(q);
    renderList(); // label daftar ikut memperbarui (scroll dipertahankan)
  }

  /* ---------- aksi ---------- */

  function selectFromList(i) {
    st.selected = i;
    renderList();
    renderForm();
  }

  function addQuestion() {
    const cat = el.catFilter.value || 'Umum';
    st.questions.push({
      id: nextQuestionId(st.questions),
      category: cat,
      question: '',
      options: ['', '', '', ''],
      answer: 0,
    });
    st.selected = st.questions.length - 1;
    setDirty(true);
    renderAll();
    el.fQuestion.focus();
    toast('Soal baru ditambahkan — isi pertanyaan & 4 pilihan.');
  }

  function duplicateQuestion() {
    if (st.selected < 0) return;
    const src = st.questions[st.selected];
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = nextQuestionId(st.questions);
    st.questions.splice(st.selected + 1, 0, copy);
    st.selected += 1;
    setDirty(true);
    renderAll();
    toast(`Soal #${src.id} diduplikasi sebagai #${copy.id}.`);
  }

  function deleteQuestion() {
    if (st.selected < 0) return;
    if (!st.delArmed) {
      st.delArmed = true;
      el.del.textContent = '⚠ Yakin hapus?';
      setTimeout(() => {
        st.delArmed = false;
        el.del.textContent = '🗑 Hapus';
      }, 3000);
      return;
    }
    st.delArmed = false;
    el.del.textContent = '🗑 Hapus';
    const removed = st.questions.splice(st.selected, 1)[0];
    st.selected = Math.min(st.selected, st.questions.length - 1);
    setDirty(true);
    renderAll();
    toast(`Soal #${removed.id} dihapus.`, true);
  }

  function downloadJson() {
    const blob = new Blob([serializeBank(st.questions)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'questions.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  async function save() {
    // Validasi seluruh bank — jangan simpan file yang berisi soal cacat.
    const bad = st.questions.findIndex((q) => !validateQuestion(q).ok);
    if (bad >= 0) {
      selectFromList(bad);
      toast('Ada soal yang belum valid — perbaiki dulu sebelum menyimpan.', true);
      return;
    }
    if (st.handle && (await ensurePermission())) {
      try {
        const writable = await st.handle.createWritable();
        await writable.write(serializeBank(st.questions));
        await writable.close();
        setDirty(false);
        deps.setBank(st.questions.slice());
        toast(`💾 Tersimpan ke ${st.fileName} (${st.questions.length} soal). Bank game ikut diperbarui.`);
        return;
      } catch (err) {
        console.error('[EzharQuiz:editor] Gagal menulis file:', err);
        toast('Gagal menulis file: ' + (err && err.message ? err.message : err), true);
      }
    }
    // Fallback: unduh + perbarui bank game di memori.
    downloadJson();
    deps.setBank(st.questions.slice());
    setDirty(false);
    toast('⬇ questions.json terunduh — ganti file di folder data/ (lalu push bila di-deploy). Bank game ikut diperbarui.', true);
  }

  /* ---------- wiring ---------- */

  el.loginForm.addEventListener('submit', tryLogin);
  el.loginCancel.addEventListener('click', () => deps.onExit());
  el.resetPw.addEventListener('click', armResetPw);
  el.newpassForm.addEventListener('submit', tryNewpass);

  el.back.addEventListener('click', () => {
    if (st.dirty && !confirm('Ada perubahan belum disimpan. Tetap keluar?')) return;
    deps.onExit();
  });
  el.openFile.addEventListener('click', openQuestionFile);
  el.fileStatus.addEventListener('click', reconnectFromChip);
  el.download.addEventListener('click', () => {
    downloadJson();
    toast('⬇ questions.json terunduh.');
  });
  el.save.addEventListener('click', save);
  el.add.addEventListener('click', addQuestion);
  el.dup.addEventListener('click', duplicateQuestion);
  el.del.addEventListener('click', deleteQuestion);
  el.search.addEventListener('input', renderList);
  el.catFilter.addEventListener('change', renderList);
  el.list.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-i]');
    if (li) selectFromList(Number(li.dataset.i));
  });
  el.form.addEventListener('input', collectForm);
  el.form.addEventListener('change', collectForm);

  // Jangan hilangkan perubahan karena reload/tutup tab tanpa sengaja.
  window.addEventListener('beforeunload', (e) => {
    if (st.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  /* ---------- API publik ---------- */

  return {
    /** Dipanggil main.js setiap kali layar editor dibuka. */
    async open() {
      updateFileStatus();
      const hasCustom = !!localStorage.getItem(AUTH_KEY);
      el.resetPw.hidden = !hasCustom;
      showGate('login');
      if (st.authed) {
        // Sesi masih dianggap sah? TIDAK — gerbang password tiap kali masuk.
        st.authed = false;
      }
    },
    /** Reset internal (dipakai bila perlu). */
    close() {
      st.authed = false;
    },
  };
}
