/**
 * SEED DEMO TENANT — Tenant dummy untuk butang "Cuba Demo" di promo page
 *
 * Cipta:
 *   - slugIndex/demo → tenants/skl_demo
 *   - tenants/skl_demo (status active, expiry 2099 — takkan auto-suspend)
 *   - 6 sekolah fiktif + 1 kejohanan aktif + kategori + 8 acara
 *   - 4 acara SELESAI (heat final rasmi + keputusan penuh)
 *   - 4 acara AKAN DATANG (jadual esok)
 *   - medal_tally dikira dari keputusan
 *   - 4 rekod daerah aktif (tab Rekod ada isi)
 *   - tetapan/home (nama sistem + toggle tab ON)
 *
 * Data 100% fiktif — nama atlet & sekolah rekaan.
 * Idempotent: jalan semula = overwrite doc sama (tiada duplicate).
 *
 * Guna:
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... node seed-demo-tenant.cjs
 *   (mesti login sebagai SUPERADMIN — rules slugIndex/tenants perlukannya)
 */
require('dotenv').config({ path: '.env' })
const { initializeApp } = require('firebase/app')
const { getFirestore, doc, writeBatch, serverTimestamp, Timestamp } = require('firebase/firestore')
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth')
const readline = require('readline')

const app = initializeApp({
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
})
const db = getFirestore(app)
const auth = getAuth(app)

const SCHOOL_ID = 'skl_demo'
const SLUG      = 'demo'
const KEJ_ID    = 'KEJ-DEMO-2026'

function prompt(q) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(q, ans => { rl.close(); resolve(ans) })
  })
}

async function login() {
  const email    = process.env.ADMIN_EMAIL    || process.env.VITE_SUPERADMIN_EMAIL || await prompt('Email superadmin: ')
  const password = process.env.ADMIN_PASSWORD || await prompt('Password: ')
  await signInWithEmailAndPassword(auth, email, password)
  console.log(`✅ Login sebagai ${email}\n`)
}

// ── Data fiktif ───────────────────────────────────────────────────────────────
const SEKOLAH = [
  { kod: 'GML', nama: 'SK GEMILANG',      bib: 'GML' },
  { kod: 'HRJ', nama: 'SK HARAPAN JAYA',  bib: 'HRJ' },
  { kod: 'SAM', nama: 'SK SERI AMAN',     bib: 'SAM' },
  { kod: 'BKI', nama: 'SK BUKIT INDAH',   bib: 'BKI' },
  { kod: 'PEM', nama: 'SK PANTAI EMAS',   bib: 'PEM' },
  { kod: 'TMM', nama: 'SK TAMAN MESRA',   bib: 'TMM' },
]

const NAMA_L = ['AHMAD DANIAL', 'MUHAMMAD ARIFF', 'HAKIM ZUFAYRI', 'IRFAN HAZIQ', 'ADAM MIKAIL', 'FARIS IMRAN', 'LUQMAN NUR HAKIM', 'RAYYAN UMAR']
const NAMA_P = ['NUR AISYAH', 'SITI HUMAIRA', 'ALYA DAMIA', 'HANA SOFEA', 'PUTRI BALQIS', 'NUR IMAN QISTINA', 'AISH SOFIA', 'DHIA AMANI']

const hariIni = new Date()
const semalam = new Date(hariIni); semalam.setDate(hariIni.getDate() - 1)
const esok    = new Date(hariIni); esok.setDate(hariIni.getDate() + 1)
const fmtT = d => d.toISOString().slice(0, 10)

// [noAcara, namaAcara, jantina, kategoriKod, jenisAcara, selesai, masa, keputusanBase]
const ACARA = [
  [1, '100 Meter',        'L', 'L12', 'trek',          true,  '08:00', 13.42],
  [2, '100 Meter',        'P', 'P12', 'trek',          true,  '08:20', 14.15],
  [3, 'Lompat Jauh',      'L', 'L12', 'padang_lompat', true,  '09:00', 4.35],
  [4, 'Lontar Peluru',    'P', 'P12', 'padang_balin',  true,  '09:30', 7.82],
  [5, '200 Meter',        'L', 'L12', 'trek',          false, '08:00', null],
  [6, 'Lompat Tinggi',    'P', 'P12', 'padang_lompat', false, '08:30', null],
  [7, '4 x 100 Meter',    'L', 'L12', 'relay',         false, '10:00', null],
  [8, '4 x 200 Meter',    'P', 'P12', 'relay',         false, '10:30', null],
]

function janaPeserta(jantina, jenis, base) {
  const namaPool = jantina === 'L' ? NAMA_L : NAMA_P
  const isLarian = jenis === 'trek'
  // Larian: masa naik ikut kedudukan. Padang: jarak turun ikut kedudukan.
  return SEKOLAH.slice(0, 6).map((s, i) => {
    const kedudukan = i + 1
    const keputusan = isLarian
      ? +(base + i * 0.31 + (i % 2) * 0.08).toFixed(2)
      : +(base - i * 0.18 - (i % 2) * 0.05).toFixed(2)
    return {
      nama: namaPool[i], noBib: `${s.bib}${String(i + 1).padStart(2, '0')}`,
      kodSekolah: s.kod, namaSekolah: s.nama,
      lorong: [4, 5, 3, 6, 2, 7][i], giliran: i + 1,
      keputusan, kedudukan, status: 'selesai',
      rankDalamHeat: kedudukan, pecahRekod: null, samaiRekod: null,
    }
  })
}

