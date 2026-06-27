import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Landing from './pages/Landing'
import Login from './pages/Login'
import SchoolLanding from './pages/SchoolLanding'
import Demo from './pages/Demo'
import SuperadminPanel from './pages/superadmin/SuperadminPanel'
import AdminPanel from './pages/admin/AdminPanel'
import AdminDashboard from './pages/admin/AdminDashboard'
import KejohananDetail from './pages/admin/KejohananDetail'
import KategoriSetup from './pages/admin/KategoriSetup'
import AcaraSetup from './pages/admin/AcaraSetup'
import PendaftaranSetup from './pages/admin/PendaftaranSetup'
import StartListSetup from './pages/admin/StartListSetup'
import InputKeputusan from './pages/admin/InputKeputusan'
import MedalTallySetup from './pages/admin/MedalTallySetup'
import LaporanCetakan from './pages/admin/LaporanCetakan'
import TeacherDashboard from './pages/teacher/TeacherDashboard'
import SuperadminSetup from './pages/superadmin/SuperadminSetup'
import ForceChangePassword from './pages/ForceChangePassword'

// ── Route Guards ──────────────────────────────────────────────────────────────

function RequireAuth({ children, roles }) {
  const { user, userRole, loading, needsSetup, mustChangePassword } = useAuth()
  const location = useLocation()

  if (loading) return null

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />

  if (needsSetup || userRole === 'pending_setup') return <Navigate to="/superadmin/setup" replace />

  if (mustChangePassword) return <Navigate to="/tukar-password" replace />

  if (roles && !roles.includes(userRole)) {
    const dest = { superadmin: '/superadmin', admin: '/admin', teacher: '/dashboard' }[userRole] || '/login'
    return <Navigate to={dest} replace />
  }

  return children
}

function RedirectIfLoggedIn({ children }) {
  const { user, userRole, loading, needsSetup, mustChangePassword } = useAuth()

  if (loading) return null

  if (user && (needsSetup || userRole === 'pending_setup')) return <Navigate to="/superadmin/setup" replace />

  if (user && mustChangePassword) return <Navigate to="/tukar-password" replace />

  if (user && userRole) {
    const dest = { superadmin: '/superadmin', admin: '/admin', teacher: '/dashboard' }[userRole] || '/dashboard'
    return <Navigate to={dest} replace />
  }

  return children
}

// ── Privacy & Terms placeholders ──────────────────────────────────────────────

function StaticPage({ title, children }) {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10 max-w-2xl mx-auto">
      <h1 className="text-xl font-black text-gray-900 mb-6">{title}</h1>
      <div className="prose prose-sm text-gray-600">{children}</div>
    </div>
  )
}

// ── App Routes ────────────────────────────────────────────────────────────────

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/demo" element={<Demo />} />

      <Route path="/privasi" element={
        <StaticPage title="Dasar Privasi">
          <p>Gold Podium komited untuk melindungi data anda selaras dengan Akta Perlindungan Data Peribadi (PDPA) Malaysia 2010.</p>
          <p className="mt-3">Semua nombor kad pengenalan dienkripsi menggunakan SHA-256 dan tidak pernah disimpan dalam bentuk asal. Kami hanya mengumpul data minimum yang diperlukan untuk pengurusan kejohanan.</p>
          <p className="mt-3">Data disimpan dengan selamat di pelayan Google Firebase. Pihak sekolah boleh memohon pemadaman data mereka pada bila-bila masa.</p>
        </StaticPage>
      } />

      <Route path="/syarat" element={
        <StaticPage title="Terma &amp; Syarat">
          <p>Dengan menggunakan Gold Podium, anda bersetuju untuk menggunakan sistem ini bagi tujuan pengurusan kejohanan sukan sekolah yang dibenarkan sahaja.</p>
          <p className="mt-3">Penyalahgunaan sistem, capaian tanpa kebenaran atau perkongsian kelayakan log masuk adalah dilarang sama sekali.</p>
          <p className="mt-3">Gold Podium berhak untuk menggantung akaun yang melanggar terma ini.</p>
        </StaticPage>
      } />

      {/* Login — redirect kalau dah login */}
      <Route path="/login" element={
        <RedirectIfLoggedIn>
          <Login />
        </RedirectIfLoggedIn>
      } />

      {/* Superadmin setup (first run) */}
      <Route path="/superadmin/setup" element={<SuperadminSetup />} />

      {/* Tukar password paksa (first login) */}
      <Route path="/tukar-password" element={<ForceChangePassword />} />

      {/* Superadmin — superadmin sahaja */}
      <Route path="/superadmin" element={
        <RequireAuth roles={['superadmin']}>
          <SuperadminPanel />
        </RequireAuth>
      } />

      {/* Admin — admin & superadmin (superadmin boleh masuk untuk bantu) */}
      <Route path="/admin" element={
        <RequireAuth roles={['admin', 'superadmin']}>
          <AdminDashboard />
        </RequireAuth>
      } />
      <Route path="/admin/kejohanan/:kejId" element={
        <RequireAuth roles={['admin', 'superadmin']}>
          <KejohananDetail />
        </RequireAuth>
      } />
      <Route path="/admin/kejohanan/:kejId/pendaftaran" element={
        <RequireAuth roles={['admin', 'superadmin']}>
          <PendaftaranSetup />
        </RequireAuth>
      } />
      <Route path="/admin/kejohanan/:kejId/startlist" element={
        <RequireAuth roles={['admin', 'superadmin']}>
          <StartListSetup />
        </RequireAuth>
      } />
      <Route path="/admin/kejohanan/:kejId/kategori" element={
        <RequireAuth roles={['admin', 'superadmin']}>
          <KategoriSetup />
        </RequireAuth>
      } />
      <Route path="/admin/kejohanan/:kejId/acara" element={
        <RequireAuth roles={['admin', 'superadmin']}>
          <AcaraSetup />
        </RequireAuth>
      } />
      <Route path="/admin/kejohanan/:kejId/keputusan" element={
        <RequireAuth roles={['admin', 'superadmin']}>
          <InputKeputusan />
        </RequireAuth>
      } />
      <Route path="/admin/kejohanan/:kejId/medal" element={
        <RequireAuth roles={['admin', 'superadmin']}>
          <MedalTallySetup />
        </RequireAuth>
      } />
      <Route path="/admin/kejohanan/:kejId/laporan" element={
        <RequireAuth roles={['admin', 'superadmin']}>
          <LaporanCetakan />
        </RequireAuth>
      } />
      <Route path="/admin/*" element={
        <RequireAuth roles={['admin', 'superadmin']}>
          <AdminPanel />
        </RequireAuth>
      } />

      {/* Teacher — teacher sahaja */}
      <Route path="/dashboard" element={
        <RequireAuth roles={['teacher']}>
          <TeacherDashboard />
        </RequireAuth>
      } />

      {/* URL per sekolah — goldpodium.web.app/:slug */}
      <Route path="/:slug" element={<SchoolLanding />} />

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
