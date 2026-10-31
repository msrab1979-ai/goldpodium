/**
 * test-kddk-sahaja-e2e.mjs — Keputusan "Kddk sahaja" (tanpa masa) diterima
 * di SEMUA peringkat: pingat + mata masuk (akhir) via runPostRasmi SEBENAR,
 * dan finalis saringan dipilih ikut Kddk (Best Heat sahaja — tiada wildcard).
 *
 * Kes asal: sk-cheneh KOAM-2026-TMC2 #121/#122 (80M) — pencatat pilih Kddk,
 * masa kosong → status kekal 'belum', 0 pingat, tiada keputusan dipapar.
 *
 * Juga uji (ekstrak fungsi SEBENAR dari pencatat/InputKeputusan.jsx):
 *   - parseMasaInput("12.50s") → 12.5 (dulu 12.00)
 *   - lorongTertinggi(heat)    → lorong 6 tak tersorok bila acara set 5
 *
 * Jalan:
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npx firebase emulators:exec --only firestore \
 *     "node --import ./register-loader.mjs test-kddk-sahaja-e2e.mjs"
 */
import { readFileSync } from 'node:fs'
import { connectFirestoreEmulator, doc, setDoc, getDoc, collection, getDocs, deleteDoc } from 'firebase/firestore'
import { db } from './src/firebase/config.js'
import { runPostRasmi, adaKeputusan, bandingTanpaMasa } from './src/utils/postRasmiUtils.js'
import { selectFinalists, bandingFinalis, infoWildcardTanpaMasa, serpentineSeed } from './src/utils/finalistUtils.js'

let pass = 0, fail = 0
const gagalSenarai = []
function ok(nama, cond, nota = '') {
  if (cond) { pass++; console.log('  ✅', nama) }
  else { fail++; gagalSenarai.push(nama); console.log('  ❌', nama, nota ? `— ${nota}` : '') }
}

try { connectFirestoreEmulator(db, '127.0.0.1', 8080) } catch { /* sudah tersambung */ }

const SID = 'skl_ujian_kddk'
const KEJ = 'KEJ-UJIAN-KDDK'

// Ekstrak fungsi sebenar dari fail pencatat (bukan salinan)
const srcPencatat = readFileSync('./src/pages/pencatat/InputKeputusan.jsx', 'utf8')
function ambilFungsi(nama) {
  const mula = srcPencatat.indexOf(`function ${nama}(`)
  if (mula < 0) throw new Error(`fungsi ${nama} tiada`)
  let i = srcPencatat.indexOf('{', mula), d = 0
  for (; i < srcPencatat.length; i++) {
    if (srcPencatat[i] === '{') d++
    else if (srcPencatat[i] === '}' && --d === 0) break
  }
  return new Function(`${srcPencatat.slice(mula, i + 1)}; return ${nama}`)()
}
const parseMasaInput  = ambilFungsi('parseMasaInput')
const lorongTertinggi = ambilFungsi('lorongTertinggi')

// Replika data sebenar heat 121-F1 (Kddk diisi, masa null, status belum → selepas fix 'selesai')
const pesertaKddkSahaja = () => ([
  { noBib: 'KNG01', namaAtlet: 'A', kodSekolah: 'KNG', lorong: 6, keputusan: null, kedudukan: null, status: 'belum' },
  { noBib: 'KNG03', namaAtlet: 'B', kodSekolah: 'KNG', lorong: 3, keputusan: null, kedudukan: 3, status: 'selesai' },
  { noBib: 'BRU03', namaAtlet: 'C', kodSekolah: 'BRU', lorong: 2, keputusan: null, kedudukan: 4, status: 'selesai' },
  { noBib: 'BRU08', namaAtlet: 'D', kodSekolah: 'BRU', lorong: 4, keputusan: null, kedudukan: 2, status: 'selesai' },
  { noBib: 'MRH02', namaAtlet: 'E', kodSekolah: 'MRH', lorong: 5, keputusan: null, kedudukan: null, status: 'belum' },
  { noBib: 'MRH03', namaAtlet: 'F', kodSekolah: 'MRH', lorong: 1, keputusan: null, kedudukan: 1, status: 'selesai' },
])
const pesertaMasa = () => ([
  { noBib: 'AAA1', kodSekolah: 'AAA', lorong: 1, keputusan: 12.9, status: 'selesai' },
  { noBib: 'BBB1', kodSekolah: 'BBB', lorong: 2, keputusan: 12.1, status: 'selesai' },
  { noBib: 'CCC1', kodSekolah: 'CCC', lorong: 3, keputusan: 12.5, status: 'selesai' },
])

