import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import AdminLayout from './components/AdminLayout'
import PWAInstallPrompt from './components/PWAInstallPrompt'

// ── Lazy imports — setiap modul load bila diperlukan sahaja ──────────────────
const Landing            = lazy(() => import('./pages/Landing'))
const Login              = lazy(() => import('./pages/Login'))
const SchoolLanding      = lazy(() => import('./pages/SchoolLanding'))
const SuperadminSetup    = lazy(() => import('./pages/superadmin/SuperadminSetup'))
const SuperadminPanel    = lazy(() => import('./pages/superadmin/SuperadminPanel'))
const AdminDashboard     = lazy(() => import('./pages/admin/AdminDashboard'))
const AdminPanel         = lazy(() => import('./pages/admin/AdminPanel'))
const KejohananDetail    = lazy(() => import('./pages/admin/KejohananDetail'))
const KategoriSetup      = lazy(() => import('./pages/admin/KategoriSetup'))
const AcaraSetup         = lazy(() => import('./pages/admin/AcaraSetup'))
const PendaftaranSetup   = lazy(() => import('./pages/admin/PendaftaranSetup'))
const StartListSetup     = lazy(() => import('./pages/admin/StartListSetup'))
const StartList          = lazy(() => import('./pages/admin/StartList'))
const PengesahanPeserta  = lazy(() => import('./pages/admin/PengesahanPeserta'))
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
const PencatatLayout     = lazy(() => import('./pages/pencatat/PencatatLayout'))
const PencatatHome       = lazy(() => import('./pages/pencatat/PencatatHome'))
const PencatatInputKej   = lazy(() => import('./pages/pencatat/PencatatDashboard'))
const PencatatInput      = lazy(() => import('./pages/pencatat/InputKeputusan'))
const PencatatCetakanHadiah = lazy(() => import('./pages/pencatat/CetakanHadiah'))
const PencatatStartList  = lazy(() => import('./pages/admin/StartList'))
const PencatatRekod      = lazy(() => import('./pages/admin/Rekod'))
const PencatatCetakAcara = lazy(() => import('./pages/admin/CetakAcara'))
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
const AksesPantasPage    = lazy(() => import('./pages/admin/AksesPantasPage'))
const GaleriSetup        = lazy(() => import('./pages/admin/GaleriSetup'))
const ManualPendaftaran  = lazy(() => import('./pages/admin/ManualPendaftaran'))
const MuatTurunSijil     = lazy(() => import('./pages/admin/MuatTurunSijil'))
const SijilPengurus      = lazy(() => import('./pages/admin/SijilPengurus'))
const PengurusLogin      = lazy(() => import('./pages/pengurus/PengurusLogin'))
const PengurusDashboard  = lazy(() => import('./pages/pengurus/PengurusDashboard'))
const BukuKongsiPP       = lazy(() => import('./pages/pengurus/BukuKongsiPP'))
const SijilPencapaianPP  = lazy(() => import('./pages/pengurus/SijilPencapaianPP'))
const SijilPenyertaanPP  = lazy(() => import('./pages/pengurus/SijilPenyertaanPP'))
const PengurusLayout     = lazy(() => import('./pages/pengurus/PengurusLayout'))
const PanduanPP          = lazy(() => import('./pages/pengurus/PanduanPP'))
const Panduan            = lazy(() => import('./pages/admin/Panduan'))

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
  const { user, userRole, userData, loading, needsSetup, mustChangePassword } = useAuth()
  const location = useLocation()

  if (loading) return null

  // Allow sessionStorage-based sessions (pencatat, pengurus) — userData exists even when Firebase Auth user is null
  if (!user && !userData) return <Navigate to="/login" state={{ from: location }} replace />

  if (needsSetup || userRole === 'pending_setup') return <Navigate to="/superadmin/setup" replace />

  if (mustChangePassword) return <Navigate to="/tukar-password" replace />

  if (roles && !roles.includes(userRole)) {
    const dest = { superadmin: '/superadmin', admin: '/admin', pengurus: '/pengurus/dashboard' }[userRole] || '/login'
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
    const dest = { superadmin: '/superadmin', admin: '/admin', pengurus: '/pengurus/dashboard' }[userRole] || '/login'
    return <Navigate to={dest} replace />
  }

  return children
}

function AdminRoute({ children }) {
  return (
    <RequireAuth roles={['admin', 'superadmin']}>
      <AdminLayout>{children}</AdminLayout>
    </RequireAuth>
  )
}

