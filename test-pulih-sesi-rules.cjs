/**
 * test-pulih-sesi-rules.cjs — Ujian rules untuk pemulihan sesi + sesi serentak.
 *
 * Fix "clash bila banyak slug/peranan login serentak" memperkenalkan:
 *   • browserSessionPersistence (token Firebase per-tab)
 *   • pulihSesiAnon() — sign-in anon semula & tulis session doc baharu bila
 *     token hilang (tab pendua / token luput), tanpa taip PIN semula
 *
 * Ujian ini mengesahkan rules TIDAK dilonggarkan oleh pemulihan itu:
 *   1. Banyak sesi anon serentak dalam tenant SAMA — semua sah (kongsi kodAkses)
 *   2. Banyak tenant serentak — setiap anon terhad pada tenantnya sahaja
 *   3. Pemulihan (anon UID baharu) mesti lulus rules yang sama seperti login
 *   4. Pemulihan TIDAK boleh memintas semakan: userDocId palsu / kodAkses salah /
 *      user dinyahaktifkan / kodSekolah tiada → DITOLAK
 *   5. Sesi lama kekal berfungsi selepas sesi baharu dicipta (tiada saling bunuh)
 *
 * Jalan (perlu Java):
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npx firebase emulators:exec \
 *     --only firestore "node test-pulih-sesi-rules.cjs"
 */
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing')
const fs = require('fs')

const PROJECT_ID = 'goldpodium-test'
let testEnv
let pass = 0, fail = 0

async function ok(name, promise) {
  try { await promise; pass++; console.log('✅', name) }
  catch (e) { fail++; console.log('❌', name, '—', e.message) }
}

async function setup() {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
  await testEnv.clearFirestore()

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    // Tenant A
    await db.doc('tenants/skl_A').set({ namaSekolah: 'Sekolah A', slug: 'a', status: 'active' })
    await db.doc('tenants/skl_A/sekolah/SKA01').set({ namaSekolah: 'SK Alpha', pinHash: 'x' })
    await db.doc('tenants/skl_A/users/pcat_A').set({ role: 'pencatat', kodAkses: 'CATAT01', isAktif: true })
    await db.doc('tenants/skl_A/users/pcat_mati').set({ role: 'pencatat', kodAkses: 'MATI01', isAktif: false })
    // Tenant B
    await db.doc('tenants/skl_B').set({ namaSekolah: 'Sekolah B', slug: 'b', status: 'active' })
    await db.doc('tenants/skl_B/sekolah/SKB01').set({ namaSekolah: 'SK Beta', pinHash: 'x' })
    await db.doc('tenants/skl_B/users/pcat_B').set({ role: 'pencatat', kodAkses: 'CATAT99', isAktif: true })
  })
}

const sesiPencatat = (schoolId, userDocId, kodAkses) => ({
  role: 'pencatat', schoolId, userDocId, kodAkses, createdAt: new Date(), expireAt: new Date(Date.now() + 8 * 3600e3),
})
const sesiPengurus = (schoolId, kodSekolah) => ({
  role: 'pengurus', schoolId, kodSekolah, createdAt: new Date(), expireAt: new Date(Date.now() + 8 * 3600e3),
})

// Tulis session doc sebagai anon uid tertentu (meniru writeSessionAnon)
function tulisSesi(uid, schoolId, data) {
  const db = testEnv.authenticatedContext(uid, { provider_id: 'anonymous' }).firestore()
  return db.doc(`tenants/${schoolId}/sessions/${uid}`).set(data)
}
// Tulis data tenant sebagai anon uid (meniru kerja sebenar pencatat/PP)
function tulisData(uid, schoolId, path, data) {
  const db = testEnv.authenticatedContext(uid, { provider_id: 'anonymous' }).firestore()
  return db.doc(`tenants/${schoolId}/${path}`).set(data)
}

