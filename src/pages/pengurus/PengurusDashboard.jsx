/**
 * PengurusDashboard — /pengurus/dashboard
 * Pengurus pasukan lihat + tambah + edit atlet sekolah mereka
 * Firestore: tenants/{schoolId}/atlet/{noKP}
 */

import { useState, useEffect, useCallback } from 'react'
import {
  collection, query, where, onSnapshot,
  doc, setDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { hashPin } from '../../utils/hashPin'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseIC(digits) {
  if (!digits || digits.length < 6) return { tarikhLahir: '', jantina: '' }
  const yy = parseInt(digits.slice(0, 2))
  const mm = parseInt(digits.slice(2, 4))
  const dd = parseInt(digits.slice(4, 6))
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return { tarikhLahir: '', jantina: '' }
  const year = yy <= 25 ? 2000 + yy : 1900 + yy
  const tarikhLahir = `${year}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`
  const lastDigit = parseInt(digits[digits.length - 1])
  const jantina = !isNaN(lastDigit) ? (lastDigit % 2 === 1 ? 'L' : 'P') : ''
  return { tarikhLahir, jantina }
}

function formatIC(digits) {
  if (digits.length >= 12) return `${digits.slice(0,6)}-${digits.slice(6,8)}-${digits.slice(8,12)}`
  return digits
}

function umurDari(tarikhLahir) {
  if (!tarikhLahir) return null
  const thn = new Date().getFullYear() - new Date(tarikhLahir).getFullYear()
  return thn
}

// ─── Modal Tambah/Edit Atlet ──────────────────────────────────────────────────

function ModalAtlet({ schoolId, kodSekolah, atlet, onTutup, onSaved }) {
  const isEdit = !!atlet

  const [form, setForm] = useState({
    noKP:       atlet?.noKP || '',
    nama:       atlet?.nama || '',
    jantina:    atlet?.jantina || 'L',
    tarikhLahir: atlet?.tarikhLahir || '',
    noBib:      atlet?.noBib || '',
    isAktif:    atlet?.isAktif !== false,
  })
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); setErr('') }

  function handleNoKP(val) {
    const digits = val.replace(/\D/g, '').slice(0, 12)
    const { tarikhLahir, jantina } = parseIC(digits)
    setForm(f => ({
      ...f,
      noKP: formatIC(digits),
      ...(tarikhLahir ? { tarikhLahir } : {}),
      ...(jantina     ? { jantina }     : {}),
    }))
    setErr('')
  }

  async function handleSimpan(e) {
    e.preventDefault()
    const noKPClean = form.noKP.replace(/-/g, '').trim()
    if (noKPClean.length < 6) return setErr('No. IC tidak lengkap.')
    if (!form.nama.trim())    return setErr('Nama atlet diperlukan.')
    if (!form.tarikhLahir)    return setErr('Tarikh lahir diperlukan.')

    setSaving(true)
    try {
      const data = {
        noKP:        noKPClean,
        nama:        form.nama.trim().toUpperCase(),
        jantina:     form.jantina,
        tarikhLahir: form.tarikhLahir,
        noBib:       form.noBib.trim().toUpperCase(),
        kodSekolah,
        isAktif:     form.isAktif,
        updatedAt:   serverTimestamp(),
      }
      if (!isEdit) data.createdAt = serverTimestamp()

      await setDoc(
        doc(db, 'tenants', schoolId, 'atlet', noKPClean),
        data,
        { merge: isEdit }
      )
      onSaved()
      onTutup()
    } catch (ex) {
      setErr('Gagal simpan: ' + ex.message)
    } finally {
      setSaving(false)
    }
  }

  const umur = umurDari(form.tarikhLahir)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={e => e.target === e.currentTarget && onTutup()}>
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">

        <div className="bg-[#003399] px-5 py-4 flex items-center justify-between">
          <p className="text-sm font-bold text-white">{isEdit ? 'Kemaskini Atlet' : 'Tambah Atlet Baru'}</p>
          <button onClick={onTutup} className="text-white/50 hover:text-white">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSimpan} className="p-5 space-y-3">
          {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">No. IC</label>
            <input type="text" value={form.noKP}
              onChange={e => handleNoKP(e.target.value)}
              disabled={isEdit}
              placeholder="000000-00-0000"
              inputMode="numeric"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50 font-mono disabled:bg-gray-100 disabled:text-gray-400" />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Nama Penuh</label>
            <input type="text" value={form.nama}
              onChange={e => set('nama', e.target.value)}
              placeholder="NAMA PENUH ATLET"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50 uppercase" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Jantina</label>
              <select value={form.jantina} onChange={e => set('jantina', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50">
                <option value="L">Lelaki</option>
                <option value="P">Perempuan</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                Tarikh Lahir {umur !== null && <span className="text-[#003399] font-bold normal-case">({umur} thn)</span>}
              </label>
              <input type="date" value={form.tarikhLahir}
                onChange={e => set('tarikhLahir', e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50" />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">No. BIB (pilihan)</label>
            <input type="text" value={form.noBib}
              onChange={e => set('noBib', e.target.value.toUpperCase())}
              placeholder="cth: A001"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50 font-mono" />
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="isAktif" checked={form.isAktif}
              onChange={e => set('isAktif', e.target.checked)}
              className="w-4 h-4 rounded accent-[#003399]" />
            <label htmlFor="isAktif" className="text-xs text-gray-600 font-semibold">Atlet aktif</label>
          </div>

          <button type="submit" disabled={saving}
            className="w-full bg-[#003399] hover:bg-[#002277] disabled:bg-gray-300 text-white font-bold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
            {saving
              ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Menyimpan…</>
              : isEdit ? 'Kemaskini' : 'Tambah Atlet'
            }
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Baris Atlet ──────────────────────────────────────────────────────────────

function BariAtlet({ atlet, onEdit }) {
  const umur = umurDari(atlet.tarikhLahir)
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-black ${
        atlet.jantina === 'L' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'
      }`}>
        {atlet.jantina === 'L' ? 'L' : 'P'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-800 truncate">{atlet.nama || '—'}</p>
        <p className="text-[11px] text-gray-400">
          {atlet.noBib ? <span className="font-mono mr-2">{atlet.noBib}</span> : null}
          {umur !== null ? `${umur} thn` : ''}
          {atlet.kategoriKod ? ` · ${atlet.kategoriKod}` : ''}
          {!atlet.isAktif ? ' · Tidak Aktif' : ''}
        </p>
      </div>
      <button onClick={() => onEdit(atlet)}
        className="shrink-0 text-gray-300 hover:text-[#003399] transition-colors p-1.5 rounded-lg hover:bg-[#003399]/5">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </button>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function PengurusDashboard() {
  const { userData, logout } = useAuth()
  const navigate = useNavigate()

  const schoolId   = userData?.schoolId   || ''
  const kodSekolah = userData?.kodSekolah || ''
  const namaSekolah = userData?.namaSekolah || kodSekolah

  const [atlet,     setAtlet]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [modal,     setModal]     = useState(false)
  const [editAtlet, setEditAtlet] = useState(null)
  const [carian,    setCarian]    = useState('')

  useEffect(() => {
    if (!schoolId || !kodSekolah) { setLoading(false); return }

    const unsub = onSnapshot(
      query(
        collection(db, 'tenants', schoolId, 'atlet'),
        where('kodSekolah', '==', kodSekolah)
      ),
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        list.sort((a, b) => (a.nama || '').localeCompare(b.nama || ''))
        setAtlet(list)
        setLoading(false)
      },
      () => setLoading(false)
    )
    return () => unsub()
  }, [schoolId, kodSekolah])

  function handleEdit(a) { setEditAtlet(a); setModal(true) }
  function handleTambah() { setEditAtlet(null); setModal(true) }

  async function handleLogout() { await logout(); navigate('/pengurus/login') }

  const carianBersih = carian.trim().toLowerCase()
  const atletTapis = atlet.filter(a =>
    !carianBersih ||
    (a.nama || '').toLowerCase().includes(carianBersih) ||
    (a.noBib || '').toLowerCase().includes(carianBersih) ||
    (a.noKP  || '').includes(carianBersih)
  )

  const lelaki   = atlet.filter(a => a.jantina === 'L' && a.isAktif !== false).length
  const perempuan = atlet.filter(a => a.jantina === 'P' && a.isAktif !== false).length

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* Header */}
      <header className="bg-[#003399] text-white px-4 py-3.5 flex items-center justify-between shadow-lg shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-[#003399]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <p className="text-[9px] text-white/50 uppercase tracking-widest">Pengurus Pasukan</p>
            <p className="text-sm font-bold leading-tight truncate max-w-[180px]">{namaSekolah}</p>
          </div>
        </div>
        <button onClick={handleLogout}
          className="flex items-center gap-1.5 text-white/60 hover:text-white text-xs transition-colors px-2 py-1.5 rounded-lg hover:bg-white/10">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Log Keluar
        </button>
      </header>

      <div className="max-w-lg mx-auto w-full px-4 py-5 space-y-4">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-gray-100 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-[#003399]">{atlet.filter(a => a.isAktif !== false).length}</p>
            <p className="text-[10px] text-gray-400 font-semibold mt-0.5">Jumlah Aktif</p>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-blue-700">{lelaki}</p>
            <p className="text-[10px] text-blue-500 font-semibold mt-0.5">Lelaki</p>
          </div>
          <div className="bg-pink-50 border border-pink-100 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-pink-700">{perempuan}</p>
            <p className="text-[10px] text-pink-500 font-semibold mt-0.5">Perempuan</p>
          </div>
        </div>

        {/* Carian + Tambah */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" value={carian} onChange={e => setCarian(e.target.value)}
              placeholder="Cari nama, BIB, IC…"
              className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-white" />
          </div>
          <button onClick={handleTambah}
            className="flex items-center gap-1.5 bg-[#003399] hover:bg-[#002277] text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-colors shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Tambah
          </button>
        </div>

        {/* Senarai Atlet */}
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <span className="text-sm">Memuatkan atlet…</span>
            </div>
          ) : atletTapis.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-4xl mb-2">🏃</p>
              <p className="text-sm font-bold text-gray-600 mb-1">
                {carian ? 'Tiada atlet ditemui' : 'Belum ada atlet'}
              </p>
              <p className="text-xs text-gray-400">
                {carian ? 'Cuba carian lain.' : 'Klik "Tambah" untuk daftar atlet pertama.'}
              </p>
            </div>
          ) : (
            <>
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  {atletTapis.length} atlet {carian ? '(ditapis)' : ''}
                </p>
              </div>
              {atletTapis.map(a => (
                <BariAtlet key={a.id} atlet={a} onEdit={handleEdit} />
              ))}
            </>
          )}
        </div>

        <p className="text-center text-[10px] text-gray-300">
          Nota: Perubahan atlet dipaparkan secara langsung. Hubungi pentadbir jika atlet perlu dipadamkan.
        </p>
      </div>

      {modal && (
        <ModalAtlet
          schoolId={schoolId}
          kodSekolah={kodSekolah}
          atlet={editAtlet}
          onTutup={() => { setModal(false); setEditAtlet(null) }}
          onSaved={() => {}}
        />
      )}
    </div>
  )
}
