/**
 * LaporanCetakan — /admin/kejohanan/:kejId/laporan
 * Gold Podium — multi-tenant
 *
 * 3 Laporan:
 *   1. Buku Kejohanan — semua acara + keputusan heat final
 *   2. Keputusan Penuh — acara tertentu, semua heat
 *   3. Medal Tally ringkas — dalam halaman ini
 *
 * Firestore paths (read only):
 *   tenants/{sId}/kejohanan/{kId}/acara/{aId}/heat/{hId}
 *   tenants/{sId}/atlet/{atletId}
 */

import { useState, useEffect, useCallback } from 'react'
import { collection, getDocs, doc, getDoc, query, orderBy } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getKejContext() {
  try { return JSON.parse(sessionStorage.getItem('gp_kej_aktif') || '{}') } catch { return {} }
}

function masaKeSaat(str) {
  if (!str || !String(str).trim()) return null
  const s = String(str).trim().replace(',', '.')
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s)
  const m = s.match(/^(\d+):(\d{2})(\.\d+)?$/)
  if (m) return parseInt(m[1]) * 60 + parseInt(m[2]) + parseFloat(m[3] || '.0')
  return null
}

function saatKeStr(saat) {
  if (saat === null || saat === undefined) return ''
  if (saat < 60) return saat.toFixed(2)
  const m = Math.floor(saat / 60)
  const s = (saat % 60).toFixed(2).padStart(5, '0')
  return `${m}:${s}`
}

function jarakTerbaik(cubaan = []) {
  const valid = (cubaan || []).map(c => parseFloat(c) || 0).filter(v => v > 0)
  return valid.length ? Math.max(...valid) : null
}

const FASA_FULL = {
  heat: 'Heat', saringan: 'Saringan', final: 'Final',
  suku_akhir: 'Suku Akhir', separuh_akhir: 'Separuh Akhir', terus_final: 'Final',
}

const Ikon = {
  balik:  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>,
  trophy: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>,
  keluar: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
  pdf:    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>,
  doc:    <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
}

// ─── PDF: Buku Kejohanan ──────────────────────────────────────────────────────

