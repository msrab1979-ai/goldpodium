import jsPDF from 'jspdf'

export function janaSijilPDF(namaAtlet, sijilCfg) {
  const {
    templateImg,
    posNama, posKejohanan, posTarikh,
    styleNama = {}, styleKejohanan = {}, styleTarikh = {},
    namaKejohanan = '', tarikhKejohanan = '',
  } = sijilCfg

  // Saiz halaman ikut nisbah template (lalai A4 portrait 210×297) supaya
  // imej tidak herot dan kedudukan % sepadan dengan preview drag admin
  let W = 210, H = 297
  if (templateImg) {
    try {
      const { width, height } = new jsPDF().getImageProperties(templateImg)
      if (width >= height) { H = 210; W = +(210 * width / height).toFixed(2) }
      else                 { W = 210; H = +(210 * height / width).toFixed(2) }
    } catch { /* imej tidak dapat dibaca — kekal A4 */ }
  }

  const pdf = new jsPDF({
    orientation: W > H ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [W, H],
  })
  if (templateImg) pdf.addImage(templateImg, 'JPEG', 0, 0, W, H)

  function lukis(teks, pos, style) {
    if (!pos || !teks) return
    pdf.setFontSize(style.size || 24)
    pdf.setTextColor(style.warna || '#000000')
    pdf.setFont('helvetica', style.bold !== false ? 'bold' : 'normal')
    // baseline 'middle' — preview admin center teks menegak pada titik y
    pdf.text(teks, pos.x * W / 100, pos.y * H / 100, { align: style.align || 'center', baseline: 'middle' })
  }

  lukis(namaAtlet,       posNama,      styleNama)
  lukis(namaKejohanan,   posKejohanan, styleKejohanan)
  lukis(tarikhKejohanan, posTarikh,    styleTarikh)
  return pdf
}

export function namaFail(nama, noBib) {
  const bersih = (nama || 'atlet').replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_').toUpperCase()
  return `SIJIL_${bersih}${noBib ? '_' + noBib : ''}.pdf`
}
