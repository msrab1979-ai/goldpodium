const https = require('https')

const PROJECT_ID = 'mssdkemaman-olahraga'
const API_KEY    = 'AIzaSyDLgrBGDgzuwlCw61R3_XzQH_B9XFNGHzA'
const BASE_URL   = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`

function getAll(path, pageToken) {
  return new Promise((resolve, reject) => {
    const token = pageToken ? `&pageToken=${pageToken}` : ''
    const url = `${BASE_URL}${path}?key=${API_KEY}&pageSize=300${token}`
    https.get(url, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch (e) { reject(e) } })
    }).on('error', reject)
  })
}

function val(field) {
  if (!field) return undefined
  if (field.stringValue  !== undefined) return field.stringValue
  if (field.integerValue !== undefined) return parseInt(field.integerValue)
  if (field.doubleValue  !== undefined) return parseFloat(field.doubleValue)
  if (field.booleanValue !== undefined) return field.booleanValue
  if (field.mapValue     !== undefined) {
    const m = {}
    for (const [k, v] of Object.entries(field.mapValue.fields || {})) m[k] = val(v)
    return m
  }
  return undefined
}

async function getAllDocs(path) {
  const docs = []
  let pageToken = null
  do {
    const res = await getAll(path, pageToken)
    if (res.documents) docs.push(...res.documents)
    pageToken = res.nextPageToken || null
  } while (pageToken)
  return docs
}

async function main() {
  console.log('Mengambil semua mata_olahragawan...\n')
  const docs = await getAllDocs('/mata_olahragawan')
  console.log(`Jumlah dokumen: ${docs.length}\n`)

  const masalah = []

  for (const doc of docs) {
    const f = doc.fields || {}
    const docId = doc.name.split('/').pop()
    const nama = val(f.nama) || docId
    const sekolah = val(f.sekolah) || '-'
    const pingat_emas   = val(f.pingat_emas)   || 0
    const pingat_perak  = val(f.pingat_perak)  || 0
    const pingat_gangsa = val(f.pingat_gangsa) || 0
    const jumlahMata    = val(f.jumlahMata)    || 0

    // Cari semua acaraDetail_ fields
    const acaraFields = Object.entries(f).filter(([k]) => k.startsWith('acaraDetail_'))

    for (const [key, mapField] of acaraFields) {
      const detail = val(mapField)
      if (!detail) continue

      // Cari yang fasa=heat ATAU grantMedal=false tapi ada pingat
      const fasa = detail.fasa
      const pingat = detail.pingat
      const grantMedal = detail.grantMedal

      if (pingat && (fasa === 'heat' || grantMedal === false)) {
        masalah.push({
          docId,
          nama,
          sekolah,
          field: key,
          fasa: fasa || '-',
          pingat,
          grantMedal: grantMedal ?? '-',
          pingat_emas,
          pingat_perak,
          pingat_gangsa,
          jumlahMata
        })
      }
    }
  }

  if (masalah.length === 0) {
    console.log('✅ Tiada masalah ditemui — semua acaraDetail_ pingat adalah betul.')
    return
  }

  console.log(`⚠️  Ditemui ${masalah.length} rekod bermasalah:\n`)
  console.log('DocID | Nama | Sekolah | Field | Fasa | Pingat | grantMedal | E | P | G | Mata')
  console.log('-'.repeat(120))
  for (const m of masalah) {
    console.log(`${m.docId} | ${m.nama} | ${m.sekolah} | ${m.field} | ${m.fasa} | ${m.pingat} | ${m.grantMedal} | ${m.pingat_emas} | ${m.pingat_perak} | ${m.pingat_gangsa} | ${m.jumlahMata}`)
  }

  console.log('\n--- Ringkasan mengikut atlet ---')
  const byDoc = {}
  for (const m of masalah) {
    if (!byDoc[m.docId]) byDoc[m.docId] = { nama: m.nama, sekolah: m.sekolah, fields: [] }
    byDoc[m.docId].fields.push(`${m.field}(${m.pingat},fasa=${m.fasa})`)
  }
  for (const [docId, info] of Object.entries(byDoc)) {
    console.log(`  ${info.nama} [${info.sekolah}] — ${info.fields.join(', ')}`)
  }
}

main().catch(console.error)
