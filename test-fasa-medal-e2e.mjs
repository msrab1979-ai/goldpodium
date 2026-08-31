/**
 * test-fasa-medal-e2e.mjs — Ujian hujung-ke-hujung: adakah pingat BENAR-BENAR
 * masuk selepas fix fasa heat?
 *
 * Berbeza daripada test-grantmedal.cjs (yang menguji formula sahaja), ujian ini
 * memanggil `runPostRasmi` SEBENAR daripada src/utils/postRasmiUtils.js terhadap
 * Firestore emulator, kemudian memeriksa medal_tally dan mata_olahragawan yang
 * betul-betul tertulis.
 *
 * Jalan (perlu emulator + loader ESM):
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *     npx firebase emulators:exec --only firestore \
 *     "node --import ./register-loader.mjs test-fasa-medal-e2e.mjs"
 */
import { connectFirestoreEmulator, doc, setDoc, getDoc, collection, getDocs, deleteDoc } from 'firebase/firestore'
// Guna instance db yang SAMA seperti postRasmiUtils (via firebase-config-stub).
// FIRESTORE_EMULATOR_HOST menghalakannya ke emulator.
import { db } from './src/firebase/config.js'
import { runPostRasmi } from './src/utils/postRasmiUtils.js'

let pass = 0, fail = 0
const gagalSenarai = []
function ok(nama, cond, nota = '') {
  if (cond) { pass++; console.log('  ✅', nama) }
  else { fail++; gagalSenarai.push(nama); console.log('  ❌', nama, nota ? `— ${nota}` : '') }
}

try { connectFirestoreEmulator(db, '127.0.0.1', 8080) } catch { /* sudah tersambung */ }

const SID = 'skl_ujian'
const KEJ = 'KEJ-UJIAN'
const SARINGAN = ['saringan_qf', 'saringan_sf', 'separuh_akhir']

// Formula PERSIS seperti admin/InputKeputusan.jsx
const grantAdmin = (peringkat, fasa) =>
  !SARINGAN.includes(peringkat || '') && (fasa === 'final' || fasa === 'terus_final')

const peserta = () => ([
  { noBib: 'AAA001', nama: 'Atlet Satu', kodSekolah: 'AAA', namaSekolah: 'SK Satu', keputusan: '12.10', kedudukan: 1, status: 'selesai' },
  { noBib: 'BBB002', nama: 'Atlet Dua',  kodSekolah: 'BBB', namaSekolah: 'SK Dua',  keputusan: '12.50', kedudukan: 2, status: 'selesai' },
  { noBib: 'CCC003', nama: 'Atlet Tiga', kodSekolah: 'CCC', namaSekolah: 'SK Tiga', keputusan: '12.90', kedudukan: 3, status: 'selesai' },
])

async function bersihkan() {
  const rek = await getDocs(collection(db, 'tenants', SID, 'rekod')).catch(() => null)
  if (rek) for (const d of rek.docs) await deleteDoc(d.ref)
  for (const c of ['medal_tally', 'mata_olahragawan']) {
    const s = await getDocs(collection(db, 'tenants', SID, 'kejohanan', KEJ, c)).catch(() => null)
    if (s) for (const d of s.docs) await deleteDoc(d.ref)
  }
}

async function jumlahPingat() {
  const s = await getDocs(collection(db, 'tenants', SID, 'kejohanan', KEJ, 'medal_tally')).catch(() => null)
  if (!s) return 0
  let n = 0
  s.docs.forEach(d => {
    const x = d.data()
    n += (x.emas || 0) + (x.perak || 0) + (x.gangsa || 0)
  })
  return n
}

async function jalankan(peringkat, fasa, heatId) {
  const acaraDoc = {
    id: 'A1', noAcara: '108', namaAcara: '1000M P12', namaAcaraPendek: '1000M',
    peringkat, jenisAcara: 'lorong', jantina: 'P', kategoriKod: 'TERBUKA',
    bilanganLorong: 8,
  }
  const heatDoc = { id: heatId, peserta: peserta(), windSpeed: '' }
  const grantMedal = grantAdmin(peringkat, fasa)
  await runPostRasmi(db, heatDoc, acaraDoc, KEJ, {
    schoolId: SID, peringkatKej: 'D', grantMedal, isRelay: false,
  })
  return grantMedal
}

