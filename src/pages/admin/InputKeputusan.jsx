/**
 * InputKeputusan — /admin/kejohanan/:kejId/keputusan
 * Gold Podium — multi-tenant
 *
 * Sokong 5 jenis acara:
 *   lorong       — masa, lorong, angin global
 *   mass_start   — masa, giliran
 *   padang_lompat — jarak (cubaan), angin per cubaan
 *   padang_balin  — jarak (cubaan)
 *   relay         — masa, lorong
 *
 * Firestore paths:
 *   tenants/{sId}/kejohanan/{kId}/heat/{hId}  (flat — acaraId field)
 *   tenants/{sId}/atlet/{atletId}
 */

import { useState, useEffect, useCallback } from 'react'
import {
  collection, getDocs, doc, getDoc, updateDoc,
  serverTimestamp, query, where, orderBy,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { runPostRasmi } from '../../utils/postRasmiUtils'

// ─── Path helpers ─────────────────────────────────────────────────────────────

function getKejContext() {
  try { return JSON.parse(sessionStorage.getItem('gp_kej_aktif') || '{}') } catch { return {} }
}

// ─── Helpers pengiraan ────────────────────────────────────────────────────────

function masaKeSaat(str) {
  if (!str || !String(str).trim()) return null
  const s = String(str).trim().replace(',', '.')
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s)
  const m = s.match(/^(\d+):(\d{2})(\.\d+)?$/)
  if (m) return parseInt(m[1]) * 60 + parseInt(m[2]) + parseFloat(m[3] || '.0')
  return null
}

function saatKeStr(saat) {
  if (saat === null || saat === undefined) return ''
  if (saat < 60) return saat.toFixed(2)
  const m = Math.floor(saat / 60)
  const s = (saat % 60).toFixed(2).padStart(5, '0')
  return `${m}:${s}`
}

function jarakTerbaik(cubaan = []) {
  const valid = (cubaan || []).map(c => parseFloat(c) || 0).filter(v => v > 0)
  return valid.length ? Math.max(...valid) : null
}

// Key unik peserta — GP guna noKP sebagai ID (bukan atletId)
function pesertaKey(p) { return p.noKP || p.atletId || p.noBib || '' }

function kiraRankLorong(peserta) {
  const valid = peserta.filter(p => masaKeSaat(p.masa) !== null && !p.dns && !p.dnf && !p.dq)
  const sorted = [...valid].sort((a, b) => (masaKeSaat(a.masa) || 9999) - (masaKeSaat(b.masa) || 9999))
  return peserta.map(p => {
    if (p.dns || p.dnf || p.dq) return { ...p, kedudukan: null }
    const idx = sorted.findIndex(s => pesertaKey(s) === pesertaKey(p))
    return { ...p, kedudukan: idx >= 0 ? idx + 1 : null }
  })
}

function kiraRankPadang(peserta) {
  const valid = peserta.filter(p => jarakTerbaik(p.cubaan) !== null && !p.dns && !p.dnf && !p.dq)
  const sorted = [...valid].sort((a, b) => (jarakTerbaik(b.cubaan) || 0) - (jarakTerbaik(a.cubaan) || 0))
  return peserta.map(p => {
    if (p.dns || p.dnf || p.dq) return { ...p, kedudukan: null }
    const idx = sorted.findIndex(s => pesertaKey(s) === pesertaKey(p))
    return { ...p, kedudukan: idx >= 0 ? idx + 1 : null }
  })
}

// Nama & sekolah peserta — GP simpan dalam peserta doc sendiri (namaAtlet, sekolah)
// atletMap digunakan sebagai fallback sahaja
function namaPeserta(p, atletMap, isRelay) {
  if (isRelay) return p.namaPasukan || p.namaAtlet || p.atletId || '—'
  return p.namaAtlet || atletMap[p.noKP]?.nama || atletMap[p.atletId]?.nama || p.nama || p.noKP || '—'
}
function sekolahPeserta(p, atletMap, isRelay) {
  if (isRelay) return ''
  return p.sekolah || atletMap[p.noKP]?.sekolah || atletMap[p.atletId]?.sekolah || ''
}

