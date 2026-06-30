import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import { usePWATitle } from '../../hooks/usePWATitle'

// ─── Nav items ────────────────────────────────────────────────────────────────

function buildNavItems(slug) {
  return [
    {
      section: 'UTAMA',
      items: [
        { label: 'Dashboard',       path: `/${slug}/pencatat/dashboard`,         icon: 'home',      exact: true },
      ],
    },
    {
      section: 'OPERASI',
      items: [
        { label: 'Input Keputusan', path: `/${slug}/pencatat/input-keputusan`,   icon: 'clipboard' },
        { label: 'Cetakan Hadiah',  path: `/${slug}/pencatat/cetakan-hadiah`,    icon: 'gift'      },
      ],
    },
    {
      section: 'RUJUKAN',
      items: [
        { label: 'Start List',      path: `/${slug}/pencatat/startlist`,         icon: 'startlist' },
        { label: 'Rekod Semasa',    path: `/${slug}/pencatat/rekod`,             icon: 'star'      },
        { label: 'Cetak Acara',     path: `/${slug}/pencatat/cetak-acara`,       icon: 'file'      },
      ],
    },
  ]
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const Icons = {
  home:      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  clipboard: <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>,
  gift:      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" /></svg>,
  startlist: <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h10M4 18h6" /></svg>,
  star:      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>,
  file:      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  menu:      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>,
  logout:    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
}

// ─── SidebarContent ───────────────────────────────────────────────────────────

function SidebarContent({ userData, slug, sistemTutup, mesejTutup, onLogout, onNavClick }) {
  const nama    = userData?.name || userData?.nama || userData?.kodAkses || 'Pencatat'
  const navItems = buildNavItems(slug)

  return (
    <div className="flex flex-col h-full">
      {/* Branding */}
      <div className="px-4 py-4 border-b border-white/10">
        <p className="text-[10px] font-medium tracking-widest text-white/50 uppercase">Gold Podium</p>
        <p className="text-sm font-bold text-white leading-tight mt-0.5">Panel Pencatat</p>
      </div>

      {/* User info */}
      <div className="px-4 py-3 border-b border-white/10 bg-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold text-white shrink-0">
            {nama.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white truncate">{nama}</p>
            <span className="inline-block text-[10px] bg-yellow-400 text-yellow-900 font-semibold px-1.5 py-0.5 rounded mt-0.5 leading-none">
              Pencatat
            </span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {navItems.map(group => (
          <div key={group.section} className="mb-3">
            <p className="text-[9px] font-bold tracking-widest text-white/30 px-2 py-1 uppercase">
              {group.section}
            </p>
            {group.items.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.exact}
                onClick={onNavClick}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded text-xs font-medium transition-colors mb-0.5 ${
                    isActive
                      ? 'bg-white text-[#003399]'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                {Icons[item.icon]}
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Logout */}
      <div className="px-2 py-3 border-t border-white/10">
        <button onClick={onLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded text-xs font-medium text-white/60 hover:bg-white/10 hover:text-white transition-colors">
          {Icons.logout}
          Log Keluar
        </button>
      </div>
    </div>
  )
}

// ─── PencatatLayout ───────────────────────────────────────────────────────────

export default function PencatatLayout({ children }) {
  const { userData, logout } = useAuth()
  const navigate = useNavigate()
  const { slug }  = useParams()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sistemTutup, setSistemTutup] = useState(false)
  const [mesejTutup,  setMesejTutup]  = useState('')

  useEffect(() => {
    if (!userData?.schoolId) return
    const unsub = onSnapshot(
      doc(db, 'tenants', userData.schoolId, 'tetapan', 'home'),
      snap => {
        if (snap.exists()) {
          setSistemTutup(!!snap.data().sistemTutup)
          setMesejTutup(snap.data().mesejTutup || '')
        }
      },
      () => {}
    )
    return () => unsub()
  }, [userData?.schoolId])

  async function handleLogout() {
    await logout()
    navigate(`/${slug}`)
  }

  const nama = userData?.name || userData?.nama || userData?.kodAkses || 'Pencatat'
  usePWATitle(slug ? slug.toUpperCase() : null)

  const sidebarProps = {
    userData,
    slug: slug || userData?.schoolSlug || '',
    sistemTutup,
    mesejTutup,
    onLogout:  handleLogout,
    onNavClick: () => setSidebarOpen(false),
  }

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-52 bg-[#003399] flex-col shrink-0 shadow-xl">
        <SidebarContent {...sidebarProps} />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="relative z-50 w-52 bg-[#003399] flex flex-col shadow-xl">
            <SidebarContent {...sidebarProps} />
          </aside>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm shrink-0">
          <div className="flex items-center gap-3">
            <button className="lg:hidden p-1 text-gray-500 hover:text-gray-700"
              onClick={() => setSidebarOpen(true)}>
              {Icons.menu}
            </button>
            <div>
              <p className="text-xs text-gray-400 leading-none">Gold Podium</p>
              <p className="text-sm font-bold text-[#003399] leading-tight">Panel Pencatat</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-xs font-semibold text-gray-700">{nama}</p>
              <p className="text-[10px] text-gray-400">Pencatat</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-[#003399] flex items-center justify-center text-xs font-bold text-white">
              {nama.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        {/* Sistem Tutup Banner */}
        {sistemTutup && (
          <div className="bg-red-600 px-4 py-2.5 flex items-center gap-2.5 shrink-0">
            <svg className="w-4 h-4 text-white shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <p className="text-white font-bold text-xs tracking-wide uppercase">Sistem Ditutup — Input keputusan dihalang</p>
            {mesejTutup && <p className="text-white/70 text-xs hidden sm:block">· {mesejTutup}</p>}
          </div>
        )}

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
