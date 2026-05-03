/**
 * KOAM — Seed Script: 20 Sekolah Daerah Kemaman
 *
 * Menjalankan dua operasi:
 *  1. Tulis dokumen sekolah ke Firestore (collection: sekolah)
 *  2. Cipta Firebase Auth user + dokumen users untuk setiap pengurus pasukan
 *     Login: kodSekolah@koam.mssd.my / PIN
 *
 * AMARAN: Jalankan SEKALI sahaja. Padam butang "Seed Data" selepas guna.
 */

import { doc, writeBatch, serverTimestamp } from 'firebase/firestore'
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { db, secondaryAuth } from '../firebase/config'

// ─── Data 20 Sekolah ──────────────────────────────────────────────────────────
// PIN format: SR=11xxxx  SM=22xxxx  PPKI=33xxxx (unik per sekolah)

export const SEKOLAH_LIST = [
  // ── Sekolah Rendah (SR) ─────────────────────────────────────────────────────
  {
    kodSekolah:  'KMN-SR-001',
    namaSekolah: 'SK Sultan Ismail',
    kategori:    'SR',
    negeri:      'Terengganu',
    daerah:      'Kemaman',
    email:       'sksi@moe.edu.my',
    bibPrefix:   'SSI',
    bibMula:     1,
    pin:         '110001',
    isAktif:     true,
  },
  {
    kodSekolah:  'KMN-SR-002',
    namaSekolah: 'SK Kerteh',
    kategori:    'SR',
    negeri:      'Terengganu',
    daerah:      'Kemaman',
    email:       'skkerteh@moe.edu.my',
    bibPrefix:   'SKT',
    bibMula:     1,
    pin:         '110002',
    isAktif:     true,
  },
  {
    kodSekolah:  'KMN-SR-003',
    namaSekolah: 'SK Kemasik',
    kategori:    'SR',
    negeri:      'Terengganu',
    daerah:      'Kemaman',
    email:       'skkemasik@moe.edu.my',
    bibPrefix:   'SKM',
    bibMula:     1,
    pin:         '110003',
    isAktif:     true,
  },
  {
    kodSekolah:  'KMN-SR-004',
    namaSekolah: 'SK Chukai',
    kategori:    'SR',
    negeri:      'Terengganu',
    daerah:      'Kemaman',
    email:       'skchukai@moe.edu.my',
    bibPrefix:   'SCK',
    bibMula:     1,
    pin:         '110004',
    isAktif:     true,
  },
  {
    kodSekolah:  'KMN-SR-005',
    namaSekolah: 'SK Cukai 2',
    kategori:    'SR',
    negeri:      'Terengganu',
    daerah:      'Kemaman',
    email:       'skcukai2@moe.edu.my',
    bibPrefix:   'SC2',
    bibMula:     1,
    pin:         '110005',
    isAktif:     true,
  },
  {
    kodSekolah:  'KMN-SR-006',
    namaSekolah: 'SK Air Putih',
    kategori:    'SR',
    negeri:      'Terengganu',
    daerah:      'Kemaman',
    email:       'skap@moe.edu.my',
    bibPrefix:   'SAP',
    bibMula:     1,
    pin:         '110006',
    isAktif:     true,
  },
  {
    kodSekolah:  'KMN-SR-007',
    namaSekolah: 'SK Geliga',
    kategori:    'SR',
    negeri:      'Terengganu',
    daerah:      'Kemaman',
    email:       'skgeliga@moe.edu.my',
    bibPrefix:   'SGL',
    bibMula:     1,
    pin:         '110007',
    isAktif:     true,
  },
  {
    kodSekolah:  'KMN-SR-008',
    namaSekolah: 'SK Cheneh',
    kategori:    'SR',
    negeri:      'Terengganu',
    daerah:      'Kemaman',
    email:       'skcheneh@moe.edu.my',
    bibPrefix:   'SCH',
    bibMula:     1,
    pin:         '110008',
    isAktif:     true,
  },

  // ── Sekolah Menengah (SM) ───────────────────────────────────────────────────
  {
    kodSekolah:  'KMN-SM-001',
    namaSekolah: 'SMK Sultan Omar',
    kategori:    'SM',
    negeri:      'Terengganu',
    daerah:      'Kemaman',
    email:       'smkso@moe.edu.my',
    bibPrefix:   'MSO',
    bibMula:     1,
    pin:         '220001',
    isAktif:     true,
  },
  {
    kodSekolah:  'KMN-SM-002',
    namaSekolah: 'SMK Kerteh',
    kategori:    'SM',
    negeri:      'Terengganu',
    daerah:      'Kemaman',
    email:       'smkkerteh@moe.edu.my',
    bibPrefix:   'MKT',
    bibMula:     1,
    pin:         '220002',
    isAktif:     true,
  },
  {
    kodSekolah:  'KMN-SM-003',
    namaSekolah: 'SMK Kemasik',
    kategori:    'SM',
    negeri:      'Terengganu',
    daerah:      'Kemaman',
    email:       'smkkemasik@moe.edu.my',
    bibPrefix:   'MKM',
    bibMula:     1,
    pin:         '220003',
    isAktif:     true,
  },
  {
    kodSekolah:  'KMN-SM-004',
    namaSekolah: 'SMK Chukai',
    kategori:    'SM',
    negeri:      'Terengganu',
    daerah:      'Kemaman',
    email:       'smkchukai@moe.edu.my',
    bibPrefix:   'MCK',
    bibMula:     1,
    pin:         '220004',
    isAktif:     true,
  },
  {
    kodSekolah:  'KMN-SM-005',
    namaSekolah: 'SMK Cukai 2',
    kategori:    'SM',
    negeri:      'Terengganu',
    daerah:      'Kemaman',
    email:       'smkcukai2@moe.edu.my',
    bibPrefix:   'MC2',
    bibMula:     1,
    pin:         '220005',
    isAktif:     true,
  },
  {
    kodSekolah:  'KMN-SM-006',
    namaSekolah: 'SMK Geliga',
    kategori:    'SM',
    negeri:      'Terengganu',
    daerah:      'Kemaman',
    email:       'smkgeliga@moe.edu.my',
    bibPrefix:   'MGL',
    bibMula:     1,
    pin:         '220006',
    isAktif:     true,
  },
  {
    kodSekolah:  'KMN-SM-007',
    namaSekolah: 'SMK Air Putih',
    kategori:    'SM',
    negeri:      'Terengganu',
    daerah:      'Kemaman',
    email:       'smkap@moe.edu.my',
    bibPrefix:   'MAP',
    bibMula:     1,
    pin:         '220007',
    isAktif:     true,
  },
  {
    kodSekolah:  'KMN-SM-008',
    namaSekolah: 'SMK Cheneh Baru',
    kategori:    'SM',
    negeri:      'Terengganu',
    daerah:      'Kemaman',
    email:       'smkcheneh@moe.edu.my',
    bibPrefix:   'MCB',
    bibMula:     1,
    pin:         '220008',
    isAktif:     true,
  },

  // ── PPKI ────────────────────────────────────────────────────────────────────
  {
    kodSekolah:  'KMN-PK-001',
    namaSekolah: 'PPKI SK Sultan Ismail',
    kategori:    'PPKI',
    negeri:      'Terengganu',
    daerah:      'Kemaman',
    email:       'ppkisksi@moe.edu.my',
    bibPrefix:   'PSI',
    bibMula:     1,
    pin:         '330001',
    isAktif:     true,
  },
  {
    kodSekolah:  'KMN-PK-002',
    namaSekolah: 'PPKI SK Kerteh',
    kategori:    'PPKI',
    negeri:      'Terengganu',
    daerah:      'Kemaman',
    email:       'ppkiskkerteh@moe.edu.my',
    bibPrefix:   'PKT',
    bibMula:     1,
    pin:         '330002',
    isAktif:     true,
  },
  {
    kodSekolah:  'KMN-PK-003',
    namaSekolah: 'PPKI SMK Sultan Omar',
    kategori:    'PPKI',
    negeri:      'Terengganu',
    daerah:      'Kemaman',
    email:       'ppkismkso@moe.edu.my',
    bibPrefix:   'PMO',
    bibMula:     1,
    pin:         '330003',
    isAktif:     true,
  },
  {
    kodSekolah:  'KMN-PK-004',
    namaSekolah: 'PPKI SMK Kerteh',
    kategori:    'PPKI',
    negeri:      'Terengganu',
    daerah:      'Kemaman',
    email:       'ppkismkkerteh@moe.edu.my',
    bibPrefix:   'PMK',
    bibMula:     1,
    pin:         '330004',
    isAktif:     true,
  },
]

