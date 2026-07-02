/**
 * UrusetiaLayout — Layout khas untuk Urusetia
 *
 * Nav:
 *   Dashboard | Jadual Acara | Rekod Semasa | Olahragawan
 *
 * Olahragawan: ranking L (Olahragawan) & P (Olahragawati)
 * Mata: E=5, P=3, G=2, T4=1 | Tiebreak: E → P → G → nama abjad
 */

import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

// ─── Nav ──────────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  {
    section: 'UTAMA',
    items: [
      { label: 'Dashboard',     path: '/dashboard',           icon: 'home',     exact: true },
    ],
  },
  {
    section: 'PENGURUSAN',
    items: [
      { label: 'Jadual Acara',  path: '/dashboard/jadual',    icon: 'calendar' },
      { label: 'Rekod Semasa',  path: '/dashboard/rekod',     icon: 'star'     },
      { label: 'Olahragawan',   path: '/dashboard/olahragawan', icon: 'award'  },
    ],
  },
]

// ─── Icons ────────────────────────────────────────────────────────────────────

const Icons = {
  home: (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  calendar: (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  star: (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  ),
  award: (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 0M12 3v10m0 0l-4 4m4-4l4 4M5 21h14" />
    </svg>
  ),
  menu: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
  logout: (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  ),
}

// ─── Sidebar Content ──────────────────────────────────────────────────────────

function SidebarContent({ userData, onLogout, onNavClick }) {
  const nama = userData?.nama || 'Urusetia'

  return (
    <div className="flex flex-col h-full">
      {/* Branding */}
      <div className="px-4 py-4 border-b border-white/10">
        <p className="text-[10px] font-medium tracking-widest text-white/50 uppercase">Gold Podium</p>
        <p className="text-sm font-bold text-white leading-tight mt-0.5">Panel Urusetia</p>
        <p className="text-[10px] text-white/40 mt-0.5">goldpodium.web.app</p>
      </div>

      {/* User info */}
      <div className="px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {nama.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate">{nama}</p>
            <p className="text-[10px] text-white/50 font-mono truncate">{userData?.kodAkses || ''}</p>
          </div>
        </div>
        <div className="mt-2">
          <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 uppercase tracking-wider">
            Urusetia
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_ITEMS.map(group => (
          <div key={group.section} className="mb-1">
            <p className="px-4 pt-3 pb-1 text-[9px] font-bold text-white/30 uppercase tracking-widest">
              {group.section}
            </p>
            {group.items.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.exact}
                onClick={onNavClick}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2.5 text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-white/15 text-white font-semibold'
                      : 'text-white/60 hover:bg-white/8 hover:text-white'
                  }`
                }
              >
                {Icons[item.icon]}
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Logout */}
      <div className="px-3 py-3 border-t border-white/10">
        <button onClick={onLogout}
          className="flex items-center gap-2.5 w-full px-3 py-2.5 text-xs text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
          {Icons.logout}
          Log Keluar
        </button>
      </div>
    </div>
  )
}

// ─── UrusetiaLayout ───────────────────────────────────────────────────────────

export default function UrusetiaLayout({ children }) {
  const { userData, logout } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  async function handleLogout() {
    await logout()
    navigate('/', { replace: true })
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-30 w-56 flex flex-col
        bg-[#003399] transition-transform duration-200
        lg:relative lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <SidebarContent
          userData={userData}
          onLogout={handleLogout}
          onNavClick={() => setSidebarOpen(false)}
        />
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile topbar */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 shrink-0">
          <button onClick={() => setSidebarOpen(true)}
            className="p-1.5 text-gray-500 hover:text-gray-700 transition-colors">
            {Icons.menu}
          </button>
          <p className="text-xs font-bold text-gray-800">Panel Urusetia</p>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
