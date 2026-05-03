/**
 * KOAM — seedAtlet.js
 *
 * Seed 200 atlet dummy (5L + 5P × 20 sekolah) ke collection `atlet`,
 * kemudian daftar setiap atlet ke 2–3 acara dalam kejohanan aktif terkini.
 *
 * AMARAN: Untuk tujuan testing sahaja.
 * Semua rekod seed ditanda  { isSeedData: true }  — boleh dipadam kemudian.
 *
 * Export:
 *   seedAtlet(onProgress, onLog)  →  Promise<{ atletOk, atletSkip, pendOk, fail }>
 *   deleteSeedData()              →  Promise<{ deleted }>
 */

import {
  collection, doc, setDoc, getDocs, deleteDoc, updateDoc,
  query, where, orderBy, limit, writeBatch,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { SEKOLAH_LIST } from './seedSekolah'

// ─── Pool Nama ────────────────────────────────────────────────────────────────

const NAMA_L = [
  'Ahmad Farhan','Muhammad Hariz','Ahmad Zikri','Mohamad Afiq',
  'Muhammad Haziq','Ahmad Irfan','Mohamad Izzat','Ahmad Naqiuddin',
  'Muhammad Azri','Ahmad Syafiq','Mohamad Hafiz','Muhammad Firdaus',
  'Ahmad Ridhwan','Mohamad Amirul','Muhammad Arif','Ahmad Fahmi',
  'Mohamad Luqman','Muhammad Asyraf','Ahmad Mujahid','Mohamad Izwan',
]

const NAMA_P = [
  'Nurul Ain','Siti Khadijah','Nur Izzati','Nurul Hidayah',
  'Siti Aishah','Nur Syafiqah','Nurul Syazwani','Siti Nabilah',
  'Nur Amirah','Nurul Farhana','Siti Raihana','Nur Aqilah',
  'Nurul Hanis','Siti Zulaikha','Nur Yasmin','Nurul Syakirah',
  'Siti Mariam','Nur Athirah','Nurul Sabrina','Siti Hadijah',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Kategori MSSM dari tarikhLahir + tahun kejohanan */
function kiraKategori(tarikhLahir, tahunKej) {
  if (!tarikhLahir || !tahunKej) return null
  const umur = tahunKej - new Date(tarikhLahir).getFullYear()
  if (umur >= 9  && umur <= 10) return 'A'
  if (umur >= 11 && umur <= 12) return 'B'
  if (umur >= 13 && umur <= 14) return 'C'
  if (umur >= 15 && umur <= 16) return 'D'
  if (umur >= 17 && umur <= 18) return 'E'
  return null
}

/** Jana noKP — format YYMMDD-11-XXXX unik */
function janaNoKP(tarikhLahir, counter) {
  const d  = new Date(tarikhLahir)
  const yy = String(d.getFullYear()).slice(-2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  // Gunakan counter 1000–9999 untuk bahagian akhir
  const num = String((counter % 9000) + 1000)
  return `${yy}${mm}${dd}-11-${num}`
}

/** Tarikh lahir random dalam julat tahun tertentu */
function randTarikhLahir(tahunMin, tahunMax, seed) {
  const tahun = tahunMin + (seed % (tahunMax - tahunMin + 1))
  const bulan = String((seed % 12) + 1).padStart(2, '0')
  const hari  = String((seed % 28) + 1).padStart(2, '0')
  return `${tahun}-${bulan}-${hari}`
}

/** Pilih N item rawak dari array */
function piliRawak(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(n, arr.length))
}

// ─── Julat tahun lahir ikut jenis sekolah (untuk tahun kejohanan 2026) ────────
// SR  → Kat A (umur 9–10) + Kat B (umur 11–12) → lahir 2014–2017
// SM  → Kat C–E (umur 13–18) → lahir 2008–2013
// PPKI → campuran → lahir 2008–2016

const TAHUN_LAHIR_BY_KATEGORI = {
  SR:   { min: 2014, max: 2016 },
  SM:   { min: 2008, max: 2013 },
  PPKI: { min: 2008, max: 2016 },
}

// ─── MAIN SEED FUNCTION ───────────────────────────────────────────────────────

/**
 * seedAtlet — Jana 200 atlet dummy + pendaftaran ke acara.
 *
 * @param {Function} onProgress  Callback({ done, total, label }) — untuk UI progress bar
 * @param {Function} onLog       Callback(msg: string) — untuk log baris
 * @returns {Promise<{ atletOk, atletSkip, pendOk, fail }>}
 */
export async function seedAtlet(onProgress = () => {}, onLog = () => {}) {
  const ATLET_PER_SEKOLAH_PER_JANTINA = 5
  const ACARA_PER_ATLET_MIN = 2
  const ACARA_PER_ATLET_MAX = 3
  const TOTAL_ATLET = SEKOLAH_LIST.length * ATLET_PER_SEKOLAH_PER_JANTINA * 2

  let atletOk = 0, atletSkip = 0, pendOk = 0, fail = 0
  let kpCounter = Math.floor(Date.now() / 100) % 9000 + 1000

  onProgress({ done: 0, total: TOTAL_ATLET, label: 'Menyediakan…' })
  onLog('⏳ Memuat data sedia ada…')

  // ── 1. Load noKP sedia ada (semak duplikat) ──────────────────────────────────
  const atletSnap = await getDocs(collection(db, 'atlet'))
  const takenKP   = new Set(atletSnap.docs.map(d => d.id))
  onLog(`  → ${takenKP.size} atlet sedia ada dalam Firestore`)

  // ── 2. Cari kejohanan aktif (atau terkini) ───────────────────────────────────
  let kejohanan = null
  try {
    // Cuba cari yang aktif dulu
    const qAktif = query(
      collection(db, 'kejohanan'),
      where('statusKejohanan', '==', 'aktif'),
      orderBy('createdAt', 'desc'),
      limit(1)
    )
    const aktifSnap = await getDocs(qAktif)
    if (!aktifSnap.empty) {
      kejohanan = { id: aktifSnap.docs[0].id, ...aktifSnap.docs[0].data() }
    } else {
      // Ambil terkini
      const qAll = query(collection(db, 'kejohanan'), orderBy('createdAt', 'desc'), limit(1))
      const allSnap = await getDocs(qAll)
      if (!allSnap.empty) {
        kejohanan = { id: allSnap.docs[0].id, ...allSnap.docs[0].data() }
      }
    }
  } catch (e) {
    onLog(`  ⚠ Gagal load kejohanan: ${e.message}`)
  }

  if (!kejohanan) {
    onLog('  ✗ Tiada kejohanan dalam sistem. Buat kejohanan dahulu.')
    onLog('  → Seed atlet akan diteruskan TANPA pendaftaran acara.')
  } else {
    onLog(`  → Kejohanan: ${kejohanan.namaKejohanan} (${kejohanan.id})`)
  }

  // ── 3. Load acara dari kejohanan ─────────────────────────────────────────────
  let acaraList = []
  const tahunKej = kejohanan?.tarikhMula
    ? new Date(kejohanan.tarikhMula?.toDate?.() || kejohanan.tarikhMula).getFullYear()
    : new Date().getFullYear()

  if (kejohanan) {
    try {
      const acaraSnap = await getDocs(
        collection(db, 'kejohanan', kejohanan.id, 'acara')
      )
      acaraList = acaraSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      onLog(`  → ${acaraList.length} acara ditemui dalam kejohanan`)
    } catch (e) {
      onLog(`  ⚠ Gagal load acara: ${e.message}`)
    }
  }

  // ── 4. Load noBib sedia ada dalam kejohanan (semak duplikat BIB) ─────────────
  const takenBib = new Set()
  if (kejohanan) {
    try {
      const pendSnap = await getDocs(
        collection(db, 'kejohanan', kejohanan.id, 'pendaftaran')
      )
      pendSnap.docs.forEach(d => { const nb = d.data().noBib; if (nb) takenBib.add(nb) })
      onLog(`  → ${takenBib.size} pendaftaran sedia ada`)
    } catch (_) {}
  }

  // Counter BIB per sekolah { bibPrefix: counter }
  const bibCounterMap = {}
  for (const s of SEKOLAH_LIST) {
    const prefix = s.bibPrefix
    let maks = s.bibMula - 1
    for (const bib of takenBib) {
      if (bib.startsWith(prefix)) {
        const n = parseInt(bib.slice(prefix.length), 10)
        if (!isNaN(n) && n > maks) maks = n
      }
    }
    bibCounterMap[prefix] = maks
  }

  onLog('─────────────────────────────────────────────────')

  // ── 5. Loop setiap sekolah ────────────────────────────────────────────────────
  let doneCount = 0

  for (const sekolah of SEKOLAH_LIST) {
    const { kodSekolah, namaSekolah, kategori, bibPrefix, bibFormat = 3, negeri, daerah } = sekolah
    const julat = TAHUN_LAHIR_BY_KATEGORI[kategori] || TAHUN_LAHIR_BY_KATEGORI.SM

    onLog(`\n📚 ${namaSekolah} (${kodSekolah}) [${kategori}]`)

    // Kumpul atlet untuk sekolah ini (untuk batch write)
    const atletBatch    = writeBatch(db)
    const pendBatch     = writeBatch(db)
    let atletBatchN     = 0
    let pendBatchN      = 0
    const atletDijana   = []

    for (const jantina of ['L', 'P']) {
      const namaPool = jantina === 'L' ? NAMA_L : NAMA_P

      for (let i = 0; i < ATLET_PER_SEKOLAH_PER_JANTINA; i++) {
        // Generate tarikh lahir
        const seed       = doneCount + i
        const tarikhLahir = randTarikhLahir(julat.min, julat.max, seed)
        const kategoriKod = kategori === 'PPKI'
          ? 'PPKI'
          : kiraKategori(tarikhLahir, tahunKej)

        // Generate noKP unik
        let noKP
        let attempt = 0
        do {
          kpCounter++
          noKP = janaNoKP(tarikhLahir, kpCounter)
          attempt++
        } while (takenKP.has(noKP) && attempt < 200)

        // Semak jika noKP dah wujud
        if (takenKP.has(noKP)) {
          onLog(`  ⚠ Gagal jana noKP unik untuk ${jantina} idx=${i}. Skip.`)
          atletSkip++
          continue
        }
        takenKP.add(noKP)

        // Nama — pool + suffix untuk elak duplikat
        const namaBase = namaPool[seed % namaPool.length]
        const nama = doneCount < namaPool.length * 2 ? namaBase : `${namaBase} ${Math.floor(doneCount / 20) + 2}`

        atletDijana.push({ noKP, nama, jantina, tarikhLahir, kategoriKod })

        // Tulis ke atlet collection
        atletBatch.set(doc(db, 'atlet', noKP), {
          noKP,
          nama,
          jantina,
          tarikhLahir,
          warganegara:     'MY',
          kodSekolah,
          kategoriSekolah: kategori,
          negeri:          negeri  || 'Terengganu',
          daerah:          daerah  || 'Kemaman',
          isAktif:         true,
          isSeedData:      true,
          createdAt:       serverTimestamp(),
          updatedAt:       serverTimestamp(),
        })
        atletBatchN++
        atletOk++

        doneCount++
        onProgress({ done: doneCount, total: TOTAL_ATLET, label: `${namaSekolah} — ${jantina}` })
      }
    }

    // Commit atlet batch
    try {
      if (atletBatchN > 0) await atletBatch.commit()
      onLog(`  ✓ ${atletBatchN} atlet berjaya ditulis`)
    } catch (e) {
      onLog(`  ✗ Gagal tulis atlet: ${e.message}`)
      fail += atletBatchN
      continue
    }

    // ── 5b. Daftar setiap atlet ke 2–3 acara ─────────────────────────────────
    if (!kejohanan || acaraList.length === 0) {
      onLog(`  ⏭ Tiada kejohanan/acara — skip pendaftaran`)
      continue
    }

    for (const atlet of atletDijana) {
      // Cari acara yang sesuai dengan jantina + kategori atlet
      const acaraLayak = acaraList.filter(a => {
        if (a.jantina !== atlet.jantina) return false
        if (kategori === 'PPKI') return a.kategoriKod === 'PPKI'
        return a.kategoriKod === atlet.kategoriKod
      })

      if (acaraLayak.length === 0) continue

      // Pilih 2–3 acara rawak
      const bilanganAcara = ACARA_PER_ATLET_MIN +
        Math.floor(Math.random() * (ACARA_PER_ATLET_MAX - ACARA_PER_ATLET_MIN + 1))
      const acaraTerpilih = piliRawak(acaraLayak, bilanganAcara)
      const acaraIds      = acaraTerpilih.map(a => a.aceraId || a.id)

      // Jana noBib
      bibCounterMap[bibPrefix] = (bibCounterMap[bibPrefix] || 0) + 1
      let noBib = bibPrefix + String(bibCounterMap[bibPrefix]).padStart(bibFormat, '0')
      // Elak duplikat BIB
      while (takenBib.has(noBib)) {
        bibCounterMap[bibPrefix]++
        noBib = bibPrefix + String(bibCounterMap[bibPrefix]).padStart(bibFormat, '0')
      }
      takenBib.add(noBib)

      pendBatch.set(
        doc(db, 'kejohanan', kejohanan.id, 'pendaftaran', atlet.noKP),
        {
          noBib,
          noKP:       atlet.noKP,
          namaAtlet:  atlet.nama,
          jantina:    atlet.jantina,
          tarikhLahir:atlet.tarikhLahir,
          kodSekolah,
          kategoriKod:atlet.kategoriKod,
          acaraIds,
          isAktif:    true,
          isRelay:    false,
          isSeedData: true,
          createdAt:  serverTimestamp(),
          updatedAt:  serverTimestamp(),
        }
      )
      pendBatchN++
      pendOk++
    }

    // Commit pendaftaran batch
    if (pendBatchN > 0) {
      try {
        await pendBatch.commit()
        onLog(`  ✓ ${pendBatchN} pendaftaran berjaya`)
      } catch (e) {
        onLog(`  ✗ Gagal tulis pendaftaran: ${e.message}`)
        fail += pendBatchN
        pendOk -= pendBatchN
      }
    } else {
      onLog(`  ⚠ Tiada acara yang sesuai — pendaftaran dikosongkan`)
    }
  }

  onLog('\n─────────────────────────────────────────────────')
  onLog(`✅ Selesai: ${atletOk} atlet | ${pendOk} pendaftaran | ${atletSkip} skip | ${fail} gagal`)
  onProgress({ done: TOTAL_ATLET, total: TOTAL_ATLET, label: 'Selesai' })

  return { atletOk, atletSkip, pendOk, fail }
}

// ─── PADAM SEED DATA ──────────────────────────────────────────────────────────

/**
 * deleteSeedData — Padam semua rekod yang ditanda { isSeedData: true }
 * dari collection `atlet` dan subcollection `pendaftaran`.
 *
 * @param {Function} onLog  Callback(msg: string)
 * @returns {Promise<{ deleted: number }>}
 */
export async function deleteSeedData(onLog = () => {}) {
  let deleted = 0

  onLog('🗑 Memuat atlet seed…')
  const atletSnap = await getDocs(
    query(collection(db, 'atlet'), where('isSeedData', '==', true))
  )
  onLog(`  → ${atletSnap.size} atlet seed ditemui`)

  // Padam atlet dalam batch
  const chunks = []
  const docs   = atletSnap.docs
  for (let i = 0; i < docs.length; i += 499) chunks.push(docs.slice(i, i + 499))
  for (const chunk of chunks) {
    const b = writeBatch(db)
    chunk.forEach(d => b.delete(d.ref))
    await b.commit()
    deleted += chunk.length
    onLog(`  ✓ ${deleted}/${atletSnap.size} atlet dipadam`)
  }

  // Padam pendaftaran seed dalam semua kejohanan
  onLog('🗑 Memuat pendaftaran seed…')
  const kejSnap = await getDocs(collection(db, 'kejohanan'))
  for (const kej of kejSnap.docs) {
    const pendSnap = await getDocs(
      query(
        collection(db, 'kejohanan', kej.id, 'pendaftaran'),
        where('isSeedData', '==', true)
      )
    )
    if (pendSnap.empty) continue
    onLog(`  → ${pendSnap.size} pendaftaran seed dalam ${kej.id}`)
    const b = writeBatch(db)
    pendSnap.docs.forEach(d => b.delete(d.ref))
    await b.commit()
    deleted += pendSnap.size
  }

  onLog(`✅ ${deleted} rekod seed dipadam`)
  return { deleted }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEED PENDAFTARAN — baca dari Firestore, pre-flight check, log terperinci
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * checkSeedReady — semak syarat sebelum seed boleh dijalankan.
 *
 * @returns {Promise<{
 *   sekolah:   { count: number, ok: boolean },
 *   kejohanan: { id: string|null, nama: string|null, tahun: number, ok: boolean },
 *   acara:     { count: number, byKat: object, ok: boolean },
 *   ready:     boolean,
 *   warnings:  string[],
 * }>}
 */
export async function checkSeedReady() {
  const warnings = []

  // 1. Semak sekolah
  const sekolahSnap = await getDocs(collection(db, 'sekolah'))
  const sekolahCount = sekolahSnap.size
  if (sekolahCount === 0) warnings.push('Tiada sekolah dalam sistem. Jalankan seed sekolah dahulu.')

  // 2. Semak kejohanan aktif
  let kejohanan = null
  try {
    const q1 = query(collection(db, 'kejohanan'), where('statusKejohanan', '==', 'aktif'), orderBy('createdAt', 'desc'), limit(1))
    const snap1 = await getDocs(q1)
    if (!snap1.empty) {
      kejohanan = { id: snap1.docs[0].id, ...snap1.docs[0].data() }
    } else {
      // Cuba ambil terkini walaupun bukan aktif
      const q2 = query(collection(db, 'kejohanan'), orderBy('createdAt', 'desc'), limit(1))
      const snap2 = await getDocs(q2)
      if (!snap2.empty) {
        kejohanan = { id: snap2.docs[0].id, ...snap2.docs[0].data() }
        warnings.push(`Tiada kejohanan "aktif" — akan guna kejohanan terkini: "${kejohanan.namaKejohanan}"`)
      }
    }
  } catch (_) {}
  if (!kejohanan) warnings.push('Tiada kejohanan dalam sistem. Buat kejohanan dahulu.')

  // 3. Semak acara dalam kejohanan
  let acaraCount = 0
  const byKat = {}
  if (kejohanan) {
    try {
      const acaraSnap = await getDocs(collection(db, 'kejohanan', kejohanan.id, 'acara'))
      acaraCount = acaraSnap.size
      acaraSnap.docs.forEach(d => {
        const a = d.data()
        const key = `${a.kategoriKod}-${a.jantina}`
        byKat[key] = (byKat[key] || 0) + 1
      })
      if (acaraCount === 0) warnings.push('Tiada acara dalam kejohanan ini. Setup acara dahulu.')
    } catch (_) {}
  }

  const tahunKej = kejohanan?.tarikhMula
    ? new Date(kejohanan.tarikhMula?.toDate?.() || kejohanan.tarikhMula).getFullYear()
    : new Date().getFullYear()

  return {
    sekolah:   { count: sekolahCount, ok: sekolahCount > 0 },
    kejohanan: { id: kejohanan?.id || null, nama: kejohanan?.namaKejohanan || null, tahun: tahunKej, ok: !!kejohanan },
    acara:     { count: acaraCount, byKat, ok: acaraCount > 0 },
    ready:     sekolahCount > 0 && !!kejohanan && acaraCount > 0,
    warnings,
  }
}

// ─── Tahun lahir ikut urutan untuk setiap jenis sekolah ──────────────────────
// Tujuan: dapatkan campuran kategori yang realistik dalam satu sekolah
function tahunLahirUrutan(jenisSekolah, idx, tahunKej) {
  const pola = {
    SR:   [
      tahunKej - 10, tahunKej - 12, tahunKej - 9,
      tahunKej - 11, tahunKej - 10,
    ],
    SM:   [
      tahunKej - 14, tahunKej - 16, tahunKej - 18,
      tahunKej - 13, tahunKej - 15,
    ],
    PPKI: [
      tahunKej - 14, tahunKej - 12, tahunKej - 16,
      tahunKej - 13, tahunKej - 15,
    ],
  }
  const senarai = pola[jenisSekolah] || pola.SM
  return senarai[idx % senarai.length]
}

/**
 * seedPendaftaran — Seed atlet + pendaftaran acara berdasarkan data sekolah
 * yang sudah wujud dalam Firestore.
 *
 * Logik:
 *   1. Baca semua sekolah dari collection `sekolah`
 *   2. Baca kejohanan aktif (atau terkini)
 *   3. Baca semua acara dalam kejohanan tersebut
 *   4. Untuk setiap sekolah:
 *      - Jana 5L + 5P atlet
 *      - Simpan ke collection `atlet`
 *      - Daftar setiap atlet ke 2 acara yang sesuai (jantina + kategoriKod)
 *      - noBib = bibPrefix + counter 001, 002, …
 *      - Simpan ke `kejohanan/{id}/pendaftaran/{noBib}`
 *
 * @param {Function} onProgress  Callback({ done, total, sekolah, label })
 * @param {Function} onLog       Callback(msg: string)
 * @returns {Promise<{ sekolahCount, atletOk, atletSkip, pendOk, fail }>}
 */
export async function seedPendaftaran(onProgress = () => {}, onLog = () => {}) {

  let atletOk = 0, atletSkip = 0, pendOk = 0, fail = 0
  let kpCounter = Math.floor(Date.now() / 100) % 9000 + 1000

  onLog('⏳ Pre-flight check…')
  onProgress({ done: 0, total: 1, sekolah: '—', label: 'Menyediakan…' })

  // ── LANGKAH 1: Load sekolah dari Firestore ────────────────────────────────
  const sekolahSnap = await getDocs(query(collection(db, 'sekolah'), orderBy('namaSekolah')))
  const sekolahList = sekolahSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  if (sekolahList.length === 0) {
    onLog('✗ Tiada sekolah dalam sistem. Seed sekolah dahulu.')
    return { sekolahCount: 0, atletOk: 0, atletSkip: 0, pendOk: 0, fail: 0 }
  }
  onLog(`  ✓ ${sekolahList.length} sekolah ditemui`)

  // ── LANGKAH 2: Load kejohanan ─────────────────────────────────────────────
  let kejohanan = null
  try {
    const qA = query(collection(db, 'kejohanan'), where('statusKejohanan', '==', 'aktif'), orderBy('createdAt', 'desc'), limit(1))
    const sA = await getDocs(qA)
    if (!sA.empty) {
      kejohanan = { id: sA.docs[0].id, ...sA.docs[0].data() }
    } else {
      const qAll = query(collection(db, 'kejohanan'), orderBy('createdAt', 'desc'), limit(1))
      const sAll = await getDocs(qAll)
      if (!sAll.empty) kejohanan = { id: sAll.docs[0].id, ...sAll.docs[0].data() }
    }
  } catch (e) { onLog(`  ⚠ ${e.message}`) }

  if (!kejohanan) {
    onLog('✗ Tiada kejohanan. Buat kejohanan dahulu.')
    return { sekolahCount: sekolahList.length, atletOk: 0, atletSkip: 0, pendOk: 0, fail: 0 }
  }
  const tahunKej = kejohanan.tarikhMula
    ? new Date(kejohanan.tarikhMula?.toDate?.() || kejohanan.tarikhMula).getFullYear()
    : new Date().getFullYear()
  onLog(`  ✓ Kejohanan: "${kejohanan.namaKejohanan}" (${tahunKej})`)

  // ── LANGKAH 3: Load acara ─────────────────────────────────────────────────
  let acaraList = []
  try {
    const aS = await getDocs(collection(db, 'kejohanan', kejohanan.id, 'acara'))
    acaraList = aS.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (e) { onLog(`  ⚠ ${e.message}`) }

  if (acaraList.length === 0) {
    onLog('✗ Tiada acara dalam kejohanan. Setup acara dahulu.')
    return { sekolahCount: sekolahList.length, atletOk: 0, atletSkip: 0, pendOk: 0, fail: 0 }
  }
  onLog(`  ✓ ${acaraList.length} acara ditemui`)

  // ── LANGKAH 4: Load noKP sedia ada (semak duplikat) ──────────────────────
  const atletSnap = await getDocs(collection(db, 'atlet'))
  const takenKP   = new Set(atletSnap.docs.map(d => d.id))
  onLog(`  ✓ ${takenKP.size} atlet sedia ada`)

  // ── LANGKAH 5: Load noBib sedia ada dalam kejohanan ──────────────────────
  const pendSnap = await getDocs(collection(db, 'kejohanan', kejohanan.id, 'pendaftaran'))
  const takenBib = new Set(pendSnap.docs.map(d => d.id))
  onLog(`  ✓ ${takenBib.size} pendaftaran sedia ada`)
  onLog('─────────────────────────────────────────────────')

  const TOTAL = sekolahList.length
  let doneSekolah = 0
  let globalAtletIdx = 0   // untuk nama pool

  // ── LANGKAH 6: Loop setiap sekolah ────────────────────────────────────────
  for (const sekolah of sekolahList) {
    const {
      kodSekolah, namaSekolah,
      kategori = 'SM',
      bibPrefix = kodSekolah,
      bibFormat  = 3,
      bibMula    = 1,
      negeri     = 'Terengganu',
      daerah     = 'Kemaman',
    } = sekolah

    onLog(`\n📚 ${namaSekolah} (${kodSekolah}) [${kategori}]`)
    onProgress({ done: doneSekolah, total: TOTAL, sekolah: namaSekolah, label: 'Jana atlet…' })

    // Kira BIB sedia ada untuk sekolah ini
    let bibCounter = bibMula - 1
    for (const bib of takenBib) {
      if (bib.startsWith(bibPrefix)) {
        const n = parseInt(bib.slice(bibPrefix.length), 10)
        if (!isNaN(n) && n > bibCounter) bibCounter = n
      }
    }

    // Kumpul atlet yang akan ditulis untuk sekolah ini
    const atletBuatSekolah = []   // untuk log + pendaftaran

    // ── Jana 5L + 5P ──────────────────────────────────────────────────────
    for (const jantina of ['L', 'P']) {
      const namaPool = jantina === 'L' ? NAMA_L : NAMA_P

      for (let i = 0; i < 5; i++) {
        // Tarikh lahir ikut pola kategori
        const tahunLahir = tahunLahirUrutan(kategori, i, tahunKej)
        const bulan = String((i % 12) + 1).padStart(2, '0')
        const hari  = String((i % 28) + 1).padStart(2, '0')
        const tarikhLahir = `${tahunLahir}-${bulan}-${hari}`

        const kategoriKod = kategori === 'PPKI'
          ? 'PPKI'
          : kiraKategori(tarikhLahir, tahunKej)

        // noKP unik
        let noKP, attempts = 0
        do { kpCounter++; noKP = janaNoKP(tarikhLahir, kpCounter); attempts++ }
        while (takenKP.has(noKP) && attempts < 200)

        if (takenKP.has(noKP)) {
          onLog(`  ⚠ Gagal jana noKP unik — skip`)
          atletSkip++
          continue
        }
        takenKP.add(noKP)

        // Nama
        const nama = namaPool[(globalAtletIdx + i) % namaPool.length]

        atletBuatSekolah.push({ noKP, nama, jantina, tarikhLahir, kategoriKod })
        globalAtletIdx++
      }
    }

    // ── Batch write atlet ─────────────────────────────────────────────────
    const atletBatch = writeBatch(db)
    for (const a of atletBuatSekolah) {
      atletBatch.set(doc(db, 'atlet', a.noKP), {
        noKP: a.noKP, nama: a.nama,
        jantina: a.jantina, tarikhLahir: a.tarikhLahir,
        warganegara: 'MY', kodSekolah,
        kategoriSekolah: kategori,
        negeri, daerah,
        isAktif: true, isSeedData: true,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      })
    }
    try {
      await atletBatch.commit()
      atletOk += atletBuatSekolah.length
    } catch (e) {
      onLog(`  ✗ Gagal tulis atlet: ${e.message}`)
      fail += atletBuatSekolah.length
      doneSekolah++
      continue
    }

    // ── Batch write pendaftaran ────────────────────────────────────────────
    const pendBatch = writeBatch(db)
    let pendCount   = 0

    for (const a of atletBuatSekolah) {
      // Cari acara yang sesuai: jantina match + kategoriKod match
      const acLayak = acaraList.filter(ac =>
        ac.jantina === a.jantina &&
        (a.kategoriKod === 'PPKI'
          ? ac.kategoriKod === 'PPKI'
          : ac.kategoriKod === a.kategoriKod)
      )

      // Pilih 2 acara rawak (atau semua jika kurang dari 2)
      const acTerpilih = piliRawak(acLayak, 2)
      const acaraIds   = acTerpilih.map(ac => ac.aceraId || ac.id)

      // Assign noBib
      bibCounter++
      let noBib = bibPrefix + String(bibCounter).padStart(bibFormat, '0')
      while (takenBib.has(noBib)) {
        bibCounter++
        noBib = bibPrefix + String(bibCounter).padStart(bibFormat, '0')
      }
      takenBib.add(noBib)

      pendBatch.set(
        doc(db, 'kejohanan', kejohanan.id, 'pendaftaran', a.noKP),
        {
          noBib, noKP: a.noKP, namaAtlet: a.nama,
          jantina: a.jantina, tarikhLahir: a.tarikhLahir,
          kodSekolah, kategoriKod: a.kategoriKod,
          acaraIds,
          isAktif: true, isRelay: false, isSeedData: true,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        }
      )
      pendCount++

      // ── Log satu baris per atlet ──────────────────────────────────────
      const namaAcara = acTerpilih.map(ac => ac.namaAcara || ac.aceraId || ac.id).join(', ')
      const pad = (s, n) => s.length >= n ? s : s + ' '.repeat(n - s.length)
      onLog(
        `  ${pad(a.nama, 22)} → ${noBib.padEnd(8)} → ${namaAcara || '— (tiada acara sesuai)'}`
      )
    }

    try {
      await pendBatch.commit()
      pendOk += pendCount
    } catch (e) {
      onLog(`  ✗ Gagal tulis pendaftaran: ${e.message}`)
      fail += pendCount
      pendOk -= pendCount   // reversal
    }

    doneSekolah++
    onProgress({ done: doneSekolah, total: TOTAL, sekolah: namaSekolah, label: 'Selesai' })
  }

  onLog('\n═════════════════════════════════════════════════')
  onLog(`✅ ${sekolahList.length} sekolah | ${atletOk} atlet | ${pendOk} pendaftaran | ${atletSkip} skip | ${fail} gagal`)

  return {
    sekolahCount: sekolahList.length,
    atletOk, atletSkip, pendOk, fail,
  }
}

// ─── seedKeputusan ────────────────────────────────────────────────────────────
/**
 * Jana keputusan rawak untuk semua heat yang belum ada keputusan.
 * Marks all heats dengan { isSeedData: true } supaya boleh dipadam.
 *
 * @param {Function} onProgress (pct: number, label: string) => void
 * @param {Function} onLog      (msg: string) => void
 * @returns Promise<{ heatOk, heatSkip, heatFail }>
 */
export async function seedKeputusan(onProgress, onLog) {
  onProgress?.(0, 'Memuat kejohanan...')
  onLog?.('┌──────────────────────────────────────────────')
  onLog?.('│  SEED KEPUTUSAN — jana keputusan rawak')
  onLog?.('└──────────────────────────────────────────────')

  // 1. Cari kejohanan aktif
  const kejSnap = await getDocs(
    query(collection(db, 'kejohanan'), where('statusKejohanan', '==', 'aktif'))
  )
  if (kejSnap.empty) {
    onLog?.('❌ Tiada kejohanan aktif. Pastikan statusKejohanan = "aktif".')
    return { heatOk: 0, heatSkip: 0, heatFail: 0 }
  }
  const kej   = { id: kejSnap.docs[0].id, ...kejSnap.docs[0].data() }
  const kejId = kej.id
  onLog?.(`✓ Kejohanan: ${kej.namaKejohanan}`)

  // 2. Load semua acara
  const acaraSnap = await getDocs(collection(db, 'kejohanan', kejId, 'acara'))
  const acaraList = acaraSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  onLog?.(`✓ ${acaraList.length} acara ditemui\n`)

  let heatOk = 0, heatSkip = 0, heatFail = 0

  for (let ai = 0; ai < acaraList.length; ai++) {
    const acara = acaraList[ai]
    onProgress?.(Math.round((ai / acaraList.length) * 100), acara.namaAcara)

    const heatSnap = await getDocs(
      collection(db, 'kejohanan', kejId, 'acara', acara.id, 'heat')
    )
    const heats = heatSnap.docs.map(d => ({ id: d.id, ...d.data() }))

    for (const heat of heats) {
      const peserta = heat.peserta || []
      if (peserta.length === 0) { heatSkip++; continue }

      // Skip jika sudah ada keputusan
      const sudahAda = peserta.some(p => p.keputusan !== null && p.keputusan !== undefined)
      if (sudahAda) {
        heatSkip++
        onLog?.(`  ↷ Skip (ada keputusan): ${acara.namaAcara} H${heat.noHeat || 1}`)
        continue
      }

      try {
        const isPadang = ['padang_lompat', 'padang_balin'].includes(acara.jenisAcara)

        const updatedPeserta = peserta.map(p => {
          // 8% kemungkinan DNS atau DNF
          if (Math.random() < 0.08) {
            return { ...p, status: Math.random() < 0.5 ? 'DNS' : 'DNF', keputusan: null, rankDalamHeat: null }
          }

          if (isPadang) {
            const nCubaan = peserta.length > 8 ? 3 : 6
            const base    = _baseJarak(acara)
            const cubaan  = Array.from({ length: nCubaan }, () =>
              Math.random() < 0.12
                ? 'NM'
                : parseFloat((base + (Math.random() * 1.4 - 0.7)).toFixed(2))
            )
            const best = cubaan.filter(c => c !== 'NM' && c > 0)
            return {
              ...p,
              status: 'selesai',
              cubaan,
              keputusan: best.length ? Math.max(...best) : null,
              rankDalamHeat: null,
            }
          } else {
            const base = _baseMasa(acara)
            const v    = base * (0.97 + Math.random() * 0.09)  // ±~6%
            return { ...p, status: 'selesai', keputusan: parseFloat(v.toFixed(2)), rankDalamHeat: null }
          }
        })

        // Assign rank
        const finishers = updatedPeserta
          .filter(p => p.status === 'selesai' && p.keputusan !== null)
          .sort((a, b) => isPadang ? b.keputusan - a.keputusan : a.keputusan - b.keputusan)
        finishers.forEach((p, i) => { p.rankDalamHeat = i + 1 })

        const windVal = acara.isWindReading
          ? parseFloat((Math.random() * 3.5 - 1.5).toFixed(1))
          : null

        const heatRef = doc(db, 'kejohanan', kejId, 'acara', acara.id, 'heat', heat.id)
        await updateDoc(heatRef, {
          peserta:         updatedPeserta,
          statusKeputusan: 'tidak_rasmi',
          statusHeat:      'selesai',
          windSpeed:       windVal,
          isWindLegal:     windVal !== null ? Math.abs(windVal) <= 2.0 : null,
          updatedAt:       serverTimestamp(),
          isSeedData:      true,
        })

        const selesai = updatedPeserta.filter(p => p.status === 'selesai').length
        onLog?.(`  ✓ ${acara.namaAcara} H${heat.noHeat || 1} — ${selesai}/${peserta.length} selesai${windVal !== null ? ` | angin: ${windVal > 0 ? '+' : ''}${windVal}m/s` : ''}`)
        heatOk++
      } catch (e) {
        onLog?.(`  ✗ ${acara.namaAcara} H${heat.noHeat || 1}: ${e.message}`)
        heatFail++
      }
    }
  }

  onProgress?.(100, 'Selesai')
  onLog?.(`\n✅ ${heatOk} heat dikemaskini | ${heatSkip} dilangkau | ${heatFail} gagal`)
  return { heatOk, heatSkip, heatFail }
}

// ─── Helpers untuk seedKeputusan ─────────────────────────────────────────────

function _baseMasa(acara) {
  const nama = (acara.namaAcara || '').toLowerCase()
  const kat  = acara.kategoriKod || 'E'
  // Skala mengikut kategori (lebih muda = lebih perlahan)
  const scale = { A: 1.12, B: 1.07, C: 1.04, D: 1.02, E: 1.00, PPKI: 1.18 }[kat] || 1.0

  let base = 60.0
  if      (/\b100m\b/.test(nama))             base = 11.5
  else if (/\b200m\b/.test(nama))             base = 23.8
  else if (/\b400m\b/.test(nama))             base = 53.0
  else if (/\b800m\b/.test(nama))             base = 138.0
  else if (/\b1500m\b/.test(nama))            base = 275.0
  else if (/\b3000m\b/.test(nama))            base = 570.0
  else if (/\b5000m\b/.test(nama))            base = 980.0
  else if (/110m|100mh|110mh/.test(nama))     base = 15.2
  else if (/400mh/.test(nama))                base = 62.0
  else if (/4x100|relay/.test(nama))          base = 48.0
  else if (/4x400/.test(nama))                base = 215.0

  return base * scale
}

function _baseJarak(acara) {
  const nama = (acara.namaAcara || '').toLowerCase()
  const kat  = acara.kategoriKod || 'E'
  const scale = { A: 0.88, B: 0.92, C: 0.95, D: 0.98, E: 1.00, PPKI: 0.85 }[kat] || 1.0

  let base = 5.0
  if      (nama.includes('lompat jauh'))   base = 5.6
  else if (nama.includes('lompat kijang')) base = 11.5
  else if (nama.includes('lompat tinggi')) base = 1.55
  else if (nama.includes('bergalah'))      base = 3.5
  else if (nama.includes('peluru'))        base = 10.8
  else if (nama.includes('cakera'))        base = 31.0
  else if (nama.includes('lembing'))       base = 38.0
  else if (nama.includes('tukul'))         base = 27.0

  return base * scale
}

// ─── seedDaftarAcara ──────────────────────────────────────────────────────────
/**
 * seedDaftarAcara — Daftar atlet SEDIA ADA ke acara dalam kejohanan aktif.
 *
 * Ikut aliran guru sebenar:
 *   1. Baca atlet sedia ada (isSeedData:true) dari `atlet`
 *   2. Padankan dengan acara (jantina + kategoriKod)
 *   3. Jika atlet sudah ada rekod pendaftaran → update acaraIds (tambah)
 *   4. Jika belum → buat rekod baru + assign noBib dari prefix sekolah
 *   5. Semua rekod ditanda { isSeedData: true }
 *
 * @param {Function} onProgress  ({ done, total, label }) => void
 * @param {Function} onLog       (msg: string) => void
 * @returns {Promise<{ pendBaru, pendKemaskini, skip, fail }>}
 */
export async function seedDaftarAcara(onProgress = () => {}, onLog = () => {}) {
  let pendBaru = 0, pendKemaskini = 0, skip = 0, fail = 0

  onProgress({ done: 0, total: 1, label: 'Menyediakan…' })
  onLog('┌──────────────────────────────────────────────')
  onLog('│  SEED DAFTAR ACARA — guna atlet sedia ada')
  onLog('└──────────────────────────────────────────────')

  // ── 1. Load kejohanan aktif ───────────────────────────────────────────────
  let kejohanan = null
  try {
    const q1 = query(collection(db, 'kejohanan'), where('statusKejohanan', '==', 'aktif'), orderBy('createdAt', 'desc'), limit(1))
    const s1 = await getDocs(q1)
    if (!s1.empty) {
      kejohanan = { id: s1.docs[0].id, ...s1.docs[0].data() }
    } else {
      const q2 = query(collection(db, 'kejohanan'), orderBy('createdAt', 'desc'), limit(1))
      const s2 = await getDocs(q2)
      if (!s2.empty) kejohanan = { id: s2.docs[0].id, ...s2.docs[0].data() }
    }
  } catch (e) { onLog(`  ⚠ ${e.message}`) }

  if (!kejohanan) {
    onLog('✗ Tiada kejohanan. Buat kejohanan dahulu.')
    return { pendBaru: 0, pendKemaskini: 0, skip: 0, fail: 0 }
  }
  const tahunKej = kejohanan.tarikhMula
    ? new Date(kejohanan.tarikhMula?.toDate?.() || kejohanan.tarikhMula).getFullYear()
    : new Date().getFullYear()
  onLog(`✓ Kejohanan: "${kejohanan.namaKejohanan}" (${tahunKej})`)

  // ── 2. Load acara ─────────────────────────────────────────────────────────
  let acaraList = []
  try {
    const aS = await getDocs(collection(db, 'kejohanan', kejohanan.id, 'acara'))
    acaraList = aS.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (e) { onLog(`  ⚠ ${e.message}`) }

  if (acaraList.length === 0) {
    onLog('✗ Tiada acara dalam kejohanan. Setup acara dahulu.')
    return { pendBaru: 0, pendKemaskini: 0, skip: 0, fail: 0 }
  }
  onLog(`✓ ${acaraList.length} acara ditemui`)

  // ── 3. Load sekolah (untuk bibPrefix) ─────────────────────────────────────
  const sekolahMap = {}
  try {
    const sS = await getDocs(collection(db, 'sekolah'))
    sS.docs.forEach(d => { sekolahMap[d.id] = d.data() })
  } catch (_) {}
  onLog(`✓ ${Object.keys(sekolahMap).length} sekolah ditemui`)

  // ── 4. Load atlet sedia ada (seed sahaja) ─────────────────────────────────
  let atletList = []
  try {
    const aSnap = await getDocs(
      query(collection(db, 'atlet'), where('isSeedData', '==', true))
    )
    atletList = aSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (e) { onLog(`  ⚠ ${e.message}`) }

  if (atletList.length === 0) {
    onLog('✗ Tiada atlet seed. Jalankan Seed Atlet dahulu (Tab 1).')
    return { pendBaru: 0, pendKemaskini: 0, skip: 0, fail: 0 }
  }
  onLog(`✓ ${atletList.length} atlet seed ditemui\n`)

  // ── 5. Load pendaftaran sedia ada ─────────────────────────────────────────
  const pendSnap = await getDocs(collection(db, 'kejohanan', kejohanan.id, 'pendaftaran'))
  const pendByKP  = {}   // noKP → rekod pendaftaran
  const takenBib  = new Set()
  pendSnap.docs.forEach(d => {
    const p = { id: d.id, ...d.data() }
    if (p.noKP) pendByKP[p.noKP] = p
    if (p.noBib) takenBib.add(p.noBib)
  })
  onLog(`✓ ${pendSnap.size} pendaftaran sedia ada`)

  // ── Diagnostik — semak sample data ───────────────────────────────────────
  const sampleAtlet = atletList[0]
  const sampleAcara = acaraList[0]
  onLog(`\n📋 DIAGNOSTIK:`)
  onLog(`  Atlet[0] jantina="${sampleAtlet?.jantina}" tarikhLahir="${sampleAtlet?.tarikhLahir}" kategoriKod="${sampleAtlet?.kategoriKod}"`)
  const katDiira = kiraKategori(sampleAtlet?.tarikhLahir, tahunKej)
  onLog(`  kiraKategori → "${katDiira}" (tahunKej=${tahunKej})`)
  onLog(`  Acara[0] jantina="${sampleAcara?.jantina}" kategoriKod="${sampleAcara?.kategoriKod}" isAktif=${sampleAcara?.isAktif}`)
  // Hitung taburan kategori dalam acara
  const katAcaraMap = {}
  acaraList.forEach(a => { katAcaraMap[a.kategoriKod] = (katAcaraMap[a.kategoriKod]||0)+1 })
  onLog(`  Acara kategori: ${JSON.stringify(katAcaraMap)}`)
  // Hitung taburan kategori dalam atlet
  const katAtletMap = {}
  atletList.forEach(a => {
    const k = a.kategoriKod || kiraKategori(a.tarikhLahir, tahunKej) || '?'
    katAtletMap[k] = (katAtletMap[k]||0)+1
  })
  onLog(`  Atlet kategori: ${JSON.stringify(katAtletMap)}`)

  onLog('─────────────────────────────────────────────────')

  // ── 6. BIB counter per sekolah ────────────────────────────────────────────
  const bibCounterMap = {}

  function initBibCounter(kodSekolah) {
    if (bibCounterMap[kodSekolah] !== undefined) return
    const sek    = sekolahMap[kodSekolah] || {}
    const prefix = (sek.bibPrefix || kodSekolah || 'BIB').toUpperCase()
    let maks = (Number(sek.bibMula) || 1) - 1
    for (const bib of takenBib) {
      if (bib.startsWith(prefix)) {
        const n = parseInt(bib.slice(prefix.length), 10)
        if (!isNaN(n) && n > maks) maks = n
      }
    }
    bibCounterMap[kodSekolah] = maks
  }

  function janaBibBaru(kodSekolah) {
    initBibCounter(kodSekolah)
    const sek    = sekolahMap[kodSekolah] || {}
    const prefix = (sek.bibPrefix || kodSekolah || 'BIB').toUpperCase()
    const fmt    = Number(sek.bibFormat) || 3
    bibCounterMap[kodSekolah]++
    let noBib = prefix + String(bibCounterMap[kodSekolah]).padStart(fmt, '0')
    while (takenBib.has(noBib)) {
      bibCounterMap[kodSekolah]++
      noBib = prefix + String(bibCounterMap[kodSekolah]).padStart(fmt, '0')
    }
    takenBib.add(noBib)
    return noBib
  }

  // ── 7. Loop setiap atlet ──────────────────────────────────────────────────
  const TOTAL = atletList.length
  let doneCount = 0

  let batch  = writeBatch(db)
  let batchN = 0

  const commitBatch = async () => {
    if (batchN > 0) { await batch.commit(); batch = writeBatch(db); batchN = 0 }
  }

  for (const atlet of atletList) {
    doneCount++
    onProgress({ done: doneCount, total: TOTAL, label: atlet.nama || atlet.noKP })

    // Kira kategoriKod sama seperti sistem sebenar
    const kategoriKod = atlet.kategoriKod || kiraKategori(atlet.tarikhLahir, tahunKej)

    if (!kategoriKod) {
      onLog(`  ↷ Skip (tiada kategori): ${atlet.nama}`)
      skip++
      continue
    }

    // Cari acara yang sesuai (jantina + kategoriKod)
    const acLayak = acaraList.filter(ac =>
      ac.jantina === atlet.jantina &&
      (kategoriKod === 'PPKI' ? ac.kategoriKod === 'PPKI' : ac.kategoriKod === kategoriKod) &&
      ac.isAktif !== false
    )

    if (acLayak.length === 0) {
      // Log 3 atlet pertama untuk debug
      if (skip < 3) {
        onLog(`  ↷ Skip(0 acara): ${atlet.nama} | j="${atlet.jantina}" kat="${kategoriKod}"`)
      }
      skip++
      continue
    }

    // Pilih 2 acara rawak
    const acTerpilih  = piliRawak(acLayak, 2)
    const aceraIdsBaru = acTerpilih.map(ac => ac.aceraId || ac.id)
    const namaAcara    = acTerpilih.map(ac => ac.namaAcara || ac.aceraId || ac.id).join(', ')

    const pSedia = pendByKP[atlet.noKP]

    try {
      if (pSedia) {
        // Atlet dah ada pendaftaran — tambah aceraIds (deduplicate)
        const gabung = [...new Set([...(pSedia.acaraIds || []), ...aceraIdsBaru])]
        batch.update(doc(db, 'kejohanan', kejohanan.id, 'pendaftaran', pSedia.id), {
          acaraIds:   gabung,
          isSeedData: true,
          updatedAt:  serverTimestamp(),
        })
        batchN++
        pendKemaskini++
        onLog(`  ↻ ${(atlet.nama || '').padEnd(22)} → ${pSedia.id.padEnd(8)} + ${namaAcara}`)
      } else {
        // Buat rekod baru — sama seperti aliran guru
        const noBib   = janaBibBaru(atlet.kodSekolah)
        batch.set(doc(db, 'kejohanan', kejohanan.id, 'pendaftaran', atlet.noKP), {
          noBib,
          noKP:        atlet.noKP,
          namaAtlet:   atlet.nama,
          jantina:     atlet.jantina,
          tarikhLahir: atlet.tarikhLahir,
          kodSekolah:  atlet.kodSekolah,
          kategoriKod,
          acaraIds:    aceraIdsBaru,
          isAktif:     true,
          isRelay:     false,
          isSeedData:  true,
          createdAt:   serverTimestamp(),
          updatedAt:   serverTimestamp(),
        })
        batchN++
        pendBaru++
        // Simpan dalam map supaya batch berikutnya tidak buat duplikat
        pendByKP[atlet.noKP] = { id: atlet.noKP, noKP: atlet.noKP, acaraIds: aceraIdsBaru }
        onLog(`  + ${(atlet.nama || '').padEnd(22)} → ${noBib.padEnd(8)} → ${namaAcara}`)
      }

      if (batchN >= 490) await commitBatch()

    } catch (e) {
      onLog(`  ✗ ${atlet.nama}: ${e.message}`)
      fail++
    }
  }

  try { await commitBatch() } catch (e) {
    onLog(`  ✗ Commit akhir gagal: ${e.message}`)
    fail++
  }

  onLog('\n═════════════════════════════════════════════════')
  onLog(`✅ Baru: ${pendBaru} | Kemaskini: ${pendKemaskini} | Skip: ${skip} | Gagal: ${fail}`)
  onProgress({ done: TOTAL, total: TOTAL, label: 'Selesai' })

  return { pendBaru, pendKemaskini, skip, fail }
}
