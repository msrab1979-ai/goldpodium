/**
 * Patch rekod docs — resolve namaSekolah dari sekolah collection
 * kalau field kosong atau sama dengan kodSekolah.
 */
require('dotenv').config({ path: '.env' })
const { initializeApp } = require('firebase/app')
const { getFirestore, collection, getDocs, doc, updateDoc } = require('firebase/firestore')
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth')

const app = initializeApp({
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
})
const db = getFirestore(app)
const auth = getAuth(app)

const SCHOOL_ID = 'skl_1782634121891'

;(async () => {
  await signInWithEmailAndPassword(auth, process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD)
  console.log('✅ Login\n')

  // Load sekolah map
  const sekSnap = await getDocs(collection(db, 'tenants', SCHOOL_ID, 'sekolah'))
  const nameMap = {}
  sekSnap.docs.forEach(d => { nameMap[d.id] = d.data().namaSekolah || d.data().nama || d.id })
  console.log(`Sekolah map: ${Object.keys(nameMap).length} entries\n`)

  // Loop semua rekod → patch
  const rekodSnap = await getDocs(collection(db, 'tenants', SCHOOL_ID, 'rekod'))
  let patched = 0
  for (const rd of rekodSnap.docs) {
    const r = rd.data()
    const patch = {}
    // Patch namaSekolah
    if (r.kodSekolah && (!r.namaSekolah || r.namaSekolah === r.kodSekolah)) {
      const resolved = nameMap[r.kodSekolah]
      if (resolved && resolved !== r.kodSekolah) patch.namaSekolah = resolved
    }
    // Untuk relay: patch namaAtlet juga (kalau sama dengan kodSekolah)
    if (r.isRelay && r.kodSekolah && r.namaAtlet === r.kodSekolah) {
      const resolved = nameMap[r.kodSekolah]
      if (resolved && resolved !== r.kodSekolah) patch.namaAtlet = resolved
    }
    if (Object.keys(patch).length > 0) {
      await updateDoc(doc(db, 'tenants', SCHOOL_ID, 'rekod', rd.id), patch)
      console.log(`✅ ${rd.id}: ${JSON.stringify(patch)}`)
      patched++
    }
  }
  console.log(`\n✅ SIAP — ${patched}/${rekodSnap.docs.length} rekod di-patch`)
})().catch(e => { console.error(e); process.exit(1) })