// Guard pencatat — slug dalam URL mesti match session
function RequirePencatat({ children }) {
  const { userRole, loading, userData } = useAuth()
  const { slug } = useParams()

  if (loading) return null

  if (userRole !== 'pencatat') return <Navigate to={`/${slug}`} replace />

  const sessionSlug = userData?.schoolSlug || ''
  if (sessionSlug && sessionSlug !== slug) return <Navigate to={`/${slug}`} replace />

  return children
}

// Guard khusus pengurus — semak slug dalam URL match schoolId dalam session
// Ini yang cegah konflik multi-tenant: schoolId datang dari URL, bukan session semata
function RequirePengurus({ children }) {
  const { user, userRole, loading, userData } = useAuth()
  const { slug } = useParams()
  const location = useLocation()

  if (loading) return null

  // Belum login — hantar ke login page sekolah ini (bawa slug dalam URL)
  if (!user || userRole !== 'pengurus') {
    return <Navigate to={`/${slug}/pengurus`} state={{ from: location }} replace />
  }

  // Selamat: login tapi schoolId tidak match slug sekolah ini
  // Ini berlaku bila Sekolah A cuba akses URL Sekolah B
  if (userData?.schoolId) {
    const sessionSlug = userData?.schoolSlug || ''
    if (sessionSlug && sessionSlug !== slug) {
      return <Navigate to={`/${slug}/pengurus`} replace />
    }
  }

  return children
}

function NavigateToPengurusDashboard() {
  const { slug } = useParams()
  return <Navigate to={`/${slug}/pengurus/dashboard`} replace />
}

