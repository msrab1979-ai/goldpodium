/**
 * Backup.jsx — /dashboard/backup
 *
 * Muat turun dan pulihkan data sistem KOAM.
 * Format fail: .koam (JSON dengan metadata)
 *
 * Roles: superadmin sahaja
 */

import { useState, useRef } from 'react'
import {
  collection, getDocs, doc, writeBatch, setDoc, query, where,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'

// ─── Konfigurasi ──────────────────────────────────────────────────────────────

const APP_VERSION = '1.1'

// Koleksi rata (tenant-level) — tiada sub-collection
const FLAT_COLS = [
  { id: 'atlet',         label: 'Atlet' },
  { id: 'rekod',         label: 'Rekod' },
  { id: 'rekod_sejarah', label: 'Rekod Sejarah' },
  { id: 'tetapan',       label: 'Tetapan' },
]

// ─── Jana Sheet Excel ─────────────────────────────────────────────────────────

function setCellWidth(ws, cols) {
  ws['!cols'] = cols.map(w => ({ wch: w }))
}

async function janaSheetExcel(schoolId, addLog) {
  if (!schoolId) throw new Error('schoolId tidak dijumpai — sila log masuk semula.')
  // 1. Kejohanan aktif
  addLog('Mencari kejohanan aktif...')
  const kejSnap = await getDocs(query(collection(db, 'tenants', schoolId, 'kejohanan'), where('statusKejohanan', 'in', ['aktif', 'draf', 'persediaan'])))
  if (kejSnap.empty) throw new Error('Tiada kejohanan aktif.')
  const kej = { id: kejSnap.docs[0].id, ...kejSnap.docs[0].data() }
  const namaKej = kej.namaKejohanan || kej.id
  const tahunKej = kej.tahun || new Date().getFullYear()
  addLog(`  ✓ Kejohanan: ${namaKej}`)

  // 2. Fetch semua data
  addLog('Mengambil data Firestore...')
  const [atletSnap, acaraSnap, pendSnap, katSnap] = await Promise.all([
    getDocs(collection(db, 'tenants', schoolId, 'atlet')),
    getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kej.id, 'acara')),
    getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kej.id, 'pendaftaran')),
    getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kej.id, 'kategori')),
  ])

  // Derive sekolah from atlet
  const sklMap = {}
  atletSnap.docs.forEach(d => {
    const k = d.data().kodSekolah
    if (k) sklMap[k] = { id: k, namaSekolah: d.data().namaSekolah || k, kategori: d.data().kategoriSekolah || '' }
  })
  const sekolahAll = Object.values(sklMap)
    .filter(s => s.isAktif !== false)
    .sort((a, b) => (a.namaSekolah || a.id).localeCompare(b.namaSekolah || b.id))

  const acaraAll = acaraSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(a => !a.parentAcaraId && a.isAktif !== false)
    .sort((a, b) => (Number(a.noAcara) || 0) - (Number(b.noAcara) || 0))

  const pendAll = pendSnap.docs
    .map(d => ({ docId: d.id, ...d.data() }))
    .filter(p => p.kodSekolah !== 'ABC123')
    .sort((a, b) => (a.namaAtlet || '').localeCompare(b.namaAtlet || ''))

  const katMap = {}
  katSnap.docs.forEach(d => {
    const data = d.data()
    katMap[data.kod || d.id] = data.label || data.nama || data.kod || d.id
  })

  addLog(`  ✓ ${sekolahAll.length} sekolah | ${acaraAll.length} acara | ${pendAll.length} pendaftaran`)

  const wb = XLSX.utils.book_new()
  const tarikh = new Date().toLocaleDateString('ms-MY', { day:'2-digit', month:'2-digit', year:'numeric' })

  // ── TAB 1: SEKOLAH ──────────────────────────────────────────────────────────
  addLog('Jana Tab 1: SEKOLAH...')
  const sklHeader = ['Kod Sekolah', 'Nama Sekolah', 'Kategori', 'Daerah', 'Negeri', 'BIB Prefix', 'Email']
  const sklRows = sekolahAll.map(s => [
    s.id, s.namaSekolah || '', s.kategori || '', s.daerah || '',
    s.negeri || '', s.bibPrefix || '', s.email || '',
  ])
  const ws1 = XLSX.utils.aoa_to_sheet([sklHeader, ...sklRows])
  setCellWidth(ws1, [12, 35, 8, 15, 12, 10, 28])
  XLSX.utils.book_append_sheet(wb, ws1, 'SEKOLAH')

  // ── TAB 2: ATLET ────────────────────────────────────────────────────────────
  addLog('Jana Tab 2: ATLET...')
  const atlHeader = ['No KP', 'Nama Atlet', 'Jantina', 'Tarikh Lahir', 'Kategori Kod', 'Label Kategori', 'Kod Sekolah', 'Nama Sekolah', 'No BIB']
  const sekolahNamaMap = Object.fromEntries(sekolahAll.map(s => [s.id, s.namaSekolah || s.id]))
  const atlRows = pendAll.map(p => [
    p.docId,
    p.namaAtlet || '',
    p.jantina || '',
    p.tarikhLahir || '',
    p.kategoriKod || '',
    katMap[p.kategoriKod] || p.kategoriKod || '',
    p.kodSekolah || '',
    sekolahNamaMap[p.kodSekolah] || p.kodSekolah || '',
    p.noBib || '',
  ])
  const ws2 = XLSX.utils.aoa_to_sheet([atlHeader, ...atlRows])
  setCellWidth(ws2, [16, 35, 8, 12, 12, 12, 12, 30, 10])
  XLSX.utils.book_append_sheet(wb, ws2, 'ATLET')

  // ── TAB 3: ACARA ────────────────────────────────────────────────────────────
  addLog('Jana Tab 3: ACARA...')
  const acaraHeader = ['No Acara', 'Nama Acara', 'Kategori Kod', 'Label Kategori', 'Jantina', 'Jenis Acara', 'Hari', 'Masa', 'Had Atlet/Sekolah']
  const acaraRows = acaraAll.map(a => [
    a.noAcara || '', a.namaAcara || '',
    a.kategoriKod || '', katMap[a.kategoriKod] || a.kategoriKod || '',
    a.jantina || '', a.jenisAcara || '',
    a.hari || '', a.masa || '',
    a.hadAtletPerSekolah || 2,
  ])
  const ws3 = XLSX.utils.aoa_to_sheet([acaraHeader, ...acaraRows])
  setCellWidth(ws3, [10, 30, 12, 14, 8, 14, 6, 10, 14])
  XLSX.utils.book_append_sheet(wb, ws3, 'ACARA')

  // ── TAB 4: PENDAFTARAN ──────────────────────────────────────────────────────
  addLog('Jana Tab 4: PENDAFTARAN...')
  const pendHeader = ['No KP', 'Nama Atlet', 'No BIB', 'Kod Sekolah', 'Nama Sekolah', 'Kategori', 'Jantina', 'Bilangan Acara', 'Senarai Acara (noAcara)']
  // Bina map aceraId → noAcara
  const acaraNoMap = Object.fromEntries(acaraSnap.docs.map(d => [d.id, d.data().noAcara || d.id]))
  const pendRows = pendAll.map(p => {
    const acaraIds = p.acaraIds || []
    const noAcaraList = acaraIds.map(id => acaraNoMap[id] || id).join(', ')
    return [
      p.docId, p.namaAtlet || '', p.noBib || '',
      p.kodSekolah || '', sekolahNamaMap[p.kodSekolah] || '',
      katMap[p.kategoriKod] || p.kategoriKod || '',
      p.jantina || '', acaraIds.length, noAcaraList,
    ]
  })
  const ws4 = XLSX.utils.aoa_to_sheet([pendHeader, ...pendRows])
  setCellWidth(ws4, [16, 35, 10, 12, 30, 12, 8, 12, 40])
  XLSX.utils.book_append_sheet(wb, ws4, 'PENDAFTARAN')

  // ── TAB 5: KEPUTUSAN (No BIB → VLOOKUP nama & sekolah auto) ────────────────
  // PENDAFTARAN tab: C=No BIB, B=Nama Atlet, D=Kod Sekolah, E=Nama Sekolah
  addLog('Jana Tab 5: KEPUTUSAN (template + VLOOKUP)...')
  const kepHeader = [
    'No Acara', 'Nama Acara', 'Kategori', 'Jantina',
    '🥇 No BIB',  '🥇 Nama Atlet (auto)', '🥇 Kod Sekolah (auto)',
    '🥈 No BIB',  '🥈 Nama Atlet (auto)', '🥈 Kod Sekolah (auto)',
    '🥉 No BIB',  '🥉 Nama Atlet (auto)', '🥉 Kod Sekolah (auto)',
    'T4 No BIB',  'T4 Nama Atlet (auto)', 'T4 Kod Sekolah (auto)',
    'T5 No BIB',  'T5 Nama Atlet (auto)', 'T5 Kod Sekolah (auto)',
    'Catatan',
  ]
  // PENDAFTARAN tab kolum: A=No KP, B=Nama Atlet, C=No BIB, D=Kod Sekolah, E=Nama Sekolah
  // VLOOKUP(noBib, PENDAFTARAN!$C:$E, 2, 0) → Nama Atlet (offset 2 dari C)
  // VLOOKUP(noBib, PENDAFTARAN!$C:$E, 3, 0) → Kod Sekolah (offset 3 dari C)
  const kepRows = acaraAll.map((a, i) => {
    const r = i + 2
    const namaAcara = a.namaAcara || ''
    const kat = katMap[a.kategoriKod] || a.kategoriKod || ''
    const jantina = a.jantina === 'L' ? 'Lelaki' : a.jantina === 'P' ? 'Perempuan' : ''
    // INDEX/MATCH — cari NoBib dalam PENDAFTARAN!C, ambil B=Nama atau D=KodSekolah
    const vlNama = bibCol => ({ f: `IFERROR(INDEX(PENDAFTARAN!$B:$B,MATCH(${bibCol}${r},PENDAFTARAN!$C:$C,0)),"")`, t: 's', v: '' })
    const vlSkl  = bibCol => ({ f: `IFERROR(INDEX(PENDAFTARAN!$D:$D,MATCH(${bibCol}${r},PENDAFTARAN!$C:$C,0)),"")`, t: 's', v: '' })
    return [
      a.noAcara || '', namaAcara, kat, jantina,
      '', vlNama('E'), vlSkl('E'),   // 🥇 — admin isi E, F+G auto
      '', vlNama('H'), vlSkl('H'),   // 🥈 — admin isi H, I+J auto
      '', vlNama('K'), vlSkl('K'),   // 🥉 — admin isi K, L+M auto
      '', vlNama('N'), vlSkl('N'),   // T4 — admin isi N, O+P auto
      '', vlNama('Q'), vlSkl('Q'),   // T5 — admin isi Q, R+S auto
      '',                            // Catatan
    ]
  })
  const ws5 = XLSX.utils.aoa_to_sheet([kepHeader, ...kepRows])
  setCellWidth(ws5, [10, 28, 12, 10, 10,28,14, 10,28,14, 10,28,14, 10,28,14, 10,28,14, 18])
  ws5['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' }
  XLSX.utils.book_append_sheet(wb, ws5, 'KEPUTUSAN')

  // ── TAB 6: MEDAL TALLY (formula auto) ──────────────────────────────────────
  addLog('Jana Tab 6: MEDAL TALLY (formula)...')
  const medalHeader = [
    'Kedudukan', 'Kod Sekolah', 'Nama Sekolah', 'Kategori Sekolah',
    '🥇 Emas', '🥈 Perak', '🥉 Gangsa', 'Jumlah Medal',
  ]
  // KEPUTUSAN: G=🥇 Kod Sekolah, J=🥈 Kod Sekolah, M=🥉 Kod Sekolah (auto VLOOKUP)
  const medalRows = sekolahAll.map((s, i) => {
    const r = i + 2
    const kodSkl = s.id
    return [
      { f: `RANK(E${r},$E$2:$E${sekolahAll.length + 1},0)`, t: 'n', v: 0 },
      kodSkl,
      s.namaSekolah || kodSkl,
      s.kategori || '',
      { f: `COUNTIF(KEPUTUSAN!$G:$G,B${r})`, t: 'n', v: 0 },   // Emas: kolum G
      { f: `COUNTIF(KEPUTUSAN!$J:$J,B${r})`, t: 'n', v: 0 },   // Perak: kolum J
      { f: `COUNTIF(KEPUTUSAN!$M:$M,B${r})`, t: 'n', v: 0 },   // Gangsa: kolum M
      { f: `SUM(E${r}:G${r})`, t: 'n', v: 0 },
    ]
  })
  const ws6 = XLSX.utils.aoa_to_sheet([medalHeader, ...medalRows])
  setCellWidth(ws6, [10, 12, 32, 14, 8, 8, 8, 12])
  ws6['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' }
  XLSX.utils.book_append_sheet(wb, ws6, 'MEDAL_TALLY')

  // ── TAB 7: OLAHRAGAWAN (formula auto guna nama atlet) ──────────────────────
  addLog('Jana Tab 7: OLAHRAGAWAN (formula)...')
  const olaHeader = [
    'No KP', 'Nama Atlet', 'Kod Sekolah', 'Nama Sekolah',
    'Kategori', 'Jantina',
    '🥇 Emas', '🥈 Perak', '🥉 Gangsa', 'T4',
    'Mata', 'Kedudukan',
  ]
  const olaRows = pendAll.map((p, i) => {
    const r = i + 2
    return [
      p.docId,
      p.namaAtlet || '',
      p.kodSekolah || '',
      sekolahNamaMap[p.kodSekolah] || '',
      katMap[p.kategoriKod] || p.kategoriKod || '',
      p.jantina || '',
      // KEPUTUSAN: F=🥇 Nama Atlet, I=🥈, L=🥉, O=T4 (auto VLOOKUP)
      { f: `COUNTIF(KEPUTUSAN!$F:$F,B${r})`, t: 'n', v: 0 },   // Emas
      { f: `COUNTIF(KEPUTUSAN!$I:$I,B${r})`, t: 'n', v: 0 },   // Perak
      { f: `COUNTIF(KEPUTUSAN!$L:$L,B${r})`, t: 'n', v: 0 },   // Gangsa
      { f: `COUNTIF(KEPUTUSAN!$O:$O,B${r})`, t: 'n', v: 0 },   // T4
      // Mata = E*5 + P*3 + G*2 + T4*1
      { f: `(G${r}*5)+(H${r}*3)+(I${r}*2)+(J${r}*1)`, t: 'n', v: 0 },
      // Kedudukan ikut mata
      { f: `RANK(K${r},$K$2:$K${pendAll.length + 1},0)`, t: 'n', v: 0 },
    ]
  })
  const ws7 = XLSX.utils.aoa_to_sheet([olaHeader, ...olaRows])
  setCellWidth(ws7, [16, 35, 12, 30, 12, 8, 6, 6, 6, 6, 8, 10])
  ws7['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' }
  XLSX.utils.book_append_sheet(wb, ws7, 'OLAHRAGAWAN')

  // ── TAB 8: ATLET TERBAIK BY KATEGORI ──────────────────────────────────────
  addLog('Jana Tab 8: ATLET TERBAIK BY KATEGORI (formula)...')
  // Kumpul kategori unik (L dan P berasingan)
  const katUnik = [...new Set(pendAll.map(p => p.kategoriKod).filter(Boolean))].sort()
  const terbaikHeader = [
    'Kategori', 'Label',
    'Nama Atlet Terbaik', 'Sekolah', 'Mata',
  ]
  const terbaikRows = katUnik.map((kat, i) => {
    const r = i + 2
    const label = katMap[kat] || kat
    // Cari atlet dengan mata tertinggi dalam kategori ini dari Tab OLAHRAGAWAN
    // OLAHRAGAWAN: E=Kategori, K=Mata, B=Nama
    return [
      kat, label,
      { f: `IFERROR(INDEX(OLAHRAGAWAN!$B:$B,MATCH(MAXIFS(OLAHRAGAWAN!$K:$K,OLAHRAGAWAN!$E:$E,A${r}),OLAHRAGAWAN!$K:$K,0)),"—")`, t: 's', v: '' },
      { f: `IFERROR(INDEX(OLAHRAGAWAN!$D:$D,MATCH(MAXIFS(OLAHRAGAWAN!$K:$K,OLAHRAGAWAN!$E:$E,A${r}),OLAHRAGAWAN!$K:$K,0)),"—")`, t: 's', v: '' },
      { f: `IFERROR(MAXIFS(OLAHRAGAWAN!$K:$K,OLAHRAGAWAN!$E:$E,A${r}),0)`, t: 'n', v: 0 },
    ]
  })
  const ws8 = XLSX.utils.aoa_to_sheet([terbaikHeader, ...terbaikRows])
  setCellWidth(ws8, [12, 14, 35, 30, 8])
  XLSX.utils.book_append_sheet(wb, ws8, 'ATLET_TERBAIK')

  // ── Download ─────────────────────────────────────────────────────────────────
  addLog('Menjana fail Excel...')
  const namaFail = `KOAM_Sheet_${tahunKej}_${tarikh.replace(/\//g, '')}.xlsx`
  XLSX.writeFile(wb, namaFail)
  addLog(`✅ Selesai! Fail: ${namaFail}`)
  addLog(`   8 tab: SEKOLAH | ATLET | ACARA | PENDAFTARAN | KEPUTUSAN | MEDAL_TALLY | OLAHRAGAWAN | ATLET_TERBAIK`)
  addLog(`   Upload ke Google Sheets untuk formula berfungsi sepenuhnya.`)
}