async function main() {
  await setup()

  console.log('\n── 1. Banyak sesi serentak dalam tenant SAMA ──')
  await ok('pencatat tab 1 (anon_1) cipta sesi',
    assertSucceeds(tulisSesi('anon_1', 'skl_A', sesiPencatat('skl_A', 'pcat_A', 'CATAT01'))))
  await ok('pencatat tab 2 (anon_2) kongsi kodAkses sama — sesi berasingan sah',
    assertSucceeds(tulisSesi('anon_2', 'skl_A', sesiPencatat('skl_A', 'pcat_A', 'CATAT01'))))
  await ok('PP tab 3 (anon_3) tenant sama — sesi sah',
    assertSucceeds(tulisSesi('anon_3', 'skl_A', sesiPengurus('skl_A', 'SKA01'))))

  console.log('\n── 2. Sesi lama KEKAL berfungsi selepas sesi baharu ──')
  await ok('anon_1 masih boleh tulis data tenant A',
    assertSucceeds(tulisData('anon_1', 'skl_A', 'atlet/at1', { nama: 'Ali' })))
  await ok('anon_2 boleh tulis data tenant A serentak',
    assertSucceeds(tulisData('anon_2', 'skl_A', 'atlet/at2', { nama: 'Abu' })))
  await ok('anon_3 (PP) boleh tulis data tenant A serentak',
    assertSucceeds(tulisData('anon_3', 'skl_A', 'atlet/at3', { nama: 'Aminah' })))

  console.log('\n── 3. Banyak tenant serentak — isolasi kekal ──')
  await ok('anon_9 cipta sesi tenant B',
    assertSucceeds(tulisSesi('anon_9', 'skl_B', sesiPencatat('skl_B', 'pcat_B', 'CATAT99'))))
  await ok('anon_9 boleh tulis tenant B',
    assertSucceeds(tulisData('anon_9', 'skl_B', 'atlet/bt1', { nama: 'Bala' })))
  await ok('anon_9 (tenant B) TIDAK boleh tulis tenant A',
    assertFails(tulisData('anon_9', 'skl_A', 'atlet/x', { nama: 'Silang' })))
  await ok('anon_1 (tenant A) TIDAK boleh tulis tenant B',
    assertFails(tulisData('anon_1', 'skl_B', 'atlet/x', { nama: 'Silang' })))
  // Nota: satu UID anon MEMANG boleh memegang sesi dalam >1 tenant, tetapi hanya
  // dengan membekalkan userDocId+kodAkses yang SAH untuk tenant itu — iaitu
  // kelayakan yang membolehkan log masuk biasa. Ia tidak memberi akses tambahan:
  // ujian di bawah mengesahkan kelayakan PALSU untuk tenant B tetap DITOLAK.
  await ok('anon_1 cipta sesi tenant B dengan kelayakan PALSU → DITOLAK',
    assertFails(tulisSesi('anon_1', 'skl_B', sesiPencatat('skl_B', 'pcat_A', 'CATAT01'))))

  console.log('\n── 4. Pemulihan sesi (pulihSesiAnon) ──')
  // Token luput → UID anon BAHARU tulis semula session doc guna data gp_session
  await ok('pulih pencatat: anon UID baharu cipta sesi — LULUS',
    assertSucceeds(tulisSesi('anon_pulih_1', 'skl_A', sesiPencatat('skl_A', 'pcat_A', 'CATAT01'))))
  await ok('selepas pulih: boleh tulis data semula',
    assertSucceeds(tulisData('anon_pulih_1', 'skl_A', 'atlet/at9', { nama: 'Pulih' })))
  await ok('pulih PP: anon UID baharu cipta sesi — LULUS',
    assertSucceeds(tulisSesi('anon_pulih_2', 'skl_A', sesiPengurus('skl_A', 'SKA01'))))

  console.log('\n── 5. Pemulihan TIDAK boleh memintas rules ──')
  await ok('pulih dengan userDocId TIDAK WUJUD → DITOLAK',
    assertFails(tulisSesi('anon_jahat_1', 'skl_A', sesiPencatat('skl_A', 'tak_wujud', 'CATAT01'))))
  await ok('pulih dengan kodAkses SALAH → DITOLAK',
    assertFails(tulisSesi('anon_jahat_2', 'skl_A', sesiPencatat('skl_A', 'pcat_A', 'SALAH99'))))
  await ok('pulih untuk user DINYAHAKTIFKAN → DITOLAK',
    assertFails(tulisSesi('anon_jahat_3', 'skl_A', sesiPencatat('skl_A', 'pcat_mati', 'MATI01'))))
  await ok('pulih PP dengan kodSekolah TIDAK WUJUD → DITOLAK',
    assertFails(tulisSesi('anon_jahat_4', 'skl_A', sesiPengurus('skl_A', 'TIADA99'))))
  await ok('pulih guna userDocId tenant LAIN → DITOLAK',
    assertFails(tulisSesi('anon_jahat_5', 'skl_A', sesiPencatat('skl_A', 'pcat_B', 'CATAT99'))))
  await ok('cipta sesi untuk UID ORANG LAIN (spoof) → DITOLAK',
    assertFails(testEnv.authenticatedContext('anon_x', { provider_id: 'anonymous' }).firestore()
      .doc('tenants/skl_A/sessions/anon_y').set(sesiPencatat('skl_A', 'pcat_A', 'CATAT01'))))
  await ok('schoolId dalam data tak padan path → DITOLAK',
    assertFails(tulisSesi('anon_jahat_6', 'skl_A', sesiPencatat('skl_B', 'pcat_A', 'CATAT01'))))

  console.log('\n── 6. Logout satu sesi tidak menjejaskan sesi lain ──')
  const dbAnon2 = testEnv.authenticatedContext('anon_2', { provider_id: 'anonymous' }).firestore()
  await ok('anon_2 padam sesi sendiri',
    assertSucceeds(dbAnon2.doc('tenants/skl_A/sessions/anon_2').delete()))
  await ok('anon_1 TIDAK terjejas — masih boleh tulis',
    assertSucceeds(tulisData('anon_1', 'skl_A', 'atlet/at10', { nama: 'Kekal' })))
  await ok('anon_2 TIDAK boleh padam sesi anon_1',
    assertFails(dbAnon2.doc('tenants/skl_A/sessions/anon_1').delete()))

  await testEnv.cleanup()
  console.log(`\n${fail === 0 ? '🎉' : '⚠️'}  ${pass} lulus, ${fail} gagal`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
