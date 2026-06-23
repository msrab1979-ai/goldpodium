const https = require('https')

const PROJECT_ID = 'mssdkemaman-olahraga'
const API_KEY    = 'AIzaSyDLgrBGDgzuwlCw61R3_XzQH_B9XFNGHzA'
const BASE_URL   = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`
const DOC_ID     = 'TBA2013_KOAM-2026-WBRC'

// Contrib yang salah (saringan lama Faris)
const STALE_CONTRIB = 'contrib_final_1782051764680_140415-11-0215'

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

function patchUrl(path, fields, masks) {
  return new Promise((resolve, reject) => {
    const maskParams = masks.map(m => `updateMask.fieldPaths=${encodeURIComponent(m)}`).join('&')
    const bodyStr = JSON.stringify({ fields })
    const fullPath = `${BASE_URL}${path}?key=${API_KEY}&${maskParams}`
    const url = new URL(fullPath)
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
  if (f.doubleValue  !== undefined) return parseFloat(f.doubleValue)
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
  console.log(`\n=== fix-kijal-tally.cjs ${DRY_RUN ? '[PREVIEW SAHAJA]' : '[LIVE FIX]'} ===\n`)

  const res = await get(`/medal_tally/${DOC_ID}`)
  if (res.error) { console.error('Gagal baca:', res.error.message); return }

  const f = res.fields || {}
  const emas_skrg        = val(f.emas)         ?? 0
  const jumlah_skrg      = val(f.jumlahPingat) ?? 0
  const kat_A_L_emas     = val(f['kat_A_L_emas']) ?? 0
  const stale            = val(f[STALE_CONTRIB])

  console.log('Doc ID:', DOC_ID)
  console.log('\n--- SEBELUM ---')
  console.log(`emas:              ${emas_skrg}`)
  console.log(`jumlahPingat:      ${jumlah_skrg}`)
  console.log(`kat_A_L_emas:      ${kat_A_L_emas}`)
  console.log(`${STALE_CONTRIB}:  ${JSON.stringify(stale)}`)

  console.log('\n--- SELEPAS ---')
  console.log(`emas:              ${emas_skrg} → ${emas_skrg - 1}`)
  console.log(`jumlahPingat:      ${jumlah_skrg} → ${jumlah_skrg - 1}`)
  console.log(`kat_A_L_emas:      ${kat_A_L_emas} → ${kat_A_L_emas - 1}`)
  console.log(`${STALE_CONTRIB}:  AKAN DIPADAM`)

  if (!stale) {
    console.log('\n⚠️  Contrib stale tidak dijumpai — mungkin dah dipadam. Batalkan.')
    return
  }

  if (DRY_RUN) {
    console.log('\n⚠️  PREVIEW SAHAJA — tiada perubahan dibuat.')
    console.log('   Untuk apply fix: node fix-kijal-tally.cjs --fix\n')
    return
  }

  // Step 1: Kemas kini counter (emas-1, jumlahPingat-1, kat_A_L_emas-1)
  const r1 = await patchUrl(
    `/medal_tally/${DOC_ID}`,
    {
      emas:         { integerValue: String(emas_skrg - 1) },
      jumlahPingat: { integerValue: String(jumlah_skrg - 1) },
      kat_A_L_emas: { integerValue: String(kat_A_L_emas - 1) },
    },
    ['emas', 'jumlahPingat', 'kat_A_L_emas']
  )
  if (r1.error) { console.error('❌ Gagal update counter:', r1.error.message); return }
  console.log('\n✅ emas → ' + (emas_skrg - 1) + ', jumlahPingat → ' + (jumlah_skrg - 1) + ', kat_A_L_emas → ' + (kat_A_L_emas - 1))

  // Step 2: Padam contrib stale (mask ada field, body kosong = padam)
  const r2 = await patchUrl(
    `/medal_tally/${DOC_ID}`,
    {},
    [STALE_CONTRIB]
  )
  if (r2.error) { console.error('❌ Gagal padam contrib stale:', r2.error.message); return }
  console.log(`✅ ${STALE_CONTRIB} dipadam`)

  // Verify
  console.log('\nVerifikasi...')
  const v = await get(`/medal_tally/${DOC_ID}`)
  const vf = v.fields || {}
  console.log('emas:         ', val(vf.emas))
  console.log('jumlahPingat: ', val(vf.jumlahPingat))
  console.log('kat_A_L_emas: ', val(vf['kat_A_L_emas']))
  console.log(STALE_CONTRIB + ':', val(vf[STALE_CONTRIB]) ?? '(tiada — betul)')
  console.log('\n✅ Fix medal_tally selesai.\n')
}

main().catch(console.error)
