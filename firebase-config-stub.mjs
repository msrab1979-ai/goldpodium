/**
 * Stub gantian untuk src/firebase/config.js bila jalan di Node (bukan Vite).
 * Bina db dari env var VITE_* dalam .env.local.
 */
import { config as dotenvConfig } from 'dotenv'
dotenvConfig({ path: '.env.local' })
import { initializeApp, getApps } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const app = getApps()[0] || initializeApp({
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
})
export const db = getFirestore(app)
export default app
