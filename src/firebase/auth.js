import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
} from 'firebase/auth'
import {
  doc, getDoc, getDocs, setDoc, updateDoc, serverTimestamp, Timestamp,
  collection, query, where, getCountFromServer,
} from 'firebase/firestore'
import { auth, db, SUPERADMIN_EMAIL, secondaryAuth, APP_URL } from './config'
import { alertFailedLogin, alertSuperadminNewDevice } from './telegram'
import { hashPin } from '../utils/hashPin'

// ── Session key ───────────────────────────────────────────────────────────────

export const SESSION_KEY = 'gp_session'

// ── Rate limiting ─────────────────────────────────────────────────────────────

const MAX_ATTEMPTS   = 5
const LOCK_MINUTES   = 30
const WINDOW_MINUTES = 15

async function checkRateLimit(key) {
  const ref  = doc(db, 'login_attempts', key)
  const snap = await getDoc(ref)
  if (!snap.exists()) return

  const data        = snap.data()
  const now         = Date.now()
  const lockedUntil = data.lockedUntil?.toMillis?.() || 0

  if (lockedUntil > now) {
    const mins = Math.ceil((lockedUntil - now) / 60000)
    throw Object.assign(
      new Error(`Account locked. Try again in ${mins} minutes.`),
      { code: 'auth/too-many-requests', minutesLeft: mins }
    )
  }

  if (lockedUntil > 0 && lockedUntil <= now) {
    await setDoc(ref, { attempts: 0, lockedUntil: null, lastAttempt: serverTimestamp() }, { merge: true })
  }
}

async function recordFailedAttempt(key, email = '') {
  const ref  = doc(db, 'login_attempts', key)
  const snap = await getDoc(ref)
  const data = snap.exists() ? snap.data() : {}
  const now  = Date.now()

  const lastMs       = data.lastAttempt?.toMillis?.() || 0
  const withinWindow = (now - lastMs) < WINDOW_MINUTES * 60000
  const prev         = withinWindow ? (data.attempts || 0) : 0
  const next         = prev + 1

  await setDoc(ref, {
    attempts:    next,
    lastAttempt: serverTimestamp(),
    email:       email,
    lockedUntil: next >= MAX_ATTEMPTS
      ? Timestamp.fromMillis(now + LOCK_MINUTES * 60000)
      : null,
  }, { merge: true })

  // Alert Telegram bila sampai had
  if (next >= MAX_ATTEMPTS && email) {
    alertFailedLogin(email)
    // Log ke security collection
    try {
      await setDoc(doc(db, 'security', 'logs'), {
        failedLogins: { [email]: { count: next, lastAttempt: serverTimestamp() } }
      }, { merge: true })
    } catch { /* bukan kritikal */ }
  }

  if (next >= MAX_ATTEMPTS) {
    throw Object.assign(
      new Error(`Too many failed attempts. Account locked for ${LOCK_MINUTES} minutes.`),
      { code: 'auth/too-many-requests', minutesLeft: LOCK_MINUTES }
    )
  }
}

async function clearAttempts(key) {
  try {
    await setDoc(doc(db, 'login_attempts', key), {
      attempts: 0, lockedUntil: null, lastAttempt: serverTimestamp()
    }, { merge: true })
  } catch { /* bukan kritikal */ }
}

export async function getLockStatus(email) {
  try {
    const ref  = doc(db, 'login_attempts', `email_${email}`)
    const snap = await getDoc(ref)
    if (!snap.exists()) return { locked: false, minutesLeft: 0 }

    const data        = snap.data()
    const lockedUntil = data.lockedUntil?.toMillis?.() || 0
    const now         = Date.now()

    if (lockedUntil > now) {
      return { locked: true, minutesLeft: Math.ceil((lockedUntil - now) / 60000), lockedUntil }
    }
    return { locked: false, minutesLeft: 0 }
  } catch {
    return { locked: false, minutesLeft: 0 }
  }
}

// ── Login — Email + Password (Firebase Auth) ──────────────────────────────────