// ─── Export helpers ───────────────────────────────────────────────────────────

async function ambilKoleksi(schoolId, ...pathSegments) {
  const snap = await getDocs(collection(db, 'tenants', schoolId, ...pathSegments))
  return snap.docs.map(d => ({ _id: d.id, ...d.data() }))
}

async function ambilKejohananLengkap(schoolId, addLog) {
  addLog('Mengambil senarai kejohanan...')
  const kejSnap = await getDocs(collection(db, 'tenants', schoolId, 'kejohanan'))
  const hasil = []

  for (const kejDoc of kejSnap.docs) {
    const kejData = { _id: kejDoc.id, ...kejDoc.data() }
    addLog(`  Kejohanan ${kejDoc.id}...`)

    // Acara
    const acaraSnap = await getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kejDoc.id, 'acara'))
    const acaraList = acaraSnap.docs.map(d => ({ _id: d.id, ...d.data() }))

    // Heat (flat)
    const heatSnap = await getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kejDoc.id, 'heat'))
    kejData._heat = heatSnap.docs.map(d => ({ _id: d.id, ...d.data() }))

    // Pendaftaran
    const pendSnap = await getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kejDoc.id, 'pendaftaran'))
    kejData._pendaftaran = pendSnap.docs.map(d => ({ _id: d.id, ...d.data() }))

    // Pengesahan
    const pengesSnap = await getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kejDoc.id, 'pengesahan'))
    kejData._pengesahan = pengesSnap.docs.map(d => ({ _id: d.id, ...d.data() }))

    // Kategori per-kejohanan
    const katSnap = await getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kejDoc.id, 'kategori'))
    kejData._kategori = katSnap.docs.map(d => ({ _id: d.id, ...d.data() }))

    // Jadual per-kejohanan
    const jadualSnap = await getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kejDoc.id, 'jadual'))
    kejData._jadual = jadualSnap.docs.map(d => ({ _id: d.id, ...d.data() }))

    // Medal tally per-kejohanan
    const medalSnap = await getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kejDoc.id, 'medal_tally'))
    kejData._medal_tally = medalSnap.docs.map(d => ({ _id: d.id, ...d.data() }))

    // Mata olahragawan per-kejohanan
    const mataSnap = await getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kejDoc.id, 'mata_olahragawan'))
    kejData._mata_olahragawan = mataSnap.docs.map(d => ({ _id: d.id, ...d.data() }))

    kejData._acara = acaraList
    hasil.push(kejData)
  }

  return hasil
}

