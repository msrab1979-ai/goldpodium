import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  collection, doc, query, getDocs, getDoc,
  orderBy, limit, onSnapshot, where,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'

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
  const t = new Date()
  const d = new Date(dateStr + 'T00:00:00')
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear()
}

function formatPrestasiRekod(prestasi, unit) {
  if (prestasi == null || prestasi === '') return '—'
  const n = Number(prestasi)
  if (isNaN(n) || n === 0) return '—'
  if (unit === 'm') return `${n.toFixed(2)}m`
  if (n >= 60) { const m = Math.floor(n / 60); return `${m}:${(n % 60).toFixed(2).padStart(5, '0')}` }
  return `${n.toFixed(2)}s`
}

function tahunRekod(tarikhRekod) {
  if (!tarikhRekod) return '—'
  const d = tarikhRekod?.toDate ? tarikhRekod.toDate() : new Date(tarikhRekod)
  return isNaN(d.getFullYear()) ? tarikhRekod : String(d.getFullYear())
}

// ─── LupaPinModal ─────────────────────────────────────────────────────────────

import { hashPin } from '../utils/hashPin'

function genPin6() { return String(Math.floor(100000 + Math.random() * 900000)) }

function LupaPinModal({ schoolId, onClose }) {
  const [kodSekolah, setKodSekolah] = useState('')
  const [email,      setEmail]      = useState('')
  const [newPin,     setNewPin]     = useState(null)
  const [error,      setError]      = useState('')
  const [loading,    setLoading]    = useState(false)

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!kodSekolah.trim()) return setError('Sila masukkan Kod Sekolah.')
    if (!email.trim()) return setError('Sila masukkan E-mel Sekolah.')
    setLoading(true)
    try {
      const snap = await getDoc(doc(db, 'tenants', schoolId, 'sekolah', kodSekolah.trim().toUpperCase()))
      if (!snap.exists()) { setError('Kod Sekolah tidak dijumpai.'); return }
      const data = snap.data()
      if ((data.email || '').toLowerCase().trim() !== email.toLowerCase().trim()) {
        setError('E-mel tidak sepadan dengan rekod sekolah ini.')
        return
      }
      const pin6 = genPin6()
      const ph   = await hashPin(pin6)
      const { updateDoc, serverTimestamp, deleteField } = await import('firebase/firestore')
      await updateDoc(doc(db, 'tenants', schoolId, 'sekolah', kodSekolah.trim().toUpperCase()), {
        pinHash: ph, pin: deleteField(), updatedAt: serverTimestamp(),
      })
      setNewPin(pin6)
    } catch { setError('Ralat sistem. Cuba sebentar lagi.') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white w-full max-w-xs rounded-xl shadow-2xl overflow-hidden">
        <div className="bg-[#003399] px-5 py-4 flex items-center justify-between">
          <p className="text-sm font-bold text-white">Lupa PIN</p>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5">
          {newPin !== null ? (
            <div className="text-center py-2 space-y-3">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <p className="text-xs font-semibold text-gray-700">PIN baru untuk sekolah anda:</p>
              <p className="text-3xl font-black tracking-[0.3em] text-[#003399] font-mono bg-blue-50 rounded-xl py-4 border border-blue-100">{newPin}</p>
              <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Catat PIN ini sekarang. Ia <strong>tidak akan dipaparkan semula</strong> selepas ditutup.
              </p>
              <button onClick={onClose} className="w-full bg-[#003399] text-white font-bold py-2.5 rounded-lg text-xs">
                SAYA SUDAH CATAT — TUTUP
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <p className="text-xs text-gray-500">
                Masukkan Kod Sekolah dan E-mel untuk <strong>jana PIN baru</strong>.
                PIN lama tidak lagi boleh digunakan selepas ini.
              </p>
              {error && <p className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Kod Sekolah</label>
                <input type="text" value={kodSekolah}
                  onChange={e => { setKodSekolah(e.target.value.toUpperCase()); setError('') }}
                  required autoFocus placeholder="cth: KMN-SR-001"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-[#003399]/25 focus:border-[#003399] bg-gray-50" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">E-mel Sekolah</label>
                <input type="email" value={email}
                  onChange={e => { setEmail(e.target.value); setError('') }}
                  required placeholder="sk@moe.edu.my"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/25 focus:border-[#003399] bg-gray-50" />
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-[#003399] hover:bg-[#002277] disabled:bg-gray-300 text-white font-bold py-2.5 rounded-lg text-xs tracking-widest transition-colors">
                {loading ? 'MENYEMAK…' : 'TUNJUK PIN'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── KeputusanExpanded ────────────────────────────────────────────────────────

function KeputusanExpanded({ heats, acara, sekolahMap, isLoading, finalSetup }) {
  if (isLoading) return (
    <div className="flex items-center gap-2 px-4 py-4">
      <div className="w-4 h-4 border-2 border-[#003399] border-t-transparent rounded-full animate-spin" />
      <p className="text-xs text-gray-400">Memuatkan keputusan…</p>
    </div>
  )
  if (!heats || heats.length === 0)
    return <p className="px-4 py-4 text-xs text-gray-400 italic">Tiada keputusan untuk acara ini.</p>

  const isPadang = ['padang_lompat', 'padang_balin'].includes(acara.jenisAcara)
  const isRelay  = acara.jenisAcara === 'relay'
  const isLompatTinggi = /lompat tinggi/i.test(acara.namaAcara || '')

  const heatsAda    = heats.filter(h => ['rasmi', 'diterima', 'tidak_rasmi'].includes(h.statusKeputusan))
  const finalHeats  = heatsAda.filter(h => ['final', 'terus_final'].includes(h.fasa) || h.peringkat === 'final')
  const saringanHeats = heatsAda.filter(h => !['final', 'terus_final'].includes(h.fasa) && h.peringkat !== 'final')
  const showingFinal = finalHeats.length > 0
  const displayHeats = showingFinal ? finalHeats : heatsAda

  const isSaringanAcara = (() => {
    const p = (acara.peringkat || '').toLowerCase()
    const n = (acara.namaAcara || '').toLowerCase()
    return ['saringan', 'suku_akhir', 'separuh_akhir'].includes(p) || n.includes('saringan')
  })()
  const showCatatanCol = (isSaringanAcara || (isRelay && saringanHeats.length > 0)) && !showingFinal

  // Tunjuk start list jika belum ada keputusan
  if (displayHeats.length === 0) {
    const heatsAdaPeserta = heats.filter(h => (h.peserta || []).length > 0)
    if (heatsAdaPeserta.length === 0)
      return <p className="px-4 py-4 text-xs text-gray-400 italic">Tiada keputusan atau start list.</p>

    const colLabel = isPadang ? 'Gil.' : 'Lrg'
    return (
      <div className="px-3 py-3 space-y-3">
        {heatsAdaPeserta.map((heat, idx) => (
          <div key={heat.id || idx}>
            <p className="text-[10px] font-bold text-[#003399] uppercase tracking-wide mb-1">
              📋 Start List {heatsAdaPeserta.length > 1 ? `Heat ${heat.noHeat || idx + 1}` : (acara.parentAcaraId ? 'Final' : 'Heat 1')}
            </p>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 text-left">
                  <th className="pb-1 w-8">{colLabel}</th>
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

  const isTerusFinal = showingFinal && saringanHeats.length === 0
  const heatLabel = showingFinal
    ? (isTerusFinal ? 'Terus Final' : 'Final')
    : saringanHeats.length > 1
      ? `${saringanHeats.length} Heat Saringan`
      : saringanHeats.length === 1 ? 'Saringan' : 'Heat'

  function renderHeatTable(heat, heatPeserta, labelOverride) {
    const isFinalHeat = heat.peringkat === 'final' || heat.fasa === 'final' || heat.fasa === 'terus_final'
    const label    = labelOverride || (isFinalHeat ? 'Final' : `Heat ${heat.noHeat}`)
    const labelCls = isFinalHeat ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-white text-gray-500 border-gray-200'

    return (
      <div key={heat.id || heat.heatId} className="border-b border-gray-100 last:border-b-0">
        <div className="px-3 py-1.5 flex items-center gap-2 bg-gray-50/60 border-b border-gray-100">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${labelCls}`}>{label}</span>
          {isFinalHeat && <span className="text-[9px] font-black tracking-widest uppercase text-teal-600">Keputusan</span>}
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50/30">
              <th className="px-2 py-1.5 text-center w-7">#</th>
              {!isRelay && <th className="px-1.5 py-1.5 text-center w-9">BIB</th>}
              <th className="px-2 py-1.5 text-left">{isRelay ? 'Pasukan' : 'Nama Atlet'}</th>
              {!isRelay && <th className="hidden sm:table-cell px-3 py-1.5 text-left">Sekolah</th>}
              <th className="px-2 py-1.5 text-right">{isPadang ? 'Jarak' : 'Masa Rasmi'}</th>
              {showCatatanCol && <th className="px-1.5 py-1.5 text-center w-8">Q</th>}
            </tr>
          </thead>
          <tbody>
            {heatPeserta.map((p, idx) => {
              const flagged = ['DNS', 'DNF', 'DQ'].includes(p.status)
              const _ked    = (p.kedudukan === 'undefined' || p.kedudukan === '') ? null : p.kedudukan
              const _rank   = (p.rankDalamHeat === 'undefined' || p.rankDalamHeat === '') ? null : p.rankDalamHeat
              const kddk    = isLompatTinggi ? _ked : (_ked || _rank)
              const hasilBundar = isPadang ? fmtJarak(p.keputusan) : fmtMasa(p.keputusan)
              const medal   = isFinalHeat && (kddk === 1 ? '🥇' : kddk === 2 ? '🥈' : kddk === 3 ? '🥉' : null)
              const namaSkl = p.namaSekolah || sekolahMap?.[p.kodSekolah] || p.kodSekolah || '—'
              return (
                <tr key={idx} className={`border-t border-gray-50 ${
                  flagged    ? 'bg-red-50/30' :
                  kddk === 1 ? 'bg-amber-50/40' :
                  idx % 2 === 1 ? 'bg-gray-50/20' : ''
                }`}>
                  <td className="px-2 py-2 text-center">
                    {medal
                      ? <span className="text-sm">{medal}</span>
                      : <span className="text-[10px] text-gray-400 font-bold">{kddk || (idx + 1)}</span>}
                  </td>
                  {!isRelay && (
                    <td className="px-1.5 py-2 text-center font-mono text-gray-500 text-[11px]">{p.noBib || '—'}</td>
                  )}
                  <td className="px-2 py-2">
                    {isRelay
                      ? <div className="flex items-center gap-1.5">
                          <p className="font-semibold text-gray-800">{namaSkl}</p>
                          {p.pecahRekod && (
                            <span className="shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded bg-amber-400 text-white tracking-wide">RBK</span>
                          )}
                          {p.samaiRekod && (
                            <span className="shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded bg-teal-500 text-white tracking-wide">MRKL</span>
                          )}
                        </div>
                      : <div>
                          <div className="flex items-center gap-1.5">
                            <p className={`font-semibold ${flagged ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                              {p.namaAtlet || '—'}
                              {flagged && <span className="ml-1 no-underline text-red-500 font-bold"> {p.status}</span>}
                            </p>
                            {p.pecahRekod && (
                              <span className="shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded bg-amber-400 text-white tracking-wide">RBK</span>
                            )}
                            {p.samaiRekod && (
                              <span className="shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded bg-teal-500 text-white tracking-wide">MRKL</span>
                            )}
                          </div>
                          <p className="sm:hidden text-[9px] text-gray-400 mt-0.5 truncate">{namaSkl}</p>
                        </div>
                    }
                  </td>
                  {!isRelay && (
                    <td className="hidden sm:table-cell px-3 py-2 text-gray-500 text-[11px] max-w-[120px] truncate">{namaSkl}</td>
                  )}
                  <td className={`px-2 py-2 text-right font-mono font-bold text-[11px] ${flagged ? 'text-red-400' : 'text-gray-800'}`}>
                    {flagged ? p.status : (hasilBundar || '—')}
                  </td>
                  {showCatatanCol && <td className="px-1.5 py-2 text-center" />}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  const renderContent = () => {
    if (showingFinal) {
      const finalHeat = finalHeats[0]
      const peserta = [...(finalHeat?.peserta || [])].sort((a, b) => {
        const ar = isLompatTinggi ? a.kedudukan : (a.kedudukan || a.rankDalamHeat)
        const br = isLompatTinggi ? b.kedudukan : (b.kedudukan || b.rankDalamHeat)
        if (ar && br) return ar - br
        if (ar) return -1; if (br) return 1
        const av = Number(a.keputusan) || 0, bv = Number(b.keputusan) || 0
        return isPadang ? bv - av : av - bv
      })
      return renderHeatTable(finalHeat, peserta, isTerusFinal ? 'Terus Final' : 'Final')
    }
    return displayHeats
      .sort((a, b) => (a.noHeat || 0) - (b.noHeat || 0))
      .map(heat => {
        const peserta = [...(heat.peserta || [])].sort((a, b) => {
          const ar = a.rankDalamHeat, br = b.rankDalamHeat
          if (ar && br) return ar - br
          if (ar) return -1; if (br) return 1
          const av = Number(a.keputusan) || 0, bv = Number(b.keputusan) || 0
          return isPadang ? bv - av : av - bv
        })
        return renderHeatTable(heat, peserta)
      })
  }

  return (
    <div className="overflow-x-auto">
      <div className="px-3 py-1.5 border-b border-gray-100 flex items-center gap-2 bg-gray-50/60">
        <span className="text-[9px] font-bold text-gray-400 bg-white border border-gray-200 px-1.5 py-0.5 rounded">{heatLabel}</span>
        <span className="text-[9px] font-black tracking-widest uppercase text-teal-600">Keputusan</span>
      </div>
      {renderContent()}
    </div>
  )
}

// ─── AcaraTableRow ────────────────────────────────────────────────────────────

function AcaraTableRow({ item, isExpanded, onToggle, heats, isLoading, sekolahMap, kategoriMap }) {
  const { acara, masaMula } = item
  const noAcara      = acara.noAcara || acara.id || '—'
  const status       = acara.statusAcara || 'akan_datang'
  const hasResult    = ['ada_keputusan', 'rasmi', 'tidak_rasmi'].includes(status)
  const adaHeat      = (heats || []).some(h => (h.peserta || []).length > 0)
  const peringkatRaw = (acara.peringkat || '').toLowerCase()
  const namaRaw      = (acara.namaAcara || '').toLowerCase()
  const peringkatLabel = (() => {
    if (peringkatRaw.includes('saringan') || namaRaw.includes('saringan')) return 'Saringan'
    if (peringkatRaw.includes('akhir') || namaRaw.includes('akhir'))       return 'Akhir'
    if (peringkatRaw.includes('final') || namaRaw.includes('final'))       return 'Final'
    if (peringkatRaw.includes('separuh'))                                   return 'S/Akhir'
    return ''
  })()

  const umurHad = kategoriMap?.[acara.kategoriKod]?.umurHad
  const kelasLabel = umurHad
    ? `${acara.jantina || ''}${umurHad}`
    : `${acara.jantina || ''}${acara.kategoriKod || ''}` || '—'

  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer hover:bg-blue-50/40 transition-colors border-b border-gray-100 group">
        <td className="hidden sm:table-cell px-2 py-2.5 text-center font-mono font-black text-[#003399] text-xs">{noAcara}</td>
        <td className="px-2 py-2.5 text-center font-mono font-bold text-gray-700 text-xs">{masaMula || acara.masa || '—'}</td>
        <td className="px-3 py-2.5 text-left text-xs">
          <p className="font-semibold text-gray-800 leading-snug">{acara.namaAcara || '—'}</p>
          <p className="sm:hidden text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
            <span className="font-mono text-[#003399]">{noAcara}</span>
            {hasResult && <span className="text-teal-600 font-bold">· KEPUTUSAN</span>}
          </p>
        </td>
        <td className="px-2 py-2.5 text-center text-gray-600 text-xs">{kelasLabel}</td>
        <td className="hidden sm:table-cell px-2 py-2.5 text-center text-xs">
          <span className={`font-semibold ${
            peringkatLabel === 'Saringan' ? 'text-blue-500' :
            peringkatLabel === 'Akhir' || peringkatLabel === 'Final' ? 'text-green-600' :
            peringkatLabel === 'S/Akhir' ? 'text-purple-500' : 'text-gray-400'
          }`}>{peringkatLabel || '—'}</span>
        </td>
        <td className="hidden sm:table-cell px-3 py-2.5 text-left text-[10px]">
          {hasResult
            ? <span className="text-teal-600 font-bold cursor-pointer hover:underline">KEPUTUSAN</span>
            : adaHeat
              ? <span className="text-blue-500 font-semibold">Start List</span>
              : <span className="text-gray-300">—</span>}
        </td>
        <td className="px-2 py-2.5 text-center w-7">
          <svg className={`w-3.5 h-3.5 text-gray-300 group-hover:text-gray-400 transition-transform duration-150 inline-block ${isExpanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={7} className="bg-gray-50 border-b border-gray-200 p-0">
            <KeputusanExpanded heats={heats} acara={acara} sekolahMap={sekolahMap} isLoading={isLoading} />
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Tab Medal Tally ──────────────────────────────────────────────────────────

const PALETTE = ['#003399','#166534','#7c3aed','#b45309','#0e7490','#9f1239','#374151']

function sortAndRankRows(rows) {
  rows.sort((a, b) => {
    if (b.emas   !== a.emas)   return b.emas   - a.emas
    if (b.perak  !== a.perak)  return b.perak  - a.perak
    if (b.gangsa !== a.gangsa) return b.gangsa - a.gangsa
    return (a.namaSekolah || '').localeCompare(b.namaSekolah || '')
  })
  let curR = 0
  return rows.map((r, i, arr) => {
    if (i === 0) { curR = 1; return { ...r, rank: 1 } }
    const prev = arr[i - 1]
    const tie  = ['emas','perak','gangsa'].every(k => r[k] === prev[k])
    if (!tie) curR++
    return { ...r, rank: curR }
  })
}

function TabMedalTally({ schoolId, kejId, bilKed = 3 }) {
  const [allRows,   setAllRows]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [openGrps,  setOpenGrps]  = useState(new Set())
  const [jenisList, setJenisList] = useState([])
  const unsubRef  = useRef(null)
  const unsubRef2 = useRef(null)

  useEffect(() => {
    if (!schoolId) return
    getDoc(doc(db, 'tenants', schoolId, 'tetapan', 'jenisSekolah'))
      .then(s => setJenisList(s.exists() ? (s.data().list || []) : []))
      .catch(() => setJenisList([]))
  }, [schoolId])

  useEffect(() => {
    if (!schoolId || !kejId) return
    setLoading(true)
    if (unsubRef.current)  unsubRef.current()
    if (unsubRef2.current) unsubRef2.current()

    let medalMap    = {}
    let sekolahMap  = {}
    let medalReady  = false
    let sekolahReady = false

    function merge() {
      // Tunggu kedua-dua listeners ready dulu baru render
      if (!medalReady || !sekolahReady) return
      const allKod = new Set([...Object.keys(sekolahMap), ...Object.keys(medalMap)])
      const rows = [...allKod].map(kod => ({
        id:          kod,
        kodSekolah:  kod,
        namaSekolah: sekolahMap[kod]?.namaSekolah || medalMap[kod]?.namaSekolah || kod,
        kategori:    sekolahMap[kod]?.kategori    || 'Lain-lain',
        emas:        medalMap[kod]?.emas    || 0,
        perak:       medalMap[kod]?.perak   || 0,
        gangsa:      medalMap[kod]?.gangsa  || 0,
        tempat4:     medalMap[kod]?.tempat4 || 0,
        tempat5:     medalMap[kod]?.tempat5 || 0,
      }))
      setAllRows(rows)
      setLoading(false)
    }

    unsubRef.current = onSnapshot(
      collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'medal_tally'),
      snap => {
        medalMap = {}
        snap.docs.forEach(d => { medalMap[d.data().kodSekolah || d.id] = d.data() })
        medalReady = true
        merge()
      },
      () => setLoading(false)
    )

    unsubRef2.current = onSnapshot(
      collection(db, 'tenants', schoolId, 'sekolah'),
      snap => {
        sekolahMap = {}
        snap.docs.forEach(d => {
          const data = d.data()
          sekolahMap[d.id] = { kodSekolah: d.id, namaSekolah: data.namaSekolah || d.id, kategori: data.kategori || 'Lain-lain' }
        })
        sekolahReady = true
        merge()
      },
      () => { sekolahReady = true; merge() }
    )

    return () => {
      if (unsubRef.current)  unsubRef.current()
      if (unsubRef2.current) unsubRef2.current()
    }
  }, [schoolId, kejId])

  const RANK_STYLE = {
    1: { row: 'bg-yellow-50/60 border-l-4 border-l-yellow-400', badge: 'bg-yellow-400 text-white' },
    2: { row: 'bg-gray-50/60  border-l-4 border-l-gray-300',   badge: 'bg-gray-300  text-white' },
    3: { row: 'bg-orange-50/60 border-l-4 border-l-orange-300', badge: 'bg-orange-300 text-white' },
  }

  function toggleGrp(kat) {
    setOpenGrps(prev => {
      const next = new Set(prev)
      if (next.has(kat)) next.delete(kat)
      else next.add(kat)
      return next
    })
  }

  function renderTable(rows, bilKed) {
    return (
      <div className="overflow-x-auto border-t border-gray-100">
        <table className="w-full">
          <thead>
            <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wide bg-gray-50 border-b border-gray-200">
              <th className="hidden sm:table-cell px-3 py-2.5 text-center w-10">No.</th>
              <th className="px-3 py-2.5 text-left">Nama Sekolah</th>
              <th className="px-2 py-2.5 text-center w-10" title="Emas"><span className="inline-block w-3.5 h-3.5 rounded-full bg-yellow-400 border border-yellow-500" /></th>
              <th className="px-2 py-2.5 text-center w-10" title="Perak"><span className="inline-block w-3.5 h-3.5 rounded-full bg-gray-300 border border-gray-400" /></th>
              <th className="px-2 py-2.5 text-center w-10" title="Gangsa"><span className="inline-block w-3.5 h-3.5 rounded-full bg-orange-300 border border-orange-400" /></th>
              {bilKed >= 4 && <th className="hidden sm:table-cell px-2 py-2.5 text-center w-10 text-gray-400">T4</th>}
              {bilKed >= 5 && <th className="hidden sm:table-cell px-2 py-2.5 text-center w-10 text-gray-400">T5</th>}
              <th className="px-3 py-2.5 text-center w-12">Jml</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(t => {
              const rs     = RANK_STYLE[t.rank] || {}
              const jumlah = (t.emas||0)+(t.perak||0)+(t.gangsa||0)+(bilKed>=4?t.tempat4||0:0)+(bilKed>=5?t.tempat5||0:0)
              return (
                <tr key={t.id} className={`border-b border-gray-50 ${rs.row || ''}`}>
                  <td className="hidden sm:table-cell px-3 py-3 text-center">
                    {t.rank <= 3
                      ? <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black ${rs.badge}`}>{t.rank}</span>
                      : <span className="text-[10px] font-bold text-gray-400">{t.rank}</span>}
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-semibold text-xs text-gray-800">{t.namaSekolah || t.kodSekolah}</p>
                    <p className="text-[9px] text-gray-300 font-mono mt-0.5">{t.kodSekolah}</p>
                  </td>
                  <td className="px-2 py-3 text-center"><span className={`text-sm font-black ${(t.emas||0)>0?'text-yellow-600':'text-gray-200'}`}>{t.emas||0}</span></td>
                  <td className="px-2 py-3 text-center"><span className={`text-sm font-black ${(t.perak||0)>0?'text-gray-500':'text-gray-200'}`}>{t.perak||0}</span></td>
                  <td className="px-2 py-3 text-center"><span className={`text-sm font-black ${(t.gangsa||0)>0?'text-orange-600':'text-gray-200'}`}>{t.gangsa||0}</span></td>
                  {bilKed >= 4 && <td className="hidden sm:table-cell px-2 py-3 text-center"><span className={`text-sm font-black ${(t.tempat4||0)>0?'text-blue-400':'text-gray-200'}`}>{t.tempat4||0}</span></td>}
                  {bilKed >= 5 && <td className="hidden sm:table-cell px-2 py-3 text-center"><span className={`text-sm font-black ${(t.tempat5||0)>0?'text-purple-400':'text-gray-200'}`}>{t.tempat5||0}</span></td>}
                  <td className="px-3 py-3 text-center"><span className={`text-xs font-black ${jumlah>0?'text-gray-700':'text-gray-200'}`}>{jumlah}</span></td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-200">
              <td className="hidden sm:table-cell" />
              <td className="px-3 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wide">{rows.length} sekolah</td>
              <td className="px-2 py-2 text-center text-xs font-black text-yellow-600">{rows.reduce((s,t)=>s+(t.emas||0),0)}</td>
              <td className="px-2 py-2 text-center text-xs font-black text-gray-500">{rows.reduce((s,t)=>s+(t.perak||0),0)}</td>
              <td className="px-2 py-2 text-center text-xs font-black text-orange-600">{rows.reduce((s,t)=>s+(t.gangsa||0),0)}</td>
              {bilKed >= 4 && <td className="hidden sm:table-cell px-2 py-2 text-center text-xs font-black text-blue-400">{rows.reduce((s,t)=>s+(t.tempat4||0),0)}</td>}
              {bilKed >= 5 && <td className="hidden sm:table-cell px-2 py-2 text-center text-xs font-black text-purple-400">{rows.reduce((s,t)=>s+(t.tempat5||0),0)}</td>}
              <td className="px-3 py-2 text-center text-xs font-black text-gray-600">
                {rows.reduce((s,t)=>s+(t.emas||0)+(t.perak||0)+(t.gangsa||0)+(bilKed>=4?t.tempat4||0:0)+(bilKed>=5?t.tempat5||0:0),0)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    )
  }

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-7 h-7 border-[3px] border-[#003399] border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (allRows.length === 0) return (
    <div className="bg-white rounded-2xl border border-gray-100 py-12 text-center shadow-sm">
      <p className="text-3xl mb-3">🏆</p>
      <p className="text-sm font-semibold text-gray-500">Tiada sekolah berdaftar.</p>
    </div>
  )

  // Kumpul kategori unik — ikut jenisList (dari tetapan), lain-lain di bawah
  const allKat     = [...new Set(allRows.map(r => r.kategori || 'Lain-lain'))]
  const katOrdered = [
    ...jenisList.filter(k => allKat.includes(k)),
    ...allKat.filter(k => !jenisList.includes(k)).sort(),
  ]
  const isPisah = katOrdered.length > 1

  return (
    <div className="space-y-2">
      {katOrdered.map((kat, idx) => {
        const rows    = sortAndRankRows(allRows.filter(r => (r.kategori || 'Lain-lain') === kat))
        if (rows.length === 0) return null
        const warna   = PALETTE[idx % PALETTE.length]
        const cfg     = { warna, label: kat }
        const isOpen  = openGrps.has(kat)
        const top1    = rows[0]
        const hasAny  = rows.some(r => (r.emas||0)+(r.perak||0)+(r.gangsa||0) > 0)
        return (
          <div key={kat} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <button
              onClick={() => toggleGrp(kat)}
              className="w-full flex items-center justify-between px-4 py-3 transition-colors hover:opacity-90"
              style={isOpen ? { backgroundColor: cfg.warna } : {}}
            >
              <div className="flex items-center gap-2.5">
                {!isOpen && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cfg.warna }} />}
                <div className="text-left">
                  <p className="text-xs font-black" style={{ color: isOpen ? '#fff' : cfg.warna }}>
                    {isPisah ? cfg.label : 'Kedudukan Pingat'}
                  </p>
                  {!isOpen && (
                    <p className="text-[9px] text-gray-400 mt-0.5">
                      {rows.length} sekolah
                      {hasAny && top1 && <span className="ml-1.5">· {top1.namaSekolah?.split(' ').slice(0,2).join(' ')} {top1.emas > 0 ? `🥇${top1.emas}` : ''}</span>}
                      {!hasAny && <span className="ml-1 text-gray-300">· Belum ada pingat</span>}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isOpen && <span className="text-[10px] font-semibold text-white/70">{rows.length} sekolah</span>}
                <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180 text-white' : 'text-gray-400'}`}
                  fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>
            {isOpen && renderTable(rows, bilKed)}
          </div>
        )
      })}
    </div>
  )
}

// ─── SchoolLanding ────────────────────────────────────────────────────────────

export default function SchoolLanding() {
  const { slug }   = useParams()
  const navigate   = useNavigate()

  const [sekolah,  setSekolah]  = useState(null)
  const [kej,      setKej]      = useState(null)
  const [schoolId, setSchoolId] = useState(null)
  const [status,   setStatus]   = useState('muatTurun')
  const [stats,    setStats]    = useState({ acara: 0, sekolah: 0, hari: 0 })

  // Tetapan + logo
  const [cfg, setCfg] = useState({
    logoKiriBase64: '', logoKananBase64: '', logoKejohananBase64: '',
    logoPenganjurBase64: '', namaOrganisasi: '', namaAgensi: '',
    namaSistem: '', galeri: { aktif: false, url: '' },
    bukuKejohananLink: { aktif: false, url: '' },
    bukuProgram: { aktif: false, url: '' },
  })

  // Jadual & keputusan
  const [activeTab,      setActiveTab]      = useState('jadual')
  const [acara,          setAcara]          = useState([])
  const [jadualLoading,  setJadualLoading]  = useState(false)
  const [expandedDays,   setExpandedDays]   = useState(new Set())
  const [expandedAcara,  setExpandedAcara]  = useState(new Set())
  const [heatCache,      setHeatCache]      = useState({})
  const [heatLoading,    setHeatLoading]    = useState(new Set())
  const [sekolahMap,     setSekolahMap]     = useState({})
  const [kategoriMap,    setKategoriMap]    = useState({})
  const [filterKombo,    setFilterKombo]    = useState('semua')

  // Rekod
  const [rekodAll,        setRekodAll]        = useState([])
  const [rekodAllLoading, setRekodAllLoading] = useState(false)
  const [rekodAllLoaded,  setRekodAllLoaded]  = useState(false)
  const [activePeringkatRekod, setActivePeringkatRekod] = useState('D')
  const [activeKatRekod,  setActiveKatRekod]  = useState('')

  // UI modals
  const [staffModal,    setStaffModal]    = useState(false)
  const [lupaPinModal,  setLupaPinModal]  = useState(false)
  const [printingPdf,   setPrintingPdf]   = useState(false)

  // Pencatat login
  const { loginPencatat } = useAuth()
  const [showPencatatForm, setShowPencatatForm] = useState(false)
  const [pencatatKod,      setPencatatKod]      = useState('')
  const [pencatatPin,      setPencatatPin]      = useState('')
  const [pencatatErr,      setPencatatErr]      = useState('')
  const [pencatatLoading,  setPencatatLoading]  = useState(false)

  async function handlePencatatLogin(e) {
    e.preventDefault()
    setPencatatErr('')
    if (!pencatatKod.trim()) return setPencatatErr('Kod akses diperlukan.')
    if (!pencatatPin) return setPencatatErr('PIN diperlukan.')
    setPencatatLoading(true)
    try {
      await loginPencatat(slug, pencatatKod.trim(), pencatatPin)
      navigate('/dashboard')
    } catch (err) {
      setPencatatErr(err.message || 'Log masuk gagal.')
    } finally {
      setPencatatLoading(false)
    }
  }

  // ── Resolve slug → schoolId ──
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
        const aktifKej = semuaKej.find(k => k.statusKejohanan === 'aktif') || semuaKej[0] || null
        setKej(aktifKej)
        setStatus('jumpa')
      })
      .catch(() => setStatus('tidakJumpa'))
  }, [slug])

  // ── Tetapan home (logo, galeri, buku) ──
  useEffect(() => {
    if (!schoolId) return
    const unsub = onSnapshot(
      doc(db, 'tenants', schoolId, 'tetapan', 'home'),
      s => { if (s.exists()) setCfg(prev => ({ ...prev, ...s.data() })) },
      () => {}
    )
    return () => unsub()
  }, [schoolId])

  // ── Load sekolah map + kategori sekali ──
  useEffect(() => {
    if (!schoolId) return
    getDocs(collection(db, 'tenants', schoolId, 'sekolah'))
      .then(snap => {
        const m = {}
        snap.docs.forEach(d => { m[d.id] = d.data().namaSekolah || d.id })
        setSekolahMap(m)
      }).catch(() => {})
    getDocs(collection(db, 'tenants', schoolId, 'kejohanan',
      // kategori bawah tenant terus (jika ada) — fallback ikut acara doc
      ...([] /* noop — kategori akan di-resolve via acara doc */)))
      .catch(() => {})
  }, [schoolId])

  // ── Load acara realtime bila kej bertukar ──
  useEffect(() => {
    if (!schoolId || !kej?.id) return
    setJadualLoading(true)
    const unsub = onSnapshot(
      query(collection(db, 'tenants', schoolId, 'kejohanan', kej.id, 'acara'), orderBy('noAcara')),
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        setAcara(list)
        setJadualLoading(false)
        // Build kategori map dari data acara
        const kMap = {}
        list.forEach(a => {
          if (a.kategoriKod && !kMap[a.kategoriKod]) {
            kMap[a.kategoriKod] = { umurHad: a.umurHad || a.hadUmur || null, nama: a.kategoriKod }
          }
        })
        setKategoriMap(kMap)
        // Auto-expand hari ini atau hari pertama
        const hariKeys = [...new Set(list.map(a => a.tarikhAcara).filter(Boolean))].sort()
        const todayKey = hariKeys.find(k => isToday(k))
        if (todayKey) setExpandedDays(new Set([todayKey]))
        else if (hariKeys.length > 0) setExpandedDays(new Set([hariKeys[0]]))
      },
      () => setJadualLoading(false)
    )
    return () => unsub()
  }, [schoolId, kej?.id])

  // ── Load stats ──
  useEffect(() => {
    if (!schoolId || !kej?.id) return
    getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kej.id, 'acara'))
      .then(aSnap => {
        const list = aSnap.docs.map(d => d.data())
        const hariSet = new Set(list.map(a => a.tarikhAcara).filter(Boolean))
        setStats({ acara: list.length, sekolah: Object.keys(sekolahMap).length, hari: hariSet.size })
      }).catch(() => {})
  }, [schoolId, kej?.id, sekolahMap])

  // ── Toggle acara expand + load heat ──
  async function toggleAcara(a) {
    const key = a.id
    setExpandedAcara(prev => {
      const next = new Set(prev)
      if (next.has(key)) { next.delete(key); return next }
      next.add(key)
      return next
    })
    if (heatCache[key] !== undefined) return
    setHeatLoading(prev => new Set([...prev, key]))
    try {
      const snap = await getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kej.id, 'heat'))
      const heatsAcara = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(h => (h.aceraId || h.acaraId) === key)
        .sort((a, b) => (a.noHeat ?? 0) - (b.noHeat ?? 0))
      setHeatCache(prev => ({ ...prev, [key]: heatsAcara }))
    } catch { setHeatCache(prev => ({ ...prev, [key]: [] })) }
    finally { setHeatLoading(prev => { const n = new Set(prev); n.delete(key); return n }) }
  }

  // ── Load rekod kejohanan ──
  async function loadRekodAll() {
    if (rekodAllLoaded || !schoolId || !kej?.id) return
    setRekodAllLoading(true)
    try {
      const snap = await getDocs(collection(db, 'tenants', schoolId, 'rekod_sejarah'))
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(r => r.statusRekod === 'aktif')
        .sort((a, b) => (a.namaAcara || '').localeCompare(b.namaAcara || ''))
      setRekodAll(list)
      setRekodAllLoaded(true)
      if (list.length > 0) {
        const firstGroup = [...new Set(list.map(r => {
          const j = r.jantina?.trim().toUpperCase() || ''
          const k = r.kategoriKod?.trim().toUpperCase() || ''
          return j && k ? `${j}_${k}` : null
        }).filter(Boolean))].sort()[0]
        if (firstGroup) setActiveKatRekod(firstGroup)
      }
    } catch { } finally { setRekodAllLoading(false) }
  }

  // ── PDF Jadual ──
  async function cetakJadualPDF() {
    if (!acara.length) return
    setPrintingPdf(true)
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'), import('jspdf-autotable'),
      ])
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const namaKej = kej?.namaKejohanan || sekolah?.namaSekolah || 'Kejohanan Olahraga'
      pdf.setFontSize(15); pdf.setFont(undefined, 'bold'); pdf.setTextColor(0, 51, 153)
      pdf.text('JADUAL ACARA', 148, 14, { align: 'center' })
      pdf.setFontSize(10); pdf.setTextColor(30, 30, 30)
      pdf.text(namaKej.toUpperCase(), 148, 21, { align: 'center' })
      pdf.setFontSize(7); pdf.setTextColor(180)
      pdf.text(`Dicetak: ${new Date().toLocaleString('ms-MY')}`, 14, 202)
      pdf.setTextColor(0)
      const hariMap = {}
      acara.forEach(a => {
        const t = a.tarikhAcara || 'tba'
        if (!hariMap[t]) hariMap[t] = []
        hariMap[t].push(a)
      })
      const hariKeys = Object.keys(hariMap).sort()
      let startY = 32, isFirst = true
      for (const date of hariKeys) {
        const items = hariMap[date] || []
        if (!isFirst) { pdf.addPage(); startY = 14 }
        isFirst = false
        autoTable(pdf, {
          startY,
          head: [[{ content: formatDayLabel(date).toUpperCase() + `  (${items.length} acara)`, colSpan: 6,
            styles: { halign: 'left', fillColor: [0, 51, 153], textColor: 255, fontStyle: 'bold', fontSize: 10 } }]],
          body: [], margin: { left: 14, right: 14 },
          styles: { cellPadding: { top: 4, bottom: 4, left: 5, right: 5 } }, theme: 'plain',
        })
        const tableBody = items
          .sort((a, b) => (a.masa || '99:99').localeCompare(b.masa || '99:99') || (Number(a.noAcara) || 999) - (Number(b.noAcara) || 999))
          .map(a => {
            const umurHad = kategoriMap[a.kategoriKod]?.umurHad
            const kelas = umurHad ? `${a.jantina || ''}${umurHad}` : `${a.jantina || ''}${a.kategoriKod || ''}` || '—'
            return [a.noAcara || '—', a.masa || '—', a.namaAcara || '—', kelas,
              a.peringkat === 'saringan' ? 'Saringan' : a.parentAcaraId ? 'Final' : '—', a.lokasi || '—']
          })
        autoTable(pdf, {
          startY: pdf.lastAutoTable.finalY,
          head: [['No', 'Masa', 'Nama Acara', 'Kelas', 'Peringkat', 'Lokasi']],
          body: tableBody, margin: { left: 14, right: 14 },
          headStyles: { fillColor: [230, 236, 255], textColor: [0, 51, 153], fontStyle: 'bold', fontSize: 8.5 },
          styles: { fontSize: 9, cellPadding: 2.5 },
          alternateRowStyles: { fillColor: [248, 250, 255] },
          columnStyles: { 0: { cellWidth: 12, halign: 'center' }, 1: { cellWidth: 18, halign: 'center' },
            2: { cellWidth: 'auto' }, 3: { cellWidth: 16, halign: 'center' },
            4: { cellWidth: 27, halign: 'center' }, 5: { cellWidth: 42 } },
        })
      }
      const safeName = namaKej.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().slice(0, 30)
      pdf.save(`jadual-${safeName}.pdf`)
    } catch (e) { alert('Ralat menjana PDF: ' + e.message) }
    finally { setPrintingPdf(false) }
  }

  // ── Computed ──
  const hariMap = {}
  acara.forEach(a => {
    const t = a.tarikhAcara || 'tba'
    if (!hariMap[t]) hariMap[t] = []
    hariMap[t].push(a)
  })
  const hariKeys = Object.keys(hariMap).filter(k => k !== 'tba').sort()
  if (hariMap['tba']) hariKeys.push('tba')

  const kepItems = acara.filter(a =>
    ['ada_keputusan', 'rasmi', 'tidak_rasmi'].includes(a.statusAcara)
  ).sort((a, b) => {
    if ((a.tarikhAcara || '') !== (b.tarikhAcara || '')) return (a.tarikhAcara || '').localeCompare(b.tarikhAcara || '')
    return (Number(a.noAcara) || 0) - (Number(b.noAcara) || 0)
  })
  const kepFiltered = kepItems.filter(a =>
    filterKombo === 'semua' || `${a.jantina}_${a.kategoriKod}` === filterKombo
  )

  const seenKombo = new Set()
  kepItems.forEach(a => { if (a.jantina && a.kategoriKod) seenKombo.add(`${a.jantina}_${a.kategoriKod}`) })
  const komboList = [...seenKombo].sort((a, b) => {
    const [, ka] = a.split('_'), [, kb] = b.split('_')
    const ua = kategoriMap[ka]?.umurHad ?? 99, ub = kategoriMap[kb]?.umurHad ?? 99
    if (ua !== ub) return ua - ub
    return a.localeCompare(b)
  })

  // ── Status screens ──
  if (status === 'muatTurun') return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-7 h-7 border-2 border-[#003399] border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (status === 'tidakJumpa') return (
    <div className="min-h-screen bg-[#003399] flex flex-col items-center justify-center px-4 text-center">
      <p className="text-5xl mb-4">🔍</p>
      <h1 className="text-xl font-black text-white mb-2">Halaman Tidak Dijumpai</h1>
      <p className="text-sm text-white/50">Pautan <span className="font-mono text-white/70">/{slug}</span> tidak wujud.</p>
      <button onClick={() => navigate('/')} className="mt-6 text-xs font-bold text-white/50 hover:text-white underline">Kembali ke laman utama</button>
    </div>
  )
  if (status === 'tidakAktif') return (
    <div className="min-h-screen bg-[#003399] flex flex-col items-center justify-center px-4 text-center">
      <p className="text-5xl mb-4">⚠️</p>
      <h1 className="text-xl font-black text-white mb-2">Sistem Ditangguhkan</h1>
      <p className="text-sm text-white/50">Hubungi penganjur untuk maklumat lanjut.</p>
    </div>
  )

  const imgFmt = b64 => (!b64 ? 'PNG' : (b64.startsWith('data:image/jpeg') || b64.startsWith('data:image/jpg')) ? 'JPEG' : 'PNG')

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ── Header ── */}
      <header className="bg-[#003399]">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          {/* Logo kiri */}
          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
            {cfg.logoKiriBase64
              ? <img src={cfg.logoKiriBase64} className="w-full h-full object-contain" alt="logo" />
              : <span className="font-black text-[9px] text-[#003399]">GP</span>}
          </div>
          {/* Tajuk */}
          <div className="flex-1 text-center min-w-0">
            {cfg.namaAgensi && <p className="text-[9px] text-white/40 uppercase tracking-[0.2em] truncate">{cfg.namaAgensi}</p>}
            <p className="text-sm font-black text-white tracking-[0.12em] mt-0.5 truncate">
              {cfg.namaSistem || kej?.namaKejohanan || sekolah?.namaSekolah || 'Gold Podium'}
            </p>
          </div>
          {/* Logo kanan */}
          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
            {cfg.logoKananBase64
              ? <img src={cfg.logoKananBase64} className="w-full h-full object-contain" alt="logo" />
              : <span className="font-black text-[9px] text-[#003399]">🏆</span>}
          </div>
          {/* Refresh */}
          <button onClick={() => { setHeatCache({}); setExpandedAcara(new Set()) }}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/35 hover:text-white/80 transition-all shrink-0 active:scale-95">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </header>

      {/* Jalur warna */}
      <div className="h-[4px] bg-gradient-to-r from-[#cc0001] via-[#ffda00] to-[#cc0001]" />

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
          <p className="text-[10px] text-white/65 uppercase tracking-[0.25em] mb-2">{cfg.namaOrganisasi}</p>
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
            {kej.tarikhMula && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-white/70">
                📅 {formatTarikhRange(kej.tarikhMula, kej.tarikhTamat)}
              </span>
            )}
            {kej.statusKejohanan === 'aktif' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-500/20 border border-green-400/30 text-green-300 font-bold">
                🟢 Sedang Berlangsung
              </span>
            )}
          </div>
        )}

        {/* Stats */}
        {kej && (
          <div className="flex items-center justify-center gap-6 mb-5 text-white/80">
            <div className="text-center">
              <p className="text-xl font-black">{stats.acara || '—'}</p>
              <p className="text-[10px] text-white/40 uppercase tracking-wide">Acara</p>
            </div>
            <div className="w-px h-8 bg-white/15" />
            <div className="text-center">
              <p className="text-xl font-black">{stats.sekolah || Object.keys(sekolahMap).length || '—'}</p>
              <p className="text-[10px] text-white/40 uppercase tracking-wide">Sekolah</p>
            </div>
            <div className="w-px h-8 bg-white/15" />
            <div className="text-center">
              <p className="text-xl font-black">{stats.hari || '—'}</p>
              <p className="text-[10px] text-white/40 uppercase tracking-wide">Hari</p>
            </div>
          </div>
        )}

        {/* Login Staff button */}
        <div className="mt-2 flex items-center gap-3 max-w-2xl mx-auto px-2">
          <div className="h-px flex-1 bg-white/15" />
          <button onClick={() => setStaffModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-white/70 hover:bg-white/20 hover:text-white text-[11px] font-medium transition-all">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
            </svg>
            Login Staff
          </button>
          <div className="h-px flex-1 bg-white/15" />
        </div>
      </section>

      {/* ── Akses Pantas ── */}
      {kej && (() => {
        const items = [
          {
            key: 'pp', tajuk: 'Pengurus Pasukan',
            iconBg: 'bg-blue-50', iconColor: 'text-blue-600', borderHover: 'hover:border-blue-300',
            onClick: () => navigate(`/${slug}/pengurus`),
            icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>,
          },
          cfg.galeri?.aktif && cfg.galeri?.url ? {
            key: 'galeri', tajuk: 'Galeri Gambar',
            iconBg: 'bg-purple-50', iconColor: 'text-purple-600', borderHover: 'hover:border-purple-300',
            href: cfg.galeri.url,
            icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>,
          } : null,
          cfg.bukuKejohananLink?.aktif && cfg.bukuKejohananLink?.url ? {
            key: 'bukuKejohanan', tajuk: 'Buku Kejohanan',
            iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', borderHover: 'hover:border-emerald-300',
            href: cfg.bukuKejohananLink.url,
            icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>,
          } : null,
          cfg.bukuProgram?.aktif && cfg.bukuProgram?.url ? {
            key: 'bukuProgram', tajuk: 'Buku Program',
            iconBg: 'bg-amber-50', iconColor: 'text-amber-600', borderHover: 'hover:border-amber-300',
            href: cfg.bukuProgram.url,
            icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" /></svg>,
          } : null,
        ].filter(Boolean)

        return (
          <section className="py-6 px-4 bg-gray-50">
            <div className={`grid gap-3 mx-auto ${
              items.length === 1 ? 'grid-cols-1 max-w-[140px]' :
              items.length === 2 ? 'grid-cols-2 max-w-xs' :
              items.length === 3 ? 'grid-cols-3 max-w-md' :
              'grid-cols-2 sm:grid-cols-4 max-w-2xl'
            }`}>
              {items.map(item => {
                const cardCls = `group flex flex-col items-center justify-center gap-2 p-3 sm:p-4 rounded-xl bg-white border border-gray-200 ${item.borderHover} hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 active:scale-95 cursor-pointer`
                const content = (
                  <>
                    <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl ${item.iconBg} ${item.iconColor} flex items-center justify-center transition-transform group-hover:scale-110`}>
                      {item.icon}
                    </div>
                    <p className="text-[10px] sm:text-[11px] font-bold text-gray-700 text-center leading-tight">{item.tajuk}</p>
                  </>
                )
                return item.href
                  ? <a key={item.key} href={item.href} target="_blank" rel="noopener noreferrer" className={cardCls}>{content}</a>
                  : <button key={item.key} onClick={item.onClick} className={cardCls}>{content}</button>
              })}
            </div>
          </section>
        )
      })()}

      {/* ── Jadual & Keputusan ── */}
      {kej && (
        <section className="flex-1 py-6 px-3 bg-gray-50">
          <div className="max-w-4xl mx-auto">

            {/* Section header */}
            <div className="flex items-center justify-between mb-4">
              <div className="border-l-4 border-[#003399] pl-3">
                <h2 className="text-base font-black text-gray-800 leading-tight">Jadual &amp; Keputusan</h2>
              </div>
              <div className="flex items-center gap-2">
                {activeTab === 'jadual' && acara.length > 0 && (
                  <button onClick={cetakJadualPDF} disabled={printingPdf}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold text-[#003399] bg-white border border-[#003399]/25 rounded-xl hover:bg-blue-50 transition-all disabled:opacity-50 shadow-sm">
                    {printingPdf
                      ? <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>}
                    {printingPdf ? 'Menjana…' : 'Cetak PDF'}
                  </button>
                )}
                <button onClick={() => { setHeatCache({}); setExpandedAcara(new Set()) }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold text-gray-500 hover:text-[#003399] bg-white border border-gray-200 hover:border-[#003399]/30 rounded-xl transition-all shadow-sm">
                  <svg className={`w-3.5 h-3.5 ${jadualLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {jadualLoading ? 'Memuatkan…' : 'Kemaskini'}
                </button>
              </div>
            </div>

            {/* Tab Pills */}
            <div className="flex gap-1.5 mb-4 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
              {[
                { id: 'jadual',    label: 'Jadual' },
                { id: 'keputusan', label: 'Keputusan' },
                { id: 'rekod',     label: 'Rekod Kejohanan' },
              ].map(t => (
                <button key={t.id} onClick={() => { setActiveTab(t.id); if (t.id === 'rekod') loadRekodAll() }}
                  className={`px-5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeTab === t.id ? 'bg-[#003399] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Tab: Jadual ── */}
            {activeTab === 'jadual' && (
              jadualLoading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="w-8 h-8 border-[3px] border-[#003399] border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-gray-400">Memuatkan jadual…</p>
                </div>
              ) : hariKeys.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 py-12 text-center shadow-sm">
                  <p className="text-3xl mb-3">📋</p>
                  <p className="text-sm font-semibold text-gray-500">Tiada jadual ditetapkan.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {hariKeys.map(date => {
                    const isOpen  = expandedDays.has(date)
                    const items   = hariMap[date] || []
                    const todayDt = date !== 'tba' && isToday(date)
                    const label   = date === 'tba' ? 'Belum Ditetapkan' : formatDayLabel(date)
                    return (
                      <div key={date} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                        <button
                          onClick={() => setExpandedDays(prev => {
                            const next = new Set(prev)
                            if (next.has(date)) next.delete(date); else next.add(date)
                            return next
                          })}
                          className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${isOpen ? 'bg-[#003399]' : 'hover:bg-gray-50'}`}>
                          <div className="flex items-center gap-2.5">
                            {todayDt && !isOpen && <span className="w-2 h-2 rounded-full bg-[#003399] shrink-0" />}
                            <p className={`text-xs font-black ${isOpen ? 'text-white' : todayDt ? 'text-[#003399]' : 'text-gray-800'}`}>
                              {label}
                              {todayDt && (
                                <span className={`ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isOpen ? 'bg-white/20 text-white' : 'bg-[#003399]/10 text-[#003399]'}`}>
                                  HARI INI
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[10px] font-semibold ${isOpen ? 'text-blue-200' : 'text-gray-400'}`}>{items.length} acara</span>
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
                                  <th className="px-2 py-2 text-center w-14">Kelas</th>
                                  <th className="hidden sm:table-cell px-2 py-2 text-center w-20">Peringkat</th>
                                  <th className="hidden sm:table-cell px-3 py-2 text-left">Catatan</th>
                                  <th className="w-7" />
                                </tr>
                              </thead>
                              <tbody>
                                {items
                                  .sort((a, b) => (a.masa || '99:99').localeCompare(b.masa || '99:99') || (Number(a.noAcara) || 999) - (Number(b.noAcara) || 999))
                                  .map((a, i) => (
                                    <AcaraTableRow
                                      key={a.id}
                                      item={{ acara: a, masaMula: a.masa || '' }}
                                      isExpanded={expandedAcara.has(a.id)}
                                      onToggle={() => toggleAcara(a)}
                                      heats={heatCache[a.id]}
                                      isLoading={heatLoading.has(a.id)}
                                      sekolahMap={sekolahMap}
                                      kategoriMap={kategoriMap}
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
            )}

            {/* ── Tab: Keputusan ── */}
            {activeTab === 'keputusan' && (
              <div>
                {/* Filter kombo */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  <button onClick={() => setFilterKombo('semua')}
                    className={`px-3 py-1 text-[10px] font-bold rounded-lg border transition-colors ${
                      filterKombo === 'semua' ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}>Semua</button>
                  {komboList.map(key => {
                    const [j, k] = key.split('_')
                    const umur = kategoriMap[k]?.umurHad
                    const label = umur ? `${j}${umur}` : `${j}-${k}`
                    const isActive = filterKombo === key
                    const cls = isActive
                      ? (k === 'PPKI' ? 'bg-purple-600 text-white border-purple-600' : j === 'L' ? 'bg-blue-600 text-white border-blue-600' : 'bg-rose-500 text-white border-rose-500')
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    return (
                      <button key={key} onClick={() => setFilterKombo(prev => prev === key ? 'semua' : key)}
                        className={`px-3 py-1 text-[10px] font-bold rounded-lg border transition-colors ${cls}`}>
                        {label}
                      </button>
                    )
                  })}
                </div>
                {jadualLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="w-7 h-7 border-[3px] border-[#003399] border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : kepFiltered.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-gray-100 py-12 text-center shadow-sm">
                    <p className="text-3xl mb-3">🏁</p>
                    <p className="text-sm font-semibold text-gray-500">
                      {kepItems.length === 0 ? 'Belum ada keputusan diterbitkan.' : 'Tiada keputusan untuk pilihan ini.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {kepFiltered.map(a => {
                      const isExp = expandedAcara.has(a.id)
                      return (
                        <div key={a.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                          <button onClick={() => toggleAcara(a)}
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50/60 transition-colors text-left">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-gray-800 truncate">{a.namaAcara || '—'}</p>
                              <p className="text-[10px] text-gray-400 mt-0.5">
                                {a.kategoriKod || ''}{a.jantina ? ` · ${a.jantina === 'L' ? 'Lelaki' : 'Perempuan'}` : ''}
                                {a.tarikhAcara ? ` · ${formatDayLabel(a.tarikhAcara)}` : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              {a.peringkat === 'saringan' && (
                                <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">Saringan</span>
                              )}
                              {a.parentAcaraId && a.peringkat !== 'saringan' && (
                                <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-200">Final</span>
                              )}
                              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">KEPUTUSAN</span>
                              <svg className={`w-3.5 h-3.5 text-gray-300 transition-transform ${isExp ? 'rotate-180' : ''}`}
                                fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </button>
                          {isExp && (
                            <div className="border-t border-gray-100">
                              <KeputusanExpanded heats={heatCache[a.id]} acara={a} sekolahMap={sekolahMap} isLoading={heatLoading.has(a.id)} />
                            </div>
                          )}
                        </div>
                      )
                    })}
                    <p className="text-center text-[10px] text-gray-300 py-2">{kepFiltered.length} keputusan · Klik untuk lihat keputusan</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Rekod Kejohanan ── */}
            {activeTab === 'rekod' && (
              <div>
                {rekodAllLoading ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <div className="w-8 h-8 border-[3px] border-[#003399] border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-gray-400">Memuatkan rekod…</p>
                  </div>
                ) : (
                  (() => {
                    const PERINGKAT_LIST = [{ id: 'D', label: 'Daerah' }, { id: 'N', label: 'Negeri' }, { id: 'K', label: 'Kebangsaan' }]
                    const rekodByP = rekodAll.filter(r => r.peringkat?.trim().toUpperCase() === activePeringkatRekod)
                    const groupKeys = [...new Set(rekodByP.map(r => {
                      const j = r.jantina?.trim().toUpperCase() || ''
                      const k = r.kategoriKod?.trim().toUpperCase() || ''
                      return j && k ? `${j}_${k}` : null
                    }).filter(Boolean))].sort((a, b) => {
                      const ua = kategoriMap[a.split('_')[1]]?.umurHad ?? 99
                      const ub = kategoriMap[b.split('_')[1]]?.umurHad ?? 99
                      if (ua !== ub) return ua - ub
                      return a.localeCompare(b)
                    })
                    const activeKat = groupKeys.includes(activeKatRekod) ? activeKatRekod : groupKeys[0] || ''
                    const [activeJ, activeK] = activeKat.split('_')
                    const rows = rekodByP.filter(r =>
                      r.jantina?.trim().toUpperCase() === activeJ &&
                      r.kategoriKod?.trim().toUpperCase() === activeK
                    ).sort((a, b) => (a.namaAcara || '').localeCompare(b.namaAcara || ''))

                    return (
                      <>
                        <div className="flex gap-1.5 mb-3 bg-gray-100 p-1 rounded-xl w-fit">
                          {PERINGKAT_LIST.map(p => (
                            <button key={p.id} onClick={() => { setActivePeringkatRekod(p.id); setActiveKatRekod('') }}
                              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                activePeringkatRekod === p.id ? 'bg-[#003399] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                              }`}>{p.label}</button>
                          ))}
                        </div>
                        {groupKeys.length > 0 && (
                          <div className="flex gap-1.5 mb-3 flex-wrap">
                            {groupKeys.map(gk => {
                              const [j, k] = gk.split('_')
                              const umur = kategoriMap[k]?.umurHad
                              return (
                                <button key={gk} onClick={() => setActiveKatRekod(gk)}
                                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${
                                    activeKat === gk ? 'bg-[#003399] text-white border-[#003399]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                                  }`}>{umur ? `${j}${umur}` : `${j}${k}`}</button>
                              )
                            })}
                          </div>
                        )}
                        {rows.length > 0 ? (
                          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
                            <table className="w-full text-xs min-w-[320px]">
                              <thead>
                                <tr className="bg-gray-50 border-b border-gray-100">
                                  <th className="hidden sm:table-cell text-left px-3 py-2 font-semibold text-gray-500 w-6">#</th>
                                  <th className="text-left px-3 py-2 font-semibold text-gray-500">Acara</th>
                                  <th className="text-left px-3 py-2 font-semibold text-gray-500">Catatan</th>
                                  <th className="text-left px-3 py-2 font-semibold text-gray-500">Nama Atlet</th>
                                  <th className="text-left px-2 py-2 font-semibold text-gray-500">Thn</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((r, i) => (
                                  <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                                    <td className="hidden sm:table-cell px-3 py-2 text-gray-300">{i + 1}</td>
                                    <td className="px-3 py-2 font-medium text-gray-700 max-w-[100px] sm:max-w-none">
                                      <p className="truncate">{r.namaAcara || '—'}</p>
                                    </td>
                                    <td className="px-3 py-2 font-black text-[#003399] whitespace-nowrap">{formatPrestasiRekod(r.prestasi, r.unit)}</td>
                                    <td className="px-3 py-2 text-gray-700">
                                      <p className="truncate">{r.namaAtlet || '—'}</p>
                                    </td>
                                    <td className="px-2 py-2 text-gray-400 text-[11px] whitespace-nowrap">{tahunRekod(r.tarikhRekod)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="bg-white rounded-2xl border border-gray-100 py-12 text-center shadow-sm">
                            <p className="text-3xl mb-3">📊</p>
                            <p className="text-sm font-semibold text-gray-500">Tiada rekod untuk kategori ini.</p>
                          </div>
                        )}
                      </>
                    )
                  })()
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Medal Tally ── */}
      {kej && (
        <section className="py-6 px-3 bg-gray-50 border-t border-gray-100">
          <div className="max-w-4xl mx-auto">
            <div className="border-l-4 border-[#003399] pl-3 mb-4">
              <h2 className="text-base font-black text-gray-800 leading-tight">Kedudukan Pingat</h2>
            </div>
            <TabMedalTally schoolId={schoolId} kejId={kej.id} bilKed={kej.bilanganKedudukan ?? 3} />
          </div>
        </section>
      )}

      {!kej && status === 'jumpa' && (
        <div className="text-center py-16 px-4">
          <p className="text-4xl mb-3">🏆</p>
          <p className="text-sm font-bold text-gray-700 mb-1">Tiada Kejohanan</p>
          <p className="text-xs text-gray-400">Admin perlu setup kejohanan dahulu.</p>
        </div>
      )}

      {/* ── Footer ── */}
      <footer className="border-t-2 border-gray-100 py-5 px-5 bg-white">
        <div className="max-w-4xl mx-auto flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-2">
            <div className="h-px w-8 bg-gray-200" />
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.2em]">Gold Podium · Pengurusan Kejohanan</p>
            <div className="h-px w-8 bg-gray-200" />
          </div>
          <p className="text-[9px] text-gray-300">© {new Date().getFullYear()} · Hak Cipta Terpelihara</p>
        </div>
      </footer>

      {/* ── Modal Login Staff ── */}
      {staffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setStaffModal(false)}>
          <div onClick={e => e.stopPropagation()}
            className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-gradient-to-br from-[#003399] to-blue-900 px-6 py-5 text-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] text-white/60 font-bold uppercase tracking-[0.2em] mb-1">Gold Podium</p>
                  <h2 className="text-lg font-black tracking-wide">Akses Staff</h2>
                  <p className="text-[11px] text-white/70 mt-1">Sila pilih kategori akses anda</p>
                </div>
                <button onClick={() => setStaffModal(false)}
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-5 sm:p-6 space-y-2.5">
              {/* Pengurus Pasukan */}
              <button onClick={() => { setStaffModal(false); navigate(`/${slug}/pengurus`) }}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl border-2 border-gray-200 hover:border-[#003399] hover:bg-blue-50/50 transition-all group text-left">
                <span className="w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0 bg-blue-500 shadow-md group-hover:scale-105 transition-transform">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                  </svg>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-gray-800 uppercase tracking-wide">Pengurus Pasukan</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Daftar &amp; urus atlet sekolah</p>
                </div>
                <button type="button" onClick={e => { e.stopPropagation(); setLupaPinModal(true) }}
                  className="text-[9px] text-gray-400 hover:text-[#003399] underline shrink-0 mr-1">
                  Lupa PIN?
                </button>
                <svg className="w-4 h-4 text-gray-300 group-hover:text-[#003399] group-hover:translate-x-1 transition-all shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>

              {/* Pencatat */}
              {!showPencatatForm ? (
                <button onClick={() => { setPencatatErr(''); setShowPencatatForm(true) }}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl border-2 border-gray-200 hover:border-emerald-500 hover:bg-emerald-50/50 transition-all group text-left">
                  <span className="w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0 bg-emerald-500 shadow-md group-hover:scale-105 transition-transform">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-gray-800 uppercase tracking-wide">Pencatat</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">Input keputusan acara live</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-300 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              ) : (
                <form onSubmit={handlePencatatLogin} className="border-2 border-emerald-200 rounded-xl p-4 space-y-3 bg-emerald-50/30">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-black text-emerald-700 uppercase tracking-wide">Log Masuk Pencatat</p>
                    <button type="button" onClick={() => setShowPencatatForm(false)} className="text-gray-400 hover:text-gray-600">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  {pencatatErr && <p className="text-[11px] text-red-600 bg-red-50 rounded-lg px-3 py-2">{pencatatErr}</p>}
                  <input type="text" value={pencatatKod} onChange={e => { setPencatatKod(e.target.value.toUpperCase()); setPencatatErr('') }}
                    placeholder="Kod Akses (cth: CATAT01)" autoComplete="off"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono uppercase bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400" />
                  <input type="password" value={pencatatPin} onChange={e => { setPencatatPin(e.target.value.replace(/\D/g,'').slice(0,6)); setPencatatErr('') }}
                    placeholder="PIN (6 digit)" inputMode="numeric" maxLength={6}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400" />
                  <button type="submit" disabled={pencatatLoading}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 text-white text-xs font-bold rounded-lg transition-colors">
                    {pencatatLoading ? 'Mengesahkan…' : 'Log Masuk'}
                  </button>
                </form>
              )}

              {/* Admin login */}
              <div className="pt-3 mt-3 border-t border-gray-100 flex items-center justify-between">
                <p className="text-[10px] text-gray-400">Pentadbir Sistem?</p>
                <button onClick={() => { setStaffModal(false); navigate('/login', { state: { schoolSlug: slug, schoolId, namaSekolah: sekolah?.namaSekolah } }) }}
                  className="text-[11px] font-bold text-[#003399] hover:underline inline-flex items-center gap-1">
                  Log Masuk Admin
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Lupa PIN Modal ── */}
      {lupaPinModal && schoolId && (
        <LupaPinModal schoolId={schoolId} onClose={() => setLupaPinModal(false)} />
      )}
    </div>
  )
}