// ─── Const / label ────────────────────────────────────────────────────────────

const WARNA_JENIS = {
  lorong:        'bg-blue-100 text-blue-700 border-blue-200',
  mass_start:    'bg-cyan-100 text-cyan-700 border-cyan-200',
  padang_lompat: 'bg-green-100 text-green-700 border-green-200',
  padang_balin:  'bg-orange-100 text-orange-700 border-orange-200',
  relay:         'bg-purple-100 text-purple-700 border-purple-200',
}
const LABEL_JENIS = {
  lorong: 'Lorong', mass_start: 'Mass Start',
  padang_lompat: 'Lompat', padang_balin: 'Balin', relay: 'Relay',
}
const FASA_LABEL = {
  heat: 'H', saringan: 'S', final: 'F',
  suku_akhir: 'QF', separuh_akhir: 'SF', terus_final: 'F',
}
const FASA_FULL = {
  heat: 'Heat', saringan: 'Saringan', final: 'Final',
  suku_akhir: 'Suku Akhir', separuh_akhir: 'Separuh Akhir', terus_final: 'Terus Final',
}

const Ikon = {
  balik:  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>,
  trophy: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>,
  keluar: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
  save:   <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>,
  edit:   <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
}

// ─── Modal Input Lorong / Mass Start / Relay ──────────────────────────────────

