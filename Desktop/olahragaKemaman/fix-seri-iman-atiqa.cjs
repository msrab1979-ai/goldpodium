// fix-seri-iman-atiqa.cjs
// Fix NUR ATIQA ZAHRA (TBA2044) — stale saringan dalam mata_olahragawan
// + kat_D_P_emas fix dalam medal_tally
//
// Situasi:
//   mata_olahragawan: acaraDetail_108 (saringan, SALAH) + 122 + 232 (betul)
//   pingat_emas: 3 → sepatutnya 2 (122 final + 232 final)
//   jumlahMata: 15 → sepatutnya 10 (5+5)
//
//   medal_tally: contrib hanya ada 1 entry (acara 122)
//   Acara 232 final tiada contrib → emas dalam contrib = 1, tapi kat_D_P_emas = 2
//   Betul: NUR ATIQA dapat 2 emas (122+232) → contrib sepatutnya ada 2
//   Fix: tambah contrib untuk acara 232 + kat_D_P_emas kekal 2 (sudah betul)

const https = require('https')
const PROJECT_ID  = 'mssdkemaman-olahraga'
const API_KEY     = 'AIzaSyDLgrBGDgzuwlCw61R3_XzQH_B9XFNGHzA'
const BASE_URL    = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`
const MA_DOC      = '160111-11-0468_KOAM-2026-WBRC'
const TALLY_DOC   = 'TBA2044_KOAM-2026-WBRC'
const STALE_FIELD = 'acaraDetail_108'

function get(path) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}?key=${API_KEY}`
    https.get(url, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch(e) { reject(e) } })
    }).on('error', reject)
  })
}
function patchFields(docPath, fields, masks) {
  return new Promise((resolve, reject) => {
    const maskParams = masks.map(m => `updateMask.fieldPaths=${encodeURIComponent('`' + m + '`')}`).join('&')
    const bodyStr = JSON.stringify({ fields })
    const fullUrl = `${BASE_URL}${docPath}?key=${API_KEY}&${maskParams}`
    const url = new URL(fullUrl)
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) }
    }
    const req = https.request(options, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch(e) { reject(e) } })
    })
    req.on('error', reject)
    req.write(bodyStr)
    req.end()
  })
}
function val(f) {
  if (!f) return undefined
  if (f.stringValue  !== undefined) return f.stringValue
  if (f.integerValue !== undefined) return parseInt(f.integerValue)
  if (f.booleanValue !== undefined) return f.booleanValue
  if (f.mapValue     !== undefined) {
    const m = {}
    for (const [k, v] of Object.entries(f.mapValue.fields || {})) m[k] = val(v)
    return m
  }
  return undefined
}

