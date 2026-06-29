import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  collection, doc, query, getDocs, getDoc,
  orderBy, limit, onSnapshot, where,
} from 'firebase/firestore'
import { db } from '../firebase/config'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMasa(val) {
  if (!val && val !== 0) return '—'
  const n = Number(val)
  if (isNaN(n) || n === 0) return '—'
  const m = Math.floor(n / 60)
  const s = (n % 60).toFixed(2).padStart(5, '0')
  return m > 0 ? `${m}:${s}` : `${n.toFixed(2)}s`
}

function fmtJarak(val) {
  if (!val && val !== 0) return '—'
  const n = Number(val)
  if (isNaN(n) || n === 0) return '—'
  return `${n.toFixed(2)} m`
}

function masaKeSaat(str) {
  if (!str && str !== 0) return null
  const s = String(str).trim().replace(',', '.')
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s)
  const m = s.match(/^(\d+):(\d{2})(\.\d+)?$/)
  if (m) return parseInt(m[1]) * 60 + parseInt(m[2]) + parseFloat(m[3] || '.0')
  return null
}

function jarakTerbaik(cubaan = []) {
  const valid = (cubaan || []).map(c => parseFloat(c) || 0).filter(v => v > 0)
  return valid.length ? Math.max(...valid) : null
}

function formatTarikh(ts) {
  if (!ts) return '—'
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatTarikhRange(mula, tamat) {
  if (!mula) return '—'
  const opt = { day: 'numeric', month: 'long', year: 'numeric' }
  const dM = new Date(mula + 'T00:00:00')
  if (!tamat || tamat === mula) return dM.toLocaleDateString('ms-MY', opt)
  const dT = new Date(tamat + 'T00:00:00')
  if (dM.getFullYear() === dT.getFullYear() && dM.getMonth() === dT.getMonth())
    return `${dM.getDate()} – ${dT.toLocaleDateString('ms-MY', opt)}`
  return `${dM.toLocaleDateString('ms-MY', { day: 'numeric', month: 'short' })} – ${dT.toLocaleDateString('ms-MY', opt)}`
}

function formatDayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('ms-MY', { weekday: 'long', day: 'numeric', month: 'short' })
}

function isToday(dateStr) {
  const today = new Date()
  const d = new Date(dateStr + 'T00:00:00')
  return d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
}

// ─── KeputusanExpanded ────────────────────────────────────────────────────────

