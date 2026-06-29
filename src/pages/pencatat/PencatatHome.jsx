import { useEffect, useState } from 'react'
import { collection, getCountFromServer, query, where, doc, getDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'

function StatCard({ label, value, sub, color, icon }) {
  return (
    <div className="bg-white border border-gray-200 rounded shadow-sm p-4 flex items-start gap-4">
      <div className={`w-10 h-10 rounded flex items-center justify-center shrink-0 ${color}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-800 leading-none">
          {value === null
            ? <span className="inline-block w-10 h-6 bg-gray-100 rounded animate-pulse" />
            : value}
        </p>
        <p className="text-xs font-semibold text-gray-600 mt-1">{label}</p>
        {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export default function PencatatHome() {
  const { userData } = useAuth()
  const schoolId = userData?.schoolId || ''
  const nama     = userData?.name || userData?.nama || userData?.kodAkses || 'Pengguna'

  const [stats, setStats] = useState({ atlet: null, sekolah: null, kejohanan: null, aktif: null })
  const [namaKej, setNamaKej] = useState('')

  useEffect(() => {
    if (!schoolId) return

    async function fetchStats() {
      try {
        const [atletSnap, sekolahSnap, kejSnap] = await Promise.all([
          getCountFromServer(collection(db, 'tenants', schoolId, 'atlet')),
          getCountFromServer(collection(db, 'tenants', schoolId, 'sekolah')),
          getCountFromServer(collection(db, 'tenants', schoolId, 'kejohanan')),
        ])
        const aktifSnap = await getCountFromServer(
          query(collection(db, 'tenants', schoolId, 'kejohanan'), where('statusKejohanan', '==', 'aktif'))
        )
        setStats({
          atlet:     atletSnap.data().count,
          sekolah:   sekolahSnap.data().count,
          kejohanan: kejSnap.data().count,
          aktif:     aktifSnap.data().count,
        })
      } catch {
        setStats({ atlet: 0, sekolah: 0, kejohanan: 0, aktif: 0 })
      }
    }

    async function fetchNamaKej() {
      try {
        const saved = JSON.parse(sessionStorage.getItem('gp_kej_aktif') || '{}')
        if (saved?.id) {
          const snap = await getDoc(doc(db, 'tenants', schoolId, 'kejohanan', saved.id))
          if (snap.exists()) setNamaKej(snap.data().namaKejohanan || '')
        }
      } catch {}
    }

    fetchStats()
    fetchNamaKej()
  }, [schoolId])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg font-bold text-gray-800">Selamat Datang, {nama}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {namaKej ? `Kejohanan aktif: ${namaKej}` : 'Tiada kejohanan dipilih — pergi ke Input Keputusan untuk pilih kejohanan.'}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Jumlah Atlet" value={stats.atlet} sub="Berdaftar dalam sistem"
          color="bg-blue-100 text-blue-700"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
        />
        <StatCard
          label="Jumlah Sekolah" value={stats.sekolah} sub="Sekolah berdaftar"
          color="bg-green-100 text-green-700"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>}
        />
        <StatCard
          label="Kejohanan" value={stats.kejohanan} sub="Semua kejohanan"
          color="bg-yellow-100 text-yellow-700"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>}
        />
        <StatCard
          label="Aktif Sekarang" value={stats.aktif} sub="Kejohanan sedang berjalan"
          color="bg-red-100 text-red-700"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
        />
      </div>
    </div>
  )
}
