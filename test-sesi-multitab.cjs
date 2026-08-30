/**
 * test-sesi-multitab.cjs — Ujian isolasi sesi banyak tab / banyak tenant.
 *
 * Membuktikan fix clash bila admin + pencatat + PP (dan tenant a/b/c/d/e)
 * log masuk SERENTAK dalam browser yang sama.
 *
 * Punca asal: Firebase Auth guna browserLocalPersistence (localStorage) —
 * SATU identiti untuk seluruh browser — manakala sesi app (`gp_session`)
 * disimpan dalam sessionStorage (per-tab). Login kedua menimpa token login
 * pertama secara senyap: UI tab lama kekal nampak "login" tetapi setiap tulis
 * Firestore gagal `permission-denied`.
 *
 * Ujian ini memodelkan kedua-dua mod storan dan mengesahkan:
 *   • mod LAMA (localStorage kongsi)  → clash BERLAKU (ujian regresi)
 *   • mod BARU (sessionStorage/tab)   → semua tab kekal sah serentak
 * serta pemulihan sesi (pulihSesiAnon) untuk tab pendua/token luput.
 *
 * Tiada Firebase sebenar — deterministik, tiada rangkaian.
 * Jalan: node test-sesi-multitab.cjs
 */

let pass = 0, fail = 0
function ok(name, cond) {
  if (cond) { pass++; console.log('✅', name) }
  else { fail++; console.log('❌', name) }
}

// ── Model browser ringkas ─────────────────────────────────────────────────────
// Satu "browser" ada localStorage dikongsi + banyak tab (sessionStorage sendiri).
function buatBrowser(mod /* 'local' | 'session' */) {
  const localStore = {}          // dikongsi semua tab
  let kiraUid = 0
  const tabs = []

  function buatTab(nama) {
    const sessionStore = {}      // milik tab ini sahaja
    const tab = {
      nama,
      sessionStore,
      // Token Firebase: dalam mod 'local' ia dikongsi; 'session' ia per-tab.
      get token() {
        return mod === 'local' ? localStore.fbToken : sessionStore.fbToken
      },
      set token(v) {
        if (mod === 'local') localStore.fbToken = v
        else sessionStore.fbToken = v
      },

      // Login yang menghasilkan identiti Firebase baharu (anon atau email).
      login(role, schoolId, { anon = true } = {}) {
        const uid = `${anon ? 'anon' : 'user'}_${++kiraUid}`
        tab.token = { uid, isAnonymous: anon }
        sessionStore.gp_session = { role, schoolId, anonUid: anon ? uid : undefined, uid }
        return uid
      },

      // Tulis Firestore lulus HANYA bila token semasa selari dengan sesi tab.
      // Ini meniru rules: `request.auth.uid == anonUid` (pencatat/PP) atau
      // token email milik user yang sama (admin).
      bolehTulis() {
        const s = sessionStore.gp_session
        if (!s) return false
        const t = tab.token
        if (!t) return false
        return s.anonUid ? t.uid === s.anonUid : t.uid === s.uid
      },
    }
    tabs.push(tab)
    return tab
  }

  return { buatTab, tabs }
}

// ── 1. Regresi: mod LAMA (localStorage) memang clash ──────────────────────────
console.log('\n── Mod LAMA: browserLocalPersistence (punca clash) ──')
{
  const b = buatBrowser('local')
  const tabAdmin    = b.buatTab('admin A')
  const tabPencatat = b.buatTab('pencatat A')

  tabAdmin.login('admin', 'skl_a', { anon: false })
  ok('LAMA: admin boleh tulis selepas login', tabAdmin.bolehTulis())

  tabPencatat.login('pencatat', 'skl_a')
  ok('LAMA: pencatat boleh tulis selepas login', tabPencatat.bolehTulis())
  ok('LAMA: admin JADI LUMPUH selepas pencatat login (bug asal)', !tabAdmin.bolehTulis())
}

// ── 2. Mod BARU: sessionStorage per-tab ───────────────────────────────────────
console.log('\n── Mod BARU: browserSessionPersistence (fix) ──')
{
  const b = buatBrowser('session')
  const tabAdmin    = b.buatTab('admin A')
  const tabPencatat = b.buatTab('pencatat A')
  const tabPP       = b.buatTab('PP A')

  tabAdmin.login('admin', 'skl_a', { anon: false })
  tabPencatat.login('pencatat', 'skl_a')
  tabPP.login('pengurus', 'skl_a')

  ok('BARU: admin A kekal sah', tabAdmin.bolehTulis())
  ok('BARU: pencatat A kekal sah', tabPencatat.bolehTulis())
  ok('BARU: PP A kekal sah', tabPP.bolehTulis())
  ok('BARU: 3 peranan tenant SAMA serentak — tiada clash',
     tabAdmin.bolehTulis() && tabPencatat.bolehTulis() && tabPP.bolehTulis())
}