function KeputusanExpanded({ heats, acara, sekolahMap, isLoading }) {
  if (isLoading) return (
    <div className="flex items-center gap-2 px-4 py-4">
      <div className="w-4 h-4 border-2 border-[#003399] border-t-transparent rounded-full animate-spin" />
      <p className="text-xs text-gray-400">Memuatkan…</p>
    </div>
  )
  if (!heats || heats.length === 0)
    return <p className="px-4 py-4 text-xs text-gray-400 italic">Tiada data untuk acara ini.</p>

  const isPadang = ['padang_lompat', 'padang_balin'].includes(acara.jenisAcara)
  const isRelay  = acara.jenisAcara === 'relay'

  const heatsAda    = heats.filter(h => ['rasmi', 'diterima', 'tidak_rasmi'].includes(h.statusKeputusan))
  const finalHeats  = heatsAda.filter(h => ['final', 'terus_final'].includes(h.fasa) || h.peringkat === 'final')
  const displayHeats = finalHeats.length > 0 ? finalHeats : heatsAda
  const showingFinal = finalHeats.length > 0

  // Tunjuk start list jika belum ada keputusan
  if (displayHeats.length === 0) {
    const heatsAdaPeserta = heats.filter(h => (h.peserta || []).length > 0)
    if (heatsAdaPeserta.length === 0)
      return <p className="px-4 py-4 text-xs text-gray-400 italic">Tiada keputusan atau start list.</p>

    return (
      <div className="px-3 py-3 space-y-3">
        {heatsAdaPeserta.map((heat, idx) => (
          <div key={heat.id || idx}>
            {heatsAdaPeserta.length > 1 && (
              <p className="text-[10px] font-bold text-[#003399] uppercase tracking-wide mb-1">
                📋 Heat {heat.noHeat || idx + 1}
              </p>
            )}
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 text-left">
                  <th className="pb-1 w-8">{isPadang ? 'Gil.' : 'Lrg'}</th>
                  {!isRelay && <th className="pb-1 w-10">BIB</th>}
                  <th className="pb-1">Atlet / Pasukan</th>
                </tr>
              </thead>
              <tbody>
                {[...(heat.peserta || [])]
                  .sort((a, b) => isPadang
                    ? (a.giliran || 99) - (b.giliran || 99)
                    : (a.lorong  || 99) - (b.lorong  || 99))
                  .map((p, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-1 font-bold text-center text-[#003399]">
                        {isPadang ? (p.giliran ?? i + 1) : (p.lorong ?? '—')}
                      </td>
                      {!isRelay && <td className="py-1 text-gray-400 text-[10px]">{p.noBib || '—'}</td>}
                      <td className="py-1">
                        {isRelay
                          ? <span className="font-semibold text-gray-800">{p.namaSekolah || sekolahMap?.[p.kodSekolah] || p.kodSekolah || '—'}</span>
                          : <span>
                              <span className="font-semibold text-gray-800">{p.namaAtlet || '—'}</span>
                              <span className="text-gray-400 ml-1 text-[9px]">{p.namaSekolah || sekolahMap?.[p.kodSekolah] || ''}</span>
                            </span>
                        }
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    )
  }

  // Render keputusan
  function renderHeatTable(heat, idx) {
    const isFinal = showingFinal
    const isTerus = finalHeats.length > 0 && heats.filter(h => !['final','terus_final'].includes(h.fasa) && h.peringkat !== 'final').length === 0
    const label = isFinal ? (isTerus ? 'Terus Final' : 'Final') : `Heat ${heat.noHeat || idx + 1}`
    const labelCls = isFinal ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-white text-gray-500 border-gray-200'

    const peserta = [...(heat.peserta || [])].sort((a, b) => {
      const ar = a.kedudukan || a.rankDalamHeat
      const br = b.kedudukan || b.rankDalamHeat
      if (ar && br) return ar - br
      if (ar) return -1; if (br) return 1
      const av = Number(a.keputusan) || 0, bv = Number(b.keputusan) || 0
      if (!av && !bv) return 0
      if (!av) return 1; if (!bv) return -1
      return isPadang ? bv - av : av - bv
    })

    return (
      <div key={heat.id || idx} className="border-b border-gray-100 last:border-b-0">
        <div className="px-3 py-1.5 flex items-center gap-2 bg-gray-50/60 border-b border-gray-100">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${labelCls}`}>{label}</span>
          {isFinal && <span className="text-[9px] font-black tracking-widest uppercase text-teal-600">Keputusan</span>}
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50/30">
              <th className="px-2 py-1.5 text-center w-7">#</th>
              {!isRelay && <th className="px-1.5 py-1.5 text-center w-9">BIB</th>}
              <th className="px-2 py-1.5 text-left">{isRelay ? 'Pasukan' : 'Nama Atlet'}</th>
              {!isRelay && <th className="hidden sm:table-cell px-3 py-1.5 text-left">Sekolah</th>}
              <th className="px-2 py-1.5 text-right">{isPadang ? 'Jarak' : 'Masa'}</th>
            </tr>
          </thead>
          <tbody>
            {peserta.map((p, i) => {
              const flagged = ['DNS', 'DNF', 'DQ'].includes(p.status)
              const kddk    = p.kedudukan || p.rankDalamHeat
              const medal   = isFinal && (kddk === 1 ? '🥇' : kddk === 2 ? '🥈' : kddk === 3 ? '🥉' : null)
              const hasil   = isPadang ? fmtJarak(jarakTerbaik(p.cubaan) || p.keputusan) : fmtMasa(p.keputusan)
              const namaSkl = p.namaSekolah || sekolahMap?.[p.kodSekolah] || p.kodSekolah || '—'
              return (
                <tr key={i} className={`border-t border-gray-50 ${
                  flagged ? 'bg-red-50/30' : kddk === 1 ? 'bg-amber-50/40' : i % 2 === 1 ? 'bg-gray-50/20' : ''
                }`}>
                  <td className="px-2 py-2 text-center">
                    {medal
                      ? <span className="text-sm">{medal}</span>
                      : <span className="text-[10px] text-gray-400 font-bold">{kddk || i + 1}</span>}
                  </td>
                  {!isRelay && (
                    <td className="px-1.5 py-2 text-center font-mono text-gray-500 text-[11px]">{p.noBib || '—'}</td>
                  )}
                  <td className="px-2 py-2">
                    {isRelay
                      ? <p className="font-semibold text-gray-800">{namaSkl}</p>
                      : <div>
                          <p className={`font-semibold ${flagged ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                            {p.namaAtlet || '—'}
                            {flagged && <span className="ml-1 no-underline text-red-500 font-bold"> {p.status}</span>}
                          </p>
                          <p className="sm:hidden text-[9px] text-gray-400 mt-0.5 truncate">{namaSkl}</p>
                        </div>
                    }
                  </td>
                  {!isRelay && (
                    <td className="hidden sm:table-cell px-3 py-2 text-gray-500 text-[11px] max-w-[120px] truncate">{namaSkl}</td>
                  )}
                  <td className={`px-2 py-2 text-right font-mono font-bold text-[11px] ${flagged ? 'text-red-400' : 'text-gray-800'}`}>
                    {flagged ? p.status : (hasil || '—')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      {displayHeats
        .sort((a, b) => (a.noHeat || 0) - (b.noHeat || 0))
        .map((heat, idx) => renderHeatTable(heat, idx))}
    </div>
  )
}

// ─── AcaraTableRow ─────────────────────────────────────────────────────────────

function AcaraTableRow({ acara, isExpanded, onToggle, heats, isLoading, sekolahMap }) {
  const noAcara   = acara.noAcara || '—'
  const hasResult = acara.statusAcara === 'ada_keputusan' || (heats || []).some(h => ['rasmi', 'diterima'].includes(h.statusKeputusan))
  const adaHeat   = (heats || []).some(h => (h.peserta || []).length > 0)

  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer hover:bg-blue-50/40 transition-colors border-b border-gray-100 group">
        <td className="hidden sm:table-cell px-2 py-2.5 text-center font-mono font-black text-[#003399] text-xs">{noAcara}</td>
        <td className="px-2 py-2.5 text-center font-mono font-bold text-gray-700 text-xs">{acara.masa || '—'}</td>
        <td className="px-3 py-2.5 text-left text-xs">
          <p className="font-semibold text-gray-800 leading-snug">{acara.namaAcara || '—'}</p>
          <p className="sm:hidden text-[10px] text-gray-400 mt-0.5">
            <span className="font-mono text-[#003399]">{noAcara}</span>
            {hasResult && <span className="text-teal-600 font-bold"> · KEPUTUSAN</span>}
          </p>
        </td>
        <td className="px-2 py-2.5 text-center text-xs text-gray-500">
          {acara.kategoriKod || ''}{acara.jantina ? `·${acara.jantina}` : ''}
        </td>
        <td className="hidden sm:table-cell px-3 py-2.5 text-left text-[10px]">
          {hasResult
            ? <span className="text-teal-600 font-bold">KEPUTUSAN</span>
            : adaHeat
              ? <span className="text-blue-500 font-semibold">Start List</span>
              : <span className="text-gray-300">—</span>
          }
        </td>
        <td className="px-2 py-2.5 text-center w-7">
          <svg className={`w-3.5 h-3.5 text-gray-300 group-hover:text-gray-400 transition-transform inline-block ${isExpanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={6} className="bg-gray-50 border-b border-gray-200 p-0">
            <KeputusanExpanded heats={heats} acara={acara} sekolahMap={sekolahMap} isLoading={isLoading} />
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Tab Jadual ───────────────────────────────────────────────────────────────

function TabJadual({ schoolId, kejId }) {
  const [acara,       setAcara]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [expandedDays,  setExpandedDays]  = useState(new Set())
  const [expandedAcara, setExpandedAcara] = useState(new Set())
  const [heatCache,   setHeatCache]   = useState({})
  const [heatLoading, setHeatLoading] = useState(new Set())
  const [sekolahMap,  setSekolahMap]  = useState({})

  // Load sekolah map
  useEffect(() => {
    if (!schoolId) return
    getDocs(collection(db, 'tenants', schoolId, 'sekolah'))
      .then(snap => {
        const m = {}
        snap.docs.forEach(d => { m[d.id] = d.data().namaSekolah || d.id })
        setSekolahMap(m)
      }).catch(() => {})
  }, [schoolId])

  // Realtime acara
  useEffect(() => {
    if (!schoolId || !kejId) return
    setLoading(true)
    const unsub = onSnapshot(
      query(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'acara'), orderBy('noAcara')),
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        setAcara(list)
        setLoading(false)
        // Auto-expand hari ini
        const hariMap = {}
        list.forEach(a => { const t = a.tarikhAcara || 'tba'; if (!hariMap[t]) hariMap[t] = true })
        const hariKeys = Object.keys(hariMap).filter(k => k !== 'tba').sort()
        const todayKey = hariKeys.find(k => isToday(k))
        if (todayKey) setExpandedDays(new Set([todayKey]))
        else if (hariKeys.length > 0) setExpandedDays(new Set([hariKeys[0]]))
      },
      () => setLoading(false)
    )
    return () => unsub()
  }, [schoolId, kejId])

  function toggleDay(date) {
    setExpandedDays(prev => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  async function toggleAcara(a) {
    const key = a.id
    setExpandedAcara(prev => {
      const next = new Set(prev)
      if (next.has(key)) { next.delete(key); return next }
      next.add(key)
      return next
    })
    if (heatCache[key]) return
    setHeatLoading(prev => new Set([...prev, key]))
    try {
      const snap = await getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat'))
      const heatsAcara = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(h => (h.aceraId || h.acaraId) === key)
      setHeatCache(prev => ({ ...prev, [key]: heatsAcara }))
    } catch { setHeatCache(prev => ({ ...prev, [key]: [] })) }
    finally { setHeatLoading(prev => { const n = new Set(prev); n.delete(key); return n }) }
  }

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="w-8 h-8 border-[3px] border-[#003399] border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-gray-400">Memuatkan jadual…</p>
    </div>
  )

  // Kumpul ikut hari
  const hariMap = {}
  acara.forEach(a => {
    const t = a.tarikhAcara || 'tba'
    if (!hariMap[t]) hariMap[t] = []
    hariMap[t].push(a)
  })
  const hariKeys = Object.keys(hariMap).filter(k => k !== 'tba').sort()
  if (hariMap['tba']) hariKeys.push('tba')

  if (hariKeys.length === 0) return (
    <div className="bg-white rounded-2xl border border-gray-100 py-12 text-center shadow-sm">
      <p className="text-3xl mb-3">📋</p>
      <p className="text-sm font-semibold text-gray-500">Tiada jadual ditetapkan.</p>
      <p className="text-xs text-gray-400 mt-1">Hubungi Admin untuk set jadual acara.</p>
    </div>
  )

  return (
    <div className="space-y-2">
      {hariKeys.map(date => {
        const isOpen  = expandedDays.has(date)
        const items   = hariMap[date] || []
        const today   = date !== 'tba' && isToday(date)
        const label   = date === 'tba' ? 'Belum Ditetapkan' : formatDayLabel(date)

        return (
          <div key={date} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <button
              onClick={() => toggleDay(date)}
              className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${isOpen ? 'bg-[#003399]' : 'hover:bg-gray-50'}`}>
              <div className="flex items-center gap-2.5">
                {today && !isOpen && <span className="w-2 h-2 rounded-full bg-[#003399] shrink-0" />}
                <div className="text-left">
                  <p className={`text-xs font-black ${isOpen ? 'text-white' : today ? 'text-[#003399]' : 'text-gray-800'}`}>
                    {label}
                    {today && (
                      <span className={`ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isOpen ? 'bg-white/20 text-white' : 'bg-[#003399]/10 text-[#003399]'}`}>
                        HARI INI
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] font-semibold ${isOpen ? 'text-blue-200' : 'text-gray-400'}`}>
                  {items.length} acara
                </span>
                <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180 text-white' : 'text-gray-400'}`}
                  fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {isOpen && (
              <div className="overflow-x-auto border-t border-gray-100">
                <table className="w-full">
                  <thead>
                    <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wide bg-gray-50 border-b border-gray-200">
                      <th className="hidden sm:table-cell px-2 py-2 text-center w-10">No</th>
                      <th className="px-2 py-2 text-center w-12">Masa</th>
                      <th className="px-3 py-2 text-left">Nama Acara</th>
                      <th className="px-2 py-2 text-center w-16">Kelas</th>
                      <th className="hidden sm:table-cell px-3 py-2 text-left">Status</th>
                      <th className="w-7" />
                    </tr>
                  </thead>
                  <tbody>
                    {items
                      .sort((a, b) => (a.masa || '99:99').localeCompare(b.masa || '99:99') || (Number(a.noAcara) || 999) - (Number(b.noAcara) || 999))
                      .map(a => (
                        <AcaraTableRow
                          key={a.id}
                          acara={a}
                          isExpanded={expandedAcara.has(a.id)}
                          onToggle={() => toggleAcara(a)}
                          heats={heatCache[a.id]}
                          isLoading={heatLoading.has(a.id)}
                          sekolahMap={sekolahMap}
                        />
                      ))}
                  </tbody>
                </table>
                <p className="text-center text-[10px] text-gray-300 py-2 border-t border-gray-50">
                  {items.length} acara · Klik baris untuk lihat keputusan
                </p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Tab Keputusan ────────────────────────────────────────────────────────────

function TabKeputusan({ schoolId, kejId }) {
  const [acara,       setAcara]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [expandedAcara, setExpandedAcara] = useState(new Set())
  const [heatCache,   setHeatCache]   = useState({})
  const [heatLoading, setHeatLoading] = useState(new Set())
  const [sekolahMap,  setSekolahMap]  = useState({})

  useEffect(() => {
    if (!schoolId) return
    getDocs(collection(db, 'tenants', schoolId, 'sekolah'))
      .then(snap => {
        const m = {}
        snap.docs.forEach(d => { m[d.id] = d.data().namaSekolah || d.id })
        setSekolahMap(m)
      }).catch(() => {})
  }, [schoolId])

  useEffect(() => {
    if (!schoolId || !kejId) return
    setLoading(true)
    getDocs(query(
      collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'acara'),
      where('statusAcara', '==', 'ada_keputusan'),
      orderBy('noAcara')
    )).then(snap => {
      setAcara(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [schoolId, kejId])

  async function toggleAcara(a) {
    const key = a.id
    setExpandedAcara(prev => {
      const next = new Set(prev)
      if (next.has(key)) { next.delete(key); return next }
      next.add(key)
      return next
    })
    if (heatCache[key]) return
    setHeatLoading(prev => new Set([...prev, key]))
    try {
      const snap = await getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat'))
      const heatsAcara = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(h => (h.aceraId || h.acaraId) === key)
      setHeatCache(prev => ({ ...prev, [key]: heatsAcara }))
    } catch { setHeatCache(prev => ({ ...prev, [key]: [] })) }
    finally { setHeatLoading(prev => { const n = new Set(prev); n.delete(key); return n }) }
  }

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-7 h-7 border-[3px] border-[#003399] border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (acara.length === 0) return (
    <div className="bg-white rounded-2xl border border-gray-100 py-12 text-center shadow-sm">
      <p className="text-3xl mb-3">🏅</p>
      <p className="text-sm font-semibold text-gray-500">Belum ada keputusan diterbitkan.</p>
    </div>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wide bg-gray-50 border-b border-gray-200">
            <th className="hidden sm:table-cell px-2 py-2 text-center w-10">No</th>
            <th className="px-3 py-2 text-left">Nama Acara</th>
            <th className="px-2 py-2 text-center w-16">Kelas</th>
            <th className="w-7" />
          </tr>
        </thead>
        <tbody>
          {acara.map(a => (
            <AcaraTableRow
              key={a.id}
              acara={a}
              isExpanded={expandedAcara.has(a.id)}
              onToggle={() => toggleAcara(a)}
              heats={heatCache[a.id]}
              isLoading={heatLoading.has(a.id)}
              sekolahMap={sekolahMap}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Tab Medal Tally ──────────────────────────────────────────────────────────

function TabMedalTally({ schoolId, kejId }) {
  const [tally,   setTally]   = useState([])
  const [loading, setLoading] = useState(true)
  const unsubRef = useRef(null)

  useEffect(() => {
    if (!schoolId || !kejId) return
    setLoading(true)
    if (unsubRef.current) unsubRef.current()
    unsubRef.current = onSnapshot(
      collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'medal_tally'),
      snap => {
        const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        rows.sort((a, b) => {
          if ((b.emas  || 0) !== (a.emas  || 0)) return (b.emas  || 0) - (a.emas  || 0)
          if ((b.perak || 0) !== (a.perak || 0)) return (b.perak || 0) - (a.perak || 0)
          if ((b.gangsa|| 0) !== (a.gangsa|| 0)) return (b.gangsa|| 0) - (a.gangsa|| 0)
          return (a.namaSekolah || '').localeCompare(b.namaSekolah || '')
        })
        setTally(rows); setLoading(false)
      },
      () => setLoading(false)
    )
    return () => { if (unsubRef.current) unsubRef.current() }
  }, [schoolId, kejId])

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-7 h-7 border-[3px] border-[#003399] border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (tally.length === 0) return (
    <div className="bg-white rounded-2xl border border-gray-100 py-12 text-center shadow-sm">
      <p className="text-3xl mb-3">🏅</p>
      <p className="text-sm font-semibold text-gray-500">Belum ada keputusan final.</p>
    </div>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-3 text-left w-8">#</th>
            <th className="px-4 py-3 text-left">Sekolah / Pasukan</th>
            <th className="px-3 py-3 text-center">🥇</th>
            <th className="px-3 py-3 text-center">🥈</th>
            <th className="px-3 py-3 text-center">🥉</th>
            <th className="px-3 py-3 text-center">Jml</th>
          </tr>
        </thead>
        <tbody>
          {tally.map((t, i) => (
            <tr key={t.id} className={`border-b border-gray-50 ${i === 0 ? 'bg-yellow-50/40' : ''}`}>
              <td className="px-4 py-2.5 text-xs font-bold text-gray-400">{i + 1}</td>
              <td className="px-4 py-2.5 text-xs font-bold text-gray-800">{t.namaSekolah || t.kodSekolah || '—'}</td>
              <td className="px-3 py-2.5 text-center text-sm font-black text-yellow-600">{t.emas   || '—'}</td>
              <td className="px-3 py-2.5 text-center text-sm font-black text-gray-500"> {t.perak  || '—'}</td>
              <td className="px-3 py-2.5 text-center text-sm font-black text-amber-700">{t.gangsa || '—'}</td>
              <td className="px-3 py-2.5 text-center text-xs font-bold text-gray-600">
                {(t.emas || 0) + (t.perak || 0) + (t.gangsa || 0) || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Halaman Utama SchoolLanding ──────────────────────────────────────────────

export default function SchoolLanding() {
  const { slug }  = useParams()
  const navigate  = useNavigate()

  const [sekolah,  setSekolah]  = useState(null)
  const [kej,      setKej]      = useState(null)
  const [allKej,   setAllKej]   = useState([])
  const [tab,      setTab]      = useState('jadual')
  const [status,   setStatus]   = useState('muatTurun')
  const [schoolId, setSchoolId] = useState(null)
  const [stats,    setStats]    = useState({ acara: 0, sekolah: 0, hari: 0 })
  const [cfg,      setCfg]      = useState({ logoKejohananBase64: '', logoPenganjurBase64: '', namaOrganisasi: '' })

  useEffect(() => {
    if (!slug) { setStatus('tidakJumpa'); return }
    const slugBersih = slug.toLowerCase().trim()
    getDoc(doc(db, 'slugIndex', slugBersih))
      .then(async idxSnap => {
        if (!idxSnap.exists()) { setStatus('tidakJumpa'); return }
        const { schoolId: sId, aktif } = idxSnap.data()
        if (aktif === false) { setStatus('tidakAktif'); return }
        setSchoolId(sId)
        const [tenantSnap, kSnap] = await Promise.all([
          getDoc(doc(db, 'tenants', sId)),
          getDocs(query(collection(db, 'tenants', sId, 'kejohanan'), orderBy('createdAt', 'desc'), limit(10))).catch(() => ({ docs: [] })),
        ])
        if (!tenantSnap.exists()) { setStatus('tidakJumpa'); return }
        setSekolah(tenantSnap.data())
        const semuaKej = kSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        setAllKej(semuaKej)
        const aktifKej = semuaKej.find(k => k.statusKejohanan === 'aktif') || semuaKej[0] || null
        setKej(aktifKej)
        setStatus('jumpa')
      })
      .catch(() => setStatus('tidakJumpa'))
  }, [slug])

  // Load tetapan home (logo dll)
  useEffect(() => {
    if (!schoolId) return
    getDoc(doc(db, 'tenants', schoolId, 'tetapan', 'home'))
      .then(s => { if (s.exists()) setCfg(prev => ({ ...prev, ...s.data() })) })
      .catch(() => {})
  }, [schoolId])

  // Load stats bila kej bertukar
  useEffect(() => {
    if (!schoolId || !kej?.id) return
    Promise.all([
      getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kej.id, 'acara')),
      getDocs(collection(db, 'tenants', schoolId, 'sekolah')),
    ]).then(([aSnap, sSnap]) => {
      const acaraList = aSnap.docs.map(d => d.data())
      const hariSet = new Set(acaraList.map(a => a.tarikhAcara).filter(Boolean))
      setStats({ acara: acaraList.length, sekolah: sSnap.size, hari: hariSet.size })
    }).catch(() => {})
  }, [schoolId, kej?.id])

  if (status === 'muatTurun') return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-7 h-7 border-2 border-[#003399] border-t-transparent rounded-full animate-spin"/>
    </div>
  )
  if (status === 'tidakJumpa') return (
    <div className="min-h-screen bg-[#003399] flex flex-col items-center justify-center px-4 text-center">
      <p className="text-5xl mb-4">🔍</p>
      <h1 className="text-xl font-black text-white mb-2">Halaman Tidak Dijumpai</h1>
      <p className="text-sm text-white/50">Pautan <span className="font-mono text-white/70">/{slug}</span> tidak wujud.</p>
      <button onClick={() => navigate('/')} className="mt-6 text-xs font-bold text-white/50 hover:text-white underline">
        Kembali ke laman utama
      </button>
    </div>
  )
  if (status === 'tidakAktif') return (
    <div className="min-h-screen bg-[#003399] flex flex-col items-center justify-center px-4 text-center">
      <p className="text-5xl mb-4">⚠️</p>
      <h1 className="text-xl font-black text-white mb-2">Sistem Ditangguhkan</h1>
      <p className="text-sm text-white/50">Hubungi penganjur untuk maklumat lanjut.</p>
    </div>
  )

  const tarikhMula  = kej?.tarikhMula  || null
  const tarikhTamat = kej?.tarikhTamat || null

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Hero ── */}
      <section className="bg-[#003399] text-white py-8 px-5 text-center">
        {cfg.logoPenganjurBase64 && (
          <div className="flex justify-center mb-3">
            <img src={cfg.logoPenganjurBase64} alt="penganjur" className="h-9 object-contain opacity-90" />
          </div>
        )}
        {cfg.logoKejohananBase64 && (
          <div className="flex justify-center mb-4">
            <img src={cfg.logoKejohananBase64} alt="kejohanan" className="h-20 sm:h-28 object-contain drop-shadow-lg" />
          </div>
        )}
        {cfg.namaOrganisasi && (
          <p className="text-[10px] text-white/50 uppercase tracking-[0.2em] mb-1">{cfg.namaOrganisasi}</p>
        )}
        <h1 className="text-xl sm:text-2xl font-black text-white leading-tight mb-2">
          {kej?.namaKejohanan || sekolah?.namaSekolah || '—'}
        </h1>
        {kej && (
          <div className="flex flex-wrap items-center justify-center gap-2 mb-4 text-[11px]">
            {kej.lokasi && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-white/70">
                📍 {kej.lokasi}
              </span>
            )}
            {tarikhMula && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-white/70">
                📅 {formatTarikhRange(tarikhMula, tarikhTamat)}
              </span>
            )}
            {kej.statusKejohanan === 'aktif' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-500/20 border border-green-400/30 text-green-300 font-bold">
                🟢 Sedang Berlangsung
              </span>
            )}
          </div>
        )}

        {/* Stats inline */}
        {kej && (
          <div className="flex items-center justify-center gap-6 mb-5 text-white/80">
            <div className="text-center">
              <p className="text-xl font-black">{stats.acara || '—'}</p>
              <p className="text-[10px] text-white/40 uppercase tracking-wide">Acara</p>
            </div>
            <div className="w-px h-8 bg-white/15" />
            <div className="text-center">
              <p className="text-xl font-black">{stats.sekolah || '—'}</p>
              <p className="text-[10px] text-white/40 uppercase tracking-wide">Sekolah</p>
            </div>
            <div className="w-px h-8 bg-white/15" />
            <div className="text-center">
              <p className="text-xl font-black">{stats.hari || '—'}</p>
              <p className="text-[10px] text-white/40 uppercase tracking-wide">Hari</p>
            </div>
          </div>
        )}

        {/* Akses Pantas — icon grid compact */}
        {kej && (
          <div className="flex items-center justify-center gap-3 flex-wrap mb-2">
            {[
              {
                tajuk: 'Pengurus Pasukan',
                iconBg: 'bg-blue-50', iconColor: 'text-blue-600',
                onClick: () => navigate(`/${slug}/pengurus`),
                icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>,
              },
              {
                tajuk: 'Jadual Semasa',
                iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600',
                onClick: () => setTab('jadual'),
                icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>,
              },
              {
                tajuk: 'Buku Keputusan',
                iconBg: 'bg-amber-50', iconColor: 'text-amber-600',
                onClick: () => setTab('keputusan'),
                icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>,
              },
              {
                tajuk: 'Kedudukan Pingat',
                iconBg: 'bg-yellow-50', iconColor: 'text-yellow-600',
                onClick: () => setTab('medal'),
                icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" /></svg>,
              },
            ].map(item => (
              <button key={item.tajuk} onClick={item.onClick}
                className="group flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white border border-gray-200 hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 active:scale-95 cursor-pointer w-[72px] sm:w-20">
                <div className={`w-11 h-11 rounded-xl ${item.iconBg} ${item.iconColor} flex items-center justify-center transition-transform group-hover:scale-110`}>
                  {item.icon}
                </div>
                <p className="text-[9px] font-bold text-gray-600 text-center leading-tight">{item.tajuk}</p>
              </button>
            ))}
          </div>
        )}

        {/* Login admin subtle */}
        <div className="mt-4 flex items-center gap-3 max-w-xs mx-auto">
          <div className="h-px flex-1 bg-white/15" />
          <button onClick={() => navigate('/login', { state: { schoolSlug: slug, schoolId, namaSekolah: sekolah?.namaSekolah } })}
            className="text-[10px] text-white/30 hover:text-white/60 transition-colors">
            Login Admin
          </button>
          <div className="h-px flex-1 bg-white/15" />
        </div>
      </section>

      {/* ── Tab bar ── */}
      {kej && (
        <div className="bg-[#003399] border-t border-white/10">
          <div className="max-w-4xl mx-auto flex">
            {[
              { id: 'jadual',    label: '📋 Jadual' },
              { id: 'keputusan', label: '🏅 Keputusan' },
              { id: 'medal',     label: '🏆 Medal Tally' },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex-1 py-3 text-[11px] font-bold transition-colors ${
                  tab === t.id ? 'text-white border-b-2 border-yellow-400' : 'text-white/40 hover:text-white/70'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Kandungan Tab ── */}
      <div className="max-w-4xl mx-auto px-3 py-5">

        {/* Section header */}
        {kej && (
          <div className="flex items-center justify-between mb-4">
            <div className="border-l-4 border-[#003399] pl-3">
              <h2 className="text-base font-black text-gray-800 leading-tight">
                {tab === 'jadual' ? 'Jadual & Keputusan' : tab === 'keputusan' ? 'Keputusan' : 'Kedudukan Pingat'}
              </h2>
            </div>
            <button onClick={() => window.location.reload()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold text-gray-500 hover:text-[#003399] bg-white border border-gray-200 hover:border-[#003399]/30 rounded-xl transition-all shadow-sm">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Kemaskini
            </button>
          </div>
        )}

        {kej && tab === 'jadual'    && <TabJadual     schoolId={schoolId} kejId={kej.id} />}
        {kej && tab === 'keputusan' && <TabKeputusan  schoolId={schoolId} kejId={kej.id} />}
        {kej && tab === 'medal'     && <TabMedalTally schoolId={schoolId} kejId={kej.id} />}

        {!kej && (
          <div className="text-center py-16 px-4">
            <p className="text-4xl mb-3">🏆</p>
            <p className="text-sm font-bold text-gray-700 mb-1">Tiada Kejohanan</p>
            <p className="text-xs text-gray-400">Admin perlu setup kejohanan dahulu.</p>
          </div>
        )}
      </div>

      <p className="text-center text-[10px] text-gray-300 py-8">
        Gold Podium · Pengurusan Kejohanan Sukan
      </p>
    </div>
  )
}
