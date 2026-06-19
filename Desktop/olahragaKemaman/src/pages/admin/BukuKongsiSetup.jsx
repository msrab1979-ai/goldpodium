/**
 * BukuKongsiSetup — /dashboard/buku-kongsi-setup
 *
 * Admin: kongsi URL Google Drive (Buku Kejohanan, dll) untuk Pengurus Pasukan.
 * Senarai dinamik max 10. Validate Drive URL sahaja.
 *
 * Simpan ke: tetapan/bukuKongsi
 *   { aktif: bool, senarai: [{ id, tajuk, url, createdAt }] }
 */

import { useState, useEffect } from 'react'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { isValidDriveUrl, extractDriveFileId } from '../../utils/bukuKongsiUtils'

const MAX_BUKU = 10

const inputCls = 'border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none ' +
  'focus:ring-1 focus:ring-[#003399] focus:border-[#003399] bg-white'

function newBukuId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export default function BukuKongsiSetup() {
  const [aktif, setAktif]       = useState(true)
  const [senarai, setSenarai]   = useState([])  // [{ id, tajuk, url, createdAt }]
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState('')

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDoc(doc(db, 'tetapan', 'bukuKongsi'))
        if (!snap.exists()) return
        const d = snap.data()
        if (typeof d.aktif === 'boolean') setAktif(d.aktif)
        if (Array.isArray(d.senarai)) setSenarai(d.senarai)
      } catch {}
    }
    load()
  }, [])

  function tambahBuku() {
    if (senarai.length >= MAX_BUKU) return
    setSenarai(prev => [...prev, {
      id: newBukuId(),
      tajuk: '',
      url: '',
      createdAt: new Date().toISOString(),
    }])
  }

  function buangBuku(id) {
    setSenarai(prev => prev.filter(b => b.id !== id))
  }

  function updateBuku(id, field, val) {
    setSenarai(prev => prev.map(b => b.id === id ? { ...b, [field]: val } : b))
  }

  function pindahkan(id, direction) {
    const idx = senarai.findIndex(b => b.id === id)
    if (idx < 0) return
    const newIdx = direction === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= senarai.length) return
    const copy = [...senarai]
    const [item] = copy.splice(idx, 1)
    copy.splice(newIdx, 0, item)
    setSenarai(copy)
  }

  async function handleSave() {
    setSaving(true); setMsg('')
    try {
      // Validate semua buku
      const bersih = senarai.map(b => ({
        id:        b.id,
        tajuk:     (b.tajuk || '').trim(),
        url:       (b.url   || '').trim(),
        createdAt: b.createdAt || new Date().toISOString(),
      }))
      for (const b of bersih) {
        if (!b.tajuk) { setMsg('Ralat: Setiap buku perlu ada tajuk.'); setSaving(false); return }
        if (!b.url) { setMsg('Ralat: Setiap buku perlu ada URL.'); setSaving(false); return }
        if (!isValidDriveUrl(b.url)) {
          setMsg(`Ralat: URL untuk "${b.tajuk}" bukan Google Drive yang sah.`)
          setSaving(false); return
        }
      }
      await setDoc(doc(db, 'tetapan', 'bukuKongsi'), {
        aktif:     !!aktif,
        senarai:   bersih,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setMsg('Tetapan berjaya disimpan.')
    } catch (e) {
      setMsg('Ralat: ' + e.message)
    }
    setSaving(false)
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-base font-bold text-gray-800">📚 Kongsi Buku Kejohanan</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Kongsi URL Google Drive (PDF) untuk Pengurus Pasukan muat turun. Maksimum {MAX_BUKU} buku.
        </p>
      </div>

      <div className="space-y-5">

        {/* ── Toggle Aktif ── */}
        <div className={`rounded-xl border-2 p-4 transition-colors ${
          aktif ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs font-bold text-gray-800">Status Buku Kongsi</p>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  aktif ? 'bg-green-500 text-white' : 'bg-gray-400 text-white'
                }`}>
                  {aktif ? 'AKTIF' : 'TIDAK AKTIF'}
                </span>
              </div>
              <p className="text-[11px] text-gray-600">
                {aktif
                  ? 'Pengurus Pasukan boleh nampak menu & muat turun buku.'
                  : 'Menu Buku Kejohanan DISEMBUNYIKAN dari Pengurus Pasukan.'}
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

        {/* ── Cara guna ── */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-[11px] text-blue-700 space-y-1">
          <p className="font-bold">Cara Setup Google Drive:</p>
          <p>1. Buka Google Drive → klik kanan fail PDF → <strong>Share</strong></p>
          <p>2. General access → pilih <strong>"Anyone with the link"</strong></p>
          <p>3. Role: <strong>"Viewer"</strong> (JANGAN Editor)</p>
          <p>4. Copy link → paste dalam ruangan URL di bawah</p>
        </div>

        {/* ── Senarai Buku ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-gray-800">
              Senarai Buku ({senarai.length} / {MAX_BUKU})
            </p>
            <button
              onClick={tambahBuku}
              disabled={senarai.length >= MAX_BUKU}
              className="px-3 py-1.5 bg-[#003399] text-white rounded-lg text-xs font-semibold hover:bg-[#002288] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              + Tambah Buku
            </button>
          </div>

          {senarai.length === 0 ? (
            <div className="py-12 text-center bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
              <p className="text-3xl mb-2">📚</p>
              <p className="text-xs text-gray-400">Belum ada buku. Klik "Tambah Buku" untuk mula.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {senarai.map((b, i) => {
                const validUrl = !b.url || isValidDriveUrl(b.url)
                const fileId   = extractDriveFileId(b.url)
                return (
                  <div key={b.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                    <div className="flex items-start gap-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-bold text-gray-500 text-center mb-1">{i + 1}</span>
                        <button
                          onClick={() => pindahkan(b.id, 'up')}
                          disabled={i === 0}
                          className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-white disabled:opacity-30"
                          title="Pindah ke atas"
                        >▲</button>
                        <button
                          onClick={() => pindahkan(b.id, 'down')}
                          disabled={i === senarai.length - 1}
                          className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-white disabled:opacity-30"
                          title="Pindah ke bawah"
                        >▼</button>
                      </div>
                      <div className="flex-1 space-y-2 min-w-0">
                        <div>
                          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Tajuk Buku</p>
                          <input
                            type="text"
                            value={b.tajuk}
                            onChange={e => updateBuku(b.id, 'tajuk', e.target.value)}
                            placeholder="Contoh: Buku Kejohanan 2026"
                            className={inputCls + ' w-full'}
                          />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">URL Google Drive</p>
                          <input
                            type="url"
                            value={b.url}
                            onChange={e => updateBuku(b.id, 'url', e.target.value)}
                            placeholder="https://drive.google.com/file/d/..."
                            className={inputCls + ' w-full font-mono text-[10px]'}
                          />
                          {b.url && !validUrl && (
                            <p className="text-[10px] text-red-500 mt-1">⚠ URL bukan Google Drive yang sah</p>
                          )}
                          {b.url && validUrl && fileId && (
                            <p className="text-[10px] text-green-600 mt-1">✓ Drive File ID: {fileId.slice(0, 12)}...</p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => buangBuku(b.id)}
                        className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
                        title="Buang buku"
                      >×</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Simpan ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex flex-wrap gap-3 items-center">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-[#003399] text-white rounded-lg text-xs font-semibold hover:bg-[#002288] transition-colors disabled:opacity-50"
            >
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
