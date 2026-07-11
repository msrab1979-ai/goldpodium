import { useState, useEffect } from 'react'
import { collection, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import useSchoolId from '../../hooks/useSchoolId'
import { useNavigate } from 'react-router-dom'

const NAV_ITEMS = [
  { id: 'overview',  label: 'Ringkasan',         icon: 'home' },
  { id: 'teachers',  label: 'Urus Guru',  icon: 'users' },
  { id: 'events',    label: 'Tetapan Acara',     icon: 'list' },
  { id: 'athletes',  label: 'Atlet',         icon: 'user' },
  { id: 'results',   label: 'Keputusan',          icon: 'chart' },
  { id: 'profile',   label: 'Profil Sekolah',   icon: 'settings' },
]

const Icons = {
  home: <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  users: <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
  list: <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>,
  user: <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
  chart: <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  settings: <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  logout: <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
  menu: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>,
}

// ── Ringkasan Tab ──────────────────────────────────────────────────────────────

function RingkasanTab({ schoolData, teachers, events, athletes, results }) {
  const stats = [
    { label: 'Guru',  value: teachers.length,  color: 'blue' },
    { label: 'Acara',    value: events.length,    color: 'green' },
    { label: 'Atlet',  value: athletes.length,  color: 'yellow' },
    { label: 'Keputusan',   value: results.length,   color: 'purple' },
  ]
  const colors = {
    blue:   'bg-blue-50 border-blue-200 text-blue-700',
    green:  'bg-green-50 border-green-200 text-green-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
  }
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map(s => (
          <div key={s.label} className={`rounded-xl border p-4 ${colors[s.color]}`}>
            <p className="text-xs font-medium opacity-70">{s.label}</p>
            <p className="text-2xl font-black mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Maklumat Sekolah</p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Nama Sekolah</span>
            <span className="font-semibold text-gray-800">{schoolData?.namaSekolah || schoolData?.schoolName || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Daerah</span>
            <span className="font-semibold text-gray-800">{schoolData?.daerah || schoolData?.district || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Langganan</span>
            <span className={`font-bold text-xs px-2 py-0.5 rounded-full ${
              (schoolData?.langganan || schoolData?.subscription) === 'percuma' || (schoolData?.langganan || schoolData?.subscription) === 'free'
                ? 'bg-gray-100 text-gray-600'
                : (schoolData?.langganan || schoolData?.subscription) === 'sekolah' || (schoolData?.langganan || schoolData?.subscription) === 'school'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-purple-100 text-purple-700'
            }`}>
              {{ percuma: 'PERCUMA', free: 'PERCUMA', sekolah: 'SEKOLAH', school: 'SEKOLAH', daerah: 'DAERAH', district: 'DAERAH' }[schoolData?.langganan || schoolData?.subscription] || 'PERCUMA'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Sukan</span>
            <span className="font-semibold text-gray-800 text-right">
              {(schoolData?.sukan || schoolData?.sports || []).join(', ') || '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Teachers Tab ──────────────────────────────────────────────────────────────

function TeachersTab({ schoolId, teachers, onRefresh }) {
  const [adding,  setAdding]  = useState(false)
  const [form,    setForm]    = useState({ name: '', email: '' })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  async function handleAdd(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim()) return setError('Nama dan emel diperlukan.')
    setLoading(true)
    try {
      const id = `teacher_${Date.now()}`
      await setDoc(doc(db, 'tenants', schoolId, 'teachers', id), {
        id, name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        role: 'teacher', isAktif: true,
        createdAt: serverTimestamp(),
      })
      setForm({ name: '', email: '' })
      setAdding(false)
      onRefresh()
    } catch { setError('Gagal. Sila cuba semula.') }
    setLoading(false)
  }

  async function handleRemove(teacher) {
    if (!confirm(`Buang ${teacher.name}?`)) return
    try {
      await deleteDoc(doc(db, 'tenants', schoolId, 'teachers', teacher.id))
      onRefresh()
    } catch { alert('Gagal. Sila cuba semula.') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{teachers.length} Guru</p>
        {!adding && (
          <button onClick={() => setAdding(true)}
            className="text-xs font-bold text-white bg-[#003399] hover:bg-[#002277] px-3 py-1.5 rounded-lg transition-colors">
            + Tambah Guru
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={handleAdd} className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Nama guru" required
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 bg-white" />
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="guru@sekolah.edu.my" required
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 bg-white" />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={loading}
              className="px-4 py-2 bg-[#003399] text-white text-xs font-bold rounded-lg hover:bg-[#002277] disabled:bg-gray-300 transition-colors">
              {loading ? 'Menyimpan…' : 'Simpan'}
            </button>
            <button type="button" onClick={() => { setAdding(false); setError('') }}
              className="px-4 py-2 bg-white text-gray-500 text-xs font-bold rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
              Batal
            </button>
          </div>
        </form>
      )}

      {teachers.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Tiada guru ditambah lagi.</p>
      ) : (
        <div className="space-y-2">
          {teachers.map(t => (
            <div key={t.id} className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm">
              <div>
                <p className="text-sm font-semibold text-gray-800">{t.name}</p>
                <p className="text-xs text-gray-400">{t.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">GURU</span>
                <button onClick={() => handleRemove(t)}
                  className="text-gray-300 hover:text-red-500 transition-colors p-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Events Tab ────────────────────────────────────────────────────────────────

function EventsTab({ schoolId, events, onRefresh }) {
  const [adding,  setAdding]  = useState(false)
  const [form,    setForm]    = useState({ name: '', sport: 'Olahraga', date: '', venue: '' })
  const [loading, setLoading] = useState(false)

  async function handleAdd(e) {
    e.preventDefault()
    setLoading(true)
    try {
      const id = `event_${Date.now()}`
      await setDoc(doc(db, 'tenants', schoolId, 'events', id), {
        id, name: form.name.trim(), sport: form.sport,
        date: form.date, venue: form.venue.trim(),
        status: 'akan_datang', createdAt: serverTimestamp(),
      })
      setForm({ name: '', sport: 'Olahraga', date: '', venue: '' })
      setAdding(false)
      onRefresh()
    } catch { alert('Gagal. Sila cuba semula.') }
    setLoading(false)
  }

  const STATUS_LABEL = {
    akan_datang: 'AKAN DATANG',
    aktif:       'AKTIF',
    selesai:     'SELESAI',
    dibatalkan:  'DIBATALKAN',
  }
  const STATUS_COLOR = {
    akan_datang: 'bg-yellow-100 text-yellow-700',
    aktif:       'bg-green-100 text-green-700',
    selesai:     'bg-gray-100 text-gray-600',
    dibatalkan:  'bg-red-100 text-red-600',
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{events.length} Acara</p>
        {!adding && (
          <button onClick={() => setAdding(true)}
            className="text-xs font-bold text-white bg-[#003399] hover:bg-[#002277] px-3 py-1.5 rounded-lg transition-colors">
            + Tambah Acara
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={handleAdd} className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Nama acara" required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 bg-white" />
            </div>
            <select value={form.sport} onChange={e => setForm(f => ({ ...f, sport: e.target.value }))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 bg-white">
              {['Olahraga','Renang','Badminton','Bola Sepak','Bola Tampar','Bola Keranjang'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              required className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 bg-white" />
            <div className="col-span-2">
              <input type="text" value={form.venue} onChange={e => setForm(f => ({ ...f, venue: e.target.value }))}
                placeholder="Tempat / Gelanggang" required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 bg-white" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={loading}
              className="px-4 py-2 bg-[#003399] text-white text-xs font-bold rounded-lg hover:bg-[#002277] disabled:bg-gray-300 transition-colors">
              {loading ? 'Menyimpan…' : 'Simpan'}
            </button>
            <button type="button" onClick={() => setAdding(false)}
              className="px-4 py-2 bg-white text-gray-500 text-xs font-bold rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
              Batal
            </button>
          </div>
        </form>
      )}

      {events.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Tiada acara lagi.</p>
      ) : (
        <div className="space-y-2">
          {events.map(ev => (
            <div key={ev.id} className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm">
              <div>
                <p className="text-sm font-semibold text-gray-800">{ev.name}</p>
                <p className="text-xs text-gray-400">{ev.sport} · {ev.date} · {ev.venue}</p>
              </div>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${STATUS_COLOR[ev.status] || 'bg-gray-100 text-gray-500'}`}>
                {STATUS_LABEL[ev.status] || 'AKAN DATANG'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main AdminPanel ───────────────────────────────────────────────────────────

export default function AdminPanel() {
  const { userData, logout } = useAuth()
  const navigate = useNavigate()
  const { schoolId } = useSchoolId()

  const [activeTab, setActiveTab] = useState('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [schoolData, setSchoolData] = useState(null)
  const [teachers,   setTeachers]   = useState([])
  const [events,     setEvents]     = useState([])
  const [athletes,   setAthletes]   = useState([])
  const [results,    setResults]    = useState([])

  async function loadData() {
    if (!schoolId) return
    try {
      const [schSnap, teachSnap, evSnap, athSnap, resSnap] = await Promise.all([
        getDoc(doc(db, 'tenants', schoolId)),
        getDocs(collection(db, 'tenants', schoolId, 'teachers')),
        getDocs(collection(db, 'tenants', schoolId, 'events')),
        getDocs(collection(db, 'tenants', schoolId, 'athletes')),
        getDocs(collection(db, 'tenants', schoolId, 'results')),
      ])
      if (schSnap.exists()) setSchoolData(schSnap.data())
      setTeachers(teachSnap.docs.map(d => d.data()))
      setEvents(evSnap.docs.map(d => d.data()))
      setAthletes(athSnap.docs.map(d => d.data()))
      setResults(resSnap.docs.map(d => d.data()))
    } catch { /* skip */ }
  }

  useEffect(() => { loadData() }, [schoolId]) // eslint-disable-line

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const CONTENT = {
    overview: <RingkasanTab schoolData={schoolData} teachers={teachers} events={events} athletes={athletes} results={results} />,
    teachers: <TeachersTab schoolId={schoolId} teachers={teachers} onRefresh={loadData} />,
    events:   <EventsTab schoolId={schoolId} events={events} onRefresh={loadData} />,
    athletes: <div className="text-sm text-gray-400 py-8 text-center">Modul atlet — akan datang.</div>,
    results:  <div className="text-sm text-gray-400 py-8 text-center">Modul keputusan — akan datang.</div>,
    profile:  <div className="text-sm text-gray-400 py-8 text-center">Tetapan profil — akan datang.</div>,
  }

  function SidebarContent() {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-4 border-b border-white/10">
          <p className="text-[10px] font-medium tracking-widest text-white/50 uppercase">Gold Podium</p>
          <p className="text-sm font-bold text-white leading-tight mt-0.5">
            {schoolData?.namaSekolah || schoolData?.schoolName || 'Panel Pentadbir'}
          </p>
          <p className="text-[10px] text-white/40 mt-0.5">{schoolData?.daerah || schoolData?.district || ''}</p>
        </div>
        <div className="px-4 py-3 border-b border-white/10 bg-white/5">
          <p className="text-xs font-semibold text-white truncate">{userData?.name || userData?.email}</p>
          <span className="text-[9px] bg-green-400 text-green-900 font-bold px-1.5 py-0.5 rounded mt-0.5 inline-block">ADMIN</span>
        </div>
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {NAV_ITEMS.map(item => (
            <button key={item.id} onClick={() => { setActiveTab(item.id); setSidebarOpen(false) }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-xs font-medium transition-colors mb-0.5 ${
                activeTab === item.id
                  ? 'bg-white text-[#003399]'
                  : 'text-white/80 hover:bg-white/10 hover:text-white'
              }`}>
              {Icons[item.icon]}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="px-2 py-3 border-t border-white/10">
          <button onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded text-xs font-medium text-white/60 hover:bg-white/10 hover:text-white transition-colors">
            {Icons.logout}
            Log Keluar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-52 bg-[#003399] flex-col shrink-0 shadow-xl">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="relative z-50 w-52 bg-[#003399] flex flex-col shadow-xl">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm shrink-0">
          <div className="flex items-center gap-3">
            <button className="lg:hidden p-1 text-gray-500 hover:text-gray-700" onClick={() => setSidebarOpen(true)}>
              {Icons.menu}
            </button>
            <div>
              <p className="text-xs text-gray-400 leading-none">Gold Podium</p>
              <p className="text-sm font-bold text-[#003399] leading-tight">
                {NAV_ITEMS.find(n => n.id === activeTab)?.label || 'Panel Pentadbir'}
              </p>
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-[#003399] flex items-center justify-center text-xs font-bold text-white">
            {(userData?.name || userData?.email || 'A').charAt(0).toUpperCase()}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {CONTENT[activeTab]}
        </main>
      </div>
    </div>
  )
}
