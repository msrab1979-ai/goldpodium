/**
 * startListPdfUtils.js
 * ────────────────────
 * Fungsi dikongsi antara StartList (admin) dan InputKeputusan (pencatat):
 *   - WA_LORONG_KUMPULAN_DEFAULT
 *   - deserializeKumpulan
 *   - detectJenisLorong
 *   - assignLorongFinal
 *   - katLabel
 *   - buatStartListPDFUnified
 */

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatPrestasiRekod, tahunRekod, lokasiRekod } from './rekodUtils'

// ─── Kumpulan lorong WA untuk FINAL ──────────────────────────────────────────
export const WA_LORONG_KUMPULAN_DEFAULT = {
  lurus:     [[3,4,5,6],[2,7],[1,8]],
  dua_ratus: [[5,6,7],[3,4,8],[1,2]],
  selekoh:   [[4,5,6,7],[3,8],[1,2]],
  // selekoh_800 guna kumpulan selekoh yang sama untuk final
}

// ─── Rules lorong untuk HEAT (saringan) ──────────────────────────────────────
// Urutan lorong yang dikosongkan apabila atlet < bilanganLorong
export const WA_LORONG_HEAT_REMOVE = {
  lurus:       [1, 8, 2, 7, 3, 6, 4, 5],   // 100m, berpagar
  dua_ratus:   [1, 2, 8, 4, 3, 5, 6, 7],   // 200m
  selekoh:     [1, 2, 8, 3, 4, 5, 6, 7],   // 400m, relay
  selekoh_800: [1, 2, 8, 7, 3, 4, 5, 6],   // 800m
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Deserialize kumpulan lorong dari Firestore (string → number array).
 * Firestore tidak sokong nested arrays → simpan sebagai "3,4,5,6".
 */
export function deserializeKumpulan(data) {
  if (!data || typeof data !== 'object') return null
  const out = {}
  Object.entries(data).forEach(([jenis, grps]) => {
    if (!Array.isArray(grps)) return
    out[jenis] = grps.map(s =>
      String(s).split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v))
    )
  })
  return out
}

/**
 * Auto-detect jenisLorong dari nama acara.
 * Priority: acara.jenisLorong (jika ada) → auto-detect dari nama.
 */
export function detectJenisLorong(acara) {
  if (acara.jenisLorong) return acara.jenisLorong
  const n = (acara.namaAcaraPendek || acara.namaAcara || '').toLowerCase()
  if (/\d\s*x\s*\d|relay/.test(n))          return 'selekoh'
  if (/\b200\s*m/.test(n))                   return 'dua_ratus'
  if (/\b800\b/.test(n))                     return 'selekoh_800'
  if (/\b400|\b1500|\b3000|\b5000/.test(n)) return 'selekoh'
  return 'lurus'
}

/**
 * Assign lorong FINAL mengikut WA — kumpulan undian rawak.
 * pesertaSorted: sudah disusun rank 1 = terbaik/terpantas.
 * jenisLorong: 'lurus' | 'dua_ratus' | 'selekoh'
 * lorongKumpulan: override kumpulan (dari wa_config), atau null untuk guna default.
 * kumpulanOverride: override terus (satu jenis sahaja).
 */
export function assignLorongFinal(pesertaSorted, jenisLorong, lorongKumpulan, kumpulanOverride) {
  const pool = lorongKumpulan || WA_LORONG_KUMPULAN_DEFAULT
  // selekoh_800 guna kumpulan selekoh untuk final (800m final biasanya mass start)
  const jenisEff = jenisLorong === 'selekoh_800' ? 'selekoh' : jenisLorong
  const kumpulan = kumpulanOverride || pool[jenisEff] || pool.lurus
  const result   = pesertaSorted.map(p => ({ ...p }))
  let rankIdx    = 0

  kumpulan.forEach(lanePool => {
    const count = Math.min(lanePool.length, result.length - rankIdx)
    if (count <= 0) return
    const shuffled = [...lanePool].sort(() => Math.random() - 0.5)
    for (let i = 0; i < count; i++) {
      result[rankIdx + i].lorong = shuffled[i]
    }
    rankIdx += count
  })

  return result.sort((a, b) => (a.lorong ?? 99) - (b.lorong ?? 99))
}

/**
 * Assign lorong HEAT — undian rawak dalam lorong tersedia.
 * Lorong dikosongkan ikut urutan WA mengikut jenisLorong + bilangan atlet.
 * lorongHeatRemove: override dari Firestore wa_config.lorongHeatRemove (optional)
 */
