/**
 * AcaraSetup — /dashboard/acara
 *
 * Pengurusan acara per kejohanan.
 * Acara disimpan dalam sub-collection: kejohanan/{id}/acara/{aceraId}
 *
 * 5 Jenis Acara (standard MSSM/WA):
 *   lorong       — 100m, 200m, 400m (ada lorong + heat)
 *   mass_start   — 800m, 1500m, 3000m (tiada lorong tetap)
 *   padang_lompat— Lompat jauh, tinggi, kijang (giliran, cubaan)
 *   padang_balin — Peluru, cakera, lembing, tukul (giliran, cubaan)
 *   relay        — 4x100m, 4x400m (pasukan, 4 atlet)
 *
 * aceraId format: ACR-[KODACARA]-[JANTINA]-[KATEGORI]
 * Contoh: ACR-100M-L-A, ACR-LOMPAT_JAUH-P-B
 */

import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc,
  serverTimestamp, query, orderBy, where, writeBatch, getDoc,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { TetapanFinal } from './KategoriSetup'

// ─── Gold Podium helpers ──────────────────────────────────────────────────────

function getKejContext() {
  try {
    const raw = sessionStorage.getItem('gp_kej_aktif')
    if (!raw) return {}
    return JSON.parse(raw)
  } catch { return {} }
}

function acaraColPath(sId, kId) { return `tenants/${sId}/kejohanan/${kId}/acara` }
function katColPath(sId, kId)   { return `tenants/${sId}/kejohanan/${kId}/kategori` }
function slotColPath(sId, kId)  { return `tenants/${sId}/kejohanan/${kId}/jadualKhas` }
function waDocPath(sId, kId)    { return [`tenants/${sId}/kejohanan/${kId}/tetapan`, 'waConfig'] }

// ─── Konstanta ────────────────────────────────────────────────────────────────

const JENIS_ACARA = [
  {
    value: 'lorong',
    label: 'Larian Lorong',
    short: 'Lorong',
    contoh: '100m, 200m, 400m, 110mH',
    unit: 's',
    adaLorong: true,
    adaHeat: true,
    color: 'bg-blue-500',
    lightColor: 'bg-blue-50 border-blue-200 text-blue-700',
  },
  {
    value: 'mass_start',
    label: 'Larian Mass Start',
    short: 'Mass Start',
    contoh: '800m, 1500m, 3000m, 5000m',
    unit: 's',
    adaLorong: false,
    adaHeat: true,
    color: 'bg-cyan-500',
    lightColor: 'bg-cyan-50 border-cyan-200 text-cyan-700',
  },
  {
    value: 'padang_lompat',
    label: 'Padang — Melompat',
    short: 'Lompat',
    contoh: 'Lompat Jauh, Lompat Tinggi, Lompat Kijang',
    unit: 'm',
    adaLorong: false,
    adaHeat: false,
    color: 'bg-green-500',
    lightColor: 'bg-green-50 border-green-200 text-green-700',
  },
  {
    value: 'padang_balin',
    label: 'Padang — Membaling',
    short: 'Balin',
    contoh: 'Peluru, Cakera, Lembing, Tukul',
    unit: 'm',
    adaLorong: false,
    adaHeat: false,
    color: 'bg-orange-500',
    lightColor: 'bg-orange-50 border-orange-200 text-orange-700',
  },
  {
    value: 'relay',
    label: 'Relay / Berkumpulan',
    short: 'Relay',
    contoh: '4×100m, 4×400m',
    unit: 's',
    adaLorong: true,
    adaHeat: true,
    color: 'bg-purple-500',
    lightColor: 'bg-purple-50 border-purple-200 text-purple-700',
  },
]

const JANTINA_OPTIONS = [
  { value: 'L', label: 'Lelaki' },
  { value: 'P', label: 'Perempuan' },
]

const CARA_FINAL_OPTIONS = [
  { value: 'hybrid',    label: 'Hybrid', desc: 'Top 1 setiap heat + wildcard best time — STANDARD KOAM' },
  { value: 'best_time', label: 'Best Time', desc: 'Rank semua masa gabungan, top N masuk' },
  { value: 'best_heat', label: 'Best Heat', desc: 'Top N dari setiap heat' },
]

// ─── Kumpulan Lorong WA (8 lorong) ───────────────────────────────────────────
// Untuk final sahaja — heat guna random draw biasa
// Rank disusun ikut prestasi terbaik dulu, kemudian undian rawak DALAM kumpulan

const WA_LORONG_KUMPULAN_DEFAULT = {
  lurus:     { label: 'Lurus (100m, Berpagar 100m/110m)',              kumpulan: [[3,4,5,6],[2,7],[1,8]] },
  dua_ratus: { label: '200m',                                          kumpulan: [[5,6,7],[3,4,8],[1,2]] },
  selekoh:   { label: 'Selekoh (400m+, Berpagar 400m, Semua Relay)',   kumpulan: [[4,5,6,7],[3,8],[1,2]] },
}

// Urutan lorong dikosongkan apabila atlet < bilanganLorong (untuk heat/saringan)
const WA_LORONG_HEAT_REMOVE_DEFAULT = {
  lurus:       { label: 'Lurus (100m, Berpagar)',   remove: [1,8,2,7,3,6,4,5] },
  dua_ratus:   { label: '200m',                     remove: [1,2,8,4,3,5,6,7] },
  selekoh:     { label: 'Selekoh (400m, Relay)',    remove: [1,2,8,3,4,5,6,7] },
  selekoh_800: { label: '800m',                     remove: [1,2,8,7,3,4,5,6] },
}

const WA_CONFIG_DEFAULT = {
  windLimit: 2.0,
  falseStartRule: 'one',
  timeSystem: 'electronic',
  handTimeAdjustSprint: 0.24,
  handTimeAdjustOther: 0.14,
  cubaan: { peringkatAwal: 3, peringkatAkhir: 3, topFinalis: 8 },
  lorongStandard: 8,
  lorongKumpulan: {
    lurus:     [[3,4,5,6],[2,7],[1,8]],
    dua_ratus: [[5,6,7],[3,4,8],[1,2]],
    selekoh:   [[4,5,6,7],[3,8],[1,2]],
  },
  lorongHeatRemove: {
    lurus:       [1,8,2,7,3,6,4,5],
    dua_ratus:   [1,2,8,4,3,5,6,7],
    selekoh:     [1,2,8,3,4,5,6,7],
    selekoh_800: [1,2,8,7,3,4,5,6],
  },
  caraPilihFinal: 'hybrid',
  wildcardSlot: 2,
  bilHeatSukuAkhir: 2,
}

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-[#003399]/25 focus:border-[#003399] bg-gray-50'

// ─── Auto-detect helpers ──────────────────────────────────────────────────────

function detectJenisFromNama(nama) {
  const n = nama.toLowerCase()
  if (/\d\s*x\s*\d|4\s*x/.test(n)) return 'relay'
  if (/jalan kaki|3000|5000|1500|800/.test(n)) return 'mass_start'
  if (/lompat jauh|lompat kijang|lompat tinggi/.test(n)) return 'padang_lompat'
  if (/lontar|lempar|rejam|peluru|cakera|lembing/.test(n)) return 'padang_balin'
  return 'lorong'
}

/** Auto-detect jenisLorong dari nama acara */
function detectJenisLorongFromNama(nama) {
  const n = (nama || '').toLowerCase()
  // Relay semua selekoh — start stagger (4x100m, 4x200m, 4x400m)
  if (/\d\s*x\s*\d|relay/.test(n)) return 'selekoh'
  if (/\b200\s*m/.test(n)) return 'dua_ratus'
  if (/\b400|\b800|\b1500|\b3000|\b5000/.test(n)) return 'selekoh'
  return 'lurus' // 100m, 100mH, 110mH
}
function detectWindFromNama(nama) {
  const n = nama.toLowerCase()
  return /100\s*m|200\s*m|lompat jauh|lompat kijang/.test(n)
}

// ─── HariHeader — header hari dengan inline tukar tarikh ─────────────────────

function HariHeader({ hIdx, tarikh, hariLabel, count, onTukar }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(tarikh)
  const [saving, setSaving]   = useState(false)
  const inputRef              = React.useRef()

  function startEdit() { setVal(tarikh); setEditing(true) }
  function cancel()    { setEditing(false) }

  async function save() {
    if (!val || val === tarikh) return cancel()
    setSaving(true)
    await onTukar(val)
    setSaving(false)
    setEditing(false)
  }

  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus() }, [editing])

  return (
    <div className="px-4 py-2.5 bg-[#003399] flex items-center gap-3">
      <span className="text-[10px] font-black text-blue-200 uppercase tracking-widest shrink-0">
        Hari {hIdx + 1}
      </span>

      {editing ? (
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="date"
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
            className="text-xs font-bold bg-white text-gray-800 rounded-lg px-2 py-1 border-0 focus:outline-none focus:ring-2 focus:ring-white/50"
          />
          <button onClick={save} disabled={saving}
            className="text-[10px] font-bold bg-white text-[#003399] px-2.5 py-1 rounded-lg hover:bg-blue-50 disabled:opacity-50 shrink-0">
            {saving ? '…' : 'Simpan'}
          </button>
          <button onClick={cancel}
            className="text-[10px] font-semibold text-blue-200 hover:text-white">
            Batal
          </button>
        </div>
      ) : (
        <button onClick={startEdit}
          className="flex items-center gap-1.5 group hover:opacity-80 transition-opacity">
          <span className="text-xs font-bold text-white">{hariLabel}</span>
          <svg className="w-3 h-3 text-blue-300 group-hover:text-white transition-colors" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
      )}

      <span className="ml-auto text-[10px] text-blue-200 shrink-0">{count} acara</span>
    </div>
  )
}

// ─── EditAcaraRow — inline edit untuk baris sedia ada ────────────────────────

