/**
 * Cleanup rekod salah yang dicipta dari heat saringan
 *
 * Scope: KOAM-2026-CHDO
 *   1. Cari semua rekod di collection rekod
 *   2. Semak jika rekod berasal dari acara dengan peringkat != akhir
 *   3. Padam rekod (aktif + tuntutan)
 *   4. Padam pecahRekod/samaiRekod badge dari heat.peserta saringan
 */
require('dotenv').config({ path: '.env' })
const { initializeApp } = require('firebase/app')
const { getFirestore, collection, getDocs, doc, deleteDoc, updateDoc, getDoc } = require('firebase/firestore')
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth')

const app = initializeApp({
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
})
const db = getFirestore(app)
const auth = getAuth(app)

const SCHOOL_ID = 'skl_1782634121891'
const KEJ_ID = 'KOAM-2026-CHDO'

;(async () => {
  await signInWithEmailAndPassword(auth, process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD)
  console.log('✅ Login\n')

  // 1. Bina map: acaraId → peringkat, dan namaAcara+kategoriKod+jantina → acaraId list
  const acaraSnap = await getDocs(collection(db, 'tenants', SCHOOL_ID, 'kejohanan', KEJ_ID, 'acara'))
  const acaraByKey = {} // "nama|kat|jan" → [{ id, peringkat }]
  acaraSnap.docs.forEach(d => {
    const data = d.data()
    const namaFull = (data.namaAcara || '').trim().toUpperCase()
    const namaPen = (data.namaAcaraPendek || '').trim().toUpperCase()
    const kat = data.kategoriKod || ''
    const jan = data.jantina || ''
    ;[namaFull, namaPen].filter(Boolean).forEach(n => {
      const key = `${n}|${kat}|${jan}`
      if (!acaraByKey[key]) acaraByKey[key] = []
      acaraByKey[key].push({ id: d.id, peringkat: data.peringkat })
    })
  })

  // 2. Loop semua rekod → semak sama ada berasal dari acara final atau saringan
  const rekodSnap = await getDocs(collection(db, 'tenants', SCHOOL_ID, 'rekod'))
  console.log(`Total rekod: ${rekodSnap.docs.length}\n`)

  const rekodDelete = []
  for (const rd of rekodSnap.docs) {
    const r = rd.data()
    if (r.kejohananId !== KEJ_ID) continue
    const namaR = (r.namaAcara || '').trim().toUpperCase()
    const namaRPen = (r.namaAcaraPendek || '').trim().toUpperCase()
    const kat = r.kategoriKod || ''
    const jan = r.jantina || ''
    // Cari acara match
    const matches = new Set()
    ;[namaR, namaRPen].filter(Boolean).forEach(n => {
      const key = `${n}|${kat}|${jan}`
      ;(acaraByKey[key] || []).forEach(a => matches.add(a.peringkat))
    })
    // Kalau ada match tapi TIADA yang peringkat 'akhir' → rekod ini dari saringan (salah)
    const hasFinal = [...matches].some(p => ['akhir', 'final', 'terus_final'].includes(p))
    if (matches.size > 0 && !hasFinal) {
      console.log(`❌ ${rd.id}: rekod dari acara SARINGAN sahaja (${[...matches].join(', ')}) — akan dipadam`)
      rekodDelete.push(rd.ref)
    } else if (matches.size === 0) {
      console.log(`⚠  ${rd.id}: tiada acara match dalam kejohanan (mungkin rekod library sahaja)`)
    } else {
      console.log(`✓  ${rd.id}: OK (ada acara final)`)
    }
  }

  // 3. Delete
  console.log(`\n🗑  Padam ${rekodDelete.length} rekod salah...`)
  for (const ref of rekodDelete) {
    await deleteDoc(ref)
  }

  // 4. Cleanup badge pecahRekod dari heat SARINGAN
  console.log(`\n🧹 Clean badge dari heat saringan...`)
  const heatSnap = await getDocs(collection(db, 'tenants', SCHOOL_ID, 'kejohanan', KEJ_ID, 'heat'))
  let heatCleaned = 0
  for (const hd of heatSnap.docs) {
    const h = hd.data()
    const acara = acaraSnap.docs.find(d => d.id === h.aceraId)
    const peringkat = acara?.data().peringkat || ''
    // Skip acara final — badge boleh ada
    if (['akhir', 'final', 'terus_final'].includes(peringkat)) continue

    let hasChange = false
    const newPeserta = (h.peserta || []).map(p => {
      if (p.pecahRekod || p.samaiRekod) {
        hasChange = true
        const { pecahRekod, samaiRekod, ...rest } = p
        return rest
      }
      return p
    })
    if (hasChange) {
      await updateDoc(doc(db, 'tenants', SCHOOL_ID, 'kejohanan', KEJ_ID, 'heat', hd.id), { peserta: newPeserta })
      console.log(`   ✅ ${hd.id} (peringkat=${peringkat}) cleaned`)
      heatCleaned++
    }
  }
  console.log(`\n✅ SIAP — ${rekodDelete.length} rekod padam, ${heatCleaned} heat cleaned`)
})().catch(e => { console.error(e); process.exit(1) })
