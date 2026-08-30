// ── useSessionGuard — pastikan token Firebase selari dengan sesi tab ──────────
//
// Sesi app disimpan dalam `gp_session` (sessionStorage, per-tab) manakala token
// Firebase Auth disimpan berasingan oleh SDK. Bila kedua-duanya tidak selari,
// UI kekal nampak "sudah log masuk" tetapi setiap tulis Firestore gagal dengan
// `permission-denied` — pengguna nampak sistem rosak tanpa sebarang amaran.
//
// Sejak firebase/config.js guna browserSessionPersistence, token adalah per-tab
// jadi keadaan ini jarang berlaku. Ia MASIH boleh berlaku apabila:
//   • token anon luput / dibatalkan pelayan
//   • pengguna buka tab pendua (Ctrl+Shift+T / duplicate tab) — sessionStorage
//     disalin tetapi token Firebase TIDAK, jadi `anonUid` tab baru tiada token
//   • sesi dipulihkan selepas peranti tidur lama
//
// Hook ini memulihkan secara SENYAP: kalau sesi pencatat/PP kehilangan token,
// ia sign-in anon semula dan tulis balik session doc supaya rules lulus. Kalau
// gagal, ia pulangkan `invalid` supaya guard boleh hantar ke login dengan mesej
// yang difahami pengguna — bukan ralat mentah SDK.
import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../firebase/config'
import { pulihSesiAnon } from '../firebase/auth'
import { useAuth } from '../context/AuthContext'

// status: 'checking' | 'ok' | 'invalid'
export default function useSessionGuard() {
  const { userData, userRole } = useAuth()
  const perluAnon = userRole === 'pencatat' || userRole === 'pengurus'
  const [status, setStatus] = useState(perluAnon ? 'checking' : 'ok')

  useEffect(() => {
    // Admin/superadmin guna Firebase Auth email+password — RequireAuth sedia ada
    // sudah cukup; tiada session doc anon untuk dipulihkan. State awal untuk
    // peranan ini memang 'ok', jadi cukup keluar tanpa setState.
    if (!perluAnon) return

    let batal = false

    // Tunggu SDK selesai memulihkan token dari storan sebelum menilai — kalau
    // tidak, muat semula halaman (F5) akan tersalah anggap sesi mati.
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (batal) return

      // Token sudah selari dengan sesi tab — tiada apa perlu dibuat.
      if (u && u.uid === userData?.anonUid) { setStatus('ok'); return }

      // Tiada token, atau token bukan milik sesi ini → cuba pulih senyap.
      try {
        await pulihSesiAnon(userData)
        if (!batal) setStatus('ok')
      } catch {
        if (!batal) setStatus('invalid')
      }
    })

    return () => { batal = true; unsub() }
  }, [perluAnon, userData?.anonUid, userData?.schoolId]) // eslint-disable-line

  return status
}
