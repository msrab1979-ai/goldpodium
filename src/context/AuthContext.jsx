import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase/config'
import { loginWithEmail, logoutAll, claimSuperadmin, loginPencatat as loginPencatatFn, loginPengurus as loginPengurusFn, SESSION_KEY } from '../firebase/auth'

const AuthContext = createContext(null)

// Session expire after 8 hours idle
const SESSION_TTL_MS = 8 * 60 * 60 * 1000

export function AuthProvider({ children }) {
  const [user,       setUser]       = useState(null)
  const [userRole,   setUserRole]   = useState(null)
  const [userData,   setUserData]   = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [needsSetup, setNeedsSetup] = useState(false)

  // ── Restore session dari sessionStorage ───────────────────────────────────

  useEffect(() => {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (raw) {
      try {
        const s = JSON.parse(raw)
        // Semak session TTL
        if (s._savedAt && Date.now() - s._savedAt > SESSION_TTL_MS) {
          sessionStorage.removeItem(SESSION_KEY)
        } else {
          setUser({ uid: s.uid, email: s.email })
          setUserData(s)
          setUserRole(s.role)
          setNeedsSetup(false)
        }
      } catch {
        sessionStorage.removeItem(SESSION_KEY)
      }
    }

    // Firebase Auth state listener — untuk superadmin (Firebase Auth)
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const snap = await getDoc(doc(db, 'users', firebaseUser.uid))
          if (snap.exists()) {
            const data = snap.data()
            if (data.isAktif !== false) {
              const session = {
                uid:      firebaseUser.uid,
                email:    firebaseUser.email,
                name:     firebaseUser.displayName || data.name || data.nama || '',
                role:     data.role,
                schoolId: data.schoolId || '',
                isAktif:  true,
                _savedAt: Date.now(),
              }
              sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
              setUser({ uid: firebaseUser.uid, email: firebaseUser.email })
              setUserData(session)
              setUserRole(data.role || null)
              setNeedsSetup(!data.role)
            } else {
              await logoutAll()
              setUser(null); setUserRole(null); setUserData(null)
            }
          } else {
            // User dalam Firebase Auth tapi belum ada Firestore doc — first run superadmin
            let isPendingSetup = false
            const rawSess = sessionStorage.getItem(SESSION_KEY)
            if (rawSess) {
              try {
                const s = JSON.parse(rawSess)
                if (s.role === 'pending_setup') {
                  setUser({ uid: firebaseUser.uid, email: firebaseUser.email })
                  setUserData(s)
                  setUserRole('pending_setup')
                  setNeedsSetup(false)
                  isPendingSetup = true
                }
              } catch { /* abaikan */ }
            }
            if (!isPendingSetup) {
              setUser({ uid: firebaseUser.uid, email: firebaseUser.email })
              setNeedsSetup(true)
            }
          }
        } catch {
          setUser({ uid: firebaseUser.uid, email: firebaseUser.email })
        }
      } else {
        // Firebase logout — kosongkan state jika tiada sessionStorage
        const raw2 = sessionStorage.getItem(SESSION_KEY)
        if (!raw2) {
          setUser(null); setUserRole(null); setUserData(null); setNeedsSetup(false)
        }
      }
      setLoading(false)
    })

    return () => unsub()
  }, [])

  // ── Session idle expiry monitor ───────────────────────────────────────────

  useEffect(() => {
    if (!user) return

    let timer
    function resetTimer() {
      clearTimeout(timer)
      timer = setTimeout(() => {
        logout()
      }, SESSION_TTL_MS)
    }

    const events = ['mousemove', 'keydown', 'click', 'touchstart']
    events.forEach(e => window.addEventListener(e, resetTimer))
    resetTimer()

    return () => {
      clearTimeout(timer)
      events.forEach(e => window.removeEventListener(e, resetTimer))
    }
  }, [user]) // eslint-disable-line

  // ── Login ─────────────────────────────────────────────────────────────────

  async function login(email, password) {
    const session = await loginWithEmail(email, password)
    session._savedAt = Date.now()
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    setUser({ uid: session.uid, email: session.email })
    setUserData(session)
    setUserRole(session.role)
    setNeedsSetup(false)
    return session
  }

  async function loginPencatat(slug, kodAkses, pin) {
    const session = await loginPencatatFn(slug, kodAkses, pin)
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    setUser({ uid: session.uid, email: session.email })
    setUserData(session)
    setUserRole(session.role)
    setNeedsSetup(false)
    return session
  }

  async function loginPengurus(schoolId, kodSekolah, pin) {
    const session = await loginPengurusFn(schoolId, kodSekolah, pin)
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    setUser({ uid: session.uid, email: session.email })
    setUserData(session)
    setUserRole(session.role)
    setNeedsSetup(false)
    return session
  }

  // ── Logout ────────────────────────────────────────────────────────────────

  const logout = useCallback(async () => {
    await logoutAll()
    setUser(null)
    setUserRole(null)
    setUserData(null)
    setNeedsSetup(false)
  }, [])

  // ── Refresh session (selepas tukar password) ─────────────────────────────

  async function refreshSession() {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return
    try {
      const s = JSON.parse(raw)
      // Reload Firestore doc untuk dapat data terkini
      const snap = await getDoc(doc(db, 'users', s.uid))
      if (snap.exists()) {
        const data = snap.data()
        const session = {
          ...s,
          mustChangePassword: data.mustChangePassword || false,
          _savedAt: Date.now(),
        }
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
        setUserData(session)
        setUserRole(session.role)
      }
    } catch { /* abaikan */ }
  }

  // ── Claim superadmin (first run) ──────────────────────────────────────────

  async function setupSuperadmin(name) {
    if (!user) throw new Error('No active session.')
    const data = await claimSuperadmin(user.uid, user.email, name)
    const session = { ...data, _savedAt: Date.now() }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    setUserData(session)
    setUserRole('superadmin')
    setNeedsSetup(false)
  }

  function hasRole(...roles) {
    return roles.includes(userRole)
  }

  const mustChangePassword = userData?.mustChangePassword === true

  return (
    <AuthContext.Provider value={{
      user, userRole, userData, loading, needsSetup, mustChangePassword,
      login, logout, loginPencatat, loginPengurus, hasRole, setupSuperadmin, refreshSession,
    }}>
      {!loading && children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
