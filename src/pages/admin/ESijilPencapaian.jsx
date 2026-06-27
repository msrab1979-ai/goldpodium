/**
 * ESijilPencapaian — /dashboard/esijil-pencapaian
 *
 * Admin setup template Sijil Pencapaian:
 *   - Muat naik template PNG/JPG
 *   - Seret 5 item (Nama, Sekolah, Acara, Kedudukan, Tarikh) ke posisi
 *   - Set had kedudukan (1-10, default 5)
 *   - Simpan ke tetapan/sijilPencapaian
 *
 * Pattern ikut ESijil.jsx (Sijil Penyertaan) — TIDAK kongsi state/data.
 */

import { useState, useEffect, useRef } from 'react'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import jsPDF from 'jspdf'
import { labelKedudukan, janaSijilPencapaianPDF } from '../../utils/sijilPencapaianUtils'

// ─── Constants ────────────────────────────────────────────────────────────────

const FIELDS = [
  { key: 'nama',      label: 'Nama Atlet',     color: '#2563eb', dummy: 'NOR AINA BINTI ALI' },
  { key: 'kedudukan', label: 'Kedudukan',      color: '#9333ea', dummy: 'JOHAN' },
  { key: 'acara',     label: 'Acara',          color: '#ea580c', dummy: '( REJAM LEMBING - PEREMPUAN 15 TAHUN )' },
  { key: 'kejohanan', label: 'Nama Kejohanan', color: '#16a34a', dummy: 'KEJOHANAN OLAHRAGA MSSD KEMAMAN TAHUN 2026' },
  { key: 'tarikh',    label: 'Tarikh',         color: '#dc2626', dummy: '21 hingga 25 Jun 2026' },
  { key: 'tempat',    label: 'Tempat',         color: '#92400e', dummy: 'SMK Sultan Ismail' },
]

const DEFAULT_STYLE = { size: 24, warna: '#000000', bold: true, align: 'center' }
const DEFAULT_POS   = {
  nama:      { x: 50, y: 30 },
  kedudukan: { x: 50, y: 38 },
  acara:     { x: 50, y: 44 },
  kejohanan: { x: 50, y: 54 },
  tarikh:    { x: 50, y: 62 },
  tempat:    { x: 50, y: 70 },
}
const DEFAULT_STYLES = {
  nama:      { ...DEFAULT_STYLE, size: 28 },
  kedudukan: { ...DEFAULT_STYLE, size: 26, warna: '#c2410c' },
  acara:     { ...DEFAULT_STYLE, size: 18, warna: '#c2410c' },
  kejohanan: { ...DEFAULT_STYLE, size: 18 },
  tarikh:    { ...DEFAULT_STYLE, size: 14, bold: false },
  tempat:    { ...DEFAULT_STYLE, size: 16, warna: '#c2410c' },
}

const inputCls = 'border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none ' +
  'focus:ring-1 focus:ring-[#003399] focus:border-[#003399] bg-white'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function kompresGambar(dataUrl) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const MAX = 1400
      let w = img.width, h = img.height
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.src = dataUrl
  })
}

function SectionTitle({ n, title, desc }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <span className="w-6 h-6 rounded-full bg-[#003399] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
        {n}
      </span>
      <div>
        <p className="text-xs font-bold text-gray-800">{title}</p>
        {desc && <p className="text-[11px] text-gray-400 mt-0.5">{desc}</p>}
      </div>
    </div>
  )
}

