/**
 * BACKFILL MEDAL TALLY — Nuclear Rebuild
 *
 * Rebuild medal_tally + mata_olahragawan dari scratch berdasarkan heat rasmi.
 *
 * Skop: satu kejohanan sahaja (KOAM-2026-CHDO)
 * Filter heat:
 *   - fasa = 'final' atau 'terus_final' sahaja (skip saringan)
 *   - statusKeputusan = 'rasmi' atau 'diterima'
 *   - saringan_qf/saringan_sf/separuh_akhir SKIP (bukan grant medal)
 *
 * Logic:
 *   1. DRY RUN dulu — papar apa yang akan dibuat
 *   2. Confirm dari user
 *   3. Padam semua medal_tally + mata_olahragawan existing (kecuali fields yang tak berkaitan)
 *   4. Loop heat rasmi → untuk peserta rank 1-5, cipta contrib + increment counter
 *   5. Rebuild mata_olahragawan sekali gus
 *
 * Guna:
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... node backfill-medal-tally.cjs
 *
 * Add --confirm untuk skip prompt (auto-yes semua).
 */
require('dotenv').config({ path: '.env' })
const { initializeApp } = require('firebase/app')
const { getFirestore, collection, getDocs, getDoc, doc, deleteDoc, setDoc, writeBatch, serverTimestamp } = require('firebase/firestore')
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth')
const readline = require('readline')

const app = initializeApp({
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
})
const db = getFirestore(app)
const auth = getAuth(app)

const SCHOOL_ID = 'skl_1782634121891'
const KEJ_ID    = 'KOAM-2026-CHDO'
const AUTO_YES  = process.argv.includes('--confirm')

const NAMA_PINGAT = { 1: 'emas', 2: 'perak', 3: 'gangsa' }

function prompt(q) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(q, ans => { rl.close(); resolve(ans) })
  })
}

async function askYes(q) {
  if (AUTO_YES) return true
  const ans = await prompt(q + ' (y/N): ')
  return ans.toLowerCase() === 'y' || ans.toLowerCase() === 'yes'
}

