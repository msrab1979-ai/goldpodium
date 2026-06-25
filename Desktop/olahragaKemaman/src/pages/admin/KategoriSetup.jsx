/**
 * KategoriSetup — /dashboard/kategori
 *
 * Standard MSSD / MSSM Malaysia — 4 lapisan had penyertaan:
 *
 *  1. KUOTA ATLET PER SEKOLAH
 *     └─ Bilangan atlet (L/P) yang boleh didaftarkan sesebuah sekolah
 *        untuk kategori ini. Cth: maks 15L + 15P.
 *
 *  2. HAD ACARA INDIVIDU PER ATLET
 *     └─ Seorang atlet boleh sertai maks X acara individu (lari, lontar, lompat).
 *        Standard MSSM = 3 acara. Boleh ubah mengikut kategori.
 *
 *  3. HAD ACARA BEREGU / RELAY PER ATLET
 *     └─ Seorang atlet boleh sertai maks X acara berkumpulan (4x100m, 4x400m).
 *        Biasanya 2 atau tiada had.
 *
 *  4. KUOTA PASUKAN BERKUMPULAN PER SEKOLAH
 *     └─ Satu sekolah boleh hantar maks 1 pasukan per acara berkumpulan (L/P).
 *        Standard MSSM = 1 pasukan. Setiap pasukan = saizPasukan atlet.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc,
  serverTimestamp, query, orderBy, writeBatch, getDoc, where,
} from 'firebase/firestore'
import { db } from '../../firebase/config'

const JENIS_DEFAULTS = ['SR', 'SM', 'PPKI']


const EMPTY_FORM = {
  kod: '', label: '', nama: '', jenisSekolah: 'SR',
  umurHad: '', umurMin: '',
  isTerbuka: false,
  hadAtletL: 15, hadAtletP: 15,
  hadAcaraIndividu: 3, hadAcaraBeregu: 2,
  hadPasukanL: 1, hadPasukanP: 1, saizPasukan: 4,
  warna: '#1d4ed8', urutan: 99,
  catatan: '', isAktif: true,
}

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-[#003399]/25 focus:border-[#003399] bg-gray-50'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tahunLahirLabel(umurHad, umurMin, tahun) {
  if (!umurHad) return '—'
  const t = tahun || new Date().getFullYear()
  // MSSM standard cut-off 2 Januari (sama logik dengan gate3_kelayakanUmur):
  //   paling tua layak  = 2 Jan (t - umurHad)
  //   paling muda layak = tarikhTerkini - 1 hari = 31 Dis (t - umurMin)
  const fmt = d => d.toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' })
  const terawal = fmt(new Date(`${t - Number(umurHad)}-01-02`))
  if (!umurMin) return `≥ ${terawal}`
  const terkiniExcl = new Date(`${t - Number(umurMin) + 1}-01-01`)
  const terkini = fmt(new Date(terkiniExcl.getTime() - 86400000))
  return `${terawal} – ${terkini}`
}

const FormField = ({ label, hint, children, required }) => (
  <div>
    <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
    {hint && <p className="text-[10px] text-gray-400 mt-1">{hint}</p>}
  </div>
)

// Kumpul 2 input bersebelahan dengan label di tengah
const DualField = ({ labelL, labelP, valL, valP, onL, onP, suffix = '', hint }) => (
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

                {/* Kod */}
                <td className="px-3 py-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-black text-sm shadow-sm"
                    style={{ backgroundColor: k.warna }}>
                    {k.label || k.kod}
                  </div>
                </td>

                {/* Nama */}
                <td className="px-3 py-3 min-w-[140px]">
                  <p className="font-semibold text-gray-800 leading-tight">{k.nama}</p>
                  {k.catatan && (
                    <p className="text-[10px] text-gray-400 mt-0.5 italic">{k.catatan}</p>
                  )}
                </td>

                {/* Kelayakan */}
                <td className="px-3 py-3 min-w-[120px]">
                  {k.isTerbuka ? (
                    <div>
                      <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">Terbuka</span>
                      <p className="text-[10px] text-gray-500 mt-1">{tLabel}</p>
                    </div>
                  ) : k.umurHad ? (
                    <div>
                      <p className="text-[10px] font-semibold text-orange-600">Bawah {k.umurHad} Thn</p>
                      <p className="text-[10px] text-gray-400">{tLabel}</p>
                    </div>
                  ) : (
                    <span className="text-[10px] text-gray-400">—</span>
                  )}
                </td>

                {/* Atlet L/P */}
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

                {/* Individu */}
                <td className="px-3 py-3 text-center">
                  <span className="text-base font-black text-green-700">{k.hadAcaraIndividu ?? '—'}</span>
                </td>

                {/* Berkumpulan */}
                <td className="px-3 py-3 text-center">
                  <span className="text-base font-black text-purple-700">{k.hadAcaraBeregu ?? '—'}</span>
                </td>

                {/* Pasukan */}
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

                {/* Aktif toggle */}
                <td className="px-3 py-3 text-center">
                  <button onClick={() => onToggle(k)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${k.isAktif ? 'bg-[#003399]' : 'bg-gray-300'}`}>
                    <span className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
                      style={{ transform: k.isAktif ? 'translateX(18px)' : 'translateX(2px)' }} />
                  </button>
                </td>

                {/* Tindakan */}
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

function KategoriModal({ mode, initial, onClose, onSaved, allKod, tahun, jenisValues = [] }) {
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

    setSaving(true)
    try {
      const payload = {
        kod: kodBersih, label: form.label.trim(), nama: form.nama.trim(),
        jenisSekolah: form.jenisSekolah,
        umurHad:  form.umurHad  === '' ? null : Number(form.umurHad),
        umurMin:  form.umurMin  === '' ? null : Number(form.umurMin),
        isTerbuka: form.isTerbuka === true,
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

      if (!isEdit) {
        payload.createdAt = serverTimestamp()
        await setDoc(doc(db, 'kategori', kodBersih), payload)
      } else {
        const oldKod = initial.kod
        if (kodBersih !== oldKod) {
          const chk = await getDoc(doc(db, 'kategori', kodBersih))
          if (chk.exists()) { setErr(`Kod "${kodBersih}" sudah wujud.`); setSaving(false); return }
          await setDoc(doc(db, 'kategori', kodBersih), { ...payload, createdAt: initial.createdAt || serverTimestamp() })
          await deleteDoc(doc(db, 'kategori', oldKod))
        } else {
          await updateDoc(doc(db, 'kategori', kodBersih), payload)
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

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-sm font-bold text-gray-800">{isEdit ? 'Edit Kategori' : 'Tambah Kategori'}</h2>
            <p className="text-[10px] text-gray-400 mt-0.5">Standard MSSD / MSSM Malaysia</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        {/* Body — scroll */}
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
                {/* Cadangan cepat — klik untuk pilih */}
                <p className="text-[10px] text-gray-400 mb-1.5">Klik untuk pilih, atau taip nilai baharu di bawah:</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {[...new Set([...JENIS_DEFAULTS, ...jenisValues])].map(j => (
                    <button
                      key={j}
                      type="button"
                      onClick={() => set('jenisSekolah', j)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${
                        form.jenisSekolah === j
                          ? 'bg-[#003399] text-white border-[#003399]'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-[#003399]/50 hover:text-[#003399]'
                      }`}
                    >
                      {j}
                    </button>
                  ))}
                </div>
                {/* Free-text input — untuk nilai baharu */}
                <input
                  type="text"
                  value={form.jenisSekolah}
                  onChange={e => set('jenisSekolah', e.target.value)}
                  placeholder="cth: Universiti, Kolej, SMKA, Teknik..."
                  className={inputCls}
                  autoComplete="off"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Nilai semasa: <span className="font-bold text-gray-700">{form.jenisSekolah || '—'}</span>
                </p>
              </div>
            </div>
          </div>

          {/* ── BAHAGIAN 2: Had Umur & Kelayakan ── */}
          <div>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3 pb-1 border-b border-gray-100">
              2 — Had Umur & Kelayakan
            </p>

            {/* Toggle Terbuka */}
            <label className="flex items-start gap-3 px-3 py-3 mb-3 rounded-lg border cursor-pointer transition-colors select-none
              bg-amber-50 border-amber-200 hover:border-amber-400">
              <input type="checkbox" checked={!!form.isTerbuka}
                onChange={e => set('isTerbuka', e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-amber-500 shrink-0" />
              <div>
                <p className="text-xs font-bold text-amber-800">Kategori Terbuka</p>
                <p className="text-[10px] text-amber-600 mt-0.5">
                  Atlet dari <strong>pelbagai umur</strong> dalam julat yang ditetapkan boleh menyertai acara ini.
                  Contoh: semua atlet umur 8–12 thn boleh sertai "100m Terbuka L-SR".
                </p>
              </div>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                label={form.isTerbuka ? 'Umur Minimum (Terbuka)' : 'Umur Min'}
                hint={form.isTerbuka ? 'Umur paling muda boleh sertai. Cth: 8' : 'Tahun. Kosong = tiada had bawah'}>
                <input type="number" min={1} max={25} value={form.umurMin}
                  onChange={e => set('umurMin', e.target.value)} placeholder={form.isTerbuka ? '8' : '9'} className={inputCls} />
              </FormField>
              <FormField
                label={form.isTerbuka ? 'Umur Maksimum (Terbuka)' : 'Umur Had ("Bawah X Thn")'}
                required={!form.isTerbuka}
                hint={form.isTerbuka ? 'Umur paling tua boleh sertai. Cth: 12' : undefined}>
                <input type="number" min={1} max={25} value={form.umurHad}
                  onChange={e => set('umurHad', e.target.value)} placeholder={form.isTerbuka ? '12' : '10'} className={inputCls} />
              </FormField>
            </div>
            {form.umurHad && (
              <div className={`mt-2 rounded-lg px-3 py-2 flex items-center gap-2 border ${
                form.isTerbuka
                  ? 'bg-amber-50 border-amber-100'
                  : 'bg-indigo-50 border-indigo-100'
              }`}>
                <svg className={`w-4 h-4 shrink-0 ${form.isTerbuka ? 'text-amber-400' : 'text-indigo-400'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className={`text-[9px] font-bold ${form.isTerbuka ? 'text-amber-400' : 'text-indigo-400'}`}>
                    {form.isTerbuka ? 'JULAT TERBUKA — TARIKH (cut-off 2 Jan)' : 'KELAYAKAN TARIKH (cut-off 2 Jan)'} {tahun}
                  </p>
                  <p className={`text-xs font-bold ${form.isTerbuka ? 'text-amber-700' : 'text-indigo-700'}`}>
                    {form.isTerbuka
                      ? `Umur ${form.umurMin || '?'} – ${form.umurHad} tahun · ${tahunLahirLabel(form.umurHad, form.umurMin, tahun)}`
                      : previewTahun
                    }
                  </p>
                </div>
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

        {/* Footer */}
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

function DeleteModal({ kategori, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false)
  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteDoc(doc(db, 'kategori', kategori.kod))
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

const JENIS_ACARA_TABS = [
  { key: 'larian', label: 'Larian', hint: 'Larian lorong & mass start' },
  { key: 'relay',  label: 'Relay',  hint: 'Acara berkumpulan 4×100m, 4×400m' },
  { key: 'padang', label: 'Padang', hint: 'Lompat & balin/lempar' },
]

const numCls = 'w-14 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-center ' +
  'focus:outline-none focus:ring-2 focus:ring-[#003399]/25 focus:border-[#003399] bg-gray-50'

function getJenisTab(a) {
  if (a.jenisAcara === 'relay') return 'relay'
  if (a.jenisAcara === 'padang_lompat' || a.jenisAcara === 'padang_balin') return 'padang'
  return 'larian'
}

// Sifir standard KOAM/World Athletics: bilangan heat → BH/BT standard untuk 8 ke final
const SIFIR_STANDARD = [
  { heat: 1, bh: 8, bt: 0 },
  { heat: 2, bh: 3, bt: 2 },
  { heat: 3, bh: 2, bt: 2 },
  { heat: 4, bh: 1, bt: 4 },
  { heat: 5, bh: 1, bt: 3 },
  { heat: 6, bh: 1, bt: 2 },
]

// heatAcara = bilangan heat yang dijana untuk acara ini (0 = belum jana)
// bh/bt = tetapan semasa kategori
function SifirRujukan({ heatAcara, bh, bt }) {
  const stdRow = heatAcara > 0 ? SIFIR_STANDARD.find(r => r.heat === heatAcara) : null
  return (
    <div className="border border-gray-200 rounded overflow-hidden">
      <div className="px-2 py-0.5 bg-gray-100 text-[8px] font-bold text-gray-400 uppercase tracking-wide flex justify-between">
        <span>Sifir Rujukan (8 ke Final)</span>
        {heatAcara > 0 && stdRow && (
          <span className={bh === stdRow.bh && bt === stdRow.bt ? 'text-green-600' : 'text-amber-500'}>
            Standard {heatAcara} heat: BH={stdRow.bh} / BT={stdRow.bt}
          </span>
        )}
        {heatAcara > 0 && !stdRow && (
          <span className="text-red-400">Tiada standard untuk {heatAcara} heat</span>
        )}
      </div>
      <table className="w-full text-[9px]">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100 text-[8px] font-bold text-gray-400">
            <th className="px-2 py-0.5 text-center">Heat</th>
            <th className="px-2 py-0.5 text-center">BH/heat</th>
            <th className="px-2 py-0.5 text-center">BT</th>
            <th className="px-2 py-0.5 text-center">= Final</th>
            <th className="px-2 py-0.5 text-center">Semasa</th>
          </tr>
        </thead>
        <tbody>
          {SIFIR_STANDARD.map(row => {
            const isAcara  = row.heat === heatAcara   // baris ini = heat acara ini
            const tepat    = isAcara && row.bh === bh && row.bt === bt
            const beza     = isAcara && !tepat
            const total    = (row.heat * row.bh) + row.bt
            return (
              <tr key={row.heat} className={`border-b border-gray-50 last:border-0
                ${tepat ? 'bg-green-100' : beza ? 'bg-amber-50' : ''}`}>
                <td className={`px-2 py-0.5 text-center font-mono font-bold ${isAcara ? 'text-gray-800' : 'text-gray-400'}`}>{row.heat}</td>
                <td className={`px-2 py-0.5 text-center font-mono ${isAcara ? 'text-gray-700 font-semibold' : 'text-gray-400'}`}>{row.bh}</td>
                <td className={`px-2 py-0.5 text-center font-mono ${isAcara ? 'text-gray-700 font-semibold' : 'text-gray-400'}`}>{row.bt}</td>
                <td className={`px-2 py-0.5 text-center font-mono font-bold ${isAcara ? 'text-gray-800' : 'text-gray-400'}`}>{total}</td>
                <td className="px-2 py-0.5 text-center text-[8px]">
                  {tepat  ? <span className="text-green-600 font-bold">✓</span>
                  : beza  ? <span className="text-amber-600 font-bold">⚠ set {bh}/{bt}</span>
                  : isAcara && heatAcara === 0 ? <span className="text-gray-400">—</span>
                  : <span className="text-gray-200">·</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TetapanFinal({ kategoriList }) {
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [dirty,        setDirty]        = useState(false)
  const [kejId,        setKejId]        = useState(null)
  const [acaraList,    setAcaraList]    = useState([])   // semua acara saringan
  const [heatCountMap, setHeatCountMap] = useState({})
  const [pesertaMap,   setPesertaMap]   = useState({})
  const [overrides,    setOverrides]    = useState({})   // aceraId → { bestHeat, bestTime }
  const [sukuOv,       setSukuOv]       = useState({})   // aceraId → { bestHeat, bestTime } untuk suku→SF
  const [filterKat,    setFilterKat]    = useState('semua')
  const [expandedKat,  setExpandedKat]  = useState({})

  // ── Load tetapan + acara + heat ──────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      setLoading(true)
      try {
        // Load override yang tersimpan
        const snap = await getDoc(doc(db, 'tetapan', 'finalSetup'))
        if (snap.exists()) {
          setOverrides(snap.data().overrideByAcara || {})
          setSukuOv(snap.data().sukuKeSeparuhByAcara || {})
        }

        // Kejohanan aktif
        const kejSnap = await getDocs(query(
          collection(db, 'kejohanan'),
          where('statusKejohanan', 'in', ['aktif', 'persediaan'])
        ))
        if (kejSnap.empty) { setLoading(false); return }
        const kej = kejSnap.docs[0]
        setKejId(kej.id)

        // Acara saringan sahaja (exclude final child + mass_start + padang)
        const acaraSnap = await getDocs(collection(db, 'kejohanan', kej.id, 'acara'))
        const saringan = acaraSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(a => !a.parentAcaraId &&
            a.jenisAcara !== 'mass_start' &&
            a.jenisAcara !== 'padang_lompat' &&
            a.jenisAcara !== 'padang_balin')
          .sort((a, b) => (a.noAcara || 0) - (b.noAcara || 0))
        setAcaraList(saringan)

        // Heat count per acara
        const heatRes = await Promise.all(
          saringan.map(a =>
            getDocs(collection(db, 'kejohanan', kej.id, 'acara', a.id, 'heat'))
              .then(s => [a.id, s.size])
          )
        )
        setHeatCountMap(Object.fromEntries(heatRes))

        // Peserta per acara
        const pendSnap = await getDocs(collection(db, 'kejohanan', kej.id, 'pendaftaran'))
        const pm = {}
        pendSnap.docs.forEach(d => {
          ;(d.data().acaraIds || []).forEach(id => { pm[id] = (pm[id] || 0) + 1 })
        })
        setPesertaMap(pm)
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    init()
  }, [])

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
      await setDoc(doc(db, 'tetapan', 'finalSetup'), {
        overrideByAcara: clean,
        sukuKeSeparuhByAcara: cleanSuku,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setDirty(false); setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) { alert('Ralat simpan: ' + e.message) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="py-16 text-center text-sm text-gray-400">Memuatkan…</div>

  // Kumpul kategori unik dari acaraList
  const katUnik = [...new Set(acaraList.map(a => a.kategoriKod).filter(Boolean))]
    .map(kod => kategoriList.find(k => k.kod === kod))
    .filter(Boolean)
    .sort((a, b) => (a.urutan || 99) - (b.urutan || 99))

  const acaraTapis = filterKat === 'semua'
    ? acaraList
    : acaraList.filter(a => a.kategoriKod === filterKat)

  // Kumpul per kategori untuk render
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

      {/* Tiada kejohanan */}
      {!kejId && (
        <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center">
          <p className="text-xs text-gray-400">Tiada kejohanan aktif atau dalam persediaan.</p>
        </div>
      )}

      {/* Table per kategori */}
      {kejId && perKat.map(({ kat, acara }) => {
        const isOpen   = expandedKat[kat.kod] !== false
        const ovCount  = acara.filter(a => overrides[a.id]).length
        const warnCount = acara.filter(a => {
          const n = heatCountMap[a.id] || 0
          const bh = Number(overrides[a.id]?.bestHeat ?? 1)
          const bt = Number(overrides[a.id]?.bestTime ?? 3)
          return n > 0 && bh > 0 && (n * bh + bt) !== 8
        }).length

        return (
          <div key={kat.kod} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <button
              onClick={() => setExpandedKat(p => ({ ...p, [kat.kod]: !isOpen }))}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left">
              <span className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[9px] font-black shrink-0"
                style={{ backgroundColor: kat.warna || '#6366f1' }}>{kat.kod}</span>
              <span className="text-xs font-bold text-gray-700 flex-1">{kat.label} — {kat.nama}</span>
              {warnCount > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600">{warnCount} ⚠</span>}
              {ovCount > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600">{ovCount} set</span>}
              <span className="text-[10px] text-gray-300">{acara.length} acara</span>
              <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isOpen && (
              <div className="border-t border-gray-100 overflow-x-auto">
                <table className="w-full text-xs min-w-[540px]">
                  <thead>
                    <tr className="bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                      <th className="px-4 py-2 text-left">Acara</th>
                      <th className="px-3 py-2 text-center">Heat</th>
                      <th className="px-3 py-2 text-center">Atlet</th>
                      <th className="px-3 py-2 text-center">BH→Akhir</th>
                      <th className="px-3 py-2 text-center">BT→Akhir</th>
                      <th className="px-3 py-2 text-center">= Final</th>
                      <th className="px-3 py-2 text-center bg-teal-50 text-teal-600">BH→SF</th>
                      <th className="px-3 py-2 text-center bg-teal-50 text-teal-600">BT→SF</th>
                      <th className="px-3 py-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acara.map((a, i) => {
                      const n       = heatCountMap[a.id] || 0
                      const peserta = pesertaMap[a.id] || 0
                      const ov      = overrides[a.id] || {}
                      const bh      = ov.bestHeat !== undefined ? Number(ov.bestHeat) : 1
                      const bt      = ov.bestTime !== undefined ? Number(ov.bestTime) : 3
                      const isSet   = !!overrides[a.id]
                      const isBT    = bh === 0
                      const total   = n > 0 ? (isBT ? bt : n * bh + bt) : null
                      const ok      = total === 8
                      const stdRow  = SIFIR_STANDARD.find(r => r.heat === n)

                      const sukuOvRow   = sukuOv[a.id] || {}
                      const sukuBH      = sukuOvRow.bestHeat !== undefined ? Number(sukuOvRow.bestHeat) : ''
                      const sukuBT      = sukuOvRow.bestTime !== undefined ? Number(sukuOvRow.bestTime) : ''
                      const isSukuSet   = !!(sukuOv[a.id])
                      const isSukuAcara = a.peringkat === 'suku_akhir'

                      return (
                        <tr key={a.id} className={`border-b border-gray-50 last:border-0 ${i%2===0?'':'bg-gray-50/30'}`}>
                          <td className="px-4 py-2.5">
                            <p className="font-semibold text-gray-700 text-[11px]">{a.namaAcara}</p>
                            {a.jenisAcara === 'relay' && <span className="text-[8px] text-purple-500 font-bold">RELAY</span>}
                            {isSukuAcara && <span className="text-[8px] text-teal-600 font-bold">SUKU AKHIR</span>}
                          </td>

                          <td className="px-3 py-2.5 text-center">
                            {n > 0
                              ? <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span>{n}
                                </span>
                              : <span className="text-[10px] text-gray-300">—</span>}
                          </td>

                          <td className="px-3 py-2.5 text-center text-[11px] text-gray-500">
                            {peserta > 0 ? peserta : '—'}
                          </td>

                          <td className="px-3 py-2.5 text-center">
                            <input type="number" min={0} max={99}
                              value={bh}
                              onChange={e => setOv(a.id, 'bestHeat', e.target.value)}
                              className={numCls + (isSet ? ' border-purple-300' : '')} />
                          </td>

                          <td className="px-3 py-2.5 text-center">
                            <input type="number" min={0} max={99}
                              value={bt}
                              onChange={e => setOv(a.id, 'bestTime', e.target.value)}
                              className={numCls + (isSet ? ' border-purple-300' : '')} />
                          </td>

                          <td className="px-3 py-2.5 text-center">
                            {total !== null
                              ? <span className={`font-black text-sm ${ok ? 'text-green-600' : 'text-amber-500'}`}>{total}</span>
                              : <span className="text-[11px] text-gray-300">belum jana</span>}
                          </td>

                          <td className="px-3 py-2.5 text-center bg-teal-50/40">
                            {isSukuAcara
                              ? <input type="number" min={0} max={99}
                                  value={sukuBH}
                                  placeholder="—"
                                  onChange={e => setSukuOvField(a.id, 'bestHeat', e.target.value)}
                                  className={numCls + (isSukuSet ? ' border-teal-300' : '')} />
                              : <span className="text-[10px] text-gray-300">—</span>}
                          </td>

                          <td className="px-3 py-2.5 text-center bg-teal-50/40">
                            {isSukuAcara
                              ? <input type="number" min={0} max={99}
                                  value={sukuBT}
                                  placeholder="—"
                                  onChange={e => setSukuOvField(a.id, 'bestTime', e.target.value)}
                                  className={numCls + (isSukuSet ? ' border-teal-300' : '')} />
                              : <span className="text-[10px] text-gray-300">—</span>}
                          </td>

                          <td className="px-3 py-2.5 text-center text-[10px]">
                            {total === null
                              ? <span className="text-gray-300">—</span>
                              : isBT
                              ? <span className="text-blue-500 font-bold">🔵 BT</span>
                              : ok
                              ? <span className="text-green-600 font-bold">✓ 8</span>
                              : <div>
                                  <span className="text-amber-500 font-bold">⚠ {total}</span>
                                  {stdRow && <p className="text-[8px] text-gray-400 mt-0.5">std: BH={stdRow.bh}/BT={stdRow.bt}</p>}
                                </div>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}

      {/* Sticky simpan */}
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
  const [list, setList]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(null)
  const [delTarget, setDelTarget] = useState(null)
  const [filterJenis, setFilterJenis] = useState('semua')
  const [activeTab, setActiveTab] = useState('kategori')
  const tahun = new Date().getFullYear()

  async function fetchList() {
    setLoading(true)
    try {
      const snap = await getDocs(query(collection(db, 'kategori'), orderBy('urutan')))
      setList(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch { setList([]) } finally { setLoading(false) }
  }

  useEffect(() => { fetchList() }, [])

  async function toggleAktif(k) {
    try {
      await updateDoc(doc(db, 'kategori', k.kod), { isAktif: !k.isAktif, updatedAt: serverTimestamp() })
      setList(l => l.map(x => x.kod === k.kod ? { ...x, isAktif: !x.isAktif } : x))
    } catch (e) { alert('Ralat: ' + e.message) }
  }

  const allKod = list.map(k => k.kod)
  const filtered = filterJenis === 'semua' ? list : list.filter(k => k.jenisSekolah === filterJenis)

  // Derive unique jenis values from loaded data + always include defaults
  const jenisValues = [
    ...new Set([
      ...JENIS_DEFAULTS,
      ...list.map(k => k.jenisSekolah).filter(Boolean),
    ])
  ].sort()

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

  // Groups derived dynamically
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
        <div>
          <h1 className="text-lg font-bold text-gray-900">Setup Kategori</h1>
          <p className="text-xs text-gray-400 mt-0.5">Standard MSSD / MSSM — had umur, kuota atlet, had acara & pasukan berkumpulan</p>
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

      {/* Tab: Tetapan Final */}
      {activeTab === 'final' && (
        <TetapanFinal kategoriList={list} />
      )}

      {/* Tab: Senarai Kategori — sembunyikan jika tab lain aktif */}
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

      {/* Filter — dynamic from loaded data */}
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
          <p className="text-xs text-gray-400">Tambah baharu atau gunakan seed standard MSSM di bawah.</p>
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
                  {g.sub && <span className="text-[10px] text-gray-400">— {g.sub}</span>}
                </div>
                <KategoriTable items={items} tahun={tahun} {...cardProps} />
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {modal?.mode === 'add' && (
        <KategoriModal mode="add" initial={{ ...EMPTY_FORM, urutan: list.length + 1 }}
          onClose={() => setModal(null)} onSaved={fetchList}
          allKod={allKod} tahun={tahun} jenisValues={jenisValues} />
      )}
      {modal?.mode === 'edit' && (
        <KategoriModal mode="edit" initial={modal.data}
          onClose={() => setModal(null)} onSaved={fetchList}
          allKod={allKod.filter(k => k !== modal.data?.kod)} tahun={tahun} jenisValues={jenisValues} />
      )}
      {delTarget && (
        <DeleteModal kategori={delTarget} onClose={() => setDelTarget(null)} onDeleted={fetchList} />
      )}
      </>)}
    </div>
  )
}
