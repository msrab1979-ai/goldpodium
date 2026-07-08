/**
 * Backfill: tambah namaAcara + namaAcaraPendek ke semua contrib_* fields dalam medal_tally
 *
 * Logik:
 *   contribKey format: contrib_{heatId}_{noBib|kod_pasukan}
 *   heatId format:     heat_{fasa}_{kejohananId}_{Hxx} atau heat_{fasa}_{noAcara}_{Hxx}
 *
 * Untuk setiap contrib:
 *   1. Extract heatId dari contribKey
 *   2. Cari heat doc → dapat aceraId
 *   3. Cari acara doc → dapat namaAcara + namaAcaraPendek
 *   4. Update contrib dengan nama acara
 *
 * Dijalankan dengan izin user — bukan reconnaissance, tapi fix data existing.
 */
require('dotenv').config({ path: '.env' })
const { initializeApp } = require('firebase/app')
const { getFirestore, collection, collectionGroup, getDocs, getDoc, doc, updateDoc } = require('firebase/firestore')
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth')
const readline = require('readline')

const app = initializeApp({
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
})
const db = getFirestore(app)
const auth = getAuth(app)

function prompt(q) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(q, ans => { rl.close(); resolve(ans) })
  })
}

async function main() {
  console.log('Login admin/superadmin dulu (rules baru tolak anon write):\n')
  const email = process.env.ADMIN_EMAIL || await prompt('Email admin: ')
  const password = process.env.ADMIN_PASSWORD || await prompt('Password: ')
  await signInWithEmailAndPassword(auth, email, password)
  console.log(`✅ Login sebagai ${email}\n`)

  console.log('=== BACKFILL: namaAcara ke contrib_* fields ===\n')

  // 1. Loop semua tenants
  const tenantSnap = await getDocs(collection(db, 'tenants'))
  console.log(`📋 ${tenantSnap.docs.length} tenants\n`)

  let totalUpdated = 0
  let totalContribs = 0

  for (const tDoc of tenantSnap.docs) {
    const schoolId = tDoc.id
    const kejSnap = await getDocs(collection(db, 'tenants', schoolId, 'kejohanan'))

    for (const kejDoc of kejSnap.docs) {
      const kejId = kejDoc.id
      const tallySnap = await getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'medal_tally'))
      if (tallySnap.empty) continue

      console.log(`─── ${schoolId}/${kejId} — ${tallySnap.docs.length} medal_tally docs ───`)

      // Cache: heatId → { aceraId, namaAcara, namaAcaraPendek }
      const heatCache = {}
      const acaraCache = {}

      async function resolveNama(heatId) {
        if (heatCache[heatId]) return heatCache[heatId]

        // Baca heat doc
        try {
          const hSnap = await getDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat', heatId))
          if (!hSnap.exists()) {
            heatCache[heatId] = null
            return null
          }
          const aceraId = hSnap.data().aceraId
          if (!aceraId) { heatCache[heatId] = null; return null }

          // Baca acara doc
          if (!acaraCache[aceraId]) {
            const aSnap = await getDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'acara', aceraId))
            if (!aSnap.exists()) { acaraCache[aceraId] = null }
            else {
              const a = aSnap.data()
              acaraCache[aceraId] = {
                namaAcara:       a.namaAcara || '',
                namaAcaraPendek: a.namaAcaraPendek || a.namaAcara || '',
              }
            }
          }

          const result = acaraCache[aceraId]
          heatCache[heatId] = result
          return result
        } catch (e) {
          console.error('   ⚠️ error resolve heat', heatId, e.message)
          heatCache[heatId] = null
          return null
        }
      }

      // Loop tally docs
      for (const tallyDoc of tallySnap.docs) {
        const data = tallyDoc.data()
        const patch = {}
        let contribCount = 0

        for (const [k, v] of Object.entries(data)) {
          if (!k.startsWith('contrib_') || !v || typeof v !== 'object') continue
          contribCount++
          // Skip kalau dah ada namaAcaraPendek
          if (v.namaAcaraPendek) continue

          // Extract heatId dari contribKey
          // Format: contrib_{heatId}_{noBib|kod_pasukan}
          // heatId biasanya: heat_final_xxx atau heat_saringan_qf_xxx (multi underscore)
          // Trick: heat docs list dan cari yang match prefix
          const rest = k.slice('contrib_'.length)

          // Cara paling tepat: try semua kombinasi split
          // Loop dari belakang — buang last part dan check kalau prefix jadi heatId valid
          let heatId = null
          let nama = null
          const parts = rest.split('_')
          for (let cut = 1; cut < parts.length; cut++) {
            const candidate = parts.slice(0, parts.length - cut).join('_')
            const resolved = await resolveNama(candidate)
            if (resolved) {
              heatId = candidate
              nama = resolved
              break
            }
          }

          if (nama) {
            patch[k] = { ...v, namaAcara: nama.namaAcara, namaAcaraPendek: nama.namaAcaraPendek }
          }
        }

        totalContribs += contribCount

        if (Object.keys(patch).length > 0) {
          await updateDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'medal_tally', tallyDoc.id), patch)
          totalUpdated += Object.keys(patch).length
          console.log(`   ✅ ${tallyDoc.id}: update ${Object.keys(patch).length}/${contribCount} contribs`)
        } else if (contribCount > 0) {
          console.log(`   ✓ ${tallyDoc.id}: ${contribCount} contribs — semua dah ada nama atau tak boleh resolve`)
        }
      }
    }
  }

  console.log(`\n=== DONE — ${totalUpdated}/${totalContribs} contribs updated ===`)
}

main().catch(e => { console.error('ERROR:', e); process.exit(1) })