// ─── Import helpers ───────────────────────────────────────────────────────────

// Tulis dalam chunks (max 400 per batch untuk selamat)
async function batchTulis(items, addLog, label, merge = false) {
  if (items.length === 0) return
  const CHUNK = 400
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK)
    const batch = writeBatch(db)
    for (const { ref, data } of chunk) {
      batch.set(ref, data, merge ? { merge: true } : {})
    }
    await batch.commit()
    if (items.length > CHUNK) {
      addLog(`    ${label}: ${Math.min(i + CHUNK, items.length)}/${items.length}`)
    }
  }
}

// ─── Komponen Utama ───────────────────────────────────────────────────────────

export default function Backup() {
  const { userData, userRole } = useAuth()
  const navigate = useNavigate()
  const isSuperadmin = userRole === 'superadmin'
  const viewSchoolId = isSuperadmin
    ? (() => { try { return JSON.parse(sessionStorage.getItem('gp_view_school') || '{}').schoolId || '' } catch { return '' } })()
    : null
  const schoolId = viewSchoolId || userData?.schoolId || ''
  const [tab, setTab] = useState('muat_turun')

  // Export state
  const [eksportLoading, setEksportLoading] = useState(false)
  const [eksportLog,     setEksportLog]     = useState([])

  // Jana Sheet state
  const [sheetLoading, setSheetLoading] = useState(false)
  const [sheetLog,     setSheetLog]     = useState([])

  // Import state
  const [backupData,   setBackupData]   = useState(null)
  const [failNama,     setFailNama]     = useState('')
  const [failError,    setFailError]    = useState('')
  const [modRestore,   setModRestore]   = useState('gabung')
  const [confirmText,  setConfirmText]  = useState('')
  const [importLoading, setImportLoading] = useState(false)
  const [importLog,    setImportLog]    = useState([])
  const [importDone,   setImportDone]   = useState(false)
  const fileRef = useRef()

  // ── Muat Turun ──────────────────────────────────────────────────────────────

  async function handleEksport() {
    setEksportLoading(true)
    const log = []
    const addLog = msg => { log.push(msg); setEksportLog([...log]) }

    try {
      const data = {}

      if (!schoolId) throw new Error('schoolId tidak dijumpai — sila log masuk semula.')

      // Flat collections
      for (const col of FLAT_COLS) {
        addLog(`Mengambil ${col.label}...`)
        data[col.id] = await ambilKoleksi(schoolId, col.id)
        addLog(`  ✓ ${col.label}: ${data[col.id].length} rekod`)
      }

      // Kejohanan (deep)
      data.kejohanan = await ambilKejohananLengkap(schoolId, addLog)

      // Stats untuk preview semasa import
      let totalAcara = 0, totalHeat = 0, totalPend = 0
      data.kejohanan.forEach(k => {
        totalAcara += (k._acara || []).length
        totalHeat  += (k._acara || []).reduce((s, a) => s + (a._heat || []).length, 0)
        totalPend  += (k._pendaftaran || []).length
      })

      const meta = {
        appName: 'KOAM', appVersion: APP_VERSION,
        backupDate: new Date().toISOString(),
        stats: {
          kejohanan:   data.kejohanan.length,
          acara:       totalAcara,
          heat:        totalHeat,
          pendaftaran: totalPend,
          sekolah:     (data.sekolah  || []).length,
          atlet:       (data.atlet    || []).length,
          rekod:       (data.rekod    || []).length,
        }
      }

      // Download
      const json = JSON.stringify({ meta, data }, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const tdk  = new Date()
      const nama = `koam-backup-${tdk.getFullYear()}${String(tdk.getMonth()+1).padStart(2,'0')}${String(tdk.getDate()).padStart(2,'0')}.koam`
      const a    = document.createElement('a')
      a.href = url; a.download = nama; a.click()
      URL.revokeObjectURL(url)

      addLog('─────────────────────────────────────')
      addLog(`✅ Selesai! Fail: ${nama}`)
      addLog(`   Total: ${meta.stats.kejohanan} kej • ${meta.stats.acara} acara • ${meta.stats.heat} heat • ${meta.stats.atlet} atlet`)
    } catch (err) {
      addLog(`❌ Ralat: ${err.message}`)
    } finally {
      setEksportLoading(false)
    }
  }

  // ── Jana Sheet ──────────────────────────────────────────────────────────────

  async function handleJanaSheet() {
    setSheetLoading(true)
    const log = []
    const addLog = msg => { log.push(msg); setSheetLog([...log]) }
    try {
      await janaSheetExcel(schoolId, addLog)
    } catch (e) {
      addLog(`❌ Ralat: ${e.message}`)
    } finally {
      setSheetLoading(false)
    }
  }

  // ── Pilih fail ──────────────────────────────────────────────────────────────

  function handleFailPilih(e) {
    const file = e.target.files[0]
    if (!file) return
    setFailNama(file.name)
    setBackupData(null)
    setFailError('')
    setImportLog([])
    setImportDone(false)
    setConfirmText('')

    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target.result)
        if (!parsed.meta || !parsed.data) {
          setFailError('Fail tidak sah — bukan format backup KOAM.')
          return
        }
        setBackupData(parsed)
      } catch {
        setFailError('Fail rosak — tidak dapat baca JSON.')
      }
    }
    reader.readAsText(file)
  }

  // ── Pulihkan ────────────────────────────────────────────────────────────────

  async function handleRestore() {
    if (!backupData) return
    if (modRestore === 'tulis_semula' && confirmText !== 'TULIS SEMULA') return

    setImportLoading(true)
    setImportDone(false)
    const log = []
    const addLog = msg => { log.push(msg); setImportLog([...log]) }
    const merge = modRestore === 'gabung'

    try {
      if (!schoolId) throw new Error('schoolId tidak dijumpai — sila log masuk semula.')
      const { data } = backupData

      // Flat collections (tenant-level)
      for (const col of FLAT_COLS) {
        const docs = data[col.id] || []
        if (!docs.length) { addLog(`Skip ${col.label} (kosong)`); continue }
        addLog(`Menulis ${col.label}: ${docs.length} rekod...`)
        await batchTulis(
          docs.map(({ _id, ...rest }) => ({ ref: doc(db, 'tenants', schoolId, col.id, _id), data: rest })),
          addLog, col.label, merge
        )
        addLog(`  ✓ ${col.label} selesai`)
      }

      // Kejohanan + sub-collections
      const kejList = data.kejohanan || []
      addLog(`\nMenulis ${kejList.length} kejohanan (lengkap)...`)

      for (const kej of kejList) {
        const {
          _id: kejId, _acara = [], _pendaftaran = [], _pengesahan = [],
          _heat = [], _kategori = [], _jadual = [], _medal_tally = [], _mata_olahragawan = [],
          ...kejData
        } = kej
        addLog(`  Kejohanan ${kejId}...`)

        // Dokumen kejohanan
        await setDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId), kejData, merge ? { merge: true } : {})

        // Acara
        if (_acara.length) {
          await batchTulis(
            _acara.map(({ _id, ...r }) => ({ ref: doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'acara', _id), data: r })),
            addLog, 'Acara', merge
          )
          addLog(`    ✓ ${_acara.length} acara`)
        }

        // Heat (flat)
        if (_heat.length) {
          await batchTulis(
            _heat.map(({ _id, ...r }) => ({ ref: doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat', _id), data: r })),
            addLog, 'Heat', merge
          )
          addLog(`    ✓ ${_heat.length} heat`)
        }

        // Pendaftaran
        if (_pendaftaran.length) {
          await batchTulis(
            _pendaftaran.map(({ _id, ...r }) => ({ ref: doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'pendaftaran', _id), data: r })),
            addLog, 'Pendaftaran', merge
          )
          addLog(`    ✓ ${_pendaftaran.length} pendaftaran`)
        }

        // Pengesahan
        if (_pengesahan.length) {
          await batchTulis(
            _pengesahan.map(({ _id, ...r }) => ({ ref: doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'pengesahan', _id), data: r })),
            addLog, 'Pengesahan', merge
          )
        }

        // Kategori
        if (_kategori.length) {
          await batchTulis(
            _kategori.map(({ _id, ...r }) => ({ ref: doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'kategori', _id), data: r })),
            addLog, 'Kategori', merge
          )
        }

        // Jadual
        if (_jadual.length) {
          await batchTulis(
            _jadual.map(({ _id, ...r }) => ({ ref: doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'jadual', _id), data: r })),
            addLog, 'Jadual', merge
          )
        }

        // Medal Tally
        if (_medal_tally.length) {
          await batchTulis(
            _medal_tally.map(({ _id, ...r }) => ({ ref: doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'medal_tally', _id), data: r })),
            addLog, 'Medal Tally', merge
          )
        }

        // Mata Olahragawan
        if (_mata_olahragawan.length) {
          await batchTulis(
            _mata_olahragawan.map(({ _id, ...r }) => ({ ref: doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'mata_olahragawan', _id), data: r })),
            addLog, 'Mata Olahragawan', merge
          )
        }
      }

      addLog('─────────────────────────────────────')
      addLog('✅ Pulihan selesai!')
      setImportDone(true)
    } catch (err) {
      addLog(`❌ Ralat: ${err.message}`)
    } finally {
      setImportLoading(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const stats     = backupData?.meta?.stats
  const bdateStr  = backupData?.meta?.backupDate
    ? new Date(backupData.meta.backupDate).toLocaleString('ms-MY')
    : null
  const canRestore = backupData && !importLoading && !importDone &&
    (modRestore !== 'tulis_semula' || confirmText === 'TULIS SEMULA')

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">

      {/* Nav Header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate('/admin')} className="text-xs text-gray-500 hover:text-[#003399]">← Kembali</button>
        <div>
          <h1 className="text-lg font-bold text-gray-800">Backup Sistem</h1>
          <p className="text-sm text-gray-400 mt-0.5">Muat turun atau pulihkan data sistem</p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6">
        {[
          { id: 'muat_turun',  label: 'Muat Turun Backup' },
          { id: 'pulihkan',    label: 'Pulihkan Backup'   },
          { id: 'jana_sheet',  label: 'Jana Sheet Excel'  },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
              tab === t.id
                ? 'bg-white text-[#003399] shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >{t.label}</button>
        ))}
      </div>

      {/* ═══════════════ TAB: Muat Turun ═══════════════ */}
      {tab === 'muat_turun' && (
        <div className="space-y-4">

          {/* Info */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <p className="text-sm font-semibold text-blue-700 mb-2">Kandungan backup</p>
            <ul className="space-y-1">
              {[
                'Semua kejohanan + acara + heat + keputusan',
                'Pendaftaran & pengesahan atlet',
                'Sekolah, atlet, rekod daerah/negeri/kebangsaan',
                'Tetapan sistem, kategori, jadual acara',
                'Medal tally, olahragawan, anugerah',
              ].map((t, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-blue-600">
                  <span className="mt-0.5 text-blue-400">✓</span>{t}
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-blue-400 mt-3">Format: .koam (JSON) · Saiz anggaran: 2–10 MB</p>
          </div>

          <button
            onClick={handleEksport}
            disabled={eksportLoading}
            className="w-full py-3 rounded-xl font-bold text-sm text-white bg-[#003399] hover:bg-[#002288] active:bg-[#001177] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {eksportLoading
              ? <><Spinner /> Sedang mengambil data...</>
              : 'Muat Turun Backup Sekarang'
            }
          </button>

          {/* Log output */}
          {eksportLog.length > 0 && (
            <div className="bg-gray-900 rounded-xl p-4 font-mono text-xs text-gray-300 max-h-72 overflow-y-auto space-y-0.5">
              {eksportLog.map((l, i) => (
                <p key={i} className={
                  l.startsWith('✅') ? 'text-green-400 font-bold' :
                  l.startsWith('❌') ? 'text-red-400' :
                  l.startsWith('  ✓') ? 'text-green-300' : ''
                }>{l}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ TAB: Pulihkan ═══════════════ */}
      {tab === 'pulihkan' && (
        <div className="space-y-5">

          {/* Amaran */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
            <p className="font-semibold">Amaran penting</p>
            <p className="text-xs mt-1">
              Mod <strong>Gabung</strong> selamat — tambah data baharu, tidak padam yang sedia ada.
              Mod <strong>Tulis Semula</strong> akan overwrite dokumen sedia ada. Tidak boleh undo.
            </p>
          </div>

          {/* Langkah 1: Pilih fail */}
          <div>
            <LangkahHdr num="1" text="Pilih fail backup (.koam)" />
            <div
              onClick={() => fileRef.current.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                backupData
                  ? 'border-green-300 bg-green-50'
                  : failError
                  ? 'border-red-300 bg-red-50'
                  : 'border-gray-200 hover:border-[#003399] hover:bg-blue-50/30'
              }`}
            >
              {!failNama && <p className="text-sm text-gray-400">Klik untuk pilih fail .koam</p>}
              {failNama && !failError && !backupData && <p className="text-sm text-gray-500">Membaca fail...</p>}
              {failNama && backupData && (
                <p className="text-sm font-semibold text-green-700">✓ {failNama}</p>
              )}
              {failError && <p className="text-sm text-red-600">{failError}</p>}
              <input ref={fileRef} type="file" accept=".koam,.json" onChange={handleFailPilih} className="hidden" />
            </div>
          </div>

          {/* Preview maklumat backup */}
          {backupData && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Maklumat Fail Backup</p>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs mb-3">
                  <InfoRow label="Tarikh backup" val={bdateStr} />
                  <InfoRow label="Versi app" val={backupData.meta.appVersion} />
                </div>
                {stats && (
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: 'Kejohanan', val: stats.kejohanan, color: 'text-[#003399]' },
                      { label: 'Acara',     val: stats.acara,     color: 'text-[#003399]' },
                      { label: 'Heat',      val: stats.heat,      color: 'text-[#003399]' },
                      { label: 'Pendaftar', val: stats.pendaftaran, color: 'text-[#003399]' },
                      { label: 'Sekolah',   val: stats.sekolah,   color: 'text-gray-700' },
                      { label: 'Atlet',     val: stats.atlet,     color: 'text-gray-700' },
                      { label: 'Rekod',     val: stats.rekod,     color: 'text-gray-700' },
                    ].map(s => (
                      <div key={s.label} className="bg-gray-50 rounded-lg p-2 text-center">
                        <p className={`text-sm font-black ${s.color}`}>{s.val ?? '—'}</p>
                        <p className="text-[9px] text-gray-400 mt-0.5">{s.label}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Langkah 2: Mod pulihan */}
          {backupData && (
            <div>
              <LangkahHdr num="2" text="Pilih mod pulihan" />
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'gabung',      label: 'Gabung',      desc: 'Tambah yang tiada, skip yang ada', safe: true  },
                  { id: 'tulis_semula', label: 'Tulis Semula', desc: 'Overwrite dokumen sedia ada',     safe: false },
                ].map(m => (
                  <button key={m.id}
                    onClick={() => { setModRestore(m.id); setConfirmText('') }}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      modRestore === m.id
                        ? m.safe ? 'border-[#003399] bg-blue-50' : 'border-red-400 bg-red-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <p className={`text-xs font-bold ${modRestore === m.id && !m.safe ? 'text-red-600' : 'text-gray-700'}`}>
                      {m.label}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{m.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Confirm untuk Tulis Semula */}
          {backupData && modRestore === 'tulis_semula' && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-xs text-red-700 mb-2">
                Taip <span className="font-mono font-bold bg-red-100 px-1.5 py-0.5 rounded">TULIS SEMULA</span> untuk sahkan:
              </p>
              <input
                type="text"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="TULIS SEMULA"
                className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-300 bg-white"
              />
            </div>
          )}

          {/* Butang Pulihkan */}
          {backupData && !importDone && (
            <button
              onClick={handleRestore}
              disabled={!canRestore}
              className={`w-full py-3 rounded-xl font-bold text-sm text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                modRestore === 'tulis_semula'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-[#003399] hover:bg-[#002288]'
              }`}
            >
              {importLoading
                ? <><Spinner /> Sedang memulihkan...</>
                : `Pulihkan — Mod ${modRestore === 'gabung' ? 'Gabung' : 'Tulis Semula'}`
              }
            </button>
          )}

          {importDone && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <p className="text-green-700 font-bold">✅ Pulihan selesai!</p>
              <p className="text-xs text-green-600 mt-1">Data telah dipulihkan ke Firestore.</p>
              <button
                onClick={() => { setBackupData(null); setFailNama(''); setImportLog([]); setImportDone(false); setConfirmText(''); if(fileRef.current) fileRef.current.value = '' }}
                className="mt-3 text-xs text-green-600 underline"
              >
                Pulihkan fail lain
              </button>
            </div>
          )}

          {/* Log output */}
          {importLog.length > 0 && (
            <div className="bg-gray-900 rounded-xl p-4 font-mono text-xs text-gray-300 max-h-72 overflow-y-auto space-y-0.5">
              {importLog.map((l, i) => (
                <p key={i} className={
                  l.startsWith('✅') ? 'text-green-400 font-bold' :
                  l.startsWith('❌') ? 'text-red-400' :
                  l.startsWith('  ✓') || l.startsWith('    ✓') ? 'text-green-300' :
                  l.startsWith('Skip') ? 'text-gray-500' : ''
                }>{l}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ TAB: Jana Sheet ═══════════════ */}
      {tab === 'jana_sheet' && (
        <div className="space-y-4">

          {/* Info */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <p className="text-sm font-semibold text-blue-700 mb-2">8 Tab dalam fail Excel</p>
            <div className="grid grid-cols-2 gap-1">
              {[
                { tab: '1', label: 'SEKOLAH', desc: 'Senarai semua sekolah aktif' },
                { tab: '2', label: 'ATLET', desc: 'Semua atlet + kategori' },
                { tab: '3', label: 'ACARA', desc: 'Senarai 152 acara' },
                { tab: '4', label: 'PENDAFTARAN', desc: 'Atlet × acara yang didaftar' },
                { tab: '5', label: 'KEPUTUSAN', desc: 'Template — admin isi manual' },
                { tab: '6', label: 'MEDAL TALLY', desc: 'Formula auto dari KEPUTUSAN' },
                { tab: '7', label: 'OLAHRAGAWAN', desc: 'Mata auto (E=5 P=3 G=2 T4=1)' },
                { tab: '8', label: 'ATLET TERBAIK', desc: 'Terbaik by kategori — formula' },
              ].map(t => (
                <div key={t.tab} className="flex items-start gap-2 text-xs">
                  <span className="w-5 h-5 rounded bg-[#003399] text-white text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">{t.tab}</span>
                  <div>
                    <span className="font-bold text-blue-800">{t.label}</span>
                    <span className="text-blue-500 ml-1">— {t.desc}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-blue-100">
              <p className="text-[10px] text-blue-500">⚠️ Upload ke <strong>Google Sheets</strong> (bukan Excel desktop) untuk formula MEDAL TALLY, OLAHRAGAWAN dan ATLET TERBAIK berfungsi sepenuhnya.</p>
              <p className="text-[10px] text-blue-500 mt-1">📝 Isi tab <strong>KEPUTUSAN</strong> semasa kejohanan — tab lain auto-update.</p>
            </div>
          </div>

          <button
            onClick={handleJanaSheet}
            disabled={sheetLoading}
            className="w-full py-3 rounded-xl font-bold text-sm text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {sheetLoading
              ? <><Spinner /> Sedang menjana sheet...</>
              : '📊 Jana & Muat Turun Sheet Excel'
            }
          </button>

          {/* Log output */}
          {sheetLog.length > 0 && (
            <div className="bg-gray-900 rounded-xl p-4 font-mono text-xs text-gray-300 max-h-72 overflow-y-auto space-y-0.5">
              {sheetLog.map((l, i) => (
                <p key={i} className={
                  l.startsWith('✅') ? 'text-green-400 font-bold' :
                  l.startsWith('❌') ? 'text-red-400' :
                  l.startsWith('  ✓') ? 'text-green-300' : ''
                }>{l}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────

function LangkahHdr({ num, text }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="w-5 h-5 rounded-full bg-[#003399] text-white text-[10px] font-black flex items-center justify-center shrink-0">
        {num}
      </span>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{text}</p>
    </div>
  )
}

function InfoRow({ label, val }) {
  return (
    <div>
      <p className="text-gray-400">{label}</p>
      <p className="font-semibold text-gray-700">{val || '—'}</p>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