function NavigateToPencatatDashboard() {
  const { slug } = useParams()
  return <Navigate to={`/${slug}/pencatat/dashboard`} replace />
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
        {/* /demo kini tenant sebenar (slug 'demo') — ditangkap oleh route /:slug */}

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

        {/* Superadmin */}
        <Route path="/superadmin/setup" element={<SuperadminSetup />} />
        <Route path="/superadmin" element={
          <RequireAuth roles={['superadmin']}>
            <SuperadminPanel />
          </RequireAuth>
        } />

        {/* Tukar password paksa */}
        <Route path="/tukar-password" element={<ForceChangePassword />} />

        {/* Admin — semua routes guna AdminLayout (sidebar tetap) */}
        <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="/admin/kejohanan/:kejId" element={<AdminRoute><KejohananDetail /></AdminRoute>} />
        <Route path="/admin/kejohanan/:kejId/pendaftaran" element={<AdminRoute><PendaftaranSetup /></AdminRoute>} />
        <Route path="/admin/kejohanan/:kejId/startlist" element={<AdminRoute><StartList /></AdminRoute>} />
        <Route path="/admin/kejohanan/:kejId/pengesahan-peserta" element={<AdminRoute><PengesahanPeserta /></AdminRoute>} />
        <Route path="/admin/kejohanan/:kejId/kategori" element={<AdminRoute><KategoriSetup /></AdminRoute>} />
        <Route path="/admin/kejohanan/:kejId/acara" element={<AdminRoute><AcaraSetup /></AdminRoute>} />
        <Route path="/admin/kejohanan/:kejId/keputusan" element={<AdminRoute><InputKeputusan /></AdminRoute>} />
        <Route path="/admin/kejohanan/:kejId/medal" element={<AdminRoute><MedalTallySetup /></AdminRoute>} />
        <Route path="/admin/kejohanan/:kejId/laporan" element={<AdminRoute><LaporanCetakan /></AdminRoute>} />
        <Route path="/admin/sekolah" element={<AdminRoute><SekolahSetup /></AdminRoute>} />
        <Route path="/admin/kejohanan-setup" element={<AdminRoute><KejohananSetup /></AdminRoute>} />
        <Route path="/admin/pengguna" element={<AdminRoute><UserManagement /></AdminRoute>} />
        <Route path="/admin/tetapan" element={<AdminRoute><TetapanHome /></AdminRoute>} />
        <Route path="/admin/jadual" element={<AdminRoute><JadualSetup /></AdminRoute>} />
        <Route path="/admin/rekod" element={<AdminRoute><Rekod /></AdminRoute>} />
        <Route path="/admin/olahragawan" element={<AdminRoute><Olahragawan /></AdminRoute>} />
        <Route path="/admin/analisa-pingat" element={<AdminRoute><AnalisaPingat /></AdminRoute>} />
        <Route path="/admin/reset" element={<AdminRoute><ResetSistem /></AdminRoute>} />
        <Route path="/admin/health" element={<AdminRoute><HealthCheck /></AdminRoute>} />
        <Route path="/admin/analisis-pendaftaran" element={<AdminRoute><AnalisisPendaftaran /></AdminRoute>} />
        <Route path="/admin/backup" element={<AdminRoute><Backup /></AdminRoute>} />
        <Route path="/admin/panduan" element={<AdminRoute><Panduan /></AdminRoute>} />
        <Route path="/admin/buku-kejohanan" element={<AdminRoute><BukuKejohanan /></AdminRoute>} />
        <Route path="/admin/buku-kejohanan-link" element={<AdminRoute><BukuKejohananLinkSetup /></AdminRoute>} />
        <Route path="/admin/buku-kongsi" element={<AdminRoute><BukuKongsiSetup /></AdminRoute>} />
        <Route path="/admin/buku-program" element={<AdminRoute><BukuProgramSetup /></AdminRoute>} />
        <Route path="/admin/cetak-acara" element={<AdminRoute><CetakAcara /></AdminRoute>} />
        <Route path="/admin/cetak-keputusan" element={<AdminRoute><CetakKeputusan /></AdminRoute>} />
        <Route path="/admin/esijil" element={<AdminRoute><ESijil /></AdminRoute>} />
        <Route path="/admin/esijil-pencapaian" element={<AdminRoute><ESijilPencapaian /></AdminRoute>} />
        <Route path="/admin/akses-pantas" element={<AdminRoute><AksesPantasPage /></AdminRoute>} />
        <Route path="/admin/galeri" element={<AdminRoute><GaleriSetup /></AdminRoute>} />
        <Route path="/admin/manual-pendaftaran" element={<AdminRoute><ManualPendaftaran /></AdminRoute>} />
        <Route path="/admin/muat-turun-sijil" element={<AdminRoute><MuatTurunSijil /></AdminRoute>} />
        <Route path="/admin/sijil-pengurus" element={<AdminRoute><SijilPengurus /></AdminRoute>} />
        <Route path="/admin/*" element={<AdminRoute><AdminPanel /></AdminRoute>} />

        {/* Pencatat — slug-based, multi-tenant safe */}
        <Route path="/:slug/pencatat/*" element={
          <RequirePencatat>
            <PencatatLayout>
              <Routes>
                <Route path="dashboard"                  element={<PencatatHome />} />
                <Route path="input-keputusan"            element={<PencatatInputKej />} />
                <Route path="kejohanan/:kejId/keputusan" element={<PencatatInput />} />
                <Route path="cetakan-hadiah"             element={<PencatatCetakanHadiah />} />
                <Route path="startlist"                  element={<PencatatStartList />} />
                <Route path="rekod"                      element={<PencatatRekod />} />
                <Route path="cetak-acara"                element={<PencatatCetakAcara />} />
                <Route path="*"                          element={<NavigateToPencatatDashboard />} />
              </Routes>
            </PencatatLayout>
          </RequirePencatat>
        } />

        {/* Pengurus Pasukan — login global (fallback, pengurus taip slug sendiri) */}
        <Route path="/pengurus/login" element={<PengurusLogin />} />

        {/* Pengurus Pasukan — entry point per sekolah (slug dalam URL, tiada konflik) */}
        <Route path="/:slug/pengurus" element={<PengurusLogin />} />

        {/* Pengurus Pasukan — dashboard per sekolah (schoolId terikat kepada slug) */}
        <Route path="/:slug/pengurus/*" element={
          <RequirePengurus>
            <PengurusLayout>
              <Routes>
                <Route path="dashboard"         element={<PengurusDashboard />} />
                <Route path="buku-kongsi"       element={<BukuKongsiPP />} />
                <Route path="sijil-penyertaan"  element={<SijilPenyertaanPP />} />
                <Route path="sijil-pencapaian"  element={<SijilPencapaianPP />} />
                <Route path="panduan"           element={<PanduanPP />} />
                <Route path="*"                 element={<NavigateToPengurusDashboard />} />
              </Routes>
            </PengurusLayout>
          </RequirePengurus>
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
        <PWAInstallPrompt />
      </AuthProvider>
    </BrowserRouter>
  )
}
