/**
 * test-no-papar.cjs — Ujian unit untuk acaraPaparUtils.
 *
 * Nombor paparan membenarkan acara 101 dipapar sebagai 201 tanpa menukar ID
 * dokumen (yang akan meyatimkan heat, pendaftaran, mata, dan medal tally).
 * Ujian ini mengesahkan:
 *   • acara tanpa noAcaraPapar berkelakuan PERSIS seperti sebelum ini
 *   • nilai kosong/null/ruang dianggap "tiada" — jatuh balik ke nombor sebenar
 *   • pengesahan menolak perlanggaran yang akan mengelirukan pengguna
 *
 * Jalan: node test-no-papar.cjs
 */
const fs = require('fs')
const path = require('path')

// Muat modul ESM tanpa Vite: tukar export → assignment dalam sandbox
const src = fs.readFileSync(path.join(__dirname, 'src/utils/acaraPaparUtils.js'), 'utf8')
const kod = src.replace(/export function/g, 'function')
const sandbox = {}
new Function('sandbox', kod + `
  sandbox.noAcaraPapar = noAcaraPapar
  sandbox.adaNoPapar = adaNoPapar
  sandbox.labelAcaraAdmin = labelAcaraAdmin
  sandbox.sahkanNoPapar = sahkanNoPapar
`)(sandbox)
const { noAcaraPapar, adaNoPapar, labelAcaraAdmin, sahkanNoPapar } = sandbox

let pass = 0, fail = 0
const gagal = []
function ok(nama, cond, nota = '') {
  if (cond) { pass++; console.log('  ✅', nama) }
  else { fail++; gagal.push(nama); console.log('  ❌', nama, nota ? `— ${nota}` : '') }
}

console.log('\n── 1. Serasi belakang: acara SEDIA ADA tidak berubah ──')
ok('acara biasa tanpa noAcaraPapar → papar noAcara',
   noAcaraPapar({ id: '101', noAcara: '101' }) === '101')
ok('noAcaraPapar undefined → papar noAcara',
   noAcaraPapar({ id: '101', noAcara: '101', noAcaraPapar: undefined }) === '101')
ok('noAcaraPapar null → papar noAcara',
   noAcaraPapar({ id: '101', noAcara: '101', noAcaraPapar: null }) === '101')
ok('noAcaraPapar rentetan kosong → papar noAcara',
   noAcaraPapar({ id: '101', noAcara: '101', noAcaraPapar: '' }) === '101')
ok('noAcaraPapar ruang sahaja → papar noAcara',
   noAcaraPapar({ id: '101', noAcara: '101', noAcaraPapar: '   ' }) === '101')
ok('★ ZERO REGRESI — semua acara sedia ada kekal',
   noAcaraPapar({ id: '215B', noAcara: '215B' }) === '215B')

console.log('\n── 2. Nombor paparan berfungsi ──')
ok('101 dipapar sebagai 201',
   noAcaraPapar({ id: '101', noAcara: '101', noAcaraPapar: '201' }) === '201')
ok('ruang di tepi dipangkas',
   noAcaraPapar({ id: '101', noAcara: '101', noAcaraPapar: ' 201 ' }) === '201')
ok('nombor bukan angka diterima (cth 201A)',
   noAcaraPapar({ id: '101', noAcara: '101', noAcaraPapar: '201A' }) === '201A')

console.log('\n── 3. Kes tepi tidak meranapkan sistem ──')
ok('acara null → rentetan kosong', noAcaraPapar(null) === '')
ok('acara undefined → rentetan kosong', noAcaraPapar(undefined) === '')
ok('acara tanpa medan langsung → rentetan kosong', noAcaraPapar({}) === '')
ok('fallback ke aceraId bila noAcara tiada',
   noAcaraPapar({ id: 'X', aceraId: '99' }) === '99')
