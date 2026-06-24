/**
 * fix-harraz-stale-rekod.cjs
 *
 * Tujuan:
 * Padam field rekod_109 (stale) dari mata_olahragawan HARRAZ
 * RIFQY yang sebenarnya pecah rekod 100M L L10, bukan HARRAZ
 *
 * Guna:
 *   node fix-harraz-stale-rekod.cjs          → dry run
 *   node fix-harraz-stale-rekod.cjs --fix    → buat perubahan
 */

const { initializeApp } = require('firebase/app')
const {
  getFirestore, doc, getDoc, updateDoc, deleteField,
  collection, getDocs, query, where
} = require('firebase/firestore')

const app = initializeApp({
  apiKey: 'AIzaSyC6sHvn5JUkstFBzPpyGcENDmPAWCMBBk0',
  projectId: 'mssdkemaman-olahraga'
})
const db = getFirestore(app)
const DRY = !process.argv.includes('--fix')

async function main() {
  console.log(DRY ? '=== DRY RUN (tiada perubahan) ===' : '=== FIX MODE ===')
  console.log()

  const kSnap = await getDocs(query(collection(db, 'kejohanan'), where('statusKejohanan', '==', 'aktif')))
  if (kSnap.empty) { console.log('❌ Tiada kejohanan aktif.'); return }
  const kejId = kSnap.docs[0].id
  console.log('✓ Kejohanan:', kejId)

  const noKP = '160725-11-0489'
  const mataRef = doc(db, 'mata_olahragawan', noKP + '_' + kejId)
  const mataSnap = await getDoc(mataRef)

  if (!mataSnap.exists()) {
    console.log('❌ mata_olahragawan HARRAZ tidak dijumpai!')
    return
  }

  const data = mataSnap.data()
  console.log('\nHARRAZ — MUHAMMAD HARRAZ ARSYAD BIN MUHAMMAD HAZRIN')
  console.log('  jumlahMata :', data.jumlahMata)
  console.log('  pingat_emas:', data.pingat_emas ?? '(tiada)')
  console.log('  pingat_perak:', data.pingat_perak ?? '(tiada)')
  console.log('  rekod_109  :', data.rekod_109 ? JSON.stringify(data.rekod_109) : '(tiada)')
  console.log('  acaraDetail_109:', data.acaraDetail_109 ? JSON.stringify(data.acaraDetail_109) : '(tiada)')
  console.log('  acaraDetail_123:', data.acaraDetail_123 ? JSON.stringify(data.acaraDetail_123) : '(tiada)')

  // Kira jumlahMata betul — dari acaraDetail_ fields sahaja (exclude acara 109)
  const mataBenar = Object.entries(data)
    .filter(([k, v]) => k.startsWith('acaraDetail_') && k !== 'acaraDetail_109')
    .reduce((sum, [, v]) => sum + (v.mata || 0), 0)

  console.log('\n── ANALISA ──')
  console.log('  rekod_109        :', data.rekod_109 ? `ada (prestasiBaru: ${data.rekod_109.prestasiBaru})` : '(tiada)')
  console.log('  acaraDetail_109  :', data.acaraDetail_109 ? `ada (pingat: ${data.acaraDetail_109.pingat}, mata: ${data.acaraDetail_109.mata})` : '(tiada)')
  console.log('  pingat_emas      :', data.pingat_emas ?? '(tiada)')
  console.log('  jumlahMata semasa:', data.jumlahMata, '← termasuk 5 mata salah dari saringan 109')
  console.log('  jumlahMata betul :', mataBenar, '← dari acaraDetail_123 perak sahaja')
  console.log('  acaraDetail_123  :', data.acaraDetail_123 ? `ada (pingat: ${data.acaraDetail_123.pingat}, mata: ${data.acaraDetail_123.mata}) ✅` : '(tiada)')
  console.log('  pingat_perak     :', data.pingat_perak ?? '(tiada)', '✅')

  console.log('\n── TINDAKAN ──')
  console.log('  [1] Padam rekod_109')
  console.log('  [2] Padam acaraDetail_109')
  console.log('  [3] Padam pingat_emas')
  console.log('  [4] jumlahMata:', data.jumlahMata, '→', mataBenar)
  console.log('  [KEKAL] acaraDetail_123, pingat_perak — tidak disentuh')

  if (!DRY) {
    await updateDoc(mataRef, {
      rekod_109:       deleteField(),
      acaraDetail_109: deleteField(),
      pingat_emas:     deleteField(),
      jumlahMata:      mataBenar,
    })
    console.log('\n✓ Semua field dikemaskini')

    // Verify
    const verify = await getDoc(mataRef)
    const v = verify.data()
    console.log('\n── VERIFY SELEPAS FIX ──')
    console.log('  rekod_109        :', v.rekod_109 ?? '(tiada) ✅')
    console.log('  acaraDetail_109  :', v.acaraDetail_109 ?? '(tiada) ✅')
    console.log('  pingat_emas      :', v.pingat_emas ?? '(tiada) ✅')
    console.log('  jumlahMata       :', v.jumlahMata, '✅')
    console.log('  pingat_perak     :', v.pingat_perak, '✅')
    console.log('  acaraDetail_123  :', v.acaraDetail_123 ? `ada ✅ (${v.acaraDetail_123.pingat})` : '(tiada)')
  } else {
    console.log('\n[DRY] Tiada perubahan dibuat')
  }

  console.log('\n── RINGKASAN ──')
  console.log('  rekod_109        :', DRY ? '[DRY] akan dipadam' : '✅ dipadam')
  console.log('  acaraDetail_109  :', DRY ? '[DRY] akan dipadam' : '✅ dipadam')
  console.log('  pingat_emas      :', DRY ? '[DRY] akan dipadam' : '✅ dipadam')
  console.log('  jumlahMata       :', DRY ? `[DRY] ${data.jumlahMata} → ${mataBenar}` : `✅ ${mataBenar}`)
  console.log('  acaraDetail_123  : ✅ tidak disentuh')
  console.log('  pingat_perak     : ✅ tidak disentuh')
  console.log()
  if (DRY) console.log('→ Jalankan dengan --fix untuk buat perubahan sebenar.')
  else console.log('→ Selesai. Semak Olahragawan — HARRAZ patut tunjuk perak sahaja, tiada rekod badge.')
}

main().catch(console.error).finally(() => process.exit())
