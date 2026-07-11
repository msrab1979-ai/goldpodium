import { useState, useEffect } from 'react'
import { collection, getDocs, doc, getDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { createAdminAccount, hantarResetPassword } from '../../firebase/auth'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import TabAkaun from './TabAkaun'
import { setViewPortal, clearViewPortal } from '../../hooks/useSchoolId'

// ── Modal Data & Reset ────────────────────────────────────────────────────────

function ModalDataReset({ sekolah, onTutup, onSelesai }) {
  const [mod,        setMod]        = useState(null) // 'hard' | 'soft'
  const [konfirmasi, setKonfirmasi] = useState('')
  const [sedang,     setSedang]     = useState(false)
  const [ralat,      setRalat]      = useState('')
  const [selesai,    setSelesai]    = useState('')

  const sid = sekolah.id
  const namaSekolah = sekolah.namaSekolah || sid

  async function jalanHardDelete() {
    setSedang(true); setRalat('')
    try {
      const subcols = ['kejohanan', 'atlet', 'sekolah', 'rekod', 'rekod_sejarah',
                       'users', 'login_attempts', 'tetapan', '_private', 'kategori']
      for (const col of subcols) {
        const snap = await getDocs(collection(db, 'tenants', sid, col))
        if (snap.empty) continue
        // Padam subcollection dalam kejohanan juga
        if (col === 'kejohanan') {
          for (const kd of snap.docs) {
            const subKej = ['acara', 'heat', 'pendaftaran', 'jadual', 'kategori', 'tetapan', 'pengesahan', 'medal_tally', 'jadual_khas']
            for (const sk of subKej) {
              const skSnap = await getDocs(collection(db, 'tenants', sid, 'kejohanan', kd.id, sk))
              const b2 = writeBatch(db)
              skSnap.docs.forEach(d => b2.delete(d.ref))
              if (!skSnap.empty) await b2.commit()
            }
          }
        }
        const batch = writeBatch(db)
        snap.docs.forEach(d => batch.delete(d.ref))
        await batch.commit()
      }
      await deleteDoc(doc(db, 'tenants', sid))
      if (sekolah.slug) await deleteDoc(doc(db, 'slugIndex', sekolah.slug)).catch(() => {})
      setSelesai('hard')
      onSelesai(sid, 'hard')
    } catch (e) {
      setRalat('Ralat: ' + e.message)
    } finally {
      setSedang(false)
    }
  }

  async function jalanSoftReset() {
    setSedang(true); setRalat('')
    try {
      // Padam atlet
      const atletSnap = await getDocs(collection(db, 'tenants', sid, 'atlet'))
      if (!atletSnap.empty) {
        const b = writeBatch(db)
        atletSnap.docs.forEach(d => b.delete(d.ref))
        await b.commit()
      }

      // Padam pendaftaran + heat dalam setiap kejohanan
      const kejSnap = await getDocs(collection(db, 'tenants', sid, 'kejohanan'))
      for (const kd of kejSnap.docs) {
        for (const subCol of ['pendaftaran', 'heat']) {
          const subSnap = await getDocs(collection(db, 'tenants', sid, 'kejohanan', kd.id, subCol))
          if (subSnap.empty) continue
          const b = writeBatch(db)
          subSnap.docs.forEach(d => b.delete(d.ref))
          await b.commit()
        }
        // Reset status kejohanan ke persediaan supaya boleh guna semula
        await updateDoc(doc(db, 'tenants', sid, 'kejohanan', kd.id), {
          statusKejohanan: 'persediaan',
          isAktif: false,
          updatedAt: serverTimestamp(),
        }).catch(() => {})
      }

      setSelesai('soft')
      onSelesai(sid, 'soft')
    } catch (e) {
      setRalat('Ralat: ' + e.message)
    } finally {
      setSedang(false)
    }
  }

  function handleTeruskan() {
    if (konfirmasi !== namaSekolah) return
    if (mod === 'hard') jalanHardDelete()
    else jalanSoftReset()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={e => e.target === e.currentTarget && !sedang && onTutup()}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-red-700 px-5 py-4 flex items-center justify-between">
          <p className="text-sm font-bold text-white">Data & Reset — {namaSekolah}</p>
          <button onClick={onTutup} disabled={sedang} className="text-white/50 hover:text-white">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {selesai ? (
            <div className="text-center py-4 space-y-3">
              <p className="text-3xl">{selesai === 'hard' ? '🗑️' : '♻️'}</p>
              <p className="text-sm font-bold text-gray-800">
                {selesai === 'hard' ? 'Hard Delete berjaya.' : 'Soft Reset berjaya.'}
              </p>
              <p className="text-xs text-gray-500">
                {selesai === 'hard'
                  ? 'Semua data tenant telah dipadam. Akaun Firebase Auth masih perlu dipadam manual.'
                  : 'Data murid, pendaftaran dan heat telah dipadam. Acara, kategori dan rekod dikekalkan.'}
              </p>
              <button onClick={onTutup} className="mt-2 px-5 py-2 bg-[#003399] text-white text-xs font-bold rounded-xl">Tutup</button>
            </div>
          ) : !mod ? (
            <>
              <p className="text-xs text-gray-500">Pilih jenis operasi untuk <strong>{namaSekolah}</strong>:</p>
              <div className="space-y-3">
                <button onClick={() => setMod('soft')}
                  className="w-full text-left border-2 border-amber-200 bg-amber-50 rounded-xl px-4 py-3 hover:border-amber-400 transition-colors">
                  <p className="text-sm font-bold text-amber-800">♻️ Soft Reset — Reset Data Murid</p>
                  <p className="text-xs text-amber-700 mt-1">Padam: atlet, pendaftaran, heat/keputusan</p>
                  <p className="text-xs text-green-700 mt-0.5">Simpan: acara, kategori, rekod, tetapan</p>
                </button>
                <button onClick={() => setMod('hard')}
                  className="w-full text-left border-2 border-red-200 bg-red-50 rounded-xl px-4 py-3 hover:border-red-400 transition-colors">
                  <p className="text-sm font-bold text-red-800">🗑️ Hard Delete — Padam Semua Data</p>
                  <p className="text-xs text-red-600 mt-1">Padam SEMUA data tenant. Tidak boleh dibatalkan.</p>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className={`border-2 rounded-xl px-4 py-3 ${mod === 'hard' ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
                <p className={`text-sm font-bold ${mod === 'hard' ? 'text-red-800' : 'text-amber-800'}`}>
                  {mod === 'hard' ? '🗑️ Hard Delete' : '♻️ Soft Reset'}
                </p>
                <p className={`text-xs mt-1 ${mod === 'hard' ? 'text-red-600' : 'text-amber-700'}`}>
                  {mod === 'hard'
                    ? 'SEMUA data akan dipadam secara kekal.'
                    : 'Atlet, pendaftaran dan heat akan dipadam. Acara/kategori/rekod dikekalkan.'}
                </p>
              </div>

              {ralat && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{ralat}</p>}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Taip nama sekolah untuk sahkan: <span className="text-red-600 font-mono">{namaSekolah}</span>
                </label>
                <input type="text" value={konfirmasi}
                  onChange={e => setKonfirmasi(e.target.value)}
                  placeholder={namaSekolah}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400" />
              </div>

              <div className="flex gap-2">
                <button onClick={() => { setMod(null); setKonfirmasi(''); setRalat('') }}
                  disabled={sedang}
                  className="flex-1 py-2.5 border border-gray-300 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50">
                  Kembali
                </button>
                <button onClick={handleTeruskan}
                  disabled={konfirmasi !== namaSekolah || sedang}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-bold text-white transition-colors disabled:opacity-40 ${
                    mod === 'hard' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
                  }`}>
                  {sedang
                    ? <span className="flex items-center justify-center gap-2">
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                        Sedang proses…
                      </span>
                    : mod === 'hard' ? 'Padam Semua' : 'Reset Data Murid'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const WARNA_STATUS = {
  active:    'bg-green-100 text-green-700',
  suspended: 'bg-red-100 text-red-700',
  pending:   'bg-yellow-100 text-yellow-700',
}
const LABEL_STATUS = {
  active:    'Aktif',
  suspended: 'Digantung',
  pending:   'Menunggu',
}
const WARNA_PAKEJ = {
  free:     'bg-gray-100 text-gray-600',
  school:   'bg-blue-100 text-blue-700',
  district: 'bg-purple-100 text-purple-700',
}
const LABEL_PAKEJ = {
  free: 'Percuma', school: 'Sekolah', district: 'Daerah',
}
const PAKEJ_LIST = [
  { id: 'free',     label: 'Percuma'  },
  { id: 'school',   label: 'Sekolah'  },
  { id: 'district', label: 'Daerah'   },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function bakiHari(tarikhExpiry) {
  if (!tarikhExpiry?.toDate) return null
  return Math.ceil((tarikhExpiry.toDate() - new Date()) / (1000 * 60 * 60 * 24))
}

function labelExpiry(baki) {
  if (baki === null) return '—'
  if (baki < 0)  return `Tamat ${Math.abs(baki)} hari lalu`
  if (baki === 0) return 'Tamat hari ini'
  return `${baki} hari lagi`
}

function warnaExpiry(baki) {
  if (baki === null) return 'text-gray-400'
  if (baki < 0)  return 'text-red-600 font-bold'
  if (baki <= 14) return 'text-red-500 font-bold'
  if (baki <= 30) return 'text-amber-600 font-semibold'
  return 'text-gray-500'
}

function inisial(nama) {
  if (!nama) return '?'
  const kata = nama.trim().split(/\s+/).filter(k => !/^(SK|SMK|SR|SM|PPKI|SJK|SJKC|SJKT)$/i.test(k))
  const sumber = kata.length ? kata : nama.trim().split(/\s+/)
  return sumber.slice(0, 2).map(k => k[0]).join('').toUpperCase()
}

function warnaAvatar(nama) {
  const palet = [
    'bg-blue-100 text-blue-700',
    'bg-purple-100 text-purple-700',
    'bg-pink-100 text-pink-700',
    'bg-amber-100 text-amber-700',
    'bg-emerald-100 text-emerald-700',
    'bg-cyan-100 text-cyan-700',
    'bg-indigo-100 text-indigo-700',
    'bg-rose-100 text-rose-700',
  ]
  let hash = 0
  for (let i = 0; i < (nama || '').length; i++) hash = (hash * 31 + nama.charCodeAt(i)) >>> 0
  return palet[hash % palet.length]
}

// ── Kad Statistik ─────────────────────────────────────────────────────────────

function KadStatistik({ label, nilai, sub, warna = 'biru', onClick, aktif }) {
  const cls = {
    biru:   'bg-blue-50 border-blue-200 text-blue-700',
    hijau:  'bg-green-50 border-green-200 text-green-700',
    kuning: 'bg-amber-50 border-amber-200 text-amber-700',
    merah:  'bg-red-50 border-red-200 text-red-700',
  }
  const isClickable = typeof onClick === 'function'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isClickable}
      className={`text-left rounded-xl border p-4 transition-all ${cls[warna]} ${
        isClickable ? 'hover:shadow-md hover:-translate-y-0.5 cursor-pointer' : 'cursor-default'
      } ${aktif ? 'ring-2 ring-offset-1 ring-current' : ''}`}
    >
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="text-2xl font-black mt-1">{nilai}</p>
      {sub && <p className="text-[10px] opacity-60 mt-0.5">{sub}</p>}
    </button>
  )
}

// ── Modal Tambah Sekolah ──────────────────────────────────────────────────────

function ModalTambahSekolah({ onTutup, onSimpan }) {
  const HARI_INI = new Date().toISOString().split('T')[0]
  const EXPIRY_DEFAULT = (() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().split('T')[0] })()
  const [borang, setBorang] = useState({
    namaSekolah: '', daerah: '', emelAdmin: '', namaAdmin: '',
    tarikhMula: HARI_INI, tarikhExpiry: EXPIRY_DEFAULT, slugCustom: '',
  })
  const [muatTurun, setMuatTurun] = useState(false)
  const [ralat,     setRalat]     = useState('')
  const [hasil,     setHasil]     = useState(null)
  const [salin,     setSalin]     = useState('')

  function set(k, v) { setBorang(b => ({ ...b, [k]: v })); setRalat('') }

  async function handleHantar(e) {
    e.preventDefault()
    if (!borang.namaSekolah.trim()) return setRalat('Nama sekolah diperlukan.')
    if (!borang.daerah.trim())      return setRalat('Daerah diperlukan.')
    if (!borang.emelAdmin.trim())   return setRalat('Emel admin diperlukan.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(borang.emelAdmin.trim())) return setRalat('Format emel tidak sah. Contoh: admin@sekolah.edu.my')
    if (!borang.namaAdmin.trim())   return setRalat('Nama admin diperlukan.')
    if (!borang.tarikhExpiry)       return setRalat('Tarikh tamat langganan diperlukan.')

    setMuatTurun(true)
    try {
      const r = await createAdminAccount({ ...borang, slugCustom: borang.slugCustom.trim() || '' })
      setHasil(r)
      onSimpan()
    } catch (err) {
      setRalat(err.message || 'Gagal mencipta akaun. Sila cuba semula.')
    } finally {
      setMuatTurun(false)
    }
  }

  function copyTeks(teks, kunci) {
    navigator.clipboard.writeText(teks)
    setSalin(kunci)
    setTimeout(() => setSalin(''), 2000)
  }


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 overflow-y-auto"
      onClick={e => e.target === e.currentTarget && !hasil && onTutup()}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden my-auto">

        <div className="bg-[#003399] px-5 py-4 flex items-center justify-between">
          <p className="text-sm font-bold text-white">
            {hasil ? '✅ Akaun Berjaya Dicipta' : 'Tambah Sekolah Baharu'}
          </p>
          <button onClick={onTutup} className="text-white/50 hover:text-white">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {hasil ? (
          <div className="p-5 space-y-3">
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-xs text-green-700 font-medium">
              Akaun admin telah dicipta. Kongsikan maklumat berikut kepada pentadbir sekolah.
            </div>
            {/* URL Sekolah — boleh klik */}
            <div className="border border-blue-100 bg-blue-50 rounded-xl p-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">URL Sekolah</p>
              <div className="flex items-center justify-between gap-2">
                <a href={hasil.loginUrl} target="_blank" rel="noopener noreferrer"
                  className="text-sm font-mono text-[#003399] underline break-all hover:text-blue-800">
                  {hasil.loginUrl}
                </a>
                <button onClick={() => copyTeks(hasil.loginUrl, 'url')}
                  className="shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-white border border-blue-200 hover:bg-[#003399] hover:text-white transition-colors">
                  {salin === 'url' ? '✓ Salin' : 'Salin'}
                </button>
              </div>
            </div>

            {/* Tarikh mula & tamat */}
            <div className="grid grid-cols-2 gap-2">
              <div className="border border-gray-100 rounded-xl p-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Tarikh Mula</p>
                <p className="text-sm font-semibold text-gray-700">{hasil.tarikhMula || '—'}</p>
              </div>
              <div className="border border-gray-100 rounded-xl p-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Tarikh Tamat</p>
                <p className="text-sm font-semibold text-gray-700">{hasil.tarikhExpiry}</p>
              </div>
            </div>

            {[
              { label: 'Emel',               nilai: hasil.email,        kunci: 'emel' },
              { label: 'Password Sementara', nilai: hasil.tempPassword, kunci: 'pass' },
            ].map(item => (
              <div key={item.kunci} className="border border-gray-100 rounded-xl p-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{item.label}</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-mono text-gray-800 break-all">{item.nilai}</p>
                  <button onClick={() => copyTeks(item.nilai, item.kunci)}
                    className="shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-[#003399] hover:text-white transition-colors">
                    {salin === item.kunci ? '✓ Salin' : 'Salin'}
                  </button>
                </div>
              </div>
            ))}
            <button onClick={() => copyTeks(
              `🏆 GOLD PODIUM — Maklumat Log Masuk\n\nURL Sekolah: ${hasil.loginUrl}\nEmel: ${hasil.email}\nPassword: ${hasil.tempPassword}\nTarikh Mula: ${hasil.tarikhMula || '—'}\nTarikh Tamat: ${hasil.tarikhExpiry}\n\nSila tukar password selepas log masuk pertama.`,
              'semua'
            )} className="w-full bg-[#003399] hover:bg-[#002277] text-white font-bold py-3 rounded-xl text-sm transition-colors">
              {salin === 'semua' ? '✓ Disalin!' : '📋 Salin Semua Maklumat'}
            </button>
            <button onClick={onTutup} className="w-full text-xs text-gray-400 hover:text-gray-600 py-2 transition-colors">
              Tutup
            </button>
          </div>
        ) : (
          <form onSubmit={handleHantar} className="p-5 space-y-3">
            {ralat && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{ralat}</p>}

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Nama Sekolah</label>
              <input type="text" value={borang.namaSekolah} onChange={e => set('namaSekolah', e.target.value)}
                required autoFocus placeholder="SK / SMK ..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50" />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Daerah</label>
              <input type="text" value={borang.daerah} onChange={e => set('daerah', e.target.value)}
                required placeholder="Kemaman"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Emel Admin</label>
                <input type="email" value={borang.emelAdmin} onChange={e => set('emelAdmin', e.target.value)}
                  required placeholder="admin@sekolah.edu.my"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Nama Admin</label>
                <input type="text" value={borang.namaAdmin} onChange={e => set('namaAdmin', e.target.value)}
                  required placeholder="En. Ahmad"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50" />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                URL Sekolah (Slug)
                <span className="ml-1 text-gray-300 normal-case font-normal">— goldpodium.web.app/<span className="font-mono text-blue-400">{borang.slugCustom || '...'}</span></span>
              </label>
              <input type="text" value={borang.slugCustom} onChange={e => set('slugCustom', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="cth: sk-astana (auto-jana jika kosong)"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50" />
              <p className="text-[10px] text-gray-400 mt-1">Hanya huruf kecil, angka, dan sempang (-). Biarkan kosong untuk jana secara automatik.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Tarikh Mula</label>
                <input type="date" value={borang.tarikhMula} onChange={e => set('tarikhMula', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Tarikh Tamat</label>
                <input type="date" value={borang.tarikhExpiry} onChange={e => set('tarikhExpiry', e.target.value)}
                  min={borang.tarikhMula || HARI_INI}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50" />
              </div>
            </div>

            <button type="submit" disabled={muatTurun}
              className="w-full bg-[#003399] hover:bg-[#002277] disabled:bg-gray-300 text-white font-bold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
              {muatTurun
                ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Mencipta akaun…</>
                : '+ Cipta Akaun & Tambah Sekolah'
              }
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Modal Perbaharui Langganan ─────────────────────────────────────────────────

function ModalPerbaharui({ sekolah, onTutup, onBerjaya }) {
  const expiryLama = sekolah.tarikhExpiry?.toDate
    ? sekolah.tarikhExpiry.toDate().toLocaleDateString('ms-MY')
    : '—'

  // Default: perbaharui dari hari ini atau dari expiry lama (yang mana lebih jauh)
  const baseDate = sekolah.tarikhExpiry?.toDate
    ? (sekolah.tarikhExpiry.toDate() > new Date() ? sekolah.tarikhExpiry.toDate() : new Date())
    : new Date()
  const defaultMula = baseDate.toISOString().split('T')[0]

  const [tarikhMula, setTarikhMula] = useState(defaultMula)
  const [pakej,      setPakej]      = useState(sekolah.pakej || 'school')
  const [muatTurun,  setMuatTurun]  = useState(false)
  const [ralat,      setRalat]      = useState('')

  const tarikhExpiry = (() => {
    const d = new Date(tarikhMula)
    d.setFullYear(d.getFullYear() + 1)
    return d.toLocaleDateString('ms-MY')
  })()

  async function handleHantar(e) {
    e.preventDefault()
    setMuatTurun(true)
    setRalat('')
    try {
      const mula   = new Date(tarikhMula)
      const expiry = new Date(mula)
      expiry.setFullYear(expiry.getFullYear() + 1)

      await updateDoc(doc(db, 'tenants', sekolah.id), {
        pakej,
        tarikhMula:   Timestamp.fromDate(mula),
        tarikhExpiry: Timestamp.fromDate(expiry),
        status:       'active',
        diperbaharuiPada: serverTimestamp(),
      })
      onBerjaya(sekolah.id, { pakej, tarikhExpiry: Timestamp.fromDate(expiry), status: 'active' })
      onTutup()
    } catch {
      setRalat('Gagal perbaharui langganan. Sila cuba semula.')
    } finally {
      setMuatTurun(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={e => e.target === e.currentTarget && onTutup()}>
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">

        <div className="bg-[#003399] px-5 py-4 flex items-center justify-between">
          <p className="text-sm font-bold text-white">Perbaharui Langganan</p>
          <button onClick={onTutup} className="text-white/50 hover:text-white">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleHantar} className="p-5 space-y-4">
          {/* Info sekolah */}
          <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
            <p className="text-xs font-bold text-gray-800">{sekolah.namaSekolah}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Expiry semasa: {expiryLama}</p>
          </div>

          {ralat && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{ralat}</p>}

          {/* Pakej */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Pakej Baharu</label>
            <div className="flex gap-2">
              {PAKEJ_LIST.map(p => (
                <button key={p.id} type="button" onClick={() => setPakej(p.id)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all ${
                    pakej === p.id
                      ? 'border-[#003399] bg-[#003399] text-white'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tarikh mula baru */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Mula Dari</label>
              <input type="date" value={tarikhMula} onChange={e => setTarikhMula(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Expiry Baru</label>
              <div className="w-full border border-green-200 rounded-xl px-3 py-2.5 text-sm bg-green-50 text-green-700 font-semibold">
                {tarikhExpiry}
              </div>
            </div>
          </div>

          <button type="submit" disabled={muatTurun}
            className="w-full bg-[#003399] hover:bg-[#002277] disabled:bg-gray-300 text-white font-bold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
            {muatTurun
              ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Menyimpan…</>
              : '✓ Perbaharui Langganan (+1 Tahun)'
            }
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Panel Utama ───────────────────────────────────────────────────────────────

export default function SuperadminPanel() {
  const { userData, logout } = useAuth()
  const navigate = useNavigate()

  function masukSebagaiAdmin(s) {
    clearViewPortal()
    sessionStorage.setItem('gp_view_school', JSON.stringify({
      schoolId: s.schoolId || s.id,
      namaSekolah: s.namaSekolah,
    }))
    navigate('/admin')
  }

  // Masuk portal pencatat/PP sebagai superadmin — konteks disimpan dalam gp_view_portal
  function masukSebagaiPortal(s, jenis) {
    if (!s.slug) { alert('Sekolah ini tiada slug — tidak boleh buka portal.') ; return }
    setViewPortal({
      schoolId: s.schoolId || s.id,
      schoolSlug: s.slug,
      namaSekolah: s.namaSekolah,
      name: 'Superadmin',
    })
    navigate(`/${s.slug}/${jenis === 'pengurus' ? 'pengurus/dashboard' : 'pencatat/dashboard'}`)
  }

  const [sekolah,            setSekolah]            = useState([])
  const [logKeselamatan,     setLogKeselamatan]      = useState(null)
  const [muatTurun,          setMuatTurun]           = useState(true)
  const [tabAktif,           setTabAktif]            = useState('sekolah')
  const [modalTambah,        setModalTambah]         = useState(false)
  const [modalPerbaharui,    setModalPerbaharui]     = useState(null)
  const [modalDataReset,     setModalDataReset]      = useState(null)
  const [muatTurunTindakan,  setMuatTurunTindakan]   = useState(null)
  const [carian,             setCarian]              = useState('')
  const [tapis,              setTapis]               = useState('semua') // semua | active | suspended | expiring
  const [susun,              setSusun]               = useState('nama')  // nama | expiry | status
  const [menuTerbuka,        setMenuTerbuka]         = useState(null)    // { id, top, right } — dropdown fixed position

  useEffect(() => {
    if (!menuTerbuka) return
    const tutup = () => setMenuTerbuka(null)
    window.addEventListener('click', tutup)
    window.addEventListener('scroll', tutup, true)
    window.addEventListener('resize', tutup)
    return () => {
      window.removeEventListener('click', tutup)
      window.removeEventListener('scroll', tutup, true)
      window.removeEventListener('resize', tutup)
    }
  }, [menuTerbuka])

  async function muatSekolah() {
    setMuatTurun(true)
    try {
      const snap = await getDocs(collection(db, 'tenants'))
      setSekolah(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch { /* langkau */ }
    setMuatTurun(false)
  }

  useEffect(() => {
    if (!userData || userData.role !== 'superadmin') {
      navigate('/login', { replace: true })
      return
    }
    muatSekolah()
    const batal = onSnapshot(
      doc(db, 'security', 'logs'),
      snap => { if (snap.exists()) setLogKeselamatan(snap.data()) },
      () => {}
    )
    return () => batal()
  }, [userData]) // eslint-disable-line

  async function resetPwAdmin(s) {
    try {
      const privSnap = await getDoc(doc(db, 'tenants', s.id, '_private', 'admin'))
      const emel = privSnap.exists() ? privSnap.data().emelAdmin : null
      if (!emel) return alert('Emel admin tidak dijumpai dalam sistem.')
      if (!confirm(`Hantar emel reset password ke ${emel}?`)) return
      await hantarResetPassword(emel)
      alert(`✅ Emel reset password dihantar ke ${emel}`)
    } catch { alert('Gagal hantar emel. Sila cuba semula.') }
  }

  async function tangguhSekolah(s) {
    if (!confirm(`Tangguhkan ${s.namaSekolah}?\n\nAdmin/PP/pencatat tidak boleh log masuk & halaman public akan disembunyikan.`)) return
    setMuatTurunTindakan(s.id)
    try {
      await updateDoc(doc(db, 'tenants', s.id), { status: 'suspended', dikemaskinPada: serverTimestamp() })
      // Sync ke slugIndex supaya SchoolLanding public juga block
      if (s.slug) {
        await updateDoc(doc(db, 'slugIndex', s.slug), { aktif: false }).catch(() => {})
      }
      setSekolah(list => list.map(x => x.id === s.id ? { ...x, status: 'suspended' } : x))
    } catch { alert('Gagal. Sila cuba semula.') }
    setMuatTurunTindakan(null)
  }

  async function aktifkanSekolah(s) {
    setMuatTurunTindakan(s.id)
    try {
      await updateDoc(doc(db, 'tenants', s.id), { status: 'active', dikemaskinPada: serverTimestamp() })
      if (s.slug) {
        await updateDoc(doc(db, 'slugIndex', s.slug), { aktif: true }).catch(() => {})
      }
      setSekolah(list => list.map(x => x.id === s.id ? { ...x, status: 'active' } : x))
    } catch { alert('Gagal. Sila cuba semula.') }
    setMuatTurunTindakan(null)
  }

  async function padamSekolah(s) {
    if (!confirm(`PADAM "${s.namaSekolah}"?\n\nTindakan ini TIDAK BOLEH dibatalkan. Semua data sekolah akan hilang.`)) return
    if (!confirm(`Sahkan sekali lagi — padam "${s.namaSekolah}" secara kekal?`)) return
    setMuatTurunTindakan(s.id)
    try {
      const sid = s.id

      // Ambil emel admin sebelum padam _private
      let emelAdmin = ''
      try {
        const privSnap = await getDoc(doc(db, 'tenants', sid, '_private', 'admin'))
        if (privSnap.exists()) emelAdmin = privSnap.data().emelAdmin || ''
      } catch { /* bukan kritikal */ }

      // Padam subcollection utama (Firestore tidak auto-delete subcollection)
      const subcols = ['kejohanan', 'atlet', 'sekolah', 'rekod', 'rekod_sejarah', 'users', 'login_attempts', 'tetapan', '_private', 'kategori']
      for (const col of subcols) {
        try {
          const snap = await getDocs(collection(db, 'tenants', sid, col))
          if (col === 'kejohanan') {
            for (const kd of snap.docs) {
              const subKej = ['acara', 'heat', 'pendaftaran', 'jadual', 'kategori', 'tetapan', 'pengesahan', 'medal_tally', 'jadual_khas']
              for (const sk of subKej) {
                try {
                  const skSnap = await getDocs(collection(db, 'tenants', sid, 'kejohanan', kd.id, sk))
                  if (!skSnap.empty) {
                    const b2 = writeBatch(db)
                    skSnap.docs.forEach(d => b2.delete(d.ref))
                    await b2.commit()
                  }
                } catch (skErr) { console.warn(`Skip kejohanan/${kd.id}/${sk}:`, skErr?.message) }
              }
            }
          }
          const batch = writeBatch(db)
          snap.docs.forEach(d => batch.delete(d.ref))
          if (snap.docs.length > 0) await batch.commit()
        } catch (colErr) { console.warn(`Skip subcol ${col}:`, colErr?.message) }
      }
      await deleteDoc(doc(db, 'tenants', sid))
      if (s.slug) await deleteDoc(doc(db, 'slugIndex', s.slug)).catch(() => {})
      setSekolah(list => list.filter(x => x.id !== sid))

      // Papar arahan padam Firebase Auth
      if (emelAdmin) {
        alert(`✅ Data Firestore "${s.namaSekolah}" berjaya dipadam.\n\n⚠️ LANGKAH TAMBAHAN:\nAkaun Firebase Auth masih wujud.\nSila padam akaun ini dari Firebase Console:\n\n📧 ${emelAdmin}\n\n(Console → Authentication → cari emel → padam)`)
      }
    } catch (err) { console.error('padamSekolah error:', err); alert('Gagal padam: ' + (err?.message || err)) }
    setMuatTurunTindakan(null)
  }

  function handlePerbaharuiBerjaya(id, kemaskini) {
    setSekolah(list => list.map(x => x.id === id ? { ...x, ...kemaskini } : x))
  }

  function handleDataResetSelesai(id, jenis) {
    if (jenis === 'hard') {
      setSekolah(list => list.filter(x => x.id !== id))
    }
    setModalDataReset(null)
  }

  const jumlahSekolah  = sekolah.length
  const sekolahAktif   = sekolah.filter(s => s.status === 'active').length
  const sekolahTangguh = sekolah.filter(s => s.status === 'suspended').length

  // Filter + sort untuk tab Senarai Sekolah
  const carianLower = carian.trim().toLowerCase()
  const sekolahDipapar = sekolah
    .filter(s => {
      if (tapis === 'active'     && s.status !== 'active')    return false
      if (tapis === 'suspended'  && s.status !== 'suspended') return false
      if (tapis === 'expiring') {
        const b = bakiHari(s.tarikhExpiry)
        if (b === null || b > 30) return false
      }
      if (!carianLower) return true
      const kata = `${s.namaSekolah || ''} ${s.daerah || ''} ${s.slug || ''} ${s.namaAdmin || ''}`.toLowerCase()
      return kata.includes(carianLower)
    })
    .sort((a, b) => {
      if (susun === 'expiry') {
        return (bakiHari(a.tarikhExpiry) ?? 9999) - (bakiHari(b.tarikhExpiry) ?? 9999)
      }
      if (susun === 'status') {
        return (a.status || '').localeCompare(b.status || '')
      }
      return (a.namaSekolah || '').localeCompare(b.namaSekolah || '')
    })

  // Expiry dalam 30 hari ATAU dah tamat
  const perluTindakan = sekolah.filter(s => {
    const baki = bakiHari(s.tarikhExpiry)
    return baki !== null && baki <= 30
  })

  // Untuk tab Langganan — susun ikut expiry (paling hampir dulu)
  const senaraiLangganan = [...sekolah].sort((a, b) => {
    const bA = bakiHari(a.tarikhExpiry) ?? 9999
    const bB = bakiHari(b.tarikhExpiry) ?? 9999
    return bA - bB
  })

  const TAB = [
    { id: 'sekolah',     label: 'Senarai Sekolah' },
    { id: 'langganan',   label: `Langganan${perluTindakan.length > 0 ? ` (${perluTindakan.length})` : ''}` },
    { id: 'akaun',       label: 'Akaun' },
    { id: 'keselamatan', label: 'Log Keselamatan' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Pengepala */}
      <header className="bg-[#003399] text-white px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-[#003399]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </div>
          <div>
            <p className="text-[9px] text-white/50 uppercase tracking-widest">Gold Podium</p>
            <p className="text-sm font-bold leading-tight">Panel Superadmin</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:block text-right">
            <p className="text-xs font-semibold">{userData?.name || userData?.email}</p>
            <span className="text-[9px] bg-yellow-400 text-yellow-900 font-bold px-1.5 py-0.5 rounded">SUPERADMIN</span>
          </div>
          <button onClick={async () => { await logout(); navigate('/login') }}
            className="text-white/60 hover:text-white transition-colors p-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Kad Statistik — clickable untuk tapis */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KadStatistik label="Jumlah Sekolah" nilai={jumlahSekolah} warna="biru"
            aktif={tabAktif === 'sekolah' && tapis === 'semua'}
            onClick={() => { setTabAktif('sekolah'); setTapis('semua') }} />
          <KadStatistik label="Aktif" nilai={sekolahAktif} warna="hijau"
            aktif={tabAktif === 'sekolah' && tapis === 'active'}
            onClick={() => { setTabAktif('sekolah'); setTapis('active') }} />
          <KadStatistik label="Digantung" nilai={sekolahTangguh} warna="merah"
            aktif={tabAktif === 'sekolah' && tapis === 'suspended'}
            onClick={() => { setTabAktif('sekolah'); setTapis('suspended') }} />
          <KadStatistik label="Perlu Tindakan" nilai={perluTindakan.length} warna="kuning" sub="expiry ≤30 hari / tamat"
            aktif={tabAktif === 'sekolah' && tapis === 'expiring'}
            onClick={() => { setTabAktif('sekolah'); setTapis('expiring') }} />
        </div>

        {/* Banner amaran jika ada yang tamat */}
        {perluTindakan.filter(s => (bakiHari(s.tarikhExpiry) ?? 1) < 0).length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="text-sm font-bold text-red-700">
                {perluTindakan.filter(s => (bakiHari(s.tarikhExpiry) ?? 1) < 0).length} sekolah telah tamat langganan
              </p>
              <p className="text-xs text-red-500 mt-0.5">
                Pergi ke tab <strong>Langganan</strong> untuk perbaharui atau tangguh akaun.
              </p>
            </div>
            <button onClick={() => setTabAktif('langganan')}
              className="ml-auto shrink-0 text-xs font-bold text-red-600 hover:text-red-800 underline">
              Lihat →
            </button>
          </div>
        )}

        {/* Tab */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex border-b border-gray-200 overflow-x-auto items-end">
            {TAB.map(t => (
              <button key={t.id} onClick={() => setTabAktif(t.id)}
                className={`shrink-0 px-6 py-4 text-sm font-bold transition-colors relative ${
                  tabAktif === t.id
                    ? 'text-[#003399]'
                    : t.id === 'langganan' && perluTindakan.length > 0
                      ? 'text-amber-600 hover:text-amber-700'
                      : 'text-gray-400 hover:text-gray-600'
                }`}>
                {t.label}
                {tabAktif === t.id && (
                  <span className="absolute bottom-0 left-4 right-4 h-0.5 bg-[#003399] rounded-t" />
                )}
              </button>
            ))}
            <div className="flex-1" />
            {tabAktif === 'sekolah' && (
              <button onClick={() => setModalTambah(true)}
                className="m-2 px-3 py-2 bg-[#003399] hover:bg-[#002277] text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Tambah Sekolah
              </button>
            )}
          </div>

          {/* Toolbar: Cari + Tapis + Susun (khusus tab Sekolah) */}
          {tabAktif === 'sekolah' && sekolah.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/50">
              {/* Search */}
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input type="text" value={carian} onChange={e => setCarian(e.target.value)}
                  placeholder="Cari nama sekolah, daerah, atau slug…"
                  className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399]" />
                {carian && (
                  <button onClick={() => setCarian('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">✕</button>
                )}
              </div>

              {/* Filter chip */}
              <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
                {[
                  { id: 'semua',     label: 'Semua',      warna: 'gray'  },
                  { id: 'active',    label: 'Aktif',      warna: 'green' },
                  { id: 'suspended', label: 'Digantung',  warna: 'red'   },
                  { id: 'expiring',  label: 'Expiry ≤30', warna: 'amber' },
                ].map(f => (
                  <button key={f.id} onClick={() => setTapis(f.id)}
                    className={`text-[10px] font-bold px-2.5 py-1.5 rounded-md transition-colors ${
                      tapis === f.id
                        ? 'bg-[#003399] text-white shadow-sm'
                        : 'text-gray-500 hover:bg-gray-100'
                    }`}>
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Sort */}
              <select value={susun} onChange={e => setSusun(e.target.value)}
                className="text-[10px] font-bold px-2.5 py-2 border border-gray-200 rounded-lg bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#003399]/20">
                <option value="nama">Susun: Nama</option>
                <option value="expiry">Susun: Expiry</option>
                <option value="status">Susun: Status</option>
              </select>

              <div className="text-[10px] text-gray-400 ml-auto">
                {sekolahDipapar.length} / {sekolah.length} sekolah
              </div>
            </div>
          )}

          {/* ── Tab: Senarai Sekolah ────────────────────────────────────────── */}
          {tabAktif === 'sekolah' && (
            <div className="overflow-visible">
              {muatTurun ? (
                <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  <span className="text-sm">Memuatkan senarai sekolah…</span>
                </div>
              ) : sekolah.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-gray-400 text-sm">Tiada sekolah berdaftar lagi.</p>
                  <button onClick={() => setModalTambah(true)}
                    className="mt-3 text-xs text-[#003399] hover:underline font-semibold">
                    + Tambah sekolah pertama
                  </button>
                </div>
              ) : sekolahDipapar.length === 0 ? (
                <div className="text-center py-16">
                  <div className="text-4xl mb-2 opacity-40">🔍</div>
                  <p className="text-gray-500 text-sm font-semibold">Tiada sekolah padan dengan tapisan</p>
                  <p className="text-xs text-gray-400 mt-1">Cuba kata kunci lain atau tukar penapis.</p>
                  <button onClick={() => { setCarian(''); setTapis('semua') }}
                    className="mt-3 text-xs text-[#003399] hover:underline font-semibold">
                    Reset penapis
                  </button>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 z-10">
                    <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                      <th className="px-4 py-3 text-left">Sekolah</th>
                      <th className="px-3 py-3 text-left hidden sm:table-cell">Daerah</th>
                      <th className="px-3 py-3 text-left hidden md:table-cell">URL</th>
                      <th className="px-3 py-3 text-center hidden lg:table-cell">Expiry</th>
                      <th className="px-3 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sekolahDipapar.map(s => {
                      const baki = bakiHari(s.tarikhExpiry)
                      const menuBuka = menuTerbuka?.id === s.id
                      return (
                        <tr key={s.id} className={`border-b border-gray-50 hover:bg-blue-50/30 transition-colors ${baki !== null && baki < 0 ? 'bg-red-50/20' : ''}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-black shrink-0 ${warnaAvatar(s.namaSekolah)}`}>
                                {inisial(s.namaSekolah)}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-gray-800 text-xs truncate">{s.namaSekolah || '—'}</p>
                                <p className="text-[10px] text-gray-400 truncate">{s.namaAdmin || '—'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-xs text-gray-500 hidden sm:table-cell">{s.daerah || '—'}</td>
                          <td className="px-3 py-3 hidden md:table-cell">
                            {s.slug ? (
                              <a href={`https://goldpodium.web.app/${s.slug}`} target="_blank" rel="noopener noreferrer"
                                className="text-[10px] font-mono text-[#003399] hover:underline">
                                goldpodium.web.app/{s.slug}
                              </a>
                            ) : <span className="text-[10px] text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-3 text-center hidden lg:table-cell">
                            <p className={`text-[10px] ${warnaExpiry(baki)}`}>
                              {s.tarikhExpiry?.toDate ? s.tarikhExpiry.toDate().toLocaleDateString('ms-MY') : '—'}
                            </p>
                            {baki !== null && baki <= 30 && (
                              <p className={`text-[9px] mt-0.5 ${warnaExpiry(baki)}`}>{labelExpiry(baki)}</p>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full ${WARNA_STATUS[s.status] || 'bg-gray-100 text-gray-500'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                s.status === 'active'    ? 'bg-green-500' :
                                s.status === 'suspended' ? 'bg-red-500'   :
                                'bg-yellow-500'
                              }`} />
                              {LABEL_STATUS[s.status] || 'Menunggu'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right relative">
                            {muatTurunTindakan === s.id ? (
                              <svg className="w-4 h-4 animate-spin text-gray-400 ml-auto" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                              </svg>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => masukSebagaiAdmin(s)}
                                  className="text-[10px] font-bold text-[#003399] hover:text-white hover:bg-[#003399] px-2.5 py-1.5 rounded-md border border-[#003399]/30 hover:border-[#003399] transition-colors">
                                  Masuk
                                </button>
                                <button
                                  onClick={e => {
                                    e.stopPropagation()
                                    if (menuBuka) { setMenuTerbuka(null); return }
                                    const r = e.currentTarget.getBoundingClientRect()
                                    setMenuTerbuka({ id: s.id, top: r.bottom + 4, right: window.innerWidth - r.right })
                                  }}
                                  title="Tindakan lain"
                                  className={`p-1.5 rounded-md transition-colors ${
                                    menuBuka ? 'bg-gray-200 text-gray-800' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
                                  }`}
                                >
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <circle cx="5"  cy="12" r="1.6" />
                                    <circle cx="12" cy="12" r="1.6" />
                                    <circle cx="19" cy="12" r="1.6" />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Tab: Langganan ──────────────────────────────────────────────── */}
          {tabAktif === 'langganan' && (
            <div className="p-5">
              {muatTurun ? (
                <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                </div>
              ) : senaraiLangganan.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-12">Tiada sekolah berdaftar.</p>
              ) : (
                <div className="space-y-3">
                  {senaraiLangganan.map(s => {
                    const baki = bakiHari(s.tarikhExpiry)
                    const tamat = baki !== null && baki < 0
                    const hampir = baki !== null && baki >= 0 && baki <= 30

                    return (
                      <div key={s.id} className={`border-2 rounded-2xl p-4 flex items-center gap-4 ${
                        tamat   ? 'border-red-200 bg-red-50/40'
                        : hampir ? 'border-amber-200 bg-amber-50/30'
                        : 'border-gray-100 bg-white'
                      }`}>
                        {/* Ikon status */}
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${
                          tamat ? 'bg-red-100' : hampir ? 'bg-amber-100' : 'bg-green-100'
                        }`}>
                          {tamat ? '🔴' : hampir ? '🟡' : '🟢'}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-800 truncate">{s.namaSekolah}</p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${WARNA_PAKEJ[s.pakej] || 'bg-gray-100 text-gray-500'}`}>
                              {LABEL_PAKEJ[s.pakej] || '—'}
                            </span>
                            <span className={`text-xs ${warnaExpiry(baki)}`}>
                              {labelExpiry(baki)}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {s.tarikhExpiry?.toDate ? s.tarikhExpiry.toDate().toLocaleDateString('ms-MY') : '—'}
                            </span>
                          </div>
                        </div>

                        {/* Tindakan */}
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <button onClick={() => setModalPerbaharui(s)}
                            className="text-[10px] font-bold px-3 py-1.5 bg-[#003399] hover:bg-[#002277] text-white rounded-lg transition-colors">
                            Perbaharui
                          </button>
                          {s.status === 'active' ? (
                            <button onClick={() => tangguhSekolah(s)}
                              className="text-[10px] font-bold text-red-500 hover:text-red-700 px-3 py-1 transition-colors">
                              Tangguh
                            </button>
                          ) : (
                            <button onClick={() => aktifkanSekolah(s)}
                              className="text-[10px] font-bold text-green-600 hover:text-green-800 px-3 py-1 transition-colors">
                              Aktifkan
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Akaun ───────────────────────────────────────────────────── */}
          {tabAktif === 'akaun' && (
            <TabAkaun sekolahList={sekolah} />
          )}

          {/* ── Tab: Log Keselamatan ─────────────────────────────────────────── */}
          {tabAktif === 'keselamatan' && (
            <div className="p-6">
              {!logKeselamatan ? (
                <p className="text-sm text-gray-400 text-center py-8">Tiada rekod keselamatan.</p>
              ) : (
                <div className="space-y-4">
                  {logKeselamatan.failedLogins && Object.keys(logKeselamatan.failedLogins).length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-3">
                        Log Masuk Gagal (5+ percubaan)
                      </p>
                      <div className="space-y-2">
                        {Object.entries(logKeselamatan.failedLogins).map(([emel, info]) => (
                          <div key={emel} className="flex items-center justify-between bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
                            <div>
                              <p className="text-xs font-semibold text-gray-800">{emel}</p>
                              <p className="text-[10px] text-gray-400">{info.count} percubaan</p>
                            </div>
                            <span className="text-[9px] font-bold bg-red-200 text-red-700 px-2 py-0.5 rounded-full">AMARAN</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {logKeselamatan.adminActions && Object.keys(logKeselamatan.adminActions).length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-3">Log Tindakan Pentadbir</p>
                      <div className="space-y-2">
                        {Object.entries(logKeselamatan.adminActions).slice(0, 20).map(([kunci, info]) => (
                          <div key={kunci} className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5">
                            <p className="text-xs text-gray-700">{info.tindakan}</p>
                            <p className="text-[10px] text-gray-400">{info.idSekolah || ''}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(!logKeselamatan.failedLogins || Object.keys(logKeselamatan.failedLogins).length === 0) &&
                   (!logKeselamatan.adminActions || Object.keys(logKeselamatan.adminActions).length === 0) && (
                    <p className="text-sm text-gray-400 text-center py-8">Tiada rekod keselamatan untuk ditunjukkan.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Dropdown menu ⋯ — fixed position supaya tak clipped */}
      {menuTerbuka && (() => {
        const s = sekolah.find(x => x.id === menuTerbuka.id)
        if (!s) return null
        return (
          <div
            onClick={e => e.stopPropagation()}
            style={{ top: menuTerbuka.top, right: menuTerbuka.right }}
            className="fixed z-50 w-52 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Tindakan</p>
              <p className="text-xs font-bold text-gray-700 truncate">{s.namaSekolah}</p>
            </div>
            <button onClick={() => { setMenuTerbuka(null); masukSebagaiPortal(s, 'pencatat') }}
              className="w-full text-left px-3 py-2.5 text-xs font-semibold text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-2">
              <span className="text-sm">📝</span> Masuk sebagai Pencatat
            </button>
            <button onClick={() => { setMenuTerbuka(null); masukSebagaiPortal(s, 'pengurus') }}
              className="w-full text-left px-3 py-2.5 text-xs font-semibold text-gray-700 hover:bg-pink-50 hover:text-pink-700 flex items-center gap-2">
              <span className="text-sm">👥</span> Masuk sebagai PP
            </button>
            <div className="border-t border-gray-100" />
            <button onClick={() => { setMenuTerbuka(null); resetPwAdmin(s) }}
              className="w-full text-left px-3 py-2.5 text-xs font-semibold text-gray-700 hover:bg-orange-50 hover:text-orange-700 flex items-center gap-2">
              <span className="text-sm">🔑</span> Reset Password
            </button>
            <button onClick={() => { setMenuTerbuka(null); setModalPerbaharui(s) }}
              className="w-full text-left px-3 py-2.5 text-xs font-semibold text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2">
              <span className="text-sm">📅</span> Perbaharui Langganan
            </button>
            {s.status === 'active' ? (
              <button onClick={() => { setMenuTerbuka(null); tangguhSekolah(s) }}
                className="w-full text-left px-3 py-2.5 text-xs font-semibold text-gray-700 hover:bg-red-50 hover:text-red-700 flex items-center gap-2">
                <span className="text-sm">⏸</span> Tangguh Akaun
              </button>
            ) : (
              <button onClick={() => { setMenuTerbuka(null); aktifkanSekolah(s) }}
                className="w-full text-left px-3 py-2.5 text-xs font-semibold text-gray-700 hover:bg-green-50 hover:text-green-700 flex items-center gap-2">
                <span className="text-sm">▶</span> Aktifkan Akaun
              </button>
            )}
            <button onClick={() => { setMenuTerbuka(null); setModalDataReset(s) }}
              className="w-full text-left px-3 py-2.5 text-xs font-semibold text-gray-700 hover:bg-purple-50 hover:text-purple-700 flex items-center gap-2">
              <span className="text-sm">♻️</span> Data & Reset
            </button>
            <div className="border-t border-gray-100" />
            <button onClick={() => { setMenuTerbuka(null); padamSekolah(s) }}
              className="w-full text-left px-3 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2">
              <span className="text-sm">🗑</span> Padam Sekolah
            </button>
          </div>
        )
      })()}

      {modalTambah && (
        <ModalTambahSekolah onTutup={() => setModalTambah(false)} onSimpan={muatSekolah} />
      )}

      {modalPerbaharui && (
        <ModalPerbaharui
          sekolah={modalPerbaharui}
          onTutup={() => setModalPerbaharui(null)}
          onBerjaya={handlePerbaharuiBerjaya}
        />
      )}

      {modalDataReset && (
        <ModalDataReset
          sekolah={modalDataReset}
          onTutup={() => setModalDataReset(null)}
          onSelesai={handleDataResetSelesai}
        />
      )}
    </div>
  )
}