// ── 3. Banyak tenant serentak (slug a/b/c/d/e) ────────────────────────────────
console.log('\n── Banyak tenant serentak ──')
{
  const b = buatBrowser('session')
  const tenants = ['skl_a', 'skl_b', 'skl_c', 'skl_d', 'skl_e']
  const dibuka = tenants.map((t, i) => {
    const tab = b.buatTab(`PP ${t}`)
    tab.login(i % 2 ? 'pencatat' : 'pengurus', t)
    return tab
  })
  ok('5 tenant (a/b/c/d/e) log masuk serentak — semua sah',
     dibuka.every(t => t.bolehTulis()))
  ok('setiap tab pegang schoolId sendiri (tiada silang tenant)',
     dibuka.every((t, i) => t.sessionStore.gp_session.schoolId === tenants[i]))
}

// ── 4. Logout satu tab tidak membunuh tab lain ────────────────────────────────
console.log('\n── Logout berskop ──')
{
  const b = buatBrowser('session')
  const tabA = b.buatTab('PP A'); tabA.login('pengurus', 'skl_a')
  const tabB = b.buatTab('PP B'); tabB.login('pengurus', 'skl_b')

  // logoutAll(): padam sesi tab ini + signOut (skop tab dalam mod session)
  tabA.token = undefined
  delete tabA.sessionStore.gp_session

  ok('logout tab A → tab A tidak lagi sah', !tabA.bolehTulis())
  ok('logout tab A → tab B TIDAK terjejas', tabB.bolehTulis())
}

// Bandingkan dengan mod lama: logout membunuh semua
{
  const b = buatBrowser('local')
  const tabA = b.buatTab('PP A'); tabA.login('pengurus', 'skl_a')
  const tabB = b.buatTab('PP B'); tabB.login('pengurus', 'skl_b')
  tabA.token = undefined   // signOut global dalam mod localStorage
  ok('LAMA: logout satu tab membunuh tab lain (bug asal)', !tabB.bolehTulis())
}

// ── 5. Pemulihan sesi: tab pendua / token luput ───────────────────────────────
// useSessionGuard memanggil pulihSesiAnon bila token tiada atau tak padan.
console.log('\n── Pemulihan sesi (useSessionGuard → pulihSesiAnon) ──')
{
  const b = buatBrowser('session')
  const tab = b.buatTab('pencatat A')
  tab.login('pencatat', 'skl_a')
  const uidAsal = tab.sessionStore.gp_session.anonUid

  // Simulasi token luput / tab didua-kan: sessionStorage disalin, token TIDAK.
  tab.token = undefined
  ok('token hilang → tulis GAGAL sebelum pulih', !tab.bolehTulis())

  // pulihSesiAnon: sign-in anon baharu + tulis session doc + selaraskan gp_session
  function pulihSesiAnon(t) {
    const s = t.sessionStore.gp_session
    if (!s?.schoolId || !s?.role) throw new Error('Sesi tidak lengkap.')
    const uidBaru = `anon_pulih_${Date.now()}`
    t.token = { uid: uidBaru, isAnonymous: true }
    s.anonUid = uidBaru              // WAJIB — kalau tidak, logout padam doc lama
    return uidBaru
  }

  const uidBaru = pulihSesiAnon(tab)
  ok('selepas pulih → tulis BERJAYA semula', tab.bolehTulis())
  ok('anonUid dikemas kini dalam gp_session', tab.sessionStore.gp_session.anonUid === uidBaru)
  ok('anonUid baharu berbeza dari yang asal', uidBaru !== uidAsal)

  // Sesi tidak lengkap → mesti gagal, bukan cipta sesi hantu
  const tabRosak = b.buatTab('rosak')
  tabRosak.sessionStore.gp_session = { role: 'pencatat' }   // tiada schoolId
  let dilempar = false
  try { pulihSesiAnon(tabRosak) } catch { dilempar = true }
  ok('sesi tidak lengkap → pulih DITOLAK', dilempar)
}

// ── 6. Isolasi silang-tenant kekal dikuatkuasakan ─────────────────────────────
console.log('\n── Isolasi silang-tenant ──')
{
  const b = buatBrowser('session')
  const tabA = b.buatTab('PP A'); tabA.login('pengurus', 'skl_a')
  const tabB = b.buatTab('PP B'); tabB.login('pengurus', 'skl_b')

  // Guard RequirePengurus: slug URL mesti padan schoolSlug sesi.
  function guardLulus(tab, slugUrl) {
    return tab.sessionStore.gp_session.schoolId === `skl_${slugUrl}`
  }
  ok('PP A buka URL tenant A → lulus', guardLulus(tabA, 'a'))
  ok('PP A buka URL tenant B → DISEKAT', !guardLulus(tabA, 'b'))
  ok('token tab A tidak boleh dipakai oleh sesi tab B',
     tabA.token.uid !== tabB.token.uid)
}

console.log(`\n${fail === 0 ? '🎉' : '⚠️'}  ${pass} lulus, ${fail} gagal`)
process.exit(fail === 0 ? 0 : 1)