function StylePanel({ label, style, onChange }) {
  function set(k, v) { onChange({ ...style, [k]: v }) }
  return (
    <div className="border border-gray-100 rounded-lg p-3 bg-gray-50">
      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2.5">{label}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <p className="text-[10px] text-gray-500 mb-1">Saiz Font (pt)</p>
          <input type="number" min="8" max="80" value={style.size}
            onChange={e => set('size', +e.target.value)}
            className={inputCls + ' w-full'} />
        </div>
        <div>
          <p className="text-[10px] text-gray-500 mb-1">Warna</p>
          <input type="color" value={style.warna}
            onChange={e => set('warna', e.target.value)}
            className="w-full h-[30px] rounded border border-gray-200 cursor-pointer" />
        </div>
        <div>
          <p className="text-[10px] text-gray-500 mb-1">Penjajaran</p>
          <select value={style.align} onChange={e => set('align', e.target.value)}
            className={inputCls + ' w-full'}>
            <option value="left">Kiri</option>
            <option value="center">Tengah</option>
            <option value="right">Kanan</option>
          </select>
        </div>
        <div>
          <p className="text-[10px] text-gray-500 mb-1">Tebal</p>
          <button
            onClick={() => set('bold', !style.bold)}
            className={`w-full py-1.5 rounded text-xs font-bold border transition-colors ${
              style.bold
                ? 'bg-[#003399] text-white border-[#003399]'
                : 'bg-white text-gray-600 border-gray-200'
            }`}
          >
            {style.bold ? 'Ya' : 'Tidak'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── DraggableLabel ────────────────────────────────────────────────────────────

function DraggableLabel({ fieldCfg, pos, style, sampleText, containerRef, onPosChange }) {
  const [dragging, setDragging] = useState(false)
  const start = useRef(null)

  function onMouseDown(e) {
    e.preventDefault()
    const cont = containerRef.current
    if (!cont) return
    const rect = cont.getBoundingClientRect()
    start.current = {
      mx: e.clientX, my: e.clientY,
      sx: pos.x,     sy: pos.y,
      rw: rect.width, rh: rect.height,
    }
    setDragging(true)
  }

  function onTouchStart(e) {
    const t = e.touches[0]
    const cont = containerRef.current
    if (!cont) return
    const rect = cont.getBoundingClientRect()
    start.current = {
      mx: t.clientX, my: t.clientY,
      sx: pos.x,     sy: pos.y,
      rw: rect.width, rh: rect.height,
    }
    setDragging(true)
  }

  useEffect(() => {
    if (!dragging) return

    function move(clientX, clientY) {
      if (!start.current) return
      const { mx, my, sx, sy, rw, rh } = start.current
      const nx = Math.max(0, Math.min(100, sx + (clientX - mx) / rw * 100))
      const ny = Math.max(0, Math.min(100, sy + (clientY - my) / rh * 100))
      onPosChange({ x: +nx.toFixed(2), y: +ny.toFixed(2) })
    }

    function onMouseMove(e) { move(e.clientX, e.clientY) }
    function onTouchMove(e) { e.preventDefault(); move(e.touches[0].clientX, e.touches[0].clientY) }
    function onUp() { setDragging(false) }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [dragging])

  const previewSize = Math.max(8, (style.size || 24) * 0.45)
  const translateX  = style.align === 'center' ? '-50%'
                    : style.align === 'right'  ? '-100%' : '0%'

  return (
    <div
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      style={{
        position:   'absolute',
        left:       `${pos.x}%`,
        top:        `${pos.y}%`,
        transform:  `translateX(${translateX}) translateY(-50%)`,
        cursor:     dragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        fontSize:   `${previewSize}px`,
        fontWeight: style.bold ? 'bold' : 'normal',
        color:      style.warna || '#000000',
        textAlign:  style.align || 'center',
        whiteSpace: 'nowrap',
        background: 'rgba(255,255,255,0.78)',
        border:     `2px solid ${fieldCfg.color}`,
        borderRadius: '3px',
        padding:    '1px 6px',
        boxShadow:  dragging
          ? `0 4px 16px rgba(0,0,0,0.25), 0 0 0 3px ${fieldCfg.color}40`
          : '0 1px 4px rgba(0,0,0,0.18)',
        zIndex:     dragging ? 20 : 10,
        transition: dragging ? 'none' : 'box-shadow 0.15s',
      }}
    >
      {sampleText}
      <span style={{
        position: 'absolute', top: -5, right: -5,
        width: 10, height: 10, borderRadius: '50%',
        background: fieldCfg.color, border: '2px solid white',
      }} />
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function ESijilPencapaian() {
  const { userData } = useAuth()
  const schoolId = userData?.schoolId || ''
  const [aktif, setAktif]                 = useState(true)  // default ON
  const [template, setTemplate]           = useState(null)
  const [namaKejohanan, setNamaKejohanan] = useState('')
  const [tarikhKejohanan, setTarikh]      = useState('')
  const [tempatKejohanan, setTempatKej]   = useState([''])  // array of strings (dinamik)
  const [hadKedudukan, setHadKedudukan]   = useState(5)
  const [positions, setPositions]         = useState({ ...DEFAULT_POS })
  const [styles, setStyles]               = useState({ ...DEFAULT_STYLES })
  const [saving, setSaving]               = useState(false)
  const [msg, setMsg]                     = useState('')
  const [uploading, setUploading]         = useState(false)
  const containerRef                      = useRef(null)

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDoc(doc(db, 'tenants', schoolId, 'tetapan', 'sijilPencapaian'))
        if (!snap.exists()) return
        const d = snap.data()
        if (typeof d.aktif === 'boolean') setAktif(d.aktif)
        if (d.templateImg)      setTemplate(d.templateImg)
        if (d.namaKejohanan)    setNamaKejohanan(d.namaKejohanan)
        if (d.tarikhKejohanan)  setTarikh(d.tarikhKejohanan)
        if (Array.isArray(d.tempatKejohanan) && d.tempatKejohanan.length > 0) {
          setTempatKej(d.tempatKejohanan)
        }
        if (typeof d.hadKedudukan === 'number') setHadKedudukan(d.hadKedudukan)
        if (d.posisi) {
          setPositions({
            nama:      d.posisi.nama      || DEFAULT_POS.nama,
            kedudukan: d.posisi.kedudukan || DEFAULT_POS.kedudukan,
            acara:     d.posisi.acara     || DEFAULT_POS.acara,
            kejohanan: d.posisi.kejohanan || DEFAULT_POS.kejohanan,
            tarikh:    d.posisi.tarikh    || DEFAULT_POS.tarikh,
            tempat:    d.posisi.tempat    || DEFAULT_POS.tempat,
          })
        }
        if (d.style) {
          setStyles({
            nama:      { ...DEFAULT_STYLES.nama,      ...(d.style.nama      || {}) },
            kedudukan: { ...DEFAULT_STYLES.kedudukan, ...(d.style.kedudukan || {}) },
            acara:     { ...DEFAULT_STYLES.acara,     ...(d.style.acara     || {}) },
            kejohanan: { ...DEFAULT_STYLES.kejohanan, ...(d.style.kejohanan || {}) },
            tarikh:    { ...DEFAULT_STYLES.tarikh,    ...(d.style.tarikh    || {}) },
            tempat:    { ...DEFAULT_STYLES.tempat,    ...(d.style.tempat    || {}) },
          })
        }
      } catch {}
    }
    load()
  }, [])

  // ── Tempat handler (dinamik) ─────────────────────────────────────────────
  function setTempatBaris(i, val) {
    setTempatKej(prev => prev.map((t, idx) => idx === i ? val : t))
  }
  function tambahTempat() {
    setTempatKej(prev => prev.length < 5 ? [...prev, ''] : prev)
  }
  function buangTempat(i) {
    setTempatKej(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev)
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    setUploading(true)
    const reader = new FileReader()
    reader.onload = async ev => {
      const compressed = await kompresGambar(ev.target.result)
      setTemplate(compressed)
      setPositions({ ...DEFAULT_POS })
      setUploading(false)
    }
    reader.readAsDataURL(file)
  }

  function setPos(key, val) {
    setPositions(prev => ({ ...prev, [key]: val }))
  }
  function setStyleFor(key, val) {
    setStyles(prev => ({ ...prev, [key]: val }))
  }

  async function handleSave() {
    // Toggle OFF? Boleh Simpan walaupun template belum upload.
    // Toggle ON tapi tiada template? Tak boleh — kerana PP tak boleh jana sijil.
    if (aktif && !template) { setMsg('Sila muat naik template dahulu untuk mengaktifkan.'); return }
    setSaving(true); setMsg('')
    try {
      const tempatBersih = tempatKejohanan.map(t => t.trim()).filter(Boolean)
      await setDoc(doc(db, 'tenants', schoolId, 'tetapan', 'sijilPencapaian'), {
        aktif:           !!aktif,
        templateImg:     template || null,
        namaKejohanan,
        tarikhKejohanan,
        tempatKejohanan: tempatBersih,
        hadKedudukan:    Number(hadKedudukan) || 5,
        posisi:          positions,
        style:           styles,
        updatedAt:       serverTimestamp(),
      }, { merge: true })
      setMsg('Tetapan berjaya disimpan.')
    } catch (err) {
      setMsg('Ralat: ' + err.message)
    }
    setSaving(false)
  }

  function handlePreview() {
    if (!template) { setMsg('Sila muat naik template dahulu.'); return }
    const tempatBersih = tempatKejohanan.map(t => t.trim()).filter(Boolean)
    const cfg = {
      templateImg: template,
      namaKejohanan,
      tarikhKejohanan,
      tempatKejohanan: tempatBersih,
      posisi: positions,
      style: styles,
    }
    const pdf = janaSijilPencapaianPDF({
      namaAtlet:  FIELDS[0].dummy,
      namaAcara:  FIELDS[2].dummy,
      rank:       1,
    }, cfg)
    pdf.output('dataurlnewwindow')
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-base font-bold text-gray-800">Sijil Pencapaian</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Tetapkan template sijil untuk atlet yang dapat tempat 1 hingga {hadKedudukan}. Pengurus pasukan boleh muat turun sijil murid sekolah masing-masing selepas tetapan disimpan.
        </p>
      </div>

      <div className="space-y-5">

        {/* ── 1: Upload Template ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <SectionTitle n="1" title="Muat Naik Template Sijil"
            desc="Format PNG / JPG. Reka bentuk di Canva, export PNG, muat naik di sini." />
          <div className="flex items-center gap-3">
            <label className="cursor-pointer">
              <div className="flex items-center gap-2 px-4 py-2 bg-[#003399] text-white rounded-lg text-xs font-semibold hover:bg-[#002288] transition-colors">
                {uploading
                  ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  : <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                }
                {uploading ? 'Memproses...' : template ? 'Tukar Template' : 'Muat Naik Template'}
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
            {template && (
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                Template dimuat naik
              </span>
            )}
          </div>
        </div>

        {/* ── 2: Tetapan Asas ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <SectionTitle n="2" title="Tetapan Asas"
            desc="Had Kedudukan = bilangan tempat yang layak dapat sijil pencapaian." />

          {/* ── Toggle Aktif ── */}
          <div className={`mb-4 rounded-xl border-2 p-4 transition-colors ${
            aktif
              ? 'border-green-300 bg-green-50'
              : 'border-gray-200 bg-gray-50'
          }`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs font-bold text-gray-800">Status Sijil Pencapaian</p>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    aktif ? 'bg-green-500 text-white' : 'bg-gray-400 text-white'
                  }`}>
                    {aktif ? 'AKTIF' : 'TIDAK AKTIF'}
                  </span>
                </div>
                <p className="text-[11px] text-gray-600">
                  {aktif
                    ? 'Pengurus Pasukan boleh nampak menu & muat turun sijil murid.'
                    : 'Menu Sijil Pencapaian DISEMBUNYIKAN dari Pengurus Pasukan. PP yang akses URL langsung akan diredirect.'
                  }
                </p>
                <p className="text-[10px] text-gray-400 mt-1">
                  Tukar status, kemudian klik <strong>Simpan Tetapan</strong> di bawah.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAktif(prev => !prev)}
                className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${
                  aktif ? 'bg-green-500' : 'bg-gray-300'
                }`}
                aria-label="Toggle aktif"
              >
                <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-all ${
                  aktif ? 'left-[22px]' : 'left-0.5'
                }`} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
            <div className="sm:col-span-2">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Nama Kejohanan</p>
              <input
                type="text"
                value={namaKejohanan}
                onChange={e => setNamaKejohanan(e.target.value)}
                placeholder="Contoh: Kejohanan Olahraga MSSD Kemaman 2026"
                className={inputCls + ' w-full'}
              />
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Had Kedudukan</p>
              <select
                value={hadKedudukan}
                onChange={e => setHadKedudukan(Number(e.target.value))}
                className={inputCls + ' w-full'}
              >
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                  <option key={n} value={n}>Tempat 1 – {n}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-3">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Tarikh Kejohanan</p>
              <input
                type="text"
                value={tarikhKejohanan}
                onChange={e => setTarikh(e.target.value)}
                placeholder="Contoh: 21 hingga 25 Jun 2026"
                className={inputCls + ' w-full'}
              />
            </div>
            <div className="sm:col-span-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Tempat Kejohanan (Multi-baris)</p>
                <button
                  type="button"
                  onClick={tambahTempat}
                  disabled={tempatKejohanan.length >= 5}
                  className="text-[10px] font-bold text-[#003399] hover:text-[#002288] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  + Tambah Baris
                </button>
              </div>
              <div className="space-y-1.5">
                {tempatKejohanan.map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 font-mono w-4 shrink-0">{i + 1}</span>
                    <input
                      type="text"
                      value={t}
                      onChange={e => setTempatBaris(i, e.target.value)}
                      placeholder={`Contoh: SMK Sultan Ismail`}
                      className={inputCls + ' flex-1'}
                    />
                    <button
                      type="button"
                      onClick={() => buangTempat(i)}
                      disabled={tempatKejohanan.length <= 1}
                      className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Buang baris"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Maksimum 5 baris. Akan dilukis terus menegak dalam sijil PDF.</p>
            </div>
          </div>
        </div>

        {/* ── 3: Drag & Drop Kedudukan ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <SectionTitle n="3" title="Tetapkan Kedudukan Teks"
            desc="Seret 5 teks pada template ke kedudukan yang dikehendaki." />

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mb-3">
            {FIELDS.map(f => (
              <div key={f.key} className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm border-2" style={{ borderColor: f.color, background: f.color + '20' }} />
                <span className="text-[11px] text-gray-600 font-medium">{f.label}</span>
              </div>
            ))}
          </div>

          {template ? (
            <div
              ref={containerRef}
              className="relative inline-block w-full max-w-xs select-none"
              style={{ touchAction: 'none' }}
            >
              <img
                src={template}
                alt="Template Sijil Pencapaian"
                className="w-full rounded-lg border-2 border-gray-200 block"
                draggable={false}
              />

              {FIELDS.map(f => {
                let sample = f.dummy
                if (f.key === 'kedudukan')      sample = labelKedudukan(1)
                else if (f.key === 'tarikh')    sample = tarikhKejohanan || f.dummy
                else if (f.key === 'kejohanan') sample = namaKejohanan   || f.dummy
                else if (f.key === 'tempat') {
                  const t1 = tempatKejohanan[0]?.trim()
                  sample = t1 || f.dummy
                }
                return (
                  <DraggableLabel
                    key={f.key}
                    fieldCfg={f}
                    pos={positions[f.key]}
                    style={styles[f.key]}
                    sampleText={sample}
                    containerRef={containerRef}
                    onPosChange={val => setPos(f.key, val)}
                  />
                )
              })}
            </div>
          ) : (
            <div className="w-full max-w-xs aspect-[210/297] bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center">
              <p className="text-xs text-gray-400">Muat naik template dahulu</p>
            </div>
          )}

          {template && (
            <div className="mt-3 flex flex-wrap gap-3">
              {FIELDS.map(f => (
                <div key={f.key} className="text-[10px] text-gray-400">
                  <span className="font-semibold" style={{ color: f.color }}>{f.label}:</span>{' '}
                  x={positions[f.key]?.x.toFixed(1)}%, y={positions[f.key]?.y.toFixed(1)}%
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 4: Gaya Teks ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <SectionTitle n="4" title="Gaya Teks"
            desc="Saiz, warna dan penjajaran. Perubahan akan kelihatan pada label dalam preview di atas." />
          <div className="space-y-3">
            {FIELDS.map(f => (
              <StylePanel
                key={f.key}
                label={f.label}
                style={styles[f.key]}
                onChange={val => setStyleFor(f.key, val)}
              />
            ))}
          </div>
        </div>

        {/* ── 5: Preview & Simpan ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <SectionTitle n="5" title="Preview & Simpan"
            desc="Preview buka PDF dengan data contoh (Tempat Pertama)." />
          <div className="flex flex-wrap gap-3 items-center">
            <button
              onClick={handlePreview}
              disabled={!template}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-200 transition-colors disabled:opacity-40"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
              </svg>
              Preview PDF
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !template}
              className="flex items-center gap-2 px-5 py-2 bg-[#003399] text-white rounded-lg text-xs font-semibold hover:bg-[#002288] transition-colors disabled:opacity-50"
            >
              {saving
                ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                : <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
              }
              {saving ? 'Menyimpan...' : 'Simpan Tetapan'}
            </button>
            {msg && (
              <span className={`text-xs font-medium ${msg.startsWith('Ralat') ? 'text-red-500' : 'text-green-600'}`}>
                {msg}
              </span>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