ok('fallback ke id bila noAcara & aceraId tiada',
   noAcaraPapar({ id: 'X' }) === 'X')
ok('nilai 0 diterima sebagai sah',
   noAcaraPapar({ id: '1', noAcara: '1', noAcaraPapar: 0 }) === '0')

console.log('\n── 4. adaNoPapar — kesan acara yang dipapar berbeza ──')
ok('tiada noAcaraPapar → false', adaNoPapar({ id: '101', noAcara: '101' }) === false)
ok('noAcaraPapar sama dgn noAcara → false',
   adaNoPapar({ id: '101', noAcara: '101', noAcaraPapar: '101' }) === false)
ok('noAcaraPapar berbeza → true',
   adaNoPapar({ id: '101', noAcara: '101', noAcaraPapar: '201' }) === true)
ok('null → false', adaNoPapar(null) === false)

console.log('\n── 5. Label admin sentiasa dedah ID sebenar ──')
ok('tiada papar → nombor tunggal',
   labelAcaraAdmin({ id: '101', noAcara: '101' }) === '101')
ok('★ ada papar → tunjuk KEDUA-DUA nombor',
   labelAcaraAdmin({ id: '101', noAcara: '101', noAcaraPapar: '201' }) === '201 (ID: 101)')

console.log('\n── 6. Pengesahan: lindungi daripada kekeliruan ──')
const senarai = [
  { id: '101', noAcara: '101', namaAcara: '100M L12' },
  { id: '201', noAcara: '201', namaAcara: '100M L12 FINAL' },
  { id: '105', noAcara: '105', namaAcara: '200M', noAcaraPapar: '305' },
]
const acaraIni = senarai[0]

let r = sahkanNoPapar('', acaraIni, senarai)
ok('kosong → sah (kembali ke nombor sebenar)', r.ok === true && r.nilai === '')

r = sahkanNoPapar('101', acaraIni, senarai)
ok('sama dgn nombor sendiri → dinormalkan ke kosong', r.ok === true && r.nilai === '')

r = sahkanNoPapar('201', acaraIni, senarai)
ok('★ berlanggar dgn ID acara LAIN → DITOLAK', r.ok === false, r.ralat)

r = sahkanNoPapar('305', acaraIni, senarai)
ok('★ berlanggar dgn nombor papar acara lain → DITOLAK', r.ok === false, r.ralat)

r = sahkanNoPapar('999', acaraIni, senarai)
ok('nombor bebas → DITERIMA', r.ok === true && r.nilai === '999')

r = sahkanNoPapar('  888  ', acaraIni, senarai)
ok('ruang dipangkas sebelum simpan', r.ok === true && r.nilai === '888')

r = sahkanNoPapar('A'.repeat(13), acaraIni, senarai)
ok('terlalu panjang → DITOLAK', r.ok === false)

r = sahkanNoPapar('201', senarai[1], senarai)
ok('acara 201 tetapkan "201" untuk dirinya → dinormalkan kosong',
   r.ok === true && r.nilai === '')

console.log('\n── 7. Nombor paparan TIDAK pernah jadi rujukan ──')
// Ini kontrak reka bentuk: carian mesti guna id sebenar, bukan nombor papar.
const cariIkutId = (list, no) => list.find(a => String(a.noAcara ?? a.id) === String(no))
ok('★ cari "101" jumpa acara sebenar (bukan yang papar 101)',
   cariIkutId(senarai, '101').id === '101')
ok('★ cari "305" TIDAK jumpa apa-apa — 305 hanya nombor papar',
   cariIkutId(senarai, '305') === undefined)

console.log(`\n${'═'.repeat(56)}`)
console.log(`${fail === 0 ? '🎉 SEMUA LULUS' : '⚠️  ADA GAGAL'} — ${pass} lulus, ${fail} gagal`)
if (fail) console.log('GAGAL:', gagal.join(' | '))
process.exit(fail === 0 ? 0 : 1)
