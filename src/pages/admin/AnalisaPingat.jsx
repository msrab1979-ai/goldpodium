/**
 * AnalisaPingat — /dashboard/analisapingat
 * Kedudukan atlet terbaik by kategori — pingat dari acara final sahaja.
 * Rekod dari rekod collection (tuntutan) — bukan pecahRekod field (boleh dibuang).
 * Tab "Atlet Terbaik" — admin cipta tajuk dinamik, pilih atlet, cetak PDF 3 salinan.
 */

import { useState, useEffect, useMemo } from 'react'
import { collection, getDocs, query, where, orderBy, doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const FASA_FINAL  = ['final', 'terus_final']
const STATUS_SAH  = ['diterima', 'rasmi']
const MATA_PINGAT = { 1: 5, 2: 3, 3: 2 }
const SALINAN     = ['JURUHEBAH', 'HADIAH', 'PENGURUS PESERTA']

function fmtPrestasi(val, unit) {
  if (val == null || val === '') return '—'
  const n = Number(val)
  if (isNaN(n) || n === 0) return '—'
  if (unit === 'm') return `${n.toFixed(2)}m`
  const min = Math.floor(n / 60)
  const sek = (n % 60).toFixed(2).padStart(5, '0')
  return min > 0 ? `${min}:${sek}` : `${n.toFixed(2)}s`
}

function fmtPingat(n) { return n > 0 ? String(n) : '—' }

export default function AnalisaPingat() {
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')
  const [kategoriList, setKategoriList] = useState([])
  const [atletMap,     setAtletMap]     = useState({})
  const [selKat,       setSelKat]       = useState('')
  const [namaKej,      setNamaKej]      = useState('')

  // Tab: kod kategori atau 'atletTerbaik'
  const [activeTab,    setActiveTab]    = useState('')

  // Atlet Terbaik state
  const [tajukList,    setTajukList]    = useState([])   // [{ id, namaTajuk, atlet: null|{...} }]
  const [inputTajuk,   setInputTajuk]   = useState('')
  const [savingTajuk,  setSavingTajuk]  = useState(false)
  const [confirmGanti, setConfirmGanti] = useState(null) // { tajukId, atlet }
  const [cetakTBLoading, setCetakTBLoading] = useState(false)

  // Calon Home state
  const [calonList,    setCalonList]    = useState([])   // [{ noKP, namaAtlet, namaSekolah, kategoriKod, pingat, acaraPingat, mata, rekodList }]
  const [savingCalon,  setSavingCalon]  = useState(null) // noKP yang sedang disimpan
  const [showAtHome,   setShowAtHome]   = useState(false)
  const [savingShow,   setSavingShow]   = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        // 1. Kejohanan aktif
        const kejSnap = await getDocs(query(collection(db, 'kejohanan'), where('statusKejohanan', 'in', ['aktif', 'persediaan'])))
        if (kejSnap.empty) { setError('Tiada kejohanan aktif.'); setLoading(false); return }
        const kej   = kejSnap.docs[0]
        const kejId = kej.id
        setNamaKej(kej.data().namaKejohanan || kejId)

        // 2. Kategori list
        const katSnap = await getDocs(query(collection(db, 'kategori'), orderBy('urutan')))
        const katList = katSnap.docs
          .map(d => ({ kod: d.data().kod || d.id, label: d.data().label || d.data().nama || d.id, order: d.data().urutan ?? 99 }))
          .sort((a, b) => a.order - b.order)
        setKategoriList(katList)
        if (katList.length > 0) setSelKat(katList[0].kod)
        setActiveTab(katList.length > 0 ? katList[0].kod : 'atletTerbaik')

        // 3. Sekolah map
        const skolSnap = await getDocs(collection(db, 'sekolah'))
        const skolMap  = {}
        skolSnap.docs.forEach(d => { skolMap[d.id] = d.data().namaSekolah || d.id })

        // 4. Rekod dipecah dari mata_olahragawan
        const mataSnap = await getDocs(query(collection(db, 'mata_olahragawan'), where('kejohananId', '==', kejId)))
        const tuntutanByNoKP = {}
        mataSnap.docs.forEach(d => {
          const data = d.data()
          const noKP = data.noKP || d.id.replace(`_${kejId}`, '')
          if (!noKP) return
          Object.entries(data).forEach(([key, val]) => {
            if (!key.startsWith('rekod_')) return
            if (!val?.namaAcara) return
            if (!tuntutanByNoKP[noKP]) tuntutanByNoKP[noKP] = []
            tuntutanByNoKP[noKP].push({
              namaAcara:    val.namaAcara    || '—',
              namaAcaraPendek: val.namaAcaraPendek || val.namaAcara || '—',
              prestasiBaru: val.prestasiBaru ?? null,
              unit:         val.unit         || 's',
              prestasiLama: val.prestasiLama ?? null,
              namaLama:     val.namaLama     || null,
              lokasiLama:   val.lokasiLama   || null,
              tahunLama:    val.tahunLama    || null,
            })
          })
        })

        // 5. Load semua acara → heat final → kira pingat
        const acaraSnap = await getDocs(query(collection(db, 'kejohanan', kejId, 'acara'), orderBy('noAcara')))
        const aMap = {}

        for (const aDoc of acaraSnap.docs) {
          const ad = aDoc.data()
          if (ad.jenisAcara === 'relay') continue
          const isFinalAcara = !!ad.parentAcaraId

          const heatSnap = await getDocs(collection(db, 'kejohanan', kejId, 'acara', aDoc.id, 'heat'))
          for (const hDoc of heatSnap.docs) {
            const hd = hDoc.data()
            const fasaOk = FASA_FINAL.includes(hd.fasa) || (isFinalAcara && hd.fasa == null)
            if (!fasaOk)                                  continue
            if (!STATUS_SAH.includes(hd.statusKeputusan)) continue

            for (const p of (hd.peserta || [])) {
              const rank = p.rankDalamHeat
              if (!p.noKP) continue
              if (!rank || rank > 3) continue

              if (!aMap[p.noKP]) aMap[p.noKP] = {
                namaAtlet:   p.namaAtlet   || '—',
                kodSekolah:  p.kodSekolah  || '',
                kategoriKod: p.kategoriKod || ad.kategoriKod || '',
                pingat:      { 1: 0, 2: 0, 3: 0 },
                acaraPingat: { 1: [], 2: [], 3: [] },
                mata:        0,
              }
              aMap[p.noKP].pingat[rank]++
              aMap[p.noKP].acaraPingat[rank].push(ad.namaAcaraPendek || ad.namaAcara || '—')
            }
          }
        }

        // 6. Attach sekolah, mata, rekodList
        Object.entries(aMap).forEach(([noKP, a]) => {
          a.namaSekolah = skolMap[a.kodSekolah] || a.kodSekolah || '—'
          a.mata        = (a.pingat[1] * 5) + (a.pingat[2] * 3) + (a.pingat[3] * 2)
          a.rekodList   = tuntutanByNoKP[noKP] || []
        })

        // 7. Atlet ada rekod tapi tiada pingat
        mataSnap.docs.forEach(d => {
          const data = d.data()
          const noKP = data.noKP || d.id.replace(`_${kejId}`, '')
          if (!noKP || !tuntutanByNoKP[noKP] || aMap[noKP]) return
          const firstRekod = Object.entries(data).find(([k]) => k.startsWith('rekod_'))
          const katKod = firstRekod?.[1]?.kategoriKod || ''
          aMap[noKP] = {
            namaAtlet:   data.namaAtlet  || '—',
            kodSekolah:  data.kodSekolah || '',
            namaSekolah: skolMap[data.kodSekolah] || data.namaSekolah || data.kodSekolah || '—',
            kategoriKod: katKod,
            pingat:      { 1: 0, 2: 0, 3: 0 },
            acaraPingat: { 1: [], 2: [], 3: [] },
            mata:        0,
            rekodList:   tuntutanByNoKP[noKP],
          }
        })

        setAtletMap(aMap)

        // 8. Load tajuk atlet terbaik + calon dari Firestore
        const tbSnap = await getDoc(doc(db, 'tetapan', 'atletTerbaik'))
        if (tbSnap.exists()) {
          setTajukList(tbSnap.data().tajuk || [])
          setCalonList(tbSnap.data().calon || [])
          setShowAtHome(tbSnap.data().showAtHome || false)
        }

      } catch (e) {
        console.error(e)
        setError('Ralat: ' + e.message)
      }
      setLoading(false)
    }
    load()
  }, [])

  const rows = useMemo(() => {
    if (!selKat) return []
    return Object.entries(atletMap)
      .filter(([, a]) => a.kategoriKod === selKat)
      .map(([noKP, a]) => ({ noKP, ...a }))
      .sort((a, b) => {
        if (b.pingat[1] !== a.pingat[1]) return b.pingat[1] - a.pingat[1]
        if (b.pingat[2] !== a.pingat[2]) return b.pingat[2] - a.pingat[2]
        if (b.pingat[3] !== a.pingat[3]) return b.pingat[3] - a.pingat[3]
        if (b.mata       !== a.mata)      return b.mata - a.mata
        return (b.rekodList.length) - (a.rekodList.length)
      })
  }, [atletMap, selKat])

  // ── Audit state ──────────────────────────────────────────────────────────
  const [cetakLoading,  setCetakLoading]  = useState(false)
  const [auditLoading,  setAuditLoading]  = useState(false)
  const [auditResult,   setAuditResult]   = useState(null)

  async function handleAudit() {
    setAuditLoading(true)
    setAuditResult(null)
    try {
      const kejSnap = await getDocs(query(collection(db, 'kejohanan'), where('statusKejohanan', 'in', ['aktif', 'persediaan'])))
      if (kejSnap.empty) return
      const kejId = kejSnap.docs[0].id

      const mataSnap = await getDocs(query(collection(db, 'mata_olahragawan'), where('kejohananId', '==', kejId)))

      const rekodSnap = await getDocs(collection(db, 'rekod'))
      const rekodLib     = {}
      const tuntutanLib  = {}
      rekodSnap.docs.forEach(d => {
        if (d.id.endsWith('_tuntutan')) tuntutanLib[d.id.replace('_tuntutan', '')] = d.data()
        else rekodLib[d.id] = d.data()
      })

      const medalBeza    = []
      const rekodStale   = []
      const rekodPending = []
      let   rekodSah     = 0

      mataSnap.docs.forEach(d => {
        const data  = d.data()
        const noKP  = data.noKP || d.id.replace(`_${kejId}`, '')
        const nama  = data.namaAtlet  || noKP
        const skol  = data.namaSekolah || data.kodSekolah || '—'
        const katKod = data.kategoriKod || ''

        const fsEmas   = data.pingat_emas   || 0
        const fsPerak  = data.pingat_perak  || 0
        const fsGangsa = data.pingat_gangsa || 0
        const fsMata   = data.jumlahMata    || 0

        const atlet = atletMap[noKP]
        if (atlet) {
          const kirEmas   = atlet.pingat[1] || 0
          const kirPerak  = atlet.pingat[2] || 0
          const kirGangsa = atlet.pingat[3] || 0
          const kirMata   = atlet.mata       || 0

          if (fsEmas !== kirEmas || fsPerak !== kirPerak || fsGangsa !== kirGangsa) {
            medalBeza.push({
              noKP, nama, skol, katKod,
              fs:  { emas: fsEmas,  perak: fsPerak,  gangsa: fsGangsa,  mata: fsMata  },
              kir: { emas: kirEmas, perak: kirPerak, gangsa: kirGangsa, mata: kirMata },
            })
          }
        }

        Object.entries(data).forEach(([key, val]) => {
          if (!key.startsWith('rekod_')) return
          if (!val?.namaAcara) return

          const rekodNama = val.namaAcaraPendek || val.namaAcara || ''
          const rKey = [rekodNama, val.jantina || data.jantina || '', val.kategoriKod || katKod, val.peringkat || 'D']
            .join('_').toUpperCase().replace(/[^A-Z0-9_]/g, '_')

          const inLib      = !!rekodLib[rKey]
          const inTuntutan = !!tuntutanLib[rKey]

          if (inLib) {
            const lib = rekodLib[rKey]
            const libNoKP = lib.noKP || ''
            if (libNoKP && libNoKP !== noKP) {
              rekodStale.push({ noKP, nama, skol, namaAcara: val.namaAcara, rKey, sebab: 'Rekod disahkan — pemegang lain', libNoKP, libNama: lib.namaAtlet || '—' })
            } else {
              rekodSah++
            }
          } else if (inTuntutan) {
            rekodPending.push({ noKP, nama, skol, namaAcara: val.namaAcara, rKey })
          } else {
            rekodStale.push({ noKP, nama, skol, namaAcara: val.namaAcara, rKey, sebab: 'Tiada dalam library & tiada tuntutan' })
          }
        })
      })

      setAuditResult({ medalBeza, rekodStale, rekodPending, rekodSah, totalAtlet: mataSnap.size })
    } catch (e) {
      console.error('audit:', e)
      setAuditResult({ err: e.message })
    } finally {
      setAuditLoading(false)
    }
  }

  // ── Atlet Terbaik functions ──────────────────────────────────────────────

  async function saveTajuk(newList) {
    setSavingTajuk(true)
    try {
      await setDoc(doc(db, 'tetapan', 'atletTerbaik'), { tajuk: newList }, { merge: true })
      setTajukList(newList)
    } catch (e) {
      console.error('saveTajuk:', e)
    } finally {
      setSavingTajuk(false)
    }
  }

  async function toggleCalon(atlet) {
    const noKP = atlet.noKP
    setSavingCalon(noKP)
    const sudahCalon = calonList.some(c => c.noKP === noKP)
    const newCalon = sudahCalon
      ? calonList.filter(c => c.noKP !== noKP)
      : [...calonList, {
          noKP,
          namaAtlet:    atlet.namaAtlet,
          namaSekolah:  atlet.namaSekolah,
          kategoriKod:  atlet.kategoriKod,
          kategoriLabel: kategoriList.find(k => k.kod === atlet.kategoriKod)?.label || atlet.kategoriKod,
          pingat:       atlet.pingat,
          acaraPingat:  atlet.acaraPingat,
          mata:         atlet.mata,
          rekodList:    atlet.rekodList,
        }]
    try {
      await setDoc(doc(db, 'tetapan', 'atletTerbaik'), { calon: newCalon }, { merge: true })
      setCalonList(newCalon)
    } catch (e) {
      alert('Ralat: ' + e.message)
    } finally {
      setSavingCalon(null)
    }
  }

  async function toggleShowAtHome() {
    setSavingShow(true)
    const newVal = !showAtHome
    try {
      await setDoc(doc(db, 'tetapan', 'atletTerbaik'), { showAtHome: newVal }, { merge: true })
      setShowAtHome(newVal)
    } catch (e) {
      alert('Ralat: ' + e.message)
    } finally {
      setSavingShow(false)
    }
  }

  function handleTambahTajuk() {
    const nama = inputTajuk.trim()
    if (!nama) return
    const newList = [...tajukList, { id: Date.now().toString(), namaTajuk: nama, atlet: null }]
    saveTajuk(newList)
    setInputTajuk('')
  }

  function handlePadamTajuk(id) {
    saveTajuk(tajukList.filter(t => t.id !== id))
  }

  function handlePilihAtlet(tajukId, atlet) {
    const tajuk = tajukList.find(t => t.id === tajukId)
    if (!tajuk) return
    if (tajuk.atlet) {
      // Ada atlet sedia — minta confirm
      setConfirmGanti({ tajukId, atlet })
    } else {
      doGantiAtlet(tajukId, atlet)
    }
  }

  function doGantiAtlet(tajukId, atlet) {
    const newList = tajukList.map(t =>
      t.id === tajukId ? { ...t, atlet } : t
    )
    saveTajuk(newList)
    setConfirmGanti(null)
  }

  function handleBuangAtlet(tajukId) {
    const newList = tajukList.map(t =>
      t.id === tajukId ? { ...t, atlet: null } : t
    )
    saveTajuk(newList)
  }

  // ── Cetak PDF Analisa Pingat (tab kategori) ──────────────────────────────

  function cetakPDF() {
    setCetakLoading(true)
    try {
      const pdf   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pageW = pdf.internal.pageSize.width
      const pageH = pdf.internal.pageSize.height
      const today = new Date().toLocaleDateString('ms-MY', { day: '2-digit', month: '2-digit', year: 'numeric' })

      pdf.setTextColor(0, 0, 0)
      pdf.setFontSize(12)
      pdf.setFont('helvetica', 'bold')
      pdf.text('ANALISA PINGAT — ATLET TERBAIK', pageW / 2, 10, { align: 'center' })
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'normal')
      pdf.text('Acara Final sahaja  ·  Emas = 5 mata  ·  Perak = 3 mata  ·  Gangsa = 2 mata', pageW / 2, 17, { align: 'center' })
      pdf.text(`Tarikh Cetak: ${today}`, pageW / 2, 23, { align: 'center' })

      let startY  = 32
      let isFirst = true

      kategoriList.forEach(kat => {
        const katRows = Object.entries(atletMap)
          .filter(([, a]) => a.kategoriKod === kat.kod)
          .map(([noKP, a]) => ({ noKP, ...a }))
          .sort((a, b) => {
            if (b.pingat[1] !== a.pingat[1]) return b.pingat[1] - a.pingat[1]
            if (b.pingat[2] !== a.pingat[2]) return b.pingat[2] - a.pingat[2]
            if (b.pingat[3] !== a.pingat[3]) return b.pingat[3] - a.pingat[3]
            return b.mata - a.mata
          })
        if (katRows.length === 0) return

        if (!isFirst) {
          pdf.addPage()
          pdf.setTextColor(0, 0, 0)
          pdf.setFontSize(9)
          pdf.setFont('helvetica', 'bold')
          pdf.text('ANALISA PINGAT — ATLET TERBAIK', pageW / 2, 10, { align: 'center' })
          startY = 20
        }
        isFirst = false

        const tableRows = katRows.map((a, i) => {
          const medal = i === 0 ? 'EMAS' : i === 1 ? 'PERAK' : i === 2 ? 'GANGSA' : String(i + 1)
          const rekod = a.rekodList.map(r => {
            let txt = r.namaAcara
            if (r.prestasiBaru != null) txt += ` (${fmtPrestasi(r.prestasiBaru, r.unit)})`
            return txt
          }).join(', ') || '—'
          return [
            medal,
            a.namaAtlet,
            a.namaSekolah,
            a.pingat[1] || '—',
            a.pingat[2] || '—',
            a.pingat[3] || '—',
            a.mata || '—',
            rekod,
          ]
        })

        const totalEmas   = katRows.reduce((s, a) => s + a.pingat[1], 0)
        const totalPerak  = katRows.reduce((s, a) => s + a.pingat[2], 0)
        const totalGangsa = katRows.reduce((s, a) => s + a.pingat[3], 0)
        const totalMata   = katRows.reduce((s, a) => s + a.mata, 0)
        const totalRekod  = katRows.reduce((s, a) => s + a.rekodList.length, 0)
        tableRows.push([
          { content: `JUMLAH — ${katRows.length} atlet`, colSpan: 3, styles: { fontStyle: 'bold', fillColor: [255, 255, 255] } },
          { content: totalEmas   || '—', styles: { fontStyle: 'bold', fillColor: [255, 255, 255], halign: 'center' } },
          { content: totalPerak  || '—', styles: { fontStyle: 'bold', fillColor: [255, 255, 255], halign: 'center' } },
          { content: totalGangsa || '—', styles: { fontStyle: 'bold', fillColor: [255, 255, 255], halign: 'center' } },
          { content: totalMata   || '—', styles: { fontStyle: 'bold', fillColor: [255, 255, 255], halign: 'center' } },
          { content: `${totalRekod} rekod`, styles: { fontStyle: 'bold', fillColor: [255, 255, 255] } },
        ])

        autoTable(pdf, {
          startY,
          head: [
            [{ content: kat.label, colSpan: 8, styles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 9 } }],
            ['#', 'Nama Atlet', 'Sekolah', 'Emas', 'Perak', 'Gangsa', 'Mata', 'Rekod Dipecah'],
          ],
          body:       tableRows,
          styles:     { fontSize: 7, cellPadding: 1.8 },
          headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontSize: 7, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [255, 255, 255] },
          columnStyles: {
            0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
            1: { cellWidth: 50 },
            2: { cellWidth: 52 },
            3: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
            4: { cellWidth: 12, halign: 'center' },
            5: { cellWidth: 12, halign: 'center' },
            6: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
            7: { cellWidth: 'auto' },
          },
          margin: { left: 10, right: 10 },
          theme:  'grid',
        })

        startY = pdf.lastAutoTable.finalY + 6
      })

      const totalPages = pdf.getNumberOfPages()
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i)
        pdf.setFontSize(6)
        pdf.setTextColor(150)
        pdf.text(`Muka ${i} / ${totalPages}`, pageW / 2, pageH - 5, { align: 'center' })
        pdf.text('Sistem KOAM — mssdkemaman-olahraga.web.app', pageW - 10, pageH - 5, { align: 'right' })
        pdf.setTextColor(0)
      }

      pdf.save(`AnalisaPingat_${new Date().toISOString().slice(0, 10)}.pdf`)
    } finally {
      setCetakLoading(false)
    }
  }

  // ── Cetak PDF Atlet Terbaik — 3 salinan ─────────────────────────────────

  function cetakAtletTerbaik() {
    setCetakTBLoading(true)
    try {
      const pdf   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pageW = pdf.internal.pageSize.width
      const pageH = pdf.internal.pageSize.height
      const today = new Date().toLocaleDateString('ms-MY', { day: '2-digit', month: '2-digit', year: 'numeric' })

      function drawPageHeader(salinan) {
        pdf.setTextColor(0, 0, 0)
        pdf.setFontSize(13)
        pdf.setFont('helvetica', 'bold')
        pdf.text('SENARAI ATLET TERBAIK', pageW / 2, 9, { align: 'center' })
        pdf.setFontSize(8)
        pdf.setFont('helvetica', 'normal')
        pdf.text(namaKej, pageW / 2, 15, { align: 'center' })
        pdf.text(`Tarikh: ${today}`, pageW / 2, 20, { align: 'center' })
        pdf.setFontSize(7)
        pdf.setFont('helvetica', 'bold')
        pdf.text(`SALINAN: ${salinan}`, pageW - 12, 9, { align: 'right' })
      }

      function buildTajukTable(t, startY) {
        const a = t.atlet
        // Bina baris pingat & acara
        const pingatLines = []
        if (a) {
          if (a.pingat[1] > 0) {
            pingatLines.push(`Emas (${a.pingat[1]}) : ${a.acaraPingat[1].join(', ')}`)
          }
          if (a.pingat[2] > 0) {
            pingatLines.push(`Perak (${a.pingat[2]}) : ${a.acaraPingat[2].join(', ')}`)
          }
          if (a.pingat[3] > 0) {
            pingatLines.push(`Gangsa (${a.pingat[3]}) : ${a.acaraPingat[3].join(', ')}`)
          }
          if (pingatLines.length === 0) pingatLines.push('—')
        }

        // Bina baris rekod
        const rekodLines = []
        if (a && a.rekodList.length > 0) {
          a.rekodList.forEach((r, idx) => {
            rekodLines.push(`${idx + 1}. ${r.namaAcara}`)
            rekodLines.push(`   Baru: ${fmtPrestasi(r.prestasiBaru, r.unit)}${r.prestasiLama != null ? `  |  Lama: ${fmtPrestasi(r.prestasiLama, r.unit)}` : ''}`)
            if (r.namaLama)   rekodLines.push(`   ${r.namaLama}`)
            if (r.lokasiLama) rekodLines.push(`   ${r.lokasiLama}${r.tahunLama ? ` (${r.tahunLama})` : ''}`)
          })
        }

        const maxLines = Math.max(pingatLines.length, rekodLines.length, 1)
        const bodyRows = []
        for (let i = 0; i < maxLines; i++) {
          if (i === 0) {
            bodyRows.push([
              a ? a.namaAtlet : '—',
              a ? a.namaSekolah : '—',
              pingatLines[i] || '',
              rekodLines[i]  || '',
            ])
          } else {
            bodyRows.push(['', '', pingatLines[i] || '', rekodLines[i] || ''])
          }
        }

        autoTable(pdf, {
          startY,
          head: [
            [{ content: t.namaTajuk, colSpan: 4, styles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 10, halign: 'center' } }],
            ['Nama Atlet', 'Sekolah', 'Pingat & Acara', 'Rekod Dipecah'],
          ],
          body: bodyRows,
          styles:     { fontSize: 8, cellPadding: 2.5 },
          headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontSize: 8, fontStyle: 'bold' },
          columnStyles: {
            0: { cellWidth: 60, fontStyle: 'bold' },
            1: { cellWidth: 65 },
            2: { cellWidth: 70 },
            3: { cellWidth: 'auto' },
          },
          margin: { left: 12, right: 12 },
          theme:  'grid',
          pageBreak: 'avoid',
        })

        return pdf.lastAutoTable.finalY + 8
      }

      SALINAN.forEach((sal, si) => {
        if (si > 0) pdf.addPage()
        drawPageHeader(sal)
        let y = 28
        tajukList.forEach(t => {
          y = buildTajukTable(t, y)
        })
        // Footer
        pdf.setFontSize(6)
        pdf.setTextColor(150)
        pdf.text(`Sistem KOAM — mssdkemaman-olahraga.web.app`, pageW / 2, pageH - 5, { align: 'center' })
        pdf.setTextColor(0)
      })

      pdf.save(`AtletTerbaik_${new Date().toISOString().slice(0, 10)}.pdf`)
    } finally {
      setCetakTBLoading(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center min-h-[40vh] gap-3 text-gray-400">
      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      <span className="text-sm">Mengira pingat dari heat final…</span>
    </div>
  )

  if (error) return (
    <div className="p-6 text-sm text-red-600 bg-red-50 rounded-xl border border-red-200">{error}</div>
  )

  const selKatLabel = kategoriList.find(k => k.kod === selKat)?.label || selKat

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#003399] to-[#0055cc] rounded-xl px-5 py-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-black text-white tracking-wide">ANALISA PINGAT</h1>
          <p className="text-[11px] text-white/70 mt-0.5">Kedudukan atlet terbaik — acara final sahaja · Emas=5 Perak=3 Gangsa=2</p>
        </div>
        <button
          onClick={cetakPDF}
          disabled={cetakLoading || Object.keys(atletMap).length === 0}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-white/20 hover:bg-white/30 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          {cetakLoading ? 'Jana PDF…' : 'Cetak PDF'}
        </button>
      </div>

      {/* ── Panel Audit ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
          <div>
            <p className="text-xs font-bold text-gray-700">Audit Konsistensi Data</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Cross-check medal & rekod antara Firestore vs kiraan semula dari heat</p>
          </div>
          <button
            onClick={handleAudit}
            disabled={auditLoading || Object.keys(atletMap).length === 0}
            className="shrink-0 px-3 py-1.5 bg-gray-800 hover:bg-gray-900 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors"
          >
            {auditLoading ? '⏳ Mengaudit…' : '🔍 Jalankan Audit'}
          </button>
        </div>

        {auditResult && (
          auditResult.err ? (
            <div className="px-4 py-3 text-xs text-red-600">✗ {auditResult.err}</div>
          ) : (
            <div className="divide-y divide-gray-100">
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-100">
                <div className={`px-4 py-3 text-center ${auditResult.medalBeza.length > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                  <p className={`text-xl font-black ${auditResult.medalBeza.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {auditResult.medalBeza.length === 0 ? '✓' : auditResult.medalBeza.length}
                  </p>
                  <p className="text-[10px] font-semibold text-gray-500 mt-0.5">Medal Berbeza</p>
                </div>
                <div className={`px-4 py-3 text-center ${auditResult.rekodStale.length > 0 ? 'bg-amber-50' : 'bg-green-50'}`}>
                  <p className={`text-xl font-black ${auditResult.rekodStale.length > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                    {auditResult.rekodStale.length === 0 ? '✓' : auditResult.rekodStale.length}
                  </p>
                  <p className="text-[10px] font-semibold text-gray-500 mt-0.5">Rekod Stale</p>
                </div>
                <div className="px-4 py-3 text-center bg-blue-50">
                  <p className="text-xl font-black text-blue-600">{auditResult.rekodPending.length}</p>
                  <p className="text-[10px] font-semibold text-gray-500 mt-0.5">Rekod Pending</p>
                </div>
                <div className="px-4 py-3 text-center bg-green-50">
                  <p className="text-xl font-black text-green-600">{auditResult.rekodSah}</p>
                  <p className="text-[10px] font-semibold text-gray-500 mt-0.5">Rekod Sah</p>
                </div>
              </div>

              {auditResult.medalBeza.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-red-50 border-b border-red-100 flex items-start gap-2 flex-wrap">
                    <span className="text-[10px] font-black text-red-700 uppercase tracking-wide">⚠ Medal Tidak Konsisten — {auditResult.medalBeza.length} atlet</span>
                    <span className="text-[9px] text-red-500">FS = nilai dalam Firestore (termasuk data lama saringan) · Kir = dikira semula dari heat final sahaja.</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-red-50/60 border-b border-red-100 text-left">
                          <th className="px-3 py-2 text-red-600 font-bold">Atlet</th>
                          <th className="px-3 py-2 text-red-600 font-bold">Kat.</th>
                          <th className="px-3 py-2 text-center text-yellow-600 font-bold">🥇 FS</th>
                          <th className="px-3 py-2 text-center text-yellow-600 font-bold">🥇 Kir</th>
                          <th className="px-3 py-2 text-center text-gray-500 font-bold">🥈 FS</th>
                          <th className="px-3 py-2 text-center text-gray-500 font-bold">🥈 Kir</th>
                          <th className="px-3 py-2 text-center text-amber-700 font-bold">🥉 FS</th>
                          <th className="px-3 py-2 text-center text-amber-700 font-bold">🥉 Kir</th>
                          <th className="px-3 py-2 text-center text-[#003399] font-bold">Mata FS</th>
                          <th className="px-3 py-2 text-center text-[#003399] font-bold">Mata Kir</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-red-50">
                        {auditResult.medalBeza.map((x, i) => (
                          <tr key={i} className="bg-white hover:bg-red-50/30">
                            <td className="px-3 py-2.5">
                              <p className="font-semibold text-gray-800">{x.nama}</p>
                              <p className="text-[10px] text-gray-400">{x.skol}</p>
                            </td>
                            <td className="px-3 py-2.5 text-gray-500 text-[10px]">{x.katKod}</td>
                            {[
                              [x.fs.emas,   x.kir.emas,   'text-yellow-600'],
                              [x.fs.perak,  x.kir.perak,  'text-gray-500'],
                              [x.fs.gangsa, x.kir.gangsa, 'text-amber-700'],
                            ].map(([fs, kir, cls], j) => (
                              <>
                                <td key={`fs${j}`}  className={`px-3 py-2.5 text-center font-black ${cls} ${fs !== kir ? 'bg-red-100' : ''}`}>{fs || '—'}</td>
                                <td key={`kir${j}`} className={`px-3 py-2.5 text-center font-black ${cls} ${fs !== kir ? 'bg-red-100' : ''}`}>{kir || '—'}</td>
                              </>
                            ))}
                            <td className={`px-3 py-2.5 text-center font-black text-[#003399] ${x.fs.mata !== x.kir.mata ? 'bg-red-100' : ''}`}>{x.fs.mata || '—'}</td>
                            <td className={`px-3 py-2.5 text-center font-black text-[#003399] ${x.fs.mata !== x.kir.mata ? 'bg-red-100' : ''}`}>{x.kir.mata || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {auditResult.rekodStale.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-amber-50 border-b border-amber-100">
                    <span className="text-[10px] font-black text-amber-700 uppercase tracking-wide">⚠ Rekod Stale — {auditResult.rekodStale.length} kes</span>
                    <span className="text-[9px] text-amber-500 ml-2">Field rekod_ dalam mata_olahragawan tidak selari dengan library</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-amber-50/60 border-b border-amber-100 text-left">
                          <th className="px-3 py-2 text-amber-700 font-bold">Atlet</th>
                          <th className="px-3 py-2 text-amber-700 font-bold">Nama Acara</th>
                          <th className="px-3 py-2 text-amber-700 font-bold">Sebab</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-50">
                        {auditResult.rekodStale.map((x, i) => (
                          <tr key={i} className="bg-white hover:bg-amber-50/30">
                            <td className="px-3 py-2.5">
                              <p className="font-semibold text-gray-800">{x.nama}</p>
                              <p className="text-[10px] text-gray-400">{x.skol}</p>
                            </td>
                            <td className="px-3 py-2.5 font-semibold text-gray-700">{x.namaAcara}</td>
                            <td className="px-3 py-2.5">
                              <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">{x.sebab}</span>
                              {x.libNama && <p className="text-[10px] text-gray-400 mt-0.5">Pemegang semasa: {x.libNama}</p>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {auditResult.rekodPending.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-blue-50 border-b border-blue-100">
                    <span className="text-[10px] font-black text-blue-700 uppercase tracking-wide">⏳ Rekod Pending Sahkan — {auditResult.rekodPending.length} kes</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-blue-50/60 border-b border-blue-100 text-left">
                          <th className="px-3 py-2 text-blue-700 font-bold">Atlet</th>
                          <th className="px-3 py-2 text-blue-700 font-bold">Nama Acara</th>
                          <th className="px-3 py-2 text-blue-700 font-bold">Rekod Key</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-blue-50">
                        {auditResult.rekodPending.map((x, i) => (
                          <tr key={i} className="bg-white hover:bg-blue-50/30">
                            <td className="px-3 py-2.5">
                              <p className="font-semibold text-gray-800">{x.nama}</p>
                              <p className="text-[10px] text-gray-400">{x.skol}</p>
                            </td>
                            <td className="px-3 py-2.5 font-semibold text-gray-700">{x.namaAcara}</td>
                            <td className="px-3 py-2.5 font-mono text-[9px] text-gray-400">{x.rKey}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {auditResult.medalBeza.length === 0 && auditResult.rekodStale.length === 0 && (
                <div className="px-4 py-4 text-center">
                  <p className="text-sm font-bold text-green-700">✓ Data konsisten — tiada isu dijumpai</p>
                  <p className="text-[10px] text-gray-400 mt-1">{auditResult.totalAtlet} atlet diaudit · {auditResult.rekodSah} rekod sah · {auditResult.rekodPending.length} rekod pending</p>
                </div>
              )}
            </div>
          )
        )}
      </div>

      {/* ── Tab bar ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex overflow-x-auto border-b border-gray-100 px-3 pt-2 gap-1">
          {kategoriList.map(k => {
            const count = Object.values(atletMap).filter(a => a.kategoriKod === k.kod).length
            if (count === 0) return null
            return (
              <button key={k.kod} onClick={() => { setSelKat(k.kod); setActiveTab(k.kod) }}
                className={`shrink-0 px-3 py-1.5 text-[11px] font-bold rounded-t-lg border-b-2 transition-colors ${
                  activeTab === k.kod
                    ? 'border-[#003399] text-[#003399] bg-blue-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                {k.label}
                <span className="ml-1 text-[10px] opacity-60">({count})</span>
              </button>
            )
          })}
          {/* Tab Atlet Terbaik — paling kanan */}
          <button onClick={() => setActiveTab('atletTerbaik')}
            className={`shrink-0 ml-auto flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-bold rounded-t-lg border-b-2 transition-colors ${
              activeTab === 'atletTerbaik'
                ? 'border-yellow-500 text-yellow-700 bg-yellow-50'
                : 'border-yellow-400 text-yellow-700 bg-yellow-50 hover:bg-yellow-100'
            }`}>
            🏆 Atlet Terbaik
            {tajukList.length > 0 && <span className="text-[10px] opacity-70">({tajukList.length})</span>}
          </button>
        </div>

        {/* ── Tab Kategori content ── */}
        {activeTab !== 'atletTerbaik' && (
          <div className="overflow-x-auto">
            {rows.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm">
                Tiada atlet dalam kategori {selKatLabel}.
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-3 py-2.5 text-center font-bold text-gray-500 w-10">#</th>
                    <th className="px-3 py-2.5 text-left font-bold text-gray-500">Nama Atlet</th>
                    <th className="px-3 py-2.5 text-left font-bold text-gray-500">Sekolah</th>
                    <th className="px-3 py-2.5 text-center font-bold text-yellow-600 w-16">Emas</th>
                    <th className="px-3 py-2.5 text-center font-bold text-gray-400 w-16">Perak</th>
                    <th className="px-3 py-2.5 text-center font-bold text-amber-700 w-16">Gangsa</th>
                    <th className="px-3 py-2.5 text-center font-bold text-gray-600 w-12">Mata</th>
                    <th className="px-3 py-2.5 text-left font-bold text-amber-600">Rekod Dipecah</th>
                    <th className="px-3 py-2.5 text-center font-bold text-green-600 w-20">Calon</th>
                    <th className="px-3 py-2.5 text-center font-bold text-gray-400 w-28">Pilih</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((a, i) => {
                    const rowBg = i === 0 ? 'bg-yellow-50' : i === 1 ? 'bg-gray-50/60' : i === 2 ? 'bg-orange-50' : ''
                    return (
                      <tr key={a.noKP} className={`${rowBg} hover:bg-blue-50/40 transition-colors`}>
                        <td className="px-3 py-3 text-center font-black text-gray-400">
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-semibold text-gray-900">{a.namaAtlet}</p>
                          <p className="text-[10px] text-gray-400 font-mono mt-0.5">{a.noKP}</p>
                        </td>
                        <td className="px-3 py-3 text-gray-600 max-w-[160px]">
                          <p className="truncate">{a.namaSekolah}</p>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <p className="font-black text-yellow-600">{fmtPingat(a.pingat[1])}</p>
                          {a.acaraPingat[1].map((n, j) => <p key={j} className="text-[9px] text-yellow-500 leading-tight">{n}</p>)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <p className="font-black text-gray-500">{fmtPingat(a.pingat[2])}</p>
                          {a.acaraPingat[2].map((n, j) => <p key={j} className="text-[9px] text-gray-400 leading-tight">{n}</p>)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <p className="font-black text-amber-700">{fmtPingat(a.pingat[3])}</p>
                          {a.acaraPingat[3].map((n, j) => <p key={j} className="text-[9px] text-amber-500 leading-tight">{n}</p>)}
                        </td>
                        <td className="px-3 py-3 text-center font-black text-[#003399]">{a.mata || '—'}</td>
                        <td className="px-3 py-3">
                          {a.rekodList.length === 0 ? (
                            <span className="text-gray-300">—</span>
                          ) : (
                            <div className="space-y-2">
                              {a.rekodList.map((r, j) => (
                                <div key={j} className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                                  <p className="font-bold text-amber-800 text-[11px]">🏆 {r.namaAcara}</p>
                                  <p className="text-[10px] text-gray-700 mt-0.5">
                                    <span className="font-semibold text-green-700">Baru: {fmtPrestasi(r.prestasiBaru, r.unit)}</span>
                                    {r.prestasiLama != null && <span className="text-gray-500 ml-2">Lama: {fmtPrestasi(r.prestasiLama, r.unit)}</span>}
                                  </p>
                                  {(r.namaLama || r.lokasiLama) && (
                                    <p className="text-[10px] text-gray-500 mt-0.5">
                                      {r.namaLama || '—'}
                                      {r.lokasiLama && <span> · {r.lokasiLama}</span>}
                                      {r.tahunLama  && <span> ({r.tahunLama})</span>}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        {/* Kolum Calon — toggle show di Home */}
                        <td className="px-3 py-3 text-center">
                          {(() => {
                            const isCalon = calonList.some(c => c.noKP === a.noKP)
                            const isSaving = savingCalon === a.noKP
                            return (
                              <button
                                onClick={() => toggleCalon(a)}
                                disabled={isSaving}
                                className={`text-[10px] px-2.5 py-1.5 rounded-lg font-bold border transition-colors disabled:opacity-50 ${
                                  isCalon
                                    ? 'bg-green-100 border-green-400 text-green-700 hover:bg-green-200'
                                    : 'bg-white border-gray-300 text-gray-400 hover:bg-green-50 hover:border-green-300 hover:text-green-600'
                                }`}>
                                {isSaving ? '…' : isCalon ? '✓ Calon' : '+ Calon'}
                              </button>
                            )
                          })()}
                        </td>
                        {/* Kolum Pilih — dropdown tajuk */}
                        <td className="px-3 py-3 text-center">
                          {tajukList.length === 0 ? (
                            <span className="text-[10px] text-gray-300">Tiada tajuk</span>
                          ) : (
                            <div className="flex flex-col gap-1">
                              {tajukList.map(t => (
                                <button key={t.id}
                                  onClick={() => handlePilihAtlet(t.id, {
                                    noKP:        a.noKP,
                                    namaAtlet:   a.namaAtlet,
                                    namaSekolah: a.namaSekolah,
                                    pingat:      a.pingat,
                                    acaraPingat: a.acaraPingat,
                                    mata:        a.mata,
                                    rekodList:   a.rekodList,
                                  })}
                                  disabled={savingTajuk}
                                  className={`text-[10px] px-2 py-1 rounded font-semibold border transition-colors ${
                                    t.atlet?.noKP === a.noKP
                                      ? 'bg-green-100 border-green-300 text-green-700'
                                      : 'bg-white border-gray-300 text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700'
                                  }`}>
                                  {t.atlet?.noKP === a.noKP ? '✓ ' : ''}{t.namaTajuk}
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td colSpan={3} className="px-3 py-2 text-[10px] text-gray-400 font-semibold">
                      {rows.length} atlet · {selKatLabel}
                    </td>
                    <td className="px-3 py-2 text-center text-[11px] font-black text-yellow-600">
                      {rows.reduce((s, a) => s + a.pingat[1], 0)}
                    </td>
                    <td className="px-3 py-2 text-center text-[11px] font-black text-gray-500">
                      {rows.reduce((s, a) => s + a.pingat[2], 0)}
                    </td>
                    <td className="px-3 py-2 text-center text-[11px] font-black text-amber-700">
                      {rows.reduce((s, a) => s + a.pingat[3], 0)}
                    </td>
                    <td className="px-3 py-2 text-center text-[11px] font-black text-[#003399]">
                      {rows.reduce((s, a) => s + a.mata, 0)}
                    </td>
                    <td className="px-3 py-2 text-[10px] text-gray-400">
                      {rows.reduce((s, a) => s + a.rekodList.length, 0)} rekod dipecah
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}

        {/* ── Tab Atlet Terbaik content ── */}
        {activeTab === 'atletTerbaik' && (
          <div className="p-4 space-y-4">

            {/* Toggle Show Calon di Home */}
            <div className={`flex items-center justify-between rounded-xl px-4 py-3 border ${showAtHome ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-200'}`}>
              <div>
                <p className="text-xs font-bold text-gray-700">Papar Calon di Home</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{calonList.length} calon dipilih · Public boleh lihat tanpa No KP</p>
              </div>
              <button
                onClick={toggleShowAtHome}
                disabled={savingShow}
                className={`px-4 py-2 text-xs font-bold rounded-lg border transition-colors disabled:opacity-50 ${
                  showAtHome
                    ? 'bg-green-600 border-green-700 text-white hover:bg-green-700'
                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-100'
                }`}>
                {savingShow ? '…' : showAtHome ? '✓ ON — Sedang Papar' : 'OFF — Klik untuk Papar'}
              </button>
            </div>

            {/* Setup tajuk */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-bold text-gray-700 mb-3">Urus Tajuk Anugerah</p>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={inputTajuk}
                  onChange={e => setInputTajuk(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleTambahTajuk()}
                  placeholder="cth: Atlet Terbaik L12"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <button
                  onClick={handleTambahTajuk}
                  disabled={!inputTajuk.trim() || savingTajuk}
                  className="px-4 py-2 bg-[#003399] hover:bg-[#002277] disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors"
                >
                  + Tambah
                </button>
              </div>
              {tajukList.length === 0 ? (
                <p className="text-[11px] text-gray-400 italic">Belum ada tajuk. Tambah tajuk di atas.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {tajukList.map(t => (
                    <div key={t.id} className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs">
                      <span className="font-semibold text-gray-700">{t.namaTajuk}</span>
                      {t.atlet && <span className="text-green-600 font-bold">✓ {t.atlet.namaAtlet.split(' ')[0]}</span>}
                      <button onClick={() => handlePadamTajuk(t.id)} className="text-red-400 hover:text-red-600 ml-1 font-bold">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Preview */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <p className="text-xs font-bold text-gray-700">Preview — Senarai Atlet Terbaik</p>
                <button
                  onClick={cetakAtletTerbaik}
                  disabled={cetakTBLoading || tajukList.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#003399] hover:bg-[#002277] disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  {cetakTBLoading ? 'Jana PDF…' : 'Cetak PDF (3 Salinan)'}
                </button>
              </div>

              {tajukList.length === 0 ? (
                <div className="py-10 text-center text-gray-400 text-sm">Tambah tajuk untuk mula.</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {tajukList.map(t => {
                    const a = t.atlet
                    return (
                      <div key={t.id} className="p-4">
                        {/* Tajuk header */}
                        <div className="bg-[#003399] text-white text-xs font-black px-4 py-2 rounded-t-lg tracking-wide">
                          {t.namaTajuk}
                        </div>
                        <table className="w-full text-xs border border-t-0 border-gray-200 rounded-b-lg overflow-hidden">
                          <thead>
                            <tr className="bg-gray-800 text-white">
                              <th className="px-3 py-2 text-left font-bold w-48">Nama Atlet</th>
                              <th className="px-3 py-2 text-left font-bold w-52">Sekolah</th>
                              <th className="px-3 py-2 text-left font-bold">Pingat & Acara</th>
                              <th className="px-3 py-2 text-left font-bold">Rekod Dipecah</th>
                              <th className="px-3 py-2 text-center font-bold w-16">Tindakan</th>
                            </tr>
                          </thead>
                          <tbody>
                            {a ? (
                              <tr className="bg-white">
                                <td className="px-3 py-3 font-bold text-gray-900">{a.namaAtlet}</td>
                                <td className="px-3 py-3 text-gray-600">{a.namaSekolah}</td>
                                <td className="px-3 py-3">
                                  {[1,2,3].map(rank => {
                                    const label = rank === 1 ? 'Emas' : rank === 2 ? 'Perak' : 'Gangsa'
                                    if (a.pingat[rank] === 0) return null
                                    return (
                                      <p key={rank} className="text-[11px] leading-snug">
                                        <span className="font-semibold">{label} ({a.pingat[rank]}) : </span>
                                        {a.acaraPingat[rank].join(', ')}
                                      </p>
                                    )
                                  })}
                                  {a.mata > 0 && <p className="text-[10px] text-[#003399] font-bold mt-1">Jumlah mata: {a.mata}</p>}
                                </td>
                                <td className="px-3 py-3">
                                  {a.rekodList.length === 0 ? (
                                    <span className="text-gray-300 text-[11px]">—</span>
                                  ) : (
                                    <div className="space-y-1.5">
                                      {a.rekodList.map((r, j) => (
                                        <div key={j} className="text-[11px]">
                                          <p className="font-bold text-amber-800">{j + 1}. {r.namaAcara}</p>
                                          <p className="text-gray-600">
                                            Baru: <span className="font-semibold text-green-700">{fmtPrestasi(r.prestasiBaru, r.unit)}</span>
                                            {r.prestasiLama != null && <span className="text-gray-500">  |  Lama: {fmtPrestasi(r.prestasiLama, r.unit)}</span>}
                                          </p>
                                          {r.namaLama && <p className="text-gray-500">{r.namaLama}{r.lokasiLama ? ` · ${r.lokasiLama}` : ''}{r.tahunLama ? ` (${r.tahunLama})` : ''}</p>}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-3 text-center">
                                  <button onClick={() => handleBuangAtlet(t.id)}
                                    className="text-[10px] px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded font-semibold">
                                    Buang
                                  </button>
                                </td>
                              </tr>
                            ) : (
                              <tr className="bg-gray-50">
                                <td colSpan={5} className="px-4 py-4 text-center text-[11px] text-gray-400 italic">
                                  Belum dipilih — pergi ke tab kategori dan klik butang tajuk ini pada row atlet
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modal Confirm Ganti ── */}
      {confirmGanti && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5">
            <p className="text-sm font-black text-gray-800 mb-2">Ganti Atlet?</p>
            <p className="text-xs text-gray-500 mb-1">
              Tajuk: <span className="font-semibold text-gray-700">{tajukList.find(t => t.id === confirmGanti.tajukId)?.namaTajuk}</span>
            </p>
            <p className="text-xs text-gray-500 mb-1">
              Atlet semasa: <span className="font-semibold text-gray-700">{tajukList.find(t => t.id === confirmGanti.tajukId)?.atlet?.namaAtlet}</span>
            </p>
            <p className="text-xs text-gray-500 mb-4">
              Ganti dengan: <span className="font-semibold text-green-700">{confirmGanti.atlet.namaAtlet}</span>
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmGanti(null)}
                className="px-4 py-2 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Batal
              </button>
              <button onClick={() => doGantiAtlet(confirmGanti.tajukId, confirmGanti.atlet)}
                className="px-4 py-2 text-xs bg-[#003399] text-white font-bold rounded-lg hover:bg-[#002277]">
                Ya, Ganti
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
