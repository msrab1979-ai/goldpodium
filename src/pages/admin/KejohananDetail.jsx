import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'

const Ikon = {
  balik:   <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>,
  trophy:  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>,
  keluar:  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
}

const MODUL = [
  { id: 'pendaftaran', label: 'Pendaftaran Atlet',  hurai: 'Daftar & urus atlet yang menyertai',      warna: 'from-blue-500 to-blue-600',   ikon: '👤' },
  { id: 'kategori',   label: 'Kategori & Acara',    hurai: 'Tetapkan kategori, acara & jadual',        warna: 'from-purple-500 to-purple-600', ikon: '🏷️' },
  { id: 'startlist',  label: 'Start List',          hurai: 'Jana & cetak start list peserta',          warna: 'from-amber-500 to-amber-600',  ikon: '📋' },
  { id: 'keputusan',  label: 'Input Keputusan',     hurai: 'Rekod masa & kedudukan acara',             warna: 'from-green-500 to-green-600',  ikon: '⏱️' },
  { id: 'medal',      label: 'Medal Tally',         hurai: 'Kiraan pingat mengikut sekolah',           warna: 'from-yellow-500 to-yellow-600', ikon: '🥇' },
  { id: 'laporan',    label: 'Laporan & Cetakan',   hurai: 'Buku kejohanan, keputusan, sijil',         warna: 'from-red-500 to-red-600',      ikon: '📄' },
]

const STATUS_LABEL = { aktif: 'Sedang Berlangsung', draf: 'Draf', selesai: 'Selesai' }
const STATUS_WARNA = {
  aktif:   'bg-green-100 text-green-700',
  draf:    'bg-yellow-100 text-yellow-700',
  selesai: 'bg-gray-100 text-gray-500',
}

export default function KejohananDetail() {
  const { kejId } = useParams()
  const { userData, logout } = useAuth()
  const navigate = useNavigate()

  const isSuperadmin = userData?.role === 'superadmin'
  const viewSchoolId = isSuperadmin
    ? (() => { try { return JSON.parse(sessionStorage.getItem('gp_view_school') || '{}').schoolId || '' } catch { return '' } })()
    : null
  const schoolId = viewSchoolId || userData?.schoolId

  const [kej, setKej] = useState(null)
  const [muatTurun, setMuatTurun] = useState(true)

  useEffect(() => {
    if (!schoolId || !kejId) return

    // Cuba baca dari sessionStorage dulu (lebih laju)
    const cached = sessionStorage.getItem('gp_kej_aktif')
    if (cached) {
      try {
        const c = JSON.parse(cached)
        if (c.id === kejId) { setKej(c); setMuatTurun(false); }
      } catch { /* teruskan */ }
    }

    // Ambil data terkini dari Firestore
    getDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId))
      .then(snap => {
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() }
          setKej(data)
          sessionStorage.setItem('gp_kej_aktif', JSON.stringify({ id: data.id, namaKejohanan: data.namaKejohanan, schoolId }))
        }
      })
      .catch(() => { /* langkau */ })
      .finally(() => setMuatTurun(false))
  }, [schoolId, kejId])

  function handleModul(modulId) {
    if (modulId === 'kategori')     { navigate(`/admin/kejohanan/${kejId}/kategori`);    return }
    if (modulId === 'pendaftaran')  { navigate(`/admin/kejohanan/${kejId}/pendaftaran`); return }
    if (modulId === 'startlist')    { navigate(`/admin/kejohanan/${kejId}/startlist`);   return }
    if (modulId === 'keputusan')   { navigate(`/admin/kejohanan/${kejId}/keputusan`);  return }
    if (modulId === 'medal')       { navigate(`/admin/kejohanan/${kejId}/medal`);       return }
    if (modulId === 'laporan')     { navigate(`/admin/kejohanan/${kejId}/laporan`);     return }
    alert(`Modul "${MODUL.find(m => m.id === modulId)?.label}" akan dibina tidak lama lagi.`)
  }

  if (muatTurun) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <svg className="w-6 h-6 animate-spin text-[#003399]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
    )
  }

  const tarikhMula  = kej?.tarikhMula  ? new Date(kej.tarikhMula).toLocaleDateString('ms-MY')  : '—'
  const tarikhTamat = kej?.tarikhTamat ? new Date(kej.tarikhTamat).toLocaleDateString('ms-MY') : '—'

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Banner superadmin mode */}
      {isSuperadmin && (
        <div className="bg-amber-400 text-amber-900 px-4 py-2 flex items-center justify-between text-xs font-bold">
          <span>⚡ Mode Superadmin</span>
          <button onClick={() => { sessionStorage.removeItem('gp_view_school'); navigate('/superadmin') }}
            className="underline hover:no-underline">
            ← Balik ke Panel Superadmin
          </button>
        </div>
      )}

      {/* Header */}
      <header className="bg-[#003399] text-white px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/admin')}
            className="text-white/60 hover:text-white transition-colors p-1 -ml-1">
            {Ikon.balik}
          </button>
          <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center shrink-0">
            {Ikon.trophy}
          </div>
          <div className="min-w-0">
            <p className="text-[9px] text-white/50 uppercase tracking-widest">Gold Podium</p>
            <p className="text-sm font-bold leading-tight truncate">{kej?.namaKejohanan || 'Kejohanan'}</p>
          </div>
        </div>
        <button onClick={async () => { await logout(); navigate('/login') }}
          className="text-white/60 hover:text-white transition-colors p-1.5 flex items-center gap-1.5 text-xs shrink-0">
          {Ikon.keluar}
          <span className="hidden sm:block">Log Keluar</span>
        </button>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">

        {/* Info Kejohanan */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mb-2 ${STATUS_WARNA[kej?.statusKejohanan] || STATUS_WARNA.draf}`}>
                {kej?.statusKejohanan === 'aktif' && <span className="inline-block w-1.5 h-1.5 bg-green-500 rounded-full mr-1 animate-pulse" />}
                {STATUS_LABEL[kej?.statusKejohanan] || 'Draf'}
              </span>
              <h1 className="text-lg font-black text-gray-900">{kej?.namaKejohanan || '—'}</h1>
              <div className="flex flex-wrap gap-3 mt-2">
                {kej?.lokasi && (
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    📍 {kej.lokasi}
                  </span>
                )}
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  📅 {tarikhMula} — {tarikhTamat}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modul Grid */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Modul Pengurusan</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {MODUL.map(m => (
              <button key={m.id} onClick={() => handleModul(m.id)}
                className="bg-white border border-gray-100 rounded-2xl p-4 text-left hover:shadow-md hover:border-[#003399]/20 transition-all group">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${m.warna} flex items-center justify-center text-lg mb-3`}>
                  {m.ikon}
                </div>
                <p className="text-xs font-bold text-gray-800 leading-tight group-hover:text-[#003399] transition-colors">{m.label}</p>
                <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{m.hurai}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Semua modul aktif */}
        <div className="bg-green-50 border border-green-100 rounded-2xl p-4 text-center">
          <p className="text-xs font-bold text-green-700 mb-1">✅ Semua Modul Aktif</p>
          <p className="text-[10px] text-green-600">
            Pendaftaran → Kategori → Start List → Input Keputusan → Medal Tally → Laporan
          </p>
        </div>

      </div>
    </div>
  )
}
