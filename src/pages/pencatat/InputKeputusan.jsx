/**
 * pencatat/InputKeputusan — /{slug}/pencatat/kejohanan/:kejId/keputusan
 * Gold Podium multi-tenant — pencatat role
 *
 * Firestore paths (GP):
 *   tenants/{sId}/kejohanan/{kId}              — kejohanan doc
 *   tenants/{sId}/kejohanan/{kId}/acara        — senarai acara
 *   tenants/{sId}/kejohanan/{kId}/heat/{hId}   — heat FLAT, field aceraId
 *   tenants/{sId}/kejohanan/{kId}/tetapan/finalSetup
 *   tenants/{sId}/sekolah/{kodSekolah}         — nama sekolah lookup
 *
 * Flow: Senarai acara (hari tabs | search | accordion kategori)
 *       → Pilih acara → Tab heat (atau Mod Semua Peserta)
 *       → Input → Simpan Draf / Hantar Rasmi
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  collection, getDocs, getDoc, doc, updateDoc, setDoc,
  query, where, orderBy, serverTimestamp, onSnapshot, runTransaction,
} from 'firebase/firestore'
import { selectFinalists, getFinalistSetup, serpentineSeed } from '../../utils/finalistUtils'
import { assignLorongFinal, detectJenisLorong, WA_LORONG_KUMPULAN_DEFAULT, deserializeKumpulan, resolveIsLompatTinggi } from '../../utils/startListPdfUtils'
import { runPostRasmi, rollbackPostRasmi } from '../../utils/postRasmiUtils'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import { useNavigate, useParams } from 'react-router-dom'

// ─── Constants ────────────────────────────────────────────────────────────────

const JENIS_LABEL = {
  lorong:        'Larian Lorong',
  mass_start:    'Mass Start',
  padang_lompat: 'Padang Lompat',
  padang_balin:  'Padang Balin',
  relay:         'Relay',
}

// ─── Helpers masa ─────────────────────────────────────────────────────────────

function fmtJam(d) {
  return d.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

function parseMasaInput(raw) {
  if (raw === '' || raw == null) return ''
  const s = String(raw).trim().replace(/:/g, '.')
  const parts = s.split('.')
  if (parts.length === 3) {
    const mm = Number(parts[0]) || 0
    const ss = Number(parts[1]) || 0
    const ms = Number(parts[2]) || 0
    const msFrac = ms / Math.pow(10, parts[2].length)
    return mm * 60 + ss + msFrac
  }
  if (parts.length === 2) {
    const a = Number(parts[0]) || 0
    const b = Number(parts[1]) || 0
    const bFrac = b / Math.pow(10, parts[1].length)
    return a + bFrac
  }
  return Number(s) || ''
}

function fmtMasaDisplay(saat) {
  if (saat === '' || saat == null) return ''
  const n = Number(saat)
  if (isNaN(n) || n <= 0) return ''
  const m = Math.floor(n / 60)
  const s = (n % 60).toFixed(2).padStart(5, '0')
  return m > 0 ? `${m}:${s}` : `${Number(s).toFixed(2)}s`
}

// ─── Ranking helpers ──────────────────────────────────────────────────────────

function kiraLaranRank(slots, keputusan) {
  const rows = slots.map(slot => {
    const kp = keputusan[slot] || {}
    const flagged = ['DNS', 'DNF', 'DQ'].includes(kp.status)
    const masa = flagged ? null : (Number(kp.keputusan) || null)
    const masaSebenar = flagged ? null : (Number(kp.masaSebenar) || null)
    return { slot, masa, masaSebenar, flagged }
  })
  const sorted = [...rows].sort((a, b) => {
    if (a.masa !== null && b.masa !== null) {
      if (a.masa !== b.masa) return a.masa - b.masa
      if (a.masaSebenar !== null && b.masaSebenar !== null) return a.masaSebenar - b.masaSebenar
      if (a.masaSebenar !== null) return -1
      if (b.masaSebenar !== null) return 1
      return 0
    }
    if (a.masa !== null) return -1
    if (b.masa !== null) return 1
    return 0
  })
  const rankMap = {}
  let rank = 1
  sorted.forEach((r, i) => {
    if (r.masa === null) { rankMap[r.slot] = null; return }
    const prev = sorted[i - 1]
    const isTie = i > 0 && prev.masa === r.masa &&
      (prev.masaSebenar === null || r.masaSebenar === null || prev.masaSebenar === r.masaSebenar)
    rankMap[r.slot] = isTie ? rankMap[prev.slot] : rank
    rank++
  })
  return rankMap
}

function kesanKonflikMasa(slots, keputusan) {
  const konflik = new Set()
  const rows = slots.map(slot => {
    const kp = keputusan[slot] || {}
    const flagged = ['DNS', 'DNF', 'DQ'].includes(kp.status)
    const masa = flagged ? null : (Number(kp.keputusan) || null)
    const masaSebenar = flagged ? null : (Number(kp.masaSebenar) || null)
    return { slot, masa, masaSebenar }
  }).filter(r => r.masa !== null)

  rows.forEach((r, i) => {
    rows.forEach((r2, j) => {
      if (i >= j) return
      if (r.masa === r2.masa) {
        const bolehPecah = r.masaSebenar !== null && r2.masaSebenar !== null && r.masaSebenar !== r2.masaSebenar
        if (!bolehPecah) { konflik.add(r.slot); konflik.add(r2.slot) }
      }
    })
  })
  return konflik
}

function kiraPadangRank(peserta, keputusan) {
  const rows = peserta.map((p, idx) => {
    const key = p.noBib || idx
    const kp = keputusan[key] || {}
    const flagged = ['DNS', 'DNF', 'DQ'].includes(kp.status)
    const best = flagged ? null : (Number(kp.keputusan) || null)
    return { key, best, flagged }
  })
  const sorted = [...rows].sort((a, b) => {
    if (a.best !== null && b.best !== null) return b.best - a.best
    if (a.best !== null) return -1
    if (b.best !== null) return 1
    return 0
  })
  const rankMap = {}
  let rank = 1
  sorted.forEach((r, i) => {
    if (r.best === null) { rankMap[r.key] = null; return }
    if (i > 0 && sorted[i - 1].best === r.best) {
      rankMap[r.key] = rankMap[sorted[i - 1].key]
    } else {
      rankMap[r.key] = rank
    }
    rank++
  })
  return rankMap
}

// ─── Small components ─────────────────────────────────────────────────────────

function HeatDots({ total, rasmi, draf }) {
  if (!total) return <span className="text-[10px] text-gray-300">—</span>
  return (
    <span className="flex gap-0.5 items-center">
      {Array.from({ length: total }, (_, i) => {
        const cls = i < rasmi ? 'bg-green-500' : i < rasmi + draf ? 'bg-amber-400' : 'bg-gray-200'
        return <span key={i} className={`w-2 h-2 rounded-full ${cls}`} />
      })}
    </span>
  )
}

function jadualMasaInfo(masaMula, nowMs) {
  if (!masaMula) return null
  const [h, m] = masaMula.split(':').map(Number)
  const now = new Date(nowMs)
  const startMs = new Date(now).setHours(h, m, 0, 0)
  const diffMin = (startMs - nowMs) / 60000
  if (nowMs > startMs + 90 * 60000) return { label: masaMula, cls: 'text-gray-300' }
  if (nowMs > startMs) return { label: `${masaMula} ● SEDANG`, cls: 'text-orange-500 font-bold animate-pulse' }
  if (diffMin <= 30) return { label: `${masaMula} ↑ ${Math.ceil(diffMin)}min lagi`, cls: 'text-amber-500 font-semibold' }
  return { label: masaMula, cls: 'text-[#003399]' }
}

function AcaraRow({ acara, isLast, nowMs, onClick }) {
  const masaInfo = acara.masa ? jadualMasaInfo(acara.masa, nowMs || Date.now()) : null
  const selesai  = acara._rasmiHeat || 0
  const draf     = acara._drafHeat  || 0
  const total    = acara._totalHeat || 0
  const allDone  = total > 0 && selesai === total
  const anyDone  = selesai > 0

  const borderCls = allDone ? 'border-l-green-500' : anyDone ? 'border-l-green-400'
    : draf > 0 ? 'border-l-amber-400' : total > 0 ? 'border-l-gray-200' : 'border-l-transparent'

  const badge = allDone
    ? { text: '✓ Siap', cls: 'bg-green-500 text-white' }
    : anyDone ? { text: `✓ ${selesai}/${total}`, cls: 'bg-green-100 text-green-700' }
    : draf > 0 ? { text: '⏳ Draf', cls: 'bg-amber-100 text-amber-700' }
    : total > 0 ? { text: `${total}H Belum`, cls: 'bg-gray-100 text-gray-400' }
    : { text: 'Belum', cls: 'bg-gray-100 text-gray-400' }

  const peringkat = acara.peringkat || ''
  const jenisBadge = ['saringan_qf','saringan_sf','separuh_akhir'].includes(peringkat)
    ? { text: peringkat === 'saringan_qf' ? 'Saringan/QF' : peringkat === 'saringan_sf' ? 'Saringan/SF' : 'Separuh Akhir', cls: 'bg-blue-50 text-blue-600 border border-blue-100' }
    : ['akhir', 'final_p'].includes(peringkat)
    ? { text: 'Final', cls: 'bg-amber-50 text-amber-600 border border-amber-100' }
    : { text: 'Terus Final', cls: 'bg-purple-50 text-purple-500 border border-purple-100' }

  return (
    <button onClick={onClick}
      className={`w-full text-left border-l-4 ${borderCls} ${!isLast ? 'border-b border-gray-50' : ''} ${
        allDone ? 'bg-green-50/40 hover:bg-green-50/60' : 'hover:bg-blue-50/30'
      } active:bg-blue-50/60 transition-colors`}>
      <div className="grid px-3 py-2.5 items-center gap-1.5"
        style={{ gridTemplateColumns: '36px 44px 1fr 58px 64px' }}>
        <div className="flex items-center justify-center">
          {allDone
            ? <span className="text-sm text-green-500 font-black">✓</span>
            : <span className="text-xs font-black text-[#003399]">{acara.noAcara ?? '—'}</span>}
        </div>
        <div className="flex items-center">
          {masaInfo
            ? <span className={`text-[10px] font-semibold leading-tight ${allDone ? 'text-gray-300' : masaInfo.cls}`}>{masaInfo.label}</span>
            : <span className="text-[10px] text-gray-300">—</span>}
        </div>
        <div className="min-w-0">
          <p className={`text-[11px] font-bold leading-tight truncate ${allDone ? 'text-gray-400' : 'text-gray-800'}`}>
            {acara.namaAcara || '—'}
          </p>
          <p className="text-[9px] text-gray-400 leading-tight mt-0.5 truncate">
            {acara.jantina === 'L' ? 'Lelaki' : acara.jantina === 'P' ? 'Perempuan' : (acara.jantina || '')}
            {(acara.kategoriKod || acara.kategori) ? ` · ${acara.kategoriKod || acara.kategori}` : ''}
          </p>
        </div>
        <div className="flex items-center justify-center">
          <span className={`text-[8px] font-bold px-1 py-0.5 rounded whitespace-nowrap ${jenisBadge.cls}`}>
            {jenisBadge.text}
          </span>
        </div>
        <div className="flex items-center justify-end">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${badge.cls}`}>
            {badge.text}
          </span>
        </div>
      </div>
    </button>
  )
}

function AccordionSection({ title, count, open, onToggle, children }) {
  return (
    <div className="border border-gray-100 rounded-2xl overflow-hidden">
      <button onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-700">{title}</span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white text-gray-400 border border-gray-200">
            {count} acara
          </span>
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="p-3 space-y-0 bg-white">{children}</div>}
    </div>
  )
}

function HeatTabBar({ heats, selectedHeat, onSelect }) {
  if (!heats || heats.length <= 1) return null
  const hasSaringan = heats.some(h => h.fasa === 'heat' || h.fasa === 'saringan_qf' || h.fasa === 'saringan_sf')
  return (
    <div className="flex gap-1.5 overflow-x-auto py-0.5">
      {heats.map(h => {
        const isSelected = selectedHeat?.heatId === h.heatId
        const isFinal = h.fasa === 'final' || h.fasa === 'terus_final'
        const label = isFinal ? (hasSaringan ? 'FINAL' : 'TERUS FINAL') : `Heat ${h.noHeat}`
        const dotCls = ['rasmi', 'diterima'].includes(h.statusKeputusan) ? 'bg-green-400'
          : h.statusKeputusan === 'tidak_rasmi' ? 'bg-amber-400'
          : h.statusKeputusan === 'dalam_bantahan' ? 'bg-red-400'
          : 'bg-gray-300'
        return (
          <button key={h.heatId} onClick={() => onSelect(h)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
              isFinal
                ? isSelected ? 'bg-amber-500 text-white shadow-sm' : 'bg-amber-50 border border-amber-300 text-amber-700 hover:border-amber-400'
                : isSelected ? 'bg-[#003399] text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:border-[#003399]/30 hover:text-[#003399]'
            }`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isSelected ? 'bg-white/60' : dotCls}`} />
            <span className={isFinal ? 'font-black tracking-wide' : ''}>{label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Input Semua Peserta (semua heat dalam satu table) ─────────────────────────

function InputSemuaPeserta({ heats, acara, keputusanSemua, onChange, sekolahMap = {}, carianBib = '' }) {
  const semuaPeserta = useMemo(() => {
    const list = []
    for (const h of heats) {
      for (const p of (h.peserta || [])) {
        list.push({ ...p, _heatId: h.heatId, _noHeat: h.noHeat || h.heatId })
      }
    }
    return list
  }, [heats])

  const sorted = useMemo(() => {
    return [...semuaPeserta].sort((a, b) => {
      const ka = `${a._heatId}_${a.lorong ?? a.noBib}`
      const kb = `${b._heatId}_${b.lorong ?? b.noBib}`
      if (carianBib) {
        const matchA = (a.noBib || '').toUpperCase().includes(carianBib) ? 0 : 1
        const matchB = (b.noBib || '').toUpperCase().includes(carianBib) ? 0 : 1
        if (matchA !== matchB) return matchA - matchB
      }
      const ma = Number(keputusanSemua[ka]?.keputusan) || 0
      const mb = Number(keputusanSemua[kb]?.keputusan) || 0
      if (!ma && !mb) return 0
      if (!ma) return 1
      if (!mb) return -1
      return ma - mb
    })
  }, [semuaPeserta, keputusanSemua, carianBib])

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="grid bg-[#003399] text-white text-xs font-bold uppercase tracking-wider"
        style={{ gridTemplateColumns: '40px 72px 80px 1fr 100px 60px 100px' }}>
        <div className="px-2 py-3 text-center">H</div>
        <div className="px-2 py-3 text-center">Lrg</div>
        <div className="px-2 py-3 text-center">BIB</div>
        <div className="px-2 py-3">Atlet / Sekolah</div>
        <div className="px-2 py-3 text-center">Masa</div>
        <div className="px-2 py-3 text-center">Kddk</div>
        <div className="px-2 py-3 text-center">Catatan</div>
      </div>

      {sorted.map((p, idx) => {
        const slotKey = `${p._heatId}_${p.lorong ?? p.noBib}`
        const kp = keputusanSemua[slotKey] || {}
        const flagged = ['DNS', 'DNF', 'DQ'].includes(kp.status)
        const rank = idx + 1
        const hasMasa = Number(kp.keputusan) > 0 && !flagged
        const isCarian = carianBib && (p.noBib || '').toUpperCase().includes(carianBib)
        const rowBg = isCarian ? 'bg-yellow-200 ring-2 ring-yellow-400 ring-inset'
          : flagged ? 'bg-red-50'
          : hasMasa && rank === 1 ? 'bg-yellow-50'
          : hasMasa && rank === 2 ? 'bg-gray-50'
          : hasMasa && rank === 3 ? 'bg-orange-50'
          : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'

        return (
          <div key={slotKey} className={`grid border-t border-gray-100 ${rowBg}`}
            style={{ gridTemplateColumns: '40px 72px 80px 1fr 100px 60px 100px' }}>
            <div className="px-1 py-2 flex items-center justify-center">
              <span className="text-[10px] font-bold text-[#003399] bg-blue-50 rounded px-1">{p._noHeat}</span>
            </div>
            <div className="px-1 py-2 flex items-center justify-center">
              <span className="text-sm font-black text-gray-500">{p.lorong ?? '—'}</span>
            </div>
            <div className="px-1 py-2 flex items-center justify-center">
              <span className="text-sm font-black text-gray-800">{p.noBib || '—'}</span>
            </div>
            <div className="px-2 py-2 flex flex-col justify-center min-w-0">
              <span className="text-sm font-bold text-gray-800 truncate leading-tight">{p.namaAtlet || '—'}</span>
              <span className="text-[10px] text-gray-400 truncate leading-tight">{sekolahMap[p.kodSekolah] || p.kodSekolah || ''}</span>
            </div>
            <div className="px-1 py-2 flex flex-col items-center justify-center gap-0.5">
              <input type="text" inputMode="decimal"
                value={kp._raw ?? (kp.keputusan ? fmtMasaDisplay(kp.keputusan) : '')}
                onChange={e => onChange(slotKey, '_raw', e.target.value)}
                onBlur={e => {
                  const saat = parseMasaInput(e.target.value)
                  onChange(slotKey, 'keputusan', saat)
                  onChange(slotKey, '_raw', saat ? fmtMasaDisplay(saat) : e.target.value)
                }}
                placeholder="m.ss.ms" disabled={flagged}
                className="w-full border-2 border-gray-300 rounded-lg px-1 py-2 text-sm font-mono font-bold text-center text-gray-900 focus:outline-none focus:border-[#003399] bg-white disabled:bg-gray-100 disabled:text-gray-300" />
              {kp.keputusan > 0 && (
                <span className="text-[10px] font-mono text-[#003399] font-bold">{fmtMasaDisplay(kp.keputusan)}</span>
              )}
            </div>
            <div className="px-1 py-2 flex items-center justify-center">
              {hasMasa ? (
                <span className={`text-sm font-black ${rank === 1 ? 'text-yellow-600' : rank === 2 ? 'text-gray-500' : rank === 3 ? 'text-orange-600' : 'text-gray-400'}`}>
                  {rank}
                </span>
              ) : <span className="text-xs text-gray-300">—</span>}
            </div>
            <div className="px-1 py-2 flex items-center justify-center">
              <select value={kp.status || ''}
                onChange={e => onChange(slotKey, 'status', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-1 py-1.5 text-xs font-bold text-center bg-white focus:outline-none focus:border-[#003399]">
                <option value="">—</option>
                <option value="DNS">DNS</option>
                <option value="DNF">DNF</option>
                <option value="DQ">DQ</option>
              </select>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Input Lorong ─────────────────────────────────────────────────────────────

function InputLorong({ acara, heat, keputusan, onChange, onWind, windSpeed, sekolahMap = {}, carianBib = '' }) {
  const bilLorong   = acara.bilanganLorong || heat.bilanganLorong || 8
  const isWind      = acara.isWindReading || false
  const slotsAsal   = Array.from({ length: bilLorong }, (_, i) => i + 1)
  const slots = carianBib
    ? [...slotsAsal].sort((a, b) => {
        const matchA = (keputusan[a]?.noBib || '').toUpperCase().includes(carianBib) ? 0 : 1
        const matchB = (keputusan[b]?.noBib || '').toUpperCase().includes(carianBib) ? 0 : 1
        return matchA - matchB
      })
    : slotsAsal
  const rankMap      = kiraLaranRank(slotsAsal, keputusan)
  const konflikSlots = kesanKonflikMasa(slotsAsal, keputusan)

  return (
    <div className="space-y-3">
      {isWind && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5">
          <span className="text-xs font-bold text-blue-700 shrink-0">Angin (m/s)</span>
          <input type="number" step="0.1" min="-9.9" max="9.9"
            value={windSpeed ?? ''}
            onChange={e => onWind(e.target.value)}
            placeholder="+1.2"
            className="flex-1 border border-blue-200 rounded-lg px-3 py-1.5 text-sm font-mono text-center focus:outline-none focus:border-blue-400 bg-white" />
          {windSpeed !== '' && windSpeed !== null && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              Math.abs(Number(windSpeed)) <= 2 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {Math.abs(Number(windSpeed)) <= 2 ? 'SAH' : 'TIDAK SAH'}
            </span>
          )}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid bg-[#003399] text-white text-xs font-bold uppercase tracking-wider"
          style={{ gridTemplateColumns: '44px 80px 1fr 96px 60px 100px' }}>
          <div className="px-2 py-3 text-center">Lrg</div>
          <div className="px-2 py-3 text-center">No BIB</div>
          <div className="px-2 py-3">Atlet / Sekolah</div>
          <div className="px-2 py-3 text-center">Masa</div>
          <div className="px-2 py-3 text-center">Kddk</div>
          <div className="px-2 py-3 text-center">Catatan</div>
        </div>

        {slots.map((lorong, idx) => {
          const kp       = keputusan[lorong] || {}
          const isKosong = !kp.namaAtlet && !kp.noBib && !kp.kodSekolah && !kp.keputusan && !kp.status
          const rank     = rankMap[lorong]
          const flagged  = ['DNS', 'DNF', 'DQ'].includes(kp.status)
          const isCarian = carianBib && (kp.noBib || '').toUpperCase().includes(carianBib)
          const isKonflik = konflikSlots.has(lorong)
          const usedByOthers = new Set(
            slotsAsal.filter(s => s !== lorong).map(s => keputusan[s]?.kedudukan).filter(v => v !== '' && v != null)
          )
          const rowBg = isCarian ? 'bg-yellow-200 ring-2 ring-yellow-400 ring-inset'
            : flagged ? 'bg-red-50'
            : isKonflik ? 'bg-amber-50'
            : rank === 1 ? 'bg-yellow-50'
            : rank === 2 ? 'bg-gray-50'
            : rank === 3 ? 'bg-orange-50'
            : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'

          if (isKosong) {
            return (
              <div key={lorong} className="grid border-t border-gray-100 bg-gray-50"
                style={{ gridTemplateColumns: '44px 80px 1fr 96px 60px 100px' }}>
                <div className="px-1 py-3 flex items-center justify-center">
                  <span className="text-sm font-black text-gray-300">{lorong}</span>
                </div>
                <div className="col-span-5 px-3 flex items-center">
                  <span className="text-sm text-gray-300 italic">— Lorong kosong —</span>
                </div>
              </div>
            )
          }

          return (
            <div key={lorong} className={`grid border-t border-gray-100 ${rowBg}`}
              style={{ gridTemplateColumns: '44px 80px 1fr 96px 60px 100px' }}>
              <div className="px-1 py-3 flex items-center justify-center">
                <span className="text-sm font-black text-gray-700">{lorong}</span>
              </div>
              <div className="px-1 py-2 flex items-center">
                <input type="text" value={kp.noBib || ''} readOnly
                  className="w-full border border-gray-100 rounded-lg px-1.5 py-2 text-sm font-mono font-bold text-center bg-gray-50 text-gray-700 cursor-default select-none" />
              </div>
              <div className="px-2 py-2 flex flex-col justify-center min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{kp.namaAtlet || '—'}</p>
                <p className="text-xs text-gray-600 truncate leading-tight mt-0.5">
                  {(kp.kodSekolah && (sekolahMap[kp.kodSekolah] || kp.kodSekolah)) || ''}
                </p>
              </div>
              <div className="px-1 py-2 flex flex-col items-center gap-0.5">
                <input type="text" inputMode="decimal"
                  value={kp._raw ?? (kp.keputusan ? fmtMasaDisplay(kp.keputusan) : '')}
                  onChange={e => onChange(lorong, '_raw', e.target.value)}
                  onBlur={e => {
                    const saat = parseMasaInput(e.target.value)
                    onChange(lorong, 'keputusan', saat)
                    onChange(lorong, '_raw', saat ? fmtMasaDisplay(saat) : e.target.value)
                  }}
                  placeholder="m.ss.ms" disabled={flagged}
                  className={`w-full border-2 rounded-lg px-1 py-2.5 text-base font-mono font-bold text-center text-gray-900 focus:outline-none bg-white disabled:bg-gray-100 disabled:text-gray-300 ${
                    isKonflik ? 'border-amber-400 focus:border-amber-500' : 'border-gray-300 focus:border-[#003399]'
                  }`} />
                {kp.keputusan > 0 && (
                  <span className="text-[10px] font-mono text-[#003399] font-bold">{fmtMasaDisplay(kp.keputusan)}</span>
                )}
                {isKonflik && (
                  <span className="text-[9px] text-amber-600 font-bold text-center leading-tight">⚠ Masa sama</span>
                )}
              </div>
              <div className="px-1 py-2 flex items-center justify-center">
                {flagged ? <span className="text-sm font-bold text-red-400">—</span> : (
                  <select value={kp.kedudukan ?? ''}
                    onChange={e => onChange(lorong, 'kedudukan', e.target.value !== '' ? Number(e.target.value) : '')}
                    className="w-full border-2 border-gray-300 rounded-lg px-0.5 py-2.5 text-sm font-mono font-bold text-center text-gray-900 focus:outline-none focus:border-[#003399] bg-white">
                    <option value="">{rank ? `(${rank})` : '—'}</option>
                    {Array.from({ length: bilLorong }, (_, i) => {
                      const val = i + 1
                      if (usedByOthers.has(val) && kp.kedudukan !== val) return null
                      return <option key={val} value={val}>{val}</option>
                    })}
                  </select>
                )}
              </div>
              <div className="px-1 py-2 flex items-center gap-0.5">
                {['DNS', 'DNF', 'DQ'].map(flag => (
                  <button key={flag} type="button"
                    onClick={() => {
                      const newStatus = kp.status === flag ? '' : flag
                      onChange(lorong, 'status', newStatus)
                      if (newStatus) { onChange(lorong, 'keputusan', ''); onChange(lorong, '_raw', '') }
                    }}
                    className={`flex-1 py-2 text-[9px] font-bold rounded transition-colors ${
                      kp.status === flag ? 'bg-red-500 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-400'
                    }`}>{flag}</button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Input Padang ─────────────────────────────────────────────────────────────

function InputPadang({ acara, peserta, keputusan, onChange, sekolahMap = {}, carianBib = '' }) {
  const isLompatTinggi = resolveIsLompatTinggi(acara)
  const rankMap = isLompatTinggi ? {} : kiraPadangRank(peserta, keputusan)
  const bilPes  = peserta.length

  const pesertaSorted = carianBib
    ? [...peserta].sort((a, b) => {
        const matchA = (a.noBib || '').toUpperCase().includes(carianBib) ? 0 : 1
        const matchB = (b.noBib || '').toUpperCase().includes(carianBib) ? 0 : 1
        return matchA - matchB
      })
    : peserta

  const board = peserta
    .map((p, idx) => {
      const key = p.noBib || idx
      const kp  = keputusan[key] || {}
      return { key, nama: p.namaAtlet || p.noBib || `#${idx+1}`, best: Number(kp.keputusan) || null, status: kp.status, rank: rankMap[key] }
    })
    .filter(r => r.best !== null || ['DNS','DNF','DQ'].includes(r.status))
    .sort((a, b) => {
      if (a.best !== null && b.best !== null) return b.best - a.best
      if (a.best !== null) return -1; return 1
    })

  return (
    <div className="space-y-3">
      {board.length > 0 && (
        <div className="bg-[#003399]/5 rounded-xl p-3 border border-[#003399]/10">
          <p className="text-xs font-black text-[#003399] uppercase tracking-widest mb-2">Kedudukan Semasa</p>
          <div className="space-y-1.5">
            {board.map(r => (
              <div key={r.key} className="flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                  r.rank === 1 ? 'bg-yellow-400 text-yellow-900' : r.rank === 2 ? 'bg-gray-300 text-gray-700' : r.rank === 3 ? 'bg-orange-300 text-orange-900' : 'bg-gray-100 text-gray-500'
                }`}>{r.status || r.rank || '—'}</span>
                <span className="text-sm font-semibold text-gray-700 flex-1 truncate">{r.nama}</span>
                <span className="text-sm font-mono font-bold text-gray-800 shrink-0">
                  {r.best ? `${r.best.toFixed(2)} m` : <span className="text-red-400">{r.status}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid bg-[#003399] text-white text-xs font-bold uppercase tracking-wider"
          style={{ gridTemplateColumns: '80px 1fr 1fr 100px 64px 88px' }}>
          <div className="px-2 py-3 text-center">No BIB</div>
          <div className="px-2 py-3">Sekolah</div>
          <div className="px-2 py-3">Nama Atlet</div>
          <div className="px-2 py-3 text-center">Jarak (m)</div>
          <div className="px-2 py-3 text-center">Kddk</div>
          <div className="px-2 py-3 text-center">Catatan</div>
        </div>

        {pesertaSorted.map((p, idx) => {
          const key     = p.noBib || idx
          const kp      = keputusan[key] || {}
          const rank    = rankMap[key]
          const flagged = ['DQ', 'DNS', 'DNF'].includes(kp.status)
          const isCarian = carianBib && (p.noBib || '').toUpperCase().includes(carianBib)
          const usedByOthers = new Set(
            peserta.filter((_, i) => i !== idx).map(pp => keputusan[pp.noBib]?.kedudukan).filter(v => v !== '' && v != null)
          )
          const rowBg = isCarian ? 'bg-yellow-200 ring-2 ring-yellow-400 ring-inset'
            : flagged ? 'bg-red-50'
            : rank === 1 ? 'bg-yellow-50'
            : rank === 2 ? 'bg-gray-50'
            : rank === 3 ? 'bg-orange-50'
            : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'

          return (
            <div key={key} className={`grid border-t border-gray-100 ${rowBg}`}
              style={{ gridTemplateColumns: '80px 1fr 1fr 100px 64px 88px' }}>
              <div className="px-2 py-2.5 flex items-center justify-center">
                <span className="text-sm font-mono font-bold text-gray-800">{p.noBib || '—'}</span>
              </div>
              <div className="px-2 py-2.5 flex items-center min-w-0">
                <p className="text-sm text-gray-700 truncate leading-tight">
                  {(p.kodSekolah && (sekolahMap[p.kodSekolah] || p.kodSekolah)) || '—'}
                </p>
              </div>
              <div className="px-2 py-2.5 flex items-center min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{p.namaAtlet || `#${idx+1}`}</p>
              </div>
              <div className="px-2 py-2 flex items-center">
                <input type="number" step="0.01" min="0"
                  value={kp.keputusan ?? ''}
                  disabled={flagged}
                  onChange={e => onChange(key, 'keputusan', e.target.value)}
                  placeholder="0.00"
                  className="w-full border-2 border-gray-300 rounded-lg px-2 py-2.5 text-base font-mono font-bold text-center text-gray-900 focus:outline-none focus:border-[#003399] bg-white disabled:bg-gray-100 disabled:text-gray-300" />
              </div>
              <div className="px-1 py-2 flex items-center justify-center">
                {flagged ? <span className="text-sm font-bold text-red-400">—</span> : (
                  <select value={kp.kedudukan ?? ''}
                    onChange={e => onChange(key, 'kedudukan', e.target.value !== '' ? Number(e.target.value) : '')}
                    className={`w-full border-2 rounded-lg px-0.5 py-2.5 text-sm font-mono font-bold text-center text-gray-900 focus:outline-none focus:border-[#003399] bg-white ${
                      isLompatTinggi && !kp.kedudukan ? 'border-red-300 bg-red-50' : 'border-gray-300'
                    }`}>
                    <option value="">{isLompatTinggi ? '— pilih —' : (rank ? `(${rank})` : '—')}</option>
                    {Array.from({ length: bilPes }, (_, i) => {
                      const v = i + 1
                      if (!isLompatTinggi && usedByOthers.has(v) && kp.kedudukan !== v) return null
                      return <option key={v} value={v}>{v}</option>
                    })}
                  </select>
                )}
              </div>
              <div className="px-1 py-2 flex flex-col items-center gap-1">
                {['DQ', 'DNS'].map(flag => (
                  <button key={flag} type="button"
                    onClick={() => onChange(key, 'status', kp.status === flag ? '' : flag)}
                    className={`w-full py-2 text-xs font-bold rounded transition-colors ${
                      kp.status === flag ? 'bg-red-500 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-400'
                    }`}>{flag}</button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Input Mass Start ─────────────────────────────────────────────────────────

function InputMassStart({ heat, keputusan, onChange, sekolahMap = {}, carianBib = '' }) {
  const pesertaArr = heat.peserta || []
  const bilAtlet   = pesertaArr.length || 10
  const slotsAsal  = Array.from({ length: bilAtlet }, (_, i) => i + 1)
  const slots = carianBib
    ? [...slotsAsal].sort((a, b) => {
        const kpA = keputusan[a] || {}
        const kpB = keputusan[b] || {}
        const matchA = (kpA.noBib || '').toUpperCase().includes(carianBib) ? 0 : 1
        const matchB = (kpB.noBib || '').toUpperCase().includes(carianBib) ? 0 : 1
        return matchA - matchB
      })
    : slotsAsal
  const rankMap      = kiraLaranRank(slotsAsal, keputusan)
  const konflikSlots = kesanKonflikMasa(slotsAsal, keputusan)

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="grid bg-[#003399] text-white text-xs font-bold uppercase tracking-wider"
        style={{ gridTemplateColumns: '40px 76px 1fr 90px 60px 96px' }}>
        <div className="px-2 py-3 text-center">Bil</div>
        <div className="px-2 py-3 text-center">No BIB</div>
        <div className="px-2 py-3">Atlet / Sekolah</div>
        <div className="px-2 py-3 text-center">Masa</div>
        <div className="px-2 py-3 text-center">Kddk</div>
        <div className="px-2 py-3 text-center">Catatan</div>
      </div>

      {slots.map((slot, idx) => {
        const kp      = keputusan[slot] || {}
        const rank    = rankMap[slot]
        const flagged = ['DNS', 'DNF', 'DQ'].includes(kp.status)
        const isCarian   = carianBib && (kp.noBib || '').toUpperCase().includes(carianBib)
        const isKonflik  = konflikSlots.has(slot)
        const usedByOthers = new Set(
          slotsAsal.filter(s => s !== slot).map(s => keputusan[s]?.kedudukan).filter(v => v !== '' && v != null)
        )
        const rowBg = isCarian ? 'bg-yellow-200 ring-2 ring-yellow-400 ring-inset'
          : flagged ? 'bg-red-50'
          : isKonflik ? 'bg-amber-50'
          : rank === 1 ? 'bg-yellow-50'
          : rank === 2 ? 'bg-gray-50'
          : rank === 3 ? 'bg-orange-50'
          : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'

        return (
          <div key={slot} className={`grid border-t border-gray-100 ${rowBg}`}
            style={{ gridTemplateColumns: '40px 76px 1fr 90px 60px 96px' }}>
            <div className="px-1 py-2.5 flex items-center justify-center">
              <span className="text-sm font-black text-gray-600">{slot}</span>
            </div>
            <div className="px-1 py-2 flex items-center">
              <input type="text" value={kp.noBib || ''} readOnly
                className="w-full border border-gray-100 rounded-lg px-1.5 py-2 text-sm font-mono font-bold text-center bg-gray-50 text-gray-700 cursor-default select-none" />
            </div>
            <div className="px-2 py-2 flex flex-col justify-center min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{kp.namaAtlet || '—'}</p>
              <p className="text-[10px] text-gray-500 truncate leading-tight mt-0.5">
                {(kp.kodSekolah && (sekolahMap[kp.kodSekolah] || kp.kodSekolah)) || ''}
              </p>
            </div>
            <div className="px-1 py-2 flex flex-col items-center gap-0.5">
              <input type="text" inputMode="decimal"
                value={kp._raw ?? (kp.keputusan ? fmtMasaDisplay(kp.keputusan) : '')}
                onChange={e => onChange(slot, '_raw', e.target.value)}
                onBlur={e => {
                  const saat = parseMasaInput(e.target.value)
                  onChange(slot, 'keputusan', saat)
                  onChange(slot, '_raw', saat ? fmtMasaDisplay(saat) : e.target.value)
                }}
                placeholder="m.ss.ms" disabled={flagged}
                className={`w-full border-2 rounded-lg px-2 py-2 text-sm font-mono font-bold text-center text-gray-900 focus:outline-none bg-white disabled:bg-gray-100 disabled:text-gray-300 ${
                  isKonflik ? 'border-amber-400 focus:border-amber-500' : 'border-gray-300 focus:border-[#003399]'
                }`} />
              {kp.keputusan > 0 && (
                <span className="text-[10px] font-mono text-[#003399] font-bold">{fmtMasaDisplay(kp.keputusan)}</span>
              )}
              {isKonflik && (
                <span className="text-[9px] text-amber-600 font-bold text-center leading-tight">⚠ Masa sama</span>
              )}
            </div>
            <div className="px-1 py-2 flex items-center justify-center">
              {flagged ? <span className="text-sm font-bold text-red-400">—</span> : (
                <select value={kp.kedudukan ?? ''}
                  onChange={e => onChange(slot, 'kedudukan', e.target.value !== '' ? Number(e.target.value) : '')}
                  className="w-full border-2 border-gray-300 rounded-lg px-1 py-2 text-sm font-mono font-bold text-center text-gray-900 focus:outline-none focus:border-[#003399] bg-white">
                  <option value="">{rank ? `(${rank})` : '—'}</option>
                  {slotsAsal.map(v => {
                    if (usedByOthers.has(v) && kp.kedudukan !== v) return null
                    return <option key={v} value={v}>{v}</option>
                  })}
                </select>
              )}
            </div>
            <div className="px-1 py-2 flex items-center gap-0.5">
              {['DNS', 'DNF', 'DQ'].map(flag => (
                <button key={flag} type="button"
                  onClick={() => {
                    const n = kp.status === flag ? '' : flag
                    onChange(slot, 'status', n)
                    if (n) { onChange(slot, 'keputusan', ''); onChange(slot, '_raw', '') }
                  }}
                  className={`flex-1 py-1.5 text-[10px] font-bold rounded transition-colors ${
                    kp.status === flag ? 'bg-red-500 text-white' : 'bg-white border border-gray-200 text-gray-400 hover:border-red-300 hover:text-red-400'
                  }`}>{flag}</button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Input Relay ──────────────────────────────────────────────────────────────

function InputRelay({ acara, heat, keputusan, onChange, sekolahMap = {}, carianBib = '' }) {
  const bilPasukan = acara.bilPasukan || heat.bilPasukan || acara.bilanganLorong || 8
  const slotsAsal  = Array.from({ length: bilPasukan }, (_, i) => i + 1)
  const slots = carianBib
    ? [...slotsAsal].sort((a, b) => {
        const matchA = (keputusan[a]?.kodSekolah || '').toUpperCase().includes(carianBib) ? 0 : 1
        const matchB = (keputusan[b]?.kodSekolah || '').toUpperCase().includes(carianBib) ? 0 : 1
        return matchA - matchB
      })
    : slotsAsal
  const rankMap      = kiraLaranRank(slotsAsal, keputusan)
  const konflikSlots = kesanKonflikMasa(slotsAsal, keputusan)

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="grid bg-[#003399] text-white text-xs font-bold uppercase tracking-wider"
        style={{ gridTemplateColumns: '44px 1fr 96px 60px 100px' }}>
        <div className="px-2 py-3 text-center">Lrg</div>
        <div className="px-2 py-3">Sekolah / Pasukan</div>
        <div className="px-2 py-3 text-center">Masa</div>
        <div className="px-2 py-3 text-center">Kddk</div>
        <div className="px-2 py-3 text-center">Catatan</div>
      </div>

      {slotsAsal.map((lorong, idx) => {
        const kp      = keputusan[lorong] || {}
        const isKosong = !kp.kodSekolah && !kp.keputusan && !kp.status
        const rank    = rankMap[lorong]
        const flagged = ['DNS', 'DNF', 'DQ'].includes(kp.status)
        const isCarian  = carianBib && (kp.kodSekolah || '').toUpperCase().includes(carianBib)
        const isKonflik = konflikSlots.has(lorong)
        const usedByOthers = new Set(
          slotsAsal.filter(s => s !== lorong).map(s => keputusan[s]?.kedudukan).filter(v => v !== '' && v != null)
        )
        const rowBg = isCarian ? 'bg-yellow-200 ring-2 ring-yellow-400 ring-inset'
          : flagged ? 'bg-red-50'
          : isKonflik ? 'bg-amber-50'
          : rank === 1 ? 'bg-yellow-50'
          : rank === 2 ? 'bg-gray-50'
          : rank === 3 ? 'bg-orange-50'
          : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'

        if (isKosong) {
          return (
            <div key={lorong} className="grid border-t border-gray-100 bg-gray-50"
              style={{ gridTemplateColumns: '44px 1fr 96px 60px 100px' }}>
              <div className="px-1 py-3 flex items-center justify-center">
                <span className="text-sm font-black text-gray-300">{lorong}</span>
              </div>
              <div className="col-span-4 px-3 flex items-center">
                <span className="text-xs text-gray-300 italic">— Lorong kosong —</span>
              </div>
            </div>
          )
        }

        return (
          <div key={lorong} className={`grid border-t border-gray-100 ${rowBg}`}
            style={{ gridTemplateColumns: '44px 1fr 96px 60px 100px' }}>
            <div className="px-1 py-2.5 flex items-center justify-center">
              <span className="text-sm font-black text-gray-700">{lorong}</span>
            </div>
            <div className="px-2 py-2 flex flex-col justify-center min-w-0">
              <p className="text-sm font-bold text-gray-800 truncate">{(kp.kodSekolah && (sekolahMap[kp.kodSekolah] || kp.kodSekolah)) || '—'}</p>
              {kp.kodSekolah && sekolahMap[kp.kodSekolah] && (
                <p className="text-xs text-gray-500 truncate mt-0.5">{kp.kodSekolah}</p>
              )}
            </div>
            <div className="px-1 py-2 flex flex-col items-center gap-0.5">
              <input type="text" inputMode="decimal"
                value={kp._raw ?? (kp.keputusan ? fmtMasaDisplay(kp.keputusan) : '')}
                onChange={e => onChange(lorong, '_raw', e.target.value)}
                onBlur={e => {
                  const saat = parseMasaInput(e.target.value)
                  onChange(lorong, 'keputusan', saat)
                  onChange(lorong, '_raw', saat ? fmtMasaDisplay(saat) : e.target.value)
                }}
                placeholder="m.ss.ms" disabled={flagged}
                className={`w-full border-2 rounded-lg px-2 py-2.5 text-base font-mono font-bold text-center text-gray-900 focus:outline-none bg-white disabled:bg-gray-100 disabled:text-gray-300 ${
                  isKonflik ? 'border-amber-400 focus:border-amber-500' : 'border-gray-300 focus:border-[#003399]'
                }`} />
              {kp.keputusan > 0 && (
                <span className="text-[10px] font-mono text-[#003399] font-bold">{fmtMasaDisplay(kp.keputusan)}</span>
              )}
              {isKonflik && (
                <span className="text-[9px] text-amber-600 font-bold text-center leading-tight">⚠ Masa sama</span>
              )}
            </div>
            <div className="px-1 py-2 flex items-center justify-center">
              {flagged ? <span className="text-sm font-bold text-red-400">—</span> : (
                <select value={kp.kedudukan ?? ''}
                  onChange={e => onChange(lorong, 'kedudukan', e.target.value !== '' ? Number(e.target.value) : '')}
                  className="w-full border-2 border-gray-300 rounded-lg px-0.5 py-2.5 text-sm font-mono font-bold text-center text-gray-900 focus:outline-none focus:border-[#003399] bg-white">
                  <option value="">{rank ? `(${rank})` : '—'}</option>
                  {slotsAsal.map(v => {
                    if (usedByOthers.has(v) && kp.kedudukan !== v) return null
                    return <option key={v} value={v}>{v}</option>
                  })}
                </select>
              )}
            </div>
            <div className="px-1 py-2 flex items-center gap-0.5">
              {['DNS', 'DNF', 'DQ'].map(flag => (
                <button key={flag} type="button"
                  onClick={() => {
                    const n = kp.status === flag ? '' : flag
                    onChange(lorong, 'status', n)
                    if (n) { onChange(lorong, 'keputusan', ''); onChange(lorong, '_raw', '') }
                  }}
                  className={`flex-1 py-2 text-[9px] font-bold rounded transition-colors ${
                    kp.status === flag ? 'bg-red-500 text-white' : 'bg-white border border-gray-200 text-gray-400 hover:border-red-300 hover:text-red-400'
                  }`}>{flag}</button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Jana Final Panel ─────────────────────────────────────────────────────────

function JanaFinalPanel({ finalists, acara, onJana, loading, finalDijanaKe, finalSetup }) {
  const { bestHeat, bestTime } = getFinalistSetup(acara || {}, finalSetup)
  const isPadang = ['padang_lompat', 'padang_balin'].includes(acara?.jenisAcara)

  return (
    <div className={`border rounded-2xl p-4 space-y-3 ${finalDijanaKe ? 'bg-green-50/60 border-green-200' : 'bg-[#003399]/5 border-[#003399]/20'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-xs font-black uppercase tracking-widest ${finalDijanaKe ? 'text-green-700' : 'text-[#003399]'}`}>
            {finalDijanaKe ? `✓ Final Dijana → Acara #${finalDijanaKe}` : 'Semua Heat Rasmi'}
          </p>
          <p className="text-[10px] text-gray-600 mt-0.5 font-semibold">{finalists.length} finalis</p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            <span className="font-semibold text-gray-600">{bestHeat} terbaik/heat</span>
            {bestTime > 0 && <span> + <span className="font-semibold text-gray-600">{bestTime} wildcard masa</span></span>}
          </p>
        </div>
        <button onClick={() => onJana(finalists)} disabled={loading}
          className={`shrink-0 px-4 py-2.5 text-white text-sm font-bold rounded-xl disabled:opacity-50 transition-all active:scale-95 ${
            finalDijanaKe ? 'bg-green-600 hover:bg-green-700' : 'bg-[#003399] hover:bg-[#002277]'
          }`}>
          {loading ? 'Menjana…' : finalDijanaKe ? '↺ Jana Semula' : 'Jana Final ▶'}
        </button>
      </div>

      <div className="rounded-xl border border-[#003399]/15 overflow-hidden">
        <div className="grid bg-[#003399] text-white text-[10px] font-bold uppercase"
          style={{ gridTemplateColumns: '32px 40px 1fr 56px 36px' }}>
          <div className="px-1.5 py-2 text-center">{isPadang ? '#' : 'Lrg'}</div>
          <div className="px-1.5 py-2 text-center">BIB</div>
          <div className="px-2 py-2">Atlet / Sekolah</div>
          <div className="px-1.5 py-2 text-center">{isPadang ? 'Jarak' : 'Masa'}</div>
          <div className="px-1.5 py-2 text-center">H</div>
        </div>
        {finalists.map((f, idx) => (
          <div key={f.noBib || idx} className={`grid border-t border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
            style={{ gridTemplateColumns: '32px 40px 1fr 56px 36px' }}>
            <div className="px-1.5 py-2 flex items-center justify-center">
              <span className="text-xs font-black text-[#003399]">{isPadang ? idx + 1 : f.lorong}</span>
            </div>
            <div className="px-1.5 py-2 flex items-center justify-center">
              <span className="text-[11px] font-mono text-gray-600">{f.noBib || '—'}</span>
            </div>
            <div className="px-2 py-1.5 flex flex-col justify-center min-w-0">
              <p className="text-[11px] font-semibold text-gray-700 truncate">{f.namaAtlet || '—'}</p>
              <p className="text-[9px] text-gray-400 truncate">{f.kodSekolah || ''}</p>
            </div>
            <div className="px-1.5 py-2 flex items-center justify-center">
              <span className="text-[11px] font-mono font-bold text-gray-800">
                {f.keputusan ? (isPadang ? Number(f.keputusan).toFixed(2) : fmtMasaDisplay(f.keputusan)) : '—'}
              </span>
            </div>
            <div className="px-1.5 py-2 flex items-center justify-center">
              <span className="text-[10px] text-gray-400">H{f.noHeat}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PencatatInputKeputusan() {
  const { userData } = useAuth()
  const navigate     = useNavigate()
  const { slug, kejId } = useParams()
  const schoolId     = userData?.schoolId || ''

  const bolehEdit = ['pencatat', 'pengurus_teknik', 'urusetia', 'admin', 'superadmin'].includes(userData?.role)

  const [sistemTutup, setSistemTutup] = useState(false)
  const [step, setStep]         = useState('home')
  const [search, setSearch]     = useState('')
  const [now, setNow]           = useState(Date.now())
  const [selectedHari, setSelectedHari] = useState(null)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Data
  const [kejData,       setKejData]       = useState(null)
  const [acaraList,     setAcaraList]     = useState([])
  const [finalSetup,    setFinalSetup]    = useState(null)
  const [sekolahMap,    setSekolahMap]    = useState({})
  const [loading,       setLoading]       = useState(true)
  const [lorongKumpulan, setLorongKumpulan] = useState(WA_LORONG_KUMPULAN_DEFAULT)
  const [bilHeatSF,      setBilHeatSF]     = useState(2)

  // Accordion open state — key = kategoriKod
  const [accordionOpen, setAccordionOpen] = useState({})
  const [filterTab, setFilterTab] = useState('semua')

  // Selection
  const [selectedAcara, setSelectedAcara] = useState(null)
  const [heats,         setHeats]         = useState([])
  const [selectedHeat,  setSelectedHeat]  = useState(null)
  const [heatsLoading,  setHeatsLoading]  = useState(false)

  // Input state
  const [keputusan, setKeputusan] = useState({})
  const [windSpeed, setWindSpeed] = useState('')
  const [peserta,   setPeserta]   = useState([])
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [janaFinalLoading, setJanaFinalLoading] = useState(false)
  const [carianBib, setCarianBib] = useState('')

  // Mod Semua Peserta
  const [modSemua,       setModSemua]       = useState(false)
  const [keputusanSemua, setKeputusanSemua] = useState({})

  const [toastMsg,    setToastMsg]    = useState('')
  const [toastType,   setToastType]   = useState('ok') // 'ok' | 'err'
  const toastTimerRef = useRef(null)

  const heatListenerRef = useRef(null)

  function showToast(msg, type = 'ok', ms = 3000) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToastMsg(msg); setToastType(type)
    toastTimerRef.current = setTimeout(() => setToastMsg(''), ms)
  }

  // ── Pantau sistemTutup secara realtime ──────────────────────────────────────
  useEffect(() => {
    if (!schoolId) return
    const unsub = onSnapshot(
      doc(db, 'tenants', schoolId, 'tetapan', 'home'),
      snap => { if (snap.exists()) setSistemTutup(!!snap.data().sistemTutup) },
      () => {}
    )
    return () => unsub()
  }, [schoolId])

  // ── Load data ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!schoolId || !kejId) { setLoading(false); return }

    async function load() {
      setLoading(true)
      try {
        const kejSnap = await getDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId))
        if (kejSnap.exists()) setKejData(kejSnap.data())

        getDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'tetapan', 'finalSetup'))
          .then(s => { if (s.exists()) setFinalSetup(s.data()) }).catch(() => {})

        getDoc(doc(db, 'tenants', schoolId, 'tetapan', 'waConfig'))
          .then(s => {
            if (!s.exists()) return
            const d = s.data()
            if (d.lorongKumpulan) {
              const parsed = deserializeKumpulan(d.lorongKumpulan)
              if (parsed) setLorongKumpulan({ ...WA_LORONG_KUMPULAN_DEFAULT, ...parsed })
            }
            if (d.bilHeatSukuAkhir) setBilHeatSF(Number(d.bilHeatSukuAkhir) || 2)
          }).catch(() => {})

        // Load sekolah map
        getDocs(collection(db, 'tenants', schoolId, 'sekolah')).then(snap => {
          const map = {}
          snap.docs.forEach(d => { map[d.id] = d.data().namaSekolah || d.data().nama || d.id })
          setSekolahMap(map)
        }).catch(() => {})

        const acaraSnap = await getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'acara'))
        const acaraDocs = acaraSnap.docs
          .map(d => ({ acaraId: d.id, ...d.data() }))
          .sort((a, b) => (a.noAcara ?? 999) - (b.noAcara ?? 999))

        const heatSnap = await getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat'))
        const countMap = {}
        heatSnap.docs.forEach(d => {
          const h = d.data()
          const aId = h.aceraId || h.acaraId || ''
          if (!countMap[aId]) countMap[aId] = { total: 0, rasmi: 0, draf: 0 }
          countMap[aId].total++
          if (['rasmi', 'diterima'].includes(h.statusKeputusan)) countMap[aId].rasmi++
          if (h.statusKeputusan === 'tidak_rasmi') countMap[aId].draf++
        })

        const acaraWithCounts = acaraDocs.map(a => ({
          ...a,
          _totalHeat: countMap[a.acaraId]?.total || 0,
          _rasmiHeat: countMap[a.acaraId]?.rasmi || 0,
          _drafHeat:  countMap[a.acaraId]?.draf  || 0,
        }))
        setAcaraList(acaraWithCounts)

        const allDates = [...new Set(acaraWithCounts.map(a => a.tarikhAcara).filter(Boolean))].sort()
        const today = new Date().toISOString().slice(0, 10)
        setSelectedHari(allDates.includes(today) ? today : (allDates[0] || null))

        // Default open semua kategori
        const kats = [...new Set(acaraWithCounts.map(a => a.kategoriKod).filter(Boolean))]
        const openMap = {}
        kats.forEach(k => { openMap[k] = true })
        setAccordionOpen(openMap)
      } catch (e) {
        console.error('load error:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [schoolId, kejId])

  // ── Load heats ──────────────────────────────────────────────────────────────

  async function loadHeatsForAcara(acara) {
    if (!schoolId || !kejId) return []
    const snap = await getDocs(query(
      collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat'),
      where('aceraId', '==', acara.acaraId)
    ))
    return snap.docs
      .map(d => ({ heatId: d.id, ...d.data() }))
      .sort((a, b) => (a.noHeat ?? 0) - (b.noHeat ?? 0))
  }

  // ── Init keputusan dari peserta ─────────────────────────────────────────────

  function initKeputusanDariPeserta(acara, heat) {
    const kpMap = {}
    const pesertaArr = heat.peserta || []

    if (acara.jenisAcara === 'lorong' || acara.jenisAcara === 'relay') {
      pesertaArr.forEach(p => {
        if (p.lorong != null) kpMap[p.lorong] = {
          noBib:      p.noBib || '',
          namaAtlet:  p.namaAtlet || '',
          kodSekolah: p.kodSekolah || '',
          keputusan:  p.keputusan != null ? String(p.keputusan) : '',
          _raw:       p.keputusan != null ? fmtMasaDisplay(p.keputusan) : '',
          kedudukan:  p.kedudukan != null ? p.kedudukan : '',
          status:     (p.status && p.status !== 'belum') ? p.status : '',
        }
      })
    } else if (acara.jenisAcara === 'mass_start') {
      pesertaArr.forEach((p, i) => {
        const slot = p.giliran ?? (i + 1)
        kpMap[slot] = {
          noBib:      p.noBib || '',
          namaAtlet:  p.namaAtlet || '',
          kodSekolah: p.kodSekolah || '',
          keputusan:  p.keputusan != null ? String(p.keputusan) : '',
          _raw:       p.keputusan != null ? fmtMasaDisplay(p.keputusan) : '',
          kedudukan:  p.kedudukan != null ? p.kedudukan : '',
          status:     (p.status && p.status !== 'belum') ? p.status : '',
        }
      })
    } else {
      pesertaArr.forEach(p => {
        kpMap[p.noBib] = {
          noBib:     p.noBib || '',
          namaAtlet: p.namaAtlet || '',
          keputusan: p.keputusan != null ? String(p.keputusan) : '',
          kedudukan: p.kedudukan != null ? p.kedudukan : '',
          status:    (p.status && p.status !== 'belum') ? p.status : '',
        }
      })
    }
    return kpMap
  }

  function initKeputusanSemua(allHeats) {
    const kpMap = {}
    for (const h of allHeats) {
      for (const p of (h.peserta || [])) {
        const slotKey = `${h.heatId}_${p.lorong ?? p.noBib}`
        kpMap[slotKey] = {
          noBib:      p.noBib      || '',
          namaAtlet:  p.namaAtlet  || '',
          kodSekolah: p.kodSekolah || '',
          keputusan:  p.keputusan  != null ? String(p.keputusan) : '',
          _raw:       p.keputusan  != null ? fmtMasaDisplay(p.keputusan) : '',
          status:     (p.status && p.status !== 'belum') ? p.status : '',
          _heatId:    h.heatId,
          _lorong:    p.lorong,
          _noBib:     p.noBib,
        }
      }
    }
    setKeputusanSemua(kpMap)
  }

  // ── Navigate ke acara ───────────────────────────────────────────────────────

  async function selectAcara(acara) {
    setSelectedAcara(acara)
    setSelectedHeat(null)
    setHeats([])
    setKeputusan({})
    setWindSpeed('')
    setSaved(false)
    setCarianBib('')
    setModSemua(false)
    setStep('input')
    setHeatsLoading(true)

    try {
      const list = await loadHeatsForAcara(acara)
      setHeats(list)
      const firstPending = list.find(h => !['rasmi', 'diterima'].includes(h.statusKeputusan))
      const toSelect = firstPending || list[0]
      if (toSelect) await selectHeat(toSelect, acara)
    } catch (e) {
      console.error('selectAcara error:', e)
      setHeats([])
    } finally {
      setHeatsLoading(false)
    }
  }

  async function selectHeat(heat, _acara = null) {
    const acara = _acara || selectedAcara
    setSelectedHeat(heat)
    setSaved(false)
    setCarianBib('')
    setWindSpeed(heat.windSpeed != null ? String(heat.windSpeed) : '')
    setKeputusan(initKeputusanDariPeserta(acara, heat))
    setPeserta(heat.peserta || [])
  }

  // ── Realtime listener heat semasa ─────────────────────────────────────────

  const [remoteKemaskini, setRemoteKemaskini] = useState(false)
  const localPesertaHashRef = useRef(null)

  function hashPeserta(pesertaArr) {
    return JSON.stringify((pesertaArr || []).map(p => ({ b: p.noBib, k: p.keputusan, s: p.status, l: p.lorong })))
  }

  useEffect(() => {
    if (heatListenerRef.current) { heatListenerRef.current(); heatListenerRef.current = null }
    setRemoteKemaskini(false)
    if (!schoolId || !kejId || !selectedAcara || !selectedHeat?.heatId) return

    const hRef = doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat', selectedHeat.heatId)
    const isFirstSnap = { v: true }

    heatListenerRef.current = onSnapshot(hRef, snap => {
      if (!snap.exists()) return
      const d = snap.data()

      setSelectedHeat(prev => prev ? {
        ...prev,
        statusKeputusan:  d.statusKeputusan  ?? prev.statusKeputusan,
        bantahanDiterima: d.bantahanDiterima ?? false,
        peserta:          d.peserta          ?? prev.peserta,
      } : prev)
      setHeats(prev => prev.map(h =>
        h.heatId === snap.id
          ? { ...h, statusKeputusan: d.statusKeputusan ?? h.statusKeputusan, peserta: d.peserta ?? h.peserta }
          : h
      ))

      if (isFirstSnap.v) {
        // Rekod hash asal, refresh keputusan state dari Firestore
        localPesertaHashRef.current = hashPeserta(d.peserta)
        setKeputusan(initKeputusanDariPeserta(selectedAcara, { ...selectedHeat, peserta: d.peserta ?? selectedHeat.peserta }))
        setPeserta(d.peserta ?? selectedHeat.peserta ?? [])
        isFirstSnap.v = false
        return
      }

      // Subsequent snaps — compare hash untuk detect perubahan dari luar
      const remoteHash = hashPeserta(d.peserta)
      if (remoteHash !== localPesertaHashRef.current) {
        setRemoteKemaskini(true)
      }
    }, () => {})

    return () => { if (heatListenerRef.current) { heatListenerRef.current(); heatListenerRef.current = null } }
  }, [schoolId, kejId, selectedAcara?.acaraId, selectedHeat?.heatId]) // eslint-disable-line

  function muatSemulaHeat() {
    setRemoteKemaskini(false)
    if (!selectedHeat || !selectedAcara) return
    const pesertaSemasa = selectedHeat.peserta || []
    localPesertaHashRef.current = hashPeserta(pesertaSemasa)
    setKeputusan(initKeputusanDariPeserta(selectedAcara, selectedHeat))
    setPeserta(pesertaSemasa)
    setSaved(false)
  }

  // ── goBack ─────────────────────────────────────────────────────────────────

  function goBack() {
    if (selectedAcara && heats.length > 0) {
      const rasmi = heats.filter(h => ['rasmi', 'diterima'].includes(h.statusKeputusan)).length
      const draf  = heats.filter(h => h.statusKeputusan === 'tidak_rasmi').length
      setAcaraList(prev => prev.map(a =>
        a.acaraId === selectedAcara.acaraId
          ? { ...a, _rasmiHeat: rasmi, _drafHeat: draf, _totalHeat: heats.length }
          : a
      ))
    }
    setStep('home')
    setSelectedAcara(null)
    setSelectedHeat(null)
    setHeats([])
    setKeputusan({})
    setModSemua(false)
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleChange(slot, field, value) {
    setKeputusan(prev => ({ ...prev, [slot]: { ...(prev[slot] || {}), [field]: value } }))
    setSaved(false)
  }

  function handleChangeSemua(slotKey, field, value) {
    setKeputusanSemua(prev => ({ ...prev, [slotKey]: { ...(prev[slotKey] || {}), [field]: value } }))
    setSaved(false)
  }

  function buildUpdatedPeserta(acara, heat, kpMap) {
    const jenisAcara = acara.jenisAcara
    const isPadang   = ['padang_lompat', 'padang_balin'].includes(jenisAcara)

    const updatedPeserta = (heat.peserta || []).map((p, i) => {
      let slot
      if (jenisAcara === 'lorong' || jenisAcara === 'relay') slot = p.lorong
      else if (jenisAcara === 'mass_start') slot = p.giliran ?? (i + 1)
      else slot = p.noBib

      const kp  = kpMap[slot] || {}
      const val = kp.keputusan !== '' && kp.keputusan !== undefined
        ? (Number(kp.keputusan) || null) : p.keputusan

      const kedudukan = (kp.kedudukan !== '' && kp.kedudukan != null)
        ? kp.kedudukan : (p.kedudukan ?? null)

      const rawStatus = kp.status || p.status || 'belum'
      const isFlagged = ['DNS', 'DNF', 'DQ'].includes(rawStatus)
      const hasResult = val != null && !isNaN(Number(val)) && Number(val) > 0
      const finalStatus = isFlagged ? rawStatus : hasResult ? 'selesai' : rawStatus

      return { ...p, keputusan: val, kedudukan, status: finalStatus, updatedBy: userData?.uid || '' }
    })

    const isPadangLocal = isPadang
    const isLompatTinggi = resolveIsLompatTinggi(acara)

    const finishers = [...updatedPeserta]
      .filter(p => p.status === 'selesai' && p.keputusan != null)
      .sort((a, b) => {
        if (isPadangLocal) return Number(b.keputusan) - Number(a.keputusan)
        const diff = Number(a.keputusan) - Number(b.keputusan)
        if (diff !== 0) return diff
        // Tiebreak 1: masaSebenar (photocell) — selaras dengan postRasmi
        const aHT = Number(a.masaSebenar) || null
        const bHT = Number(b.masaSebenar) || null
        if (aHT !== null && bHT !== null) return aHT - bHT
        if (aHT !== null) return -1
        if (bHT !== null) return 1
        // Tiebreak 2: kedudukan manual pencatat
        const aK = Number(a.kedudukan) || null
        const bK = Number(b.kedudukan) || null
        if (aK !== null && bK !== null) return aK - bK
        if (aK !== null) return -1
        if (bK !== null) return 1
        return 0
      })

    const rankKey = p => jenisAcara === 'relay' ? p.lorong : p.noBib
    const autoRankMap = new Map()
    if (isLompatTinggi) {
      finishers.forEach(p => {
        if (p.kedudukan) autoRankMap.set(rankKey(p), Number(p.kedudukan))
      })
    } else {
      finishers.forEach((p, i) => autoRankMap.set(rankKey(p), i + 1))
    }

    return updatedPeserta.map(p => ({
      ...p,
      rankDalamHeat: (p.status === 'selesai' && p.keputusan != null)
        ? (autoRankMap.get(rankKey(p)) || null) : null,
    }))
  }

  async function handleSave() {
    if (!schoolId || !kejId || !selectedAcara || !selectedHeat || !bolehEdit) return
    if (sistemTutup) { showToast('Sistem ditutup — input keputusan dihalang.', 'err'); return }
    setSaving(true); setSaved(false)
    try {
      const heatRef = doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat', selectedHeat.heatId)
      const stripUndef = obj => Object.fromEntries(Object.entries(obj).filter(([k, v]) => !k.startsWith('_') && v !== undefined))
      const acara = selectedAcara
      const kpMap = keputusan
      const windSpeedVal = selectedAcara.isWindReading && windSpeed !== '' ? (Number(windSpeed) || null) : undefined

      let savedPeserta = null

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(heatRef)
        if (!snap.exists()) throw new Error('Heat tidak wujud')
        const freshHeat = { heatId: heatRef.id, ...snap.data() }
        const pesertaDenganRank = buildUpdatedPeserta(acara, freshHeat, kpMap)
        const updates = { peserta: pesertaDenganRank.map(stripUndef), updatedAt: serverTimestamp() }
        if (windSpeedVal !== undefined) updates.windSpeed = windSpeedVal
        tx.update(heatRef, updates)
        savedPeserta = pesertaDenganRank
      })

      localPesertaHashRef.current = hashPeserta(savedPeserta)
      setRemoteKemaskini(false)
      const curStatus = selectedHeat.statusKeputusan
      setSelectedHeat(prev => ({ ...prev, statusKeputusan: curStatus, peserta: savedPeserta }))
      setHeats(prev => prev.map(h => h.heatId === selectedHeat.heatId ? { ...h, statusKeputusan: curStatus, peserta: savedPeserta } : h))
      setSaved(true)
    } catch (e) {
      showToast(`Ralat menyimpan: ${e.message}`, 'err', 5000)
    } finally {
      setSaving(false)
    }
  }

  async function handleHantar() {
    if (!schoolId || !kejId || !selectedAcara || !selectedHeat || !bolehEdit) return
    if (sistemTutup) { showToast('Sistem ditutup — input keputusan dihalang.', 'err'); return }
    setSaving(true); setSaved(false)
    try {
      const heatRef  = doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat', selectedHeat.heatId)
      const acaraRef = doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'acara', selectedAcara.acaraId)
      const acara    = selectedAcara
      const kpMap    = keputusan
      const stripUndef = obj => Object.fromEntries(Object.entries(obj).filter(([k, v]) => !k.startsWith('_') && v !== undefined))
      const windSpeedVal = acara.isWindReading && windSpeed !== '' ? (Number(windSpeed) || null) : undefined

      let pesertaFinal = null

      // Save + mark diterima dalam satu transaction
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(heatRef)
        if (!snap.exists()) throw new Error('Heat tidak wujud')
        const freshHeat = { heatId: heatRef.id, ...snap.data() }
        const pesertaDenganRank = buildUpdatedPeserta(acara, freshHeat, kpMap)
        const updates = {
          peserta: pesertaDenganRank.map(stripUndef),
          statusKeputusan: 'diterima',
          bantahanDiterima: false,
          updatedAt: serverTimestamp(),
        }
        if (windSpeedVal !== undefined) updates.windSpeed = windSpeedVal
        tx.update(heatRef, updates)
        pesertaFinal = pesertaDenganRank
      })

      await updateDoc(acaraRef, { statusAcara: 'ada_keputusan', updatedAt: serverTimestamp() }).catch(() => {})

      const kej = kejData || {}
      const PKOD = { sekolah: 'S', daerah: 'D', negeri: 'N', kebangsaan: 'K' }
      const peringkatKej = PKOD[(kej.peringkat || '').toLowerCase()] || 'D'
      const mp = kej.mataPingat || {}
      const mataPingat = {
        1: Number(mp[1] ?? mp['1'] ?? 5), 2: Number(mp[2] ?? mp['2'] ?? 3),
        3: Number(mp[3] ?? mp['3'] ?? 2), 4: Number(mp[4] ?? mp['4'] ?? 1),
      }
      const isSaringanLocal = ['saringan_qf', 'saringan_sf', 'separuh_akhir'].includes(acara.peringkat || '')
      const grantMedal = !isSaringanLocal && (
        ['final', 'terus_final'].includes(selectedHeat.fasa) || heats.length === 1
      )
      const heatDocForPost  = { id: selectedHeat.heatId, peserta: pesertaFinal, windSpeed: windSpeedVal ?? selectedHeat.windSpeed ?? '' }
      const acaraDocForPost = { ...acara, id: acara.acaraId }
      await runPostRasmi(db, heatDocForPost, acaraDocForPost, kejId, {
        schoolId, mataPingat, peringkatKej, grantMedal,
        isRelay: acara.jenisAcara === 'relay',
      }).catch(e => console.warn('postRasmi:', e.message))

      localPesertaHashRef.current = hashPeserta(pesertaFinal)
      setRemoteKemaskini(false)
      const patch = { statusKeputusan: 'diterima', peserta: pesertaFinal }
      setSelectedHeat(prev => ({ ...prev, ...patch }))
      setHeats(prev => prev.map(h => h.heatId === selectedHeat.heatId ? { ...h, ...patch } : h))
      setSaved(true)
    } catch (e) {
      showToast(`Ralat hantar: ${e.message}`, 'err', 5000)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveSemuaPeserta({ danHantar = false } = {}) {
    if (!schoolId || !kejId || !selectedAcara || heats.length === 0 || !bolehEdit) return
    if (sistemTutup) { showToast('Sistem ditutup — input keputusan dihalang.', 'err'); return }
    setSaving(true); setSaved(false)
    try {
      const jenisAcara = selectedAcara.jenisAcara
      const isPadang   = ['padang_lompat', 'padang_balin'].includes(jenisAcara)
      const kej = kejData || {}
      const PKOD = { sekolah: 'S', daerah: 'D', negeri: 'N', kebangsaan: 'K' }
      const peringkatKej = PKOD[(kej.peringkat || '').toLowerCase()] || 'D'
      const mp = kej.mataPingat || {}
      const mataPingat = {
        1: Number(mp[1] ?? mp['1'] ?? 5), 2: Number(mp[2] ?? mp['2'] ?? 3),
        3: Number(mp[3] ?? mp['3'] ?? 2), 4: Number(mp[4] ?? mp['4'] ?? 1),
      }
      const isSaringanAcara = ['saringan_qf', 'saringan_sf', 'separuh_akhir'].includes(selectedAcara.peringkat || '')
      const isRelayAcara    = selectedAcara.jenisAcara === 'relay'
      const kpSemua         = keputusanSemua
      const stripUndef = obj => Object.fromEntries(Object.entries(obj).filter(([k, v]) => !k.startsWith('_') && v !== undefined))

      const savedHeats = []

      for (const h of heats) {
        const heatRef = doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat', h.heatId)
        let finalPeserta = null

        await runTransaction(db, async (tx) => {
          const snap = await tx.get(heatRef)
          if (!snap.exists()) return
          const freshPeserta = snap.data().peserta || []

          const updatedPeserta = freshPeserta.map(p => {
            const slotKey = `${h.heatId}_${p.lorong ?? p.noBib}`
            const kp = kpSemua[slotKey] || {}
            const val = kp.keputusan !== '' && kp.keputusan !== undefined
              ? (Number(kp.keputusan) || null) : p.keputusan
            const rawStatus = kp.status || p.status || 'belum'
            const isFlagged = ['DNS', 'DNF', 'DQ'].includes(rawStatus)
            const hasResult = val != null && val !== '' && !isNaN(Number(val)) && Number(val) > 0
            const finalStatus = isFlagged ? rawStatus : hasResult ? 'selesai' : rawStatus
            return { ...p, keputusan: val, status: finalStatus, updatedBy: userData?.uid || '' }
          })

          const finishers = [...updatedPeserta]
            .filter(p => p.status === 'selesai' && p.keputusan != null)
            .sort((a, b) => isPadang ? b.keputusan - a.keputusan : a.keputusan - b.keputusan)
          const autoRankMap = new Map()
          finishers.forEach((p, i) => {
            const rk = jenisAcara === 'relay' ? p.lorong : p.noBib
            autoRankMap.set(rk, i + 1)
          })
          finalPeserta = updatedPeserta.map(p => {
            const rk = jenisAcara === 'relay' ? p.lorong : p.noBib
            return { ...p, rankDalamHeat: autoRankMap.get(rk) ?? null }
          })

          const updates = { peserta: finalPeserta.map(stripUndef), updatedAt: serverTimestamp() }
          if (danHantar) {
            updates.statusKeputusan  = 'diterima'
            updates.bantahanDiterima = false
          }
          tx.update(heatRef, updates)
        })

        if (finalPeserta) savedHeats.push({ heatId: h.heatId, fasa: h.fasa, peserta: finalPeserta })
      }

      if (danHantar) {
        await updateDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'acara', selectedAcara.acaraId), {
          statusAcara: 'ada_keputusan', updatedAt: serverTimestamp(),
        }).catch(() => {})

        for (const sh of savedHeats) {
          const isFinalHeat = ['final', 'terus_final'].includes(sh.fasa)
          const grantMedal  = !isSaringanAcara && (isFinalHeat || heats.length === 1)
          const heatDocForPost = { id: sh.heatId, peserta: sh.peserta, windSpeed: '' }
          const acaraDoc       = { id: selectedAcara.acaraId, ...selectedAcara }
          await runPostRasmi(db, heatDocForPost, acaraDoc, kejId, {
            schoolId, mataPingat, peringkatKej, grantMedal, isRelay: isRelayAcara,
          }).catch(e => console.warn('postRasmi heat', sh.heatId, ':', e.message))
        }
      }

      setHeats(prev => prev.map(x => {
        const saved = savedHeats.find(s => s.heatId === x.heatId)
        if (!saved) return x
        return { ...x, peserta: saved.peserta, ...(danHantar ? { statusKeputusan: 'diterima' } : {}) }
      }))
      setRemoteKemaskini(false)
      setSaved(true)
    } catch (e) {
      console.error('handleSaveSemuaPeserta:', e)
      showToast('Ralat: ' + e.message, 'err', 5000)
    } finally {
      setSaving(false)
    }
  }

  // ── Jana Final ─────────────────────────────────────────────────────────────

  const finalDijanaKe = useMemo(() => {
    if (!selectedAcara || !heats.length) return null
    return heats[0]?.finalDijanaKe || null
  }, [selectedAcara, heats])

  const isSaringanAcara = selectedAcara
    ? ['saringan_qf', 'saringan_sf', 'separuh_akhir'].includes(selectedAcara.peringkat)
    : false

  const fasaJana = selectedAcara?.peringkat === 'saringan_qf' ? 'sukuKeSeparuh' : 'toFinal'

  const allHeatsDone = heats.length > 0 && heats.every(h => ['rasmi', 'diterima'].includes(h.statusKeputusan))

  const finalists = useMemo(() => {
    if (!isSaringanAcara || !allHeatsDone || !selectedAcara) return []
    return selectFinalists(heats, selectedAcara, finalSetup, fasaJana)
  }, [isSaringanAcara, allHeatsDone, heats, selectedAcara, finalSetup, fasaJana])

  async function handleJanaFinal(finalistList) {
    if (!schoolId || !kejId || !selectedAcara || !finalistList.length) return
    setJanaFinalLoading(true)
    try {
      const thisNo    = String(selectedAcara.noAcara || selectedAcara.aceraId || selectedAcara.id)
      const nextAcara = acaraList.find(a =>
        String(a.parentAcaraId) === thisNo ||
        String(a.parentAcaraId) === String(selectedAcara.aceraId || selectedAcara.id)
      )
      if (!nextAcara) { showToast('Tiada acara seterusnya dikaitkan. Setup parentAcaraId dalam AcaraSetup.', 'err', 5000); return }

      const nextAcaraId  = nextAcara.aceraId || nextAcara.id
      const fasaHeat     = nextAcara.peringkat === 'akhir' ? 'final' : nextAcara.peringkat
      const jenisLorong  = detectJenisLorong(selectedAcara)
      const isPadang     = ['padang_lompat', 'padang_balin'].includes(selectedAcara.jenisAcara)
      const isMass       = selectedAcara.jenisAcara === 'mass_start'

      // Padam heat lama untuk acara seterusnya
      const oldHeats = await getDocs(query(
        collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat'),
        where('aceraId', '==', nextAcaraId)
      ))
      await Promise.all(oldHeats.docs.map(d => d.ref.delete()))

      if (fasaJana === 'sukuKeSeparuh') {
        // ── QF → SF: serpentine seeding ke bilHeatSF heat ────────────────────
        const finalisByRank = [...finalistList].sort((a, b) =>
          isPadang ? b.keputusan - a.keputusan : (a.keputusan ?? 999) - (b.keputusan ?? 999)
        )
        const heatGroups = serpentineSeed(finalisByRank, bilHeatSF)

        await Promise.all(heatGroups.map(async (kumpulan, idx) => {
          const noHeat  = idx + 1
          const heatId  = `heat_${fasaHeat}_${noHeat}_${Date.now()}`
          const sorted  = [...kumpulan].sort((a, b) =>
            isPadang ? b.keputusan - a.keputusan : (a.keputusan ?? 999) - (b.keputusan ?? 999)
          )
          const peserta = isPadang || isMass
            ? kumpulan
            : assignLorongFinal(sorted, jenisLorong, lorongKumpulan)
          await setDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat', heatId), {
            heatId, aceraId: nextAcaraId, noHeat, fasa: fasaHeat,
            statusKeputusan: 'belum_mula', peserta, createdAt: serverTimestamp(),
          })
        }))

      } else {
        // ── SF/QF → Final: 1 heat dengan assignLorongFinal WA ────────────────
        const heatId = `heat_${fasaHeat}_${Date.now()}`
        const sorted = [...finalistList].sort((a, b) =>
          isPadang ? b.keputusan - a.keputusan : (a.keputusan ?? 999) - (b.keputusan ?? 999)
        )
        const peserta = isPadang || isMass
          ? finalistList
          : assignLorongFinal(sorted, jenisLorong, lorongKumpulan)
        await setDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat', heatId), {
          heatId, aceraId: nextAcaraId, noHeat: 1, fasa: fasaHeat,
          statusKeputusan: 'belum_mula', peserta, createdAt: serverTimestamp(),
        })
      }

      // Mark saringan dengan finalDijanaKe
      await Promise.all(heats.map(h =>
        updateDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat', h.heatId), {
          finalDijanaKe: nextAcara.noAcara || nextAcaraId,
        }).catch(() => {})
      ))

      setHeats(prev => prev.map(h => ({ ...h, finalDijanaKe: nextAcara.noAcara || nextAcaraId })))
      const label = fasaHeat === 'final' ? 'Final' : fasaHeat === 'separuh_akhir' ? `${bilHeatSF} Heat Separuh Akhir` : 'Acara seterusnya'
      showToast(`${label} berjaya dijana! (${finalistList.length} finalis)`, 'ok')
    } catch (e) {
      showToast('Ralat jana: ' + e.message, 'err', 5000)
    } finally {
      setJanaFinalLoading(false)
    }
  }

  // ── View helpers ────────────────────────────────────────────────────────────

  const allDates = useMemo(() => {
    return [...new Set(acaraList.map(a => a.tarikhAcara).filter(Boolean))].sort()
  }, [acaraList])

  const acaraHariIni = useMemo(() => {
    if (!selectedHari) return acaraList
    return acaraList.filter(a => a.tarikhAcara === selectedHari)
  }, [acaraList, selectedHari])

  const acaraFiltered = useMemo(() => {
    if (!search.trim()) return acaraHariIni
    const q = search.trim().toLowerCase()
    return acaraList.filter(a =>
      String(a.noAcara || '').includes(q) ||
      (a.namaAcara || '').toLowerCase().includes(q) ||
      (a.kategoriKod || '').toLowerCase().includes(q)
    )
  }, [acaraHariIni, acaraList, search])

  // Kumpul by kategoriKod untuk accordion
  const kategoris = useMemo(() => {
    const map = {}
    acaraFiltered.forEach(a => {
      const k = a.kategoriKod || 'Lain-lain'
      if (!map[k]) map[k] = []
      map[k].push(a)
    })
    return map
  }, [acaraFiltered])

  // Kiraan progress keseluruhan
  const filterCounts = useMemo(() => {
    let rasmi = 0, draf = 0, belum = 0
    acaraList.forEach(a => {
      const t = a._totalHeat || 0
      const r = a._rasmiHeat || 0
      const d = a._drafHeat  || 0
      if (t > 0 && r === t) rasmi++
      else if (d > 0) draf++
      else belum++
    })
    return { rasmi, draf, belum, semua: acaraList.length }
  }, [acaraList])

  // Kiraan per hari untuk filter pills
  const hariFilterCounts = useMemo(() => {
    let rasmi = 0, draf = 0, belum = 0
    acaraHariIni.forEach(a => {
      const t = a._totalHeat || 0
      const r = a._rasmiHeat || 0
      const d = a._drafHeat  || 0
      if (t > 0 && r === t) rasmi++
      else if (d > 0) draf++
      else belum++
    })
    return { rasmi, draf, belum, semua: acaraHariIni.length }
  }, [acaraHariIni])

  // Acara selepas filter tab
  const acaraHariFiltered = useMemo(() => {
    if (filterTab === 'rasmi') return acaraHariIni.filter(a => (a._rasmiHeat || 0) === (a._totalHeat || 0) && (a._totalHeat || 0) > 0)
    if (filterTab === 'draf')  return acaraHariIni.filter(a => (a._drafHeat  || 0) > 0 && (a._rasmiHeat || 0) < (a._totalHeat || 0))
    if (filterTab === 'belum') return acaraHariIni.filter(a => (a._rasmiHeat || 0) === 0 && (a._drafHeat || 0) === 0)
    return acaraHariIni
  }, [acaraHariIni, filterTab])

  const namaKej = kejData?.namaKejohanan || 'Kejohanan'
  const isRasmi = ['rasmi', 'diterima'].includes(selectedHeat?.statusKeputusan)
  const isDalamBantahan = selectedHeat?.statusKeputusan === 'dalam_bantahan'
  const bolehInputSekarang = bolehEdit && !isRasmi && !sistemTutup

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="w-full pb-12">

      {/* Toast notification */}
      {toastMsg && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-semibold pointer-events-none transition-all ${
          toastType === 'ok' ? 'bg-teal-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toastMsg}
        </div>
      )}

      {/* Top Bar — gaya KOAM: putih, sticky */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="flex items-center gap-2 px-4 py-3">
          {step !== 'home' && (
            <button onClick={goBack} className="p-2 -ml-2 text-gray-400 hover:text-gray-700 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div className="flex-1 min-w-0">
            {step === 'home' && (
              <p className="text-sm font-bold text-gray-800">Input Keputusan</p>
            )}
            {step === 'input' && (
              <div>
                <p className="text-sm font-bold text-gray-800 truncate">
                  {selectedAcara?.noAcara ? `No.${selectedAcara.noAcara} · ` : ''}{selectedAcara?.namaAcara || '—'}
                </p>
                <p className="text-[10px] text-gray-400">
                  {heatsLoading ? 'Memuatkan…'
                    : selectedHeat
                    ? `Heat ${selectedHeat.noHeat ?? ''}${isRasmi ? ' · 🔒 Rasmi' : isDalamBantahan ? ' · ⚠️ Bantahan' : ''}`
                    : heats.length === 0 ? 'Tiada heat' : 'Pilih heat di bawah'}
                </p>
              </div>
            )}
          </div>
          {/* Jam live */}
          <span className="text-[10px] font-mono text-gray-400 shrink-0">{fmtJam(new Date(now))}</span>
          {/* Butang Draf shortcut — step input sahaja */}
          {step === 'input' && bolehInputSekarang && (
            <button onClick={handleSave} disabled={saving}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                saved ? 'bg-green-500 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
              }`}>
              {saving ? '…' : saved ? '✓' : 'Draf'}
            </button>
          )}
        </div>
      </div>

      {/* HOME — senarai acara (KOAM layout) */}
      {step === 'home' && (
        <div className="w-full pb-12">

          {/* Progress bar keseluruhan */}
          {acaraList.length > 0 && (
            <div className="px-4 py-2.5 bg-white border-b border-gray-100">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Progress Keseluruhan</span>
                <span className="text-[10px] font-mono font-bold text-gray-600">
                  {filterCounts.rasmi} / {acaraList.length}
                </span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden flex">
                <div className="h-full bg-green-500 transition-all"
                  style={{ width: `${acaraList.length ? filterCounts.rasmi / acaraList.length * 100 : 0}%` }} />
                <div className="h-full bg-amber-400 transition-all"
                  style={{ width: `${acaraList.length ? filterCounts.draf / acaraList.length * 100 : 0}%` }} />
              </div>
              <div className="flex gap-3 mt-1">
                <span className="text-[9px] font-bold text-green-700">✓ {filterCounts.rasmi} Rasmi</span>
                <span className="text-[9px] font-bold text-amber-600">⏳ {filterCounts.draf} Draf</span>
                <span className="text-[9px] text-gray-400">{filterCounts.belum} Belum</span>
              </div>
            </div>
          )}

          {/* Search bar */}
          <div className="px-4 py-2 bg-white border-b border-gray-100">
            <div className="relative">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-300"
                fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                className="w-full border border-gray-100 rounded-xl pl-9 pr-9 py-2 text-sm bg-gray-50 focus:outline-none focus:border-[#003399] focus:bg-white transition-colors"
                placeholder="Cari No. Acara atau nama acara…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <span className="text-sm">Memuatkan…</span>
            </div>
          ) : search ? (
            /* ── Mod Carian ── */
            <div className="bg-white">
              <div className="px-4 py-2 border-b border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Hasil Carian — {acaraFiltered.length} acara
                </p>
              </div>
              <div className="grid px-3 py-1.5 bg-gray-50 border-b border-gray-100 text-[9px] font-bold text-gray-400 uppercase tracking-widest"
                style={{ gridTemplateColumns: '36px 44px 1fr 58px 64px' }}>
                <div>No.</div><div>Masa</div><div>Acara</div>
                <div className="text-center">Jenis</div><div className="text-right">Status</div>
              </div>
              {acaraFiltered.length === 0
                ? <p className="text-sm text-gray-400 text-center py-10">Tiada acara dijumpai.</p>
                : acaraFiltered.map((a, idx) => (
                  <AcaraRow key={a.acaraId} acara={a} nowMs={now}
                    isLast={idx === acaraFiltered.length - 1} onClick={() => selectAcara(a)} />
                ))
              }
            </div>
          ) : (
            <>
              {/* ── Date chips ── */}
              {allDates.length > 1 && (
                <div className="flex gap-2 overflow-x-auto px-4 py-3 bg-white border-b border-gray-100">
                  {allDates.map(d => {
                    const isActive = d === selectedHari
                    const isToday  = d === new Date().toISOString().slice(0, 10)
                    const dt   = new Date(d + 'T00:00:00')
                    const hari = ['Ahd','Isn','Sel','Rab','Kha','Jum','Sab'][dt.getDay()]
                    const tgl  = `${dt.getDate()}/${dt.getMonth() + 1}`
                    return (
                      <button key={d} onClick={() => setSelectedHari(d)}
                        className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                          isActive ? 'bg-[#003399] text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}>
                        <span className="text-base leading-none">{isToday ? '📅' : '📆'}</span>
                        <span>{hari} {tgl}</span>
                        {isToday && (
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                            isActive ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-600'
                          }`}>Hari Ini</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* ── Filter pills ── */}
              <div className="flex gap-1.5 overflow-x-auto px-4 py-2 bg-white border-b border-gray-100">
                {[
                  { key: 'semua', label: 'Semua',   act: 'bg-[#003399] text-white', inact: 'bg-gray-100 text-gray-500' },
                  { key: 'belum', label: 'Belum',   act: 'bg-gray-600 text-white',  inact: 'bg-gray-100 text-gray-500' },
                  { key: 'draf',  label: '⏳ Draf', act: 'bg-amber-500 text-white', inact: 'bg-amber-50 text-amber-700' },
                  { key: 'rasmi', label: '✓ Rasmi', act: 'bg-green-600 text-white', inact: 'bg-green-50 text-green-700' },
                ].map(t => (
                  <button key={t.key} onClick={() => setFilterTab(t.key)}
                    className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                      filterTab === t.key ? t.act : t.inact
                    }`}>
                    {t.label}
                    <span className={`text-[9px] font-black px-1 py-0.5 rounded-full min-w-[16px] text-center ${
                      filterTab === t.key ? 'bg-white/25 text-white' : 'bg-white text-gray-600 border border-gray-200'
                    }`}>{hariFilterCounts[t.key]}</span>
                  </button>
                ))}
              </div>

              {/* ── Table header ── */}
              <div className="bg-white">
                <div className="grid px-3 py-1.5 bg-gray-50 border-b border-gray-100 text-[9px] font-bold text-gray-400 uppercase tracking-widest"
                  style={{ gridTemplateColumns: '36px 44px 1fr 58px 64px' }}>
                  <div>No.</div><div>Masa</div><div>Acara</div>
                  <div className="text-center">Jenis</div><div className="text-right">Status</div>
                </div>

                {acaraHariFiltered.length === 0 ? (
                  <div className="py-12 text-center">
                    <p className="text-2xl mb-2">
                      {filterTab === 'rasmi' ? '🏆' : filterTab === 'draf' ? '⏳' : '📋'}
                    </p>
                    <p className="text-sm text-gray-400">
                      {filterTab === 'rasmi' ? 'Tiada keputusan rasmi lagi.' :
                       filterTab === 'draf'  ? 'Tiada keputusan draf.' :
                       filterTab === 'belum' ? 'Semua acara sudah ada keputusan!' :
                       selectedHari ? 'Tiada acara dijadualkan hari ini.' : 'Tiada jadual ditemui.'}
                    </p>
                  </div>
                ) : (
                  acaraHariFiltered.map((a, idx) => (
                    <AcaraRow key={a.acaraId} acara={a} nowMs={now}
                      isLast={idx === acaraHariFiltered.length - 1}
                      onClick={() => selectAcara(a)} />
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* INPUT — acara & heat */}
      {step === 'input' && selectedAcara && (
        <div className="max-w-2xl mx-auto px-3 py-4 space-y-3">

          {/* #4h — Banner paparan sahaja (bukan pencatat) */}
          {!bolehEdit && (
            <div className="bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
              </svg>
              <span className="text-xs font-semibold text-gray-500">Paparan Sahaja — anda tidak mempunyai akses input</span>
            </div>
          )}

          {/* #4a — Info acara + heat tabs dalam satu container */}
          <div className="bg-[#003399]/5 rounded-2xl p-3.5 border border-[#003399]/10">
            <div className="flex items-start justify-between gap-3 mb-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-black text-white bg-[#003399] px-2 py-0.5 rounded-full">#{selectedAcara.noAcara ?? '—'}</span>
                  <p className="text-sm font-bold text-gray-800">{selectedAcara.namaAcara}</p>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {selectedAcara.jantina === 'L' ? 'Lelaki' : selectedAcara.jantina === 'P' ? 'Perempuan' : (selectedAcara.jantina || '')}
                  {' · '}{selectedAcara.kategoriKod || '—'}
                  {' · '}{JENIS_LABEL[selectedAcara.jenisAcara] || selectedAcara.jenisAcara || '—'}
                </p>
                {selectedAcara.masa && (
                  <p className="text-xs text-[#003399] font-semibold mt-0.5">{selectedAcara.masa}</p>
                )}
              </div>
              {/* #4b — Status badge ganti HeatDots */}
              <div className="shrink-0">
                {heatsLoading ? (
                  <span className="text-[10px] text-gray-400">…</span>
                ) : !selectedHeat ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">—</span>
                ) : isRasmi ? (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-green-100 text-green-700">Rasmi</span>
                ) : isDalamBantahan ? (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-100 text-red-600">Bantahan</span>
                ) : selectedHeat.statusKeputusan === 'tidak_rasmi' ? (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Draf</span>
                ) : (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                    {heats.length > 1 ? `Heat ${selectedHeat.noHeat ?? ''}` : 'Belum'}
                  </span>
                )}
              </div>
            </div>

            {/* Heat tabs dalam container yang sama */}
            {!heatsLoading && heats.length > 1 && (
              <div className="flex items-center gap-2 pt-2 border-t border-[#003399]/10">
                <div className="flex-1">
                  <HeatTabBar heats={heats} selectedHeat={selectedHeat} onSelect={h => selectHeat(h)} />
                </div>
                {/* #4c — Mod Semua: lorong + mass_start sahaja */}
                {['lorong', 'mass_start'].includes(selectedAcara.jenisAcara) && (
                  <button
                    onClick={() => {
                      if (!modSemua) initKeputusanSemua(heats)
                      setModSemua(v => !v)
                      setSaved(false)
                    }}
                    className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                      modSemua ? 'bg-[#003399] text-white border-[#003399]' : 'bg-white text-gray-500 border-gray-200 hover:border-[#003399]/30'
                    }`}>
                    {modSemua ? '✕ Tutup Semua' : '☰ Semua Peserta'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Loading heats */}
          {heatsLoading && (
            <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <span className="text-sm">Memuatkan heat…</span>
            </div>
          )}

          {!heatsLoading && heats.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-4 text-center">
              <p className="text-sm font-bold text-amber-700">Belum ada heat</p>
              <p className="text-xs text-amber-600 mt-0.5">Setup start list dahulu dalam panel Admin.</p>
            </div>
          )}

          {!heatsLoading && heats.length > 0 && (
            /* #4d — Lock overlay bila !bolehInputSekarang */
            <div className={!bolehInputSekarang && bolehEdit ? 'opacity-50 pointer-events-none select-none' : ''}>
              <div className="space-y-3">

                {/* #4e — Carian BIB: amber style */}
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input type="text" value={carianBib}
                    onChange={e => setCarianBib(e.target.value.toUpperCase())}
                    placeholder="Cari No. BIB…"
                    className="w-full pl-8 pr-4 py-2 border border-amber-200 rounded-xl text-xs bg-amber-50 focus:outline-none focus:border-amber-400 focus:bg-white transition-colors" />
                </div>

                {/* Banner: data dikemaskini dari luar */}
                {remoteKemaskini && (
                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                      <span className="text-xs font-semibold text-amber-700">Data dikemaskini oleh pencatat lain</span>
                    </div>
                    <button onClick={muatSemulaHeat}
                      className="shrink-0 text-[10px] font-black text-amber-700 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg hover:bg-amber-200 transition-colors">
                      Muat Semula
                    </button>
                  </div>
                )}

                {modSemua ? (
                  /* Mod Semua Peserta */
                  <InputSemuaPeserta
                    heats={heats}
                    acara={selectedAcara}
                    keputusanSemua={keputusanSemua}
                    onChange={handleChangeSemua}
                    sekolahMap={sekolahMap}
                    carianBib={carianBib}
                  />
                ) : selectedHeat && (
                  <>
                    {/* #4g — Status banner rasmi: teal dengan butang EDIT + PADAM */}
                    {isRasmi ? (
                      <div className="flex items-center justify-between px-4 py-3 bg-teal-50 border border-teal-200 rounded-xl">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-teal-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                          </svg>
                          <span className="text-sm font-bold text-teal-700">Keputusan Rasmi</span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={async () => {
                              if (!window.confirm('Edit semula keputusan ini? Status akan bertukar ke Draf.')) return
                              try {
                                await updateDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat', selectedHeat.heatId), { statusKeputusan: 'tidak_rasmi' })
                                setSelectedHeat(prev => ({ ...prev, statusKeputusan: 'tidak_rasmi' }))
                                setHeats(prev => prev.map(h => h.heatId === selectedHeat.heatId ? { ...h, statusKeputusan: 'tidak_rasmi' } : h))
                              } catch (e) { showToast('Ralat: ' + e.message, 'err', 5000) }
                            }}
                            className="text-[10px] font-black text-teal-700 bg-teal-100 border border-teal-200 px-2.5 py-1 rounded-lg hover:bg-teal-200 transition-colors">
                            EDIT
                          </button>
                          <button
                            onClick={async () => {
                              if (!window.confirm('Padam keputusan rasmi ini? Medal tally & mata olahragawan akan dirollback.')) return
                              try {
                                const isSaringanLocal = ['saringan_qf', 'saringan_sf', 'separuh_akhir'].includes(selectedAcara.peringkat || '')
                                const wasGrantMedal = !isSaringanLocal && (
                                  ['final', 'terus_final'].includes(selectedHeat.fasa) || heats.length === 1
                                )
                                const isRelayAcara = selectedAcara.jenisAcara === 'relay'
                                if (wasGrantMedal) {
                                  await rollbackPostRasmi(db,
                                    { id: selectedHeat.heatId, peserta: selectedHeat.peserta || [] },
                                    { ...selectedAcara, id: selectedAcara.acaraId },
                                    kejId,
                                    { schoolId, isRelay: isRelayAcara }
                                  ).catch(e => console.warn('rollback:', e.message))
                                }
                                const freshPeserta = (selectedHeat.peserta || []).map(p => ({ ...p, keputusan: null, status: 'belum', kedudukan: null, rankDalamHeat: null, pecahRekod: null, samaiRekod: null }))
                                await updateDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat', selectedHeat.heatId), { statusKeputusan: 'belum', peserta: freshPeserta })
                                setSelectedHeat(prev => ({ ...prev, statusKeputusan: 'belum', peserta: freshPeserta }))
                                setHeats(prev => prev.map(h => h.heatId === selectedHeat.heatId ? { ...h, statusKeputusan: 'belum', peserta: freshPeserta } : h))
                                setKeputusan(initKeputusanDariPeserta(selectedAcara, { ...selectedHeat, peserta: freshPeserta }))
                              } catch (e) { showToast('Ralat: ' + e.message, 'err', 5000) }
                            }}
                            className="text-[10px] font-black text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg hover:bg-red-100 transition-colors">
                            PADAM
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs bg-gray-50 border border-gray-200`}>
                        <span className={`w-2 h-2 rounded-full shrink-0 ${
                          selectedHeat.statusKeputusan === 'tidak_rasmi' ? 'bg-amber-400' : 'bg-gray-300'
                        }`} />
                        <span className="font-bold text-gray-600">
                          {selectedHeat.statusKeputusan === 'tidak_rasmi' ? 'Draf' : 'Belum Input'}
                        </span>
                      </div>
                    )}

                    {/* Input table */}
                    {selectedAcara.jenisAcara === 'lorong' && (
                      <InputLorong acara={selectedAcara} heat={selectedHeat} keputusan={keputusan}
                        onChange={handleChange} onWind={setWindSpeed} windSpeed={windSpeed}
                        sekolahMap={sekolahMap} carianBib={carianBib} />
                    )}
                    {selectedAcara.jenisAcara === 'mass_start' && (
                      <InputMassStart heat={selectedHeat} keputusan={keputusan}
                        onChange={handleChange} sekolahMap={sekolahMap} carianBib={carianBib} />
                    )}
                    {['padang_lompat', 'padang_balin'].includes(selectedAcara.jenisAcara) && (
                      <InputPadang acara={selectedAcara} peserta={peserta} keputusan={keputusan}
                        onChange={handleChange} sekolahMap={sekolahMap} carianBib={carianBib} />
                    )}
                    {selectedAcara.jenisAcara === 'relay' && (
                      <InputRelay acara={selectedAcara} heat={selectedHeat} keputusan={keputusan}
                        onChange={handleChange} sekolahMap={sekolahMap} carianBib={carianBib} />
                    )}
                  </>
                )}

                {/* #4f — Butang: grid 2 col, label HANTAR ▶, nota bawah */}
                {bolehEdit && (
                  <div className="space-y-1.5 pt-1">
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => modSemua ? handleSaveSemuaPeserta() : handleSave()}
                        disabled={saving}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3.5 rounded-2xl text-sm transition-colors disabled:opacity-50">
                        {saving ? 'Menyimpan…' : '💾 Simpan Draf'}
                      </button>
                      <button
                        onClick={() => modSemua ? handleSaveSemuaPeserta({ danHantar: true }) : handleHantar()}
                        disabled={saving || (!modSemua && isRasmi)}
                        className="bg-[#003399] hover:bg-[#002277] text-white font-bold py-3.5 rounded-2xl text-sm transition-colors disabled:opacity-40 shadow-lg shadow-[#003399]/20">
                        {saving ? 'Menghantar…' : (!modSemua && isRasmi) ? '✓ Sudah Rasmi' : 'HANTAR ▶'}
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-400 text-center">
                      Simpan Draf — simpan sementara. HANTAR — tandakan rasmi &amp; kira pingat.
                    </p>
                  </div>
                )}

                {saved && (
                  <p className="text-center text-xs text-green-600 font-semibold">✓ Berjaya disimpan</p>
                )}

                {/* Jana Final */}
                {isSaringanAcara && allHeatsDone && finalists.length > 0 && (
                  <JanaFinalPanel
                    finalists={finalists}
                    acara={selectedAcara}
                    onJana={handleJanaFinal}
                    loading={janaFinalLoading}
                    finalDijanaKe={finalDijanaKe}
                    finalSetup={finalSetup}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
