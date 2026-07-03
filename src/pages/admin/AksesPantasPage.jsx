/**
 * AksesPantasPage — /admin/akses-pantas
 *
 * Admin urus cards Akses Pantas Home secara bebas (max 6).
 * Simpan ke: tenants/{schoolId}/tetapan/aksesPantas  →  { items: [...] }
 *
 * Auto-migrate data lama (galeri, bukuKejohananLink, bukuProgram) jika ada.
 */

import { useState, useEffect } from 'react'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'

const MAX_ITEMS = 6

const EMOJI_LIST = [
  '📸','📖','📄','🎥','💬','📢','🏆','🎖️','🏅','📊',
  '🗓️','📍','🔗','📞','🎵','🎨','🌐','⭐','🔔','✉️',
  '🏫','👥','📝','💾','🎯','🎉','🚀','⚡','🌟','📌',
]

const TEMPLATES = [
  { emoji: '📸', tajuk: 'Galeri Gambar',   penerangan: 'Lihat momen terbaik kejohanan' },
  { emoji: '📖', tajuk: 'Buku Kejohanan',  penerangan: 'Rekod rasmi & atlet pemenang' },
  { emoji: '📄', tajuk: 'Buku Program',    penerangan: 'Program rasmi kejohanan' },
  { emoji: '🎥', tajuk: 'Live Streaming',  penerangan: 'Tonton siaran langsung' },
  { emoji: '💬', tajuk: 'WhatsApp Kumpulan', penerangan: 'Sertai kumpulan perbincangan' },
  { emoji: '📊', tajuk: 'Keputusan Rasmi', penerangan: 'Keputusan & markah terkini' },
]

function genId() {
  return Math.random().toString(36).slice(2, 9)
}

function validateUrl(url) {
  if (!url || !url.trim()) return { valid: null, msg: '' }
  if (!url.startsWith('https://')) return { valid: false, msg: '⚠ URL mesti bermula dengan https://' }
  try {
    new URL(url)
    const platforms = {
      'drive.google.com':  '✓ Google Drive',
      'photos.google.com': '✓ Google Photos',
      'dropbox.com':       '✓ Dropbox',
      'onedrive.live.com': '✓ OneDrive',
      'youtube.com':       '✓ YouTube',
      'youtu.be':          '✓ YouTube',
      'wa.me':             '✓ WhatsApp',
      'chat.whatsapp.com': '✓ WhatsApp',
    }
    for (const [d, label] of Object.entries(platforms)) {
      if (url.includes(d)) return { valid: true, msg: label, color: 'text-green-600' }
    }
    return { valid: true, msg: '⚠ URL diterima (bukan platform biasa)', color: 'text-amber-600' }
  } catch {
    return { valid: false, msg: '⚠ URL tidak sah' }
  }
}

// ─── EmojiPicker ─────────────────────────────────────────────────────────────

function EmojiPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-10 h-10 rounded-xl border-2 border-gray-200 bg-white text-xl flex items-center justify-center hover:border-[#003399]/40 transition-colors"
      >
        {value || '➕'}
      </button>
      {open && (
        <div className="absolute z-20 top-12 left-0 bg-white border border-gray-200 rounded-xl shadow-xl p-2 grid grid-cols-6 gap-1 w-52">
          {EMOJI_LIST.map(em => (
            <button
              key={em}
              type="button"
              onClick={() => { onChange(em); setOpen(false) }}
              className={`text-lg w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors ${value === em ? 'bg-blue-50 ring-2 ring-[#003399]/30' : ''}`}
            >
              {em}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── CardRow ─────────────────────────────────────────────────────────────────

function CardRow({ item, idx, total, onChange, onMove, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const urlV = validateUrl(item.url)

  return (
    <div className={`rounded-xl border-2 transition-colors ${item.aktif ? 'border-green-200 bg-green-50/40' : 'border-gray-200 bg-gray-50/40'}`}>
      {/* Header baris */}
      <div className="flex items-center gap-2 p-3">
        {/* Emoji */}
        <div className="text-xl w-8 text-center shrink-0">{item.emoji || '❓'}</div>

        {/* Tajuk + URL preview */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-gray-800 truncate">{item.tajuk || <span className="text-gray-400 italic">Tiada tajuk</span>}</p>
          {item.url && (
            <p className="text-[10px] text-gray-400 truncate">{item.url}</p>
          )}
        </div>

        {/* Badge aktif */}
        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0 ${item.aktif ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'}`}>
          {item.aktif ? 'ON' : 'OFF'}
        </span>

        {/* Butang susun */}
        <div className="flex flex-col gap-0.5 shrink-0">
          <button type="button" disabled={idx === 0} onClick={() => onMove(idx, -1)}
            className="w-5 h-5 rounded text-gray-400 hover:text-gray-700 disabled:opacity-20 flex items-center justify-center text-[10px]">▲</button>
          <button type="button" disabled={idx === total - 1} onClick={() => onMove(idx, 1)}
            className="w-5 h-5 rounded text-gray-400 hover:text-gray-700 disabled:opacity-20 flex items-center justify-center text-[10px]">▼</button>
        </div>

        {/* Expand/collapse */}
        <button type="button" onClick={() => setExpanded(e => !e)}
          className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-xs transition-colors shrink-0">
          {expanded ? '▲' : '✏️'}
        </button>
      </div>

      {/* Form edit (expand) */}
      {expanded && (
        <div className="border-t border-gray-200 p-3 space-y-3">
          {/* Toggle + emoji + tajuk */}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => onChange(idx, 'aktif', !item.aktif)}
              className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${item.aktif ? 'bg-green-500' : 'bg-gray-300'}`}>
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${item.aktif ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
            <EmojiPicker value={item.emoji} onChange={v => onChange(idx, 'emoji', v)} />
            <input
              type="text"
              value={item.tajuk}
              onChange={e => onChange(idx, 'tajuk', e.target.value)}
              placeholder="Tajuk card"
              maxLength={30}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#003399]/30"
            />
          </div>

          {/* URL */}
          <div>
            <input
              type="url"
              value={item.url}
              onChange={e => onChange(idx, 'url', e.target.value)}
              placeholder="https://..."
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#003399]/30"
            />
            {urlV.msg && (
              <p className={`text-[10px] mt-0.5 font-medium ${urlV.color || (urlV.valid === false ? 'text-red-500' : 'text-gray-500')}`}>
                {urlV.msg}
              </p>
            )}
          </div>

          {/* Penerangan */}
          <input
            type="text"
            value={item.penerangan}
            onChange={e => onChange(idx, 'penerangan', e.target.value)}
            placeholder="Penerangan ringkas (optional, max 100 huruf)"
            maxLength={100}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#003399]/30"
          />

          {/* Padam */}
          <div className="flex justify-end">
            <button type="button" onClick={() => onDelete(idx)}
              className="text-[10px] text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors">
              🗑 Padam Card
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AksesPantasPage() {
  const { userData } = useAuth()
  const schoolId = userData?.schoolId || ''

  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState('')
  const [showAdd, setShowAdd] = useState(false)

  // ── Load (dengan auto-migrate) ──────────────────────────────────────────────
  useEffect(() => {
    if (!schoolId) return
    async function load() {
      setLoading(true)
      try {
        const snap = await getDoc(doc(db, 'tenants', schoolId, 'tetapan', 'aksesPantas'))
        if (snap.exists() && Array.isArray(snap.data().items)) {
          setItems(snap.data().items)
        } else {
          // Auto-migrate dari 3 doc lama
          const [galSnap, bkSnap, bpSnap] = await Promise.all([
            getDoc(doc(db, 'tenants', schoolId, 'tetapan', 'galeri')),
            getDoc(doc(db, 'tenants', schoolId, 'tetapan', 'bukuKejohananLink')),
            getDoc(doc(db, 'tenants', schoolId, 'tetapan', 'bukuProgram')),
          ])
          const migrated = []
          if (galSnap.exists() && galSnap.data().url) {
            const d = galSnap.data()
            migrated.push({ id: genId(), emoji: '📸', tajuk: 'Galeri Gambar', url: d.url || '', penerangan: d.penerangan || '', aktif: !!d.aktif })
          }
          if (bkSnap.exists() && bkSnap.data().url) {
            const d = bkSnap.data()
            migrated.push({ id: genId(), emoji: '📖', tajuk: 'Buku Kejohanan', url: d.url || '', penerangan: d.penerangan || '', aktif: !!d.aktif })
          }
          if (bpSnap.exists() && bpSnap.data().url) {
            const d = bpSnap.data()
            migrated.push({ id: genId(), emoji: '📄', tajuk: 'Buku Program', url: d.url || '', penerangan: d.penerangan || '', aktif: !!d.aktif })
          }
          setItems(migrated)
        }
      } catch (e) {
        console.warn('Load aksesPantas:', e.message)
      }
      setLoading(false)
    }
    load()
  }, [schoolId])

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleChange(idx, field, val) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it))
  }

  function handleMove(idx, dir) {
    setItems(prev => {
      const next = [...prev]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  function handleDelete(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  function handleAddTemplate(tpl) {
    if (items.length >= MAX_ITEMS) return
    setItems(prev => [...prev, { id: genId(), emoji: tpl.emoji, tajuk: tpl.tajuk, url: '', penerangan: tpl.penerangan, aktif: false }])
    setShowAdd(false)
  }

  function handleAddBlank() {
    if (items.length >= MAX_ITEMS) return
    setItems(prev => [...prev, { id: genId(), emoji: '⭐', tajuk: '', url: '', penerangan: '', aktif: false }])
    setShowAdd(false)
  }

  async function handleSave() {
    setMsg('')
    // Validate
    for (const it of items) {
      if (!it.tajuk.trim()) { setMsg('Semua card mesti ada tajuk.'); return }
      if (!it.url.trim())   { setMsg(`Card "${it.tajuk}" tiada URL.`); return }
      const v = validateUrl(it.url)
      if (v.valid === false) { setMsg(`URL card "${it.tajuk}" tidak sah.`); return }
    }
    setSaving(true)
    try {
      await setDoc(doc(db, 'tenants', schoolId, 'tetapan', 'aksesPantas'), {
        items:     items,
        updatedAt: serverTimestamp(),
      })
      setMsg('Tetapan berjaya disimpan.')
    } catch (e) {
      setMsg('Ralat: ' + e.message)
    }
    setSaving(false)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px]">
        <p className="text-xs text-gray-500">Memuatkan...</p>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xl shadow-md">
          ⚡
        </div>
        <div>
          <h1 className="text-base font-bold text-gray-800">Akses Pantas Home</h1>
          <p className="text-[11px] text-gray-500">Cards yang dipaparkan di halaman awam bawah Pengurus Pasukan.</p>
        </div>
      </div>

      {/* Card PP (fixed, read-only info) */}
      <div className="mt-5 rounded-xl border-2 border-blue-200 bg-blue-50/40 px-4 py-3 flex items-center gap-3">
        <span className="text-xl">👥</span>
        <div className="flex-1">
          <p className="text-xs font-bold text-gray-700">Pengurus Pasukan</p>
          <p className="text-[10px] text-gray-400">Card tetap — tidak boleh diubah</p>
        </div>
        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-500 text-white uppercase">Tetap</span>
      </div>

      {/* Senarai cards */}
      <div className="mt-4 space-y-2">
        {items.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-6">Tiada card lagi. Tambah card di bawah.</p>
        )}
        {items.map((item, idx) => (
          <CardRow
            key={item.id}
            item={item}
            idx={idx}
            total={items.length}
            onChange={handleChange}
            onMove={handleMove}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {/* Tambah card */}
      {items.length < MAX_ITEMS ? (
        <div className="mt-4">
          {!showAdd ? (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="w-full py-2.5 rounded-xl border-2 border-dashed border-gray-300 text-xs text-gray-500 hover:border-[#003399]/40 hover:text-[#003399] transition-colors font-medium"
            >
              + Tambah Card ({items.length}/{MAX_ITEMS})
            </button>
          ) : (
            <div className="border-2 border-dashed border-[#003399]/30 rounded-xl p-4 bg-blue-50/30">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-3">Pilih template atau kosong</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                {TEMPLATES.map(tpl => (
                  <button key={tpl.tajuk} type="button" onClick={() => handleAddTemplate(tpl)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200 hover:border-[#003399]/40 text-left transition-colors">
                    <span className="text-base">{tpl.emoji}</span>
                    <span className="text-[10px] font-semibold text-gray-700">{tpl.tajuk}</span>
                  </button>
                ))}
                <button type="button" onClick={handleAddBlank}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200 hover:border-[#003399]/40 text-left transition-colors">
                  <span className="text-base">✨</span>
                  <span className="text-[10px] font-semibold text-gray-700">Kosong</span>
                </button>
              </div>
              <button type="button" onClick={() => setShowAdd(false)}
                className="text-[10px] text-gray-400 hover:text-gray-600">Batal</button>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-[10px] text-amber-600 text-center font-medium">Had maksimum 6 cards dicapai.</p>
      )}

      {/* Simpan */}
      <div className="mt-6 flex flex-wrap gap-3 items-center bg-white border border-gray-200 rounded-xl p-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-[#003399] text-white rounded-lg text-xs font-semibold hover:bg-[#002280] disabled:opacity-50 transition-colors"
        >
          {saving ? 'Menyimpan...' : '💾 Simpan Tetapan'}
        </button>
        {msg && (
          <span className={`text-xs font-medium ${msg.startsWith('Ralat') || msg.includes('tiada') || msg.includes('tidak sah') || msg.includes('mesti') ? 'text-red-500' : 'text-green-600'}`}>
            {msg}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-[11px] text-blue-700 space-y-1">
        <p className="font-bold">💡 Tips:</p>
        <p>• Hanya cards yang <strong>ON</strong> dan ada URL akan dipaparkan di Home page awam.</p>
        <p>• Susun urutan dengan butang ▲ ▼ — card paling atas muncul selepas Pengurus Pasukan.</p>
        <p>• URL mesti bermula dengan <strong>https://</strong></p>
      </div>

    </div>
  )
}
