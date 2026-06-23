// audit-tally-sr.cjs
// Audit cross-check medal_tally SR vs mata_olahragawan (ground truth)
// SR = kategoriKod A,B,C,D,K,L,M,N
// Tapis: relay (isRelay=true dalam contrib), SM (E,F,G,H,I,J)
// Baca sahaja — tiada perubahan

const https = require('https')
const PROJECT_ID = 'mssdkemaman-olahraga'
const API_KEY    = 'AIzaSyDLgrBGDgzuwlCw61R3_XzQH_B9XFNGHzA'
const BASE_URL   = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`
const KEJ_ID     = 'KOAM-2026-WBRC'
const SR_KAT     = new Set(['A','B','C','D','K','L','M','N'])
const PINGAT_SET = new Set(['emas','perak','gangsa'])

function getAll(path, pageToken) {
  return new Promise((resolve, reject) => {
    const tok = pageToken ? `&pageToken=${pageToken}` : ''
    const url = `${BASE_URL}${path}?key=${API_KEY}&pageSize=300${tok}`
    https.get(url, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch(e) { reject(e) } })
    }).on('error', reject)
  })
}
function val(f) {
  if (!f) return undefined
  if (f.stringValue  !== undefined) return f.stringValue
  if (f.integerValue !== undefined) return parseInt(f.integerValue)
  if (f.doubleValue  !== undefined) return parseFloat(f.doubleValue)
  if (f.booleanValue !== undefined) return f.booleanValue
  if (f.arrayValue   !== undefined) return (f.arrayValue.values || []).map(val)
  if (f.mapValue     !== undefined) {
    const m = {}
    for (const [k, v] of Object.entries(f.mapValue.fields || {})) m[k] = val(v)
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
  console.log('=== AUDIT MEDAL TALLY SR (A/B/C/D/K/L/M/N) ===')
  console.log('Ground truth: mata_olahragawan | Semak: medal_tally contrib\n')

  // ── 1. Kira dari mata_olahragawan (hanya SR, hanya KOAM-2026-WBRC) ──────────
  console.log('Ambil mata_olahragawan...')
  const maDocs = await getAllDocs('/mata_olahragawan')

  // fromMA[kodSekolah] = { e, p, g, atlet[] }
  const fromMA = {}
  for (const doc of maDocs) {
    const f   = doc.fields || {}
    if (val(f.kejohananId) !== KEJ_ID) continue
    const kat = val(f.kategoriKod) || ''
    if (!SR_KAT.has(kat)) continue

    const kes  = val(f.kodSekolah) || '?'
    const nama = val(f.namaAtlet)  || val(f.nama) || '?'
    const e    = val(f.pingat_emas)   || 0
    const p    = val(f.pingat_perak)  || 0
    const g    = val(f.pingat_gangsa) || 0

    if (!fromMA[kes]) fromMA[kes] = { e:0, p:0, g:0, atlet:[] }
    fromMA[kes].e += e
    fromMA[kes].p += p
    fromMA[kes].g += g
    if (e+p+g > 0) fromMA[kes].atlet.push({ nama, e, p, g, kat })
  }

  // ── 2. Kira dari medal_tally contrib (tapis relay + tapis SM) ───────────────
  console.log('Ambil medal_tally...')
  const tallyDocs = await getAllDocs('/medal_tally')

  // fromContrib[kodSekolah] = { e, p, g, contribList[] }
  const fromContrib = {}
  // counterDoc[kodSekolah] = { e, p, g } — counter dalam doc
  const counterDoc  = {}

  for (const doc of tallyDocs) {
    const f   = doc.fields || {}
    if (val(f.kejohananId) !== KEJ_ID) continue
    const kes = val(f.kodSekolah) || '?'

    // Skip terus jika bukan TBA/TBB/TJA (SR school prefix)
    // SR sekolah: TBA, TBB, TJA
    if (!/^(TBA|TBB|TJA)/.test(kes)) continue

    counterDoc[kes] = {
      e: val(f.emas)   || 0,
      p: val(f.perak)  || 0,
      g: val(f.gangsa) || 0,
    }

    if (!fromContrib[kes]) fromContrib[kes] = { e:0, p:0, g:0, contrib:[] }

    const contribs = Object.entries(f).filter(([k]) => k.startsWith('contrib_'))
    for (const [k, v] of contribs) {
      const d      = val(v)
      const pingat = d?.pingat || ''
      const kat    = d?.kategoriKod || ''
      const isRel  = d?.isRelay === true

      // Tapis relay dan SM
      if (isRel)              continue
      if (!SR_KAT.has(kat))  continue
      if (!PINGAT_SET.has(pingat)) continue

      if (pingat === 'emas')   fromContrib[kes].e++
      if (pingat === 'perak')  fromContrib[kes].p++
      if (pingat === 'gangsa') fromContrib[kes].g++
      fromContrib[kes].contrib.push({ key: k, pingat, kat, noKP: d?.noKP })
    }
  }

  // ── 3. Bandingkan ───────────────────────────────────────────────────────────
  const allKes = new Set([
    ...Object.keys(fromMA),
    ...Object.keys(fromContrib),
    ...Object.keys(counterDoc),
  ])

  const beza    = []
  const betul   = []
  const onlyMA  = []  // ada dalam MA tapi tiada dalam tally
  const onlyTal = []  // ada dalam tally tapi tiada dalam MA

  for (const kes of [...allKes].sort()) {
    const ma   = fromMA[kes]      || { e:0, p:0, g:0, atlet:[] }
    const cont = fromContrib[kes] || { e:0, p:0, g:0, contrib:[] }
    const ctr  = counterDoc[kes]  || { e:0, p:0, g:0 }

    const maMatch    = (ma.e===cont.e && ma.p===cont.p && ma.g===cont.g)
    const ctrMatch   = (cont.e===ctr.e && cont.p===ctr.p && cont.g===ctr.g)

    if (maMatch && ctrMatch) {
      betul.push(kes)
    } else {
      beza.push({ kes, ma, cont, ctr, maMatch, ctrMatch })
    }
  }

  // ── 4. Output ───────────────────────────────────────────────────────────────
  console.log(`\n✅ SEPADAN (${betul.length} sekolah): ${betul.join(', ')}\n`)

  if (beza.length === 0) {
    console.log('✅ Tiada perbezaan — medal tally SR semua betul.')
    return
  }

  console.log(`❌ BEZA (${beza.length} sekolah):\n`)
  console.log('Kes      | MA(E/P/G) | Contrib(E/P/G) | Counter(E/P/G) | MA=Cont? | Cont=Ctr?')
  console.log('-'.repeat(90))

  for (const { kes, ma, cont, ctr, maMatch, ctrMatch } of beza) {
    console.log(
      `${kes.padEnd(8)} | ${ma.e}/${ma.p}/${ma.g}       | ${cont.e}/${cont.p}/${cont.g}            | ${ctr.e}/${ctr.p}/${ctr.g}            | ${maMatch?'✅':'❌'}        | ${ctrMatch?'✅':'❌'}`
    )
    // Detail atlet dalam MA
    if (ma.atlet?.length > 0) {
      for (const a of ma.atlet) {
        console.log(`  [MA]     ${a.nama} (kat=${a.kat}, E${a.e}P${a.p}G${a.g})`)
      }
    }
    // Detail contrib dalam tally
    if (cont.contrib?.length > 0) {
      for (const c of cont.contrib) {
        console.log(`  [CONTRIB] ${c.key} → pingat=${c.pingat}, kat=${c.kat}, noKP=${c.noKP}`)
      }
    }
    console.log()
  }

  console.log('---')
  console.log('MA      = mata_olahragawan (ground truth, dari keputusan final)')
  console.log('Contrib = kira semula dari contrib_ fields dalam medal_tally (tapis relay+SM)')
  console.log('Counter = nilai emas/perak/gangsa yang tersimpan dalam medal_tally doc')
  console.log('\nJika MA ≠ Contrib → data dalam medal_tally contrib ada lebihan/kekurangan')
  console.log('Jika Contrib ≠ Counter → counter dalam doc tidak dikemas kini betul')
}
main().catch(console.error)
