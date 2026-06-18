/**
 * sijilPencapaianUtils.js
 * ───────────────────────
 * Helper untuk Sijil Pencapaian KOAM.
 *
 * Sumber data utama: collection `mata_olahragawan/{noKP}_{kejId}` —
 * sudah disimpan oleh runPostRasmi() bila keputusan rasmi direkod.
 *
 * Setiap field `acaraDetail_{acaraId}` mengandungi:
 *   { aceraId, namaAcara, pingat, mata, rank, prestasi, unit }
 *
 * Sijil dijana HANYA untuk atlet yang ada acaraDetail dengan
 * rank ≤ hadKedudukan (default 5). Acara berpasukan (relay) buat masa
 * ini TIDAK termasuk kerana runPostRasmi tak tulis ke mata_olahragawan
 * untuk relay (noKP tiada). Future work: fetch dari heat docs.
 */

import jsPDF from 'jspdf'
import {
  collection, getDocs, query, where,
} from 'firebase/firestore'

const W = 210, H = 297  // A4 portrait mm

// ─── Label kedudukan ──────────────────────────────────────────────────────────

const LABEL_KEDUDUKAN = {
  1: 'JOHAN',
  2: 'NAIB JOHAN',
  3: 'KETIGA',
  4: 'KEEMPAT',
  5: 'KELIMA',
  6: 'KEENAM',
  7: 'KETUJUH',
  8: 'KELAPAN',
  9: 'KESEMBILAN',
  10: 'KESEPULUH',
}

export function labelKedudukan(rank) {
  return LABEL_KEDUDUKAN[rank] || `KE-${rank}`
}

// ─── Senarai pencapaian per atlet ─────────────────────────────────────────────

/**
 * Ambil senarai pencapaian INDIVIDU dari mata_olahragawan.
 * Filter: rank ≤ hadKedudukan, kodSekolah match (optional).
 */
async function ambilSenaraiIndividu(db, kejId, hadKedudukan, kodSekolah) {
  let q = query(
    collection(db, 'mata_olahragawan'),
    where('kejohananId', '==', kejId),
  )
  if (kodSekolah) {
    q = query(
      collection(db, 'mata_olahragawan'),
      where('kejohananId', '==', kejId),
      where('kodSekolah', '==', kodSekolah),
    )
  }
  const snap = await getDocs(q)
  const senarai = []

  for (const docSnap of snap.docs) {
    const d = docSnap.data()
    const acaraDetails = Object.entries(d)
      .filter(([k]) => k.startsWith('acaraDetail_'))
      .map(([k, v]) => ({ ...v, acaraId: v.aceraId || k.replace('acaraDetail_', '') }))

    for (const ad of acaraDetails) {
      if (!ad.rank || ad.rank > hadKedudukan) continue
      senarai.push({
        noKP:        d.noKP,
        namaAtlet:   d.namaAtlet   || '',
        kodSekolah:  d.kodSekolah  || '',
        namaSekolah: d.namaSekolah || '',
        kategoriKod: d.kategoriKod || '',
        jantina:     d.jantina     || '',
        namaAcara:   ad.namaAcara  || '',
        rank:        ad.rank,
        pingat:      ad.pingat     || '',
        prestasi:    ad.prestasi   ?? null,
        unit:        ad.unit       || '',
        acaraId:     ad.acaraId,
        isRelay:     false,
      })
    }
  }
  return senarai
}

/**
 * Ambil senarai pencapaian RELAY — scan acara dengan jenisAcara='relay'.
 * Setiap ahli pasukan dapat 1 sijil berasingan.
 *
 * Sumber: kejohanan/{kejId}/acara/{noAcara}/heat/{heatId}
 *   Filter:
 *     - acara.jenisAcara === 'relay'
 *     - heat.fasa IN ('final', 'terus_final')
 *     - heat.statusKeputusan IN ('rasmi', 'diterima')
 *     - peserta.rankDalamHeat ≤ hadKedudukan
 *     - peserta.status TIDAK 'DNS'/'DNF'/'DQ'
 *     - peserta.kodSekolah === kodSekolah (kalau filter)
 *   Loop ahliPasukan[] → satu entry per atlet
 */