export function assignLorongHeat(peserta, jenisLorong, bilanganLorong = 8, lorongHeatRemove = null) {
  const n = peserta.length
  if (n === 0) return []

  const removeMap   = lorongHeatRemove || WA_LORONG_HEAT_REMOVE
  const removeOrder = removeMap[jenisLorong] || removeMap.lurus

  const allLanes  = Array.from({ length: bilanganLorong }, (_, i) => i + 1)
  const toRemove  = Math.max(0, bilanganLorong - n)
  const removedSet = new Set(removeOrder.slice(0, toRemove))
  const available  = allLanes.filter(l => !removedSet.has(l))

  // Undian rawak dalam lorong tersedia
  const shuffled = [...available].sort(() => Math.random() - 0.5)

  return peserta.map((p, i) => ({ ...p, lorong: shuffled[i] ?? null }))
    .sort((a, b) => (a.lorong ?? 99) - (b.lorong ?? 99))
}

/**
 * Bina label kategori dari kategoriList.
 */
export function katLabel(kod, kategoriList = []) {
  if (!kod) return '—'
  const kat = kategoriList.find(k => k.kod === kod)
  return kat?.label || kod
}

// ─── PDF Unified — Start List 4 Salinan ──────────────────────────────────────
// Setiap heat → 4 muka surat: Juruhebah | Call Room | Teknikal | Fail
// Salinan box (X) di header kanan. Kolum berbeza mengikut salinan.

