/**
 * Rekod.jsx — /dashboard/rekod
 *
 * Paparan & pengurusan rekod daerah/negeri/kebangsaan per acara.
 * Pengurus Teknik boleh:
 *   - Tambah rekod awal (seed)
 *   - Sahkan / Tolak tuntutan rekod baru dari KeputusanRasmi
 *   - Edit & padam rekod (dengan audit ke rekod_sejarah)
 *
 * Doc key: {namaAcara}_{jantina}_{kategoriKod}_{peringkat} (uppercase, space→_)
 * Tuntutan: rekod/{rekodKey}_tuntutan (doc berasingan, pending confirmation)
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc,
  query, orderBy, where, serverTimestamp, getDoc,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PERINGKAT_META = {
  D: { label: 'Daerah',      cls: 'bg-gray-100 text-gray-700 border-gray-300' },
  N: { label: 'Negeri',      cls: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  K: { label: 'Kebangsaan',  cls: 'bg-red-100 text-red-800 border-red-300' },
}

const STATUS_META = {
  aktif:    { label: 'Aktif',    cls: 'bg-green-100 text-green-700' },
  dipecah:  { label: 'Dipecah',  cls: 'bg-gray-100 text-gray-500' },
}

const UNIT_LABEL = { s: 'saat', m: 'meter', mata: 'mata' }

function formatPrestasi(prestasi, unit) {
  if (prestasi === null || prestasi === undefined || prestasi === '') return '—'
  const v = Number(prestasi)
  if (isNaN(v)) return String(prestasi)
  if (unit === 's') {
    if (v >= 60) {
      const m = Math.floor(v / 60)
      const s = (v - m * 60).toFixed(2).padStart(5, '0')
      return `${m}:${s}`
    }
    return v.toFixed(2) + 's'
  }
  if (unit === 'm') return v.toFixed(2) + 'm'
  return String(v)
}

function rekodKey(namaAcara, jantina, kategoriKod, peringkat) {
  return [namaAcara, jantina, kategoriKod, peringkat]
    .join('_').toUpperCase().replace(/[^A-Z0-9_]/g, '_')
}

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-[#003399]/25 focus:border-[#003399] bg-gray-50'

const EMPTY_FORM = {
  namaAcara: '', jantina: 'L', kategoriKod: '', peringkat: 'D',
  noKP: '', namaAtlet: '', kodSekolah: '', namaSekolah: '',
  namaDaerah: '', namaNegeri: '',
  prestasi: '', unit: 's',
  windSpeed: '', isWindLegal: true, jenisRekod: 'elektronik',
  tarikhRekod: new Date().toISOString().split('T')[0],
  catatanKhas: '',
}

// ─── Modal Tambah / Edit Rekod ────────────────────────────────────────────────

function RekodModal({ initial, kategoriList, acaraList, onClose, onSaved }) {
  const { userData } = useAuth()
  const isEdit = !!initial?.rekodId
  const [form, setForm] = useState(initial || EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // Nama acara unik — tapis ikut kategori + jantina yang dipilih
  const acaraOptions = useMemo(() => {
    const filtered = acaraList.filter(a => {
      if (form.kategoriKod && a.kategoriKod !== form.kategoriKod) return false
      if (form.jantina && a.jantina !== form.jantina) return false
      return true
    })
    return [...new Set(filtered.map(a => a.namaAcara))].sort()
  }, [acaraList, form.kategoriKod, form.jantina])

  // Auto-set unit apabila nama acara dipilih
  function handleNamaAcaraChange(nama) {
    set('namaAcara', nama)
    const match = acaraList.find(a =>
      a.namaAcara === nama &&
      (!form.kategoriKod || a.kategoriKod === form.kategoriKod) &&
      a.jantina === form.jantina
    )
    if (match) {
      set('unit', ['padang_lompat', 'padang_balin'].includes(match.jenisAcara) ? 'm' : 's')
    }
  }

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setErr('')
    if (!form.namaAcara.trim()) return setErr('Nama acara diperlukan.')
    if (!form.kategoriKod.trim()) return setErr('Kategori diperlukan.')
    if (!form.prestasi || isNaN(Number(form.prestasi)) || Number(form.prestasi) <= 0)
      return setErr('Prestasi tidak sah.')

    setSaving(true)
    try {
      const rKey = rekodKey(form.namaAcara, form.jantina, form.kategoriKod, form.peringkat)
      const ref  = doc(db, 'rekod', rKey)
      const snap = await getDoc(ref)

      // Kalau edit rekod aktif, archive ke sejarah dulu
      if (isEdit && snap.exists() && snap.data().statusRekod === 'aktif') {
        const sejarahRef = doc(collection(db, 'rekod_sejarah'))
        await setDoc(sejarahRef, { ...snap.data(), diarchivPada: serverTimestamp() })
      }

      await setDoc(ref, {
        rekodId:     rKey,
        namaAcara:   form.namaAcara.trim(),
        jantina:     form.jantina,
        kategoriKod: form.kategoriKod.trim().toUpperCase(),
        peringkat:   form.peringkat,
        noKP:        form.noKP.trim(),
        namaAtlet:   form.namaAtlet.trim(),
        kodSekolah:  form.kodSekolah.trim().toUpperCase(),
        namaSekolah: form.namaSekolah.trim(),
        namaDaerah:  form.namaDaerah.trim(),
        namaNegeri:  form.namaNegeri.trim(),
        prestasi:    Number(form.prestasi),
        unit:        form.unit,
        windSpeed:   form.windSpeed !== '' ? Number(form.windSpeed) : null,
        isWindLegal: form.isWindLegal,
        jenisRekod:  form.jenisRekod,
        statusRekod: 'aktif',
        tarikhRekod: form.tarikhRekod,
        kejohananId: '',       // rekod input manual — tiada kejohanan spesifik
        disahkanOleh: userData?.uid || null,
        catatanKhas: form.catatanKhas.trim(),
        updatedAt:   serverTimestamp(),
      })
      onSaved()
    } catch (e) {
      setErr(e.message || 'Ralat tidak dijangka.')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-8 px-4">
      <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl overflow-hidden">
        <div className="bg-[#003399] text-white px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-white/50 uppercase tracking-widest">Rekod Sistem</p>
            <p className="text-sm font-bold">{isEdit ? 'Kemaskini Rekod' : 'Tambah Rekod'}</p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</p>}

          {/* Langkah 1: Pilih Kategori + Jantina dahulu supaya dropdown acara terisi */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Kategori *</label>
              <select className={inputCls} value={form.kategoriKod}
                onChange={e => { set('kategoriKod', e.target.value); set('namaAcara', '') }}>
                <option value="">— Pilih —</option>
                {kategoriList.map(k => (
                  <option key={k.id} value={k.kod}>{k.kod} — {k.nama}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Jantina</label>
              <select className={inputCls} value={form.jantina}
                onChange={e => { set('jantina', e.target.value); set('namaAcara', '') }}>
                <option value="L">Lelaki</option>
                <option value="P">Perempuan</option>
              </select>
            </div>
          </div>

          {/* Langkah 2: Pilih Nama Acara dari dropdown (auto-filter ikut kat+jantina) */}
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Nama Acara *</label>
            {isEdit ? (
              <input className={inputCls + ' bg-gray-100 text-gray-500 cursor-not-allowed'}
                value={form.namaAcara} readOnly />
            ) : (
              <select className={inputCls} value={form.namaAcara}
                onChange={e => handleNamaAcaraChange(e.target.value)}>
                <option value="">— Pilih Acara —</option>
                {acaraOptions.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            )}
            {!isEdit && acaraOptions.length === 0 && form.kategoriKod && (
              <p className="text-[10px] text-amber-600 mt-1">
                Tiada acara untuk Kat {form.kategoriKod} dalam sistem. Pilih kategori & jantina dahulu.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Peringkat</label>
              <select className={inputCls} value={form.peringkat} onChange={e => set('peringkat', e.target.value)}>
                <option value="D">Daerah</option>
                <option value="N">Negeri</option>
                <option value="K">Kebangsaan</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Unit</label>
              <select className={inputCls} value={form.unit} onChange={e => set('unit', e.target.value)}>
                <option value="s">Masa (s)</option>
                <option value="m">Jarak (m)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Prestasi *</label>
              <input className={inputCls} type="number" step="0.01" min="0"
                value={form.prestasi} onChange={e => set('prestasi', e.target.value)}
                placeholder={form.unit === 's' ? 'cth: 12.45' : 'cth: 5.80'} />
              <p className="text-[10px] text-gray-400 mt-0.5">
                {form.unit === 's' ? 'Dalam saat — cth: 12.45 (100m) atau 125.32 (800m)' : 'Dalam meter — cth: 5.80'}
              </p>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Angin (m/s)</label>
              <input className={inputCls} type="number" step="0.1" min="-10" max="10"
                value={form.windSpeed} onChange={e => set('windSpeed', e.target.value)}
                placeholder="cth: 1.8 atau -0.5" />
              <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
                <input type="checkbox" checked={form.isWindLegal}
                  onChange={e => set('isWindLegal', e.target.checked)}
                  className="rounded border-gray-300" />
                <span className="text-[10px] text-gray-500">Angin Sah (≤ 2.0 m/s)</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Nama Atlet</label>
              <input className={inputCls} value={form.namaAtlet}
                onChange={e => set('namaAtlet', e.target.value)}
                placeholder="Nama penuh" />
            </div>
            {/* Field lokasi — berbeza ikut peringkat */}
            {form.peringkat === 'D' && (
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Sekolah</label>
                <input className={inputCls} value={form.namaSekolah}
                  onChange={e => set('namaSekolah', e.target.value)}
                  placeholder="Nama sekolah pemegang rekod" />
              </div>
            )}
            {form.peringkat === 'N' && (
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Daerah</label>
                <input className={inputCls} value={form.namaDaerah}
                  onChange={e => set('namaDaerah', e.target.value)}
                  placeholder="Nama daerah pemegang rekod" />
              </div>
            )}
            {form.peringkat === 'K' && (
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Negeri</label>
                <input className={inputCls} value={form.namaNegeri}
                  onChange={e => set('namaNegeri', e.target.value)}
                  placeholder="Nama negeri pemegang rekod" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">No. KP</label>
              <input className={inputCls} value={form.noKP}
                onChange={e => set('noKP', e.target.value)}
                placeholder="cth: 990112-11-1234" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Tarikh Rekod</label>
              <input className={inputCls} type="date" value={form.tarikhRekod}
                onChange={e => set('tarikhRekod', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Jenis Rekod</label>
              <select className={inputCls} value={form.jenisRekod}
                onChange={e => set('jenisRekod', e.target.value)}>
                <option value="elektronik">Elektronik</option>
                <option value="manual">Manual</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Catatan</label>
              <input className={inputCls} value={form.catatanKhas}
                onChange={e => set('catatanKhas', e.target.value)}
                placeholder="Nota pengurus teknik..." />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={saving}
              className="px-6 py-2.5 bg-[#003399] hover:bg-[#002277] disabled:bg-gray-300 text-white text-sm font-bold rounded-lg transition-colors">
              {saving ? 'Menyimpan…' : isEdit ? 'Kemaskini' : 'Simpan Rekod'}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 border border-gray-200 text-sm text-gray-500 rounded-lg hover:bg-gray-50">
              Batal
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Rekod() {
  const { userData } = useAuth()
  const userRole = userData?.role

  const canEdit   = ['superadmin', 'pengurus_teknik'].includes(userRole)
  const canSahkan = ['superadmin', 'pengurus_teknik'].includes(userRole)

  const [rekodList,    setRekodList]    = useState([])
  const [tuntutanList, setTuntutanList] = useState([])
  const [kategoriList, setKategoriList] = useState([])
  const [acaraList,    setAcaraList]    = useState([])
  const [loading,      setLoading]      = useState(true)
  const [selPeringkat, setSelPeringkat] = useState('D')
  const [activeTab,    setActiveTab]    = useState('semasa')  // 'semasa' | 'tuntutan'
  const [modal,        setModal]        = useState(null)      // null | { mode, initial }
  const [msg,          setMsg]          = useState(null)
  const [expandedRows, setExpandedRows] = useState(new Set())

  // ── Load data ───────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rekodSnap, katSnap] = await Promise.all([
        getDocs(query(collection(db, 'rekod'), orderBy('updatedAt', 'desc'))),
        getDocs(query(collection(db, 'kategori'), orderBy('urutan'))),
      ])
      const allRekod = rekodSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      setRekodList(allRekod.filter(r => !r.id.endsWith('_tuntutan') && r.statusRekod !== 'dipecah'))
      setTuntutanList(allRekod.filter(r => r.id.endsWith('_tuntutan')))
      setKategoriList(katSnap.docs.map(d => ({ id: d.id, ...d.data() })))

      // Fetch acara dari kejohanan aktif — untuk dropdown nama acara dalam modal
      const kejSnap = await getDocs(query(collection(db, 'kejohanan'), where('statusKejohanan', '==', 'aktif')))
      if (!kejSnap.empty) {
        const kejId = kejSnap.docs[0].id
        const aSnap = await getDocs(query(collection(db, 'kejohanan', kejId, 'acara'), orderBy('kategoriKod')))
        setAcaraList(aSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function handleSahkan(tuntutan) {
    if (!confirm(`Sahkan rekod baru?\n${tuntutan.namaAcara} ${tuntutan.jantina} ${tuntutan.kategoriKod}\nPrestasi: ${formatPrestasi(tuntutan.prestasi, tuntutan.unit)}`)) return
    try {
      const rekodRef  = doc(db, 'rekod', tuntutan.rekodAsal)
      const tuntutanRef = doc(db, 'rekod', tuntutan.id)
      const rekodSnap = await getDoc(rekodRef)

      // Archive rekod lama ke rekod_sejarah
      if (rekodSnap.exists()) {
        const sejarahRef = doc(collection(db, 'rekod_sejarah'))
        await setDoc(sejarahRef, {
          ...rekodSnap.data(),
          dipecahOleh: {
            namaAtlet: tuntutan.namaAtlet,
            prestasi:  tuntutan.prestasi,
            tarikhRekod: tuntutan.tarikhRekod,
            kejohananId: tuntutan.kejohananId,
          },
          diarchivPada: serverTimestamp(),
        })
        await updateDoc(rekodRef, { statusRekod: 'dipecah' })
      }

      // Tulis rekod baru (dari tuntutan)
      const { id: _id, rekodAsal: _asal, ...tuntutanData } = tuntutan
      await setDoc(rekodRef, {
        ...tuntutanData,
        rekodId:      tuntutan.rekodAsal,
        statusRekod:  'aktif',
        disahkanOleh: userData?.uid || null,
        updatedAt:    serverTimestamp(),
      })

      // Padam tuntutan
      await deleteDoc(tuntutanRef)
      setMsg({ type: 'ok', text: 'Rekod baru disahkan.' })
      load()
    } catch (e) {
      setMsg({ type: 'err', text: 'Gagal: ' + e.message })
    }
  }

  async function handleTolak(tuntutan) {
    if (!confirm('Tolak tuntutan rekod ini?')) return
    try {
      await deleteDoc(doc(db, 'rekod', tuntutan.id))
      setMsg({ type: 'ok', text: 'Tuntutan ditolak dan dibuang.' })
      load()
    } catch (e) {
      setMsg({ type: 'err', text: 'Gagal: ' + e.message })
    }
  }

  async function handleDelete(rekod) {
    if (!confirm(`Padam rekod ${rekod.namaAcara} ${rekod.jantina} ${rekod.kategoriKod}?\nTindakan ini tidak boleh dibatalkan.`)) return
    try {
      // Archive ke sejarah
      const sejarahRef = doc(collection(db, 'rekod_sejarah'))
      await setDoc(sejarahRef, { ...rekod, dipadamPada: serverTimestamp() })
      await deleteDoc(doc(db, 'rekod', rekod.id))
      setMsg({ type: 'ok', text: 'Rekod dipadam dan diarkibkan.' })
      load()
    } catch (e) {
      setMsg({ type: 'err', text: 'Gagal: ' + e.message })
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const filteredRekod = rekodList.filter(r => r.peringkat === selPeringkat)

  // Group by kategoriKod then sort by namaAcara + jantina
  const grouped = filteredRekod.reduce((acc, r) => {
    const k = r.kategoriKod || 'Lain-lain'
    if (!acc[k]) acc[k] = []
    acc[k].push(r)
    return acc
  }, {})

  const katMap = Object.fromEntries(kategoriList.map(k => [k.kod, k]))
  const groupKeys = Object.keys(grouped).sort((a, b) => {
    const au = katMap[a]?.urutan ?? 999
    const bu = katMap[b]?.urutan ?? 999
    return au !== bu ? au - bu : a.localeCompare(b)
  })

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-base font-bold text-gray-800">Rekod Semasa</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Rekod acara peringkat daerah / negeri / kebangsaan
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setModal({ mode: 'add', initial: null })}
            className="flex items-center gap-2 px-4 py-2 bg-[#003399] hover:bg-[#002277] text-white text-xs font-bold rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Tambah Rekod
          </button>
        )}
      </div>

      {/* Msg */}
      {msg && (
        <div className={`flex items-start gap-3 px-4 py-3 rounded-lg border text-sm ${
          msg.type === 'ok'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <span>{msg.type === 'ok' ? '✓' : '✗'}</span>
          <span className="flex-1">{msg.text}</span>
          <button onClick={() => setMsg(null)} className="text-current/50 hover:text-current">✕</button>
        </div>
      )}

      {/* Tuntutan baru — alert banner */}
      {tuntutanList.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-400 rounded-lg flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold text-amber-800">
              {tuntutanList.length} Tuntutan Rekod Baru — Perlu Disahkan
            </p>
            <p className="text-[11px] text-amber-600 mt-0.5">
              Keputusan RASMI mengesan prestasi lebih baik dari rekod semasa.
            </p>
          </div>
          <button
            onClick={() => setActiveTab('tuntutan')}
            className="px-3 py-1.5 bg-amber-400 hover:bg-amber-500 text-white text-xs font-bold rounded-lg transition-colors shrink-0"
          >
            Semak Tuntutan
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { key: 'semasa',   label: 'Rekod Semasa' },
          { key: 'tuntutan', label: `Tuntutan${tuntutanList.length ? ` (${tuntutanList.length})` : ''}` },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === t.key
                ? 'bg-white text-[#003399] shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Rekod Semasa ── */}
      {activeTab === 'semasa' && (
        <div className="space-y-4">
          {/* Peringkat pills */}
          <div className="flex gap-2 flex-wrap">
            {['D', 'N', 'K'].map(p => {
              const m = PERINGKAT_META[p]
              return (
                <button key={p} onClick={() => setSelPeringkat(p)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${
                    selPeringkat === p ? m.cls + ' shadow-sm' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}>
                  {m.label}
                </button>
              )
            })}
            <span className="ml-auto text-xs text-gray-400 self-center">
              {filteredRekod.length} rekod
            </span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-gray-400">Memuatkan…</div>
          ) : filteredRekod.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm py-14 text-center">
              <p className="text-2xl mb-2">📋</p>
              <p className="text-sm font-semibold text-gray-500">Tiada rekod untuk peringkat {PERINGKAT_META[selPeringkat]?.label}.</p>
              {canEdit && (
                <button onClick={() => setModal({ mode: 'add', initial: null })}
                  className="mt-4 text-xs text-[#003399] hover:underline font-semibold">
                  + Tambah Rekod Pertama
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {groupKeys.map(katKod => {
                const rows = grouped[katKod] || []
                const kat  = katMap[katKod]
                return (
                  <div key={katKod} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    {/* Group header */}
                    <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <div className="w-1.5 h-6 rounded-sm" style={{ backgroundColor: kat?.warna || '#94a3b8' }} />
                      <div>
                        <span className="text-sm font-bold text-gray-800">{kat?.nama || katKod}</span>
                        <span className="ml-2 text-[10px] text-gray-400 font-mono">{katKod}</span>
                      </div>
                      <span className="ml-auto text-[10px] text-gray-400">{rows.length} rekod</span>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-400 text-[10px] uppercase tracking-wide border-b border-gray-100">
                            <th className="px-4 py-2 text-left">Acara</th>
                            <th className="px-3 py-2 text-center">Jan.</th>
                            <th className="px-4 py-2 text-left">Atlet</th>
                            <th className="px-4 py-2 text-left">Sekolah</th>
                            <th className="px-4 py-2 text-right font-bold">Prestasi</th>
                            <th className="px-3 py-2 text-center">Angin</th>
                            <th className="px-3 py-2 text-center">Tarikh</th>
                            {canEdit && <th className="px-3 py-2 text-center">Aksi</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {rows
                            .sort((a, b) => a.namaAcara.localeCompare(b.namaAcara) || a.jantina.localeCompare(b.jantina))
                            .map(r => (
                            <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 group">
                              <td className="px-4 py-2.5 font-semibold text-gray-800">{r.namaAcara}</td>
                              <td className="px-3 py-2.5 text-center">
                                <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  r.jantina === 'L' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'
                                }`}>{r.jantina}</span>
                              </td>
                              <td className="px-4 py-2.5">
                                <p className="text-gray-800">{r.namaAtlet || '—'}</p>
                                {r.noKP && <p className="text-[10px] text-gray-400 font-mono">{r.noKP}</p>}
                              </td>
                              <td className="px-4 py-2.5 text-gray-600">{r.namaSekolah || r.kodSekolah || '—'}</td>
                              <td className="px-4 py-2.5 text-right">
                                <span className="font-black text-[#003399] text-sm">
                                  {formatPrestasi(r.prestasi, r.unit)}
                                </span>
                                {r.jenisRekod === 'manual' && (
                                  <span className="ml-1 text-[10px] text-gray-400" title="Rekod manual">*</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                {r.windSpeed !== null && r.windSpeed !== undefined ? (
                                  <span className={`text-[11px] font-semibold ${
                                    r.isWindLegal ? 'text-green-600' : 'text-red-500'
                                  }`}>
                                    {r.windSpeed >= 0 ? '+' : ''}{Number(r.windSpeed).toFixed(1)}
                                  </span>
                                ) : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-3 py-2.5 text-center text-gray-500">{r.tarikhRekod || '—'}</td>
                              {canEdit && (
                                <td className="px-3 py-2.5 text-center">
                                  <div className="flex items-center gap-1.5 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => setModal({ mode: 'edit', initial: { ...r, prestasi: String(r.prestasi), windSpeed: r.windSpeed != null ? String(r.windSpeed) : '' } })}
                                      className="text-[10px] px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded font-semibold transition-colors"
                                      title="Edit rekod"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => handleDelete(r)}
                                      className="text-[10px] px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded font-semibold transition-colors"
                                      title="Padam rekod"
                                    >
                                      Padam
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Tuntutan Baru ── */}
      {activeTab === 'tuntutan' && (
        <div className="space-y-4">
          {tuntutanList.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm py-14 text-center">
              <p className="text-2xl mb-2">✅</p>
              <p className="text-sm font-semibold text-gray-500">Tiada tuntutan rekod yang menunggu.</p>
              <p className="text-xs text-gray-400 mt-1">
                Apabila keputusan RASMI mengesan prestasi lebih baik, tuntutan akan muncul di sini.
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-500">
                {tuntutanList.length} tuntutan menunggu pengesahan. Semak angin dan kelayakan atlet sebelum sahkan.
              </p>
              {tuntutanList.map(t => {
                const isMasa = t.unit === 's'
                const rekodAsal = rekodList.find(r => r.id === t.rekodAsal)
                return (
                  <div key={t.id} className="bg-white border-2 border-amber-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border-b border-amber-200">
                      <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-amber-900">
                          {t.namaAcara} · {t.jantina === 'L' ? 'Lelaki' : 'Perempuan'} · {t.kategoriKod}
                        </p>
                        <p className="text-[10px] text-amber-700">{PERINGKAT_META[t.peringkat]?.label} — tuntutan dari keputusan RASMI</p>
                      </div>
                    </div>

                    <div className="p-4">
                      <div className="grid grid-cols-2 gap-6 mb-4">
                        {/* Rekod lama */}
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Rekod Semasa</p>
                          {rekodAsal ? (
                            <>
                              <p className="text-xl font-black text-gray-600">{formatPrestasi(rekodAsal.prestasi, rekodAsal.unit)}</p>
                              <p className="text-xs text-gray-500 mt-1">{rekodAsal.namaAtlet || '—'}</p>
                              <p className="text-[10px] text-gray-400">{rekodAsal.namaSekolah || '—'} · {rekodAsal.tarikhRekod}</p>
                              {rekodAsal.windSpeed != null && (
                                <p className="text-[10px] text-gray-400">Angin: {rekodAsal.windSpeed >= 0 ? '+' : ''}{Number(rekodAsal.windSpeed).toFixed(1)} m/s</p>
                              )}
                            </>
                          ) : (
                            <p className="text-sm text-gray-400 italic">Tiada rekod sebelum ini</p>
                          )}
                        </div>

                        {/* Tuntutan baru */}
                        <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                          <p className="text-[10px] font-bold text-green-700 uppercase tracking-widest mb-2">Tuntutan Baru</p>
                          <p className="text-xl font-black text-green-700">{formatPrestasi(t.prestasi, t.unit)}</p>
                          <p className="text-xs text-gray-700 mt-1">{t.namaAtlet || '—'}</p>
                          <p className="text-[10px] text-gray-500">{t.namaSekolah || '—'} · {t.tarikhRekod}</p>
                          {t.windSpeed != null && (
                            <p className={`text-[10px] font-semibold mt-0.5 ${t.isWindLegal ? 'text-green-600' : 'text-red-500'}`}>
                              Angin: {t.windSpeed >= 0 ? '+' : ''}{Number(t.windSpeed).toFixed(1)} m/s
                              {!t.isWindLegal && ' ⚠ TIDAK SAH'}
                            </p>
                          )}
                          {rekodAsal && (
                            <p className="text-[10px] text-green-700 font-bold mt-1">
                              Lebih baik sebanyak: {isMasa
                                ? (Number(rekodAsal.prestasi) - Number(t.prestasi)).toFixed(2) + 's'
                                : (Number(t.prestasi) - Number(rekodAsal.prestasi)).toFixed(2) + 'm'}
                            </p>
                          )}
                        </div>
                      </div>

                      {!t.isWindLegal && t.windSpeed !== null && (
                        <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-xs text-red-700 font-semibold">
                            ⚠ Amaran: Angin melebihi had ({Number(t.windSpeed).toFixed(1)} m/s).
                            Rekod ini TIDAK SAH untuk rekod rasmi. Pertimbangkan untuk menolak.
                          </p>
                        </div>
                      )}

                      {canSahkan && (
                        <div className="flex items-center gap-3">
                          <button onClick={() => handleSahkan(t)}
                            className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition-colors">
                            ✓ Sahkan Rekod Baru
                          </button>
                          <button onClick={() => handleTolak(t)}
                            className="flex-1 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold rounded-lg transition-colors">
                            ✕ Tolak Tuntutan
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}

      {/* Nota */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-[10px] text-blue-700 space-y-0.5">
        <p className="font-bold">Nota Sistem Rekod:</p>
        <p>· D = Rekod Daerah &nbsp;·&nbsp; N = Rekod Negeri &nbsp;·&nbsp; K = Rekod Kebangsaan</p>
        <p>· Rekod manual ada tanda asterisk (*). Rekod elektronik lebih dipercayai.</p>
        <p>· Angin &gt; 2.0 m/s — prestasi TIDAK layak sebagai rekod rasmi (WA Rule).</p>
        <p>· Sahkan tuntutan selepas semak angin, kelayakan atlet, dan timing system.</p>
      </div>

      {/* Modal */}
      {modal && (
        <RekodModal
          initial={modal.initial}
          kategoriList={kategoriList}
          acaraList={acaraList}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); setMsg({ type: 'ok', text: 'Rekod disimpan.' }); load() }}
        />
      )}
    </div>
  )
}
