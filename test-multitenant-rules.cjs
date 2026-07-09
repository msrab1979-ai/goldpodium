/**
 * Test Multi-Tenant Rules
 *
 * Run this against Firebase Emulator to verify:
 *   1. Anonymous user WITHOUT session doc cannot write to any tenant
 *   2. Anonymous user WITH session doc for Tenant A cannot write to Tenant B
 *   3. Anonymous user WITH session doc for Tenant A CAN write to Tenant A
 *   4. Admin of School A cannot write to School B
 *
 * Setup:
 *   1. Install emulator: npm install -g firebase-tools
 *   2. Init emulator: firebase init emulators (choose Firestore)
 *   3. Start emulator: firebase emulators:start --only firestore
 *   4. Run test: node test-multitenant-rules.cjs
 */

const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing')
const fs = require('fs')

const PROJECT_ID = 'goldpodium-test'

let testEnv

async function setup() {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })

  // Clear data from previous runs
  await testEnv.clearFirestore()

  // Setup baseline data — bypass rules using withSecurityRulesDisabled
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()

    // Sekolah A (schoolId = skl_A) — ada admin uid=admin_A
    await db.doc('tenants/skl_A').set({ namaSekolah: 'Sekolah A', slug: 'skl-a', status: 'active' })
    await db.doc('users/admin_A').set({ role: 'admin', schoolId: 'skl_A', isAktif: true })
    await db.doc('tenants/skl_A/sekolah/KOD_A_001').set({ namaSekolah: 'SK Bunga', pinHash: 'x' })
    // Pencatat user doc dalam tenant A — session pencatat disahkan terhadap doc ini
    await db.doc('tenants/skl_A/users/pencatat_doc_A').set({ role: 'pencatat', kodAkses: 'CATAT01', isAktif: true, pinHash: 'x' })

    // Sekolah B (schoolId = skl_B)
    await db.doc('tenants/skl_B').set({ namaSekolah: 'Sekolah B', slug: 'skl-b', status: 'active' })
    await db.doc('users/admin_B').set({ role: 'admin', schoolId: 'skl_B', isAktif: true })
    await db.doc('tenants/skl_B/sekolah/KOD_B_001').set({ namaSekolah: 'SK Melur', pinHash: 'y' })

    // Superadmin
    await db.doc('users/superadmin_1').set({ role: 'superadmin', isAktif: true })
  })
}

async function teardown() {
  await testEnv.cleanup()
}

const results = []
function log(name, passed, detail = '') {
  results.push({ name, passed, detail })
  console.log(`${passed ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`)
}

async function tryFail(label, promise) {
  try { await assertFails(promise); log(label, true) }
  catch (e) { log(label, false, e.message.slice(0, 80)) }
}

async function trySucceed(label, promise) {
  try { await assertSucceeds(promise); log(label, true) }
  catch (e) { log(label, false, e.message.slice(0, 80)) }
}

