import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { changePasswordFirstTime } from '../firebase/auth'

const HALUAN = { admin: '/admin', teacher: '/dashboard', superadmin: '/superadmin' }

export default function ForceChangePassword() {
  const { userData, refreshSession } = useAuth()
  const navigate = useNavigate()

  const [lama,    setLama]    = useState('')
  const [baru,    setBaru]    = useState('')
  const [sahkan,  setSahkan]  = useState('')
  const [tunjuk,  setTunjuk]  = useState({ lama: false, baru: false, sahkan: false })
  const [muatTurun, setMuatTurun] = useState(false)
  const [ralat,   setRalat]   = useState('')
  const [berjaya, setBerjaya] = useState(false)

  function toggle(k) { setTunjuk(t => ({ ...t, [k]: !t[k] })) }

  async function handleHantar(e) {
    e.preventDefault()
    setRalat('')

    if (!lama.trim())   return setRalat('Sila masukkan password semasa.')
    if (!baru.trim())   return setRalat('Sila masukkan password baru.')
    if (baru !== sahkan) return setRalat('Password baru tidak sepadan.')
    if (baru.length < 8) return setRalat('Password baru mesti sekurang-kurangnya 8 aksara.')

    setMuatTurun(true)
    try {
      await changePasswordFirstTime(lama, baru)
      await refreshSession()
      setBerjaya(true)
      setTimeout(() => {
        navigate(HALUAN[userData?.role] || '/dashboard', { replace: true })
      }, 2000)
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setRalat('Password semasa tidak betul.')
      } else {
        setRalat(err.message || 'Gagal menukar password. Sila cuba semula.')
      }
    } finally {
      setMuatTurun(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#003399] via-[#0044cc] to-[#002277] flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="bg-[#003399] px-6 py-5 text-center">
          <div className="w-12 h-12 bg-yellow-400 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-[#003399]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-base font-black text-white">Tukar Password</h1>
          <p className="text-xs text-white/60 mt-1">Anda perlu tukar password sebelum teruskan</p>
        </div>

        <div className="p-6">
          {berjaya ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-sm font-bold text-gray-800">Password berjaya ditukar!</p>
              <p className="text-xs text-gray-400 mt-1">Mengalihkan ke dashboard…</p>
            </div>
          ) : (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
                <p className="text-xs text-amber-700">
                  <strong>Log masuk sebagai:</strong> {userData?.email}<br />
                  Ini adalah log masuk pertama anda. Sila tukar password sementara kepada password baharu yang selamat.
                </p>
              </div>

              {ralat && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
                  <p className="text-xs text-red-700">{ralat}</p>
                </div>
              )}

              <form onSubmit={handleHantar} className="space-y-4">
                {/* Password Semasa */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                    Password Sementara (Semasa)
                  </label>
                  <div className="relative">
                    <input
                      type={tunjuk.lama ? 'text' : 'password'}
                      value={lama} onChange={e => { setLama(e.target.value); setRalat('') }}
                      required autoFocus placeholder="Password dari superadmin"
                      className="w-full px-3.5 py-3 pr-10 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:border-[#003399] focus:ring-2 focus:ring-[#003399]/15 transition-shadow"
                    />
                    <button type="button" onClick={() => toggle('lama')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {tunjuk.lama ? <EyeOff /> : <EyeOn />}
                    </button>
                  </div>
                </div>

                {/* Password Baru */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                    Password Baru
                  </label>
                  <div className="relative">
                    <input
                      type={tunjuk.baru ? 'text' : 'password'}
                      value={baru} onChange={e => { setBaru(e.target.value); setRalat('') }}
                      required placeholder="Minimum 8 aksara"
                      className="w-full px-3.5 py-3 pr-10 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:border-[#003399] focus:ring-2 focus:ring-[#003399]/15 transition-shadow"
                    />
                    <button type="button" onClick={() => toggle('baru')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {tunjuk.baru ? <EyeOff /> : <EyeOn />}
                    </button>
                  </div>
                  {/* strength indicator */}
                  {baru && (
                    <div className="mt-1.5 flex gap-1">
                      {[1,2,3,4].map(i => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                          baru.length >= i * 3
                            ? baru.length >= 12 ? 'bg-green-500' : baru.length >= 8 ? 'bg-yellow-400' : 'bg-red-400'
                            : 'bg-gray-200'
                        }`} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Sahkan Password */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                    Sahkan Password Baru
                  </label>
                  <div className="relative">
                    <input
                      type={tunjuk.sahkan ? 'text' : 'password'}
                      value={sahkan} onChange={e => { setSahkan(e.target.value); setRalat('') }}
                      required placeholder="Taip semula password baru"
                      className={`w-full px-3.5 py-3 pr-10 border rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 transition-shadow ${
                        sahkan && baru !== sahkan
                          ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                          : 'border-gray-200 focus:border-[#003399] focus:ring-[#003399]/15'
                      }`}
                    />
                    <button type="button" onClick={() => toggle('sahkan')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {tunjuk.sahkan ? <EyeOff /> : <EyeOn />}
                    </button>
                  </div>
                  {sahkan && baru !== sahkan && (
                    <p className="text-[10px] text-red-500 mt-1">Password tidak sepadan</p>
                  )}
                  {sahkan && baru === sahkan && baru.length >= 8 && (
                    <p className="text-[10px] text-green-600 mt-1">✓ Password sepadan</p>
                  )}
                </div>

                <button type="submit" disabled={muatTurun || (sahkan && baru !== sahkan)}
                  className="w-full bg-[#003399] hover:bg-[#002277] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2 mt-2">
                  {muatTurun && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
                  {muatTurun ? 'Menukar password…' : 'Tukar Password & Teruskan'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function EyeOn() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  )
}

function EyeOff() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  )
}
