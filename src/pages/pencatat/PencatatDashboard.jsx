import { useState, useEffect } from 'react'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import { withPortalView } from '../../hooks/useSchoolId'
import { useNavigate, useParams } from 'react-router-dom'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTarikh(val) {
  if (!val) return '—'
  try {
    const d = val?.toDate ? val.toDate() : new Date(val)
    return d.toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return '—' }
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      <span className="text-sm">Memuatkan…</span>
    </div>
  )
}

function KejCard({ kej, onClick }) {
  const isAktif = kej.statusKejohanan === 'aktif'
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
          <p className="text-[11px] text-gray-400 mt-0.5">{fmtTarikh(kej.tarikhMula)} · {kej.lokasi || '—'}</p>
        </div>
        <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function PencatatInputKeputusanPage() {
  const { userData: authData } = useAuth()
  const userData = withPortalView(authData)
  const navigate     = useNavigate()
  const { slug }     = useParams()
  const schoolId     = userData?.schoolId || ''

  const [list,    setList]    = useState([])
  const [loading, setLoading] = useState(true)
  const [done,    setDone]    = useState(false)

  useEffect(() => {
    if (!schoolId) { setLoading(false); setDone(true); return }

    getDocs(query(
      collection(db, 'tenants', schoolId, 'kejohanan'),
      orderBy('tarikhMula', 'desc')
    ))
      .then(snap => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        const aktif = all.filter(k => k.statusKejohanan === 'aktif')

        // Tepat 1 aktif → auto-redirect terus
        if (aktif.length === 1) {
          navigate(`/${slug}/pencatat/kejohanan/${aktif[0].id}/keputusan`, { replace: true })
          return
        }

        // Tiada aktif tapi ada tepat 1 kejohanan sahaja → terus redirect juga
        if (aktif.length === 0 && all.length === 1) {
          navigate(`/${slug}/pencatat/kejohanan/${all[0].id}/keputusan`, { replace: true })
          return
        }

        setList(all)
        setDone(true)
      })
      .catch(() => { setList([]); setDone(true) })
      .finally(() => setLoading(false))
  }, [schoolId, slug, navigate])

  if (loading || !done) return (
    <div className="w-full">
      <Spinner />
    </div>
  )

  const aktif = list.filter(k => k.statusKejohanan === 'aktif')
  const lain  = list.filter(k => k.statusKejohanan !== 'aktif')

  function pilih(kej) {
    navigate(`/${slug}/pencatat/kejohanan/${kej.id}/keputusan`)
  }

  return (
    <div className="w-full pb-12">

      {/* Top bar — gaya KOAM */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="px-4 py-3">
          <p className="text-sm font-bold text-gray-800">Pilih Kejohanan</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">

        {list.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-sm">Tiada kejohanan berdaftar.</p>
            <p className="text-xs mt-1">Hubungi pentadbir sekolah untuk setup kejohanan.</p>
          </div>
        ) : (
          <>
            {aktif.length === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                Tiada kejohanan aktif. Pilih mana-mana kejohanan di bawah atau hubungi admin.
              </div>
            )}

            {aktif.length > 1 && (
              <>
                <p className="text-[10px] font-black text-green-600 uppercase tracking-widest">Sedang Aktif</p>
                <div className="space-y-2">
                  {aktif.map(k => <KejCard key={k.id} kej={k} onClick={() => pilih(k)} />)}
                </div>
              </>
            )}

            {lain.length > 0 && (
              <>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Lain-lain</p>
                <div className="space-y-2">
                  {lain.map(k => <KejCard key={k.id} kej={k} onClick={() => pilih(k)} />)}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
