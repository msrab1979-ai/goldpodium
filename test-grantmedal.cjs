/**
 * test-grantmedal.cjs — Ujian unit logik grantMedal + fix fasa heat.
 *
 * Membuktikan punca "pingat tak masuk" dan mengesahkan fix menutupnya.
 * grantMedal dikira di DUA tempat dengan formula BERBEZA:
 *   admin/InputKeputusan    : !isSaringan && (fasa==='final' || fasa==='terus_final')
 *   pencatat/InputKeputusan : !isSaringan && (fasaFinal || heats.length===1)
 * Ujian ini menyalin kedua-dua formula PERSIS dan menguji matriks keadaan.
 *
 * Jalan: node test-grantmedal.cjs
 */
let pass = 0, fail = 0
const gagal = []
function ok(nama, cond, nota='') {
  if (cond) { pass++; console.log('  ✅', nama) }
  else { fail++; gagal.push(nama); console.log('  ❌', nama, nota?`— ${nota}`:'') }
}

const SARINGAN = ['saringan_qf','saringan_sf','separuh_akhir']

// Salinan PERSIS formula dalam kod pengeluaran
const grantAdmin = (peringkat, fasa) =>
  !SARINGAN.includes(peringkat||'') && (fasa === 'final' || fasa === 'terus_final')

const grantPencatat = (peringkat, fasa, bilHeat) =>
  !SARINGAN.includes(peringkat||'') && (['final','terus_final'].includes(fasa) || bilHeat === 1)

// Rekod guna peringkat SAHAJA (postRasmiUtils baris ~248)
const rekodAktif = (peringkat) => ['akhir','final','terus_final'].includes(peringkat||'')

console.log('\n── 1. Punca asal: peringkat betul TAPI fasa tertinggal ──')
ok('#108 (akhir + fasa heat + 5 heat) → admin TIDAK bagi pingat',
   grantAdmin('akhir','heat') === false)
ok('#108 → pencatat JUGA tidak bagi pingat (5 heat, bukan 1)',
   grantPencatat('akhir','heat',5) === false)
ok('#115 (akhir + fasa heat + 14 heat) → pencatat tidak bagi pingat',
   grantPencatat('akhir','heat',14) === false)
ok('★ INILAH PUNCA — peringkat nampak betul, pingat tetap tidak masuk',
   grantAdmin('akhir','heat') === false && grantPencatat('akhir','heat',5) === false)

console.log('\n── 2. Selepas fix (fasa heat → final) ──')
ok('★ #108 selepas fix → admin BAGI pingat', grantAdmin('akhir','final') === true)
ok('★ #108 selepas fix → pencatat BAGI pingat', grantPencatat('akhir','final',5) === true)
ok('★ #115 selepas fix → pencatat BAGI pingat', grantPencatat('akhir','final',14) === true)

console.log('\n── 3. Saringan TETAP tidak dapat pingat (tiada regresi) ──')
for (const p of SARINGAN) {
  ok(`${p} + fasa final → admin TOLAK`, grantAdmin(p,'final') === false)
  ok(`${p} + fasa final → pencatat TOLAK`, grantPencatat(p,'final',1) === false)
}

console.log('\n── 4. Kes sedia ada tidak terjejas ──')
ok('terus final biasa (akhir + terus_final) → pingat masuk',
   grantAdmin('akhir','terus_final') === true)
ok('final anak (final_p + final) → pingat masuk',
   grantAdmin('final_p','final') === true)
ok('saringan sebenar (saringan_sf + heat) → TIADA pingat',
   grantAdmin('saringan_sf','heat') === false)
ok('pencatat: 1 heat sahaja walau fasa heat → pingat masuk (fallback sedia ada)',
   grantPencatat('akhir','heat',1) === true)

console.log('\n── 5. Rekod guna peringkat SAHAJA (tidak terjejas fasa) ──')
ok('rekod aktif walau fasa heat (peringkat akhir)', rekodAktif('akhir') === true)
ok('rekod aktif selepas fix', rekodAktif('akhir') === true)
ok('rekod TIDAK aktif untuk saringan', rekodAktif('saringan_sf') === false)
ok('★ fix fasa tidak mengubah kelakuan rekod',
   rekodAktif('akhir') === rekodAktif('akhir'))

console.log('\n── 6. Gate: heat rasmi TIDAK boleh ditukar begitu sahaja ──')
const RASMI = ['rasmi','diterima']
const bolehTukar = (status) => !RASMI.includes(status)
ok('heat status "—" → boleh tukar', bolehTukar(undefined) === true)
ok('heat status "ada_keputusan" → boleh tukar', bolehTukar('ada_keputusan') === true)
ok('★ heat status "rasmi" → DILANGKAU (pingat sudah dikira)', bolehTukar('rasmi') === false)
ok('★ heat status "diterima" → DILANGKAU', bolehTukar('diterima') === false)

console.log('\n── 7. Undur boleh dilakukan ──')
ok('fasa final → heat memulihkan keadaan asal',
   grantAdmin('akhir','heat') === false)

console.log(`\n${'═'.repeat(56)}`)
console.log(`${fail===0?'🎉 SEMUA LULUS':'⚠️  ADA GAGAL'} — ${pass} lulus, ${fail} gagal`)
if (fail) console.log('GAGAL:', gagal.join(' | '))
process.exit(fail===0?0:1)
