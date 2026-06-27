import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function SuperadminSetup() {
  const { user, setupSuperadmin, logout } = useAuth()
  const navigate = useNavigate()

  const [nama,    setNama]    = useState('')
  const [ralat,   setRalat]   = useState('')
  const [muatTurun, setMuatTurun] = useState(false)

  async function handleHantar(e) {
    e.preventDefault()
    if (!nama.trim()) return setRalat('Nama diperlukan.')
    setMuatTurun(true)
    try {
      await setupSuperadmin(nama.trim())
      navigate('/superadmin', { replace: true })
    } catch (err) {
      setRalat(err.message || 'Persediaan gagal. Sila cuba semula.')
    } finally {
      setMuatTurun(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#003399] to-[#002277] flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-[#003399] px-6 py-5 text-center">
          <div className="w-12 h-12 bg-yellow-400 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-[#003399]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </div>
          <h1 className="text-lg font-black text-white">Persediaan Superadmin</h1>
          <p className="text-xs text-white/60 mt-1">Persediaan kali pertama — Gold Podium</p>
        </div>

        <div className="p-6 space-y-5">
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <p className="text-xs text-blue-700">
              Log masuk sebagai: <strong>{user?.email}</strong><br />
              Akaun ini akan didaftarkan sebagai Superadmin.
            </p>
          </div>

          {ralat && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-xs text-red-700">{ralat}</p>
            </div>
          )}

          <form onSubmit={handleHantar} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                Nama Penuh
              </label>
              <input
                type="text"
                value={nama}
                onChange={e => { setNama(e.target.value); setRalat('') }}
                required
                autoFocus
                placeholder="Encik / Puan ..."
                className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm bg-gray-50 focus:outline-none focus:border-[#003399] focus:ring-2 focus:ring-[#003399]/15 transition-shadow"
              />
            </div>

            <button
              type="submit"
              disabled={muatTurun}
              className="w-full bg-[#003399] hover:bg-[#002277] disabled:bg-gray-300 text-white font-bold py-3.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
            >
              {muatTurun && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              )}
              {muatTurun ? 'Sedang menyediakan…' : 'Sahkan sebagai Superadmin'}
            </button>
          </form>

          <button
            type="button"
            onClick={async () => { await logout(); window.location.href = '/login' }}
            className="w-full text-xs text-gray-400 hover:text-gray-600 py-2 transition-colors"
          >
            Log masuk dengan akaun lain
          </button>
        </div>
      </div>
    </div>
  )
}
