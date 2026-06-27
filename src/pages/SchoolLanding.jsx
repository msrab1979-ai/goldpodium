import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { collection, query, where, getDocs, limit } from 'firebase/firestore'
import { db } from '../firebase/config'

export default function SchoolLanding() {
  const { slug } = useParams()
  const navigate = useNavigate()

  const [sekolah, setSekolah] = useState(null)
  const [status,  setStatus]  = useState('muatTurun') // 'muatTurun' | 'jumpa' | 'tidakJumpa'

  useEffect(() => {
    if (!slug) { setStatus('tidakJumpa'); return }

    const slugBersih = slug.toLowerCase().trim()

    getDocs(
      query(collection(db, 'slugIndex'), where('slug', '==', slugBersih), limit(1))
    )
      .then(snap => {
        if (snap.empty) { setStatus('tidakJumpa'); return }
        const data = snap.docs[0].data()
        setSekolah(data)
        setStatus(data.aktif === false ? 'tidakAktif' : 'jumpa')
      })
      .catch(() => setStatus('tidakJumpa'))
  }, [slug])

  if (status === 'muatTurun') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#003399] via-[#0044cc] to-[#002277] flex items-center justify-center">
        <svg className="w-8 h-8 animate-spin text-white/60" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
    )
  }

  if (status === 'tidakJumpa') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#003399] via-[#0044cc] to-[#002277] flex flex-col items-center justify-center px-4 text-center">
        <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-white/40" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-black text-white mb-2">Halaman Tidak Dijumpai</h1>
        <p className="text-sm text-white/50 mb-6">Pautan <span className="font-mono text-white/70">/{slug}</span> tidak wujud atau telah ditarik balik.</p>
        <Link to="/" className="text-xs text-white/50 hover:text-white/80 transition-colors">← Kembali ke Laman Utama</Link>
      </div>
    )
  }

  if (status === 'tidakAktif') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#003399] via-[#0044cc] to-[#002277] flex flex-col items-center justify-center px-4 text-center">
        <div className="w-16 h-16 bg-yellow-400/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-yellow-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h1 className="text-xl font-black text-white mb-2">Akaun Ditangguhkan</h1>
        <p className="text-sm text-white/50 mb-6">Sistem bagi <strong className="text-white/70">{sekolah?.namaSekolah}</strong> sedang dalam penyelenggaraan atau telah ditangguhkan. Hubungi pihak penganjur.</p>
        <Link to="/" className="text-xs text-white/50 hover:text-white/80 transition-colors">← Kembali ke Laman Utama</Link>
      </div>
    )
  }

  // status === 'jumpa'
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#003399] via-[#0044cc] to-[#002277] flex flex-col items-center justify-center px-4 py-12">

      {/* Logo */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-yellow-400 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl">
          <svg className="w-9 h-9 text-[#003399]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
          </svg>
        </div>
        <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Gold Podium</p>
        <p className="text-[10px] text-white/30 mt-0.5">Pengurusan Kejohanan Sukan</p>
      </div>

      {/* Kad Sekolah */}
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">

        {/* Jalur atas */}
        <div className="h-1.5 bg-gradient-to-r from-yellow-400 via-yellow-300 to-yellow-500" />

        <div className="px-6 py-8 text-center">
          {/* Ikon sekolah */}
          <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-100">
            <svg className="w-7 h-7 text-[#003399]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
            </svg>
          </div>

          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Sistem Kejohanan Sukan</p>
          <h1 className="text-xl font-black text-gray-900 leading-tight mb-1">{sekolah?.namaSekolah}</h1>
          {sekolah?.daerah && (
            <p className="text-xs text-gray-400 mb-6">{sekolah.daerah}</p>
          )}
          {!sekolah?.daerah && <div className="mb-6" />}

          <div className="space-y-2.5">
            <button
              onClick={() => navigate('/login', { state: { schoolSlug: slug, namaSekolah: sekolah?.namaSekolah } })}
              className="w-full bg-[#003399] hover:bg-[#002277] active:scale-[0.98] text-white font-bold py-4 px-4 rounded-2xl text-sm transition-all shadow-sm flex items-center justify-center gap-2.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
              Masuk ke Sistem
            </button>
          </div>

          <p className="text-[10px] text-gray-300 mt-4">Untuk kakitangan yang diberi kebenaran sahaja</p>
        </div>
      </div>

      <Link to="/" className="mt-8 text-xs text-white/30 hover:text-white/60 transition-colors">
        Gold Podium · Pengurusan Kejohanan Sukan
      </Link>
    </div>
  )
}
