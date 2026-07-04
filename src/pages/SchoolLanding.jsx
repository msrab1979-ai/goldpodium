import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  collection, doc, query, getDocs, getDoc,
  orderBy, limit, onSnapshot, where,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'
import { hashPin } from '../utils/hashPin'
import { usePWATitle } from '../hooks/usePWATitle'
import { selectFinalists } from '../utils/finalistUtils'
import { cariRekodUntukAcara } from '../utils/rekodUtils'

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

// ─── RekodModal ───────────────────────────────────────────────────────────────

const PERINGKAT_LABEL_M = { D: 'Daerah', N: 'Negeri', K: 'Kebangsaan' }

function rekodKeyHome(namaAcara, jantina, kategoriKod, peringkat) {
  const normalized = String(namaAcara || '')
    .toUpperCase()
    .replace(/(\d)\s*METER\b/g, '$1M')
    .replace(/(\d)\s+M\b/g, '$1M')
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_]/g, '_')
  return [normalized, jantina, kategoriKod, peringkat]
    .join('_').toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/_+/g, '_')
}

function fmtP(val, isPadangM) {
  if (val == null || val === '') return '—'
  let n = Number(val); if (isNaN(n) || n === 0) return '—'
  if (!isPadangM) {
    if (n > 0 && n < 10) {
      const m = Math.floor(n)
      const s = Math.round((n - m) * 100)
      return `${m}:${String(s).padStart(2, '0')}.00`
    }
    if (n >= 60) { const m = Math.floor(n / 60); return `${m}:${(n % 60).toFixed(2).padStart(5, '0')}` }
    return n.toFixed(2) + 's'
  }
  return n.toFixed(2) + 'm'
}