export function buatStartListPDFUnified({
  acara, heats, namaKej, jadual, rekodDNK = { D: null, N: null, K: null },
  namaSekolahMap = {}, kategoriList = [], logoKiri = null, logoKanan = null,
  bibPrefixMap = {}, jumlahHeatTotal = null,
}) {
  const isPadang       = ['padang_lompat', 'padang_balin'].includes(acara.jenisAcara)
  const isMass         = acara.jenisAcara === 'mass_start'
  const isRelay        = acara.jenisAcara === 'relay'
  const bilanganCubaan = isPadang ? (acara.bilanganCubaan || 6) : 0

  const pdf = new jsPDF({ orientation: isPadang ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
  const M   = 12
  // Standard column widths — seragam untuk semua salinan & jenis acara
  // BIB sokong sehingga 5-6 character bold (PP21, RR08, WW123 dll) tanpa wrap
  const BIB_W = 22
  const BIB_STYLE = { cellWidth: BIB_W, halign: 'center', fontStyle: 'bold', overflow: 'visible' }
  const katLbl   = katLabel(acara.kategoriKod, kategoriList)
  const masa     = jadual?.masaMula || '—'
  const lokasi   = jadual?.lokasi   || '—'
  const tarikhLabel = jadual?.tarikhAcara
    ? new Date(jadual.tarikhAcara + 'T00:00:00').toLocaleDateString('ms-MY',
        { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '—'
  const peringkatLabel = acara.peringkat === 'saringan_qf' ? 'Saringan / QF'
    : acara.peringkat === 'saringan_sf' ? 'Saringan / SF'
    : acara.peringkat === 'separuh_akhir' ? 'Separuh Akhir'
    : acara.parentAcaraId ? `Final (← #${acara.parentAcaraId})`
    : 'Final'

  function imgFmt(b64) {
    if (!b64) return 'PNG'
    return (b64.startsWith('data:image/jpeg') || b64.startsWith('data:image/jpg')) ? 'JPEG' : 'PNG'
  }

  const SALINAN = [
    { id: 'juruhebah', label: 'JURUHEBAH', clr: [0,   51,  153] },
    { id: 'callroom',  label: 'CALL ROOM', clr: [0,   120,  50] },
    { id: 'teknikal',  label: 'TEKNIKAL',  clr: [160,  60,   0] },
    { id: 'fail',      label: 'FAIL',      clr: [70,   70,  70] },
  ]

  const PERINGKAT_LABEL = { D: 'Daerah', N: 'Negeri', K: 'Kebangsaan' }
  let isFirst = true

  for (const heat of heats) {
    const peserta = [...(heat.peserta || [])].sort((a, b) =>
      isPadang || isMass
        ? (a.giliran ?? 99) - (b.giliran ?? 99)
        : (a.lorong  ?? 99) - (b.lorong  ?? 99)
    )
    const jumlahHeat = jumlahHeatTotal ?? heats.filter(h => h.fasa !== 'final').length
    const fasaStr = heat.fasa === 'final'          ? 'FINAL'
                  : heat.fasa === 'saringan_qf'   ? `SARINGAN/QF ${heat.noHeat}/${jumlahHeat}`
                  : heat.fasa === 'saringan_sf'   ? `SARINGAN/SF ${heat.noHeat}/${jumlahHeat}`
                  : heat.fasa === 'separuh_akhir' ? `SEPARUH AKHIR ${heat.noHeat}/${jumlahHeat}`
                  : `HEAT ${heat.noHeat}/${jumlahHeat}`

    for (const sal of SALINAN) {
      const isTeknikal = sal.id === 'teknikal'
      if (!isFirst) {
        pdf.addPage(isPadang ? [297, 210] : [210, 297])
      }
      isFirst = false

      const W = pdf.internal.pageSize.getWidth()

      // ── Salinan checkbox (kanan atas) ────────────────────────────────────
      const boxW  = 38
      const boxX  = W - M - boxW
      const rowH  = 6.5
      const startY_box = 8

      SALINAN.forEach((s, i) => {
        const cy = startY_box + i * rowH
        const isThis = s.id === sal.id
        pdf.setDrawColor(0, 0, 0)
        pdf.setLineWidth(0.3)
        pdf.rect(boxX, cy, boxW, rowH)
        const cbX = boxX + 2, cbY = cy + 1.5, cbS = 3.5
        pdf.setDrawColor(0, 0, 0)
        pdf.setFillColor(255, 255, 255)
        pdf.rect(cbX, cbY, cbS, cbS, 'S')
        if (isThis) {
          pdf.setDrawColor(0, 0, 0)
          pdf.setLineWidth(0.7)
          pdf.line(cbX + 0.5, cbY + 1.8, cbX + 1.5, cbY + 2.8)
          pdf.line(cbX + 1.5, cbY + 2.8, cbX + 3.2, cbY + 0.7)
        }
        pdf.setLineWidth(0.3)
        pdf.setFont('helvetica', isThis ? 'bold' : 'normal')
        pdf.setFontSize(7.5)
        pdf.setTextColor(0, 0, 0)
        pdf.text(s.label, boxX + 7.5, cy + 4.3)
      })

      // ── Logo & teks header ────────────────────────────────────────────────
      const headerRight = boxX - 3
      const centerX = (M + 18 + headerRight) / 2
      let y = 10
      if (logoKiri) {
        try { pdf.addImage(logoKiri, imgFmt(logoKiri), M, y, 18, 18) } catch {}
      }
      if (logoKanan) {
        try { pdf.addImage(logoKanan, imgFmt(logoKanan), headerRight - 18, y, 18, 18) } catch {}
      }
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(11)
      pdf.setTextColor(0, 0, 0)
      pdf.text(namaKej || 'Kejohanan Olahraga Antara Murid', centerX, y + 7, { align: 'center' })
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'normal')
      pdf.text('START LIST', centerX, y + 13, { align: 'center' })
      pdf.setFontSize(8.5)
      pdf.setFont('helvetica', 'bold')
      pdf.text(
        `No. Acara : ${acara.noAcara || '—'}     |     Acara : ${acara.namaAcara}`,
        centerX, y + 19, { align: 'center' }
      )
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'normal')
      pdf.text(
        `Kategori : ${katLbl}     |     Peringkat : ${peringkatLabel}`,
        centerX, y + 25, { align: 'center' }
      )
      pdf.text(
        `${tarikhLabel}   |   Masa : ${masa}   |   Lokasi : ${lokasi}`,
        centerX, y + 31, { align: 'center' }
      )

      y = 44
      pdf.setDrawColor(0, 0, 0)
      pdf.setLineWidth(0.7)
      pdf.line(M, y, W - M, y)
      y += 3

      // ── Rekod DNK ─────────────────────────────────────────────────────────
      const rekodRows = ['D', 'N', 'K'].map(p => {
        const r = rekodDNK[p]
        if (!r) return [PERINGKAT_LABEL[p], '—', '—', '—', '—']
        return [
          PERINGKAT_LABEL[p],
          tahunRekod(r.tarikhRekod),
          formatPrestasiRekod(r.prestasi, r.unit),
          r.namaAtlet || '—',
          lokasiRekod(r),
        ]
      })
      autoTable(pdf, {
        startY: y,
        head: [['Rekod', 'Tahun', 'Prestasi', 'Nama Atlet', 'Catatan']],
        body: rekodRows,
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 1, lineColor: [0, 0, 0], lineWidth: 0.2, textColor: [0, 0, 0] },
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 7, lineColor: [0, 0, 0], lineWidth: 0.25 },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 20 },
          1: { halign: 'center', cellWidth: 14 },
          2: { halign: 'center', cellWidth: 24 },
          3: { cellWidth: 52 },
          4: { cellWidth: 'auto' },
        },
        margin: { left: M, right: M },
        tableLineColor: [0, 0, 0], tableLineWidth: 0.25,
      })
      y = pdf.lastAutoTable.finalY + 3

      // ── Heat header bar ───────────────────────────────────────────────────
      pdf.setDrawColor(0, 0, 0)
      pdf.setLineWidth(0.5)
      pdf.rect(M, y, W - M * 2, 9)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(10)
      pdf.setTextColor(0, 0, 0)
      pdf.text(`${fasaStr}  —  ${acara.namaAcara}`, M + 3, y + 6)
      pdf.setFontSize(8)
      pdf.text(isRelay ? `${peserta.length} pasukan` : `${peserta.length} peserta`, W - M - 3, y + 6, { align: 'right' })
      pdf.setTextColor(0, 0, 0)
      y += 11

      // ── Jadual atlet ──────────────────────────────────────────────────────
      let head, body, colStyles

      if (isPadang) {
        const c0 = 'Gil.'
        if (sal.id === 'juruhebah') {
          head = [[c0, 'No. BIB', 'Nama Atlet', 'Sekolah']]
          body = peserta.map(p => [
            p.giliran ?? '—', p.noBib, p.namaAtlet,
            namaSekolahMap[p.kodSekolah] || p.kodSekolah,
          ])
          colStyles = {
            0:{halign:'center',cellWidth:14}, 1:BIB_STYLE,
            2:{cellWidth:80,overflow:'linebreak'}, 3:{cellWidth:'auto',overflow:'linebreak'},
          }
        } else if (sal.id === 'callroom') {
          head = [[c0, 'No. BIB', 'Nama Atlet', 'Sekolah', 'Hadir (✓ / DNS)']]
          body = peserta.map(p => [
            p.giliran ?? '—', p.noBib, p.namaAtlet,
            namaSekolahMap[p.kodSekolah] || p.kodSekolah, '',
          ])
          colStyles = {
            0:{halign:'center',cellWidth:14}, 1:BIB_STYLE,
            2:{cellWidth:68,overflow:'linebreak'}, 3:{cellWidth:'auto',overflow:'linebreak'},
            4:{cellWidth:36},
          }
        } else {
          const isLompatTinggi = /lompat tinggi/i.test(acara.namaAcara || acara.namaAcaraPendek || '')
          if (isLompatTinggi) {
            // Format standard borang Lompat Tinggi MSSM
            // Columns: Gil | Nama Peserta | No. Peserta + Pasukan | Ketinggian (7×3) | Jumlah Gagal | Kedudukan | Catatan
            // BIB + Pasukan digabung jadi 1 column → ruang lebih untuk Jumlah Gagal/Kedudukan/Catatan horizontal
            const KET = 7, SUB = 3
            // Landscape 297mm - margin 8×2 = 281mm available
            // Gil(9) + Nama(40) + BIB/Pasukan(38) + 21sub(7×21=147) + JG(16) + Kdk(16) + Catatan(15) = 281mm ✅
            const gilW = 9, namaW = 40, bibPasukanW = 38
            const subW = 7, jgW = 16, kdkW = 16, catatanW = 15

            const headTallStyle = { valign: 'middle', halign: 'center', minCellHeight: 14 }
            head = [
              [
                { content: 'Gil',                       rowSpan: 3, styles: headTallStyle },
                { content: 'Nama Peserta',              rowSpan: 3, styles: headTallStyle },
                { content: 'No. Peserta\n/ Pasukan',    rowSpan: 3, styles: headTallStyle },
                { content: 'Ketinggian', colSpan: KET * SUB, styles: { halign: 'center', valign: 'middle' } },
                { content: 'Jumlah Gagal',              rowSpan: 3, styles: headTallStyle },
                { content: 'Kedudukan',                 rowSpan: 3, styles: headTallStyle },
                { content: 'Catatan',                   rowSpan: 3, styles: headTallStyle },
              ],
              Array.from({ length: KET }, () => ({
                content: '', colSpan: SUB, styles: { halign: 'center', valign: 'middle', minCellHeight: 9 },
              })),
              Array.from({ length: KET * SUB }, (_, i) => ({
                content: String((i % SUB) + 1),
                styles: { halign: 'center', fontSize: 7, fontStyle: 'bold' },
              })),
            ]
            body = peserta.map(p => [
              p.giliran ?? '—',
              p.namaAtlet || '—',
              // Marker @@LINE@@ = garisan datar pemisah dalam cell (didDrawCell hook)
              // Line kosong di tengah → ruang nafas atas/bawah garisan
              `@@LINE@@${p.noBib ?? '—'}\n \n${namaSekolahMap[p.kodSekolah] || p.kodSekolah || ''}`,
              ...Array(KET * SUB).fill(''),
              '', // Jumlah Gagal
              '', // Kedudukan
              '', // Catatan
            ])
            colStyles = {
              0: { halign: 'center', cellWidth: gilW, valign: 'middle' },
              1: { cellWidth: namaW, fontStyle: 'bold', valign: 'middle', overflow: 'linebreak' },
              2: { halign: 'center', cellWidth: bibPasukanW, fontStyle: 'bold', valign: 'middle', overflow: 'linebreak' },
              ...Object.fromEntries(
                Array.from({ length: KET * SUB }, (_, i) => [
                  i + 3, { halign: 'center', cellWidth: subW, valign: 'middle' },
                ])
              ),
              [3 + KET * SUB]: { halign: 'center', cellWidth: jgW, valign: 'middle', fontStyle: 'bold' },
              [4 + KET * SUB]: { halign: 'center', cellWidth: kdkW, valign: 'middle', fontStyle: 'bold' },
              [5 + KET * SUB]: { halign: 'center', cellWidth: catatanW, valign: 'middle' },
            }
          } else {
            // Acara padang JARAK (Lompat Jauh, Lompat Kijang, Lontar Peluru, Lontar Cakera, Rejam Lembing, Lontar Tukul)
            // Format: Gil | Nama | BIB | Pasukan | Percubaan(1-3) | Percubaan Terbaik | Percubaan(4-6) | Percubaan Terbaik | Kdk | Cat
            const adaSplit = bilanganCubaan >= 6
            const cubaanAwal = adaSplit ? 3 : bilanganCubaan
            const cubaanFinal = adaSplit ? bilanganCubaan - 3 : 0
            // Landscape 297mm - margin 8×2 = 281mm available
            // Gil(8)+Nama(30)+BIB(16)+Pasukan(22)+3sub(20×3=60)+Best1(20)+3sub(20×3=60)+Best2(20)+Kdk(22)+Cat(22) = 280mm ✅
            // Sub Percubaan 20mm, Kdk 22mm + Cat 22mm (header "Kedudukan"/"Catatan" muat satu baris)
            const gilW = 8, bibW = 16, namaW = 30, pasukanW = 22
            const cW = adaSplit ? 20 : 28
            const terbaikW = 20, kdkW = 22, catatanW = 22

            // Marker '@@ROT@@' = text rotated 90° dalam didDrawCell hook
            const headRow1 = [
              { content: 'Gil', rowSpan: 2, styles: { valign: 'middle', halign: 'center', minCellHeight: 22 } },
              { content: 'Nama Peserta', rowSpan: 2, styles: { valign: 'middle', halign: 'center', minCellHeight: 22 } },
              { content: 'No. Peserta', rowSpan: 2, styles: { valign: 'middle', halign: 'center', minCellHeight: 22 } },
              { content: 'Pasukan', rowSpan: 2, styles: { valign: 'middle', halign: 'center', minCellHeight: 22 } },
              { content: 'Percubaan (m)', colSpan: cubaanAwal, styles: { halign: 'center' } },
            ]
            if (adaSplit) {
              headRow1.push(
                { content: 'Percubaan Terbaik', rowSpan: 2, styles: { valign: 'middle', halign: 'center', fontStyle: 'bold', minCellHeight: 22 } },
                { content: 'Percubaan (m)', colSpan: cubaanFinal, styles: { halign: 'center' } },
                { content: 'Percubaan Terbaik', rowSpan: 2, styles: { valign: 'middle', halign: 'center', fontStyle: 'bold', minCellHeight: 22 } },
              )
            }
            headRow1.push(
              { content: 'Kedudukan', rowSpan: 2, styles: { valign: 'middle', halign: 'center', minCellHeight: 22 } },
              { content: 'Catatan', rowSpan: 2, styles: { valign: 'middle', halign: 'center', minCellHeight: 22 } },
            )

            const headRow2 = []
            for (let i = 0; i < cubaanAwal; i++) {
              headRow2.push({ content: String(i + 1), styles: { halign: 'center' } })
            }
            for (let i = 0; i < cubaanFinal; i++) {
              headRow2.push({ content: String(cubaanAwal + i + 1), styles: { halign: 'center' } })
            }
            head = [headRow1, headRow2]

            body = peserta.map(p => {
              const row = [
                p.giliran ?? '—',
                p.namaAtlet || '—',
                p.noBib ?? '—',
                namaSekolahMap[p.kodSekolah] || p.kodSekolah || '—',
                ...Array(cubaanAwal).fill(''),
              ]
              if (adaSplit) {
                row.push('') // Percubaan Terbaik (awal)
                row.push(...Array(cubaanFinal).fill(''))
                row.push('') // Percubaan Terbaik (akhir)
              }
              row.push('') // Kedudukan
              row.push('') // Catatan
              return row
            })

            colStyles = {
              0: { halign: 'center', cellWidth: gilW, valign: 'middle' },
              1: { cellWidth: namaW, fontStyle: 'bold', valign: 'middle', overflow: 'linebreak' },
              2: { halign: 'center', cellWidth: bibW, fontStyle: 'bold', valign: 'middle', overflow: 'visible' },
              3: { cellWidth: pasukanW, valign: 'middle', overflow: 'linebreak' },
            }
            let colIdx = 4
            // Percubaan 1-3
            for (let i = 0; i < cubaanAwal; i++) {
              colStyles[colIdx++] = { halign: 'center', cellWidth: cW, valign: 'middle' }
            }
            if (adaSplit) {
              // Percubaan Terbaik (awal) — garis tebal kiri (separator dari awal)
              colStyles[colIdx++] = {
                halign: 'center', cellWidth: terbaikW, valign: 'middle',
                fontStyle: 'bold',
                lineWidth: { left: 0.8, top: 0.25, bottom: 0.25, right: 0.25 },
              }
              // Percubaan 4-6
              for (let i = 0; i < cubaanFinal; i++) {
                colStyles[colIdx++] = { halign: 'center', cellWidth: cW, valign: 'middle' }
              }
              // Percubaan Terbaik (akhir) — garis tebal kiri sahaja (separator dari final)
              colStyles[colIdx++] = {
                halign: 'center', cellWidth: terbaikW, valign: 'middle',
                fontStyle: 'bold',
                lineWidth: { left: 0.8, top: 0.25, bottom: 0.25, right: 0.25 },
              }
            }
            colStyles[colIdx++] = { halign: 'center', cellWidth: kdkW, valign: 'middle', fontStyle: 'bold' }
            colStyles[colIdx] = { halign: 'center', cellWidth: catatanW, valign: 'middle' }
          }
        }
      } else if (isRelay) {
        const getBib = p => bibPrefixMap[p.kodSekolah] || p.kodSekolah || '—'
        if (sal.id === 'juruhebah') {
          head = [['Lrg', 'Sekolah / Pasukan', 'No BIB']]
          body = peserta.map(p => [
            p.lorong ?? '—',
            namaSekolahMap[p.kodSekolah] || p.kodSekolah,
            getBib(p),
          ])
          colStyles = { 0:{halign:'center',cellWidth:14}, 1:{cellWidth:'auto'}, 2:{halign:'center',cellWidth:40,fontStyle:'bold',overflow:'visible'} }
        } else if (sal.id === 'callroom') {
          head = [['Lrg', 'Sekolah / Pasukan', 'No BIB', 'Hadir (✓ / DNS)']]
          body = peserta.map(p => [
            p.lorong ?? '—',
            namaSekolahMap[p.kodSekolah] || p.kodSekolah,
            getBib(p),
            '',
          ])
          colStyles = { 0:{halign:'center',cellWidth:14}, 1:{cellWidth:'auto'}, 2:{halign:'center',cellWidth:40,fontStyle:'bold',overflow:'visible'}, 3:{cellWidth:44} }
        } else {
          head = [['Lrg', 'Sekolah / Pasukan', 'No BIB', 'Masa', 'Keputusan']]
          body = peserta.map(p => [
            p.lorong ?? '—',
            namaSekolahMap[p.kodSekolah] || p.kodSekolah,
            getBib(p),
            '', '',
          ])
          colStyles = {
            0:{halign:'center',cellWidth:14}, 1:{cellWidth:'auto'},
            2:{halign:'center',cellWidth:40,fontStyle:'bold',overflow:'visible'},
            3:{cellWidth:32}, 4:{cellWidth:32},
          }
        }
      } else {
        const c0 = isMass ? 'Bil' : 'Lrg'
        const getPos = p => isMass ? (p.giliran ?? '—') : (p.lorong ?? '—')
        const isFinal = heat.fasa === 'final'
        if (sal.id === 'juruhebah') {
          if (isFinal && !isMass) {
            // Final: tambah kolum H (Heat asal) dan Q (Kelayakan)
            head = [[c0, 'No. BIB', 'Nama Atlet', 'Sekolah', 'H', 'Q']]
            body = peserta.map(p => [
              getPos(p), p.noBib, p.namaAtlet,
              namaSekolahMap[p.kodSekolah] || p.kodSekolah,
              p.noHeat ? `H${p.noHeat}` : (p._dariHeat ? `H${p._dariHeat}` : '—'),
              p.qualifyType || p._qualifyType || '—',
            ])
            colStyles = {
              0:{halign:'center',cellWidth:14}, 1:BIB_STYLE,
              2:{cellWidth:68,overflow:'linebreak'}, 3:{cellWidth:'auto',overflow:'linebreak'},
              4:{halign:'center',cellWidth:12}, 5:{halign:'center',cellWidth:10, fontStyle:'bold'},
            }
          } else {
            head = [[c0, 'No. BIB', 'Nama Atlet', 'Sekolah']]
            body = peserta.map(p => [
              getPos(p), p.noBib, p.namaAtlet,
              namaSekolahMap[p.kodSekolah] || p.kodSekolah,
            ])
            colStyles = {
              0:{halign:'center',cellWidth:14}, 1:BIB_STYLE,
              2:{cellWidth:80,overflow:'linebreak'}, 3:{cellWidth:'auto',overflow:'linebreak'},
            }
          }
        } else if (sal.id === 'callroom') {
          head = [[c0, 'No. BIB', 'Nama Atlet', 'Sekolah', 'Hadir (✓ / DNS)']]
          body = peserta.map(p => [
            getPos(p), p.noBib, p.namaAtlet,
            namaSekolahMap[p.kodSekolah] || p.kodSekolah, '',
          ])
          colStyles = {
            0:{halign:'center',cellWidth:14}, 1:BIB_STYLE,
            2:{cellWidth:68,overflow:'linebreak'}, 3:{cellWidth:'auto',overflow:'linebreak'},
            4:{cellWidth:36},
          }
        } else {
          head = [[c0, 'No. BIB', 'Nama Atlet', 'Sekolah', 'Masa', 'Keputusan']]
          body = peserta.map(p => [
            getPos(p), p.noBib, p.namaAtlet,
            namaSekolahMap[p.kodSekolah] || p.kodSekolah,
            '', '',
          ])
          colStyles = {
            0:{halign:'center',cellWidth:14}, 1:BIB_STYLE,
            2:{cellWidth:60,overflow:'linebreak'}, 3:{cellWidth:'auto',overflow:'linebreak'},
            4:{cellWidth:30}, 5:{cellWidth:30},
          }
        }
      }

      const isTeknikalPadang = isPadang && isTeknikal
      const isLompatTinggiPdf = isPadang && /lompat tinggi/i.test(acara.namaAcara || acara.namaAcaraPendek || '')
      const isLompatTinggiTeknikal = isLompatTinggiPdf && isTeknikal
      const isPadangBiasaTeknikal = isPadang && isTeknikal && !isLompatTinggiPdf && bilanganCubaan >= 6
      // Safe margin 8mm minimum — printer non-printable area ~5mm
      const tableMargin = isLompatTinggiTeknikal ? 8
        : isPadangBiasaTeknikal ? 8
        : (isLompatTinggiPdf ? 8 : M)
      // Untuk Padang Teknikal: kira row height supaya semua peserta muat dalam 1 page
      // Available height: A4 landscape 210mm - header(~80mm) - footer(~30mm) = ~100mm
      // Bahagikan ikut bilangan peserta
      const tableAvailableH = isPadang ? 95 : 150
      const dynamicRowH = isPadangBiasaTeknikal && peserta.length > 0
        ? Math.max(9, Math.min(14, tableAvailableH / peserta.length))
        : null

      autoTable(pdf, {
        startY: y,
        head,
        body,
        theme: 'grid',
        rowPageBreak: 'avoid',
        styles: isLompatTinggiTeknikal
          ? {
              fontSize: 8, cellPadding: { top: 2, right: 0.5, bottom: 2, left: 0.5 },
              minCellHeight: 16, overflow: 'linebreak',
              lineColor: [0, 0, 0], lineWidth: 0.25,
              textColor: [0, 0, 0],
            }
          : isPadangBiasaTeknikal
          ? {
              fontSize: 8, cellPadding: { top: 1.5, right: 1, bottom: 1.5, left: 1 },
              minCellHeight: dynamicRowH, overflow: 'linebreak',
              lineColor: [0, 0, 0], lineWidth: 0.25,
              textColor: [0, 0, 0],
            }
          : isTeknikalPadang
          ? {
              fontSize: 8, cellPadding: { top: 3, right: 1, bottom: 3, left: 1 },
              minCellHeight: 14, overflow: 'linebreak',
              lineColor: [0, 0, 0], lineWidth: 0.25,
            }
          : {
              fontSize: 12, cellPadding: 3, minCellHeight: 12,
              lineColor: [0, 0, 0], lineWidth: 0.2,
            },
        headStyles: {
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 10,
          cellPadding: 2, halign: 'center',
          lineColor: [0, 0, 0], lineWidth: 0.3,
        },
        alternateRowStyles: {},
        columnStyles: colStyles,
        margin: { left: tableMargin, right: tableMargin, bottom: 28 },
        tableLineColor: [0, 0, 0],
        tableLineWidth: 0.4,
        // Hook: strip marker text @@ROT@@ (header) atau @@LINE@@ (body) sebelum draw
        willDrawCell: (data) => {
          if (data.section === 'head' && typeof data.cell.raw === 'object'
              && typeof data.cell.raw?.content === 'string'
              && data.cell.raw.content.startsWith('@@ROT@@')) {
            data.cell.text = ['']
          }
          if (data.section === 'body' && typeof data.cell.raw === 'string'
              && data.cell.raw.startsWith('@@LINE@@')) {
            // Buang marker — text jadi 3 baris: BIB | <space> | Sekolah
            const clean = data.cell.raw.replace('@@LINE@@', '')
            data.cell.text = clean.split('\n')
          }
        },
        didDrawCell: (data) => {
          // Header rotated text (Lompat Tinggi version lama, tinggal untuk safety)
          if (data.section === 'head') {
            const raw = data.cell.raw
            if (typeof raw !== 'object' || typeof raw?.content !== 'string') return
            if (!raw.content.startsWith('@@ROT@@')) return
            const label = raw.content.replace('@@ROT@@', '')
            const cx = data.cell.x + data.cell.width / 2
            const cyBottom = data.cell.y + data.cell.height - 2
            pdf.saveGraphicsState && pdf.saveGraphicsState()
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(8)
            pdf.setTextColor(0, 0, 0)
            pdf.text(label, cx, cyBottom, { align: 'left', baseline: 'middle', angle: 90 })
            pdf.restoreGraphicsState && pdf.restoreGraphicsState()
            return
          }
          // Body cell BIB+Pasukan (Lompat Tinggi) — lukis garisan datar di tengah cell
          if (data.section === 'body' && typeof data.cell.raw === 'string'
              && data.cell.raw.startsWith('@@LINE@@')) {
            const { x, y, width, height } = data.cell
            const midY = y + height / 2
            pdf.setDrawColor(0, 0, 0)
            pdf.setLineWidth(0.25)
            // Garisan padding 2mm dari tepi kiri & kanan
            pdf.line(x + 2, midY, x + width - 2, midY)
          }
        },
      })

      // ── Footer tandatangan ────────────────────────────────────────────────
      const H = pdf.internal.pageSize.getHeight()
      const footY = H - 24
      pdf.setDrawColor(0, 0, 0)
      pdf.setLineWidth(0.4)
      pdf.line(M, footY, W - M, footY)
      pdf.setTextColor(0, 0, 0)

      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(8)
      pdf.text('Angin:', M, footY + 7)
      pdf.setDrawColor(100, 100, 100)
      pdf.setLineWidth(0.3)
      pdf.rect(M + 13, footY + 2.5, 24, 8)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7)
      pdf.text('m/s', M + 38.5, footY + 7.5)

      const sig1X = M + 55, sig2X = M + 120, sigW = 58, sigH = 11
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(7.5)
      pdf.text('Pegawai Teknikal:', sig1X, footY + 4)
      pdf.setFont('helvetica', 'normal')
      pdf.setDrawColor(100, 100, 100)
      pdf.rect(sig1X, footY + 5, sigW, sigH)

      pdf.setFont('helvetica', 'bold')
      pdf.text('Pengadil Ketua:', sig2X, footY + 4)
      pdf.setFont('helvetica', 'normal')
      pdf.rect(sig2X, footY + 5, sigW, sigH)

      const dicetak = new Date().toLocaleString('ms-MY', {
        timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: 'short',
        year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
      pdf.setFontSize(6.5)
      pdf.setTextColor(150, 150, 150)
      pdf.text(`Dicetak: ${dicetak}   |   ${heat.heatId || 'final'}`, M, H - 5)
      pdf.setTextColor(0, 0, 0)
    }
  }

  return pdf
}
