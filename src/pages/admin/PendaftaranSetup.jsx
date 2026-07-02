/**
 * PendaftaranSetup — /admin/kejohanan/:kejId/pendaftaran
 *
 * Gold Podium — multi-tenant
 *
 * Dua tab:
 *  Tab 1 — Urus Atlet   : CRUD master atlet sekolah
 *  Tab 2 — Daftar Acara : Daftar atlet ke acara dalam kejohanan aktif
 *
 * Firestore paths:
 *  tenants/{schoolId}/atlet/{atletId}                       — master atlet
 *  tenants/{schoolId}/kejohanan/{kejId}/pendaftaran/{atletId}
 *     { noBib, acaraIds[], kategoriKod, updatedAt }
 *  tenants/{schoolId}/kejohanan/{kejId}/acara/{acaraId}     — read-only
 *  tenants/{schoolId}/kejohanan/{kejId}/kategori/{katId}    — read-only
 *  tenants/{schoolId}/kejohanan/{kejId}                     — info kejohanan (tarikhMula)
 */

import { useState, useEffect, useCallback } from 'react'
import {
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc,
  getDoc, writeBatch, serverTimestamp, query, orderBy,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'

// ─── Path helpers ─────────────────────────────────────────────────────────────

function getKejContext() {
  try {
    const raw = sessionStorage.getItem('gp_kej_aktif')
    if (!raw) return {}
    return JSON.parse(raw)
  } catch { return {} }
}

const atletColPath  = (sId)         => `tenants/${sId}/atlet`
const pendColPath   = (sId, kId)    => `tenants/${sId}/kejohanan/${kId}/pendaftaran`
const acaraColPath  = (sId, kId)    => `tenants/${sId}/kejohanan/${kId}/acara`
const katColPath    = (sId, kId)    => `tenants/${sId}/kejohanan/${kId}/kategori`
const kejDocPath    = (sId, kId)    => `tenants/${sId}/kejohanan/${kId}`

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
  if (!tarikhLahir || !tahunKejohanan || !kategoriList.length) return null
  const filtered = kategoriList.filter(k => {
    if (!k.kod || !k.umurHad) return false
    const lbl = (k.label || k.nama || k.kod || '').toUpperCase()
    if (lbl.includes('OPEN')) return false
    if (jantina === 'L' && !lbl.startsWith('L')) return false
    if (jantina === 'P' && !lbl.startsWith('P')) return false
    return layakUmurMSSM(tarikhLahir, k.umurHad, k.umurMin, tahunKejohanan)
  })
  if (!filtered.length) return null
  filtered.sort((a, b) => Number(a.umurHad) - Number(b.umurHad))
  return filtered[0].kod
}

// Auto-parse IC: 6-digit prefix → tarikhLahir + jantina
function parseIC(digits) {
  if (digits.length < 6) return {}
  const yy = parseInt(digits.slice(0, 2), 10)
  const mm = parseInt(digits.slice(2, 4), 10)
  const dd = parseInt(digits.slice(4, 6), 10)
  const cur = new Date().getFullYear() % 100
  const year = (yy <= cur ? 2000 : 1900) + yy
  let tarikhLahir = ''
  if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
    tarikhLahir = `${year}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`
  }
  let jantina = ''
  if (digits.length >= 12) {
    const lastDigit = parseInt(digits[11], 10)
    jantina = lastDigit % 2 === 1 ? 'L' : 'P'
  }
  return { tarikhLahir, jantina }
}

function formatIC(digits) {
  let fmt = digits
  if (digits.length > 6) fmt = digits.slice(0,6) + '-' + digits.slice(6)
  if (digits.length > 8) fmt = digits.slice(0,6) + '-' + digits.slice(6,8) + '-' + digits.slice(8)
  return fmt
}

