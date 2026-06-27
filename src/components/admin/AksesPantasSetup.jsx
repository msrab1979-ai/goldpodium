/**
 * AksesPantasSetup — Shared component untuk setup Akses Pantas Home.
 *
 * Digunakan oleh:
 *   - GaleriSetup.jsx           → tetapan/galeri
 *   - BukuKejohananLinkSetup.jsx → tetapan/bukuKejohananLink
 *   - BukuProgramSetup.jsx       → tetapan/bukuProgram
 *
 * Setiap fail wrapper hanya pass config (title, icon, color, docId).
 */

import { useState, useEffect } from 'react'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none ' +
  'focus:ring-2 focus:ring-[#003399]/30 focus:border-[#003399] bg-white transition-colors'

// ─── URL validation ───────────────────────────────────────────────────────────

function validateUrl(url) {
  if (!url || !url.trim()) return { valid: null, msg: '' }
  if (!url.startsWith('https://')) {
    return { valid: false, msg: '⚠ URL mesti bermula dengan https://' }
  }
  try {
    const u = new URL(url)
    const platforms = {
      'drive.google.com':  { label: '✓ Google Drive', color: 'text-green-600' },
      'photos.google.com': { label: '✓ Google Photos', color: 'text-green-600' },
      'dropbox.com':       { label: '✓ Dropbox', color: 'text-green-600' },
      'onedrive.live.com': { label: '✓ OneDrive', color: 'text-green-600' },
    }
    for (const [domain, info] of Object.entries(platforms)) {
      if (u.hostname.includes(domain)) return { valid: true, msg: info.label, color: info.color }
    }
    return { valid: true, msg: '⚠ URL diterima (bukan platform biasa)', color: 'text-amber-600' }
  } catch {
    return { valid: false, msg: '⚠ URL tidak sah' }
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AksesPantasSetup({ docId, kejId, title, icon, gradient, description, urlPlaceholder, contohPenerangan }) {
  const { userData } = useAuth()
  const schoolId = userData?.schoolId || ''
  const [aktif,        setAktif]        = useState(false)
  const [url,          setUrl]          = useState('')
  const [penerangan,   setPenerangan]   = useState('')
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [msg,          setMsg]          = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const snap = await getDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'tetapan', docId))
        if (snap.exists()) {
          const d = snap.data()
          if (typeof d.aktif === 'boolean') setAktif(d.aktif)
          if (d.url) setUrl(d.url)
          if (d.penerangan) setPenerangan(d.penerangan)
        }
      } catch (e) {
        console.warn('Load tetapan/' + docId + ':', e.message)
      }
      setLoading(false)
    }
    load()
  }, [docId, schoolId, kejId])

  const urlValidation = validateUrl(url)

  async function handleSave() {
    setMsg('')
    // Validation
    if (aktif && !url.trim()) {
      setMsg('Status AKTIF tapi URL kosong. Sila masukkan URL atau matikan status.')
      return
    }
    if (url.trim() && urlValidation.valid === false) {
      setMsg('URL tidak sah. Sila semak format URL.')
      return
    }
    setSaving(true)
    try {
      await setDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'tetapan', docId), {
        aktif:      !!aktif,
        url:        url.trim(),
        penerangan: penerangan.trim(),
        updatedAt:  serverTimestamp(),
      }, { merge: true })
      setMsg('Tetapan berjaya disimpan.')
    } catch (e) {
      setMsg('Ralat: ' + e.message)
    }
    setSaving(false)
  }

  function bukaUrl() {
    if (!url || !urlValidation.valid) return
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px]">
        <p className="text-xs text-gray-500">Memuatkan...</p>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-xl shadow-md`}>
            {icon}
          </div>
          <h1 className="text-base font-bold text-gray-800">{title}</h1>
        </div>
        <p className="text-xs text-gray-500 mt-1">{description}</p>
      </div>

      <div className="space-y-5">

        {/* ── Toggle Status ── */}
        <div className={`rounded-xl border-2 p-4 transition-colors ${
          aktif ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs font-bold text-gray-800">Status di Home</p>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  aktif ? 'bg-green-500 text-white' : 'bg-gray-400 text-white'
                }`}>
                  {aktif ? 'AKTIF' : 'TIDAK AKTIF'}
                </span>
              </div>
              <p className="text-[11px] text-gray-600">
                {aktif
                  ? `Card "${title}" akan dipaparkan dalam section Akses Pantas di Home.`
                  : `Card disembunyikan dari Home page.`}
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

        {/* ── URL Input ── */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                URL Pautan
              </label>
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder={urlPlaceholder}
                className={`${inputCls} font-mono text-[11px]`}
              />
              {urlValidation.msg && (
                <p className={`text-[10px] mt-1 font-medium ${urlValidation.color || (urlValidation.valid === false ? 'text-red-500' : 'text-gray-500')}`}>
                  {urlValidation.msg}
                </p>
              )}
              {url && urlValidation.valid && (
                <button
                  onClick={bukaUrl}
                  type="button"
                  className="text-[10px] text-[#003399] hover:underline mt-1 inline-flex items-center gap-1"
                >
                  🔗 Buka URL untuk uji
                </button>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                Penerangan (optional)
              </label>
              <input
                type="text"
                value={penerangan}
                onChange={e => setPenerangan(e.target.value)}
                placeholder={contohPenerangan}
                maxLength={100}
                className={inputCls}
              />
              <p className="text-[10px] text-gray-400 mt-1">
                Teks pendek ditunjuk di bawah tajuk dalam card Home. Max 100 huruf.
              </p>
            </div>
          </div>
        </div>

        {/* ── Cara Setup (info) ── */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-[11px] text-blue-700 space-y-1">
          <p className="font-bold">💡 Cara Setup URL:</p>
          <p>1. Buka Google Drive / Photos → klik kanan fail/folder → <strong>Share</strong></p>
          <p>2. General access: <strong>"Anyone with the link"</strong></p>
          <p>3. Role: <strong>"Viewer"</strong> (JANGAN Editor)</p>
          <p>4. Copy URL → paste dalam ruangan di atas → Simpan</p>
        </div>

        {/* ── Preview Card Home ── */}
        {aktif && url && urlValidation.valid && (
          <div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">
              🔍 Preview di Home
            </p>
            <div className={`rounded-2xl bg-gradient-to-br ${gradient} p-5 text-white max-w-xs shadow-lg`}>
              <div className="text-3xl mb-3">{icon}</div>
              <p className="text-xs font-black uppercase tracking-wider mb-1">{title}</p>
              {penerangan && (
                <p className="text-[10px] text-white/80 mb-3 leading-snug">{penerangan}</p>
              )}
              <div className="inline-block px-3 py-1.5 bg-white/20 backdrop-blur rounded-lg text-[10px] font-bold">
                Buka →
              </div>
            </div>
          </div>
        )}

        {/* ── Simpan ── */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex flex-wrap gap-3 items-center">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-[#003399] text-white rounded-lg text-xs font-semibold hover:bg-[#002280] disabled:opacity-50 transition-colors"
            >
              {saving ? 'Menyimpan...' : '💾 Simpan Tetapan'}
            </button>
            {msg && (
              <span className={`text-xs font-medium ${
                msg.startsWith('Ralat') || msg.includes('kosong') || msg.includes('tidak sah')
                  ? 'text-red-500'
                  : 'text-green-600'
              }`}>
                {msg}
              </span>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
