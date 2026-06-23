// fix-seri-iman-tally.cjs
// Fix medal_tally TBA2044 SK SERI IMAN
// Masalah 1: dupe contrib noKP=141121-11-0695 (perak stale)
// Masalah 2: dupe contrib noKP=160111-11-0468 (emas stale)
// Fix: padam 2 contrib stale, kurang emas-1 perak-1 jumlahPingat-2

const https = require('https')
const PROJECT_ID = 'mssdkemaman-olahraga'
const API_KEY    = 'AIzaSyDLgrBGDgzuwlCw61R3_XzQH_B9XFNGHzA'
const BASE_URL   = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`
const DOC_ID     = 'TBA2044_KOAM-2026-WBRC'

const STALE = [
  'contrib_final_1782051764680_141121-11-0695',  // perak stale
  'contrib_final_1782011521952_160111-11-0468',  // emas stale
]

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
  console.log(`\n=== fix-seri-iman-tally.cjs ${DRY_RUN ? '[PREVIEW SAHAJA]' : '[LIVE FIX]'} ===\n`)

  const res = await get(`/medal_tally/${DOC_ID}`)
  if (res.error) { console.error('Gagal baca:', res.error.message); return }

  const f      = res.fields || {}
  const emas   = val(f.emas)         ?? 0
  const perak  = val(f.perak)        ?? 0
  const gangsa = val(f.gangsa)       ?? 0
  const jumlah = val(f.jumlahPingat) ?? 0

  const stale0 = val(f[STALE[0]])
  const stale1 = val(f[STALE[1]])

  console.log('Doc    :', DOC_ID, '— SK SERI IMAN')
  console.log('\n--- SEBELUM ---')
  console.log(`emas:         ${emas}`)
  console.log(`perak:        ${perak}`)
  console.log(`gangsa:       ${gangsa}`)
  console.log(`jumlahPingat: ${jumlah}`)
  console.log(`\n[STALE 1] ${STALE[0]}:`)
  console.log(`          ${JSON.stringify(stale0)}`)
  console.log(`[STALE 2] ${STALE[1]}:`)
  console.log(`          ${JSON.stringify(stale1)}`)

  // Kira berapa nak tolak (hanya yang wujud)
  let tolakEmas  = 0
  let tolakPerak = 0
  if (stale0 && val(f[STALE[0]])?.pingat === 'perak') tolakPerak++
  if (stale1 && val(f[STALE[1]])?.pingat === 'emas')  tolakEmas++
  const tolakJumlah = tolakEmas + tolakPerak

  if (!stale0 && !stale1) {
    console.log('\n✅ Tiada contrib stale — tiada perlu fix.')
    return
  }

  console.log('\n--- SELEPAS ---')
  if (tolakEmas)  console.log(`emas:         ${emas} → ${emas - tolakEmas}`)
  if (tolakPerak) console.log(`perak:        ${perak} → ${perak - tolakPerak}`)
  console.log(`jumlahPingat: ${jumlah} → ${jumlah - tolakJumlah}`)
  if (stale0) console.log(`[STALE 1] ${STALE[0]} → DIPADAM`)
  if (stale1) console.log(`[STALE 2] ${STALE[1]} → DIPADAM`)

  if (DRY_RUN) {
    console.log('\n⚠️  PREVIEW SAHAJA — tiada perubahan.')
    console.log('   Jalankan: node fix-seri-iman-tally.cjs --fix\n')
    return
  }

  // Step 1: Update counter
  const newFields = { jumlahPingat: { integerValue: String(jumlah - tolakJumlah) } }
  const newMasks  = ['jumlahPingat']
  if (tolakEmas)  { newFields.emas  = { integerValue: String(emas  - tolakEmas)  }; newMasks.push('emas')  }
  if (tolakPerak) { newFields.perak = { integerValue: String(perak - tolakPerak) }; newMasks.push('perak') }

  const r1 = await patchFields(`/medal_tally/${DOC_ID}`, newFields, newMasks)
  if (r1.error) { console.error('❌ Gagal update counter:', r1.error.message); return }
  console.log(`\n✅ Counter dikemas kini`)

  // Step 2: Padam contrib stale (satu-satu)
  for (const staleKey of STALE) {
    if (!val(f[staleKey])) { console.log(`⏭  ${staleKey} (tiada — skip)`); continue }
    const r = await patchFields(`/medal_tally/${DOC_ID}`, {}, [staleKey])
    if (r.error) { console.error(`❌ Gagal padam ${staleKey}:`, r.error.message); return }
    console.log(`✅ ${staleKey} dipadam`)
  }

  // Verify
  console.log('\nVerifikasi...')
  const v  = await get(`/medal_tally/${DOC_ID}`)
  const vf = v.fields || {}
  console.log('emas:        ', val(vf.emas))
  console.log('perak:       ', val(vf.perak))
  console.log('gangsa:      ', val(vf.gangsa))
  console.log('jumlahPingat:', val(vf.jumlahPingat))
  for (const s of STALE) {
    console.log(`${s}: ${val(vf[s]) ?? '(tiada ✅)'}`)
  }
  console.log('\n✅ Fix TBA2044 selesai.\n')
}
main().catch(console.error)
