/**
 * SijilPencapaianPP — /dashboard/sijil-pencapaian
 *
 * Pengurus pasukan: lihat senarai pencapaian murid sekolah (Tempat 1 - hadKedudukan),
 * muat turun sijil individu atau ZIP semua.
 *
 * Sumber data:
 *   tetapan/sijilPencapaian — template + posisi + gaya + hadKedudukan
 *   kejohanan (aktif)       — kejId
 *   mata_olahragawan        — acaraDetail_* dengan rank, pingat, namaAcara
 */

import { useState, useEffect } from 'react'
import {
  collection, getDocs, doc, getDoc, query, where,
} from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import {
  ambilSenaraiPencapaian, janaSijilPencapaianPDF, namaFailPencapaian, labelKedudukan,
} from '../../utils/sijilPencapaianUtils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Spinner({ size = 'w-5 h-5' }) {
  return (
    <svg className={`${size} animate-spin text-[#003399]`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  )
}

function PingatBadge({ rank }) {
  const cfg = {
    1: { bg: 'bg-yellow-100 text-yellow-800 border-yellow-300', label: '🥇 1' },
    2: { bg: 'bg-gray-100 text-gray-700 border-gray-300',       label: '🥈 2' },
    3: { bg: 'bg-orange-100 text-orange-800 border-orange-300', label: '🥉 3' },
  }[rank] || { bg: 'bg-blue-50 text-blue-700 border-blue-200', label: `Ke-${rank}` }
  return (
    <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded border text-[10px] font-bold ${cfg.bg}`}>
      {cfg.label}
    </span>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function SijilPencapaianPP() {
  const { userData, userRole } = useAuth()
  const navigate    = useNavigate()
  const kodSekolah  = userData?.kodSekolah  || ''
  const namaSekolah = userData?.namaSekolah || kodSekolah

  const [sijilCfg, setSijilCfg]    = useState(null)
  const [kejohanan, setKejohanan]  = useState(null)
  const [senarai, setSenarai]      = useState([])
  const [loading, setLoading]      = useState(true)
  const [err, setErr]              = useState('')
  const [downloading, setDownloading] = useState({})
  const [zipping, setZipping]      = useState(false)
  const [filterRank, setFilterRank] = useState('all')
  const [cari, setCari]            = useState('')

  useEffect(() => {
    if (!kodSekolah) return
    load()
  }, [kodSekolah])

  async function load() {
    setLoading(true); setErr('')
    try {
      const sijilSnap = await getDoc(doc(db, 'tetapan', 'sijilPencapaian'))
      if (!sijilSnap.exists() || !sijilSnap.data().templateImg) {
        setErr('Tetapan Sijil Pencapaian belum dikonfigurasi oleh admin.')
        setLoading(false); return
      }
      const cfg = sijilSnap.data()

      // ── Guard: toggle OFF + PP → redirect ke dashboard ──────────────────
      const isAktif = cfg.aktif === undefined ? true : !!cfg.aktif
      if (!isAktif && userRole === 'pengurus_pasukan') {
        navigate('/dashboard', { replace: true })
        return
      }

      setSijilCfg(cfg)

      const kejSnap = await getDocs(
        query(collection(db, 'kejohanan'), where('statusKejohanan', '==', 'aktif'))
      )
      if (kejSnap.empty) {
        setErr('Tiada kejohanan aktif.')
        setLoading(false); return
      }
      const kej = { id: kejSnap.docs[0].id, ...kejSnap.docs[0].data() }
      setKejohanan(kej)

      const had = Number(cfg.hadKedudukan) || 5
      const list = await ambilSenaraiPencapaian(db, kej.id, had, kodSekolah)
      setSenarai(list)
    } catch (e) {
      setErr('Ralat memuatkan: ' + e.message)
    }
    setLoading(false)
  }

  async function muatTurunSatu(item, idx) {
    if (!sijilCfg) return
    setDownloading(prev => ({ ...prev, [idx]: true }))
    try {
      const pdf = janaSijilPencapaianPDF({
        namaAtlet:   item.namaAtlet,
        namaSekolah: item.namaSekolah || namaSekolah,
        namaAcara:   item.namaAcara,
        rank:        item.rank,
      }, sijilCfg)
      pdf.save(namaFailPencapaian(item.namaAtlet, item.namaAcara, item.rank))
    } catch (e) {
      alert('Ralat: ' + e.message)
    }
    setDownloading(prev => ({ ...prev, [idx]: false }))
  }

  async function muatTurunSemua() {
    if (!sijilCfg || senarai.length === 0) return
    setZipping(true)
    try {
      const zip = new JSZip()
      for (const item of filtered) {
        const pdf = janaSijilPencapaianPDF({
          namaAtlet:   item.namaAtlet,
          namaSekolah: item.namaSekolah || namaSekolah,
          namaAcara:   item.namaAcara,
          rank:        item.rank,
        }, sijilCfg)
        zip.file(namaFailPencapaian(item.namaAtlet, item.namaAcara, item.rank), pdf.output('blob'))
      }
      const content = await zip.generateAsync({ type: 'blob' })
      const namaSek = (namaSekolah || kodSekolah).replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_').toUpperCase()
      saveAs(content, `SIJIL_PENCAPAIAN_${namaSek}.zip`)
    } catch (e) {
      alert('Ralat menjana ZIP: ' + e.message)
    }
    setZipping(false)
  }

  // ── Filter & search ────────────────────────────────────────────────────────
  const cariLower = cari.trim().toLowerCase()
  const filtered = senarai.filter(s => {
    if (filterRank !== 'all' && s.rank !== Number(filterRank)) return false
    if (cariLower) {
      const hay = `${s.namaAtlet} ${s.namaAcara}`.toLowerCase()
      if (!hay.includes(cariLower)) return false
    }
    return true
  })

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px]">
        <div className="text-center">
          <Spinner size="w-8 h-8" />
          <p className="text-xs text-gray-500 mt-2">Memuatkan pencapaian...</p>
        </div>
      </div>
    )
  }

  if (err) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-amber-800 mb-1">Tidak dapat memuatkan</p>
          <p className="text-xs text-amber-700">{err}</p>
        </div>
      </div>
    )
  }

  const had = Number(sijilCfg?.hadKedudukan) || 5

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-base font-bold text-gray-800">🏆 Sijil Pencapaian</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          {namaSekolah} · {sijilCfg?.namaKejohanan || kejohanan?.namaKejohanan || '—'}
        </p>
        <p className="text-[11px] text-gray-400 mt-1">
          Hanya murid yang dapat Tempat 1 hingga {had} dipaparkan. Sijil dijana automatik selepas keputusan rasmi direkod.
        </p>
      </div>

      {/* Stats + Download All */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Jumlah Sijil</p>
            <p className="text-xl font-black text-[#003399]">{senarai.length}</p>
          </div>
          {filtered.length !== senarai.length && (
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Ditapis</p>
              <p className="text-xl font-black text-gray-600">{filtered.length}</p>
            </div>
          )}
        </div>
        <button
          onClick={muatTurunSemua}
          disabled={zipping || filtered.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-[#003399] text-white rounded-lg text-xs font-semibold hover:bg-[#002288] transition-colors disabled:opacity-50"
        >
          {zipping ? <Spinner size="w-3.5 h-3.5" /> : '📦'}
          {zipping ? 'Menjana ZIP...' : 'Muat Turun Semua (ZIP)'}
        </button>
      </div>

      {/* Filter */}
      {senarai.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 flex flex-wrap gap-2 items-center">
          <select
            value={filterRank}
            onChange={e => setFilterRank(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#003399]"
          >
            <option value="all">Semua Tempat</option>
            {Array.from({ length: had }, (_, i) => i + 1).map(n => (
              <option key={n} value={n}>Tempat {n}</option>
            ))}
          </select>
          <input
            type="text"
            value={cari}
            onChange={e => setCari(e.target.value)}
            placeholder="Cari nama atau acara..."
            className="flex-1 min-w-[200px] border border-gray-200 rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#003399]"
          />
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-3xl mb-2">🏅</p>
            <p className="text-sm font-semibold text-gray-600">
              {senarai.length === 0 ? 'Tiada pencapaian direkod lagi' : 'Tiada padanan'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {senarai.length === 0
                ? 'Sijil akan muncul automatik selepas keputusan rasmi direkod.'
                : 'Cuba ubah penapis atau carian.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
            {filtered.map((item, i) => (
              <div key={`${item.noKP}_${item.acaraId}_${i}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                <span className="text-[10px] text-gray-300 w-6 text-right shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate">{item.namaAtlet}</p>
                  <p className="text-[11px] text-gray-500 truncate">{item.namaAcara}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{labelKedudukan(item.rank)}</p>
                </div>
                <PingatBadge rank={item.rank} />
                <button
                  onClick={() => muatTurunSatu(item, i)}
                  disabled={downloading[i]}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 text-gray-700 rounded text-[11px] font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50"
                  title="Muat turun sijil ini"
                >
                  {downloading[i] ? <Spinner size="w-3 h-3" /> : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  )}
                  PDF
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Nota */}
      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-[10px] text-blue-700 space-y-0.5">
        <p className="font-bold">Nota:</p>
        <p>· Hanya murid yang BETUL-BETUL dapat Tempat 1 hingga {had} dipaparkan.</p>
        <p>· Sijil dijana automatik selepas pengadil rekod keputusan rasmi.</p>
        <p>· Acara berpasukan (relay) — sila hubungi admin jika perlu sijil khas.</p>
      </div>
    </div>
  )
}
