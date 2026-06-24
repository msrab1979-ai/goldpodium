/**
 * fix-rekod-109-rifqy.cjs
 *
 * Tujuan:
 * 1. Kemaskini rekod library 100M_L_C_D — pemegang baru RIFQY 14.48s
 *    (arkib HARRAZ 14.54s ke rekod_sejarah dahulu)
 * 2. Tambah pecahRekod: "D" pada peserta XX63 dalam heat 109-H4
 *
 * Guna:
 *   node fix-rekod-109-rifqy.cjs          → dry run (baca sahaja)
 *   node fix-rekod-109-rifqy.cjs --fix    → buat perubahan
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
  // LANGKAH 1 — Rekod Library 100M_L_C_D
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n── LANGKAH 1: Rekod Library ──')

  const rKey = '100M_L_C_D'
  const rekodRef = doc(db, 'rekod', rKey)
  const rekodSnap = await getDoc(rekodRef)

  if (!rekodSnap.exists()) {
    console.log('❌ Rekod', rKey, 'tidak dijumpai!')
    return
  }

  const rekodLama = rekodSnap.data()
  console.log('SEBELUM:')
  console.log('  Pemegang :', rekodLama.namaAtlet)
  console.log('  No KP    :', rekodLama.noKP)
  console.log('  Sekolah  :', rekodLama.namaSekolah || rekodLama.kodSekolah)
  console.log('  Prestasi :', rekodLama.prestasi, 's')
  console.log('  PrestLama:', rekodLama.prestasiLama ?? '—')
  console.log('  Tahun    :', rekodLama.tarikhRekod)
  console.log('  Status   :', rekodLama.statusRekod)

  const rekodBaru = {
    prestasi:     14.48,
    prestasiLama: 14.54,
    namaAtlet:    'MUHAMMAD RIFQY BIN KHAIRUL HAFIZ',
    noKP:         '160621-11-0759',
    kodSekolah:   'TBA2052',
    namaSekolah:  'SK KG. BARU KERTEH',
    tarikhRekod:  '2026',
    kejohananId:  kejId,
    updatedAt:    serverTimestamp(),
  }

  console.log('\nSELEPAS:')
  console.log('  Pemegang :', rekodBaru.namaAtlet)
  console.log('  No KP    :', rekodBaru.noKP)
  console.log('  Sekolah  :', rekodBaru.namaSekolah)
  console.log('  Prestasi :', rekodBaru.prestasi, 's')
  console.log('  PrestLama:', rekodBaru.prestasiLama, 's (HARRAZ lama)')
  console.log('  Tahun    :', rekodBaru.tarikhRekod)

  if (!DRY) {
    // Arkib rekod lama ke rekod_sejarah
    const sejarahRef = doc(collection(db, 'rekod_sejarah'))
    await setDoc(sejarahRef, {
      ...rekodLama,
      rekodId:      rKey,
      diarchivPada: serverTimestamp(),
      sebab:        'fix_rekod_109_rifqy',
    })
    console.log('\n✓ Rekod lama HARRAZ diarkibkan ke rekod_sejarah')

    // Kemaskini rekod
    await updateDoc(rekodRef, rekodBaru)
    console.log('✓ Rekod library dikemaskini → RIFQY 14.48s')
  } else {
    console.log('\n[DRY] Rekod lama akan diarkibkan, rekod baru akan ditulis')
  }

  // ════════════════════════════════════════════════════════════════════════
  // LANGKAH 2 — Badge pecahRekod dalam heat 109-H4
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n── LANGKAH 2: Badge pecahRekod Heat 109-H4 ──')

  const heatRef = doc(db, 'kejohanan', kejId, 'acara', '109', 'heat', '109-H4')
  const heatSnap = await getDoc(heatRef)

  if (!heatSnap.exists()) {
    console.log('❌ Heat 109-H4 tidak dijumpai!')
    return
  }

  const heatData = heatSnap.data()
  const peserta = heatData.peserta || []

  const targetIdx = peserta.findIndex(p => p.noBib === 'XX63')
  if (targetIdx === -1) {
    console.log('❌ Peserta XX63 tidak dijumpai dalam heat 109-H4!')
    return
  }

  const pLama = peserta[targetIdx]
  console.log('Peserta dijumpai:')
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
      console.log('✓ Badge pecahRekod: "D" ditambah pada XX63 dalam heat 109-H4')
    } else {
      console.log('[DRY] Badge akan ditambah pada XX63')
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // RINGKASAN
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n── RINGKASAN ──')
  console.log('rekod/100M_L_C_D   :', DRY ? '[DRY] kemaskini RIFQY 14.48s' : '✅ dikemaskini')
  console.log('rekod_sejarah      :', DRY ? '[DRY] arkib HARRAZ 14.54s' : '✅ diarkibkan')
  console.log('heat 109-H4 XX63   :', DRY ? '[DRY] tambah pecahRekod: D' : '✅ badge ditambah')
  console.log('mata_olahragawan   : ✅ tidak disentuh (sudah betul)')
  console.log('acara final 123    : ✅ tidak disentuh')
  console.log()
  if (DRY) console.log('→ Jalankan dengan --fix untuk buat perubahan sebenar.')
  else console.log('→ Selesai. Semak Home untuk confirm badge 🏆 muncul pada XX63.')
}

main().catch(console.error).finally(() => process.exit())
