/**
 * BukuKongsiPP — /dashboard/buku-kongsi
 *
 * Pengurus Pasukan: lihat senarai Buku Kejohanan yang admin kongsi.
 * Klik → buka Drive viewer dalam tab baru (ada butang download).
 *
 * Real-time onSnapshot — admin update, PP auto refresh.
 */

import { useState, useEffect } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import { driveViewUrl } from '../../utils/bukuKongsiUtils'

export default function BukuKongsiPP() {
  const { userRole, userData } = useAuth()
  const schoolId = userData?.schoolId || ''
  const navigate     = useNavigate()
  const [senarai, setSenarai] = useState([])
  const [loading, setLoading] = useState(true)
  const [aktif, setAktif]     = useState(true)

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'tenants', schoolId, 'tetapan', 'bukuKongsi'),
      snap => {
        if (!snap.exists()) {
          setSenarai([])
          setAktif(true)
          setLoading(false)
          return
        }
        const d = snap.data()
        const a = d.aktif === undefined ? true : !!d.aktif
        setAktif(a)
        // Guard: PP + OFF → redirect
        if (!a && userRole === 'pengurus_pasukan') {
          navigate('/dashboard', { replace: true })
          return
        }
        setSenarai(Array.isArray(d.senarai) ? d.senarai : [])
        setLoading(false)
      },
      () => setLoading(false)
    )
    return () => unsub()
  }, [userRole, navigate])

  function bukaBuku(url) {
    const view = driveViewUrl(url)
    if (!view) {
      alert('URL tidak sah.')
      return
    }
    window.open(view, '_blank', 'noopener,noreferrer')
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px]">
        <p className="text-xs text-gray-500">Memuatkan...</p>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="mb-5">
        <h1 className="text-base font-bold text-gray-800">📚 Buku Kejohanan</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Muat turun dokumen rasmi kejohanan yang dikongsi oleh admin.
        </p>
      </div>

      {senarai.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl py-16 text-center">
          <p className="text-3xl mb-2">📚</p>
          <p className="text-sm font-semibold text-gray-600">Belum ada buku dikongsi</p>
          <p className="text-xs text-gray-400 mt-1">Admin belum tambah buku dalam senarai.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
          {senarai.map((b, i) => (
            <div key={b.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
              <span className="text-[10px] text-gray-300 w-5 text-right shrink-0">{i + 1}</span>
              <div className="w-9 h-9 bg-red-50 border border-red-100 rounded-lg flex items-center justify-center shrink-0">
                <span className="text-red-500 text-xs font-bold">PDF</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800 truncate">{b.tajuk}</p>
                {b.createdAt && (
                  <p className="text-[10px] text-gray-400">
                    Dikongsi: {new Date(b.createdAt).toLocaleDateString('ms-MY', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </p>
                )}
              </div>
              <button
                onClick={() => bukaBuku(b.url)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#003399] text-white rounded-lg text-[11px] font-semibold hover:bg-[#002288] transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Buka
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Nota */}
      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-[10px] text-blue-700 space-y-0.5">
        <p className="font-bold">Nota:</p>
        <p>· Klik "Buka" → fail akan buka dalam tab baru (Google Drive Viewer).</p>
        <p>· Dalam viewer, klik ikon muat turun ⬇ di atas untuk simpan PDF.</p>
        <p>· Senarai dikemaskini secara real-time apabila admin tambah/buang buku.</p>
      </div>
    </div>
  )
}