const acara = (peringkat) => ({
  id: 'A121', noAcara: '121', namaAcara: '80 M L1', namaAcaraPendek: '80 M',
  peringkat, jenisAcara: 'lorong', jantina: 'L', kategoriKod: 'L1', bilanganLorong: 5,
})

async function bersihkan() {
  const rek = await getDocs(collection(db, 'tenants', SID, 'rekod')).catch(() => null)
  if (rek) for (const d of rek.docs) await deleteDoc(d.ref)
  for (const c of ['medal_tally', 'mata_olahragawan']) {
    const s = await getDocs(collection(db, 'tenants', SID, 'kejohanan', KEJ, c)).catch(() => null)
    if (s) for (const d of s.docs) await deleteDoc(d.ref)
  }
}
async function tally(kod) {
  const s = await getDoc(doc(db, 'tenants', SID, 'kejohanan', KEJ, 'medal_tally', `${kod}_${KEJ}`))
  return s.exists() ? s.data() : {}
}
async function jumlahPingat() {
  const s = await getDocs(collection(db, 'tenants', SID, 'kejohanan', KEJ, 'medal_tally'))
  return s.docs.reduce((n, d) => n + (d.data().emas || 0) + (d.data().perak || 0) + (d.data().gangsa || 0), 0)
}
async function jalan(peserta, peringkat, heatId, grantMedal) {
  await runPostRasmi(db, { id: heatId, peserta, windSpeed: '' }, acara(peringkat), KEJ, {
    schoolId: SID, peringkatKej: 'D', grantMedal, isRelay: false,
  })
}

