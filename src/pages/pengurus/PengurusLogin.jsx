/**
 * PengurusLogin
 *
 * Dua mod penggunaan:
 *   1. /:slug/pengurus        — slug ada dalam URL params (dari SchoolLanding)
 *                               schoolId auto-resolve, pengurus terus isi kod+PIN
 *   2. /pengurus/login        — fallback global, pengurus taip slug sendiri
 *
 * Selepas login berjaya → redirect ke /:slug/pengurus/dashboard
 * schoolSlug disimpan dalam session → RequirePengurus guna untuk semak
 * URL slug match session (cegah konflik multi-tenant)
 */

import { useState, useEffect } from 'react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'

export default function PengurusLogin() {
  const { loginPengurus, userData } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()
  const { slug: slugFromUrl } = useParams()   // ada jika route /:slug/pengurus

  // slug boleh datang dari URL param atau dari SchoolLanding state
  const initSlug      = slugFromUrl || location.state?.schoolSlug || ''
  const stateSchoolId = location.state?.schoolId || ''
  const stateNama     = location.state?.namaSekolah || ''

  const [slug,        setSlug]        = useState(initSlug)
  const [kodSekolah,  setKodSekolah]  = useState('')
  const [pin,         setPin]         = useState('')
  const [schoolId,    setSchoolId]    = useState(stateSchoolId)
  const [namaOrg,     setNamaOrg]     = useState(stateNama)
  const [slugLoading, setSlugLoading] = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [ralat,       setRalat]       = useState('')
  const [pinVisible,  setPinVisible]  = useState(false)

  // Redirect kalau dah login sebagai pengurus — hantar ke slug sekolah sendiri
  useEffect(() => {
    if (userData?.role === 'pengurus') {
      const dest = userData.schoolSlug
        ? `/${userData.schoolSlug}/pengurus/dashboard`
        : '/pengurus/dashboard'
      navigate(dest, { replace: true })
    }
  }, [userData])

  // Resolve slug → schoolId (dengan debounce 600ms)
  useEffect(() => {
    if (!slug.trim() || stateSchoolId) return
    setSchoolId('')
    setNamaOrg('')
    const t = setTimeout(async () => {
      setSlugLoading(true)
      try {
        const snap = await getDoc(doc(db, 'slugIndex', slug.trim().toLowerCase()))
        if (snap.exists() && snap.data().aktif !== false) {
          const sId = snap.data().schoolId || ''
          setSchoolId(sId)
          if (sId) {
            const tSnap = await getDoc(doc(db, 'tenants', sId))
            setNamaOrg(tSnap.exists() ? (tSnap.data().namaSekolah || sId) : sId)
          }
        } else {
          setSchoolId('')
          setNamaOrg('')
        }
      } catch {
        setSchoolId('')
        setNamaOrg('')
      } finally {
        setSlugLoading(false)
      }
    }, 600)
    return () => clearTimeout(t)
  }, [slug, stateSchoolId])

  // Jika slug dari URL param — auto resolve terus tanpa debounce
  useEffect(() => {
    if (!slugFromUrl || stateSchoolId) return
    ;(async () => {
      setSlugLoading(true)
      try {
        const snap = await getDoc(doc(db, 'slugIndex', slugFromUrl.toLowerCase()))
        if (snap.exists() && snap.data().aktif !== false) {
          const sId = snap.data().schoolId || ''
          setSchoolId(sId)
          if (sId) {
            const tSnap = await getDoc(doc(db, 'tenants', sId))
            setNamaOrg(tSnap.exists() ? (tSnap.data().namaSekolah || sId) : sId)
          }
        }
      } catch { /* abaikan */ }
      finally { setSlugLoading(false) }
    })()
  }, []) // sekali sahaja semasa mount

  async function handleSubmit(e) {
    e.preventDefault()
    setRalat('')
    const effectiveSlug = slugFromUrl || slug.trim().toLowerCase()
    if (!schoolId) return setRalat('Kod organisasi tidak sah. Semak ejaan.')
    if (!kodSekolah.trim()) return setRalat('Kod sekolah diperlukan.')
    if (!pin) return setRalat('PIN diperlukan.')

    setLoading(true)
    try {
      // Pass schoolSlug → disimpan dalam session untuk semak multi-tenant
      await loginPengurus(schoolId, kodSekolah, pin, effectiveSlug)
      navigate(`/${effectiveSlug}/pengurus/dashboard`, { replace: true })
    } catch (err) {
      setRalat(err.message || 'Log masuk gagal.')
    } finally {
      setLoading(false)
    }
  }

  // Tunjuk nama org jika sudah resolved (sama ada dari URL slug atau state)
  const orgResolved = schoolId && (namaOrg || stateNama)
  const showSlugInput = !slugFromUrl && !stateSchoolId

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#003399] to-[#001a66] flex flex-col items-center justify-center px-4 py-10">

      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="w-14 h-14 bg-yellow-400 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
          <svg className="w-8 h-8 text-[#003399]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
          </svg>
        </div>
        <p className="text-[10px] text-white/50 uppercase tracking-widest font-bold">Gold Podium</p>
        <h1 className="text-xl font-black text-white mt-1">Portal Pengurus Pasukan</h1>
        <p className="text-xs text-white/40 mt-0.5">Urus atlet sekolah anda</p>
      </div>

      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {ralat && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-xs text-red-700">
              {ralat}
            </div>
          )}

          {/* Nama org resolved dari slug URL — tunjuk sebagai badge */}
          {slugFromUrl && (
            <div className={`border rounded-xl px-3 py-2.5 ${
              orgResolved
                ? 'bg-[#003399]/5 border-[#003399]/10'
                : 'bg-gray-50 border-gray-100'
            }`}>
              {slugLoading ? (
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  <span className="text-xs text-gray-400">Mengesahkan organisasi…</span>
                </div>
              ) : orgResolved ? (
                <>
                  <p className="text-[10px] text-[#003399]/60 uppercase tracking-widest font-bold">Organisasi</p>
                  <p className="text-sm font-bold text-[#003399]">{namaOrg || stateNama}</p>
                </>
              ) : (
                <p className="text-xs text-red-500">Organisasi tidak dijumpai. Semak URL anda.</p>
              )}
            </div>
          )}

          {/* Input slug — hanya untuk mod fallback /pengurus/login */}
          {showSlugInput && (
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                Kod Organisasi
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={slug}
                  onChange={e => { setSlug(e.target.value); setRalat('') }}
                  placeholder="contoh: mssd-kemaman"
                  autoComplete="off"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50 lowercase"
                />
                {slugLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <svg className="w-4 h-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                  </div>
                )}
              </div>
              {schoolId && (
                <p className="text-[11px] text-green-600 font-semibold mt-1">✓ {namaOrg || schoolId}</p>
              )}
              {slug && !slugLoading && !schoolId && (
                <p className="text-[11px] text-red-500 mt-1">Kod organisasi tidak dijumpai.</p>
              )}
            </div>
          )}

          {/* Nama org dari state (SchoolLanding → /pengurus/login lama) */}
          {stateSchoolId && (namaOrg || stateNama) && (
            <div className="bg-[#003399]/5 border border-[#003399]/10 rounded-xl px-3 py-2.5">
              <p className="text-[10px] text-[#003399]/60 uppercase tracking-widest font-bold">Organisasi</p>
              <p className="text-sm font-bold text-[#003399]">{namaOrg || stateNama}</p>
            </div>
          )}

          {/* Kod Sekolah */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
              Kod Sekolah
            </label>
            <input
              type="text"
              value={kodSekolah}
              onChange={e => { setKodSekolah(e.target.value.toUpperCase()); setRalat('') }}
              placeholder="cth: KMN-SR-001"
              autoComplete="off"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50 font-mono uppercase"
            />
          </div>

          {/* PIN */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
              PIN (6 digit)
            </label>
            <div className="relative">
              <input
                type={pinVisible ? 'text' : 'password'}
                value={pin}
                onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setRalat('') }}
                placeholder="••••••"
                inputMode="numeric"
                maxLength={6}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50 font-mono pr-10"
              />
              <button type="button" onClick={() => setPinVisible(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {pinVisible
                  ? <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                  : <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                }
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">PIN ditetapkan oleh pentadbir sistem.</p>
          </div>

          <button type="submit" disabled={loading || (!schoolId && !stateSchoolId) || (slugFromUrl && !schoolId)}
            className="w-full bg-[#003399] hover:bg-[#002277] disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
            {loading
              ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Mengesahkan…</>
              : 'Log Masuk'
            }
          </button>
        </form>
      </div>

      <button onClick={() => navigate(-1)} className="mt-6 text-xs text-white/40 hover:text-white/70 transition-colors">
        ← Kembali
      </button>
    </div>
  )
}
