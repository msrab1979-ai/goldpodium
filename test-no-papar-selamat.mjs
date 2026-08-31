/**
 * test-no-papar-selamat.mjs — Ujian KESELAMATAN DATA untuk nombor paparan.
 *
 * Kebimbangan utama: adakah menetapkan `noAcaraPapar` boleh merosakkan apa-apa?
 * Ujian ini menulis ke Firestore emulator dan mengesahkan bahawa SELEPAS
 * menetapkan nombor paparan:
 *   • ID dokumen tidak berubah
 *   • heat.aceraId masih menunjuk ke acara yang betul
 *   • pendaftaran.acaraIds[] masih memadan
 *   • pingat masih masuk melalui runPostRasmi sebenar
 *   • carian ikut nombor sebenar masih berfungsi
 *   • membuang nombor paparan memulihkan keadaan asal
 *
 * Jalan:
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *     npx firebase emulators:exec --only firestore --config <cfg> --project goldpodium \
 *     "node --import ./register-loader.mjs test-no-papar-selamat.mjs"
 */
import { connectFirestoreEmulator, doc, setDoc, getDoc, updateDoc, deleteField,
         collection, getDocs, query, where, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { db } from './src/firebase/config.js'
import { runPostRasmi } from './src/utils/postRasmiUtils.js'
import { noAcaraPapar, adaNoPapar, sahkanNoPapar } from './src/utils/acaraPaparUtils.js'

try { connectFirestoreEmulator(db, '127.0.0.1', 8080) } catch { /* sudah */ }

let pass = 0, fail = 0
const gagal = []
function ok(nama, cond, nota = '') {
  if (cond) { pass++; console.log('  ✅', nama) }
  else { fail++; gagal.push(nama); console.log('  ❌', nama, nota ? `— ${nota}` : '') }
}

const SID = 'skl_papar'
const KEJ = 'KEJ-PAPAR'
const aPath = ['tenants', SID, 'kejohanan', KEJ, 'acara']
const hPath = ['tenants', SID, 'kejohanan', KEJ, 'heat']
const pPath = ['tenants', SID, 'kejohanan', KEJ, 'pendaftaran']

async function sediakan() {
  await setDoc(doc(db, 'tenants', SID, 'kejohanan', KEJ), { namaKejohanan: 'Ujian Papar', peringkat: 'daerah' })
  // Acara 101 — saringan yang akan jadi terus final
  await setDoc(doc(db, ...aPath, '101'), {
    noAcara: '101', aceraId: '101', namaAcara: '100M L12', namaAcaraPendek: '100M',
    peringkat: 'akhir', jenisAcara: 'lorong', jantina: 'L', kategoriKod: 'L12',
    bilanganLorong: 8, isAktif: true,
  })
  // Acara 201 — anak final (kosong)
  await setDoc(doc(db, ...aPath, '201'), {
    noAcara: '201', aceraId: '201', namaAcara: '100M L12 FINAL',
    peringkat: 'final_p', parentAcaraId: '101', jenisAcara: 'lorong',
    jantina: 'L', kategoriKod: 'L12', bilanganLorong: 8, isAktif: true,
  })
  // Heat untuk 101
  await setDoc(doc(db, ...hPath, '101-H1'), {
    aceraId: '101', fasa: 'final', noHeat: 1, statusKeputusan: null,
    peserta: [
      { noBib: 'AAA001', nama: 'Atlet A', kodSekolah: 'AAA', namaSekolah: 'SK A', lorong: 3, keputusan: '12.10', kedudukan: 1, status: 'selesai' },
      { noBib: 'BBB002', nama: 'Atlet B', kodSekolah: 'BBB', namaSekolah: 'SK B', lorong: 4, keputusan: '12.50', kedudukan: 2, status: 'selesai' },
    ],
  })
  // Pendaftaran merujuk acara 101
  await setDoc(doc(db, ...pPath, 'P1'), { nama: 'Atlet A', noBib: 'AAA001', kodSekolah: 'AAA', acaraIds: ['101'] })
  await setDoc(doc(db, ...pPath, 'P2'), { nama: 'Atlet B', noBib: 'BBB002', kodSekolah: 'BBB', acaraIds: ['101'] })
}

async function jumlahPingat() {
  const s = await getDocs(collection(db, 'tenants', SID, 'kejohanan', KEJ, 'medal_tally')).catch(() => null)
  if (!s) return 0
  let n = 0
  s.docs.forEach(d => { const x = d.data(); n += (x.emas||0)+(x.perak||0)+(x.gangsa||0) })
  return n
}
async function bersihPingat() {
  for (const c of ['medal_tally', 'mata_olahragawan']) {
    const s = await getDocs(collection(db, 'tenants', SID, 'kejohanan', KEJ, c)).catch(() => null)
    if (s) for (const d of s.docs) await deleteDoc(d.ref)
  }
}

async function main() {
  console.log('═══ UJIAN KESELAMATAN DATA — nombor paparan ═══\n')
  await sediakan()

  console.log('UJIAN 1 — keadaan asal (tiada nombor paparan)')
  let a101 = (await getDoc(doc(db, ...aPath, '101'))).data()
  ok('papar nombor sebenar', noAcaraPapar({ ...a101, id: '101' }) === '101')
  ok('adaNoPapar = false', adaNoPapar({ ...a101, id: '101' }) === false)

  console.log('\nUJIAN 2 — tetapkan nombor paparan 201')
  const semak = sahkanNoPapar('201', { ...a101, id: '101' }, [{ id: '201', noAcara: '201', namaAcara: 'FINAL' }])
  ok('★ pengesahan MENOLAK 201 (berlanggar dgn acara sebenar)', semak.ok === false, semak.ralat)

  // Guna nombor yang tidak berlanggar
  await updateDoc(doc(db, ...aPath, '101'), { noAcaraPapar: '301' })
  a101 = (await getDoc(doc(db, ...aPath, '101'))).data()
  ok('nombor paparan tersimpan', a101.noAcaraPapar === '301')
  ok('papar 301', noAcaraPapar({ ...a101, id: '101' }) === '301')

  console.log('\nUJIAN 3 — ★ ID DOKUMEN TIDAK BERUBAH')
  const wujud101 = await getDoc(doc(db, ...aPath, '101'))
  const wujud301 = await getDoc(doc(db, ...aPath, '301'))
  ok('★ dokumen 101 MASIH WUJUD', wujud101.exists() === true)
  ok('★ TIADA dokumen 301 dicipta', wujud301.exists() === false)
  ok('noAcara dalam dokumen kekal 101', wujud101.data().noAcara === '101')

  console.log('\nUJIAN 4 — ★ RUJUKAN KEKAL UTUH')
  const heatQ = await getDocs(query(collection(db, ...hPath), where('aceraId', '==', '101')))
  ok('★ heat.aceraId masih jumpa acara 101', heatQ.size === 1)
  const pendAll = await getDocs(collection(db, ...pPath))
  const pendPadan = pendAll.docs.filter(d => (d.data().acaraIds || []).includes('101'))
  ok('★ pendaftaran.acaraIds[] masih padan (2 atlet)', pendPadan.length === 2)
  const anak = (await getDoc(doc(db, ...aPath, '201'))).data()
  ok('★ parentAcaraId anak masih tunjuk 101', anak.parentAcaraId === '101')

  console.log('\nUJIAN 5 — ★ PINGAT MASIH MASUK (runPostRasmi sebenar)')
  await bersihPingat()
  const heatDoc = { id: '101-H1', peserta: (await getDoc(doc(db, ...hPath, '101-H1'))).data().peserta, windSpeed: '' }
  const acaraDoc = { ...a101, id: '101' }
  await runPostRasmi(db, heatDoc, acaraDoc, KEJ, { schoolId: SID, peringkatKej: 'D', grantMedal: true, isRelay: false })
  const nPingat = await jumlahPingat()
  ok('★ pingat masuk walau ada nombor paparan', nPingat === 2, `dapat ${nPingat}`)
  const mata = await getDoc(doc(db, 'tenants', SID, 'kejohanan', KEJ, 'mata_olahragawan', `AAA001_${KEJ}`))
  ok('★ mata guna acaraDetail_101 (ID sebenar)',
     mata.exists() && Object.keys(mata.data()).some(k => k === 'acaraDetail_101'),
     mata.exists() ? Object.keys(mata.data()).filter(k=>k.startsWith('acaraDetail')).join(',') : 'tiada')

  console.log('\nUJIAN 6 — carian ikut nombor SEBENAR masih berfungsi')
  const semuaAcara = (await getDocs(collection(db, ...aPath))).docs.map(d => ({ id: d.id, ...d.data() }))
  const cari101 = semuaAcara.find(a => String(a.noAcara) === '101')
  const cari301 = semuaAcara.find(a => String(a.noAcara) === '301')
  ok('cari "101" → jumpa', cari101 !== undefined)
  ok('★ cari "301" → TIDAK jumpa (301 hanya paparan)', cari301 === undefined)

  console.log('\nUJIAN 7 — buang nombor paparan memulihkan keadaan asal')
  await updateDoc(doc(db, ...aPath, '101'), { noAcaraPapar: deleteField() })
  const selepasBuang = (await getDoc(doc(db, ...aPath, '101'))).data()
  ok('medan noAcaraPapar dibuang', selepasBuang.noAcaraPapar === undefined)
  ok('★ papar kembali ke 101', noAcaraPapar({ ...selepasBuang, id: '101' }) === '101')
  ok('data lain tidak terjejas', selepasBuang.namaAcara === '100M L12' && selepasBuang.peringkat === 'akhir')

  console.log('\nUJIAN 8 — pingat masih utuh selepas buang nombor paparan')
  const nPingat2 = await jumlahPingat()
  ok('★ medal tally tidak terjejas oleh perubahan nombor paparan', nPingat2 === 2, `dapat ${nPingat2}`)

  console.log(`\n${'═'.repeat(58)}`)
  console.log(`${fail === 0 ? '🎉 SEMUA LULUS' : '⚠️  ADA GAGAL'} — ${pass} lulus, ${fail} gagal`)
  if (fail) console.log('GAGAL:', gagal.join(' | '))
  process.exit(fail === 0 ? 0 : 1)
}

main().catch(e => { console.error('❌ RALAT:', e.message, '\n', e.stack?.split('\n').slice(0,3).join('\n')); process.exit(1) })