async function main() {
  console.log('═══ UJIAN: Keputusan Kddk sahaja (tanpa masa) ═══\n')

  console.log('UJIAN 1 — helper adaKeputusan')
  ok('masa > 0 → ada', adaKeputusan({ keputusan: 12.3 }))
  ok('Kddk sahaja → ada', adaKeputusan({ keputusan: null, kedudukan: 1 }))
  ok('masa + Kddk → ada', adaKeputusan({ keputusan: 12.3, kedudukan: 2 }))
  ok('DNS walau ada Kddk → TIADA', !adaKeputusan({ status: 'DNS', kedudukan: 1 }))
  ok('DQ walau ada masa → TIADA', !adaKeputusan({ status: 'DQ', keputusan: 12 }))
  ok('masa & Kddk kosong → TIADA', !adaKeputusan({ keputusan: null, kedudukan: null }))
  ok('Kddk "" → TIADA', !adaKeputusan({ keputusan: null, kedudukan: '' }))
  ok('masa 0 → TIADA', !adaKeputusan({ keputusan: 0 }))

  console.log('\nUJIAN 2 — bandingTanpaMasa (susunan)')
  ok('dua-dua bermasa → null (sort masa biasa)', bandingTanpaMasa({ keputusan: 12 }, { keputusan: 13 }) === null)
  ok('bermasa didahulukan', bandingTanpaMasa({ keputusan: 12 }, { kedudukan: 1 }) < 0)
  ok('tanpa masa ikut Kddk', bandingTanpaMasa({ kedudukan: 2 }, { kedudukan: 1 }) > 0)

  await setDoc(doc(db, 'tenants', SID, 'kejohanan', KEJ), { namaKejohanan: 'Ujian', peringkat: 'sekolah' })

  console.log('\nUJIAN 3 — ★ data sebenar #121: Kddk sahaja, akhir → pingat MASUK')
  await bersihkan()
  await jalan(pesertaKddkSahaja(), 'akhir', '121-F1', true)
  ok('tepat 3 pingat', (await jumlahPingat()) === 3, `dapat ${await jumlahPingat()}`)
  ok('MRH (Kddk 1) dapat emas', (await tally('MRH')).emas === 1, JSON.stringify(await tally('MRH')))
  ok('BRU (Kddk 2) dapat perak', (await tally('BRU')).perak === 1, JSON.stringify(await tally('BRU')))
  ok('KNG (Kddk 3) dapat gangsa', (await tally('KNG')).gangsa === 1, JSON.stringify(await tally('KNG')))
  const m1 = await getDoc(doc(db, 'tenants', SID, 'kejohanan', KEJ, 'mata_olahragawan', `MRH03_${KEJ}`))
  ok('mata_olahragawan MRH03 emas', m1.exists() && m1.data().pingat_emas === 1)
  ok('prestasi disimpan null (bukan 0)', m1.exists() && m1.data().acaraDetail_A121?.prestasi === null)
  const m2 = await getDoc(doc(db, 'tenants', SID, 'kejohanan', KEJ, 'mata_olahragawan', `KNG01_${KEJ}`))
  ok('atlet tanpa masa & Kddk → tiada mata', !m2.exists())
  const rek = await getDocs(collection(db, 'tenants', SID, 'rekod'))
  ok('tiada tuntutan rekod (tiada masa)', rek.empty, rek.docs.map(d => d.id).join(','))

  console.log('\nUJIAN 4 — saringan Kddk sahaja → TIADA pingat (grantMedal false)')
  await bersihkan()
  await jalan(pesertaKddkSahaja(), 'saringan_sf', '121-H1', false)
  ok('0 pingat', (await jumlahPingat()) === 0)

  console.log('\nUJIAN 5 — masa biasa TIDAK berubah')
  await bersihkan()
  await jalan(pesertaMasa(), 'akhir', 'M-F1', true)
  ok('BBB (12.1) emas', (await tally('BBB')).emas === 1)
  ok('CCC (12.5) perak', (await tally('CCC')).perak === 1)
  ok('AAA (12.9) gangsa', (await tally('AAA')).gangsa === 1)

  console.log('\nUJIAN 6 — campuran: bermasa + Kddk sahaja (Kddk tidak bertindih)')
  await bersihkan()
  await jalan([
    { noBib: 'AAA1', kodSekolah: 'AAA', keputusan: 12.1, kedudukan: 1, status: 'selesai' },
    { noBib: 'BBB1', kodSekolah: 'BBB', keputusan: null, kedudukan: 2, status: 'selesai' },
    { noBib: 'CCC1', kodSekolah: 'CCC', keputusan: null, kedudukan: 3, status: 'selesai' },
  ], 'akhir', 'C-F1', true)
  ok('AAA emas · BBB perak · CCC gangsa',
    (await tally('AAA')).emas === 1 && (await tally('BBB')).perak === 1 && (await tally('CCC')).gangsa === 1)

  console.log('\nUJIAN 7 — fix D: parseMasaInput (fungsi sebenar)')
  ok('"12.50s" → 12.5 (dulu 12)', parseMasaInput('12.50s') === 12.5, String(parseMasaInput('12.50s')))
  ok('"12.5" → 12.5', parseMasaInput('12.5') === 12.5)
  ok('"1:05.30" → 65.3', Math.abs(parseMasaInput('1:05.30') - 65.3) < 1e-9)
  ok('"1.05.30" → 65.3', Math.abs(parseMasaInput('1.05.30') - 65.3) < 1e-9)
  ok('"" → ""', parseMasaInput('') === '')

  console.log('\nUJIAN 8 — fix C1: lorongTertinggi (fungsi sebenar)')
  ok('heat #121 → 6', lorongTertinggi({ peserta: pesertaKddkSahaja() }) === 6)
  ok('max(acara 5, heat 6) = 6', Math.max(5, lorongTertinggi({ peserta: pesertaKddkSahaja() })) === 6)
  ok('heat kosong → 0 (kekal tetapan acara)', lorongTertinggi({ peserta: [] }) === 0)
  ok('lorong null (padang) → 0', lorongTertinggi({ peserta: [{ lorong: null }] }) === 0)

  // ── Saringan → finalis ikut Kddk ────────────────────────────────────────
  const fs = (bestHeat, bestTime) => ({ overrideByAcara: { '121': { bestHeat, bestTime } } })
  const fsQF = (bestHeat, bestTime) => ({ sukuKeSeparuhByAcara: { '121': { bestHeat, bestTime } } })
  const acS = { noAcara: '121', jenisAcara: 'lorong', peringkat: 'saringan_sf', kategoriKod: 'L1' }
  const heatK = (no, kods) => ({
    heatId: `H${no}`, noHeat: no, fasa: 'heat', statusKeputusan: 'diterima',
    peserta: kods.map((k, i) => ({ noBib: `${k}${no}`, kodSekolah: k, keputusan: null, kedudukan: i + 1, status: 'selesai' })),
  })
  const bibs = list => list.map(f => f.noBib).join(',')

  console.log('\nUJIAN 9 — saringan 1 heat, Kddk sahaja → Best Heat 3')
  const f9 = selectFinalists([heatK(1, ['A', 'B', 'C', 'D', 'E'])], acS, fs(3, 2))
  ok('3 finalis (Kddk 1-3), wildcard dilangkau', bibs(f9) === 'A1,B1,C1', bibs(f9))
  ok('semua Q', f9.every(f => f.qualifyType === 'Q'))
  ok('keputusan null (bukan 0)', f9.every(f => f.keputusan === null))

  console.log('\nUJIAN 10 — ★ saringan BANYAK heat, Kddk sahaja, TIADA wildcard')
  const h3 = [heatK(1, ['A', 'B', 'C', 'D']), heatK(2, ['E', 'F', 'G', 'H']), heatK(3, ['I', 'J', 'K', 'L'])]
  const f10 = selectFinalists(h3, acS, fs(2, 3))
  ok('3 heat × 2 = 6 finalis (wildcard 3 dilangkau)', f10.length === 6, bibs(f10))
  ok('Kddk 1 & 2 setiap heat', bibs(f10) === 'A1,B1,E2,F2,I3,J3', bibs(f10))
  ok('tiada q', !f10.some(f => f.qualifyType === 'q'))
  ok('infoWildcardTanpaMasa = true', infoWildcardTanpaMasa(h3, acS, fs(2, 3)) === true)
  ok('infoWildcardTanpaMasa = false bila bestTime 0', infoWildcardTanpaMasa(h3, acS, fs(2, 0)) === false)
  const seed = [...f10].sort((a, b) => bandingFinalis(a, b)).map(f => f.noBib).join(',')
  ok('seeding: semua Kddk 1 dulu, kemudian Kddk 2 (seri → heat awal)', seed === 'A1,E2,I3,B1,F2,J3', seed)

  console.log('\nUJIAN 11 — kapasiti: 3 heat × 3 = 9 > 8 lorong (data untuk amaran)')
  const f11 = selectFinalists(h3, acS, fs(3, 0))
  ok('9 finalis dipulangkan (amaran panel: 1 tiada lorong)', f11.length === 9 && f11.length - 8 === 1, String(f11.length))

  console.log('\nUJIAN 12 — QF→SF Kddk sahaja + serpentine 2 heat')
  const f12 = selectFinalists(h3, { ...acS, peringkat: 'saringan_qf' }, fsQF(4, 0), 'sukuKeSeparuh')
  ok('12 finalis', f12.length === 12)
  const sp = serpentineSeed([...f12].sort((a, b) => bandingFinalis(a, b)), 2)
  ok('2 heat SF × 6 seimbang', sp[0].length === 6 && sp[1].length === 6)
  ok('Kddk 1 Heat 1 & Kddk 1 Heat 2 di heat SF berbeza', sp[0][0].noBib === 'A1' && sp[1][0].noBib === 'E2',
    `${sp[0][0].noBib} / ${sp[1][0].noBib}`)

  console.log('\nUJIAN 13 — regresi: saringan BERMASA kekal sama (Q + wildcard q)')
  const heatM = (no, masa) => ({
    heatId: `M${no}`, noHeat: no, fasa: 'heat', statusKeputusan: 'rasmi',
    peserta: masa.map((m, i) => ({ noBib: `M${no}${i}`, kodSekolah: 'S', keputusan: m, status: 'selesai' })),
  })
  const f13 = selectFinalists([heatM(1, [12.0, 12.5, 13.0]), heatM(2, [11.8, 12.2, 12.9])], acS, fs(1, 2))
  ok('Q: M10 (12.0) & M20 (11.8); q: M21 (12.2) & M11 (12.5)', bibs(f13) === 'M10,M20,M21,M11', bibs(f13))
  ok('qualifyType Q,Q,q,q', f13.map(f => f.qualifyType).join('') === 'QQqq')
  const seedM = [...f13].sort((a, b) => bandingFinalis(a, b)).map(f => f.noBib).join(',')
  ok('seeding ikut masa', seedM === 'M20,M10,M21,M11', seedM)
  ok('padang: jarak jauh dulu', bandingFinalis({ keputusan: 5 }, { keputusan: 6 }, true) > 0)

  console.log('\nUJIAN 14 — campuran: heat 1 bermasa, heat 2 Kddk sahaja')
  const f14 = selectFinalists([heatM(1, [12.0, 12.5, 13.0]), heatK(2, ['X', 'Y', 'Z'])], acS, fs(1, 1))
  ok('Q M10 + Q X2 + wildcard hanya dari bermasa (M11)', bibs(f14) === 'M10,X2,M11', bibs(f14))

  console.log('\nUJIAN 15 — DNS dengan Kddk tidak layak')
  const hD = heatK(1, ['A', 'B', 'C']); hD.peserta[0].status = 'DNS'
  ok('A1 (DNS) tersingkir', bibs(selectFinalists([hD], acS, fs(2, 0))) === 'B1,C1')

  console.log(`\n${'═'.repeat(58)}`)
  console.log(`${fail === 0 ? '🎉 SEMUA LULUS' : '⚠️  ADA GAGAL'} — ${pass} lulus, ${fail} gagal`)
  if (fail) console.log('GAGAL:', gagalSenarai.join(' | '))
  process.exit(fail === 0 ? 0 : 1)
}

main().catch(e => { console.error('❌ RALAT:', e.message, '\n', e.stack?.split('\n').slice(0, 3).join('\n')); process.exit(1) })
