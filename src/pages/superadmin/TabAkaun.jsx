import { useState, useEffect, useMemo } from 'react'
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  serverTimestamp, Timestamp, collectionGroup,
} from 'firebase/firestore'
import { db } from '../../firebase/config'

// ── Helpers ─────────────────────────────────────────────────────────────────────

const PAKEJ_LIST = [
  { id: 'free',     label: 'Percuma',  warna: 'bg-gray-100 text-gray-600'    },
  { id: 'school',   label: 'Sekolah',  warna: 'bg-blue-100 text-blue-700'    },
  { id: 'district', label: 'Daerah',   warna: 'bg-purple-100 text-purple-700'},
]
const STATUS_LIST = [
  { id: 'sah',      label: 'Sah',       warna: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  { id: 'menunggu', label: 'Menunggu',  warna: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
]

const BULAN_MS = ['Jan','Feb','Mac','Apr','Mei','Jun','Jul','Ogo','Sep','Okt','Nov','Dis']

function fmtRM(nilai) {
  if (typeof nilai !== 'number' || isNaN(nilai)) return 'RM 0.00'
  return 'RM ' + nilai.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function tsToDate(ts) {
  if (!ts) return null
  if (ts?.toDate) return ts.toDate()
  if (typeof ts === 'string') return new Date(ts)
  if (ts instanceof Date) return ts
  return null
}

function fmtTarikh(ts) {
  const d = tsToDate(ts)
  if (!d) return '—'
  return d.toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' })
}

async function nextInvoiceNo(tahun) {
  // Format: INV-{tahun}-{nnn}. Scan collectionGroup untuk cari nombor terakhir tahun ni.
  try {
    const snap = await getDocs(collectionGroup(db, 'langganan_sejarah'))
    let max = 0
    snap.docs.forEach(d => {
      const inv = d.data().noRujukan || ''
      const m = inv.match(new RegExp(`^INV-${tahun}-(\\d+)$`))
      if (m) max = Math.max(max, parseInt(m[1], 10))
    })
    return `INV-${tahun}-${String(max + 1).padStart(3, '0')}`
  } catch {
    return `INV-${tahun}-001`
  }
}

// ── Modal Tambah/Edit Entry ────────────────────────────────────────────────────

function ModalEntry({ entry, sekolahList, onTutup, onSimpan }) {
  const isEdit = !!entry?.id
  const HARI_INI = new Date().toISOString().split('T')[0]

  const [borang, setBorang] = useState({
    schoolId:      entry?.schoolId    || (sekolahList[0]?.id || ''),
    tarikhBayaran: entry?.tarikhBayaran ? tsToDate(entry.tarikhBayaran)?.toISOString().split('T')[0] : HARI_INI,
    tarikhMula:    entry?.tarikhMula    ? tsToDate(entry.tarikhMula)?.toISOString().split('T')[0]    : HARI_INI,
    tarikhTamat:   entry?.tarikhTamat   ? tsToDate(entry.tarikhTamat)?.toISOString().split('T')[0]   : (() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().split('T')[0] })(),
    pakej:         entry?.pakej       || 'school',
    jumlahRM:      entry?.jumlahRM    ?? '',
    status:        entry?.status      || 'menunggu',
    noRujukan:     entry?.noRujukan   || '',
    nota:          entry?.nota        || '',
  })
  const [ralat,  setRalat]  = useState('')
  const [sedang, setSedang] = useState(false)

  function set(k, v) { setBorang(b => ({ ...b, [k]: v })); setRalat('') }

  async function autoJanaInvoice() {
    const tahun = new Date(borang.tarikhBayaran).getFullYear()
    const inv = await nextInvoiceNo(tahun)
    set('noRujukan', inv)
  }

  async function handleSimpan(e) {
    e.preventDefault()
    if (!borang.schoolId) return setRalat('Sekolah diperlukan.')
    if (borang.jumlahRM === '' || isNaN(Number(borang.jumlahRM))) return setRalat('Jumlah RM diperlukan.')

    setSedang(true)
    try {
      let noRujukan = borang.noRujukan
      if (!noRujukan) {
        const tahun = new Date(borang.tarikhBayaran).getFullYear()
        noRujukan = await nextInvoiceNo(tahun)
      }

      const data = {
        schoolId:      borang.schoolId,
        tarikhBayaran: Timestamp.fromDate(new Date(borang.tarikhBayaran)),
        tarikhMula:    Timestamp.fromDate(new Date(borang.tarikhMula)),
        tarikhTamat:   Timestamp.fromDate(new Date(borang.tarikhTamat)),
        pakej:         borang.pakej,
        jumlahRM:      Number(borang.jumlahRM),
        status:        borang.status,
        noRujukan,
        nota:          borang.nota,
        dikemaskinPada: serverTimestamp(),
      }

      if (isEdit) {
        await updateDoc(doc(db, 'tenants', entry.schoolId, 'langganan_sejarah', entry.id), data)
      } else {
        data.dicipta = serverTimestamp()
        await addDoc(collection(db, 'tenants', borang.schoolId, 'langganan_sejarah'), data)
      }
      onSimpan()
      onTutup()
    } catch (err) {
      setRalat('Gagal simpan: ' + (err?.message || err))
    } finally {
      setSedang(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 overflow-y-auto"
      onClick={e => e.target === e.currentTarget && !sedang && onTutup()}>
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden my-auto">
        <div className="bg-[#003399] px-5 py-4 flex items-center justify-between">
          <p className="text-sm font-bold text-white">{isEdit ? 'Edit Entry Langganan' : 'Tambah Entry Langganan'}</p>
          <button onClick={onTutup} disabled={sedang} className="text-white/50 hover:text-white">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSimpan} className="p-5 space-y-3">
          {ralat && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{ralat}</p>}

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Sekolah</label>
            <select value={borang.schoolId} onChange={e => set('schoolId', e.target.value)}
              disabled={isEdit}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] disabled:opacity-60">
              {sekolahList.map(s => <option key={s.id} value={s.id}>{s.namaSekolah || s.id}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Pakej</label>
              <select value={borang.pakej} onChange={e => set('pakej', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399]">
                {PAKEJ_LIST.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Status</label>
              <select value={borang.status} onChange={e => set('status', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399]">
                {STATUS_LIST.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Jumlah (RM)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">RM</span>
              <input type="number" step="0.01" min="0" value={borang.jumlahRM}
                onChange={e => set('jumlahRM', e.target.value)}
                required placeholder="0.00"
                className="w-full pl-11 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399]" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Bayaran</label>
              <input type="date" value={borang.tarikhBayaran} onChange={e => set('tarikhBayaran', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-2 py-2.5 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399]" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Mula</label>
              <input type="date" value={borang.tarikhMula} onChange={e => set('tarikhMula', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-2 py-2.5 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399]" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Tamat</label>
              <input type="date" value={borang.tarikhTamat} onChange={e => set('tarikhTamat', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-2 py-2.5 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399]" />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">No Rujukan / Invoice</label>
            <div className="flex gap-2">
              <input type="text" value={borang.noRujukan}
                onChange={e => set('noRujukan', e.target.value)}
                placeholder="INV-2026-001 (auto jika kosong)"
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399]" />
              <button type="button" onClick={autoJanaInvoice}
                className="text-[10px] font-bold px-3 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl text-gray-600 shrink-0">
                Auto Jana
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Nota</label>
            <textarea value={borang.nota} onChange={e => set('nota', e.target.value)}
              rows={2} placeholder="Nota tambahan (opsyenal)…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399]" />
          </div>

          <button type="submit" disabled={sedang}
            className="w-full bg-[#003399] hover:bg-[#002277] disabled:bg-gray-300 text-white font-bold py-3 rounded-xl text-sm transition-colors">
            {sedang ? 'Menyimpan…' : (isEdit ? '✓ Kemaskini Entry' : '+ Tambah Entry')}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Modal Backfill Auto ────────────────────────────────────────────────────────

function ModalBackfill({ sekolahList, onTutup, onSelesai }) {
  const [sedang, setSedang] = useState(false)
  const [log,    setLog]    = useState([])

  async function jalanBackfill() {
    setSedang(true)
    const catat = t => setLog(l => [...l, t])
    let bilangan = 0

    for (const s of sekolahList) {
      try {
        // Skip kalau dah ada entry sedia ada
        const existSnap = await getDocs(collection(db, 'tenants', s.id, 'langganan_sejarah'))
        if (!existSnap.empty) {
          catat(`⏭ ${s.namaSekolah || s.id} — sudah ada ${existSnap.size} entry, langkau.`)
          continue
        }
        if (!s.tarikhMula && !s.tarikhExpiry) {
          catat(`⚠ ${s.namaSekolah || s.id} — tiada tarikh, langkau.`)
          continue
        }

        const tarikhMula  = s.tarikhMula?.toDate?.()  || s.tarikhExpiry?.toDate?.() || new Date()
        const tarikhTamat = s.tarikhExpiry?.toDate?.() || (() => { const d = new Date(tarikhMula); d.setFullYear(d.getFullYear() + 1); return d })()

        await addDoc(collection(db, 'tenants', s.id, 'langganan_sejarah'), {
          schoolId:      s.id,
          tarikhBayaran: Timestamp.fromDate(tarikhMula),
          tarikhMula:    Timestamp.fromDate(tarikhMula),
          tarikhTamat:   Timestamp.fromDate(tarikhTamat),
          pakej:         s.pakej || 'school',
          jumlahRM:      0,
          status:        'sah',
          noRujukan:     '',
          nota:          'Backfill automatik — edit untuk masukkan jumlah sebenar',
          dicipta:       serverTimestamp(),
        })
        bilangan++
        catat(`✓ ${s.namaSekolah || s.id} — backfill berjaya (RM 0, sila edit).`)
      } catch (err) {
        catat(`✗ ${s.namaSekolah || s.id} — gagal: ${err?.message || err}`)
      }
    }

    catat(`\n🎉 Selesai. ${bilangan} entry dicipta.`)
    setSedang(false)
    if (bilangan > 0) onSelesai()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={e => e.target === e.currentTarget && !sedang && onTutup()}>
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-amber-600 px-5 py-4 flex items-center justify-between">
          <p className="text-sm font-bold text-white">Auto Backfill Langganan Sedia Ada</p>
          <button onClick={onTutup} disabled={sedang} className="text-white/50 hover:text-white">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-3">
          {log.length === 0 ? (
            <>
              <p className="text-xs text-gray-500">
                Aku akan scan <strong>{sekolahList.length}</strong> sekolah dan cipta entry langganan berdasarkan
                <code className="mx-1 px-1 bg-gray-100 rounded">tarikhMula</code> +
                <code className="mx-1 px-1 bg-gray-100 rounded">tarikhExpiry</code> sedia ada.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 space-y-1">
                <p className="font-bold">⚠ Nota:</p>
                <p>• Jumlah RM akan ditetapkan <strong>RM 0</strong> — kau perlu edit manual selepas ni untuk masukkan jumlah sebenar.</p>
                <p>• Status default: <strong>Sah</strong> (kerana sekolah sudah aktif).</p>
                <p>• Sekolah yang sudah ada entry akan dilangkau.</p>
              </div>
              <button onClick={jalanBackfill}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-xl text-sm">
                Mula Backfill
              </button>
            </>
          ) : (
            <div className="bg-gray-900 text-green-300 font-mono text-[10px] rounded-xl p-3 max-h-80 overflow-y-auto whitespace-pre-wrap">
              {log.join('\n')}
            </div>
          )}
          {log.length > 0 && !sedang && (
            <button onClick={onTutup} className="w-full bg-[#003399] text-white font-bold py-2.5 rounded-xl text-sm">
              Tutup
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Kad KPI ────────────────────────────────────────────────────────────────────

function KadKPI({ label, nilai, sub, warna }) {
  const cls = {
    biru:   'bg-blue-50 border-blue-200 text-blue-700',
    hijau:  'bg-green-50 border-green-200 text-green-700',
    kuning: 'bg-amber-50 border-amber-200 text-amber-700',
    ungu:   'bg-purple-50 border-purple-200 text-purple-700',
    kelabu: 'bg-gray-50 border-gray-200 text-gray-700',
  }
  return (
    <div className={`rounded-xl border p-4 ${cls[warna]}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="text-2xl font-black mt-1">{nilai}</p>
      {sub && <p className="text-[10px] opacity-60 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Carta Bulanan (SVG bar chart) ──────────────────────────────────────────────

function CartaBulanan({ data }) {
  // data: array 12 elemen { bulan, jumlah, kiraan }
  const maks = Math.max(...data.map(d => d.jumlah), 1)
  const tinggiCarta = 140
  const lebarBar = 100 / 12

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5">
      <p className="text-xs font-bold text-gray-700 mb-1">Pendapatan Bulanan (12 Bulan Terkini)</p>
      <p className="text-[10px] text-gray-400 mb-4">Hanya kira status "Sah"</p>
      <div className="relative" style={{ height: tinggiCarta + 40 }}>
        <svg width="100%" height={tinggiCarta + 40} className="overflow-visible">
          {data.map((d, i) => {
            const h = maks > 0 ? (d.jumlah / maks) * tinggiCarta : 0
            const x = i * lebarBar
            const y = tinggiCarta - h
            return (
              <g key={i}>
                <rect
                  x={`${x + lebarBar * 0.15}%`} y={y}
                  width={`${lebarBar * 0.7}%`} height={h}
                  fill={d.jumlah > 0 ? '#003399' : '#e5e7eb'}
                  rx={3}
                >
                  <title>{`${d.label}: ${fmtRM(d.jumlah)} (${d.kiraan} langganan)`}</title>
                </rect>
                {d.jumlah > 0 && (
                  <text
                    x={`${x + lebarBar / 2}%`} y={y - 4}
                    textAnchor="middle" fontSize="9" fill="#003399" fontWeight="bold"
                  >
                    {d.jumlah >= 1000 ? `${(d.jumlah / 1000).toFixed(1)}k` : d.jumlah.toFixed(0)}
                  </text>
                )}
                <text
                  x={`${x + lebarBar / 2}%`} y={tinggiCarta + 15}
                  textAnchor="middle" fontSize="10" fill="#6b7280"
                >
                  {d.label}
                </text>
                <text
                  x={`${x + lebarBar / 2}%`} y={tinggiCarta + 30}
                  textAnchor="middle" fontSize="8" fill="#9ca3af"
                >
                  {d.tahunPendek}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

// ── Pie Chart Pakej ────────────────────────────────────────────────────────────

function PieChartPakej({ agregat }) {
  // agregat: { free: RM, school: RM, district: RM }
  const total = agregat.free + agregat.school + agregat.district
  if (total === 0) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col items-center justify-center">
        <p className="text-xs font-bold text-gray-700 mb-2">Pecahan Pakej</p>
        <p className="text-xs text-gray-400 py-8">Tiada data</p>
      </div>
    )
  }

  const warna = { free: '#9ca3af', school: '#3b82f6', district: '#a855f7' }
  const R = 55
  const cx = 70
  const cy = 70

  let sudutMula = -Math.PI / 2
  const segmen = ['free', 'school', 'district'].map(pkg => {
    const nilai = agregat[pkg]
    if (nilai === 0) return null
    const sudut = (nilai / total) * Math.PI * 2
    const sudutTamat = sudutMula + sudut
    const x1 = cx + R * Math.cos(sudutMula)
    const y1 = cy + R * Math.sin(sudutMula)
    const x2 = cx + R * Math.cos(sudutTamat)
    const y2 = cy + R * Math.sin(sudutTamat)
    const besar = sudut > Math.PI ? 1 : 0
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${R} ${R} 0 ${besar} 1 ${x2} ${y2} Z`
    sudutMula = sudutTamat
    return { pkg, path, nilai, peratus: (nilai / total) * 100 }
  }).filter(Boolean)

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5">
      <p className="text-xs font-bold text-gray-700 mb-1">Pecahan Pakej</p>
      <p className="text-[10px] text-gray-400 mb-3">Berdasarkan pendapatan sah</p>
      <div className="flex items-center gap-4">
        <svg width="140" height="140" viewBox="0 0 140 140" className="shrink-0">
          {segmen.map(s => (
            <path key={s.pkg} d={s.path} fill={warna[s.pkg]}>
              <title>{`${PAKEJ_LIST.find(p => p.id === s.pkg).label}: ${fmtRM(s.nilai)}`}</title>
            </path>
          ))}
        </svg>
        <div className="flex-1 space-y-2">
          {segmen.map(s => (
            <div key={s.pkg} className="flex items-center gap-2 text-xs">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: warna[s.pkg] }} />
              <span className="font-semibold text-gray-700 min-w-0 truncate flex-1">
                {PAKEJ_LIST.find(p => p.id === s.pkg).label}
              </span>
              <span className="text-[10px] text-gray-400">{s.peratus.toFixed(0)}%</span>
              <span className="text-[10px] font-mono font-bold text-gray-600">{fmtRM(s.nilai)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Modal Statement Sekolah ────────────────────────────────────────────────────

function ModalStatement({ sekolahList, onCetak, onTutup }) {
  const HARI_INI = new Date().toISOString().split('T')[0]
  const TAHUN_LEPAS = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().split('T')[0] })()

  const [schoolId,   setSchoolId]   = useState(sekolahList[0]?.id || '')
  const [dari,       setDari]       = useState(TAHUN_LEPAS)
  const [hingga,     setHingga]     = useState(HARI_INI)
  const [semuaMasa,  setSemuaMasa]  = useState(false)
  const [carian,     setCarian]     = useState('')

  const sekolahDitapis = sekolahList.filter(s => {
    if (!carian.trim()) return true
    const kata = `${s.namaSekolah || ''} ${s.daerah || ''} ${s.slug || ''}`.toLowerCase()
    return kata.includes(carian.toLowerCase())
  })

  function handleCetak(e) {
    e.preventDefault()
    if (!schoolId) return
    onCetak(schoolId, semuaMasa ? null : dari, semuaMasa ? null : hingga)
    onTutup()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={e => e.target === e.currentTarget && onTutup()}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-indigo-600 px-5 py-4 flex items-center justify-between">
          <p className="text-sm font-bold text-white">Cetak Statement Sekolah</p>
          <button onClick={onTutup} className="text-white/50 hover:text-white">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleCetak} className="p-5 space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Pilih Sekolah</label>
            <input type="text" value={carian} onChange={e => setCarian(e.target.value)}
              placeholder="🔍 Cari sekolah…"
              className="w-full mb-2 border border-gray-200 rounded-xl px-3 py-2 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
            <select value={schoolId} onChange={e => setSchoolId(e.target.value)}
              size={5}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
              {sekolahDitapis.map(s => (
                <option key={s.id} value={s.id}>{s.namaSekolah || s.id}{s.daerah ? ` (${s.daerah})` : ''}</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
            <input type="checkbox" checked={semuaMasa} onChange={e => setSemuaMasa(e.target.checked)}
              className="w-4 h-4 accent-indigo-600" />
            Sepanjang masa (abaikan tempoh)
          </label>

          {!semuaMasa && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Dari</label>
                <input type="date" value={dari} onChange={e => setDari(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-2 py-2 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Hingga</label>
                <input type="date" value={hingga} onChange={e => setHingga(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-2 py-2 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
              </div>
            </div>
          )}

          <button type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-sm">
            📄 Jana Statement PDF
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Komponen Utama ─────────────────────────────────────────────────────────────

export default function TabAkaun({ sekolahList = [] }) {
  const [entries,       setEntries]       = useState([])
  const [muatTurun,     setMuatTurun]     = useState(true)
  const [modalEntry,    setModalEntry]    = useState(null)   // null | {} | entry
  const [modalBackfill,  setModalBackfill]  = useState(false)
  const [modalStatement, setModalStatement] = useState(false)
  const [filterTahun,   setFilterTahun]   = useState('semua')
  const [filterBulan,   setFilterBulan]   = useState('semua')
  const [filterPakej,   setFilterPakej]   = useState('semua')
  const [filterStatus,  setFilterStatus]  = useState('semua')
  const [carian,        setCarian]        = useState('')
  const [menuTerbuka,   setMenuTerbuka]   = useState(null)

  useEffect(() => {
    if (!menuTerbuka) return
    const tutup = () => setMenuTerbuka(null)
    window.addEventListener('click', tutup)
    return () => window.removeEventListener('click', tutup)
  }, [menuTerbuka])

  const sekolahMap = useMemo(() => {
    const m = {}
    sekolahList.forEach(s => { m[s.id] = s.namaSekolah || s.id })
    return m
  }, [sekolahList])

  async function muatEntries() {
    setMuatTurun(true)
    try {
      const snap = await getDocs(collectionGroup(db, 'langganan_sejarah'))
      const list = snap.docs.map(d => {
        const data = d.data()
        return { id: d.id, schoolId: data.schoolId || d.ref.parent.parent.id, ...data }
      })
      list.sort((a, b) => (tsToDate(b.tarikhBayaran)?.getTime() || 0) - (tsToDate(a.tarikhBayaran)?.getTime() || 0))
      setEntries(list)
    } catch (err) {
      console.error('muatEntries:', err)
    }
    setMuatTurun(false)
  }

  useEffect(() => { muatEntries() }, [])

  async function padamEntry(entry) {
    if (!confirm(`Padam entry ${entry.noRujukan || '(tiada rujukan)'} — ${sekolahMap[entry.schoolId] || entry.schoolId}?`)) return
    try {
      await deleteDoc(doc(db, 'tenants', entry.schoolId, 'langganan_sejarah', entry.id))
      setEntries(list => list.filter(x => x.id !== entry.id))
    } catch (err) {
      alert('Gagal padam: ' + (err?.message || err))
    }
  }

  async function tukarStatus(entry, statusBaru) {
    try {
      await updateDoc(doc(db, 'tenants', entry.schoolId, 'langganan_sejarah', entry.id), {
        status: statusBaru,
        dikemaskinPada: serverTimestamp(),
      })
      setEntries(list => list.map(x => x.id === entry.id ? { ...x, status: statusBaru } : x))
    } catch (err) {
      alert('Gagal kemaskini: ' + (err?.message || err))
    }
  }

  // ── Kira KPI ────────────────────────────────────────────────────────────────
  const kini = new Date()
  const tahunKini = kini.getFullYear()
  const bulanKini = kini.getMonth()

  const kpi = useMemo(() => {
    const sah = entries.filter(e => e.status === 'sah')
    const menunggu = entries.filter(e => e.status === 'menunggu')

    const bulan = sah.filter(e => {
      const d = tsToDate(e.tarikhBayaran)
      return d && d.getFullYear() === tahunKini && d.getMonth() === bulanKini
    })
    const tahun = sah.filter(e => {
      const d = tsToDate(e.tarikhBayaran)
      return d && d.getFullYear() === tahunKini
    })

    const jumlah = arr => arr.reduce((s, e) => s + (Number(e.jumlahRM) || 0), 0)

    // Purata bulanan sepanjang masa
    const tahunSemua = sah.map(e => tsToDate(e.tarikhBayaran)?.getFullYear()).filter(Boolean)
    const bilanganBulanUnik = new Set(sah.map(e => {
      const d = tsToDate(e.tarikhBayaran)
      return d ? `${d.getFullYear()}-${d.getMonth()}` : null
    }).filter(Boolean)).size
    const purataBulanan = bilanganBulanUnik > 0 ? jumlah(sah) / bilanganBulanUnik : 0

    return {
      bulan:      { jumlah: jumlah(bulan),    bilangan: bulan.length    },
      tahun:      { jumlah: jumlah(tahun),    bilangan: tahun.length    },
      sepanjang:  { jumlah: jumlah(sah),      bilangan: sah.length      },
      menunggu:   { jumlah: jumlah(menunggu), bilangan: menunggu.length },
      purata:     purataBulanan,
    }
  }, [entries, tahunKini, bulanKini])

  // ── Data Carta 12 bulan ────────────────────────────────────────────────────
  const dataCarta = useMemo(() => {
    const arr = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(tahunKini, bulanKini - i, 1)
      arr.push({
        tahun: d.getFullYear(),
        bulan: d.getMonth(),
        label: BULAN_MS[d.getMonth()],
        tahunPendek: `'${String(d.getFullYear()).slice(-2)}`,
        jumlah: 0,
        kiraan: 0,
      })
    }
    entries.filter(e => e.status === 'sah').forEach(e => {
      const d = tsToDate(e.tarikhBayaran)
      if (!d) return
      const slot = arr.find(x => x.tahun === d.getFullYear() && x.bulan === d.getMonth())
      if (slot) {
        slot.jumlah += Number(e.jumlahRM) || 0
        slot.kiraan += 1
      }
    })
    return arr
  }, [entries, tahunKini, bulanKini])

  // ── Agregat pakej untuk pie chart ──────────────────────────────────────────
  const agregatPakej = useMemo(() => {
    const a = { free: 0, school: 0, district: 0 }
    entries.filter(e => e.status === 'sah').forEach(e => {
      const p = e.pakej || 'school'
      a[p] = (a[p] || 0) + (Number(e.jumlahRM) || 0)
    })
    return a
  }, [entries])

  // ── Filter + sort untuk table ──────────────────────────────────────────────
  const tahunTersedia = useMemo(() => {
    const set = new Set()
    entries.forEach(e => {
      const d = tsToDate(e.tarikhBayaran)
      if (d) set.add(d.getFullYear())
    })
    return [...set].sort((a, b) => b - a)
  }, [entries])

  const entriesDipapar = useMemo(() => {
    const carianLower = carian.trim().toLowerCase()
    return entries.filter(e => {
      const d = tsToDate(e.tarikhBayaran)
      if (filterTahun !== 'semua' && d?.getFullYear() !== Number(filterTahun)) return false
      if (filterBulan !== 'semua' && d?.getMonth() !== Number(filterBulan)) return false
      if (filterPakej !== 'semua' && e.pakej !== filterPakej) return false
      if (filterStatus !== 'semua' && e.status !== filterStatus) return false
      if (!carianLower) return true
      const kata = `${sekolahMap[e.schoolId] || ''} ${e.noRujukan || ''} ${e.nota || ''}`.toLowerCase()
      return kata.includes(carianLower)
    })
  }, [entries, filterTahun, filterBulan, filterPakej, filterStatus, carian, sekolahMap])

  const jumlahDipapar = entriesDipapar.reduce((s, e) => s + (Number(e.jumlahRM) || 0), 0)

  // ── Cetak Resit (satu entry) ────────────────────────────────────────────────
  async function cetakResit(entry) {
    const { jsPDF } = await import('jspdf')
    const sekolahInfo = sekolahList.find(s => s.id === entry.schoolId) || {}
    const namaSekolah = sekolahInfo.namaSekolah || entry.schoolId
    const daerah      = sekolahInfo.daerah || ''
    const pakejLabel  = PAKEJ_LIST.find(p => p.id === entry.pakej)?.label || entry.pakej || '—'
    const statusLabel = STATUS_LIST.find(s => s.id === entry.status)?.label || entry.status || '—'
    const jumlah      = Number(entry.jumlahRM) || 0

    const d = new jsPDF({ unit: 'mm', format: 'a4' })
    const W = d.internal.pageSize.getWidth()

    // Header — kotak biru
    d.setFillColor(0, 51, 153)
    d.rect(0, 0, W, 32, 'F')
    d.setTextColor(255, 255, 255).setFont('helvetica', 'bold').setFontSize(20)
    d.text('GOLD PODIUM', 15, 15)
    d.setFontSize(9).setFont('helvetica', 'normal')
    d.text('Sistem Pengurusan Kejohanan Olahraga Sekolah', 15, 21)
    d.setFontSize(8)
    d.text('goldpodium.web.app', 15, 26)

    // Label RESIT — kanan atas
    d.setFillColor(255, 215, 0)
    d.roundedRect(W - 55, 8, 40, 16, 2, 2, 'F')
    d.setTextColor(0, 51, 153).setFont('helvetica', 'bold').setFontSize(14)
    d.text('RESIT', W - 35, 18, { align: 'center' })

    // Butiran resit
    d.setTextColor(0, 0, 0)
    let y = 45
    d.setFont('helvetica', 'bold').setFontSize(10)
    d.text('No Resit:', 15, y)
    d.setFont('helvetica', 'normal')
    d.text(entry.noRujukan || '—', 45, y)

    d.setFont('helvetica', 'bold')
    d.text('Tarikh:', W - 60, y)
    d.setFont('helvetica', 'normal')
    d.text(fmtTarikh(entry.tarikhBayaran), W - 40, y)

    // Kepada
    y += 12
    d.setFontSize(8).setFont('helvetica', 'bold').setTextColor(120, 120, 120)
    d.text('DITERIMA DARIPADA', 15, y)
    y += 6
    d.setFontSize(12).setFont('helvetica', 'bold').setTextColor(0, 0, 0)
    d.text(namaSekolah, 15, y)
    if (daerah) {
      y += 5
      d.setFontSize(9).setFont('helvetica', 'normal').setTextColor(80, 80, 80)
      d.text(daerah, 15, y)
    }

    // Butiran bayaran — table
    y += 12
    d.setDrawColor(220, 220, 220).setLineWidth(0.3)
    d.line(15, y, W - 15, y)
    y += 8

    const baris = [
      ['Pakej Langganan', pakejLabel],
      ['Tempoh',          `${fmtTarikh(entry.tarikhMula)} — ${fmtTarikh(entry.tarikhTamat)}`],
      ['Status',          statusLabel],
    ]
    if (entry.nota) baris.push(['Nota', entry.nota])

    d.setFontSize(9)
    baris.forEach(([label, nilai]) => {
      d.setFont('helvetica', 'normal').setTextColor(120, 120, 120)
      d.text(label, 15, y)
      d.setFont('helvetica', 'bold').setTextColor(0, 0, 0)
      d.text(String(nilai), 60, y)
      y += 7
    })

    // Jumlah — kotak besar
    y += 8
    d.setFillColor(0, 51, 153)
    d.roundedRect(15, y, W - 30, 22, 2, 2, 'F')
    d.setTextColor(255, 255, 255).setFontSize(9).setFont('helvetica', 'normal')
    d.text('JUMLAH DIBAYAR', 22, y + 8)
    d.setFontSize(18).setFont('helvetica', 'bold')
    d.text(fmtRM(jumlah), W - 22, y + 14, { align: 'right' })

    // Footer
    y += 40
    d.setTextColor(120, 120, 120).setFontSize(8).setFont('helvetica', 'italic')
    d.text('Terima kasih atas langganan anda.', 15, y)
    y += 4
    d.text('Ini adalah resit dijana secara automatik oleh sistem Gold Podium.', 15, y)

    // Signature line
    y += 20
    d.setDrawColor(180, 180, 180)
    d.line(W - 75, y, W - 15, y)
    y += 5
    d.setFontSize(8).setFont('helvetica', 'normal').setTextColor(100, 100, 100)
    d.text('Tandatangan / Cop Rasmi', W - 45, y, { align: 'center' })

    const namaFail = `Resit_${entry.noRujukan || 'entry'}_${namaSekolah.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
    d.save(namaFail)
  }

  // ── Cetak Statement (satu sekolah, semua entry) ─────────────────────────────
  async function cetakStatement(schoolId, dariTarikh, hinggaTarikh) {
    const { jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')

    const sekolahInfo = sekolahList.find(s => s.id === schoolId) || {}
    const namaSekolah = sekolahInfo.namaSekolah || schoolId
    const daerah      = sekolahInfo.daerah || ''

    const dari   = dariTarikh   ? new Date(dariTarikh)                    : null
    const hingga = hinggaTarikh ? new Date(hinggaTarikh + 'T23:59:59')    : null

    const entrySekolah = entries
      .filter(e => e.schoolId === schoolId)
      .filter(e => {
        const d = tsToDate(e.tarikhBayaran)
        if (!d) return false
        if (dari   && d < dari)   return false
        if (hingga && d > hingga) return false
        return true
      })
      .sort((a, b) => (tsToDate(a.tarikhBayaran)?.getTime() || 0) - (tsToDate(b.tarikhBayaran)?.getTime() || 0))

    if (entrySekolah.length === 0) {
      alert('Tiada entry dalam tempoh yang dipilih.')
      return
    }

    const jumlahSah      = entrySekolah.filter(e => e.status === 'sah').reduce((s, e) => s + (Number(e.jumlahRM) || 0), 0)
    const jumlahMenunggu = entrySekolah.filter(e => e.status === 'menunggu').reduce((s, e) => s + (Number(e.jumlahRM) || 0), 0)

    const d = new jsPDF({ unit: 'mm', format: 'a4' })
    const W = d.internal.pageSize.getWidth()

    d.setFillColor(0, 51, 153)
    d.rect(0, 0, W, 32, 'F')
    d.setTextColor(255, 255, 255).setFont('helvetica', 'bold').setFontSize(20)
    d.text('GOLD PODIUM', 15, 15)
    d.setFontSize(9).setFont('helvetica', 'normal')
    d.text('Penyata Langganan', 15, 21)
    d.setFontSize(8)
    d.text('goldpodium.web.app', 15, 26)

    d.setFillColor(255, 215, 0)
    d.roundedRect(W - 60, 8, 45, 16, 2, 2, 'F')
    d.setTextColor(0, 51, 153).setFont('helvetica', 'bold').setFontSize(11)
    d.text('STATEMENT', W - 37.5, 18, { align: 'center' })

    d.setTextColor(0, 0, 0)
    let y = 42
    d.setFontSize(8).setFont('helvetica', 'bold').setTextColor(120, 120, 120)
    d.text('UNTUK', 15, y)
    y += 5
    d.setFontSize(13).setFont('helvetica', 'bold').setTextColor(0, 0, 0)
    d.text(namaSekolah, 15, y)
    if (daerah) {
      y += 5
      d.setFontSize(9).setFont('helvetica', 'normal').setTextColor(80, 80, 80)
      d.text(daerah, 15, y)
    }

    d.setFontSize(8).setTextColor(120, 120, 120)
    const tempohLabel = (dari || hingga)
      ? `Tempoh: ${dari ? fmtTarikh(Timestamp.fromDate(dari)) : 'Awal'} — ${hingga ? fmtTarikh(Timestamp.fromDate(hingga)) : 'Sekarang'}`
      : 'Tempoh: Semua rekod'
    d.text(tempohLabel, W - 15, 42, { align: 'right' })
    d.text(`Dijana: ${new Date().toLocaleString('ms-MY')}`, W - 15, 47, { align: 'right' })

    autoTable(d, {
      startY: y + 10,
      head: [['Tarikh Bayar', 'No Rujukan', 'Pakej', 'Tempoh Langganan', 'Status', 'Jumlah (RM)']],
      body: entrySekolah.map(e => [
        fmtTarikh(e.tarikhBayaran),
        e.noRujukan || '—',
        PAKEJ_LIST.find(p => p.id === e.pakej)?.label || e.pakej || '—',
        `${fmtTarikh(e.tarikhMula)} — ${fmtTarikh(e.tarikhTamat)}`,
        STATUS_LIST.find(s => s.id === e.status)?.label || e.status || '—',
        (Number(e.jumlahRM) || 0).toFixed(2),
      ]),
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [0, 51, 153], textColor: 255, fontSize: 8 },
      columnStyles: { 5: { halign: 'right', fontStyle: 'bold' } },
    })

    const yLepas = d.lastAutoTable.finalY + 8

    // Ringkasan
    d.setDrawColor(0, 51, 153).setLineWidth(0.5)
    d.line(15, yLepas, W - 15, yLepas)
    let yy = yLepas + 8
    d.setFontSize(9).setFont('helvetica', 'normal').setTextColor(80, 80, 80)
    d.text('Jumlah Dibayar (Sah):', W - 70, yy)
    d.setFont('helvetica', 'bold').setTextColor(0, 100, 0)
    d.text(fmtRM(jumlahSah), W - 15, yy, { align: 'right' })

    yy += 6
    d.setFont('helvetica', 'normal').setTextColor(80, 80, 80)
    d.text('Belum Bayar (Menunggu):', W - 70, yy)
    d.setFont('helvetica', 'bold').setTextColor(180, 100, 0)
    d.text(fmtRM(jumlahMenunggu), W - 15, yy, { align: 'right' })

    yy += 8
    d.setDrawColor(200, 200, 200).setLineWidth(0.3)
    d.line(W - 70, yy - 2, W - 15, yy - 2)
    d.setFontSize(11).setFont('helvetica', 'bold').setTextColor(0, 0, 0)
    d.text('JUMLAH KESELURUHAN:', W - 70, yy + 3)
    d.setTextColor(0, 51, 153)
    d.text(fmtRM(jumlahSah + jumlahMenunggu), W - 15, yy + 3, { align: 'right' })

    // Footer
    yy += 18
    d.setTextColor(120, 120, 120).setFontSize(7).setFont('helvetica', 'italic')
    d.text('Penyata ini dijana secara automatik oleh sistem Gold Podium. Sebarang pertanyaan sila hubungi pihak pentadbir.', 15, yy)

    const namaFail = `Statement_${namaSekolah.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`
    d.save(namaFail)
  }

  // ── Export PDF ──────────────────────────────────────────────────────────────
  async function exportPDF() {
    const { jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc2 = new jsPDF({ orientation: 'landscape' })

    doc2.setFontSize(14).setFont('helvetica', 'bold')
    doc2.text('GOLD PODIUM — Laporan Langganan', 14, 15)
    doc2.setFontSize(9).setFont('helvetica', 'normal')
    doc2.text(`Dijana: ${new Date().toLocaleString('ms-MY')}`, 14, 21)
    doc2.text(`Jumlah entry: ${entriesDipapar.length}   |   Jumlah: ${fmtRM(jumlahDipapar)}`, 14, 26)

    autoTable(doc2, {
      startY: 32,
      head: [['Tarikh Bayar', 'Sekolah', 'Pakej', 'Tempoh', 'No Rujukan', 'Status', 'Jumlah (RM)']],
      body: entriesDipapar.map(e => [
        fmtTarikh(e.tarikhBayaran),
        sekolahMap[e.schoolId] || e.schoolId,
        PAKEJ_LIST.find(p => p.id === e.pakej)?.label || e.pakej || '—',
        `${fmtTarikh(e.tarikhMula)} – ${fmtTarikh(e.tarikhTamat)}`,
        e.noRujukan || '—',
        STATUS_LIST.find(s => s.id === e.status)?.label || e.status || '—',
        (Number(e.jumlahRM) || 0).toFixed(2),
      ]),
      foot: [['', '', '', '', '', 'JUMLAH', jumlahDipapar.toFixed(2)]],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [0, 51, 153] },
      footStyles: { fillColor: [230, 230, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
      columnStyles: { 6: { halign: 'right' } },
    })

    doc2.save(`Laporan_Langganan_${new Date().toISOString().split('T')[0]}.pdf`)
  }

  // ── Export Excel ────────────────────────────────────────────────────────────
  async function exportExcel() {
    const XLSX = await import('xlsx')
    const rows = entriesDipapar.map(e => ({
      'Tarikh Bayar': fmtTarikh(e.tarikhBayaran),
      'Sekolah':      sekolahMap[e.schoolId] || e.schoolId,
      'Pakej':        PAKEJ_LIST.find(p => p.id === e.pakej)?.label || e.pakej || '',
      'Tarikh Mula':  fmtTarikh(e.tarikhMula),
      'Tarikh Tamat': fmtTarikh(e.tarikhTamat),
      'No Rujukan':   e.noRujukan || '',
      'Status':       STATUS_LIST.find(s => s.id === e.status)?.label || e.status || '',
      'Jumlah (RM)':  Number(e.jumlahRM) || 0,
      'Nota':         e.nota || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Langganan')
    XLSX.writeFile(wb, `Laporan_Langganan_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  return (
    <div className="p-5 space-y-5">

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <KadKPI label="Bulan Ini"        nilai={fmtRM(kpi.bulan.jumlah)}     sub={`${kpi.bulan.bilangan} langganan`}    warna="biru"   />
        <KadKPI label="Tahun Ini"        nilai={fmtRM(kpi.tahun.jumlah)}     sub={`${kpi.tahun.bilangan} langganan`}    warna="hijau"  />
        <KadKPI label="Sepanjang Masa"   nilai={fmtRM(kpi.sepanjang.jumlah)} sub={`${kpi.sepanjang.bilangan} langganan`} warna="ungu"   />
        <KadKPI label="Menunggu Bayaran" nilai={fmtRM(kpi.menunggu.jumlah)}  sub={`${kpi.menunggu.bilangan} entry`}     warna="kuning" />
        <KadKPI label="Purata / Bulan"   nilai={fmtRM(kpi.purata)}           sub="hanya status sah"                     warna="kelabu" />
      </div>

      {/* Carta */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <CartaBulanan data={dataCarta} />
        </div>
        <PieChartPakej agregat={agregatPakej} />
      </div>

      {/* Toolbar */}
      <div className="bg-white border border-gray-100 rounded-2xl">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" value={carian} onChange={e => setCarian(e.target.value)}
              placeholder="Cari sekolah, invoice, atau nota…"
              className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399]" />
          </div>

          <select value={filterTahun} onChange={e => setFilterTahun(e.target.value)}
            className="text-[10px] font-bold px-2 py-2 border border-gray-200 rounded-lg bg-white text-gray-600">
            <option value="semua">Semua Tahun</option>
            {tahunTersedia.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <select value={filterBulan} onChange={e => setFilterBulan(e.target.value)}
            className="text-[10px] font-bold px-2 py-2 border border-gray-200 rounded-lg bg-white text-gray-600">
            <option value="semua">Semua Bulan</option>
            {BULAN_MS.map((b, i) => <option key={i} value={i}>{b}</option>)}
          </select>

          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
            {[{ id: 'semua', label: 'Semua' }, ...PAKEJ_LIST].map(p => (
              <button key={p.id} onClick={() => setFilterPakej(p.id)}
                className={`text-[10px] font-bold px-2 py-1.5 rounded-md transition-colors ${
                  filterPakej === p.id ? 'bg-[#003399] text-white' : 'text-gray-500 hover:bg-gray-100'
                }`}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
            {[{ id: 'semua', label: 'Semua' }, ...STATUS_LIST].map(s => (
              <button key={s.id} onClick={() => setFilterStatus(s.id)}
                className={`text-[10px] font-bold px-2 py-1.5 rounded-md transition-colors ${
                  filterStatus === s.id ? 'bg-[#003399] text-white' : 'text-gray-500 hover:bg-gray-100'
                }`}>
                {s.label}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          <button onClick={exportExcel}
            className="text-[10px] font-bold px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center gap-1.5">
            📊 Excel
          </button>
          <button onClick={exportPDF}
            className="text-[10px] font-bold px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-1.5">
            📄 PDF
          </button>
          <button onClick={() => setModalStatement(true)}
            className="text-[10px] font-bold px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-1.5">
            📑 Statement Sekolah
          </button>
          <button onClick={() => setModalBackfill(true)}
            className="text-[10px] font-bold px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg">
            Backfill Auto
          </button>
          <button onClick={() => setModalEntry({})}
            className="text-[10px] font-bold px-3 py-2 bg-[#003399] hover:bg-[#002277] text-white rounded-lg flex items-center gap-1.5">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Entry Baharu
          </button>
        </div>

        {/* Ringkasan filter */}
        <div className="px-4 py-2 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between text-[10px]">
          <span className="text-gray-500">
            {entriesDipapar.length} / {entries.length} entry dipapar
          </span>
          <span className="font-bold text-[#003399]">
            Jumlah: {fmtRM(jumlahDipapar)}
          </span>
        </div>

        {/* Table entries */}
        {muatTurun ? (
          <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <span className="text-sm">Memuatkan…</span>
          </div>
        ) : entriesDipapar.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-2 opacity-40">📊</div>
            {entries.length === 0 ? (
              <>
                <p className="text-sm text-gray-500 font-semibold">Tiada entry langganan lagi</p>
                <p className="text-xs text-gray-400 mt-1">Klik "Backfill Auto" untuk import langganan sedia ada, atau "Entry Baharu" untuk tambah manual.</p>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-500 font-semibold">Tiada entry padan dengan tapisan</p>
                <button onClick={() => { setCarian(''); setFilterTahun('semua'); setFilterBulan('semua'); setFilterPakej('semua'); setFilterStatus('semua') }}
                  className="mt-2 text-xs text-[#003399] hover:underline font-semibold">Reset penapis</button>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left">Tarikh Bayar</th>
                  <th className="px-3 py-3 text-left">Sekolah</th>
                  <th className="px-3 py-3 text-left hidden md:table-cell">Pakej</th>
                  <th className="px-3 py-3 text-left hidden lg:table-cell">Tempoh</th>
                  <th className="px-3 py-3 text-left hidden md:table-cell">No Rujukan</th>
                  <th className="px-3 py-3 text-center">Status</th>
                  <th className="px-3 py-3 text-right">Jumlah</th>
                  <th className="px-4 py-3 text-right">Tindakan</th>
                </tr>
              </thead>
              <tbody>
                {entriesDipapar.map(e => {
                  const pakejInfo  = PAKEJ_LIST.find(p => p.id === e.pakej)   || { label: '—', warna: 'bg-gray-100 text-gray-500' }
                  const statusInfo = STATUS_LIST.find(s => s.id === e.status) || { label: '—', warna: 'bg-gray-100 text-gray-500', dot: 'bg-gray-400' }
                  const menuBuka = menuTerbuka === e.id
                  return (
                    <tr key={e.id} className="border-b border-gray-50 hover:bg-blue-50/30 transition-colors">
                      <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">{fmtTarikh(e.tarikhBayaran)}</td>
                      <td className="px-3 py-3">
                        <p className="text-xs font-semibold text-gray-800 truncate max-w-[200px]">{sekolahMap[e.schoolId] || e.schoolId}</p>
                        {e.nota && <p className="text-[10px] text-gray-400 truncate max-w-[200px]">{e.nota}</p>}
                      </td>
                      <td className="px-3 py-3 hidden md:table-cell">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${pakejInfo.warna}`}>{pakejInfo.label}</span>
                      </td>
                      <td className="px-3 py-3 hidden lg:table-cell text-[10px] text-gray-500 whitespace-nowrap">
                        {fmtTarikh(e.tarikhMula)} – {fmtTarikh(e.tarikhTamat)}
                      </td>
                      <td className="px-3 py-3 hidden md:table-cell text-[10px] font-mono text-gray-500">{e.noRujukan || '—'}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${statusInfo.warna}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right text-xs font-mono font-bold text-gray-800 whitespace-nowrap">
                        {fmtRM(Number(e.jumlahRM) || 0)}
                      </td>
                      <td className="px-4 py-3 text-right relative">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => cetakResit(e)}
                            title="Cetak resit"
                            className="p-1.5 rounded-md text-[#003399] hover:text-white hover:bg-[#003399] border border-[#003399]/30 hover:border-[#003399] transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </button>
                          <button onClick={ev => { ev.stopPropagation(); setMenuTerbuka(menuBuka ? null : e.id) }}
                            title="Tindakan lain"
                            className={`p-1.5 rounded-md transition-colors ${
                              menuBuka ? 'bg-gray-200 text-gray-800' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
                            }`}>
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <circle cx="5"  cy="12" r="1.6" />
                              <circle cx="12" cy="12" r="1.6" />
                              <circle cx="19" cy="12" r="1.6" />
                            </svg>
                          </button>
                        </div>
                        {menuBuka && (
                          <div onClick={ev => ev.stopPropagation()}
                            className="absolute right-4 top-full mt-1 z-30 w-44 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                            <button onClick={() => { setMenuTerbuka(null); setModalEntry(e) }}
                              className="w-full text-left px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-blue-50 hover:text-blue-700">
                              ✎ Edit
                            </button>
                            {e.status !== 'sah' && (
                              <button onClick={() => { setMenuTerbuka(null); tukarStatus(e, 'sah') }}
                                className="w-full text-left px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-green-50 hover:text-green-700">
                                ✓ Tandakan Sah
                              </button>
                            )}
                            {e.status !== 'menunggu' && (
                              <button onClick={() => { setMenuTerbuka(null); tukarStatus(e, 'menunggu') }}
                                className="w-full text-left px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-amber-50 hover:text-amber-700">
                                ⏳ Tandakan Menunggu
                              </button>
                            )}
                            <div className="border-t border-gray-100" />
                            <button onClick={() => { setMenuTerbuka(null); padamEntry(e) }}
                              className="w-full text-left px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50">
                              🗑 Padam
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td colSpan={6} className="px-4 py-3 text-right text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                    Jumlah Dipapar
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-mono font-black text-[#003399]">
                    {fmtRM(jumlahDipapar)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {modalEntry !== null && (
        <ModalEntry
          entry={modalEntry.id ? modalEntry : null}
          sekolahList={sekolahList}
          onTutup={() => setModalEntry(null)}
          onSimpan={muatEntries}
        />
      )}

      {modalBackfill && (
        <ModalBackfill
          sekolahList={sekolahList}
          onTutup={() => setModalBackfill(false)}
          onSelesai={muatEntries}
        />
      )}

      {modalStatement && (
        <ModalStatement
          sekolahList={sekolahList}
          onCetak={cetakStatement}
          onTutup={() => setModalStatement(false)}
        />
      )}
    </div>
  )
}
