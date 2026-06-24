/**
 * BukuKejohanan.jsx — /dashboard/buku
 *
 * Jana satu PDF komprehensif (Buku Program Kejohanan):
 *   1. Muka Depan (KOAM Official design)
 *   2. Senarai Sekolah
 *   3. Medal Tally (by jenisSekolah)
 *   4. Senarai Pendaftaran by Sekolah (dynamic SR/SM)
 *   5. Analisis Pendaftaran
 *   6. Jadual Acara (per hari)
 *   7. Keputusan Rasmi (per hari → per acara, top 2)
 *   8. Rekod Semasa (grouped by kategori)
 *   9. Rekod Dipecah (rekod baharu dalam kejohanan ini)
 *  10. Atlet Terbaik (dari tetapan/atletTerbaik)
 *
 * Roles: superadmin, admin, pengurus_teknik, urusetia
 */

import { useState, useEffect } from 'react'
import {
  collection, getDocs, getDoc, setDoc, doc, query, where, orderBy, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../firebase/config'

// ─── Helper: Kompres gambar cover supaya muat dalam Firestore (1MB limit) ────
function kompresGambarCover(dataUrl) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const MAX = 1400
      let w = img.width, h = img.height
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      // Background putih (untuk PNG transparent → JPEG)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.src = dataUrl
  })
}

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
  return new Date(str + 'T00:00:00').toLocaleDateString('ms-MY', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function katLabel(kod, kategoriList = []) {
  if (!kod) return '—'
  const kat = kategoriList.find(k => k.kod === kod)
  return kat?.label || kod
}

function rekodKey(namaAcara, jantina, kategoriKod, peringkat) {
  return [namaAcara, jantina, kategoriKod, peringkat]
    .join('_').toUpperCase().replace(/[^A-Z0-9_]/g, '_')
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BukuKejohanan() {
  const [loading,  setLoading]  = useState(false)
  const [msg,      setMsg]      = useState(null)
  const [preview,  setPreview]  = useState(null)
  const [progress, setProgress] = useState('')

  // ── Cover (muka depan) tetapan ──────────────────────────────────────────
  const [jenisCover, setJenisCover] = useState('default')  // 'default' | 'custom'
  const [coverImg, setCoverImg]     = useState(null)
  const [uploading, setUploading]   = useState(false)
  const [savingCover, setSavingCover] = useState(false)
  const [coverMsg, setCoverMsg]     = useState('')

  useEffect(() => {
    async function loadCover() {
      try {
        const snap = await getDoc(doc(db, 'tetapan', 'bukuKejohanan'))
        if (!snap.exists()) return
        const d = snap.data()
        if (d.jenisCover) setJenisCover(d.jenisCover)
        if (d.coverImg)   setCoverImg(d.coverImg)
      } catch {}
    }
    loadCover()
  }, [])

  async function handleUploadCover(e) {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    setUploading(true); setCoverMsg('')
    const reader = new FileReader()
    reader.onload = async ev => {
      const compressed = await kompresGambarCover(ev.target.result)
      setCoverImg(compressed)
      setUploading(false)
    }
    reader.readAsDataURL(file)
  }

  async function handleSaveCover() {
    setSavingCover(true); setCoverMsg('')
    try {
      // Kalau pilih custom tapi tiada gambar → tolak
      if (jenisCover === 'custom' && !coverImg) {
        setCoverMsg('Sila muat naik template dahulu untuk pilihan Custom.')
        setSavingCover(false); return
      }
      await setDoc(doc(db, 'tetapan', 'bukuKejohanan'), {
        jenisCover,
        coverImg:   jenisCover === 'custom' ? coverImg : null,
        updatedAt:  serverTimestamp(),
      }, { merge: true })
      setCoverMsg('Tetapan cover berjaya disimpan.')
    } catch (e) {
      setCoverMsg('Ralat: ' + e.message)
    }
    setSavingCover(false)
  }

  function handlePadamCover() {
    setCoverImg(null)
    setCoverMsg('')
  }

  // ── Load & Jana PDF ─────────────────────────────────────────────────────────

  async function handleJana() {
    setLoading(true)
    setMsg(null)
    setProgress('Memuatkan tetapan…')
    try {
      // 1. Tetapan & config
      const cfgSnap = await getDoc(doc(db, 'tetapan', 'home'))
      const cfg = cfgSnap.exists() ? cfgSnap.data() : {}

      // 1b. Tetapan Buku Kejohanan (cover)
      const bukuCfgSnap = await getDoc(doc(db, 'tetapan', 'bukuKejohanan'))
      const bukuCfg = bukuCfgSnap.exists() ? bukuCfgSnap.data() : {}
      const useCustomCover = bukuCfg.jenisCover === 'custom' && !!bukuCfg.coverImg

      // 2. Kejohanan aktif
      setProgress('Memuatkan data kejohanan…')
      const kejSnap = await getDocs(query(
        collection(db, 'kejohanan'),
        where('statusKejohanan', '==', 'aktif')
      ))
      if (kejSnap.empty) {
        setMsg({ type: 'err', text: 'Tiada kejohanan aktif.' })
        return
      }
      const kejDoc  = kejSnap.docs[0]
      const kejId   = kejDoc.id
      const kej     = kejDoc.data()
      const namaKej = cfg.tajukUtama || kej.namaKejohanan || 'Kejohanan Olahraga'
      const peringkatKej = { daerah: 'D', negeri: 'N', kebangsaan: 'K' }[kej.peringkat] || 'D'

      // 3. Sekolah
      setProgress('Memuatkan senarai sekolah…')
      const sklSnap  = await getDocs(collection(db, 'sekolah'))
      const sekolahList = sklSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.kategori || '').localeCompare(b.kategori || '') || (a.namaSekolah || '').localeCompare(b.namaSekolah || '', 'ms'))

      // 4. Jadual acara
      setProgress('Memuatkan jadual acara…')
      const jadualSnap = await getDocs(
        query(collection(db, 'jadual_acara'), orderBy('tarikhAcara'), orderBy('masaMula'))
      )
      const jadualList = jadualSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(j => j.statusJadual !== 'batal' && j.tarikhAcara)

      // 5. Semua acara dalam kejohanan
      setProgress('Memuatkan senarai acara…')
      const acaraSnap = await getDocs(
        query(collection(db, 'kejohanan', kejId, 'acara'), orderBy('noAcara'))
      )
      const acaraList = acaraSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const acaraMap  = Object.fromEntries(acaraList.map(a => [a.id, a]))

      // 6. Heats untuk acara yang ada keputusan (rasmi atau ada_keputusan)
      setProgress('Memuatkan keputusan rasmi…')
      const rasmiAcara = acaraList.filter(a => ['rasmi', 'ada_keputusan', 'tidak_rasmi'].includes(a.statusAcara))
      const heatResults = await Promise.all(
        rasmiAcara.map(async a => {
          const hSnap = await getDocs(
            collection(db, 'kejohanan', kejId, 'acara', a.id, 'heat')
          )
          const heats = hSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          const final = heats.find(h =>
            ['final', 'terus_final'].includes(h.fasa) && h.statusKeputusan === 'rasmi'
          ) || (heats.length === 1 && heats[0].statusKeputusan === 'rasmi' ? heats[0] : null)
          // Semua heat dengan keputusan (rasmi/diterima/tidak_rasmi)
          const allHeats = heats.filter(h => ['rasmi', 'diterima', 'tidak_rasmi'].includes(h.statusKeputusan))
          return { acaraId: a.id, heat: final, allHeats }
        })
      )
      const finalHeatMap = {}
      const allHeatsMap  = {}
      heatResults.forEach(({ acaraId, heat, allHeats }) => {
        if (heat) finalHeatMap[acaraId] = heat
        if (allHeats?.length) allHeatsMap[acaraId] = allHeats
      })

      // 7. Rekod semasa
      setProgress('Memuatkan rekod semasa…')
      const rekodSnap = await getDocs(
        query(collection(db, 'rekod'), where('statusRekod', '==', 'aktif'))
      )
      const rekodList = rekodSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const rekodMap  = Object.fromEntries(rekodList.map(r => [r.id, r]))

      // 7b. Rekod dipecah — dari mata_olahragawan (sama sumber Tab Rekod Kejohanan)
      setProgress('Memuatkan rekod dipecah…')
      const rekodDipecahList = []
      // mataSnap diload kemudian (step 9) — load awal untuk rekod dipecah
      const mataSnapRekod = await getDocs(
        query(collection(db, 'mata_olahragawan'), where('kejohananId', '==', kejId))
      )
      mataSnapRekod.docs.forEach(d => {
        const data = d.data()
        const noKP = data.noKP || d.id.replace(`_${kejId}`, '')
        Object.entries(data).forEach(([key, val]) => {
          if (!key.startsWith('rekod_')) return
          if (!val?.namaAcara) return
          rekodDipecahList.push({
            noKP,
            namaAtlet:    data.namaAtlet   || '—',
            namaSekolah:  data.namaSekolah || data.kodSekolah || '—',
            kategoriKod:  val.kategoriKod  || data.kategoriKod || '',
            jantina:      val.jantina      || data.jantina     || '',
            namaAcara:    val.namaAcara    || '—',
            prestasi:     val.prestasiBaru ?? null,
            unit:         val.unit         || 's',
            prestasiLama: val.prestasiLama ?? null,
            namaLama:     val.namaLama     || '—',
            lokasiLama:   val.lokasiLama   || '—',
            tahunLama:    val.tahunLama    || '—',
          })
        })
      })

      // 8. Atlet Terbaik dari tetapan/atletTerbaik (AnalisaPingat)
      setProgress('Memuatkan atlet terbaik…')
      const tbSnap = await getDoc(doc(db, 'tetapan', 'atletTerbaik'))
      const tajukList = tbSnap.exists() ? (tbSnap.data().tajuk || []) : []

      // 9. Mata olahragawan — guna semula mataSnapRekod (dah diload dalam 7b)
      const mataMap = {}
      mataSnapRekod.docs.forEach(d => {
        const r = d.data()
        if (r.noKP) mataMap[r.noKP] = { id: d.id, ...r }
      })

      // 10. Kategori
      const katSnap = await getDocs(query(collection(db, 'kategori'), orderBy('urutan')))
      const katList = katSnap.docs.map(d => ({ id: d.id, ...d.data() }))

      // 11. Pendaftaran
      setProgress('Memuatkan data pendaftaran…')
      const daftarSnap = await getDocs(collection(db, 'kejohanan', kejId, 'pendaftaran'))
      const pendaftaranDocs = daftarSnap.docs.map(d => d.data())

      // 12. Medal Tally
      setProgress('Memuatkan medal tally…')
      const tallySnap = await getDocs(collection(db, 'medal_tally'))
      const medalTallyDocs = tallySnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(t => (t.emas || 0) > 0 || (t.perak || 0) > 0 || (t.gangsa || 0) > 0)

      // ── Preview ringkasan ──
      setPreview({
        namaKej,
        jumlahSekolah:      sekolahList.length,
        jumlahAcara:        acaraList.length,
        jumlahRasmi:        Object.keys(finalHeatMap).length,
        jumlahRekod:        rekodList.length,
        jumlahRekodPecah:   rekodDipecahList.length,
        jumlahAtletTerbaik: tajukList.filter(t => t.atlet).length,
        jumlahAtlet:        pendaftaranDocs.length,
        jumlahTally:        medalTallyDocs.length,
      })

      // ── Jana PDF ──
      setProgress('Menjana PDF…')
      await janaPDF({
        cfg, kej, kejId, namaKej, peringkatKej,
        sekolahList, jadualList, acaraList, acaraMap,
        finalHeatMap, allHeatsMap, rekodMap, rekodDipecahList, tajukList, mataMap, katList, pendaftaranDocs,
        medalTallyDocs, bukuCfg, useCustomCover,
      })

      setMsg({ type: 'ok', text: 'Buku Kejohanan berjaya dijana dan dimuat turun.' })
    } catch (e) {
      console.error(e)
      setMsg({ type: 'err', text: 'Ralat: ' + e.message })
    } finally {
      setLoading(false)
      setProgress('')
    }
  }

  // ── Helper: analisis pendaftaran ─────────────────────────────────────────────

  function buildAnalisisPendaftaran(acaraList, pendaftaranDocs, katList) {
    const katMeta = Object.fromEntries(
      katList.map(k => [k.id, { label: k.label || k.id, urutan: k.urutan ?? 99 }])
    )
    const countMap = {}
    pendaftaranDocs.forEach(p => {
      ;(p.acaraIds || []).forEach(aid => { countMap[aid] = (countMap[aid] || 0) + 1 })
    })
    const acaraColMap = {}
    acaraList.forEach(a => {
      const { label } = katMeta[a.kategoriKod] || { label: a.kategoriKod || '?' }
      acaraColMap[a.id] = `${a.jantina || '?'}${label}`
    })
    const colSet = new Set(Object.values(acaraColMap))
    const colHeaders = Array.from(colSet).sort((a, b) => {
      const ja = a[0], jb = b[0]
      if (ja !== jb) return ja === 'L' ? -1 : 1
      const la = a.slice(1), lb = b.slice(1)
      const ua = katList.find(k => (k.label || k.id) === la)?.urutan ?? 99
      const ub = katList.find(k => (k.label || k.id) === lb)?.urutan ?? 99
      return ua - ub || la.localeCompare(lb)
    })
    const byNamaPendek = {}
    acaraList.forEach(a => {
      const key = a.namaAcaraPendek || a.namaAcara || '—'
      if (!byNamaPendek[key]) byNamaPendek[key] = []
      byNamaPendek[key].push(a)
    })
    const rows = Object.entries(byNamaPendek)
      .map(([namaPendek, acList]) => {
        const minNo = Math.min(...acList.map(a => Number(a.noAcara) || 9999))
        const cols = {}
        let total = 0
        acList.forEach(a => {
          const col = acaraColMap[a.id]
          const cnt = countMap[a.id] || 0
          cols[col] = (cols[col] || 0) + cnt
          total += cnt
        })
        return { namaPendek, minNo, cols, total }
      })
      .sort((a, b) => a.minNo - b.minNo)
    const colTotals = {}
    let grandTotal = 0
    rows.forEach(r => {
      colHeaders.forEach(c => { colTotals[c] = (colTotals[c] || 0) + (r.cols[c] || 0) })
      grandTotal += r.total
    })
    return { colHeaders, rows, colTotals, grandTotal }
  }

  // ── Helper: senarai pendaftaran by sekolah ────────────────────────────────────

  function buildSenaraiBySekolah(pendaftaranDocs, sekolahList, katList) {
    // Unique jantina+kategoriKod combos from registered atletes
    const comboSet = new Set()
    pendaftaranDocs.forEach(p => {
      if (p.kategoriKod && p.jantina) comboSet.add(`${p.jantina}_${p.kategoriKod}`)
    })

    // Sort: L first, then by kategori urutan
    const katOrderMap = Object.fromEntries(
      katList.map(k => [k.kod || k.id, k.urutan ?? 99])
    )
    const katLabelMap = Object.fromEntries(
      katList.map(k => [k.kod || k.id, k.label || k.kod || k.id])
    )
    const combos = Array.from(comboSet).sort((a, b) => {
      const [ja, ka] = a.split('_')
      const [jb, kb] = b.split('_')
      if (ja !== jb) return ja === 'L' ? -1 : 1
      return (katOrderMap[ka] ?? 99) - (katOrderMap[kb] ?? 99) || ka.localeCompare(kb)
    })

    const comboHeaders = combos.map(c => {
      const [j, k] = c.split('_')
      return `${j}${katLabelMap[k] || k}`
    })

    // Count per sekolah per combo
    const countMap = {}
    pendaftaranDocs.forEach(p => {
      const sid = p.kodSekolah || p.sekolahId || '?'
      if (!countMap[sid]) countMap[sid] = { _total: 0 }
      const combo = `${p.jantina}_${p.kategoriKod}`
      if (comboSet.has(combo)) {
        countMap[sid][combo] = (countMap[sid][combo] || 0) + 1
        countMap[sid]._total++
      }
    })

    // jenisSekolah order from katList
    const jenisOrder = [...new Set(katList.map(k => k.jenisSekolah).filter(Boolean))]
    const sekolahByJenis = {}
    sekolahList.forEach(s => {
      const jenis = s.kategori || 'Lain-lain'
      if (!sekolahByJenis[jenis]) sekolahByJenis[jenis] = []
      sekolahByJenis[jenis].push(s)
    })
    const jenisKeys = [
      ...jenisOrder.filter(j => sekolahByJenis[j]),
      ...Object.keys(sekolahByJenis).filter(j => !jenisOrder.includes(j)),
    ]

    // Column totals per jenisSekolah
    const colTotalsByJenis = {}
    jenisKeys.forEach(jenis => {
      const tot = {}
      combos.forEach(c => { tot[c] = 0 })
      let gtot = 0
      ;(sekolahByJenis[jenis] || []).forEach(s => {
        const sid = s.kodSekolah || s.id
        const m = countMap[sid] || {}
        combos.forEach(c => { tot[c] = (tot[c] || 0) + (m[c] || 0) })
        gtot += m._total || 0
      })
      colTotalsByJenis[jenis] = { tot, gtot }
    })

    return { combos, comboHeaders, countMap, jenisKeys, sekolahByJenis, colTotalsByJenis }
  }

  // ── Jana PDF ─────────────────────────────────────────────────────────────────

  async function janaPDF({
    cfg, kej, kejId, namaKej, peringkatKej,
    sekolahList, jadualList, acaraList, acaraMap,
    finalHeatMap, allHeatsMap = {}, rekodMap, rekodDipecahList = [], tajukList = [], mataMap, katList, pendaftaranDocs,
    medalTallyDocs, bukuCfg = {}, useCustomCover = false,
  }) {
    const { jsPDF }             = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')

    const pdf      = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const W        = 210
    const M        = 14
    const BLUE     = [0, 51, 153]
    const DARK_BLUE = [0, 30, 100]
    const GOLD     = [212, 175, 55]

    const tarikhMula  = kej.tarikhMula  || cfg.tarikhMula  || ''
    const tarikhTamat = kej.tarikhTamat || cfg.tarikhTamat || ''
    const tempat      = cfg.tempatKejohanan || kej.lokasi  || ''

    const PERINGKAT_LABEL = { D: 'Peringkat Daerah', N: 'Peringkat Negeri', K: 'Peringkat Kebangsaan' }

    // ── Helper: header halaman (untuk halaman 2+) ──
    function hdrHalaman(tajuk, sub) {
      pdf.setFillColor(...DARK_BLUE)
      pdf.rect(0, 0, W, 10, 'F')
      pdf.setFontSize(7)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(255, 255, 255)
      pdf.text(namaKej.toUpperCase(), M, 6.5)
      pdf.text(tajuk.toUpperCase(), W - M, 6.5, { align: 'right' })
      pdf.setTextColor(0, 0, 0)
      if (sub) {
        pdf.setFontSize(8)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(...BLUE)
        pdf.text(sub, M, 18)
        pdf.setTextColor(0, 0, 0)
        pdf.setDrawColor(...BLUE)
        pdf.setLineWidth(0.3)
        pdf.line(M, 20, W - M, 20)
      }
    }

    // ── Nombor halaman (skip muka depan) ──
    function nomorHalaman() {
      const total = pdf.getNumberOfPages()
      for (let i = 2; i <= total; i++) {
        pdf.setPage(i)
        pdf.setFontSize(7)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(150, 150, 150)
        pdf.text(`${i - 1} / ${total - 1}`, W - M, 290, { align: 'right' })
        pdf.text(namaKej, M, 290)
      }
    }

    // ════════════════════════════════════════════════════════════
    // HALAMAN 1 — MUKA DEPAN
    // ════════════════════════════════════════════════════════════

    let y = 0  // declared di luar untuk diguna semula dalam section seterusnya

    if (useCustomCover) {
      // ── Custom cover: gambar A4 penuh ──
      try {
        pdf.addImage(bukuCfg.coverImg, 'JPEG', 0, 0, W, 297)
      } catch (e) {
        console.warn('Gagal lukis custom cover:', e.message)
      }
    } else {
      // ── Default KOAM Official cover ──
      // ── Band gelap atas (55mm) ──
      pdf.setFillColor(...DARK_BLUE)
      pdf.rect(0, 0, W, 55, 'F')

    // Logo dalam band
    const logoSize = 32
    if (cfg.logoKiriBase64) {
      try { pdf.addImage(cfg.logoKiriBase64, 'PNG', 12, 9, logoSize, logoSize) } catch {}
    }
    if (cfg.logoKananBase64) {
      try { pdf.addImage(cfg.logoKananBase64, 'PNG', W - 12 - logoSize, 9, logoSize, logoSize) } catch {}
    }

    // Nama kejohanan — putih bold (area = W - kiri - logo - logo - kanan = 122mm)
    const nameAreaW = W - 24 - logoSize * 2
    const namaLines = pdf.splitTextToSize(namaKej.toUpperCase(), nameAreaW > 60 ? nameAreaW : 100)
    pdf.setFontSize(15)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(255, 255, 255)
    pdf.text(namaLines, W / 2, 18, { align: 'center' })

    // "BUKU PROGRAM RASMI" — emas
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(...GOLD)
    pdf.text('BUKU PROGRAM RASMI', W / 2, 18 + namaLines.length * 6 + 2, { align: 'center' })

    // Peringkat & tarikh — biru muda
    const infoY = 18 + namaLines.length * 6 + 8
    pdf.setFontSize(7)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(180, 200, 255)
    pdf.text(PERINGKAT_LABEL[peringkatKej] || '', W / 2, infoY, { align: 'center' })

    if (tarikhMula) {
      const tStr = tarikhMula === tarikhTamat || !tarikhTamat
        ? fmtTarikh(tarikhMula)
        : `${fmtTarikh(tarikhMula)}  —  ${fmtTarikh(tarikhTamat)}`
      pdf.setFontSize(7)
      pdf.setTextColor(160, 185, 240)
      pdf.text(tStr, W / 2, infoY + 6, { align: 'center' })
    }

    // ── Jalur emas ──
    pdf.setFillColor(...GOLD)
    pdf.rect(0, 55, W, 4, 'F')

    // ── Dekorasi trek (titik-titik lorong) ──
    y = 65
    pdf.setFillColor(200, 215, 245)
    for (let i = 0; i <= 8; i++) {
      const dotX = M + i * ((W - M * 2) / 8)
      pdf.circle(dotX, y, 1.0, 'F')
    }
    pdf.setDrawColor(210, 220, 245)
    pdf.setLineWidth(0.4)
    pdf.line(M, y + 4, W - M, y + 4)
    y += 14

    // ── Tempat kejohanan ──
    if (tempat) {
      pdf.setFontSize(11)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(...DARK_BLUE)
      pdf.text(tempat.toUpperCase(), W / 2, y, { align: 'center' })
      y += 6
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(120, 120, 120)
      pdf.text('Tempat Kejohanan', W / 2, y, { align: 'center' })
      y += 10
    }

    // ── Separator ──
    pdf.setDrawColor(...GOLD)
    pdf.setLineWidth(0.5)
    pdf.line(M + 20, y, W - M - 20, y)
    y += 8

    // ── 4 stat boxes: Sekolah | Acara | Atlet | Rekod ──
    const statItems = [
      { label: 'Sekolah', val: sekolahList.length },
      { label: 'Acara',   val: acaraList.length },
      { label: 'Atlet',   val: pendaftaranDocs.length },
      { label: 'Rekod',   val: Object.keys(rekodMap).length },
    ]
    const boxW4 = (W - M * 2 - 9) / 4
    statItems.forEach((s, i) => {
      const bx = M + i * (boxW4 + 3)
      pdf.setFillColor(240, 244, 255)
      pdf.roundedRect(bx, y, boxW4, 24, 3, 3, 'F')
      pdf.setDrawColor(...BLUE)
      pdf.setLineWidth(0.3)
      pdf.roundedRect(bx, y, boxW4, 24, 3, 3, 'S')
      pdf.setFontSize(20)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(...BLUE)
      pdf.text(String(s.val), bx + boxW4 / 2, y + 15, { align: 'center' })
      pdf.setFontSize(6.5)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(110, 110, 110)
      pdf.text(s.label.toUpperCase(), bx + boxW4 / 2, y + 21, { align: 'center' })
    })
    y += 32

    // ── Penganjur ──
    if (cfg.penganjur || cfg.jabatan) {
      pdf.setDrawColor(220, 220, 220)
      pdf.setLineWidth(0.3)
      pdf.line(M + 30, y, W - M - 30, y)
      y += 8

      pdf.setFontSize(7.5)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(120, 120, 120)
      pdf.text('ANJURAN', W / 2, y, { align: 'center' })
      y += 6

      if (cfg.penganjur) {
        pdf.setFontSize(9)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(...DARK_BLUE)
        pdf.text(cfg.penganjur, W / 2, y, { align: 'center' })
        y += 6
      }
      if (cfg.jabatan) {
        pdf.setFontSize(8)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(80, 80, 80)
        pdf.text(cfg.jabatan, W / 2, y, { align: 'center' })
        y += 6
      }
    }

    // ── Footer band bawah ──
    pdf.setFillColor(...DARK_BLUE)
    pdf.rect(0, 277, W, 20, 'F')
    pdf.setFillColor(...GOLD)
    pdf.rect(0, 277, W, 1.5, 'F')
    pdf.setFontSize(7)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(180, 200, 255)
    pdf.text('Dijana oleh Sistem Pengurusan Kejohanan Olahraga MSSD Kemaman (KOAM)', W / 2, 286, { align: 'center' })
    pdf.text(new Date().toLocaleDateString('ms-MY'), W / 2, 292, { align: 'center' })
    }

    // ════════════════════════════════════════════════════════════
    // HALAMAN — SENARAI SEKOLAH
    // ════════════════════════════════════════════════════════════
    pdf.addPage()
    hdrHalaman('Senarai Sekolah', 'SENARAI SEKOLAH PESERTA')
    y = 26

    const sklByKat = sekolahList.reduce((acc, s) => {
      const k = s.kategori || 'Lain-lain'
      if (!acc[k]) acc[k] = []
      acc[k].push(s)
      return acc
    }, {})
    const jenisOrder0 = [...new Set(katList.map(k => k.jenisSekolah).filter(Boolean))]
    const katKeys0 = [
      ...jenisOrder0.filter(k => sklByKat[k]),
      ...Object.keys(sklByKat).filter(k => !jenisOrder0.includes(k)),
    ]

    const sklRows = []
    katKeys0.forEach(kat => {
      sklByKat[kat].forEach((s, i) => {
        sklRows.push([
          i + 1,
          s.namaSekolah || s.kodSekolah || '—',
          s.kodSekolah  || '—',
          kat,
        ])
      })
    })

    autoTable(pdf, {
      startY: y,
      head: [['#', 'Nama Sekolah', 'Kod', 'Kategori']],
      body: sklRows,
      styles:      { fontSize: 8, cellPadding: 2.5 },
      headStyles:  { fillColor: BLUE, fontStyle: 'bold', fontSize: 7.5 },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 32, fontStyle: 'bold' },
        3: { cellWidth: 40 },
      },
      theme: 'striped',
    })

    // ════════════════════════════════════════════════════════════
    // HALAMAN — MEDAL TALLY
    // ════════════════════════════════════════════════════════════
    if (medalTallyDocs && medalTallyDocs.length > 0) {
      pdf.addPage()
      hdrHalaman('Medal Tally', 'KEDUDUKAN PINGAT')
      y = 26

      // Enrich with jenisSekolah
      const sekolahByKod = Object.fromEntries(
        sekolahList.map(s => [s.kodSekolah || s.id, s])
      )
      const tallyEnriched = medalTallyDocs.map(t => {
        const skl = sekolahByKod[t.kodSekolah] || {}
        return {
          ...t,
          jenisSekolah: t.jenisSekolah || skl.kategori || 'Lain-lain',
          namaSekolah:  t.namaSekolah  || skl.namaSekolah || t.kodSekolah || '—',
        }
      })

      const jenisOrder1 = [...new Set(katList.map(k => k.jenisSekolah).filter(Boolean))]
      const tallyByJenis = {}
      tallyEnriched.forEach(t => {
        const j = t.jenisSekolah || 'Lain-lain'
        if (!tallyByJenis[j]) tallyByJenis[j] = []
        tallyByJenis[j].push(t)
      })
      const tallyJenisKeys = [
        ...jenisOrder1.filter(j => tallyByJenis[j]),
        ...Object.keys(tallyByJenis).filter(j => !jenisOrder1.includes(j)),
      ]

      tallyJenisKeys.forEach(jenis => {
        const items = (tallyByJenis[jenis] || [])
          .sort((a, b) => (b.emas || 0) - (a.emas || 0) || (b.perak || 0) - (a.perak || 0) || (b.gangsa || 0) - (a.gangsa || 0))

        if (items.length === 0) return
        if (y > 240) { pdf.addPage(); hdrHalaman('Medal Tally', ''); y = 16 }

        const tallyRows = items.map((t, i) => [
          i + 1,
          t.namaSekolah || t.kodSekolah || '—',
          t.emas   || 0,
          t.perak  || 0,
          t.gangsa || 0,
          (t.emas || 0) + (t.perak || 0) + (t.gangsa || 0),
        ])

        autoTable(pdf, {
          startY: y,
          head: [[
            { content: jenis.toUpperCase(), colSpan: 6, styles: { fillColor: DARK_BLUE, halign: 'center', fontStyle: 'bold', fontSize: 8.5, textColor: [255, 255, 255] } },
          ], ['#', 'Sekolah', 'Emas', 'Perak', 'Gangsa', 'Jum']],
          body: tallyRows,
          styles:      { fontSize: 8.5, cellPadding: 3 },
          headStyles:  { fillColor: BLUE, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
          columnStyles: {
            0: { cellWidth: 10, halign: 'center' },
            1: { cellWidth: 'auto' },
            2: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
            3: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
            4: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
            5: { cellWidth: 20, halign: 'center', fontStyle: 'bold', textColor: BLUE },
          },
          theme: 'striped',
          didParseCell: (data) => {
            if (data.section === 'head' && data.row.index === 0) return // already set above
            if (data.section === 'body') {
              if (data.row.index === 0) data.cell.styles.fillColor = [255, 248, 215]
              else if (data.row.index === 1) data.cell.styles.fillColor = [245, 245, 250]
              else if (data.row.index === 2) data.cell.styles.fillColor = [250, 240, 230]
            }
          },
        })
        y = pdf.lastAutoTable.finalY + 8
      })
    }

    // ════════════════════════════════════════════════════════════
    // HALAMAN — SENARAI PENDAFTARAN MENGIKUT SEKOLAH
    // ════════════════════════════════════════════════════════════
    if (pendaftaranDocs && pendaftaranDocs.length > 0) {
      const { combos, comboHeaders, countMap: sklCountMap, jenisKeys, sekolahByJenis, colTotalsByJenis } =
        buildSenaraiBySekolah(pendaftaranDocs, sekolahList, katList)

      if (combos.length > 0 && jenisKeys.length > 0) {
        pdf.addPage()
        hdrHalaman('Pendaftaran Sekolah', 'SENARAI PENDAFTARAN MENGIKUT SEKOLAH')
        y = 26

        jenisKeys.forEach(jenis => {
          const sklList = sekolahByJenis[jenis] || []
          if (sklList.length === 0) return

          if (y > 240) { pdf.addPage(); hdrHalaman('Pendaftaran Sekolah', ''); y = 16 }

          const { tot, gtot } = colTotalsByJenis[jenis] || { tot: {}, gtot: 0 }

          const sklPendRows = sklList.map(s => {
            const sid = s.kodSekolah || s.id
            const m = sklCountMap[sid] || {}
            return [
              s.namaSekolah || sid,
              ...combos.map(c => (m[c] || 0) > 0 ? String(m[c]) : '—'),
              String(m._total || 0),
            ]
          })
          // Baris jumlah
          sklPendRows.push([
            'JUMLAH',
            ...combos.map(c => String(tot[c] || 0)),
            String(gtot),
          ])

          const dynW = Math.min(15, Math.floor((W - M * 2 - 55 - 14) / Math.max(combos.length, 1)))
          const cStyles = {
            0: { cellWidth: 'auto' },
            [combos.length + 1]: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
          }
          combos.forEach((_, i) => { cStyles[i + 1] = { cellWidth: dynW, halign: 'center' } })

          autoTable(pdf, {
            startY: y,
            head: [[
              { content: jenis.toUpperCase(), colSpan: combos.length + 2, styles: { fillColor: DARK_BLUE, halign: 'center', fontStyle: 'bold', fontSize: 8, textColor: [255, 255, 255] } },
            ], ['Sekolah', ...comboHeaders, 'JUM']],
            body: sklPendRows,
            styles:      { fontSize: 7, cellPadding: 2 },
            headStyles:  { fillColor: BLUE, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
            columnStyles: cStyles,
            theme: 'striped',
            didParseCell: (data) => {
              if (data.section === 'body' && data.row.index === sklPendRows.length - 1) {
                data.cell.styles.fillColor = [220, 225, 245]
                data.cell.styles.fontStyle = 'bold'
                data.cell.styles.textColor = [0, 30, 100]
              }
            },
          })
          y = pdf.lastAutoTable.finalY + 8
        })
      }
    }

    // ════════════════════════════════════════════════════════════
    // HALAMAN — ANALISIS PENDAFTARAN
    // ════════════════════════════════════════════════════════════
    if (pendaftaranDocs && pendaftaranDocs.length > 0) {
      const analisis = buildAnalisisPendaftaran(acaraList, pendaftaranDocs, katList)
      const { colHeaders, rows: analRows, colTotals, grandTotal } = analisis

      pdf.addPage()
      hdrHalaman('Analisis Pendaftaran', 'ANALISIS PENDAFTARAN ATLET')
      y = 26

      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(80, 80, 80)
      pdf.text(
        `Jumlah Atlet Daftar: ${pendaftaranDocs.length}   |   Jenis Acara: ${analRows.length}   |   Jumlah Pendaftaran: ${grandTotal}`,
        M, y
      )
      y += 8

      const HEAD_1 = [
        { content: 'Acara', rowSpan: 2, styles: { valign: 'middle', halign: 'left' } },
        ...colHeaders.map(c => ({
          content: c,
          styles: { halign: 'center', fontSize: 7, fontStyle: 'bold' },
        })),
        { content: 'Jumlah', rowSpan: 2, styles: { valign: 'middle', halign: 'center', fontStyle: 'bold' } },
      ]

      const tableRows = analRows.map(r => [
        r.namaPendek,
        ...colHeaders.map(c => (r.cols[c] || 0) > 0 ? String(r.cols[c]) : '—'),
        String(r.total),
      ])
      tableRows.push([
        'JUMLAH',
        ...colHeaders.map(c => String(colTotals[c] || 0)),
        String(grandTotal),
      ])

      const dynColW = Math.min(16, Math.floor((W - M * 2 - 40 - 16) / Math.max(colHeaders.length, 1)))
      const colStyles = {
        0: { cellWidth: 'auto' },
        [colHeaders.length + 1]: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
      }
      colHeaders.forEach((_, i) => {
        colStyles[i + 1] = { cellWidth: dynColW, halign: 'center' }
      })

      autoTable(pdf, {
        startY: y,
        head: [HEAD_1],
        body: tableRows,
        styles:      { fontSize: 7.5, cellPadding: 2 },
        headStyles:  { fillColor: BLUE, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
        columnStyles: colStyles,
        theme: 'striped',
        didParseCell: (data) => {
          if (data.section === 'body' && data.row.index === tableRows.length - 1) {
            data.cell.styles.fillColor = [220, 225, 245]
            data.cell.styles.fontStyle = 'bold'
            data.cell.styles.textColor = [0, 30, 100]
          }
        },
      })
      y = pdf.lastAutoTable.finalY + 6
    }

    // ════════════════════════════════════════════════════════════
    // HALAMAN — JADUAL ACARA (per hari)
    // ════════════════════════════════════════════════════════════
    const jadualByDay = jadualList.reduce((acc, j) => {
      const d = j.tarikhAcara
      if (!acc[d]) acc[d] = []
      acc[d].push(j)
      return acc
    }, {})
    const days = Object.keys(jadualByDay).sort()

    if (days.length > 0) {
      pdf.addPage()
      hdrHalaman('Jadual Acara', 'JADUAL ACARA KEJOHANAN')
      y = 26

      days.forEach((date, di) => {
        const items = jadualByDay[date]
        const dayLabel = `HARI ${di + 1} — ${fmtTarikh(date).toUpperCase()}`

        const rows = items.map(j => {
          const acara = acaraMap[j.aceraId || j.acaraId] || {}
          return [
            acara.noAcara  || j.aceraId || '—',
            j.masaMula     || '—',
            acara.namaAcara || '—',
            acara.jantina === 'L' ? 'Lelaki' : acara.jantina === 'P' ? 'Perempuan' : '—',
            katLabel(acara.kategoriKod, katList) || '—',
            j.lokasi || acara.lokasi || tempat || '—',
          ]
        })

        autoTable(pdf, {
          startY: y,
          head: [[{ content: dayLabel, colSpan: 6, styles: { fillColor: DARK_BLUE, fontStyle: 'bold', halign: 'center', fontSize: 8, textColor: [255, 255, 255] } }],
                 ['No.', 'Masa', 'Nama Acara', 'Jantina', 'Kat', 'Lokasi']],
          body: rows,
          styles:      { fontSize: 7.5, cellPadding: 2 },
          headStyles:  { fillColor: [220, 225, 245], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 7 },
          columnStyles: {
            0: { cellWidth: 12, halign: 'center' },
            1: { cellWidth: 16, halign: 'center' },
            2: { cellWidth: 'auto' },
            3: { cellWidth: 22 },
            4: { cellWidth: 12, halign: 'center' },
            5: { cellWidth: 40 },
          },
          theme: 'grid',
          didParseCell: (data) => {
            if (data.row.index === 0 && data.section === 'head') {
              data.cell.styles.fillColor = DARK_BLUE
              data.cell.styles.textColor = [255, 255, 255]
            }
          },
        })
        y = pdf.lastAutoTable.finalY + 6
        if (y > 260 && di < days.length - 1) { pdf.addPage(); hdrHalaman('Jadual Acara', ''); y = 16 }
      })
    }

    // ════════════════════════════════════════════════════════════
    // HALAMAN — KEPUTUSAN HARIAN (per hari → per acara, semua heat + final, semua peserta)
    // Setiap hari = page baru. Susun ikut noAcara. Skip acara/hari tanpa keputusan.
    // ════════════════════════════════════════════════════════════
    const MEDAL_MAP = { 1: 'EMAS', 2: 'PERAK', 3: 'GANGSA', 4: 'T4', 5: 'T5' }

    // Group acara (yg ada keputusan) by tarikhAcara dari jadual
    const acaraTarikhMap = {}
    jadualList.forEach(j => {
      const aId = j.aceraId || j.acaraId
      if (aId && j.tarikhAcara && !acaraTarikhMap[aId]) {
        acaraTarikhMap[aId] = j.tarikhAcara
      }
    })

    const keputusanByDay = {}
    Object.keys(allHeatsMap).forEach(aId => {
      const acara = acaraMap[aId]
      const heats = allHeatsMap[aId] || []
      if (!acara || heats.length === 0) return
      const tarikh = acaraTarikhMap[aId] || acara.tarikhAcara || ''
      if (!tarikh) return  // skip kalau tiada tarikh
      if (!keputusanByDay[tarikh]) keputusanByDay[tarikh] = []
      keputusanByDay[tarikh].push({ acara, heats })
    })

    const hariSorted = Object.keys(keputusanByDay).sort()
      .filter(d => keputusanByDay[d].some(it => it.heats.some(h => (h.peserta || []).some(p => p.rankDalamHeat))))

    if (hariSorted.length > 0) {
      hariSorted.forEach((tarikh, hariIdx) => {
        const items = keputusanByDay[tarikh]
          .sort((a, b) => Number(a.acara.noAcara || 0) - Number(b.acara.noAcara || 0))

        // Page baru setiap hari
        pdf.addPage()
        hdrHalaman('Keputusan', 'KEPUTUSAN HARIAN')
        y = 26

        // Header hari besar
        pdf.setFillColor(...DARK_BLUE)
        pdf.rect(M, y, W - M * 2, 10, 'F')
        pdf.setFontSize(11)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(255, 255, 255)
        pdf.text(
          `HARI ${hariIdx + 1} — ${fmtTarikh(tarikh).toUpperCase()}`,
          W / 2, y + 6.8, { align: 'center' }
        )
        pdf.setTextColor(0, 0, 0)
        y += 13

        items.forEach(({ acara, heats }) => {
          const isPadang = ['padang_lompat', 'padang_balin'].includes(acara.jenisAcara)
          const isRelay  = acara.jenisAcara === 'relay'
          const jantinaLabel = acara.jantina === 'L' ? 'Lelaki' : acara.jantina === 'P' ? 'Perempuan' : ''

          // Susun heat: saringan dulu (by noHeat), final last
          const sortedHeats = [...heats].sort((a, b) => {
            const aIsFinal = ['final', 'terus_final'].includes(a.fasa) || a.peringkat === 'final'
            const bIsFinal = ['final', 'terus_final'].includes(b.fasa) || b.peringkat === 'final'
            if (aIsFinal && !bIsFinal) return 1
            if (!aIsFinal && bIsFinal) return -1
            return Number(a.noHeat || 0) - Number(b.noHeat || 0)
          })

          // Header acara
          if (y > 255) { pdf.addPage(); hdrHalaman('Keputusan', ''); y = 16 }
          pdf.setFillColor(235, 240, 255)
          pdf.rect(M, y, W - M * 2, 7, 'F')
          pdf.setFontSize(8.5)
          pdf.setFont('helvetica', 'bold')
          pdf.setTextColor(0, 30, 100)
          pdf.text(
            `${acara.noAcara ? `[${acara.noAcara}] ` : ''}${acara.namaAcara}  —  ${jantinaLabel}  —  Kat ${katLabel(acara.kategoriKod, katList) || '—'}`,
            M + 2, y + 4.8
          )
          pdf.setTextColor(0, 0, 0)
          y += 8

          // Loop heat
          sortedHeats.forEach(heat => {
            const isFinal = ['final', 'terus_final'].includes(heat.fasa) || heat.peringkat === 'final'
            const heatLabel = isFinal ? 'FINAL' : `HEAT ${heat.noHeat || ''}`.trim()

            const peserta = (heat.peserta || [])
              .filter(p => p.rankDalamHeat || p.keputusan != null)
              .sort((a, b) => (a.rankDalamHeat || 99) - (b.rankDalamHeat || 99))
            if (peserta.length === 0) return

            // Build table
            const head = isRelay
              ? [['Ked', 'Sekolah / Pasukan', 'BIB', isPadang ? 'Jarak' : 'Masa', 'Status']]
              : [['Ked', 'BIB', 'Nama Atlet', 'Sekolah', isPadang ? 'Jarak' : 'Masa', 'Status']]
            const body = peserta.map(p => {
              const flagged = ['DNS','DNF','DQ'].includes(p.status)
              const status = flagged ? p.status : (isFinal ? (MEDAL_MAP[p.rankDalamHeat] || '') : '')
              const prestasi = flagged ? '—' : fmtPrestasi(p.keputusan, acara.jenisAcara)
              const ked = flagged ? '—' : String(p.rankDalamHeat || '')
              if (isRelay) return [ked, p.kodSekolah || '—', p.noBib || '—', prestasi, status]
              return [ked, p.noBib || '—', p.namaAtlet || '—', p.kodSekolah || '—', prestasi, status]
            })

            if (y > 255) { pdf.addPage(); hdrHalaman('Keputusan', ''); y = 16 }
            autoTable(pdf, {
              startY: y,
              head: [
                [{ content: heatLabel, colSpan: isRelay ? 5 : 6, styles: { fillColor: isFinal ? [0, 100, 60] : [120, 120, 120], textColor: [255,255,255], fontStyle: 'bold', fontSize: 7.5, halign: 'left' } }],
                head[0],
              ],
              body,
              styles:      { fontSize: 7.5, cellPadding: 1.5 },
              headStyles:  { fillColor: [240, 240, 240], textColor: [0,0,0], fontStyle: 'bold', fontSize: 7 },
              columnStyles: isRelay ? {
                0: { cellWidth: 10, halign: 'center', fontStyle: 'bold' },
                1: { cellWidth: 'auto' },
                2: { cellWidth: 20, halign: 'center' },
                3: { cellWidth: 25, halign: 'right', fontStyle: 'bold', textColor: BLUE },
                4: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
              } : {
                0: { cellWidth: 10, halign: 'center', fontStyle: 'bold' },
                1: { cellWidth: 14, halign: 'center' },
                2: { cellWidth: 'auto' },
                3: { cellWidth: 30 },
                4: { cellWidth: 22, halign: 'right', fontStyle: 'bold', textColor: BLUE },
                5: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
              },
              theme: 'grid',
              tableLineColor: [200, 200, 200],
              tableLineWidth: 0.15,
              margin: { left: M, right: M },
            })
            y = pdf.lastAutoTable.finalY + 2
          })

          // Badge rekod baru (semak final)
          const finalHeat = sortedHeats.find(h => ['final', 'terus_final'].includes(h.fasa) || h.peringkat === 'final')
          if (finalHeat) {
            const pecahRekodAtlet = (finalHeat.peserta || []).find(p => p.pecahRekod)
            if (pecahRekodAtlet) {
              if (y > 270) { pdf.addPage(); hdrHalaman('Keputusan', ''); y = 16 }
              pdf.setFillColor(255, 248, 210)
              pdf.rect(M, y, W - M * 2, 5, 'F')
              pdf.setFontSize(7)
              pdf.setFont('helvetica', 'bold')
              pdf.setTextColor(180, 100, 0)
              pdf.text(
                `🏆 REKOD BARU ${pecahRekodAtlet.pecahRekod === 'N' ? 'NEGERI' : pecahRekodAtlet.pecahRekod === 'K' ? 'KEBANGSAAN' : 'DAERAH'}: ${pecahRekodAtlet.namaAtlet || pecahRekodAtlet.kodSekolah} — ${fmtPrestasi(pecahRekodAtlet.keputusan, acara.jenisAcara)}`,
                M + 2, y + 3.5
              )
              pdf.setTextColor(0, 0, 0)
              y += 6
            }
          }

          y += 3
        })
      })
    }

    // ════════════════════════════════════════════════════════════
    // HALAMAN — REKOD SEMASA
    // ════════════════════════════════════════════════════════════
    const rekodList = Object.values(rekodMap)
    if (rekodList.length > 0) {
      pdf.addPage()
      hdrHalaman('Rekod Semasa', 'REKOD SEMASA KEJOHANAN')
      y = 26

      const rekodByKat = rekodList.reduce((acc, r) => {
        const k = r.kategoriKod || 'Lain-lain'
        if (!acc[k]) acc[k] = []
        acc[k].push(r)
        return acc
      }, {})
      const katMap = Object.fromEntries(katList.map(k => [k.kod, k]))
      const katKeys2 = [
        ...katList.map(k => k.kod).filter(k => rekodByKat[k]),
        ...Object.keys(rekodByKat).filter(k => !katList.find(kl => kl.kod === k)),
      ]

      const PERINGKAT = { D: 'Daerah', N: 'Negeri', K: 'Kebangsaan' }

      katKeys2.forEach(katKod => {
        if (y > 245) { pdf.addPage(); hdrHalaman('Rekod Semasa', ''); y = 16 }
        const kat  = katMap[katKod]
        const rows = (rekodByKat[katKod] || [])
          .sort((a, b) => (a.namaAcara || '').localeCompare(b.namaAcara || '') || (a.jantina || '').localeCompare(b.jantina || ''))
          .map(r => [
            r.namaAcara   || '—',
            r.jantina === 'L' ? 'L' : 'P',
            PERINGKAT[r.peringkat] || r.peringkat || '—',
            r.namaAtlet   || '—',
            r.namaSekolah || r.kodSekolah || '—',
            r.tarikhRekod || '—',
            fmtPrestasi(r.prestasi, r.unit === 'm' ? 'padang_lompat' : 'lorong'),
          ])

        autoTable(pdf, {
          startY: y,
          head: [[{
            content: `${kat?.nama || katKod}${kat ? ` (Kat ${katKod})` : ''}`.toUpperCase(),
            colSpan: 7,
            styles: { fillColor: BLUE, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
          }],
          ['Acara', 'Jan', 'Peringkat', 'Atlet', 'Sekolah', 'Tarikh', 'Prestasi']],
          body: rows,
          styles:      { fontSize: 7, cellPadding: 2 },
          headStyles:  { fillColor: [220, 225, 245], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 6.5 },
          columnStyles: {
            0: { cellWidth: 'auto' },
            1: { cellWidth: 8,  halign: 'center' },
            2: { cellWidth: 20 },
            3: { cellWidth: 38 },
            4: { cellWidth: 35 },
            5: { cellWidth: 20 },
            6: { cellWidth: 22, halign: 'right', fontStyle: 'bold', textColor: BLUE },
          },
          theme: 'striped',
          didParseCell: (data) => {
            if (data.row.index === 0 && data.section === 'head') {
              data.cell.styles.fillColor = BLUE
              data.cell.styles.textColor = [255, 255, 255]
            }
          },
        })
        y = pdf.lastAutoTable.finalY + 5
      })
    }

    // ════════════════════════════════════════════════════════════
    // HALAMAN — REKOD DIPECAH (dari mata_olahragawan — sama Tab Rekod Kejohanan)
    // ════════════════════════════════════════════════════════════
    if (rekodDipecahList.length > 0) {
      pdf.addPage()
      hdrHalaman('Rekod Dipecah', 'REKOD BAHARU DIPECAH DALAM KEJOHANAN INI')
      y = 26

      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'italic')
      pdf.setTextColor(80, 80, 80)
      pdf.text(`${rekodDipecahList.length} rekod baharu telah ditetapkan dalam kejohanan ini.`, M, y)
      y += 8

      const rows = rekodDipecahList
        .slice().sort((a, b) => (a.namaAcara || '').localeCompare(b.namaAcara || ''))
        .map(r => [
          r.namaAtlet   || '—',
          r.namaSekolah || '—',
          r.namaAcara   || '—',
          katLabel(r.kategoriKod, katList) || '—',
          fmtPrestasi(r.prestasi,     r.unit === 'm' ? 'padang_lompat' : 'lorong'),
          r.prestasiLama != null ? fmtPrestasi(r.prestasiLama, r.unit === 'm' ? 'padang_lompat' : 'lorong') : '—',
          r.namaLama    || '—',
          r.tahunLama   || '—',
        ])

      autoTable(pdf, {
        startY: y,
        head: [[
          { content: 'REKOD BAHARU', colSpan: 5, styles: { fillColor: BLUE, halign: 'center', fontStyle: 'bold', textColor: [255, 255, 255] } },
          { content: 'REKOD LAMA', colSpan: 3, styles: { fillColor: [70, 70, 100], halign: 'center', fontStyle: 'bold', textColor: [255, 255, 255] } },
        ], ['Nama Atlet', 'Sekolah', 'Acara', 'Kat', 'Prestasi Baru', 'Prestasi Lama', 'Pemegang Lama', 'Tahun']],
        body: rows,
        styles:      { fontSize: 7, cellPadding: 2 },
        headStyles:  { fillColor: BLUE, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
        columnStyles: {
          0: { cellWidth: 38 },
          1: { cellWidth: 28 },
          2: { cellWidth: 'auto' },
          3: { cellWidth: 9,  halign: 'center' },
          4: { cellWidth: 20, halign: 'right', fontStyle: 'bold', textColor: BLUE },
          5: { cellWidth: 20, halign: 'right', textColor: [100, 100, 100] },
          6: { cellWidth: 30 },
          7: { cellWidth: 14, halign: 'center' },
        },
        theme: 'striped',
      })
      y = pdf.lastAutoTable.finalY + 6
    }

    // ════════════════════════════════════════════════════════════
    // HALAMAN — ATLET TERBAIK (dari tetapan/atletTerbaik)
    // ════════════════════════════════════════════════════════════
    const tajukAda = tajukList.filter(t => t.atlet)
    if (tajukAda.length > 0) {
      pdf.addPage()
      hdrHalaman('Atlet Terbaik', 'ATLET TERBAIK KEJOHANAN')
      y = 26

      const rows = tajukAda.map(t => {
        const live = mataMap[t.atlet.noKP] || {}
        const E    = live.pingat_emas   ?? t.atlet.pingat_emas   ?? 0
        const P    = live.pingat_perak  ?? t.atlet.pingat_perak  ?? 0
        const G    = live.pingat_gangsa ?? t.atlet.pingat_gangsa ?? 0
        const mata = live.jumlahMata    ?? t.atlet.jumlahMata    ?? 0
        return [
          t.namaTajuk || '—',
          t.atlet.namaAtlet   || '—',
          t.atlet.namaSekolah || t.atlet.kodSekolah || '—',
          `E:${E}  P:${P}  G:${G}`,
          mata + ' mata',
        ]
      })

      autoTable(pdf, {
        startY: y,
        head: [['Anugerah', 'Nama Atlet', 'Sekolah', 'Pingat', 'Jumlah Mata']],
        body: rows,
        styles:      { fontSize: 9, cellPadding: 3.5 },
        headStyles:  { fillColor: BLUE, fontStyle: 'bold', fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 48 },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 42 },
          3: { cellWidth: 24, halign: 'center' },
          4: { cellWidth: 22, halign: 'center', fontStyle: 'bold', textColor: BLUE },
        },
        theme: 'grid',
        alternateRowStyles: { fillColor: [245, 247, 255] },
      })
    }

    // ── Nombor halaman semua halaman (skip muka depan) ──
    nomorHalaman()

    // ── Simpan ──
    const tarikh = new Date().toISOString().slice(0, 10)
    pdf.save(`BukuKejohanan_${namaKej.replace(/\s+/g, '_')}_${tarikh}.pdf`)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-base font-bold text-[#003399]">Buku Kejohanan</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Jana PDF komprehensif — Muka Depan, Medal Tally, Pendaftaran, Jadual, Keputusan, Rekod, Atlet Terbaik
        </p>
      </div>

      {/* ── Setup Muka Depan (Cover) ── */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-4">
        <div>
          <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Muka Depan (Cover)</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Pilih jenis cover untuk PDF Buku Kejohanan. Page-page lain ikut design KOAM sedia ada.
          </p>
        </div>

        {/* Radio pilihan */}
        <div className="space-y-2">
          <label className={`flex items-start gap-2.5 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
            jenisCover === 'default'
              ? 'border-[#003399] bg-blue-50'
              : 'border-gray-200 hover:border-gray-300'
          }`}>
            <input
              type="radio"
              name="jenisCover"
              value="default"
              checked={jenisCover === 'default'}
              onChange={() => setJenisCover('default')}
              className="mt-0.5"
            />
            <div className="flex-1">
              <p className="text-xs font-semibold text-gray-800">Default KOAM Official</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Cover biru gelap dengan logo, nama kejohanan, jalur emas dan dekorasi trek</p>
            </div>
          </label>

          <label className={`flex items-start gap-2.5 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
            jenisCover === 'custom'
              ? 'border-[#003399] bg-blue-50'
              : 'border-gray-200 hover:border-gray-300'
          }`}>
            <input
              type="radio"
              name="jenisCover"
              value="custom"
              checked={jenisCover === 'custom'}
              onChange={() => setJenisCover('custom')}
              className="mt-0.5"
            />
            <div className="flex-1">
              <p className="text-xs font-semibold text-gray-800">Upload Template Sendiri</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Design penuh dari Canva/Photoshop — PNG/JPG (disyorkan ratio A4 portrait 1240×1754px)</p>
            </div>
          </label>
        </div>

        {/* Upload template (hanya tunjuk bila custom) */}
        {jenisCover === 'custom' && (
          <div className="space-y-3 border-t border-gray-100 pt-3">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="cursor-pointer">
                <div className="flex items-center gap-2 px-4 py-2 bg-[#003399] text-white rounded-lg text-xs font-semibold hover:bg-[#002280] transition-colors">
                  {uploading
                    ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    : <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                  }
                  {uploading ? 'Memproses...' : coverImg ? 'Tukar Template' : 'Muat Naik Template'}
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={handleUploadCover} disabled={uploading} />
              </label>
              {coverImg && (
                <button
                  onClick={handlePadamCover}
                  className="px-3 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-semibold hover:bg-red-100"
                >
                  🗑 Padam
                </button>
              )}
            </div>

            {/* Preview */}
            {coverImg ? (
              <div className="inline-block">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Preview Cover</p>
                <img
                  src={coverImg}
                  alt="Cover Preview"
                  className="w-40 rounded-lg border-2 border-gray-200"
                />
              </div>
            ) : (
              <div className="w-40 aspect-[210/297] bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center">
                <p className="text-[10px] text-gray-400 text-center px-2">Belum ada template</p>
              </div>
            )}
          </div>
        )}

        {/* Simpan + mesej */}
        <div className="flex items-center gap-3 border-t border-gray-100 pt-3">
          <button
            onClick={handleSaveCover}
            disabled={savingCover}
            className="px-4 py-2 bg-[#003399] text-white rounded-lg text-xs font-semibold hover:bg-[#002280] disabled:opacity-50"
          >
            {savingCover ? 'Menyimpan...' : '💾 Simpan Tetapan Cover'}
          </button>
          {coverMsg && (
            <span className={`text-xs font-medium ${coverMsg.startsWith('Ralat') || coverMsg.includes('Sila') ? 'text-red-500' : 'text-green-600'}`}>
              {coverMsg}
            </span>
          )}
        </div>
      </div>

      {/* Kandungan PDF */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        <p className="text-xs font-bold text-gray-600 mb-3 uppercase tracking-wide">Kandungan PDF</p>
        <div className="space-y-2">
          {[
            { icon: '📄', label: 'Muka Depan (KOAM Official)', desc: 'Logo, nama kejohanan, tarikh, lokasi, statistik, penganjur' },
            { icon: '🏫', label: 'Senarai Sekolah', desc: 'Semua sekolah peserta grouped by kategori' },
            { icon: '🥇', label: 'Medal Tally', desc: 'Kedudukan pingat setiap sekolah (SR/SM berasingan)' },
            { icon: '📋', label: 'Senarai Pendaftaran by Sekolah', desc: 'Bilangan atlet daftar per sekolah per kategori (dinamik SR/SM)' },
            { icon: '📊', label: 'Analisis Pendaftaran', desc: 'Bilangan atlet mendaftar per acara' },
            { icon: '📅', label: 'Jadual Acara', desc: 'Jadual lengkap per hari — masa, nama acara, lokasi' },
            { icon: '🏆', label: 'Keputusan Rasmi', desc: 'Tempat 1–2 per acara RASMI, grouped by hari' },
            { icon: '⭐', label: 'Rekod Semasa', desc: 'Semua rekod aktif, grouped by kategori' },
            { icon: '✨', label: 'Rekod Dipecah', desc: 'Rekod baharu yang ditetapkan dalam kejohanan ini' },
            { icon: '🎖️', label: 'Atlet Terbaik', desc: 'Senarai atlet terbaik yang ditetapkan dalam tab Atlet Terbaik' },
          ].map(({ icon, label, desc }) => (
            <div key={label} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
              <span className="text-base w-6 text-center shrink-0">{icon}</span>
              <div>
                <p className="text-xs font-semibold text-gray-700">{label}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Preview data */}
      {preview && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-xs font-bold text-blue-700 mb-2">Data Dimuatkan</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'Sekolah',       val: preview.jumlahSekolah },
              { label: 'Acara',         val: preview.jumlahAcara },
              { label: 'Atlet Daftar',  val: preview.jumlahAtlet },
              { label: 'Acara Rasmi',   val: preview.jumlahRasmi },
              { label: 'Rekod Aktif',   val: preview.jumlahRekod },
              { label: 'Rekod Pecah',   val: preview.jumlahRekodPecah },
              { label: 'Medal Tally',    val: preview.jumlahTally },
              { label: 'Atlet Terbaik', val: preview.jumlahAtletTerbaik },
            ].map(({ label, val }) => (
              <div key={label} className="bg-white rounded-lg py-2 border border-blue-100">
                <p className="text-lg font-black text-[#003399]">{val}</p>
                <p className="text-[9px] text-gray-500">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mesej */}
      {msg && (
        <div className={`px-4 py-3 rounded-lg text-xs font-medium border ${
          msg.type === 'ok'
            ? 'bg-green-50 text-green-700 border-green-200'
            : 'bg-red-50 text-red-700 border-red-200'
        }`}>
          {msg.text}
        </div>
      )}

      {/* Progress */}
      {loading && progress && (
        <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
          <svg className="w-4 h-4 animate-spin text-[#003399] shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          {progress}
        </div>
      )}

      {/* Butang Jana */}
      <button
        onClick={handleJana}
        disabled={loading}
        className="w-full py-3 bg-[#003399] hover:bg-[#002280] disabled:bg-gray-300 text-white font-bold text-sm rounded-xl shadow-sm transition-colors"
      >
        {loading ? 'Menjana PDF…' : '📥  Jana Buku Kejohanan PDF'}
      </button>

      {/* Nota */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[10px] text-amber-700 space-y-0.5">
        <p className="font-bold">Nota:</p>
        <p>· Hanya acara dengan status RASMI akan muncul dalam bahagian Keputusan.</p>
        <p>· Medal Tally dan Rekod Dipecah dikira dari data semasa dalam sistem.</p>
        <p>· PDF mengambil masa 5–20 saat bergantung jumlah acara rasmi.</p>
      </div>
    </div>
  )
}
