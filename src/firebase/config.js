import { initializeApp } from "firebase/app"
import { getFirestore } from "firebase/firestore"
import { getAuth, setPersistence, browserSessionPersistence } from "firebase/auth"
import { getStorage } from "firebase/storage"
import { getAnalytics, isSupported } from "firebase/analytics"

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

const app = initializeApp(firebaseConfig)
export const db      = getFirestore(app)
export const auth    = getAuth(app)
export const storage = getStorage(app)

// ── Sesi Firebase Auth per-TAB (bukan per-browser) ───────────────────────────
// Default Firebase = browserLocalPersistence (localStorage) → SATU identiti
// sahaja untuk seluruh browser. Kesannya: admin + pencatat + PP (atau tenant
// a/b/c/d/e) yang login serentak saling menimpa token — tab lama nampak masih
// login (sebab `gp_session` disimpan dalam sessionStorage, per-tab) tetapi
// setiap tulis Firestore gagal `permission-denied` tanpa amaran.
//
// browserSessionPersistence letak token Firebase dalam sessionStorage — SKOP
// SAMA dengan `gp_session`. Setiap tab dapat identiti sendiri, jadi semua
// peranan/tenant boleh dibuka serentak tanpa clash dan tanpa perlu Incognito.
//
// Kesan: tutup tab = log keluar (tiada restore). Itu memang tingkah laku
// sedia ada dari sudut pengguna — `gp_session` pun sessionStorage.
// JANGAN tukar balik ke browserLocalPersistence.
setPersistence(auth, browserSessionPersistence).catch(() => { /* fallback default */ })

// Analytics — hanya aktif dalam browser (bukan SSR/bot)
isSupported().then(yes => { if (yes) getAnalytics(app) })

// Secondary app — cipta user baru tanpa log keluar superadmin semasa
const secondaryApp = initializeApp(firebaseConfig, 'secondary')
export const secondaryAuth = getAuth(secondaryApp)

// App config dari .env
export const APP_NAME        = import.meta.env.VITE_APP_NAME        || 'Gold Podium'
export const APP_URL         = import.meta.env.VITE_APP_URL         || 'https://goldpodium.web.app'
export const SUPERADMIN_EMAIL = import.meta.env.VITE_SUPERADMIN_EMAIL || ''
export const DEMO_SCHOOL_ID  = import.meta.env.VITE_DEMO_SCHOOL_ID  || 'demo_school'

export default app
