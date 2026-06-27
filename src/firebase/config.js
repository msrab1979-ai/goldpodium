import { initializeApp } from "firebase/app"
import { getFirestore } from "firebase/firestore"
import { getAuth } from "firebase/auth"
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
