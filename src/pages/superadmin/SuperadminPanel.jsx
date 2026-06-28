import { useState, useEffect } from 'react'
import { collection, getDocs, doc, getDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { createAdminAccount, hantarResetPassword } from '../../firebase/auth'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'

const WARNA_STATUS = {
  active:    'bg-green-100 text-green-700',
  suspended: 'bg-red-100 text-red-700',
  pending:   'bg-yellow-100 text-yellow-700',
}
const LABEL_STATUS = {
  active:    'Aktif',
  suspended: 'Digantung',
  pending:   'Menunggu',
}
const WARNA_PAKEJ = {
  free:     'bg-gray-100 text-gray-600',
  school:   'bg-blue-100 text-blue-700',
  district: 'bg-purple-100 text-purple-700',
}
const LABEL_PAKEJ = {
  free: 'Percuma', school: 'Sekolah', district: 'Daerah',
}
const PAKEJ_LIST = [
  { id: 'free',     label: 'Percuma'  },
  { id: 'school',   label: 'Sekolah'  },
  { id: 'district', label: 'Daerah'   },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function bakiHari(tarikhExpiry) {
  if (!tarikhExpiry?.toDate) return null
  return Math.ceil((tarikhExpiry.toDate() - new Date()) / (1000 * 60 * 60 * 24))
}

function labelExpiry(baki) {
  if (baki === null) return '—'
  if (baki < 0)  return `Tamat ${Math.abs(baki)} hari lalu`
  if (baki === 0) return 'Tamat hari ini'
  return `${baki} hari lagi`
}

function warnaExpiry(baki) {
  if (baki === null) return 'text-gray-400'
  if (baki < 0)  return 'text-red-600 font-bold'
  if (baki <= 14) return 'text-red-500 font-bold'
  if (baki <= 30) return 'text-amber-600 font-semibold'
  return 'text-gray-500'
}

// ── Kad Statistik ─────────────────────────────────────────────────────────────

function KadStatistik({ label, nilai, sub, warna = 'biru' }) {
  const cls = {
    biru:   'bg-blue-50 border-blue-200 text-blue-700',
    hijau:  'bg-green-50 border-green-200 text-green-700',
    kuning: 'bg-amber-50 border-amber-200 text-amber-700',
    merah:  'bg-red-50 border-red-200 text-red-700',
  }
  return (
    <div className={`rounded-xl border p-4 ${cls[warna]}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="text-2xl font-black mt-1">{nilai}</p>
      {sub && <p className="text-[10px] opacity-60 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Modal Tambah Sekolah ──────────────────────────────────────────────────────

function ModalTambahSekolah({ onTutup, onSimpan }) {
  const HARI_INI = new Date().toISOString().split('T')[0]
  const EXPIRY_DEFAULT = (() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().split('T')[0] })()
  const [borang, setBorang] = useState({
    namaSekolah: '', daerah: '', emelAdmin: '', namaAdmin: '',
    tarikhMula: HARI_INI, tarikhExpiry: EXPIRY_DEFAULT, slugCustom: '',
  })
  const [muatTurun, setMuatTurun] = useState(false)
  const [ralat,     setRalat]     = useState('')
  const [hasil,     setHasil]     = useState(null)
  const [salin,     setSalin]     = useState('')

  function set(k, v) { setBorang(b => ({ ...b, [k]: v })); setRalat('') }

  async function handleHantar(e) {
    e.preventDefault()
    if (!borang.namaSekolah.trim()) return setRalat('Nama sekolah diperlukan.')
    if (!borang.daerah.trim())      return setRalat('Daerah diperlukan.')
    if (!borang.emelAdmin.trim())   return setRalat('Emel admin diperlukan.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(borang.emelAdmin.trim())) return setRalat('Format emel tidak sah. Contoh: admin@sekolah.edu.my')
    if (!borang.namaAdmin.trim())   return setRalat('Nama admin diperlukan.')
    if (!borang.tarikhExpiry)       return setRalat('Tarikh tamat langganan diperlukan.')

    setMuatTurun(true)
    try {
      const r = await createAdminAccount({ ...borang, slugCustom: borang.slugCustom.trim() || '' })
      setHasil(r)
      onSimpan()
    } catch (err) {
      setRalat(err.message || 'Gagal mencipta akaun. Sila cuba semula.')
    } finally {
      setMuatTurun(false)
    }
  }

  function copyTeks(teks, kunci) {
    navigator.clipboard.writeText(teks)
    setSalin(kunci)
    setTimeout(() => setSalin(''), 2000)
  }


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 overflow-y-auto"
      onClick={e => e.target === e.currentTarget && !hasil && onTutup()}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden my-auto">

        <div className="bg-[#003399] px-5 py-4 flex items-center justify-between">
          <p className="text-sm font-bold text-white">
            {hasil ? '✅ Akaun Berjaya Dicipta' : 'Tambah Sekolah Baharu'}
          </p>
          <button onClick={onTutup} className="text-white/50 hover:text-white">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {hasil ? (
          <div className="p-5 space-y-3">
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-xs text-green-700 font-medium">
              Akaun admin telah dicipta. Kongsikan maklumat berikut kepada pentadbir sekolah.
            </div>
            {/* URL Sekolah — boleh klik */}
            <div className="border border-blue-100 bg-blue-50 rounded-xl p-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">URL Sekolah</p>
              <div className="flex items-center justify-between gap-2">
                <a href={hasil.loginUrl} target="_blank" rel="noopener noreferrer"
                  className="text-sm font-mono text-[#003399] underline break-all hover:text-blue-800">
                  {hasil.loginUrl}
                </a>
                <button onClick={() => copyTeks(hasil.loginUrl, 'url')}
                  className="shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-white border border-blue-200 hover:bg-[#003399] hover:text-white transition-colors">
                  {salin === 'url' ? '✓ Salin' : 'Salin'}
                </button>
              </div>
            </div>

            {/* Tarikh mula & tamat */}
            <div className="grid grid-cols-2 gap-2">
              <div className="border border-gray-100 rounded-xl p-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Tarikh Mula</p>
                <p className="text-sm font-semibold text-gray-700">{hasil.tarikhMula || '—'}</p>
              </div>
              <div className="border border-gray-100 rounded-xl p-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Tarikh Tamat</p>
                <p className="text-sm font-semibold text-gray-700">{hasil.tarikhExpiry}</p>
              </div>
            </div>

            {[
              { label: 'Emel',               nilai: hasil.email,        kunci: 'emel' },
              { label: 'Password Sementara', nilai: hasil.tempPassword, kunci: 'pass' },
            ].map(item => (
              <div key={item.kunci} className="border border-gray-100 rounded-xl p-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{item.label}</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-mono text-gray-800 break-all">{item.nilai}</p>
                  <button onClick={() => copyTeks(item.nilai, item.kunci)}
                    className="shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-[#003399] hover:text-white transition-colors">
                    {salin === item.kunci ? '✓ Salin' : 'Salin'}
                  </button>
                </div>
              </div>
            ))}
            <button onClick={() => copyTeks(
              `🏆 GOLD PODIUM — Maklumat Log Masuk\n\nURL Sekolah: ${hasil.loginUrl}\nEmel: ${hasil.email}\nPassword: ${hasil.tempPassword}\nTarikh Mula: ${hasil.tarikhMula || '—'}\nTarikh Tamat: ${hasil.tarikhExpiry}\n\nSila tukar password selepas log masuk pertama.`,
              'semua'
            )} className="w-full bg-[#003399] hover:bg-[#002277] text-white font-bold py-3 rounded-xl text-sm transition-colors">
              {salin === 'semua' ? '✓ Disalin!' : '📋 Salin Semua Maklumat'}
            </button>
            <button onClick={onTutup} className="w-full text-xs text-gray-400 hover:text-gray-600 py-2 transition-colors">
              Tutup
            </button>
          </div>
        ) : (
          <form onSubmit={handleHantar} className="p-5 space-y-3">
            {ralat && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{ralat}</p>}

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Nama Sekolah</label>
              <input type="text" value={borang.namaSekolah} onChange={e => set('namaSekolah', e.target.value)}
                required autoFocus placeholder="SK / SMK ..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50" />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Daerah</label>
              <input type="text" value={borang.daerah} onChange={e => set('daerah', e.target.value)}
                required placeholder="Kemaman"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Emel Admin</label>
                <input type="email" value={borang.emelAdmin} onChange={e => set('emelAdmin', e.target.value)}
                  required placeholder="admin@sekolah.edu.my"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Nama Admin</label>
                <input type="text" value={borang.namaAdmin} onChange={e => set('namaAdmin', e.target.value)}
                  required placeholder="En. Ahmad"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50" />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                URL Sekolah (Slug)
                <span className="ml-1 text-gray-300 normal-case font-normal">— goldpodium.web.app/<span className="font-mono text-blue-400">{borang.slugCustom || '...'}</span></span>
              </label>
              <input type="text" value={borang.slugCustom} onChange={e => set('slugCustom', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="cth: sk-astana (auto-jana jika kosong)"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50" />
              <p className="text-[10px] text-gray-400 mt-1">Hanya huruf kecil, angka, dan sempang (-). Biarkan kosong untuk jana secara automatik.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Tarikh Mula</label>
                <input type="date" value={borang.tarikhMula} onChange={e => set('tarikhMula', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Tarikh Tamat</label>
                <input type="date" value={borang.tarikhExpiry} onChange={e => set('tarikhExpiry', e.target.value)}
                  min={borang.tarikhMula || HARI_INI}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50" />
              </div>
            </div>

            <button type="submit" disabled={muatTurun}
              className="w-full bg-[#003399] hover:bg-[#002277] disabled:bg-gray-300 text-white font-bold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
              {muatTurun
                ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Mencipta akaun…</>
                : '+ Cipta Akaun & Tambah Sekolah'
              }
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Modal Perbaharui Langganan ─────────────────────────────────────────────────

function ModalPerbaharui({ sekolah, onTutup, onBerjaya }) {
  const expiryLama = sekolah.tarikhExpiry?.toDate
    ? sekolah.tarikhExpiry.toDate().toLocaleDateString('ms-MY')
    : '—'

  // Default: perbaharui dari hari ini atau dari expiry lama (yang mana lebih jauh)
  const baseDate = sekolah.tarikhExpiry?.toDate
    ? (sekolah.tarikhExpiry.toDate() > new Date() ? sekolah.tarikhExpiry.toDate() : new Date())
    : new Date()
  const defaultMula = baseDate.toISOString().split('T')[0]

  const [tarikhMula, setTarikhMula] = useState(defaultMula)
  const [pakej,      setPakej]      = useState(sekolah.pakej || 'school')
  const [muatTurun,  setMuatTurun]  = useState(false)
  const [ralat,      setRalat]      = useState('')

  const tarikhExpiry = (() => {
    const d = new Date(tarikhMula)
    d.setFullYear(d.getFullYear() + 1)
    return d.toLocaleDateString('ms-MY')
  })()

  async function handleHantar(e) {
    e.preventDefault()
    setMuatTurun(true)
    setRalat('')
    try {
      const mula   = new Date(tarikhMula)
      const expiry = new Date(mula)
      expiry.setFullYear(expiry.getFullYear() + 1)

      await updateDoc(doc(db, 'tenants', sekolah.id), {
        pakej,
        tarikhMula:   Timestamp.fromDate(mula),
        tarikhExpiry: Timestamp.fromDate(expiry),
        status:       'active',
        diperbaharuiPada: serverTimestamp(),
      })
      onBerjaya(sekolah.id, { pakej, tarikhExpiry: Timestamp.fromDate(expiry), status: 'active' })
      onTutup()
    } catch {
      setRalat('Gagal perbaharui langganan. Sila cuba semula.')
    } finally {
      setMuatTurun(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={e => e.target === e.currentTarget && onTutup()}>
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">

        <div className="bg-[#003399] px-5 py-4 flex items-center justify-between">
          <p className="text-sm font-bold text-white">Perbaharui Langganan</p>
          <button onClick={onTutup} className="text-white/50 hover:text-white">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleHantar} className="p-5 space-y-4">
          {/* Info sekolah */}
          <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
            <p className="text-xs font-bold text-gray-800">{sekolah.namaSekolah}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Expiry semasa: {expiryLama}</p>
          </div>

          {ralat && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{ralat}</p>}

          {/* Pakej */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Pakej Baharu</label>
            <div className="flex gap-2">
              {PAKEJ_LIST.map(p => (
                <button key={p.id} type="button" onClick={() => setPakej(p.id)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all ${
                    pakej === p.id
                      ? 'border-[#003399] bg-[#003399] text-white'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tarikh mula baru */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Mula Dari</label>
              <input type="date" value={tarikhMula} onChange={e => setTarikhMula(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Expiry Baru</label>
              <div className="w-full border border-green-200 rounded-xl px-3 py-2.5 text-sm bg-green-50 text-green-700 font-semibold">
                {tarikhExpiry}
              </div>
            </div>
          </div>

          <button type="submit" disabled={muatTurun}
            className="w-full bg-[#003399] hover:bg-[#002277] disabled:bg-gray-300 text-white font-bold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
            {muatTurun
              ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Menyimpan…</>
              : '✓ Perbaharui Langganan (+1 Tahun)'
            }
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Panel Utama ───────────────────────────────────────────────────────────────

export default function SuperadminPanel() {
  const { userData, logout } = useAuth()
  const navigate = useNavigate()

  function masukSebagaiAdmin(s) {
    sessionStorage.setItem('gp_view_school', JSON.stringify({
      schoolId: s.schoolId || s.id,
      namaSekolah: s.namaSekolah,
    }))
    navigate('/admin')
  }

  const [sekolah,            setSekolah]            = useState([])
  const [logKeselamatan,     setLogKeselamatan]      = useState(null)
  const [muatTurun,          setMuatTurun]           = useState(true)
  const [tabAktif,           setTabAktif]            = useState('sekolah')
  const [modalTambah,        setModalTambah]         = useState(false)
  const [modalPerbaharui,    setModalPerbaharui]     = useState(null)
  const [muatTurunTindakan,  setMuatTurunTindakan]   = useState(null)

  async function muatSekolah() {
    setMuatTurun(true)
    try {
      const snap = await getDocs(collection(db, 'tenants'))
      setSekolah(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch { /* langkau */ }
    setMuatTurun(false)
  }

  useEffect(() => {
    if (!userData || userData.role !== 'superadmin') {
      navigate('/login', { replace: true })
      return
    }
    muatSekolah()
    const batal = onSnapshot(
      doc(db, 'security', 'logs'),
      snap => { if (snap.exists()) setLogKeselamatan(snap.data()) },
      () => {}
    )
    return () => batal()
  }, [userData]) // eslint-disable-line

  async function resetPwAdmin(s) {
    try {
      const privSnap = await getDoc(doc(db, 'tenants', s.id, '_private', 'admin'))
      const emel = privSnap.exists() ? privSnap.data().emelAdmin : null
      if (!emel) return alert('Emel admin tidak dijumpai dalam sistem.')
      if (!confirm(`Hantar emel reset password ke ${emel}?`)) return
      await hantarResetPassword(emel)
      alert(`✅ Emel reset password dihantar ke ${emel}`)
    } catch { alert('Gagal hantar emel. Sila cuba semula.') }
  }

  async function tangguhSekolah(s) {
    if (!confirm(`Tangguhkan ${s.namaSekolah}? Admin sekolah tidak boleh log masuk semasa ditangguh.`)) return
    setMuatTurunTindakan(s.id)
    try {
      await updateDoc(doc(db, 'tenants', s.id), { status: 'suspended', dikemaskinPada: serverTimestamp() })
      setSekolah(list => list.map(x => x.id === s.id ? { ...x, status: 'suspended' } : x))
    } catch { alert('Gagal. Sila cuba semula.') }
    setMuatTurunTindakan(null)
  }

  async function aktifkanSekolah(s) {
    setMuatTurunTindakan(s.id)
    try {
      await updateDoc(doc(db, 'tenants', s.id), { status: 'active', dikemaskinPada: serverTimestamp() })
      setSekolah(list => list.map(x => x.id === s.id ? { ...x, status: 'active' } : x))
    } catch { alert('Gagal. Sila cuba semula.') }
    setMuatTurunTindakan(null)
  }

  async function padamSekolah(s) {
    if (!confirm(`PADAM "${s.namaSekolah}"?\n\nTindakan ini TIDAK BOLEH dibatalkan. Semua data sekolah akan hilang.`)) return
    if (!confirm(`Sahkan sekali lagi — padam "${s.namaSekolah}" secara kekal?`)) return
    setMuatTurunTindakan(s.id)
    try {
      const sid = s.id

      // Ambil emel admin sebelum padam _private
      let emelAdmin = ''
      try {
        const privSnap = await getDoc(doc(db, 'tenants', sid, '_private', 'admin'))
        if (privSnap.exists()) emelAdmin = privSnap.data().emelAdmin || ''
      } catch { /* bukan kritikal */ }

      // Padam subcollection utama (Firestore tidak auto-delete subcollection)
      const subcols = ['kejohanan', 'atlet', 'sekolah', 'rekod', 'rekod_sejarah', 'users', 'login_attempts', 'tetapan', '_private']
      for (const col of subcols) {
        try {
          const snap = await getDocs(collection(db, 'tenants', sid, col))
          const batch = writeBatch(db)
          snap.docs.forEach(d => batch.delete(d.ref))
          if (snap.docs.length > 0) await batch.commit()
        } catch (colErr) { console.warn(`Skip subcol ${col}:`, colErr?.message) }
      }
      await deleteDoc(doc(db, 'tenants', sid))
      if (s.slug) await deleteDoc(doc(db, 'slugIndex', s.slug)).catch(() => {})
      setSekolah(list => list.filter(x => x.id !== sid))

      // Papar arahan padam Firebase Auth
      if (emelAdmin) {
        alert(`✅ Data Firestore "${s.namaSekolah}" berjaya dipadam.\n\n⚠️ LANGKAH TAMBAHAN:\nAkaun Firebase Auth masih wujud.\nSila padam akaun ini dari Firebase Console:\n\n📧 ${emelAdmin}\n\n(Console → Authentication → cari emel → padam)`)
      }
    } catch (err) { console.error('padamSekolah error:', err); alert('Gagal padam: ' + (err?.message || err)) }
    setMuatTurunTindakan(null)
  }

  function handlePerbaharuiBerjaya(id, kemaskini) {
    setSekolah(list => list.map(x => x.id === id ? { ...x, ...kemaskini } : x))
  }

  const jumlahSekolah  = sekolah.length
  const sekolahAktif   = sekolah.filter(s => s.status === 'active').length
  const sekolahTangguh = sekolah.filter(s => s.status === 'suspended').length

  // Expiry dalam 30 hari ATAU dah tamat
  const perluTindakan = sekolah.filter(s => {
    const baki = bakiHari(s.tarikhExpiry)
    return baki !== null && baki <= 30
  })

  // Untuk tab Langganan — susun ikut expiry (paling hampir dulu)
  const senaraiLangganan = [...sekolah].sort((a, b) => {
    const bA = bakiHari(a.tarikhExpiry) ?? 9999
    const bB = bakiHari(b.tarikhExpiry) ?? 9999
    return bA - bB
  })

  const TAB = [
    { id: 'sekolah',     label: 'Senarai Sekolah' },
    { id: 'langganan',   label: `Langganan${perluTindakan.length > 0 ? ` (${perluTindakan.length})` : ''}` },
    { id: 'keselamatan', label: 'Log Keselamatan' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Pengepala */}
      <header className="bg-[#003399] text-white px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-[#003399]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </div>
          <div>
            <p className="text-[9px] text-white/50 uppercase tracking-widest">Gold Podium</p>
            <p className="text-sm font-bold leading-tight">Panel Superadmin</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:block text-right">
            <p className="text-xs font-semibold">{userData?.name || userData?.email}</p>
            <span className="text-[9px] bg-yellow-400 text-yellow-900 font-bold px-1.5 py-0.5 rounded">SUPERADMIN</span>
          </div>
          <button onClick={async () => { await logout(); navigate('/login') }}
            className="text-white/60 hover:text-white transition-colors p-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Kad Statistik */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KadStatistik label="Jumlah Sekolah"    nilai={jumlahSekolah}          warna="biru" />
          <KadStatistik label="Aktif"             nilai={sekolahAktif}           warna="hijau" />
          <KadStatistik label="Digantung"         nilai={sekolahTangguh}         warna="merah" />
          <KadStatistik label="Perlu Tindakan"    nilai={perluTindakan.length}   warna="kuning" sub="expiry ≤30 hari / tamat" />
        </div>

        {/* Banner amaran jika ada yang tamat */}
        {perluTindakan.filter(s => (bakiHari(s.tarikhExpiry) ?? 1) < 0).length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="text-sm font-bold text-red-700">
                {perluTindakan.filter(s => (bakiHari(s.tarikhExpiry) ?? 1) < 0).length} sekolah telah tamat langganan
              </p>
              <p className="text-xs text-red-500 mt-0.5">
                Pergi ke tab <strong>Langganan</strong> untuk perbaharui atau tangguh akaun.
              </p>
            </div>
            <button onClick={() => setTabAktif('langganan')}
              className="ml-auto shrink-0 text-xs font-bold text-red-600 hover:text-red-800 underline">
              Lihat →
            </button>
          </div>
        )}

        {/* Tab */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex border-b border-gray-100 overflow-x-auto">
            {TAB.map(t => (
              <button key={t.id} onClick={() => setTabAktif(t.id)}
                className={`shrink-0 px-5 py-3 text-xs font-bold transition-colors ${
                  tabAktif === t.id
                    ? 'text-[#003399] border-b-2 border-[#003399] bg-blue-50/50'
                    : t.id === 'langganan' && perluTindakan.length > 0
                      ? 'text-amber-600 hover:text-amber-700'
                      : 'text-gray-400 hover:text-gray-600'
                }`}>
                {t.label}
              </button>
            ))}
            <div className="flex-1" />
            {tabAktif === 'sekolah' && (
              <button onClick={() => setModalTambah(true)}
                className="m-2 px-3 py-1.5 bg-[#003399] hover:bg-[#002277] text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Tambah Sekolah
              </button>
            )}
          </div>

          {/* ── Tab: Senarai Sekolah ────────────────────────────────────────── */}
          {tabAktif === 'sekolah' && (
            <div className="overflow-x-auto">
              {muatTurun ? (
                <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  <span className="text-sm">Memuatkan senarai sekolah…</span>
                </div>
              ) : sekolah.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-gray-400 text-sm">Tiada sekolah berdaftar lagi.</p>
                  <button onClick={() => setModalTambah(true)}
                    className="mt-3 text-xs text-[#003399] hover:underline font-semibold">
                    + Tambah sekolah pertama
                  </button>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                      <th className="px-4 py-3 text-left">Sekolah</th>
                      <th className="px-3 py-3 text-left hidden sm:table-cell">Daerah</th>
                      <th className="px-3 py-3 text-left hidden md:table-cell">URL</th>
                      <th className="px-3 py-3 text-center hidden lg:table-cell">Expiry</th>
                      <th className="px-3 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-right">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sekolah.map(s => {
                      const baki = bakiHari(s.tarikhExpiry)
                      return (
                        <tr key={s.id} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${baki !== null && baki < 0 ? 'bg-red-50/30' : ''}`}>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-800 text-xs">{s.namaSekolah || '—'}</p>
                            <p className="text-[10px] text-gray-400">{s.namaAdmin || '—'}</p>
                          </td>
                          <td className="px-3 py-3 text-xs text-gray-500 hidden sm:table-cell">{s.daerah || '—'}</td>
                          <td className="px-3 py-3 hidden md:table-cell">
                            {s.slug ? (
                              <a href={`https://goldpodium.web.app/${s.slug}`} target="_blank" rel="noopener noreferrer"
                                className="text-[10px] font-mono text-[#003399] hover:underline">
                                /{s.slug}
                              </a>
                            ) : <span className="text-[10px] text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-3 text-center hidden lg:table-cell">
                            <p className={`text-[10px] ${warnaExpiry(baki)}`}>
                              {s.tarikhExpiry?.toDate ? s.tarikhExpiry.toDate().toLocaleDateString('ms-MY') : '—'}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${WARNA_STATUS[s.status] || 'bg-gray-100 text-gray-500'}`}>
                              {LABEL_STATUS[s.status] || 'Menunggu'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {muatTurunTindakan === s.id ? (
                              <svg className="w-4 h-4 animate-spin text-gray-400 ml-auto" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                              </svg>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => masukSebagaiAdmin(s)}
                                  className="text-[10px] font-bold text-[#003399] hover:text-white hover:bg-[#003399] px-2 py-1 rounded border border-[#003399]/30 hover:border-[#003399] transition-colors">
                                  Masuk
                                </button>
                                <button onClick={() => resetPwAdmin(s)}
                                  className="text-[10px] font-bold text-orange-500 hover:text-white hover:bg-orange-500 px-2 py-1 rounded border border-orange-300 hover:border-orange-500 transition-colors"
                                  title="Hantar reset password ke emel admin">
                                  Reset PW
                                </button>
                                {s.status === 'active' ? (
                                  <button onClick={() => tangguhSekolah(s)}
                                    className="text-[10px] font-bold text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors">
                                    Tangguh
                                  </button>
                                ) : (
                                  <button onClick={() => aktifkanSekolah(s)}
                                    className="text-[10px] font-bold text-green-600 hover:text-green-800 px-2 py-1 rounded hover:bg-green-50 transition-colors">
                                    Aktifkan
                                  </button>
                                )}
                                <button onClick={() => padamSekolah(s)}
                                  className="text-[10px] font-bold text-gray-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                                  title="Padam sekolah">
                                  🗑
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Tab: Langganan ──────────────────────────────────────────────── */}
          {tabAktif === 'langganan' && (
            <div className="p-5">
              {muatTurun ? (
                <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                </div>
              ) : senaraiLangganan.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-12">Tiada sekolah berdaftar.</p>
              ) : (
                <div className="space-y-3">
                  {senaraiLangganan.map(s => {
                    const baki = bakiHari(s.tarikhExpiry)
                    const tamat = baki !== null && baki < 0
                    const hampir = baki !== null && baki >= 0 && baki <= 30

                    return (
                      <div key={s.id} className={`border-2 rounded-2xl p-4 flex items-center gap-4 ${
                        tamat   ? 'border-red-200 bg-red-50/40'
                        : hampir ? 'border-amber-200 bg-amber-50/30'
                        : 'border-gray-100 bg-white'
                      }`}>
                        {/* Ikon status */}
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${
                          tamat ? 'bg-red-100' : hampir ? 'bg-amber-100' : 'bg-green-100'
                        }`}>
                          {tamat ? '🔴' : hampir ? '🟡' : '🟢'}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-800 truncate">{s.namaSekolah}</p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${WARNA_PAKEJ[s.pakej] || 'bg-gray-100 text-gray-500'}`}>
                              {LABEL_PAKEJ[s.pakej] || '—'}
                            </span>
                            <span className={`text-xs ${warnaExpiry(baki)}`}>
                              {labelExpiry(baki)}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {s.tarikhExpiry?.toDate ? s.tarikhExpiry.toDate().toLocaleDateString('ms-MY') : '—'}
                            </span>
                          </div>
                        </div>

                        {/* Tindakan */}
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <button onClick={() => setModalPerbaharui(s)}
                            className="text-[10px] font-bold px-3 py-1.5 bg-[#003399] hover:bg-[#002277] text-white rounded-lg transition-colors">
                            Perbaharui
                          </button>
                          {s.status === 'active' ? (
                            <button onClick={() => tangguhSekolah(s)}
                              className="text-[10px] font-bold text-red-500 hover:text-red-700 px-3 py-1 transition-colors">
                              Tangguh
                            </button>
                          ) : (
                            <button onClick={() => aktifkanSekolah(s)}
                              className="text-[10px] font-bold text-green-600 hover:text-green-800 px-3 py-1 transition-colors">
                              Aktifkan
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Log Keselamatan ─────────────────────────────────────────── */}
          {tabAktif === 'keselamatan' && (
            <div className="p-6">
              {!logKeselamatan ? (
                <p className="text-sm text-gray-400 text-center py-8">Tiada rekod keselamatan.</p>
              ) : (
                <div className="space-y-4">
                  {logKeselamatan.failedLogins && Object.keys(logKeselamatan.failedLogins).length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-3">
                        Log Masuk Gagal (5+ percubaan)
                      </p>
                      <div className="space-y-2">
                        {Object.entries(logKeselamatan.failedLogins).map(([emel, info]) => (
                          <div key={emel} className="flex items-center justify-between bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
                            <div>
                              <p className="text-xs font-semibold text-gray-800">{emel}</p>
                              <p className="text-[10px] text-gray-400">{info.count} percubaan</p>
                            </div>
                            <span className="text-[9px] font-bold bg-red-200 text-red-700 px-2 py-0.5 rounded-full">AMARAN</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {logKeselamatan.adminActions && Object.keys(logKeselamatan.adminActions).length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-3">Log Tindakan Pentadbir</p>
                      <div className="space-y-2">
                        {Object.entries(logKeselamatan.adminActions).slice(0, 20).map(([kunci, info]) => (
                          <div key={kunci} className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5">
                            <p className="text-xs text-gray-700">{info.tindakan}</p>
                            <p className="text-[10px] text-gray-400">{info.idSekolah || ''}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(!logKeselamatan.failedLogins || Object.keys(logKeselamatan.failedLogins).length === 0) &&
                   (!logKeselamatan.adminActions || Object.keys(logKeselamatan.adminActions).length === 0) && (
                    <p className="text-sm text-gray-400 text-center py-8">Tiada rekod keselamatan untuk ditunjukkan.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {modalTambah && (
        <ModalTambahSekolah onTutup={() => setModalTambah(false)} onSimpan={muatSekolah} />
      )}

      {modalPerbaharui && (
        <ModalPerbaharui
          sekolah={modalPerbaharui}
          onTutup={() => setModalPerbaharui(null)}
          onBerjaya={handlePerbaharuiBerjaya}
        />
      )}
    </div>
  )
}
