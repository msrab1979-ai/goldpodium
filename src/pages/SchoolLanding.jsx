import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  collection, doc, query, getDocs, getDoc,
  orderBy, limit, onSnapshot,
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

function formatTarikhPendek(str) {
  if (!str) return '—'
  const d = new Date(str + 'T00:00:00')
  return d.toLocaleDateString('ms-MY', { weekday: 'short', day: 'numeric', month: 'short' })
}

const JENIS_LABEL = {
  lorong:        'Larian',
  mass_start:    'Mass Start',
  padang_lompat: 'Lompat',
  padang_balin:  'Balin',
  relay:         'Relay',
}

const FASA_LABEL = {
  heat: 'Heat', saringan: 'Saringan', final: 'Final',
  terus_final: 'Final', suku_akhir: 'S/Akhir', separuh_akhir: 'S/Akhir',
}

// ─── Panel Keputusan ──────────────────────────────────────────────────────────

function PanelKeputusan({ acara, heats }) {
  const isPadang = ['padang_lompat', 'padang_balin'].includes(acara.jenisAcara)
  const isRelay  = acara.jenisAcara === 'relay'

  const heatsAda    = heats.filter(h => ['rasmi', 'diterima'].includes(h.statusKeputusan))
  const finalHeats  = heatsAda.filter(h => ['final', 'terus_final'].includes(h.fasa))
  const displayHeats = finalHeats.length > 0 ? finalHeats : heatsAda

  // Papar start list jika belum ada keputusan
  if (displayHeats.length === 0) {
    const heatsAdaPeserta = heats.filter(h => (h.peserta || []).length > 0)
    if (heatsAdaPeserta.length === 0) return null
    return (
      <div className="px-3 py-3 space-y-3">
        {heatsAdaPeserta.map((heat, idx) => (
          <div key={heat.id || idx}>
            {heatsAdaPeserta.length > 1 && (
              <p className="text-[10px] font-bold text-[#003399] uppercase tracking-wide mb-1">
                📋 {FASA_LABEL[heat.fasa] || 'Heat'} {heat.noHeat}
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
                      <td className="py-1 font-semibold text-gray-800">
                        {isRelay ? (p.kodSekolah || '—') : (p.namaAtlet || '—')}
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

  // Kumpul & susun peserta dari semua heat keputusan
  const allPeserta = []
  displayHeats.forEach(heat => {
    ;(heat.peserta || []).forEach(p => {
      if (p.dns || p.dnf || p.dq) return
      const prestasi = isPadang ? jarakTerbaik(p.cubaan) : masaKeSaat(p.keputusan ?? p.masa)
      if (prestasi !== null) allPeserta.push({ ...p, prestasi })
    })
  })

  allPeserta.sort((a, b) => isPadang
    ? (b.prestasi || 0) - (a.prestasi || 0)
    : (a.prestasi || 9999) - (b.prestasi || 9999))

  const topTiga = allPeserta.slice(0, 3)
  const baki    = allPeserta.slice(3)
  const PINGAT  = ['🥇', '🥈', '🥉']

  return (
    <div className="px-3 py-3">
      <div className="space-y-1.5 mb-2">
        {topTiga.map((p, i) => (
          <div key={i} className={`flex items-center gap-2 rounded-xl px-3 py-2 ${
            i === 0 ? 'bg-yellow-50 border border-yellow-200' :
            i === 1 ? 'bg-gray-50  border border-gray-200'   :
                      'bg-orange-50 border border-orange-100'
          }`}>
            <span className="text-base">{PINGAT[i]}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-gray-900 truncate">
                {isRelay ? (p.kodSekolah || '—') : (p.namaAtlet || '—')}
              </p>
              {!isRelay && p.namaSekolah && (
                <p className="text-[10px] text-gray-400 truncate">{p.namaSekolah}</p>
              )}
            </div>
            <p className="text-xs font-black font-mono text-[#003399] shrink-0">
              {isPadang ? fmtJarak(p.prestasi) : fmtMasa(p.prestasi)}
            </p>
          </div>
        ))}
      </div>
      {baki.length > 0 && (
        <table className="w-full text-[11px]">
          <tbody>
            {baki.map((p, i) => (
              <tr key={i} className="border-b border-gray-50">
                <td className="py-1 w-6 text-center text-gray-400 font-bold">{i + 4}</td>
                <td className="py-1 font-semibold text-gray-700">
                  {isRelay ? (p.kodSekolah || '—') : (p.namaAtlet || '—')}
                </td>
                <td className="py-1 text-right font-mono text-gray-600 font-bold">
                  {isPadang ? fmtJarak(p.prestasi) : fmtMasa(p.prestasi)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── Tab Jadual & Keputusan ───────────────────────────────────────────────────

function TabJadual({ schoolId, kejId }) {
  const [acara,    setAcara]    = useState([])
  const [heatsMap, setHeatsMap] = useState({})
  const [loading,  setLoading]  = useState(true)
  const [terbuka,  setTerbuka]  = useState(null)
  const unsubAcara = useRef(null)
  const unsubHeat  = useRef(null)

  useEffect(() => {
    if (!schoolId || !kejId) return
    setLoading(true)

    if (unsubAcara.current) unsubAcara.current()
    if (unsubHeat.current)  unsubHeat.current()

    unsubAcara.current = onSnapshot(
      query(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'acara'), orderBy('noAcara')),
      snap => { setAcara(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false) },
      () => setLoading(false)
    )

    unsubHeat.current = onSnapshot(
      collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat'),
      snap => {
        const hm = {}
        snap.docs.forEach(d => {
          const h   = { id: d.id, ...d.data() }
          const aid = h.aceraId || h.acaraId
          if (aid) { if (!hm[aid]) hm[aid] = []; hm[aid].push(h) }
        })
        setHeatsMap(hm)
      },
      () => {}
    )

    return () => {
      if (unsubAcara.current) unsubAcara.current()
      if (unsubHeat.current)  unsubHeat.current()
    }
  }, [schoolId, kejId])

  if (loading) return <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-[#003399] border-t-transparent rounded-full animate-spin"/></div>
  if (acara.length === 0) return <p className="text-center text-xs text-gray-400 py-10">Tiada acara didaftarkan.</p>

  // Kumpul mengikut tarikhAcara
  const hariMap = {}
  acara.forEach(a => {
    const tarikh = a.tarikhAcara || 'Belum Ditetapkan'
    if (!hariMap[tarikh]) hariMap[tarikh] = []
    hariMap[tarikh].push(a)
  })
  const hariKeys = Object.keys(hariMap).sort()

  return (
    <div className="space-y-4 py-2">
      {hariKeys.map(hari => (
        <div key={hari}>
          <div className="flex items-center gap-2 px-4 mb-2">
            <div className="h-px flex-1 bg-gray-100" />
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              {hari === 'Belum Ditetapkan' ? hari : formatTarikhPendek(hari)}
            </p>
            <div className="h-px flex-1 bg-gray-100" />
          </div>
          <div className="space-y-0">
            {hariMap[hari]
              .sort((a, b) => (a.masa || '99:99').localeCompare(b.masa || '99:99') || (Number(a.noAcara) || 999) - (Number(b.noAcara) || 999))
              .map(a => {
                const heats = heatsMap[a.id] || []
                const adaKeputusan = a.statusAcara === 'ada_keputusan' || heats.some(h => ['rasmi','diterima'].includes(h.statusKeputusan))
                const adaHeat      = heats.length > 0
                const dibuka = terbuka === a.id

                return (
                  <div key={a.id} className="border-b border-gray-50 last:border-0">
                    <button
                      onClick={() => setTerbuka(dibuka ? null : a.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                      <div className="w-8 h-8 rounded-lg bg-[#003399]/5 flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-black text-[#003399]">{a.noAcara || '—'}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-900 truncate">{a.namaAcara || a.namaAcaraPendek || '—'}</p>
                        <p className="text-[10px] text-gray-400">
                          {a.masa && <span>{a.masa} · </span>}
                          {a.kategoriKod || ''}{a.jantina ? ` · ${a.jantina}` : ''} · {JENIS_LABEL[a.jenisAcara] || a.jenisAcara || '—'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {adaKeputusan && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full">Keputusan</span>
                        )}
                        {!adaKeputusan && adaHeat && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">Start List</span>
                        )}
                        <svg className={`w-3.5 h-3.5 text-gray-300 transition-transform ${dibuka ? 'rotate-180' : ''}`}
                          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>
                    {dibuka && (
                      <div className="bg-gray-50/60 border-t border-gray-100">
                        <PanelKeputusan acara={a} heats={heats} />
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        </div>
      ))}
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
          return (a.namaSekolah || a.kodSekolah || '').localeCompare(b.namaSekolah || b.kodSekolah || '')
        })
        setTally(rows)
        setLoading(false)
      },
      () => setLoading(false)
    )
    return () => { if (unsubRef.current) unsubRef.current() }
  }, [schoolId, kejId])

  if (loading) return <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-[#003399] border-t-transparent rounded-full animate-spin"/></div>
  if (tally.length === 0) return <p className="text-center text-xs text-gray-400 py-10">Tiada keputusan final lagi.</p>

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wide border-b border-gray-100">
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
            <tr key={t.id || t.kodSekolah} className={`border-b border-gray-50 ${i === 0 ? 'bg-yellow-50/40' : ''}`}>
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
          getDocs(query(
            collection(db, 'tenants', sId, 'kejohanan'),
            orderBy('createdAt', 'desc'), limit(10)
          )).catch(() => ({ docs: [] })),
        ])

        if (!tenantSnap.exists()) { setStatus('tidakJumpa'); return }
        setSekolah(tenantSnap.data())

        const semuaKej = kSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        setAllKej(semuaKej)

        // Pilih: aktif dulu, kemudian terkini
        const aktifKej = semuaKej.find(k => k.statusKejohanan === 'aktif') || semuaKej[0] || null
        setKej(aktifKej)
        setStatus('jumpa')
      })
      .catch(() => setStatus('tidakJumpa'))
  }, [slug])

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

  const tarikhMula  = formatTarikh(kej?.tarikhMula)
  const tarikhTamat = formatTarikh(kej?.tarikhTamat)

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <div className="bg-[#003399] text-white">
        <div className="max-w-2xl mx-auto px-4 pt-5 pb-4">

          {/* Baris atas: logo + login */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-yellow-400 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-[#003399]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
              </div>
              <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Gold Podium</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/pengurus/login', { state: { schoolSlug: slug, schoolId, namaSekolah: sekolah?.namaSekolah } })}
                className="text-[11px] font-bold bg-white/10 hover:bg-white/20 border border-white/20 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Pengurus
              </button>
              <button
                onClick={() => navigate('/login', { state: { schoolSlug: slug, schoolId, namaSekolah: sekolah?.namaSekolah } })}
                className="text-[11px] font-bold bg-white/10 hover:bg-white/20 border border-white/20 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                </svg>
                Admin
              </button>
            </div>
          </div>

          {/* Info kejohanan */}
          {kej ? (
            <>
              <h1 className="text-base font-black leading-tight mb-0.5">{kej.namaKejohanan || '—'}</h1>
              <p className="text-[11px] text-white/50 mb-2">{sekolah?.namaSekolah}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/60">
                {kej.lokasi && <span>📍 {kej.lokasi}</span>}
                {tarikhMula !== '—' && (
                  <span>📅 {tarikhMula}{tarikhTamat && tarikhTamat !== tarikhMula ? ` — ${tarikhTamat}` : ''}</span>
                )}
                {kej.statusKejohanan === 'aktif' && (
                  <span className="text-green-300 font-bold">🟢 Sedang Berlangsung</span>
                )}
              </div>

              {/* Pilih kejohanan lain */}
              {allKej.length > 1 && (
                <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-hide">
                  {allKej.map(k => (
                    <button key={k.id} onClick={() => { setKej(k); setTab('jadual') }}
                      className={`shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors ${
                        kej.id === k.id
                          ? 'bg-white text-[#003399] border-white'
                          : 'text-white/60 border-white/20 hover:border-white/40'
                      }`}>
                      {k.namaKejohanan || k.id}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div>
              <p className="text-sm font-bold text-white/80 mb-0.5">{sekolah?.namaSekolah}</p>
              <p className="text-xs text-white/40">Tiada kejohanan aktif. Login admin untuk setup.</p>
            </div>
          )}
        </div>

        {/* Tab bar */}
        {kej && (
          <div className="max-w-2xl mx-auto flex border-t border-white/10">
            {[
              { id: 'jadual', label: '📋 Jadual & Keputusan' },
              { id: 'medal',  label: '🏅 Medal Tally' },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex-1 py-3 text-[11px] font-bold transition-colors ${
                  tab === t.id
                    ? 'text-white border-b-2 border-yellow-400'
                    : 'text-white/40 hover:text-white/70'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Kandungan tab */}
      <div className="max-w-2xl mx-auto">
        {kej && tab === 'jadual' && <TabJadual     schoolId={schoolId} kejId={kej.id} />}
        {kej && tab === 'medal'  && <TabMedalTally schoolId={schoolId} kejId={kej.id} />}

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
