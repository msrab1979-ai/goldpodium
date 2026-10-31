/**
 * finalistUtils.js
 * ─────────────────
 * Logik pilih finalis — kongsi antara InputKeputusan, KeputusanRasmi, Home.
 *
 * Model: bestHeat + bestTime (dari tetapan/finalSetup)
 *   bestHeat = ambil N terbaik dari SETIAP heat saringan
 *   bestTime = ambil M terbaik keseluruhan sebagai wildcard (yang belum masuk)
 *
 * Gate lookup: jenisTab (larian/relay/padang) + kategoriKod + override per aceraId
 */

// ─── Lane order standard ──────────────────────────────────────────────────────
const LANE_ORDER = [4, 5, 3, 6, 2, 7, 1, 8]

// ─── Map jenisAcara → tab dalam tetapan/finalSetup ───────────────────────────
export function getJenisTab(acara) {
  if (acara.jenisAcara === 'relay') return 'relay'
  if (acara.jenisAcara === 'padang_lompat' || acara.jenisAcara === 'padang_balin') return 'padang'
  return 'larian' // lorong, mass_start
}

/**
 * Dapatkan {bestHeat, bestTime} untuk satu acara.
 * Priority: override per aceraId > default per kategori > fallback (1, 3)
 *
 * @param {string} fasa - 'toFinal' (default) atau 'sukuKeSeparuh'
 */
export function getFinalistSetup(acara, finalSetup, fasa = 'toFinal') {
  const FALLBACK = { bestHeat: 1, bestTime: 3 }
  if (!finalSetup) return FALLBACK

  // Build all possible keys for this acara (noAcara, aceraId field, Firestore doc id)
  const aceraKeys = [...new Set([
    String(acara.noAcara  || ''),
    String(acara.aceraId  || ''),
    String(acara.acaraId  || ''),
    String(acara.id       || ''),
  ].filter(Boolean))]
  const aceraId = aceraKeys[0] // primary key (noAcara first)

  const findInMap = (map) => {
    if (!map) return null
    for (const k of aceraKeys) {
      const v = map[k]
      if (v && (v.bestHeat != null || v.bestTime != null)) return v
    }
    return null
  }

  // Suku akhir → separuh akhir: baca field berasingan
  if (fasa === 'sukuKeSeparuh') {
    const ovr = findInMap(finalSetup.sukuKeSeparuhByAcara)
    if (ovr) return { bestHeat: ovr.bestHeat ?? 1, bestTime: ovr.bestTime ?? 0 }
    return FALLBACK
  }

  // 1a. SF → Akhir override (SF aceraId sebagai key)
  const sepOvr = findInMap(finalSetup.separuhKeAkhirByAcara)
  if (sepOvr) return { bestHeat: sepOvr.bestHeat ?? 1, bestTime: sepOvr.bestTime ?? 3 }

  // 1b. Override per acara (→ akhir)
  const ovr = findInMap(finalSetup.overrideByAcara)
  if (ovr) return { bestHeat: ovr.bestHeat ?? 1, bestTime: ovr.bestTime ?? 3 }

  // 2. Default per kategori
  const jenisTab = getJenisTab(acara)
  const kat      = acara.kategoriKod || ''
  const katSetup = finalSetup[jenisTab]?.[kat]
  if (katSetup && (katSetup.bestHeat != null || katSetup.bestTime != null)) {
    return { bestHeat: katSetup.bestHeat ?? 1, bestTime: katSetup.bestTime ?? 3 }
  }

  return FALLBACK
}

/**
 * Pilih finalis dari heats saringan.
 *
 * Algorithm:
 *   Step 1 — Ambil top bestHeat dari setiap heat saringan
 *   Step 2 — Ambil top bestTime dari baki atlet sebagai wildcard
 *
 * @param {Array}  heats       - senarai heat (field: heatId|id, peserta, peringkat, statusKeputusan, noHeat)
 * @param {Object} acara       - acara doc (jenisAcara, kategoriKod, noAcara, ...)
 * @param {Object} finalSetup  - dari Firestore tetapan/finalSetup (boleh null → guna fallback)
 * @returns {Array} senarai atlet layak { noBib, namaAtlet, kodSekolah, keputusan, heatId, noHeat }
 */
