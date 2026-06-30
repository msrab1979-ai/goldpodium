/**
 * validasiPendaftaran.js
 * ─────────────────────
 * 7-gate validation engine untuk pendaftaran atlet ke acara.
 *
 * SEMUA had dibaca secara LIVE dari Firestore.
 * Admin ubah had dalam DB → sistem ikut automatik.
 * Tiada nilai hardcode dalam fungsi ini.
 *
 * GP Multi-tenant: SEMUA path mesti guna tenants/{schoolId}/...
 *
 * GATE 1 — key: noKP
 *   Had: kategori/{kategoriId}.hadAcaraIndividu + hadAcaraBeregu
 *   Semak bilangan acara individu & relay yang atlet sudah daftar.
 *
 * GATE 2 — key: kodSekolah + aceraId
 *   Had: acara/{aceraId}.hadAtletPerSekolah
 *   Semak bilangan atlet yang sudah daftar acara yang sama.
 *
 * GATE 3 — key: noKP + tarikhLahir
 *   Had: kategori/{kategoriId}.tahunLahirMin + tahunLahirMax
 *   Kira dari TAHUN LAHIR sahaja (standard WA — bukan tarikh tepat).
 *
 * GATE 4 — key: noKP + jantina
 *   Sumber: atlet/{atletId}.jantina vs acara.jantina dari Firestore
 *
 * GATE 5 — skip dalam GP (semua atlet dalam tenant sama → tiada cross-school issue)
 *
 * GATE 6 — key: noKP + aceraId + kejohananId
 *   Duplikasi: semak pendaftaran wujud untuk kombinasi ini.
 *
 * GATE 7 — key: noKP + jadualId
 *   Sumber: jadual/{aceraId} — semak masa bertindih dengan acara sedia ada.
 *
 * GATE 8 — key: aceraId + kejohananId
 *   Semak sama ada heat sudah dijana — jika ya, pendaftaran ditutup.
 *   GP: heat adalah FLAT di bawah kejohanan, query where('aceraId', '==', aceraId).
 *
 * Return format:
 *   { valid: boolean, gate: string, mesej: string, had: number, semasa: number }
 */

import { db } from '../firebase/config'
import {
  collection, query, where,
  getDocs, getDoc, doc, getCountFromServer,
} from 'firebase/firestore'

// ─── Path Helpers ─────────────────────────────────────────────────────────────

function katPath(schoolId, kejId, katId) {
  return doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'kategori', katId)
}

function katCol(schoolId, kejId) {
  return collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'kategori')
}

function acaraPath(schoolId, kejId, acaraId) {
  return doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'acara', acaraId)
}

function pendCol(schoolId, kejId) {
  return collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'pendaftaran')
}

function atletPath(schoolId, atletId) {
  return doc(db, 'tenants', schoolId, 'atlet', atletId)
}

function jadualPath(schoolId, kejId, acaraId) {
  return doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'jadual', acaraId)
}