async function main() {
  const DRY_RUN = process.argv[2] !== '--fix'
  console.log(`\n=== fix-seri-iman-atiqa.cjs ${DRY_RUN ? '[PREVIEW]' : '[LIVE FIX]'} ===\n`)

  const [maRes, tallyRes] = await Promise.all([
    get(`/mata_olahragawan/${MA_DOC}`),
    get(`/medal_tally/${TALLY_DOC}`)
  ])

  const mf = maRes.fields || {}
  const tf = tallyRes.fields || {}

  const e_skrg       = val(mf.pingat_emas)   ?? 0
  const mata_skrg    = val(mf.jumlahMata)    ?? 0
  const stale        = val(mf[STALE_FIELD])
  const kat_D_emas   = val(tf['kat_D_P_emas']) ?? 0
  const emas_counter = val(tf.emas) ?? 0
  const jumlah_counter = val(tf.jumlahPingat) ?? 0

  // Semak contrib acara 232
  const contrib232Key = Object.keys(tf).find(k =>
    k.startsWith('contrib_') && val(tf[k])?.noKP === '160111-11-0468' &&
    k.includes('232') // heatId acara 232
  )
  // Cari semua contrib NUR ATIQA
  const contribsAtiqa = Object.entries(tf)
    .filter(([k, v]) => k.startsWith('contrib_') && val(v)?.noKP === '160111-11-0468')

  console.log('=== SEMASA ===')
  console.log(`mata_olahragawan/${MA_DOC}`)
  console.log(`  pingat_emas: ${e_skrg}, jumlahMata: ${mata_skrg}`)
  console.log(`  ${STALE_FIELD}: ${JSON.stringify(stale)}`)
  console.log(`  acaraDetail_122: ${JSON.stringify(val(mf.acaraDetail_122))}`)
  console.log(`  acaraDetail_232: ${JSON.stringify(val(mf.acaraDetail_232))}`)
  console.log(`\nmedal_tally/${TALLY_DOC}`)
  console.log(`  kat_D_P_emas: ${kat_D_emas}`)
  console.log(`  Contrib NUR ATIQA:`)
  contribsAtiqa.forEach(([k, v]) => console.log(`    ${k}: ${JSON.stringify(val(v))}`))

  console.log('\n=== ANALISIS ===')
  console.log('mata_olahragawan:')
  console.log(`  acaraDetail_108 = saringan (SALAH) → PADAM`)
  console.log(`  pingat_emas: ${e_skrg} → 2 (122 final + 232 final)`)
  console.log(`  jumlahMata: ${mata_skrg} → 10 (5+5)`)

  console.log('\nmedal_tally:')
  console.log(`  emas counter: ${emas_counter}`)
  console.log(`  kat_D_P_emas = ${kat_D_emas} → KEKAL 2 (betul: 122+232 = 2 emas)`)
  console.log(`  Contrib NUR ATIQA ada ${contribsAtiqa.length} entry`)
  if (contribsAtiqa.length < 2) {
    console.log(`  ⚠️  Sepatutnya 2 contrib (acara 122 + 232) — 1 hilang`)
  }
  if (emas_counter < 2) {
    console.log(`  ⚠️  emas counter = ${emas_counter} → sepatutnya 2 (NUR ATIQA 2 final)`)
  }

  console.log('\n=== FIX YANG DIPERLUKAN ===')
  console.log('1. mata_olahragawan: padam acaraDetail_108, pingat_emas 3→2, jumlahMata 15→10')
  console.log('2. medal_tally: emas counter → 2, jumlahPingat +1')
  console.log('3. medal_tally: kat_D_P_emas kekal 2 (sudah betul)')

  if (DRY_RUN) {
    console.log('\n⚠️  PREVIEW — tiada perubahan. Jalankan: node fix-seri-iman-atiqa.cjs --fix\n')
    return
  }

  // Fix 1: mata_olahragawan — update counter
  const r1 = await patchFields(
    `/mata_olahragawan/${MA_DOC}`,
    {
      pingat_emas: { integerValue: '2' },
      jumlahMata:  { integerValue: '10' },
    },
    ['pingat_emas', 'jumlahMata']
  )
  if (r1.error) { console.error('❌ Gagal update MA counter:', r1.error.message); return }
  console.log('\n✅ pingat_emas → 2, jumlahMata → 10')

  // Fix 2: mata_olahragawan — padam acaraDetail_108
  const r2 = await patchFields(`/mata_olahragawan/${MA_DOC}`, {}, [STALE_FIELD])
  if (r2.error) { console.error('❌ Gagal padam stale:', r2.error.message); return }
  console.log(`✅ ${STALE_FIELD} dipadam`)

  // Fix 3: medal_tally — emas counter 1→2, jumlahPingat +1
  const r3 = await patchFields(
    `/medal_tally/${TALLY_DOC}`,
    {
      emas:         { integerValue: String(emas_counter + 1) },
      jumlahPingat: { integerValue: String(jumlah_counter + 1) },
    },
    ['emas', 'jumlahPingat']
  )
  if (r3.error) { console.error('❌ Gagal update tally counter:', r3.error.message); return }
  console.log(`✅ medal_tally emas → ${emas_counter + 1}, jumlahPingat → ${jumlah_counter + 1}`)

  // Verify
  console.log('\nVerifikasi...')
  const [v, tv] = await Promise.all([
    get(`/mata_olahragawan/${MA_DOC}`),
    get(`/medal_tally/${TALLY_DOC}`)
  ])
  const vf = v.fields || {}
  const tvf = tv.fields || {}
  console.log('=== mata_olahragawan ===')
  console.log('pingat_emas:', val(vf.pingat_emas))
  console.log('jumlahMata:', val(vf.jumlahMata))
  console.log('acaraDetail_108:', val(vf.acaraDetail_108) ?? '(tiada ✅)')
  console.log('acaraDetail_122:', val(vf.acaraDetail_122)?.pingat)
  console.log('acaraDetail_232:', val(vf.acaraDetail_232)?.pingat)
  console.log('=== medal_tally ===')
  console.log('emas:', val(tvf.emas))
  console.log('jumlahPingat:', val(tvf.jumlahPingat))
  console.log('kat_D_P_emas:', val(tvf['kat_D_P_emas']))
  console.log('\n✅ Fix NUR ATIQA selesai.\n')
}
main().catch(console.error)