export async function loginWithEmail(email, password) {
  const emailClean = email.trim().toLowerCase()
  const attemptKey = `email_${emailClean}`

  await checkRateLimit(attemptKey)

  let cred
  try {
    cred = await signInWithEmailAndPassword(auth, emailClean, password)
  } catch (err) {
    await recordFailedAttempt(attemptKey, emailClean)
    throw err
  }

  // Baca role dari Firestore
  const userSnap = await getDoc(doc(db, 'users', cred.user.uid))
  if (!userSnap.exists()) {
    // First-run superadmin: rekod Firestore belum wujud — redirect ke setup
    if (SUPERADMIN_EMAIL && emailClean === SUPERADMIN_EMAIL.toLowerCase()) {
      const session = {
        uid:      cred.user.uid,
        email:    emailClean,
        name:     '',
        role:     'pending_setup',
        schoolId: '',
        isAktif:  true,
      }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
      return session
    }
    await firebaseSignOut(auth)
    throw Object.assign(new Error('User record not found.'), { code: 'auth/user-not-found' })
  }

  const userData = userSnap.data()

  if (userData.isAktif === false) {
    await firebaseSignOut(auth)
    throw Object.assign(new Error('Account is inactive. Contact admin.'), { code: 'auth/user-disabled' })
  }

  // Semak expiry langganan (admin sahaja, superadmin tidak kena had)
  if (userData.role === 'admin' && userData.schoolId) {
    try {
      const tenantSnap = await getDoc(doc(db, 'tenants', userData.schoolId))
      if (tenantSnap.exists()) {
        const tenant = tenantSnap.data()
        const expiry = tenant.tarikhExpiry?.toMillis?.() || 0
        if (expiry > 0 && expiry < Date.now()) {
          await firebaseSignOut(auth)
          throw Object.assign(
            new Error('Langganan sistem telah tamat. Sila hubungi Gold Podium untuk memperbaharui.'),
            { code: 'auth/account-expired' }
          )
        }
        if (tenant.status === 'suspended') {
          await firebaseSignOut(auth)
          throw Object.assign(
            new Error('Akaun sekolah telah digantung. Sila hubungi Gold Podium.'),
            { code: 'auth/account-suspended' }
          )
        }
      }
    } catch (err) {
      if (err.code === 'auth/account-expired' || err.code === 'auth/account-suspended') throw err
      // Firestore error — biarkan login teruskan
    }
  }

  // Semak superadmin — alert jika device baru
  if (userData.role === 'superadmin') {
    const lastDevice = userData.lastDevice || ''
    const thisDevice = navigator.userAgent.slice(0, 100)
    if (lastDevice && lastDevice !== thisDevice) {
      alertSuperadminNewDevice(emailClean)
    }
    // Simpan device semasa
    try {
      await updateDoc(doc(db, 'users', cred.user.uid), {
        lastDevice: thisDevice,
        lastLogin: serverTimestamp(),
      })
    } catch { /* bukan kritikal */ }
  }

  await clearAttempts(attemptKey)

  const session = {
    uid:                cred.user.uid,
    email:              cred.user.email || emailClean,
    name:               cred.user.displayName || '',
    role:               userData.role,
    schoolId:           userData.schoolId || '',
    isAktif:            userData.isAktif !== false,
    mustChangePassword: userData.mustChangePassword === true,
  }

  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

// ── Logout ────────────────────────────────────────────────────────────────────

export async function logoutAll() {
  sessionStorage.removeItem(SESSION_KEY)
  try { await firebaseSignOut(auth) } catch { /* abaikan */ }
}

// ── Claim superadmin (first run) ──────────────────────────────────────────────

export async function claimSuperadmin(uid, email, name) {
  const snap = await getCountFromServer(
    query(collection(db, 'users'), where('role', '==', 'superadmin'))
  )
  if (snap.data().count > 0) throw new Error('Superadmin already exists.')

  // Sahkan email betul — kena match VITE_SUPERADMIN_EMAIL
  if (SUPERADMIN_EMAIL && email.toLowerCase() !== SUPERADMIN_EMAIL.toLowerCase()) {
    throw new Error('This email is not authorized as superadmin.')
  }

  const data = {
    uid, email, name: name || email,
    role: 'superadmin',
    schoolId: '',
    isAktif: true,
    createdAt: serverTimestamp(),
  }
  await setDoc(doc(db, 'users', uid), data)
  return data
}

// ── Generate password sementara ───────────────────────────────────────────────

export function generateTempPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let pass = ''
  for (let i = 0; i < 10; i++) {
    pass += chars[Math.floor(Math.random() * chars.length)]
  }
  return `GP-${pass}`
}

