/**
 * CetakKeputusan.jsx — /dashboard/cetakkeputusan
 *
 * Cetakan Keputusan by Day:
 *   - Pilih hari → senarai semua acara RASMI pada hari itu
 *   - Cetak PDF (font besar, margin jelas) atau Export Excel
 *   - PDF tunjuk: keputusan penuh + rekod dipecahkan & rekod terkini sahaja
 *
 * Roles: superadmin, admin, pengurus_teknik, urusetia
 */

import { useState, useEffect, useRef } from 'react'
import {
  collection, getDocs, getDoc, doc, query, where,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrestasi(val, jenisAcara) {
  if (val == null || val === '') return '—'
  const n = Number(val)
  if (isNaN(n)) return String(val)
  if (['padang_lompat', 'padang_balin'].includes(jenisAcara)) return `${n.toFixed(2)} m`
  const min = Math.floor(n / 60)
  const sek = (n % 60).toFixed(2).padStart(5, '0')
  return min > 0 ? `${min}:${sek}` : `${n.toFixed(2)}s`
}

function fmtTarikh(str) {
  if (!str) return '—'
  if (str === 'tba') return 'Tarikh Belum Ditetapkan'
  return new Date(str + 'T00:00:00').toLocaleDateString('ms-MY', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function rekodKey(namaAcara, jantina, kategoriKod, peringkat) {
  return [namaAcara, jantina, kategoriKod, peringkat]
    .join('_').toUpperCase().replace(/[^A-Z0-9_]/g, '_')
}

// Lookup rekod dengan fallback ke format lama (kelasDariNama)
function cariRekodDalamMap(acara, peringkatKej, rekodMap) {
  const namaPendek = (acara.namaAcaraPendek || acara.namaAcara || '').trim()
  const namaPenuh  = (acara.namaAcara || '').trim()
  // Primary key (format baru)
  const rKeyPrimary = rekodKey(namaPendek, acara.jantina, acara.kategoriKod, peringkatKej)
  if (rekodMap[rKeyPrimary]) return rekodMap[rKeyPrimary]
  // Fallback key (format lama — kelasDariNama)
  const kelasDariNama = (namaPenuh && namaPendek && namaPenuh !== namaPendek)
    ? namaPenuh.slice(namaPendek.length).trim() : ''
  if (kelasDariNama) {
    const rKeyFallback = rekodKey(namaPendek, acara.jantina, kelasDariNama, peringkatKej)
    if (rekodMap[rKeyFallback]) return rekodMap[rKeyFallback]
  }
  return null
}

const PINGAT_UI  = { 1: '🥇', 2: '🥈', 3: '🥉' }  // untuk web preview sahaja

// 'ada_keputusan' = publish admin, 'diterima' = publish pencatat, 'rasmi' = disahkan
const SELESAI = ['ada_keputusan', 'diterima', 'rasmi']
const isSelesai = h => SELESAI.includes(h.statusKeputusan)
const FASA_ORDER = { heat: 1, separuh_akhir: 2, final: 3, terus_final: 3 }

function isFinalFasa(h) {
  return ['final', 'terus_final'].includes(h.fasa)
}

function heatLabel(h, totalHeats) {
  if (isFinalFasa(h)) return 'FINAL'
  if (h.fasa === 'separuh_akhir')
    return totalHeats > 1 ? `SEPARUH AKHIR ${h.noHeat || ''}`.trim() : 'SEPARUH AKHIR'
  return totalHeats > 1 ? `SARINGAN ${h.noHeat || ''}`.trim() : 'SARINGAN'
}

// Susun heat: saringan → SF → final, dalam fasa sama ikut noHeat
function sortHeats(heats) {
  return [...heats].sort((a, b) => {
    const fa = FASA_ORDER[a.fasa] || 9, fb = FASA_ORDER[b.fasa] || 9
    if (fa !== fb) return fa - fb
    return (a.noHeat ?? 0) - (b.noHeat ?? 0)
  })
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CetakKeputusan() {
  const { userData, userRole } = useAuth()
  const navigate = useNavigate()
  const isSuperadmin = userRole === 'superadmin'
  const viewSchoolId = isSuperadmin
    ? (() => { try { return JSON.parse(sessionStorage.getItem('gp_view_school') || '{}').schoolId || '' } catch { return '' } })()
    : null
  const schoolId = viewSchoolId || userData?.schoolId || ''
  const [loadingInit, setLoadingInit] = useState(true)
  const [generating,  setGenerating]  = useState(false)
  const [progress,    setProgress]    = useState('')
  const [msg,         setMsg]         = useState(null)

  // Data asas
  const kejIdRef      = useRef('')  // ref supaya reloadHeats sentiasa baca nilai terkini
  const jadualIdsRef  = useRef([])  // acara IDs dalam jadual sahaja
  const [cfg,              setCfg]              = useState({})
  const [kejId,            setKejId]            = useState('')
  const [namaKej,          setNamaKej]          = useState('')
  const [peringkatKej,     setPeringkatKej]     = useState('D')
  const [days,        setDays]        = useState([])       // ['2025-05-01', ...]
  const [acaraByDay,  setAcaraByDay]  = useState({})       // date → [{ acara, masaMula, lokasi }]
  const [acaraMap,    setAcaraMap]    = useState({})       // acaraId → acara data
  const [rekodMap,    setRekodMap]    = useState({})       // rekodKey → rekod data (aktif)
  const [tuntutanMap, setTuntutanMap] = useState({})       // rekodKey → rekod data (tuntutan)
  const [skolMap,     setSkolMap]     = useState({})       // kodSekolah → namaSekolah

  // UI state
  const [selDay,        setSelDay]        = useState('')
  const [heatCache,     setHeatCache]     = useState({})   // acaraId → [heats] (semua fasa)
  const [reloadingHeats, setReloadingHeats] = useState(false)
  const [search,        setSearch]        = useState('')       // cari no acara / nama acara
  const [katFilter,     setKatFilter]     = useState('semua')  // tapis kategori (L12/P12/…)
  const [exportDays,    setExportDays]    = useState(new Set()) // hari dipilih untuk Excel

  // ── Init: load data asas sekali ───────────────────────────────────────────

  useEffect(() => {
    if (!schoolId) return
    async function init() {
      setLoadingInit(true)
      try {
        const [cfgSnap, kejSnap] = await Promise.all([
          getDoc(doc(db, 'tenants', schoolId, 'tetapan', 'home')),
          getDocs(query(collection(db, 'tenants', schoolId, 'kejohanan'), where('statusKejohanan', 'in', ['aktif', 'draf', 'persediaan']))),
        ])
        const cfgData = cfgSnap.exists() ? cfgSnap.data() : {}
        setCfg(cfgData)
        if (kejSnap.empty) {
          setMsg({ type: 'err', text: 'Tiada kejohanan aktif atau persediaan dijumpai.' })
          setLoadingInit(false)
          return
        }

        const kej   = kejSnap.docs[0]
        const kData = kej.data()
        setKejId(kej.id); kejIdRef.current = kej.id
        setNamaKej(kData.namaKejohanan || cfgData.namaKejohanan || 'Kejohanan Olahraga')
        setPeringkatKej({ sekolah: 'S', daerah: 'D', negeri: 'N', kebangsaan: 'K' }[(kData.peringkat || '').toLowerCase()] || 'D')

        // Acara (jadual GP tersimpan atas doc acara: tarikhAcara/masa/lokasi)
        const [acaraSnap, rekodSnap, tuntSnap, sekolahSnap] = await Promise.all([
          getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kej.id, 'acara')),
          getDocs(query(collection(db, 'tenants', schoolId, 'rekod'), where('statusRekod', '==', 'aktif'))),
          getDocs(query(collection(db, 'tenants', schoolId, 'rekod'), where('kejohananId', '==', kej.id))).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'tenants', schoolId, 'sekolah')).catch(() => ({ docs: [] })),
        ])

        // Sekolah map dari koleksi sekolah (namaSekolah rasmi)
        const sMap = {}
        sekolahSnap.docs.forEach(d => {
          const s = d.data()
          const kod = s.kodSekolah || d.id
          sMap[kod] = s.namaSekolah || s.nama || kod
          if (d.id !== kod) sMap[d.id] = sMap[kod]
        })
        setSkolMap(sMap)

        const aMap = {}
        acaraSnap.docs.forEach(d => { aMap[d.id] = { id: d.id, ...d.data() } })
        setAcaraMap(aMap)

        const rMap = {}
        rekodSnap.docs.forEach(d => { rMap[d.id] = { id: d.id, ...d.data() } })
        setRekodMap(rMap)

        const tMap = {}
        tuntSnap.docs.forEach(d => {
          if (d.id.endsWith('_tuntutan')) {
            const rk = d.id.slice(0, -10)
            tMap[rk] = { id: d.id, ...d.data() }
          }
        })
        setTuntutanMap(tMap)

        // Group SEMUA acara by day — tarikhAcara dari doc acara sendiri
        // (sama seperti SchoolLanding; acara tanpa tarikh masuk kumpulan 'tba')
        const byDay = {}
        Object.values(aMap).forEach(a => {
          const t = a.tarikhAcara || 'tba'
          if (!byDay[t]) byDay[t] = []
          byDay[t].push({
            acara:    a,
            masaMula: a.masa   || a.masaMula || '',
            lokasi:   a.lokasi || '',
          })
        })
        Object.keys(byDay).forEach(day => {
          byDay[day].sort((a, b) => {
            const m = (a.masaMula || '').localeCompare(b.masaMula || '')
            if (m !== 0) return m
            return String(a.acara.noAcara || '').localeCompare(String(b.acara.noAcara || ''), undefined, { numeric: true })
          })
        })

        const sortedDays = Object.keys(byDay).filter(k => k !== 'tba').sort()
        if (byDay['tba']) sortedDays.push('tba')
        setDays(sortedDays)
        setAcaraByDay(byDay)
        setExportDays(new Set(sortedDays))  // default: semua hari dipilih untuk Excel
        if (sortedDays.length > 0) setSelDay(sortedDays[0])

        // Load SEMUA heat selesai per acara (saringan + SF + final)
        const acaraIds = Object.keys(aMap)
        jadualIdsRef.current = acaraIds
        const heatCol = collection(db, 'tenants', schoolId, 'kejohanan', kej.id, 'heat')
        const heatResults = await Promise.allSettled(
          acaraIds.map(async aId => {
            // dua field disemak sebab doc lama guna acaraId, baru guna aceraId
            const [s1, s2] = await Promise.all([
              getDocs(query(heatCol, where('aceraId', '==', aId))),
              getDocs(query(heatCol, where('acaraId', '==', aId))),
            ])
            const seen = new Set()
            // Simpan SEMUA heat (termasuk belum ada keputusan) — papar label "Belum ada keputusan"
            const heats = [...s1.docs, ...s2.docs]
              .filter(d => { if (seen.has(d.id)) return false; seen.add(d.id); return true })
              .map(d => ({ id: d.id, ...d.data() }))
            return { aId, heats: sortHeats(heats) }
          })
        )
        const cacheInit = {}
        heatResults.forEach(r => {
          if (r.status === 'fulfilled') cacheInit[r.value.aId] = r.value.heats
        })
        setHeatCache(cacheInit)
      } catch (e) {
        console.error(e)
        setMsg({ type: 'err', text: 'Ralat muatkan data: ' + e.message })
      } finally { setLoadingInit(false) }
    }
    init()
  }, [schoolId])

  // ── Muat Semula: reload semua heats via 1 query ───────────────────────────

  async function reloadHeats() {
    const kId = kejIdRef.current
    const acaraIds = jadualIdsRef.current
    if (!kId || !acaraIds.length || reloadingHeats || !schoolId) return
    setReloadingHeats(true)
    try {
      const heatCol = collection(db, 'tenants', schoolId, 'kejohanan', kId, 'heat')
      const results = await Promise.allSettled(
        acaraIds.map(async aId => {
          const [s1, s2] = await Promise.all([
            getDocs(query(heatCol, where('aceraId', '==', aId))),
            getDocs(query(heatCol, where('acaraId', '==', aId))),
          ])
          const seen = new Set()
          const heats = [...s1.docs, ...s2.docs]
            .filter(d => { if (seen.has(d.id)) return false; seen.add(d.id); return true })
            .map(d => ({ id: d.id, ...d.data() }))
          return { aId, heats: sortHeats(heats) }
        })
      )
      const newCache = {}
      results.forEach(r => {
        if (r.status === 'fulfilled') newCache[r.value.aId] = r.value.heats
      })
      setHeatCache(newCache)
    } catch (e) {
      console.error(e)
    } finally { setReloadingHeats(false) }
  }

  // ── Derived: filter carian + kategori, acara rasmi untuk hari terpilih ────

  const kategoriList = [...new Set(Object.values(acaraMap).map(a => a.kategoriKod).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))

  function matchFilter(acara) {
    if (katFilter !== 'semua' && (acara.kategoriKod || '') !== katFilter) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return String(acara.noAcara || '').toLowerCase().includes(q) ||
           (acara.namaAcara || '').toLowerCase().includes(q)
  }

  // items untuk hari `day` selepas filter carian + kategori
  const filteredItemsOf = day => (acaraByDay[day] || []).filter(({ acara }) => matchFilter(acara))
  // acara yang ADA sekurang-kurangnya 1 heat dgn keputusan (untuk counter + gate butang)
  const rasmiOf = items => items.filter(({ acara }) => (heatCache[acara.id] || []).some(isSelesai))
  // acara yang ada heat (walaupun belum ada keputusan) — masuk PDF dgn label "Belum ada keputusan"
  const cetakOf = items => items.filter(({ acara }) => (heatCache[acara.id] || []).length > 0)

  const itemsSelDay  = filteredItemsOf(selDay)
  const rasmiItems   = rasmiOf(itemsSelDay)
  const cetakItems   = cetakOf(itemsSelDay)
  const loadingHeats = reloadingHeats
  const adaFilter    = search.trim() !== '' || katFilter !== 'semua'

  // ── Cetak PDF ─────────────────────────────────────────────────────────────

  async function cetakPDF() {
    if (!selDay || cetakItems.length === 0) return
    setGenerating(true); setProgress('Menjana PDF…'); setMsg(null)
    try {
      const { jsPDF }              = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')

      // Derive nama sekolah from skolMap state (loaded from pendaftaran during init)
      const getNamaSkol = kod => skolMap[kod] || kod || '—'

      const pdf  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const W    = 210
      const M    = 15
      const BLUE = [0, 51, 153]

      function addHdr(isFirst) {
        if (!isFirst) pdf.addPage()
        // Bar atas
        pdf.setFillColor(...BLUE)
        pdf.rect(0, 0, W, 12, 'F')
        pdf.setFontSize(8)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(255, 255, 255)
        pdf.text(namaKej.toUpperCase(), M, 7.5)
        pdf.setTextColor(255, 220, 0)
        pdf.text('KEPUTUSAN RASMI', W - M, 7.5, { align: 'right' })
        pdf.setTextColor(0, 0, 0)

        // Tarikh hari
        pdf.setFontSize(10)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(...BLUE)
        const hariIdx = days.indexOf(selDay) + 1
        const tapisan = adaFilter
          ? [search.trim() ? `CARI "${search.trim().toUpperCase()}"` : '', katFilter !== 'semua' ? `KAT ${katFilter}` : '']
              .filter(Boolean).join(' · ')
          : ''
        pdf.text(`HARI ${hariIdx} — ${fmtTarikh(selDay).toUpperCase()}${tapisan ? `  (${tapisan})` : ''}`, M, 22)
        pdf.setTextColor(0, 0, 0)
        pdf.setDrawColor(...BLUE)
        pdf.setLineWidth(0.4)
        pdf.line(M, 24, W - M, 24)

        // Logo
        const lSize = 14
        if (cfg.logoKiriBase64) {
          try { pdf.addImage(cfg.logoKiriBase64, 'PNG', M, 13, lSize, lSize) } catch {}
        }
        if (cfg.logoKananBase64) {
          try { pdf.addImage(cfg.logoKananBase64, 'PNG', W - M - lSize, 13, lSize, lSize) } catch {}
        }
        return 28 // y start
      }

      let y = addHdr(true)

      for (const { acara, masaMula } of cetakItems) {
        const heats = heatCache[acara.id] || []

        const isPadang = ['padang_lompat', 'padang_balin'].includes(acara.jenisAcara)
        const isRelay  = acara.jenisAcara === 'relay'

        for (const heat of heats) {
        const finalHeat = isFinalFasa(heat)

        // Heat belum ada keputusan — papar label supaya juruhebah tahu acara wujud
        if (!isSelesai(heat)) {
          const janLbl = acara.jantina === 'L' ? 'Lelaki' : acara.jantina === 'P' ? 'Perempuan' : ''
          const title  = [
            acara.noAcara ? `[${acara.noAcara}]` : '',
            acara.namaAcara || '', janLbl,
            acara.kategoriKod ? `Kat ${acara.kategoriKod}` : '',
            `— ${heatLabel(heat, heats.length)}`,
          ].filter(Boolean).join('  ')
          if (y + 14 > 270) y = addHdr(false)
          pdf.setFillColor(245, 245, 245)
          pdf.setDrawColor(210, 210, 210)
          pdf.setLineWidth(0.2)
          pdf.roundedRect(M, y + 2, W - M * 2, 9, 1.5, 1.5, 'FD')
          pdf.setFontSize(8)
          pdf.setFont('helvetica', 'bold')
          pdf.setTextColor(120, 120, 120)
          pdf.text(title + '  —  BELUM ADA KEPUTUSAN', M + 3, y + 7.5)
          pdf.setTextColor(0, 0, 0)
          y += 14
          continue
        }

        // Peserta: SEMUA (termasuk DNS/DNF tanpa rank) — ranked dulu
        const peserta = (heat.peserta || [])
          .filter(p => p.rankDalamHeat || p.status)
          .sort((a, b) => (a.rankDalamHeat || 99) - (b.rankDalamHeat || 99))

        if (peserta.length === 0) continue

        // Rekod: hanya pada heat final (gate rekod sistem)
        const _rekodAktif    = finalHeat ? cariRekodDalamMap(acara, peringkatKej, rekodMap) : null
        const _rekodTuntutan = finalHeat ? cariRekodDalamMap(acara, peringkatKej, tuntutanMap) : null
        const rekodBaru = !!(_rekodTuntutan && _rekodTuntutan.kejohananId === kejId)
        const rekodDoc  = rekodBaru ? _rekodTuntutan : _rekodAktif
        const top1      = peserta[0]

        // Baris peserta
        const rows = peserta.map(p => {
          const flagged = ['DNS', 'DNF', 'DQ', 'FS', 'NM'].includes(p.status)
          return [
            p.rankDalamHeat || '—',
            isRelay ? getNamaSkol(p.kodSekolah) : (p.namaAtlet || '—'),
            isRelay ? '—' : getNamaSkol(p.kodSekolah),
            flagged ? p.status : fmtPrestasi(p.keputusan, acara.jenisAcara),
            p.status !== 'selesai' ? p.status : '',
          ]
        })

        // Header acara + label heat
        const janLabel   = acara.jantina === 'L' ? 'Lelaki' : acara.jantina === 'P' ? 'Perempuan' : ''
        const acaraTitle = [
          acara.noAcara ? `[${acara.noAcara}]` : '',
          acara.namaAcara || '',
          janLabel,
          acara.kategoriKod ? `Kat ${acara.kategoriKod}` : '',
          `— ${heatLabel(heat, heats.length)}`,
          masaMula          ? `— ${masaMula}` : '',
        ].filter(Boolean).join('  ')

        // Perlu halaman baru?
        const estH = 8 + rows.length * 7 + (rekodDoc ? (rekodBaru ? 20 : 12) : 0)
        if (y + estH > 270) {
          y = addHdr(false)
        }

        // Jadual keputusan
        autoTable(pdf, {
          startY: y,
          head: [[{
            content: acaraTitle,
            colSpan: 5,
            styles: {
              fillColor: [235, 240, 255],
              textColor: [0, 30, 100],
              fontStyle: 'bold',
              fontSize:  9,
              cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
            },
          }],
          [
            { content: 'Kd.',    styles: { halign: 'center' } },
            { content: isRelay ? 'Pasukan / Sekolah' : 'Nama Atlet' },
            { content: isRelay ? '' : 'Sekolah' },
            { content: isPadang ? 'Jarak' : 'Masa', styles: { halign: 'right' } },
            { content: 'Status', styles: { halign: 'center' } },
          ]],
          body: rows,
          styles: {
            fontSize:    9,
            cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 },
            font:        'helvetica',
          },
          headStyles: {
            fillColor:  [200, 210, 240],
            textColor:  [0, 0, 0],
            fontStyle:  'bold',
            fontSize:   8,
          },
          columnStyles: {
            0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
            1: { cellWidth: 'auto' },
            2: { cellWidth: 42 },
            3: { cellWidth: 28, halign: 'right', fontStyle: 'bold', textColor: [0, 51, 153] },
            4: { cellWidth: 18, halign: 'center', fontSize: 7, textColor: [180, 60, 60] },
          },
          theme: 'grid',
          tableLineColor: [210, 215, 230],
          tableLineWidth: 0.2,
          didParseCell: (data) => {
            // Highlight baris 1, 2, 3 — pemenang pingat (final sahaja)
            if (data.section === 'body' && finalHeat) {
              const rank = peserta[data.row.index]?.rankDalamHeat
              if (rank === 1) data.cell.styles.fillColor = [255, 248, 220]
              else if (rank === 2) data.cell.styles.fillColor = [245, 245, 248]
              else if (rank === 3) data.cell.styles.fillColor = [255, 245, 235]
            }
          },
        })
        y = pdf.lastAutoTable.finalY

        // ── Kotak rekod ──
        // Case A: rekod baru dipecah dalam kejohanan ini (postRasmi dah run)
        // Case B: rekod lama dari koleksi (untuk rujukan juruhebah)
        const PERINGKAT_LABEL_MAP = { D: 'Daerah', N: 'Negeri', K: 'Kebangsaan' }
        const pLabel = PERINGKAT_LABEL_MAP[peringkatKej] || peringkatKej

        if (rekodDoc) {
          pdf.setLineWidth(0.3)
          pdf.setFontSize(8)

          if (rekodBaru) {
            // ── Case A: Rekod baru dipecah ──
            const hasLama = rekodDoc.prestasiLama != null
            const boxH    = hasLama ? 18 : 14
            pdf.setFillColor(255, 243, 205)
            pdf.setDrawColor(200, 150, 0)
            pdf.roundedRect(M, y + 2, W - M * 2, boxH, 2, 2, 'FD')

            // Baris 1: rekod baru
            pdf.setFont('helvetica', 'bold')
            pdf.setTextColor(120, 80, 0)
            const newNama  = rekodDoc.namaAtlet  || (top1?.namaAtlet || '—')
            const newSkol  = rekodDoc.namaSekolah || rekodDoc.kodSekolah || (top1?.kodSekolah || '—')
            const newP     = fmtPrestasi(rekodDoc.prestasi, acara.jenisAcara)
            pdf.text(
              '[RBK — REKOD BARU KEJOHANAN]  ' + newP + '  --  ' + newNama + '  (' + newSkol + ')',
              M + 3, y + 8
            )

            // Baris 2: rekod lama
            pdf.setFont('helvetica', 'normal')
            pdf.setFontSize(7.5)
            pdf.setTextColor(80, 55, 10)
            if (hasLama) {
              const oldP    = fmtPrestasi(rekodDoc.prestasiLama, acara.jenisAcara)
              const oldNama = rekodDoc.namaLama    || '—'
              const oldLok  = rekodDoc.lokasiLama  || '—'
              const oldThn  = rekodDoc.tahunLama   || ''
              pdf.text(
                'Rekod Lama: ' + oldP + '  --  ' + oldNama + '  (' + oldLok + ')' +
                (oldThn ? '  ' + oldThn : ''),
                M + 3, y + 14
              )
            } else {
              pdf.text('Rekod Pertama Ditetapkan', M + 3, y + 14)
            }

            pdf.setTextColor(0, 0, 0)
            y += boxH + 6

          } else {
            // ── Case B: Tunjuk rekod semasa untuk rujukan juruhebah ──
            pdf.setFillColor(235, 242, 255)
            pdf.setDrawColor(150, 170, 220)
            pdf.roundedRect(M, y + 2, W - M * 2, 10, 2, 2, 'FD')

            pdf.setFont('helvetica', 'normal')
            pdf.setTextColor(40, 60, 130)
            const rP    = fmtPrestasi(rekodDoc.prestasi, acara.jenisAcara)
            const rNama = rekodDoc.namaAtlet  || '—'
            const rSkol = rekodDoc.namaSekolah || rekodDoc.lokasiLama || '—'
            const rThn  = rekodDoc.tarikhRekod ? String(rekodDoc.tarikhRekod).slice(0, 4) : ''
            pdf.text(
              'Rekod ' + pLabel + ':  ' + rP + '  --  ' + rNama + '  (' + rSkol + ')' +
              (rThn ? '  ' + rThn : ''),
              M + 3, y + 8
            )

            pdf.setTextColor(0, 0, 0)
            y += 16
          }
        } else {
          y += 4
        }
        } // end loop heats
      }

      // Nombor halaman
      const total = pdf.getNumberOfPages()
      for (let i = 1; i <= total; i++) {
        pdf.setPage(i)
        pdf.setFontSize(7)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(160, 160, 160)
        pdf.text(`${i} / ${total}`, W - M, 290, { align: 'right' })
        pdf.text(namaKej, M, 290)
        pdf.setTextColor(0, 0, 0)
      }

      const fname = `Keputusan_Hari${days.indexOf(selDay) + 1}_${selDay}_${namaKej.replace(/\s+/g, '_')}.pdf`
      pdf.save(fname)
      setMsg({ type: 'ok', text: 'PDF berjaya dijana.' })
    } catch (e) {
      setMsg({ type: 'err', text: 'Ralat PDF: ' + e.message })
    } finally { setGenerating(false); setProgress('') }
  }

  // ── Export Excel ─────────────────────────────────────────────────────────

  async function exportExcel() {
    // 1 sheet per hari — hanya hari yang ditanda (checkbox pada tab hari)
    const daysToExport = days.filter(d => exportDays.has(d))
    if (daysToExport.length === 0) return
    setGenerating(true); setProgress('Menjana Excel…'); setMsg(null)
    try {
      const XLSX = await import('xlsx')

      // Nama sekolah dari skolMap state (koleksi sekolah, diload masa init)
      const getNamaSkol2 = kod => skolMap[kod] || kod || ''

      const wb = XLSX.utils.book_new()
      let adaSheet = false

      for (const day of daysToExport) {
        const items = cetakOf(filteredItemsOf(day))
        if (items.length === 0) continue

        const rows = []
        rows.push([namaKej])
        rows.push([`Keputusan Rasmi — ${fmtTarikh(day)}`])
        rows.push([])
        rows.push(['No Acara', 'Nama Acara', 'Kategori', 'Jantina', 'Fasa', 'Kedudukan', 'Nama Atlet / Pasukan', 'Sekolah', 'Prestasi', 'Status', 'Rekod Pecah'])

        for (const { acara } of items) {
          const heats = heatCache[acara.id] || []
          const isPadang = ['padang_lompat', 'padang_balin'].includes(acara.jenisAcara)
          const isRelay  = acara.jenisAcara === 'relay'

          for (const heat of heats) {
            const finalHeat = isFinalFasa(heat)

            if (!isSelesai(heat)) {
              rows.push([
                acara.noAcara || '', acara.namaAcara || '', acara.kategoriKod || '',
                acara.jantina === 'L' ? 'Lelaki' : acara.jantina === 'P' ? 'Perempuan' : '',
                heatLabel(heat, heats.length),
                '', 'BELUM ADA KEPUTUSAN', '', '', '', '',
              ])
              rows.push([])
              continue
            }

            const peserta = (heat.peserta || [])
              .filter(p => p.rankDalamHeat || p.status)
              .sort((a, b) => (a.rankDalamHeat || 99) - (b.rankDalamHeat || 99))
            if (peserta.length === 0) continue

            const rekodDoc = finalHeat ? cariRekodDalamMap(acara, peringkatKej, rekodMap) : null

            peserta.forEach(p => {
              const flagged = ['DNS', 'DNF', 'DQ', 'FS', 'NM'].includes(p.status)
              const np      = Number(p.keputusan)
              const rp      = rekodDoc ? Number(rekodDoc.prestasi) : null
              const pecah   = !flagged && rp != null && p.rankDalamHeat === 1
                ? (isPadang ? np > rp : np < rp)
                : false
              rows.push([
                acara.noAcara    || '',
                acara.namaAcara  || '',
                acara.kategoriKod || '',
                acara.jantina === 'L' ? 'Lelaki' : acara.jantina === 'P' ? 'Perempuan' : '',
                heatLabel(heat, heats.length),
                p.rankDalamHeat  || '',
                isRelay ? getNamaSkol2(p.kodSekolah) : (p.namaAtlet || ''),
                isRelay ? '' : getNamaSkol2(p.kodSekolah),
                flagged ? p.status : fmtPrestasi(p.keputusan, acara.jenisAcara),
                p.status         || '',
                pecah ? 'YA' : '',
              ])
            })
            rows.push([]) // baris kosong antara heat
          }
        }

        const ws = XLSX.utils.aoa_to_sheet(rows)
        ws['!cols'] = [
          { wch: 10 }, { wch: 28 }, { wch: 8 }, { wch: 12 }, { wch: 16 },
          { wch: 10 }, { wch: 30 }, { wch: 28 }, { wch: 14 },
          { wch: 10 }, { wch: 12 },
        ]
        const sheetName = day === 'tba' ? 'Lain-lain' : `Hari ${days.indexOf(day) + 1}`
        XLSX.utils.book_append_sheet(wb, ws, sheetName)
        adaSheet = true
      }

      if (!adaSheet) {
        setMsg({ type: 'err', text: 'Tiada keputusan untuk hari yang dipilih.' })
        return
      }
      const fname = `Keputusan_${namaKej.replace(/\s+/g, '_')}.xlsx`
      XLSX.writeFile(wb, fname)
      setMsg({ type: 'ok', text: `Excel berjaya dijana (${daysToExport.length} hari dipilih).` })
    } catch (e) {
      setMsg({ type: 'err', text: 'Ralat Excel: ' + e.message })
    } finally { setGenerating(false); setProgress('') }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loadingInit) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-gray-400 text-sm">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        Memuatkan…
      </div>
    )
  }

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">

      {/* Nav Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/admin')} className="text-xs text-gray-500 hover:text-[#003399]">← Kembali</button>
          <div>
            <h1 className="text-base font-bold text-[#003399]">Cetakan Keputusan</h1>
            <p className="text-xs text-gray-400 mt-0.5">Pilih hari → jana PDF atau Excel keputusan rasmi</p>
          </div>
          {namaKej && <p className="text-xs font-semibold text-[#003399] mt-0.5">{namaKej}</p>}
        </div>

        {/* Butang cetak */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={cetakPDF}
            disabled={generating || cetakItems.length === 0 || loadingHeats}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#003399] hover:bg-[#002280] disabled:bg-gray-300 text-white text-xs font-bold rounded-lg transition-colors"
          >
            {generating && progress.includes('PDF') ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
            ) : '📄'}
            Cetak PDF
          </button>
          <button
            onClick={exportExcel}
            disabled={generating || exportDays.size === 0 || loadingHeats}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-xs font-bold rounded-lg transition-colors"
          >
            {generating && progress.includes('Excel') ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
            ) : '📊'}
            Export Excel
          </button>
        </div>
      </div>

      {/* Mesej */}
      {msg && (
        <div className={`px-4 py-2.5 rounded-lg text-xs font-medium border ${
          msg.type === 'ok'
            ? 'bg-green-50 text-green-700 border-green-200'
            : 'bg-red-50 text-red-700 border-red-200'
        }`}>
          {msg.text}
          <button onClick={() => setMsg(null)} className="ml-2 opacity-50 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Progress */}
      {generating && (
        <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5">
          <svg className="w-3.5 h-3.5 animate-spin text-[#003399] shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          {progress}
        </div>
      )}

      {days.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl py-16 text-center text-gray-400">
          <p className="text-2xl mb-2">📅</p>
          <p className="text-sm font-semibold">Tiada jadual acara dijumpai.</p>
        </div>
      ) : (
        <>
        {/* Toolbar: cari acara + tapis kategori */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari no acara atau nama acara…"
              className="w-full pl-8 pr-8 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003399]/30 focus:border-[#003399]"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">✕</button>
            )}
          </div>
          <select
            value={katFilter}
            onChange={e => setKatFilter(e.target.value)}
            className="px-3 py-2 text-xs font-semibold border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#003399]/30"
          >
            <option value="semua">Semua Kategori</option>
            {kategoriList.map(k => <option key={k} value={k}>Kat {k}</option>)}
          </select>
          {adaFilter && (
            <button
              onClick={() => { setSearch(''); setKatFilter('semua') }}
              className="text-[10px] font-bold text-red-500 hover:text-red-700 px-2 py-2"
            >
              Padam Tapisan ✕
            </button>
          )}
        </div>

        <div className="flex gap-4">

          {/* Kiri: Tab hari (checkbox = hari dipilih untuk Export Excel) */}
          <div className="w-44 shrink-0 space-y-1">
            {days.map((date, i) => {
              const items    = filteredItemsOf(date)
              const nRasmi   = rasmiOf(items).length
              const isActive = date === selDay
              const dipilih  = exportDays.has(date)
              return (
                <div
                  key={date}
                  onClick={() => setSelDay(date)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#003399] text-white border-[#003399] shadow-sm'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-[#003399]/40 hover:bg-blue-50/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div>
                      <p className={`text-[10px] font-bold uppercase tracking-wide ${isActive ? 'text-white/70' : 'text-gray-400'}`}>
                        {date === 'tba' ? 'Lain-lain' : `Hari ${i + 1}`}
                      </p>
                      <p className="text-xs font-semibold mt-0.5">
                        {date === 'tba'
                          ? 'Tiada Tarikh'
                          : new Date(date + 'T00:00:00').toLocaleDateString('ms-MY', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={dipilih}
                      onClick={e => e.stopPropagation()}
                      onChange={() => {
                        setExportDays(prev => {
                          const next = new Set(prev)
                          if (next.has(date)) next.delete(date); else next.add(date)
                          return next
                        })
                      }}
                      title="Masukkan hari ini dalam Export Excel"
                      className="mt-0.5 w-3.5 h-3.5 accent-green-600 cursor-pointer shrink-0"
                    />
                  </div>
                  <p className={`text-[10px] mt-1 ${isActive ? 'text-white/80' : 'text-gray-400'}`}>
                    {nRasmi} / {items.length} rasmi
                  </p>
                </div>
              )
            })}
            <p className="text-[9px] text-gray-400 px-1 pt-1">☑ = hari dimasukkan dalam Export Excel (1 sheet / hari)</p>
          </div>

          {/* Kanan: Senarai acara hari terpilih */}
          <div className="flex-1 min-w-0">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">

              {/* Header hari */}
              <div className="px-4 py-3 bg-[#003399] text-white flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold">
                    Hari {days.indexOf(selDay) + 1} — {fmtTarikh(selDay)}
                  </p>
                  <p className="text-[10px] text-white/70 mt-0.5">
                    {rasmiItems.length} acara rasmi daripada {itemsSelDay.length} acara
                  </p>
                </div>
                <button
                  onClick={reloadHeats}
                  disabled={reloadingHeats}
                  className="text-[10px] font-bold px-2.5 py-1 rounded bg-white/20 hover:bg-white/30 text-white transition-colors flex items-center gap-1 disabled:opacity-60"
                >
                  <svg className={`w-3 h-3 ${reloadingHeats ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {reloadingHeats ? 'Memuatkan…' : 'Muat Semula'}
                </button>
              </div>

              {/* Loading heats */}
              {loadingHeats && (
                <div className="flex items-center gap-2 px-4 py-3 text-xs text-gray-400 border-b border-gray-100">
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Memuatkan keputusan…
                </div>
              )}

              {/* Senarai acara */}
              {itemsSelDay.length === 0 ? (
                <div className="py-10 text-center text-gray-400 text-sm">
                  Tiada acara pada hari ini.
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {itemsSelDay.map(({ acara, masaMula, lokasi }) => {
                    const heats     = heatCache[acara.id] || []
                    const heatsSiap = heats.filter(isSelesai)
                    const isRasmi   = heatsSiap.length > 0
                    const isLoad    = false
                    const isPadang  = ['padang_lompat', 'padang_balin'].includes(acara.jenisAcara)
                    const isRelay   = acara.jenisAcara === 'relay'
                    // Preview guna heat final kalau ada, jika tidak heat pertama
                    const heat      = heatsSiap.find(isFinalFasa) || heatsSiap[0] || null

                    // Semak rekod — hanya relevan bila ada heat final selesai
                    const rekodDoc = heatsSiap.some(isFinalFasa) ? cariRekodDalamMap(acara, peringkatKej, rekodMap) : null
                    const top1     = heat ? (heat.peserta || []).find(p => p.rankDalamHeat === 1 && p.status === 'selesai') : null
                    const pecah    = top1 && rekodDoc && (() => {
                      const np = Number(top1.keputusan)
                      const rp = Number(rekodDoc.prestasi)
                      return isPadang ? np > rp : np < rp
                    })()

                    const janLabel = acara.jantina === 'L' ? 'L' : acara.jantina === 'P' ? 'P' : '—'

                    // Peringkat badge — sama gaya StartList
                    let peringkatBadge
                    if (acara.peringkat === 'saringan_qf') {
                      peringkatBadge = <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 shrink-0">QF</span>
                    } else if (acara.peringkat === 'saringan_sf') {
                      peringkatBadge = <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700 shrink-0">SF</span>
                    } else if (acara.peringkat === 'separuh_akhir') {
                      peringkatBadge = <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 shrink-0">SF</span>
                    } else if (acara.parentAcaraId) {
                      peringkatBadge = <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 shrink-0">FINAL</span>
                    } else {
                      peringkatBadge = <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-green-100 text-green-700 shrink-0">T.FINAL</span>
                    }

                    return (
                      <div key={acara.id} className={`px-4 py-3 ${isRasmi ? '' : 'opacity-50'}`}>
                        <div className="flex items-start gap-3">

                          {/* No acara */}
                          <span className="text-[10px] font-black text-[#003399] font-mono w-8 shrink-0 pt-0.5">
                            {acara.noAcara || '—'}
                          </span>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-semibold text-gray-800 truncate">
                                {acara.namaAcara || '—'}
                              </span>
                              {peringkatBadge}
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                acara.jantina === 'L' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'
                              }`}>{janLabel}</span>
                              <span className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-bold">
                                Kat {acara.kategoriKod || '—'}
                              </span>
                              {isRelay && <span className="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-bold">Relay</span>}
                              {pecah && (
                                <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">
                                  ★ Rekod Pecah
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {masaMula && `${masaMula}  ·  `}{lokasi || ''}
                            </p>

                            {/* Keputusan penuh — SEMUA heat, SEMUA peserta */}
                            {heats.length > 0 && (
                              <div className="mt-1.5 space-y-2">
                                {heats.map(h => {
                                  if (!isSelesai(h)) {
                                    return (
                                      <div key={h.id} className="flex items-center gap-1.5">
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-wide">
                                          {heatLabel(h, heats.length)}
                                        </p>
                                        <span className="text-[9px] text-gray-400 italic">— Belum ada keputusan</span>
                                      </div>
                                    )
                                  }
                                  const semua = (h.peserta || [])
                                    .filter(p => p.rankDalamHeat || p.status)
                                    .sort((a, b) => (a.rankDalamHeat || 99) - (b.rankDalamHeat || 99))
                                  if (semua.length === 0) return null
                                  return (
                                    <div key={h.id}>
                                      <p className="text-[9px] font-black text-gray-500 uppercase tracking-wide mb-0.5">
                                        {heatLabel(h, heats.length)}
                                      </p>
                                      <div className="space-y-0.5">
                                        {semua.map((p, pi) => {
                                          const flagged = ['DNS', 'DNF', 'DQ', 'FS', 'NM'].includes(p.status)
                                          return (
                                            <div key={p.noBib || pi} className="flex items-center gap-1.5 text-[10px]">
                                              <span className="w-5 text-center shrink-0">
                                                {isFinalFasa(h) && PINGAT_UI[p.rankDalamHeat]
                                                  ? PINGAT_UI[p.rankDalamHeat]
                                                  : <span className="font-mono font-bold text-gray-400">{p.rankDalamHeat || '—'}</span>}
                                              </span>
                                              <span className="font-semibold text-gray-700 truncate max-w-[160px]">
                                                {isRelay ? (skolMap[p.kodSekolah] || p.kodSekolah) : (p.namaAtlet || '—')}
                                              </span>
                                              {!isRelay && <span className="text-gray-400 truncate">{skolMap[p.kodSekolah] || p.kodSekolah}</span>}
                                              <span className={`font-mono font-bold ml-auto shrink-0 ${flagged ? 'text-red-500' : 'text-[#003399]'}`}>
                                                {flagged ? p.status : fmtPrestasi(p.keputusan, acara.jenisAcara)}
                                              </span>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>

                          {/* Status badge */}
                          <div className="shrink-0">
                            {isLoad ? (
                              <span className="text-[9px] text-gray-400">⏳</span>
                            ) : isRasmi ? (
                              <span className="text-[9px] font-bold text-green-600 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded">
                                KEPUTUSAN{heatsSiap.length > 1 ? ` ×${heatsSiap.length}` : ''}
                                {heatsSiap.length < heats.length ? ` (${heats.length - heatsSiap.length} belum)` : ''}
                              </span>
                            ) : heats.length > 0 ? (
                              <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                BELUM ADA
                              </span>
                            ) : (
                              <span className="text-[9px] text-gray-400 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded">—</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Nota */}
            <p className="text-[10px] text-gray-400 mt-2 px-1">
              PDF ikut hari terpilih + tapisan carian/kategori. Heat tanpa keputusan dipapar
              dengan label "Belum ada keputusan". Excel: 1 sheet per hari yang ditanda ☑.
              Rekod dipecahkan ditanda ★ dan dipaparkan dalam PDF.
            </p>
          </div>
        </div>
        </>
      )}
    </div>
  )
}
