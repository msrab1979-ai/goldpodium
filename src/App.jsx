import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'

// ── Lazy imports — setiap modul load bila diperlukan sahaja ──────────────────
const Landing            = lazy(() => import('./pages/Landing'))
const Login              = lazy(() => import('./pages/Login'))
const SchoolLanding      = lazy(() => import('./pages/SchoolLanding'))
const Demo               = lazy(() => import('./pages/Demo'))
const SuperadminSetup    = lazy(() => import('./pages/superadmin/SuperadminSetup'))
const SuperadminPanel    = lazy(() => import('./pages/superadmin/SuperadminPanel'))
const AdminDashboard     = lazy(() => import('./pages/admin/AdminDashboard'))
const AdminPanel         = lazy(() => import('./pages/admin/AdminPanel'))
const KejohananDetail    = lazy(() => import('./pages/admin/KejohananDetail'))
const KategoriSetup      = lazy(() => import('./pages/admin/KategoriSetup'))
const AcaraSetup         = lazy(() => import('./pages/admin/AcaraSetup'))
const PendaftaranSetup   = lazy(() => import('./pages/admin/PendaftaranSetup'))
const StartListSetup     = lazy(() => import('./pages/admin/StartListSetup'))
const InputKeputusan     = lazy(() => import('./pages/admin/InputKeputusan'))
const MedalTallySetup   = lazy(() => import('./pages/admin/MedalTallySetup'))
const LaporanCetakan     = lazy(() => import('./pages/admin/LaporanCetakan'))
const SekolahSetup       = lazy(() => import('./pages/admin/SekolahSetup'))
const KejohananSetup     = lazy(() => import('./pages/admin/KejohananSetup'))
const UserManagement     = lazy(() => import('./pages/admin/UserManagement'))
const TetapanHome        = lazy(() => import('./pages/admin/TetapanHome'))
const JadualSetup        = lazy(() => import('./pages/admin/JadualSetup'))
const Rekod              = lazy(() => import('./pages/admin/Rekod'))
const Olahragawan        = lazy(() => import('./pages/admin/Olahragawan'))
const AnalisaPingat      = lazy(() => import('./pages/admin/AnalisaPingat'))
const ResetSistem        = lazy(() => import('./pages/admin/ResetSistem'))
const HealthCheck        = lazy(() => import('./pages/admin/HealthCheck'))
const PencatatDashboard  = lazy(() => import('./pages/pencatat/PencatatDashboard'))
const PencatatInput      = lazy(() => import('./pages/pencatat/InputKeputusan'))
const PencatatLogin      = lazy(() => import('./pages/pencatat/PencatatLogin'))
const ForceChangePassword = lazy(() => import('./pages/ForceChangePassword'))
const AnalisisPendaftaran = lazy(() => import('./pages/admin/AnalisisPendaftaran'))
const Backup             = lazy(() => import('./pages/admin/Backup'))
const BukuKejohanan      = lazy(() => import('./pages/admin/BukuKejohanan'))
const BukuKejohananLinkSetup = lazy(() => import('./pages/admin/BukuKejohananLinkSetup'))
const BukuKongsiSetup    = lazy(() => import('./pages/admin/BukuKongsiSetup'))
const BukuProgramSetup   = lazy(() => import('./pages/admin/BukuProgramSetup'))
const CetakAcara         = lazy(() => import('./pages/admin/CetakAcara'))
const CetakKeputusan     = lazy(() => import('./pages/admin/CetakKeputusan'))
const ESijil             = lazy(() => import('./pages/admin/ESijil'))
const ESijilPencapaian   = lazy(() => import('./pages/admin/ESijilPencapaian'))
const GaleriSetup        = lazy(() => import('./pages/admin/GaleriSetup'))
const ManualPendaftaran  = lazy(() => import('./pages/admin/ManualPendaftaran'))
const MuatTurunSijil     = lazy(() => import('./pages/admin/MuatTurunSijil'))
const SijilPengurus      = lazy(() => import('./pages/admin/SijilPengurus'))