async function ambilSenaraiRelay(db, kejId, hadKedudukan, kodSekolah) {
  const senarai = []
  const acaraSnap = await getDocs(
    query(
      collection(db, 'kejohanan', kejId, 'acara'),
      where('jenisAcara', '==', 'relay'),
    )
  )

  for (const acaraDoc of acaraSnap.docs) {
    const acara = acaraDoc.data()
    const namaAcara = acara.namaAcara || acaraDoc.id

    const heatSnap = await getDocs(
      collection(db, 'kejohanan', kejId, 'acara', acaraDoc.id, 'heat')
    )

    for (const heatDoc of heatSnap.docs) {
      const heat = heatDoc.data()
      const isFinal = ['final', 'terus_final'].includes(heat.fasa)
      const isRasmi = ['rasmi', 'diterima'].includes(heat.statusKeputusan)
      if (!isFinal || !isRasmi) continue

      const peserta = heat.peserta || []
      for (const p of peserta) {
        const rank = p.rankDalamHeat || p.rank
        if (!rank || rank > hadKedudukan) continue
        if (['DNS', 'DNF', 'DQ'].includes(p.status)) continue
        if (kodSekolah && p.kodSekolah !== kodSekolah) continue
        if (!Array.isArray(p.ahliPasukan) || p.ahliPasukan.length === 0) continue

        const pingat = { 1: 'emas', 2: 'perak', 3: 'gangsa', 4: 'tempat4', 5: 'tempat5' }[rank] || ''
        for (const ahli of p.ahliPasukan) {
          if (!ahli.namaAtlet && !ahli.noKP) continue
          senarai.push({
            noKP:        ahli.noKP      || '',
            namaAtlet:   ahli.namaAtlet || '',
            kodSekolah:  p.kodSekolah   || '',
            namaSekolah: p.namaSekolah  || '',
            kategoriKod: ahli.kategoriKod || acara.kategoriKod || '',
            jantina:     acara.jantina  || '',
            namaAcara,
            rank,
            pingat,
            prestasi:    p.keputusan    ?? null,
            unit:        's',
            acaraId:     acaraDoc.id,
            isRelay:     true,
          })
        }
      }
    }
  }
  return senarai
}

/**
 * Ambil senarai PENUH pencapaian (individu + relay).
 * Filter: rank ≤ hadKedudukan, kodSekolah match (optional).
 *
 * @param {object} db Firestore db
 * @param {string} kejId Kejohanan ID
 * @param {number} hadKedudukan Maximum rank yang layak (1-10)
 * @param {string|null} kodSekolah Filter sekolah, null = semua
 */
export async function ambilSenaraiPencapaian(db, kejId, hadKedudukan = 5, kodSekolah = null) {
  const [individu, relay] = await Promise.all([
    ambilSenaraiIndividu(db, kejId, hadKedudukan, kodSekolah),
    ambilSenaraiRelay(db, kejId, hadKedudukan, kodSekolah),
  ])
  const senarai = [...individu, ...relay]

  return senarai.sort((a, b) => {
    const c = (a.namaAtlet || '').localeCompare(b.namaAtlet || '', 'ms')
    if (c !== 0) return c
    return (a.rank || 99) - (b.rank || 99)
  })
}

// ─── PDF generator ────────────────────────────────────────────────────────────

/**
 * Jana 1 sijil pencapaian PDF.
 *
 * @param {object} data { namaAtlet, namaSekolah, namaAcara, rank }
 * @param {object} cfg tetapan/sijilPencapaian
 * @returns {jsPDF}
 */
export function janaSijilPencapaianPDF(data, cfg) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const {
    templateImg,
    posisi = {},
    style  = {},
    namaKejohanan = '',
    tarikhKejohanan = '',
    tempatKejohanan = [],
  } = cfg

  if (templateImg) pdf.addImage(templateImg, 'JPEG', 0, 0, W, H)

  function lukis(teks, pos, sty) {
    if (!pos || !teks) return
    pdf.setFontSize(sty.size || 24)
    pdf.setTextColor(sty.warna || '#000000')
    pdf.setFont('helvetica', sty.bold !== false ? 'bold' : 'normal')
    pdf.text(String(teks), pos.x * W / 100, pos.y * H / 100, { align: sty.align || 'center' })
  }

  function lukisMultiBaris(teksArr, pos, sty) {
    if (!pos || !teksArr || teksArr.length === 0) return
    const size = sty.size || 18
    const lineHeight = size * 0.42  // mm per line — adjust untuk spacing
    pdf.setFontSize(size)
    pdf.setTextColor(sty.warna || '#000000')
    pdf.setFont('helvetica', sty.bold !== false ? 'bold' : 'normal')
    teksArr.forEach((line, i) => {
      if (!line) return
      pdf.text(String(line), pos.x * W / 100, pos.y * H / 100 + i * lineHeight, { align: sty.align || 'center' })
    })
  }

  lukis(data.namaAtlet,            posisi.nama,        style.nama        || {})
  lukis(data.namaAcara,            posisi.acara,       style.acara       || {})
  lukis(labelKedudukan(data.rank),  posisi.kedudukan,   style.kedudukan   || {})
  lukis(namaKejohanan,             posisi.kejohanan,   style.kejohanan   || {})
  lukis(tarikhKejohanan,           posisi.tarikh,      style.tarikh      || {})
  lukisMultiBaris(tempatKejohanan, posisi.tempat,      style.tempat      || {})

  return pdf
}

// ─── Nama fail ────────────────────────────────────────────────────────────────

export function namaFailPencapaian(namaAtlet, namaAcara, rank) {
  const nama  = (namaAtlet || 'atlet').replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_').toUpperCase()
  const acara = (namaAcara  || 'acara').replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_').toUpperCase()
  return `SIJIL_${nama}_${acara}_R${rank}.pdf`
}
