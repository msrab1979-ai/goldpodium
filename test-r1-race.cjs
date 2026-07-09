/**
 * Test R1 — Race condition medal double-count
 *
 * Sahkan: 2 proses runPostRasmi SERENTAK pada acara SAMA →
 *   medal tally kekal BETUL (1 emas), bukan double (2 emas).
 *
 * Guna Firestore emulator + runTransaction dalam postRasmiUtils.
 *
 * Jalan:
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" \
 *     npx firebase emulators:exec --only firestore "node test-r1-race.cjs"
 */

const { initializeApp } = require('firebase/app')
const {
  getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc,
} = require('firebase/firestore')

// Import fungsi sebenar yang kita fix (transpile ESM → guna dynamic import)
async function loadPostRasmi() {
  // postRasmiUtils import startListPdfUtils — guna esbuild on-the-fly
  const esbuild = require('esbuild')
  const path = require('path')
  const fs = require('fs')
  // Stub startListPdfUtils — elak tarik jsPDF/config (Vite import.meta.env).
  // Test ini bukan lompat tinggi, jadi resolveIsLompatTinggi → false memadai.
  const stub = path.join(__dirname, `.stub-slp-${Date.now()}.js`)
  fs.writeFileSync(stub, 'export function resolveIsLompatTinggi(){return false}\n')
  // Output dalam folder projek supaya `require('firebase/firestore')` resolve ke node_modules projek
  const out = path.join(__dirname, `.postRasmi-test-${Date.now()}.cjs`)
  await esbuild.build({
    entryPoints: ['src/utils/postRasmiUtils.js'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile: out,
    external: ['firebase/firestore', 'firebase/app'],
    plugins: [{
      name: 'stub-slp',
      setup(build) {
        build.onResolve({ filter: /startListPdfUtils$/ }, () => ({ path: stub }))
      },
    }],
    logLevel: 'silent',
  })
  const mod = require(out)
  fs.unlinkSync(out)
  fs.unlinkSync(stub)
  return mod
}

const results = []
function log(name, passed, detail = '') {
  results.push({ passed })
  console.log(`${passed ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`)
}

async function main() {
  const app = initializeApp({ projectId: 'goldpodium-r1-test' })
  const db = getFirestore(app)
  connectFirestoreEmulator(db, '127.0.0.1', 8080)

  const { runPostRasmi } = await loadPostRasmi()

  const schoolId = 'skl_A'
  const kejId = 'k1'

  // ── Setup: 1 acara final, 1 heat, 3 peserta (emas/perak/gangsa) ──
  const heatDoc = {
    id: 'heat_100m',
    peserta: [
      { noBib: 'B01', noKP: '111', namaAtlet: 'Ali',  kodSekolah: 'KOD_A_001', keputusan: 12.50, status: 'OK' },
      { noBib: 'B02', noKP: '222', namaAtlet: 'Abu',  kodSekolah: 'KOD_A_002', keputusan: 12.80, status: 'OK' },
      { noBib: 'B03', noKP: '333', namaAtlet: 'Chong', kodSekolah: 'KOD_A_003', keputusan: 13.10, status: 'OK' },
    ],
  }
  const acaraDoc = {
    id: 'acara_100m', namaAcara: '100M', namaAcaraPendek: '100M',
    jantina: 'L', kategoriKod: 'L12', jenisAcara: 'lari', isRelay: false,
  }
  const config = {
    schoolId, mataPingat: { 1: 5, 2: 3, 3: 2, 4: 1 },
    peringkatKej: 'D', grantMedal: true, isRelay: false,
  }

  // ── Test 1: SATU proses — baseline (medal betul) ──
  await runPostRasmi(db, heatDoc, acaraDoc, kejId, config)
  const tId = `KOD_A_001_${kejId}`
  let tSnap = await getDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'medal_tally', tId))
  let emas = tSnap.exists() ? (tSnap.data().emas || 0) : 0
  log('Baseline: 1 proses → KOD_A_001 dapat 1 emas', emas === 1, `emas=${emas}`)

  // ── Test 2: DUA proses SERENTAK pada acara SAMA (simulasi R1) ──
  // Reset dulu
  await setDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'medal_tally', tId), {}, { merge: false })

  await Promise.all([
    runPostRasmi(db, heatDoc, acaraDoc, kejId, config),
    runPostRasmi(db, heatDoc, acaraDoc, kejId, config),
  ])
  tSnap = await getDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'medal_tally', tId))
  emas = tSnap.exists() ? (tSnap.data().emas || 0) : 0
  const jumlah = tSnap.exists() ? (tSnap.data().jumlahPingat || 0) : 0
  log('R1: 2 proses serentak → KOD_A_001 KEKAL 1 emas (bukan 2)', emas === 1, `emas=${emas}`)
  log('R1: jumlahPingat KEKAL 1 (bukan 2)', jumlah === 1, `jumlahPingat=${jumlah}`)

  // ── Test 3: mata_olahragawan tidak double ──
  const mSnap = await getDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'mata_olahragawan', `B01_${kejId}`))
  const mata = mSnap.exists() ? (mSnap.data().jumlahMata || 0) : 0
  log('R1: mata_olahragawan B01 = 5 (bukan 10)', mata === 5, `jumlahMata=${mata}`)

  const passed = results.filter(r => r.passed).length
  console.log(`\n=== ${passed}/${results.length} passed ===`)
  process.exit(passed === results.length ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
