/**
 * PencatatDashboard — /dashboard
 * Tab 1: Pilih Kejohanan → navigate ke InputKeputusan
 * Tab 2: Semak Jadual (read-only, real-time, by hari)
 * Tab 3: Semak Keputusan (read-only, real-time)
 */

import { useState, useEffect, useRef } from 'react'
import {
  collection, getDocs, query, orderBy, onSnapshot, where,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import { useNavigate, useParams } from 'react-router-dom'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTarikh(str) {
  if (!str) return '—'
  try { return new Date(str).toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return str }
}

function fmtMasa(saat) {
  if (saat === '' || saat == null) return '—'
  const n = Number(saat)
  if (isNaN(n) || n <= 0) return '—'
  const m = Math.floor(n / 60)
  const s = (n % 60).toFixed(2).padStart(5, '0')
  return m > 0 ? `${m}:${s}` : `${Number(s).toFixed(2)}s`
}

function hariList(tarikhMula, tarikhTamat) {
  if (!tarikhMula || !tarikhTamat) return []
  const hasil = []
  const mula  = new Date(tarikhMula)
  const tamat = new Date(tarikhTamat)
  for (let d = new Date(mula); d <= tamat; d.setDate(d.getDate() + 1)) {
    hasil.push(d.toISOString().split('T')[0])
  }
  return hasil
}

const HARI_SINGKAT = ['Ahd', 'Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab']
function namaHari(str) {
  try { return HARI_SINGKAT[new Date(str).getDay()] } catch { return '' }
}

// ─── Tab Pilih Kejohanan ──────────────────────────────────────────────────────

function TabKejohanan({ schoolId, onSelect }) {
  const navigate  = useNavigate()
  const [list, setList]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!schoolId) { setLoading(false); return }
    getDocs(query(
      collection(db, 'tenants', schoolId, 'kejohanan'),
      orderBy('tarikhMula', 'desc')
    )).then(snap => setList(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [schoolId])

  const aktif = list.filter(k => k.statusKejohanan === 'aktif')
  const lain  = list.filter(k => k.statusKejohanan !== 'aktif')

  if (loading) return <Spinner />

  if (list.length === 0) return (
    <div className="text-center py-16 text-gray-400">
      <p className="text-sm">Tiada kejohanan berdaftar.</p>
      <p className="text-xs mt-1">Hubungi pentadbir sekolah untuk setup kejohanan.</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">Klik kejohanan untuk mula input keputusan</p>

      {aktif.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-black text-green-600 uppercase tracking-widest">Sedang Aktif</p>
          {aktif.map(k => (
            <KejCard key={k.id} kej={k}
              onClick={() => { onSelect(k); navigate(`/${slug}/pencatat/kejohanan/${k.id}/keputusan`) }} />
          ))}
        </div>
      )}
      {lain.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Lain-lain</p>
          {lain.map(k => (
            <KejCard key={k.id} kej={k}
              onClick={() => { onSelect(k); navigate(`/${slug}/pencatat/kejohanan/${k.id}/keputusan`) }} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tab Semak Jadual ─────────────────────────────────────────────────────────

function TabJadual({ schoolId, kej }) {
  const [acara, setAcara]     = useState([])
  const [loading, setLoading] = useState(true)
  const [hariIdx, setHariIdx] = useState(0)
  const unsubRef = useRef(null)

  const hari = kej ? hariList(kej.tarikhMula, kej.tarikhTamat) : []

  useEffect(() => {
    if (!schoolId || !kej) { setLoading(false); return }

    setLoading(true)
    if (unsubRef.current) unsubRef.current()

    unsubRef.current = onSnapshot(
      query(
        collection(db, 'tenants', schoolId, 'kejohanan', kej.id, 'acara'),
        orderBy('noAcara', 'asc')
      ),
      snap => {
        setAcara(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      () => setLoading(false)
    )
    return () => { if (unsubRef.current) unsubRef.current() }
  }, [schoolId, kej?.id])

  // reset ke hari ini bila tukar kejohanan
  useEffect(() => {
    if (!hari.length) return
    const hariIni = new Date().toISOString().split('T')[0]
    const idx = hari.findIndex(h => h === hariIni)
    setHariIdx(idx >= 0 ? idx : 0)
  }, [kej?.id])

  if (!kej) return (
    <div className="text-center py-16 text-gray-400 text-sm">
      Pilih kejohanan dahulu di tab <span className="font-bold">Kejohanan</span>.
    </div>
  )

  const tarikhPilih = hari[hariIdx] || ''
  const acaraHari   = acara.filter(a => a.tarikhAcara === tarikhPilih)
    .sort((a, b) => {
      const tA = a.masa || '99:99'
      const tB = b.masa || '99:99'
      return tA.localeCompare(tB) || (a.noAcara || 0) - (b.noAcara || 0)
    })

  return (
    <div className="space-y-3">

      {/* Nama kejohanan */}
      <div className="bg-[#003399]/5 border border-[#003399]/10 rounded-xl px-3 py-2.5">
        <p className="text-[10px] text-[#003399]/60 uppercase tracking-widest font-bold">Kejohanan</p>
        <p className="text-sm font-bold text-[#003399]">{kej.namaKejohanan}</p>
      </div>

      {/* Pilih hari */}
      {hari.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {hari.map((h, i) => (
            <button key={h} onClick={() => setHariIdx(i)}
              className={`shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                i === hariIdx
                  ? 'bg-[#003399] text-white shadow'
                  : 'bg-white border border-gray-200 text-gray-500 hover:border-[#003399]/30'
              }`}>
              <span className="block text-center">{namaHari(h)}</span>
              <span className="block text-center text-[10px] opacity-70">
                {new Date(h).getDate()}/{new Date(h).getMonth() + 1}
              </span>
            </button>
          ))}
        </div>
      )}

      {loading ? <Spinner /> : acaraHari.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">
          Tiada acara untuk hari ini.
        </div>
      ) : (
        <div className="space-y-2">
          {acaraHari.map(a => (
            <JadualRow key={a.id} acara={a} />
          ))}
        </div>
      )}
    </div>
  )
}

function JadualRow({ acara }) {
  const statusWarna = acara.ada_keputusan
    ? 'bg-green-100 text-green-700 border-green-200'
    : 'bg-yellow-50 text-yellow-700 border-yellow-200'
  const statusLabel = acara.ada_keputusan ? 'Selesai' : 'Belum'

  return (
    <div className="bg-white border border-gray-100 rounded-xl px-3.5 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="text-center shrink-0 w-9">
          <p className="text-[10px] text-gray-400 leading-none">No</p>
          <p className="text-sm font-black text-[#003399]">{acara.noAcara ?? '—'}</p>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-800 truncate">{acara.namaAcara || '—'}</p>
          <p className="text-[11px] text-gray-400 leading-tight truncate">
            {acara.jantina === 'L' ? 'L' : acara.jantina === 'P' ? 'P' : (acara.jantina || '')}
            {acara.kategoriKod ? ` · ${acara.kategoriKod}` : ''}
            {acara.masa ? ` · ${acara.masa}` : ''}
          </p>
        </div>
      </div>
      <span className={`shrink-0 text-[9px] font-black px-2 py-0.5 rounded-full border ${statusWarna}`}>
        {statusLabel}
      </span>
    </div>
  )
}

// ─── Tab Semak Keputusan ──────────────────────────────────────────────────────

function TabKeputusan({ schoolId, kej }) {
  const [acara, setAcara]     = useState([])
  const [heats, setHeats]     = useState([])
  const [loading, setLoading] = useState(true)
  const [pilihAcara, setPilihAcara] = useState(null)
  const unsubAcara = useRef(null)
  const unsubHeat  = useRef(null)

  useEffect(() => {
    if (!schoolId || !kej) { setLoading(false); return }

    setLoading(true)
    if (unsubAcara.current) unsubAcara.current()

    unsubAcara.current = onSnapshot(
      query(
        collection(db, 'tenants', schoolId, 'kejohanan', kej.id, 'acara'),
        where('statusAcara', '==', 'ada_keputusan')
      ),
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        list.sort((a, b) => (a.noAcara || 0) - (b.noAcara || 0))
        setAcara(list)
        setLoading(false)
      },
      () => setLoading(false)
    )
    return () => { if (unsubAcara.current) unsubAcara.current() }
  }, [schoolId, kej?.id])

  useEffect(() => {
    if (!pilihAcara || !schoolId || !kej) { setHeats([]); return }

    if (unsubHeat.current) unsubHeat.current()

    unsubHeat.current = onSnapshot(
      query(
        collection(db, 'tenants', schoolId, 'kejohanan', kej.id, 'heat'),
        where('aceraId', '==', pilihAcara.id)
      ),
      snap => setHeats(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {}
    )
    return () => { if (unsubHeat.current) unsubHeat.current() }
  }, [pilihAcara?.id, schoolId, kej?.id])

  if (!kej) return (
    <div className="text-center py-16 text-gray-400 text-sm">
      Pilih kejohanan dahulu di tab <span className="font-bold">Kejohanan</span>.
    </div>
  )

  if (loading) return <Spinner />

  if (pilihAcara) return (
    <div className="space-y-3">
      <button onClick={() => { setPilihAcara(null); setHeats([]) }}
        className="flex items-center gap-1.5 text-xs text-[#003399] font-bold hover:underline">
        ← Balik ke senarai acara
      </button>

      <div className="bg-[#003399]/5 border border-[#003399]/10 rounded-xl px-3 py-2.5">
        <p className="text-[10px] text-[#003399]/60 uppercase tracking-widest font-bold">Acara #{pilihAcara.noAcara}</p>
        <p className="text-sm font-bold text-[#003399]">{pilihAcara.namaAcara}</p>
        <p className="text-[11px] text-[#003399]/60">
          {pilihAcara.jantina === 'L' ? 'Lelaki' : pilihAcara.jantina === 'P' ? 'Perempuan' : pilihAcara.jantina}
          {pilihAcara.kategoriKod ? ` · ${pilihAcara.kategoriKod}` : ''}
        </p>
      </div>

      {heats.length === 0 ? (
        <p className="text-center py-8 text-gray-400 text-sm">Tiada heat ditemui.</p>
      ) : heats.map(h => <HeatKeputusan key={h.id} heat={h} />)}
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="bg-[#003399]/5 border border-[#003399]/10 rounded-xl px-3 py-2.5">
        <p className="text-[10px] text-[#003399]/60 uppercase tracking-widest font-bold">Kejohanan</p>
        <p className="text-sm font-bold text-[#003399]">{kej.namaKejohanan}</p>
      </div>

      {acara.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">
          Belum ada keputusan yang dihantar.
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            {acara.length} acara ada keputusan — klik untuk lihat
          </p>
          {acara.map(a => (
            <button key={a.id} onClick={() => setPilihAcara(a)}
              className="w-full text-left bg-white border border-gray-100 rounded-xl px-3.5 py-3 hover:border-[#003399]/30 hover:shadow-sm transition-all flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="text-center shrink-0 w-9">
                  <p className="text-[10px] text-gray-400 leading-none">No</p>
                  <p className="text-sm font-black text-[#003399]">{a.noAcara ?? '—'}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-800 truncate">{a.namaAcara || '—'}</p>
                  <p className="text-[11px] text-gray-400">
                    {a.jantina === 'L' ? 'L' : a.jantina === 'P' ? 'P' : a.jantina}
                    {a.kategoriKod ? ` · ${a.kategoriKod}` : ''}
                  </p>
                </div>
              </div>
              <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function HeatKeputusan({ heat }) {
  const keputusan = heat.keputusan || {}
  const isLorong  = heat.jenisAcara === 'lorong' || heat.jenisAcara === 'relay'
  const isPadang  = heat.jenisAcara === 'padang_lompat' || heat.jenisAcara === 'padang_balin'
  const isMass    = heat.jenisAcara === 'mass_start'

  const fasaLabel = heat.fasa === 'final' ? 'Final'
    : heat.fasa === 'saringan' || heat.fasa === 'heat' ? `Heat ${heat.noHeat || ''}`
    : heat.fasa === 'terus_final' ? 'Terus Final'
    : heat.fasa || `Heat ${heat.noHeat || ''}`

  // Bina senarai peserta dengan keputusan
  let rows = []

  if (isLorong || isMass) {
    const slots = Array.from({ length: heat.bilanganLorong || 8 }, (_, i) => i + 1)
    rows = slots.map(s => {
      const kp = keputusan[s] || {}
      return {
        key: s,
        label: `Lorong ${s}`,
        nama: kp.nama || kp.namaAtlet || '—',
        pasukan: kp.pasukan || kp.namaSekolah || '',
        keputusan: kp.keputusan,
        status: kp.status,
        tempat: kp.tempat,
      }
    }).filter(r => r.nama !== '—')
      .sort((a, b) => (a.tempat || 99) - (b.tempat || 99))
  } else if (isPadang) {
    Object.entries(keputusan).forEach(([key, kp]) => {
      rows.push({
        key,
        label: '',
        nama: kp.nama || kp.namaAtlet || key,
        pasukan: kp.pasukan || kp.namaSekolah || '',
        keputusan: kp.keputusan,
        status: kp.status,
        tempat: kp.tempat,
      })
    })
    rows.sort((a, b) => (a.tempat || 99) - (b.tempat || 99))
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-100 px-3.5 py-2 flex items-center justify-between">
        <p className="text-xs font-black text-gray-700">{fasaLabel}</p>
        {heat.windSpeed != null && (
          <p className="text-[11px] text-gray-400">Angin: {heat.windSpeed > 0 ? '+' : ''}{heat.windSpeed} m/s</p>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-center py-4 text-gray-400 text-xs">Tiada keputusan.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {rows.map(r => (
            <div key={r.key} className="flex items-center gap-3 px-3.5 py-2.5">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                r.tempat === 1 ? 'bg-yellow-400 text-yellow-900'
                : r.tempat === 2 ? 'bg-gray-300 text-gray-700'
                : r.tempat === 3 ? 'bg-orange-300 text-orange-900'
                : 'bg-gray-100 text-gray-500'
              }`}>
                {r.status ? r.status : (r.tempat || '—')}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{r.nama}</p>
                {r.pasukan && <p className="text-[11px] text-gray-400 truncate">{r.pasukan}</p>}
              </div>
              <p className="text-sm font-black text-[#003399] shrink-0">
                {r.status ? r.status : fmtMasa(r.keputusan)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Shared Components ────────────────────────────────────────────────────────

function KejCard({ kej, onClick }) {
  const isAktif = kej.statusKejohanan === 'aktif'
  const tarikh  = kej.tarikhMula
    ? (kej.tarikhMula.toDate?.()?.toLocaleDateString('ms-MY') || kej.tarikhMula)
    : '—'

  return (
    <button onClick={onClick}
      className={`w-full text-left border rounded-2xl px-4 py-3.5 transition-all active:scale-[0.98] shadow-sm hover:shadow-md ${
        isAktif ? 'bg-white border-green-200 hover:border-green-300' : 'bg-gray-50 border-gray-100 hover:border-gray-200'
      }`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-gray-800 truncate">{kej.namaKejohanan || '—'}</p>
            {isAktif && (
              <span className="shrink-0 text-[9px] font-black bg-green-500 text-white px-1.5 py-0.5 rounded-full">AKTIF</span>
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">{tarikh} · {kej.lokasi || '—'}</p>
        </div>
        <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  )
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      <span className="text-sm">Memuatkan…</span>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'kejohanan', label: 'Kejohanan', ikon: '🏆' },
  { id: 'jadual',    label: 'Jadual',    ikon: '📅' },
  { id: 'keputusan', label: 'Keputusan', ikon: '📋' },
]

export default function PencatatDashboard() {
  const { userData, logout } = useAuth()
  const navigate = useNavigate()
  const { slug }  = useParams()
  const schoolId  = userData?.schoolId || ''

  const [tab, setTab]         = useState('kejohanan')
  const [kejAktif, setKejAktif] = useState(null)

  // Cuba muat kejohanan aktif dari sessionStorage (dari sesi lepas)
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('gp_kej_aktif') || '{}')
      if (saved?.id && saved?.namaKejohanan) setKejAktif(saved)
    } catch {}
  }, [])

  function handleSelect(kej) {
    setKejAktif(kej)
    sessionStorage.setItem('gp_kej_aktif', JSON.stringify({
      id: kej.id, namaKejohanan: kej.namaKejohanan, schoolId
    }))
  }

  async function handleLogout() {
    await logout()
    navigate(`/${slug}`)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* Header */}
      <header className="bg-[#003399] text-white px-4 py-3.5 flex items-center justify-between shadow-lg shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-[#003399]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div>
            <p className="text-[9px] text-white/50 uppercase tracking-widest">Gold Podium</p>
            <p className="text-sm font-bold leading-tight">
              Pencatat{kejAktif ? ` · ${kejAktif.namaKejohanan}` : ''}
            </p>
          </div>
        </div>
        <button onClick={handleLogout}
          className="flex items-center gap-1.5 text-white/60 hover:text-white text-xs transition-colors px-2 py-1.5 rounded-lg hover:bg-white/10">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Log Keluar
        </button>
      </header>

      {/* Tab Bar */}
      <div className="bg-white border-b border-gray-100 flex shrink-0">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-3 flex flex-col items-center gap-0.5 text-[10px] font-bold transition-colors border-b-2 ${
              tab === t.id
                ? 'border-[#003399] text-[#003399]'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}>
            <span className="text-base leading-none">{t.ikon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 max-w-lg mx-auto w-full px-4 py-5 overflow-y-auto">
        {tab === 'kejohanan' && (
          <TabKejohanan schoolId={schoolId} onSelect={handleSelect} />
        )}
        {tab === 'jadual' && (
          <TabJadual schoolId={schoolId} kej={kejAktif} />
        )}
        {tab === 'keputusan' && (
          <TabKeputusan schoolId={schoolId} kej={kejAktif} />
        )}
      </div>
    </div>
  )
}