// ─── Const ────────────────────────────────────────────────────────────────────

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-[#003399]/25 focus:border-[#003399] bg-gray-50'

const Ikon = {
  balik:  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>,
  trophy: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>,
  keluar: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
  tambah: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>,
  padam:  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
  edit:   <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
  cari:   <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>,
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

function KatBadge({ kod, kategoriList = [] }) {
  if (!kod) return <span className="text-[9px] text-gray-400">—</span>
  const k = kategoriList.find(x => x.kod === kod)
  const lbl = k?.label || k?.nama || kod
  const u = lbl.toUpperCase()
  let cls = 'bg-gray-100 text-gray-600'
  if (u.startsWith('L')) cls = 'bg-blue-100 text-blue-700'
  else if (u.startsWith('P')) cls = 'bg-pink-100 text-pink-700'
  else if (u.includes('OPEN')) cls = 'bg-violet-100 text-violet-700'
  return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${cls}`}>{lbl}</span>
}

function JantinaBadge({ j }) {
  return <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${j==='L'?'bg-blue-100 text-blue-700':'bg-pink-100 text-pink-700'}`}>{j==='L'?'L':'P'}</span>
}

// ─── Modal Tambah / Edit Atlet ────────────────────────────────────────────────

function AtletModal({ mode, initial, schoolId, kejId, tahunKej, kategoriList, existingNoKP, onClose, onSaved }) {
  const isEdit = mode === 'edit'

  const EMPTY = {
    noKP: '', nama: '', jantina: 'L', tarikhLahir: '',
    noBib: '', isAktif: true,
  }

  const [form, setForm]   = useState(initial ? { ...EMPTY, ...initial } : EMPTY)
  const [saving, setSaving] = useState(false)
  const [err, setErr]     = useState('')

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); setErr('') }

  function handleICChange(raw) {
    const digits = raw.replace(/\D/g, '').slice(0, 12)
    const { tarikhLahir, jantina } = parseIC(digits)
    const noKP = formatIC(digits)
    setForm(f => ({
      ...f,
      noKP,
      ...(tarikhLahir ? { tarikhLahir } : {}),
      ...(jantina     ? { jantina }     : {}),
    }))
    setErr('')
  }

  // Auto-kira kategori apabila tarikhLahir atau jantina bertukar
  const kat = kiraKategori(form.tarikhLahir, form.jantina, tahunKej, kategoriList)

  async function handleSimpan(e) {
    e.preventDefault()
    const noKPClean = form.noKP.replace(/-/g, '').trim()
    if (noKPClean.length < 6) return setErr('No. IC tidak lengkap.')
    if (!form.nama.trim())    return setErr('Nama atlet diperlukan.')
    if (!form.tarikhLahir)    return setErr('Tarikh lahir diperlukan.')

    // Semak duplikat (Tambah sahaja)
    if (!isEdit && existingNoKP.includes(noKPClean)) {
      return setErr('Atlet dengan No. IC ini sudah didaftarkan.')
    }

    setSaving(true)
    try {
      const atletData = {
        noKP:       noKPClean,
        nama:       form.nama.trim().toUpperCase(),
        jantina:    form.jantina,
        tarikhLahir: form.tarikhLahir,
        noBib:      form.noBib.trim().toUpperCase(),
        kategoriKod: kat || null,
        isAktif:    form.isAktif,
        updatedAt:  serverTimestamp(),
      }
      if (!isEdit) atletData.createdAt = serverTimestamp()

      await setDoc(
        doc(db, atletColPath(schoolId), noKPClean),
        atletData,
        { merge: isEdit }
      )
      onSaved({ ...atletData, id: noKPClean })
    } catch (ex) {
      setErr('Gagal simpan: ' + ex.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-black text-gray-900">{isEdit ? 'Edit Atlet' : 'Tambah Atlet Baru'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <form onSubmit={handleSimpan} className="p-5 space-y-3">
          {/* No IC */}
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">
              No. Kad Pengenalan <span className="text-red-500">*</span>
            </label>
            <input
              type="text" inputMode="numeric"
              value={form.noKP}
              onChange={e => handleICChange(e.target.value)}
              placeholder="xxxxxx-xx-xxxx"
              maxLength={14}
              disabled={isEdit}
              className={inputCls + (isEdit ? ' opacity-60 cursor-not-allowed' : '')}
            />
          </div>

          {/* Nama */}
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">
              Nama Penuh <span className="text-red-500">*</span>
            </label>
            <input
              type="text" value={form.nama}
              onChange={e => set('nama', e.target.value)}
              placeholder="Nama seperti IC (huruf besar)"
              className={inputCls}
            />
          </div>

          {/* Jantina + Tarikh Lahir */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Jantina</label>
              <select value={form.jantina} onChange={e => set('jantina', e.target.value)} className={inputCls}>
                <option value="L">Lelaki</option>
                <option value="P">Perempuan</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">
                Tarikh Lahir <span className="text-red-500">*</span>
              </label>
              <input
                type="date" value={form.tarikhLahir}
                onChange={e => set('tarikhLahir', e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Kategori (auto) */}
          {kat && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700">
              Kategori dikira: <strong>{kat}</strong>
              {kategoriList.find(k=>k.kod===kat) && (
                <span className="ml-1 text-blue-500">
                  ({kategoriList.find(k=>k.kod===kat)?.label || ''})
                </span>
              )}
            </div>
          )}
          {!kat && form.tarikhLahir && (
            <div className="bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2 text-xs text-yellow-700">
              Tiada kategori dijumpai untuk umur + jantina ini.
            </div>
          )}

          {/* No Bib */}
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">No. Bib</label>
            <input
              type="text" value={form.noBib}
              onChange={e => set('noBib', e.target.value)}
              placeholder="cth: A001 (kosongkan jika belum ada)"
              className={inputCls}
            />
          </div>

          {/* Status aktif */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={form.isAktif} onChange={e => set('isAktif', e.target.checked)}
              className="w-4 h-4 text-[#003399] rounded" />
            <span className="text-xs text-gray-700">Atlet Aktif</span>
          </label>

          {err && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{err}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              Batal
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-[#003399] text-white rounded-xl py-2.5 text-sm font-bold hover:bg-[#002277] disabled:opacity-50 transition-colors">
              {saving ? 'Menyimpan…' : isEdit ? 'Simpan' : 'Daftar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal Padam Atlet ────────────────────────────────────────────────────────

function PadamModal({ atlet, schoolId, kejId, hasPendaftaran, onClose, onSaved }) {
  const [deleting, setDeleting] = useState(false)
  const [err, setErr] = useState('')

  async function handlePadam() {
    setDeleting(true)
    try {
      const batch = writeBatch(db)
      // Padam rekod pendaftaran (jika ada)
      if (hasPendaftaran) {
        batch.delete(doc(db, pendColPath(schoolId, kejId), atlet.id))
      }
      // Padam master atlet
      batch.delete(doc(db, atletColPath(schoolId), atlet.id))
      await batch.commit()
      onSaved(atlet.id)
    } catch (ex) {
      setErr('Gagal padam: ' + ex.message)
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="text-center">
          <div className="text-3xl mb-2">🗑️</div>
          <h2 className="text-sm font-black text-gray-900">Padam Atlet</h2>
          <p className="text-xs text-gray-500 mt-1">
            Padamkan <strong>{atlet.nama}</strong>?
            {hasPendaftaran && (
              <span className="block text-red-600 mt-1">
                ⚠️ Rekod pendaftaran acara turut akan dipadam.
              </span>
            )}
          </p>
        </div>
        {err && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-600 hover:bg-gray-50">
            Batal
          </button>
          <button onClick={handlePadam} disabled={deleting}
            className="flex-1 bg-red-600 text-white rounded-xl py-2.5 text-sm font-bold hover:bg-red-700 disabled:opacity-50">
            {deleting ? 'Memadamkan…' : 'Ya, Padam'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Tab 1: Urus Atlet ────────────────────────────────────────────────────────

function TabAtlet({ schoolId, kejId, tahunKej, kategoriList }) {
  const [atletList,  setAtletList]  = useState([])
  const [pendMap,    setPendMap]    = useState({})  // noKP → pend doc (untuk semak ada daftar acara)
  const [loading,    setLoading]    = useState(true)
  const [cari,       setCari]       = useState('')
  const [modal,      setModal]      = useState(null)  // null | { mode, initial }
  const [padamModal, setPadamModal] = useState(null)  // null | atlet obj

  const fetchAll = useCallback(async () => {
    if (!schoolId || !kejId) return
    setLoading(true)
    try {
      const [atletSnap, pendSnap] = await Promise.all([
        getDocs(query(collection(db, atletColPath(schoolId)), orderBy('nama'))),
        getDocs(collection(db, pendColPath(schoolId, kejId))),
      ])
      setAtletList(atletSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      const pm = {}
      pendSnap.docs.forEach(d => { pm[d.id] = d.data() })
      setPendMap(pm)
    } catch (ex) {
      console.error(ex)
    } finally {
      setLoading(false)
    }
  }, [schoolId, kejId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const filtered = atletList.filter(a => {
    if (!cari) return true
    const q = cari.toLowerCase()
    return (
      a.nama?.toLowerCase().includes(q) ||
      a.noKP?.includes(q) ||
      a.noBib?.toLowerCase().includes(q) ||
      a.kategoriKod?.toLowerCase().includes(q)
    )
  })

  function handleSaved(data) {
    setAtletList(prev => {
      const idx = prev.findIndex(a => a.id === data.id)
      if (idx >= 0) { const n = [...prev]; n[idx] = data; return n }
      return [...prev, data].sort((a, b) => (a.nama||'').localeCompare(b.nama||''))
    })
    setModal(null)
  }

  function handlePadam(id) {
    setAtletList(prev => prev.filter(a => a.id !== id))
    setPendModal(null)
    setPadamModal(null)
  }

  // suppress naming confusion: setPendModal does not exist — use setPadamModal
  function afterPadam(id) {
    setAtletList(prev => prev.filter(a => a.id !== id))
    setPendMap(prev => { const n = { ...prev }; delete n[id]; return n })
    setPadamModal(null)
  }

  const existingNoKP = atletList.map(a => a.id)

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{Ikon.cari}</span>
          <input
            type="text" value={cari} onChange={e => setCari(e.target.value)}
            placeholder="Cari nama, IC, bib, kategori…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#003399]/20 bg-white"
          />
        </div>
        <button onClick={() => setModal({ mode: 'add', initial: null })}
          className="flex items-center gap-1.5 bg-[#003399] text-white text-xs font-bold px-3 py-2 rounded-xl hover:bg-[#002277] transition-colors shrink-0">
          {Ikon.tambah} Tambah Atlet
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Jumlah Atlet', val: atletList.length, cls: 'text-[#003399]' },
          { label: 'Sudah Daftar Acara', val: Object.keys(pendMap).filter(k => (pendMap[k]?.acaraIds||[]).length > 0).length, cls: 'text-green-600' },
          { label: 'Belum Ada Kategori', val: atletList.filter(a => !a.kategoriKod).length, cls: 'text-orange-500' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-100 rounded-xl p-3 text-center">
            <p className={`text-xl font-black ${s.cls}`}>{s.val}</p>
            <p className="text-[9px] text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Senarai */}
      {loading ? (
        <div className="flex justify-center py-12">
          <svg className="w-5 h-5 animate-spin text-[#003399]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <p className="text-sm text-gray-500">{cari ? 'Tiada hasil carian.' : 'Belum ada atlet didaftarkan.'}</p>
          {!cari && (
            <button onClick={() => setModal({ mode: 'add', initial: null })}
              className="mt-3 text-xs text-[#003399] font-bold hover:underline">
              + Daftar atlet pertama
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 text-[9px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
            <div className="col-span-1">#</div>
            <div className="col-span-4">Nama</div>
            <div className="col-span-2">No IC</div>
            <div className="col-span-1">J</div>
            <div className="col-span-2">Kategori</div>
            <div className="col-span-1">Bib</div>
            <div className="col-span-1">Acara</div>
          </div>
          {filtered.map((a, idx) => {
            const pend = pendMap[a.id]
            const jumlahAcara = (pend?.acaraIds || []).length
            return (
              <div key={a.id}
                className="grid grid-cols-12 gap-2 px-4 py-3 items-center border-b border-gray-50 hover:bg-gray-50 transition-colors group">
                <div className="col-span-1 text-[10px] text-gray-400 font-mono">{idx + 1}</div>
                <div className="col-span-4 sm:col-span-4 col-span-10">
                  <p className="text-xs font-bold text-gray-900 truncate">{a.nama}</p>
                  <p className="text-[9px] text-gray-400 sm:hidden">{a.noKP || '—'}</p>
                </div>
                <div className="col-span-2 hidden sm:block text-[10px] text-gray-500 font-mono">{a.noKP || '—'}</div>
                <div className="col-span-1 hidden sm:flex">
                  <JantinaBadge j={a.jantina} />
                </div>
                <div className="col-span-2 hidden sm:flex items-center">
                  <KatBadge kod={a.kategoriKod} kategoriList={kategoriList} />
                </div>
                <div className="col-span-1 hidden sm:block text-[10px] text-gray-500 font-mono">{a.noBib || '—'}</div>
                <div className="col-span-1 hidden sm:block">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                    jumlahAcara > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                  }`}>{jumlahAcara}</span>
                </div>
                {/* Actions (visible on hover) */}
                <div className="col-span-1 sm:hidden col-span-2 flex items-center gap-1 justify-end">
                  <button onClick={() => setModal({ mode: 'edit', initial: { ...a } })}
                    className="text-gray-400 hover:text-[#003399] p-1">
                    {Ikon.edit}
                  </button>
                  <button onClick={() => setPadamModal(a)}
                    className="text-gray-400 hover:text-red-500 p-1">
                    {Ikon.padam}
                  </button>
                </div>
                <div className="col-span-12 sm:col-span-0 hidden sm:flex col-span-12 justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute right-4">
                </div>
                {/* Desktop actions */}
                <div className="col-span-1 hidden sm:flex items-center gap-1">
                  <button onClick={() => setModal({ mode: 'edit', initial: { ...a } })}
                    className="text-gray-300 hover:text-[#003399] p-1 transition-colors">
                    {Ikon.edit}
                  </button>
                  <button onClick={() => setPadamModal(a)}
                    className="text-gray-300 hover:text-red-500 p-1 transition-colors">
                    {Ikon.padam}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {modal && (
        <AtletModal
          mode={modal.mode}
          initial={modal.initial}
          schoolId={schoolId}
          kejId={kejId}
          tahunKej={tahunKej}
          kategoriList={kategoriList}
          existingNoKP={existingNoKP}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
      {padamModal && (
        <PadamModal
          atlet={padamModal}
          schoolId={schoolId}
          kejId={kejId}
          hasPendaftaran={!!(pendMap[padamModal.id])}
          onClose={() => setPadamModal(null)}
          onSaved={afterPadam}
        />
      )}
    </div>
  )
}

// ─── Tab 2: Daftar Acara ──────────────────────────────────────────────────────

function TabDaftarAcara({ schoolId, kejId, tahunKej, kategoriList }) {
  const [atletList,  setAtletList]  = useState([])
  const [acaraList,  setAcaraList]  = useState([])
  const [pendMap,    setPendMap]    = useState({})
  const [loading,    setLoading]    = useState(true)
  const [cariAtlet,  setCariAtlet]  = useState('')
  const [atletDipilih, setAtletDipilih] = useState(null)  // atlet obj yang dibuka
  const [saving,     setSaving]     = useState(false)

  const fetchAll = useCallback(async () => {
    if (!schoolId || !kejId) return
    setLoading(true)
    try {
      const [atletSnap, acaraSnap, pendSnap] = await Promise.all([
        getDocs(query(collection(db, atletColPath(schoolId)), orderBy('nama'))),
        getDocs(query(collection(db, acaraColPath(schoolId, kejId)), orderBy('noAcara'))),
        getDocs(collection(db, pendColPath(schoolId, kejId))),
      ])
      setAtletList(atletSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setAcaraList(acaraSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      const pm = {}
      pendSnap.docs.forEach(d => { pm[d.id] = { id: d.id, ...d.data() } })
      setPendMap(pm)
    } catch (ex) {
      console.error(ex)
    } finally {
      setLoading(false)
    }
  }, [schoolId, kejId])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Atlet yang ditapis
  const filteredAtlet = atletList.filter(a => {
    if (!cariAtlet) return true
    const q = cariAtlet.toLowerCase()
    return a.nama?.toLowerCase().includes(q) || a.noKP?.includes(q) || a.noBib?.toLowerCase().includes(q)
  })

  // Acara yang layak untuk atlet dipilih
  function acaraLayakAtlet(atlet) {
    if (!atlet) return []
    const katAtlet = atlet.kategoriKod
    return acaraList.filter(a => {
      if (a.statusAcara === 'batal') return false
      // Semak jantina
      const kat = kategoriList.find(k => k.kod === a.kategoriKod)
      if (kat) {
        const lbl = (kat.label || kat.nama || kat.kod || '').toUpperCase()
        if (!lbl.includes('OPEN')) {
          // Acara bukan OPEN — hanya atlet dengan kategori sama
          if (a.kategoriKod !== katAtlet) return false
          // Semak jantina dari label
          if (lbl.startsWith('L') && atlet.jantina !== 'L') return false
          if (lbl.startsWith('P') && atlet.jantina !== 'P') return false
        }
      }
      return true
    })
  }

  // Toggle daftar / tarik diri satu acara
  async function toggleAcara(atlet, acaraId) {
    if (saving) return
    setSaving(true)
    try {
      const pendDocRef = doc(db, pendColPath(schoolId, kejId), atlet.id)
      const pendSedia  = pendMap[atlet.id]
      const idsSedia   = pendSedia?.acaraIds || []
      const daftar     = idsSedia.includes(acaraId)
      const newIds     = daftar
        ? idsSedia.filter(x => x !== acaraId)
        : [...idsSedia, acaraId]

      // Semak had acara individu
      if (!daftar) {
        const katAtlet = atlet.kategoriKod
        const katObj   = kategoriList.find(k => k.kod === katAtlet)
        const hadInd   = Number(katObj?.hadAcaraIndividu) || 0
        if (hadInd > 0) {
          const acaraNonOpen = newIds.filter(id => {
            const ac = acaraList.find(a => a.id === id)
            const kac = kategoriList.find(k => k.kod === ac?.kategoriKod)
            const lbl = (kac?.label || kac?.nama || '').toUpperCase()
            return !lbl.includes('OPEN')
          })
          if (acaraNonOpen.length > hadInd) {
            alert(`Had maksimum ${hadInd} acara individu untuk kategori ${katAtlet}.`)
            setSaving(false)
            return
          }
        }
      }

      if (newIds.length === 0) {
        await deleteDoc(pendDocRef)
        setPendMap(prev => { const n = { ...prev }; delete n[atlet.id]; return n })
      } else {
        await setDoc(pendDocRef, {
          noKP:       atlet.id,
          noBib:      atlet.noBib || '',
          kategoriKod: atlet.kategoriKod || null,
          acaraIds:   newIds,
          updatedAt:  serverTimestamp(),
        })
        setPendMap(prev => ({
          ...prev,
          [atlet.id]: { id: atlet.id, noKP: atlet.id, acaraIds: newIds }
        }))
      }
    } catch (ex) {
      alert('Gagal kemaskini: ' + ex.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <svg className="w-5 h-5 animate-spin text-[#003399]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Pilih atlet */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Pilih Atlet</span>
          <div className="flex-1 relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 scale-75">{Ikon.cari}</span>
            <input type="text" value={cariAtlet} onChange={e => setCariAtlet(e.target.value)}
              placeholder="cari…"
              className="w-full pl-7 pr-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#003399]/20"
            />
          </div>
        </div>
        <div className="max-h-60 overflow-y-auto divide-y divide-gray-50">
          {filteredAtlet.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">
              {atletList.length === 0 ? 'Tiada atlet. Daftar dulu dalam Tab Atlet.' : 'Tiada hasil carian.'}
            </p>
          ) : filteredAtlet.map(a => {
            const pend = pendMap[a.id]
            const jumlah = (pend?.acaraIds || []).length
            const dipilih = atletDipilih?.id === a.id
            return (
              <button key={a.id}
                onClick={() => setAtletDipilih(dipilih ? null : a)}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors ${dipilih ? 'bg-blue-50' : ''}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-900 truncate">{a.nama}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <JantinaBadge j={a.jantina} />
                    <KatBadge kod={a.kategoriKod} kategoriList={kategoriList} />
                    {a.noBib && <span className="text-[9px] text-gray-400 font-mono">{a.noBib}</span>}
                  </div>
                </div>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                  jumlah > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                }`}>{jumlah} acara</span>
                {dipilih && <span className="text-[#003399] text-xs">▲</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Panel acara untuk atlet dipilih */}
      {atletDipilih ? (() => {
        const layak = acaraLayakAtlet(atletDipilih)
        const pend  = pendMap[atletDipilih.id]
        const daftar = pend?.acaraIds || []
        return (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
              <div>
                <p className="text-xs font-black text-[#003399]">{atletDipilih.nama}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <JantinaBadge j={atletDipilih.jantina} />
                  <KatBadge kod={atletDipilih.kategoriKod} kategoriList={kategoriList} />
                  {atletDipilih.noBib && <span className="text-[9px] text-gray-400 font-mono">{atletDipilih.noBib}</span>}
                </div>
              </div>
              <span className="text-[10px] font-bold text-blue-600">
                {daftar.length} acara didaftar
              </span>
            </div>
            {layak.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-400">
                Tiada acara layak untuk atlet ini. Semak kategori atlet & acara.
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {layak.map(ac => {
                  const isDaftar = daftar.includes(ac.id)
                  const kat = kategoriList.find(k => k.kod === ac.kategoriKod)
                  return (
                    <label key={ac.id}
                      className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${isDaftar ? 'bg-green-50/50' : ''}`}>
                      <input type="checkbox" checked={isDaftar}
                        onChange={() => toggleAcara(atletDipilih, ac.id)}
                        disabled={saving}
                        className="w-4 h-4 text-[#003399] rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-800">
                          {ac.noAcara ? <span className="text-[#003399] mr-1">#{ac.noAcara}</span> : null}
                          {ac.namaAcara || ac.nama}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {kat && <span className="text-[9px] text-gray-400">{kat.label || kat.nama}</span>}
                          {ac.peringkat && (
                            <span className="text-[9px] bg-gray-100 text-gray-500 px-1 rounded">
                              {ac.peringkat === 'akhir' ? 'Final' : ac.peringkat === 'saringan_qf' ? 'Saringan/QF' : ac.peringkat === 'saringan_sf' ? 'Saringan/SF' : ac.peringkat === 'separuh_akhir' ? 'Separuh Akhir' : ac.peringkat}
                            </span>
                          )}
                          {ac.tarikhAcara && (
                            <span className="text-[9px] text-gray-400">
                              {new Date(ac.tarikhAcara).toLocaleDateString('ms-MY', { day: 'numeric', month: 'short' })}
                            </span>
                          )}
                        </div>
                      </div>
                      {isDaftar && <span className="text-green-500 text-xs shrink-0">✓</span>}
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )
      })() : (
        <div className="bg-gray-50 rounded-2xl border border-dashed border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-400">Pilih atlet di atas untuk daftar acara</p>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PendaftaranSetup() {
  const navigate = useNavigate()
  const { userData, logout } = useAuth()
  const isSuperadmin = userData?.role === 'superadmin'

  const ctx      = getKejContext()
  const schoolId = ctx.schoolId || ''
  const kejId    = ctx.id       || ''
  const namaKej  = ctx.namaKejohanan || ctx.nama || ''

  const [tab,          setTab]          = useState(0)
  const [kategoriList, setKategoriList] = useState([])
  const [tahunKej,     setTahunKej]     = useState('')

  // Guard
  if (!schoolId || !kejId) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm text-gray-500 font-semibold">Tiada kejohanan dipilih.</p>
        <button onClick={() => navigate('/admin')}
          className="text-xs text-[#003399] border border-[#003399] rounded-xl px-4 py-2 hover:bg-[#003399] hover:text-white transition-colors">
          ← Balik Dashboard
        </button>
      </div>
    )
  }

  // Ambil kategori + tahun kejohanan sekali
  useEffect(() => {
    async function load() {
      const [katSnap, kejSnap] = await Promise.all([
        getDocs(query(collection(db, katColPath(schoolId, kejId)), orderBy('urutan'))),
        getDoc(doc(db, kejDocPath(schoolId, kejId))),
      ])
      setKategoriList(katSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      const tarikhMula = kejSnap.data()?.tarikhMula
      if (tarikhMula) setTahunKej(String(new Date(tarikhMula).getFullYear()))
    }
    load().catch(console.error)
  }, [schoolId, kejId])

  const TABS = ['Urus Atlet', 'Daftar Acara']

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Superadmin banner */}
      {isSuperadmin && (
        <div className="bg-amber-400 text-amber-900 px-4 py-2 flex items-center justify-between text-xs font-bold">
          <span>⚡ Mode Superadmin</span>
          <button onClick={() => { sessionStorage.removeItem('gp_view_school'); navigate('/superadmin') }}
            className="underline hover:no-underline">
            ← Balik ke Panel Superadmin
          </button>
        </div>
      )}

      {/* Header */}
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
            <p className="text-sm font-bold leading-tight truncate">{namaKej || 'Pendaftaran Atlet'}</p>
          </div>
        </div>
        <button onClick={async () => { await logout(); navigate('/login') }}
          className="text-white/60 hover:text-white transition-colors p-1.5 flex items-center gap-1.5 text-xs shrink-0">
          {Ikon.keluar}
          <span className="hidden sm:block">Log Keluar</span>
        </button>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-4">

        {/* Tab bar */}
        <div className="flex bg-white border border-gray-100 rounded-2xl p-1 shadow-sm gap-1">
          {TABS.map((t, i) => (
            <button key={t} onClick={() => setTab(i)}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                tab === i
                  ? 'bg-[#003399] text-white shadow-md'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}>
              {t}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 0 && (
          <TabAtlet
            schoolId={schoolId}
            kejId={kejId}
            tahunKej={tahunKej}
            kategoriList={kategoriList}
          />
        )}
        {tab === 1 && (
          <TabDaftarAcara
            schoolId={schoolId}
            kejId={kejId}
            tahunKej={tahunKej}
            kategoriList={kategoriList}
          />
        )}

      </div>
    </div>
  )
}