async function login() {
  const email    = process.env.ADMIN_EMAIL    || await prompt('Email admin: ')
  const password = process.env.ADMIN_PASSWORD || await prompt('Password: ')
  await signInWithEmailAndPassword(auth, email, password)
  console.log(`✅ Login sebagai ${email}\n`)
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  BACKFILL MEDAL TALLY — Nuclear Rebuild                      ║')
  console.log('║  Kejohanan: ' + KEJ_ID.padEnd(50) + '║')
  console.log('╚══════════════════════════════════════════════════════════════╝\n')

  await login()

  // 1. Load acara — untuk resolve namaAcara, kategoriKod, jantina
  console.log('📚 Load acara...')
  const acaraSnap = await getDocs(collection(db, 'tenants', SCHOOL_ID, 'kejohanan', KEJ_ID, 'acara'))
  const acaraMap = {}
  acaraSnap.docs.forEach(d => { acaraMap[d.id] = d.data() })
  console.log(`   ${acaraSnap.docs.length} acara loaded\n`)

  // 2. Load kejohanan doc untuk peringkat + mataPingat
  const kejSnap = await getDoc(doc(db, 'tenants', SCHOOL_ID, 'kejohanan', KEJ_ID))
  const kejData = kejSnap.exists() ? kejSnap.data() : {}
  const mp = kejData.mataPingat || {}
  const mataPingat = {
    1: Number(mp[1] ?? mp['1'] ?? 5),
    2: Number(mp[2] ?? mp['2'] ?? 3),
    3: Number(mp[3] ?? mp['3'] ?? 2),
    4: Number(mp[4] ?? mp['4'] ?? 1),
  }

  // 3. Load semua heat — filter final + rasmi
  console.log('📚 Load heat...')
  const heatSnap = await getDocs(collection(db, 'tenants', SCHOOL_ID, 'kejohanan', KEJ_ID, 'heat'))
  const validHeats = heatSnap.docs
    .map(d => ({ heatId: d.id, ...d.data() }))
    .filter(h => {
      const isFinalFasa = ['final', 'terus_final'].includes(h.fasa)
      const isRasmi     = ['rasmi', 'diterima'].includes(h.statusKeputusan)
      return isFinalFasa && isRasmi
    })
  console.log(`   ${heatSnap.docs.length} heat total, ${validHeats.length} valid (final + rasmi)\n`)

  // 4. Kira medal contribution baru
  const newTally = {} // kodSekolah → { emas, perak, gangsa, tempat4, tempat5, contribs: [{...}] }
  const newMata  = {} // noBib → { namaAtlet, jantina, kategoriKod, kodSekolah, namaSekolah, acaraDetail: [], jumlahMata, pingat_emas/perak/gangsa }

  let skippedSaringan = 0
  for (const h of validHeats) {
    const acara = acaraMap[h.aceraId]
    if (!acara) { console.warn(`   ⚠ heat ${h.heatId} aceraId ${h.aceraId} tak wujud dalam acara — skip`); continue }
    // Extra safety: saringan skip
    if (['saringan_qf', 'saringan_sf', 'separuh_akhir'].includes(acara.peringkat)) {
      skippedSaringan++
      continue
    }

    const isRelay = acara.jenisAcara === 'relay'
    const peserta = (h.peserta || [])
      .filter(p => p.rankDalamHeat && p.rankDalamHeat >= 1 && p.rankDalamHeat <= 5)
      .filter(p => !['DNS', 'DNF', 'DQ'].includes(p.status))

    for (const p of peserta) {
      const rank = Number(p.rankDalamHeat)
      const pingat = NAMA_PINGAT[rank] || null  // rank 4/5 = tempat4/tempat5 (bukan pingat)
      const isPingat = !!pingat
      const kod = p.kodSekolah
      if (!kod) continue

      // Medal tally
      if (!newTally[kod]) {
        newTally[kod] = {
          kodSekolah:  kod,
          namaSekolah: p.namaSekolah || kod,
          kejohananId: KEJ_ID,
          emas: 0, perak: 0, gangsa: 0, tempat4: 0, tempat5: 0,
          jumlahPingat: 0,
          contribs: {},
          katFields: {},
        }
      }
      const t = newTally[kod]
      if (rank === 1) t.emas++
      else if (rank === 2) t.perak++
      else if (rank === 3) t.gangsa++
      else if (rank === 4) t.tempat4++
      else if (rank === 5) t.tempat5++
      if (isPingat) t.jumlahPingat++

      // kat field
      const katKey = isRelay ? 'RELAY' : (acara.isTerbuka ? (p.kategoriKod || acara.kategoriKod || '') : (acara.kategoriKod || ''))
      const katField = `kat_${katKey}_${acara.jantina || ''}_${pingat || (rank === 4 ? 'tempat4' : 'tempat5')}`
      t.katFields[katField] = (t.katFields[katField] || 0) + 1

      // Contrib
      const contribKey = `contrib_${h.heatId}_${isRelay ? `${kod}_${p.pasukanRelay || 'A'}` : (p.noBib || p.lorong || rank)}`
      t.contribs[contribKey] = {
        pingat: pingat || (rank === 4 ? 'tempat4' : 'tempat5'),
        noBib: p.noBib || null,
        rank,
        kategoriKod: katKey,
        jantina: acara.jantina || '',
        isRelay,
        namaAcara: acara.namaAcara || '',
        namaAcaraPendek: acara.namaAcaraPendek || acara.namaAcara || '',
      }

      // Mata olahragawan (individu, rank 1-4)
      if (!isRelay && p.noBib && rank <= 4) {
        const mata = mataPingat[rank] || 0
        if (!newMata[p.noBib]) {
          newMata[p.noBib] = {
            noBib: p.noBib,
            namaAtlet: p.namaAtlet || '',
            kodSekolah: kod,
            namaSekolah: p.namaSekolah || kod,
            jantina: acara.jantina || '',
            kategoriKod: acara.isTerbuka ? (p.kategoriKod || acara.kategoriKod || '') : (acara.kategoriKod || ''),
            kejohananId: KEJ_ID,
            jumlahMata: 0,
            pingat_emas: 0, pingat_perak: 0, pingat_gangsa: 0, pingat_tempat4: 0,
            acaraDetails: {},
          }
        }
        const m = newMata[p.noBib]
        m.jumlahMata += mata
        const pingatKey = `pingat_${pingat || 'tempat4'}`
        m[pingatKey] = (m[pingatKey] || 0) + 1
        const acaraKey = `acaraDetail_${h.aceraId}`
        m.acaraDetails[acaraKey] = {
          aceraId: h.aceraId,
          namaAcara: acara.namaAcara,
          pingat: pingat || (rank === 4 ? 'tempat4' : ''),
          mata,
          rank,
          prestasi: p.keputusan ?? null,
          unit: ['padang_lompat', 'padang_balin'].includes(acara.jenisAcara) ? 'm' : 's',
        }
      }
    }
  }

  console.log(`\n=== SUMMARY BACKFILL ===`)
  console.log(`   Heat processed: ${validHeats.length} (skip ${skippedSaringan} saringan)`)
  console.log(`   Sekolah dengan pingat: ${Object.keys(newTally).length}`)
  console.log(`   Atlet dengan mata: ${Object.keys(newMata).length}\n`)

  console.log(`=== TOP 10 SEKOLAH (dari calc baru) ===`)
  const sorted = Object.values(newTally)
    .sort((a, b) => b.emas - a.emas || b.perak - a.perak || b.gangsa - a.gangsa)
    .slice(0, 10)
  sorted.forEach((t, i) => {
    console.log(`   ${i + 1}. ${t.kodSekolah}: E=${t.emas} P=${t.perak} G=${t.gangsa} T4=${t.tempat4} T5=${t.tempat5} (jumlah=${t.jumlahPingat})`)
  })

  const proceed = await askYes('\n⚠ Padam SEMUA medal_tally + mata_olahragawan existing untuk kejohanan ni, dan rebuild dari heat rasmi?')
  if (!proceed) { console.log('❌ Batalkan.'); return }

  // 5. Padam existing
  console.log('\n🗑  Padam existing medal_tally...')
  const existTally = await getDocs(collection(db, 'tenants', SCHOOL_ID, 'kejohanan', KEJ_ID, 'medal_tally'))
  for (const d of existTally.docs) {
    await deleteDoc(d.ref)
  }
  console.log(`   ${existTally.docs.length} tally docs padam`)

  console.log('🗑  Padam existing mata_olahragawan...')
  const existMata = await getDocs(collection(db, 'tenants', SCHOOL_ID, 'kejohanan', KEJ_ID, 'mata_olahragawan'))
  for (const d of existMata.docs) {
    await deleteDoc(d.ref)
  }
  console.log(`   ${existMata.docs.length} mata docs padam\n`)

  // 6. Tulis baru
  console.log('✍  Tulis medal_tally baru...')
  for (const t of Object.values(newTally)) {
    const tId = `${t.kodSekolah}_${KEJ_ID}`
    const data = {
      kodSekolah: t.kodSekolah,
      namaSekolah: t.namaSekolah,
      kejohananId: t.kejohananId,
      emas: t.emas, perak: t.perak, gangsa: t.gangsa,
      tempat4: t.tempat4, tempat5: t.tempat5,
      jumlahPingat: t.jumlahPingat,
      ...t.contribs,
      ...t.katFields,
      updatedAt: serverTimestamp(),
      _backfilledAt: serverTimestamp(),
    }
    await setDoc(doc(db, 'tenants', SCHOOL_ID, 'kejohanan', KEJ_ID, 'medal_tally', tId), data)
  }
  console.log(`   ${Object.values(newTally).length} tally docs tulis`)

  console.log('✍  Tulis mata_olahragawan baru...')
  for (const m of Object.values(newMata)) {
    const mId = `${m.noBib}_${KEJ_ID}`
    const data = {
      noBib: m.noBib,
      namaAtlet: m.namaAtlet,
      kodSekolah: m.kodSekolah,
      namaSekolah: m.namaSekolah,
      jantina: m.jantina,
      kategoriKod: m.kategoriKod,
      kejohananId: m.kejohananId,
      jumlahMata: m.jumlahMata,
      pingat_emas: m.pingat_emas || 0,
      pingat_perak: m.pingat_perak || 0,
      pingat_gangsa: m.pingat_gangsa || 0,
      pingat_tempat4: m.pingat_tempat4 || 0,
      ...m.acaraDetails,
      updatedAt: serverTimestamp(),
      _backfilledAt: serverTimestamp(),
    }
    await setDoc(doc(db, 'tenants', SCHOOL_ID, 'kejohanan', KEJ_ID, 'mata_olahragawan', mId), data)
  }
  console.log(`   ${Object.values(newMata).length} mata docs tulis\n`)

  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  ✅ BACKFILL SIAP                                             ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
}

main().catch(e => { console.error('ERROR:', e); process.exit(1) })
