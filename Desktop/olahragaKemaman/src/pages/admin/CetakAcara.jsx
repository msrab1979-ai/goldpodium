/**
 * CetakAcara.jsx — Slip Hadiah + Kertas Juruhebah
 *
 * Workflow:
 *   1. Browse jadual ikut hari
 *   2. Pilih No Acara
 *   3. Satu butang → 2 PDF serentak (Slip Hadiah + Kertas Juruhebah)
 *
 * Roles: superadmin, admin, urusetia, pencatat
 */

import { useState, useEffect } from 'react'
import {
  collection, getDocs, getDoc, doc, query, where, orderBy,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rekodKeyStr(namaAcara, jantina, kategoriKod, peringkat) {
  return [namaAcara, jantina, kategoriKod, peringkat]
    .join('_').toUpperCase().replace(/[^A-Z0-9_]/g, '_')
}

function formatPrestasi(val, jenisAcara) {
  if (val == null || val === '') return '—'
  const n = Number(val)
  if (isNaN(n)) return String(val)
  const isPadang = ['padang_lompat', 'padang_balin'].includes(jenisAcara)
  if (isPadang) return `${n.toFixed(2)} m`
  // masa dalam saat
  const min = Math.floor(n / 60)
  const sek = (n % 60).toFixed(2).padStart(5, '0')
  return min > 0 ? `${min}:${sek}` : `${Number(sek).toFixed(2)}s`
}

function tempatLabel(rank) {
  if (rank === 1) return '🥇 1'
  if (rank === 2) return '🥈 2'
  if (rank === 3) return '🥉 3'
  return String(rank)
}

function formatTarikhMY(tarikhStr) {
  if (!tarikhStr) return ''
  const d = new Date(tarikhStr)
  return d.toLocaleDateString('ms-MY', { day: '2-digit', month: 'long', year: 'numeric' })
}

// ─── PDF: Slip Hadiah ─────────────────────────────────────────────────────────

function cetakSlipHadiah({ acara, pesertaFinal, rekodSemasa, rekodTuntutan, cfg, namaKej }) {
  const pdf  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const M = 15 // margin

  let y = M

  // ── Logo ──
  const logoH = 18
  if (cfg.logoKiriBase64) {
    try { pdf.addImage(cfg.logoKiriBase64, 'PNG', M, y, logoH, logoH) } catch {}
  }
  if (cfg.logoKananBase64) {
    try { pdf.addImage(cfg.logoKananBase64, 'PNG', pageW - M - logoH, y, logoH, logoH) } catch {}
  }

  // ── Nama Kejohanan ──
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'bold')
  pdf.text(namaKej || 'Kejohanan Olahraga', pageW / 2, y + 6, { align: 'center' })
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.text('SLIP HADIAH', pageW / 2, y + 12, { align: 'center' })

  y += logoH + 4

  // ── Garisan ──
  pdf.setDrawColor(0, 51, 153)
  pdf.setLineWidth(0.5)
  pdf.line(M, y, pageW - M, y)
  y += 5

  // ── Maklumat Acara ──
  pdf.setFontSize(12)
  pdf.setFont('helvetica', 'bold')
  pdf.text(`No. ${acara.noAcara || '—'} — ${acara.namaAcara}`, pageW / 2, y, { align: 'center' })
  y += 6
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.text(
    `Kategori ${acara.kategoriKod} · ${acara.jantina === 'L' ? 'Lelaki' : 'Perempuan'}`,
    pageW / 2, y, { align: 'center' }
  )
  y += 6

  pdf.setDrawColor(200, 200, 200)
  pdf.setLineWidth(0.2)
  pdf.line(M, y, pageW - M, y)
  y += 5

  // ── Keputusan Final ──
  const rows = pesertaFinal.map(p => [
    tempatLabel(p.rankDalamHeat),
    p.namaAtlet || '—',
    p.namaSekolah || p.kodSekolah || '—',
    formatPrestasi(p.keputusan, acara.jenisAcara),
  ])

  autoTable(pdf, {
    startY: y,
    head: [['Tempat', 'Nama Atlet', 'Sekolah', 'Prestasi']],
    body: rows,
    styles: { fontSize: 10, cellPadding: 3 },
    headStyles: { fillColor: [0, 51, 153], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    alternateRowStyles: { fillColor: [245, 247, 255] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 18, fontStyle: 'bold' },
      1: { fontStyle: 'bold', cellWidth: 60 },
      2: { cellWidth: 70 },
      3: { halign: 'center', cellWidth: 'auto' },
    },
    margin: { left: M, right: M },
    tableLineColor: [200, 200, 200],
    tableLineWidth: 0.2,
    didDrawCell: (data) => {
      // Bold nama untuk tempat 1-3
      if (data.section === 'body' && data.column.index === 1 && data.row.index < 3) {
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  y = pdf.lastAutoTable.finalY + 6

  // ── Rekod ──
  if (rekodTuntutan || rekodSemasa) {
    pdf.setDrawColor(200, 200, 200)
    pdf.line(M, y, pageW - M, y)
    y += 5

    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'bold')

    if (rekodTuntutan) {
      pdf.setTextColor(220, 50, 50)
      pdf.text(
        `★ REKOD BARU: ${formatPrestasi(rekodTuntutan.prestasi, acara.jenisAcara)}` +
        ` — ${rekodTuntutan.namaAtlet || '—'} (${rekodTuntutan.namaSekolah || '—'})`,
        M, y
      )
      y += 5
      if (rekodSemasa) {
        pdf.setTextColor(100, 100, 100)
        pdf.setFont('helvetica', 'normal')
        pdf.text(
          `  Rekod lama: ${formatPrestasi(rekodSemasa.prestasi, acara.jenisAcara)}` +
          ` — ${rekodSemasa.namaAtlet || '—'} (${rekodSemasa.namaSekolah || '—'})` +
          ` · ${String(rekodSemasa.tarikhRekod || '').slice(0, 4)}`,
          M, y
        )
      }
    } else if (rekodSemasa) {
      pdf.setTextColor(60, 60, 60)
      pdf.text(
        `Rekod semasa: ${formatPrestasi(rekodSemasa.prestasi, acara.jenisAcara)}` +
        ` — ${rekodSemasa.namaAtlet || '—'} (${rekodSemasa.namaSekolah || '—'})` +
        ` · ${String(rekodSemasa.tarikhRekod || '').slice(0, 4)}`,
        M, y
      )
    }
    pdf.setTextColor(0, 0, 0)
  }

  pdf.save(`SlipHadiah_${acara.noAcara || acara.namaAcara}.pdf`)
}

// ─── PDF: Kertas Juruhebah ────────────────────────────────────────────────────

function cetakKertasJuruhebah({ acara, pesertaFinal, rekodSemasa, rekodTuntutan, cfg, namaKej }) {
  const pdf  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const M = 15

  let y = M

  // ── Logo ──
  const logoH = 20
  if (cfg.logoKiriBase64) {
    try { pdf.addImage(cfg.logoKiriBase64, 'PNG', M, y, logoH, logoH) } catch {}
  }
  if (cfg.logoKananBase64) {
    try { pdf.addImage(cfg.logoKananBase64, 'PNG', pageW - M - logoH, y, logoH, logoH) } catch {}
  }

  // ── Nama Kejohanan ──
  pdf.setFontSize(12)
  pdf.setFont('helvetica', 'bold')
  pdf.text(namaKej || 'Kejohanan Olahraga', pageW / 2, y + 8, { align: 'center' })
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.text('KEPUTUSAN FINAL — KERTAS JURUHEBAH', pageW / 2, y + 14, { align: 'center' })

  y += logoH + 4

  // ── Garisan tebal ──
  pdf.setDrawColor(0, 51, 153)
  pdf.setLineWidth(1)
  pdf.line(M, y, pageW - M, y)
  y += 7

  // ── No & Nama Acara (besar) ──
  pdf.setFontSize(18)
  pdf.setFont('helvetica', 'bold')
  pdf.text(`ACARA ${acara.noAcara || '—'}`, pageW / 2, y, { align: 'center' })
  y += 9

  pdf.setFontSize(16)
  pdf.text(acara.namaAcara || '—', pageW / 2, y, { align: 'center' })
  y += 8

  pdf.setFontSize(12)
  pdf.setFont('helvetica', 'normal')
  pdf.text(
    `Kategori ${acara.kategoriKod} · ${acara.jantina === 'L' ? 'LELAKI' : 'PEREMPUAN'}`,
    pageW / 2, y, { align: 'center' }
  )
  y += 6

  pdf.setDrawColor(0, 51, 153)
  pdf.setLineWidth(0.5)
  pdf.line(M, y, pageW - M, y)
  y += 5

  // ── Keputusan Final (font besar) ──
  const rows = pesertaFinal.map(p => [
    p.rankDalamHeat <= 3
      ? ['🥇', '🥈', '🥉'][p.rankDalamHeat - 1] + `  ${p.rankDalamHeat}`
      : String(p.rankDalamHeat),
    p.namaAtlet || '—',
    p.namaSekolah || p.kodSekolah || '—',
    formatPrestasi(p.keputusan, acara.jenisAcara),
  ])

  autoTable(pdf, {
    startY: y,
    head: [['Tempat', 'Nama Atlet', 'Sekolah', 'Prestasi']],
    body: rows,
    styles: { fontSize: 13, cellPadding: 4 },
    headStyles: { fillColor: [0, 51, 153], textColor: 255, fontStyle: 'bold', fontSize: 11 },
    alternateRowStyles: { fillColor: [245, 247, 255] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 22, fontStyle: 'bold' },
      1: { fontStyle: 'bold', cellWidth: 68 },
      2: { cellWidth: 55 },
      3: { halign: 'center', fontStyle: 'bold', cellWidth: 'auto' },
    },
    margin: { left: M, right: M },
    tableLineColor: [180, 180, 180],
    tableLineWidth: 0.3,
  })

  y = pdf.lastAutoTable.finalY + 8

  // ── Rekod (dalam kotak) ──
  if (rekodTuntutan || rekodSemasa) {
    const boxH = rekodTuntutan && rekodSemasa ? 22 : 14
    pdf.setFillColor(255, 250, 230)
    pdf.setDrawColor(200, 150, 0)
    pdf.setLineWidth(0.5)
    pdf.roundedRect(M, y, pageW - M * 2, boxH, 2, 2, 'FD')

    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'bold')

    if (rekodTuntutan) {
      pdf.setTextColor(180, 0, 0)
      pdf.text(
        `★ REKOD BARU!   ${formatPrestasi(rekodTuntutan.prestasi, acara.jenisAcara)}` +
        `   ${rekodTuntutan.namaAtlet || '—'}   (${rekodTuntutan.namaSekolah || '—'})`,
        M + 4, y + 7
      )
      if (rekodSemasa) {
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(80, 80, 80)
        pdf.text(
          `Rekod lama:   ${formatPrestasi(rekodSemasa.prestasi, acara.jenisAcara)}` +
          `   ${rekodSemasa.namaAtlet || '—'}   (${rekodSemasa.namaSekolah || '—'})` +
          `   ${String(rekodSemasa.tarikhRekod || '').slice(0, 4)}`,
          M + 4, y + 16
        )
      }
    } else if (rekodSemasa) {
      pdf.setTextColor(60, 60, 60)
      pdf.text(
        `Rekod semasa:   ${formatPrestasi(rekodSemasa.prestasi, acara.jenisAcara)}` +
        `   ${rekodSemasa.namaAtlet || '—'}   (${rekodSemasa.namaSekolah || '—'})` +
        `   ${String(rekodSemasa.tarikhRekod || '').slice(0, 4)}`,
        M + 4, y + 8
      )
    }
    pdf.setTextColor(0, 0, 0)
  }

  pdf.save(`Juruhebah_${acara.noAcara || acara.namaAcara}.pdf`)
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CetakAcara() {
  const [cfg,          setCfg]          = useState({})
  const [kejohanan,    setKejohanan]    = useState(null)
  const [namaKej,      setNamaKej]      = useState('')
  const [peringkatKod, setPeringkatKod] = useState('D')

  const [jadualByDay,  setJadualByDay]  = useState({}) // { 'YYYY-MM-DD': [ jadualDoc ] }
  const [days,         setDays]         = useState([])
  const [selectedDay,  setSelectedDay]  = useState(null)

  const [selectedAcara, setSelectedAcara] = useState(null)
  const [finalHeat,     setFinalHeat]     = useState(null)
  const [rekodSemasa,   setRekodSemasa]   = useState(null)
  const [rekodTuntutan, setRekodTuntutan] = useState(null)

  const [loadingKej,   setLoadingKej]   = useState(true)
  const [loadingAcara, setLoadingAcara] = useState(false)
  const [printing,     setPrinting]     = useState(false)

  const PERINGKAT_KOD = { daerah: 'D', negeri: 'N', kebangsaan: 'K' }

  // ── Load tetapan + kejohanan ──
  useEffect(() => {
    Promise.all([
      getDoc(doc(db, 'tetapan', 'home')),
      getDocs(query(collection(db, 'kejohanan'), where('statusKejohanan', 'in', ['aktif', 'persediaan']))),
    ]).then(([cfgSnap, kejSnap]) => {
      if (cfgSnap.exists()) setCfg(cfgSnap.data())
      if (!kejSnap.empty) {
        const aktif = kejSnap.docs.find(d => d.data().statusKejohanan === 'aktif') || kejSnap.docs[0]
        const data  = aktif.data()
        setKejohanan({ id: aktif.id, ...data })
        setNamaKej(data.namaKejohanan || '')
        setPeringkatKod(PERINGKAT_KOD[data.peringkat?.toLowerCase()] || 'D')
      }
    }).finally(() => setLoadingKej(false))
  }, [])

  // ── Load jadual apabila kejohanan loaded ──
  useEffect(() => {
    if (!kejohanan) return
    getDocs(query(
      collection(db, 'jadual_acara'),
      where('kejohananId', '==', kejohanan.id),
      orderBy('tarikhAcara'), orderBy('masaMula')
    )).then(snap => {
      const byDay = {}
      snap.docs.forEach(d => {
        const data = d.data()
        const tarikh = data.tarikhAcara || 'Tiada Tarikh'
        if (!byDay[tarikh]) byDay[tarikh] = []
        byDay[tarikh].push({ id: d.id, ...data })
      })
      const sortedDays = Object.keys(byDay).sort()
      setJadualByDay(byDay)
      setDays(sortedDays)
      if (sortedDays.length > 0) setSelectedDay(sortedDays[0])
    }).catch(() => {})
  }, [kejohanan])

  // ── Pilih acara → load final heat + rekod ──
  async function handleSelectAcara(jadual) {
    setSelectedAcara(jadual)
    setFinalHeat(null)
    setRekodSemasa(null)
    setRekodTuntutan(null)
    setLoadingAcara(true)

    try {
      const aceraId = jadual.aceraId
      if (!aceraId || !kejohanan) return

      // Load acara details
      const acaraDoc = await getDoc(doc(db, 'kejohanan', kejohanan.id, 'acara', aceraId))
      const acaraData = acaraDoc.exists() ? { id: aceraId, ...acaraDoc.data() } : { id: aceraId, ...jadual }

      // Load final heat
      const heatSnap = await getDocs(collection(db, 'kejohanan', kejohanan.id, 'acara', aceraId, 'heat'))
      const allHeats = heatSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const fHeat = allHeats.find(h => ['final', 'terus_final'].includes(h.fasa)) ||
                    (allHeats.length === 1 ? allHeats[0] : null)

      setSelectedAcara({ ...jadual, ...acaraData })
      setFinalHeat(fHeat || null)

      // Load rekod
      if (acaraData.namaAcara && acaraData.jantina && acaraData.kategoriKod) {
        const rKey = rekodKeyStr(acaraData.namaAcara, acaraData.jantina, acaraData.kategoriKod, peringkatKod)
        const [rSnap, tSnap] = await Promise.all([
          getDoc(doc(db, 'rekod', rKey)),
          getDoc(doc(db, 'rekod', rKey + '_tuntutan')),
        ])
        setRekodSemasa(rSnap.exists() && rSnap.data().statusRekod === 'aktif' ? rSnap.data() : null)
        setRekodTuntutan(tSnap.exists() && tSnap.data().statusRekod === 'tuntutan' ? tSnap.data() : null)
      }
    } catch (e) {
      console.warn('loadAcara:', e.message)
    } finally {
      setLoadingAcara(false)
    }
  }

  // ── Cetak 2 PDF serentak ──
  async function handleCetak() {
    if (!selectedAcara || !finalHeat) return
    setPrinting(true)
    try {
      const pesertaFinal = (finalHeat.peserta || [])
        .filter(p => p.rankDalamHeat && p.status === 'selesai')
        .sort((a, b) => a.rankDalamHeat - b.rankDalamHeat)

      const args = {
        acara:        selectedAcara,
        pesertaFinal,
        rekodSemasa,
        rekodTuntutan,
        cfg,
        namaKej,
      }

      cetakSlipHadiah(args)
      await new Promise(r => setTimeout(r, 300))
      cetakKertasJuruhebah(args)
    } finally {
      setPrinting(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (loadingKej) return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-sm text-gray-400">Memuatkan...</p>
    </div>
  )

  if (!kejohanan) return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-sm text-gray-500">Tiada kejohanan aktif.</p>
    </div>
  )

  const acaraHari = selectedDay ? (jadualByDay[selectedDay] || []) : []
  const pesertaPreview = finalHeat
    ? (finalHeat.peserta || [])
        .filter(p => p.rankDalamHeat && p.status === 'selesai')
        .sort((a, b) => a.rankDalamHeat - b.rankDalamHeat)
    : []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <h1 className="text-sm font-bold text-gray-800">Cetak Acara</h1>
        <p className="text-xs text-gray-500 mt-0.5">{namaKej}</p>
      </div>

      <div className="flex h-[calc(100vh-57px)]">

        {/* ── Panel Kiri: Hari + Senarai Acara ── */}
        <div className="w-72 shrink-0 bg-white border-r border-gray-200 flex flex-col">

          {/* Tab Hari */}
          <div className="flex overflow-x-auto border-b border-gray-200 shrink-0">
            {days.map((day, i) => (
              <button
                key={day}
                onClick={() => { setSelectedDay(day); setSelectedAcara(null); setFinalHeat(null) }}
                className={`px-3 py-2.5 text-xs font-bold shrink-0 border-b-2 transition-colors ${
                  selectedDay === day
                    ? 'border-[#003399] text-[#003399] bg-blue-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Hari {i + 1}
                <span className="block text-[9px] font-normal text-gray-400">
                  {formatTarikhMY(day)}
                </span>
              </button>
            ))}
          </div>

          {/* Senarai Acara */}
          <div className="flex-1 overflow-y-auto">
            {acaraHari.length === 0 ? (
              <p className="text-xs text-gray-400 p-4">Tiada acara untuk hari ini.</p>
            ) : (
              acaraHari.map(j => (
                <button
                  key={j.id}
                  onClick={() => handleSelectAcara(j)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-blue-50 transition-colors ${
                    selectedAcara?.id === j.id ? 'bg-blue-50 border-l-2 border-l-[#003399]' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold text-[#003399] bg-blue-100 px-1.5 py-0.5 rounded">
                      {j.noAcara || '—'}
                    </span>
                    <span className="text-xs font-semibold text-gray-800 truncate">{j.namaAcara || '—'}</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5 pl-0.5">
                    Kat {j.kategoriKod} · {j.jantina === 'L' ? 'Lelaki' : 'Perempuan'} · {j.masaMula || '—'}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── Panel Kanan: Preview + Butang Cetak ── */}
        <div className="flex-1 overflow-y-auto p-4">
          {!selectedAcara ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-2xl mb-2">🖨️</p>
                <p className="text-sm text-gray-500">Pilih acara dari senarai untuk cetak.</p>
              </div>
            </div>
          ) : loadingAcara ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-gray-400">Memuatkan data acara...</p>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-4">

              {/* Info Acara */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono font-bold text-[#003399] bg-blue-100 px-2 py-0.5 rounded">
                        No. {selectedAcara.noAcara || '—'}
                      </span>
                      <span className="text-xs font-bold text-gray-600">
                        Kat {selectedAcara.kategoriKod} · {selectedAcara.jantina === 'L' ? 'Lelaki' : 'Perempuan'}
                      </span>
                    </div>
                    <h2 className="text-base font-black text-gray-800">{selectedAcara.namaAcara}</h2>
                  </div>

                  {/* Butang Cetak */}
                  <button
                    onClick={handleCetak}
                    disabled={printing || !finalHeat || pesertaPreview.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-[#003399] hover:bg-[#002277] text-white text-xs font-bold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                  >
                    {printing ? (
                      <span>Mencetak...</span>
                    ) : (
                      <>
                        <span>🖨️</span>
                        <span>Cetak Acara</span>
                      </>
                    )}
                  </button>
                </div>

                {!finalHeat && (
                  <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg mt-3">
                    ⚠️ Tiada keputusan final untuk acara ini.
                  </p>
                )}
                {finalHeat && pesertaPreview.length === 0 && (
                  <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg mt-3">
                    ⚠️ Keputusan final ada tetapi tiada peserta dengan kedudukan.
                  </p>
                )}
              </div>

              {/* Preview Keputusan */}
              {pesertaPreview.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <h3 className="text-xs font-bold text-gray-700">Keputusan Final</h3>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-[#003399] text-white">
                        <th className="px-3 py-2 text-center w-12">Tempat</th>
                        <th className="px-3 py-2 text-left">Nama</th>
                        <th className="px-3 py-2 text-left">Sekolah</th>
                        <th className="px-3 py-2 text-center">Prestasi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pesertaPreview.map((p, i) => (
                        <tr key={p.noKP || i} className={i % 2 === 0 ? 'bg-white' : 'bg-blue-50/30'}>
                          <td className="px-3 py-2 text-center font-bold">
                            {p.rankDalamHeat === 1 ? '🥇' : p.rankDalamHeat === 2 ? '🥈' : p.rankDalamHeat === 3 ? '🥉' : p.rankDalamHeat}
                          </td>
                          <td className="px-3 py-2 font-semibold">{p.namaAtlet || '—'}</td>
                          <td className="px-3 py-2 text-gray-600">{p.namaSekolah || p.kodSekolah || '—'}</td>
                          <td className="px-3 py-2 text-center font-mono">
                            {formatPrestasi(p.keputusan, selectedAcara.jenisAcara)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Preview Rekod */}
              {(rekodTuntutan || rekodSemasa) && (
                <div className={`rounded-xl border px-4 py-3 ${rekodTuntutan ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                  <h3 className="text-xs font-bold text-gray-700 mb-2">Rekod</h3>
                  {rekodTuntutan && (
                    <p className="text-xs font-bold text-red-700">
                      ★ REKOD BARU: {formatPrestasi(rekodTuntutan.prestasi, selectedAcara.jenisAcara)}
                      {' — '}{rekodTuntutan.namaAtlet} ({rekodTuntutan.namaSekolah})
                    </p>
                  )}
                  {rekodSemasa && (
                    <p className="text-xs text-gray-500 mt-1">
                      {rekodTuntutan ? 'Rekod lama: ' : 'Rekod semasa: '}
                      {formatPrestasi(rekodSemasa.prestasi, selectedAcara.jenisAcara)}
                      {' — '}{rekodSemasa.namaAtlet} ({rekodSemasa.namaSekolah})
                      {' · '}{String(rekodSemasa.tarikhRekod || '').slice(0, 4)}
                    </p>
                  )}
                </div>
              )}

              {/* Info PDF */}
              <div className="bg-gray-50 rounded-xl border border-gray-200 px-4 py-3">
                <p className="text-xs text-gray-500 font-medium mb-1">Butang Cetak akan jana 2 PDF:</p>
                <div className="space-y-1">
                  <p className="text-xs text-gray-600">📄 <span className="font-semibold">Slip Hadiah</span> — compact, untuk majlis penyampaian hadiah</p>
                  <p className="text-xs text-gray-600">📄 <span className="font-semibold">Kertas Juruhebah</span> — font besar, untuk bacaan mikrofon</p>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  )
}
