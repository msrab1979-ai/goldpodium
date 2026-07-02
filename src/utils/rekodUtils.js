/**
 * rekodUtils.js
 * ─────────────
 * Helper untuk fetch rekod per acara.
 * Digunakan oleh StartList PDF, KeputusanRasmi, dan Olahragawan.
 *
 * rekodKey format: {NAMAACARA}_{JANTINA}_{KATEGORI}_{PERINGKAT}
 * Contoh: 100M_L_C_D  (100m Lelaki Kat C Daerah)
 */

import { db } from '../firebase/config'
import { doc, getDoc } from 'firebase/firestore'

/**
 * Bina rekod key — sama seperti dalam Rekod.jsx
 * Normalize: uppercase + replace non-alphanumeric → '_'
 */
export function rekodKey(namaAcara, jantina, kategoriKod, peringkat) {
  const normalized = String(namaAcara || '')
    .toUpperCase()
    .replace(/(\d)\s*METER\b/g, '$1M')
    .replace(/(\d)\s+M\b/g, '$1M')
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_]/g, '_')
  return [normalized, jantina, kategoriKod, peringkat]
    .join('_').toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/_+/g, '_')
}

/**
 * Fetch rekod Daerah (D), Negeri (N), Kebangsaan (K) untuk satu acara.
 * Return null jika tiada rekod untuk peringkat tersebut.
 *
 * @param {string} schoolId - ID tenant (GP multi-tenant)
 * @param {{ namaAcara: string, jantina: string, kategoriKod: string }} acara
 * @returns {Promise<{ S: object|null, D: object|null, N: object|null, K: object|null }>}
 */
export async function cariRekodUntukAcara(schoolId, acara) {
  const { namaAcara, namaAcaraPendek, jantina, kategoriKod } = acara

  const nama = (namaAcaraPendek || namaAcara || '').trim()

  const kelasDariNama = (namaAcara && namaAcaraPendek && namaAcara.trim() !== namaAcaraPendek.trim())
    ? namaAcara.trim().slice(namaAcaraPendek.trim().length).trim()
    : ''

  const katsToTry = [...new Set([
    kategoriKod,
    kelasDariNama,
  ].filter(Boolean))]

  async function cariSatu(peringkat) {
    const snaps = await Promise.all(
      katsToTry.map(kat => getDoc(doc(db, 'tenants', schoolId, 'rekod', rekodKey(nama, jantina, kat, peringkat))))
    )
    const found = snaps.find(s => s.exists())
    return found ? found.data() : null
  }

  const [S, D, N, K] = await Promise.all([
    cariSatu('S'),
    cariSatu('D'),
    cariSatu('N'),
    cariSatu('K'),
  ])

  return { S, D, N, K }
}

/**
 * Format prestasi untuk paparan (masa atau jarak).
 * @param {number} prestasi
 * @param {'s'|'m'} unit
 */
export function formatPrestasiRekod(prestasi, unit) {
  if (prestasi === null || prestasi === undefined || prestasi === '') return '—'
  const v = Number(prestasi)
  if (isNaN(v)) return String(prestasi)
  if (unit === 's') {
    if (v >= 60) {
      const m = Math.floor(v / 60)
      const s = (v - m * 60).toFixed(2).padStart(5, '0')
      return `${m}:${s}`
    }
    return v.toFixed(2) + 's'
  }
  if (unit === 'm') return v.toFixed(2) + 'm'
  return String(v)
}

/**
 * Ambil tahun dari tarikhRekod (YYYY-MM-DD atau Date).
 */
export function tahunRekod(tarikhRekod) {
  if (!tarikhRekod) return '—'
  return String(tarikhRekod).slice(0, 4)
}

/**
 * Ambil teks "Catatan" untuk kolum lokasi dalam start list:
 *   Daerah      → namaSekolah
 *   Negeri      → namaDaerah
 *   Kebangsaan  → namaNegeri
 */
export function lokasiRekod(rekod) {
  if (!rekod) return '—'
  if (rekod.peringkat === 'D') return rekod.namaSekolah || '—'
  if (rekod.peringkat === 'N') return rekod.namaDaerah  || '—'
  if (rekod.peringkat === 'K') return rekod.namaNegeri  || '—'
  return '—'
}
