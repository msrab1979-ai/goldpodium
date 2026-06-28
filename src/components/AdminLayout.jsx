import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV = [
  {
    label: 'Utama',
    items: [
      { label: 'Dashboard',    icon: '🏠', path: '/admin' },
      { label: 'Kejohanan',    icon: '🏆', path: '/admin/kejohanan-setup' },
      { label: 'Jadual',       icon: '📅', path: '/admin/jadual' },
    ],
  },
  {
    label: 'Pengurusan',
    items: [
      { label: 'Setup Kategori', icon: '🏫', path: '/admin/sekolah' },
      { label: 'Pengguna',     icon: '👤', path: '/admin/pengguna' },
      { label: 'Pendaftaran',  icon: '📝', path: '/admin/analisis-pendaftaran' },
      { label: 'Rekod',        icon: '🎖️', path: '/admin/rekod' },
      { label: 'Olahragawan',  icon: '⭐', path: '/admin/olahragawan' },
      { label: 'Analisa Pingat', icon: '🥇', path: '/admin/analisa-pingat' },
    ],
  },
  {
    label: 'Cetakan & Sijil',
    items: [
      { label: 'Buku Kejohanan', icon: '📖', path: '/admin/buku-kejohanan' },
      { label: 'Cetak Acara',    icon: '🖨️', path: '/admin/cetak-acara' },
      { label: 'Cetak Keputusan',icon: '📄', path: '/admin/cetak-keputusan' },
      { label: 'E-Sijil',        icon: '🎓', path: '/admin/esijil' },
      { label: 'Muat Turun Sijil',icon: '⬇️', path: '/admin/muat-turun-sijil' },
    ],
  },
  {
    label: 'Sistem',
    items: [
      { label: 'Tetapan',      icon: '⚙️', path: '/admin/tetapan' },
      { label: 'Backup',       icon: '💾', path: '/admin/backup' },
      { label: 'Health Check', icon: '🩺', path: '/admin/health' },
      { label: 'Reset Sistem', icon: '🔄', path: '/admin/reset' },
    ],
  },
]

export default function AdminLayout({ children }) {
  const { userData, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const isSuperadmin = userData?.role === 'superadmin'
  const viewNamaSekolah = isSuperadmin
    ? (() => { try { return JSON.parse(sessionStorage.getItem('gp_view_school') || '{}').namaSekolah || '' } catch { return '' } })()
    : null
  const namaSekolah = viewNamaSekolah || userData?.name || 'Admin'

  function isActive(path) {
    if (path === '/admin') return location.pathname === '/admin'
    return location.pathname.startsWith(path)
  }

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-yellow-400 rounded-xl flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-[#003399]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-[9px] text-white/40 uppercase tracking-widest">Gold Podium</p>
            <p className="text-sm font-bold text-white leading-tight truncate">{namaSekolah}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV.map(group => (
          <div key={group.label}>
            <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest px-2 mb-1.5">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map(item => (
                <button
                  key={item.path}
                  onClick={() => { navigate(item.path); setMobileOpen(false) }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all text-left ${
                    isActive(item.path)
                      ? 'bg-white/15 text-white'
                      : 'text-white/60 hover:bg-white/8 hover:text-white'
                  }`}
                >
                  <span className="text-base leading-none">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-white/10 space-y-1">
        {isSuperadmin && (
          <button
            onClick={() => { sessionStorage.removeItem('gp_view_school'); navigate('/superadmin') }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-amber-300 hover:bg-white/8 transition-all text-left"
          >
            <span className="text-base">⚡</span>
            <span>Panel Superadmin</span>
          </button>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-white/50 hover:bg-white/8 hover:text-white transition-all text-left"
        >
          <span className="text-base">🚪</span>
          <span>Log Keluar</span>
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex bg-gray-50">

      {/* Sidebar desktop — fixed */}
      <aside className="hidden lg:flex flex-col w-56 bg-[#003399] fixed top-0 left-0 h-screen z-30 shadow-2xl">
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-56 bg-[#003399] h-full z-50 shadow-2xl">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 lg:ml-56 flex flex-col min-h-screen">

        {/* Top bar mobile */}
        <header className="lg:hidden bg-[#003399] text-white px-4 py-3 flex items-center justify-between shadow-lg sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="text-white/70 hover:text-white p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <p className="text-sm font-bold">{namaSekolah}</p>
          </div>
          <button onClick={handleLogout} className="text-white/60 hover:text-white text-xs">
            Log Keluar
          </button>
        </header>

        {/* Superadmin banner */}
        {isSuperadmin && (
          <div className="bg-amber-400 text-amber-900 px-4 py-2 flex items-center justify-between text-xs font-bold">
            <span>⚡ Mode Superadmin — {viewNamaSekolah || 'Sekolah'}</span>
            <button onClick={() => { sessionStorage.removeItem('gp_view_school'); navigate('/superadmin') }}
              className="underline hover:no-underline">
              ← Balik ke Panel Superadmin
            </button>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
