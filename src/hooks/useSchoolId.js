// ── useSchoolId — resolve schoolId berpusat (admin + superadmin impersonate) ──
// Superadmin "Masuk" tenant via SuperadminPanel → sessionStorage 'gp_view_school'.
// SEMUA page admin WAJIB guna hook ini (atau viewSchool() dalam fungsi bukan-hook)
// — jangan baca userData?.schoolId terus, superadmin akan dapat kosong → page freeze.
import { useAuth } from '../context/AuthContext'

export function viewSchool() {
  try { return JSON.parse(sessionStorage.getItem('gp_view_school') || '{}') } catch { return {} }
}

// ── Portal view (pencatat/PP) untuk superadmin ────────────────────────────────
// Superadmin "Masuk sebagai Pencatat/PP" → sessionStorage 'gp_view_portal'
// { schoolId, schoolSlug, kodSekolah?, namaSekolah? } — kodSekolah dipilih dalam PengurusLayout
const PORTAL_KEY = 'gp_view_portal'

export function viewPortal() {
  try { return JSON.parse(sessionStorage.getItem(PORTAL_KEY) || '{}') } catch { return {} }
}

export function setViewPortal(data) {
  sessionStorage.setItem(PORTAL_KEY, JSON.stringify(data))
}

export function clearViewPortal() {
  sessionStorage.removeItem(PORTAL_KEY)
}

// Gabung userData dengan konteks portal bila superadmin — role kekal 'superadmin'
// supaya semakan kebenaran (bolehEdit dll) masih kenal superadmin
export function withPortalView(userData) {
  if (userData?.role !== 'superadmin') return userData
  const v = viewPortal()
  if (!v.schoolId) return userData
  return { ...userData, ...v, role: 'superadmin' }
}

export default function useSchoolId() {
  const { userData } = useAuth()
  const isSuperadmin = userData?.role === 'superadmin'
  // Portal pencatat/PP (gp_view_portal) diutamakan — ia hanya wujud semasa mod portal
  // (masukSebagaiAdmin/logout portal clear-kannya); gp_view_school mungkin stale
  const view = isSuperadmin ? (viewPortal().schoolId ? viewPortal() : viewSchool()) : {}
  return {
    schoolId: (isSuperadmin && view.schoolId) || userData?.schoolId || '',
    namaSekolah: (isSuperadmin && view.namaSekolah) || userData?.namaSekolah || '',
    isSuperadmin,
  }
}
