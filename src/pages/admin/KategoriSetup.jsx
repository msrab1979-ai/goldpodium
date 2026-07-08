/**
 * KategoriSetup — /admin/kejohanan/:kejId/kategori
 *
 * Gold Podium — multi-tenant. Semua data disimpan di bawah:
 *   tenants/{schoolId}/kejohanan/{kejId}/kategori/{kodKategori}
 *   tenants/{schoolId}/kejohanan/{kejId}/tetapan/finalSetup
 *   tenants/{schoolId}/kejohanan/{kejId}/acara/{acaraId}
 *
 * Standard MSSD / MSSM Malaysia — 4 lapisan had penyertaan:
 *
 *  1. KUOTA ATLET PER SEKOLAH
 *  2. HAD ACARA INDIVIDU PER ATLET
 *  3. HAD ACARA BEREGU / RELAY PER ATLET
 *  4. KUOTA PASUKAN BERKUMPULAN PER SEKOLAH
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc,
  serverTimestamp, query, orderBy, getDoc, where,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'

const JENIS_DEFAULTS = ['SR', 'SM', 'PPKI']

const EMPTY_FORM = {
  kod: '', label: '', nama: '', jenisSekolah: 'SR',
  umurHad: '', umurMin: '',
  hadAtletL: 15, hadAtletP: 15,
  hadAcaraIndividu: 3, hadAcaraBeregu: 2,
  hadPasukanL: 1, hadPasukanP: 1, saizPasukan: 4,
  warna: '#1d4ed8', urutan: 99,
  catatan: '', isAktif: true,
}

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-[#003399]/25 focus:border-[#003399] bg-gray-50'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getKejContext() {
  try {
    const raw = sessionStorage.getItem('gp_kej_aktif')
    if (!raw) return {}
    return JSON.parse(raw)
  } catch { return {} }
}

function katPath(schoolId, kejId) {
  return `tenants/${schoolId}/kejohanan/${kejId}/kategori`
}

function tahunLahirLabel(umurHad, umurMin, tahun) {
  if (!umurHad) return '—'
  const t = tahun || new Date().getFullYear()
  // MSSM standard cut-off 2 Januari:
  //   paling tua layak  = 2 Jan (t - umurHad)
  //   paling muda layak = tarikhTerkini - 1 hari = 31 Dis (t - umurMin)
  const fmt = d => d.toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' })
  const terawal = fmt(new Date(`${t - Number(umurHad)}-01-02`))
  if (!umurMin) return `≥ ${terawal}`
  const terkiniExcl = new Date(`${t - Number(umurMin) + 1}-01-01`)
  const terkini = fmt(new Date(terkiniExcl.getTime() - 86400000))
  return `${terawal} – ${terkini}`
}

function FormField({ label, hint, children, required }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

function DualField({ labelL, labelP, valL, valP, onL, onP, suffix = '', hint }) {
  return (
    <div>
      {hint && <p className="text-[10px] text-gray-400 mb-1">{hint}</p>}
      <div className="flex gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-4 h-4 rounded-full bg-blue-100 text-[8px] font-black text-blue-700 flex items-center justify-center">L</span>
            <span className="text-[10px] text-gray-500">{labelL}</span>
          </div>
          <div className="relative">
            <input type="number" min={0} value={valL} onChange={e => onL(e.target.value)}
              className={inputCls + ' pr-10'} />
            {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">{suffix}</span>}
          </div>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-4 h-4 rounded-full bg-pink-100 text-[8px] font-black text-pink-700 flex items-center justify-center">P</span>
            <span className="text-[10px] text-gray-500">{labelP}</span>
          </div>
          <div className="relative">
            <input type="number" min={0} value={valP} onChange={e => onP(e.target.value)}
              className={inputCls + ' pr-10'} />
            {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">{suffix}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── KategoriTable ────────────────────────────────────────────────────────────

function KategoriTable({ items, tahun, onEdit, onDelete, onToggle }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wide">
            <th className="px-3 py-3 text-left w-12">Kod</th>
            <th className="px-3 py-3 text-left">Nama</th>
            <th className="px-3 py-3 text-left">Kelayakan</th>
            <th className="px-3 py-3 text-center">
              Atlet / Sekolah
              <p className="text-[9px] font-normal normal-case text-gray-300 mt-0.5">L | P</p>
            </th>
            <th className="px-3 py-3 text-center">
              Individu
              <p className="text-[9px] font-normal normal-case text-gray-300 mt-0.5">acara/atlet</p>
            </th>
            <th className="px-3 py-3 text-center">
              Berkump.
              <p className="text-[9px] font-normal normal-case text-gray-300 mt-0.5">acara/atlet</p>
            </th>
            <th className="px-3 py-3 text-center">
              Pasukan
              <p className="text-[9px] font-normal normal-case text-gray-300 mt-0.5">L | P | saiz</p>
            </th>
            <th className="px-3 py-3 text-center w-14">Aktif</th>
            <th className="px-3 py-3 w-16"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((k, i) => {
            const tLabel = tahunLahirLabel(k.umurHad, k.umurMin, tahun)
            return (
              <tr key={k.id}
                className={`border-b border-gray-50 last:border-0 transition-colors hover:bg-blue-50/20 ${
                  !k.isAktif ? 'opacity-50' : ''
                } ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>

                <td className="px-3 py-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-black text-sm shadow-sm"
                    style={{ backgroundColor: k.warna }}>
                    {k.label || k.kod}
                  </div>
                </td>

                <td className="px-3 py-3 min-w-[140px]">
                  <p className="font-semibold text-gray-800 leading-tight">{k.nama}</p>
                  {k.catatan && (
                    <p className="text-[10px] text-gray-400 mt-0.5 italic">{k.catatan}</p>
                  )}
                </td>

                <td className="px-3 py-3 min-w-[120px]">
                  {k.umurHad ? (
                    <p className="text-[10px] font-semibold text-indigo-700">{tLabel}</p>
                  ) : (
                    <span className="text-[10px] text-gray-400">—</span>
                  )}
                </td>

                <td className="px-3 py-3 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <div className="flex items-center gap-0.5">
                      <span className="w-4 h-4 rounded-full bg-blue-100 text-[8px] font-black text-blue-700 flex items-center justify-center">L</span>
                      <span className="font-bold text-gray-700">{k.hadAtletL ?? '—'}</span>
                    </div>
                    <span className="text-gray-300">|</span>
                    <div className="flex items-center gap-0.5">
                      <span className="w-4 h-4 rounded-full bg-pink-100 text-[8px] font-black text-pink-700 flex items-center justify-center">P</span>
                      <span className="font-bold text-gray-700">{k.hadAtletP ?? '—'}</span>
                    </div>
                  </div>
                </td>

                <td className="px-3 py-3 text-center">
                  <span className="text-base font-black text-green-700">{k.hadAcaraIndividu ?? '—'}</span>
                </td>

                <td className="px-3 py-3 text-center">
                  <span className="text-base font-black text-purple-700">{k.hadAcaraBeregu ?? '—'}</span>
                </td>

                <td className="px-3 py-3 text-center">
                  <div className="flex items-center justify-center gap-1 text-[11px] text-gray-600">
                    <span className="w-4 h-4 rounded-full bg-blue-100 text-[8px] font-black text-blue-700 flex items-center justify-center">L</span>
                    <span className="font-semibold">{k.hadPasukanL ?? 1}</span>
                    <span className="text-gray-300">|</span>
                    <span className="w-4 h-4 rounded-full bg-pink-100 text-[8px] font-black text-pink-700 flex items-center justify-center">P</span>
                    <span className="font-semibold">{k.hadPasukanP ?? 1}</span>
                  </div>
                  <p className="text-[9px] text-gray-400 mt-0.5">{k.saizPasukan ?? 4} atlet/pskmn</p>
                </td>

                <td className="px-3 py-3 text-center">
                  <button onClick={() => onToggle(k)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${k.isAktif ? 'bg-[#003399]' : 'bg-gray-300'}`}>
                    <span className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
                      style={{ transform: k.isAktif ? 'translateX(18px)' : 'translateX(2px)' }} />
                  </button>
                </td>

                <td className="px-3 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => onEdit(k)} title="Edit"
                      className="p-1.5 text-gray-300 hover:text-[#003399] hover:bg-blue-50 rounded-lg transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button onClick={() => onDelete(k)} title="Padam"
                      className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── KategoriModal ────────────────────────────────────────────────────────────

function KategoriModal({ mode, initial, onClose, onSaved, allKod, tahun, jenisValues = [], schoolId, kejId }) {
  const isEdit = mode === 'edit'
  const [form, setForm] = useState(initial || EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const previewTahun = tahunLahirLabel(form.umurHad, form.umurMin, tahun)

  async function handleSave() {
    setErr('')
    const kodBersih = form.kod.trim().toUpperCase().replace(/\s/g, '')
    if (!kodBersih) return setErr('Kod kategori wajib diisi.')
    if (!form.nama.trim()) return setErr('Nama kategori wajib diisi.')
    if (!isEdit && allKod.includes(kodBersih)) return setErr(`Kod "${kodBersih}" sudah wujud.`)
    if (form.umurMin && form.umurHad && Number(form.umurMin) >= Number(form.umurHad))
      return setErr('Umur Min mesti lebih kecil dari Umur Had. Cth: Min=9, Had=12.')

    setSaving(true)
    try {
      const payload = {
        kod: kodBersih, label: form.label.trim(), nama: form.nama.trim(),
        jenisSekolah: form.jenisSekolah,
        umurHad:  form.umurHad  === '' ? null : Number(form.umurHad),
        umurMin:  form.umurMin  === '' ? null : Number(form.umurMin),
        hadAtletL: Number(form.hadAtletL) || 0,
        hadAtletP: Number(form.hadAtletP) || 0,
        hadAcaraIndividu: Number(form.hadAcaraIndividu) || 3,
        hadAcaraBeregu:   Number(form.hadAcaraBeregu)   || 2,
        hadPasukanL:  Number(form.hadPasukanL)  || 1,
        hadPasukanP:  Number(form.hadPasukanP)  || 1,
        saizPasukan:  Number(form.saizPasukan)  || 4,
        warna: form.warna || '#1d4ed8',
        urutan: Number(form.urutan) || 99,
        catatan: form.catatan || '',
        isAktif: form.isAktif,
        updatedAt: serverTimestamp(),
      }

      const base = katPath(schoolId, kejId)

      if (!isEdit) {
        payload.createdAt = serverTimestamp()
        await setDoc(doc(db, base, kodBersih), payload)
      } else {
        const oldKod = initial.kod
        if (kodBersih !== oldKod) {
          const chk = await getDoc(doc(db, base, kodBersih))
          if (chk.exists()) { setErr(`Kod "${kodBersih}" sudah wujud.`); setSaving(false); return }
          await setDoc(doc(db, base, kodBersih), { ...payload, createdAt: initial.createdAt || serverTimestamp() })
          await deleteDoc(doc(db, base, oldKod))
        } else {
          await updateDoc(doc(db, base, kodBersih), payload)
        }
      }
      onSaved(); onClose()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[94vh] flex flex-col">

        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-sm font-bold text-gray-800">{isEdit ? 'Edit Kategori' : 'Tambah Kategori'}</h2>
            <p className="text-[10px] text-gray-400 mt-0.5">Standard MSSD / MSSM Malaysia</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

          {/* ── BAHAGIAN 1: Maklumat Asas ── */}
          <div>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3 pb-1 border-b border-gray-100">
              1 — Maklumat Asas
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <FormField label="Kod" required hint={isEdit ? 'Kod tidak boleh ditukar selepas dicipta.' : 'Tanpa ruang. Cth: A, B, C'}>
                  <input value={form.kod}
                    onChange={e => !isEdit && set('kod', e.target.value.replace(/\s/g, '').toUpperCase())}
                    placeholder="A" className={inputCls + (isEdit ? ' bg-gray-100 text-gray-400 cursor-not-allowed' : '')}
                    maxLength={8} readOnly={isEdit} />
                </FormField>
                <FormField label="Label Paparan" hint="Ganti kod dalam paparan. Cth: L12, P15">
                  <input value={form.label}
                    onChange={e => set('label', e.target.value.replace(/\s/g, '').toUpperCase())}
                    placeholder="L12" className={inputCls}
                    maxLength={10} />
                </FormField>
                <FormField label="Urutan">
                  <input type="number" min={1} value={form.urutan}
                    onChange={e => set('urutan', e.target.value)} className={inputCls} />
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Nama Kategori" required>
                  <input value={form.nama} onChange={e => set('nama', e.target.value)}
                    placeholder="Kategori A" className={inputCls} />
                </FormField>
                <FormField label="Warna Label">
                  <input type="color" value={form.warna} onChange={e => set('warna', e.target.value)}
                    className="w-full h-[38px] rounded-lg cursor-pointer border border-gray-200" />
                </FormField>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
                  Jenis Institusi<span className="text-red-500 ml-0.5">*</span>
                </label>
                <input
                  type="text"
                  value={form.jenisSekolah}
                  onChange={e => set('jenisSekolah', e.target.value.toUpperCase())}
                  placeholder="cth: SR, SM, PPKI, IPT..."
                  className={inputCls}
                  autoComplete="off"
                />
                {/* Panduan ringkas untuk tenant */}
                <div className="mt-2 p-2.5 rounded-lg bg-blue-50/60 border border-blue-100 text-[10px] leading-relaxed text-gray-600">
                  <p className="font-bold text-[#003399] mb-0.5">💡 Panduan:</p>
                  <p>Contoh nilai: <span className="font-bold">SR</span> (Sekolah Rendah), <span className="font-bold">SM</span> (Sekolah Menengah), <span className="font-bold">PPKI</span>, <span className="font-bold">IPT</span>, <span className="font-bold">KOLEJ</span>.</p>
                  <p className="mt-1">Guna <strong>kod pendek</strong> dan <strong>konsisten</strong> — kategori dengan kod sama akan dikumpulkan bersama dalam paparan medal tally &amp; laporan.</p>
                </div>
                {form.jenisSekolah && (
                  <p className="text-[10px] text-gray-400 mt-1.5">
                    Nilai semasa: <span className="font-bold text-gray-700">{form.jenisSekolah}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── BAHAGIAN 2: Had Umur & Kelayakan ── */}
          <div>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3 pb-1 border-b border-gray-100">
              2 — Had Umur & Kelayakan
            </p>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Umur Min" hint="Tahun. Kosong = tiada had bawah">
                <input type="number" min={1} max={25} value={form.umurMin}
                  onChange={e => set('umurMin', e.target.value)} placeholder="9" className={inputCls} />
              </FormField>
              <FormField label="Umur Had" required hint="Tahun. Cth: 12">
                <input type="number" min={1} max={25} value={form.umurHad}
                  onChange={e => set('umurHad', e.target.value)} placeholder="12" className={inputCls} />
              </FormField>
            </div>
            {form.umurHad && (
              <div className="mt-2 rounded-lg px-3 py-2 flex items-center gap-2 border bg-indigo-50 border-indigo-100">
                <svg className="w-4 h-4 shrink-0 text-indigo-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs font-bold text-indigo-700">{previewTahun}</p>
              </div>
            )}
          </div>

          {/* ── BAHAGIAN 3: Kuota Atlet Per Sekolah ── */}
          <div>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 pb-1 border-b border-gray-100">
              3 — Kuota Atlet Per Sekolah
            </p>
            <p className="text-[10px] text-gray-400 mb-3">
              Jumlah atlet (L/P) yang boleh didaftarkan oleh sesebuah sekolah untuk kategori ini.
              Digunakan semasa pendaftaran untuk menyemak had.
            </p>
            <DualField
              labelL="Lelaki" labelP="Perempuan"
              valL={form.hadAtletL} valP={form.hadAtletP}
              onL={v => set('hadAtletL', v)} onP={v => set('hadAtletP', v)}
              suffix="atlet"
            />
          </div>

          {/* ── BAHAGIAN 4: Had Acara Per Atlet ── */}
          <div>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 pb-1 border-b border-gray-100">
              4 — Had Acara Per Atlet
            </p>
            <p className="text-[10px] text-gray-400 mb-3">
              Maks acara yang boleh disertai oleh <strong>seorang atlet</strong> dalam kategori ini.
              Standard MSSM: individu = 3, berkumpulan = 2.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Acara Individu" hint="Lari pecut, lompat, lontar, dsb.">
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  <input type="number" min={0} value={form.hadAcaraIndividu}
                    onChange={e => set('hadAcaraIndividu', e.target.value)}
                    className={inputCls + ' pl-8'} />
                </div>
              </FormField>
              <FormField label="Acara Berkumpulan / Relay" hint="4×100m, 4×400m, dsb.">
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  <input type="number" min={0} value={form.hadAcaraBeregu}
                    onChange={e => set('hadAcaraBeregu', e.target.value)}
                    className={inputCls + ' pl-8'} />
                </div>
              </FormField>
            </div>
          </div>

          {/* ── BAHAGIAN 5: Pasukan Berkumpulan Per Sekolah ── */}
          <div>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 pb-1 border-b border-gray-100">
              5 — Pasukan Berkumpulan Per Sekolah
            </p>
            <p className="text-[10px] text-gray-400 mb-3">
              Berapa pasukan relay boleh dihantar per sekolah bagi setiap acara berkumpulan.
              Standard = 1 pasukan. Saiz pasukan biasanya 4 atlet (4×100m / 4×400m).
            </p>
            <div className="space-y-3">
              <DualField
                labelL="Pasukan Lelaki" labelP="Pasukan Perempuan"
                valL={form.hadPasukanL} valP={form.hadPasukanP}
                onL={v => set('hadPasukanL', v)} onP={v => set('hadPasukanP', v)}
                suffix="pskmn"
              />
              <FormField label="Saiz Pasukan (atlet per pasukan)" hint="4 untuk 4×100m / 4×400m">
                <input type="number" min={2} max={8} value={form.saizPasukan}
                  onChange={e => set('saizPasukan', e.target.value)} className={inputCls} />
              </FormField>
            </div>
          </div>

          {/* ── BAHAGIAN 6: Catatan & Status ── */}
          <div>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3 pb-1 border-b border-gray-100">
              6 — Catatan & Status
            </p>
            <div className="space-y-3">
              <FormField label="Catatan">
                <input value={form.catatan} onChange={e => set('catatan', e.target.value)}
                  placeholder="Cth: Bawah 12 Tahun — Sekolah Rendah"
                  className={inputCls} />
              </FormField>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div>
                  <p className="text-xs font-semibold text-gray-700">Aktif dalam Kejohanan</p>
                  <p className="text-[10px] text-gray-400">Kategori tidak aktif tidak akan tersenarai semasa pendaftaran acara</p>
                </div>
                <button type="button" onClick={() => set('isAktif', !form.isAktif)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.isAktif ? 'bg-[#003399]' : 'bg-gray-300'}`}>
                  <span className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
                    style={{ transform: form.isAktif ? 'translateX(22px)' : 'translateX(2px)' }} />
                </button>
              </div>
            </div>
          </div>

          {err && <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">{err}</div>}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            Batal
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 text-xs font-bold bg-[#003399] text-white rounded-lg hover:bg-[#002288] transition-colors disabled:opacity-50">
            {saving ? 'Menyimpan…' : isEdit ? 'Kemaskini' : 'Tambah Kategori'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── DeleteModal ──────────────────────────────────────────────────────────────

function DeleteModal({ kategori, onClose, onDeleted, schoolId, kejId }) {
  const [deleting, setDeleting] = useState(false)
  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteDoc(doc(db, katPath(schoolId, kejId), kategori.kod))
      onDeleted(); onClose()
    } catch (e) { alert('Ralat: ' + e.message); setDeleting(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5 text-center">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-sm font-bold text-gray-800 mb-1">Padam Kategori?</h3>
        <p className="text-xs text-gray-500 mb-4">
          Anda akan memadam <strong>{kategori.nama}</strong> ({kategori.kod}). Tindakan ini tidak boleh diundur.
        </p>
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Batal</button>
          <button onClick={handleDelete} disabled={deleting}
            className="flex-1 py-2 text-xs font-bold bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50">
            {deleting ? 'Memadamkan…' : 'Padam'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── TetapanFinal ─────────────────────────────────────────────────────────────

const numCls = 'w-14 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-center ' +
  'focus:outline-none focus:ring-2 focus:ring-[#003399]/25 focus:border-[#003399] bg-gray-50'

const SIFIR_STANDARD = [
  { heat: 1, bh: 8, bt: 0 },
  { heat: 2, bh: 3, bt: 2 },
  { heat: 3, bh: 2, bt: 2 },
  { heat: 4, bh: 1, bt: 4 },
  { heat: 5, bh: 1, bt: 3 },
  { heat: 6, bh: 1, bt: 2 },
]

export function TetapanFinal({ kategoriList, schoolId, kejId }) {
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [dirty,        setDirty]        = useState(false)
  const [acaraList,    setAcaraList]    = useState([])
  const [heatCountMap, setHeatCountMap] = useState({})
  const [pesertaMap,   setPesertaMap]   = useState({})
  const [overrides,    setOverrides]    = useState({})   // SF/biasa → Final
  const [sukuOv,       setSukuOv]       = useState({})   // QF → SF
  const [separuhOv,    setSeparuhOv]    = useState({})   // SF → Final (untuk acara QF)
  const [sfAceraIdMap, setSfAceraIdMap] = useState({})   // QF aceraId → SF aceraId
  const [filterKat,    setFilterKat]    = useState('semua')
  const [expandedKat,  setExpandedKat]  = useState({})

  useEffect(() => {
    if (!schoolId || !kejId) return
    async function init() {
      setLoading(true)
      try {
        const tetapanPath = `tenants/${schoolId}/kejohanan/${kejId}/tetapan`
        const acaraPath = `tenants/${schoolId}/kejohanan/${kejId}/acara`
        const acaraSnap = await getDocs(collection(db, acaraPath))
        const semuaAcara = acaraSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        // Bina map: QF aceraId → SF aceraId (SF ada parentAcaraId + peringkat separuh_akhir)
        const sfMap = {}
        semuaAcara.forEach(a => {
          if (a.peringkat === 'separuh_akhir' && a.parentAcaraId) {
            sfMap[String(a.parentAcaraId)] = a.aceraId || a.id
          }
        })
        setSfAceraIdMap(sfMap)

        const snap = await getDoc(doc(db, tetapanPath, 'finalSetup'))
        if (snap.exists()) {
          setOverrides(snap.data().overrideByAcara || {})
          setSukuOv(snap.data().sukuKeSeparuhByAcara || {})
          // Migrate: key lama (QF aceraId) → key baru (SF aceraId)
          const rawSep = snap.data().separuhKeAkhirByAcara || {}
          const migratedSep = {}
          let needsMigration = false
          Object.entries(rawSep).forEach(([k, v]) => {
            const sfKey = sfMap[k] || k
            if (sfKey !== k) needsMigration = true
            migratedSep[sfKey] = v
          })
          setSeparuhOv(migratedSep)
          // Auto-save migration ke Firestore supaya SchoolLanding dapat key betul
          if (needsMigration) {
            setDoc(doc(db, `tenants/${schoolId}/kejohanan/${kejId}/tetapan`, 'finalSetup'), {
              separuhKeAkhirByAcara: migratedSep,
            }, { merge: true }).catch(() => {})
          }
        }
        // Tapis: exclude acara final child (ada parentAcaraId) — acara biasa (peringkat=akhir, tiada parent) kekal
        const senarai = semuaAcara
          .filter(a => !a.parentAcaraId &&
            a.jenisAcara !== 'mass_start' &&
            a.jenisAcara !== 'padang_lompat' &&
            a.jenisAcara !== 'padang_balin')
          .sort((a, b) => (a.noAcara || 0) - (b.noAcara || 0))
        setAcaraList(senarai)

        // Heat count dari flat heat collection
        const heatSnap = await getDocs(collection(db, `tenants/${schoolId}/kejohanan/${kejId}/heat`)).catch(() => ({ docs: [] }))
        const hm = {}
        heatSnap.docs.forEach(d => {
          const aid = d.data().aceraId
          if (aid) hm[aid] = (hm[aid] || 0) + 1
        })
        setHeatCountMap(hm)

        const pendPath = `tenants/${schoolId}/kejohanan/${kejId}/pendaftaran`
        const pendSnap = await getDocs(collection(db, pendPath))
        const pm = {}
        pendSnap.docs.forEach(d => {
          ;(d.data().acaraIds || []).forEach(id => { pm[id] = (pm[id] || 0) + 1 })
        })
        setPesertaMap(pm)
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    init()
  }, [schoolId, kejId])

  function setOv(aceraId, field, val) {
    setOverrides(prev => ({
      ...prev,
      [aceraId]: { ...(prev[aceraId] || { bestHeat: 1, bestTime: 3 }), [field]: val === '' ? '' : Number(val) }
    }))
    setDirty(true); setSaved(false)
  }

  function setSukuOvField(aceraId, field, val) {
    setSukuOv(prev => ({
      ...prev,
      [aceraId]: { ...(prev[aceraId] || { bestHeat: 0, bestTime: 0 }), [field]: val === '' ? '' : Number(val) }
    }))
    setDirty(true); setSaved(false)
  }

  function setSeparuhOvField(aceraId, field, val) {
    setSeparuhOv(prev => ({
      ...prev,
      [aceraId]: { ...(prev[aceraId] || { bestHeat: 1, bestTime: 3 }), [field]: val === '' ? '' : Number(val) }
    }))
    setDirty(true); setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const clean = {}
      Object.entries(overrides).forEach(([id, v]) => {
        clean[id] = { bestHeat: Number(v.bestHeat) || 0, bestTime: Number(v.bestTime) || 0 }
      })
      const cleanSuku = {}
      Object.entries(sukuOv).forEach(([id, v]) => {
        if (Number(v.bestHeat) > 0 || Number(v.bestTime) > 0)
          cleanSuku[id] = { bestHeat: Number(v.bestHeat) || 0, bestTime: Number(v.bestTime) || 0 }
      })
      const cleanSeparuh = {}
      Object.entries(separuhOv).forEach(([id, v]) => {
        if (Number(v.bestHeat) > 0 || Number(v.bestTime) > 0)
          cleanSeparuh[id] = { bestHeat: Number(v.bestHeat) || 0, bestTime: Number(v.bestTime) || 0 }
      })
      const tetapanPath = `tenants/${schoolId}/kejohanan/${kejId}/tetapan`
      await setDoc(doc(db, tetapanPath, 'finalSetup'), {
        overrideByAcara: clean,
        sukuKeSeparuhByAcara: cleanSuku,
        separuhKeAkhirByAcara: cleanSeparuh,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setDirty(false); setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) { alert('Ralat simpan: ' + e.message) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="py-16 text-center text-sm text-gray-400">Memuatkan…</div>

  const katUnik = [...new Set(acaraList.map(a => a.kategoriKod).filter(Boolean))]
    .map(kod => kategoriList.find(k => k.kod === kod))
    .filter(Boolean)
    .sort((a, b) => (a.urutan || 99) - (b.urutan || 99))

  const acaraTapis = filterKat === 'semua'
    ? acaraList
    : acaraList.filter(a => a.kategoriKod === filterKat)

  const perKat = katUnik.map(kat => ({
    kat,
    acara: acaraTapis.filter(a => a.kategoriKod === kat.kod)
  })).filter(g => g.acara.length > 0)

  return (
    <div className="space-y-5">

      {/* Table Master Sifir */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
          <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">Sifir Rujukan Standard</span>
          <span className="text-[10px] text-gray-400">— panduan set BH / BT</span>
        </div>
        <div className="flex divide-x divide-gray-100">
          <div className="flex-1 p-3">
            <p className="text-[10px] font-bold text-green-700 mb-2">🟢 Mod Best Heat (BH &gt; 0) — 8 ke Final</p>
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-[9px] font-bold text-gray-400 border-b border-gray-100">
                  <th className="pb-1 text-center">Bil Heat</th>
                  <th className="pb-1 text-center">BH/heat</th>
                  <th className="pb-1 text-center">BT</th>
                  <th className="pb-1 text-center">= Final</th>
                  <th className="pb-1 text-center">Formula</th>
                </tr>
              </thead>
              <tbody>
                {SIFIR_STANDARD.map(row => (
                  <tr key={row.heat} className="border-b border-gray-50 last:border-0">
                    <td className="py-1 text-center font-bold text-gray-700">{row.heat}</td>
                    <td className="py-1 text-center font-mono font-bold text-green-700">{row.bh}</td>
                    <td className="py-1 text-center font-mono font-bold text-blue-600">{row.bt}</td>
                    <td className="py-1 text-center font-bold text-gray-800">8</td>
                    <td className="py-1 text-center text-gray-400 font-mono">{row.heat}×{row.bh}+{row.bt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="w-44 p-3 bg-blue-50/40 flex flex-col justify-center">
            <p className="text-[10px] font-bold text-blue-700 mb-2">🔵 Mod Best Time (BH = 0)</p>
            <div className="bg-white border border-blue-100 rounded-lg px-3 py-2 text-center mb-2">
              <p className="font-bold text-base text-blue-600">BH = 0 · BT = 8</p>
            </div>
            <p className="text-[9px] text-blue-500 leading-relaxed">8 masa terbaik dari semua heat — sifir BH tidak digunakan.</p>
          </div>
        </div>
      </div>

      {/* Filter kategori */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Tapis:</span>
        <button onClick={() => setFilterKat('semua')}
          className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-colors ${filterKat === 'semua' ? 'bg-[#003399] text-white border-[#003399]' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
          Semua
        </button>
        {katUnik.map(k => (
          <button key={k.kod} onClick={() => setFilterKat(k.kod)}
            className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-colors ${filterKat === k.kod ? 'text-white border-transparent' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
            style={filterKat === k.kod ? { backgroundColor: k.warna || '#6366f1' } : {}}>
            {k.label || k.kod}
          </button>
        ))}
      </div>

      {acaraList.length === 0 && (
        <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center">
          <p className="text-xs text-gray-400">Tiada acara dalam kejohanan ini. Tambah acara dalam modul Acara terlebih dahulu.</p>
        </div>
      )}

      {perKat.map(({ kat, acara }) => {
        const isOpen    = expandedKat[kat.kod] !== false
        const ovCount   = acara.filter(a => overrides[a.id] || sukuOv[a.id] || separuhOv[a.id]).length
        const warnCount = acara.filter(a => heatCountMap[a.aceraId || a.id] === 0 || !heatCountMap[a.aceraId || a.id]).length

        return (
          <div key={kat.kod} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <button
              onClick={() => setExpandedKat(p => ({ ...p, [kat.kod]: !isOpen }))}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left">
              <span className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[9px] font-black shrink-0"
                style={{ backgroundColor: kat.warna || '#6366f1' }}>{kat.kod}</span>
              <span className="text-xs font-bold text-gray-700 flex-1">{kat.label} — {kat.nama}</span>
              {warnCount > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600">{warnCount} belum heat</span>}
              {ovCount > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600">{ovCount} set</span>}
              <span className="text-[10px] text-gray-300">{acara.length} acara</span>
              <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isOpen && (
              <div className="border-t border-gray-100 divide-y divide-gray-50">
                {acara.map((a, i) => {
                  const aceraKey  = a.aceraId || a.id
                  const n         = heatCountMap[aceraKey] || 0
                  const peserta   = pesertaMap[aceraKey] || 0
                  const isQF      = a.peringkat === 'saringan_qf'
                  const isSF      = a.peringkat === 'separuh_akhir'
                  const belumHeat = n === 0

                  // QF→SF (hanya untuk acara QF)
                  const sukuRow = sukuOv[aceraKey] || {}
                  const sukuBH  = sukuRow.bestHeat !== undefined ? Number(sukuRow.bestHeat) : 1
                  const sukuBT  = sukuRow.bestTime !== undefined ? Number(sukuRow.bestTime) : 3
                  const sukuTotal = n > 0 ? n * sukuBH + sukuBT : null
                  const sukuOk    = sukuTotal === 8

                  // SF→Final (untuk acara QF — kira bilangan heat SF dari heatCountMap)
                  const sfAceraId = sfAceraIdMap[aceraKey] || sfAceraIdMap[String(a.noAcara)] || null
                  const sepRow    = sfAceraId ? (separuhOv[sfAceraId] || {}) : {}
                  const sepBH     = sepRow.bestHeat !== undefined ? Number(sepRow.bestHeat) : 1
                  const sepBT     = sepRow.bestTime !== undefined ? Number(sepRow.bestTime) : 3
                  const nSF       = sfAceraId ? (heatCountMap[sfAceraId] || 0) : 0
                  const sepTotal  = nSF > 0 ? nSF * sepBH + sepBT : null
                  const sepOk     = sepTotal === 8

                  // SF/biasa → Final
                  const ov      = overrides[aceraKey] || {}
                  const bh      = ov.bestHeat !== undefined ? Number(ov.bestHeat) : 1
                  const bt      = ov.bestTime !== undefined ? Number(ov.bestTime) : 3
                  const total   = n > 0 ? n * bh + bt : null
                  const ok      = total === 8
                  const stdRow  = SIFIR_STANDARD.find(r => r.heat === n)

                  // Label peringkat badge
                  const peringkatBadge = isQF
                    ? <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700">QF</span>
                    : isSF
                    ? <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">SF</span>
                    : null

                  return (
                    <div key={a.id} className={`px-4 py-3 ${i%2===0?'':'bg-gray-50/40'}`}>

                      {/* Header acara */}
                      <div className="flex items-center gap-2 mb-2.5">
                        <p className="text-xs font-bold text-gray-800 flex-1">{a.namaAcara}</p>
                        {peringkatBadge}
                        {a.jenisAcara === 'relay' && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600">RELAY</span>}
                        {belumHeat
                          ? <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-600">⚠ Belum jana heat</span>
                          : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">{n} heat</span>}
                        {peserta > 0 && <span className="text-[10px] text-gray-400">{peserta} atlet</span>}
                      </div>

                      {belumHeat && (
                        <p className="text-[10px] text-amber-500 mb-2">Jana heat dalam Start List dahulu sebelum tetapkan BH/BT.</p>
                      )}

                      {/* Baris 1: QF→SF (hanya acara QF) */}
                      {isQF && (
                        <div className="bg-teal-50/60 rounded-lg px-3 py-2 mb-1.5">
                          <p className="text-[9px] font-bold text-teal-600 uppercase tracking-wide mb-1.5">QF → Separuh Akhir (SF)</p>
                          <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-gray-500 w-16">BH / heat</span>
                              <input type="number" min={0} max={99} value={sukuBH}
                                onChange={e => setSukuOvField(aceraKey, 'bestHeat', e.target.value)}
                                className={numCls + (sukuOv[aceraKey] ? ' border-teal-300' : '')} />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-gray-500 w-6">BT</span>
                              <input type="number" min={0} max={99} value={sukuBT}
                                onChange={e => setSukuOvField(aceraKey, 'bestTime', e.target.value)}
                                className={numCls + (sukuOv[aceraKey] ? ' border-teal-300' : '')} />
                            </div>
                            {sukuTotal !== null && (
                              <span className={`font-black text-sm ${sukuOk ? 'text-green-600' : 'text-amber-500'}`}>{sukuTotal}</span>
                            )}
                            {sukuTotal !== null && !sukuOk && stdRow &&
                              <span className="text-[9px] text-gray-400">(std: BH={stdRow.bh}/BT={stdRow.bt})</span>}
                          </div>
                        </div>
                      )}

                      {/* Baris 2: SF→Final (acara QF pakai separuhOv, acara SF/biasa pakai overrides) */}
                      <div className="bg-indigo-50/60 rounded-lg px-3 py-2">
                        <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-wide mb-1.5">
                          {isQF ? 'SF → Akhir / Final' : isSF ? 'SF → Akhir / Final' : '→ Akhir / Final'}
                        </p>
                        {isQF ? (
                          // Acara QF: SF→Final guna separuhOv (heat SF belum tentu sama dgn heat QF)
                          <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-gray-500 w-16">BH / heat</span>
                              <input type="number" min={0} max={99} value={sepBH}
                                onChange={e => sfAceraId && setSeparuhOvField(sfAceraId, 'bestHeat', e.target.value)}
                                className={numCls + (sfAceraId && separuhOv[sfAceraId] ? ' border-indigo-300' : '')} />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-gray-500 w-6">BT</span>
                              <input type="number" min={0} max={99} value={sepBT}
                                onChange={e => sfAceraId && setSeparuhOvField(sfAceraId, 'bestTime', e.target.value)}
                                className={numCls + (sfAceraId && separuhOv[sfAceraId] ? ' border-indigo-300' : '')} />
                            </div>
                            {sepTotal !== null
                              ? <span className={`font-black text-sm ${sepOk ? 'text-green-600' : 'text-amber-500'}`}>{sepTotal}</span>
                              : <span className="text-[9px] text-gray-400">{nSF === 0 ? 'Jana heat SF dahulu' : '—'}</span>
                            }
                          </div>
                        ) : (
                          // Acara SF / biasa: guna overrides
                          <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-gray-500 w-16">BH / heat</span>
                              <input type="number" min={0} max={99} value={bh}
                                onChange={e => setOv(aceraKey, 'bestHeat', e.target.value)}
                                className={numCls + (overrides[aceraKey] ? ' border-indigo-300' : '')} />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-gray-500 w-6">BT</span>
                              <input type="number" min={0} max={99} value={bt}
                                onChange={e => setOv(aceraKey, 'bestTime', e.target.value)}
                                className={numCls + (overrides[aceraKey] ? ' border-indigo-300' : '')} />
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-gray-400">=</span>
                              {total !== null
                                ? <span className={`font-black text-sm ${ok ? 'text-green-600' : 'text-amber-500'}`}>{total}</span>
                                : <span className="text-[10px] text-gray-300">—</span>}
                              {total !== null && !ok && stdRow &&
                                <span className="text-[9px] text-gray-400 ml-1">(std: BH={stdRow.bh}/BT={stdRow.bt})</span>}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {dirty && (
        <div className="sticky bottom-4 z-20">
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-amber-500 text-white rounded-xl shadow-lg">
            <p className="text-xs font-bold">⚠ Ada perubahan belum disimpan</p>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 text-xs font-bold bg-white text-amber-600 rounded-lg hover:bg-amber-50 disabled:opacity-50 shrink-0 transition-colors">
              {saving ? 'Menyimpan…' : 'Simpan Sekarang'}
            </button>
          </div>
        </div>
      )}
      {saved && <p className="text-right text-[11px] text-green-600 font-semibold">✓ Tetapan disimpan</p>}
    </div>
  )
}

// ─── Halaman Utama ────────────────────────────────────────────────────────────

export default function KategoriSetup() {
  const navigate = useNavigate()
  const { userData } = useAuth()

  const isSuperadmin = userData?.role === 'superadmin'
  const viewSchoolId = isSuperadmin
    ? (() => { try { return JSON.parse(sessionStorage.getItem('gp_view_school') || '{}').schoolId || '' } catch { return '' } })()
    : null
  const schoolId = viewSchoolId || userData?.schoolId

  const ctx = getKejContext()
  const kejId = ctx.id

  const [list, setList]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(null)
  const [delTarget, setDelTarget] = useState(null)
  const [filterJenis, setFilterJenis] = useState('semua')
  const [activeTab, setActiveTab] = useState('kategori')
  const [jenisList, setJenisList] = useState([])
  const tahun = new Date().getFullYear()

  useEffect(() => {
    if (!schoolId) return
    getDoc(doc(db, 'tenants', schoolId, 'tetapan', 'jenisSekolah'))
      .then(s => {
        if (s.exists() && (s.data().list || []).length > 0) setJenisList(s.data().list)
        else setJenisList(['SR', 'SM', 'PPKI'])
      })
      .catch(() => setJenisList(['SR', 'SM', 'PPKI']))
  }, [schoolId])

  if (!schoolId || !kejId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 max-w-sm w-full text-center">
          <p className="text-sm font-bold text-gray-700 mb-1">Sesi Tamat</p>
          <p className="text-xs text-gray-400 mb-4">Maklumat kejohanan tidak dijumpai. Sila kembali ke papan pemuka.</p>
          <button onClick={() => navigate('/admin')}
            className="px-4 py-2 bg-[#003399] text-white text-xs font-bold rounded-lg hover:bg-[#002288]">
            Balik ke Dashboard
          </button>
        </div>
      </div>
    )
  }

  async function fetchList() {
    setLoading(true)
    try {
      const snap = await getDocs(query(collection(db, katPath(schoolId, kejId)), orderBy('urutan')))
      setList(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch { setList([]) } finally { setLoading(false) }
  }

  useEffect(() => { fetchList() }, [schoolId, kejId])

  async function toggleAktif(k) {
    try {
      await updateDoc(doc(db, katPath(schoolId, kejId), k.kod), { isAktif: !k.isAktif, updatedAt: serverTimestamp() })
      setList(l => l.map(x => x.kod === k.kod ? { ...x, isAktif: !x.isAktif } : x))
    } catch (e) { alert('Ralat: ' + e.message) }
  }

  const allKod = list.map(k => k.kod)
  const filtered = filterJenis === 'semua' ? list : list.filter(k => k.jenisSekolah === filterJenis)

  // Tab jenis sekolah — whitelist SR/SM/PPKI sahaja.
  // Tab custom tenant (contoh: 'SEKOLAH RENDAH') tak dipapar, sebab
  // konsep sama dengan default SR/SM/PPKI. Data existing tak dipadam,
  // cuma tak nampak sebagai tab berasingan.
  const ALLOWED_JENIS = ['SR', 'SM', 'PPKI']
  const jenisValues = [
    ...new Set([
      ...jenisList.filter(j => ALLOWED_JENIS.includes(j)),
      ...list.map(k => k.jenisSekolah).filter(j => ALLOWED_JENIS.includes(j)),
    ])
  ]

  const JENIS_LABELS = {
    SR:   'Sekolah Rendah (SR)',
    SM:   'Sekolah Menengah (SM)',
    PPKI: 'Program Pendidikan Khas (PPKI)',
  }
  const JENIS_BARS = {
    SR:   'bg-blue-600',
    SM:   'bg-green-600',
    PPKI: 'bg-purple-600',
  }

  const groups = jenisValues.map(j => ({
    jenis: j,
    label: JENIS_LABELS[j] || j,
    sub:   '',
    bar:   JENIS_BARS[j] || 'bg-gray-400',
  }))

  const cardProps = {
    tahun,
    onEdit:   k => setModal({ mode: 'edit', data: k }),
    onDelete: setDelTarget,
    onToggle: toggleAktif,
  }

  return (
    <div className="p-5 max-w-5xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/admin/kejohanan/${kejId}`)}
            className="p-1.5 text-gray-400 hover:text-[#003399] hover:bg-blue-50 rounded-lg transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Setup Kategori</h1>
            <p className="text-xs text-gray-400 mt-0.5">{ctx.namaKejohanan || ctx.nama || 'Kejohanan'} · Standard MSSD / MSSM</p>
          </div>
        </div>
        {activeTab === 'kategori' && (
          <button onClick={() => setModal({ mode: 'add' })}
            className="flex items-center gap-2 px-4 py-2 bg-[#003399] text-white text-xs font-bold rounded-lg hover:bg-[#002288] shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Tambah Kategori
          </button>
        )}
      </div>

      {/* Tab Bar */}
      <div className="flex rounded-xl border border-gray-200 overflow-hidden text-xs bg-white w-fit shadow-sm">
        {[
          { key: 'kategori', label: 'Senarai Kategori' },
          { key: 'final',    label: 'Tetapan Final' },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-5 py-2.5 font-semibold transition-colors border-r border-gray-200 last:border-r-0 ${
              activeTab === t.key ? 'bg-[#003399] text-white' : 'text-gray-500 hover:bg-gray-50'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'final' && (
        <TetapanFinal kategoriList={list} schoolId={schoolId} kejId={kejId} />
      )}

      {activeTab !== 'kategori' ? null : (<>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-blue-50 rounded-xl px-4 py-3 text-center">
          <p className="text-2xl font-black text-[#003399]">{list.length}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mt-0.5">Jumlah</p>
        </div>
        {jenisValues.map(j => (
          <div key={j} className="bg-gray-50 rounded-xl px-4 py-3 text-center">
            <p className="text-2xl font-black text-gray-700">{list.filter(k => k.jenisSekolah === j).length}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide mt-0.5">{j}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-gray-200 overflow-hidden text-xs bg-white w-fit shadow-sm">
        {['semua', ...jenisValues].map(f => (
          <button key={f} onClick={() => setFilterJenis(f)}
            className={`px-4 py-2 font-semibold transition-colors ${filterJenis === f ? 'bg-[#003399] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            {f === 'semua' ? 'Semua' : f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Memuatkan…</div>
      ) : list.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm font-semibold text-gray-500 mb-1">Tiada kategori</p>
          <p className="text-xs text-gray-400">Tambah kategori baharu untuk memulakan.</p>
        </div>
      ) : (
        <div className="space-y-7">
          {groups.map(g => {
            const items = filtered.filter(k => k.jenisSekolah === g.jenis)
            if (items.length === 0) return null
            return (
              <div key={g.jenis}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`w-2 h-5 rounded-sm ${g.bar}`} />
                  <h2 className="text-xs font-bold text-gray-600 uppercase tracking-widest">{g.label}</h2>
                </div>
                <KategoriTable items={items} tahun={tahun} {...cardProps} />
              </div>
            )
          })}
        </div>
      )}

      {modal?.mode === 'add' && (
        <KategoriModal mode="add" initial={{ ...EMPTY_FORM, urutan: list.length + 1 }}
          onClose={() => setModal(null)} onSaved={fetchList}
          allKod={allKod} tahun={tahun} jenisValues={jenisValues}
          schoolId={schoolId} kejId={kejId} />
      )}
      {modal?.mode === 'edit' && (
        <KategoriModal mode="edit" initial={modal.data}
          onClose={() => setModal(null)} onSaved={fetchList}
          allKod={allKod.filter(k => k !== modal.data?.kod)} tahun={tahun} jenisValues={jenisValues}
          schoolId={schoolId} kejId={kejId} />
      )}
      {delTarget && (
        <DeleteModal kategori={delTarget} onClose={() => setDelTarget(null)} onDeleted={fetchList}
          schoolId={schoolId} kejId={kejId} />
      )}
      </>)}
    </div>
  )
}