function cetakBukuKejohanan(acara, heatsMap, atletMap, namaKej, namaSekolah) {
  const pdf    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const lebar  = pdf.internal.pageSize.getWidth()
  const tarikh = new Date().toLocaleDateString('ms-MY', { day: '2-digit', month: 'long', year: 'numeric' })

  // ── Muka depan ──
  pdf.setFillColor(0, 51, 153)
  pdf.rect(0, 0, lebar, 60, 'F')
  pdf.setFontSize(20)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(255, 215, 0)
  pdf.text('GOLD PODIUM', lebar / 2, 22, { align: 'center' })
  pdf.setFontSize(9)
  pdf.setTextColor(255, 255, 255)
  pdf.text('Sistem Pengurusan Kejohanan Sukan', lebar / 2, 30, { align: 'center' })

  pdf.setFontSize(14)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(255, 255, 255)
  pdf.text(namaKej || 'Buku Kejohanan', lebar / 2, 46, { align: 'center' })

  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(255, 255, 255)
  if (namaSekolah) pdf.text(namaSekolah, lebar / 2, 54, { align: 'center' })

  pdf.setFontSize(8)
  pdf.setTextColor(100)
  pdf.text(`Dicetak: ${tarikh}`, lebar / 2, 68, { align: 'center' })

  // ── Senarai Acara ──
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 51, 153)
  pdf.text('SENARAI ACARA', 14, 80)

  autoTable(pdf, {
    startY: 84,
    head: [['#', 'Acara', 'Jenis', 'Kategori', 'Jantina']],
    body: acara.map((a, i) => [
      i + 1,
      a.nama || '—',
      a.jenis ? a.jenis.replace('_', ' ') : '—',
      a.kategori || '—',
      a.jantina === 'L' ? 'Lelaki' : a.jantina === 'P' ? 'Perempuan' : (a.jantina || '—'),
    ]),
    headStyles:   { fillColor: [0, 51, 153], textColor: 255, fontSize: 8, fontStyle: 'bold' },
    bodyStyles:   { fontSize: 7.5 },
    alternateRowStyles: { fillColor: [245, 247, 255] },
    columnStyles: { 0: { cellWidth: 10, halign: 'center' } },
    margin: { left: 14, right: 14 },
  })

  // ── Keputusan setiap acara ──
  for (const a of acara) {
    const heats = (heatsMap[a.id] || []).filter(h => h.statusKeputusan === 'ada_keputusan')
    if (heats.length === 0) continue

    const isPadang = a.jenis === 'padang_lompat' || a.jenis === 'padang_balin'
    const isRelay  = a.jenis === 'relay'

    for (const heat of heats) {
      pdf.addPage()

      // Header acara
      pdf.setFillColor(0, 51, 153)
      pdf.rect(0, 0, lebar, 22, 'F')
      pdf.setFontSize(11)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(255, 255, 255)
      pdf.text(a.nama || '—', 14, 10)
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'normal')
      pdf.text(
        `${FASA_FULL[heat.fasa] || heat.fasa} ${heat.noHeat || ''} · ${a.kategori || ''} ${a.jantina || ''}`,
        14, 17
      )

      if (heat.windSpeed && parseFloat(heat.windSpeed) !== 0) {
        pdf.setFontSize(7)
        pdf.setTextColor(255, 220, 100)
        pdf.text(`Angin: ${parseFloat(heat.windSpeed) > 0 ? '+' : ''}${heat.windSpeed} m/s`, lebar - 14, 17, { align: 'right' })
      }

      // Jadual peserta
      const sorted = [...(heat.peserta || [])].sort((x, y) => {
        if (x.dns || x.dnf || x.dq) return 1
        if (y.dns || y.dnf || y.dq) return -1
        if (isPadang) return (jarakTerbaik(y.cubaan) || 0) - (jarakTerbaik(x.cubaan) || 0)
        return (masaKeSaat(x.masa) || 9999) - (masaKeSaat(y.masa) || 9999)
      })

      const rows = sorted.map((p, i) => {
        const nama     = isRelay ? (p.namaPasukan || p.namaAtlet || '—') : (p.namaAtlet || atletMap[p.noKP]?.nama || atletMap[p.atletId]?.nama || p.nama || p.noKP || '—')
        const sekolah  = isRelay ? '' : (p.sekolah || atletMap[p.noKP]?.sekolah || atletMap[p.atletId]?.sekolah || '—')
        const kod      = isRelay ? (p.kodSekolah || '') : (p.kodSekolah || atletMap[p.noKP]?.kodSekolah || '')
        const keputusan = p.dns ? 'DNS' : p.dnf ? 'DNF' : p.dq ? 'DQ'
          : isPadang ? `${(jarakTerbaik(p.cubaan) || 0).toFixed(2)}m`
          : saatKeStr(masaKeSaat(p.masa))
        return [p.kedudukan || (p.dns||p.dnf||p.dq ? '—' : i+1), nama, sekolah, keputusan]
      })

      autoTable(pdf, {
        startY: 26,
        head: [['Ked.', 'Nama / Pasukan', 'Sekolah', 'Keputusan']],
        body: rows,
        headStyles:   { fillColor: [30, 60, 120], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        bodyStyles:   { fontSize: 8 },
        alternateRowStyles: { fillColor: [248, 249, 255] },
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' },
          3: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
        },
        margin: { left: 14, right: 14 },
      })
    }
  }

  // Footer setiap halaman
  const nHalaman = pdf.internal.getNumberOfPages()
  for (let i = 1; i <= nHalaman; i++) {
    pdf.setPage(i)
    pdf.setFontSize(7)
    pdf.setTextColor(160)
    const h = pdf.internal.pageSize.getHeight()
    pdf.text('Gold Podium — Sistem Pengurusan Kejohanan Sukan', lebar / 2, h - 8, { align: 'center' })
    pdf.text(`${i} / ${nHalaman}`, lebar - 14, h - 8, { align: 'right' })
  }

  pdf.save(`buku-kejohanan-${(namaKej || 'kejohanan').replace(/\s+/g, '-').toLowerCase()}.pdf`)
}

// ─── PDF: Keputusan satu acara (semua heat) ───────────────────────────────────