function heatCol(schoolId, kejId) {
  return collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat')
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function masaKeMinit(t) {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return null
  return h * 60 + m
}

function tambahMinit(masa, minit) {
  const [h, m] = masa.split(':').map(Number)
  const jumlah = h * 60 + m + minit
  return `${String(Math.floor(jumlah / 60)).padStart(2, '0')}:${String(jumlah % 60).padStart(2, '0')}`
}

// ─── GATE 1 — Had Acara Per Atlet ─────────────────────────────────────────────
//
// Had baca dari KATEGORI ATLET (bukan kategori acara).
// Kiraan merentas SEMUA acara yang didaftar — guna isIndividu untuk bezakan.
// isIndividu=true → individu, isIndividu=false → berpasukan, undefined → individu (fallback).
//
// Ini memastikan acara OPEN dikira dalam had atlet yang sama.

async function gate1_hadAcaraAtlet(schoolId, noKP, kejohananId, acaraBaruIsIndividu, tarikhLahir, jantina, tahunKejohanan) {
  // ── Cari kategori atlet dari tarikhLahir+jantina ──────────────────────────
  const kategoriSnap = await getDocs(katCol(schoolId, kejohananId))
  const semuaKategori = kategoriSnap.docs.map(d => ({ kod: d.id, ...d.data() }))

  // Tapis: jantina match, bukan OPEN, ada umurHad
  const tKej = Number(tahunKejohanan) || new Date().getFullYear()
  let kategoriAtlet = null

  if (tarikhLahir && jantina) {
    const candidates = semuaKategori.filter(k => {
      if (!k.umurHad) return false
      const lbl = (k.label || k.nama || k.kod || '').toUpperCase()
      if (lbl.includes('OPEN')) return false
      if (jantina === 'L' && !lbl.startsWith('L')) return false
      if (jantina === 'P' && !lbl.startsWith('P')) return false
      const tarikhTerawal = new Date(`${tKej - Number(k.umurHad)}-01-02`)
      const tarikhTerkini = k.umurMin
        ? new Date(`${tKej - Number(k.umurMin) + 1}-01-01`)
        : new Date(`${tKej + 1}-01-01`)
      const tLahir = new Date(tarikhLahir)
      return tLahir >= tarikhTerawal && tLahir < tarikhTerkini
    })
    if (candidates.length > 0) {
      candidates.sort((a, b) => Number(a.umurHad) - Number(b.umurHad))
      kategoriAtlet = candidates[0].kod
    }
  }

  // Kategori atlet tidak dapat ditentukan — tolak dengan mesej jelas
  if (!kategoriAtlet) {
    return {
      valid: false,
      gate: 'GATE1',
      mesej: 'Kategori atlet tidak dapat ditentukan. Semak tarikh lahir dan pastikan kategori umur sudah dikonfigurasi.',
      had: 0,
      semasa: 0,
    }
  }

  // ── Baca had dari KATEGORI ATLET ──────────────────────────────────────────
  const katDoc = await getDoc(katPath(schoolId, kejohananId, kategoriAtlet))
  const hadIndividu = katDoc.exists() ? (katDoc.data().hadAcaraIndividu ?? 3) : 3
  const hadBeregu   = katDoc.exists() ? (katDoc.data().hadAcaraBeregu   ?? 2) : 2

  // ── Semak pendaftaran atlet dalam kejohanan ini ───────────────────────────
  const pendSnap = await getDocs(
    query(pendCol(schoolId, kejohananId), where('noKP', '==', noKP))
  )

  const semuaAceraIds = []
  pendSnap.docs.forEach(d => (d.data().acaraIds || []).forEach(id => semuaAceraIds.push(id)))

  if (semuaAceraIds.length === 0) {
    return { valid: true, had: acaraBaruIsIndividu ? hadIndividu : hadBeregu, semasa: 0 }
  }

  // ── Baca isIndividu bagi setiap acara sedia ada ───────────────────────────
  const acaraDocs = await Promise.all(
    semuaAceraIds.map(id => getDoc(acaraPath(schoolId, kejohananId, id)))
  )

  let bilanganIndividu = 0
  let bilanganBeregu   = 0
  acaraDocs.forEach(d => {
    if (!d.exists()) return
    if (d.data().isIndividu === false) {
      bilanganBeregu++
    } else {
      bilanganIndividu++
    }
  })

  if (acaraBaruIsIndividu) {
    if (bilanganIndividu >= hadIndividu) {
      return {
        valid: false,
        gate: 'GATE1',
        mesej: `Atlet sudah mencapai had ${hadIndividu} acara individu (Kategori ${kategoriAtlet}).`,
        had: hadIndividu,
        semasa: bilanganIndividu,
      }
    }
    return { valid: true, had: hadIndividu, semasa: bilanganIndividu }
  } else {
    if (bilanganBeregu >= hadBeregu) {
      return {
        valid: false,
        gate: 'GATE1',
        mesej: `Atlet sudah mencapai had ${hadBeregu} acara berkumpulan (Kategori ${kategoriAtlet}).`,
        had: hadBeregu,
        semasa: bilanganBeregu,
      }
    }
    return { valid: true, had: hadBeregu, semasa: bilanganBeregu }
  }
}

// ─── GATE 2 — Had Atlet Per Sekolah Per Acara ─────────────────────────────────

async function gate2_hadAtletSekolah(schoolId, kodSekolah, aceraId, kejohananId) {
  const acaraDoc = await getDoc(acaraPath(schoolId, kejohananId, aceraId))
  const aData = acaraDoc.exists() ? acaraDoc.data() : {}

  // Relay: had = saizPasukan × hadPasukan (dari kategori)
  let hadPerSekolah = aData.hadAtletPerSekolah ?? 2
  if (aData.jenisAcara === 'relay' && aData.kategoriKod) {
    const katDoc = await getDoc(katPath(schoolId, kejohananId, aData.kategoriKod))
    if (katDoc.exists()) {
      const kat = katDoc.data()
      const saizPasukan = Number(kat.saizPasukan) || 4
      const hadPasukan  = aData.jantina === 'P'
        ? (Number(kat.hadPasukanP) || 1)
        : (Number(kat.hadPasukanL) || 1)
      hadPerSekolah = saizPasukan * hadPasukan
    }
  }

  // Semak bilangan atlet yang sudah daftar acara ini
  const pendSnap = await getDocs(
    query(pendCol(schoolId, kejohananId), where('kodSekolah', '==', kodSekolah))
  )

  const semasa = pendSnap.docs
    .filter(d => (d.data().acaraIds || []).includes(aceraId))
    .length

  if (semasa >= hadPerSekolah) {
    return {
      valid: false,
      gate: 'GATE2',
      mesej: `Had atlet sekolah ini untuk acara ini sudah penuh. Maks ${hadPerSekolah} atlet per sekolah.`,
      had: hadPerSekolah,
      semasa,
    }
  }

  return { valid: true, had: hadPerSekolah, semasa }
}

// ─── GATE 3 — Kelayakan Umur (WA Standard) ────────────────────────────────────
//
// KategoriSetup simpan: umurMin (cth: 9) + umurHad (cth: 10) — nilai UMUR
// Gate ini semak kelayakan ikut tarikh lahir penuh (MSSM standard — cut-off 2 Januari):
//   tarikhTerawal = 2 Jan (tahunKejohanan - umurHad)  ← paling tua yang layak
//   tarikhTerkini = 1 Jan (tahunKejohanan - umurMin + 1)  ← paling muda yang layak
// Contoh: Kat B (umurMin=10, umurHad=12), tahun 2026:
//   tarikhTerawal = 2 Jan (2026-12) = 2 Jan 2014
//   tarikhTerkini = 1 Jan (2026-10+1) = 1 Jan 2017  [exclusive → paling muda = 31 Dis 2016]
//   → atlet lahir 2 Jan 2014 hingga 31 Dis 2016 sahaja layak

async function gate3_kelayakanUmur(schoolId, tarikhLahir, kategoriId, kejohananId, tahunKejohanan) {
  const katDoc = await getDoc(katPath(schoolId, kejohananId, kategoriId))

  if (!katDoc.exists()) return { valid: true }

  const { umurMin, umurHad } = katDoc.data()

  if (!umurHad) return { valid: true }

  const tKej = tahunKejohanan || new Date().getFullYear()

  const tarikhTerawal = new Date(`${tKej - Number(umurHad)}-01-02`)
  const tarikhTerkini = umurMin
    ? new Date(`${tKej - Number(umurMin) + 1}-01-01`)
    : new Date(`${tKej + 1}-01-01`)

  const tLahir = new Date(tarikhLahir)

  const fmtTarikhLabel = d =>
    d.toLocaleDateString('ms-MY', { day: 'numeric', month: 'long', year: 'numeric' })
  const labelTerawal = fmtTarikhLabel(tarikhTerawal)
  const labelTerkini = fmtTarikhLabel(new Date(tarikhTerkini.getTime() - 86400000))

  if (tLahir < tarikhTerawal || tLahir >= tarikhTerkini) {
    return {
      valid: false,
      gate: 'GATE3',
      mesej: `Atlet tidak layak mengikut umur untuk kategori ${kategoriId}. ` +
             `Lahir ${tarikhLahir} — mestilah antara ${labelTerawal} hingga ${labelTerkini}.`,
      had: tarikhTerkini.toISOString().slice(0, 10),
      semasa: tarikhLahir,
    }
  }

  return { valid: true, had: tarikhTerkini.toISOString().slice(0, 10), semasa: tarikhLahir }
}

// ─── GATE 4 — Jantina ─────────────────────────────────────────────────────────

async function gate4_jantina(schoolId, noKP, aceraId, kejohananId) {
  const atletDoc = await getDoc(atletPath(schoolId, noKP))
  if (!atletDoc.exists()) {
    return {
      valid: false,
      gate: 'GATE4',
      mesej: 'Rekod atlet tidak ditemui dalam sistem.',
      had: 0,
      semasa: 0,
    }
  }
  const jantinaAtlet = atletDoc.data().jantina

  const acaraDoc = await getDoc(acaraPath(schoolId, kejohananId, aceraId))
  if (!acaraDoc.exists()) {
    return {
      valid: false,
      gate: 'GATE4',
      mesej: 'Acara tidak ditemui dalam sistem.',
      had: 0,
      semasa: 0,
    }
  }
  const jantinaAcara = acaraDoc.data().jantina

  if (jantinaAcara === 'campuran') return { valid: true }

  if (jantinaAtlet !== jantinaAcara) {
    const label = { L: 'Lelaki', P: 'Perempuan' }
    return {
      valid: false,
      gate: 'GATE4',
      mesej: `Jantina tidak sepadan. Acara ini untuk ${label[jantinaAcara] || jantinaAcara} sahaja.`,
      had: 0,
      semasa: 0,
    }
  }

  return { valid: true }
}

// ─── GATE 5 — Skip dalam GP ───────────────────────────────────────────────────
//
// Dalam GP, setiap tenant adalah satu organisasi (sekolah/daerah/negeri).
// Semua atlet dalam tenant yang sama — tiada isu cross-school.
// Kelayakan jenisSekolah (SR/SM) masih boleh disemak melalui kategori acara + atlet,
// tetapi ini ditangguhkan ke v2.0 jika diperlukan.
//
// Pass-open: Gate 5 sentiasa lulus dalam GP.

async function gate5_kategoriSekolah() {
  return { valid: true }
}

// ─── GATE 6 — Duplikasi ───────────────────────────────────────────────────────

async function gate6_duplikasi(schoolId, noKP, aceraId, kejohananId) {
  const pendSnap = await getDocs(
    query(pendCol(schoolId, kejohananId), where('noKP', '==', noKP))
  )

  const sudahDaftar = pendSnap.docs.some(d => (d.data().acaraIds || []).includes(aceraId))

  if (sudahDaftar) {
    return {
      valid: false,
      gate: 'GATE6',
      mesej: 'Atlet sudah berdaftar untuk acara ini.',
      had: 1,
      semasa: 1,
    }
  }

  return { valid: true }
}

// ─── GATE 7 — Konflik Jadual ──────────────────────────────────────────────────
//
// GP: jadual acara disimpan dalam tenants/{schoolId}/kejohanan/{kejId}/jadual/{aceraId}
// Warn sahaja — tidak sekat pendaftaran.

async function gate7_konflikJadual(schoolId, noKP, aceraId, kejohananId) {
  const jadualBaruDoc = await getDoc(jadualPath(schoolId, kejohananId, aceraId))

  if (!jadualBaruDoc.exists()) return { valid: true }

  const jadualBaru = jadualBaruDoc.data()
  if (!jadualBaru.tarikhAcara || !jadualBaru.masaMula) return { valid: true }
  if (jadualBaru.statusJadual === 'batal') return { valid: true }

  const startBaru = masaKeMinit(jadualBaru.masaMula)
  if (startBaru === null) return { valid: true }
  const endBaru = startBaru + (jadualBaru.masaJangka || 60)

  const pendSnap = await getDocs(
    query(pendCol(schoolId, kejohananId), where('noKP', '==', noKP))
  )

  const semuaAceraIds = []
  pendSnap.docs.forEach(d => (d.data().acaraIds || []).forEach(id => semuaAceraIds.push(id)))

  if (semuaAceraIds.length === 0) return { valid: true }

  const jadualSediaDocs = await Promise.all(
    semuaAceraIds.map(id => getDoc(jadualPath(schoolId, kejohananId, id)))
  )

  for (let i = 0; i < jadualSediaDocs.length; i++) {
    const jDoc = jadualSediaDocs[i]
    if (!jDoc.exists()) continue

    const j = jDoc.data()
    if (!j.tarikhAcara || j.tarikhAcara !== jadualBaru.tarikhAcara) continue
    if (j.statusJadual === 'batal') continue
    if (semuaAceraIds[i] === aceraId) continue

    const startSedia = masaKeMinit(j.masaMula)
    if (startSedia === null) continue
    const endSedia = startSedia + (j.masaJangka || 60)

    if (startBaru < endSedia && endBaru > startSedia) {
      const namaAcaraSedia = j.namaAcara || semuaAceraIds[i]
      const masaKonflik = `${j.masaMula}–${tambahMinit(j.masaMula, j.masaJangka || 60)}`
      return {
        valid: true,
        warning: `Amaran: Konflik jadual dengan "${namaAcaraSedia}" ` +
                 `pada ${jadualBaru.tarikhAcara}, jam ${masaKonflik}. ` +
                 `Pendaftaran masih boleh diteruskan.`,
        gate: 'GATE7',
      }
    }
  }

  return { valid: true }
}

// ─── GATE 8 — Heat Sudah Dijana ───────────────────────────────────────────────
//
// GP: heat adalah FLAT di bawah kejohanan — query where('aceraId', '==', aceraId).

async function gate8_heatSudahDijana(schoolId, aceraId, kejohananId) {
  const snap = await getCountFromServer(
    query(heatCol(schoolId, kejohananId), where('aceraId', '==', aceraId))
  )
  if (snap.data().count > 0) {
    return {
      valid: false,
      gate: 'GATE8',
      mesej: 'Pendaftaran ditutup — heat sudah dijana untuk acara ini. Hubungi admin untuk membuat perubahan.',
      had: 0,
      semasa: snap.data().count,
    }
  }
  return { valid: true }
}

// ─── Fungsi Utama ─────────────────────────────────────────────────────────────

/**
 * Validasi lengkap pendaftaran atlet ke acara.
 * Semua had dibaca secara live dari Firestore — tiada nilai hardcode.
 *
 * @param {object} params
 * @param {string} params.schoolId         - ID tenant (schoolId dari userData)
 * @param {string} params.noKP             - No. Kad Pengenalan atlet
 * @param {string} params.tarikhLahir      - Tarikh lahir atlet (YYYY-MM-DD)
 * @param {string} params.kodSekolah       - Kod sekolah/pasukan atlet
 * @param {string} params.kejohananId      - ID kejohanan
 * @param {string} params.aceraId          - ID acara baru yang hendak didaftar
 * @param {string} params.kategoriId       - Kod kategori acara (A|B|C|D|E|PPKI)
 * @param {string} params.jenisAcara       - Jenis acara ('relay' atau lain-lain)
 * @param {string} params.jantina          - Jantina atlet ('L' atau 'P') — untuk Gate 1
 * @param {number} params.tahunKejohanan   - Tahun kejohanan — untuk kira kelayakan umur (Gate 3)
 * @param {boolean} params.bypassHeat      - Skip Gate 8 (heat check) jika true
 * @returns {Promise<{valid: boolean, gate: string, mesej: string, had: number, semasa: number}>}
 */
export async function validasiPendaftaran({
  schoolId,
  noKP,
  tarikhLahir,
  jantina,
  kodSekolah,
  kejohananId,
  aceraId,
  kategoriId,
  jenisAcara,
  tahunKejohanan,
  bypassHeat = false,
}) {
  let result

  // GATE 1 — Had acara per atlet (individu + berkumpulan)
  const acaraBaruDoc = await getDoc(acaraPath(schoolId, kejohananId, aceraId))
  const acaraBaruData = acaraBaruDoc.exists() ? acaraBaruDoc.data() : {}
  const acaraBaruIsIndividu = acaraBaruData.isIndividu ?? (acaraBaruData.jenisAcara !== 'relay')

  // GATE TERBUKA — semak kategori atlet layak untuk acara terbuka
  if (acaraBaruData.isTerbuka) {
    const kategoriTerbuka = acaraBaruData.kategoriTerbuka || []
    if (kategoriTerbuka.length === 0) {
      return { valid: false, gate: 'GATE_TERBUKA', mesej: 'Acara terbuka belum dikonfigurasi — tiada kategori layak ditetapkan.', had: 0, semasa: 0 }
    }
    // Cari kategori atlet dari tarikhLahir + jantina
    const kategoriSnap = await getDocs(katCol(schoolId, kejohananId))
    const semuaKategori = kategoriSnap.docs.map(d => ({ kod: d.id, ...d.data() }))
    const tKej = Number(tahunKejohanan) || new Date().getFullYear()
    let kategoriAtlet = null
    if (tarikhLahir && jantina) {
      const candidates = semuaKategori.filter(k => {
        if (!k.umurHad) return false
        const lbl = (k.label || k.nama || k.kod || '').toUpperCase()
        if (lbl.includes('OPEN') || lbl.includes('TERBUKA')) return false
        if (jantina === 'L' && !lbl.startsWith('L')) return false
        if (jantina === 'P' && !lbl.startsWith('P')) return false
        const tarikhTerawal = new Date(`${tKej - Number(k.umurHad)}-01-02`)
        const tarikhTerkini = k.umurMin
          ? new Date(`${tKej - Number(k.umurMin) + 1}-01-01`)
          : new Date(`${tKej + 1}-01-01`)
        const tLahir = new Date(tarikhLahir)
        return tLahir >= tarikhTerawal && tLahir < tarikhTerkini
      })
      if (candidates.length > 0) {
        candidates.sort((a, b) => Number(a.umurHad) - Number(b.umurHad))
        kategoriAtlet = candidates[0].kod
      }
    }
    if (!kategoriAtlet) {
      return { valid: false, gate: 'GATE_TERBUKA', mesej: 'Kategori atlet tidak dapat ditentukan. Semak tarikh lahir.', had: 0, semasa: 0 }
    }
    if (!kategoriTerbuka.includes(kategoriAtlet)) {
      return { valid: false, gate: 'GATE_TERBUKA', mesej: `Kategori ${kategoriAtlet} tidak layak untuk acara terbuka ini. Kategori layak: ${kategoriTerbuka.join(', ')}.`, had: 0, semasa: 0 }
    }
  }

  result = await gate1_hadAcaraAtlet(schoolId, noKP, kejohananId, acaraBaruIsIndividu, tarikhLahir, jantina, tahunKejohanan)
  if (!result.valid) return result

  // GATE 2 — Had atlet per sekolah per acara
  result = await gate2_hadAtletSekolah(schoolId, kodSekolah, aceraId, kejohananId)
  if (!result.valid) return result

  // GATE 3 — Kelayakan umur (WA standard — ikut tarikh lahir)
  result = await gate3_kelayakanUmur(schoolId, tarikhLahir, kategoriId, kejohananId, tahunKejohanan)
  if (!result.valid) return result

  // GATE 4 — Jantina match
  result = await gate4_jantina(schoolId, noKP, aceraId, kejohananId)
  if (!result.valid) return result

  // GATE 5 — Skip dalam GP (semua atlet dalam tenant = satu organisasi)
  result = await gate5_kategoriSekolah()
  if (!result.valid) return result

  // GATE 6 — Duplikasi check
  result = await gate6_duplikasi(schoolId, noKP, aceraId, kejohananId)
  if (!result.valid) return result

  // GATE 7 — Konflik jadual (warn sahaja — tidak sekat)
  let gate7Warning = null
  result = await gate7_konflikJadual(schoolId, noKP, aceraId, kejohananId)
  if (result.warning) gate7Warning = result.warning

  // GATE 8 — Heat sudah dijana (pendaftaran ditutup) — skip jika bypass aktif
  if (!bypassHeat) {
    result = await gate8_heatSudahDijana(schoolId, aceraId, kejohananId)
    if (!result.valid) return result
  }

  return { valid: true, gate: '', mesej: '', had: 0, semasa: 0, warning: gate7Warning }
}

/**
 * Dapatkan status slot acara untuk paparan badge "X/Y slot" atau "PENUH" dalam UI.
 *
 * @param {string} schoolId
 * @param {string} kodSekolah
 * @param {string} aceraId
 * @param {string} kejohananId
 * @returns {Promise<{semasa: number, had: number, penuh: boolean, slotBaki: number}>}
 */
export async function dapatSlotAcara(schoolId, kodSekolah, aceraId, kejohananId) {
  const [acaraDoc, pendSnap] = await Promise.all([
    getDoc(acaraPath(schoolId, kejohananId, aceraId)),
    getDocs(
      query(pendCol(schoolId, kejohananId), where('kodSekolah', '==', kodSekolah))
    ),
  ])

  const had    = acaraDoc.exists() ? (acaraDoc.data().hadAtletPerSekolah ?? 2) : 2
  const semasa = pendSnap.docs.filter(d => (d.data().acaraIds || []).includes(aceraId)).length
  const slotBaki = had - semasa

  return { semasa, had, penuh: semasa >= had, slotBaki }
}
