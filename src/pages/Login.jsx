import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getLockStatus } from '../firebase/auth'

const HALUAN_PERANAN = {
  superadmin:    '/superadmin',
  pending_setup: '/superadmin/setup',
  admin:         '/admin',
  teacher:       '/dashboard',
}

function MasaKunci({ lockedUntil }) {
  const [baki, setBaki] = useState(0)

  useEffect(() => {
    function kira() {
      const ms = lockedUntil - Date.now()
      setBaki(ms > 0 ? ms : 0)
    }
    kira()
    const t = setInterval(kira, 1000)
    return () => clearInterval(t)
  }, [lockedUntil])

  if (baki <= 0) return null

  const minit = Math.floor(baki / 60000)
  const saat  = Math.floor((baki % 60000) / 1000)

  return (
    <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-center">
      <p className="text-sm font-bold text-red-700 mb-1">Akaun Dikunci</p>
      <p className="text-xs text-red-500 mb-3">
        Terlalu banyak percubaan log masuk yang gagal. Sila tunggu sebelum cuba semula.
      </p>
      <div className="inline-flex items-center gap-2 bg-red-100 border border-red-200 rounded-lg px-4 py-2">
        <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="font-mono font-black text-red-700 text-lg tabular-nums">
          {String(minit).padStart(2, '0')}:{String(saat).padStart(2, '0')}
        </span>
      </div>
    </div>
  )
}

export default function Login() {
  const { login, user, userRole } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Boleh datang dari SchoolLanding dengan state { schoolSlug, namaSekolah }
  const namaSekolahDariSlug = location.state?.namaSekolah || ''

  const [emel,     setEmel]     = useState('')
  const [katalaluan, setKatalaluan] = useState('')
  const [tunjukKata, setTunjukKata] = useState(false)
  const [ralat,    setRalat]    = useState('')
  const [muatTurun, setMuatTurun] = useState(false)
  const [maklumatKunci, setMaklumatKunci] = useState(null)

  useEffect(() => {
    if (user && userRole && userRole !== 'pending_setup') {
      navigate(HALUAN_PERANAN[userRole] || '/dashboard', { replace: true })
    }
  }, [user, userRole, navigate])

  useEffect(() => {
    if (!emel.trim()) { setMaklumatKunci(null); return }
    const t = setTimeout(async () => {
      const status = await getLockStatus(emel.trim().toLowerCase())
      setMaklumatKunci(status.locked ? status : null)
    }, 600)
    return () => clearTimeout(t)
  }, [emel])

  function mesejRalat(kod) {
    if (['auth/user-not-found', 'auth/wrong-password', 'auth/invalid-credential'].includes(kod))
      return 'Emel atau kata laluan tidak sah.'
    if (kod === 'auth/too-many-requests')
      return 'Akaun dikunci akibat terlalu banyak percubaan yang gagal.'
    if (kod === 'auth/user-disabled')
      return 'Akaun ini telah dinyahaktifkan. Hubungi pentadbir.'
    return 'Ralat sistem. Sila cuba sebentar lagi.'
  }

  async function handleHantar(e) {
    e.preventDefault()
    setRalat('')

    if (!emel.trim())      return setRalat('Emel diperlukan.')
    if (!katalaluan.trim()) return setRalat('Kata laluan diperlukan.')

    setMuatTurun(true)
    try {
      const sesi = await login(emel.trim(), katalaluan)
      const dest = HALUAN_PERANAN[sesi.role] || '/dashboard'
      navigate(dest, { replace: true })
    } catch (err) {
      setRalat(mesejRalat(err.code))
      const status = await getLockStatus(emel.trim().toLowerCase())
      if (status.locked) setMaklumatKunci(status)
    } finally {
      setMuatTurun(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#003399] via-[#0044cc] to-[#002277] flex flex-col items-center justify-center px-4 py-10">

      {/* Logo & Nama Sistem */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-yellow-400 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl">
          <svg className="w-9 h-9 text-[#003399]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
          </svg>
        </div>
        <h1 className="text-2xl font-black text-white tracking-wider">GOLD PODIUM</h1>
        {namaSekolahDariSlug ? (
          <p className="text-sm text-white font-semibold mt-1">{namaSekolahDariSlug}</p>
        ) : (
          <p className="text-sm text-white/60 mt-1">Pengurusan Kejohanan Sukan</p>
        )}
      </div>

      {/* Kad Log Masuk */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-2">
          <h2 className="text-base font-bold text-gray-800">Log Masuk</h2>
          <p className="text-xs text-gray-400 mt-0.5">Masukkan maklumat kelayakan anda untuk teruskan</p>
        </div>

        <div className="p-6 space-y-4">

          {/* Masa kunci */}
          {maklumatKunci?.locked && (
            <MasaKunci lockedUntil={maklumatKunci.lockedUntil} />
          )}

          {/* Ralat */}
          {ralat && !maklumatKunci?.locked && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-2.5">
              <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="text-xs text-red-700">{ralat}</p>
            </div>
          )}

          <form onSubmit={handleHantar} className="space-y-4">
            {/* Emel */}
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                Alamat Emel
              </label>
              <input
                type="email"
                value={emel}
                onChange={e => { setEmel(e.target.value); setRalat('') }}
                required
                autoComplete="email"
                placeholder="anda@sekolah.edu.my"
                disabled={muatTurun}
                className="w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:border-[#003399] focus:ring-2 focus:ring-[#003399]/15 transition-shadow disabled:opacity-50"
              />
            </div>

            {/* Kata Laluan */}
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                Kata Laluan
              </label>
              <div className="relative">
                <input
                  type={tunjukKata ? 'text' : 'password'}
                  value={katalaluan}
                  onChange={e => { setKatalaluan(e.target.value); setRalat('') }}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  disabled={muatTurun}
                  className="w-full px-3.5 py-3 pr-10 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:border-[#003399] focus:ring-2 focus:ring-[#003399]/15 transition-shadow disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setTunjukKata(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {tunjukKata
                    ? <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    : <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                  }
                </button>
              </div>
            </div>

            {/* Butang Hantar */}
            <button
              type="submit"
              disabled={muatTurun || maklumatKunci?.locked}
              className="w-full bg-[#003399] hover:bg-[#002277] active:scale-[0.98] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-3.5 px-4 rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2"
            >
              {muatTurun && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {muatTurun ? 'Sedang log masuk…' : 'Log Masuk'}
            </button>
          </form>

          <p className="text-center text-[10px] text-gray-400 pt-2">
            Untuk pengguna yang diberi kebenaran sahaja · Semua aktiviti dipantau
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center gap-3">
        <Link to="/login/pencatat" className="text-xs text-white/60 hover:text-white/90 transition-colors font-semibold">
          Log masuk sebagai Pencatat / Urusetia →
        </Link>
        <Link to="/" className="text-xs text-white/40 hover:text-white/70 transition-colors">
          ← Kembali ke Laman Utama
        </Link>
      </div>
    </div>
  )
}