function cetakKeputusanAcara(acara, heats, atletMap, namaKej) {
  const pdf    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const lebar  = pdf.internal.pageSize.getWidth()
  const tarikh = new Date().toLocaleDateString('ms-MY', { day: '2-digit', month: 'long', year: 'numeric' })
  const isPadang = acara.jenis === 'padang_lompat' || acara.jenis === 'padang_balin'
  const isRelay  = acara.jenis === 'relay'

  pdf.setFillColor(0, 51, 153)
  pdf.rect(0, 0, lebar, 28, 'F')
  pdf.setFontSize(13)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(255, 255, 255)
  pdf.text(acara.nama || 'Acara', 14, 12)
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.text(`${namaKej || 'Kejohanan'} · ${acara.kategori || ''} ${acara.jantina || ''}`, 14, 19)
  pdf.setFontSize(7)
  pdf.setTextColor(200)
  pdf.text(`Dicetak: ${tarikh}`, lebar - 14, 19, { align: 'right' })

  let y = 34

  const heatsAda = heats.filter(h => h.statusKeputusan === 'ada_keputusan')
  if (heatsAda.length === 0) {
    pdf.setTextColor(150)
    pdf.setFontSize(10)
    pdf.text('Tiada keputusan direkodkan lagi.', 14, y)
  }

  for (const heat of heatsAda) {
    if (y > 240) { pdf.addPage(); y = 14 }

    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(0, 51, 153)
    const fasaLabel = `${FASA_FULL[heat.fasa] || heat.fasa} ${heat.noHeat || ''}`
    pdf.text(fasaLabel, 14, y)

    if (heat.windSpeed && parseFloat(heat.windSpeed) !== 0) {
      pdf.setFontSize(7)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(100)
      pdf.text(`Angin: ${parseFloat(heat.windSpeed) > 0 ? '+' : ''}${heat.windSpeed} m/s`, 14 + pdf.getTextWidth(fasaLabel) + 4, y)
    }
    y += 4

    const sorted = [...(heat.peserta || [])].sort((a, b) => {
      if (a.dns || a.dnf || a.dq) return 1
      if (b.dns || b.dnf || b.dq) return -1
      if (isPadang) return (jarakTerbaik(b.cubaan) || 0) - (jarakTerbaik(a.cubaan) || 0)
      return (masaKeSaat(a.masa) || 9999) - (masaKeSaat(b.masa) || 9999)
    })

    autoTable(pdf, {
      startY: y,
      head: [['Ked.', 'Nama / Pasukan', 'Sekolah', 'Keputusan']],
      body: sorted.map((p, i) => [
        p.dns||p.dnf||p.dq ? '—' : (p.kedudukan || i+1),
        isRelay ? (p.namaPasukan||p.namaAtlet||'—') : (p.namaAtlet||atletMap[p.noKP]?.nama||atletMap[p.atletId]?.nama||p.nama||p.noKP||'—'),
        isRelay ? '' : (p.sekolah||atletMap[p.noKP]?.sekolah||atletMap[p.atletId]?.sekolah||'—'),
        p.dns ? 'DNS' : p.dnf ? 'DNF' : p.dq ? 'DQ'
          : isPadang ? `${(jarakTerbaik(p.cubaan)||0).toFixed(2)}m`
          : saatKeStr(masaKeSaat(p.masa)),
      ]),
      headStyles:   { fillColor: [0, 51, 153], textColor: 255, fontSize: 7.5, fontStyle: 'bold' },
      bodyStyles:   { fontSize: 7.5 },
      alternateRowStyles: { fillColor: [248, 249, 255] },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        3: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
      },
      margin: { left: 14, right: 14 },
    })

    y = (pdf.lastAutoTable?.finalY || y) + 8
  }

  const nHalaman = pdf.internal.getNumberOfPages()
  for (let i = 1; i <= nHalaman; i++) {
    pdf.setPage(i)
    pdf.setFontSize(7)
    pdf.setTextColor(160)
    const h = pdf.internal.pageSize.getHeight()
    pdf.text('Gold Podium — Sistem Pengurusan Kejohanan Sukan', lebar / 2, h - 8, { align: 'center' })
    pdf.text(`${i} / ${nHalaman}`, lebar - 14, h - 8, { align: 'right' })
  }

  pdf.save(`keputusan-${(acara.nama||'acara').replace(/\s+/g,'-').toLowerCase()}.pdf`)
}

// ─── Komponen Utama ───────────────────────────────────────────────────────────