function ModalInputLorong({ acara, heat, atletMap, schoolId, kejId, kejDoc, onTutup, onSimpan }) {
  const isMass   = acara.jenisAcara === 'mass_start'
  const adaAngin = acara.jenisAcara === 'lorong' || acara.jenisAcara === 'relay'
  const isRelay  = acara.jenisAcara === 'relay'

  const [rows,       setRows]       = useState(() =>
    (heat.peserta || []).map(p => ({
      ...p,
      masa: p.masa || '',
      dns:  p.dns  || false,
      dnf:  p.dnf  || false,
      dq:   p.dq   || false,
    }))
  )
  const [windGlobal, setWindGlobal] = useState(heat.windSpeed || '')
  const [simpan,     setSimpan]     = useState({ loading: false, ok: false, err: '' })

  function setRow(i, field, val) {
    setRows(r => r.map((x, idx) => idx === i ? { ...x, [field]: val } : x))
  }
  function toggleFlag(i, flag) {
    setRows(r => r.map((x, idx) => {
      if (idx !== i) return x
      const on = !x[flag]
      return { ...x, dns: false, dnf: false, dq: false, [flag]: on, masa: on ? '' : x.masa }
    }))
  }

  async function handleSimpan() {
    setSimpan({ loading: true, ok: false, err: '' })
    try {
      const withRank    = kiraRankLorong(rows)
      const hRef        = doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat', heat.id)
      await updateDoc(hRef, {
        peserta:         withRank,
        windSpeed:       adaAngin ? (windGlobal || '') : '',
        statusKeputusan: 'ada_keputusan',
        dikemaskinPada:  serverTimestamp(),
      })
      // Fire-and-forget postRasmi — UI kembali segera, tally di-update background
      const PKOD_ADMIN = { sekolah: 'S', daerah: 'D', negeri: 'N', kebangsaan: 'K' }
      const isSaringan = ['saringan_qf', 'saringan_sf', 'separuh_akhir'].includes(acara.peringkat || '')
      const heatDoc  = { id: heat.id, peserta: withRank, windSpeed: windGlobal || '' }
      const acaraDoc = { ...acara, id: acara.id }
      runPostRasmi(db, heatDoc, acaraDoc, kejId, {
        schoolId,
        mataPingat:        kejDoc?.mataPingat        || { 1: 5, 2: 3, 3: 2, 4: 1 },
        peringkatKej:      PKOD_ADMIN[(kejDoc?.peringkat || '').toLowerCase()] || 'D',
        grantMedal:        !isSaringan && (heat.fasa === 'final' || heat.fasa === 'terus_final'),
        isRelay,
      }).catch(e => console.warn('postRasmi (background):', e.message))
      setSimpan({ loading: false, ok: true, err: '' })
      onSimpan()
      setTimeout(onTutup, 700)
    } catch {
      setSimpan({ loading: false, ok: false, err: 'Gagal simpan. Cuba semula.' })
    }
  }

  const namaP    = p => namaPeserta(p, atletMap, isRelay)
  const sekolahP = p => sekolahPeserta(p, atletMap, isRelay)

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center px-2 py-4 overflow-y-auto"
      onClick={e => e.target === e.currentTarget && onTutup()}>
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden my-auto">

        <div className="bg-[#003399] px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-white">{acara.namaAcara || acara.namaAcaraPendek}</p>
            <p className="text-[10px] text-white/60">{FASA_FULL[heat.fasa] || heat.fasa} {heat.noHeat} · {rows.length} peserta</p>
          </div>
          <button onClick={onTutup} className="text-white/50 hover:text-white">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-2.5 max-h-[70vh] overflow-y-auto">

          {/* Angin global */}
          {adaAngin && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5">
              <span className="text-xs font-bold text-blue-700 shrink-0">Angin (m/s)</span>
              <input
                type="number" step="0.1" min="-9.9" max="9.9"
                value={windGlobal}
                onChange={e => setWindGlobal(e.target.value)}
                placeholder="+1.2 atau -0.5"
                className="flex-1 border border-blue-200 rounded-lg px-3 py-1.5 text-sm text-center bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
              />
              {parseFloat(windGlobal) > 2.0 && (
                <span className="text-[10px] font-bold text-red-500">⚠ Melebihi had</span>
              )}
            </div>
          )}

          {/* Baris peserta */}
          {rows.map((p, i) => (
            <div key={p.atletId || i}
              className={`border rounded-xl p-3 transition-colors ${
                p.dns || p.dnf || p.dq ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'
              }`}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-[10px] font-black text-gray-400 bg-white border border-gray-200 rounded px-1.5 py-0.5 shrink-0">
                    {isMass ? `#${p.giliran || i+1}` : `L${p.lorong || p.giliran || '—'}`}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-800 truncate">{namaP(p)}</p>
                    {sekolahP(p) && <p className="text-[10px] text-gray-400 truncate">{sekolahP(p)}</p>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {['dns','dnf','dq'].map(flag => (
                    <button key={flag} onClick={() => toggleFlag(i, flag)}
                      className={`text-[9px] font-black px-1.5 py-0.5 rounded border transition-colors ${
                        p[flag] ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-300 border-gray-200 hover:text-red-400 hover:border-red-300'
                      }`}>
                      {flag.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {!p.dns && !p.dnf && !p.dq ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text" inputMode="decimal"
                    value={p.masa}
                    onChange={e => setRow(i, 'masa', e.target.value)}
                    placeholder={isMass ? "2:15.43" : "10.54"}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-center bg-white focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399]"
                  />
                  {p.masa && (
                    <span className={`text-[10px] shrink-0 ${masaKeSaat(p.masa) !== null ? 'text-green-600' : 'text-red-400'}`}>
                      {masaKeSaat(p.masa) !== null ? `✓ ${saatKeStr(masaKeSaat(p.masa))}` : '⚠ Format?'}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-xs font-bold text-red-500 text-center py-0.5">
                  {p.dns ? 'DNS — Tidak Mula' : p.dnf ? 'DNF — Tidak Tamat' : 'DQ — Diskualifikasi'}
                </p>
              )}
            </div>
          ))}
        </div>

        {simpan.err && <p className="text-xs text-red-600 text-center px-5 pb-2">{simpan.err}</p>}

        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onTutup}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50 transition-colors">
            Batal
          </button>
          <button onClick={handleSimpan} disabled={simpan.loading || simpan.ok}
            className={`flex-1 py-2.5 font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2 ${
              simpan.ok ? 'bg-green-500 text-white' : 'bg-[#003399] hover:bg-[#002277] disabled:bg-gray-300 text-white'
            }`}>
            {simpan.ok
              ? <>{Ikon.save} Tersimpan!</>
              : simpan.loading
                ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                : <>{Ikon.save} Simpan Keputusan</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Input Padang (Lompat / Balin) ─────────────────────────────────────

function ModalInputPadang({ acara, heat, atletMap, schoolId, kejId, kejDoc, onTutup, onSimpan }) {
  const adaAngin = acara.jenisAcara === 'padang_lompat'
  const nCubaan  = acara.nCubaan || 3

  const [rows,   setRows]   = useState(() =>
    (heat.peserta || []).map(p => ({
      ...p,
      cubaan:      p.cubaan?.length ? [...p.cubaan] : Array(nCubaan).fill(''),
      anginCubaan: p.anginCubaan?.length ? [...p.anginCubaan] : Array(nCubaan).fill(''),
      dns:  p.dns  || false,
      dnf:  p.dnf  || false,
      dq:   p.dq   || false,
    }))
  )
  const [simpan, setSimpan] = useState({ loading: false, ok: false, err: '' })

  function setCubaan(i, ci, val) {
    setRows(r => r.map((x, idx) => {
      if (idx !== i) return x
      const cubaan = [...x.cubaan]
      cubaan[ci] = val
      return { ...x, cubaan }
    }))
  }
  function setAngin(i, ci, val) {
    setRows(r => r.map((x, idx) => {
      if (idx !== i) return x
      const anginCubaan = [...x.anginCubaan]
      anginCubaan[ci] = val
      return { ...x, anginCubaan }
    }))
  }
  function toggleFlag(i, flag) {
    setRows(r => r.map((x, idx) => {
      if (idx !== i) return x
      const on = !x[flag]
      return { ...x, dns: false, dnf: false, dq: false, [flag]: on }
    }))
  }

  async function handleSimpan() {
    setSimpan({ loading: true, ok: false, err: '' })
    try {
      const withRank = kiraRankPadang(rows)
      const hRef = doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat', heat.id)
      await updateDoc(hRef, {
        peserta:         withRank,
        statusKeputusan: 'ada_keputusan',
        dikemaskinPada:  serverTimestamp(),
      })
      // Fire-and-forget postRasmi — UI kembali segera, tally di-update background
      const PKOD_ADMIN = { sekolah: 'S', daerah: 'D', negeri: 'N', kebangsaan: 'K' }
      const isSaringanPadang = ['saringan_qf', 'saringan_sf', 'separuh_akhir'].includes(acara.peringkat || '')
      const heatDoc  = { id: heat.id, peserta: withRank }
      const acaraDoc = { ...acara, id: acara.id }
      runPostRasmi(db, heatDoc, acaraDoc, kejId, {
        schoolId,
        mataPingat:   kejDoc?.mataPingat   || { 1: 5, 2: 3, 3: 2, 4: 1 },
        peringkatKej: PKOD_ADMIN[(kejDoc?.peringkat || '').toLowerCase()] || 'D',
        grantMedal:   !isSaringanPadang && (heat.fasa === 'final' || heat.fasa === 'terus_final'),
        isRelay:      false,
      }).catch(e => console.warn('postRasmi (background):', e.message))
      setSimpan({ loading: false, ok: true, err: '' })
      onSimpan()
      setTimeout(onTutup, 700)
    } catch {
      setSimpan({ loading: false, ok: false, err: 'Gagal simpan. Cuba semula.' })
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center px-2 py-4 overflow-y-auto"
      onClick={e => e.target === e.currentTarget && onTutup()}>
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden my-auto">

        <div className="bg-[#003399] px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-white">{acara.namaAcara || acara.namaAcaraPendek}</p>
            <p className="text-[10px] text-white/60">
              {FASA_FULL[heat.fasa] || heat.fasa} · {rows.length} peserta · {nCubaan} cubaan
              {adaAngin && ' · Angin per cubaan'}
            </p>
          </div>
          <button onClick={onTutup} className="text-white/50 hover:text-white">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
          {rows.map((p, i) => {
            const best = jarakTerbaik(p.cubaan)
            return (
              <div key={p.atletId || i}
                className={`border rounded-xl p-3 ${p.dns || p.dnf || p.dq ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>

                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-gray-400 bg-white border border-gray-200 rounded px-1.5 py-0.5 shrink-0">
                        #{p.giliran || i+1}
                      </span>
                      <p className="text-sm font-bold text-gray-800 truncate">
                        {namaPeserta(p, atletMap, false)}
                      </p>
                    </div>
                    {sekolahPeserta(p, atletMap, false) && (
                      <p className="text-[10px] text-gray-400 mt-0.5 ml-7">
                        {sekolahPeserta(p, atletMap, false)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {best !== null && (
                      <span className="text-sm font-black text-green-700">{best.toFixed(2)}m</span>
                    )}
                    <div className="flex gap-1">
                      {['dns','dnf','dq'].map(flag => (
                        <button key={flag} onClick={() => toggleFlag(i, flag)}
                          className={`text-[9px] font-black px-1.5 py-0.5 rounded border transition-colors ${
                            p[flag] ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-300 border-gray-200 hover:text-red-400 hover:border-red-300'
                          }`}>
                          {flag.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {!p.dns && !p.dnf && !p.dq ? (
                  <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${nCubaan}, 1fr)` }}>
                    {Array.from({ length: nCubaan }, (_, ci) => (
                      <div key={ci} className="space-y-1">
                        <p className="text-[9px] font-bold text-gray-400 text-center">Cubaan {ci+1}</p>
                        <input
                          type="number" step="0.01" min="0"
                          value={p.cubaan[ci] || ''}
                          onChange={e => setCubaan(i, ci, e.target.value)}
                          placeholder="0.00"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-mono text-center bg-white focus:outline-none focus:ring-1 focus:ring-[#003399]/30 focus:border-[#003399]"
                        />
                        {adaAngin && (
                          <input
                            type="number" step="0.1" min="-9.9" max="9.9"
                            value={p.anginCubaan[ci] || ''}
                            onChange={e => setAngin(i, ci, e.target.value)}
                            placeholder="angin"
                            title="Bacaan angin (m/s)"
                            className="w-full border border-blue-100 rounded-lg px-2 py-1 text-[10px] font-mono text-center bg-blue-50 focus:outline-none focus:ring-1 focus:ring-blue-200 text-blue-600 placeholder:text-blue-300"
                          />
                        )}
                        {p.cubaan[ci] && parseFloat(p.cubaan[ci]) > 0 && (
                          <p className="text-[9px] text-center text-green-600 font-bold">{parseFloat(p.cubaan[ci]).toFixed(2)}m</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs font-bold text-red-500 text-center py-1">
                    {p.dns ? 'DNS — Tidak Mula' : p.dnf ? 'DNF — Tidak Tamat' : 'DQ — Diskualifikasi'}
                  </p>
                )}
              </div>
            )
          })}
        </div>

        {simpan.err && <p className="text-xs text-red-600 text-center px-5 pb-2">{simpan.err}</p>}

        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onTutup}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50 transition-colors">
            Batal
          </button>
          <button onClick={handleSimpan} disabled={simpan.loading || simpan.ok}
            className={`flex-1 py-2.5 font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2 ${
              simpan.ok ? 'bg-green-500 text-white' : 'bg-[#003399] hover:bg-[#002277] disabled:bg-gray-300 text-white'
            }`}>
            {simpan.ok
              ? <>{Ikon.save} Tersimpan!</>
              : simpan.loading
                ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                : <>{Ikon.save} Simpan Keputusan</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Panel heat untuk setiap acara ───────────────────────────────────────────

function AcaraHeatPanel({ acara, atletMap, schoolId, kejId, kejDoc, onRefresh }) {
  const [heats,     setHeats]     = useState([])
  const [muatTurun, setMuatTurun] = useState(true)
  const [modal,     setModal]     = useState(null)
  const isPadang = acara.jenisAcara === 'padang_lompat' || acara.jenisAcara === 'padang_balin'

  const muatHeats = useCallback(async () => {
    setMuatTurun(true)
    try {
      const snap = await getDocs(
        query(
          query(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat'), where('aceraId', '==', acara.id)),
          orderBy('noHeat')
        )
      )
      setHeats(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch { setHeats([]) }
    setMuatTurun(false)
  }, [schoolId, kejId, acara.id])

  useEffect(() => { muatHeats() }, [muatHeats])

  if (muatTurun) return (
    <div className="py-4 flex justify-center">
      <svg className="w-4 h-4 animate-spin text-gray-300" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
    </div>
  )

  if (heats.length === 0) return (
    <div className="py-3 text-center">
      <p className="text-xs text-gray-400">Tiada heat. Jana heat dalam modul Start List terlebih dahulu.</p>
    </div>
  )

  return (
    <div className="space-y-2 pt-1">
      {heats.map(heat => {
        const adaKep = heat.statusKeputusan === 'ada_keputusan'
        const label  = `${FASA_FULL[heat.fasa] || heat.fasa} ${heat.noHeat}`
        const nPes   = heat.peserta?.length || 0

        return (
          <div key={heat.id} className="border border-gray-100 rounded-xl overflow-hidden bg-white">

            {/* Header heat */}
            <div className="flex items-center gap-3 px-3 py-2.5">
              <span className="text-[10px] font-black text-white bg-[#003399] px-2 py-0.5 rounded shrink-0">
                {FASA_LABEL[heat.fasa] || ''}{heat.noHeat}
              </span>
              <span className="text-xs text-gray-600 flex-1">{label} · {nPes} peserta</span>

              {adaKep && (
                <span className="text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                  ✓ Ada Keputusan
                </span>
              )}

              <button
                onClick={() => setModal(heat)}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
                  adaKep
                    ? 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
                    : 'bg-[#003399] text-white hover:bg-[#002277]'
                }`}>
                {adaKep ? <>{Ikon.edit} Kemaskini</> : <>{Ikon.save} Input</>}
              </button>
            </div>

            {/* Preview keputusan */}
            {adaKep && heat.peserta?.length > 0 && (
              <div className="border-t border-gray-50 px-3 pb-2.5 pt-1">
                {heat.windSpeed && parseFloat(heat.windSpeed) !== 0 && (
                  <p className="text-[10px] text-blue-500 mb-1.5">
                    Angin: {parseFloat(heat.windSpeed) > 0 ? '+' : ''}{heat.windSpeed} m/s
                    {parseFloat(heat.windSpeed) > 2.0 && <span className="text-red-400 ml-1">⚠ Melebihi had</span>}
                  </p>
                )}
                <table className="w-full text-xs">
                  <tbody>
                    {[...heat.peserta]
                      .sort((a, b) => {
                        if (a.dns || a.dnf || a.dq) return 1
                        if (b.dns || b.dnf || b.dq) return -1
                        if (isPadang) return (jarakTerbaik(b.cubaan) || 0) - (jarakTerbaik(a.cubaan) || 0)
                        return (masaKeSaat(a.masa) || 9999) - (masaKeSaat(b.masa) || 9999)
                      })
                      .map((p, i) => (
                        <tr key={p.atletId || i} className="border-b border-gray-50 last:border-0">
                          <td className="py-1 pr-2 font-bold text-gray-400 w-5 text-center">
                            {p.dns || p.dnf || p.dq ? '—' : (p.kedudukan || i+1)}
                          </td>
                          <td className="py-1 pr-2 text-gray-700 truncate max-w-[150px]">
                            {namaPeserta(p, atletMap, acara.jenisAcara === 'relay')}
                          </td>
                          <td className="py-1 text-right font-mono text-gray-600">
                            {p.dns ? <span className="text-red-400 text-[10px] font-bold">DNS</span>
                            : p.dnf ? <span className="text-red-400 text-[10px] font-bold">DNF</span>
                            : p.dq  ? <span className="text-red-400 text-[10px] font-bold">DQ</span>
                            : isPadang
                              ? `${(jarakTerbaik(p.cubaan) || 0).toFixed(2)}m`
                              : saatKeStr(masaKeSaat(p.masa))
                            }
                          </td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}

      {/* Modal */}
      {modal && (
        isPadang ? (
          <ModalInputPadang
            acara={acara} heat={modal}
            atletMap={atletMap} schoolId={schoolId} kejId={kejId} kejDoc={kejDoc}
            onTutup={() => setModal(null)}
            onSimpan={() => { setModal(null); muatHeats(); onRefresh() }}
          />
        ) : (
          <ModalInputLorong
            acara={acara} heat={modal}
            atletMap={atletMap} schoolId={schoolId} kejId={kejId} kejDoc={kejDoc}
            onTutup={() => setModal(null)}
            onSimpan={() => { setModal(null); muatHeats(); onRefresh() }}
          />
        )
      )}
    </div>
  )
}

// ─── Komponen Utama ───────────────────────────────────────────────────────────

export default function InputKeputusan() {
  const { userData, logout } = useAuth()
  const navigate = useNavigate()

  const isSuperadmin = userData?.role === 'superadmin'
  const viewSchoolId = isSuperadmin
    ? (() => { try { return JSON.parse(sessionStorage.getItem('gp_view_school') || '{}').schoolId || '' } catch { return '' } })()
    : null
  const schoolId = viewSchoolId || userData?.schoolId

  const kej   = getKejContext()
  const kejId = kej.id

  const [acara,       setAcara]       = useState([])
  const [atletMap,    setAtletMap]    = useState({})
  const [kejDoc,      setKejDoc]      = useState(null)
  const [bukaAcara,   setBukaAcara]   = useState({})
  const [muatTurun,   setMuatTurun]   = useState(true)
  const [carian,      setCarian]      = useState('')
  const [filterJenis, setFilterJenis] = useState('semua')
  const [refresh,     setRefresh]     = useState(0)

  useEffect(() => {
    if (!schoolId || !kejId) return
    let aktif = true

    async function muatData() {
      setMuatTurun(true)
      try {
        const [aSnap, atsSnap, kSnap] = await Promise.all([
          getDocs(query(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'acara'), orderBy('noAcara'))),
          getDocs(collection(db, 'tenants', schoolId, 'atlet')),
          getDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId)),
        ])
        if (!aktif) return
        setAcara(aSnap.docs.map(d => ({ id: d.id, ...d.data() })))
        const map = {}
        atsSnap.docs.forEach(d => { map[d.id] = d.data() })
        setAtletMap(map)
        if (kSnap.exists()) setKejDoc({ id: kSnap.id, ...kSnap.data() })
      } catch { /* langkau */ }
      if (aktif) setMuatTurun(false)
    }
    muatData()
    return () => { aktif = false }
  }, [schoolId, kejId, refresh])

  function toggleAcara(id) {
    setBukaAcara(b => ({ ...b, [id]: !b[id] }))
  }

  const acaraTapis = acara.filter(a => {
    const cocokCarian = !carian || (a.namaAcara || '').toLowerCase().includes(carian.toLowerCase())
    const cocokJenis  = filterJenis === 'semua' || a.jenisAcara === filterJenis
    return cocokCarian && cocokJenis
  })

  if (!schoolId || !kejId) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-sm text-gray-400">Sila pilih kejohanan dari panel admin.</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">

      {isSuperadmin && (
        <div className="bg-amber-400 text-amber-900 px-4 py-2 flex items-center justify-between text-xs font-bold">
          <span>⚡ Mode Superadmin</span>
          <button onClick={() => { sessionStorage.removeItem('gp_view_school'); navigate('/superadmin') }}
            className="underline hover:no-underline">← Balik ke Panel Superadmin</button>
        </div>
      )}

      <header className="bg-[#003399] text-white px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/admin/kejohanan/${kejId}`)}
            className="text-white/60 hover:text-white transition-colors p-1 -ml-1">
            {Ikon.balik}
          </button>
          <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center shrink-0">
            {Ikon.trophy}
          </div>
          <div className="min-w-0">
            <p className="text-[9px] text-white/50 uppercase tracking-widest">Gold Podium</p>
            <p className="text-sm font-bold leading-tight truncate">Input Keputusan</p>
          </div>
        </div>
        <button onClick={async () => { await logout(); navigate('/login') }}
          className="text-white/60 hover:text-white transition-colors p-1.5 flex items-center gap-1.5 text-xs shrink-0">
          {Ikon.keluar}
          <span className="hidden sm:block">Log Keluar</span>
        </button>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-4">

        {/* Info */}
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3 shadow-sm flex items-center gap-3">
          <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center text-lg shrink-0">⏱️</div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-gray-800 truncate">{kej.namaKejohanan || kej.nama || 'Kejohanan'}</p>
            <p className="text-[10px] text-gray-400">Pilih acara → pilih heat → input keputusan</p>
          </div>
          <span className="shrink-0 text-[10px] font-bold text-[#003399] bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
            {acara.length} acara
          </span>
        </div>

        {/* Filter */}
        <div className="flex gap-2">
          <input
            type="text"
            value={carian}
            onChange={e => setCarian(e.target.value)}
            placeholder="Cari acara..."
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399]"
          />
          <select
            value={filterJenis}
            onChange={e => setFilterJenis(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399]">
            <option value="semua">Semua</option>
            <option value="lorong">Lorong</option>
            <option value="mass_start">Mass Start</option>
            <option value="padang_lompat">Lompat</option>
            <option value="padang_balin">Balin</option>
            <option value="relay">Relay</option>
          </select>
        </div>

        {/* Senarai Acara */}
        {muatTurun ? (
          <div className="flex justify-center py-14">
            <svg className="w-6 h-6 animate-spin text-gray-300" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          </div>
        ) : acaraTapis.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">Tiada acara ditemui.</div>
        ) : (
          <div className="space-y-2">
            {acaraTapis.map(a => {
              const buka       = !!bukaAcara[a.id]
              const jenisLabel = LABEL_JENIS[a.jenisAcara] || a.jenisAcara || ''
              const jenisWarna = WARNA_JENIS[a.jenisAcara]  || 'bg-gray-100 text-gray-500 border-gray-200'

              return (
                <div key={a.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                  <button
                    onClick={() => toggleAcara(a.id)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50/60 transition-colors">

                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${jenisWarna}`}>
                      {jenisLabel}
                    </span>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800 truncate">{a.namaAcara || a.namaAcaraPendek}</p>
                      <p className="text-[10px] text-gray-400 truncate">
                        {a.kategoriKod}
                        {a.jantina ? ` · ${a.jantina === 'L' ? 'Lelaki' : a.jantina === 'P' ? 'Perempuan' : a.jantina}` : ''}
                        {a.unit    ? ` · ${a.unit}` : ''}
                      </p>
                    </div>

                    <svg className={`w-4 h-4 text-gray-300 shrink-0 transition-transform duration-200 ${buka ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {buka && (
                    <div className="border-t border-gray-50 px-4 pb-4 pt-2">
                      <AcaraHeatPanel
                        acara={a}
                        atletMap={atletMap}
                        schoolId={schoolId}
                        kejId={kejId}
                        kejDoc={kejDoc}
                        onRefresh={() => setRefresh(r => r + 1)}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}
