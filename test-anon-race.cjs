/**
 * test-anon-race.cjs — Unit test anti-race untuk login PP/pencatat.
 *
 * Membuktikan fix "Missing or insufficient permissions" (tak konsisten):
 * resolveAnonAuth() mesti (A) sign-out sesi bukan-anon dulu, dan (B) tunggu
 * auth.currentUser selari dengan uid anon SEBELUM pulangkan — supaya write
 * session doc guna token yang betul.
 *
 * Tiada Firebase sebenar — semua kesan-sampingan auth di-mock. Deterministik.
 *
 * Jalan: node test-anon-race.cjs
 *
 * Nota: import fungsi tulen dari src/firebase/auth.js. Fail itu import config
 * Firebase (browser env), jadi kita ekstrak SUMBER resolveAnonAuth dan eval
 * dalam sandbox terpencil — elak muatkan seluruh modul (yang perlukan Vite/DOM).
 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')

// ── Ekstrak fungsi resolveAnonAuth dari sumber (tanpa muat modul penuh) ────────
const src = fs.readFileSync(path.join(__dirname, 'src/firebase/auth.js'), 'utf8')
const start = src.indexOf('export async function resolveAnonAuth(deps) {')
if (start === -1) throw new Error('resolveAnonAuth tidak dijumpai dalam auth.js')
// Cari penutup fungsi: baris '}' pertama pada kolum 0 selepas start
const after = src.slice(start)
const endRel = after.indexOf('\n}\n')
if (endRel === -1) throw new Error('Penghujung resolveAnonAuth tidak dijumpai')
let body = after.slice(0, endRel + 2)
body = body.replace('export async function', 'async function')

const sandbox = { setTimeout, clearTimeout, Promise, console }
vm.createContext(sandbox)
vm.runInContext(body + '\nthis.resolveAnonAuth = resolveAnonAuth;', sandbox)
const resolveAnonAuth = sandbox.resolveAnonAuth

// ── Rangka ujian ringkas ──────────────────────────────────────────────────────
let pass = 0, fail = 0
function ok(name, cond) {
  if (cond) { pass++; console.log('✅', name) }
  else { fail++; console.log('❌', name) }
}

// Pembina mock auth yang boleh dikawal
function makeAuth(initialUser) {
  return {
    currentUser: initialUser || null,
    _listeners: [],
    _signOutCalls: 0,
    _signInCalls: 0,
    onAuthChanged(cb) {
      this._listeners.push(cb)
      return () => { this._listeners = this._listeners.filter(l => l !== cb) }
    },
    _emit(user) {
      this.currentUser = user
      this._listeners.slice().forEach(l => l(user))
    },
  }
}
function anonUser(uid)    { return { uid, isAnonymous: true,  getIdToken: async () => 'tok_' + uid } }
function adminUser(uid)   { return { uid, isAnonymous: false, getIdToken: async () => 'tok_' + uid } }

function depsFor(mock, { signInEmits = true, lagBeforeEmit = 0 } = {}) {
  return {
    getCurrentUser: () => mock.currentUser,
    signOut: async () => { mock._signOutCalls++; mock.currentUser = null },
    signInAnon: async () => {
      mock._signInCalls++
      const u = anonUser('anon_' + mock._signInCalls)
      if (signInEmits) {
        if (lagBeforeEmit > 0) {
          // Simulasi race: currentUser BELUM ter-set serta-merta selepas signIn.
          setTimeout(() => mock._emit(u), lagBeforeEmit)
        } else {
          mock.currentUser = u
        }
      }
      return { user: u }
    },
    onAuthChanged: (cb) => mock.onAuthChanged(cb),
    timeoutMs: 500,
  }
}

;(async () => {
  console.log('=== Test anti-race login PP/pencatat (resolveAnonAuth) ===\n')

  // ─── Test 1: Punca A — sesi Admin non-anon dalam tab kena SIGN OUT dulu ───────
  {
    const mock = makeAuth(adminUser('admin_XYZ'))
    const uid = await resolveAnonAuth(depsFor(mock))
    ok('A: sesi Admin non-anon di-sign-out dulu', mock._signOutCalls === 1)
    ok('A: uid dipulangkan ialah uid ANON (bukan warisi admin)', uid.startsWith('anon_') && uid !== 'admin_XYZ')
    ok('A: currentUser akhir = uid anon yang sama', mock.currentUser.uid === uid)
  }

  // ─── Test 2: Tiada sesi sedia ada — TAK perlu sign out ────────────────────────
  {
    const mock = makeAuth(null)
    const uid = await resolveAnonAuth(depsFor(mock))
    ok('B: tiada sesi lama → tiada sign-out', mock._signOutCalls === 0)
    ok('B: uid anon dipulangkan', uid.startsWith('anon_'))
  }

  // ─── Test 3: Sesi anon SEDIA ADA (cth login kedua) — TAK sign out ─────────────
  {
    const mock = makeAuth(anonUser('anon_old'))
    const uid = await resolveAnonAuth(depsFor(mock))
    ok('C: sesi anon sedia ada tidak di-sign-out', mock._signOutCalls === 0)
    ok('C: sign in anon baru tetap dipanggil', mock._signInCalls === 1)
  }

  // ─── Test 4: Punca B — currentUser LAG selepas signIn → mesti TUNGGU emit ─────
  {
    const mock = makeAuth(null)
    let resolvedBeforeEmit = false
    const deps = depsFor(mock, { lagBeforeEmit: 120 }) // currentUser lambat 120ms
    const p = resolveAnonAuth(deps).then(uid => {
      // Bila resolve, currentUser MESTI sudah selari (emit sudah berlaku)
      resolvedBeforeEmit = mock.currentUser?.uid !== uid
      return uid
    })
    const uid = await p
    ok('D: tunggu onAuthChanged sebelum pulang (currentUser selari)', resolvedBeforeEmit === false)
    ok('D: uid akhir = currentUser uid', mock.currentUser.uid === uid)
  }

  // ─── Test 5: Fallback timeout — emit TAK PERNAH datang → tak gantung selamanya ─
  {
    const mock = makeAuth(null)
    const deps = depsFor(mock, { signInEmits: false }) // currentUser tak pernah update
    const t0 = Date.now()
    const uid = await resolveAnonAuth(deps)             // patut selesai ~500ms (timeout)
    const dt = Date.now() - t0
    ok('E: fallback timeout — tidak gantung selamanya', dt < 2000)
    ok('E: uid tetap dipulangkan walau currentUser tak selari', uid.startsWith('anon_'))
  }

  console.log(`\n=== ${pass}/${pass + fail} passed ===`)
  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { console.error('RALAT TEST:', e); process.exit(1) })
