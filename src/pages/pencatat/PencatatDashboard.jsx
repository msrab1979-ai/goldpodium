/**
 * PencatatDashboard — /dashboard
 * Pencatat (teacher role) pilih kejohanan aktif → navigate ke InputKeputusan
 */

import { useState, useEffect } from 'react'
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function PencatatDashboard() {
  const { userData, logout } = useAuth()
  const navigate = useNavigate()
  const schoolId = userData?.schoolId || ''

  const [kejList, setKejList] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!schoolId) { setLoading(false); return }
    getDocs(query(
      collection(db, 'tenants', schoolId, 'kejohanan'),
      orderBy('tarikhMula', 'desc')
    )).then(snap => {
      setKejList(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [schoolId])

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const aktif  = kejList.filter(k => k.statusKejohanan === 'aktif')
  const lain   = kejList.filter(k => k.statusKejohanan !== 'aktif')

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="bg-[#003399] text-white px-4 py-3.5 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-[#003399]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div>
            <p className="text-[9px] text-white/50 uppercase tracking-widest">Gold Podium</p>
            <p className="text-sm font-bold leading-tight">Pencatat</p>
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

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

        <div>
          <p className="text-base font-black text-gray-800">Pilih Kejohanan</p>
          <p className="text-xs text-gray-400 mt-0.5">Klik kejohanan untuk mula input keputusan</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <span className="text-sm">Memuatkan…</span>
          </div>
        ) : kejList.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-sm">Tiada kejohanan berdaftar.</p>
            <p className="text-xs mt-1">Hubungi pentadbir sekolah untuk setup kejohanan.</p>
          </div>
        ) : (
          <>
            {aktif.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-black text-green-600 uppercase tracking-widest">Sedang Aktif</p>
                {aktif.map(k => (
                  <KejCard key={k.id} kej={k} onClick={() => navigate(`/dashboard/kejohanan/${k.id}/keputusan`)} />
                ))}
              </div>
            )}
            {lain.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">Lain-lain</p>
                {lain.map(k => (
                  <KejCard key={k.id} kej={k} onClick={() => navigate(`/dashboard/kejohanan/${k.id}/keputusan`)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function KejCard({ kej, onClick }) {
  const isAktif = kej.statusKejohanan === 'aktif'
  const tarikh = kej.tarikhMula
    ? (kej.tarikhMula.toDate?.()?.toLocaleDateString('ms-MY') || kej.tarikhMula)
    : '—'

  return (
    <button onClick={onClick}
      className={`w-full text-left border rounded-2xl px-4 py-3.5 transition-all active:scale-[0.98] shadow-sm hover:shadow-md ${
        isAktif
          ? 'bg-white border-green-200 hover:border-green-300'
          : 'bg-gray-50 border-gray-100 hover:border-gray-200'
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