// ── Spinner ringkas semasa lazy load ─────────────────────────────────────────
function PageLoader() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <svg className="w-7 h-7 animate-spin text-[#003399]/40" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
    </div>
  )
}

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
    <Suspense fallback={<PageLoader />}>
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

        {/* Login */}
        <Route path="/login" element={
          <RedirectIfLoggedIn>
            <Login />
          </RedirectIfLoggedIn>
        } />
        <Route path="/login/pencatat" element={
          <RedirectIfLoggedIn>
            <PencatatLogin />
          </RedirectIfLoggedIn>
        } />

        {/* Superadmin */}
        <Route path="/superadmin/setup" element={<SuperadminSetup />} />
        <Route path="/superadmin" element={
          <RequireAuth roles={['superadmin']}>
            <SuperadminPanel />
          </RequireAuth>
        } />

        {/* Tukar password paksa */}
        <Route path="/tukar-password" element={<ForceChangePassword />} />

        {/* Admin */}
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
        <Route path="/admin/sekolah" element={
          <RequireAuth roles={['admin', 'superadmin']}>
            <SekolahSetup />
          </RequireAuth>
        } />
        <Route path="/admin/kejohanan-setup" element={
          <RequireAuth roles={['admin', 'superadmin']}>
            <KejohananSetup />
          </RequireAuth>
        } />
        <Route path="/admin/pengguna" element={
          <RequireAuth roles={['admin', 'superadmin']}>
            <UserManagement />
          </RequireAuth>
        } />
        <Route path="/admin/tetapan" element={
          <RequireAuth roles={['admin', 'superadmin']}>
            <TetapanHome />
          </RequireAuth>
        } />
        <Route path="/admin/jadual" element={
          <RequireAuth roles={['admin', 'superadmin']}>
            <JadualSetup />
          </RequireAuth>
        } />
        <Route path="/admin/rekod" element={
          <RequireAuth roles={['admin', 'superadmin']}>
            <Rekod />
          </RequireAuth>
        } />
        <Route path="/admin/olahragawan" element={
          <RequireAuth roles={['admin', 'superadmin']}>
            <Olahragawan />
          </RequireAuth>
        } />
        <Route path="/admin/analisa-pingat" element={
          <RequireAuth roles={['admin', 'superadmin']}>
            <AnalisaPingat />
          </RequireAuth>
        } />
        <Route path="/admin/reset" element={
          <RequireAuth roles={['admin', 'superadmin']}>
            <ResetSistem />
          </RequireAuth>
        } />
        <Route path="/admin/health" element={
          <RequireAuth roles={['admin', 'superadmin']}>
            <HealthCheck />
          </RequireAuth>
        } />
        <Route path="/admin/analisis-pendaftaran" element={
          <RequireAuth roles={['admin', 'superadmin']}>
            <AnalisisPendaftaran />
          </RequireAuth>
        } />
        <Route path="/admin/backup" element={
          <RequireAuth roles={['admin', 'superadmin']}>
            <Backup />
          </RequireAuth>
        } />
        <Route path="/admin/buku-kejohanan" element={
          <RequireAuth roles={['admin', 'superadmin']}>
            <BukuKejohanan />
          </RequireAuth>
        } />
        <Route path="/admin/buku-kejohanan-link" element={
          <RequireAuth roles={['admin', 'superadmin']}>
            <BukuKejohananLinkSetup />
          </RequireAuth>
        } />
        <Route path="/admin/buku-kongsi" element={
          <RequireAuth roles={['admin', 'superadmin']}>
            <BukuKongsiSetup />
          </RequireAuth>
        } />
        <Route path="/admin/buku-program" element={
          <RequireAuth roles={['admin', 'superadmin']}>
            <BukuProgramSetup />
          </RequireAuth>
        } />
        <Route path="/admin/cetak-acara" element={
          <RequireAuth roles={['admin', 'superadmin']}>
            <CetakAcara />
          </RequireAuth>
        } />
        <Route path="/admin/cetak-keputusan" element={
          <RequireAuth roles={['admin', 'superadmin']}>
            <CetakKeputusan />
          </RequireAuth>
        } />
        <Route path="/admin/esijil" element={
          <RequireAuth roles={['admin', 'superadmin']}>
            <ESijil />
          </RequireAuth>
        } />
        <Route path="/admin/esijil-pencapaian" element={
          <RequireAuth roles={['admin', 'superadmin']}>
            <ESijilPencapaian />
          </RequireAuth>
        } />
        <Route path="/admin/galeri" element={
          <RequireAuth roles={['admin', 'superadmin']}>
            <GaleriSetup />
          </RequireAuth>
        } />
        <Route path="/admin/manual-pendaftaran" element={
          <RequireAuth roles={['admin', 'superadmin']}>
            <ManualPendaftaran />
          </RequireAuth>
        } />
        <Route path="/admin/muat-turun-sijil" element={
          <RequireAuth roles={['admin', 'superadmin']}>
            <MuatTurunSijil />
          </RequireAuth>
        } />
        <Route path="/admin/sijil-pengurus" element={
          <RequireAuth roles={['admin', 'superadmin']}>
            <SijilPengurus />
          </RequireAuth>
        } />
        <Route path="/admin/*" element={
          <RequireAuth roles={['admin', 'superadmin']}>
            <AdminPanel />
          </RequireAuth>
        } />

        {/* Pencatat (teacher role) */}
        <Route path="/dashboard" element={
          <RequireAuth roles={['teacher']}>
            <PencatatDashboard />
          </RequireAuth>
        } />
        <Route path="/dashboard/kejohanan/:kejId/keputusan" element={
          <RequireAuth roles={['teacher']}>
            <PencatatInput />
          </RequireAuth>
        } />

        {/* URL per sekolah */}
        <Route path="/:slug" element={<SchoolLanding />} />

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
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
