/**
 * ujian-hantu-live.cjs — Ujian hantu terhadap PENGELUARAN LIVE (goldpodium.web.app).
 *
 * Membuktikan fix sesi per-tab menyelesaikan clash, menggunakan Firestore LIVE
 * dan Anonymous Auth sebenar — tanpa perlu kata laluan sesiapa.
 *
 * Setiap "tab" dimodelkan sebagai Firebase App BERASINGAN dengan auth sendiri
 * (inMemoryPersistence) — inilah keadaan sebenar selepas browserSessionPersistence:
 * setiap tab = identiti Firebase tersendiri. Dengan localStorage (mod lama),
 * semua tab terpaksa berkongsi SATU identiti.
 *
 * Menulis HANYA ke tenants/skl_demo (tenant demo). Semua doc ujian dipadam
 * pada akhir. Tiada tenant pelanggan disentuh.
 *
 * Jalan: node ujian-hantu-live.cjs
 */
const { initializeApp, deleteApp } = require('firebase/app')
const { getFirestore, doc, setDoc, getDoc, deleteDoc, serverTimestamp, Timestamp } = require('firebase/firestore')
const { getAuth, signInAnonymously, signOut, setPersistence, inMemoryPersistence } = require('firebase/auth')

const CFG = {
  apiKey: 'AIzaSyDQWDAYBZ8T9Gx8z4-STmOSmBYzX-wDxmw',
  authDomain: 'goldpodium.firebaseapp.com',
  projectId: 'goldpodium',
}
const DEMO = 'skl_demo'

let pass = 0, fail = 0
const gagalSenarai = []
function ok(nama, cond, nota = '') {
  if (cond) { pass++; console.log('  ✅', nama) }
  else { fail++; gagalSenarai.push(nama); console.log('  ❌', nama, nota ? `— ${nota}` : '') }
}

// Satu "tab": app + auth + db berasingan, identiti sendiri
async function bukaTab(nama) {
  const app  = initializeApp(CFG, `tab_${nama}_${Date.now()}_${Math.random().toString(36).slice(2)}`)
  const auth = getAuth(app)
  await setPersistence(auth, inMemoryPersistence)   // meniru sesi per-tab
  const db   = getFirestore(app)
  return { nama, app, auth, db, uid: null }
}

async function loginAnon(tab) {
  const c = await signInAnonymously(tab.auth)
  tab.uid = c.user.uid
  return tab.uid
}

// Cipta session doc (meniru writeSessionAnon untuk PP)
async function ciptaSesiPP(tab, kodSekolah) {
  await setDoc(doc(tab.db, 'tenants', DEMO, 'sessions', tab.uid), {
    role: 'pengurus', schoolId: DEMO, kodSekolah,
    createdAt: serverTimestamp(),
    expireAt: Timestamp.fromMillis(Date.now() + 8 * 3600e3),
  })
}

// Ujian tulis sebenar ke Firestore live (inilah yang GAGAL bila sesi clash)
async function cubaTulis(tab, docId) {
  try {
    await setDoc(doc(tab.db, 'tenants', DEMO, 'atlet', docId), {
      nama: '__UJIAN_HANTU__', ujian: true, oleh: tab.nama, pada: serverTimestamp(),
    })
    return { ok: true }
  } catch (e) { return { ok: false, kod: e.code || e.message } }
}

const sampah = []   // doc untuk dibersihkan