async function main() {
  console.log('══ SEED DEMO TENANT — goldpodium.web.app/demo ══\n')
  await login()

  const batch = writeBatch(db)
  const T = p => doc(db, 'tenants', SCHOOL_ID, ...p)

  // Tenant + slugIndex
  batch.set(doc(db, 'tenants', SCHOOL_ID), {
    schoolId: SCHOOL_ID, namaSekolah: 'DEMO GOLD PODIUM', daerah: 'DEMO',
    namaAdmin: 'Demo Admin', slug: SLUG,
    tarikhMula: Timestamp.fromDate(new Date('2026-01-01')),
    tarikhExpiry: Timestamp.fromDate(new Date('2099-12-31')),
    status: 'active', createdAt: serverTimestamp(),
  })
  batch.set(doc(db, 'slugIndex', SLUG), { schoolId: SCHOOL_ID, aktif: true, createdAt: serverTimestamp() })

  // Tetapan home
  batch.set(T(['tetapan', 'home']), {
    namaSistem: 'KEJOHANAN OLAHRAGA MSSD DEMO',
    namaOrganisasi: 'MAJLIS SUKAN SEKOLAH DAERAH DEMO',
    showJadual: true, showKeputusan: true, showRekod: true,
  })

  // Sekolah
  SEKOLAH.forEach(s => {
    batch.set(T(['sekolah', s.kod]), { kodSekolah: s.kod, namaSekolah: s.nama, bibPrefix: s.bib })
  })

  // Kejohanan
  batch.set(T(['kejohanan', KEJ_ID]), {
    namaKejohanan: 'Kejohanan Olahraga MSSD Demo 2026',
    lokasi: 'Stadium Mini Bandar Demo',
    tarikhMula: Timestamp.fromDate(semalam), tarikhTamat: Timestamp.fromDate(esok),
    statusKejohanan: 'aktif', peringkat: 'daerah',
    bilanganKedudukan: 3, defaultLorong: 8, createdAt: serverTimestamp(),
  })

  // Kategori
  const K = [['L12', '12 Tahun Lelaki', 'L'], ['P12', '12 Tahun Perempuan', 'P']]
  K.forEach(([kod, nama, jan]) => {
    batch.set(T(['kejohanan', KEJ_ID, 'kategori', kod]), { kod, nama, jantina: jan, jenis: 'SR' })
  })

  // Acara + heat + medal contrib
  const tally = {} // kod → {emas, perak, gangsa, contribs:{}}
  SEKOLAH.forEach(s => { tally[s.kod] = { emas: 0, perak: 0, gangsa: 0, contribs: {} } })

  for (const [no, nama, jan, kat, jenis, selesai, masa, base] of ACARA) {
    const aceraId = `AC${String(no).padStart(3, '0')}`
    batch.set(T(['kejohanan', KEJ_ID, 'acara', aceraId]), {
      noAcara: String(no), namaAcara: nama, namaAcaraPendek: nama,
      jantina: jan, kategoriKod: kat, jenisAcara: jenis,
      peringkat: 'akhir', grantMedal: true,
      tarikhAcara: fmtT(selesai ? semalam : esok), masa,
      statusAcara: selesai ? 'selesai' : 'akan_datang',
      bilanganLorong: 8, createdAt: serverTimestamp(),
    })

    if (!selesai) continue

    const heatId = `HT${String(no).padStart(3, '0')}`
    const peserta = janaPeserta(jan, jenis, base)
    batch.set(T(['kejohanan', KEJ_ID, 'heat', heatId]), {
      aceraId, noHeat: 1, fasa: 'final', statusKeputusan: 'rasmi',
      namaAcara: nama, jantina: jan, kategoriKod: kat, jenisAcara: jenis,
      peserta, createdAt: serverTimestamp(),
    })

    // Medal tally (rank 1-3)
    peserta.slice(0, 3).forEach(p => {
      const jenisP = { 1: 'emas', 2: 'perak', 3: 'gangsa' }[p.kedudukan]
      tally[p.kodSekolah][jenisP] += 1
      tally[p.kodSekolah].contribs[`contrib_${heatId}_${p.noBib}`] = {
        kedudukan: p.kedudukan, nama: p.nama, noBib: p.noBib,
        namaAcara: nama, kategoriKod: kat, jantina: jan, jenisAcara: jenis,
      }
    })

    // Rekod daerah aktif (pemenang tahun "lepas" — sikit lebih baik dari keputusan demo)
    const keyNama = nama.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')
    const isLarian = jenis === 'trek'
    batch.set(T(['rekod', `${keyNama}_${jan}_${kat}_D`]), {
      namaAcara: nama, jantina: jan, kategoriKod: kat, peringkat: 'D',
      prestasi: isLarian ? +(base - 0.4).toFixed(2) : +(base + 0.6).toFixed(2),
      unit: isLarian ? 's' : 'm',
      namaAtlet: jan === 'L' ? 'HAIKAL RIZUAN' : 'NUR ALIA NATASHA',
      namaSekolah: 'SK CONTOH LAMA', tahun: 2025, tarikhRekod: '2025-07-15',
      statusRekod: 'aktif',
    })
  }

  // Tulis medal_tally
  SEKOLAH.forEach(s => {
    const t = tally[s.kod]
    batch.set(T(['kejohanan', KEJ_ID, 'medal_tally', s.kod]), {
      kodSekolah: s.kod, namaSekolah: s.nama,
      emas: t.emas, perak: t.perak, gangsa: t.gangsa,
      ...t.contribs,
    })
  })

  await batch.commit()
  console.log('✅ Selesai! Tenant demo tersedia di: https://goldpodium.web.app/demo')
  console.log(`   schoolId: ${SCHOOL_ID} · kejohanan: ${KEJ_ID}`)
  console.log('   4 acara selesai (keputusan rasmi) · 4 acara akan datang · 6 sekolah · 4 rekod D')
  process.exit(0)
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
