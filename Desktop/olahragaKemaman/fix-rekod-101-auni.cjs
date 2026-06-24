/**
 * fix-rekod-101-auni.cjs
 *
 * Tujuan:
 * 1. Kemaskini rekod library 3000M_P_J_D — pemegang baru AUNI 13.14s
 *    (arkib DAYANA 13.18s ke rekod_sejarah dahulu)
 * 2. Tambah pecahRekod: "D" pada peserta U72 dalam heat 101-F1
 *
 * Guna:
 *   node fix-rekod-101-auni.cjs          → dry run (baca sahaja)
 *   node fix-rekod-101-auni.cjs --fix    → buat perubahan
 */

const { initializeApp } = require('firebase/app')
const {
  getFirestore, collection, getDocs, doc, getDoc, setDoc, updateDoc,
  query, where, serverTimestamp
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

  // ── Cari kejohanan aktif ─────────────────────────────────────────────────
  const kSnap = await getDocs(query(collection(db, 'kejohanan'), where('statusKejohanan', '==', 'aktif')))
  if (kSnap.empty) { console.log('❌ Tiada kejohanan aktif.'); return }
  const kejId = kSnap.docs[0].id
  console.log('✓ Kejohanan:', kejId)

  // ════════════════════════════════════════════════════════════════════════
  // LANGKAH 1 — Rekod Library 3000M_P_J_D
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n── LANGKAH 1: Rekod Library ──')

  const rKey = '3000M_P_J_D'
  const rekodRef = doc(db, 'rekod', rKey)
  const rekodSnap = await getDoc(rekodRef)

  if (!rekodSnap.exists()) {
    console.log('❌ Rekod', rKey, 'tidak dijumpai!')
    return
  }

  const rekodLama = rekodSnap.data()
  console.log('SEBELUM:')
  console.log('  Pemegang :', rekodLama.namaAtlet)
  console.log('  No KP    :', rekodLama.noKP ?? '(kosong)')
  console.log('  Sekolah  :', rekodLama.namaSekolah || rekodLama.kodSekolah || '—')
  console.log('  Prestasi :', rekodLama.prestasi, 's')
  console.log('  PrestLama:', rekodLama.prestasiLama ?? '—')
  console.log('  Tahun    :', rekodLama.tarikhRekod)
  console.log('  Status   :', rekodLama.statusRekod)

  const rekodBaru = {
    prestasi:     13.14,
    prestasiLama: 13.18,
    namaAtlet:    'NUR AUNI ARISSYA BINTI MOHD SHAHRIR',
    noKP:         '130803-03-0090',
    kodSekolah:   'TEA2035',
    namaSekolah:  'SMK BINJAI',
    tarikhRekod:  '2026',
    kejohananId:  kejId,
    updatedAt:    serverTimestamp(),
  }

  console.log('\nSELEPAS:')
  console.log('  Pemegang :', rekodBaru.namaAtlet)
  console.log('  No KP    :', rekodBaru.noKP)
  console.log('  Sekolah  :', rekodBaru.namaSekolah)
  console.log('  Prestasi :', rekodBaru.prestasi, 's')
  console.log('  PrestLama:', rekodBaru.prestasiLama, 's (DAYANA lama)')
  console.log('  Tahun    :', rekodBaru.tarikhRekod)

  if (!DRY) {
    const sejarahRef = doc(collection(db, 'rekod_sejarah'))
    await setDoc(sejarahRef, {
      ...rekodLama,
      rekodId:      rKey,
      diarchivPada: serverTimestamp(),
      sebab:        'fix_rekod_101_auni',
    })
    console.log('\n✓ Rekod lama DAYANA diarkibkan ke rekod_sejarah')
    await updateDoc(rekodRef, rekodBaru)
    console.log('✓ Rekod library dikemaskini → AUNI 13.14s')
  } else {
    console.log('\n[DRY] Rekod lama akan diarkibkan, rekod baru akan ditulis')
  }

  // ════════════════════════════════════════════════════════════════════════
  // LANGKAH 2 — Badge pecahRekod dalam heat 101-F1
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n── LANGKAH 2: Badge pecahRekod Heat 101-F1 ──')

  const heatRef = doc(db, 'kejohanan', kejId, 'acara', '101', 'heat', '101-F1')
  const heatSnap = await getDoc(heatRef)

  if (!heatSnap.exists()) {
    console.log('❌ Heat 101-F1 tidak dijumpai!')
    return
  }

  const heatData = heatSnap.data()
  const peserta = heatData.peserta || []

  console.log('Semua peserta dalam heat 101-F1:')
  for (const p of peserta) {
    console.log(`  ${p.noBib||'—'} | ${p.namaAtlet||'—'} | masa: ${p.keputusan??'—'} | badge: ${p.pecahRekod??'(tiada)'}`)
  }

  const targetIdx = peserta.findIndex(p => p.noBib === 'U72')
  if (targetIdx === -1) {
    console.log('\n❌ Peserta U72 tidak dijumpai dalam heat 101-F1!')
    return
  }

  const pLama = peserta[targetIdx]
  console.log('\nPeserta U72:')
  console.log('  noBib     :', pLama.noBib)
  console.log('  namaAtlet :', pLama.namaAtlet)
  console.log('  noKP      :', pLama.noKP)
  console.log('  keputusan :', pLama.keputusan, 's')
  console.log('  pecahRekod:', pLama.pecahRekod ?? '(tiada)')

  if (pLama.pecahRekod === 'D') {
    console.log('\n✅ Badge pecahRekod: "D" sudah ada — tiada perubahan diperlukan.')
  } else {
    console.log('\nSELEPAS: pecahRekod akan ditambah → "D"')
    if (!DRY) {
      const newPeserta = peserta.map((p, i) =>
        i === targetIdx ? { ...p, pecahRekod: 'D' } : p
      )
      await updateDoc(heatRef, { peserta: newPeserta })
      console.log('✓ Badge pecahRekod: "D" ditambah pada U72 dalam heat 101-F1')
    } else {
      console.log('[DRY] Badge akan ditambah pada U72')
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // RINGKASAN
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n── RINGKASAN ──')
  console.log('rekod/3000M_P_J_D  :', DRY ? '[DRY] kemaskini AUNI 13.14s' : '✅ dikemaskini')
  console.log('rekod_sejarah      :', DRY ? '[DRY] arkib DAYANA 13.18s' : '✅ diarkibkan')
  console.log('heat 101-F1 U72    :', DRY ? '[DRY] tambah pecahRekod: D' : '✅ badge ditambah')
  console.log('mata_olahragawan   : ✅ tidak disentuh (sudah betul)')
  console.log()
  if (DRY) console.log('→ Jalankan dengan --fix untuk buat perubahan sebenar.')
  else console.log('→ Selesai. Semak Home untuk confirm badge 🏆 muncul pada U72.')
}

main().catch(console.error).finally(() => process.exit())
