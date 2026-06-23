// fix-ayer-puteh-tally.cjs
// Fix medal_tally TBA2009 SK AYER PUTEH
// Masalah: dupe contrib noKP=140623-11-0607 (gangsa stale dari saringan)
// Fix: padam contrib stale, kurang gangsa counter -1, jumlahPingat -1

const https = require('https')
const PROJECT_ID   = 'mssdkemaman-olahraga'
const API_KEY      = 'AIzaSyDLgrBGDgzuwlCw61R3_XzQH_B9XFNGHzA'
const BASE_URL     = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`
const DOC_ID       = 'TBA2009_KOAM-2026-WBRC'
const STALE_CONTRIB = 'contrib_final_1782051764680_140623-11-0607'

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
  console.log(`\n=== fix-ayer-puteh-tally.cjs ${DRY_RUN ? '[PREVIEW SAHAJA]' : '[LIVE FIX]'} ===\n`)

  const res = await get(`/medal_tally/${DOC_ID}`)
  if (res.error) { console.error('Gagal baca:', res.error.message); return }

  const f        = res.fields || {}
  const gangsa   = val(f.gangsa)       ?? 0
  const jumlah   = val(f.jumlahPingat) ?? 0
  const stale    = val(f[STALE_CONTRIB])
  const betul    = val(f['contrib_final_1782015753074_140623-11-0607'])

  console.log('Doc    :', DOC_ID, '— SK AYER PUTEH')
  console.log('\n--- SEBELUM ---')
  console.log(`gangsa:        ${gangsa}`)
  console.log(`jumlahPingat:  ${jumlah}`)
  console.log(`[STALE]  ${STALE_CONTRIB}:`)
  console.log(`         ${JSON.stringify(stale)}`)
  console.log(`[BETUL]  contrib_final_1782015753074_140623-11-0607:`)
  console.log(`         ${JSON.stringify(betul)}`)

  if (!stale) {
    console.log('\n✅ Contrib stale tidak ada — tiada perlu fix.')
    return
  }

  console.log('\n--- SELEPAS ---')
  console.log(`gangsa:        ${gangsa} → ${gangsa - 1}`)
  console.log(`jumlahPingat:  ${jumlah} → ${jumlah - 1}`)
  console.log(`[STALE] contrib akan DIPADAM`)
  console.log(`[BETUL] contrib kekal tidak disentuh`)

  if (DRY_RUN) {
    console.log('\n⚠️  PREVIEW SAHAJA — tiada perubahan.')
    console.log('   Jalankan: node fix-ayer-puteh-tally.cjs --fix\n')
    return
  }

  // Step 1: Kemas kini counter
  const r1 = await patchFields(
    `/medal_tally/${DOC_ID}`,
    {
      gangsa:       { integerValue: String(gangsa - 1) },
      jumlahPingat: { integerValue: String(jumlah - 1) },
    },
    ['gangsa', 'jumlahPingat']
  )
  if (r1.error) { console.error('❌ Gagal update counter:', r1.error.message); return }
  console.log(`\n✅ gangsa → ${gangsa - 1}, jumlahPingat → ${jumlah - 1}`)

  // Step 2: Padam contrib stale (backtick untuk field nama dengan '-')
  const r2 = await patchFields(
    `/medal_tally/${DOC_ID}`,
    {},
    [STALE_CONTRIB]
  )
  if (r2.error) { console.error('❌ Gagal padam contrib stale:', r2.error.message); return }
  console.log(`✅ ${STALE_CONTRIB} dipadam`)

  // Verify
  console.log('\nVerifikasi...')
  const v  = await get(`/medal_tally/${DOC_ID}`)
  const vf = v.fields || {}
  console.log('gangsa:       ', val(vf.gangsa))
  console.log('jumlahPingat: ', val(vf.jumlahPingat))
  console.log('stale contrib:', val(vf[STALE_CONTRIB]) ?? '(tiada — betul ✅)')
  console.log('\n✅ Fix TBA2009 selesai.\n')
}
main().catch(console.error)