// ── Superadmin create akaun admin sekolah ────────────────────────────────────

// Jana slug dari nama sekolah (cth: "SK Astana" → "sk-astana")
function janaSlug(nama) {
  return nama
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')   // buang aksara khas
    .replace(/\s+/g, '-')        // spasi → tanda sempang
    .replace(/-+/g, '-')         // double sempang → satu
    .replace(/^-|-$/g, '')       // buang sempang tepi
    .slice(0, 30)                 // had 30 aksara
}

// Semak jika slug sudah digunakan — doc ID = slug, getDoc lebih cepat
async function slugUnik(slug) {
  const snap = await getDoc(doc(db, 'slugIndex', slug))
  if (!snap.exists()) return slug

  for (let i = 2; i <= 99; i++) {
    const percubaan = `${slug}-${i}`
    const s = await getDoc(doc(db, 'slugIndex', percubaan))
    if (!s.exists()) return percubaan
  }
  return `${slug}-${Date.now()}`
}

export async function createAdminAccount({ namaSekolah, emelAdmin, namaAdmin, daerah, tarikhMula, tarikhExpiry, slugCustom }) {
  const emailClean = emelAdmin.trim().toLowerCase()

  // Jana schoolId unik
  const schoolId = `skl_${Date.now()}`

  // Jana slug unik
  const slugAsas = slugCustom ? janaSlug(slugCustom) : janaSlug(namaSekolah)
  const slug = await slugUnik(slugAsas)

  // Jana password sementara
  const tempPassword = generateTempPassword()

  const mula   = tarikhMula   ? new Date(tarikhMula)   : new Date()
  const expiry = tarikhExpiry ? new Date(tarikhExpiry) : (() => { const d = new Date(mula); d.setFullYear(d.getFullYear() + 1); return d })()

  // Cipta Firebase Auth user guna secondaryAuth (superadmin tidak log keluar)
  let cred
  try {
    cred = await createUserWithEmailAndPassword(secondaryAuth, emailClean, tempPassword)
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      throw new Error('Emel ini sudah didaftarkan. Guna emel lain.')
    }
    throw err
  }

  const uid = cred.user.uid

  // Log keluar dari secondaryAuth (jaga keselamatan)
  await firebaseSignOut(secondaryAuth)

  // Simpan dalam Firestore — users doc
  await setDoc(doc(db, 'users', uid), {
    uid,
    role:               'admin',
    schoolId,
    isAktif:            true,
    mustChangePassword: true,
    createdAt:          serverTimestamp(),
  })

  // Simpan dalam Firestore — tenants doc
  await setDoc(doc(db, 'tenants', schoolId), {
    schoolId,
    namaSekolah:  namaSekolah.trim(),
    daerah:       daerah.trim(),
    namaAdmin:    namaAdmin.trim(),
    slug,
    tarikhMula:   Timestamp.fromDate(mula),
    tarikhExpiry: Timestamp.fromDate(expiry),
    status:       'active',
    createdAt:    serverTimestamp(),
  })

  // Data sensitif admin — subcollection private (rules: superadmin sahaja)
  await setDoc(doc(db, 'tenants', schoolId, '_private', 'admin'), {
    adminUid:  uid,
    emelAdmin: emailClean,
    createdAt: serverTimestamp(),
  })

  // slugIndex — pointer sahaja, tiada data redundant
  await setDoc(doc(db, 'slugIndex', slug), {
    schoolId,
    aktif:     true,
    createdAt: serverTimestamp(),
  })

  return {
    uid,
    schoolId,
    slug,
    email:        emailClean,
    tempPassword,
    loginUrl:     `${APP_URL}/${slug}`,
    tarikhMula:   mula.toLocaleDateString('ms-MY'),
    tarikhExpiry: expiry.toLocaleDateString('ms-MY'),
  }
}

// ── Login Pencatat — kodAkses + PIN (tanpa Firebase Auth) ────────────────────