async function tests() {
  // Test 1: anon TIADA session — guna UID baru
  const anonFresh = testEnv.authenticatedContext('anon_fresh', { firebase: { sign_in_provider: 'anonymous' } })
  const freshDb   = anonFresh.firestore()

  console.log('\n─── Test 1: Anonymous TANPA session doc ───')
  await tryFail('Anon tak boleh tulis atlet Sekolah A',
    freshDb.doc('tenants/skl_A/atlet/x').set({ nama: 'hack' }))
  await tryFail('Anon tak boleh tulis heat Sekolah A',
    freshDb.doc('tenants/skl_A/kejohanan/k1/heat/h1').set({ n: 1 }))
  await tryFail('Anon tak boleh tulis rekod',
    freshDb.doc('tenants/skl_A/rekod/xyz').set({ masa: 10 }))

  // Test 2: anon cipta session (UID berbeza untuk isolation)
  const anonUser = testEnv.authenticatedContext('anon_user_1', { firebase: { sign_in_provider: 'anonymous' } })
  const anonDb   = anonUser.firestore()

  console.log('\n─── Test 2: Anonymous cipta session doc ───')
  await trySucceed('Anon boleh cipta session pengurus SENDIRI (kod wujud)',
    anonDb.doc('tenants/skl_A/sessions/anon_user_1').set({
      role: 'pengurus', schoolId: 'skl_A', kodSekolah: 'KOD_A_001', createdAt: new Date(),
    }))
  await tryFail('Anon tak boleh cipta session dengan kodSekolah palsu',
    anonDb.doc('tenants/skl_A/sessions/anon_user_1_x').set({
      role: 'pengurus', schoolId: 'skl_A', kodSekolah: 'KOD_PALSU', createdAt: new Date(),
    }))
  await tryFail('Anon tak boleh cipta session di path anonUid lain',
    anonDb.doc('tenants/skl_A/sessions/anon_user_2').set({
      role: 'pengurus', schoolId: 'skl_A', kodSekolah: 'KOD_A_001', createdAt: new Date(),
    }))
  await tryFail('Anon tak boleh update session (immutable)',
    anonDb.doc('tenants/skl_A/sessions/anon_user_1').update({ role: 'admin' }))

  // Test 2b: session PENCATAT — disahkan terhadap user doc (S1 fix)
  console.log('\n─── Test 2b: Session pencatat (S1 — anti-palsu) ───')
  const catatOK = testEnv.authenticatedContext('anon_catat_ok', { firebase: { sign_in_provider: 'anonymous' } })
  const catatOKDb = catatOK.firestore()
  await trySucceed('Pencatat SAH boleh cipta session (userDocId + kodAkses padan)',
    catatOKDb.doc('tenants/skl_A/sessions/anon_catat_ok').set({
      role: 'pencatat', schoolId: 'skl_A', userDocId: 'pencatat_doc_A', kodAkses: 'CATAT01', createdAt: new Date(),
    }))

  const catatBad = testEnv.authenticatedContext('anon_catat_bad', { firebase: { sign_in_provider: 'anonymous' } })
  const catatBadDb = catatBad.firestore()
  await tryFail('Pencatat PALSU tanpa userDocId DITOLAK',
    catatBadDb.doc('tenants/skl_A/sessions/anon_catat_bad').set({
      role: 'pencatat', schoolId: 'skl_A', kodAkses: 'CATAT01', createdAt: new Date(),
    }))
  await tryFail('Pencatat PALSU userDocId tak wujud DITOLAK',
    catatBadDb.doc('tenants/skl_A/sessions/anon_catat_bad').set({
      role: 'pencatat', schoolId: 'skl_A', userDocId: 'tiada_doc', kodAkses: 'CATAT01', createdAt: new Date(),
    }))
  await tryFail('Pencatat PALSU kodAkses salah DITOLAK',
    catatBadDb.doc('tenants/skl_A/sessions/anon_catat_bad').set({
      role: 'pencatat', schoolId: 'skl_A', userDocId: 'pencatat_doc_A', kodAkses: 'SALAH99', createdAt: new Date(),
    }))
  await tryFail('Pencatat PALSU guna userDoc tenant A untuk masuk tenant B DITOLAK',
    catatBadDb.doc('tenants/skl_B/sessions/anon_catat_bad').set({
      role: 'pencatat', schoolId: 'skl_B', userDocId: 'pencatat_doc_A', kodAkses: 'CATAT01', createdAt: new Date(),
    }))

  console.log('\n─── Test 3: Anonymous DENGAN session doc ───')
  await trySucceed('Anon (session A) boleh tulis pendaftaran Sekolah A',
    anonDb.doc('tenants/skl_A/kejohanan/k1/pendaftaran/p1').set({ nama: 'Ali' }))
  await tryFail('Anon (session A) TAK boleh tulis pendaftaran Sekolah B',
    anonDb.doc('tenants/skl_B/kejohanan/k1/pendaftaran/p1').set({ nama: 'hack' }))
  await tryFail('Anon (session A) TAK boleh tulis atlet Sekolah B',
    anonDb.doc('tenants/skl_B/atlet/x').set({ nama: 'hack' }))

  // Test 4: Admins
  const adminA   = testEnv.authenticatedContext('admin_A')
  const adminB   = testEnv.authenticatedContext('admin_B')
  const superAdm = testEnv.authenticatedContext('superadmin_1')
  const adminADb = adminA.firestore()
  const adminBDb = adminB.firestore()
  const superDb  = superAdm.firestore()

  console.log('\n─── Test 4: Admin cross-tenant ───')
  await trySucceed('Admin A boleh tulis atlet Sekolah A',
    adminADb.doc('tenants/skl_A/atlet/at1').set({ nama: 'atlet A' }))
  await tryFail('Admin A TAK boleh tulis atlet Sekolah B',
    adminADb.doc('tenants/skl_B/atlet/at1').set({ nama: 'hack' }))
  await tryFail('Admin B TAK boleh tulis rekod Sekolah A',
    adminBDb.doc('tenants/skl_A/rekod/x').set({ masa: 10 }))

  console.log('\n─── Test 5: Superadmin ───')
  await trySucceed('Superadmin boleh tulis Sekolah A',
    superDb.doc('tenants/skl_A/atlet/sa1').set({ nama: 'sa' }))
  await trySucceed('Superadmin boleh tulis Sekolah B',
    superDb.doc('tenants/skl_B/atlet/sa1').set({ nama: 'sa' }))
  await trySucceed('Superadmin boleh tulis tenants root',
    superDb.doc('tenants/skl_A').update({ status: 'active' }))
  await tryFail('Admin A TAK boleh tulis tenants root',
    adminADb.doc('tenants/skl_A').update({ status: 'suspended' }))

  console.log('\n─── Test 6: Public read ───')
  await trySucceed('Anyone boleh baca atlet (SchoolLanding public)',
    anonDb.doc('tenants/skl_A/atlet/at1').get())
  await trySucceed('Anyone boleh baca kejohanan',
    anonDb.doc('tenants/skl_A/kejohanan/k1').get())
  await trySucceed('Anyone boleh baca slugIndex',
    anonDb.doc('slugIndex/skl-a').get())

  // Test 7: login_attempts hardening (S2)
  console.log('\n─── Test 7: login_attempts (S2 — anti-pintas rate limit) ───')
  const pub = testEnv.unauthenticatedContext().firestore()
  const now = Date.now()
  const future = new Date(now + 30 * 60 * 1000)  // lock 30 min ke depan
  const past   = new Date(now - 60 * 1000)       // lock dah tamat

  // Aliran SAH — kod tulis kaunter sebelum auth
  await trySucceed('SAH: create kaunter cubaan (login pertama)',
    pub.doc('login_attempts/pencatat_skl_A_KOD1').set({ attempts: 1, lockedUntil: null, lastAttempt: new Date() }))
  await trySucceed('SAH: naik attempts (cubaan gagal seterusnya)',
    pub.doc('login_attempts/pencatat_skl_A_KOD1').set({ attempts: 2, lockedUntil: null, lastAttempt: new Date() }, { merge: true }))

  // Setup doc SEDANG terkunci (guna admin bypass)
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc('login_attempts/pencatat_skl_A_LOCKED').set({ attempts: 5, lockedUntil: future })
    await ctx.firestore().doc('login_attempts/pencatat_skl_A_EXPIRED').set({ attempts: 5, lockedUntil: past })
  })

  // Serangan — DILARANG
  await tryFail('PINTAS: reset attempts semasa SEDANG terkunci DITOLAK',
    pub.doc('login_attempts/pencatat_skl_A_LOCKED').set({ attempts: 0, lockedUntil: null }, { merge: true }))
  await tryFail('PINTAS: padam kaunter DITOLAK',
    pub.doc('login_attempts/pencatat_skl_A_LOCKED').delete())

  // Aliran SAH selepas lock tamat — checkRateLimit reset kaunter
  await trySucceed('SAH: reset kaunter selepas lock TAMAT (checkRateLimit)',
    pub.doc('login_attempts/pencatat_skl_A_EXPIRED').set({ attempts: 0, lockedUntil: null }, { merge: true }))
}

async function main() {
  console.log('=== Multi-Tenant Rules Test ===\n')
  console.log('Requires: firebase emulators:start --only firestore\n')

  await setup()
  try {
    await tests()
  } finally {
    await teardown()
  }

  const passed = results.filter(r => r.passed).length
  const total  = results.length
  console.log(`\n=== ${passed}/${total} passed ===`)
  process.exit(passed === total ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
