/**
 * PencatatLogin — /login/pencatat
 * Login pencatat/teacher via kodAkses + PIN (tanpa Firebase Auth)
 * Lookup dari tenants/{schoolId}/users/ menggunakan slugIndex → schoolId
 */

import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { hashPin } from '../../utils/hashPin'
import { useAuth } from '../../context/AuthContext'
import { SESSION_KEY } from '../../firebase/auth'
import PasswordInput from '../../components/ui/PasswordInput'

const MAX_ATTEMPTS = 5
const LOCK_MS = 30 * 60 * 1000

export default function PencatatLogin() {
  const { loginPencatat } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Boleh datang dari SchoolLanding / Login dengan state { schoolSlug }.
  // Fallback ke query param ?from={slug} — state hilang bila refresh / buka terus
  const slugDariUrl = new URLSearchParams(location.search).get('from') || ''
  const slugTenant = (location.state?.schoolSlug || slugDariUrl || '').trim().toLowerCase()

  const [slug,     setSlug]     = useState(slugTenant)
  const [kodAkses, setKodAkses] = useState('')
  const [pin,      setPin]      = useState('')
  const [ralat,    setRalat]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleHantar(e) {
    e.preventDefault()
    setRalat('')

    if (!slug.trim())     return setRalat('Kod sekolah diperlukan.')
    if (!kodAkses.trim()) return setRalat('Kod akses diperlukan.')
    if (pin.length !== 6) return setRalat('PIN mesti 6 digit.')

    setLoading(true)
    try {
      await loginPencatat(slug.trim().toLowerCase(), kodAkses.trim().toUpperCase(), pin)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setRalat(err.message || 'Log masuk gagal.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#003399] via-[#0044cc] to-[#002277] flex flex-col items-center justify-center px-4 py-10">

      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-yellow-400 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl">
          <svg className="w-9 h-9 text-[#003399]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <h1 className="text-2xl font-black text-white tracking-wider">GOLD PODIUM</h1>
        <p className="text-sm text-white/70 mt-1 font-semibold">Log Masuk Pencatat</p>
      </div>

      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-2">
          <h2 className="text-base font-bold text-gray-800">Pencatat / Urusetia</h2>
          <p className="text-xs text-gray-400 mt-0.5">Masukkan kod sekolah, kod akses dan PIN anda</p>
        </div>

        <div className="p-6 space-y-4">
          {ralat && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-2.5">
              <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="text-xs text-red-700">{ralat}</p>
            </div>
          )}

          <form onSubmit={handleHantar} className="space-y-4">
            {/* Kod Sekolah (slug) */}
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                Kod Sekolah
              </label>
              <input
                type="text"
                value={slug}
                onChange={e => { setSlug(e.target.value.toLowerCase().replace(/\s/g, '')); setRalat('') }}
                placeholder="cth: sk-astana"
                disabled={loading}
                className="w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 font-mono focus:outline-none focus:border-[#003399] focus:ring-2 focus:ring-[#003399]/15 transition-shadow disabled:opacity-50"
              />
              <p className="text-[10px] text-gray-400 mt-1">Dapatkan kod ini dari pentadbir sekolah anda</p>
            </div>

            {/* Kod Akses */}
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                Kod Akses
              </label>
              <input
                type="text"
                value={kodAkses}
                onChange={e => { setKodAkses(e.target.value.toUpperCase().replace(/[^A-Z0-9\-]/g, '')); setRalat('') }}
                placeholder="cth: CATAT01"
                disabled={loading}
                maxLength={20}
                className="w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 font-mono tracking-wider focus:outline-none focus:border-[#003399] focus:ring-2 focus:ring-[#003399]/15 transition-shadow disabled:opacity-50"
              />
            </div>

            {/* PIN */}
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                PIN (6 Digit)
              </label>
              <PasswordInput
                isPin
                inputMode="numeric"
                value={pin}
                onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setRalat('') }}
                placeholder="••••••"
                maxLength={6}
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#003399] hover:bg-[#002277] active:scale-[0.98] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-3.5 px-4 rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2"
            >
              {loading && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {loading ? 'Sedang log masuk…' : 'Log Masuk'}
            </button>
          </form>

          <p className="text-center text-[10px] text-gray-400 pt-2">
            Untuk pencatat & urusetia yang diberi kebenaran sahaja
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center gap-3">
        <Link to={(slugTenant || slug.trim()) ? `/login?from=${encodeURIComponent((slugTenant || slug.trim()).toLowerCase())}` : '/login'} state={location.state} className="text-xs text-white/50 hover:text-white/80 transition-colors">
          Log masuk sebagai Admin →
        </Link>
        <Link
          to={(slugTenant || slug.trim()) ? `/${(slugTenant || slug.trim()).toLowerCase()}` : '/'}
          className="text-xs text-white/40 hover:text-white/70 transition-colors">
          ← Kembali ke Laman Utama
        </Link>
      </div>
    </div>
  )
}
