/**
 * PengurusDashboard — /pengurus/dashboard
 *
 * Dua tab:
 *  Tab 1 — Urus Atlet    : CRUD master atlet + import Excel
 *  Tab 2 — Daftar Acara  : Daftar atlet ke acara (dengan 8-gate validation)
 *
 * GP Multi-tenant:
 *  atlet      → tenants/{schoolId}/atlet/{noKP}
 *  pendaftaran → tenants/{schoolId}/kejohanan/{kejId}/pendaftaran/{noKP}
 *  acara       → tenants/{schoolId}/kejohanan/{kejId}/acara/{id}
 *  kategori    → tenants/{schoolId}/kejohanan/{kejId}/kategori/{id}
 *  sekolah     → tenants/{schoolId}/sekolah/{kodSekolah}
 *  counter     → tenants/{schoolId}/pendaftaran_counter/{kejId}_{kodSekolah}
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc,
  serverTimestamp, query, where, getDoc, writeBatch, runTransaction,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import { validasiPendaftaran } from '../../utils/validasiPendaftaran'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─── Konstanta ────────────────────────────────────────────────────────────────

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-[#003399]/25 focus:border-[#003399] bg-gray-50'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function layakUmurMSSM(tarikhLahir, umurHad, umurMin, tahunKejohanan) {
  if (!tarikhLahir || !umurHad || !tahunKejohanan) return true
  const tKej = Number(tahunKejohanan)
  const tarikhTerawal = new Date(`${tKej - Number(umurHad)}-01-02`)
  const tarikhTerkini = umurMin
    ? new Date(`${tKej - Number(umurMin) + 1}-01-01`)
    : new Date(`${tKej + 1}-01-01`)
  const tLahir = new Date(tarikhLahir)
  return tLahir >= tarikhTerawal && tLahir < tarikhTerkini
}

function kiraKategori(tarikhLahir, jantina, tahunKejohanan, kategoriList = []) {
  if (!tarikhLahir || !tahunKejohanan) return null
  if (kategoriList.length > 0) {
    const filtered = kategoriList.filter(k => {
      if (!k.kod) return false
      if (!k.umurHad) return false
      const lbl = (k.label || k.nama || k.kod || '').toUpperCase()
      if (lbl.includes('OPEN')) return false
      if (jantina === 'L' && !lbl.startsWith('L')) return false
      if (jantina === 'P' && !lbl.startsWith('P')) return false
      return true
    })
    const candidates = filtered.filter(k =>
      layakUmurMSSM(tarikhLahir, k.umurHad, k.umurMin, tahunKejohanan)
    )
    if (candidates.length === 0) return null
    candidates.sort((a, b) => Number(a.umurHad) - Number(b.umurHad))
    return candidates[0].kod
  }
  return null
}

function formatNoKP(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 12)
  if (digits.length < 12) return null
  return `${digits.slice(0,6)}-${digits.slice(6,8)}-${digits.slice(8)}`
}

function autoTarikhLahir(noKP12) {
  const yy = parseInt(noKP12.slice(0,2), 10)
  const mm = parseInt(noKP12.slice(2,4), 10)
  const dd = parseInt(noKP12.slice(4,6), 10)
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
  const curYY = new Date().getFullYear() % 100
  const year  = (yy <= curYY ? 2000 : 1900) + yy
  return `${year}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`
}

function autoJantina(noKP12) {
  const lastDigit = parseInt(noKP12.slice(11), 10)
  return lastDigit % 2 === 0 ? 'P' : 'L'
}

function formatDeadlineMY(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  if (isNaN(d)) return isoStr
  return d.toLocaleString('ms-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

// ─── Download Template: Atlet ─────────────────────────────────────────────────

function downloadTemplateAtlet(bibPrefix = '', bibFormat = 3) {
  const wb  = XLSX.utils.book_new()
  const p   = bibPrefix || 'XXX'
  const fmt = n => p + String(n).padStart(bibFormat, '0')
  const headers = ['noKP (12 digit)', 'nama', 'noBib']
  const examples = [
    ['120115-12-0001', 'Ahmad bin Ali',    fmt(1)],
    ['130220-14-0002', 'Siti binti Bakar', fmt(2)],
    ['140305-16-0003', 'Raju a/l Muthu',   fmt(3)],
  ]
  const ws = XLSX.utils.aoa_to_sheet([headers, ...examples])
  ws['!cols'] = [{ wch:20 }, { wch:35 }, { wch:12 }]
  XLSX.utils.book_append_sheet(wb, ws, 'ATLET')

  const panduan = [
    ['PANDUAN PENGISIAN TEMPLAT ATLET — GOLD PODIUM'],
    [''],
    ['Kolum', 'Wajib', 'Penerangan'],
    ['noKP (12 digit)', 'Ya', 'No. Kad Pengenalan — 12 digit (boleh ada sempang atau tidak)'],
    ['nama',            'Ya', 'Nama penuh atlet seperti dalam kad pengenalan'],
    ['noBib',           'Ya', `No. Badan atlet — contoh: ${fmt(1)}, ${fmt(2)}, ${fmt(3)}`],
    [''],
    ['AUTO-DETECT dari No. KP (tidak perlu isi):', '', ''],
    ['Jantina',      '(auto)', 'Digit terakhir No. KP — ganjil = Lelaki, genap = Perempuan'],
    ['Tarikh Lahir', '(auto)', '6 digit pertama No. KP (YYMMDD) → auto tukar ke YYYY-MM-DD'],
    [''],
    ['NOTA:', 'Baris pertama adalah HEADER — jangan padam atau ubah.', ''],
    ['', 'Fail boleh disimpan semula sebagai .xlsx atau .csv.', ''],
  ]
  const ws2 = XLSX.utils.aoa_to_sheet(panduan)
  ws2['!cols'] = [{ wch:22 }, { wch:65 }, { wch:5 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'PANDUAN')

  XLSX.writeFile(wb, 'template_atlet_gp.xlsx')
}

// ─── Download Template: Daftar Acara ─────────────────────────────────────────

function downloadTemplateDaftar(bibPrefix = '', bibFormat = 3, acaraList = []) {
  const wb  = XLSX.utils.book_new()
  const p   = bibPrefix || 'XXX'
  const fmt = n => p + String(n).padStart(bibFormat, '0')

  const headers = ['noBib', 'noKP', 'noAcara']
  const examples = [
    [fmt(1), '120115-12-0001', '101'],
    [fmt(2), '130220-14-0002', '102'],
    [fmt(3), '140305-16-0003', '101'],
  ]
  const ws = XLSX.utils.aoa_to_sheet([headers, ...examples])
  ws['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 10 }]
  XLSX.utils.book_append_sheet(wb, ws, 'DAFTAR')

  if (acaraList.length > 0) {
    const aHdrs = ['noAcara', 'namaAcara', 'kategori', 'jantina']
    const aRows = acaraList
      .filter(a => a.isAktif !== false && !a.parentAcaraId)
      .sort((a, b) => (Number(a.noAcara) || 0) - (Number(b.noAcara) || 0))
      .map(a => [a.noAcara, a.namaAcara, a.kategoriKod, a.jantina === 'L' ? 'Lelaki' : a.jantina === 'P' ? 'Perempuan' : a.jantina])
    const ws2 = XLSX.utils.aoa_to_sheet([aHdrs, ...aRows])
    ws2['!cols'] = [{ wch: 10 }, { wch: 40 }, { wch: 10 }, { wch: 10 }]
    XLSX.utils.book_append_sheet(wb, ws2, 'SENARAI ACARA')
  }

  const panduan = [
    ['PANDUAN IMPORT DAFTAR ACARA — GOLD PODIUM'],
    [''],
    ['Kolum', 'Wajib', 'Penerangan'],
    ['noBib',   'Ya', `No. Badan — mesti bermula dengan prefix "${p}" (cth: ${fmt(1)}, ${fmt(2)})`],
    ['noKP',    'Ya', 'No. Kad Pengenalan — 12 digit (boleh ada sempang atau tidak)'],
    ['noAcara', 'Ya', 'No. Acara — rujuk sheet "SENARAI ACARA" (cth: 101, 102, 201)'],
    [''],
    ['NOTA:', 'Baris 1 adalah HEADER — jangan padam atau ubah nama kolum.', ''],
    ['', 'Satu atlet boleh didaftar ke pelbagai acara — satu baris per acara.', ''],
    ['', 'Atlet mesti sudah ada dalam tab "Urus Atlet" sebelum import daftar.', ''],
  ]
  const ws3 = XLSX.utils.aoa_to_sheet(panduan)
  ws3['!cols'] = [{ wch: 12 }, { wch: 5 }, { wch: 70 }]
  XLSX.utils.book_append_sheet(wb, ws3, 'PANDUAN')

  XLSX.writeFile(wb, 'template_daftar_acara_gp.xlsx')
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function FormField({ label, hint, required, children }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

function JantinaBadge({ j }) {
  return (
    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${j==='L'?'bg-blue-100 text-blue-700':'bg-pink-100 text-pink-700'}`}>{j}</span>
  )
}

function KategoriBadge({ kat, kategoriList = [] }) {
  if (!kat) return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">?</span>
  const found = kategoriList.find(k => (k.kod || k.id) === kat)
  const label = found?.label || found?.nama || kat
  const lbl = label.toUpperCase()
  let colorClass
  if (lbl.startsWith('L')) colorClass = 'bg-blue-100 text-blue-700'
  else if (lbl.startsWith('P')) colorClass = 'bg-pink-100 text-pink-700'
  else if (lbl.includes('OPEN')) colorClass = 'bg-violet-100 text-violet-700'
  else colorClass = 'bg-gray-100 text-gray-500'
  return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${colorClass}`}>{label}</span>
}

// ─── Modal: Tambah / Edit Atlet ───────────────────────────────────────────────

function AtletModal({ mode, initial, schoolId, kodSekolah, sekolahData, existingBibs,
                      myPendaftaran, kejohananId, tahunKej, kategoriList, onClose, onSaved }) {
  const isEdit    = mode === 'edit'
  const bibPrefix = (sekolahData?.bibPrefix || '').toUpperCase()
  const bibFormat = Number(sekolahData?.bibFormat) || 3
  const initBibNum = initial?.noBib?.startsWith(bibPrefix)
    ? initial.noBib.slice(bibPrefix.length)
    : (initial?.noBib || '')

  const [form, setForm] = useState({
    noKP:        initial?.noKP        || '',
    nama:        initial?.nama        || '',
    jantina:     initial?.jantina     || 'L',
    tarikhLahir: initial?.tarikhLahir || '',
  })
  const [bibNum, setBibNum]     = useState(initBibNum)
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState('')
  const [warnPending, setWarnPending] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function handleNoKPChange(raw) {
    const digits = raw.replace(/\D/g, '').slice(0, 12)
    let fmt = digits
    if (digits.length > 6) fmt = digits.slice(0,6) + '-' + digits.slice(6)
    if (digits.length > 8) fmt = digits.slice(0,6) + '-' + digits.slice(6,8) + '-' + digits.slice(8)
    let tarikhLahir = form.tarikhLahir
    if (digits.length >= 6) {
      const tl = autoTarikhLahir(digits.padEnd(12, '0'))
      if (tl) tarikhLahir = tl
    }
    let jantina = form.jantina
    if (digits.length === 12) jantina = autoJantina(digits)
    setForm(f => ({ ...f, noKP: fmt, tarikhLahir, jantina }))
  }

  const fullNoBib = bibPrefix && bibNum
    ? bibPrefix + String(bibNum).padStart(bibFormat, '0')
    : bibNum

  const kategori = kiraKategori(form.tarikhLahir, form.jantina, tahunKej, kategoriList)

  const sensitiveChanged = isEdit && (
    form.jantina !== initial?.jantina ||
    form.tarikhLahir !== initial?.tarikhLahir
  )
  const atletPend  = (myPendaftaran || []).filter(p => p.noKP === initial?.noKP)
  const acaraCount = atletPend.flatMap(p => p.acaraIds || []).length

  async function doSave() {
    setErr('')
    if (!form.noKP.trim())   return setErr('No. Kad Pengenalan wajib diisi.')
    if (!form.nama.trim())   return setErr('Nama atlet wajib diisi.')
    if (!form.tarikhLahir)   return setErr('Tarikh lahir wajib diisi.')
    if (!fullNoBib?.trim())  return setErr('Nombor Badan wajib diisi.')

    const maxBibNum = Math.pow(10, bibFormat) - 1
    const bibNumInt = parseInt(bibNum, 10)
    if (bibPrefix && bibNum) {
      if (isNaN(bibNumInt) || bibNumInt < 1 || bibNumInt > maxBibNum) {
        return setErr(`Nombor Badan melebihi format ${bibFormat} digit. Julat sah: 1–${maxBibNum}.`)
      }
    }
    const noKP = form.noKP.replace(/-/g, '')
    if (!/^\d{12}$/.test(noKP)) return setErr('Format No. K/P tidak sah — 12 digit diperlukan.')
    const finalNoKP = `${noKP.slice(0,6)}-${noKP.slice(6,8)}-${noKP.slice(8)}`
    const finalBib  = fullNoBib.trim().toUpperCase()
    const bibDup    = (existingBibs || []).filter(b => b === finalBib)
    const isSameBib = isEdit && initial?.noBib === finalBib
    if (bibDup.length > 0 && !isSameBib) return setErr(`Nombor Badan "${finalBib}" sudah digunakan.`)

    setSaving(true)
    try {
      // Padam pendaftaran lama jika maklumat kritikal berubah
      if (sensitiveChanged && acaraCount > 0 && kejohananId) {
        const batch = writeBatch(db)
        atletPend.forEach(p => batch.delete(
          doc(db, 'tenants', schoolId, 'kejohanan', kejohananId, 'pendaftaran', p.id || p.noKP)
        ))
        await batch.commit()
      }

      if (!isEdit) {
        const ex = await getDoc(doc(db, 'tenants', schoolId, 'atlet', finalNoKP))
        if (ex.exists()) { setSaving(false); return setErr(`Atlet ${finalNoKP} sudah wujud.`) }
      }

      const payload = {
        noKP: finalNoKP, nama: form.nama.trim(),
        jantina: form.jantina, tarikhLahir: form.tarikhLahir,
        noBib:           finalBib,
        kodSekolah:      sekolahData?.kodSekolah || kodSekolah || '',
        kategoriSekolah: sekolahData?.kategori   || 'SM',
        negeri:          sekolahData?.negeri      || '',
        daerah:          sekolahData?.daerah      || '',
        warganegara: 'MY', isAktif: true,
        updatedAt: serverTimestamp(),
      }
      if (!isEdit) payload.createdAt = serverTimestamp()
      await setDoc(doc(db, 'tenants', schoolId, 'atlet', finalNoKP), payload, { merge: isEdit })

      // Sync namaAtlet dalam pendaftaran doc
      if (isEdit && form.nama?.trim() && kejohananId) {
        const pendSnap = await getDocs(
          collection(db, 'tenants', schoolId, 'kejohanan', kejohananId, 'pendaftaran')
        )
        const batch2 = writeBatch(db)
        let n = 0
        pendSnap.docs.forEach(d => {
          if (d.data().noKP === finalNoKP) {
            batch2.update(d.ref, { namaAtlet: form.nama.trim(), updatedAt: serverTimestamp() })
            n++
          }
        })
        if (n > 0) await batch2.commit()
      }

      onSaved(); onClose()
    } catch (e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  function handleSave() {
    if (isEdit && sensitiveChanged && acaraCount > 0) {
      setWarnPending(true)
    } else {
      doSave()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[94vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="text-sm font-bold text-gray-800">{isEdit ? 'Edit Maklumat Atlet' : 'Tambah Atlet Baru'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {warnPending && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-3">
              <p className="text-xs font-bold text-amber-800">Amaran — Maklumat Kritikal Berubah</p>
              <p className="text-xs text-amber-700 leading-relaxed">
                Anda menukar{' '}
                <strong>
                  {[form.jantina !== initial?.jantina && 'Jantina',
                    form.tarikhLahir !== initial?.tarikhLahir && 'Tarikh Lahir'].filter(Boolean).join(' & ')}
                </strong>
                . Perubahan ini akan memadamkan <strong>{acaraCount} pendaftaran acara</strong> bagi atlet ini.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setWarnPending(false)} disabled={saving}
                  className="flex-1 px-3 py-2 text-xs font-bold border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-100">
                  Batal
                </button>
                <button onClick={doSave} disabled={saving}
                  className="flex-1 px-3 py-2 text-xs font-bold bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">
                  {saving ? 'Memproses…' : 'Teruskan & Padam Pendaftaran'}
                </button>
              </div>
            </div>
          )}

          {!warnPending && (
            <>
              {/* Nombor Badan */}
              {(() => {
                const maxBibNum = Math.pow(10, bibFormat) - 1
                const contoh    = bibPrefix
                  ? `${bibPrefix}${String(sekolahData?.bibMula || 1).padStart(bibFormat, '0')}`
                  : 'PP001'
                const hintText  = bibPrefix
                  ? `Prefix: ${bibPrefix} | Format: ${bibFormat} digit (cth: ${contoh}) | Julat: 1–${maxBibNum}`
                  : `Masukkan nombor badan (cth: ${contoh})`
                return (
                  <FormField label="Nombor Badan" required hint={hintText}>
                    {bibPrefix ? (
                      <div className="flex">
                        <span className="inline-flex items-center px-3 py-2 rounded-l-lg border border-r-0 border-gray-200 bg-gray-100 text-xs font-mono font-bold text-gray-600 select-none">
                          {bibPrefix}
                        </span>
                        <input type="number" min={1} max={maxBibNum}
                          value={bibNum} onChange={e => setBibNum(e.target.value)}
                          placeholder={String(sekolahData?.bibMula || 1)}
                          className={inputCls + ' rounded-l-none font-mono'} />
                      </div>
                    ) : (
                      <input value={fullNoBib} onChange={e => setBibNum(e.target.value.toUpperCase())}
                        placeholder={contoh} className={inputCls + ' font-mono'} />
                    )}
                    {fullNoBib && (
                      <p className="text-[10px] text-[#003399] font-mono font-bold mt-1">
                        Nombor Badan: <span className="text-sm">{fullNoBib}</span>
                      </p>
                    )}
                  </FormField>
                )
              })()}

              <FormField label="No. Kad Pengenalan" required hint="Taip 12 digit — sempang & tarikh lahir auto diisi.">
                <input value={form.noKP} onChange={e => handleNoKPChange(e.target.value)}
                  placeholder="020101145678" className={inputCls + ' font-mono tracking-wider'}
                  disabled={isEdit} maxLength={14} />
              </FormField>

              <FormField label="Nama Penuh" required>
                <input value={form.nama} onChange={e => set('nama', e.target.value)}
                  placeholder="Nama seperti dalam kad pengenalan" className={inputCls} />
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Jantina" required>
                  <div className="flex gap-2 h-[38px]">
                    {[{v:'L',l:'Lelaki'},{v:'P',l:'Perempuan'}].map(o => (
                      <button key={o.v} type="button" onClick={() => set('jantina', o.v)}
                        className={`flex-1 rounded-lg text-xs font-bold border transition-colors ${
                          form.jantina===o.v
                            ? o.v==='L'?'bg-blue-600 text-white border-blue-600':'bg-pink-500 text-white border-pink-500'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                        }`}>{o.l}</button>
                    ))}
                  </div>
                  {isEdit && form.jantina !== initial?.jantina && (
                    <p className="text-[10px] text-amber-600 mt-1">⚠ Perubahan ini akan padam pendaftaran atlet.</p>
                  )}
                </FormField>
                <FormField label="Tarikh Lahir" required
                  hint={!isEdit && form.tarikhLahir && form.noKP.replace(/-/g,'').length >= 6 ? 'Auto dari No. KP' : undefined}>
                  <input type="date" value={form.tarikhLahir}
                    readOnly={!isEdit}
                    onChange={isEdit ? e => set('tarikhLahir', e.target.value) : undefined}
                    className={inputCls + (!isEdit ? ' cursor-default' : '')} />
                  {isEdit && form.tarikhLahir !== initial?.tarikhLahir && (
                    <p className="text-[10px] text-amber-600 mt-1">⚠ Perubahan ini akan padam pendaftaran atlet.</p>
                  )}
                </FormField>
              </div>

              {form.tarikhLahir && (
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
                  <span className="text-[10px] text-gray-500">Kategori MSSM:</span>
                  {kategori
                    ? <KategoriBadge kat={kategori} kategoriList={kategoriList} />
                    : <span className="text-[10px] text-red-500 font-semibold">Di luar julat kategori</span>}
                </div>
              )}

              {err && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">{err}</div>
              )}
            </>
          )}
        </div>
        {!warnPending && (
          <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 shrink-0">
            <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg">Batal</button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 text-xs font-bold bg-[#003399] text-white rounded-lg hover:bg-[#002288] disabled:opacity-50">
              {saving ? 'Menyimpan…' : isEdit ? 'Kemaskini' : 'Tambah Atlet'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Modal: Padam Atlet ───────────────────────────────────────────────────────

function PadamAtletModal({ atlet, schoolId, myPendaftaran, kejohananId, onClose, onSaved }) {
  const atletPend  = (myPendaftaran || []).filter(p => p.noKP === atlet.noKP)
  const acaraCount = atletPend.flatMap(p => p.acaraIds || []).length
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  async function handleDelete() {
    setSaving(true)
    try {
      const batch = writeBatch(db)
      if (kejohananId) {
        atletPend.forEach(p => batch.delete(
          doc(db, 'tenants', schoolId, 'kejohanan', kejohananId, 'pendaftaran', p.id || p.noKP)
        ))
      }
      batch.delete(doc(db, 'tenants', schoolId, 'atlet', atlet.noKP))
      await batch.commit()
      onSaved(); onClose()
    } catch (e) { setErr(e.message); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5">
        <h2 className="text-sm font-bold text-gray-800 mb-3">Padam Atlet</h2>
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
          <p className="text-xs font-bold text-red-800">{atlet.nama}</p>
          <p className="text-[10px] font-mono text-red-600">{atlet.noKP}</p>
          {acaraCount > 0 ? (
            <p className="text-xs text-red-700 mt-2">
              ⚠ Atlet ini mempunyai <strong>{acaraCount} pendaftaran acara</strong>. Semua pendaftaran akan dipadam bersama.
            </p>
          ) : (
            <p className="text-xs text-red-700 mt-2">Atlet ini belum mendaftar mana-mana acara.</p>
          )}
        </div>
        {err && <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg mb-3">{err}</div>}
        <div className="flex gap-2">
          <button onClick={onClose} disabled={saving}
            className="flex-1 px-3 py-2 text-xs font-semibold border border-gray-200 rounded-lg hover:bg-gray-50">Batal</button>
          <button onClick={handleDelete} disabled={saving}
            className="flex-1 px-3 py-2 text-xs font-bold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
            {saving ? 'Memproses…' : 'Padam Atlet'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: Import Atlet dari Excel ──────────────────────────────────────────

const COL_ALIAS = {
  noKP:  ['nokp','no kp','no. kp','no kad pengenalan','ic','icno','no. k/p','nokp (12 digit)'],
  nama:  ['nama','name','nama penuh','full name'],
  noBib: ['nobib','no bib','no. bib','bib','nombor bib','bib number','no badan','no. badan'],
}
function findCol(headers, field) {
  const aliases = COL_ALIAS[field]
  return headers.find(h => aliases.includes(h.toLowerCase().trim().replace(/\s+/g,' ')))
}

function ImportAtletModal({ schoolId, kodSekolah, sekolahData, existingBibs, onClose, onSaved }) {
  const [rows,     setRows]     = useState([])
  const [saving,   setSaving]   = useState(false)
  const [fileErr,  setFileErr]  = useState('')
  const [done,     setDone]     = useState(false)
  const [saveInfo, setSaveInfo] = useState({ ok: 0, skip: 0 })

  const bibPrefix = (sekolahData?.bibPrefix || '').toUpperCase()
  const bibFormat = Number(sekolahData?.bibFormat) || 3

  function parseFile(file) {
    setFileErr('')
    setRows([])
    setDone(false)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb  = XLSX.read(new Uint8Array(e.target.result), { type: 'array' })
        const ws  = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
        if (raw.length === 0) { setFileErr('Fail kosong atau tiada data.'); return }

        const hdrs     = Object.keys(raw[0])
        const colNoKP  = findCol(hdrs, 'noKP')
        const colNama  = findCol(hdrs, 'nama')
        const colNoBib = findCol(hdrs, 'noBib')

        if (!colNoKP || !colNama) {
          setFileErr('Kolum wajib tidak dijumpai. Pastikan header ada: noKP, nama, noBib.')
          return
        }
        if (!colNoBib) {
          setFileErr('Kolum "noBib" tidak dijumpai. Sila gunakan templat yang disediakan.')
          return
        }

        const bibSet  = new Set(existingBibs || [])
        const seenKP  = new Set()
        const seenBib = new Set()

        const parsed = raw.map((r, i) => {
          const errs = []
          const noKPRaw = String(r[colNoKP] || '').trim()
          const digits  = noKPRaw.replace(/\D/g, '')
          const noKP    = formatNoKP(noKPRaw)

          if (!noKPRaw) errs.push('No. K/P kosong')
          else if (digits.length < 12) errs.push(`No. K/P kurang digit — ada ${digits.length}, perlu 12`)
          else if (!noKP) errs.push('No. K/P tidak sah')
          else if (seenKP.has(noKP)) errs.push('No. K/P berganda dalam fail ini')
          if (noKP) seenKP.add(noKP)

          const nama = String(r[colNama] || '').trim()
          if (!nama) errs.push('Nama kosong')

          const noBib = String(r[colNoBib] || '').trim().toUpperCase()
          if (!noBib) errs.push('No. BIB kosong — wajib diisi')
          else if (bibSet.has(noBib)) errs.push(`No. BIB "${noBib}" sudah digunakan`)
          else if (seenBib.has(noBib)) errs.push(`No. BIB "${noBib}" berganda dalam fail`)
          if (noBib && !bibSet.has(noBib)) seenBib.add(noBib)

          const jantina    = noKP ? autoJantina(noKP.replace(/-/g,'')) : ''
          const tarikhLahir = noKP ? (autoTarikhLahir(noKP.replace(/-/g,'')) || '') : ''
          if (noKP && !tarikhLahir) errs.push('Tarikh lahir tidak dapat dikesan dari No. K/P')

          return { row: i + 2, noKP, noKPRaw, nama, jantina, tarikhLahir, noBib, errs }
        })

        setRows(parsed)
      } catch (ex) {
        setFileErr(`Gagal baca fail: ${ex.message}`)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function handleSave() {
    const valid = rows.filter(r => r.errs.length === 0)
    if (valid.length === 0) return
    setSaving(true)
    let ok = 0, skip = 0
    try {
      for (const r of valid) {
        const snap = await getDoc(doc(db, 'tenants', schoolId, 'atlet', r.noKP))
        if (snap.exists()) { skip++; continue }
        await setDoc(doc(db, 'tenants', schoolId, 'atlet', r.noKP), {
          noKP:            r.noKP,
          nama:            r.nama,
          jantina:         r.jantina,
          tarikhLahir:     r.tarikhLahir,
          warganegara:     'MY',
          noBib:           r.noBib,
          kodSekolah:      sekolahData?.kodSekolah || kodSekolah || '',
          kategoriSekolah: sekolahData?.kategori   || '',
          negeri:          sekolahData?.negeri      || '',
          daerah:          sekolahData?.daerah      || '',
          isAktif:         true,
          createdAt:       serverTimestamp(),
          updatedAt:       serverTimestamp(),
        })
        ok++
      }
      setSaveInfo({ ok, skip })
      setDone(true)
      setTimeout(() => { onSaved(); onClose() }, 2000)
    } catch (e) {
      setFileErr(`Gagal simpan: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  const validCount   = rows.filter(r => r.errs.length === 0).length
  const invalidCount = rows.filter(r => r.errs.length  > 0).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-sm font-bold text-gray-800">Import Atlet dari Excel / CSV</h2>
            <p className="text-[10px] text-gray-400 mt-0.5">Muat naik fail Excel (.xlsx) atau CSV (.csv).</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Langkah 1 */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-blue-800">Langkah 1 — Muat turun templat</p>
              <p className="text-[10px] text-blue-600 mt-1">
                <strong>3 kolum wajib</strong>: <strong>noKP</strong>, <strong>nama</strong>, <strong>noBib</strong><br/>
                Jantina &amp; tarikh lahir <strong>auto-detect</strong> dari No. K/P
              </p>
            </div>
            <button onClick={() => downloadTemplateAtlet(bibPrefix, bibFormat)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Muat Turun Templat
            </button>
          </div>

          {/* Langkah 2 */}
          <div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Langkah 2 — Muat naik fail</p>
            <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
              <svg className="w-7 h-7 text-gray-400 mb-1" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-xs text-gray-500">Klik atau seret fail <strong>.xlsx</strong> / <strong>.csv</strong> ke sini</span>
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => e.target.files?.[0] && parseFile(e.target.files[0])} />
            </label>
            {fileErr && (
              <div className="mt-2 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <p className="text-xs text-red-700 font-semibold">{fileErr}</p>
              </div>
            )}
          </div>

          {/* Langkah 3 */}
          {rows.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Langkah 3 — Semak sebelum simpan</p>
                <div className="flex gap-2">
                  {validCount > 0 && <span className="text-[10px] font-bold px-2.5 py-1 bg-green-100 text-green-700 rounded-full">{validCount} sah</span>}
                  {invalidCount > 0 && <span className="text-[10px] font-bold px-2.5 py-1 bg-red-100 text-red-700 rounded-full">{invalidCount} ada ralat</span>}
                </div>
              </div>

              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-xs min-w-[640px]">
                    <thead className="sticky top-0 bg-gray-50 z-10 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2.5 text-left text-[9px] font-bold text-gray-400 uppercase tracking-wide w-8">Baris</th>
                        <th className="px-3 py-2.5 text-left text-[9px] font-bold text-gray-400 uppercase tracking-wide">No. Kad Pengenalan</th>
                        <th className="px-3 py-2.5 text-left text-[9px] font-bold text-gray-400 uppercase tracking-wide">Nama Penuh</th>
                        <th className="px-3 py-2.5 text-center text-[9px] font-bold text-gray-400 uppercase tracking-wide w-20">Jantina</th>
                        <th className="px-3 py-2.5 text-left text-[9px] font-bold text-gray-400 uppercase tracking-wide">Tarikh Lahir</th>
                        <th className="px-3 py-2.5 text-center text-[9px] font-bold text-gray-400 uppercase tracking-wide">No. BIB</th>
                        <th className="px-3 py-2.5 text-left text-[9px] font-bold text-gray-400 uppercase tracking-wide">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => {
                        const isOk = r.errs.length === 0
                        return (
                          <tr key={i} className={`border-b border-gray-50 ${!isOk ? 'bg-red-50' : 'hover:bg-gray-50/50'}`}>
                            <td className="px-3 py-2 text-[9px] font-mono text-gray-400">{r.row}</td>
                            <td className="px-3 py-2 font-mono text-[10px] text-gray-700">{r.noKP || <span className="text-red-400 italic text-[9px]">{r.noKPRaw || '(kosong)'}</span>}</td>
                            <td className="px-3 py-2 font-semibold text-gray-800 max-w-[180px] truncate">{r.nama || <span className="text-red-400 italic text-[9px]">(kosong)</span>}</td>
                            <td className="px-3 py-2 text-center">
                              {r.jantina === 'L' ? <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">Lelaki</span>
                               : r.jantina === 'P' ? <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-pink-100 text-pink-700">Perempuan</span>
                               : <span className="text-[9px] text-red-400 font-semibold">—</span>}
                            </td>
                            <td className="px-3 py-2 font-mono text-[10px] text-gray-600">{r.tarikhLahir || <span className="text-red-400 italic text-[9px]">—</span>}</td>
                            <td className="px-3 py-2 text-center">
                              {r.noBib
                                ? <span className="text-[10px] font-black text-[#003399] bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">{r.noBib}</span>
                                : <span className="text-[9px] text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2">
                              {isOk
                                ? <span className="text-[9px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">Sah</span>
                                : <div className="space-y-0.5">{r.errs.map((e, j) => <p key={j} className="text-[9px] text-red-600 font-semibold">{e}</p>)}</div>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {invalidCount > 0 && (
                <div className="mt-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-amber-800">
                    <strong>{invalidCount} baris ada ralat</strong> dan akan dilangkau.
                    Hanya <strong>{validCount} baris sah</strong> yang akan disimpan.
                  </p>
                </div>
              )}
            </div>
          )}

          {done && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <p className="text-xs font-bold text-green-800">Import berjaya!</p>
                <p className="text-[10px] text-green-700 mt-0.5">
                  {saveInfo.ok} atlet disimpan{saveInfo.skip > 0 ? `, ${saveInfo.skip} dilangkau (noKP sudah wujud)` : ''}.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between shrink-0">
          <p className="text-[10px] text-gray-400">
            {bibPrefix ? `Prefix BIB: ${bibPrefix}` : 'Tiada bibPrefix — tetapkan dalam Tetapan Sekolah'}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg">Batal</button>
            <button onClick={handleSave} disabled={saving || validCount === 0 || done}
              className="px-5 py-2 text-xs font-bold bg-[#003399] text-white rounded-lg hover:bg-[#002288] disabled:opacity-50 flex items-center gap-2">
              {saving ? (
                <><svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Menyimpan…</>
              ) : `Simpan ${validCount} Atlet`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: Daftar Atlet ke Acara ─────────────────────────────────────────────

function DaftarModal({ acara, schoolId, kejohanan, atletSekolah, pendaftaranList, kategoriList, onClose, onSaved }) {
  const [selected,   setSelected]   = useState([])
  const [saving,     setSaving]     = useState(false)
  const [validating, setValidating] = useState(false)
  const [err, setErr]               = useState('')
  const [errGate, setErrGate]       = useState('')
  const [warn, setWarn]             = useState('')

  const tahunKej = kejohanan?.tarikhMula
    ? new Date(kejohanan.tarikhMula?.toDate?.() || kejohanan.tarikhMula).getFullYear()
    : new Date().getFullYear()

  const sudahDaftar = pendaftaranList
    .filter(p => p.acaraIds?.includes(acara.aceraId || acara.id))
    .map(p => p.noKP)

  const _katObj = kategoriList.find(k => (k.kod || k.id) === acara.kategoriKod)

  const isAcaraTerbuka = acara.isTerbuka || acara.kategoriKod === 'TERBUKA'
  const atletLayak = atletSekolah.filter(a => {
    if (a.isAktif === false) return false
    if (sudahDaftar.includes(a.noKP)) return false
    if (isAcaraTerbuka) {
      const katTerbuka = acara.kategoriTerbuka || []
      if (katTerbuka.length === 0) return false
      const katAtlet = kiraKategori(a.tarikhLahir, a.jantina, tahunKej, kategoriList)
      return katAtlet && katTerbuka.includes(katAtlet)
    }
    if (a.jantina !== acara.jantina) return false
    const katKira = kiraKategori(a.tarikhLahir, a.jantina, tahunKej, kategoriList)
    const kat = katKira || a.kategoriKod
    return kat === acara.kategoriKod
  })

  const hadAcara = (() => {
    if (acara.jenisAcara === 'relay' && _katObj) {
      const saizPasukan = Number(_katObj.saizPasukan) || 4
      const hadPasukan  = acara.jantina === 'P'
        ? (Number(_katObj.hadPasukanP) || 1)
        : (Number(_katObj.hadPasukanL) || 1)
      return saizPasukan * hadPasukan
    }
    return acara.hadAtletPerSekolah || 2
  })()

  const aceraId     = acara.aceraId || acara.id
  const sekolahSudah = pendaftaranList.filter(p => p.acaraIds?.includes(aceraId)).length
  const slotBaki    = hadAcara - sekolahSudah

  function toggleSelect(noKP) {
    setSelected(s => s.includes(noKP) ? s.filter(x => x !== noKP) : [...s, noKP])
  }

  async function handleSave() {
    setErr(''); setErrGate(''); setWarn('')
    if (selected.length === 0) return setErr('Pilih sekurang-kurangnya seorang atlet.')

    const kejohananId = kejohanan.id

    setValidating(true)
    let jadualWarning = ''
    try {
      for (const noKP of selected) {
        const atlet = atletSekolah.find(a => a.noKP === noKP)
        if (!atlet) continue
        const hasil = await validasiPendaftaran({
          schoolId,
          noKP,
          tarikhLahir:    atlet.tarikhLahir,
          jantina:        atlet.jantina,
          kodSekolah:     atlet.kodSekolah,
          kejohananId,
          aceraId,
          kategoriId:     acara.kategoriKod,
          jenisAcara:     acara.jenisAcara,
          tahunKejohanan: tahunKej,
          bypassHeat:     false,
        })
        if (!hasil.valid) {
          setErr(`${atlet.nama || noKP} — ${hasil.mesej}`)
          setErrGate(hasil.gate)
          return
        }
        if (hasil.warning && !jadualWarning) jadualWarning = `${atlet.nama || noKP} — ${hasil.warning}`
      }
    } catch (e) {
      setErr('Ralat semasa validasi: ' + e.message)
      return
    } finally {
      setValidating(false)
    }
    if (jadualWarning) setWarn(jadualWarning)

    setSaving(true)
    try {
      const sekolahSnap = await getDoc(doc(db, 'tenants', schoolId, 'sekolah', atletSekolah[0]?.kodSekolah || ''))
      const sekolahDataLive = sekolahSnap.exists() ? sekolahSnap.data() : {}
      const bibPfx = sekolahDataLive.bibPrefix || atletSekolah[0]?.kodSekolah || 'BIB'
      const bibFmt = Number(sekolahDataLive.bibFormat) || 3

      const pendSnap = await getDocs(
        collection(db, 'tenants', schoolId, 'kejohanan', kejohananId, 'pendaftaran')
      )
      const noBibSedia  = pendSnap.docs.map(d => d.data().noBib).filter(Boolean)
      const noBibAtlet  = atletSekolah.map(a => a.noBib).filter(Boolean)
      const senaraiNoBib = [...new Set([...noBibSedia, ...noBibAtlet])]

      const pendLiveByKP = {}
      pendSnap.docs.forEach(d => {
        const p = d.data()
        if (p.noKP) pendLiveByKP[p.noKP] = { ...p }
      })

      const toUpdate = []
      const toCreate = []
      for (const noKP of selected) {
        const atlet = atletSekolah.find(a => a.noKP === noKP)
        if (!atlet) continue
        const pRec = pendLiveByKP[noKP]
        if (pRec) toUpdate.push({ noKP, pRec })
        else       toCreate.push({ atlet })
      }

      for (const { pRec } of toUpdate) {
        const acaraIds = [...new Set([...(pRec.acaraIds || []), aceraId])]
        await updateDoc(
          doc(db, 'tenants', schoolId, 'kejohanan', kejohananId, 'pendaftaran', pRec.noKP),
          { acaraIds, updatedAt: serverTimestamp() }
        )
      }

      if (toCreate.length > 0) {
        const kodSekolahCounter = atletSekolah[0]?.kodSekolah || bibPfx
        const counterRef = doc(db, 'tenants', schoolId, 'pendaftaran_counter', `${kejohananId}_${kodSekolahCounter}`)
        await runTransaction(db, async (transaction) => {
          const counterSnap = await transaction.get(counterRef)
          let lastNum = counterSnap.exists() ? (counterSnap.data().lastBibNum || 0) : 0
          senaraiNoBib.forEach(nb => {
            if (nb.startsWith(bibPfx)) {
              const n = parseInt(nb.slice(bibPfx.length), 10)
              if (!isNaN(n) && n > lastNum) lastNum = n
            }
          })

          for (const { atlet } of toCreate) {
            lastNum++
            const noBib = bibPfx + String(lastNum).padStart(bibFmt, '0')
            transaction.set(
              doc(db, 'tenants', schoolId, 'kejohanan', kejohananId, 'pendaftaran', atlet.noKP),
              {
                noBib,
                noKP:        atlet.noKP,
                namaAtlet:   atlet.nama,
                jantina:     atlet.jantina,
                tarikhLahir: atlet.tarikhLahir,
                kodSekolah:  atlet.kodSekolah,
                namaSekolah: sekolahDataLive.namaSekolah || atlet.kodSekolah,
                kategoriKod: kiraKategori(atlet.tarikhLahir, atlet.jantina, tahunKej, kategoriList),
                acaraIds:    [aceraId],
                isAktif:     true,
                isRelay:     false,
                createdAt:   serverTimestamp(),
                updatedAt:   serverTimestamp(),
              }
            )
          }

          transaction.set(counterRef, {
            lastBibNum:  lastNum,
            bibPrefix:   bibPfx,
            kodSekolah:  kodSekolahCounter,
            kejohananId,
            updatedAt:   serverTimestamp(),
          })
        })
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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-bold text-gray-800">Daftar ke Acara</h2>
              <p className="text-xs text-gray-500 mt-0.5 font-semibold">
                {acara.namaAcara} — Kat {acara.kategoriKod} {acara.jantina==='L'?'Lelaki':'Perempuan'}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
          </div>
          <div className="flex gap-2 mt-2 flex-wrap">
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
              slotBaki > 0 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
            }`}>
              {slotBaki > 0 ? `${sekolahSudah}/${hadAcara} slot` : `${sekolahSudah}/${hadAcara} PENUH`}
            </span>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-3">
          {slotBaki <= 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-red-600 font-semibold">Had pendaftaran sekolah ini penuh.</p>
              <p className="text-xs text-gray-400 mt-1">Maks {hadAcara} atlet dari sekolah ini untuk acara ini.</p>
            </div>
          ) : atletLayak.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-gray-500">Tiada atlet yang layak.</p>
              <p className="text-xs text-gray-400 mt-1">Semak: jantina, kategori (umur), dan sama ada sudah didaftarkan.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold mb-2">Pilih Atlet ({atletLayak.length} layak)</p>
              {atletLayak.map(a => {
                const katKira = kiraKategori(a.tarikhLahir, a.jantina, tahunKej, kategoriList)
                const kat = katKira || a.kategoriKod
                const isSelected  = selected.includes(a.noKP)
                const willExceed  = !isSelected && selected.length >= slotBaki
                return (
                  <button key={a.noKP} type="button"
                    onClick={() => !willExceed && toggleSelect(a.noKP)}
                    disabled={willExceed}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${
                      isSelected ? 'border-[#003399] bg-blue-50'
                      : willExceed ? 'border-gray-100 bg-gray-50 opacity-40 cursor-not-allowed'
                      : 'border-gray-200 hover:border-gray-300'
                    }`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${isSelected?'border-[#003399] bg-[#003399]':'border-gray-300'}`}>
                        {isSelected && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <div className="min-w-0 text-left">
                        <p className="text-xs font-bold text-gray-800 truncate">{a.nama || <span className="text-gray-400 italic">Tiada nama</span>}</p>
                        <p className="text-[9px] text-gray-400 font-mono">{a.noKP}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <KategoriBadge kat={kat} kategoriList={kategoriList} />
                      <JantinaBadge j={a.jantina} />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {selected.length > 0 && (
          <div className="px-5 py-2 bg-blue-50 border-t border-blue-100 shrink-0">
            <p className="text-xs font-semibold text-[#003399]">{selected.length} atlet dipilih</p>
          </div>
        )}

        {err && (
          <div className="mx-5 mb-2 bg-red-50 border border-red-200 rounded-lg overflow-hidden">
            {errGate && (
              <div className="px-3 py-1 bg-red-100 border-b border-red-200 flex items-center gap-1.5">
                <span className="text-[9px] font-black text-red-600 font-mono">{errGate}</span>
                <span className="text-[9px] text-red-500">Gagal</span>
              </div>
            )}
            <p className="text-red-700 text-xs px-3 py-2">{err}</p>
          </div>
        )}

        {warn && !err && (
          <div className="mx-5 mb-2 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2">
            <p className="text-amber-800 text-xs">{warn}</p>
          </div>
        )}

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg">Batal</button>
          <button onClick={handleSave}
            disabled={saving || validating || selected.length === 0 || slotBaki <= 0}
            className="px-5 py-2 text-xs font-bold bg-[#003399] text-white rounded-lg hover:bg-[#002288] disabled:opacity-50 flex items-center gap-2">
            {validating ? (
              <><svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Menyemak…</>
            ) : saving ? 'Mendaftar…' : `Daftar ${selected.length} Atlet`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: Buang Atlet dari Acara ────────────────────────────────────────────

function BuangDaftarModal({ atlet, acara, pRec, schoolId, kejohananId, onClose, onSaved }) {
  const [saving, setSaving] = useState(false)

  async function handleBuang() {
    setSaving(true)
    try {
      const docId   = pRec.id || pRec.noKP
      const aceraId = acara.aceraId || acara.id
      const acaraBaru = (pRec.acaraIds || []).filter(id => id !== aceraId)
      const ref = doc(db, 'tenants', schoolId, 'kejohanan', kejohananId, 'pendaftaran', docId)
      if (acaraBaru.length === 0) {
        await deleteDoc(ref)
      } else {
        await updateDoc(ref, { acaraIds: acaraBaru, updatedAt: serverTimestamp() })
      }
      onSaved(); onClose()
    } catch (e) { alert(e.message); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5 text-center">
        <div className="w-11 h-11 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
          </svg>
        </div>
        <h3 className="text-sm font-bold text-gray-800 mb-1">Buang Pendaftaran?</h3>
        <p className="text-xs text-gray-500 mb-4">
          Buang <strong>{atlet?.namaAtlet || atlet?.nama}</strong> dari <strong>{acara.namaAcara}</strong>?
        </p>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Batal</button>
          <button onClick={handleBuang} disabled={saving}
            className="flex-1 py-2 text-xs font-bold bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50">
            {saving ? 'Membuang…' : 'Buang'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Tab 1: Urus Atlet ────────────────────────────────────────────────────────

function TabAtlet({ schoolId, kodSekolah, sekolahData, tahunKej, kategoriList, kejohananId, myPendaftaran, onRefreshPend }) {
  const [atletList,   setAtletList]   = useState([])
  const [loading,     setLoading]     = useState(false)
  const [filterJ,     setFilterJ]     = useState('semua')
  const [search,      setSearch]      = useState('')
  const [modal,       setModal]       = useState(null) // null | { type: 'add'|'edit', data? }
  const [showImport,  setShowImport]  = useState(false)
  const [toast,       setToast]       = useState('')
  const [confirmDel,  setConfirmDel]  = useState(null)

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const fetchAtlet = useCallback(async () => {
    if (!schoolId || !kodSekolah) return
    setLoading(true)
    try {
      const snap = await getDocs(
        query(collection(db, 'tenants', schoolId, 'atlet'), where('kodSekolah', '==', kodSekolah))
      )
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      data.sort((a, b) => (a.nama || '').localeCompare(b.nama || '', 'ms'))
      setAtletList(data)
    } catch (e) { console.error('fetchAtlet:', e) }
    finally { setLoading(false) }
  }, [schoolId, kodSekolah])

  useEffect(() => { fetchAtlet() }, [fetchAtlet])

  const filtered = atletList.filter(a => {
    if (filterJ !== 'semua' && a.jantina !== filterJ) return false
    if (search) {
      const q = search.toLowerCase()
      return a.nama?.toLowerCase().includes(q) || a.noKP?.includes(q) || a.noBib?.toLowerCase().includes(q)
    }
    return true
  })

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cari nama / No. KP / BIB…"
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#003399]/25" />
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-[10px] bg-white">
            {['semua','L','P'].map(f => (
              <button key={f} onClick={() => setFilterJ(f)}
                className={`px-2.5 py-1.5 font-semibold transition-colors ${filterJ===f?'bg-[#003399] text-white':'text-gray-500 hover:bg-gray-50'}`}>
                {f === 'semua' ? 'L+P' : f}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-4 py-2 border border-[#003399] text-[#003399] text-xs font-bold rounded-lg hover:bg-blue-50">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import Excel
          </button>
          <button onClick={() => setModal({ type: 'add' })}
            className="flex items-center gap-2 px-4 py-2 bg-[#003399] text-white text-xs font-bold rounded-lg hover:bg-[#002288]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Tambah Atlet
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { l:'Jumlah', v:filtered.length, c:'text-[#003399]', bg:'bg-blue-50' },
          { l:'Lelaki',  v:filtered.filter(a=>a.jantina==='L').length, c:'text-blue-700', bg:'bg-blue-50' },
          { l:'Perempuan', v:filtered.filter(a=>a.jantina==='P').length, c:'text-pink-700', bg:'bg-pink-50' },
        ].map(s => (
          <div key={s.l} className={`${s.bg} rounded-xl px-3 py-2 text-center`}>
            <p className={`text-xl font-black ${s.c}`}>{s.v}</p>
            <p className="text-[9px] text-gray-500 uppercase tracking-wide">{s.l}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-10 text-center text-sm text-gray-400">Memuatkan…</div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">
            {atletList.length === 0 ? 'Tiada atlet. Tambah atlet baru.' : 'Tiada hasil carian.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-3 py-2.5 text-left text-[9px] font-bold text-gray-400 uppercase tracking-wide">BIB</th>
                  <th className="px-3 py-2.5 text-left text-[9px] font-bold text-gray-400 uppercase tracking-wide">Nama</th>
                  <th className="px-3 py-2.5 text-center text-[9px] font-bold text-gray-400 uppercase tracking-wide">J</th>
                  <th className="px-3 py-2.5 text-left text-[9px] font-bold text-gray-400 uppercase tracking-wide">Tarikh Lahir</th>
                  <th className="px-3 py-2.5 text-center text-[9px] font-bold text-gray-400 uppercase tracking-wide">Kategori</th>
                  <th className="px-3 py-2.5 text-center text-[9px] font-bold text-gray-400 uppercase tracking-wide">Tindakan</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => {
                  const katAuto = kiraKategori(a.tarikhLahir, a.jantina, tahunKej, kategoriList)
                  const katVal  = katAuto || a.kategoriKod || ''
                  return (
                    <tr key={a.noKP} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${!a.isAktif?'opacity-50':''}`}>
                      <td className="px-3 py-2.5">
                        <span className="text-[10px] font-black font-mono text-[#003399] bg-blue-50 px-2 py-0.5 rounded">{a.noBib || '—'}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-bold text-gray-800">{a.nama}</p>
                        <p className="text-[9px] font-mono text-gray-400">{a.noKP}</p>
                      </td>
                      <td className="px-3 py-2.5 text-center"><JantinaBadge j={a.jantina} /></td>
                      <td className="px-3 py-2.5 text-gray-600">{a.tarikhLahir}</td>
                      <td className="px-3 py-2.5 text-center">
                        {katVal ? <KategoriBadge kat={katVal} kategoriList={kategoriList} /> : <span className="text-[9px] text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-center gap-1">
                          <button onClick={() => setModal({ type:'edit', data:a })}
                            className="p-1 text-gray-400 hover:text-[#003399] hover:bg-blue-50 rounded transition-colors" title="Edit">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button onClick={() => setConfirmDel(a)}
                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors" title="Padam">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {modal?.type === 'add' && (
        <AtletModal mode="add" schoolId={schoolId} kodSekolah={kodSekolah}
          sekolahData={sekolahData}
          existingBibs={atletList.map(a => a.noBib).filter(Boolean)}
          myPendaftaran={myPendaftaran}
          kejohananId={kejohananId}
          tahunKej={tahunKej}
          kategoriList={kategoriList}
          onClose={() => setModal(null)}
          onSaved={() => { fetchAtlet(); onRefreshPend(); showToast('Atlet berjaya didaftarkan.') }} />
      )}
      {modal?.type === 'edit' && (
        <AtletModal mode="edit" initial={modal.data} schoolId={schoolId} kodSekolah={kodSekolah}
          sekolahData={sekolahData}
          existingBibs={atletList.map(a => a.noBib).filter(Boolean)}
          myPendaftaran={myPendaftaran}
          kejohananId={kejohananId}
          tahunKej={tahunKej}
          kategoriList={kategoriList}
          onClose={() => setModal(null)}
          onSaved={() => { fetchAtlet(); onRefreshPend(); showToast('Maklumat atlet dikemas kini.') }} />
      )}
      {showImport && (
        <ImportAtletModal
          schoolId={schoolId} kodSekolah={kodSekolah}
          sekolahData={sekolahData}
          existingBibs={atletList.map(a => a.noBib).filter(Boolean)}
          onClose={() => setShowImport(false)}
          onSaved={() => { fetchAtlet(); showToast('Import atlet berjaya.') }} />
      )}
      {confirmDel && (
        <PadamAtletModal
          atlet={confirmDel} schoolId={schoolId}
          myPendaftaran={myPendaftaran}
          kejohananId={kejohananId}
          onClose={() => setConfirmDel(null)}
          onSaved={() => { fetchAtlet(); onRefreshPend(); showToast('Atlet berjaya dipadam.') }} />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-lg flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {toast}
        </div>
      )}
    </div>
  )
}

// ─── Tab 2: Daftar Acara ──────────────────────────────────────────────────────

function TabDaftar({ schoolId, kodSekolah, sekolahData, kejohanan, tahunKej, kategoriList,
                     atletSekolah, pendaftaranList, acaraList, loading, fetchErr, onRefresh }) {
  const [selectedAcara, setSelectedAcara] = useState(null)
  const [modal,         setModal]         = useState(null)
  const [filterKat,     setFilterKat]     = useState('semua')
  const [filterJenis,   setFilterJenis]   = useState('semua')

  // Inline daftar state — per acara
  const [inlineSelected, setInlineSelected] = useState({}) // { aceraId: Set(noKP) }
  const [inlineSaving,   setInlineSaving]   = useState({}) // { aceraId: bool }
  const [inlineErr,      setInlineErr]      = useState({}) // { aceraId: string }

  const tarikhTamatDaftar = kejohanan?.tarikhTamatDaftar || null
  const [countdownStr, setCountdownStr] = useState('')

  useEffect(() => {
    if (!tarikhTamatDaftar) { setCountdownStr(''); return }
    function tick() {
      const ms = new Date(tarikhTamatDaftar) - new Date()
      if (ms <= 0) { setCountdownStr('TAMAT'); return }
      const s = Math.floor(ms / 1000)
      const m = Math.floor(s / 60)
      const h = Math.floor(m / 60)
      const d = Math.floor(h / 24)
      setCountdownStr(d > 0
        ? `${d} hari ${String(h%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
        : `${String(h%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [tarikhTamatDaftar])

  const tamatDaftarLepas  = tarikhTamatDaftar && new Date() > new Date(tarikhTamatDaftar)
  const pendaftaranTutup  = tamatDaftarLepas

  // Hanya acara saringan (tanpa parentAcaraId)
  const jenisShort = { lorong:'Lorong', mass_start:'Mass', padang_lompat:'Lompat', padang_balin:'Balin', relay:'Relay' }
  const acaraSaringan = acaraList.filter(a => !a.parentAcaraId && a.isAktif !== false)
  const katList = [...new Set(acaraSaringan.map(a => a.kategoriKod))].sort()

  const acaraFiltered = acaraSaringan.filter(a => {
    if (filterKat !== 'semua' && a.kategoriKod !== filterKat) return false
    if (filterJenis !== 'semua' && a.jenisAcara !== filterJenis) return false
    return true
  })

  const pesertaByAcara = useMemo(() => {
    const map = {}
    pendaftaranList.forEach(p => {
      (p.acaraIds || []).forEach(id => {
        if (!map[id]) map[id] = []
        map[id].push(p)
      })
    })
    return map
  }, [pendaftaranList])

  const pesertaSekolahByAcara = useMemo(() => {
    const map = {}
    pendaftaranList.forEach(p => {
      if (p.kodSekolah !== kodSekolah) return
      (p.acaraIds || []).forEach(id => {
        if (!map[id]) map[id] = []
        map[id].push(p)
      })
    })
    return map
  }, [pendaftaranList, kodSekolah])

  // Stats
  const myPend = pendaftaranList.filter(p => p.kodSekolah === kodSekolah)

  return (
    <div className="space-y-4">
      {kejohanan?.namaKejohanan && (
        <p className="text-xs font-semibold text-[#003399]">{kejohanan.namaKejohanan}</p>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { l:'Jumlah Acara',   v: acaraList.filter(a=>a.isAktif!==false).length, c:'text-[#003399]', bg:'bg-blue-50' },
          { l:'Atlet Sekolah',  v: myPend.length, c:'text-green-700', bg:'bg-green-50' },
          { l:'Atlet Lelaki',   v: myPend.filter(p=>p.jantina==='L').length, c:'text-blue-700', bg:'bg-blue-50' },
          { l:'Atlet Perempuan',v: myPend.filter(p=>p.jantina==='P').length, c:'text-pink-700', bg:'bg-pink-50' },
        ].map(s => (
          <div key={s.l} className={`${s.bg} rounded-xl px-3 py-2.5 text-center`}>
            <p className={`text-xl font-black ${s.c}`}>{s.v}</p>
            <p className="text-[9px] text-gray-500 uppercase tracking-wide">{s.l}</p>
          </div>
        ))}
      </div>

      {/* Deadline / Countdown */}
      {!tarikhTamatDaftar && (
        <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl">
          <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-gray-500">Tarikh tutup pendaftaran belum ditetapkan. Hubungi pentadbir untuk maklumat lanjut.</p>
        </div>
      )}

      {pendaftaranTutup && (
        <div className="flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <svg className="w-4 h-4 shrink-0 text-red-500 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <div>
            <p className="text-xs font-bold text-red-800">Tempoh Pendaftaran Telah Tamat — {formatDeadlineMY(tarikhTamatDaftar)}</p>
            <p className="text-[10px] text-red-600 mt-0.5">Senarai peserta boleh dilihat. Pendaftaran baru tidak dibenarkan.</p>
          </div>
        </div>
      )}

      {tarikhTamatDaftar && !tamatDaftarLepas && countdownStr && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
          countdownStr === 'TAMAT' || countdownStr.startsWith('00:')
            ? 'bg-red-50 border-red-200 text-red-800'
            : countdownStr.startsWith('1 hari') || countdownStr.startsWith('2 hari') || countdownStr.startsWith('3 hari')
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Masa Tutup Pendaftaran Acara</p>
            <p className="text-xs font-bold">{formatDeadlineMY(tarikhTamatDaftar)}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Masa Tinggal</p>
            <p className="text-sm font-black font-mono tracking-wider">{countdownStr}</p>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex flex-wrap rounded-lg border border-gray-200 overflow-hidden text-[10px] bg-white">
          {['semua', ...katList].map(k => (
            <button key={k} onClick={() => setFilterKat(k)}
              className={`px-2.5 py-1.5 font-bold transition-colors ${filterKat===k?'bg-[#003399] text-white':'text-gray-500 hover:bg-gray-50'}`}>
              {k === 'semua' ? 'Semua' : `Kat ${k}`}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-[10px] bg-white">
          {['semua', 'lorong', 'mass_start', 'padang_lompat', 'padang_balin', 'relay'].map(j => (
            <button key={j} onClick={() => setFilterJenis(j)}
              className={`px-2.5 py-1.5 font-semibold transition-colors ${filterJenis===j?'bg-[#003399] text-white':'text-gray-500 hover:bg-gray-50'}`}>
              {j === 'semua' ? 'Semua' : jenisShort[j] || j}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {fetchErr && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-3 rounded-xl">
          <span className="font-bold">Ralat:</span> {fetchErr}
        </div>
      )}

      {/* Senarai Acara */}
      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Memuatkan…</div>
      ) : acaraFiltered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-10 text-center">
          <p className="text-sm text-gray-400">Tiada acara. Tambah acara dalam Setup Acara dahulu.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {acaraFiltered.map(acara => {
            const aceraId    = acara.aceraId || acara.id
            const peserta    = pesertaByAcara[aceraId] || []
            const pesertaSek = pesertaSekolahByAcara[aceraId] || []
            const _katObj    = kategoriList.find(k => (k.kod || k.id) === acara.kategoriKod)
            const hadAcara   = (() => {
              if (acara.jenisAcara === 'relay' && _katObj) {
                const saizPasukan = Number(_katObj.saizPasukan) || 4
                const hadPasukan  = acara.jantina === 'P'
                  ? (Number(_katObj.hadPasukanP) || 1)
                  : (Number(_katObj.hadPasukanL) || 1)
                return saizPasukan * hadPasukan
              }
              return acara.hadAtletPerSekolah || 2
            })()
            const slotBaki   = hadAcara - pesertaSek.length
            const isSelected = selectedAcara?.aceraId === aceraId || selectedAcara?.id === aceraId

            return (
              <div key={aceraId} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <button className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50/60 transition-colors"
                  onClick={() => setSelectedAcara(isSelected ? null : acara)}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-gray-800">{acara.namaAcara}</p>
                        <KategoriBadge kat={acara.kategoriKod} kategoriList={kategoriList} />
                        <JantinaBadge j={acara.jantina} />
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                          {lorong:'bg-blue-50 border-blue-200 text-blue-700',mass_start:'bg-cyan-50 border-cyan-200 text-cyan-700',padang_lompat:'bg-green-50 border-green-200 text-green-700',padang_balin:'bg-orange-50 border-orange-200 text-orange-700',relay:'bg-purple-50 border-purple-200 text-purple-700'}[acara.jenisAcara]||'bg-gray-50 border-gray-200 text-gray-600'
                        }`}>{jenisShort[acara.jenisAcara] || acara.jenisAcara}</span>
                      </div>
                      <p className="text-[9px] font-mono text-gray-400 mt-0.5">{aceraId}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-xs font-black text-gray-700">{peserta.length}</p>
                      <p className="text-[9px] text-gray-400">peserta</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap ${
                      slotBaki > 0 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
                    }`}>
                      {slotBaki > 0 ? `${pesertaSek.length}/${hadAcara}` : 'PENUH'}
                    </span>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${isSelected?'rotate-180':''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {isSelected && (() => {
                  const _katObj2  = kategoriList.find(k => (k.kod || k.id) === acara.kategoriKod)
                  const sudahDaftar = pesertaSek.map(p => p.noKP)
                  const isAcaraTerbuka2 = acara.isTerbuka || acara.kategoriKod === 'TERBUKA'
                  const atletLayak  = atletSekolah.filter(a => {
                    if (a.isAktif === false) return false
                    if (sudahDaftar.includes(a.noKP)) return false
                    if (isAcaraTerbuka2) {
                      const katTerbuka = acara.kategoriTerbuka || []
                      if (katTerbuka.length === 0) return false
                      const katAtlet = kiraKategori(a.tarikhLahir, a.jantina, tahunKej, kategoriList)
                      return katAtlet && katTerbuka.includes(katAtlet)
                    }
                    if (a.jantina !== acara.jantina) return false
                    const kat = kiraKategori(a.tarikhLahir, a.jantina, tahunKej, kategoriList)
                    return kat === acara.kategoriKod
                  })
                  const selSet   = inlineSelected[aceraId] || new Set()
                  const isSaving = inlineSaving[aceraId] || false
                  const errMsg   = inlineErr[aceraId] || ''
                  const slotBaki2 = hadAcara - pesertaSek.length

                  function toggleAtlet(noKP) {
                    setInlineSelected(prev => {
                      const s = new Set(prev[aceraId] || [])
                      s.has(noKP) ? s.delete(noKP) : s.add(noKP)
                      return { ...prev, [aceraId]: s }
                    })
                  }

                  async function handleDaftar() {
                    if (selSet.size === 0) return
                    setInlineSaving(p => ({ ...p, [aceraId]: true }))
                    setInlineErr(p => ({ ...p, [aceraId]: '' }))
                    try {
                      // Preload data sekali — kurang Firestore round-trips
                      const [sekolahSnap, pendSnap] = await Promise.all([
                        getDoc(doc(db, 'tenants', schoolId, 'sekolah', atletSekolah[0]?.kodSekolah || '')),
                        getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kejohanan.id, 'pendaftaran')),
                      ])
                      const sklData = sekolahSnap.exists() ? sekolahSnap.data() : {}
                      const bibPfx = sklData.bibPrefix || atletSekolah[0]?.kodSekolah || 'BIB'
                      const bibFmt = Number(sklData.bibFormat) || 3
                      const noBibSedia = pendSnap.docs.map(d => d.data().noBib).filter(Boolean)
                      const noBibAtlet = atletSekolah.map(a => a.noBib).filter(Boolean)
                      const senaraiNoBib = [...new Set([...noBibSedia, ...noBibAtlet])]
                      const pendLiveByKP = {}
                      pendSnap.docs.forEach(d => { const p = d.data(); if (p.noKP) pendLiveByKP[p.noKP] = p })

                      // Validate + simpan satu-satu — Gate 1 baca Firestore live,
                      // mesti simpan selepas setiap validate supaya kiraan had betul
                      const counterRef = doc(db, 'tenants', schoolId, 'pendaftaran_counter', `${kejohanan.id}_${atletSekolah[0]?.kodSekolah || bibPfx}`)
                      let lastNum = 0
                      const counterSnap = await getDoc(counterRef)
                      lastNum = counterSnap.exists() ? (counterSnap.data().lastBibNum || 0) : 0
                      senaraiNoBib.forEach(nb => {
                        if (nb.startsWith(bibPfx)) {
                          const n = parseInt(nb.slice(bibPfx.length), 10)
                          if (!isNaN(n) && n > lastNum) lastNum = n
                        }
                      })

                      for (const noKP of selSet) {
                        const atlet = atletSekolah.find(a => a.noKP === noKP)
                        if (!atlet) continue

                        // Gate check — baca live dari Firestore (penting untuk Gate 1)
                        const hasil = await validasiPendaftaran({
                          schoolId, noKP,
                          tarikhLahir:    atlet.tarikhLahir,
                          jantina:        atlet.jantina,
                          kodSekolah:     atlet.kodSekolah,
                          kejohananId:    kejohanan.id,
                          aceraId,
                          kategoriId:     acara.kategoriKod,
                          jenisAcara:     acara.jenisAcara,
                          tahunKejohanan: tahunKej,
                          bypassHeat:     false,
                        })
                        if (!hasil.valid) {
                          setInlineErr(p => ({ ...p, [aceraId]: `${atlet.nama || noKP} — [${hasil.gate}] ${hasil.mesej}` }))
                          setInlineSaving(p => ({ ...p, [aceraId]: false }))
                          return
                        }

                        // Simpan terus — supaya atlet seterusnya nampak kiraan terkini
                        const pRec = pendLiveByKP[noKP]
                        if (pRec) {
                          const acaraIds = [...new Set([...(pRec.acaraIds || []), aceraId])]
                          await updateDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejohanan.id, 'pendaftaran', noKP), { acaraIds, updatedAt: serverTimestamp() })
                          pendLiveByKP[noKP] = { ...pRec, acaraIds }
                        } else {
                          lastNum++
                          const noBib = bibPfx + String(lastNum).padStart(bibFmt, '0')
                          await setDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejohanan.id, 'pendaftaran', noKP), {
                            noBib, noKP: atlet.noKP, namaAtlet: atlet.nama,
                            jantina: atlet.jantina, tarikhLahir: atlet.tarikhLahir,
                            kodSekolah: atlet.kodSekolah,
                            namaSekolah: sklData.namaSekolah || atlet.kodSekolah,
                            kategoriKod: kiraKategori(atlet.tarikhLahir, atlet.jantina, tahunKej, kategoriList),
                            acaraIds: [aceraId], isAktif: true, isRelay: false,
                            createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
                          })
                          pendLiveByKP[noKP] = { noKP, acaraIds: [aceraId] }
                        }
                      }

                      // Update counter sekali di akhir
                      await setDoc(counterRef, { lastBibNum: lastNum, bibPrefix: bibPfx, kodSekolah: atletSekolah[0]?.kodSekolah || bibPfx, kejohananId: kejohanan.id, updatedAt: serverTimestamp() })

                      setInlineSelected(p => ({ ...p, [aceraId]: new Set() }))
                      onRefresh()
                    } catch (e) {
                      setInlineErr(p => ({ ...p, [aceraId]: e.message }))
                    } finally {
                      setInlineSaving(p => ({ ...p, [aceraId]: false }))
                    }
                  }

                  return (
                    <div className="border-t border-gray-100 bg-white px-4 py-3 space-y-3">

                      {/* Peserta sudah daftar */}
                      {pesertaSek.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Sudah Daftar</p>
                          <div className="space-y-1">
                            {pesertaSek.map(p => {
                              const kat = kiraKategori(p.tarikhLahir, p.jantina, tahunKej, kategoriList)
                              return (
                                <div key={p.noBib || p.noKP} className="flex items-center justify-between px-3 py-2 bg-green-50 border border-green-100 rounded-lg">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <svg className="w-3.5 h-3.5 text-green-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                    <span className="text-[9px] font-black font-mono text-[#003399] bg-blue-50 px-1.5 py-0.5 rounded">{p.noBib}</span>
                                    <p className="text-xs font-semibold text-gray-800 truncate">{p.namaAtlet}</p>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {kat && <KategoriBadge kat={kat} kategoriList={kategoriList} />}
                                    <JantinaBadge j={p.jantina} />
                                    {!pendaftaranTutup && (
                                      <button onClick={() => setModal({ type:'buang', atlet:p, acara })}
                                        className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold text-red-500 bg-red-50 border border-red-200 hover:bg-red-100 rounded transition-colors">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                        Buang
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Atlet layak untuk dipilih */}
                      {!pendaftaranTutup && slotBaki2 > 0 && (
                        <div>
                          {atletLayak.length === 0 ? (
                            <p className="text-xs text-gray-400 text-center py-2">
                              {pesertaSek.length === 0 ? 'Tiada atlet layak untuk acara ini.' : 'Semua atlet layak sudah didaftar.'}
                            </p>
                          ) : (
                            <>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Pilih Atlet</p>
                              <div className="space-y-1">
                                {atletLayak.map(a => {
                                  const kat = kiraKategori(a.tarikhLahir, a.jantina, tahunKej, kategoriList)
                                  const isChosen  = selSet.has(a.noKP)
                                  const willExceed = !isChosen && selSet.size >= slotBaki2
                                  return (
                                    <button key={a.noKP} type="button"
                                      onClick={() => !willExceed && toggleAtlet(a.noKP)}
                                      disabled={willExceed}
                                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all ${
                                        isChosen ? 'border-[#003399] bg-blue-50'
                                        : willExceed ? 'border-gray-100 bg-gray-50 opacity-40 cursor-not-allowed'
                                        : 'border-gray-200 hover:border-[#003399]/40 hover:bg-blue-50/30'
                                      }`}>
                                      <div className="flex items-center gap-2 min-w-0">
                                        <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${isChosen ? 'border-[#003399] bg-[#003399]' : 'border-gray-300'}`}>
                                          {isChosen && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                        </div>
                                        <span className="text-[9px] font-black font-mono text-[#003399] bg-blue-50 px-1.5 py-0.5 rounded shrink-0">{a.noBib || '—'}</span>
                                        <p className="text-xs font-semibold text-gray-800 truncate">{a.nama || <span className="italic text-gray-400">Tiada nama</span>}</p>
                                      </div>
                                      <div className="flex items-center gap-1 shrink-0">
                                        {kat && <KategoriBadge kat={kat} kategoriList={kategoriList} />}
                                        <JantinaBadge j={a.jantina} />
                                      </div>
                                    </button>
                                  )
                                })}
                              </div>

                              {errMsg && (
                                <div className="mt-2 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                                  <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                  <p className="text-xs text-red-700 font-semibold">{errMsg}</p>
                                </div>
                              )}
                              {selSet.size > 0 && (
                                <div className="mt-2 flex items-center justify-end">
                                  <button onClick={handleDaftar} disabled={isSaving}
                                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-[#003399] text-white rounded-lg hover:bg-[#002288] disabled:opacity-50">
                                    {isSaving
                                      ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Mendaftar…</>
                                      : `Daftar ${selSet.size} Atlet`
                                    }
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {pendaftaranTutup && pesertaSek.length === 0 && (
                        <p className="text-xs text-gray-400 text-center py-2">Tiada peserta. Pendaftaran telah ditutup.</p>
                      )}
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {modal?.type === 'buang' && kejohanan && (
        <BuangDaftarModal
          atlet={modal.atlet}
          acara={modal.acara}
          pRec={modal.atlet}
          schoolId={schoolId}
          kejohananId={kejohanan.id}
          onClose={() => setModal(null)}
          onSaved={onRefresh}
        />
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const PP_TABS = [
  { k: 'atlet',     l: 'Atlet Saya',             icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg> },
  { k: 'daftar',    l: 'Daftar Acara',            icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg> },
  { k: 'analisa',   l: 'Analisa',                 icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> },
  { k: 'status',    l: 'Status',                  icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg> },
  { k: 'cetak',     l: 'Cetak',                   icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg> },
  { k: 'startlist', l: 'Pengesahan Pendaftaran',  icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg> },
]

export default function PengurusDashboard() {
  const { userData } = useAuth()

  const schoolId   = userData?.schoolId   || ''
  const kodSekolah = userData?.kodSekolah || ''
  const namaSekolah = userData?.namaSekolah || kodSekolah || ''

  const [activeTab, setActiveTab] = useState('atlet')

  // Shared state
  const [kejohanan,       setKejohanan]       = useState(null)
  const [acaraList,       setAcaraList]       = useState([])
  const [pendaftaranList, setPendaftaranList] = useState([])
  const [kategoriList,    setKategoriList]    = useState([])
  const [atletSekolah,    setAtletSekolah]    = useState([])
  const [sekolahData,     setSekolahData]     = useState(null)
  const [loading,         setLoading]         = useState(false)
  const [fetchErr,        setFetchErr]        = useState('')

  // Tab: Pengesahan Pendaftaran (startlist)
  const [pengesahan,     setPengesahan]     = useState(null)
  const [mengesah,       setMengesah]       = useState(false)
  const [slFilterKat,    setSlFilterKat]    = useState('semua')
  const [slSearch,       setSlSearch]       = useState('')
  const [slHeatData,     setSlHeatData]     = useState({})
  const [slHeatLoading,  setSlHeatLoading]  = useState(false)
  const [heatDijanaMap,  setHeatDijanaMap]  = useState({})
  const [heatMapLoading, setHeatMapLoading] = useState(false)

  // Tab: Cetak — logos dari tetapan/home
  const [logos,          setLogos]          = useState({ kiri: null, kanan: null, kej: null })
  const [logosLoaded,    setLogosLoaded]    = useState(false)

  const tahunKej = kejohanan?.tarikhMula
    ? new Date(kejohanan.tarikhMula?.toDate?.() || kejohanan.tarikhMula).getFullYear()
    : new Date().getFullYear()

  const fetchAll = useCallback(async () => {
    if (!schoolId || !kodSekolah) return
    setLoading(true)
    setFetchErr('')
    try {
      const sklSnap = await getDoc(doc(db, 'tenants', schoolId, 'sekolah', kodSekolah))
      if (sklSnap.exists()) setSekolahData({ id: sklSnap.id, ...sklSnap.data() })

      const kejSnap = await getDocs(
        query(
          collection(db, 'tenants', schoolId, 'kejohanan'),
          where('statusKejohanan', 'in', ['aktif', 'persediaan'])
        )
      )
      if (kejSnap.empty) {
        setKejohanan(null); setAcaraList([]); setPendaftaranList([])
        setKategoriList([]); setAtletSekolah([])
        setLoading(false); return
      }
      const kejDoc = kejSnap.docs[0]
      const kej    = { id: kejDoc.id, ...kejDoc.data() }
      setKejohanan(kej)

      const [acaraSnap, pendSnap, katSnap, atletSnap] = await Promise.all([
        getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kej.id, 'acara')),
        getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kej.id, 'pendaftaran')),
        getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kej.id, 'kategori')),
        getDocs(query(collection(db, 'tenants', schoolId, 'atlet'), where('kodSekolah', '==', kodSekolah))),
      ])

      setAcaraList(acaraSnap.docs.map(d => ({ id: d.id, aceraId: d.id, ...d.data() })))
      setPendaftaranList(pendSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setKategoriList(katSnap.docs.map(d => ({ id: d.id, kod: d.id, ...d.data() })))
      const atletData = atletSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      atletData.sort((a, b) => (a.nama || '').localeCompare(b.nama || '', 'ms'))
      setAtletSekolah(atletData)

      // Fetch heatDijanaMap — semak acara mana sudah ada heat
      setHeatMapLoading(true)
      try {
        const heatSnap = await getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kej.id, 'heat'))
        const map = {}
        heatSnap.docs.forEach(hd => { map[hd.data().aceraId || hd.data().acaraId] = true })
        setHeatDijanaMap(map)
      } catch { /* abaikan */ }
      finally { setHeatMapLoading(false) }

      // Fetch pengesahan untuk sekolah ini
      try {
        const pgSnap = await getDoc(doc(db, 'tenants', schoolId, 'kejohanan', kej.id, 'pengesahan', kodSekolah))
        setPengesahan(pgSnap.exists() ? pgSnap.data() : null)
      } catch { /* abaikan */ }

      // Fetch logos dari tetapan/home
      try {
        const homeSnap = await getDoc(doc(db, 'tenants', schoolId, 'tetapan', 'home'))
        if (homeSnap.exists()) {
          const hd = homeSnap.data()
          setLogos({ kiri: hd.logoKiri || null, kanan: hd.logoKanan || null, kej: hd.logoKejohanan || null })
        }
      } catch { /* abaikan */ }
      finally { setLogosLoaded(true) }

    } catch (e) {
      console.error('fetchAll:', e)
      setFetchErr(e.message || 'Ralat memuatkan data.')
    } finally {
      setLoading(false)
    }
  }, [schoolId, kodSekolah])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Fetch heat data untuk tab startlist apabila tab aktif
  useEffect(() => {
    if (activeTab !== 'startlist' || !kejohanan?.id || !schoolId) return
    const myAcaraIds = new Set(myPendaftaran.flatMap(p => p.acaraIds || []))
    const acaraDenganHeat = acaraList.filter(a => {
      const aid = a.aceraId || a.id
      return heatDijanaMap[aid] === true && myAcaraIds.has(aid)
    })
    if (acaraDenganHeat.length === 0) return

    setSlHeatLoading(true)
    Promise.all(
      acaraDenganHeat.map(async a => {
        const aid = a.aceraId || a.id
        if (slHeatData[aid] !== undefined) return
        const snap = await getDocs(
          query(collection(db, 'tenants', schoolId, 'kejohanan', kejohanan.id, 'heat'),
            where('aceraId', '==', aid))
        ).catch(() => null)
        const heats = snap ? snap.docs.map(d => ({ id: d.id, ...d.data() })) : []
        setSlHeatData(prev => ({ ...prev, [aid]: heats }))
      })
    ).finally(() => setSlHeatLoading(false))
  }, [activeTab, kejohanan, schoolId, heatDijanaMap]) // eslint-disable-line

  const refreshPend = useCallback(async () => {
    if (!schoolId || !kejohanan?.id) return
    try {
      const snap = await getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kejohanan.id, 'pendaftaran'))
      setPendaftaranList(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) { console.error('refreshPend:', e) }
  }, [schoolId, kejohanan])

  const myPendaftaran = pendaftaranList.filter(p => p.kodSekolah === kodSekolah)

  // Acara berkaitan sekolah ini (mengikut kategori sekolah)
  const kategoriSekolah = sekolahData?.kategori || ''
  const acaraIkutSekolah = useMemo(() => {
    return acaraList.filter(a => !a.parentAcaraId)
  }, [acaraList])

  // Peserta sekolah ini per acara
  const pesertaSekolahByAcara = useMemo(() => {
    const map = {}
    acaraIkutSekolah.forEach(a => {
      const aid = a.aceraId || a.id
      map[aid] = myPendaftaran
        .filter(p => (p.acaraIds || []).includes(aid))
        .map(p => {
          const atlet = atletSekolah.find(x => x.noKP === p.noKP)
          return { ...p, namaAtlet: atlet?.nama || p.noKP, noBib: p.noBib || atlet?.noBib || '—' }
        })
    })
    return map
  }, [acaraIkutSekolah, myPendaftaran, atletSekolah])

  const pengesahanReady = useMemo(() => {
    const myAcaraIds = new Set(myPendaftaran.flatMap(p => p.acaraIds || []))
    return acaraList.some(a => {
      const aid = a.aceraId || a.id
      return heatDijanaMap[aid] === true && myAcaraIds.has(aid) && a.isAktif !== false
    })
  }, [myPendaftaran, acaraList, heatDijanaMap])

  const isDikunci = pengesahan?.disahkan === true && !sekolahData?.bypassPengesahan

  // ── Tab: Analisa ─────────────────────────────────────────────────────────────
  function renderTabAnalisa() {
    const acaraAktif = acaraIkutSekolah
      .filter(a => a.isAktif !== false)
      .sort((a, b) => (a.noAcara || 0) - (b.noAcara || 0))

    const byKat = {}
    acaraAktif.forEach(a => {
      const k = a.kategoriKod || '?'
      if (!byKat[k]) byKat[k] = []
      byKat[k].push(a)
    })
    const katKeys = Object.keys(byKat).sort((a, b) => {
      const ua = kategoriList.find(k => (k.kod || k.id) === a)?.urutan ?? 99
      const ub = kategoriList.find(k => (k.kod || k.id) === b)?.urutan ?? 99
      return ua - ub || a.localeCompare(b)
    })
    const totalAcara  = acaraAktif.length
    const totalDaftar = acaraAktif.filter(a => (pesertaSekolahByAcara[a.aceraId || a.id] || []).length > 0).length
    const totalBelum  = totalAcara - totalDaftar

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {[
            { l: 'Jumlah Acara', v: totalAcara,  c: 'text-[#003399]', bg: 'bg-blue-50' },
            { l: 'Sudah Daftar', v: totalDaftar, c: 'text-green-700', bg: 'bg-green-50' },
            { l: 'Belum Daftar', v: totalBelum,  c: 'text-red-600',   bg: 'bg-red-50' },
          ].map(s => (
            <div key={s.l} className={`${s.bg} rounded-xl px-3 py-3 text-center`}>
              <p className={`text-2xl font-black ${s.c}`}>{s.v}</p>
              <p className="text-[9px] text-gray-500 uppercase tracking-wide mt-0.5">{s.l}</p>
            </div>
          ))}
        </div>

        {acaraAktif.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 py-12 text-center">
            <p className="text-xs text-gray-400">Tiada acara untuk kategori sekolah ini.</p>
          </div>
        ) : (
          katKeys.map(katKod => {
            const acaraKat = byKat[katKod]
            const katObj   = kategoriList.find(k => (k.kod || k.id) === katKod)
            const katNama  = katObj?.nama || katObj?.label || katKod
            return (
              <div key={katKod} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                  <KategoriBadge kat={katKod} kategoriList={kategoriList} />
                  <span className="text-xs font-bold text-gray-700">{katNama}</span>
                  <span className="ml-auto text-[10px] text-gray-400">{acaraKat.length} acara</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="px-3 py-2 text-left text-[9px] font-bold text-gray-400 uppercase tracking-wide">Acara</th>
                        <th className="px-3 py-2 text-center text-[9px] font-bold text-gray-400 uppercase tracking-wide w-24">Status</th>
                        <th className="px-3 py-2 text-center text-[9px] font-bold text-gray-400 uppercase tracking-wide w-16">Atlet</th>
                        <th className="px-3 py-2 text-left text-[9px] font-bold text-gray-400 uppercase tracking-wide">Catatan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {acaraKat.map(a => {
                        const aid     = a.aceraId || a.id
                        const peserta = pesertaSekolahByAcara[aid] || []
                        const ada     = peserta.length > 0
                        const isRelay = a.jenisAcara === 'relay' || a.isRelay === true
                        const had     = !isRelay ? (a.hadAtletPerSekolah ?? a.hadAtlet ?? null) : null
                        const lebih   = !isRelay && had !== null && peserta.length > had
                        const catatan = ada ? (lebih ? 'Melebihi had' : 'Cukup kuota') : 'Belum daftar'
                        return (
                          <tr key={aid} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                            <td className="px-3 py-2.5">
                              <span className="text-[9px] font-mono text-gray-400 mr-1.5">[{a.noAcara || '—'}]</span>
                              <span className="font-medium text-gray-800">{a.namaAcara}</span>
                              <span className={`ml-1.5 text-[9px] font-black px-1.5 py-0.5 rounded-full ${a.jantina === 'L' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
                                {a.jantina}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {ada ? (
                                <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                  Daftar
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                  Belum
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center font-mono text-gray-700">
                              {isRelay ? (
                                <span className={ada ? 'text-green-700 font-bold' : 'text-gray-400'}>
                                  {peserta.length > 0 ? `${peserta.length} ahli` : '—'}
                                </span>
                              ) : (
                                <>
                                  <span className={ada ? 'text-green-700 font-bold' : 'text-gray-400'}>{peserta.length}</span>
                                  {had !== null && <span className="text-gray-400">/{had}</span>}
                                </>
                              )}
                            </td>
                            <td className={`px-3 py-2.5 text-[10px] ${lebih ? 'text-red-600 font-bold' : ada ? 'text-green-700' : 'text-gray-400'}`}>
                              {catatan}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })
        )}
      </div>
    )
  }

  // ── Tab: Status ──────────────────────────────────────────────────────────────
  function renderTabStatus() {
    const totalDaftar = myPendaftaran.flatMap(p => p.acaraIds || []).length
    const acaraMap    = Object.fromEntries(acaraList.map(a => [a.aceraId || a.id, a]))
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {[
            { l: 'Jumlah Atlet',    v: atletSekolah.length,  c: 'text-[#003399]',  bg: 'bg-blue-50' },
            { l: 'Atlet Berdaftar', v: myPendaftaran.length, c: 'text-green-700',  bg: 'bg-green-50' },
            { l: 'Jumlah Daftar',   v: totalDaftar,          c: 'text-indigo-700', bg: 'bg-indigo-50' },
          ].map(s => (
            <div key={s.l} className={`${s.bg} rounded-xl px-3 py-2.5 text-center`}>
              <p className={`text-xl font-black ${s.c}`}>{s.v}</p>
              <p className="text-[9px] text-gray-500 uppercase tracking-wide">{s.l}</p>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {atletSekolah.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 py-10 text-center">
              <p className="text-sm text-gray-400">{loading ? 'Memuatkan…' : 'Tiada atlet.'}</p>
            </div>
          ) : (
            atletSekolah.map(a => {
              const kat      = kiraKategori(a.tarikhLahir, a.jantina, tahunKej, kategoriList)
              const pRec     = myPendaftaran.find(p => p.noKP === a.noKP)
              const acaraIds = pRec?.acaraIds || []
              return (
                <div key={a.noKP} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-[9px] font-black font-mono text-[#003399] bg-blue-50 px-1.5 py-0.5 rounded shrink-0">{a.noBib || '—'}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-800 truncate">{a.nama}</p>
                        <p className="text-[9px] font-mono text-gray-400">{a.noKP}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {kat && <KategoriBadge kat={kat} kategoriList={kategoriList} jantina={a.jantina} />}
                      <JantinaBadge j={a.jantina} />
                      {acaraIds.length > 0
                        ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">{acaraIds.length} acara</span>
                        : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">Belum Daftar</span>
                      }
                    </div>
                  </div>
                  {acaraIds.length > 0 && (
                    <div className="mt-2 pl-2 border-l-2 border-[#003399]/20 space-y-0.5">
                      {acaraIds.map(id => {
                        const ac = acaraMap[id]
                        return (
                          <div key={id} className="flex items-center gap-2 text-[10px] text-gray-600">
                            <span className="font-mono text-gray-400 text-[9px]">{id}</span>
                            <span className="font-semibold">{ac?.namaAcara || id}</span>
                            {ac && <KategoriBadge kat={ac.kategoriKod} kategoriList={kategoriList} jantina={ac.jantina} />}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    )
  }

  // ── Tab: Cetak ───────────────────────────────────────────────────────────────
  function renderTabCetak() {
    const acaraMap    = Object.fromEntries(acaraList.map(a => [a.aceraId || a.id, a]))
    const namaKej     = kejohanan?.namaKejohanan || ''
    const tarikhCetak = new Date().toLocaleString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    const totalDaftar = myPendaftaran.flatMap(p => p.acaraIds || []).length

    function imgFmt(b64) {
      if (!b64) return 'PNG'
      if (b64.startsWith('data:image/jpeg') || b64.startsWith('data:image/jpg')) return 'JPEG'
      return 'PNG'
    }

    function buatHeaderMSSM(pdf) {
      const pageW = pdf.internal.pageSize.getWidth()
      const y = 15
      if (logos.kiri)  { try { pdf.addImage(logos.kiri,  imgFmt(logos.kiri),  12, y - 5, 22, 22) } catch {} }
      if (logos.kanan) { try { pdf.addImage(logos.kanan, imgFmt(logos.kanan), pageW - 34, y - 5, 22, 22) } catch {} }
      if (logos.kej)   { try { pdf.addImage(logos.kej,   imgFmt(logos.kej),   (pageW - 18) / 2, y - 6, 18, 18) } catch {} }
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11)
      pdf.text(namaKej || 'Kejohanan Olahraga', pageW / 2, y + 10, { align: 'center' })
      pdf.setFontSize(9); pdf.setFont('helvetica', 'normal')
      pdf.text('SENARAI PENDAFTARAN PESERTA', pageW / 2, y + 16, { align: 'center' })
      pdf.setFontSize(8)
      pdf.text(namaSekolah, pageW / 2, y + 21, { align: 'center' })
      pdf.setDrawColor(0, 51, 153); pdf.setLineWidth(0.8)
      pdf.line(12, y + 25, pageW - 12, y + 25)
      return y + 30
    }

    function cetakByAtlet() {
      const pdf    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageW  = pdf.internal.pageSize.getWidth()
      const startY = buatHeaderMSSM(pdf)
      pdf.setFontSize(9); pdf.setFont('helvetica', 'bold')
      pdf.text('BAHAGIAN A — SENARAI ATLET & ACARA DIDAFTARKAN', 12, startY - 2)
      const rows = []
      let bil = 1
      atletSekolah
        .filter(a => { const p = myPendaftaran.find(x => x.noKP === a.noKP); return p && (p.acaraIds || []).length > 0 })
        .forEach(a => {
          const pRec     = myPendaftaran.find(p => p.noKP === a.noKP)
          const acaraIds = pRec?.acaraIds || []
          const noBib    = pRec?.noBib || a.noBib || '—'
          const kat      = pRec?.kategoriKod || kiraKategori(a.tarikhLahir, a.jantina, tahunKej, kategoriList) || '—'
          const acNama   = acaraIds.map(id => acaraMap[id]?.namaAcara || id).join(', ') || '—'
          rows.push([bil++, noBib, a.nama, a.noKP, a.jantina, kat, acNama])
        })
      autoTable(pdf, {
        startY,
        head: [['#', 'Nombor Badan', 'Nama Penuh', 'No. KP', 'J', 'Kat', 'Acara Didaftarkan']],
        body: rows,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [0, 51, 153], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [245, 247, 255] },
        columnStyles: { 0: { halign: 'center', cellWidth: 8 }, 1: { cellWidth: 22, fontStyle: 'bold' }, 3: { cellWidth: 28, font: 'courier' }, 4: { halign: 'center', cellWidth: 8 }, 5: { halign: 'center', cellWidth: 10 } },
        margin: { left: 12, right: 12 },
      })
      // Footer — setara KOAM
      const fy = (pdf.lastAutoTable?.finalY || startY + 20) + 15
      pdf.setFontSize(8); pdf.setFont('helvetica', 'normal')
      pdf.text(`Dicetak: ${tarikhCetak}`, 12, fy)
      pdf.text(`Jumlah Atlet: ${atletSekolah.length}   |   Jumlah Pendaftaran: ${totalDaftar}`, 12, fy + 5)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Disediakan oleh:', pageW - 80, fy)
      pdf.text('Tandatangan Guru Pengiring:', pageW - 80, fy + 5)
      pdf.setFont('helvetica', 'normal')
      pdf.text('_________________________', pageW - 80, fy + 18)
      pdf.text('Cop Sekolah:', pageW - 80, fy + 22)
      pdf.text('_________________________', pageW - 80, fy + 32)
      pdf.setDrawColor(0, 51, 153); pdf.setLineWidth(0.3)
      pdf.line(12, fy + 38, pageW - 12, fy + 38)
      pdf.save(`PendaftaranAtlet_${kodSekolah}_${Date.now()}.pdf`)
    }

    function cetakByAcara() {
      const pdf    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageW  = pdf.internal.pageSize.getWidth()
      const startY = buatHeaderMSSM(pdf)
      pdf.setFontSize(9); pdf.setFont('helvetica', 'bold')
      pdf.text('BAHAGIAN B — SENARAI PENDAFTARAN MENGIKUT ACARA', 12, startY - 2)
      const rows = []
      let bil = 1
      acaraIkutSekolah
        .filter(a => a.isAktif !== false)
        .sort((a, b) => (a.kategoriKod || '').localeCompare(b.kategoriKod || ''))
        .forEach(a => {
          const aid      = a.aceraId || a.id
          const peserta  = pesertaSekolahByAcara[aid] || []
          if (peserta.length === 0) return
          const pesertaNama = peserta.map((p, i) => `${i+1}. ${p.namaAtlet} (${p.noBib || '—'})`).join('\n')
          const katKod  = a.kategoriKod || ''
          const katObj  = kategoriList.find(k => (k.kod || k.id) === katKod)
          const katLabel = katObj?.label || katObj?.nama || katKod || '—'
          rows.push([bil++, aid, a.namaAcara, katLabel, a.jantina === 'L' ? 'Lelaki' : 'Perempuan', pesertaNama])
        })
      if (rows.length === 0) {
        pdf.setFontSize(10); pdf.text('Tiada pendaftaran untuk sekolah ini.', pageW / 2, startY + 10, { align: 'center' })
      } else {
        autoTable(pdf, {
          startY,
          head: [['#', 'Kod Acara', 'Nama Acara', 'Kategori', 'Jantina', 'Peserta Sekolah']],
          body: rows,
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: [0, 51, 153], textColor: 255, fontStyle: 'bold', fontSize: 8 },
          alternateRowStyles: { fillColor: [245, 247, 255] },
          columnStyles: { 0: { halign: 'center', cellWidth: 8 }, 1: { cellWidth: 22, fontStyle: 'bold' }, 3: { halign: 'center', cellWidth: 16 }, 4: { halign: 'center', cellWidth: 16 } },
          margin: { left: 12, right: 12 },
        })
      }
      // Footer — setara KOAM
      const fy = (pdf.lastAutoTable?.finalY || startY + 20) + 15
      pdf.setFontSize(8); pdf.setFont('helvetica', 'normal')
      pdf.text(`Dicetak: ${tarikhCetak}`, 12, fy)
      pdf.text(`Jumlah Acara Didaftarkan: ${rows.length}`, 12, fy + 5)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Disahkan oleh Guru Pengiring:', pageW - 80, fy)
      pdf.setFont('helvetica', 'normal')
      pdf.text('_________________________', pageW - 80, fy + 12)
      pdf.text('Cop Sekolah:', pageW - 80, fy + 16)
      pdf.text('_________________________', pageW - 80, fy + 26)
      pdf.setDrawColor(0, 51, 153); pdf.setLineWidth(0.3)
      pdf.line(12, fy + 32, pageW - 12, fy + 32)
      pdf.save(`PendaftaranAcara_${kodSekolah}_${Date.now()}.pdf`)
    }

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {[
            { l: 'Sekolah',         v: namaSekolah,           c: 'text-[#003399]',  bg: 'bg-blue-50' },
            { l: 'Jumlah Atlet',    v: atletSekolah.length,   c: 'text-green-700',  bg: 'bg-green-50' },
            { l: 'Atlet Daftar',    v: myPendaftaran.length,  c: 'text-indigo-700', bg: 'bg-indigo-50' },
            { l: 'Jml Pendaftaran', v: totalDaftar,            c: 'text-amber-700',  bg: 'bg-amber-50' },
          ].map(s => (
            <div key={s.l} className={`${s.bg} rounded-xl px-3 py-2.5 text-center`}>
              <p className={`text-sm font-black ${s.c} truncate`}>{s.v}</p>
              <p className="text-[9px] text-gray-500 uppercase tracking-wide">{s.l}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 space-y-3">
          <div>
            <p className="text-sm font-bold text-gray-800">Cetak Senarai Pendaftaran</p>
            <p className="text-xs text-gray-400 mt-0.5">Format MSSM dengan logo, tanda tangan guru pengiring, dan cop sekolah.</p>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <button onClick={cetakByAtlet} disabled={atletSekolah.length === 0}
              className="flex items-center gap-3 px-4 py-3 bg-[#003399] text-white rounded-xl hover:bg-[#002288] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <svg className="w-8 h-8 bg-white/20 rounded-lg p-1.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              <div className="text-left">
                <p className="text-xs font-black">Cetak By Atlet</p>
                <p className="text-[10px] text-white/70">No.Badan | Nama | No.KP | Kat | Acara Didaftarkan</p>
              </div>
            </button>
            <button onClick={cetakByAcara} disabled={totalDaftar === 0}
              className="flex items-center gap-3 px-4 py-3 bg-indigo-700 text-white rounded-xl hover:bg-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <svg className="w-8 h-8 bg-white/20 rounded-lg p-1.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              <div className="text-left">
                <p className="text-xs font-black">Cetak By Acara</p>
                <p className="text-[10px] text-white/70">Kod Acara | Nama Acara | Kat | Peserta Sekolah</p>
              </div>
            </button>
          </div>

          {!logosLoaded ? (
            <p className="text-[10px] text-gray-400">Memuatkan logo…</p>
          ) : (logos.kiri || logos.kanan || logos.kej) ? (
            <div className="px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-1.5">
                <svg className="w-3 h-3 text-green-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                <p className="text-[10px] text-green-700 font-semibold">Logo akan disertakan dalam cetakan</p>
              </div>
              <div className="flex items-center gap-3 mt-1.5">
                {logos.kiri  && <div className="text-center"><img src={logos.kiri}  alt="" className="h-8 w-8 object-contain mx-auto border border-green-200 rounded bg-white p-0.5" /><p className="text-[8px] text-green-600 mt-0.5">Kiri</p></div>}
                {logos.kej   && <div className="text-center"><img src={logos.kej}   alt="" className="h-8 w-8 object-contain mx-auto border border-green-200 rounded bg-white p-0.5" /><p className="text-[8px] text-green-600 mt-0.5">Kejohanan</p></div>}
                {logos.kanan && <div className="text-center"><img src={logos.kanan} alt="" className="h-8 w-8 object-contain mx-auto border border-green-200 rounded bg-white p-0.5" /><p className="text-[8px] text-green-600 mt-0.5">Kanan</p></div>}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-[10px] text-amber-700">Logo belum dikonfigurasi. Sila muat naik logo dalam Tetapan → Home.</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Tab: Pengesahan Pendaftaran (Start List) ──────────────────────────────────
  function renderTabStartList() {
    const myAcaraIds = new Set(myPendaftaran.flatMap(p => p.acaraIds || []))
    const acaraDenganHeat = acaraList.filter(a => {
      const aid = a.aceraId || a.id
      return heatDijanaMap[aid] === true && myAcaraIds.has(aid) && a.isAktif !== false
    })
    const katSLOptions = [...new Set(acaraDenganHeat.map(a => a.kategoriKod))].sort()
    const acaraSLFiltered = acaraDenganHeat
      .filter(a => slFilterKat === 'semua' || a.kategoriKod === slFilterKat)
      .filter(a => !slSearch.trim() || (a.namaAcara || '').toLowerCase().includes(slSearch.trim().toLowerCase()))
      .sort((a, b) => (a.noAcara || 0) - (b.noAcara || 0))

    async function handleSahkan() {
      if (!kejohanan?.id || !kodSekolah) return
      if (!window.confirm('Sahkan pendaftaran? Tindakan ini akan mengunci pendaftaran. Tiada perubahan boleh dibuat melalui sistem selepas ini.')) return
      setMengesah(true)
      try {
        const data = { disahkan: true, tarikhSahkan: serverTimestamp(), namaSekolah, kodSekolah }
        await setDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejohanan.id, 'pengesahan', kodSekolah), data)
        setPengesahan({ ...data, tarikhSahkan: new Date() })
      } catch (e) { alert('Gagal sahkan: ' + e.message) }
      finally { setMengesah(false) }
    }

    const heatLabel = h => {
      if (h.fasa === 'final') return 'Final'
      if (h.fasa === 'saringan') return 'Saringan'
      return `Heat ${h.noHeat}`
    }

    return (
      <div className="space-y-4">

        {/* Banner */}
        {isDikunci ? (
          <div className="flex items-start gap-3 px-4 py-3.5 bg-green-50 border border-green-200 rounded-xl">
            <svg className="w-5 h-5 text-green-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <div>
              <p className="text-xs font-bold text-green-800">Pendaftaran Dikunci</p>
              <p className="text-[10px] text-green-700 mt-0.5">
                Disahkan pada {pengesahan?.tarikhSahkan
                  ? new Date(pengesahan.tarikhSahkan?.toDate?.() || pengesahan.tarikhSahkan).toLocaleString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : '—'}. Hubungi penganjur untuk sebarang perubahan.
              </p>
            </div>
          </div>
        ) : acaraDenganHeat.length > 0 ? (
          <div className="flex items-start justify-between gap-3 px-4 py-3.5 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              <div>
                <p className="text-xs font-bold text-amber-800">Semak Start List Pasukan Anda</p>
                <p className="text-[10px] text-amber-700 mt-0.5">Setelah disahkan, pendaftaran akan dikunci. Tiada perubahan boleh dibuat melalui sistem.</p>
              </div>
            </div>
            <button onClick={handleSahkan} disabled={mengesah}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold bg-[#003399] text-white rounded-lg hover:bg-[#002288] disabled:opacity-50 transition-colors whitespace-nowrap">
              {mengesah ? 'Menyimpan…' : <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>Sahkan &amp; Kunci</>}
            </button>
          </div>
        ) : null}

        {/* Belum ada heat */}
        {acaraDenganHeat.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
            <div className="text-center space-y-1">
              {heatMapLoading ? (
                <><svg className="w-6 h-6 text-gray-300 mx-auto animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/></svg><p className="text-xs text-gray-400">Menyemak start list…</p></>
              ) : (
                <><svg className="w-8 h-8 text-gray-200 mx-auto" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg><p className="text-xs font-bold text-gray-500">Belum Bersedia untuk Pengesahan</p><p className="text-[10px] text-gray-400">Tab akan bertukar apabila start list dijana oleh penganjur.</p></>
              )}
            </div>
            {!heatMapLoading && (
              <div className="space-y-0">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-3">Aliran Pengesahan Pendaftaran</p>
                {[
                  { no: 1, label: 'Daftar semua atlet ke acara',      done: myPendaftaran.length > 0,  sub: myPendaftaran.length > 0 ? `${myPendaftaran.length} atlet sudah didaftarkan` : 'Pergi ke tab "Daftar Acara"' },
                  { no: 2, label: 'Penganjur jana start list (heat)',  done: pengesahanReady,            sub: pengesahanReady ? 'Start list sudah dijana' : 'Menunggu penganjur — tiada tindakan diperlukan', waiting: !pengesahanReady },
                  { no: 3, label: 'Semak Start List pasukan anda',     done: false,                     sub: 'Tab ini akan bertukar apabila start list tersedia' },
                  { no: 4, label: 'Klik "Sahkan & Kunci" pendaftaran', done: false,                     sub: 'Pendaftaran akan dikunci selepas disahkan' },
                ].map(step => (
                  <div key={step.no} className="flex gap-3 py-2.5 border-b border-gray-50 last:border-0">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-black ${step.done ? 'bg-green-500 text-white' : step.waiting ? 'bg-amber-400 text-white animate-pulse' : 'bg-gray-200 text-gray-500'}`}>
                      {step.done ? '✓' : step.no}
                    </div>
                    <div>
                      <p className={`text-xs font-semibold ${step.done ? 'text-green-700' : 'text-gray-600'}`}>{step.label}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{step.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Filter */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" /></svg>
                <input type="text" placeholder="Cari acara…" value={slSearch} onChange={e => setSlSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#003399]/25 focus:border-[#003399]" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['semua', ...katSLOptions].map(k => (
                  <button key={k} onClick={() => setSlFilterKat(k)}
                    className={`px-2.5 py-1.5 text-[10px] font-bold rounded-lg border transition-colors ${slFilterKat === k ? 'bg-[#003399] text-white border-[#003399]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                    {k === 'semua' ? 'Semua' : (kategoriList.find(x => (x.kod || x.id) === k)?.label || k)}
                  </button>
                ))}
              </div>
            </div>

            {/* Senarai acara dengan heat */}
            {slHeatLoading ? (
              <div className="py-10 text-center text-xs text-gray-400">Memuatkan start list…</div>
            ) : acaraSLFiltered.length === 0 ? (
              <div className="py-10 text-center text-xs text-gray-400">Tiada acara sepadan.</div>
            ) : (
              <div className="space-y-3">
                {acaraSLFiltered.map(a => {
                  const aid            = a.aceraId || a.id
                  const heatsBelumFetch = slHeatData[aid] === undefined
                  const heats          = slHeatData[aid] || []
                  const isPadang       = ['padang_lompat', 'padang_balin'].includes(a.jenisAcara)
                  const isRelay        = a.jenisAcara === 'relay'
                  const pesertaRows    = heats.flatMap(h =>
                    (h.peserta || []).filter(p => p.kodSekolah === kodSekolah).map(p => ({ ...p, _heat: h }))
                  )
                  return (
                    <div key={aid} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="px-4 py-2.5 bg-[#003399] flex items-center gap-2">
                        <span className="text-[10px] font-black text-white">#{a.noAcara || '—'}</span>
                        <span className="text-xs font-bold text-white">{a.namaAcara}</span>
                        <span className={`ml-auto text-[9px] font-black ${a.jantina === 'L' ? 'text-blue-200' : 'text-pink-200'}`}>
                          {a.jantina === 'L' ? 'LELAKI' : 'PEREMPUAN'}
                        </span>
                      </div>
                      {heatsBelumFetch ? (
                        <div className="px-4 py-3 flex items-center gap-2 text-[10px] text-gray-400">
                          <svg className="w-3 h-3 animate-spin shrink-0" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                          Memuatkan…
                        </div>
                      ) : pesertaRows.length === 0 ? (
                        <div className="px-4 py-3 text-[10px] text-gray-400 italic">Tiada atlet pasukan anda dalam acara ini.</div>
                      ) : isRelay ? (
                        <table className="w-full text-xs">
                          <thead><tr className="bg-gray-50 border-b border-gray-100"><th className="px-3 py-2 text-center font-bold text-gray-500 text-[10px] w-16">Lorong</th><th className="px-3 py-2 text-left font-bold text-gray-500 text-[10px]">Sekolah</th><th className="px-3 py-2 text-left font-bold text-gray-500 text-[10px]">Ahli Pasukan</th><th className="px-3 py-2 text-center font-bold text-gray-500 text-[10px] w-20">Heat</th></tr></thead>
                          <tbody className="divide-y divide-gray-50">
                            {pesertaRows.map((p, idx) => (
                              <tr key={idx} className="hover:bg-blue-50/30">
                                <td className="px-3 py-2 text-center"><span className="font-black text-[#003399] text-sm">{p.lorong ?? '—'}</span></td>
                                <td className="px-3 py-2 font-semibold text-gray-800">{p.kodSekolah || '—'}</td>
                                <td className="px-3 py-2 text-gray-600 text-[10px]">{(p.ahliPasukan || []).map(x => x.namaAtlet || x.noBib || '?').join(', ') || '—'}</td>
                                <td className="px-3 py-2 text-center"><span className="text-[9px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">{heatLabel(p._heat)}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <table className="w-full text-xs">
                          <thead><tr className="bg-gray-50 border-b border-gray-100"><th className="px-3 py-2 text-center font-bold text-gray-500 text-[10px] w-16">{isPadang ? '#' : 'Lorong'}</th><th className="px-3 py-2 text-left font-bold text-gray-500 text-[10px]">Nama Atlet</th><th className="px-3 py-2 text-center font-bold text-gray-500 text-[10px] w-20">No. Badan</th><th className="px-3 py-2 text-center font-bold text-gray-500 text-[10px] w-20">Heat</th></tr></thead>
                          <tbody className="divide-y divide-gray-50">
                            {pesertaRows.map((p, idx) => (
                              <tr key={idx} className="hover:bg-blue-50/30">
                                <td className="px-3 py-2 text-center"><span className="font-black text-[#003399] text-sm">{isPadang ? (p.giliran ?? '—') : (p.lorong ?? '—')}</span></td>
                                <td className="px-3 py-2 font-semibold text-gray-800">{p.namaAtlet || '—'}</td>
                                <td className="px-3 py-2 text-center font-mono text-gray-600">{p.noBib || '—'}</td>
                                <td className="px-3 py-2 text-center"><span className="text-[9px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">{heatLabel(p._heat)}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  if (!schoolId || !kodSekolah) {
    return (
      <div className="p-6 text-center text-sm text-gray-400">
        Akaun tidak lengkap. Hubungi pentadbir.
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-gray-900">Panel Pengurus Pasukan</h1>
          {sekolahData?.namaSekolah && (
            <p className="text-xs text-gray-500 mt-0.5">{sekolahData.namaSekolah}</p>
          )}
        </div>
        {kejohanan && (
          <div className="text-right">
            <p className="text-[10px] text-gray-400">Kejohanan Aktif</p>
            <p className="text-xs font-bold text-[#003399]">{kejohanan.namaKejohanan}</p>
          </div>
        )}
      </div>

      {!kejohanan && !loading && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
          Tiada kejohanan aktif. Hubungi pentadbir untuk aktifkan kejohanan.
        </div>
      )}

      {/* Tab Bar — 6 tab setara KOAM */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl overflow-x-auto w-fit max-w-full">
        {PP_TABS.map(t => {
          const isActive = activeTab === t.k
          let tabCls = isActive
            ? 'bg-white text-[#003399] shadow-sm'
            : t.k === 'startlist'
              ? isDikunci
                ? 'bg-green-50 text-green-700 hover:bg-green-100'
                : pengesahanReady
                  ? 'bg-blue-50 text-[#003399] hover:bg-blue-100'
                  : 'text-gray-400 hover:text-gray-600'
              : 'text-gray-500 hover:text-gray-700'
          return (
            <button key={t.k} onClick={() => setActiveTab(t.k)}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${tabCls}`}>
              {t.icon}{t.l}
              {t.k === 'startlist' && !isActive && (
                <span className={`w-2 h-2 rounded-full shrink-0 ${isDikunci ? 'bg-green-500' : pengesahanReady ? 'bg-[#003399] animate-pulse' : 'bg-gray-300'}`} />
              )}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'atlet' && (
        <TabAtlet
          schoolId={schoolId}
          kodSekolah={kodSekolah}
          sekolahData={sekolahData}
          tahunKej={tahunKej}
          kategoriList={kategoriList}
          kejohananId={kejohanan?.id || null}
          myPendaftaran={myPendaftaran}
          onRefreshPend={refreshPend}
        />
      )}
      {activeTab === 'daftar' && (
        <TabDaftar
          schoolId={schoolId}
          kodSekolah={kodSekolah}
          sekolahData={sekolahData}
          kejohanan={kejohanan}
          tahunKej={tahunKej}
          kategoriList={kategoriList}
          atletSekolah={atletSekolah}
          pendaftaranList={pendaftaranList}
          acaraList={acaraList}
          loading={loading}
          fetchErr={fetchErr}
          onRefresh={refreshPend}
        />
      )}
      {activeTab === 'analisa'   && renderTabAnalisa()}
      {activeTab === 'status'    && renderTabStatus()}
      {activeTab === 'cetak'     && renderTabCetak()}
      {activeTab === 'startlist' && renderTabStartList()}
    </div>
  )
}
