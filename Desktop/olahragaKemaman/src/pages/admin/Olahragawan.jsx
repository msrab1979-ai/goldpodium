/**
 * Olahragawan — /dashboard/olahragawan
 *
 * Ranking individu per Kategori (A/B/C/D/E) × Jantina (L/P).
 * Mata: Emas=5, Perak=3, Gangsa=2, Tempat4=1
 * Tiebreak: Mata → Emas → Perak → Gangsa → Nama (abjad)
 * Admin pilih manual Murid Terbaik per kategori.
 * Real-time via onSnapshot. Sulit — admin sahaja.
 */

import { useState, useEffect, useRef } from 'react'
import {
  collection, doc, getDocs, query, where, onSnapshot, orderBy,
  setDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'

// ─── Konstanta ────────────────────────────────────────────────────────────────

const PINGAT_STYLE = {
  emas:    { bg: 'bg-yellow-100 text-yellow-800 border-yellow-300', coin: 'bg-yellow-400 border-yellow-500 text-white', label: 'E', short: 'Emas' },
  perak:   { bg: 'bg-gray-100 text-gray-700 border-gray-300',       coin: 'bg-gray-400 border-gray-500 text-white',     label: 'P', short: 'Perak' },
  gangsa:  { bg: 'bg-orange-100 text-orange-800 border-orange-300', coin: 'bg-orange-400 border-orange-500 text-white', label: 'G', short: 'Gangsa' },
  tempat4: { bg: 'bg-slate-100 text-slate-700 border-slate-300',    coin: 'bg-slate-400 border-slate-500 text-white',   label: '4', short: 'T.4' },
}

const RANK_STYLE = {
  1: 'bg-yellow-400 text-white border-yellow-500',
  2: 'bg-gray-400 text-white border-gray-500',
  3: 'bg-orange-400 text-white border-orange-500',
}

// Hardcode sebagai fallback — digantikan dengan data Firestore
const KAT_LABEL_FALLBACK = {
  A: 'Kat A — Bwh 10', B: 'Kat B — Bwh 12', C: 'Kat C — Bwh 14',
  D: 'Kat D — Bwh 16', E: 'Kat E — Bwh 18', PPKI: 'Kat PPKI',
}
const PERINGKAT_LABEL = { D: 'Daerah', N: 'Negeri', K: 'Kebangsaan' }

// ─── Pure Helpers ─────────────────────────────────────────────────────────────

function sortOlahragawan(a, b) {
  if ((b.jumlahMata    || 0) !== (a.jumlahMata    || 0)) return (b.jumlahMata    || 0) - (a.jumlahMata    || 0)
  if ((b.pingat_emas   || 0) !== (a.pingat_emas   || 0)) return (b.pingat_emas   || 0) - (a.pingat_emas   || 0)
  if ((b.pingat_perak  || 0) !== (a.pingat_perak  || 0)) return (b.pingat_perak  || 0) - (a.pingat_perak  || 0)
  if ((b.pingat_gangsa || 0) !== (a.pingat_gangsa || 0)) return (b.pingat_gangsa || 0) - (a.pingat_gangsa || 0)
  return (a.namaAtlet || '').localeCompare(b.namaAtlet || '', 'ms')
}

function rankWithTies(sorted) {
  let rank = 1
  return sorted.map((item, i) => {
    if (i === 0) return { ...item, rank: 1 }
    const prev = sorted[i - 1]
    const sama =
      (item.jumlahMata   || 0) === (prev.jumlahMata   || 0) &&
      (item.pingat_emas  || 0) === (prev.pingat_emas  || 0) &&
      (item.pingat_perak || 0) === (prev.pingat_perak || 0) &&
      (item.pingat_gangsa|| 0) === (prev.pingat_gangsa|| 0)
    if (!sama) rank = i + 1
    return { ...item, rank }
  })
}

function getAcaraDetail(atlet) {
  return Object.entries(atlet)
    .filter(([k]) => k.startsWith('acaraDetail_'))
    .map(([, v]) => v)
    .sort((a, b) => {
      const order = { emas: 0, perak: 1, gangsa: 2, tempat4: 3 }
      return (order[a.pingat] ?? 9) - (order[b.pingat] ?? 9)
    })
}

function getRekodDetail(atlet) {
  return Object.entries(atlet)
    .filter(([k]) => k.startsWith('rekod_'))
    .map(([, v]) => v)
}

function formatPrestasi(prestasi, unit) {
  if (prestasi == null || prestasi === '') return '—'
  const v = Number(prestasi)
  if (isNaN(v)) return '—'
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

function formatSelisih(baru, lama, unit) {
  if (baru == null || lama == null) return null
  const diff = Math.abs(Number(baru) - Number(lama)).toFixed(2)
  return unit === 's' ? `-${diff}s (lebih pantas)` : `+${diff}m (lebih jauh)`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AtletRow({ atlet, rank, isDipilih, onPilih }) {
  const [expand, setExpand] = useState(false)
  const acaraList = getAcaraDetail(atlet)
  const rekodList = getRekodDetail(atlet)
  const isTop3    = rank <= 3
  const rankStyle = RANK_STYLE[rank] || ''

  const rowBg = isDipilih
    ? 'bg-amber-50 border-l-4 border-l-yellow-400'
    : isTop3
      ? rank === 1 ? 'bg-yellow-50 hover:bg-yellow-100'
      : rank === 2 ? 'bg-gray-50 hover:bg-gray-100'
      :              'bg-orange-50 hover:bg-orange-100'
    : 'hover:bg-slate-50'

  return (
    <>
      <tr
        className={`border-b border-gray-100 transition-colors ${rowBg} ${expand ? 'border-b-0' : ''} ${acaraList.length > 0 ? 'cursor-pointer' : ''}`}
        onClick={() => acaraList.length > 0 && setExpand(v => !v)}
      >
        {/* Rank */}
        <td className="px-2 py-2 text-center w-8">
          {isDipilih ? (
            <span className="text-yellow-500 font-black text-sm">★</span>
          ) : isTop3 ? (
            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full border-2 text-[9px] font-black ${rankStyle}`}>{rank}</span>
          ) : (
            <span className="text-[10px] text-gray-400 font-bold">{rank}</span>
          )}
        </td>

        {/* Nama + Sekolah */}
        <td className="px-2 py-2 max-w-[110px]">
          <p className={`font-semibold text-xs leading-snug truncate ${isTop3 || isDipilih ? 'text-gray-900' : 'text-gray-700'}`}>
            {atlet.namaAtlet || '—'}
          </p>
          <p className="text-[9px] text-gray-400 truncate">{atlet.namaSekolah || atlet.kodSekolah || '—'}</p>
        </td>

        {/* Emas */}
        <td className="px-1 py-2 text-center">
          <span className={`text-xs font-black ${(atlet.pingat_emas || 0) > 0 ? 'text-yellow-500' : 'text-gray-200'}`}>
            {atlet.pingat_emas || 0}
          </span>
        </td>
        {/* Perak */}
        <td className="px-1 py-2 text-center">
          <span className={`text-xs font-black ${(atlet.pingat_perak || 0) > 0 ? 'text-gray-400' : 'text-gray-200'}`}>
            {atlet.pingat_perak || 0}
          </span>
        </td>
        {/* Gangsa */}
        <td className="px-1 py-2 text-center">
          <span className={`text-xs font-black ${(atlet.pingat_gangsa || 0) > 0 ? 'text-orange-400' : 'text-gray-200'}`}>
            {atlet.pingat_gangsa || 0}
          </span>
        </td>
        {/* T4 */}
        <td className="px-1 py-2 text-center">
          <span className={`text-xs font-black ${(atlet.pingat_tempat4 || 0) > 0 ? 'text-slate-400' : 'text-gray-200'}`}>
            {atlet.pingat_tempat4 || 0}
          </span>
        </td>

        {/* Mata */}
        <td className="px-2 py-2 text-center">
          <span className={`text-sm font-black ${isTop3 || isDipilih ? 'text-[#003399]' : 'text-gray-600'}`}>
            {atlet.jumlahMata || 0}
          </span>
        </td>

        {/* Rekod badge */}
        <td className="px-1 py-2 text-center">
          {rekodList.length > 0 && (() => {
            const REKOD_COLOR = {
              K: 'bg-amber-400 text-white border-amber-500',
              N: 'bg-blue-500 text-white border-blue-600',
              D: 'bg-green-500 text-white border-green-600',
            }
            const peringkats = [...new Set(rekodList.map(r => r.peringkat).filter(Boolean))]
              .sort((a, b) => ['K','N','D'].indexOf(a) - ['K','N','D'].indexOf(b))
            return (
              <div className="flex flex-col gap-0.5 items-center">
                {peringkats.map(p => (
                  <span key={p} className={`text-[7px] font-black px-1 py-0.5 rounded border leading-tight ${REKOD_COLOR[p] || 'bg-red-100 text-red-700 border-red-300'}`}>
                    R{p}
                  </span>
                ))}
                {peringkats.length === 0 && (
                  <span className="text-[7px] font-black px-1 py-0.5 rounded border bg-red-100 text-red-700 border-red-300">R</span>
                )}
              </div>
            )
          })()}
        </td>

        {/* Pilih button */}
        <td className="px-2 py-2 text-center" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => onPilih(atlet)}
            className={`text-[9px] font-bold px-2 py-1 rounded-lg border transition-colors ${
              isDipilih
                ? 'bg-yellow-400 text-white border-yellow-500 hover:bg-yellow-500'
                : 'bg-white text-[#003399] border-[#003399] hover:bg-blue-50'
            }`}
          >
            {isDipilih ? '★ Dipilih' : 'Pilih'}
          </button>
        </td>

        {/* Expand toggle */}
        <td className="px-1 py-2 text-center text-gray-300 text-[10px] w-5">
          {acaraList.length > 0 ? (expand ? '▲' : '▼') : null}
        </td>
      </tr>

      {/* ── Expand Panel ── */}
      {expand && (
        <tr className={`border-b border-gray-200 ${
          isDipilih ? 'bg-amber-50' : rank === 1 ? 'bg-yellow-50' : rank === 2 ? 'bg-gray-50' : rank === 3 ? 'bg-orange-50' : 'bg-slate-50'
        }`}>
          <td colSpan={10} className="px-5 pb-4 pt-1.5 space-y-3">

            {/* Senarai Acara */}
            <div>
              <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Acara Dimenangi</p>
              <div className="overflow-x-auto">
                <table className="text-[10px] w-full">
                  <thead>
                    <tr className="text-[8px] text-gray-400 border-b border-gray-200">
                      <th className="text-left pb-1 font-semibold">Acara</th>
                      <th className="text-center pb-1 font-semibold w-20">Pingat</th>
                      <th className="text-center pb-1 font-semibold w-20">Prestasi</th>
                      <th className="text-center pb-1 font-semibold w-10">+Mata</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acaraList.map((a, i) => {
                      const s = PINGAT_STYLE[a.pingat] || PINGAT_STYLE.tempat4
                      return (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="py-1 font-semibold text-gray-700">{a.namaAcara || a.aceraId}</td>
                          <td className="py-1 text-center">
                            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[9px] font-bold ${s.bg}`}>
                              <span className={`w-3 h-3 rounded-full border flex items-center justify-center text-[7px] font-black ${s.coin}`}>{s.label}</span>
                              {s.short}
                            </span>
                          </td>
                          <td className="py-1 text-center font-mono text-gray-700">{formatPrestasi(a.prestasi, a.unit)}</td>
                          <td className="py-1 text-center font-black text-[#003399]">+{a.mata || 0}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Rekod Dipecahkan */}
            {rekodList.length > 0 && (
              <div>
                <p className="text-[8px] font-bold text-red-500 uppercase tracking-widest mb-1.5">Rekod Dipecahkan</p>
                <div className="space-y-2">
                  {rekodList.map((r, i) => (
                    <div key={i} className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded-full text-white ${
                          r.peringkat === 'K' ? 'bg-amber-500' :
                          r.peringkat === 'N' ? 'bg-blue-600' :
                          'bg-green-600'
                        }`}>
                          R{r.peringkat} — {PERINGKAT_LABEL[r.peringkat] || r.peringkat}
                        </span>
                        <span className="text-[10px] font-bold text-gray-800">{r.namaAcara}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[9px]">
                        {/* Rekod Lama */}
                        <div className="bg-gray-100 rounded-lg px-2.5 py-2">
                          <p className="text-[8px] font-bold text-gray-400 uppercase mb-1">Rekod Lama</p>
                          <p className="font-black text-gray-700 text-xs">{formatPrestasi(r.prestasiLama, r.unit)}</p>
                          {r.tahunLama  && <p className="text-gray-500 mt-0.5">Tahun: {r.tahunLama}</p>}
                          {r.namaLama   && <p className="text-gray-600 font-semibold">{r.namaLama}</p>}
                          {r.lokasiLama && <p className="text-gray-400">{r.lokasiLama}</p>}
                        </div>
                        {/* Rekod Baru */}
                        <div className="bg-green-50 border border-green-200 rounded-lg px-2.5 py-2">
                          <p className="text-[8px] font-bold text-green-500 uppercase mb-1">Rekod Baru</p>
                          <p className="font-black text-green-700 text-xs">{formatPrestasi(r.prestasiBaru, r.unit)}</p>
                          {r.tarikhBaru && <p className="text-green-600 mt-0.5">{r.tarikhBaru}</p>}
                          {r.prestasiLama != null && r.prestasiBaru != null && (
                            <p className="text-green-600 font-semibold mt-0.5">
                              {formatSelisih(r.prestasiBaru, r.prestasiLama, r.unit)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </td>
        </tr>
      )}
    </>
  )
}

// ─── Ranking Table per Jantina ────────────────────────────────────────────────

function RankingTable({ data, jantina, pilihanNoKP, onPilih }) {
  const filtered = data.filter(a => a.jantina === jantina && (a.jumlahMata || 0) > 0)
  const ranked   = rankWithTies([...filtered].sort(sortOlahragawan))
  const isL      = jantina === 'L'
  const title    = isL ? 'Olahragawan' : 'Olahragawati'
  const headerCls = isL
    ? 'bg-blue-700 text-white'
    : 'bg-pink-600 text-white'

  return (
    <div className="flex-1 min-w-0 border border-gray-200 rounded-xl overflow-hidden">
      <div className={`px-4 py-2.5 flex items-center justify-between ${headerCls}`}>
        <span className="text-xs font-bold">{isL ? '♂' : '♀'} {title}</span>
        <span className="text-[9px] font-semibold opacity-80">{ranked.length} atlet</span>
      </div>

      {ranked.length === 0 ? (
        <div className="py-8 text-center text-gray-400 text-xs">Tiada data lagi.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-[8px] font-bold text-gray-400 uppercase tracking-wide">
                <th className="px-2 py-2 text-center w-8">Kd</th>
                <th className="px-2 py-2 text-left">Nama / Sekolah</th>
                <th className="px-1 py-2 text-center text-yellow-600" title="Emas">E</th>
                <th className="px-1 py-2 text-center text-gray-400"  title="Perak">P</th>
                <th className="px-1 py-2 text-center text-orange-400" title="Gangsa">G</th>
                <th className="px-1 py-2 text-center"                title="Tempat 4">4</th>
                <th className="px-1 py-2 text-center text-[#003399]">Mata</th>
                <th className="px-1 py-2 text-center text-red-400"   title="Rekod Pecah (RD=Daerah, RN=Negeri, RK=Kebangsaan)">Rkd</th>
                <th className="px-2 py-2 text-center">Pilih</th>
                <th className="w-5"></th>
              </tr>
            </thead>
            <tbody>
              {ranked.map(atlet => (
                <AtletRow
                  key={atlet.id}
                  atlet={atlet}
                  rank={atlet.rank}
                  isDipilih={atlet.noKP === pilihanNoKP}
                  onPilih={atlet => onPilih(atlet, jantina)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Murid Terbaik Card ───────────────────────────────────────────────────────

function MuridTerbaikCard({ jantina, pilihan, liveData, onTukar }) {
  const isL    = jantina === 'L'
  const title  = isL ? 'Olahragawan' : 'Olahragawati'
  const color  = isL ? 'border-blue-200 bg-blue-50' : 'border-pink-200 bg-pink-50'
  const txtClr = isL ? 'text-blue-700' : 'text-pink-700'

  if (!pilihan) {
    return (
      <div className={`border-2 border-dashed rounded-xl px-4 py-3 flex-1 min-w-0 ${color}`}>
        <p className={`text-[9px] font-bold uppercase tracking-wide mb-1 ${txtClr}`}>{isL ? '♂' : '♀'} {title}</p>
        <p className="text-xs text-gray-400 italic">Belum dipilih</p>
        <p className="text-[9px] text-gray-400 mt-0.5">Klik [Pilih] dalam senarai ranking</p>
      </div>
    )
  }

  // Ambil mata TERKINI dari onSnapshot (liveData) bukan dari snapshot pilihan
  const live = liveData || {}
  const emas   = live.pingat_emas   || 0
  const perak  = live.pingat_perak  || 0
  const gangsa = live.pingat_gangsa || 0
  const mata   = live.jumlahMata    || 0

  return (
    <div className={`border-2 rounded-xl px-4 py-3 flex-1 min-w-0 ${color}`}>
      <div className="flex items-start justify-between mb-1">
        <p className={`text-[9px] font-bold uppercase tracking-wide ${txtClr}`}>★ {isL ? '♂' : '♀'} {title}</p>
        <button onClick={onTukar} className="text-[8px] text-gray-400 hover:text-red-500 underline">
          Nyah Pilih
        </button>
      </div>
      <p className="text-sm font-black text-gray-800 leading-snug">{pilihan.namaAtlet}</p>
      <p className="text-[10px] text-gray-500 mb-1.5">{pilihan.namaSekolah || pilihan.kodSekolah}</p>
      <div className="flex gap-2 text-[9px]">
        {emas   > 0 && <span className="text-yellow-600 font-bold">E×{emas}</span>}
        {perak  > 0 && <span className="text-gray-500 font-bold">P×{perak}</span>}
        {gangsa > 0 && <span className="text-orange-500 font-bold">G×{gangsa}</span>}
        <span className="font-black text-[#003399] ml-1">{mata} mata</span>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Olahragawan() {
  const { userData }  = useAuth()
  const [selKej, setSelKej]             = useState('')
  const [namaKej, setNamaKej]           = useState('')
  const [allData, setAllData]           = useState([])
  const [pilihan, setPilihan]           = useState({}) // key: `${kat}_${jantina}` → rec
  const [loading, setLoading]           = useState(false)
  const [selKat, setSelKat]             = useState('')
  const [lastUpdate, setLastUpdate]     = useState(null)
  const [savingPilihan, setSavingPilihan] = useState(false)
  const [kategoriList, setKategoriList] = useState([]) // dari Firestore
  const unsubRef = useRef(null)

  // ── Kategori dari Firestore ──────────────────────────────────────────────
  useEffect(() => {
    getDocs(query(collection(db, 'kategori'), orderBy('urutan')))
      .then(snap => setKategoriList(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {})
  }, [])

  // Helpers dinamik (fallback ke hardcode jika Firestore belum loaded)
  function katLabel(kod) {
    const info = kategoriList.find(k => k.kod === kod)
    if (info) return `Kat ${kod} — Bwh ${info.umurHad}`
    return KAT_LABEL_FALLBACK[kod] || `Kat ${kod}`
  }
  // Urutan kategori — dari Firestore (ikut urutan), fallback ke A-E-PPKI
  const katOrder = kategoriList.length > 0
    ? kategoriList.map(k => k.kod)
    : ['A', 'B', 'C', 'D', 'E', 'PPKI']

  // ── Kejohanan aktif ──────────────────────────────────────────────────────
  useEffect(() => {
    getDocs(query(collection(db, 'kejohanan'), where('statusKejohanan', '==', 'aktif')))
      .then(snap => {
        if (!snap.empty) {
          const d = snap.docs[0]
          setSelKej(d.data().kejohananId || d.id)
          setNamaKej(d.data().namaKejohanan || '')
        }
      }).catch(() => {})
  }, [])

  // ── Real-time mata_olahragawan ───────────────────────────────────────────
  useEffect(() => {
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null }
    if (!selKej) { setAllData([]); return }
    setLoading(true)
    unsubRef.current = onSnapshot(
      query(collection(db, 'mata_olahragawan'), where('kejohananId', '==', selKej)),
      snap => {
        setAllData(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setLastUpdate(new Date())
        setLoading(false)
      },
      () => setLoading(false)
    )
    return () => { if (unsubRef.current) unsubRef.current() }
  }, [selKej])

  // ── Load pilihan admin ───────────────────────────────────────────────────
  useEffect(() => {
    if (!selKej) { setPilihan({}); return }
    getDocs(query(collection(db, 'pilihan_olahragawan'), where('kejohananId', '==', selKej)))
      .then(snap => {
        const map = {}
        snap.docs.forEach(d => {
          const r = d.data()
          map[`${r.kategoriKod}_${r.jantina}`] = r
        })
        setPilihan(map)
      }).catch(() => {})
  }, [selKej])

  // ── Kat yang ada data ────────────────────────────────────────────────────
  // Ikut urutan dari Firestore; termasuk kat yang ada data walaupun tiada dalam kategoriList
  const katDariData = [...new Set(allData.filter(a => (a.jumlahMata || 0) > 0).map(a => a.kategoriKod).filter(Boolean))]
  const katAda = [
    ...katOrder.filter(k => katDariData.includes(k)),
    ...katDariData.filter(k => !katOrder.includes(k)),
  ]
  const activeKat = selKat && katAda.includes(selKat) ? selKat : (katAda[0] || '')

  // ── Pilih Murid Terbaik ──────────────────────────────────────────────────
  async function handlePilih(atlet, jantina) {
    if (!selKej || savingPilihan) return
    const key    = `${atlet.kategoriKod}_${jantina}`
    const docId  = `${selKej}_${atlet.kategoriKod}_${jantina}`
    const ref    = doc(db, 'pilihan_olahragawan', docId)
    const isSame = pilihan[key]?.noKP === atlet.noKP
    setSavingPilihan(true)
    try {
      if (isSame) {
        await deleteDoc(ref)
        setPilihan(p => { const n = { ...p }; delete n[key]; return n })
      } else {
        const payload = {
          kejohananId: selKej,
          kategoriKod: atlet.kategoriKod,
          jantina,
          noKP:        atlet.noKP,
          namaAtlet:   atlet.namaAtlet  || '',
          kodSekolah:  atlet.kodSekolah || '',
          namaSekolah: atlet.namaSekolah || atlet.kodSekolah || '',
          // Mata TIDAK disimpan — ambil live dari mata_olahragawan semasa cetak/papar
          dipilihOleh: userData?.uid || '',
          dipilihPada: serverTimestamp(),
        }
        await setDoc(ref, payload)
        setPilihan(p => ({ ...p, [key]: payload }))
      }
    } catch (e) { alert('Gagal simpan pilihan: ' + e.message) }
    finally { setSavingPilihan(false) }
  }

  // ── Cetak PDF ────────────────────────────────────────────────────────────
  async function cetakPDF(jenis, katFilter) {
    const { jsPDF }         = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const W   = 210

    // ── Header global
    pdf.setFontSize(13); pdf.setFont('helvetica', 'bold')
    pdf.text('SENARAI MURID TERBAIK KEJOHANAN', W / 2, 15, { align: 'center' })
    pdf.setFontSize(9);  pdf.setFont('helvetica', 'normal')
    pdf.text(namaKej || 'Kejohanan Olahraga', W / 2, 21, { align: 'center' })
    pdf.setDrawColor(0, 51, 153); pdf.setLineWidth(0.5)
    pdf.line(12, 24, W - 12, 24)

    const katsList = jenis === 'satu' && katFilter ? [katFilter] : katAda

    if (jenis === 'terbaik') {
      // ── PDF A: Murid Terbaik sahaja — 1 halaman
      const rows = katsList.map(kat => {
        const pL = pilihan[`${kat}_L`]
        const pP = pilihan[`${kat}_P`]
        const fmt = p => p
          ? `${p.namaAtlet}\n${p.namaSekolah || p.kodSekolah}\nMata: ${p.jumlahMata} (E${p.pingat_emas||0} P${p.pingat_perak||0} G${p.pingat_gangsa||0})`
          : 'Belum dipilih'
        return [katLabel(kat), fmt(pL), fmt(pP)]
      })
      autoTable(pdf, {
        startY: 30,
        head: [['Kategori', 'Olahragawan (Lelaki)', 'Olahragawati (Perempuan)']],
        body: rows,
        styles: { fontSize: 9, cellPadding: 4, valign: 'top' },
        headStyles: { fillColor: [0, 51, 153], fontSize: 8, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 42 }, 1: { cellWidth: 74 }, 2: { cellWidth: 74 } },
        theme: 'grid',
      })

    } else {
      // ── PDF B/C: Ranking full per kat
      katsList.forEach((kat, ki) => {
        if (ki > 0) pdf.addPage()
        let y = 30
        const katLabelStr = katLabel(kat)

        pdf.setFontSize(11); pdf.setFont('helvetica', 'bold')
        pdf.text(katLabelStr.toUpperCase(), 12, y); y += 8

        ;['L', 'P'].forEach(j => {
          const title  = j === 'L' ? 'OLAHRAGAWAN' : 'OLAHRAGAWATI'
          const pil    = pilihan[`${kat}_${j}`]
          const ranked = rankWithTies(
            allData
              .filter(a => a.kategoriKod === kat && a.jantina === j && (a.jumlahMata || 0) > 0)
              .sort(sortOlahragawan)
          )

          pdf.setFontSize(9); pdf.setFont('helvetica', 'bold')
          pdf.setTextColor(j === 'L' ? 0 : 190, 0, j === 'L' ? 153 : 80)
          pdf.text(title, 12, y)
          pdf.setTextColor(0, 0, 0)
          if (pil) {
            pdf.setFontSize(8); pdf.setFont('helvetica', 'italic')
            pdf.text(`★ Murid Terbaik: ${pil.namaAtlet} (${pil.namaSekolah || pil.kodSekolah})`, 55, y)
          }
          y += 5

          const rows = ranked.map(a => {
            const rekodList  = getRekodDetail(a)
            const rekodStr   = rekodList.length > 0
              ? rekodList.map(r =>
                  `${r.namaAcara} [${PERINGKAT_LABEL[r.peringkat] || r.peringkat}]: ${formatPrestasi(r.prestasiBaru, r.unit)} (lama: ${formatPrestasi(r.prestasiLama, r.unit)}, ${r.tahunLama || '—'}, ${r.namaLama || '—'})`
                ).join('\n')
              : '—'
            return [
              a.rank,
              `${a.namaAtlet || '—'}\n${a.namaSekolah || a.kodSekolah || '—'}`,
              a.pingat_emas   || 0,
              a.pingat_perak  || 0,
              a.pingat_gangsa || 0,
              a.pingat_tempat4|| 0,
              a.jumlahMata    || 0,
              rekodStr,
            ]
          })

          autoTable(pdf, {
            startY: y,
            head: [['#', 'Nama / Sekolah', 'E', 'P', 'G', 'T4', 'Mata', 'Rekod Dipecahkan']],
            body: rows,
            styles: { fontSize: 7.5, cellPadding: 2, valign: 'top' },
            headStyles: { fillColor: [60, 60, 60], fontSize: 7, fontStyle: 'bold' },
            columnStyles: {
              0: { cellWidth: 8,  halign: 'center' },
              1: { cellWidth: 55 },
              2: { cellWidth: 8,  halign: 'center' },
              3: { cellWidth: 8,  halign: 'center' },
              4: { cellWidth: 8,  halign: 'center' },
              5: { cellWidth: 8,  halign: 'center' },
              6: { cellWidth: 10, halign: 'center' },
              7: { cellWidth: 'auto' },
            },
            theme: 'striped',
          })
          y = pdf.lastAutoTable.finalY + 6
        })
      })
    }

    const fname = jenis === 'terbaik'
      ? 'MuridTerbaik'
      : jenis === 'satu' && katFilter ? `Kat${katFilter}_Ranking`
      : 'SemuaKat_Ranking'
    pdf.save(`Olahragawan_${fname}_${namaKej || 'KOAM'}.pdf`)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 max-w-6xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-base font-bold text-gray-800">Olahragawan & Olahragawati</h1>
          <p className="text-xs text-gray-500 mt-0.5">Admin · Sulit · Ranking per Kategori · Real-time</p>
          {namaKej && <p className="text-xs font-semibold text-[#003399] mt-0.5">{namaKej}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {lastUpdate && (
            <span className="text-[9px] text-gray-400 font-mono">{lastUpdate.toLocaleTimeString('ms-MY', { hour12: true })}</span>
          )}
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
          <button onClick={() => cetakPDF('terbaik')}
            className="text-[10px] font-bold px-3 py-1.5 bg-[#003399] text-white rounded-lg hover:bg-[#002288]">
            Cetak Murid Terbaik
          </button>
          {activeKat && (
            <button onClick={() => cetakPDF('satu', activeKat)}
              className="text-[10px] font-bold px-3 py-1.5 bg-gray-700 text-white rounded-lg hover:bg-gray-800">
              Cetak Kat {activeKat}
            </button>
          )}
          <button onClick={() => cetakPDF('semua')}
            className="text-[10px] font-bold px-3 py-1.5 bg-gray-500 text-white rounded-lg hover:bg-gray-600">
            Cetak Semua
          </button>
        </div>
      </div>

      {!selKej ? (
        <div className="py-16 text-center bg-white rounded-xl border border-gray-200 text-gray-400">
          <p className="text-sm font-semibold">Tiada kejohanan aktif.</p>
        </div>

      ) : loading ? (
        <div className="py-12 flex items-center justify-center gap-2 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Memuatkan…
        </div>

      ) : katAda.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-xl border border-gray-200">
          <p className="text-sm font-semibold text-gray-500">Tiada data lagi.</p>
          <p className="text-xs text-gray-400 mt-1">Mata dikira automatik selepas keputusan RASMI.</p>
        </div>

      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">

          {/* Tab Kategori */}
          <div className="flex border-b border-gray-200 overflow-x-auto">
            {katAda.map(kat => (
              <button key={kat} onClick={() => setSelKat(kat)}
                className={`px-5 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition-colors ${
                  activeKat === kat
                    ? 'border-[#003399] text-[#003399] bg-blue-50/60'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}>
                {katLabel(kat)}
                <span className="ml-1.5 text-[8px] bg-gray-100 text-gray-500 px-1 py-0.5 rounded-full font-semibold">
                  {allData.filter(a => a.kategoriKod === kat && (a.jumlahMata || 0) > 0).length}
                </span>
              </button>
            ))}
          </div>

          {/* Content */}
          {activeKat && (
            <div className="p-4 space-y-4">

              {/* Murid Terbaik Cards */}
              <div className="flex gap-3 flex-wrap sm:flex-nowrap">
                {['L', 'P'].map(j => {
                  const pil = pilihan[`${activeKat}_${j}`] || null
                  // Cari data terkini (live) dari onSnapshot berdasarkan noKP pilihan
                  const live = pil ? allData.find(a => a.noKP === pil.noKP) : null
                  return (
                  <MuridTerbaikCard
                    key={j}
                    jantina={j}
                    pilihan={pil}
                    liveData={live}
                    onTukar={() => handlePilih(pil, j)}
                  />
                )})}
              </div>

              {/* Ranking side-by-side */}
              <div className="flex gap-3 flex-wrap lg:flex-nowrap">
                {['L', 'P'].map(j => (
                  <RankingTable
                    key={j}
                    data={allData.filter(a => a.kategoriKod === activeKat)}
                    jantina={j}
                    pilihanNoKP={pilihan[`${activeKat}_${j}`]?.noKP || null}
                    onPilih={handlePilih}
                  />
                ))}
              </div>

            </div>
          )}
        </div>
      )}

      {/* Nota */}
      {selKej && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-[10px] text-blue-700 space-y-0.5">
          <p className="font-bold">Nota Sistem:</p>
          <p>· Mata: Emas=5, Perak=3, Gangsa=2, Tempat 4=1. Tempat ke-5 ke bawah: tiada mata.</p>
          <p>· Relay: Pingat untuk sekolah sahaja — tiada mata individu.</p>
          <p>· Tiebreak: Jumlah Mata → Emas → Perak → Gangsa → Nama (abjad).</p>
          <p>· R = Rekod dipecahkan dalam kejohanan ini. Klik baris untuk detail.</p>
          <p>· Pilihan Murid Terbaik adalah manual oleh admin — boleh tukar bila-bila masa.</p>
        </div>
      )}
    </div>
  )
}