async function main() {
  console.log('═══ UJIAN E2E: fasa heat → pingat (runPostRasmi SEBENAR) ═══\n')

  await setDoc(doc(db, 'tenants', SID, 'kejohanan', KEJ), { namaKejohanan: 'Ujian', peringkat: 'daerah' })

  // ── 1. SEBELUM fix: peringkat akhir + fasa 'heat' ──
  console.log('UJIAN 1 — SEBELUM fix (peringkat=akhir, fasa=heat)')
  await bersihkan()
  const g1 = await jalankan('akhir', 'heat', 'H_sebelum')
  const n1 = await jumlahPingat()
  ok('grantMedal dikira FALSE', g1 === false)
  ok('★ TIADA pingat masuk — inilah pepijatnya', n1 === 0, `dapat ${n1}`)

  // ── 2. SELEPAS fix: fasa ditukar ke 'final' ──
  console.log('\nUJIAN 2 — SELEPAS fix (peringkat=akhir, fasa=final)')
  await bersihkan()
  const g2 = await jalankan('akhir', 'final', 'H_selepas')
  const n2 = await jumlahPingat()
  ok('grantMedal dikira TRUE', g2 === true)
  ok('★ PINGAT MASUK selepas fix', n2 > 0, `dapat ${n2}`)
  ok('tepat 3 pingat (emas+perak+gangsa)', n2 === 3, `dapat ${n2}`)

  // Periksa butiran tally
  const emasSnap = await getDoc(doc(db, 'tenants', SID, 'kejohanan', KEJ, 'medal_tally', `AAA_${KEJ}`))
  ok('sekolah AAA dapat 1 emas', emasSnap.exists() && emasSnap.data().emas === 1,
     emasSnap.exists() ? JSON.stringify(emasSnap.data()) : 'doc tiada')
  const perakSnap = await getDoc(doc(db, 'tenants', SID, 'kejohanan', KEJ, 'medal_tally', `BBB_${KEJ}`))
  ok('sekolah BBB dapat 1 perak', perakSnap.exists() && perakSnap.data().perak === 1)

  // mata_olahragawan
  // Doc ID mata_olahragawan = `{noBib}_{kejId}` (postRasmiUtils baris ~150)
  const mataSnap = await getDoc(doc(db, 'tenants', SID, 'kejohanan', KEJ, 'mata_olahragawan', `AAA001_${KEJ}`))
  ok('mata_olahragawan direkod untuk pemenang', mataSnap.exists() && (mataSnap.data().pingat_emas || 0) === 1,
     mataSnap.exists() ? `emas=${mataSnap.data().pingat_emas}` : 'doc tiada')

  // ── 3. Saringan TETAP tiada pingat (tiada regresi) ──
  console.log('\nUJIAN 3 — saringan sebenar TIDAK terjejas')
  await bersihkan()
  const g3 = await jalankan('saringan_sf', 'final', 'H_saringan')
  const n3 = await jumlahPingat()
  ok('saringan_sf + fasa final → grantMedal FALSE', g3 === false)
  ok('★ saringan TETAP tiada pingat (tiada regresi)', n3 === 0, `dapat ${n3}`)

  // ── 4. Terus final biasa masih berfungsi ──
  console.log('\nUJIAN 4 — terus final biasa tidak terjejas')
  await bersihkan()
  const g4 = await jalankan('akhir', 'terus_final', 'H_terusfinal')
  const n4 = await jumlahPingat()
  ok('akhir + terus_final → grantMedal TRUE', g4 === true)
  ok('pingat masuk seperti biasa', n4 === 3, `dapat ${n4}`)

  // ── 5. Rekod: guna peringkat, bukan fasa ──
  console.log('\nUJIAN 5 — rekod dijana ikut peringkat (bukan fasa)')
  await bersihkan()
  await jalankan('akhir', 'final', 'H_rekod')
  const tuntutan = await getDocs(collection(db, 'tenants', SID, 'rekod')).catch(() => null)
  const adaTuntutan = tuntutan && tuntutan.docs.some(d => d.id.includes('_tuntutan'))
  ok('★ tuntutan rekod dijana untuk tempat pertama', adaTuntutan === true,
     tuntutan ? `docs: ${tuntutan.docs.map(d => d.id).join(',') || 'kosong'}` : 'koleksi tiada')

  console.log(`\n${'═'.repeat(58)}`)
  console.log(`${fail === 0 ? '🎉 SEMUA LULUS' : '⚠️  ADA GAGAL'} — ${pass} lulus, ${fail} gagal`)
  if (fail) console.log('GAGAL:', gagalSenarai.join(' | '))
  process.exit(fail === 0 ? 0 : 1)
}

main().catch(e => { console.error('❌ RALAT:', e.message, '\n', e.stack?.split('\n').slice(0,3).join('\n')); process.exit(1) })