;(async () => {
  console.log('═══ UJIAN HANTU — LIVE (goldpodium.web.app / Firestore pengeluaran) ═══')
  console.log(`Tenant ujian: ${DEMO} (demo sahaja)\n`)

  // ── Ujian 1: banyak PP tenant sama, serentak ────────────────────────────────
  console.log('UJIAN 1 — PP GML + PP HRJ serentak (aduan asal)')
  const tabA = await bukaTab('A_PP_GML')
  const tabB = await bukaTab('B_PP_HRJ')
  await loginAnon(tabA); await ciptaSesiPP(tabA, 'GML')
  await loginAnon(tabB); await ciptaSesiPP(tabB, 'HRJ')
  ok('tab A dan tab B dapat UID BERBEZA', tabA.uid !== tabB.uid, `${tabA.uid} vs ${tabB.uid}`)

  const w1a = await cubaTulis(tabA, '__ujian_A1')
  const w1b = await cubaTulis(tabB, '__ujian_B1')
  sampah.push('__ujian_A1', '__ujian_B1')
  ok('PP GML boleh tulis', w1a.ok, w1a.kod)
  ok('PP HRJ boleh tulis', w1b.ok, w1b.kod)

  // KRITIKAL: tab A masih hidup SELEPAS tab B login (inilah bug asal)
  const w1a2 = await cubaTulis(tabA, '__ujian_A2')
  sampah.push('__ujian_A2')
  ok('★ PP GML MASIH boleh tulis selepas PP HRJ login (BUG ASAL)', w1a2.ok, w1a2.kod)

  // ── Ujian 2: tambah tab ketiga & keempat ────────────────────────────────────
  console.log('\nUJIAN 2 — 4 sesi serentak')
  const tabC = await bukaTab('C_PP_SAM')
  const tabD = await bukaTab('D_PP_BKI')
  await loginAnon(tabC); await ciptaSesiPP(tabC, 'SAM')
  await loginAnon(tabD); await ciptaSesiPP(tabD, 'BKI')
  const uids = [tabA.uid, tabB.uid, tabC.uid, tabD.uid]
  ok('4 tab, 4 UID unik', new Set(uids).size === 4)

  const semua = await Promise.all([
    cubaTulis(tabA, '__ujian_A3'), cubaTulis(tabB, '__ujian_B3'),
    cubaTulis(tabC, '__ujian_C3'), cubaTulis(tabD, '__ujian_D3'),
  ])
  sampah.push('__ujian_A3', '__ujian_B3', '__ujian_C3', '__ujian_D3')
  ok('★ SEMUA 4 sesi boleh tulis SERENTAK', semua.every(r => r.ok),
     semua.map((r, i) => r.ok ? '' : `tab${i}:${r.kod}`).filter(Boolean).join(' '))

  // ── Ujian 3: logout satu tab tidak jejas yang lain ──────────────────────────
  console.log('\nUJIAN 3 — logout berskop')
  await deleteDoc(doc(tabB.db, 'tenants', DEMO, 'sessions', tabB.uid))
  await signOut(tabB.auth)
  const wB = await cubaTulis(tabB, '__ujian_B4')
  ok('tab B selepas logout TIDAK boleh tulis', !wB.ok)

  const semuaLain = await Promise.all([
    cubaTulis(tabA, '__ujian_A4'), cubaTulis(tabC, '__ujian_C4'), cubaTulis(tabD, '__ujian_D4'),
  ])
  sampah.push('__ujian_A4', '__ujian_C4', '__ujian_D4')
  ok('★ logout tab B TIDAK jejas tab A/C/D', semuaLain.every(r => r.ok),
     semuaLain.map((r, i) => r.ok ? '' : `${r.kod}`).filter(Boolean).join(' '))

  // ── Ujian 4: pemulihan sesi (token luput / tab pendua) ──────────────────────
  console.log('\nUJIAN 4 — pemulihan sesi (useSessionGuard → pulihSesiAnon)')
  const uidLama = tabA.uid
  await signOut(tabA.auth)                       // token hilang
  const wRosak = await cubaTulis(tabA, '__ujian_A5')
  ok('token hilang → tulis GAGAL (keadaan sebelum pulih)', !wRosak.ok)

  await loginAnon(tabA)                          // pulihSesiAnon: anon baru
  await ciptaSesiPP(tabA, 'GML')                 // tulis semula session doc
  ok('pemulihan dapat UID BARU', tabA.uid !== uidLama)
  const wPulih = await cubaTulis(tabA, '__ujian_A6')
  sampah.push('__ujian_A6')
  ok('★ selepas pulih → tulis BERJAYA semula', wPulih.ok, wPulih.kod)

  // ── Ujian 5: isolasi silang-tenant (rules) ─────────────────────────────────
  console.log('\nUJIAN 5 — isolasi silang-tenant')
  let silang = { ok: false }
  try {
    await setDoc(doc(tabA.db, 'tenants', 'skl_1783518371450', 'atlet', '__ujian_silang'), {
      nama: '__UJIAN_SILANG__',
    })
    silang = { ok: true }
  } catch (e) { silang = { ok: false, kod: e.code } }
  ok('★ sesi demo TIDAK boleh tulis ke tenant lain', !silang.ok, silang.ok ? 'BOCOR!' : '')

  // ── Ujian 6: sesi palsu ditolak ────────────────────────────────────────────
  console.log('\nUJIAN 6 — sesi palsu ditolak oleh rules')
  const tabX = await bukaTab('X_penyerang')
  await loginAnon(tabX)
  let palsu = { ok: false }
  try {
    await setDoc(doc(tabX.db, 'tenants', DEMO, 'sessions', tabX.uid), {
      role: 'pengurus', schoolId: DEMO, kodSekolah: 'TIDAK_WUJUD_999',
      createdAt: serverTimestamp(), expireAt: Timestamp.fromMillis(Date.now() + 3600e3),
    })
    palsu = { ok: true }
  } catch (e) { palsu = { ok: false, kod: e.code } }
  ok('sesi dengan kodSekolah palsu DITOLAK', !palsu.ok)

  let spoof = { ok: false }
  try {
    await setDoc(doc(tabX.db, 'tenants', DEMO, 'sessions', tabA.uid), {
      role: 'pengurus', schoolId: DEMO, kodSekolah: 'GML',
      createdAt: serverTimestamp(), expireAt: Timestamp.fromMillis(Date.now() + 3600e3),
    })
    spoof = { ok: true }
  } catch (e) { spoof = { ok: false, kod: e.code } }
  ok('cipta sesi atas UID orang lain (spoof) DITOLAK', !spoof.ok)

  const wX = await cubaTulis(tabX, '__ujian_X1')
  ok('anon tanpa sesi sah TIDAK boleh tulis', !wX.ok)

  // ── Bersih ─────────────────────────────────────────────────────────────────
  console.log('\nBERSIH — buang semua doc ujian')
  let dibuang = 0
  for (const id of [...new Set(sampah)]) {
    try { await deleteDoc(doc(tabA.db, 'tenants', DEMO, 'atlet', id)); dibuang++ } catch { /* mungkin tak wujud */ }
  }
  for (const t of [tabA, tabC, tabD]) {
    try { await deleteDoc(doc(t.db, 'tenants', DEMO, 'sessions', t.uid)) } catch { /* */ }
  }
  try { await deleteDoc(doc(tabX.db, 'tenants', DEMO, 'sessions', tabX.uid)) } catch { /* */ }
  console.log(`  🧹 ${dibuang} doc ujian dipadam`)

  // Sahkan bersih
  let baki = 0
  for (const id of [...new Set(sampah)]) {
    try { const s = await getDoc(doc(tabA.db, 'tenants', DEMO, 'atlet', id)); if (s.exists()) baki++ } catch { /* */ }
  }
  ok('tiada doc ujian tertinggal dalam demo', baki === 0, `baki: ${baki}`)

  for (const t of [tabA, tabB, tabC, tabD, tabX]) { try { await deleteApp(t.app) } catch { /* */ } }

  console.log(`\n${'═'.repeat(62)}`)
  console.log(`${fail === 0 ? '🎉 SEMUA LULUS' : '⚠️  ADA GAGAL'} — ${pass} lulus, ${fail} gagal`)
  if (fail) console.log('GAGAL:', gagalSenarai.join(' | '))
  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { console.error('❌ RALAT UJIAN:', e.code || e.message, e.stack?.split('\n')[1] || ''); process.exit(1) })