function EditAcaraRow({ acara, schoolId, kejId, kategoriList, acaraList, onSaved, onCancel }) {
  const kejohananId = kejId // backward compat alias
  const peringkatMode0 = acara.peringkat === 'saringan'       ? 'saringan'
    : acara.peringkat === 'suku_akhir'    ? 'suku_akhir'
    : acara.peringkat === 'separuh_akhir' ? 'separuh_akhir'
    : acara.parentAcaraId ? 'final_p' : 'akhir'

  const [form, setForm] = useState({
    masa:              acara.masa              || '',
    namaAcaraPendek:   acara.namaAcaraPendek   || '',
    kategoriKod:       acara.kategoriKod       || '',
    jantina:           acara.jantina           || 'L',
    jenisAcara:        acara.jenisAcara        || 'lorong',
    lokasi:            acara.lokasi            || 'Trek Utama',
    hadAtletPerSekolah: acara.hadAtletPerSekolah || 2,
    peringkatMode:     peringkatMode0,
    parentAcaraId:     acara.parentAcaraId     || '',
    adaHandTiming:     acara.adaHandTiming     || false,
    isIndividu:        acara.isIndividu ?? (acara.jenisAcara !== 'relay'),
  })
  const [saving, setSaving]             = useState(false)
  const [err, setErr]                   = useState('')
  const [isTerbuka, setIsTerbuka]       = useState(acara.isTerbuka || false)
  const [katTerbuka, setKatTerbuka]     = useState(acara.kategoriTerbuka || [])
  const toggleKatTerbuka = React.useCallback((kod) => {
    setKatTerbuka(prev => prev.includes(kod) ? prev.filter(x => x !== kod) : [...prev, kod])
  }, [])

  // ── Tambah Final Serentak (untuk saringan yg dah ada) ────────────────────────
  const [withFinal,   setWithFinal]   = useState(false)
  const [finalNo,     setFinalNo]     = useState('')
  const [finalMasa,   setFinalMasa]   = useState('')
  const [finalTarikh, setFinalTarikh] = useState(acara.tarikhAcara || '')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const selectedKat = kategoriList.find(k => k.kod === form.kategoriKod)
  const kelas       = form.kategoriKod
    ? (selectedKat?.label || (selectedKat?.umurHad ? `${form.jantina} Bwh ${selectedKat.umurHad}` : `${form.jantina} ${form.kategoriKod}`))
    : form.jantina
  const namaFull    = `${form.namaAcaraPendek} ${kelas}`.trim()
  const isPadang    = ['padang_lompat', 'padang_balin'].includes(form.jenisAcara)
  const PERINGKAT_DENGAN_HEAT = ['saringan', 'suku_akhir', 'separuh_akhir']
  const peringkat   = PERINGKAT_DENGAN_HEAT.includes(form.peringkatMode) ? form.peringkatMode : 'akhir'
  const parentId    = ['final_p', 'separuh_akhir'].includes(form.peringkatMode) ? form.parentAcaraId.trim() : ''

  // Parent yang layak — filter ikut peringkat + kategori + jantina
  // SF mesti pilih QF (suku_akhir) | Final mesti pilih SF (separuh_akhir) atau Saringan
  const PARENT_PERINGKAT = {
    separuh_akhir: ['suku_akhir', 'saringan'],
    final_p:       ['separuh_akhir', 'saringan'],
  }
  const saringanList = acaraList.filter(a => {
    if (String(a.noAcara) === String(acara.noAcara)) return false
    const allowed = PARENT_PERINGKAT[form.peringkatMode] || []
    if (!allowed.includes(a.peringkat)) return false
    // filter kategori + jantina — sama dahulukan, tapi jangan buang jika tiada
    if (form.kategoriKod && a.kategoriKod && a.kategoriKod !== 'TERBUKA') {
      if (a.kategoriKod !== form.kategoriKod) return false
    }
    if (form.jantina && a.jantina && a.jantina !== 'C') {
      if (a.jantina !== form.jantina) return false
    }
    return true
  })

  // Semak sama ada final sudah wujud untuk saringan ini
  const thisNo = String(acara.noAcara || acara.aceraId || acara.id)
  const existingFinal = acaraList.find(a => String(a.parentAcaraId) === thisNo)

  function suggestFinalNo() {
    const allNos = acaraList.map(a => Number(a.noAcara)).filter(n => !isNaN(n) && n > 0)
    return allNos.length ? String(Math.max(...allNos) + 1) : ''
  }

  // next peringkat dalam chain: saringan→akhir, suku_akhir→separuh_akhir, separuh_akhir→akhir
  const NEXT_PERINGKAT = { saringan: 'akhir', suku_akhir: 'separuh_akhir', separuh_akhir: 'akhir' }
  const NEXT_LABEL     = { saringan: 'Final', suku_akhir: 'Separuh Akhir', separuh_akhir: 'Final' }
  const adaNextPanel   = PERINGKAT_DENGAN_HEAT.includes(form.peringkatMode)
  const nextAdaHeat    = form.peringkatMode === 'suku_akhir' // SF ada heat, Final tiada

  async function createNextAcara(thisId) {
    if (!withFinal || !finalNo.trim() || !adaNextPanel) return
    const fId       = finalNo.trim()
    const fNamaFull = `${form.namaAcaraPendek.trim()} ${kelas}`.trim()
    const fTarikh   = finalTarikh || acara.tarikhAcara
    const nextPeringkat = NEXT_PERINGKAT[form.peringkatMode]
    const aPath     = acaraColPath(schoolId, kejId)
    await setDoc(doc(db, aPath, fId), {
      noAcara: fId, aceraId: fId,
      namaAcara: fNamaFull, namaAcaraPendek: form.namaAcaraPendek.trim(),
      kelas, jantina: form.jantina, kategoriKod: isTerbuka ? 'TERBUKA' : form.kategoriKod,
      jenisAcara: form.jenisAcara,
      isIndividu: form.isIndividu,
      tarikhAcara: fTarikh, masa: finalMasa || '', lokasi: form.lokasi, sesi: 'Petang',
      peringkat: nextPeringkat, parentAcaraId: thisId,
      adaHeat: nextAdaHeat,
      isWindReading: detectWindFromNama(form.namaAcaraPendek),
      unitUkuran: isPadang ? 'm' : 's',
      bilanganLorong: isPadang ? null : 8,
      bilanganFinalis: 8, bilanganCubaan: isPadang ? 6 : 0,
      hadAtletPerSekolah: Number(form.hadAtletPerSekolah),
      statusAcara: 'akan_datang', isAktif: true,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
  }

  async function handleSave() {
    setErr('')
    if (!form.namaAcaraPendek.trim()) return setErr('Nama wajib')
    if (!form.kategoriKod) return setErr('Kategori wajib')
    if (form.peringkatMode === 'separuh_akhir' && !form.parentAcaraId)
      return setErr('Pilih acara sebelum (QF)')
    setSaving(true)
    try {
      const aPath = acaraColPath(schoolId, kejId)
      const docId = String(acara.noAcara || acara.aceraId || acara.id)
      const updates = {
        namaAcara:         namaFull,
        namaAcaraPendek:   form.namaAcaraPendek.trim(),
        kelas,
        jantina:           form.jantina,
        kategoriKod:       isTerbuka ? 'TERBUKA' : form.kategoriKod,
        jenisAcara:        form.jenisAcara,
        masa:              form.masa,
        lokasi:            form.lokasi,
        peringkat,
        parentAcaraId:     parentId || null,
        adaHeat:           PERINGKAT_DENGAN_HEAT.includes(peringkat),
        isWindReading:     detectWindFromNama(form.namaAcaraPendek),
        unitUkuran:        isPadang ? 'm' : 's',
        hadAtletPerSekolah: Number(form.hadAtletPerSekolah),
        adaHandTiming:     form.adaHandTiming || false,
        isIndividu:        form.isIndividu,
        isTerbuka:         isTerbuka,
        kategoriTerbuka:   isTerbuka ? katTerbuka : [],
        updatedAt:         serverTimestamp(),
      }
      await updateDoc(doc(db, aPath, docId), updates)
      await createNextAcara(docId)
      onSaved({ ...acara, ...updates })
    } catch (e) { setErr(e.message) } finally { setSaving(false) }
  }

  const ic = 'w-full bg-white border border-[#003399]/25 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#003399]/40 focus:border-[#003399]'

  return (
    <>
      <tr className="bg-amber-50/60 border-b border-amber-200/40">
        {/* No — read-only (tukar no = guna modal penuh) */}
        <td className="px-3 py-1.5">
          <span className="font-black text-[#003399] text-xs">{acara.noAcara}</span>
          <p className="text-[8px] text-gray-400 leading-none mt-0.5">tetap</p>
        </td>
        {/* Masa */}
        <td className="px-1.5 py-1.5">
          <input type="time" value={form.masa} onChange={e => set('masa', e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onCancel() }}
            className={ic + ' w-[90px]'} />
        </td>
        {/* Nama */}
        <td className="px-1.5 py-1.5">
          <input type="text" value={form.namaAcaraPendek}
            onChange={e => set('namaAcaraPendek', e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onCancel() }}
            className={ic} />
          {namaFull && namaFull !== form.namaAcaraPendek && (
            <p className="text-[9px] text-[#003399]/70 mt-0.5 truncate font-mono">{namaFull}</p>
          )}
        </td>
        {/* Kategori */}
        <td className="px-1.5 py-1.5">
          {isTerbuka ? (
            <span className="text-[9px] font-bold px-2 py-1 rounded-full bg-orange-100 text-orange-700">Terbuka</span>
          ) : (
            <select value={form.kategoriKod} onChange={e => set('kategoriKod', e.target.value)} className={ic}>
              <option value="">— Kat —</option>
              {kategoriList.map(k => <option key={k.kod} value={k.kod}>{k.label || k.kod}</option>)}
            </select>
          )}
        </td>
        {/* Jantina */}
        <td className="px-1.5 py-1.5">
          <select value={form.jantina} onChange={e => set('jantina', e.target.value)} className={ic + ' w-14'}>
            <option value="L">L</option>
            <option value="P">P</option>
            <option value="Campuran">C</option>
          </select>
        </td>
        {/* Jenis */}
        <td className="px-1.5 py-1.5">
          <select value={form.jenisAcara} onChange={e => set('jenisAcara', e.target.value)} className={ic}>
            {JENIS_ACARA.map(j => <option key={j.value} value={j.value}>{j.short}</option>)}
          </select>
        </td>
        {/* Lokasi */}
        <td className="px-1.5 py-1.5">
          <select value={form.lokasi} onChange={e => set('lokasi', e.target.value)} className={ic}>
            {LOKASI_LIST.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </td>
        {/* Max/Skl */}
        <td className="px-1.5 py-1.5">
          <input type="number" min={1} max={20} value={form.hadAtletPerSekolah}
            onChange={e => set('hadAtletPerSekolah', e.target.value)}
            className={ic + ' w-14 text-center'} />
        </td>
        {/* Peringkat */}
        <td className="px-1.5 py-1.5">
          {peringkatMode0 === 'saringan' ? (
            <span className="text-[10px] text-gray-400 px-1">Saringan</span>
          ) : (
            <select value={form.peringkatMode} onChange={e => { set('peringkatMode', e.target.value); set('parentAcaraId', '') }} className={ic}>
              <option value="akhir">Terus Final</option>
              <option value="suku_akhir">Suku Akhir (QF)</option>
              <option value="separuh_akhir">Separuh Akhir (SF)</option>
              <option value="final_p">Final ←</option>
            </select>
          )}
          {/* Pilih acara sebelum — untuk SF dan Final sahaja (QF = acara pertama, tiada parent) */}
          {['separuh_akhir', 'final_p'].includes(form.peringkatMode) && (
            saringanList.length === 0
              ? <p className="text-[10px] text-red-500 mt-1 bg-red-50 border border-red-200 rounded px-2 py-1">
                  {form.peringkatMode === 'separuh_akhir'
                    ? '⚠ Tiada QF/Saringan untuk kategori ini. Bina dahulu.'
                    : '⚠ Tiada SF/Saringan untuk kategori ini. Bina dahulu.'}
                </p>
              : <select value={form.parentAcaraId} onChange={e => set('parentAcaraId', e.target.value)}
                  className={ic + ' mt-1 text-[10px]'}>
                  <option value="">— Pilih acara sebelum —</option>
                  {saringanList.map(a => (
                    <option key={a.noAcara} value={String(a.noAcara)}>#{a.noAcara} {a.namaAcara}</option>
                  ))}
                </select>
          )}
        </td>
        {/* Jenis Had */}
        <td className="px-1.5 py-1.5">
          <button type="button"
            onClick={() => set('isIndividu', !form.isIndividu)}
            title="Klik untuk tukar Individu/Berpasukan"
            className={`text-[9px] font-bold px-2 py-0.5 rounded-full border transition-all ${
              form.isIndividu
                ? 'bg-blue-50 text-blue-700 border-blue-300'
                : 'bg-purple-50 text-purple-700 border-purple-300'
            }`}>
            {form.isIndividu ? 'Individu' : 'Berpasukan'}
          </button>
        </td>
        {/* Tindakan */}
        <td className="px-1.5 py-1.5">
          <div className="flex gap-1">
            <button onClick={handleSave} disabled={saving} title="Simpan (Enter)"
              className="p-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-40 shrink-0">
              {saving
                ? <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                : <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
              }
            </button>
            <button onClick={onCancel} title="Batal (Esc)"
              className="p-1.5 text-gray-400 hover:text-red-500 border border-gray-200 rounded-lg hover:border-red-300 shrink-0">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </td>
      </tr>
      {/* Panel Acara Terbuka — EditAcaraRow */}
      <tr className="bg-orange-50/60 border-b border-orange-100">
        <td colSpan={10} className="px-3 py-1.5">
          <div className="flex items-start gap-3 flex-wrap">
            <label className="flex items-center gap-1.5 cursor-pointer select-none mt-0.5">
              <button type="button" onClick={() => setIsTerbuka(v => !v)}
                className={`relative inline-flex h-4 w-8 shrink-0 rounded-full transition-colors ${isTerbuka ? 'bg-orange-500' : 'bg-gray-300'}`}>
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform mt-[1px] ${isTerbuka ? 'translate-x-[18px]' : 'translate-x-[1px]'}`} />
              </button>
              <span className="text-[10px] font-bold text-orange-700">Acara Terbuka</span>
            </label>
            {isTerbuka && (
              <div className="mt-1">
                <p className="text-[9px] text-gray-400 mb-1">Kategori layak (klik untuk pilih/buang):</p>
                <div className="flex flex-wrap gap-1">
                  {kategoriList.map(k => {
                    const dipilih = katTerbuka.includes(k.kod)
                    return (
                      <button key={k.kod} type="button"
                        onClick={() => toggleKatTerbuka(k.kod)}
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full border transition-all ${dipilih ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-500 border-gray-300'}`}>
                        {dipilih ? '✓ ' : ''}{k.kod}
                      </button>
                    )
                  })}
                </div>
                {katTerbuka.length === 0 && <p className="text-[9px] text-red-500 mt-1">Pilih sekurang-kurangnya 1 kategori</p>}
              </div>
            )}
          </div>
        </td>
      </tr>
      {/* Panel auto-create acara seterusnya — untuk Saringan, QF, SF */}
      {adaNextPanel && (
        <tr className="bg-purple-50/60 border-b border-purple-100">
          <td colSpan={10} className="px-3 py-2">
            {existingFinal ? (
              <p className="text-[10px] text-purple-600 font-semibold">
                ✓ {NEXT_LABEL[form.peringkatMode]} sudah ada: #{existingFinal.noAcara} — {existingFinal.namaAcara}
              </p>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <button type="button" onClick={() => {
                    const next = !withFinal
                    setWithFinal(next)
                    if (next && !finalNo) setFinalNo(suggestFinalNo())
                    if (next && !finalTarikh) setFinalTarikh(acara.tarikhAcara || '')
                  }} className={`relative inline-flex h-4 w-8 shrink-0 rounded-full transition-colors ${withFinal ? 'bg-purple-600' : 'bg-gray-300'}`}>
                    <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform mt-[1px] ${withFinal ? 'translate-x-[18px]' : 'translate-x-[1px]'}`} />
                  </button>
                  <span className="text-[10px] font-bold text-purple-700">Tambah {NEXT_LABEL[form.peringkatMode]} Serentak</span>
                </label>
                {withFinal && (
                  <>
                    <label className="flex items-center gap-1 text-[10px] text-gray-500">
                      No Acara:
                      <input value={finalNo}
                        onChange={e => setFinalNo(e.target.value.replace(/\D/g, ''))}
                        className="ml-1 w-14 bg-white border border-purple-200 rounded px-1.5 py-0.5 text-[10px] text-center font-black text-purple-700 focus:outline-none focus:ring-1 focus:ring-purple-400" />
                    </label>
                    <label className="flex items-center gap-1 text-[10px] text-gray-500">
                      Masa:
                      <input type="time" value={finalMasa}
                        onChange={e => setFinalMasa(e.target.value)}
                        className="ml-1 bg-white border border-purple-200 rounded px-1.5 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-purple-400" />
                    </label>
                    <label className="flex items-center gap-1 text-[10px] text-gray-500">
                      Tarikh:
                      <input type="date" value={finalTarikh}
                        onChange={e => setFinalTarikh(e.target.value)}
                        className="ml-1 bg-white border border-purple-200 rounded px-1.5 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-purple-400" />
                    </label>
                  </>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
      {err && (
        <tr className="bg-red-50">
          <td colSpan={10} className="px-3 py-1 text-[10px] text-red-600 font-semibold">{err}</td>
        </tr>
      )}
    </>
  )
}

// ─── AddAcaraRow — inline table row untuk tambah acara baru ──────────────────

const LOKASI_LIST = ['Trek Utama','Padang A','Padang B','Padang C','Padang D','Gelanggang']

function AddAcaraRow({ tarikhAcara, schoolId, kejId, kategoriList, acaraList, onSaved, onCancel }) {
  const kejohananId = kejId
  // Smart defaults dari acara terakhir dalam hari yang sama
  const inHari = acaraList
    .filter(a => a.tarikhAcara === tarikhAcara)
    .sort((a, b) => Number(a.noAcara) - Number(b.noAcara))
  const lastA = inHari[inHari.length - 1]

  function suggestNo() {
    const allNos = acaraList.map(a => Number(a.noAcara)).filter(n => !isNaN(n) && n > 0)
    return allNos.length ? String(Math.max(...allNos) + 1) : '101'
  }
  function suggestMasa() {
    if (!lastA?.masa) return '08:00'
    const [h, m] = lastA.masa.split(':').map(Number)
    const tot = h * 60 + m + 30
    return `${String(Math.floor(tot / 60)).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`
  }

  const [form, setForm] = useState({
    noAcara:           suggestNo(),
    masa:              suggestMasa(),
    namaAcaraPendek:   '',
    kategoriKod:       lastA?.kategoriKod || '',
    jantina:           lastA?.jantina     || 'L',
    jenisAcara:        lastA?.jenisAcara  || 'lorong',
    lokasi:            lastA?.lokasi      || 'Trek Utama',
    hadAtletPerSekolah: lastA?.hadAtletPerSekolah || 2,
    peringkatMode:     'akhir',   // 'akhir' | 'saringan' | 'final_p'
    parentAcaraId:     '',
    isIndividu:        lastA?.isIndividu ?? (lastA?.jenisAcara !== 'relay'),
  })
  const [saving, setSaving]         = useState(false)
  const [err, setErr]               = useState('')
  const [isTerbuka, setIsTerbuka]   = useState(false)
  const [katTerbuka, setKatTerbuka] = useState([])
  const [sisipMode, setSisipMode]   = useState(false)
  const [sisipLog, setSisipLog]     = useState('')

  const toggleKatTerbuka = React.useCallback((kod) => {
    setKatTerbuka(prev => prev.includes(kod) ? prev.filter(x => x !== kod) : [...prev, kod])
  }, [])
  const nameRef                   = React.useRef()

  useEffect(() => { nameRef.current?.focus() }, [])

  // Auto-detect jenis dari nama
  useEffect(() => {
    if (form.namaAcaraPendek)
      setForm(f => ({ ...f, jenisAcara: detectJenisFromNama(f.namaAcaraPendek) }))
  }, [form.namaAcaraPendek])

  // Auto-sync isIndividu apabila jenisAcara berubah
  useEffect(() => {
    setForm(f => ({ ...f, isIndividu: f.jenisAcara !== 'relay' }))
  }, [form.jenisAcara])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const selectedKat  = kategoriList.find(k => k.kod === form.kategoriKod)
  const kelas        = form.kategoriKod
    ? (selectedKat?.label || (selectedKat?.umurHad ? `${form.jantina} Bwh ${selectedKat.umurHad}` : `${form.jantina} ${form.kategoriKod}`))
    : form.jantina
  const namaFull     = `${form.namaAcaraPendek} ${kelas}`.trim()
  const isPadang     = ['padang_lompat', 'padang_balin'].includes(form.jenisAcara)
  const PERINGKAT_DENGAN_HEAT = ['saringan', 'suku_akhir', 'separuh_akhir']
  const peringkat    = PERINGKAT_DENGAN_HEAT.includes(form.peringkatMode) ? form.peringkatMode : 'akhir'
  const parentId     = ['final_p', 'separuh_akhir'].includes(form.peringkatMode) ? form.parentAcaraId.trim() : ''

  // Parent yang layak — filter ikut peringkat + kategori + jantina
  // SF mesti pilih QF (suku_akhir) | Final mesti pilih SF (separuh_akhir) atau Saringan
  const PARENT_PERINGKAT = {
    separuh_akhir: ['suku_akhir', 'saringan'],
    final_p:       ['separuh_akhir', 'saringan'],
  }
  const saringanList = acaraList.filter(a => {
    const allowed = PARENT_PERINGKAT[form.peringkatMode] || []
    if (!allowed.includes(a.peringkat)) return false
    if (form.kategoriKod && a.kategoriKod && a.kategoriKod !== 'TERBUKA') {
      if (a.kategoriKod !== form.kategoriKod) return false
    }
    if (form.jantina && a.jantina && a.jantina !== 'C') {
      if (a.jantina !== form.jantina) return false
    }
    return true
  })

  // next acara dalam chain
  const NEXT_PERINGKAT = { saringan: 'akhir', suku_akhir: 'separuh_akhir', separuh_akhir: 'akhir' }
  const NEXT_LABEL     = { saringan: 'Final', suku_akhir: 'Separuh Akhir', separuh_akhir: 'Final' }
  const adaNextPanel   = PERINGKAT_DENGAN_HEAT.includes(form.peringkatMode)
  const nextAdaHeat    = form.peringkatMode === 'suku_akhir'

  // ── Tambah Acara Seterusnya Serentak ─────────────────────────────────────────
  const [withFinal,    setWithFinal]    = useState(false)
  const [finalNo,      setFinalNo]      = useState('')
  const [finalMasa,    setFinalMasa]    = useState('')
  const [finalTarikh,  setFinalTarikh]  = useState(tarikhAcara)
  // Untuk QF: toggle Final selepas SF
  const [withFinal2,   setWithFinal2]   = useState(false)
  const [finalNo2,     setFinalNo2]     = useState('')
  const [finalMasa2,   setFinalMasa2]   = useState('')
  const [finalTarikh2, setFinalTarikh2] = useState(tarikhAcara)

  function suggestFinalNo() {
    const allNos = acaraList.map(a => Number(a.noAcara)).filter(n => !isNaN(n) && n > 0)
    return allNos.length ? String(Math.max(...allNos) + 1) : ''
  }
  function suggestFinalNo2(sfNo) {
    const base = Number(sfNo) || 0
    const allNos = acaraList.map(a => Number(a.noAcara)).filter(n => !isNaN(n) && n > 0)
    const maxNo = allNos.length ? Math.max(...allNos) : 0
    return String(Math.max(base + 1, maxNo + 1))
  }

  function buildAcaraDoc(noAcara, peringkatVal, parentAcaraIdVal, adaHeatVal, tarikh, masa) {
    return {
      noAcara, aceraId: noAcara,
      namaAcara: `${form.namaAcaraPendek.trim()} ${kelas}`.trim(),
      namaAcaraPendek: form.namaAcaraPendek.trim(),
      kelas, jantina: form.jantina, kategoriKod: isTerbuka ? 'TERBUKA' : form.kategoriKod,
      jenisAcara: form.jenisAcara, isIndividu: form.isIndividu,
      tarikhAcara: tarikh || tarikhAcara, masa: masa || '', lokasi: form.lokasi, sesi: 'Petang',
      peringkat: peringkatVal, parentAcaraId: parentAcaraIdVal,
      adaHeat: adaHeatVal,
      isWindReading: detectWindFromNama(form.namaAcaraPendek),
      unitUkuran: isPadang ? 'm' : 's',
      bilanganLorong: isPadang ? null : 8,
      bilanganFinalis: 8, bilanganCubaan: isPadang ? 6 : 0,
      hadAtletPerSekolah: Number(form.hadAtletPerSekolah),
      statusAcara: 'akan_datang', isAktif: true,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }
  }

  async function createNextAcara(thisId) {
    if (!withFinal || !finalNo.trim() || !adaNextPanel) return
    const aPath = acaraColPath(schoolId, kejId)
    const sfId  = finalNo.trim()
    const nextPeringkat = NEXT_PERINGKAT[form.peringkatMode]  // SF atau Final

    // Bina acara seterusnya (SF atau Final)
    await setDoc(doc(db, aPath, sfId),
      buildAcaraDoc(sfId, nextPeringkat, thisId, nextAdaHeat, finalTarikh, finalMasa)
    )

    // Jika QF → SF, dan toggle Final juga ON — bina Final dengan parentAcaraId = SF
    if (form.peringkatMode === 'suku_akhir' && withFinal2 && finalNo2.trim()) {
      const finalId = finalNo2.trim()
      await setDoc(doc(db, aPath, finalId),
        buildAcaraDoc(finalId, 'akhir', sfId, false, finalTarikh2, finalMasa2)
      )
    }
  }

  // Acara yang akan dinomborkan semula jika sisip di form.noAcara
  const sisipTarget   = Number(form.noAcara)
  const toRenameList  = acaraList
    .filter(a => !isNaN(Number(a.noAcara)) && Number(a.noAcara) >= sisipTarget)
    .sort((a, b) => Number(b.noAcara) - Number(a.noAcara)) // DESCENDING — tertinggi dulu

  function buildPayload(docId) {
    return {
      noAcara: docId, aceraId: docId,
      namaAcara: namaFull, namaAcaraPendek: form.namaAcaraPendek.trim(),
      kelas, jantina: form.jantina, kategoriKod: isTerbuka ? 'TERBUKA' : form.kategoriKod,
      jenisAcara: form.jenisAcara,
      isIndividu: form.isIndividu,
      tarikhAcara, masa: form.masa, lokasi: form.lokasi, sesi: 'Pagi',
      peringkat, parentAcaraId: parentId || null,
      adaHeat: PERINGKAT_DENGAN_HEAT.includes(peringkat),
      isWindReading: detectWindFromNama(form.namaAcaraPendek),
      unitUkuran: isPadang ? 'm' : 's',
      bilanganLorong: isPadang ? null : 8,
      bilanganFinalis: 8, bilanganCubaan: isPadang ? 6 : 0,
      hadAtletPerSekolah: Number(form.hadAtletPerSekolah),
      isTerbuka: isTerbuka,
      kategoriTerbuka: isTerbuka ? katTerbuka : [],
      statusAcara: 'akan_datang', isAktif: true,
    }
  }

  async function handleSave() {
    setErr('')
    setSisipMode(false)
    const docId = String(form.noAcara).trim()
    if (!docId)                       return setErr('No Acara wajib')
    if (!form.namaAcaraPendek.trim()) return setErr('Nama acara wajib')
    if (!form.kategoriKod)            return setErr('Kategori wajib')
    if (form.peringkatMode === 'separuh_akhir' && !form.parentAcaraId)
      return setErr('Pilih acara sebelum (QF)')
    setSaving(true)
    try {
      const aPath  = acaraColPath(schoolId, kejId)
      const newRef = doc(db, aPath, docId)
      if ((await getDoc(newRef)).exists()) {
        setSaving(false)
        setSisipMode(true)
        return
      }
      const payload = { ...buildPayload(docId), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
      await setDoc(newRef, payload)
      await createNextAcara(docId)
      onSaved(tarikhAcara)
    } catch (e) { setErr(e.message) } finally { setSaving(false) }
  }

  // ── Sisip Acara: rename semua acara ≥ target (+1), kemudian cipta baru ───────
  async function handleSisip() {
    setErr('')
    if (!form.namaAcaraPendek.trim()) return setErr('Isi nama acara dahulu')
    if (!form.kategoriKod)            return setErr('Pilih kategori dahulu')

    const target = sisipTarget
    const toRename = toRenameList // already sorted descending

    // ── Gate: semak tiada keputusan / pendaftaran pada acara yang akan diubah ──
    const adaKeputusan = toRename.some(a => a.statusAcara && a.statusAcara !== 'akan_datang')
    if (adaKeputusan) {
      return setErr('Tidak boleh sisip — ada acara dalam senarai ini sudah ada keputusan. Padam keputusan dahulu.')
    }
    const toRenameIds = new Set(toRename.map(a => String(a.noAcara)))
    const pendSnap = await getDocs(collection(db, `tenants/${schoolId}/kejohanan/${kejId}/pendaftaran`)).catch(() => null)
    if (pendSnap) {
      const adaPend = pendSnap.docs.some(d => {
        const ids = d.data().acaraIds || []
        return ids.some(id => toRenameIds.has(String(id)))
      })
      if (adaPend) {
        return setErr('Tidak boleh sisip — ada atlet sudah didaftarkan dalam acara yang akan diubah. Reset pendaftaran dahulu.')
      }
    }

    setSaving(true)
    setSisipLog(`Menyusun semula ${toRename.length} acara…`)

    try {
      const aPath = acaraColPath(schoolId, kejId)
      // ── Fasa 1: Rename acara tertinggi dulu (turun ke bawah) ─────────────────
      for (let i = 0; i < toRename.length; i++) {
        const acara   = toRename[i]
        const oldNo   = String(acara.noAcara)
        const newNo   = String(Number(acara.noAcara) + 1)
        setSisipLog(`Ubah No ${oldNo} → ${newNo}… (${i + 1}/${toRename.length})`)

        const oldAcaraRef = doc(db, aPath, oldNo)
        const oldSnap     = await getDoc(oldAcaraRef)
        if (!oldSnap.exists()) continue
        const oldData = oldSnap.data()

        let newParentId = oldData.parentAcaraId || null
        if (newParentId && toRenameIds.has(String(newParentId))) {
          newParentId = String(Number(newParentId) + 1)
        }

        const newAcaraRef = doc(db, aPath, newNo)
        await setDoc(newAcaraRef, {
          ...oldData,
          noAcara:      newNo,
          aceraId:      newNo,
          parentAcaraId: newParentId,
          updatedAt:    serverTimestamp(),
        })

        // Padam acara lama
        await deleteDoc(oldAcaraRef)
      }

      // ── Fasa 2: Cipta acara baru di tempat sasaran ───────────────────────────
      const docId   = String(target)
      setSisipLog(`Mencipta acara baru No ${docId}…`)
      const newRef  = doc(db, aPath, docId)
      const payload = { ...buildPayload(docId), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
      await setDoc(newRef, payload)

      setSisipLog('Selesai!')
      await createFinalAcara(docId)
      onSaved(tarikhAcara)
    } catch (e) {
      setErr('Ralat semasa sisip: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const ic = 'w-full bg-white border border-[#003399]/25 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#003399]/40 focus:border-[#003399]'

  return (
    <>
      <tr className="bg-[#eef2ff] border-b border-[#003399]/10">
        {/* No Acara */}
        <td className="px-1.5 py-1.5 w-14">
          <input type="text" inputMode="numeric" value={form.noAcara}
            onChange={e => set('noAcara', e.target.value.replace(/\D/g, ''))}
            className={ic + ' w-14 text-center font-black text-[#003399]'} />
        </td>
        {/* Masa */}
        <td className="px-1.5 py-1.5">
          <input type="time" value={form.masa}
            onChange={e => set('masa', e.target.value)}
            className={ic + ' w-[90px]'} />
        </td>
        {/* Nama Acara */}
        <td className="px-1.5 py-1.5">
          <input ref={nameRef} type="text" value={form.namaAcaraPendek}
            onChange={e => set('namaAcaraPendek', e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="100 Meter…"
            className={ic} />
          {namaFull && namaFull !== form.namaAcaraPendek && (
            <p className="text-[9px] text-[#003399]/70 mt-0.5 truncate font-mono">{namaFull}</p>
          )}
        </td>
        {/* Kategori */}
        <td className="px-1.5 py-1.5">
          {isTerbuka ? (
            <span className="text-[9px] font-bold px-2 py-1 rounded-full bg-orange-100 text-orange-700">Terbuka</span>
          ) : (
            <select value={form.kategoriKod} onChange={e => set('kategoriKod', e.target.value)} className={ic}>
              <option value="">— Kat —</option>
              {kategoriList.map(k => <option key={k.kod} value={k.kod}>{k.label || k.kod}</option>)}
            </select>
          )}
        </td>
        {/* Jantina */}
        <td className="px-1.5 py-1.5">
          <select value={form.jantina} onChange={e => set('jantina', e.target.value)} className={ic + ' w-14'}>
            <option value="L">L</option>
            <option value="P">P</option>
            <option value="Campuran">C</option>
          </select>
        </td>
        {/* Jenis */}
        <td className="px-1.5 py-1.5">
          <select value={form.jenisAcara} onChange={e => set('jenisAcara', e.target.value)} className={ic}>
            {JENIS_ACARA.map(j => <option key={j.value} value={j.value}>{j.short}</option>)}
          </select>
        </td>
        {/* Lokasi */}
        <td className="px-1.5 py-1.5">
          <select value={form.lokasi} onChange={e => set('lokasi', e.target.value)} className={ic}>
            {LOKASI_LIST.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </td>
        {/* Max/Skl */}
        <td className="px-1.5 py-1.5">
          <input type="number" min={1} max={20} value={form.hadAtletPerSekolah}
            onChange={e => set('hadAtletPerSekolah', e.target.value)}
            className={ic + ' w-14 text-center'} />
        </td>
        {/* Peringkat */}
        <td className="px-1.5 py-1.5">
          <select value={form.peringkatMode} onChange={e => { set('peringkatMode', e.target.value); set('parentAcaraId', '') }} className={ic}>
            <option value="akhir">Terus Final</option>
            <option value="suku_akhir">Suku Akhir (QF)</option>
            <option value="separuh_akhir">Separuh Akhir (SF)</option>
            <option value="final_p">Final ←</option>
          </select>
          {/* Pilih acara sebelum — untuk SF dan Final sahaja (QF = acara pertama, tiada parent) */}
          {['separuh_akhir', 'final_p'].includes(form.peringkatMode) && (
            saringanList.length === 0
              ? <p className="text-[10px] text-red-500 mt-1 bg-red-50 border border-red-200 rounded px-2 py-1">
                  {form.peringkatMode === 'separuh_akhir'
                    ? '⚠ Tiada QF/Saringan untuk kategori ini. Bina dahulu.'
                    : '⚠ Tiada SF/Saringan untuk kategori ini. Bina dahulu.'}
                </p>
              : <select value={form.parentAcaraId}
                  onChange={e => set('parentAcaraId', e.target.value)}
                  className={ic + ' mt-1 text-[10px]'}>
                  <option value="">— Pilih acara sebelum —</option>
                  {saringanList.map(a => (
                    <option key={a.noAcara} value={String(a.noAcara)}>
                      #{a.noAcara} {a.namaAcara}
                    </option>
                  ))}
                </select>
          )}
        </td>
        {/* Jenis Had */}
        <td className="px-1.5 py-1.5">
          <button type="button"
            onClick={() => set('isIndividu', !form.isIndividu)}
            title="Klik untuk tukar Individu/Berpasukan"
            className={`text-[9px] font-bold px-2 py-0.5 rounded-full border transition-all ${
              form.isIndividu
                ? 'bg-blue-50 text-blue-700 border-blue-300'
                : 'bg-purple-50 text-purple-700 border-purple-300'
            }`}>
            {form.isIndividu ? 'Individu' : 'Berpasukan'}
          </button>
        </td>
        {/* Tindakan */}
        <td className="px-1.5 py-1.5">
          <div className="flex gap-1">
            <button onClick={handleSave} disabled={saving} title="Simpan (Enter)"
              className="p-1.5 bg-[#003399] text-white rounded-lg hover:bg-[#002288] disabled:opacity-40 shrink-0">
              {saving
                ? <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                : <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
              }
            </button>
            <button onClick={onCancel} title="Batal (Esc)"
              className="p-1.5 text-gray-400 hover:text-red-500 border border-gray-200 rounded-lg hover:border-red-300 shrink-0">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </td>
      </tr>
      {/* Panel Acara Terbuka — TambahAcaraRow */}
      <tr className="bg-orange-50/60 border-b border-orange-100">
        <td colSpan={10} className="px-3 py-1.5">
          <div className="flex items-start gap-3 flex-wrap">
            <label className="flex items-center gap-1.5 cursor-pointer select-none mt-0.5">
              <button type="button" onClick={() => setIsTerbuka(v => !v)}
                className={`relative inline-flex h-4 w-8 shrink-0 rounded-full transition-colors ${isTerbuka ? 'bg-orange-500' : 'bg-gray-300'}`}>
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform mt-[1px] ${isTerbuka ? 'translate-x-[18px]' : 'translate-x-[1px]'}`} />
              </button>
              <span className="text-[10px] font-bold text-orange-700">Acara Terbuka</span>
            </label>
            {isTerbuka && (
              <div className="mt-1">
                <p className="text-[9px] text-gray-400 mb-1">Kategori layak (klik untuk pilih/buang):</p>
                <div className="flex flex-wrap gap-1">
                  {kategoriList.map(k => {
                    const dipilih = katTerbuka.includes(k.kod)
                    return (
                      <button key={k.kod} type="button"
                        onClick={() => toggleKatTerbuka(k.kod)}
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full border transition-all ${dipilih ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-500 border-gray-300'}`}>
                        {dipilih ? '✓ ' : ''}{k.kod}
                      </button>
                    )
                  })}
                </div>
                {katTerbuka.length === 0 && <p className="text-[9px] text-red-500 mt-1">Pilih sekurang-kurangnya 1 kategori</p>}
              </div>
            )}
          </div>
        </td>
      </tr>
      {/* Panel auto-create acara seterusnya — untuk Saringan, QF, SF */}
      {adaNextPanel && (
        <tr className="bg-purple-50/60 border-b border-purple-100">
          <td colSpan={10} className="px-3 py-2 space-y-2">
            {/* Toggle SF (untuk QF) atau Final (untuk Saringan/SF) */}
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <button type="button" onClick={() => {
                  const next = !withFinal
                  setWithFinal(next)
                  if (next && !finalNo) setFinalNo(suggestFinalNo())
                  if (next && !finalTarikh) setFinalTarikh(tarikhAcara)
                  if (!next) { setWithFinal2(false); setFinalNo2(''); setFinalMasa2(''); setFinalTarikh2(tarikhAcara) }
                }} className={`relative inline-flex h-4 w-8 shrink-0 rounded-full transition-colors ${withFinal ? 'bg-purple-600' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform mt-[1px] ${withFinal ? 'translate-x-[18px]' : 'translate-x-[1px]'}`} />
                </button>
                <span className="text-[10px] font-bold text-purple-700">Tambah {NEXT_LABEL[form.peringkatMode]} Serentak</span>
              </label>
              {withFinal && (
                <>
                  <label className="flex items-center gap-1 text-[10px] text-gray-500">
                    No Acara:
                    <input value={finalNo}
                      onChange={e => setFinalNo(e.target.value.replace(/\D/g, ''))}
                      className="ml-1 w-14 bg-white border border-purple-200 rounded px-1.5 py-0.5 text-[10px] text-center font-black text-purple-700 focus:outline-none focus:ring-1 focus:ring-purple-400" />
                  </label>
                  <label className="flex items-center gap-1 text-[10px] text-gray-500">
                    Masa:
                    <input type="time" value={finalMasa}
                      onChange={e => setFinalMasa(e.target.value)}
                      className="ml-1 bg-white border border-purple-200 rounded px-1.5 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-purple-400" />
                  </label>
                  <label className="flex items-center gap-1 text-[10px] text-gray-500">
                    Tarikh:
                    <input type="date" value={finalTarikh}
                      onChange={e => setFinalTarikh(e.target.value)}
                      className="ml-1 bg-white border border-purple-200 rounded px-1.5 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-purple-400" />
                  </label>
                </>
              )}
            </div>
            {/* Toggle Final (hanya untuk QF, selepas SF toggle ON) */}
            {form.peringkatMode === 'suku_akhir' && withFinal && (
              <div className="flex items-center gap-3 flex-wrap pl-2 border-l-2 border-purple-300">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <button type="button" onClick={() => {
                    const next = !withFinal2
                    setWithFinal2(next)
                    if (next && !finalNo2) setFinalNo2(suggestFinalNo2(finalNo))
                    if (next && !finalTarikh2) setFinalTarikh2(tarikhAcara)
                  }} className={`relative inline-flex h-4 w-8 shrink-0 rounded-full transition-colors ${withFinal2 ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                    <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform mt-[1px] ${withFinal2 ? 'translate-x-[18px]' : 'translate-x-[1px]'}`} />
                  </button>
                  <span className="text-[10px] font-bold text-indigo-700">Tambah Final Serentak</span>
                </label>
                {withFinal2 && (
                  <>
                    <label className="flex items-center gap-1 text-[10px] text-gray-500">
                      No Acara:
                      <input value={finalNo2}
                        onChange={e => setFinalNo2(e.target.value.replace(/\D/g, ''))}
                        className="ml-1 w-14 bg-white border border-indigo-200 rounded px-1.5 py-0.5 text-[10px] text-center font-black text-indigo-700 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                    </label>
                    <label className="flex items-center gap-1 text-[10px] text-gray-500">
                      Masa:
                      <input type="time" value={finalMasa2}
                        onChange={e => setFinalMasa2(e.target.value)}
                        className="ml-1 bg-white border border-indigo-200 rounded px-1.5 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                    </label>
                    <label className="flex items-center gap-1 text-[10px] text-gray-500">
                      Tarikh:
                      <input type="date" value={finalTarikh2}
                        onChange={e => setFinalTarikh2(e.target.value)}
                        className="ml-1 bg-white border border-indigo-200 rounded px-1.5 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                    </label>
                  </>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
      {/* Panel Sisip — muncul apabila no acara sudah wujud */}
      {sisipMode && !saving && (
        <tr className="bg-amber-50 border-b border-amber-200">
          <td colSpan={10} className="px-3 py-2.5">
            <div className="flex flex-col gap-2">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                </svg>
                <div>
                  <p className="text-xs font-bold text-amber-800">
                    No. {form.noAcara} sudah wujud — Sisipkan acara baru di sini?
                  </p>
                  <p className="text-[10px] text-amber-600 mt-0.5">
                    {toRenameList.length} acara akan dinomborkan semula:
                    {' '}No {toRenameList[toRenameList.length - 1]?.noAcara}–{toRenameList[0]?.noAcara}
                    {' '}→ {Number(toRenameList[toRenameList.length - 1]?.noAcara) + 1}–{Number(toRenameList[0]?.noAcara) + 1}
                  </p>
                  <p className="text-[10px] text-amber-500 mt-0.5">
                    ⚠ Hanya selamat jika tiada pendaftaran atau keputusan pada acara tersebut.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSisip}
                  className="px-3 py-1.5 text-[10px] font-bold bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors">
                  Ya, Sisip Acara Baru
                </button>
                <button onClick={() => setSisipMode(false)}
                  className="px-3 py-1.5 text-[10px] font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  Batal
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
      {/* Progress log semasa sisip berjalan */}
      {saving && sisipLog && (
        <tr className="bg-blue-50 border-b border-blue-100">
          <td colSpan={10} className="px-3 py-2">
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-[#003399] animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              <p className="text-[10px] text-[#003399] font-semibold">{sisipLog}</p>
            </div>
          </td>
        </tr>
      )}
      {err && (
        <tr className="bg-red-50">
          <td colSpan={10} className="px-3 py-1 text-[10px] text-red-600 font-semibold">{err}</td>
        </tr>
      )}
    </>
  )
}

// ─── KatCell — inline dropdown untuk betulkan kategoriKod ────────────────────

function KatCell({ acara, schoolId, kejId, kategoriList, onUpdated }) {
  const kejohananId = kejId
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(acara.kategoriKod || '')
  const [saving, setSaving]   = useState(false)
  const selectRef             = React.useRef()

  const isWrong = val && !kategoriList.find(k => k.kod === val)

  function startEdit() { setVal(acara.kategoriKod || ''); setEditing(true) }
  function cancel()    { setEditing(false) }

  async function save(newVal) {
    const kod = newVal ?? val
    if (!kod || kod === acara.kategoriKod) return cancel()
    setSaving(true)
    try {
      const aceraKey = String(acara.noAcara || acara.aceraId || acara.id)
      const selectedKat = kategoriList.find(k => k.kod === kod)
      const kelas = selectedKat?.label
        || (selectedKat?.umurHad ? `${acara.jantina} Bwh ${selectedKat.umurHad}` : `${acara.jantina} ${kod}`)
      const namaAcara = `${acara.namaAcaraPendek || ''} ${kelas}`.trim()
      await updateDoc(doc(db, acaraColPath(schoolId, kejId), aceraKey), {
        kategoriKod: kod, kelas, namaAcara, updatedAt: serverTimestamp(),
      })
      onUpdated(aceraKey, kod, kelas, namaAcara)
    } catch { /* kekal nilai lama */ } finally { setSaving(false); setEditing(false) }
  }

  useEffect(() => { if (editing && selectRef.current) selectRef.current.focus() }, [editing])

  if (saving) return <span className="text-[10px] text-gray-400">…</span>

  if (editing) return (
    <select ref={selectRef} value={val}
      onChange={e => { setVal(e.target.value); save(e.target.value) }}
      onBlur={cancel}
      onKeyDown={e => { if (e.key === 'Escape') cancel() }}
      className="text-[10px] font-bold border border-[#003399] rounded-lg px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-[#003399]/30 bg-white min-w-[80px]">
      <option value="">— Kat —</option>
      {kategoriList.map(k => (
        <option key={k.kod} value={k.kod}>{k.label || k.kod}</option>
      ))}
    </select>
  )

  const label = katLabel(val, kategoriList)
  return (
    <button onClick={startEdit} title="Klik untuk tukar kategori"
      className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all group ${
        isWrong
          ? 'bg-red-50 text-red-700 border-red-300 hover:border-red-500'
          : 'bg-blue-50 text-[#003399] border-blue-200 hover:border-[#003399]'
      }`}>
      {isWrong && <span className="text-red-500 mr-0.5">!</span>}
      {label}
      <svg className="w-2 h-2 text-blue-300 group-hover:text-[#003399] ml-0.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    </button>
  )
}

// ─── HadCell — inline edit untuk hadAtletPerSekolah ──────────────────────────

function HadCell({ acara, schoolId, kejId, onUpdated }) {
  const kejohananId = kejId
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(acara.hadAtletPerSekolah ?? '')
  const [saving, setSaving]   = useState(false)
  const inputRef              = React.useRef()

  function startEdit() { setVal(acara.hadAtletPerSekolah ?? ''); setEditing(true) }
  function cancel()    { setEditing(false) }

  async function save() {
    const num = parseInt(val)
    if (isNaN(num) || num < 1) return cancel()
    if (num === acara.hadAtletPerSekolah) return cancel()
    setSaving(true)
    try {
      const aceraKey = acara.noAcara || acara.aceraId || acara.id
      await updateDoc(doc(db, acaraColPath(schoolId, kejId), String(aceraKey)),
        { hadAtletPerSekolah: num, updatedAt: serverTimestamp() })
      onUpdated(aceraKey, num)
    } catch { /* kekal nilai lama */ } finally { setSaving(false); setEditing(false) }
  }

  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus() }, [editing])

  if (saving) return <span className="text-[10px] text-gray-400">…</span>

  if (editing) return (
    <input
      ref={inputRef}
      type="number" min={1} max={20}
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={save}
      onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
      className="w-12 text-center text-xs font-bold border border-[#003399] rounded-lg px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-[#003399]/30"
    />
  )

  return (
    <button onClick={startEdit} title="Klik untuk ubah"
      className="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all
        hover:border-[#003399] hover:bg-blue-50 group
        bg-emerald-50 text-emerald-700 border-emerald-200">
      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
      {acara.hadAtletPerSekolah ?? '?'}
      <svg className="w-2 h-2 text-emerald-400 group-hover:text-[#003399] ml-0.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    </button>
  )
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

// Pulang label paparan kategori — guna label jika ada, fallback ke kod
function katLabel(kod, kategoriList = []) {
  if (!kod) return '—'
  const kat = kategoriList.find(k => k.kod === kod)
  return (kat?.label) || kod
}

function JenisBadge({ jenis }) {
  const j = JENIS_ACARA.find(x => x.value === jenis)
  if (!j) return null
  return (
    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${j.lightColor}`}>
      {j.short}
    </span>
  )
}

function JantinaBadge({ jantina }) {
  return (
    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
      jantina === 'L' ? 'bg-blue-100 text-blue-700'
      : jantina === 'P' ? 'bg-pink-100 text-pink-700'
      : 'bg-gray-100 text-gray-600'
    }`}>{jantina}</span>
  )
}

function FormField({ label, hint, required, children }) {
  return (
    <div>
      <div className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </div>
      {children}
      {hint && <p className="text-[10px] text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}


// ─── WA Config Panel ──────────────────────────────────────────────────────────

// Firestore tidak sokong nested arrays — tukar [[3,4,5,6],[2,7]] → ["3,4,5,6","2,7"]
function serializeKumpulan(kumpulan) {
  const out = {}
  Object.entries(kumpulan).forEach(([jenis, grps]) => {
    out[jenis] = grps.map(g => g.join(','))
  })
  return out
}
// Balik semula: ["3,4,5,6","2,7"] → [[3,4,5,6],[2,7]]
function deserializeKumpulan(data) {
  const out = {}
  Object.entries(data).forEach(([jenis, grps]) => {
    out[jenis] = grps.map(s =>
      String(s).split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v))
    )
  })
  return out
}

// Helper: compute lorong tersedia per bilangan atlet dari removal order
function previewHeatLorong(removeOrder, bilanganLorong = 8) {
  const rows = []
  for (let n = bilanganLorong; n >= Math.max(1, bilanganLorong - removeOrder.length); n--) {
    const toRemove  = bilanganLorong - n
    const removed   = new Set(removeOrder.slice(0, toRemove))
    const available = Array.from({ length: bilanganLorong }, (_, i) => i + 1).filter(l => !removed.has(l))
    rows.push({ n, removed: removeOrder.slice(0, toRemove), available })
  }
  return rows
}

function WaConfigPanel({ schoolId, kejId }) {
  const kejohananId = kejId
  const [open, setOpen]         = useState(false)
  const [tabLorong, setTabL]    = useState('final')  // 'final' | 'heat'
  const [cfg, setCfg]           = useState(WA_CONFIG_DEFAULT)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)

  useEffect(() => {
    if (!open || !schoolId || !kejId) return
    const [wPath, wDocId] = waDocPath(schoolId, kejId)
    getDoc(doc(db, wPath, wDocId)).then(d => {
      if (d.exists()) {
        const data = d.data()
        if (data.lorongKumpulan) {
          data.lorongKumpulan = deserializeKumpulan(data.lorongKumpulan)
        }
        if (data.lorongHeatRemove) {
          // Deserialize: setiap nilai boleh jadi string "1,8,2,7" atau array
          const hr = {}
          Object.entries(data.lorongHeatRemove).forEach(([jenis, val]) => {
            hr[jenis] = Array.isArray(val)
              ? val
              : String(val).split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v))
          })
          data.lorongHeatRemove = hr
        }
        setCfg({ ...WA_CONFIG_DEFAULT, ...data })
      }
    })
  }, [open, schoolId, kejId])

  const set = (k, v) => setCfg(f => ({ ...f, [k]: v }))

  async function handleSave() {
    if (!schoolId || !kejId) return
    setSaving(true)
    try {
      const payload = { ...cfg, updatedAt: serverTimestamp() }
      if (payload.lorongKumpulan) {
        payload.lorongKumpulan = serializeKumpulan(payload.lorongKumpulan)
      }
      if (payload.lorongHeatRemove) {
        const hr = {}
        Object.entries(payload.lorongHeatRemove).forEach(([jenis, arr]) => {
          hr[jenis] = Array.isArray(arr) ? arr.join(',') : String(arr)
        })
        payload.lorongHeatRemove = hr
      }
      const [wPath, wDocId] = waDocPath(schoolId, kejId)
      await setDoc(doc(db, wPath, wDocId), payload, { merge: true })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) { alert(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden shadow-sm">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-[#003399] flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <span className="text-xs font-bold text-gray-700">Setup Lorong dan Heat</span>
          {(!schoolId || !kejId) && <span className="text-[10px] text-orange-500 font-semibold">Tiada konteks kejohanan</span>}
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && schoolId && kejId && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100">

          {/* Nota redirect tetapan finalis */}
          <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 flex items-start gap-2">
            <svg className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-[10px] text-blue-700 leading-relaxed">
              <strong>Tetapan Bilangan Finalis & Cubaan Padang</strong> telah dipindahkan ke
              {' '}<strong>Kategori → Tab Tetapan Final</strong> — ditetapkan per kategori (L12, L15, dll) untuk lebih tepat.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">

            <FormField label="Had Angin (m/s)" hint="Rekod sah jika angin ≤ had ini">
              <input type="number" step="0.1" value={cfg.windLimit}
                onChange={e => set('windLimit', parseFloat(e.target.value))} className={inputCls} />
            </FormField>

            <FormField label="False Start" hint="Bila atlet diisytihar DQ">
              <select value={cfg.falseStartRule} onChange={e => set('falseStartRule', e.target.value)} className={inputCls}>
                <option value="one">1 FS = terus DQ (WA standard)</option>
                <option value="two">2 FS = DQ (sekolah)</option>
              </select>
            </FormField>

            <FormField label="Sistem Masa" hint="Pengaruhi cara keputusan dicatat">
              <select value={cfg.timeSystem} onChange={e => set('timeSystem', e.target.value)} className={inputCls}>
                <option value="electronic">Elektronik (FAT)</option>
                <option value="manual">Manual (jam tangan)</option>
              </select>
            </FormField>

            <FormField label="Standard Lorong" hint="Bilangan lorong trek">
              <input type="number" min={4} max={10} value={cfg.lorongStandard}
                onChange={e => set('lorongStandard', parseInt(e.target.value))} className={inputCls} />
            </FormField>

          </div>

          {/* Tab Lorong — Final & Heat */}
          <div className="border border-gray-100 rounded-lg overflow-hidden bg-gray-50">
            {/* Tab header */}
            <div className="flex border-b border-gray-200">
              {[
                { id: 'final', label: 'Lorong Final' },
                { id: 'heat',  label: 'Lorong Heat' },
              ].map(t => (
                <button key={t.id} onClick={() => setTabL(t.id)}
                  className={`flex-1 px-4 py-2.5 text-[10px] font-bold transition-colors ${
                    tabLorong === t.id
                      ? 'bg-[#003399] text-white'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab: Lorong Final */}
            {tabLorong === 'final' && (
              <div className="p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wide">Penetapan Lorong Final (WA)</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Rank 1 = terpantas/terbaik. Undian rawak dalam kumpulan.</p>
                  </div>
                  <button onClick={() => set('lorongKumpulan', WA_CONFIG_DEFAULT.lorongKumpulan)}
                    className="text-[10px] text-[#003399] font-semibold hover:underline shrink-0">Reset WA</button>
                </div>

                {/* Bilangan Heat SF — untuk suku_akhir → separuh_akhir (serpentine) */}
                <div className="bg-teal-50 border border-teal-100 rounded-lg p-3 space-y-1.5">
                  <p className="text-[10px] font-bold text-teal-700 uppercase tracking-wide">Suku Akhir → Separuh Akhir</p>
                  <p className="text-[10px] text-teal-600">Bilangan heat SF — finalis diagihkan ikut serpentine seeding WA.</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-gray-600 w-32 shrink-0">Bilangan Heat SF:</span>
                    <input type="number" min="1" max="8" value={cfg.bilHeatSukuAkhir ?? 2}
                      onChange={e => set('bilHeatSukuAkhir', parseInt(e.target.value) || 2)}
                      className="w-16 border border-gray-200 rounded px-2 py-1 text-xs bg-white text-center focus:outline-none focus:ring-1 focus:ring-teal-400/50"
                    />
                    <span className="text-[10px] text-gray-400">heat (biasanya 2)</span>
                  </div>
                </div>
                {Object.entries(WA_LORONG_KUMPULAN_DEFAULT).map(([jenisKey, meta]) => {
                  const kumpulan  = (cfg.lorongKumpulan?.[jenisKey]) || meta.kumpulan
                  const rankStart = [0, kumpulan[0].length, kumpulan[0].length + kumpulan[1].length]
                  return (
                    <div key={jenisKey} className="space-y-1.5">
                      <p className="text-[10px] font-bold text-gray-700">{meta.label}</p>
                      {kumpulan.map((grp, gi) => (
                        <div key={gi} className="flex items-center gap-2">
                          <span className="text-[9px] text-gray-400 w-20 shrink-0">
                            Rank {rankStart[gi]+1}–{rankStart[gi]+grp.length}
                          </span>
                          <input type="text" value={grp.join(',')}
                            onChange={e => {
                              const vals = e.target.value.split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v))
                              const cur  = JSON.parse(JSON.stringify(cfg.lorongKumpulan || WA_CONFIG_DEFAULT.lorongKumpulan))
                              cur[jenisKey][gi] = vals
                              set('lorongKumpulan', cur)
                            }}
                            placeholder={meta.kumpulan[gi].join(',')}
                            className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#003399]/30"
                          />
                          <span className="text-[9px] text-gray-300 shrink-0">lorong</span>
                        </div>
                      ))}
                    </div>
                  )
                })}
                <p className="text-[9px] text-gray-400">* Dipisahkan koma. Undian rawak dalam kumpulan.</p>
              </div>
            )}

            {/* Tab: Lorong Heat */}
            {tabLorong === 'heat' && (
              <div className="p-3 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wide">Lorong Heat / Saringan (WA)</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Urutan lorong dikosongkan apabila atlet kurang dari 8. Undian rawak dalam lorong tersedia.</p>
                  </div>
                  <button onClick={() => set('lorongHeatRemove', WA_CONFIG_DEFAULT.lorongHeatRemove)}
                    className="text-[10px] text-[#003399] font-semibold hover:underline shrink-0">Reset WA</button>
                </div>

                {Object.entries(WA_LORONG_HEAT_REMOVE_DEFAULT).map(([jenisKey, meta]) => {
                  const removeOrder = cfg.lorongHeatRemove?.[jenisKey] || meta.remove
                  const bilLorong   = cfg.lorongStandard || 8
                  const preview     = previewHeatLorong(removeOrder, bilLorong)
                  return (
                    <div key={jenisKey} className="space-y-2">
                      <p className="text-[10px] font-bold text-gray-700">{meta.label}</p>

                      {/* Input urutan buang */}
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-gray-400 w-24 shrink-0">Urutan buang:</span>
                        <input type="text" value={removeOrder.join(',')}
                          onChange={e => {
                            const vals = e.target.value.split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v))
                            const cur  = { ...(cfg.lorongHeatRemove || WA_CONFIG_DEFAULT.lorongHeatRemove) }
                            cur[jenisKey] = vals
                            set('lorongHeatRemove', cur)
                          }}
                          placeholder={meta.remove.join(',')}
                          className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs bg-white font-mono focus:outline-none focus:ring-1 focus:ring-[#003399]/30"
                        />
                      </div>

                      {/* Preview table */}
                      <div className="overflow-x-auto rounded border border-gray-200">
                        <table className="w-full text-[9px]">
                          <thead>
                            <tr className="bg-gray-100 text-gray-500">
                              <th className="px-2 py-1.5 text-center font-bold w-12">Atlet</th>
                              <th className="px-2 py-1.5 text-center font-bold">Dikosongkan</th>
                              <th className="px-2 py-1.5 text-center font-bold">Tersedia (undian rawak)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {preview.map(({ n, removed, available }) => (
                              <tr key={n} className={n % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className="px-2 py-1 text-center font-black text-gray-700">{n}</td>
                                <td className="px-2 py-1 text-center font-mono text-red-500">
                                  {removed.length ? removed.join(', ') : '—'}
                                </td>
                                <td className="px-2 py-1 text-center font-mono text-[#003399] font-bold">
                                  {'{' + available.join(', ') + '}'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })}
                <p className="text-[9px] text-gray-400">* Urutan dipisahkan koma. Preview dikira semula apabila urutan diubah.</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">

            {cfg.timeSystem === 'manual' && (
              <>
                <FormField label="Pelarasan Masa — Sprint (s)" hint="Tambah ke masa tangan: 100m, 200m, 400m, relay (WA: +0.24s)">
                  <input type="number" step="0.01" value={cfg.handTimeAdjustSprint ?? 0.24}
                    onChange={e => set('handTimeAdjustSprint', parseFloat(e.target.value))} className={inputCls} />
                </FormField>

                <FormField label="Pelarasan Masa — Lain (s)" hint="Tambah ke masa tangan: 800m ke atas, padang (WA: +0.14s)">
                  <input type="number" step="0.01" value={cfg.handTimeAdjustOther ?? 0.14}
                    onChange={e => set('handTimeAdjustOther', parseFloat(e.target.value))} className={inputCls} />
                </FormField>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 text-xs font-bold bg-[#003399] text-white rounded-lg hover:bg-[#002288] disabled:opacity-50">
              {saving ? 'Menyimpan…' : 'Simpan WA Config'}
            </button>
            {saved && <span className="text-xs text-green-600 font-semibold">Tersimpan!</span>}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── AcaraModal ───────────────────────────────────────────────────────────────

function AcaraModal({ mode, initial, schoolId, kejId, onClose, onSaved, kategoriList = [], defaultTarikh = '' }) {
  const kejohananId = kejId
  const isEdit = mode === 'edit'

  const [form, setForm] = useState({
    noAcara:        initial?.noAcara        || '',
    namaAcaraPendek:initial?.namaAcaraPendek || '',
    jantina:        initial?.jantina        || 'L',
    kategoriKod:    initial?.kategoriKod    || '',
    tarikhAcara:    initial?.tarikhAcara    || defaultTarikh,
    masa:           initial?.masa           || '',
    lokasi:         initial?.lokasi         || 'Trek Utama',
    peringkat:      initial?.peringkat      || 'akhir',
    parentAcaraId:  initial?.parentAcaraId  || '',
    sesi:           initial?.sesi           || 'Pagi',
    jenisAcara:     initial?.jenisAcara     || 'lorong',
    bilanganLorong: initial?.bilanganLorong || 8,
    bilanganFinalis:initial?.bilanganFinalis|| 8,
    caraPilihFinal: initial?.caraPilihFinal || 'hybrid',
    wildcardSlot:   initial?.wildcardSlot   || 2,
    bilanganCubaan: initial?.bilanganCubaan || 6,
    hadAtletPerSekolah: initial?.hadAtletPerSekolah || 2,
    isWindReading:  initial?.isWindReading  ?? false,
    jenisLorong:    initial?.jenisLorong    || detectJenisLorongFromNama(initial?.namaAcaraPendek || ''),
    jenisLorongManual: false,
    jenisManual:    false,
    windManual:     false,
    showAdvanced:   false,
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Auto-detect jenis & wind & jenisLorong dari nama acara
  useEffect(() => {
    if (!form.jenisManual && form.namaAcaraPendek) {
      const jenis = detectJenisFromNama(form.namaAcaraPendek)
      const wind  = detectWindFromNama(form.namaAcaraPendek)
      setForm(f => ({
        ...f,
        jenisAcara:    jenis,
        isWindReading: f.windManual ? f.isWindReading : wind,
        jenisLorong:   f.jenisLorongManual ? f.jenisLorong : detectJenisLorongFromNama(f.namaAcaraPendek),
      }))
    }
  }, [form.namaAcaraPendek, form.jenisManual])

  const selectedKat   = kategoriList.find(k => k.kod === form.kategoriKod)
  const kelas         = form.kategoriKod
    ? (selectedKat?.label || (selectedKat?.umurHad ? `${form.jantina} Bwh ${selectedKat.umurHad}` : `${form.jantina} ${form.kategoriKod}`))
    : form.jantina
  const namaAcaraFull = `${form.namaAcaraPendek} ${kelas}`.trim()
  const PERINGKAT_DENGAN_HEAT = ['saringan', 'suku_akhir', 'separuh_akhir']
  const adaHeat       = PERINGKAT_DENGAN_HEAT.includes(form.peringkat)
  const isPadang      = ['padang_lompat', 'padang_balin'].includes(form.jenisAcara)
  const isLorong      = ['lorong', 'relay'].includes(form.jenisAcara)
  const jInfo         = JENIS_ACARA.find(j => j.value === form.jenisAcara)

  const oldNoAcara  = isEdit ? String(initial?.noAcara || initial?.aceraId || initial?.id || '').trim() : ''
  const noAcaraBeza = isEdit && String(form.noAcara).trim() !== oldNoAcara

  async function handleSave() {
    setErr('')
    const newDocId = String(form.noAcara).trim()
    if (!newDocId)                       return setErr('No Acara wajib diisi.')
    if (!form.namaAcaraPendek.trim())    return setErr('Nama Acara wajib diisi.')
    if (!form.kategoriKod)               return setErr('Kategori wajib dipilih.')
    if (!form.tarikhAcara)               return setErr('Tarikh wajib dipilih.')
    if (!form.masa)                      return setErr('Masa wajib diisi.')
    if (!schoolId || !kejId)             return setErr('Tiada konteks kejohanan.')

    const isMove = isEdit && noAcaraBeza
    const aPath  = acaraColPath(schoolId, kejId)
    setSaving(true)
    try {
      const newRef = doc(db, aPath, newDocId)

      if (!isEdit || isMove) {
        const snap = await getDoc(newRef)
        if (snap.exists()) {
          setSaving(false)
          return setErr(`No Acara "${newDocId}" sudah wujud. Pilih nombor lain.`)
        }
      }

      const kategoriKod = form.kategoriKod
      const payload = {
        noAcara:           newDocId,
        aceraId:           newDocId,
        namaAcara:         namaAcaraFull,
        namaAcaraPendek:   form.namaAcaraPendek.trim(),
        kelas,
        jantina:           form.jantina,
        kategoriKod,
        jenisAcara:        form.jenisAcara,
        tarikhAcara:       form.tarikhAcara,
        masa:              form.masa,
        lokasi:            form.lokasi,
        sesi:              form.sesi,
        peringkat:         form.peringkat,
        parentAcaraId:     form.parentAcaraId.trim() || null,
        adaHeat:           PERINGKAT_DENGAN_HEAT.includes(form.peringkat),
        isWindReading:     !!form.isWindReading,
        unitUkuran:        isPadang ? 'm' : 's',
        bilanganLorong:    isLorong ? Number(form.bilanganLorong) : null,
        jenisLorong:       isLorong ? (form.jenisLorong || 'lurus') : null,
        bilanganFinalis:   Number(form.bilanganFinalis),
        caraPilihFinal:    form.caraPilihFinal,
        wildcardSlot:      form.caraPilihFinal === 'hybrid' ? Number(form.wildcardSlot) : 0,
        bilanganCubaan:    isPadang ? Number(form.bilanganCubaan) : 0,
        hadAtletPerSekolah:Number(form.hadAtletPerSekolah),
        statusAcara:       isEdit ? (initial?.statusAcara || 'akan_datang') : 'akan_datang',
        updatedAt:         serverTimestamp(),
        ...(!isEdit ? { createdAt: serverTimestamp() } : {}),
      }

      if (isMove) {
        await setDoc(newRef, payload)

        const heatsSnap = await getDocs(collection(db, aPath, oldNoAcara, 'heat'))
        const ops = []
        heatsSnap.docs.forEach(hd => {
          ops.push({ t:'s', ref: doc(db, aPath, newDocId, 'heat', hd.id), data: hd.data() })
          ops.push({ t:'d', ref: hd.ref })
        })
        ops.push({ t:'d', ref: doc(db, aPath, oldNoAcara) })

        for (let i = 0; i < ops.length; i += 400) {
          const batch = writeBatch(db)
          ops.slice(i, i + 400).forEach(o => o.t === 's' ? batch.set(o.ref, o.data) : batch.delete(o.ref))
          await batch.commit()
        }

      } else if (isEdit) {
        await setDoc(newRef, payload, { merge: true })
      } else {
        await setDoc(newRef, payload)
      }

      onSaved(form.tarikhAcara)
      onClose()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[94vh] flex flex-col">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-sm font-bold text-gray-800">{isEdit ? 'Edit Acara' : 'Tambah Acara'}</h2>
            {namaAcaraFull && (
              <p className="text-[10px] font-mono text-[#003399] mt-0.5">{namaAcaraFull}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* 1 — No Acara + Masa */}
          {noAcaraBeza && (
            <div className="bg-orange-50 border border-orange-300 rounded-lg px-3 py-2 text-[11px] text-orange-700">
              ⚠️ No Acara bertukar <strong>{oldNoAcara} → {form.noAcara}</strong> — semua heat akan dipindah ke nombor baru secara automatik.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="No Acara" required
              hint={isEdit ? (noAcaraBeza ? '' : 'Tukar = pindah semua data ke nombor baru') : ''}>
              <input type="text" inputMode="numeric" value={form.noAcara}
                onChange={e => set('noAcara', e.target.value.replace(/\D/g, ''))}
                placeholder="101"
                className={inputCls + (noAcaraBeza ? ' border-orange-400 bg-orange-50/50' : '')} />
            </FormField>
            <FormField label="Masa" required>
              <input type="time" value={form.masa}
                onChange={e => set('masa', e.target.value)} className={inputCls} />
            </FormField>
          </div>

          {/* 2 — Nama Acara */}
          <FormField label="Nama Acara" required hint="Cth: 100 Meter, Lompat Jauh, 4 x 100 Meter">
            <input value={form.namaAcaraPendek}
              onChange={e => set('namaAcaraPendek', e.target.value)}
              placeholder="100 Meter" className={inputCls} />
          </FormField>

          {/* 3 — Kelas = Jantina + Umur */}
          <div>
            <p className="text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
              Kelas <span className="text-red-400">*</span>
              <span className="ml-2 font-mono text-[#003399] normal-case tracking-normal">{kelas}</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[9px] text-gray-400 mb-1">Jantina</p>
                <div className="flex gap-1.5 h-[38px]">
                  {[{v:'L'},{v:'P'},{v:'Campuran'}].map(o => (
                    <button key={o.v} type="button" onClick={() => set('jantina', o.v)}
                      className={`flex-1 rounded-lg text-[10px] font-bold border transition-colors ${
                        form.jantina === o.v
                          ? o.v === 'L' ? 'bg-blue-600 text-white border-blue-600'
                          : o.v === 'P' ? 'bg-pink-500 text-white border-pink-500'
                          : 'bg-purple-500 text-white border-purple-500'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                      }`}>{o.v}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[9px] text-gray-400 mb-1">Kategori</p>
                <select value={form.kategoriKod} onChange={e => set('kategoriKod', e.target.value)} className={inputCls}>
                  <option value="">— Pilih Kategori —</option>
                  {kategoriList.map(k => (
                    <option key={k.kod} value={k.kod}>
                      {k.label || k.kod} — {k.nama || k.jenisSekolah} (Bwh {k.umurHad} thn)
                    </option>
                  ))}
                </select>
                {selectedKat && (
                  <p className="text-[9px] text-green-600 mt-0.5">{selectedKat.jenisSekolah} · Umur {selectedKat.umurMin}–{selectedKat.umurHad}</p>
                )}
              </div>
            </div>
          </div>

          {/* 4 — Peringkat */}
          <div>
            <p className="text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Peringkat <span className="text-red-400">*</span></p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { v:'akhir',         l:'Terus Final',   d:'Final sahaja, tiada heat saringan' },
                { v:'saringan',      l:'Saringan',      d:'Heat saringan — final dibuat berasingan' },
                { v:'akhir_p',       l:'Final',         d:'Final selepas saringan (ada No Acara Saringan)' },
                { v:'suku_akhir',    l:'Suku Akhir',    d:'Heat suku akhir (QF) — ada heat, bukan final' },
                { v:'separuh_akhir', l:'Separuh Akhir', d:'Heat separuh akhir (SF) — ada heat, bukan final' },
              ].map(o => (
                <button key={o.v} type="button"
                  onClick={() => {
                    const val = o.v === 'akhir_p' ? 'akhir' : o.v
                    const isParent = o.v === 'akhir_p'
                    set('peringkat', val)
                    if (!isParent) set('parentAcaraId', '')
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    (o.v === 'akhir_p'
                      ? form.peringkat === 'akhir' && form.parentAcaraId
                      : form.peringkat === o.v && !form.parentAcaraId)
                      ? 'border-[#003399] bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}>
                  <p className="text-xs font-bold text-gray-700">{o.l}</p>
                  <p className="text-[9px] text-gray-400">{o.d}</p>
                </button>
              ))}
            </div>
            {adaHeat && (
              <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
                <svg className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-[10px] text-amber-700 leading-relaxed">
                  <strong>Bilangan heat dikira automatik</strong> semasa Jana Start List — berdasarkan jumlah peserta sebenar ÷ bilangan lorong. Tiada perlu tetapkan di sini.
                </p>
              </div>
            )}
            {form.peringkat === 'akhir' && (
              <div className="mt-2">
                <FormField label="No Acara Saringan (opsional)" hint="Isi jika acara ini ialah final kepada saringan lain. Cth: 101">
                  <input type="text" inputMode="numeric"
                    value={form.parentAcaraId}
                    onChange={e => set('parentAcaraId', e.target.value.replace(/\D/g, ''))}
                    placeholder="— tiada (terus final) —"
                    className={inputCls + (form.parentAcaraId ? ' border-[#003399] bg-blue-50/40' : '')} />
                </FormField>
                {form.parentAcaraId && (
                  <p className="text-[10px] text-[#003399] font-semibold mt-1">
                    Final ini akan ambil finalis dari Acara #{form.parentAcaraId}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 5 — Tarikh + Lokasi */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label={
              <span className="flex items-center gap-1.5">
                Tarikh
                {!isEdit && defaultTarikh && form.tarikhAcara === defaultTarikh && (
                  <span className="text-[9px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded normal-case tracking-normal">
                    sama seperti sebelum
                  </span>
                )}
              </span>
            } required>
              <input type="date" value={form.tarikhAcara}
                onChange={e => set('tarikhAcara', e.target.value)} className={inputCls} />
            </FormField>
            <FormField label="Lokasi">
              <select value={form.lokasi} onChange={e => set('lokasi', e.target.value)} className={inputCls}>
                {['Trek Utama','Padang A','Padang B','Padang C','Padang D','Gelanggang'].map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </FormField>
          </div>

          {/* 6 — Jenis auto-detect badge + Tetapan Lanjutan */}
          <div className={`rounded-xl px-3 py-2.5 flex items-center gap-2.5 border ${jInfo ? jInfo.lightColor : 'bg-gray-50 border-gray-100'}`}>
            {jInfo && <span className="text-[10px] font-black">{jInfo.short}</span>}
            <p className="text-[10px] text-gray-500 flex-1">Auto-detect dari nama acara</p>
            {form.isWindReading && <span className="text-[10px] text-sky-600 font-semibold">💨 Wind</span>}
            <button type="button" onClick={() => set('showAdvanced', !form.showAdvanced)}
              className="text-[10px] text-[#003399] font-bold underline">
              {form.showAdvanced ? 'Tutup' : 'Tetapan Lanjutan'}
            </button>
          </div>

          {form.showAdvanced && (
            <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50/40">
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Tetapan Lanjutan</p>

              <FormField label="Jenis Acara (Override)">
                <div className="grid grid-cols-3 gap-1.5">
                  {JENIS_ACARA.map(j => (
                    <button key={j.value} type="button"
                      onClick={() => { set('jenisAcara', j.value); set('jenisManual', true) }}
                      className={`p-2 rounded-lg border text-[10px] font-bold text-left transition-all ${
                        form.jenisAcara === j.value ? `${j.lightColor} border-current` : 'bg-white border-gray-200'
                      }`}>{j.short}</button>
                  ))}
                </div>
              </FormField>

              {isLorong && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Bilangan Lorong">
                      <input type="number" min={4} max={10} value={form.bilanganLorong}
                        onChange={e => set('bilanganLorong', e.target.value)} className={inputCls} />
                    </FormField>
                    <FormField label="Bilangan Finalis">
                      <input type="number" min={2} value={form.bilanganFinalis}
                        onChange={e => set('bilanganFinalis', e.target.value)} className={inputCls} />
                    </FormField>
                  </div>
                  <FormField label="Jenis Lorong (Final WA)" hint="Auto-detect dari nama acara — boleh override">
                    <div className="flex gap-2 items-center">
                      <select
                        value={form.jenisLorong || 'lurus'}
                        onChange={e => { set('jenisLorong', e.target.value); set('jenisLorongManual', true) }}
                        className={inputCls + ' flex-1'}
                      >
                        <option value="lurus">Lurus — 100m, Berpagar (100m/110m)</option>
                        <option value="dua_ratus">200m</option>
                        <option value="selekoh">Selekoh — 400m+, Berpagar 400m, Relay (4×100m, 4×200m, 4×400m)</option>
                      </select>
                      {form.jenisLorongManual && (
                        <button
                          type="button"
                          onClick={() => { set('jenisLorongManual', false); set('jenisLorong', detectJenisLorongFromNama(form.namaAcaraPendek)) }}
                          className="text-[10px] text-gray-400 hover:text-[#003399] whitespace-nowrap"
                        >
                          Auto
                        </button>
                      )}
                    </div>
                  </FormField>
                </>
              )}

              {isPadang && (
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Bilangan Cubaan">
                    <input type="number" min={1} value={form.bilanganCubaan}
                      onChange={e => set('bilanganCubaan', e.target.value)} className={inputCls} />
                  </FormField>
                  <FormField label="Had Atlet / Sekolah">
                    <input type="number" min={1} value={form.hadAtletPerSekolah}
                      onChange={e => set('hadAtletPerSekolah', e.target.value)} className={inputCls} />
                  </FormField>
                </div>
              )}

              <label className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-gray-200 cursor-pointer">
                <div>
                  <p className="text-xs font-semibold text-gray-700">Perlu Catat Angin</p>
                  <p className="text-[10px] text-gray-400">Wind reading wajib sebelum keputusan rasmi</p>
                </div>
                <button type="button" onClick={() => { set('isWindReading', !form.isWindReading); set('windManual', true) }}
                  className={`relative inline-flex h-5 w-9 rounded-full transition-colors shrink-0 ${form.isWindReading ? 'bg-blue-600' : 'bg-gray-300'}`}>
                  <span className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
                    style={{ transform: form.isWindReading ? 'translateX(18px)' : 'translateX(2px)' }} />
                </button>
              </label>
            </div>
          )}

          {err && <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">{err}</div>}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg">Batal</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 text-xs font-bold bg-[#003399] text-white rounded-lg hover:bg-[#002288] disabled:opacity-50">
            {saving ? 'Menyimpan…' : isEdit ? (noAcaraBeza ? 'Pindah & Kemaskini' : 'Kemaskini') : 'Tambah Acara'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── DeleteModal ──────────────────────────────────────────────────────────────

function DeleteModal({ acara, schoolId, kejId, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false)
  async function handleDelete() {
    setDeleting(true)
    try {
      const aceraKey = acara.noAcara || acara.aceraId || acara.id
      await deleteDoc(doc(db, acaraColPath(schoolId, kejId), aceraKey))
      onDeleted(); onClose()
    } catch (e) { alert(e.message); setDeleting(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5 text-center">
        <div className="w-11 h-11 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-sm font-bold text-gray-800 mb-1">Padam Acara?</h3>
        <p className="text-xs text-gray-500 mb-1 font-mono text-[10px]">{acara.aceraId}</p>
        <p className="text-xs text-gray-500 mb-4">Semua data heat dan keputusan dalam acara ini turut akan dipadam.</p>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Batal</button>
          <button onClick={handleDelete} disabled={deleting}
            className="flex-1 py-2 text-xs font-bold bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50">
            {deleting ? 'Memadamkan…' : 'Padam'}
          </button>
        </div>
      </div>
    </div>
  )
}


// ─── HadPesertaPanel ─────────────────────────────────────────────────────────

function HadPesertaPanel({ acaraList, schoolId, kejId, onRefresh, kategoriList = [] }) {
  const kejohananId = kejId
  const [open,     setOpen]     = useState(false)
  const [fNama,    setFNama]    = useState('semua')
  const [fJantina, setFJantina] = useState('semua')
  const [fKat,     setFKat]     = useState('semua')
  const [had,      setHad]      = useState(2)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)

  // Senarai nama unik dari acara yang dimuatkan
  const namaUnik = ['semua', ...new Set(acaraList.map(a => a.namaAcara).filter(Boolean))].sort((a, b) =>
    a === 'semua' ? -1 : b === 'semua' ? 1 : a.localeCompare(b)
  )
  // Derive dari kategoriList (semua kategori dikonfigur) bukan dari acara
  const katUnik = ['semua', ...kategoriList.map(k => k.kod).filter(Boolean)]

  // Acara yang padan dengan filter
  const matching = acaraList.filter(a => {
    if (fNama    !== 'semua' && a.namaAcara   !== fNama)    return false
    if (fJantina !== 'semua' && a.jantina     !== fJantina) return false
    if (fKat     !== 'semua' && a.kategoriKod !== fKat)     return false
    return true
  })

  async function handleKemaskini() {
    if (!schoolId || !kejId) return alert('Tiada konteks kejohanan.')
    if (matching.length === 0) return alert('Tiada acara yang sepadan dengan filter.')
    const hadNum = Number(had)
    if (isNaN(hadNum) || hadNum < 1) return alert('Had mestilah nombor ≥ 1.')
    if (!window.confirm(`Kemaskini had peserta → ${hadNum} bagi ${matching.length} acara?`)) return

    setSaving(true)
    try {
      const aPath = acaraColPath(schoolId, kejId)
      const chunks = []
      for (let i = 0; i < matching.length; i += 400) chunks.push(matching.slice(i, i + 400))
      for (const chunk of chunks) {
        const batch = writeBatch(db)
        for (const a of chunk) {
          const ref = doc(db, aPath, a.aceraId || a.id)
          batch.update(ref, { hadAtletPerSekolah: hadNum, updatedAt: serverTimestamp() })
        }
        await batch.commit()
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      onRefresh()
    } catch (e) { alert('Ralat: ' + e.message) } finally { setSaving(false) }
  }

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden shadow-sm">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-emerald-600 flex items-center justify-center shrink-0">
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <span className="text-xs font-bold text-gray-700">Kemaskini Had Peserta (Bundle)</span>
          {(!schoolId || !kejId) && <span className="text-[10px] text-orange-500 font-semibold">Tiada konteks kejohanan</span>}
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && schoolId && kejId && (
        <div className="px-4 pb-5 space-y-4 border-t border-gray-100 pt-4">

          {/* Filter row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Nama Acara */}
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Nama Acara</label>
              <select value={fNama} onChange={e => setFNama(e.target.value)} className={inputCls}>
                {namaUnik.map(n => (
                  <option key={n} value={n}>{n === 'semua' ? '— Semua Acara —' : n}</option>
                ))}
              </select>
            </div>

            {/* Kategori */}
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Kategori</label>
              <select value={fKat} onChange={e => setFKat(e.target.value)} className={inputCls}>
                {katUnik.map(k => (
                  <option key={k} value={k}>{k === 'semua' ? '— Semua Kategori —' : katLabel(k, kategoriList)}</option>
                ))}
              </select>
            </div>

            {/* Jantina */}
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Jantina</label>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs bg-white h-[38px]">
                {[['semua', 'L + P'], ['L', 'Lelaki'], ['P', 'Perempuan']].map(([val, lbl]) => (
                  <button key={val} type="button" onClick={() => setFJantina(val)}
                    className={`flex-1 font-semibold transition-colors ${fJantina === val ? 'bg-[#003399] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Had input */}
          <div className="flex items-end gap-3">
            <div className="w-40">
              <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Had Atlet / Sekolah</label>
              <input type="number" min={1} max={20} value={had} onChange={e => setHad(e.target.value)}
                className={inputCls} />
            </div>
            <button onClick={handleKemaskini} disabled={saving || matching.length === 0}
              className="px-5 py-2 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors">
              {saving ? 'Menyimpan…' : `Kemaskini ${matching.length} Acara`}
            </button>
            {saved && <span className="text-xs text-green-600 font-semibold">✓ Tersimpan!</span>}
          </div>

          {/* Preview */}
          {matching.length > 0 ? (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">
                Preview — {matching.length} acara akan dikemaskini
              </p>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-100">
                <table className="w-full text-[11px]">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-[9px] font-bold text-gray-400 uppercase">Nama Acara</th>
                      <th className="px-3 py-2 text-center text-[9px] font-bold text-gray-400 uppercase">Kat</th>
                      <th className="px-3 py-2 text-center text-[9px] font-bold text-gray-400 uppercase">J</th>
                      <th className="px-3 py-2 text-center text-[9px] font-bold text-gray-400 uppercase">Had Lama</th>
                      <th className="px-3 py-2 text-center text-[9px] font-bold text-gray-400 uppercase">Had Baru</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matching.map(a => (
                      <tr key={a.aceraId || a.id} className="border-t border-gray-50">
                        <td className="px-3 py-2 font-semibold text-gray-700">
                          {a.namaAcara}
                          {a.isTerbuka && <span className="ml-1.5 text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">Terbuka</span>}
                        </td>
                        <td className="px-3 py-2 text-center font-black text-[#003399]">{katLabel(a.kategoriKod, kategoriList)}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                            a.jantina === 'L' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'
                          }`}>{a.jantina}</span>
                        </td>
                        <td className="px-3 py-2 text-center text-gray-400">{a.hadAtletPerSekolah ?? '—'}</td>
                        <td className="px-3 py-2 text-center font-black text-emerald-600">{had}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400 text-center py-3">Tiada acara sepadan dengan filter.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── SemakAcara Tab ───────────────────────────────────────────────────────────

function SemakAcara({ acaraList, kategoriList, schoolId, kejId, namaKej, onHadUpdated }) {
  const kejohananId = kejId
  const [fJantina,   setFJantina]   = useState('semua')
  const [fPeringkat, setFPeringkat] = useState('semua')
  const [fKat,       setFKat]       = useState('semua')
  const [editId,     setEditId]     = useState(null)
  const [editVal,    setEditVal]    = useState('')
  const [saving,     setSaving]     = useState(false)
  const [htSaving,   setHtSaving]   = useState(null)

  // Peringkat — guna field `peringkat` terus dari Firestore:
  //   'saringan' → Saringan
  //   'akhir' + parentAcaraId → Final (perlawanan akhir linked ke saringan)
  //   'akhir' + tiada parentAcaraId → Akhir (standalone, tiada final)
  function getPeringkat(a) {
    if (a.peringkat === 'saringan')       return 'saringan'
    if (a.peringkat === 'suku_akhir')    return 'suku_akhir'
    if (a.peringkat === 'separuh_akhir') return 'separuh_akhir'
    if (a.parentAcaraId)                  return 'final'
    return 'akhir'
  }

  // Filter
  const listed = acaraList.filter(a => {
    if (fJantina !== 'semua' && a.jantina !== fJantina) return false
    if (fKat     !== 'semua' && a.kategoriKod !== fKat) return false
    if (fPeringkat !== 'semua' && getPeringkat(a) !== fPeringkat) return false
    return true
  })

  // Group by kategoriKod ikut susunan kategoriList
  const katOrder = kategoriList.map(k => k.kod)
  const groups   = {}
  listed.forEach(a => {
    const k = a.kategoriKod || '—'
    if (!groups[k]) groups[k] = []
    groups[k].push(a)
  })
  const sortedKats = Object.keys(groups).sort((a, b) => {
    const ia = katOrder.indexOf(a), ib = katOrder.indexOf(b)
    if (ia === -1 && ib === -1) return a.localeCompare(b)
    if (ia === -1) return 1; if (ib === -1) return -1
    return ia - ib
  })

  // Toggle Hand Timing — auto-save
  async function toggleHT(a) {
    const key     = String(a.noAcara || a.aceraId || a.id)
    const newVal  = !a.adaHandTiming
    setHtSaving(key)
    try {
      await updateDoc(doc(db, acaraColPath(schoolId, kejId), key),
        { adaHandTiming: newVal, updatedAt: serverTimestamp() })
      onHadUpdated(key, a.hadAtletPerSekolah ?? 2, newVal)
    } catch (e) { alert('Ralat: ' + e.message) }
    finally { setHtSaving(null) }
  }

  // Simpan had inline
  async function saveHad(a) {
    const val = parseInt(editVal, 10)
    if (isNaN(val) || val < 1) { setEditId(null); return }
    const key = String(a.noAcara || a.aceraId || a.id)
    setSaving(true)
    try {
      await updateDoc(doc(db, acaraColPath(schoolId, kejId), key),
        { hadAtletPerSekolah: val, updatedAt: serverTimestamp() })
      onHadUpdated(key, val)
    } catch (e) { alert('Ralat: ' + e.message) }
    finally { setSaving(false); setEditId(null) }
  }

  const JENIS_SHORT = { lorong:'Lorong', mass_start:'Mass Start', padang_lompat:'Lompat', padang_balin:'Balin', relay:'Relay' }
  const P_BADGE     = { saringan:'bg-blue-100 text-blue-700', final:'bg-amber-100 text-amber-700', akhir:'bg-green-100 text-green-700', suku_akhir:'bg-teal-100 text-teal-700', separuh_akhir:'bg-indigo-100 text-indigo-700' }
  const P_LABEL     = { saringan:'Saringan', final:'Final', akhir:'Akhir', suku_akhir:'Suku Akhir', separuh_akhir:'Separuh Akhir' }

  // ── Cetak PDF ───────────────────────────────────────────────────────────────
  function cetakPDF() {
    const pdf    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW  = 210
    const pageH  = 297
    const mL     = 14   // margin kiri
    const mR     = 14   // margin kanan
    const usable = pageW - mL - mR  // 182mm

    const tarikh = new Date().toLocaleDateString('ms-MY', {
      day: '2-digit', month: 'long', year: 'numeric',
    })
    const masa = new Date().toLocaleTimeString('ms-MY', {
      hour: '2-digit', minute: '2-digit',
    })

    // ── Header halaman pertama ─────────────────────────────────────────────
    // Bar biru atas
    pdf.setFillColor(0, 51, 153)
    pdf.rect(mL, 10, usable, 14, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.setFontSize(12)
    pdf.setFont('helvetica', 'bold')
    pdf.text('SENARAI ACARA KEJOHANAN', mL + 5, 19.5)

    // Nama kejohanan
    pdf.setTextColor(20, 20, 20)
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'bold')
    pdf.text(namaKej || 'Kejohanan Olahraga', mL, 33)

    // Maklumat cetak
    pdf.setFontSize(7.5)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(100, 100, 100)
    pdf.text(`Dicetak: ${tarikh}  •  ${masa}`, mL, 38)

    // Summary stats bar
    const saringanCount = acaraList.filter(a => a.peringkat === 'saringan').length
    const finalCount    = acaraList.filter(a => a.parentAcaraId).length
    const akhirCount    = acaraList.filter(a => a.peringkat !== 'saringan' && !a.parentAcaraId).length
    const statsRow = [
      `Jumlah Acara: ${acaraList.length}`,
      `Saringan: ${saringanCount}`,
      `Akhir: ${akhirCount}`,
      `Final: ${finalCount}`,
      `Dipapar: ${listed.length}`,
    ]
    pdf.setFontSize(7.5)
    pdf.setTextColor(40, 40, 40)
    statsRow.forEach((s, i) => {
      pdf.text(s, mL + i * (usable / statsRow.length), 44)
    })

    // Garis pemisah
    pdf.setDrawColor(0, 51, 153)
    pdf.setLineWidth(0.5)
    pdf.line(mL, 47, mL + usable, 47)

    // ── Jadual per kategori ────────────────────────────────────────────────
    let startY = 51
    const colWidths = { no: 13, nama: 77, jantina: 13, jenis: 24, had: 22, peringkat: 27 }

    // Helper parse warna hex → [r, g, b]
    function hexRGB(hex) {
      const h = (hex || '#6b7280').replace('#', '')
      return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
    }

    sortedKats.forEach((katKod) => {
      const katObj = kategoriList.find(k => k.kod === katKod)
      const warna  = katObj?.warna || '#6b7280'
      const [r, g, b] = hexRGB(warna)
      const rows   = groups[katKod]
      const jL     = rows.filter(a => a.jantina === 'L').length
      const jP     = rows.filter(a => a.jantina === 'P').length

      // Header kumpulan sebagai baris pertama — gabung semua kolum
      const groupHeader = `${katObj?.label || katKod}   ${katObj?.nama || katKod}   |   ${katObj?.jenisSekolah || '—'}   |   ${jL}L  ${jP}P   |   ${rows.length} acara`

      autoTable(pdf, {
        startY,
        margin: { left: mL, right: mR },
        head: [
          // Row 1 — header kumpulan (warna kategori)
          [{ content: groupHeader, colSpan: 6,
             styles: { fillColor: [r, g, b], textColor: [255,255,255], fontStyle: 'bold', fontSize: 8.5, cellPadding: { top:3, bottom:3, left:4, right:4 } }
          }],
          // Row 2 — header kolum
          ['No', 'Nama Acara', 'J', 'Jenis', 'Max/Skl', 'Peringkat'],
        ],
        body: rows.map(a => [
          a.noAcara || a.aceraId || a.id,
          a.namaAcara || '—',
          a.jantina || '—',
          JENIS_SHORT[a.jenisAcara] || a.jenisAcara || '—',
          a.hadAtletPerSekolah ?? '—',
          P_LABEL[getPeringkat(a)],
        ]),
        columnStyles: {
          0: { cellWidth: colWidths.no,       halign: 'center', fontStyle: 'bold'   },
          1: { cellWidth: colWidths.nama                                             },
          2: { cellWidth: colWidths.jantina,  halign: 'center'                      },
          3: { cellWidth: colWidths.jenis,    halign: 'center'                      },
          4: { cellWidth: colWidths.had,      halign: 'center', fontStyle: 'bold'   },
          5: { cellWidth: colWidths.peringkat, halign: 'center'                     },
        },
        headStyles: {
          fillColor: [30, 58, 120],
          textColor: [255, 255, 255],
          fontSize: 7.5,
          fontStyle: 'bold',
          cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
        },
        bodyStyles: {
          fontSize: 8,
          cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
          textColor: [20, 20, 20],
          lineColor: [220, 220, 230],
          lineWidth: 0.1,
        },
        alternateRowStyles: { fillColor: [247, 249, 255] },
        didParseCell(data) {
          // Warnakan badge peringkat
          if (data.section === 'body' && data.column.index === 5) {
            const val = data.cell.raw
            if (val === 'Saringan') { data.cell.styles.textColor = [29, 78, 216]; data.cell.styles.fontStyle = 'bold' }
            if (val === 'Final')    { data.cell.styles.textColor = [180, 83, 9];  data.cell.styles.fontStyle = 'bold' }
            if (val === 'Akhir')    { data.cell.styles.textColor = [21, 128, 61]; data.cell.styles.fontStyle = 'bold' }
          }
          // Warnakan jantina
          if (data.section === 'body' && data.column.index === 2) {
            if (data.cell.raw === 'L') data.cell.styles.textColor = [29, 78, 216]
            if (data.cell.raw === 'P') data.cell.styles.textColor = [190, 24, 93]
            data.cell.styles.fontStyle = 'bold'
          }
        },
        didDrawPage(data) {
          // Footer setiap halaman
          const pg = pdf.internal.getNumberOfPages()
          pdf.setFontSize(7)
          pdf.setTextColor(150, 150, 150)
          pdf.setFont('helvetica', 'normal')
          pdf.text('Gold Podium — Sistem Pengurusan Kejohanan Olahraga', mL, pageH - 8)
          pdf.text(`Halaman ${pg}`, pageW / 2, pageH - 8, { align: 'center' })
          pdf.text(tarikh, pageW - mR, pageH - 8, { align: 'right' })
          // Garis footer
          pdf.setDrawColor(200, 210, 230)
          pdf.setLineWidth(0.3)
          pdf.line(mL, pageH - 11, pageW - mR, pageH - 11)
        },
      })

      startY = pdf.lastAutoTable.finalY + 5
    })

    const fname = `Semak_Acara_${(namaKej || 'kejohanan').replace(/\s+/g,'_')}.pdf`
    pdf.save(fname)
  }

  return (
    <div className="space-y-4">

      {/* Stats ringkas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { l:'Jumlah Acara',    v: acaraList.length,                              c:'text-[#003399]', bg:'bg-blue-50' },
          { l:'Lelaki',          v: acaraList.filter(a=>a.jantina==='L').length,   c:'text-blue-600',  bg:'bg-blue-50' },
          { l:'Perempuan',       v: acaraList.filter(a=>a.jantina==='P').length,   c:'text-pink-600',  bg:'bg-pink-50' },
          { l:'Saringan',        v: acaraList.filter(a=>a.peringkat==='saringan').length, c:'text-blue-600',  bg:'bg-blue-50' },
        ].map(s => (
          <div key={s.l} className={`${s.bg} rounded-xl px-3 py-2.5 text-center`}>
            <p className={`text-xl font-black ${s.c}`}>{s.v}</p>
            <p className="text-[9px] text-gray-500 uppercase tracking-wide">{s.l}</p>
          </div>
        ))}
      </div>

      {/* Toolbar: Cetak PDF */}
      <div className="flex justify-end">
        <button onClick={cetakPDF}
          className="flex items-center gap-2 px-4 py-2 bg-[#003399] text-white text-xs font-bold rounded-lg hover:bg-[#002288] shadow-sm transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
          </svg>
          Cetak PDF
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-[10px] bg-white">
          {['semua','L','P'].map(f => (
            <button key={f} onClick={() => setFJantina(f)}
              className={`px-3 py-1.5 font-bold transition-colors ${fJantina===f?'bg-[#003399] text-white':'text-gray-500 hover:bg-gray-50'}`}>
              {f==='semua'?'L+P':f}
            </button>
          ))}
        </div>

        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-[10px] bg-white">
          {[['semua','Semua'],['saringan','Saringan'],['suku_akhir','Suku Akhir'],['separuh_akhir','Separuh Akhir'],['akhir','Akhir'],['final','Final']].map(([v,l]) => (
            <button key={v} onClick={() => setFPeringkat(v)}
              className={`px-3 py-1.5 font-bold transition-colors border-r border-gray-100 last:border-r-0 ${fPeringkat===v?'bg-[#003399] text-white':'text-gray-500 hover:bg-gray-50'}`}>
              {l}
            </button>
          ))}
        </div>

        {kategoriList.length > 0 && (
          <div className="flex flex-wrap rounded-lg border border-gray-200 overflow-hidden text-[10px] bg-white">
            {['semua', ...kategoriList.map(k=>k.kod).filter(Boolean)].map(f => (
              <button key={f} onClick={() => setFKat(f)}
                className={`px-2.5 py-1.5 font-bold transition-colors border-r border-gray-100 last:border-r-0 ${fKat===f?'bg-[#003399] text-white':'text-gray-500 hover:bg-gray-50'}`}>
                {f==='semua' ? 'Semua Kat' : (kategoriList.find(k=>k.kod===f)?.label || f)}
              </button>
            ))}
          </div>
        )}

        <p className="text-[10px] text-gray-400 ml-auto">{listed.length} acara dipaparkan</p>
      </div>

      {/* Info inline edit */}
      <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
        <svg className="w-3.5 h-3.5 text-blue-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
        </svg>
        <p className="text-[10px] text-blue-700">
          Klik angka <strong>Max/Skl</strong> untuk edit had atlet per sekolah terus dalam jadual ini.
          Simpan dengan <kbd className="bg-blue-100 px-1 rounded font-mono">Enter</kbd> atau klik luar.
          Untuk edit nama / kategori / no acara — guna tab <strong>Urus Acara</strong>.
        </p>
      </div>

      {/* Table per kumpulan kategori */}
      {listed.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 py-12 text-center text-sm text-gray-400">
          Tiada acara yang sepadan dengan penapis.
        </div>
      ) : (
        <div className="space-y-3">
          {sortedKats.map(katKod => {
            const katObj = kategoriList.find(k => k.kod === katKod)
            const warna  = katObj?.warna || '#6b7280'
            const rows   = groups[katKod]
            const jL     = rows.filter(a => a.jantina === 'L').length
            const jP     = rows.filter(a => a.jantina === 'P').length

            return (
              <div key={katKod} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">

                {/* Header kumpulan */}
                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100"
                  style={{ borderLeftWidth: 4, borderLeftColor: warna }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[11px] font-black shrink-0"
                    style={{ backgroundColor: warna }}>
                    {katObj?.label || katKod}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-800 leading-tight">{katObj?.nama || katKod}</p>
                    <p className="text-[9px] text-gray-400">{katObj?.jenisSekolah || '—'}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="bg-blue-50 text-blue-700 font-bold text-[9px] px-1.5 py-0.5 rounded-full">{jL}L</span>
                    <span className="bg-pink-50 text-pink-700 font-bold text-[9px] px-1.5 py-0.5 rounded-full">{jP}P</span>
                    <span className="text-[9px] text-gray-400">{rows.length} acara</span>
                  </div>
                </div>

                {/* Jadual */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-[9px] font-bold text-gray-400 uppercase tracking-wide">
                        <th className="px-3 py-2 text-left w-12">No</th>
                        <th className="px-3 py-2 text-left">Nama Acara</th>
                        <th className="px-3 py-2 text-center w-10">J</th>
                        <th className="px-3 py-2 text-center w-16">Jenis</th>
                        <th className="px-3 py-2 text-center w-28">
                          Max/Skl
                          <span className="ml-1 normal-case text-[8px] font-normal text-gray-300">(klik edit)</span>
                        </th>
                        <th className="px-3 py-2 text-center w-24">Peringkat</th>
                        <th className="px-3 py-2 text-center w-12">HT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((a, ri) => {
                        const key      = String(a.noAcara || a.aceraId || a.id)
                        const peringkat = getPeringkat(a)
                        const isEditing = editId === key

                        return (
                          <tr key={key}
                            className={`border-b border-gray-50 last:border-0 transition-colors
                              ${ri % 2 === 0 ? '' : 'bg-gray-50/30'}
                              ${!a.isAktif ? 'opacity-40' : ''}
                            `}>

                            {/* No Acara */}
                            <td className="px-3 py-2.5">
                              <span className="font-mono font-black text-[11px] text-[#003399]">{a.noAcara || key}</span>
                            </td>

                            {/* Nama Acara */}
                            <td className="px-3 py-2.5 font-semibold text-gray-800">
                              {a.namaAcara}
                              {a.isTerbuka && <span className="ml-1.5 text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">Terbuka</span>}
                            </td>

                            {/* Jantina */}
                            <td className="px-3 py-2.5 text-center">
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full
                                ${a.jantina==='L' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
                                {a.jantina}
                              </span>
                            </td>

                            {/* Jenis */}
                            <td className="px-3 py-2.5 text-center">
                              <span className="text-[9px] font-semibold text-gray-500">
                                {JENIS_SHORT[a.jenisAcara] || a.jenisAcara}
                              </span>
                            </td>

                            {/* Had Atlet — inline edit */}
                            <td className="px-3 py-2.5 text-center">
                              {isEditing ? (
                                <div className="flex items-center justify-center gap-1">
                                  <input
                                    autoFocus
                                    type="number" min={1} max={99}
                                    value={editVal}
                                    onChange={e => setEditVal(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') saveHad(a)
                                      if (e.key === 'Escape') setEditId(null)
                                    }}
                                    onBlur={() => saveHad(a)}
                                    className="w-14 text-center text-sm font-black border-2 border-[#003399] rounded-lg px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-[#003399]/25"
                                  />
                                  {saving && (
                                    <svg className="w-3 h-3 animate-spin text-[#003399]" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                                    </svg>
                                  )}
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setEditId(key); setEditVal(String(a.hadAtletPerSekolah ?? 2)) }}
                                  className="group inline-flex items-center gap-1 hover:text-[#003399] transition-colors"
                                  title="Klik untuk edit">
                                  <span className="text-sm font-black text-gray-800 group-hover:text-[#003399]">
                                    {a.hadAtletPerSekolah ?? '—'}
                                  </span>
                                  <svg className="w-3 h-3 text-gray-300 group-hover:text-[#003399] opacity-0 group-hover:opacity-100 transition-opacity"
                                    fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round"
                                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                  </svg>
                                </button>
                              )}
                            </td>

                            {/* Peringkat */}
                            <td className="px-3 py-2.5 text-center">
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${P_BADGE[peringkat]}`}>
                                {P_LABEL[peringkat]}
                              </span>
                            </td>

                            {/* Hand Timing toggle — auto-save */}
                            <td className="px-3 py-2.5 text-center">
                              {htSaving === key ? (
                                <svg className="w-3.5 h-3.5 animate-spin text-teal-500 mx-auto" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                                </svg>
                              ) : (
                                <button onClick={() => toggleHT(a)} title="Toggle Hand Timing"
                                  className={`w-8 h-4 rounded-full transition-colors relative focus:outline-none ${
                                    a.adaHandTiming ? 'bg-teal-500' : 'bg-gray-200'
                                  }`}>
                                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
                                    a.adaHandTiming ? 'translate-x-4' : 'translate-x-0.5'
                                  }`} />
                                </button>
                              )}
                            </td>

                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 items-center pt-1">
        <span className="flex gap-1.5 items-center">
          <span className="bg-blue-100 text-blue-700 font-bold text-[9px] px-1.5 py-0.5 rounded-full">Saringan</span>
          <span className="text-[9px] text-gray-400">= ada perlawanan final</span>
        </span>
        <span className="flex gap-1.5 items-center">
          <span className="bg-amber-100 text-amber-700 font-bold text-[9px] px-1.5 py-0.5 rounded-full">Final</span>
          <span className="text-[9px] text-gray-400">= perlawanan akhir</span>
        </span>
        <span className="flex gap-1.5 items-center">
          <span className="bg-green-100 text-green-700 font-bold text-[9px] px-1.5 py-0.5 rounded-full">Akhir</span>
          <span className="text-[9px] text-gray-400">= terus ke akhir (tiada saringan)</span>
        </span>
      </div>
    </div>
  )
}

// ─── SlotKhas — Urus slot bukan-acara dalam jadual (perasmian, rehat, dll) ───

const JENIS_SLOT = [
  { key: 'perasmian',         label: '🎖 Perasmian Pembukaan', warna: 'bg-yellow-50 border-yellow-200 text-yellow-800' },
  { key: 'perasmian_penutup', label: '🏁 Perasmian Penutup',  warna: 'bg-yellow-50 border-yellow-200 text-yellow-800' },
  { key: 'rehearsal',         label: '🎬 Rehearsal',           warna: 'bg-purple-50 border-purple-200 text-purple-700' },
  { key: 'hadiah',            label: '🏆 Majlis Hadiah',       warna: 'bg-amber-50 border-amber-200 text-amber-700' },
  { key: 'rehat',             label: '☕ Rehat',               warna: 'bg-orange-50 border-orange-200 text-orange-700' },
  { key: 'solat',             label: '🕌 Solat',               warna: 'bg-green-50 border-green-200 text-green-700' },
  { key: 'lain',              label: '📋 Lain-lain',           warna: 'bg-gray-50 border-gray-200 text-gray-600' },
]

function SlotKhas({ schoolId, kejId, tarikhHari }) {
  const kejohananId = kejId
  const [slots,   setSlots]   = useState([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [form,    setForm]    = useState({ masa: '', perkara: '', jenis: 'perasmian' })
  const [editId,  setEditId]  = useState(null)
  const [err,     setErr]     = useState('')

  async function fetchSlots() {
    setLoading(true)
    try {
      const sPath = slotColPath(schoolId, kejId)
      const snap  = await getDocs(query(
        collection(db, sPath),
        where('tarikhAcara', '==', tarikhHari)
      ))
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (a.masa || '').localeCompare(b.masa || ''))
      setSlots(list)
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { if (schoolId && kejId && tarikhHari) fetchSlots() }, [schoolId, kejId, tarikhHari])

  async function handleSave() {
    if (!form.masa || !form.perkara.trim()) { setErr('Masa dan perkara wajib diisi'); return }
    setSaving(true); setErr('')
    try {
      const sPath = slotColPath(schoolId, kejId)
      const data  = { tarikhAcara: tarikhHari, masa: form.masa, perkara: form.perkara.trim(), jenis: form.jenis, updatedAt: serverTimestamp() }
      if (editId) {
        await updateDoc(doc(db, sPath, editId), data)
      } else {
        await setDoc(doc(collection(db, sPath)), data)
      }
      setForm({ masa: '', perkara: '', jenis: 'perasmian' })
      setEditId(null)
      await fetchSlots()
    } catch(e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  async function handleDelete(id) {
    if (!window.confirm('Padam slot ini?')) return
    await deleteDoc(doc(db, slotColPath(schoolId, kejId), id))
    await fetchSlots()
  }

  function startEdit(s) {
    setEditId(s.id)
    setForm({ masa: s.masa, perkara: s.perkara, jenis: s.jenis || 'lain' })
  }

  return (
    <div className="space-y-4">
      {/* Form tambah/edit */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
        <p className="text-xs font-bold text-gray-600">{editId ? 'Edit Slot' : 'Tambah Slot Baru'}</p>
        <div className="flex gap-3 flex-wrap">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase">Masa</label>
            <input type="time" value={form.masa} onChange={e => setForm(p => ({ ...p, masa: e.target.value }))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#003399]/25" />
          </div>
          <div className="flex-1 min-w-40">
            <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase">Perkara</label>
            <input type="text" value={form.perkara} onChange={e => setForm(p => ({ ...p, perkara: e.target.value }))}
              placeholder="cth: Perasmian Pembukaan, Rehat 30 minit..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#003399]/25" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase">Jenis</label>
            <select value={form.jenis} onChange={e => setForm(p => ({ ...p, jenis: e.target.value }))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#003399]/25">
              {JENIS_SLOT.map(j => <option key={j.key} value={j.key}>{j.label}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 bg-[#003399] text-white text-xs font-bold rounded-lg hover:bg-[#002288] disabled:opacity-50">
              {saving ? 'Simpan…' : editId ? 'Kemaskini' : 'Tambah'}
            </button>
            {editId && (
              <button onClick={() => { setEditId(null); setForm({ masa: '', perkara: '', jenis: 'perasmian' }) }}
                className="px-4 py-2 bg-gray-100 text-gray-500 text-xs font-bold rounded-lg hover:bg-gray-200">
                Batal
              </button>
            )}
          </div>
        </div>
        {err && <p className="text-[11px] text-red-500">{err}</p>}
      </div>

      {/* Senarai slot */}
      {loading ? (
        <p className="text-xs text-gray-400 text-center py-4">Memuatkan…</p>
      ) : slots.length === 0 ? (
        <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center">
          <p className="text-xs text-gray-400">Tiada slot khas untuk hari ini.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {slots.map(s => {
            const jObj = JENIS_SLOT.find(j => j.key === s.jenis) || JENIS_SLOT[3]
            return (
              <div key={s.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${jObj.warna}`}>
                <span className="font-mono font-bold text-sm shrink-0">{s.masa || '—'}</span>
                <span className="text-xs font-semibold flex-1">{jObj.label} — {s.perkara}</span>
                <button onClick={() => startEdit(s)} className="text-[10px] font-bold text-gray-500 hover:text-[#003399] px-2 py-1 hover:bg-white/60 rounded">Edit</button>
                <button onClick={() => handleDelete(s.id)} className="text-[10px] font-bold text-red-400 hover:text-red-600 px-2 py-1 hover:bg-white/60 rounded">Padam</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Halaman Utama ────────────────────────────────────────────────────────────

export default function AcaraSetup() {
  const navigate   = useNavigate()
  const { userData, logout } = useAuth()
  const isSuperadmin = userData?.role === 'superadmin'

  // Resolve schoolId + kejId dari sessionStorage
  const ctx      = getKejContext()
  const schoolId = ctx.schoolId || ''
  const kejId    = ctx.id       || ''
  const namaKej  = ctx.namaKejohanan || ctx.nama || ''

  // Guard — jika tiada konteks
  if (!schoolId || !kejId) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm text-gray-500 font-semibold">Tiada kejohanan dipilih. Sila kembali ke dashboard.</p>
        <button onClick={() => navigate('/admin')}
          className="px-4 py-2 bg-[#003399] text-white text-xs font-bold rounded-lg hover:bg-[#002288]">
          ← Balik Dashboard
        </button>
      </div>
    )
  }

  const selectedKej = kejId // alias untuk keserasian dalaman

  const [acaraList, setAcaraList]         = useState([])
  const [kategoriList, setKategoriList]   = useState([])
  const [loading, setLoading]             = useState(false)
  const [modal, setModal]                 = useState(null)
  const [delTarget, setDelTarget]         = useState(null)

  // Filters
  const [filterJenis, setFilterJenis]     = useState('semua')
  const [filterKat, setFilterKat]         = useState('semua')
  const [filterJantina, setFilterJantina] = useState('semua')
  const [search, setSearch]               = useState('')
  const [viewMode, setViewMode]           = useState('hari') // 'hari' | 'senarai'

  // Sticky date — ingat tarikh terakhir admin guna
  const [lastDate, setLastDate]           = useState('')

  // Inline edit row
  const [editingRow, setEditingRow]       = useState(null) // noAcara string
  const [renamingRow, setRenamingRow]     = useState(null) // noAcara string — ubah no
  const [renameVal, setRenameVal]         = useState('')
  const [renaming, setRenaming]           = useState(false)
  const [renameErr, setRenameErr]         = useState('')

  // Tab utama
  const [activeTab, setActiveTab]         = useState('setup') // 'setup' | 'semak'

  // Inline add row per hari
  const [addingHari, setAddingHari]       = useState(null) // tarikhAcara string
  const [extraHari, setExtraHari]         = useState([])   // tarikh[] — hari baru kosong
  const [newHariInput, setNewHariInput]   = useState('')
  const [showNewHari, setShowNewHari]     = useState(false)

  // ── Load kategori dari tenant path ───────────────────────────────────────────
  const fetchKategori = useCallback(async () => {
    if (!schoolId || !kejId) return
    try {
      const snap = await getDocs(collection(db, katColPath(schoolId, kejId)))
      const list = snap.docs.map(d => {
        const data = d.data()
        return { id: d.id, ...data, kod: data.kod || d.id }
      })
      list.sort((a, b) => (Number(a.urutan) || 99) - (Number(b.urutan) || 99))
      setKategoriList(list)
    } catch { /* kekal list lama jika gagal */ }
  }, [schoolId, kejId])

  useEffect(() => { fetchKategori() }, [fetchKategori])

  // Fetch acara dari tenant path
  const fetchAcara = useCallback(async () => {
    if (!schoolId || !kejId) { setAcaraList([]); return }
    setLoading(true)
    fetchKategori()
    try {
      const snap = await getDocs(collection(db, acaraColPath(schoolId, kejId)))
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => {
        const na = Number(a.noAcara || a.id) || 0
        const nb = Number(b.noAcara || b.id) || 0
        return na - nb
      })
      setAcaraList(list)
    } catch { setAcaraList([]) } finally { setLoading(false) }
  }, [schoolId, kejId, fetchKategori])

  useEffect(() => { fetchAcara() }, [fetchAcara])

  // Kemaskini kategoriKod inline — tanpa reload penuh
  function handleKatUpdated(aceraKey, newKod, newKelas, newNama) {
    setAcaraList(l => l.map(a =>
      (a.noAcara || a.aceraId || a.id) === String(aceraKey)
        ? { ...a, kategoriKod: newKod, kelas: newKelas, namaAcara: newNama }
        : a
    ))
  }

  // Kemaskini hadAtletPerSekolah + adaHandTiming inline — tanpa reload penuh
  function handleHadUpdated(aceraKey, newVal, newHT, newIndividu) {
    setAcaraList(l => l.map(a => {
      if ((a.noAcara || a.aceraId || a.id) !== String(aceraKey)) return a
      const update = { ...a, hadAtletPerSekolah: newVal }
      if (newHT !== undefined) update.adaHandTiming = newHT
      if (newIndividu !== undefined) update.isIndividu = newIndividu
      return update
    }))
  }

  // Toggle Individu/Berpasukan inline — auto-save
  const [indSaving, setIndSaving] = useState(null)
  async function toggleIndividu(a) {
    const key    = String(a.noAcara || a.aceraId || a.id)
    const newVal = !(a.isIndividu ?? (a.jenisAcara !== 'relay'))
    setIndSaving(key)
    try {
      await updateDoc(doc(db, acaraColPath(schoolId, kejId), key),
        { isIndividu: newVal, updatedAt: serverTimestamp() })
      handleHadUpdated(key, a.hadAtletPerSekolah ?? 2, undefined, newVal)
    } catch (e) { alert('Ralat: ' + e.message) }
    finally { setIndSaving(null) }
  }

  // Tukar tarikh semua acara dalam satu hari (batch)
  async function handleHariTukar(tarikhLama, tarikhBaru, acaraInHari) {
    if (!tarikhBaru || tarikhBaru === tarikhLama) return
    try {
      const aPath  = acaraColPath(schoolId, kejId)
      const chunks = []
      for (let i = 0; i < acaraInHari.length; i += 400) chunks.push(acaraInHari.slice(i, i + 400))
      for (const chunk of chunks) {
        const batch = writeBatch(db)
        for (const a of chunk) {
          const key = String(a.noAcara || a.aceraId || a.id)
          batch.update(doc(db, aPath, key), { tarikhAcara: tarikhBaru, updatedAt: serverTimestamp() })
        }
        await batch.commit()
      }
      setAcaraList(l => l.map(a =>
        a.tarikhAcara === tarikhLama ? { ...a, tarikhAcara: tarikhBaru } : a
      ))
    } catch (e) { alert('Ralat tukar tarikh: ' + e.message) }
  }

  // Toggle aktif
  async function toggleAktif(a) {
    try {
      await updateDoc(doc(db, acaraColPath(schoolId, kejId), a.aceraId),
        { isAktif: !a.isAktif, updatedAt: serverTimestamp() })
      setAcaraList(l => l.map(x => x.aceraId === a.aceraId ? { ...x, isAktif: !x.isAktif } : x))
    } catch (e) { alert(e.message) }
  }

  // ── Ubah No Acara — copy ke doc baru, delete lama ───────────────────────────
  async function handleRenameNo(oldNo) {
    const newNo  = renameVal.trim()
    const aPath  = acaraColPath(schoolId, kejId)
    setRenameErr('')
    if (!newNo || newNo === String(oldNo)) return setRenamingRow(null)
    if (!/^\d+$/.test(newNo)) return setRenameErr('Nombor sahaja')

    const newRef = doc(db, aPath, newNo)
    const snap   = await getDoc(newRef)
    if (snap.exists()) return setRenameErr(`No. ${newNo} sudah wujud`)

    setRenaming(true)
    try {
      const oldRef  = doc(db, aPath, String(oldNo))
      const oldSnap = await getDoc(oldRef)
      if (!oldSnap.exists()) throw new Error('Acara asal tidak dijumpai')
      const oldData = oldSnap.data()

      await setDoc(newRef, { ...oldData, noAcara: newNo, aceraId: newNo, updatedAt: serverTimestamp() })
      await deleteDoc(oldRef)

      setAcaraList(l => l.map(a =>
        String(a.noAcara) === String(oldNo)
          ? { ...a, noAcara: newNo, aceraId: newNo, id: newNo }
          : a
      ))
      setRenamingRow(null)
    } catch (e) {
      setRenameErr(e.message)
    } finally {
      setRenaming(false)
    }
  }

  // Filter
  const filtered = acaraList.filter(a => {
    if (filterJenis !== 'semua' && a.jenisAcara !== filterJenis) return false
    if (filterKat !== 'semua' && a.kategoriKod !== filterKat) return false
    if (filterJantina !== 'semua' && a.jantina !== filterJantina) return false
    if (search) {
      const q = search.toLowerCase()
      return a.namaAcara?.toLowerCase().includes(q) || a.aceraId?.toLowerCase().includes(q)
    }
    return true
  })

  // Derive dari kategoriList (semua kategori dikonfigur) bukan dari acara
  const katOptions = kategoriList.map(k => k.kod).filter(Boolean)

  // Stats
  const stats = {
    total: acaraList.length,
    lorong:   acaraList.filter(a => a.jenisAcara === 'lorong').length,
    padang:   acaraList.filter(a => ['padang_lompat','padang_balin'].includes(a.jenisAcara)).length,
    relay:    acaraList.filter(a => a.jenisAcara === 'relay').length,
    aktif:    acaraList.filter(a => a.isAktif).length,
  }

  return (
    <div className="space-y-4">

      {/* Header kejohanan + butang tambah */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(`/admin/kejohanan/${kejId}`)}
              className="text-gray-400 hover:text-[#003399] transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
            <h1 className="text-lg font-bold text-gray-800">Acara & Jadual</h1>
          </div>
          <p className="text-xs text-gray-400 mt-0.5 ml-6">{namaKej}</p>
        </div>
        <button onClick={() => setModal({ mode: 'add' })}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#003399] text-white text-sm font-bold rounded-xl hover:bg-[#002277] shadow-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Tambah Acara
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'Jumlah',  val: stats.total,  cls: 'text-[#003399]' },
          { label: 'Lorong',  val: stats.lorong, cls: 'text-blue-600'  },
          { label: 'Padang',  val: stats.padang, cls: 'text-green-600' },
          { label: 'Relay',   val: stats.relay,  cls: 'text-purple-600'},
          { label: 'Aktif',   val: stats.aktif,  cls: 'text-emerald-600'},
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-3 text-center shadow-sm">
            <p className={`text-2xl font-black ${s.cls}`}>{s.val}</p>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

    <div className="space-y-4">

      {/* Tab bar */}
      {selectedKej && (
        <div className="flex rounded-xl border border-gray-200 overflow-hidden text-xs bg-white w-fit shadow-sm">
          {[
            { key: 'setup', label: 'Urus Acara' },
            { key: 'semak', label: 'Semak Acara' },
            { key: 'slot',  label: 'Slot Khas' },
            { key: 'final', label: 'Tetapan Final' },
            { key: 'lorong', label: 'Setup Lorong dan Heat' },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-5 py-2.5 font-semibold transition-colors border-r border-gray-200 last:border-r-0 ${
                activeTab === t.key ? 'bg-[#003399] text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab: Semak Acara */}
      {selectedKej && activeTab === 'semak' && (
        <SemakAcara
          acaraList={acaraList}
          kategoriList={kategoriList}
          schoolId={schoolId}
          kejId={kejId}
          namaKej={namaKej}
          onHadUpdated={handleHadUpdated}
        />
      )}

      {/* Tab: Slot Khas */}
      {selectedKej && activeTab === 'slot' && (
        <div className="space-y-5">
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700">
            <p className="font-bold">Slot Khas — Perasmian, Rehat, Solat & Lain-lain</p>
            <p className="text-[11px] text-blue-500 mt-0.5">Slot ini akan muncul dalam paparan jadual di Home bersama acara pertandingan.</p>
          </div>
          {/* Pilih hari */}
          {(() => {
            const tarikhUnik = [...new Set(acaraList.map(a => a.tarikhAcara).filter(Boolean))].sort()
            if (tarikhUnik.length === 0) return <p className="text-xs text-gray-400">Tiada tarikh acara ditemui. Sila setup acara dahulu.</p>
            return (
              <div className="space-y-6">
                {tarikhUnik.map((tarikh, idx) => {
                  const label = new Date(tarikh).toLocaleDateString('ms-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                  return (
                    <div key={tarikh}>
                      <p className="text-xs font-bold text-gray-600 mb-3">Hari {idx + 1} — {label}</p>
                      <SlotKhas schoolId={schoolId} kejId={kejId} tarikhHari={tarikh} />
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      )}

      {/* Tab: Tetapan Final */}
      {selectedKej && activeTab === 'final' && (
        <TetapanFinal kategoriList={kategoriList} schoolId={schoolId} kejId={kejId} />
      )}

      {/* Tab: Setup Lorong dan Heat */}
      {selectedKej && activeTab === 'lorong' && (
        <WaConfigPanel schoolId={schoolId} kejId={kejId} />
      )}

      {selectedKej && activeTab === 'setup' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { label: 'Jumlah',   val: stats.total,  color: 'text-[#003399]', bg: 'bg-blue-50' },
              { label: 'Lorong',   val: stats.lorong, color: 'text-blue-600',  bg: 'bg-blue-50' },
              { label: 'Padang',   val: stats.padang, color: 'text-green-600', bg: 'bg-green-50' },
              { label: 'Relay',    val: stats.relay,  color: 'text-purple-600',bg: 'bg-purple-50' },
              { label: 'Aktif',    val: stats.aktif,  color: 'text-emerald-600',bg: 'bg-emerald-50' },
            ].map(s => (
              <div key={s.label} className={`${s.bg} rounded-xl px-3 py-2.5 text-center`}>
                <p className={`text-xl font-black ${s.color}`}>{s.val}</p>
                <p className="text-[9px] text-gray-500 uppercase tracking-wide">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Filter + View Toggle */}
          <div className="flex flex-wrap gap-2 items-center">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Cari acara…"
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#003399]/25" />

            {/* View mode toggle */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-[10px] bg-white ml-auto">
              {[['hari', 'Ikut Hari'], ['senarai', 'Senarai']].map(([val, lbl]) => (
                <button key={val} onClick={() => setViewMode(val)}
                  className={`px-2.5 py-1.5 font-semibold transition-colors ${viewMode === val ? 'bg-[#003399] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                  {lbl}
                </button>
              ))}
            </div>

            {/* Jenis filter */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-[10px] bg-white">
              {['semua', ...JENIS_ACARA.map(j => j.value)].map(f => (
                <button key={f} onClick={() => setFilterJenis(f)}
                  className={`px-2.5 py-1.5 font-semibold transition-colors ${filterJenis === f ? 'bg-[#003399] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                  {f === 'semua' ? 'Semua' : JENIS_ACARA.find(j => j.value === f)?.short}
                </button>
              ))}
            </div>

            {/* Jantina */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-[10px] bg-white">
              {['semua', 'L', 'P'].map(f => (
                <button key={f} onClick={() => setFilterJantina(f)}
                  className={`px-2.5 py-1.5 font-semibold transition-colors ${filterJantina === f ? 'bg-[#003399] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                  {f === 'semua' ? 'L+P' : f}
                </button>
              ))}
            </div>

            {/* Kategori */}
            {katOptions.length > 0 && (
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-[10px] bg-white">
                {['semua', ...katOptions].map(f => (
                  <button key={f} onClick={() => setFilterKat(f)}
                    className={`px-2.5 py-1.5 font-bold transition-colors ${filterKat === f ? 'bg-[#003399] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                    {f === 'semua' ? 'Kat' : katLabel(f, kategoriList)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* By Hari View */}
          {viewMode === 'hari' && loading && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-12 text-center text-sm text-gray-400">Memuatkan…</div>
          )}
          {viewMode === 'hari' && !loading && (() => {
            const P_BADGE = { saringan:'bg-blue-100 text-blue-700', final:'bg-amber-100 text-amber-700', akhir:'bg-green-100 text-green-700', suku_akhir:'bg-teal-100 text-teal-700', separuh_akhir:'bg-indigo-100 text-indigo-700' }
            const P_LABEL = { saringan:'Saringan', final:'Final', akhir:'Akhir', suku_akhir:'Suku Akhir', separuh_akhir:'Separuh Akhir' }
            // Map parentAcaraId → noAcara (untuk badge → Final: #xxx pada baris saringan)
            const finalMap = {}
            acaraList.forEach(a => {
              if (a.parentAcaraId) finalMap[String(a.parentAcaraId)] = String(a.noAcara)
            })

            // Group by tarikhAcara
            const byHari = {}
            filtered.forEach(a => {
              const t = a.tarikhAcara || 'Tiada Tarikh'
              if (!byHari[t]) byHari[t] = []
              byHari[t].push(a)
            })
            // Gabung dengan extraHari (hari baru kosong) + addingHari jika tarikh baru
            const allTarikh = [...new Set([
              ...Object.keys(byHari).sort(),
              ...extraHari,
              ...(addingHari && !byHari[addingHari] && !extraHari.includes(addingHari) ? [addingHari] : []),
            ])].sort()

            const TABLE_HEAD = ['No','Masa','Acara','Kat','J','Jenis','Lokasi','Max/Skl','Peringkat','Had','Tindakan']

            if (allTarikh.length === 0 && !showNewHari) return (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-16 text-center space-y-3">
                <p className="text-sm text-gray-400">Tiada acara lagi.</p>
                <button onClick={() => setShowNewHari(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#003399] text-white text-xs font-bold rounded-lg hover:bg-[#002288]">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                  Tambah Hari Pertama
                </button>
              </div>
            )

            return (
              <div className="space-y-3">
                {allTarikh.map((tarikh, hIdx) => {
                  const hariLabel = tarikh === 'Tiada Tarikh' ? 'Tiada Tarikh' : (() => {
                    const d = new Date(tarikh)
                    return d.toLocaleDateString('ms-MY', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
                  })()
                  const hariRows = (byHari[tarikh] || []).sort((a, b) => Number(a.noAcara || 0) - Number(b.noAcara || 0))
                  const isAdding = addingHari === tarikh

                  return (
                    <div key={tarikh} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                      <HariHeader
                        hIdx={hIdx} tarikh={tarikh} hariLabel={hariLabel} count={hariRows.length}
                        onTukar={(tarikhBaru) => handleHariTukar(tarikh, tarikhBaru, hariRows)}
                      />
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-100 bg-gray-50">
                              {TABLE_HEAD.map(h => (
                                <th key={h} className="px-3 py-2 text-[9px] font-bold text-gray-400 uppercase text-left first:w-12">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {hariRows.map(a => {
                              const rowKey = String(a.noAcara || a.id)
                              if (editingRow === rowKey) {
                                return (
                                  <EditAcaraRow
                                    key={rowKey}
                                    acara={a}
                                    schoolId={schoolId}
                                    kejId={kejId}
                                    kategoriList={kategoriList}
                                    acaraList={acaraList}
                                    onSaved={(updated) => {
                                      setAcaraList(l => l.map(x =>
                                        String(x.noAcara || x.id) === rowKey ? { ...x, ...updated } : x
                                      ))
                                      setEditingRow(null)
                                      fetchAcara() // refresh supaya final baru muncul
                                    }}
                                    onCancel={() => setEditingRow(null)}
                                  />
                                )
                              }
                              return (
                                <tr key={rowKey} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${!a.isAktif ? 'opacity-50' : ''}`}>
                                  <td className="px-2 py-1.5 w-14">
                                    {renamingRow === rowKey ? (
                                      <div className="flex flex-col gap-0.5">
                                        <div className="flex items-center gap-0.5">
                                          <input
                                            autoFocus
                                            type="text" inputMode="numeric"
                                            value={renameVal}
                                            onChange={e => { setRenameVal(e.target.value.replace(/\D/g,'')); setRenameErr('') }}
                                            onKeyDown={e => {
                                              if (e.key === 'Enter') handleRenameNo(rowKey)
                                              if (e.key === 'Escape') { setRenamingRow(null); setRenameErr('') }
                                            }}
                                            className="w-12 text-center text-[10px] font-black text-[#003399] border border-[#003399]/40 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#003399]"
                                          />
                                          <button onClick={() => handleRenameNo(rowKey)} disabled={renaming}
                                            className="p-0.5 bg-[#003399] text-white rounded hover:bg-[#002288] disabled:opacity-40">
                                            {renaming
                                              ? <svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                                              : <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                                            }
                                          </button>
                                          <button onClick={() => { setRenamingRow(null); setRenameErr('') }}
                                            className="p-0.5 text-gray-400 hover:text-red-500 border border-gray-200 rounded hover:border-red-300">
                                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                                          </button>
                                        </div>
                                        {renameErr && <p className="text-[8px] text-red-500 font-semibold">{renameErr}</p>}
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-0.5 group">
                                        <span className="font-black text-[#003399] text-xs">{a.noAcara}</span>
                                        <button
                                          onClick={() => { setRenamingRow(rowKey); setRenameVal(String(a.noAcara)); setRenameErr(''); setEditingRow(null) }}
                                          title="Ubah No. Acara"
                                          className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-300 hover:text-[#003399] transition-all">
                                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a4 4 0 01-2.828 1.172H7v-2a4 4 0 011.172-2.828z"/></svg>
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 font-mono text-gray-600">{a.masa || '—'}</td>
                                  <td className="px-3 py-2">
                                    <p className="font-bold text-gray-800">{a.namaAcara}</p>
                                    {a.parentAcaraId && (
                                      <p className="text-[9px] text-purple-600 font-semibold">Final ← #{a.parentAcaraId}</p>
                                    )}
                                    {a.peringkat === 'saringan' && finalMap[String(a.noAcara)] && (
                                      <p className="text-[9px] text-purple-500 font-semibold">→ Final: #{finalMap[String(a.noAcara)]}</p>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <KatCell acara={a} schoolId={schoolId} kejId={kejId} kategoriList={kategoriList} onUpdated={handleKatUpdated} />
                                  </td>
                                  <td className="px-3 py-2 text-center"><JantinaBadge jantina={a.jantina} /></td>
                                  <td className="px-3 py-2"><JenisBadge jenis={a.jenisAcara} /></td>
                                  <td className="px-3 py-2 text-gray-500 text-[10px]">{a.lokasi || '—'}</td>
                                  <td className="px-3 py-2 text-center">
                                    <HadCell acara={a} schoolId={schoolId} kejId={kejId} onUpdated={handleHadUpdated} />
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${P_BADGE[a.peringkat] || 'bg-green-100 text-green-700'}`}>
                                      {P_LABEL[a.peringkat] || 'Terus Final'}
                                    </span>
                                  </td>
                                  {/* Had — Individu/Berpasukan (klik untuk toggle) */}
                                  <td className="px-3 py-2 text-center">
                                    {indSaving === rowKey ? (
                                      <svg className="w-3.5 h-3.5 animate-spin text-gray-400 mx-auto" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                                      </svg>
                                    ) : (
                                      <button onClick={() => toggleIndividu(a)} title="Klik untuk tukar Individu/Berpasukan"
                                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full border transition-all hover:opacity-70 ${
                                          (a.isIndividu ?? (a.jenisAcara !== 'relay'))
                                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                                            : 'bg-purple-50 text-purple-700 border-purple-200'
                                        }`}>
                                        {(a.isIndividu ?? (a.jenisAcara !== 'relay')) ? 'Individu' : 'Berpasukan'}
                                      </button>
                                    )}
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex justify-center gap-1">
                                      <button onClick={() => setEditingRow(rowKey)}
                                        className="p-1 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors" title="Edit baris ini">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                                      </button>
                                      <button onClick={() => setDelTarget(a)}
                                        className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}

                            {/* Inline Add Row */}
                            {isAdding && (
                              <AddAcaraRow
                                tarikhAcara={tarikh}
                                schoolId={schoolId}
                                kejId={kejId}
                                kategoriList={kategoriList}
                                acaraList={acaraList}
                                onSaved={(t) => {
                                  setAddingHari(null)
                                  setExtraHari(h => h.filter(x => x !== tarikh))
                                  setLastDate(t)
                                  fetchAcara()
                                }}
                                onCancel={() => {
                                  setAddingHari(null)
                                  setExtraHari(h => h.filter(x => x !== tarikh))
                                }}
                              />
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* + Tambah Acara button */}
                      {!isAdding && (
                        <button
                          onClick={() => setAddingHari(tarikh)}
                          className="w-full flex items-center justify-center gap-1.5 py-2 text-[10px] font-bold text-[#003399] hover:bg-blue-50 border-t border-dashed border-[#003399]/20 transition-colors">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                          Tambah Acara Hari {hIdx + 1}
                        </button>
                      )}
                    </div>
                  )
                })}

                {/* Tambah Hari Baru */}
                <div className="flex items-center justify-center">
                  {showNewHari ? (
                    <div className="flex items-center gap-2 bg-white border border-[#003399]/20 rounded-xl px-4 py-3 shadow-sm">
                      <svg className="w-4 h-4 text-[#003399]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                      <span className="text-xs font-bold text-gray-600">Tarikh hari baru:</span>
                      <input type="date" value={newHariInput}
                        onChange={e => setNewHariInput(e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#003399]/25" />
                      <button
                        disabled={!newHariInput}
                        onClick={() => {
                          if (newHariInput) {
                            setExtraHari(h => [...new Set([...h, newHariInput])])
                            setAddingHari(newHariInput)
                            setShowNewHari(false)
                            setNewHariInput('')
                          }
                        }}
                        className="px-3 py-1.5 text-xs font-bold bg-[#003399] text-white rounded-lg hover:bg-[#002288] disabled:opacity-40">
                        Buat Hari Ini
                      </button>
                      <button onClick={() => { setShowNewHari(false); setNewHariInput('') }}
                        className="text-xs text-gray-400 hover:text-gray-600">Batal</button>
                    </div>
                  ) : (
                    <button onClick={() => setShowNewHari(true)}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-[#003399] border border-dashed border-[#003399]/30 rounded-xl hover:bg-blue-50 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                      + Tambah Hari Baru
                    </button>
                  )}
                </div>
              </div>
            )
          })()}

          {/* Senarai View (Table) */}
          {viewMode === 'senarai' && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {loading ? (
              <div className="py-12 text-center text-sm text-gray-400">Memuatkan…</div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-gray-400">{acaraList.length === 0 ? 'Tiada acara. Tambah atau muat masuk standard MSSM.' : 'Tiada hasil carian.'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-3 py-2.5 text-left text-[9px] font-bold text-gray-400 uppercase tracking-wide">Acara</th>
                      <th className="px-3 py-2.5 text-center text-[9px] font-bold text-gray-400 uppercase tracking-wide">Kat</th>
                      <th className="px-3 py-2.5 text-center text-[9px] font-bold text-gray-400 uppercase tracking-wide">J</th>
                      <th className="px-3 py-2.5 text-left text-[9px] font-bold text-gray-400 uppercase tracking-wide">Jenis</th>
                      <th className="px-3 py-2.5 text-center text-[9px] font-bold text-gray-400 uppercase tracking-wide">Finalis</th>
                      <th className="px-3 py-2.5 text-center text-[9px] font-bold text-gray-400 uppercase tracking-wide">Max/Skl</th>
                      <th className="px-3 py-2.5 text-center text-[9px] font-bold text-gray-400 uppercase tracking-wide">Angin</th>
                      <th className="px-3 py-2.5 text-center text-[9px] font-bold text-gray-400 uppercase tracking-wide">Status</th>
                      <th className="px-3 py-2.5 text-center text-[9px] font-bold text-gray-400 uppercase tracking-wide">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(a => (
                      <tr key={a.id} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${!a.isAktif ? 'opacity-50' : ''}`}>
                        <td className="px-3 py-2.5">
                          <p className="font-bold text-gray-800">{a.namaAcara}</p>
                          <p className="text-[9px] font-mono text-gray-400 mt-0.5">{a.aceraId}</p>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <KatCell acara={a} kejohananId={selectedKej} kategoriList={kategoriList} onUpdated={handleKatUpdated} />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <JantinaBadge jantina={a.jantina} />
                        </td>
                        <td className="px-3 py-2.5">
                          <JenisBadge jenis={a.jenisAcara} />
                        </td>
                        <td className="px-3 py-2.5 text-center text-gray-600">
                          {a.bilanganFinalis ?? '—'}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <HadCell acara={a} kejohananId={selectedKej} onUpdated={handleHadUpdated} />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {a.isWindReading
                            ? <span className="text-blue-500 font-bold text-[10px]">✓ Wajib</span>
                            : <span className="text-gray-300 text-[10px]">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button onClick={() => toggleAktif(a)}>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full cursor-pointer ${
                              a.isAktif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                            }`}>{a.isAktif ? 'Aktif' : 'Nyahaktif'}</span>
                          </button>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex justify-center gap-1">
                            <button onClick={() => setModal({ mode: 'edit', data: a })}
                              className="p-1 text-gray-400 hover:text-[#003399] hover:bg-blue-50 rounded transition-colors">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button onClick={() => setDelTarget(a)}
                              className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          )}

          {/* Had Peserta Bundle */}
          <HadPesertaPanel acaraList={acaraList} schoolId={schoolId} kejId={kejId} onRefresh={fetchAcara} kategoriList={kategoriList} />
        </>
      )}


      {/* Modals */}
      {modal?.mode === 'add' && (
        <AcaraModal mode="add" schoolId={schoolId} kejId={kejId} kategoriList={kategoriList}
          defaultTarikh={lastDate}
          onClose={() => setModal(null)}
          onSaved={(tarikh) => { if (tarikh) setLastDate(tarikh); fetchAcara() }} />
      )}
      {modal?.mode === 'edit' && (
        <AcaraModal mode="edit" initial={modal.data} schoolId={schoolId} kejId={kejId} kategoriList={kategoriList}
          onClose={() => setModal(null)} onSaved={fetchAcara} />
      )}
      {delTarget && (
        <DeleteModal acara={delTarget} schoolId={schoolId} kejId={kejId}
          onClose={() => setDelTarget(null)} onDeleted={fetchAcara} />
      )}
    </div>
    </div>
  )
}