// ─── Seed Function ────────────────────────────────────────────────────────────

/**
 * seedSekolah — Seed 20 sekolah ke Firestore + cipta Firebase Auth users
 *
 * @param {Function} onProgress  Callback: ({ done, total, sekolah, error })
 * @returns {Promise<{ ok: number, skip: number, fail: number }>}
 */
export async function seedSekolah(onProgress = () => {}) {
  const total = SEKOLAH_LIST.length
  let ok = 0, skip = 0, fail = 0

  // ── Langkah 1: Batch write sekolah documents ────────────────────────────────
  const batch = writeBatch(db)
  for (const s of SEKOLAH_LIST) {
    batch.set(doc(db, 'sekolah', s.kodSekolah), {
      ...s,
      createdAt: serverTimestamp(),
    })
  }
  await batch.commit()

  // ── Langkah 2: Cipta Firebase Auth + users doc untuk setiap pengurus pasukan ─
  for (let i = 0; i < SEKOLAH_LIST.length; i++) {
    const s = SEKOLAH_LIST[i]
    const authEmail = `${s.kodSekolah.toLowerCase()}@koam.mssd.my`

    onProgress({ done: i, total, sekolah: s.namaSekolah, status: 'running' })

    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, authEmail, s.pin)
      const uid  = cred.user.uid

      // users document untuk pengurus_pasukan
      const usersBatch = writeBatch(db)
      usersBatch.set(doc(db, 'users', uid), {
        uid,
        nama:      `Pengurus Pasukan — ${s.namaSekolah}`,
        email:     authEmail,
        kodAkses:  s.kodSekolah,
        pin:       s.pin,
        role:      'pengurus_pasukan',
        kodSekolah:s.kodSekolah,
        bibPrefix: s.bibPrefix,
        negeri:    s.negeri,
        daerah:    s.daerah,
        isAktif:   true,
        isTabDua:  true,
        createdAt: serverTimestamp(),
        createdBy: 'seed',
      })
      await usersBatch.commit()
      await signOut(secondaryAuth)
      ok++
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        // Dah wujud — skip tanpa error
        skip++
      } else {
        console.error(`Gagal: ${s.kodSekolah}`, err.message)
        fail++
      }
    }
  }

  onProgress({ done: total, total, status: 'done' })
  return { ok, skip, fail }
}
