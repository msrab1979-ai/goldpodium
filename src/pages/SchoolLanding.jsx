import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { collection, doc, query, where, getDocs, getDoc, limit, orderBy } from 'firebase/firestore'
import { db } from '../firebase/config'

const STATUS_LABEL = { aktif: 'Sedang Berlangsung', draf: 'Akan Datang', selesai: 'Selesai' }
const STATUS_WARNA = {
  aktif:   'bg-green-100 text-green-700 border-green-200',
  draf:    'bg-yellow-100 text-yellow-700 border-yellow-200',
  selesai: 'bg-gray-100 text-gray-500 border-gray-200',
}

export default function SchoolLanding() {
  const { slug } = useParams()
  const navigate = useNavigate()

  const [sekolah,    setSekolah]    = useState(null)
  const [kejohanan,  setKejohanan]  = useState([])
  const [status,     setStatus]     = useState('muatTurun')

  useEffect(() => {
    if (!slug) { setStatus('tidakJumpa'); return }
    const slugBersih = slug.toLowerCase().trim()

    // 1 read: slug → schoolId
    getDocs(query(collection(db, 'slugIndex'), where('__name__', '==', slugBersih), limit(1)))
      .then(async snap => {
        // Sokong slugIndex lama (doc ID = slug) dan baru
        let idxData = null
        if (!snap.empty) {
          idxData = snap.docs[0].data()
        } else {
          // Cuba baca terus by doc ID (slug = doc ID)
          const direct = await getDoc(doc(db, 'slugIndex', slugBersih))
          if (direct.exists()) idxData = direct.data()
        }
        if (!idxData) { setStatus('tidakJumpa'); return }
        if (idxData.aktif === false) {
          setSekolah({ namaSekolah: idxData.namaSekolah || '' })
          setStatus('tidakAktif'); return
        }

        const { schoolId } = idxData

        // 2 reads serentak: tenant info + senarai kejohanan
        const [tenantSnap, kSnap] = await Promise.all([
          getDoc(doc(db, 'tenants', schoolId)),
          getDocs(query(
            collection(db, 'tenants', schoolId, 'kejohanan'),
            orderBy('tarikhMula', 'desc'),
            limit(10)
          )).catch(() => ({ docs: [] })),
        ])

        if (!tenantSnap.exists()) { setStatus('tidakJumpa'); return }
        const tenant = tenantSnap.data()
        setSekolah({ ...tenant, schoolId })
        setKejohanan(kSnap.docs.map(d => ({ id: d.id, ...d.data() })))
        setStatus('jumpa')
      })
      .catch(() => setStatus('tidakJumpa'))
  }, [slug])

  if (status === 'muatTurun') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#003399] to-[#002277] flex items-center justify-center">
        <svg className="w-8 h-8 animate-spin text-white/60" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
    )
  }

  if (status === 'tidakJumpa') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#003399] to-[#002277] flex flex-col items-center justify-center px-4 text-center">
        <p className="text-4xl mb-4">🔍</p>
        <h1 className="text-xl font-black text-white mb-2">Halaman Tidak Dijumpai</h1>
        <p className="text-sm text-white/50">Pautan <span className="font-mono text-white/70">/{slug}</span> tidak wujud.</p>
      </div>
    )
  }

  if (status === 'tidakAktif') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#003399] to-[#002277] flex flex-col items-center justify-center px-4 text-center">
        <p className="text-4xl mb-4">⚠️</p>
        <h1 className="text-xl font-black text-white mb-2">Sistem Ditangguhkan</h1>
        <p className="text-sm text-white/50">{sekolah?.namaSekolah} — hubungi penganjur.</p>
      </div>
    )
  }

  const kAktif   = kejohanan.filter(k => k.status === 'aktif')
  const kLain    = kejohanan.filter(k => k.status !== 'aktif')

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="bg-[#003399] text-white px-4 py-4 shadow-lg">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-yellow-400 rounded-xl flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-[#003399]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </div>
            <div>
              <p className="text-[9px] text-white/50 uppercase tracking-widest font-bold">Gold Podium</p>
              <p className="text-sm font-black leading-tight">{sekolah?.namaSekolah}</p>
              {sekolah?.daerah && <p className="text-[10px] text-white/50">{sekolah.daerah}</p>}
            </div>
          </div>
          <button
            onClick={() => navigate('/login', { state: { schoolSlug: slug, namaSekolah: sekolah?.namaSekolah } })}
            className="text-[11px] font-bold bg-white/10 hover:bg-white/20 border border-white/20 text-white px-3 py-2 rounded-xl transition-colors flex items-center gap-1.5 shrink-0">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
            Login Admin
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* Kejohanan Aktif */}
        {kAktif.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">🔴 Sedang Berlangsung</p>
            <div className="space-y-3">
              {kAktif.map(k => (
                <KadKejohanan key={k.id} k={k} />
              ))}
            </div>
          </div>
        )}

        {/* Kejohanan Lain */}
        {kLain.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Senarai Kejohanan</p>
            <div className="space-y-3">
              {kLain.map(k => (
                <KadKejohanan key={k.id} k={k} />
              ))}
            </div>
          </div>
        )}

        {kejohanan.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center shadow-sm">
            <p className="text-4xl mb-3">🏆</p>
            <p className="text-sm font-bold text-gray-700">Tiada kejohanan lagi</p>
            <p className="text-xs text-gray-400 mt-1">Kejohanan akan dipaparkan di sini setelah didaftarkan oleh admin.</p>
          </div>
        )}

      </div>

      <p className="text-center text-[10px] text-gray-300 pb-8">Gold Podium · Pengurusan Kejohanan Sukan</p>
    </div>
  )
}

function KadKejohanan({ k }) {
  const tarikhMula  = k.tarikhMula  ? new Date(k.tarikhMula).toLocaleDateString('ms-MY',  { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
  const tarikhTamat = k.tarikhTamat ? new Date(k.tarikhTamat).toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' }) : null

  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-4 ${k.status === 'aktif' ? 'border-green-200 ring-1 ring-green-100' : 'border-gray-100'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full border mb-2 ${STATUS_WARNA[k.status] || STATUS_WARNA.draf}`}>
            {k.status === 'aktif' && <span className="inline-block w-1.5 h-1.5 bg-green-500 rounded-full mr-1 animate-pulse" />}
            {STATUS_LABEL[k.status] || k.status}
          </span>
          <p className="font-black text-gray-900 text-sm leading-tight">{k.nama || '—'}</p>
          <div className="flex flex-wrap gap-3 mt-1.5">
            {k.lokasi && (
              <span className="text-[10px] text-gray-400 flex items-center gap-1">📍 {k.lokasi}</span>
            )}
            <span className="text-[10px] text-gray-400 flex items-center gap-1">
              📅 {tarikhMula}{tarikhTamat ? ` — ${tarikhTamat}` : ''}
            </span>
          </div>
        </div>
        <div className="w-10 h-10 bg-gradient-to-br from-[#003399] to-[#0044cc] rounded-xl flex items-center justify-center shrink-0">
          <span className="text-lg">🏆</span>
        </div>
      </div>
    </div>
  )
}
