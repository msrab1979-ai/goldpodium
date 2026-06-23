const https = require('https')

const PROJECT_ID = 'mssdkemaman-olahraga'
const API_KEY    = 'AIzaSyDLgrBGDgzuwlCw61R3_XzQH_B9XFNGHzA'
const BASE_URL   = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`
const DOC_ID     = '140415-11-0215_KOAM-2026-WBRC'

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

function patch(path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body)
    const url = new URL(`${BASE_URL}${path}?key=${API_KEY}&currentDocument.exists=true`)
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

  console.log(`\n=== fix-faris-mata.cjs ${DRY_RUN ? '[PREVIEW SAHAJA]' : '[LIVE FIX]'} ===\n`)

  // Baca dokumen semasa
  const res = await get(`/mata_olahragawan/${DOC_ID}`)
  if (res.error) { console.error('Gagal baca doc:', res.error.message); return }

  const f = res.fields || {}
  const nama        = val(f.namaAtlet) || val(f.nama)
  const sekolah     = val(f.namaSekolah) || val(f.kodSekolah)
  const emas_skrg   = val(f.pingat_emas)   ?? 0
  const mata_skrg   = val(f.jumlahMata)    ?? 0
  const detail_113  = val(f.acaraDetail_113)
  const detail_127  = val(f.acaraDetail_127)

  console.log('Atlet  :', nama)
  console.log('Sekolah:', sekolah)
  console.log('Doc ID :', DOC_ID)

  console.log('\n--- SEBELUM ---')
  console.log(`pingat_emas  : ${emas_skrg}`)
  console.log(`jumlahMata   : ${mata_skrg}`)
  console.log(`acaraDetail_113: ${JSON.stringify(detail_113)}`)
  console.log(`acaraDetail_127: ${JSON.stringify(detail_127)}`)

  console.log('\n--- SELEPAS (yang akan diubah) ---')
  console.log(`pingat_emas  : ${emas_skrg} → 1`)
  console.log(`jumlahMata   : ${mata_skrg} → 5`)
  console.log(`acaraDetail_113: AKAN DIPADAM`)
  console.log(`acaraDetail_127: KEKAL (tidak disentuh)`)

  if (DRY_RUN) {
    console.log('\n⚠️  PREVIEW SAHAJA — tiada perubahan dibuat.')
    console.log('   Untuk apply fix, jalankan:')
    console.log('   node fix-faris-mata.cjs --fix\n')
    return
  }

  // ── LIVE FIX ──────────────────────────────────────────────────────────────
  console.log('\nMemulakan fix...')

  // Firestore REST PATCH dengan updateMask untuk set field tertentu sahaja
  // Untuk padam field, guna updateMask tapi jangan include field tu dalam body
  const updateMask = [
    'pingat_emas',
    'jumlahMata',
  ].map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&')

  // Step 1: Update pingat_emas dan jumlahMata
  const patchBody = {
    fields: {
      pingat_emas: { integerValue: '1' },
      jumlahMata:  { integerValue: '5' },
    }
  }

  const patchUrl = `/mata_olahragawan/${DOC_ID}?key=${API_KEY}&updateMask.fieldPaths=pingat_emas&updateMask.fieldPaths=jumlahMata`

  const r1 = await new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(patchBody)
    const url = new URL(`${BASE_URL}${patchUrl}`)
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

  if (r1.error) {
    console.error('❌ Gagal update pingat_emas/jumlahMata:', r1.error.message)
    return
  }
  console.log('✅ pingat_emas → 1, jumlahMata → 5')

  // Step 2: Padam field acaraDetail_113 guna updateMask (field dalam mask tapi tiada dalam body = padam)
  const deleteBody = { fields: {} }
  const deleteUrl  = `/mata_olahragawan/${DOC_ID}?key=${API_KEY}&updateMask.fieldPaths=acaraDetail_113`

  const r2 = await new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(deleteBody)
    const url = new URL(`${BASE_URL}${deleteUrl}`)
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

  if (r2.error) {
    console.error('❌ Gagal padam acaraDetail_113:', r2.error.message)
    return
  }
  console.log('✅ acaraDetail_113 dipadam')

  // Verify
  console.log('\nVerifikasi...')
  const verify = await get(`/mata_olahragawan/${DOC_ID}`)
  const vf = verify.fields || {}
  console.log('pingat_emas  :', val(vf.pingat_emas))
  console.log('jumlahMata   :', val(vf.jumlahMata))
  console.log('acaraDetail_113:', val(vf.acaraDetail_113) ?? '(tiada — betul)')
  console.log('acaraDetail_127:', JSON.stringify(val(vf.acaraDetail_127)))
  console.log('\n✅ Fix selesai.\n')
}

main().catch(console.error)