export async function loginPencatat(slug, kodAkses, pin) {
  // 1. Resolve slug → schoolId
  const slugSnap = await getDoc(doc(db, 'slugIndex', slug))
  if (!slugSnap.exists() || !slugSnap.data().aktif) {
    throw new Error('Kod sekolah tidak dijumpai. Semak ejaan dengan pentadbir.')
  }
  const schoolId = slugSnap.data().schoolId

  // 2. Rate limit per kodAkses
  const attemptKey = `pencatat_${schoolId}_${kodAkses}`
  await checkRateLimit(attemptKey)

  // 3. Cari user dalam tenant
  const usersSnap = await getDocs(
    query(collection(db, 'tenants', schoolId, 'users'), where('kodAkses', '==', kodAkses))
  )
  if (usersSnap.empty) {
    await recordFailedAttempt(attemptKey)
    throw new Error('Kod akses tidak dijumpai.')
  }

  const userDoc  = usersSnap.docs[0]
  const userData = userDoc.data()

  if (userData.isAktif === false) {
    throw new Error('Akaun ini tidak aktif. Hubungi pentadbir sekolah.')
  }

  // 4. Verify PIN
  const pinHash = await hashPin(pin)
  if (pinHash !== userData.pinHash) {
    await recordFailedAttempt(attemptKey)
    throw new Error('PIN tidak betul.')
  }

  await clearAttempts(attemptKey)

  // 5. Bina session (tiada Firebase Auth uid — guna doc id sebagai uid)
  return {
    uid:        userDoc.id,
    email:      userData.email || '',
    name:       userData.nama  || kodAkses,
    role:       userData.role  || 'pencatat',
    schoolId,
    schoolSlug: slug,
    kodAkses,
    isAktif:    true,
    _savedAt:   Date.now(),
  }
}

// ── Login Pengurus Pasukan (kodSekolah + PIN, tanpa Firebase Auth) ─────────────

export async function loginPengurus(schoolId, kodSekolah, pin, schoolSlug = '') {
  const kodBersih = kodSekolah.trim().toUpperCase()

  // 1. Rate limit
  const attemptKey = `pengurus_${schoolId}_${kodBersih}`
  await checkRateLimit(attemptKey)

  // 2. Cari sekolah doc
  const sekolahSnap = await getDoc(doc(db, 'tenants', schoolId, 'sekolah', kodBersih))
  if (!sekolahSnap.exists()) {
    await recordFailedAttempt(attemptKey)
    throw new Error('Kod sekolah tidak dijumpai.')
  }

  const sekolahData = sekolahSnap.data()

  if (sekolahData.isAktif === false) {
    throw new Error('Sekolah ini tidak aktif. Hubungi pentadbir.')
  }

  // 3. Verify PIN
  if (!sekolahData.pinHash) {
    throw new Error('PIN belum ditetapkan. Hubungi pentadbir sekolah.')
  }

  const pinHash = await hashPin(pin)
  if (pinHash !== sekolahData.pinHash) {
    await recordFailedAttempt(attemptKey)
    throw new Error('PIN tidak betul.')
  }

  await clearAttempts(attemptKey)

  // schoolSlug disimpan dalam session — digunakan oleh RequirePengurus untuk
  // semak URL slug match session sekolah (cegah konflik multi-tenant)
  return {
    uid:         `pengurus_${schoolId}_${kodBersih}`,
    email:       sekolahData.email || '',
    name:        sekolahData.namaSekolah || kodBersih,
    role:        'pengurus',
    schoolId,
    schoolSlug:  schoolSlug.toLowerCase().trim(),
    kodSekolah:  kodBersih,
    namaSekolah: sekolahData.namaSekolah || kodBersih,
    isAktif:     true,
    _savedAt:    Date.now(),
  }
}

// ── Tukar password (first login) ──────────────────────────────────────────────

export async function hantarResetPassword(email) {
  await sendPasswordResetEmail(auth, email.trim().toLowerCase())
}

export async function changePasswordFirstTime(currentPassword, newPassword) {
  const user = auth.currentUser
  if (!user) throw new Error('Tiada sesi aktif.')

  if (newPassword.length < 8) throw new Error('Password baru mesti sekurang-kurangnya 8 aksara.')
  if (newPassword === currentPassword) throw new Error('Password baru mesti berbeza dari password lama.')

  // Reauth dulu sebelum tukar password
  const cred = EmailAuthProvider.credential(user.email, currentPassword)
  await reauthenticateWithCredential(user, cred)

  // Tukar password dalam Firebase Auth
  await updatePassword(user, newPassword)

  // Kemaskini Firestore — padam flag mustChangePassword
  await updateDoc(doc(db, 'users', user.uid), {
    mustChangePassword: false,
    passwordChangedAt:  serverTimestamp(),
  })
}