function RekodModal({ peserta, acara, schoolId, onClose }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  const peringkat = peserta.pecahRekod
  const isPadangM = ['padang_lompat', 'padang_balin'].includes(acara.jenisAcara)

  useEffect(() => {
    const rekodNama = acara.namaAcaraPendek || acara.namaAcara
    const rKey = rekodKeyHome(rekodNama, acara.jantina, acara.kategoriKod, peringkat)
    Promise.all([
      getDoc(doc(db, 'tenants', schoolId, 'rekod', rKey + '_tuntutan')),
      getDoc(doc(db, 'tenants', schoolId, 'rekod', rKey)),
    ]).then(([tSnap, aSnap]) => {
      setData({
        tuntutan:  tSnap.exists() ? tSnap.data() : null,
        rekodAsal: aSnap.exists() ? aSnap.data() : null,
      })
    }).catch(() => setData(null)).finally(() => setLoading(false))
  }, []) // eslint-disable-line

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  const t = data?.tuntutan
  const r = data?.rekodAsal
  const prestasiLama = t != null ? (t.prestasiLama ?? null) : (r?.prestasiLama != null ? Number(r.prestasiLama) : null)
  const tahunLama    = t != null ? (t.tahunLama ?? null)    : (r?.tahunLama ?? null)
  const namaLama     = t != null ? (t.namaLama ?? null)     : (r?.namaLama ?? null)
  const lokasiLama   = t != null ? (t.lokasiLama ?? null)   : (r?.lokasiLama ?? null)
  const delta = (() => {
    if (!t?.prestasi || !prestasiLama) return null
    const diff = Math.abs(Number(t.prestasi) - prestasiLama)
    return isPadangM ? `+${diff.toFixed(2)}m` : `-${diff.toFixed(2)}s`
  })()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white w-full max-w-xs rounded-xl shadow-2xl overflow-hidden">
        <div className="bg-[#003399] px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[9px] text-white/50 uppercase tracking-widest">RBK — Rekod Baru Kejohanan</p>
            <p className="text-sm font-black text-white leading-tight">{acara.namaAcara || '—'}</p>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 py-4">
              <div className="w-4 h-4 border-2 border-[#003399] border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-gray-400">Memuatkan…</p>
            </div>
          ) : !data ? (
            <p className="text-xs text-gray-400 py-4 text-center">Data rekod tidak dijumpai.</p>
          ) : (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-[9px] font-bold text-amber-500 uppercase tracking-widest mb-1">Rekod Baru</p>
                <p className="text-2xl font-black text-amber-700 font-mono">{fmtP(t?.prestasi ?? peserta.keputusan, isPadangM)}</p>
                <p className="text-xs font-semibold text-gray-800 mt-1">{t?.namaAtlet || peserta.namaAtlet || '—'}</p>
                <p className="text-[10px] text-gray-500">{t?.namaSekolah || peserta.namaSekolah || peserta.kodSekolah || '—'}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-amber-300 text-amber-700">
                    {PERINGKAT_LABEL_M[peringkat] || peringkat}
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-green-300 text-green-700 bg-green-50">
                    ✓ Disahkan
                  </span>
                  {delta && <span className="text-[9px] font-bold text-green-600">{delta}</span>}
                </div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                  {prestasiLama ? 'Rekod Lama' : 'Tiada Rekod Sebelum Ini'}
                </p>
                {prestasiLama ? (
                  <>
                    <p className="text-xl font-black text-gray-600 font-mono">{fmtP(prestasiLama, isPadangM)}</p>
                    {tahunLama  && <p className="text-[10px] text-gray-400">Tahun: {tahunLama}</p>}
                    {namaLama   && <p className="text-xs text-gray-600 mt-0.5">{namaLama}</p>}
                    {lokasiLama && <p className="text-[10px] text-gray-400">{lokasiLama}</p>}
                  </>
                ) : (
                  <p className="text-xs text-gray-400 italic">Rekod pertama untuk acara ini.</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── KeputusanExpanded ────────────────────────────────────────────────────────

function KeputusanExpanded({ heats, acara, sekolahMap, isLoading, finalSetup, rekodDNK, schoolId }) {
  const [rekodModal, setRekodModal] = useState(null)

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

  const heatsAda      = heats.filter(h => ['rasmi', 'diterima', 'tidak_rasmi'].includes(h.statusKeputusan))
  const finalHeats    = heatsAda.filter(h => ['final', 'terus_final'].includes(h.fasa) || h.peringkat === 'final')
  const saringanHeats = heatsAda.filter(h => !['final', 'terus_final'].includes(h.fasa) && h.peringkat !== 'final')
  const showingFinal  = finalHeats.length > 0
  const displayHeats  = showingFinal ? finalHeats : heatsAda

  const isSaringanAcara = (() => {
    const p = (acara.peringkat || '').toLowerCase()
    return ['saringan_qf', 'saringan_sf', 'suku_akhir', 'separuh_akhir'].includes(p)
  })()
  const showCatatanCol = (isSaringanAcara || (isRelay && saringanHeats.length > 0)) && !showingFinal

  // Finalist Q/q
  const _fasaJana = (acara.peringkat || '') === 'saringan_qf' ? 'sukuKeSeparuh' : 'toFinal'
  const _finalistRaw = showCatatanCol ? selectFinalists(heats, acara, finalSetup, _fasaJana) : []
  const finalistBibs = new Set(_finalistRaw.map(f => isRelay ? f.kodSekolah : f.noBib))
  const finalistQMap = new Map(_finalistRaw.map(f => [isRelay ? f.kodSekolah : f.noBib, f.qualifyType || 'q']))

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
              <th className="px-2 py-1.5 text-right">{isPadang ? 'Jarak' : 'Masa'}</th>
              {showCatatanCol && <th className="px-1.5 py-1.5 text-center w-8">Q</th>}
            </tr>
          </thead>
          <tbody>
            {heatPeserta.map((p, idx) => {
              const flagged    = ['DNS', 'DNF', 'DQ'].includes(p.status)
              const _ked       = (p.kedudukan === 'undefined' || p.kedudukan === '') ? null : p.kedudukan
              const _rank      = (p.rankDalamHeat === 'undefined' || p.rankDalamHeat === '') ? null : p.rankDalamHeat
              const kddk       = isLompatTinggi ? _ked : (_ked || _rank)
              const hasilBundar = isPadang ? fmtJarak(p.keputusan) : fmtMasa(p.keputusan)
              const medal      = isFinalHeat && (kddk === 1 ? '🥇' : kddk === 2 ? '🥈' : kddk === 3 ? '🥉' : null)
              const namaSkl    = p.namaSekolah || sekolahMap?.[p.kodSekolah] || p.kodSekolah || '—'
              const layakFinal = showCatatanCol && !flagged && finalistBibs.has(isRelay ? p.kodSekolah : p.noBib)
              return (
                <tr key={idx} className={`border-t border-gray-50 ${
                  layakFinal ? 'bg-blue-50/30' :
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
                          {p.pecahRekod && schoolId && (
                            <button onClick={e => { e.stopPropagation(); setRekodModal(p) }}
                              className="shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded bg-amber-400 hover:bg-amber-500 text-white tracking-wide transition-colors"
                              title="Klik untuk lihat rekod dipecahkan">RBK</button>
                          )}
                          {p.samaiRekod && (
                            <span className="shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded bg-teal-500 text-white tracking-wide"
                              title="Menyamai Rekod Kejohanan Lepas">MRKL</span>
                          )}
                        </div>
                      : <div>
                          <div className="flex items-center gap-1.5">
                            <p className={`font-semibold ${flagged ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                              {p.namaAtlet || '—'}
                              {flagged && <span className="ml-1 no-underline text-red-500 font-bold"> {p.status}</span>}
                            </p>
                            {p.pecahRekod && schoolId && (
                              <button onClick={e => { e.stopPropagation(); setRekodModal(p) }}
                                className="shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded bg-amber-400 hover:bg-amber-500 text-white tracking-wide transition-colors"
                                title="Klik untuk lihat rekod dipecahkan">RBK</button>
                            )}
                            {p.samaiRekod && (
                              <span className="shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded bg-teal-500 text-white tracking-wide"
                                title="Menyamai Rekod Kejohanan Lepas">MRKL</span>
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
                  {showCatatanCol && (
                    <td className="px-1.5 py-2 text-center">
                      {layakFinal && (() => {
                        const qt = finalistQMap.get(isRelay ? p.kodSekolah : p.noBib) || 'q'
                        return (
                          <span className={`inline-block text-[9px] font-black px-1.5 py-0.5 rounded text-white tracking-wide ${qt === 'Q' ? 'bg-green-600' : 'bg-sky-500'}`}>
                            {qt}
                          </span>
                        )
                      })()}
                    </td>
                  )}
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

      {/* Rekod D/N/K strip */}
      {rekodDNK && (rekodDNK.S || rekodDNK.D || rekodDNK.N || rekodDNK.K) && (() => {
        const LABEL = { S: 'Sekolah', D: 'Daerah', N: 'Negeri', K: 'Kebangsaan' }
        const rows  = ['S', 'D', 'N', 'K'].map(p => ({ p, r: rekodDNK[p] })).filter(x => x.r)
        if (!rows.length) return null
        return (
          <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/40">
            <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Rekod</p>
            <div className="space-y-1">
              {rows.map(({ p, r }) => (
                <div key={p} className="flex items-center gap-2 text-[10px] min-w-0">
                  <span className="shrink-0 text-[8px] font-bold px-1.5 py-0.5 rounded bg-gray-200 text-gray-500 leading-none">
                    {LABEL[p]}
                  </span>
                  <span className="font-mono font-bold text-[#003399]">
                    {formatPrestasiRekod(r.prestasi, r.unit)}
                  </span>
                  <span className="text-gray-600 truncate">{r.namaAtlet || r.namaSekolah || '—'}</span>
                  <span className="shrink-0 text-gray-400 text-[9px]">{tahunRekod(r.tarikhRekod)}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {rekodModal && (
        <RekodModal
          peserta={rekodModal}
          acara={acara}
          schoolId={schoolId}
          onClose={() => setRekodModal(null)}
        />
      )}
    </div>
  )
}

// ─── AcaraTableRow ────────────────────────────────────────────────────────────

function AcaraTableRow({ item, isExpanded, onToggle, heats, isLoading, sekolahMap, kategoriMap, finalSetup, rekodDNK, schoolId }) {
  const { acara, masaMula } = item
  const noAcara      = acara.noAcara || acara.id || '—'
  const status       = acara.statusAcara || 'akan_datang'
  const hasResult    = ['ada_keputusan', 'rasmi', 'tidak_rasmi'].includes(status)
  const adaHeat      = (heats || []).some(h => (h.peserta || []).length > 0)
  const peringkatRaw = (acara.peringkat || '').toLowerCase()
  const namaRaw      = (acara.namaAcara || '').toLowerCase()
  const peringkatLabel = (() => {
    if (peringkatRaw === 'saringan_qf') return 'Saringan/QF'
    if (peringkatRaw === 'saringan_sf') return 'Saringan/SF'
    if (peringkatRaw === 'separuh_akhir') return 'Separuh Akhir'
    if (peringkatRaw === 'akhir') return 'Final'
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
            <KeputusanExpanded heats={heats} acara={acara} sekolahMap={sekolahMap} isLoading={isLoading} finalSetup={finalSetup} rekodDNK={rekodDNK} schoolId={schoolId} />
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

function TabMedalTally({ schoolId, kejId, bilKed = 3, namaKej, tarikhMula, tarikhTamat, lokasi, logoKiri, logoKanan }) {
  const [allRows,      setAllRows]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [openGrps,     setOpenGrps]     = useState(new Set())
  const [jenisList,    setJenisList]    = useState([])
  const [printingKat,  setPrintingKat]  = useState(null)
  const [expandedRows, setExpandedRows] = useState(new Set()) // klik nama sekolah
  const [medalRawMap,  setMedalRawMap]  = useState({})       // kodSekolah → raw tally doc
  const [katMap,       setKatMap]       = useState({})        // kategoriKod → { umurHad }
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
        const rawMap = {}
        snap.docs.forEach(d => {
          const data = d.data()
          const kod = data.kodSekolah || d.id
          medalMap[kod] = data
          rawMap[kod]   = data
        })
        setMedalRawMap(rawMap)
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

  // Load kategoriMap dari kategori subcollection (sumber benar — ada label, umurHad, urutan, jenisSekolah)
  useEffect(() => {
    if (!schoolId || !kejId) return
    getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'kategori'))
      .then(snap => {
        const kMap = {}
        snap.docs.forEach(d => {
          const k = d.data()
          kMap[d.id] = {
            label:       k.label || d.id,
            umurHad:     k.umurHad ?? null,
            jenisSekolah: k.jenisSekolah || 'SR',
            urutan:      k.urutan ?? 99,
          }
        })
        setKatMap(kMap)
      }).catch(() => {})
  }, [schoolId, kejId])

  // Bina breakdown kat dari raw tally doc (sama logic Home.jsx)
  function buildKatDetail(kodSekolah) {
    const tallyRow = medalRawMap[kodSekolah]
    if (!tallyRow) return {}
    const grp = {}
    Object.entries(tallyRow).forEach(([key, val]) => {
      if (!key.startsWith('kat_') || typeof val !== 'number' || val === 0) return
      const parts = key.split('_')
      if (parts.length < 4) return
      const kat    = parts[1]
      const jan    = parts[2]
      const pingat = parts[3]
      const grpKey = `${jan}_${kat}`
      if (!grp[grpKey]) grp[grpKey] = { kategoriKod: kat, jantina: jan, emas: 0, perak: 0, gangsa: 0, tempat4: 0, tempat5: 0 }
      if (pingat in grp[grpKey]) grp[grpKey][pingat] += val
    })
    // Relay — pindah dari bucket individu ke RELAY
    Object.entries(tallyRow).forEach(([key, val]) => {
      if (!key.startsWith('contrib_') || typeof val !== 'object' || !val || !val.pingat) return
      const isRelayEntry = val.isRelay === true || (val.isRelay === undefined && !val.noBib && !val.noKP)
      if (!isRelayEntry) return
      const kat    = val.kategoriKod || ''
      const jan    = val.jantina     || ''
      const pingat = val.pingat
      const srcKey = `${jan}_${kat}`
      const dstKey = `${jan}_RELAY`
      if (grp[srcKey] && pingat in grp[srcKey]) grp[srcKey][pingat] = Math.max(0, grp[srcKey][pingat] - 1)
      if (!grp[dstKey]) grp[dstKey] = { kategoriKod: 'RELAY', jantina: jan, emas: 0, perak: 0, gangsa: 0, tempat4: 0, tempat5: 0 }
      if (pingat in grp[dstKey]) grp[dstKey][pingat] += 1
    })
    // Nama acara dari contrib_ fields
    const namaMap = {} // `${jan}_${kat}_${pingat}` → [namaAcara]
    Object.entries(tallyRow).forEach(([key, val]) => {
      if (!key.startsWith('contrib_') || typeof val !== 'object' || !val || !val.pingat) return
      const isRelayEntry = val.isRelay === true || (val.isRelay === undefined && !val.noBib && !val.noKP)
      const kat    = isRelayEntry ? 'RELAY' : (val.kategoriKod || '')
      const jan    = val.jantina || ''
      const pingat = val.pingat
      const nama   = val.namaAcaraPendek || val.namaAcara || ''
      if (!nama) return
      const nKey = `${jan}_${kat}_${pingat}`
      if (!namaMap[nKey]) namaMap[nKey] = []
      if (!namaMap[nKey].includes(nama)) namaMap[nKey].push(nama)
    })
    return { grp, namaMap }
  }

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

  async function cetakKatPDF(kat, rows) {
    if (!rows.length) return
    setPrintingKat(kat)
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'), import('jspdf-autotable'),
      ])
      const pdf      = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const judulKej = namaKej || 'Kejohanan Olahraga'
      const logoSize = 16
      const pageW    = 210

      if (logoKiri)  pdf.addImage(logoKiri,  'PNG', 14,                   8, logoSize, logoSize)
      if (logoKanan) pdf.addImage(logoKanan, 'PNG', pageW - 14 - logoSize, 8, logoSize, logoSize)

      pdf.setFontSize(13); pdf.setFont(undefined, 'bold'); pdf.setTextColor(0, 51, 153)
      pdf.text('KEDUDUKAN PINGAT', pageW / 2, 14, { align: 'center' })
      pdf.setFontSize(9); pdf.setFont(undefined, 'normal'); pdf.setTextColor(30, 30, 30)
      pdf.text(`${judulKej.toUpperCase()} — ${kat}`, pageW / 2, 20, { align: 'center' })

      const tMula  = tarikhMula  ? new Date(tarikhMula).toLocaleDateString('ms-MY',  { day: 'numeric', month: 'short', year: 'numeric' }) : ''
      const tTamat = tarikhTamat ? new Date(tarikhTamat).toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
      const tarikhStr = tMula && tTamat && tMula !== tTamat ? `${tMula} – ${tTamat}` : tMula
      const subtitleParts = [tarikhStr, lokasi].filter(Boolean)
      if (subtitleParts.length) {
        pdf.setFontSize(7.5); pdf.setTextColor(100)
        pdf.text(subtitleParts.join('  ·  '), pageW / 2, 25.5, { align: 'center' })
      }
      pdf.setDrawColor(0, 51, 153); pdf.setLineWidth(0.4)
      pdf.line(14, 27, pageW - 14, 27)
      pdf.setTextColor(0)

      const ranked = sortAndRankRows([...rows])
      const head = [['No.', 'Nama Sekolah', 'Emas', 'Perak', 'Gangsa',
        ...(bilKed >= 4 ? ['T4'] : []), ...(bilKed >= 5 ? ['T5'] : []), 'Jumlah']]

      const body = ranked.map(t => {
        const jumlah = (t.emas||0)+(t.perak||0)+(t.gangsa||0)+(bilKed>=4?t.tempat4||0:0)+(bilKed>=5?t.tempat5||0:0)
        return [
          t.rank, t.namaSekolah || t.kodSekolah || '—',
          t.emas||0, t.perak||0, t.gangsa||0,
          ...(bilKed >= 4 ? [t.tempat4||0] : []),
          ...(bilKed >= 5 ? [t.tempat5||0] : []),
          jumlah,
        ]
      })
      const totalJumlah = ranked.reduce((s,t)=>s+(t.emas||0)+(t.perak||0)+(t.gangsa||0)+(bilKed>=4?t.tempat4||0:0)+(bilKed>=5?t.tempat5||0:0),0)
      body.push([
        '', 'JUMLAH',
        ranked.reduce((s,t)=>s+(t.emas||0),0),
        ranked.reduce((s,t)=>s+(t.perak||0),0),
        ranked.reduce((s,t)=>s+(t.gangsa||0),0),
        ...(bilKed >= 4 ? [ranked.reduce((s,t)=>s+(t.tempat4||0),0)] : []),
        ...(bilKed >= 5 ? [ranked.reduce((s,t)=>s+(t.tempat5||0),0)] : []),
        totalJumlah,
      ])

      autoTable(pdf, {
        startY: 30, head, body,
        margin: { left: 14, right: 14 },
        headStyles: { fillColor: [0, 51, 153], textColor: 255, fontStyle: 'bold', fontSize: 8.5, halign: 'center' },
        styles: { fontSize: 9, cellPadding: 3, halign: 'center' },
        columnStyles: { 1: { halign: 'left' } },
        alternateRowStyles: { fillColor: [248, 250, 255] },
        didParseCell: (data) => {
          const isLast = data.row.index === body.length - 1
          if (isLast) {
            data.cell.styles.fontStyle = 'bold'
            data.cell.styles.fillColor = [230, 236, 255]
            data.cell.styles.textColor = [0, 51, 153]
          }
          const rank = ranked[data.row.index]?.rank
          if (!isLast && data.column.index === 0) {
            if (rank === 1) data.cell.styles.textColor = [180, 120, 0]
            if (rank === 2) data.cell.styles.textColor = [100, 100, 100]
            if (rank === 3) data.cell.styles.textColor = [160, 80, 20]
          }
        },
      })

      const pageCount = pdf.internal.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i)
        pdf.setFontSize(6.5); pdf.setTextColor(180)
        pdf.text(`Dicetak: ${new Date().toLocaleString('ms-MY')}`, 14, 290)
        pdf.text(`Muka ${i} / ${pageCount}`, pageW - 14, 290, { align: 'right' })
      }

      const safeName = `${judulKej}-${kat}`.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().slice(0, 40)
      pdf.save(`medal-tally-${safeName}.pdf`)
    } catch (e) { alert('Ralat menjana PDF: ' + e.message) }
    finally { setPrintingKat(null) }
  }

  function renderTable(rows, bilKed) {
    const totalCols = 3 + (bilKed >= 4 ? 1 : 0) + (bilKed >= 5 ? 1 : 0) + 2 // No+Nama+E+P+G+T4?+T5?+Jml
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
              const rs      = RANK_STYLE[t.rank] || {}
              const jumlah  = (t.emas||0)+(t.perak||0)+(t.gangsa||0)+(bilKed>=4?t.tempat4||0:0)+(bilKed>=5?t.tempat5||0:0)
              const isExp   = expandedRows.has(t.kodSekolah)
              const detail  = isExp ? buildKatDetail(t.kodSekolah) : null

              // Kumpul kategori dari katMap — ikut jenisSekolah sekolah + urutan
              // grpKey dalam buildKatDetail = `${jantina}_${kategoriKod}` (dari kat_ field postRasmi)
              // Tunjuk semua kategori yang ada dalam katMap, tapi row yang tiada pingat jadi fade
              const katKombos = (() => {
                const grp = detail?.grp || {}
                // Kumpul semua grpKeys yang ada dalam grp — `L_L12A`, `P_P12` dsb
                const grpKeys = new Set(Object.keys(grp).filter(k => k !== 'L_RELAY' && k !== 'P_RELAY'))
                const result = []
                Object.entries(katMap)
                  .filter(([, info]) => !t.kategori || t.kategori === 'Lain-lain' || info.jenisSekolah === t.kategori)
                  .sort((a, b) => (a[1].urutan ?? 99) - (b[1].urutan ?? 99))
                  .forEach(([kod, info]) => {
                    // Cari jantina yang exist dalam grp untuk kod ini
                    const jantinas = ['L', 'P'].filter(j => grpKeys.has(`${j}_${kod}`))
                    if (jantinas.length > 0) {
                      jantinas.forEach(j => result.push({ kod, label: info.label || kod, j }))
                    } else {
                      // Row tiada pingat — teka jantina dari label prefix
                      const guessJ = /^L/i.test(info.label || kod) ? 'L' : /^P/i.test(info.label || kod) ? 'P' : 'L'
                      result.push({ kod, label: info.label || kod, j: guessJ })
                    }
                  })
                return result
              })()

              return (
                <>
                <tr key={t.id} className={`border-b border-gray-50 ${rs.row || ''}`}>
                  <td className="hidden sm:table-cell px-3 py-3 text-center">
                    {t.rank <= 3
                      ? <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black ${rs.badge}`}>{t.rank}</span>
                      : <span className="text-[10px] font-bold text-gray-400">{t.rank}</span>}
                  </td>
                  <td className="px-3 py-3">
                    <button
                      className="text-left w-full"
                      onClick={() => setExpandedRows(prev => {
                        const next = new Set(prev)
                        if (next.has(t.kodSekolah)) next.delete(t.kodSekolah)
                        else next.add(t.kodSekolah)
                        return next
                      })}
                    >
                      <p className="font-semibold text-xs text-gray-800 flex items-center gap-1">
                        <span className="truncate">{t.namaSekolah || t.kodSekolah}</span>
                        <svg className={`w-3 h-3 shrink-0 text-gray-400 transition-transform ${isExp ? 'rotate-180' : ''}`}
                          fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </p>
                      <p className="text-[9px] text-gray-300 font-mono mt-0.5">{t.kodSekolah}</p>
                    </button>
                  </td>
                  <td className="px-2 py-3 text-center"><span className={`text-sm font-black ${(t.emas||0)>0?'text-yellow-600':'text-gray-200'}`}>{t.emas||0}</span></td>
                  <td className="px-2 py-3 text-center"><span className={`text-sm font-black ${(t.perak||0)>0?'text-gray-500':'text-gray-200'}`}>{t.perak||0}</span></td>
                  <td className="px-2 py-3 text-center"><span className={`text-sm font-black ${(t.gangsa||0)>0?'text-orange-600':'text-gray-200'}`}>{t.gangsa||0}</span></td>
                  {bilKed >= 4 && <td className="hidden sm:table-cell px-2 py-3 text-center"><span className={`text-sm font-black ${(t.tempat4||0)>0?'text-blue-400':'text-gray-200'}`}>{t.tempat4||0}</span></td>}
                  {bilKed >= 5 && <td className="hidden sm:table-cell px-2 py-3 text-center"><span className={`text-sm font-black ${(t.tempat5||0)>0?'text-purple-400':'text-gray-200'}`}>{t.tempat5||0}</span></td>}
                  <td className="px-3 py-3 text-center"><span className={`text-xs font-black ${jumlah>0?'text-gray-700':'text-gray-200'}`}>{jumlah}</span></td>
                </tr>

                {/* ── Expand: breakdown per kategori (KOAM-style) ── */}
                {isExp && (
                  <tr key={`exp_${t.kodSekolah}`} className="bg-blue-50/40 border-b border-blue-100">
                    <td colSpan={totalCols} className="px-4 py-3">
                      <div className="overflow-x-auto">
                        <table className="w-full text-[10px]">
                          <thead>
                            <tr className="text-gray-400 font-bold uppercase tracking-wide border-b border-blue-100">
                              <th className="py-1.5 pr-3 text-left w-16">Kat</th>
                              <th className="py-1.5 px-2 text-center">
                                <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-400 border border-yellow-500" />
                              </th>
                              <th className="py-1.5 px-2 text-center">
                                <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-300 border border-gray-400" />
                              </th>
                              <th className="py-1.5 px-2 text-center">
                                <span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-300 border border-orange-400" />
                              </th>
                              {bilKed >= 4 && <th className="py-1.5 px-2 text-center text-gray-300">4</th>}
                              {bilKed >= 5 && <th className="py-1.5 px-2 text-center text-gray-300">5</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {katKombos.map(({ j, kod, label }) => {
                              const grpKey = `${j}_${kod}`
                              const row = detail?.grp?.[grpKey]
                              const emas  = row?.emas   || 0
                              const perak = row?.perak  || 0
                              const gsa   = row?.gangsa || 0
                              const t4    = row?.tempat4 || 0
                              const t5    = row?.tempat5 || 0
                              const ada   = emas + perak + gsa + t4 + t5 > 0
                              const getNama = (pingat) => detail?.namaMap?.[`${j}_${kod}_${pingat}`] || []
                              return (
                                <tr key={grpKey} className={`border-b border-blue-50/50 ${ada ? '' : 'opacity-35'}`}>
                                  <td className="py-1.5 pr-3 font-bold text-gray-600 align-top">{label}</td>
                                  <td className="py-1.5 px-2 text-center align-top">
                                    <span className={`font-black ${emas > 0 ? 'text-yellow-600' : 'text-gray-200'}`}>{emas}</span>
                                    {getNama('emas').map((n, ni) => (
                                      <p key={ni} className="text-[8px] text-yellow-700/70 leading-tight mt-0.5">{n}</p>
                                    ))}
                                  </td>
                                  <td className="py-1.5 px-2 text-center align-top">
                                    <span className={`font-black ${perak > 0 ? 'text-gray-500' : 'text-gray-200'}`}>{perak}</span>
                                    {getNama('perak').map((n, ni) => (
                                      <p key={ni} className="text-[8px] text-gray-400 leading-tight mt-0.5">{n}</p>
                                    ))}
                                  </td>
                                  <td className="py-1.5 px-2 text-center align-top">
                                    <span className={`font-black ${gsa > 0 ? 'text-orange-500' : 'text-gray-200'}`}>{gsa}</span>
                                    {getNama('gangsa').map((n, ni) => (
                                      <p key={ni} className="text-[8px] text-orange-400/80 leading-tight mt-0.5">{n}</p>
                                    ))}
                                  </td>
                                  {bilKed >= 4 && (
                                    <td className="py-1.5 px-2 text-center align-top">
                                      <span className={`font-bold ${t4 > 0 ? 'text-gray-500' : 'text-gray-200'}`}>{t4}</span>
                                    </td>
                                  )}
                                  {bilKed >= 5 && (
                                    <td className="py-1.5 px-2 text-center align-top">
                                      <span className={`font-bold ${t5 > 0 ? 'text-gray-500' : 'text-gray-200'}`}>{t5}</span>
                                    </td>
                                  )}
                                </tr>
                              )
                            })}
                            {/* Relay rows */}
                            {['L', 'P'].map(j => {
                              const row  = detail?.grp?.[`${j}_RELAY`]
                              if (!row) return null
                              const emas = row.emas   || 0
                              const perak= row.perak  || 0
                              const gsa  = row.gangsa || 0
                              const t4   = row.tempat4 || 0
                              const t5   = row.tempat5 || 0
                              if (emas + perak + gsa + t4 + t5 === 0) return null
                              const getNama = (pingat) => detail?.namaMap?.[`${j}_RELAY_${pingat}`] || []
                              return (
                                <tr key={`relay_${j}`} className="border-b border-blue-50/50 border-t-2 border-t-blue-200">
                                  <td className="py-1 pr-3 font-bold text-[#003399] align-top">Relay {j}</td>
                                  <td className="py-1 px-2 text-center align-top">
                                    <span className={`font-black ${emas > 0 ? 'text-yellow-600' : 'text-gray-200'}`}>{emas}</span>
                                    {getNama('emas').map((n, ni) => <p key={ni} className="text-[8px] text-yellow-700/70 leading-tight mt-0.5">{n}</p>)}
                                  </td>
                                  <td className="py-1 px-2 text-center align-top">
                                    <span className={`font-black ${perak > 0 ? 'text-gray-500' : 'text-gray-200'}`}>{perak}</span>
                                    {getNama('perak').map((n, ni) => <p key={ni} className="text-[8px] text-gray-400 leading-tight mt-0.5">{n}</p>)}
                                  </td>
                                  <td className="py-1 px-2 text-center align-top">
                                    <span className={`font-black ${gsa > 0 ? 'text-orange-500' : 'text-gray-200'}`}>{gsa}</span>
                                    {getNama('gangsa').map((n, ni) => <p key={ni} className="text-[8px] text-orange-400/80 leading-tight mt-0.5">{n}</p>)}
                                  </td>
                                  {bilKed >= 4 && <td className="py-1 px-2 text-center align-top"><span className={`font-bold ${t4>0?'text-gray-500':'text-gray-200'}`}>{t4}</span></td>}
                                  {bilKed >= 5 && <td className="py-1 px-2 text-center align-top"><span className={`font-bold ${t5>0?'text-gray-500':'text-gray-200'}`}>{t5}</span></td>}
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
                </>
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
                {isOpen && (
                  <button
                    onClick={e => { e.stopPropagation(); cetakKatPDF(kat, rows) }}
                    disabled={printingKat === kat}
                    className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold text-white bg-white/20 border border-white/30 rounded-lg hover:bg-white/30 transition-all disabled:opacity-50"
                  >
                    {printingKat === kat
                      ? <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      : <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>}
                    {printingKat === kat ? 'Menjana…' : 'PDF'}
                  </button>
                )}
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

  // Tetapan + logo — mesti sebelum usePWATitle
  const [cfg, setCfg] = useState({
    logoKiriBase64: '', logoKananBase64: '', logoKejohananBase64: '',
    logoPenganjurBase64: '', namaOrganisasi: '', namaAgensi: '',
    namaSistem: '',
  })

  usePWATitle(sekolah?.namaSekolah || cfg?.namaSistem)
  const [status,   setStatus]   = useState('muatTurun')
  const [stats,    setStats]    = useState({ acara: 0, sekolah: 0, hari: 0 })

  // Jadual & keputusan
  const [activeTab,      setActiveTab]      = useState('jadual')
  const [acara,          setAcara]          = useState([])
  const [jadualLoading,  setJadualLoading]  = useState(false)
  const [expandedDays,   setExpandedDays]   = useState(new Set())
  const [expandedAcara,  setExpandedAcara]  = useState(new Set())
  const [heatCache,      setHeatCache]      = useState({})
  const [heatLoading,    setHeatLoading]    = useState(new Set())
  const [rekodCache,     setRekodCache]     = useState({})
  const [finalSetup,     setFinalSetup]     = useState(null)
  const [sekolahMap,     setSekolahMap]     = useState({})
  const [kategoriMap,    setKategoriMap]    = useState({})
  const [filterKombo,    setFilterKombo]    = useState('semua')
  const [aksesPantasItems, setAksesPantasItems] = useState([])

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
      navigate(`/${slug}/pencatat/dashboard`)
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

  // ── Tetapan home (logo) ──
  useEffect(() => {
    if (!schoolId) return
    const unsub = onSnapshot(
      doc(db, 'tenants', schoolId, 'tetapan', 'home'),
      s => { if (s.exists()) setCfg(prev => ({ ...prev, ...s.data() })) },
      () => {}
    )
    return () => unsub()
  }, [schoolId])

  // ── Akses Pantas — sistem bebas ──
  useEffect(() => {
    if (!schoolId) return
    const unsub = onSnapshot(
      doc(db, 'tenants', schoolId, 'tetapan', 'aksesPantas'),
      s => { if (s.exists() && Array.isArray(s.data().items)) setAksesPantasItems(s.data().items) },
      () => {}
    )
    return () => unsub()
  }, [schoolId])

  // ── Load sekolah map + kategori + finalSetup sekali ──
  useEffect(() => {
    if (!schoolId) return
    getDoc(doc(db, 'tenants', schoolId, 'tetapan', 'finalSetup'))
      .then(s => { if (s.exists()) setFinalSetup(s.data()) })
      .catch(() => {})
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
      // Load rekod D/N/K untuk acara ini
      if (!rekodCache[key]) {
        cariRekodUntukAcara(schoolId, a).then(dnk => {
          setRekodCache(prev => ({ ...prev, [key]: dnk }))
        }).catch(() => {})
      }
    } catch { setHeatCache(prev => ({ ...prev, [key]: [] })) }
    finally { setHeatLoading(prev => { const n = new Set(prev); n.delete(key); return n }) }
  }

  // ── Load rekod kejohanan ──
  async function loadRekodAll() {
    if (rekodAllLoaded || !schoolId || !kej?.id) return
    setRekodAllLoading(true)
    try {
      const snap = await getDocs(collection(db, 'tenants', schoolId, 'rekod'))
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(r => !r.id.endsWith('_tuntutan') && r.statusRekod === 'aktif')
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
      const namaKej   = kej?.namaKejohanan || sekolah?.namaSekolah || 'Kejohanan Olahraga'
      const logoKiri  = cfg.logoKiriBase64  || ''
      const logoKanan = cfg.logoKananBase64 || ''
      const logoSize  = 16
      const pageW     = 297

      // ── Header halaman pertama ──
      function drawHeader(y = 10) {
        if (logoKiri)  pdf.addImage(logoKiri,  'PNG', 14,           y, logoSize, logoSize)
        if (logoKanan) pdf.addImage(logoKanan, 'PNG', pageW - 14 - logoSize, y, logoSize, logoSize)
        pdf.setFontSize(13); pdf.setFont(undefined, 'bold'); pdf.setTextColor(0, 51, 153)
        pdf.text('JADUAL ACARA', pageW / 2, y + 5, { align: 'center' })
        pdf.setFontSize(9); pdf.setFont(undefined, 'normal'); pdf.setTextColor(30, 30, 30)
        pdf.text(namaKej.toUpperCase(), pageW / 2, y + 11, { align: 'center' })
        const tarikhMula  = kej?.tarikhMula  ? new Date(kej.tarikhMula).toLocaleDateString('ms-MY',  { day: 'numeric', month: 'short', year: 'numeric' }) : ''
        const tarikhTamat = kej?.tarikhTamat ? new Date(kej.tarikhTamat).toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
        const tarikhStr   = tarikhMula && tarikhTamat && tarikhMula !== tarikhTamat
          ? `${tarikhMula} – ${tarikhTamat}` : tarikhMula
        const lokasiStr   = kej?.lokasi || ''
        const subtitleParts = [tarikhStr, lokasiStr].filter(Boolean)
        if (subtitleParts.length) {
          pdf.setFontSize(7.5); pdf.setTextColor(100)
          pdf.text(subtitleParts.join('  ·  '), pageW / 2, y + 16.5, { align: 'center' })
        }
        pdf.setDrawColor(0, 51, 153); pdf.setLineWidth(0.4)
        pdf.line(14, y + logoSize + 2, pageW - 14, y + logoSize + 2)
        pdf.setTextColor(0)
        return y + logoSize + 5
      }

      let startY = drawHeader(8)

      const hariMap = {}
      acara.forEach(a => {
        const t = a.tarikhAcara || 'tba'
        if (!hariMap[t]) hariMap[t] = []
        hariMap[t].push(a)
      })
      const hariKeys = Object.keys(hariMap).sort()
      let isFirst = true

      for (const date of hariKeys) {
        const items = hariMap[date] || []
        if (!isFirst) { pdf.addPage(); startY = drawHeader(8) }
        isFirst = false

        autoTable(pdf, {
          startY,
          head: [[{ content: formatDayLabel(date).toUpperCase() + `  (${items.length} acara)`, colSpan: 7,
            styles: { halign: 'left', fillColor: [0, 51, 153], textColor: 255, fontStyle: 'bold', fontSize: 9.5 } }]],
          body: [], margin: { left: 14, right: 14 },
          styles: { cellPadding: { top: 3, bottom: 3, left: 5, right: 5 } }, theme: 'plain',
        })

        const tableBody = items
          .sort((a, b) => (a.masa || '99:99').localeCompare(b.masa || '99:99') || (Number(a.noAcara) || 999) - (Number(b.noAcara) || 999))
          .map(a => {
            const peringkatLabel = a.peringkat === 'saringan_qf' ? 'Saringan/QF'
              : a.peringkat === 'saringan_sf'   ? 'Saringan/SF'
              : a.peringkat === 'separuh_akhir' ? 'Separuh Akhir'
              : a.peringkat === 'final'         ? 'Final'
              : a.parentAcaraId ? 'Final' : 'Terus Final'
            return [
              a.noAcara    || '—',
              a.masa       || '—',
              a.namaAcara  || '—',
              a.kategoriKod || '—',
              a.jantina === 'L' ? 'L' : a.jantina === 'P' ? 'P' : (a.jantina || '—'),
              a.lokasi     || '—',
              peringkatLabel,
            ]
          })

        autoTable(pdf, {
          startY: pdf.lastAutoTable.finalY,
          head: [['No', 'Masa', 'Nama Acara', 'Kat', 'J', 'Lokasi', 'Peringkat']],
          body: tableBody,
          margin: { left: 14, right: 14 },
          headStyles: { fillColor: [230, 236, 255], textColor: [0, 51, 153], fontStyle: 'bold', fontSize: 8 },
          styles: { fontSize: 8.5, cellPadding: 2.5 },
          alternateRowStyles: { fillColor: [248, 250, 255] },
          columnStyles: {
            0: { cellWidth: 12, halign: 'center' },
            1: { cellWidth: 18, halign: 'center' },
            2: { cellWidth: 'auto' },
            3: { cellWidth: 18, halign: 'center' },
            4: { cellWidth: 8,  halign: 'center' },
            5: { cellWidth: 35 },
            6: { cellWidth: 28, halign: 'center' },
          },
        })
        startY = pdf.lastAutoTable.finalY + 4
      }

      // Footer — nombor halaman + tarikh cetak
      const pageCount = pdf.internal.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i)
        pdf.setFontSize(6.5); pdf.setTextColor(180)
        pdf.text(`Dicetak: ${new Date().toLocaleString('ms-MY')}`, 14, 205)
        pdf.text(`Muka ${i} / ${pageCount}`, pageW - 14, 205, { align: 'right' })
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

        {/* Tarikh + Lokasi */}
        {kej && (
          <div className="flex items-center justify-center gap-3 mb-5 text-white/70 text-xs flex-wrap">
            {(kej.tarikhMula || kej.tarikhTamat) && (
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {kej.tarikhMula ? new Date(kej.tarikhMula).toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                {kej.tarikhTamat && kej.tarikhTamat !== kej.tarikhMula
                  ? ` – ${new Date(kej.tarikhTamat).toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' })}`
                  : ''}
              </span>
            )}
            {kej.lokasi && (
              <>
                <span className="opacity-30">·</span>
                <span className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {kej.lokasi}
                </span>
              </>
            )}
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
        const activeItems = aksesPantasItems.filter(it => it.aktif && it.url)
        const total = 1 + activeItems.length
        const gridCls = total === 1 ? 'grid-cols-1 max-w-[140px]' :
                        total === 2 ? 'grid-cols-2 max-w-xs' :
                        total === 3 ? 'grid-cols-3 max-w-md' :
                        'grid-cols-2 sm:grid-cols-4 max-w-2xl'
        return (
          <section className="py-6 px-4 bg-gray-50">
            <div className={`grid gap-3 mx-auto ${gridCls}`}>
              <button
                onClick={() => navigate(`/${slug}/pengurus`)}
                className="group flex flex-col items-center justify-center gap-2 p-3 sm:p-4 rounded-xl bg-white border border-gray-200 hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 active:scale-95 cursor-pointer"
              >
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:animate-pulse-icon">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                  </svg>
                </div>
                <p className="text-[10px] sm:text-[11px] font-bold text-gray-700 text-center leading-tight">Pengurus Pasukan</p>
              </button>
              {activeItems.map(item => (
                <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer"
                  className="group flex flex-col items-center justify-center gap-2 p-3 sm:p-4 rounded-xl bg-white border border-gray-200 hover:border-indigo-300 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 active:scale-95 cursor-pointer">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-2xl group-hover:animate-pulse-icon">
                    {item.emoji || '🔗'}
                  </div>
                  <p className="text-[10px] sm:text-[11px] font-bold text-gray-700 text-center leading-tight">{item.tajuk}</p>
                </a>
              ))}
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
                                      finalSetup={finalSetup}
                                      rekodDNK={rekodCache[a.id]}
                                      schoolId={schoolId}
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
                              {['saringan_qf','saringan_sf'].includes(a.peringkat) && (
                                <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">Saringan</span>
                              )}
                              {a.parentAcaraId && !['saringan_qf','saringan_sf'].includes(a.peringkat) && (
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
                              <KeputusanExpanded heats={heatCache[a.id]} acara={a} sekolahMap={sekolahMap} isLoading={heatLoading.has(a.id)} finalSetup={finalSetup} rekodDNK={rekodCache[a.id]} schoolId={schoolId} />
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
                    const PERINGKAT_LIST = [{ id: 'S', label: 'Sekolah' }, { id: 'D', label: 'Daerah' }, { id: 'N', label: 'Negeri' }, { id: 'K', label: 'Kebangsaan' }]
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
            <div className="mb-4">
              <div className="border-l-4 border-[#003399] pl-3">
                <h2 className="text-base font-black text-gray-800 leading-tight">Kedudukan Pingat</h2>
                <p className="text-[10px] text-gray-400 mt-0.5">Buka kategori untuk cetak PDF</p>
              </div>
            </div>
            <TabMedalTally
              schoolId={schoolId} kejId={kej.id} bilKed={kej.bilanganKedudukan ?? 3}
              namaKej={kej.namaKejohanan || sekolah?.namaSekolah || 'Kejohanan Olahraga'}
              tarikhMula={kej.tarikhMula} tarikhTamat={kej.tarikhTamat} lokasi={kej.lokasi}
              logoKiri={cfg.logoKiriBase64 || ''} logoKanan={cfg.logoKananBase64 || ''}
            />
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
