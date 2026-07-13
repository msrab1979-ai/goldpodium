// ─── Hand Timing (HT) — paparan sahaja ────────────────────────────────────────
//
// Peraturan WA: masa jam tangan dibundar NAIK ke 0.1s terdekat.
// Sistem ini SIMPAN & RANK guna masa asal (keputusan tidak diubah);
// nilai bundar hanya untuk paparan "10.39 (10.40h)" bila acara.adaHandTiming.
// Kira guna integer (sen) — elak ralat floating point (10.30 kekal 10.3).

export function bundarHT(val) {
  const n = Number(val)
  if (!n || n <= 0 || !isFinite(n)) return null
  const cents = Math.round(n * 100)
  return Math.ceil(cents / 10) / 10
}

// True jika acara trek bertanda HT (padang/jarak tidak terlibat)
export function isAcaraHT(acara) {
  if (!acara?.adaHandTiming) return false
  return !['padang_lompat', 'padang_balin'].includes(acara.jenisAcara)
}