export function selectFinalists(heats, acara, finalSetup, fasa = 'toFinal') {
  const { bestHeat, bestTime } = getFinalistSetup(acara, finalSetup, fasa)
  const isPadang = ['padang_lompat', 'padang_balin'].includes(acara.jenisAcara)
  const isRelay  = acara.jenisAcara === 'relay'

  const saringanHeats = heats.filter(h =>
    !['final', 'terus_final'].includes(h.fasa) &&
    ['rasmi', 'tidak_rasmi', 'diterima'].includes(h.statusKeputusan)
  )
  if (saringanHeats.length === 0) return []

  // Key unik: relay guna kodSekolah+pasukanRelay, individu guna noBib
  const getKey = p => isRelay
    ? `${p.kodSekolah || 'UNKNOWN'}_${p.pasukanRelay || 'A'}`
    : (p.noBib || '')

  const toEntry = (p, heat) => isRelay ? ({
    kodSekolah:   p.kodSekolah   || '',
    pasukanRelay: p.pasukanRelay || 'A',
    ahliPasukan:  p.ahliPasukan  || [],
    keputusan:    Number(p.keputusan) > 0 ? Number(p.keputusan) : null,
    kedudukan:    Number(p.kedudukan) > 0 ? Number(p.kedudukan) : null,
    heatId:       heat.heatId    || heat.id || '',
    noHeat:       heat.noHeat    || 0,
  }) : ({
    noBib:      p.noBib      || '',
    namaAtlet:  p.namaAtlet  || '',
    kodSekolah: p.kodSekolah || '',
    keputusan:  Number(p.keputusan) > 0 ? Number(p.keputusan) : null,
    kedudukan:  Number(p.kedudukan) > 0 ? Number(p.kedudukan) : null,
    heatId:     heat.heatId  || heat.id || '',
    noHeat:     heat.noHeat  || 0,
  })

  // Sah: ada masa/jarak, ATAU Kddk sahaja (kejohanan tanpa jam — layak via Best Heat)
  const isValid  = p => !['DNS', 'DNF', 'DQ'].includes(p.status)
    && (Number(p.keputusan) > 0 || Number(p.kedudukan) > 0)
  const adaMasa  = p => Number(p.keputusan) > 0
  const sortFn   = (a, b) => bandingFinalis(a, b, isPadang)
  const selected = new Map() // key → entry

  // Step 1: top bestHeat dari setiap heat → qualifyType 'Q'
  if (bestHeat > 0) {
    saringanHeats.forEach(heat => {
      ;(heat.peserta || [])
        .filter(isValid)
        .map(p => toEntry(p, heat))
        .sort(sortFn)
        .slice(0, bestHeat)
        .forEach(a => { if (!selected.has(getKey(a))) selected.set(getKey(a), { ...a, qualifyType: 'Q' }) })
    })
  }

  // Step 2: wildcard bestTime dari baki → qualifyType 'q'
  // HANYA atlet bermasa — tanpa masa tak boleh dibanding antara heat berbeza
  if (bestTime > 0) {
    const wildcards = []
    saringanHeats.forEach(heat => {
      ;(heat.peserta || []).filter(p => isValid(p) && adaMasa(p)).forEach(p => {
        if (!selected.has(getKey(p))) wildcards.push(toEntry(p, heat))
      })
    })
    wildcards
      .sort(sortFn)
      .slice(0, bestTime)
      .forEach(a => { if (!selected.has(getKey(a))) selected.set(getKey(a), { ...a, qualifyType: 'q' }) })
  }

  return [...selected.values()]
}

/**
 * Pembanding susunan finalis (rank terbaik dulu) — guna untuk seeding lorong.
 *   - Kedua-dua bermasa → ikut masa/jarak (seperti dulu)
 *   - Bermasa didahulukan atas Kddk sahaja
 *   - Sesama Kddk sahaja → Kddk kecil dulu (Kddk 1 semua heat setara), seri → heat awal
 */
export function bandingFinalis(a, b, isPadang = false) {
  const aM = Number(a.keputusan) > 0
  const bM = Number(b.keputusan) > 0
  if (aM && bM) return isPadang ? b.keputusan - a.keputusan : a.keputusan - b.keputusan
  if (aM !== bM) return aM ? -1 : 1
  return ((Number(a.kedudukan) || 99) - (Number(b.kedudukan) || 99))
    || ((a.noHeat || 0) - (b.noHeat || 0))
}

/**
 * Info gate untuk amaran panel Jana Final:
 *   wildcardDilangkau — Best Time > 0 tapi ada atlet Kddk sahaja (tak layak wildcard)
 */
export function infoWildcardTanpaMasa(heats, acara, finalSetup, fasa = 'toFinal') {
  const { bestTime } = getFinalistSetup(acara, finalSetup, fasa)
  if (!(bestTime > 0)) return false
  return heats.some(h => !['final', 'terus_final'].includes(h.fasa) && (h.peserta || []).some(p =>
    !['DNS', 'DNF', 'DQ'].includes(p.status) && !(Number(p.keputusan) > 0) && Number(p.kedudukan) > 0))
}

/**
 * Assign lorong kepada finalis mengikut prestasi.
 * Rank 1 → lorong 4, Rank 2 → lorong 5, dst.
 */
export function assignLorong(finalists, isPadang) {
  const ranked = [...finalists].sort((a, b) => bandingFinalis(a, b, isPadang))
  return ranked.map((f, i) => ({ ...f, lorong: LANE_ORDER[i] || (i + 1) }))
}

/**
 * Bahagi finalis kepada N heat mengikut serpentine seeding WA.
 *
 * Pattern zig-zag setiap 2:  H2, H1, H1, H2, H2, H1, H1, H2 ...
 * Tujuan: setiap heat mendapat campuran rank kuat + lemah — seimbang.
 *
 * @param {Array}  finalis   - tersusun ikut rank (rank 1 = index 0), dari selectFinalists
 * @param {number} bilHeat   - bilangan heat SF (biasanya 2)
 * @returns {Array[]} array of arrays — index 0 = heat 1, index 1 = heat 2, ...
 */
export function serpentineSeed(finalis, bilHeat) {
  if (bilHeat <= 1) return [finalis]
  const heats = Array.from({ length: bilHeat }, () => [])
  // Serpentine: setiap "blok" sebesar bilHeat, arah bertukar
  // blok genap: 0,1,2,...,bilHeat-1  (kiri→kanan)
  // blok ganjil: bilHeat-1,...,1,0   (kanan→kiri)
  finalis.forEach((f, i) => {
    const blok = Math.floor(i / bilHeat)
    const posInBlok = i % bilHeat
    const heatIdx = blok % 2 === 0 ? posInBlok : (bilHeat - 1 - posInBlok)
    heats[heatIdx].push(f)
  })
  return heats
}
