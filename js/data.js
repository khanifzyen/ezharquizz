/**
 * data.js — memuat & menyeleksi soal dari bank JSON.
 *
 * Catatan penting: urutan opsi TIDAK diacak — indeks `answer` pada
 * questions.json harus tetap sahih (lihat implementation-plan Sprint 1).
 * Hanya urutan soal yang diacak (Fisher–Yates, tanpa duplikat).
 */

/** URL bank soal, relatif terhadap halaman index.html di root proyek. */
const DEFAULT_URL = 'data/questions.json';

/**
 * Memuat bank soal dari JSON.
 * @param {string} [url] path ke bank soal
 * @returns {Promise<Array<{id:number, category:string, question:string, options:string[4], answer:number}>>}
 * @throws {Error} bila fetch gagal, bukan array, atau kosong
 */
export async function loadQuestions(url = DEFAULT_URL) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Gagal memuat bank soal (HTTP ${res.status}) dari ${url}`);
  }
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Bank soal kosong atau formatnya tidak valid');
  }
  return data;
}

/**
 * Fisher–Yates shuffle (pure — mengembalikan array baru, input tidak diubah).
 * @template T
 * @param {readonly T[]} input
 * @returns {T[]}
 */
export function shuffleFisherYates(input) {
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Mengambil `count` soal acak tanpa duplikat dari bank soal.
 * Urutan opsi dibiarkan persis seperti di JSON.
 * @param {Array<object>} questions bank soal penuh
 * @param {number} [count=10] jumlah soal yang diambil
 * @returns {Array<object>}
 */
export function pickRandomQuestions(questions, count = 10) {
  const n = Math.min(count, questions.length);
  return shuffleFisherYates(questions).slice(0, n);
}
