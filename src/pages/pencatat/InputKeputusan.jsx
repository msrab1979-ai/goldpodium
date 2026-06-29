/**
 * pencatat/InputKeputusan — /dashboard/kejohanan/:kejId/keputusan
 * Gold Podium multi-tenant — pencatat role
 *
 * Firestore paths (GP):
 *   tenants/{sId}/kejohanan/{kId}              — kejohanan doc
 *   tenants/{sId}/kejohanan/{kId}/acara        — senarai acara (tarikhAcara, masa, jenis, dll)
 *   tenants/{sId}/kejohanan/{kId}/heat/{hId}   — heat FLAT, field aceraId
 *   tenants/{sId}/kejohanan/{kId}/tetapan/finalSetup — config finalis
 *   tenants/{sId}/atlet/{noKP}                 — master atlet (fallback nama)
 *
 * Flow: Jadual hari ini → Pilih acara → Tab heat → Input → Simpan Draf / Hantar
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  collection, getDocs, getDoc, doc, updateDoc, setDoc,
  query, where, orderBy, serverTimestamp, onSnapshot,
} from 'firebase/firestore'
import { selectFinalists, assignLorong, getFinalistSetup } from '../../utils/finalistUtils'
import { runPostRasmi } from '../../utils/postRasmiUtils'
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

// ─── Komponen kecil ───────────────────────────────────────────────────────────

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

  const borderCls = allDone ? 'border-l-green-500' : anyDone ? 'border-l-green-400' : draf > 0 ? 'border-l-amber-400' : total > 0 ? 'border-l-gray-200' : 'border-l-transparent'

  const badge = allDone
    ? { text: '✓ Siap', cls: 'bg-green-500 text-white' }
    : anyDone ? { text: `✓ ${selesai}/${total}`, cls: 'bg-green-100 text-green-700' }
    : draf > 0 ? { text: '⏳ Draf', cls: 'bg-amber-100 text-amber-700' }
    : total > 0 ? { text: `${total}H Belum`, cls: 'bg-gray-100 text-gray-400' }
    : { text: 'Belum Setup', cls: 'bg-gray-100 text-gray-300' }

  return (
    <button onClick={onClick}
      className={`w-full text-left border-l-4 ${borderCls} ${!isLast ? 'border-b border-gray-50' : ''} ${
        allDone ? 'bg-green-50/40 hover:bg-green-50/60' : 'hover:bg-blue-50/30'
      } active:bg-blue-50/60 transition-colors`}>
      <div className="grid px-3 py-2.5 items-center gap-1.5"
        style={{ gridTemplateColumns: '36px 44px 1fr 64px' }}>
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
            {acara.jenisAcara ? ` · ${JENIS_LABEL[acara.jenisAcara] || acara.jenisAcara}` : ''}
          </p>
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

function HeatTabBar({ heats, selectedHeat, onSelect }) {
  if (!heats || heats.length <= 1) return null
  const hasSaringan = heats.some(h => h.fasa === 'heat' || h.fasa === 'saringan')
  return (
    <div className="flex gap-1.5 overflow-x-auto py-0.5">
      {heats.map(h => {
        const isSelected = selectedHeat?.heatId === h.heatId
        const isFinal = h.fasa === 'final' || h.fasa === 'terus_final'
        const label = isFinal ? (hasSaringan ? 'FINAL' : 'TERUS FINAL') : `Heat ${h.noHeat}`
        const dotCls = ['rasmi', 'diterima'].includes(h.statusKeputusan) ? 'bg-green-400'
          : h.statusKeputusan === 'tidak_rasmi' ? 'bg-amber-400' : 'bg-gray-300'
        return (
          <button key={h.heatId} onClick={() => onSelect(h)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
              isFinal
                ? isSelected ? 'bg-amber-500 text-white shadow-sm' : 'bg-amber-50 border border-amber-300 text-amber-700'
                : isSelected ? 'bg-[#003399] text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:border-[#003399]/30'
            }`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isSelected ? 'bg-white/60' : dotCls}`} />
            <span className={isFinal ? 'font-black tracking-wide' : ''}>{label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Input Lorong ─────────────────────────────────────────────────────────────

function InputLorong({ acara, heat, keputusan, onChange, onWind, windSpeed }) {
  const bilLorong = acara.bilanganLorong || heat.bilanganLorong || 8
  const isWind    = acara.isWindReading || false
  const slots     = Array.from({ length: bilLorong }, (_, i) => i + 1)
  const rankMap   = kiraLaranRank(slots, keputusan)

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
          style={{ gridTemplateColumns: '44px 80px 1fr 96px 60px 96px' }}>
          <div className="px-2 py-3 text-center">Lrg</div>
          <div className="px-2 py-3 text-center">No BIB</div>
          <div className="px-2 py-3">Atlet / Sekolah</div>
          <div className="px-2 py-3 text-center">Masa</div>
          <div className="px-2 py-3 text-center">Kddk</div>
          <div className="px-2 py-3 text-center">Catatan</div>
        </div>

        {slots.map((lorong, idx) => {
          const kp      = keputusan[lorong] || {}
          const isKosong = !kp.namaAtlet && !kp.noBib && !kp.kodSekolah && !kp.keputusan && !kp.status
          const rank    = rankMap[lorong]
          const flagged = ['DNS', 'DNF', 'DQ'].includes(kp.status)

          if (isKosong) {
            return (
              <div key={lorong} className="grid border-t border-gray-100 bg-gray-50"
                style={{ gridTemplateColumns: '44px 80px 1fr 96px 60px 96px' }}>
                <div className="px-1 py-3 flex items-center justify-center">
                  <span className="text-sm font-black text-gray-300">{lorong}</span>
                </div>
                <div className="col-span-5 px-3 flex items-center">
                  <span className="text-sm text-gray-300 italic">— Kosong —</span>
                </div>
              </div>
            )
          }

          const rowBg = flagged ? 'bg-red-50'
            : rank === 1 ? 'bg-yellow-50'
            : rank === 2 ? 'bg-gray-50'
            : rank === 3 ? 'bg-orange-50'
            : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'

          return (
            <div key={lorong} className={`grid border-t border-gray-100 ${rowBg}`}
              style={{ gridTemplateColumns: '44px 80px 1fr 96px 60px 96px' }}>

              <div className="px-1 py-3 flex items-center justify-center">
                <span className="text-sm font-black text-gray-700">{lorong}</span>
              </div>

              <div className="px-1 py-2 flex items-center">
                <span className="w-full text-center text-sm font-mono font-bold text-gray-700">{kp.noBib || '—'}</span>
              </div>

              <div className="px-2 py-2 flex flex-col justify-center min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{kp.namaAtlet || '—'}</p>
                <p className="text-xs text-gray-500 truncate leading-tight mt-0.5">{kp.kodSekolah || ''}</p>
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
                  className="w-full border-2 border-gray-300 rounded-lg px-1 py-2.5 text-sm font-mono font-bold text-center text-gray-900 focus:outline-none focus:border-[#003399] bg-white disabled:bg-gray-100 disabled:text-gray-300" />
                {kp.keputusan > 0 && (
                  <span className="text-[10px] font-mono text-[#003399] font-bold">{fmtMasaDisplay(kp.keputusan)}</span>
                )}
              </div>

              <div className="px-1 py-2 flex items-center justify-center">
                {flagged ? <span className="text-sm font-bold text-red-400">—</span> : (
                  rank ? <span className={`text-sm font-black ${rank === 1 ? 'text-yellow-600' : rank === 2 ? 'text-gray-500' : rank === 3 ? 'text-orange-600' : 'text-gray-400'}`}>{rank}</span>
                  : <span className="text-xs text-gray-300">—</span>
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

function InputPadang({ acara, peserta, keputusan, onChange }) {
  const rankMap = kiraPadangRank(peserta, keputusan)
  const unit    = 'm'

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="grid bg-[#003399] text-white text-xs font-bold uppercase tracking-wider"
        style={{ gridTemplateColumns: '72px 1fr 100px 60px 80px' }}>
        <div className="px-2 py-3 text-center">No BIB</div>
        <div className="px-2 py-3">Nama Atlet</div>
        <div className="px-2 py-3 text-center">Jarak ({unit})</div>
        <div className="px-2 py-3 text-center">Kddk</div>
        <div className="px-2 py-3 text-center">Flag</div>
      </div>

      {peserta.map((p, idx) => {
        const key     = p.noBib || idx
        const kp      = keputusan[key] || {}
        const rank    = rankMap[key]
        const flagged = ['DQ', 'DNS', 'DNF'].includes(kp.status)
        const rowBg   = flagged ? 'bg-red-50' : rank === 1 ? 'bg-yellow-50' : rank === 2 ? 'bg-gray-50' : rank === 3 ? 'bg-orange-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'

        return (
          <div key={key} className={`grid border-t border-gray-100 ${rowBg}`}
            style={{ gridTemplateColumns: '72px 1fr 100px 60px 80px' }}>

            <div className="px-2 py-2.5 flex items-center justify-center">
              <span className="text-sm font-mono font-bold text-gray-800">{p.noBib || '—'}</span>
            </div>

            <div className="px-2 py-2.5 flex items-center min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{p.namaAtlet || `#${idx + 1}`}</p>
            </div>

            <div className="px-2 py-2 flex items-center">
              <input type="number" step="0.01" min="0"
                value={kp.keputusan ?? ''}
                disabled={flagged}
                onChange={e => onChange(key, 'keputusan', e.target.value)}
                placeholder="0.00"
                className="w-full border-2 border-gray-300 rounded-lg px-2 py-2.5 text-sm font-mono font-bold text-center text-gray-900 focus:outline-none focus:border-[#003399] bg-white disabled:bg-gray-100 disabled:text-gray-300" />
            </div>

            <div className="px-1 py-2 flex items-center justify-center">
              {flagged ? <span className="text-sm font-bold text-red-400">—</span> : (
                rank ? <span className={`text-sm font-black ${rank <= 3 ? ['text-yellow-600','text-gray-500','text-orange-600'][rank-1] : 'text-gray-400'}`}>{rank}</span>
                : <span className="text-xs text-gray-300">—</span>
              )}
            </div>

            <div className="px-1 py-2 flex flex-col items-center gap-1">
              {['DQ', 'DNS'].map(flag => (
                <button key={flag} type="button"
                  onClick={() => onChange(key, 'status', kp.status === flag ? '' : flag)}
                  className={`w-full py-1.5 text-[9px] font-bold rounded transition-colors ${
                    kp.status === flag ? 'bg-red-500 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-400'
                  }`}>{flag}</button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Input Mass Start ─────────────────────────────────────────────────────────

function InputMassStart({ heat, keputusan, onChange }) {
  const pesertaArr = heat.peserta || []
  const slots      = Array.from({ length: pesertaArr.length || 10 }, (_, i) => i + 1)
  const rankMap    = kiraLaranRank(slots, keputusan)

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="grid bg-[#003399] text-white text-xs font-bold uppercase tracking-wider"
        style={{ gridTemplateColumns: '40px 72px 1fr 96px 60px 96px' }}>
        <div className="px-2 py-3 text-center">Bil</div>
        <div className="px-2 py-3 text-center">BIB</div>
        <div className="px-2 py-3">Atlet</div>
        <div className="px-2 py-3 text-center">Masa</div>
        <div className="px-2 py-3 text-center">Kddk</div>
        <div className="px-2 py-3 text-center">Catatan</div>
      </div>

      {slots.map((slot, idx) => {
        const kp      = keputusan[slot] || {}
        const rank    = rankMap[slot]
        const flagged = ['DNS', 'DNF', 'DQ'].includes(kp.status)
        const rowBg   = flagged ? 'bg-red-50' : rank === 1 ? 'bg-yellow-50' : rank === 2 ? 'bg-gray-50' : rank === 3 ? 'bg-orange-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'

        return (
          <div key={slot} className={`grid border-t border-gray-100 ${rowBg}`}
            style={{ gridTemplateColumns: '40px 72px 1fr 96px 60px 96px' }}>

            <div className="px-1 py-2.5 flex items-center justify-center">
              <span className="text-sm font-black text-gray-600">{slot}</span>
            </div>

            <div className="px-1 py-2 flex items-center justify-center">
              <span className="text-sm font-mono font-bold text-gray-700">{kp.noBib || '—'}</span>
            </div>

            <div className="px-2 py-2 flex flex-col justify-center min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{kp.namaAtlet || '—'}</p>
              <p className="text-xs text-gray-500 truncate leading-tight mt-0.5">{kp.kodSekolah || ''}</p>
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
                className="w-full border-2 border-gray-300 rounded-lg px-2 py-2 text-sm font-mono font-bold text-center text-gray-900 focus:outline-none focus:border-[#003399] bg-white disabled:bg-gray-100 disabled:text-gray-300" />
              {kp.keputusan > 0 && (
                <span className="text-[10px] font-mono text-[#003399] font-bold">{fmtMasaDisplay(kp.keputusan)}</span>
              )}
            </div>

            <div className="px-1 py-2 flex items-center justify-center">
              {flagged ? <span className="text-sm font-bold text-red-400">—</span>
                : rank ? <span className={`text-sm font-black ${rank <= 3 ? ['text-yellow-600','text-gray-500','text-orange-600'][rank-1] : 'text-gray-400'}`}>{rank}</span>
                : <span className="text-xs text-gray-300">—</span>}
            </div>

            <div className="px-1 py-2 flex items-center gap-0.5">
              {['DNS', 'DNF', 'DQ'].map(flag => (
                <button key={flag} type="button"
                  onClick={() => {
                    const n = kp.status === flag ? '' : flag
                    onChange(slot, 'status', n)
                    if (n) { onChange(slot, 'keputusan', ''); onChange(slot, '_raw', '') }
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

// ─── Input Relay ──────────────────────────────────────────────────────────────

function InputRelay({ acara, heat, keputusan, onChange }) {
  const bilPasukan = acara.bilPasukan || heat.bilPasukan || acara.bilanganLorong || 8
  const slots      = Array.from({ length: bilPasukan }, (_, i) => i + 1)
  const rankMap    = kiraLaranRank(slots, keputusan)

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="grid bg-[#003399] text-white text-xs font-bold uppercase tracking-wider"
        style={{ gridTemplateColumns: '44px 1fr 96px 60px 96px' }}>
        <div className="px-2 py-3 text-center">Lrg</div>
        <div className="px-2 py-3">Sekolah/Pasukan</div>
        <div className="px-2 py-3 text-center">Masa</div>
        <div className="px-2 py-3 text-center">Kddk</div>
        <div className="px-2 py-3 text-center">Catatan</div>
      </div>

      {slots.map((lorong, idx) => {
        const kp      = keputusan[lorong] || {}
        const isKosong = !kp.kodSekolah && !kp.keputusan && !kp.status
        const rank    = rankMap[lorong]
        const flagged = ['DNS', 'DNF', 'DQ'].includes(kp.status)
        const rowBg   = flagged ? 'bg-red-50' : rank === 1 ? 'bg-yellow-50' : rank === 2 ? 'bg-gray-50' : rank === 3 ? 'bg-orange-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'

        if (isKosong) {
          return (
            <div key={lorong} className="grid border-t border-gray-100 bg-gray-50"
              style={{ gridTemplateColumns: '44px 1fr 96px 60px 96px' }}>
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
            style={{ gridTemplateColumns: '44px 1fr 96px 60px 96px' }}>

            <div className="px-1 py-2.5 flex items-center justify-center">
              <span className="text-sm font-black text-gray-700">{lorong}</span>
            </div>

            <div className="px-2 py-2 flex flex-col justify-center min-w-0">
              <p className="text-sm font-bold text-gray-800 truncate">{kp.kodSekolah || '—'}</p>
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
                className="w-full border-2 border-gray-300 rounded-lg px-2 py-2.5 text-sm font-mono font-bold text-center text-gray-900 focus:outline-none focus:border-[#003399] bg-white disabled:bg-gray-100 disabled:text-gray-300" />
              {kp.keputusan > 0 && (
                <span className="text-[10px] font-mono text-[#003399] font-bold">{fmtMasaDisplay(kp.keputusan)}</span>
              )}
            </div>

            <div className="px-1 py-2 flex items-center justify-center">
              {flagged ? <span className="text-sm font-bold text-red-400">—</span>
                : rank ? <span className={`text-sm font-black ${rank <= 3 ? ['text-yellow-600','text-gray-500','text-orange-600'][rank-1] : 'text-gray-400'}`}>{rank}</span>
                : <span className="text-xs text-gray-300">—</span>}
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
          <p className="text-[10px] text-gray-500 mt-0.5 font-semibold">{finalists.length} finalis</p>
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
          <div className="px-2 py-2">Atlet</div>
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
                {f.keputusan ? (isPadang ? f.keputusan.toFixed(2) : fmtMasaDisplay(f.keputusan)) : '—'}
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

  const bolehEdit = ['teacher', 'pencatat', 'pengurus_teknik', 'urusetia', 'admin', 'superadmin'].includes(userData?.role)

  const [step, setStep]         = useState('home') // 'home' | 'input'
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
  const [loading,       setLoading]       = useState(true)

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

  const heatListenerRef = useRef(null)

  // ── Load data ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!schoolId || !kejId) { setLoading(false); return }

    async function load() {
      setLoading(true)
      try {
        // Baca kejohanan doc
        const kejSnap = await getDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId))
        if (kejSnap.exists()) setKejData(kejSnap.data())

        // Baca finalSetup
        getDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'tetapan', 'finalSetup'))
          .then(s => { if (s.exists()) setFinalSetup(s.data()) }).catch(() => {})

        // Baca semua acara — sort by noAcara client-side
        const acaraSnap = await getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'acara'))
        const acaraDocs = acaraSnap.docs
          .map(d => ({ acaraId: d.id, ...d.data() }))
          .sort((a, b) => (a.noAcara ?? 999) - (b.noAcara ?? 999))

        // Baca heat status (flat collection) — 1 query, group by aceraId
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

        // Default hari
        const allDates = [...new Set(acaraWithCounts.map(a => a.tarikhAcara).filter(Boolean))].sort()
        const today = new Date().toISOString().slice(0, 10)
        setSelectedHari(allDates.includes(today) ? today : (allDates[0] || null))
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
          status:     (p.status && p.status !== 'belum') ? p.status : '',
        }
      })
    } else {
      // padang_lompat / padang_balin
      pesertaArr.forEach(p => {
        kpMap[p.noBib] = {
          noBib:     p.noBib || '',
          namaAtlet: p.namaAtlet || '',
          keputusan: p.keputusan != null ? String(p.keputusan) : '',
          status:    (p.status && p.status !== 'belum') ? p.status : '',
        }
      })
    }
    return kpMap
  }

  // ── Navigate ke acara ───────────────────────────────────────────────────────

  async function selectAcara(acara) {
    setSelectedAcara(acara)
    setSelectedHeat(null)
    setHeats([])
    setKeputusan({})
    setWindSpeed('')
    setSaved(false)
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
    setWindSpeed(heat.windSpeed != null ? String(heat.windSpeed) : '')
    setKeputusan(initKeputusanDariPeserta(acara, heat))
    setPeserta(heat.peserta || [])
  }

  // ── Realtime listener heat semasa ──────────────────────────────────────────

  useEffect(() => {
    if (heatListenerRef.current) { heatListenerRef.current(); heatListenerRef.current = null }
    if (!schoolId || !kejId || !selectedAcara || !selectedHeat?.heatId) return

    const hRef = doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat', selectedHeat.heatId)
    heatListenerRef.current = onSnapshot(hRef, snap => {
      if (!snap.exists()) return
      const d = snap.data()
      setSelectedHeat(prev => prev ? {
        ...prev,
        statusKeputusan:  d.statusKeputusan  ?? prev.statusKeputusan,
        bantahanDiterima: d.bantahanDiterima ?? false,
      } : prev)
      setHeats(prev => prev.map(h =>
        h.heatId === snap.id
          ? { ...h, statusKeputusan: d.statusKeputusan ?? h.statusKeputusan }
          : h
      ))
    }, () => {})

    return () => { if (heatListenerRef.current) { heatListenerRef.current(); heatListenerRef.current = null } }
  }, [schoolId, kejId, selectedAcara?.acaraId, selectedHeat?.heatId]) // eslint-disable-line

  // ── goBack ──────────────────────────────────────────────────────────────────

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
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleChange(slot, field, value) {
    setKeputusan(prev => ({ ...prev, [slot]: { ...(prev[slot] || {}), [field]: value } }))
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

      const rawStatus = kp.status || p.status || 'belum'
      const isFlagged = ['DNS', 'DNF', 'DQ'].includes(rawStatus)
      const hasResult = val != null && !isNaN(Number(val)) && Number(val) > 0
      const finalStatus = isFlagged ? rawStatus : hasResult ? 'selesai' : rawStatus

      return { ...p, keputusan: val, status: finalStatus, updatedBy: userData?.uid || '' }
    })

    // Kira rankDalamHeat
    const finishers = [...updatedPeserta]
      .filter(p => p.status === 'selesai' && p.keputusan != null)
      .sort((a, b) => isPadang ? Number(b.keputusan) - Number(a.keputusan) : Number(a.keputusan) - Number(b.keputusan))

    const rankKey = p => jenisAcara === 'relay' ? p.lorong : p.noBib
    const autoRankMap = new Map()
    finishers.forEach((p, i) => autoRankMap.set(rankKey(p), i + 1))

    return updatedPeserta.map(p => ({
      ...p,
      rankDalamHeat: (p.status === 'selesai' && p.keputusan != null)
        ? (autoRankMap.get(rankKey(p)) || null) : null,
    }))
  }

  async function handleSave() {
    if (!schoolId || !kejId || !selectedAcara || !selectedHeat || !bolehEdit) return
    setSaving(true); setSaved(false)
    try {
      const heatRef = doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat', selectedHeat.heatId)
      const pesertaDenganRank = buildUpdatedPeserta(selectedAcara, selectedHeat, keputusan)

      const stripUndef = obj => Object.fromEntries(Object.entries(obj).filter(([k, v]) => !k.startsWith('_') && v !== undefined))
      const updates = { peserta: pesertaDenganRank.map(stripUndef), updatedAt: serverTimestamp() }
      if (selectedAcara.isWindReading && windSpeed !== '') updates.windSpeed = Number(windSpeed) || null

      await updateDoc(heatRef, updates)
      const curStatus = selectedHeat.statusKeputusan
      setSelectedHeat(prev => ({ ...prev, ...updates, statusKeputusan: curStatus, peserta: pesertaDenganRank }))
      setHeats(prev => prev.map(h => h.heatId === selectedHeat.heatId ? { ...h, statusKeputusan: curStatus, peserta: pesertaDenganRank } : h))
      setSaved(true)
    } catch (e) {
      alert(`Ralat menyimpan: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleHantar() {
    if (!schoolId || !kejId || !selectedAcara || !selectedHeat || !bolehEdit) return
    setSaving(true); setSaved(false)
    try {
      await handleSave()

      const heatRef  = doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat', selectedHeat.heatId)
      const acaraRef = doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'acara', selectedAcara.acaraId)

      await updateDoc(heatRef, { statusKeputusan: 'diterima', bantahanDiterima: false, updatedAt: serverTimestamp() })
      await updateDoc(acaraRef, { statusAcara: 'ada_keputusan', updatedAt: serverTimestamp() }).catch(() => {})

      // runPostRasmi — kira medal_tally, rekod, mata olahragawan
      const pesertaDenganRank = buildUpdatedPeserta(selectedAcara, selectedHeat, keputusan)
      const heatDocForPost = { id: selectedHeat.heatId, peserta: pesertaDenganRank, windSpeed: selectedHeat.windSpeed ?? '' }
      const acaraDocForPost = { ...selectedAcara, id: selectedAcara.acaraId }
      await runPostRasmi(db, heatDocForPost, acaraDocForPost, kejId, {
        schoolId,
        mataPingat:   kejData?.mataPingat   || { 1: 5, 2: 3, 3: 2, 4: 1 },
        peringkatKej: kejData?.peringkatKej || 'D',
        grantMedal:   selectedHeat.fasa === 'final' || selectedHeat.fasa === 'terus_final',
        isRelay:      selectedAcara.jenisAcara === 'relay',
      }).catch(e => console.warn('postRasmi:', e.message))

      const patch = { statusKeputusan: 'diterima' }
      setSelectedHeat(prev => ({ ...prev, ...patch }))
      setHeats(prev => prev.map(h => h.heatId === selectedHeat.heatId ? { ...h, ...patch } : h))

      setSaved(true)
    } catch (e) {
      alert(`Ralat hantar: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  // ── Jana Final ──────────────────────────────────────────────────────────────

  const finalDijanaKe = useMemo(() => {
    if (!selectedAcara || !heats.length) return null
    const firstHeat = heats[0]
    return firstHeat?.finalDijanaKe || null
  }, [selectedAcara, heats])

  const isSaringanAcara = selectedAcara
    ? ['saringan', 'suku_akhir', 'separuh_akhir'].includes(selectedAcara.peringkat)
    : false

  const allHeatsDone = heats.length > 0 && heats.every(h => ['rasmi', 'diterima'].includes(h.statusKeputusan))

  const finalists = useMemo(() => {
    if (!isSaringanAcara || !allHeatsDone || !selectedAcara) return []
    return selectFinalists(heats, selectedAcara, finalSetup)
  }, [isSaringanAcara, allHeatsDone, heats, selectedAcara, finalSetup])

  async function handleJanaFinal(finalistList) {
    if (!schoolId || !kejId || !selectedAcara || !finalistList.length) return
    setJanaFinalLoading(true)
    try {
      const finalAcaraId = selectedAcara.finalAcaraId
      if (!finalAcaraId) { alert('Tiada acara final dikaitkan. Setup dalam AcaraSetup.'); setJanaFinalLoading(false); return }

      const finalAcaraSnap = await getDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'acara', finalAcaraId))
      const finalAcara = finalAcaraSnap.exists() ? finalAcaraSnap.data() : {}

      // Padam heat final lama
      const oldHeats = await getDocs(query(
        collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat'),
        where('aceraId', '==', finalAcaraId)
      ))
      await Promise.all(oldHeats.docs.map(d => d.ref.delete()))

      // Assign lorong & buat 1 heat final
      const withLorong = assignLorong(finalistList, finalAcara)
      const heatId = `heat_final_${Date.now()}`
      await setDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat', heatId), {
        heatId,
        aceraId:         finalAcaraId,
        noHeat:          1,
        fasa:            'final',
        peringkat:       'final',
        statusKeputusan: 'belum',
        peserta:         withLorong,
        createdAt:       serverTimestamp(),
      })

      // Update parent heats dengan finalDijanaKe
      await Promise.all(heats.map(h =>
        updateDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat', h.heatId), {
          finalDijanaKe: finalAcara.noAcara || finalAcaraId,
        }).catch(() => {})
      ))

      setHeats(prev => prev.map(h => ({ ...h, finalDijanaKe: finalAcara.noAcara || finalAcaraId })))
      alert(`Final berjaya dijana! (${withLorong.length} finalis)`)
    } catch (e) {
      alert('Ralat jana final: ' + e.message)
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

  const namaKej = kejData?.namaKejohanan || 'Kejohanan'

  // ── Render ──────────────────────────────────────────────────────────────────

  const isRasmi = ['rasmi', 'diterima'].includes(selectedHeat?.statusKeputusan)

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="bg-[#003399] text-white px-4 py-3.5 shadow-lg sticky top-0 z-30">
        <div className="flex items-center gap-3">
          {step === 'input' && (
            <button onClick={goBack} className="text-white/60 hover:text-white p-1 -ml-1 rounded-lg hover:bg-white/10 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[9px] text-white/50 uppercase tracking-widest">Pencatat · Gold Podium</p>
            <p className="text-sm font-bold leading-tight truncate">
              {step === 'input' && selectedAcara
                ? `#${selectedAcara.noAcara ?? '—'} · ${selectedAcara.namaAcara || '—'}`
                : namaKej}
            </p>
          </div>
          <button onClick={() => navigate(`/${slug}/pencatat/dashboard`)}
            className="text-white/50 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </button>
        </div>
      </header>

      {/* HOME — senarai acara */}
      {step === 'home' && (
        <div className="max-w-2xl mx-auto px-3 py-4 space-y-3">

          {/* Carian */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Cari no. acara atau nama…"
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:border-[#003399]/40 focus:ring-2 focus:ring-[#003399]/10" />
            </div>
          </div>

          {/* Hari tabs */}
          {!search && allDates.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {allDates.map(d => {
                const fmt = new Date(d).toLocaleDateString('ms-MY', { day: 'numeric', month: 'short' })
                return (
                  <button key={d} onClick={() => setSelectedHari(d)}
                    className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      selectedHari === d ? 'bg-[#003399] text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-500 hover:border-[#003399]/30'
                    }`}>{fmt}</button>
                )
              })}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <span className="text-sm">Memuatkan…</span>
            </div>
          ) : acaraFiltered.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-10">Tiada acara ditemui.</p>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {acaraFiltered.map((a, idx) => (
                <AcaraRow key={a.acaraId} acara={a} isLast={idx === acaraFiltered.length - 1}
                  nowMs={now} onClick={() => selectAcara(a)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* INPUT — acara & heat */}
      {step === 'input' && selectedAcara && (
        <div className="max-w-2xl mx-auto px-3 py-4 space-y-3">

          {/* Info acara */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-black text-white bg-[#003399] px-2 py-0.5 rounded-full">#{selectedAcara.noAcara ?? '—'}</span>
                  <p className="text-sm font-bold text-gray-800">{selectedAcara.namaAcara}</p>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {selectedAcara.jantina === 'L' ? 'Lelaki' : selectedAcara.jantina === 'P' ? 'Perempuan' : (selectedAcara.jantina || '')}
                  {' · '}{selectedAcara.kategoriKod || selectedAcara.kategori || '—'}
                  {' · '}{JENIS_LABEL[selectedAcara.jenisAcara] || selectedAcara.jenisAcara || '—'}
                </p>
                {selectedAcara.masa && (
                  <p className="text-xs text-[#003399] font-semibold mt-0.5">{selectedAcara.masa}</p>
                )}
              </div>
              <HeatDots total={selectedAcara._totalHeat || heats.length} rasmi={selectedAcara._rasmiHeat || 0} draf={selectedAcara._drafHeat || 0} />
            </div>
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
            <>
              {/* Heat tabs */}
              <HeatTabBar heats={heats} selectedHeat={selectedHeat} onSelect={h => selectHeat(h)} />

              {selectedHeat && (
                <>
                  {/* Status bar */}
                  <div className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs ${
                    isRasmi ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        isRasmi ? 'bg-green-500' : selectedHeat.statusKeputusan === 'tidak_rasmi' ? 'bg-amber-400' : 'bg-gray-300'
                      }`} />
                      <span className={`font-bold ${isRasmi ? 'text-green-700' : 'text-gray-600'}`}>
                        {isRasmi ? 'Telah Diterima' : selectedHeat.statusKeputusan === 'tidak_rasmi' ? 'Draf' : 'Belum Input'}
                      </span>
                    </div>
                    {isRasmi && (
                      <span className="text-green-600 font-semibold">✓ Keputusan rasmi</span>
                    )}
                  </div>

                  {/* Input table */}
                  {selectedAcara.jenisAcara === 'lorong' && (
                    <InputLorong acara={selectedAcara} heat={selectedHeat} keputusan={keputusan} onChange={handleChange} onWind={setWindSpeed} windSpeed={windSpeed} />
                  )}
                  {selectedAcara.jenisAcara === 'mass_start' && (
                    <InputMassStart heat={selectedHeat} keputusan={keputusan} onChange={handleChange} />
                  )}
                  {['padang_lompat', 'padang_balin'].includes(selectedAcara.jenisAcara) && (
                    <InputPadang acara={selectedAcara} peserta={peserta} keputusan={keputusan} onChange={handleChange} />
                  )}
                  {selectedAcara.jenisAcara === 'relay' && (
                    <InputRelay acara={selectedAcara} heat={selectedHeat} keputusan={keputusan} onChange={handleChange} />
                  )}

                  {/* Butang Simpan / Hantar */}
                  {bolehEdit && (
                    <div className="flex gap-2.5 pt-1">
                      <button onClick={handleSave} disabled={saving}
                        className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3.5 rounded-2xl text-sm transition-colors disabled:opacity-50">
                        {saving ? 'Menyimpan…' : '💾 Simpan Draf'}
                      </button>
                      <button onClick={handleHantar} disabled={saving || isRasmi}
                        className="flex-1 bg-[#003399] hover:bg-[#002277] text-white font-bold py-3.5 rounded-2xl text-sm transition-colors disabled:opacity-40 shadow-lg shadow-[#003399]/20">
                        {saving ? 'Menghantar…' : isRasmi ? '✓ Sudah Rasmi' : '✅ Hantar Rasmi'}
                      </button>
                    </div>
                  )}

                  {saved && (
                    <p className="text-center text-xs text-green-600 font-semibold">✓ Berjaya disimpan</p>
                  )}
                </>
              )}

              {/* Jana Final — bila semua heat saringan selesai */}
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
            </>
          )}
        </div>
      )}
    </div>
  )
}