export default function LaporanCetakan() {
  const { userData, logout } = useAuth()
  const navigate = useNavigate()

  const isSuperadmin = userData?.role === 'superadmin'
  const viewSchoolId = isSuperadmin
    ? (() => { try { return JSON.parse(sessionStorage.getItem('gp_view_school') || '{}').schoolId || '' } catch { return '' } })()
    : null
  const schoolId = viewSchoolId || userData?.schoolId

  const kej   = getKejContext()
  const kejId = kej.id

  const [acara,     setAcara]     = useState([])
  const [heatsMap,  setHeatsMap]  = useState({})  // acaraId → heat[]
  const [atletMap,  setAtletMap]  = useState({})
  const [kejData,   setKejData]   = useState(null)
  const [muatTurun, setMuatTurun] = useState(true)
  const [selAcara,  setSelAcara]  = useState('')
  const [cetakLoad, setCetakLoad] = useState('')

  const muatData = useCallback(async () => {
    if (!schoolId || !kejId) return
    setMuatTurun(true)
    try {
      const [aSnap, atsSnap, kejSnap, tenantSnap] = await Promise.all([
        getDocs(query(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'acara'), orderBy('nama'))),
        getDocs(collection(db, 'tenants', schoolId, 'atlet')),
        getDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId)),
        getDoc(doc(db, 'tenants', schoolId)),
      ])

      const semuaAcara = aSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      setAcara(semuaAcara)
      if (kejSnap.exists()) setKejData(kejSnap.data())

      const namaSekolah = tenantSnap.data()?.namaSekolah || schoolId
      const map = {}
      atsSnap.docs.forEach(d => { map[d.id] = { ...d.data(), sekolah: namaSekolah } })
      setAtletMap(map)

      // Muat semua heat
      const heatPromises = semuaAcara.map(a =>
        getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'acara', a.id, 'heat'))
          .then(snap => ({ aId: a.id, heats: snap.docs.map(d => ({ id: d.id, ...d.data() })) }))
      )
      const results = await Promise.all(heatPromises)
      const hMap = {}
      results.forEach(r => { hMap[r.aId] = r.heats })
      setHeatsMap(hMap)
    } catch { /* langkau */ }
    setMuatTurun(false)
  }, [schoolId, kejId])

  useEffect(() => { muatData() }, [muatData])

  const acaraAda = acara.filter(a => (heatsMap[a.id] || []).some(h => h.statusKeputusan === 'ada_keputusan'))
  const totalHeat  = Object.values(heatsMap).flat().length
  const totalKep   = Object.values(heatsMap).flat().filter(h => h.statusKeputusan === 'ada_keputusan').length

  async function handleBukuKejohanan() {
    setCetakLoad('buku')
    try {
      cetakBukuKejohanan(acara, heatsMap, atletMap, kej.nama || kejData?.nama, kejData?.namaSekolah || '')
    } finally {
      setCetakLoad('')
    }
  }

  async function handleKeputusanAcara() {
    if (!selAcara) return
    setCetakLoad('acara')
    try {
      const a = acara.find(x => x.id === selAcara)
      cetakKeputusanAcara(a, heatsMap[selAcara] || [], atletMap, kej.nama || kejData?.nama)
    } finally {
      setCetakLoad('')
    }
  }

  if (!schoolId || !kejId) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-sm text-gray-400">Sila pilih kejohanan dari panel admin.</p>
    </div>
  )

  const LAPORAN = [
    {
      id: 'buku',
      icon: '📖',
      title: 'Buku Kejohanan',
      desc: 'Semua acara + keputusan heat final dalam satu dokumen PDF',
      warna: 'from-blue-500 to-blue-600',
      action: handleBukuKejohanan,
      disabled: acaraAda.length === 0,
      note: acaraAda.length === 0 ? 'Tiada keputusan lagi' : `${acaraAda.length} acara ada keputusan`,
    },
    {
      id: 'medal',
      icon: '🥇',
      title: 'Medal Tally',
      desc: 'Kiraan pingat per sekolah + senarai pemenang (PDF)',
      warna: 'from-yellow-500 to-amber-500',
      action: () => navigate(`/admin/kejohanan/${kejId}/medal`),
      disabled: false,
      note: 'Lihat & cetak dari halaman Medal Tally',
      isNav: true,
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50">

      {isSuperadmin && (
        <div className="bg-amber-400 text-amber-900 px-4 py-2 flex items-center justify-between text-xs font-bold">
          <span>⚡ Mode Superadmin</span>
          <button onClick={() => { sessionStorage.removeItem('gp_view_school'); navigate('/superadmin') }}
            className="underline hover:no-underline">← Balik ke Panel Superadmin</button>
        </div>
      )}

      <header className="bg-[#003399] text-white px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/admin/kejohanan/${kejId}`)}
            className="text-white/60 hover:text-white transition-colors p-1 -ml-1">
            {Ikon.balik}
          </button>
          <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center shrink-0">
            {Ikon.trophy}
          </div>
          <div className="min-w-0">
            <p className="text-[9px] text-white/50 uppercase tracking-widest">Gold Podium</p>
            <p className="text-sm font-bold leading-tight truncate">Laporan & Cetakan</p>
          </div>
        </div>
        <button onClick={async () => { await logout(); navigate('/login') }}
          className="text-white/60 hover:text-white transition-colors p-1.5 flex items-center gap-1.5 text-xs shrink-0">
          {Ikon.keluar}
          <span className="hidden sm:block">Log Keluar</span>
        </button>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">

        {/* Status ringkasan */}
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3 shadow-sm">
          <p className="text-xs font-bold text-gray-800 mb-2">{kej.nama || 'Kejohanan'}</p>
          <div className="flex gap-4">
            <div className="text-center">
              <p className="text-xl font-black text-[#003399]">{acara.length}</p>
              <p className="text-[10px] text-gray-400">Jumlah Acara</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-black text-gray-600">{totalHeat}</p>
              <p className="text-[10px] text-gray-400">Jumlah Heat</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-black text-green-600">{totalKep}</p>
              <p className="text-[10px] text-gray-400">Ada Keputusan</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-black text-gray-300">{totalHeat - totalKep}</p>
              <p className="text-[10px] text-gray-400">Belum Input</p>
            </div>
          </div>
        </div>

        {/* Kad laporan */}
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Laporan PDF</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {LAPORAN.map(lap => (
            <button
              key={lap.id}
              onClick={lap.action}
              disabled={lap.disabled || cetakLoad === lap.id}
              className="bg-white border border-gray-100 rounded-2xl p-5 text-left hover:shadow-md hover:border-[#003399]/20 transition-all group disabled:opacity-50 disabled:cursor-not-allowed">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${lap.warna} flex items-center justify-center text-2xl mb-3`}>
                {cetakLoad === lap.id
                  ? <svg className="w-5 h-5 animate-spin text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  : lap.icon
                }
              </div>
              <p className="text-sm font-bold text-gray-800 leading-tight group-hover:text-[#003399] transition-colors">{lap.title}</p>
              <p className="text-[10px] text-gray-400 mt-1 leading-snug">{lap.desc}</p>
              <p className={`text-[10px] mt-2 font-semibold ${lap.disabled ? 'text-red-400' : 'text-green-600'}`}>
                {lap.isNav ? '→ Lihat halaman Medal Tally' : lap.note}
              </p>
            </button>
          ))}
        </div>

        {/* Cetak acara tertentu */}
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-3">
          <div>
            <p className="text-sm font-bold text-gray-800">Keputusan Acara Tertentu</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Pilih acara → cetak semua heat dalam PDF</p>
          </div>

          {muatTurun ? (
            <div className="flex justify-center py-4">
              <svg className="w-5 h-5 animate-spin text-gray-300" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            </div>
          ) : (
            <>
              <select
                value={selAcara}
                onChange={e => setSelAcara(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399]">
                <option value="">-- Pilih Acara --</option>
                {acara.map(a => {
                  const nKep = (heatsMap[a.id] || []).filter(h => h.statusKeputusan === 'ada_keputusan').length
                  return (
                    <option key={a.id} value={a.id}>
                      {a.nama} {nKep > 0 ? `(${nKep} heat ada keputusan)` : '(belum ada keputusan)'}
                    </option>
                  )
                })}
              </select>

              <button
                onClick={handleKeputusanAcara}
                disabled={!selAcara || cetakLoad === 'acara'}
                className="w-full bg-[#003399] hover:bg-[#002277] disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
                {cetakLoad === 'acara'
                  ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  : Ikon.pdf
                }
                Cetak Keputusan Acara
              </button>
            </>
          )}
        </div>

        {/* Nota */}
        <p className="text-[10px] text-gray-300 text-center pb-4">
          Semua laporan dicetak dalam format A4 · Keputusan dari modul Input Keputusan
        </p>
      </div>
    </div>
  )
}
