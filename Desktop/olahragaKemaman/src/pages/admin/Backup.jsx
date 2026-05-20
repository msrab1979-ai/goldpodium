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
  collection, getDocs, doc, writeBatch, setDoc,
} from 'firebase/firestore'
import { db } from '../../firebase/config'

// ─── Konfigurasi ──────────────────────────────────────────────────────────────

const APP_VERSION = '1.1'

// Koleksi rata — tiada sub-collection
const FLAT_COLS = [
  { id: 'sekolah',             label: 'Sekolah' },
  { id: 'atlet',               label: 'Atlet' },
  { id: 'rekod',               label: 'Rekod' },
  { id: 'rekod_sejarah',       label: 'Rekod Sejarah' },
  { id: 'rekod_tuntutan',      label: 'Rekod Tuntutan' },
  { id: 'medal_tally',         label: 'Medal Tally' },
  { id: 'medal_tally_kat',     label: 'Medal Tally Kat' },
  { id: 'mata_olahragawan',    label: 'Mata Olahragawan' },
  { id: 'pilihan_olahragawan', label: 'Pilihan Olahragawan' },
  { id: 'tetapan',             label: 'Tetapan' },
  { id: 'kategori',            label: 'Kategori' },
  { id: 'jadual_acara',        label: 'Jadual Acara' },
  { id: 'wa_config',           label: 'WA Config' },
  { id: 'anugerah_custom',     label: 'Anugerah Custom' },
  { id: 'bantahan',            label: 'Bantahan' },
]

// ─── Export helpers ───────────────────────────────────────────────────────────

async function ambilKoleksi(colPath) {
  const snap = await getDocs(collection(db, colPath))
  return snap.docs.map(d => ({ _id: d.id, ...d.data() }))
}

async function ambilKejohananLengkap(addLog) {
  addLog('Mengambil senarai kejohanan...')
  const kejSnap = await getDocs(collection(db, 'kejohanan'))
  const hasil = []

  for (const kejDoc of kejSnap.docs) {
    const kejData = { _id: kejDoc.id, ...kejDoc.data() }
    addLog(`  Kejohanan ${kejDoc.id}...`)

    // Acara
    const acaraSnap = await getDocs(collection(db, 'kejohanan', kejDoc.id, 'acara'))
    const acaraList = []

    for (const acaraDoc of acaraSnap.docs) {
      const acaraData = { _id: acaraDoc.id, ...acaraDoc.data() }

      // Heat
      const heatSnap = await getDocs(
        collection(db, 'kejohanan', kejDoc.id, 'acara', acaraDoc.id, 'heat')
      )
      const heatList = []

      for (const heatDoc of heatSnap.docs) {
        const heatData = { _id: heatDoc.id, ...heatDoc.data() }

        // Keputusan (dalam heat)
        const kpSnap = await getDocs(
          collection(db, 'kejohanan', kejDoc.id, 'acara', acaraDoc.id, 'heat', heatDoc.id, 'keputusan')
        )
        heatData._keputusan = kpSnap.docs.map(d => ({ _id: d.id, ...d.data() }))
        heatList.push(heatData)
      }

      acaraData._heat = heatList
      acaraList.push(acaraData)
    }

    // Pendaftaran
    const pendSnap = await getDocs(collection(db, 'kejohanan', kejDoc.id, 'pendaftaran'))
    kejData._pendaftaran = pendSnap.docs.map(d => ({ _id: d.id, ...d.data() }))

    // Pengesahan
    const pengesSnap = await getDocs(collection(db, 'kejohanan', kejDoc.id, 'pengesahan'))
    kejData._pengesahan = pengesSnap.docs.map(d => ({ _id: d.id, ...d.data() }))

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
  const [tab, setTab] = useState('muat_turun')

  // Export state
  const [eksportLoading, setEksportLoading] = useState(false)
  const [eksportLog,     setEksportLog]     = useState([])

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

      // Flat collections
      for (const col of FLAT_COLS) {
        addLog(`Mengambil ${col.label}...`)
        data[col.id] = await ambilKoleksi(col.id)
        addLog(`  ✓ ${col.label}: ${data[col.id].length} rekod`)
      }

      // Kejohanan (deep)
      data.kejohanan = await ambilKejohananLengkap(addLog)

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
      const { data } = backupData

      // Flat collections
      for (const col of FLAT_COLS) {
        const docs = data[col.id] || []
        if (!docs.length) { addLog(`Skip ${col.label} (kosong)`); continue }
        addLog(`Menulis ${col.label}: ${docs.length} rekod...`)
        await batchTulis(
          docs.map(({ _id, ...rest }) => ({ ref: doc(db, col.id, _id), data: rest })),
          addLog, col.label, merge
        )
        addLog(`  ✓ ${col.label} selesai`)
      }

      // Kejohanan + sub-collections
      const kejList = data.kejohanan || []
      addLog(`\nMenulis ${kejList.length} kejohanan (lengkap)...`)

      for (const kej of kejList) {
        const { _id: kejId, _acara = [], _pendaftaran = [], _pengesahan = [], ...kejData } = kej
        addLog(`  Kejohanan ${kejId}...`)

        // Dokumen kejohanan
        await setDoc(doc(db, 'kejohanan', kejId), kejData, merge ? { merge: true } : {})

        // Acara + Heat + Keputusan
        const acaraItems = [], heatItems = [], kpItems = []
        for (const acara of _acara) {
          const { _id: aId, _heat = [], ...aData } = acara
          acaraItems.push({ ref: doc(db, 'kejohanan', kejId, 'acara', aId), data: aData })
          for (const heat of _heat) {
            const { _id: hId, _keputusan = [], ...hData } = heat
            heatItems.push({ ref: doc(db, 'kejohanan', kejId, 'acara', aId, 'heat', hId), data: hData })
            for (const kp of _keputusan) {
              const { _id: kpId, ...kpData } = kp
              kpItems.push({ ref: doc(db, 'kejohanan', kejId, 'acara', aId, 'heat', hId, 'keputusan', kpId), data: kpData })
            }
          }
        }

        if (acaraItems.length) {
          await batchTulis(acaraItems, addLog, `Acara`, merge)
          addLog(`    ✓ ${acaraItems.length} acara`)
        }
        if (heatItems.length) {
          await batchTulis(heatItems, addLog, `Heat`, merge)
          addLog(`    ✓ ${heatItems.length} heat`)
        }
        if (kpItems.length) {
          await batchTulis(kpItems, addLog, `Keputusan`, merge)
          addLog(`    ✓ ${kpItems.length} keputusan`)
        }

        // Pendaftaran
        if (_pendaftaran.length) {
          await batchTulis(
            _pendaftaran.map(({ _id, ...r }) => ({ ref: doc(db, 'kejohanan', kejId, 'pendaftaran', _id), data: r })),
            addLog, `Pendaftaran`, merge
          )
          addLog(`    ✓ ${_pendaftaran.length} pendaftaran`)
        }

        // Pengesahan
        if (_pengesahan.length) {
          await batchTulis(
            _pengesahan.map(({ _id, ...r }) => ({ ref: doc(db, 'kejohanan', kejId, 'pengesahan', _id), data: r })),
            addLog, `Pengesahan`, merge
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

      {/* Header */}
      <div className="mb-5">
        <h1 className="text-lg font-bold text-gray-800">Backup Sistem</h1>
        <p className="text-sm text-gray-400 mt-0.5">Muat turun atau pulihkan data sistem KOAM</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6">
        {[
          { id: 'muat_turun', label: 'Muat Turun Backup' },
          { id: 'pulihkan',   label: 'Pulihkan Backup'   },
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
