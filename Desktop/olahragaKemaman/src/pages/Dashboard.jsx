import React, { useEffect, useState } from 'react'
import { collection, getCountFromServer, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'
import { seedSekolah, SEKOLAH_LIST } from '../utils/seedSekolah'
import { seedPendaftaran, deleteSeedData, checkSeedReady, seedKeputusan } from '../utils/seedAtlet'
import { seedJadualAcara, getKejohananAktif, TOTAL_ACARA } from '../utils/seedJadualAcara'

// ─── StatCard ─────────────────────────────────────────────────────────────────

const StatCard = ({ label, value, sub, color, icon }) => (
  <div className="bg-white border border-gray-200 rounded shadow-sm p-4 flex items-start gap-4">
    <div className={`w-10 h-10 rounded flex items-center justify-center shrink-0 ${color}`}>
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-2xl font-bold text-gray-800 leading-none">
        {value === null ? (
          <span className="inline-block w-10 h-6 bg-gray-100 rounded animate-pulse" />
        ) : value}
      </p>
      <p className="text-xs font-semibold text-gray-600 mt-1">{label}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  </div>
)

const QuickLink = ({ label, path, desc }) => (
  <a
    href={path}
    className="block bg-white border border-gray-200 rounded shadow-sm p-4 hover:border-[#003399] hover:shadow-md transition-all group"
  >
    <p className="text-sm font-semibold text-[#003399] group-hover:underline">{label}</p>
    <p className="text-xs text-gray-500 mt-1">{desc}</p>
  </a>
)

// ─── SeedPanel — superadmin sahaja, sorok selepas guna ───────────────────────

function SeedPanel({ onSeeded }) {
  const [open,     setOpen]     = useState(false)
  const [running,  setRunning]  = useState(false)
  const [progress, setProgress] = useState(null) // { done, total, sekolah, status }
  const [result,   setResult]   = useState(null) // { ok, skip, fail }
  const [done,     setDone]     = useState(false)

  async function handleSeed() {
    setRunning(true)
    setResult(null)
    setProgress({ done: 0, total: SEKOLAH_LIST.length, sekolah: '…', status: 'running' })

    try {
      const res = await seedSekolah(p => setProgress(p))
      setResult(res)
      setDone(true)
      onSeeded?.()
    } catch (err) {
      setResult({ ok: 0, skip: 0, fail: SEKOLAH_LIST.length, err: err.message })
    } finally {
      setRunning(false)
    }
  }

  const pct = progress
    ? Math.round((progress.done / progress.total) * 100)
    : 0

  return (
    <div className="mt-6 border border-dashed border-orange-300 rounded bg-orange-50">
      {/* Header toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-orange-200 text-orange-800 font-bold px-2 py-0.5 rounded uppercase tracking-wider">
            Dev Only
          </span>
          <span className="text-xs font-semibold text-orange-800">
            Seed Data — 20 Sekolah Daerah Kemaman
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-orange-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-[10px] text-orange-700 leading-relaxed">
            Akan menulis <strong>20 dokumen sekolah</strong> ke Firestore dan mencipta
            <strong> 20 akaun Firebase Auth</strong> untuk pengurus pasukan setiap sekolah.
            Jalankan <strong>sekali sahaja</strong>. Sekiranya sudah wujud, rekod akan diskip secara automatik.
          </p>

          {/* Jadual sekolah */}
          <div className="border border-orange-200 rounded overflow-hidden bg-white">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="bg-orange-100 text-orange-900">
                  <th className="px-3 py-1.5 text-left font-semibold">Kod</th>
                  <th className="px-3 py-1.5 text-left font-semibold">Nama Sekolah</th>
                  <th className="px-3 py-1.5 text-left font-semibold">Kat</th>
                  <th className="px-3 py-1.5 text-left font-semibold">Bib</th>
                  <th className="px-3 py-1.5 text-left font-semibold">PIN Login</th>
                </tr>
              </thead>
              <tbody>
                {SEKOLAH_LIST.map((s, i) => (
                  <tr key={s.kodSekolah} className={i % 2 === 0 ? 'bg-white' : 'bg-orange-50/40'}>
                    <td className="px-3 py-1.5 font-mono text-gray-600">{s.kodSekolah}</td>
                    <td className="px-3 py-1.5 text-gray-800">{s.namaSekolah}</td>
                    <td className="px-3 py-1.5">
                      <span className={`font-semibold ${
                        s.kategori === 'SR' ? 'text-blue-600' :
                        s.kategori === 'SM' ? 'text-green-600' : 'text-purple-600'
                      }`}>{s.kategori}</span>
                    </td>
                    <td className="px-3 py-1.5 font-mono font-bold text-gray-700">{s.bibPrefix}</td>
                    <td className="px-3 py-1.5 font-mono text-gray-500">{s.pin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Progress bar */}
          {running && progress && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] text-orange-700">
                <span>Memproses: <strong>{progress.sekolah}</strong></span>
                <span>{progress.done}/{progress.total}</span>
              </div>
              <div className="h-2 bg-orange-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 transition-all duration-300 rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className={`text-xs font-semibold px-3 py-2.5 rounded border ${
              result.fail > 0
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-green-50 border-green-200 text-green-700'
            }`}>
              {done && result.fail === 0
                ? `✓ Seed berjaya — ${result.ok} baru, ${result.skip} diskip (sudah wujud)`
                : `Selesai — ${result.ok} berjaya, ${result.skip} diskip, ${result.fail} gagal`
              }
            </div>
          )}

          {/* Butang */}
          {!done ? (
            <button
              onClick={handleSeed}
              disabled={running}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-xs font-bold rounded transition-colors"
            >
              {running ? `Menjalankan… (${pct}%)` : '▶ Jalankan Seed Sekarang'}
            </button>
          ) : (
            <p className="text-[10px] text-orange-600 italic">
              Seed selesai. Boleh keluarkan blok ini dari Dashboard.jsx selepas ini.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── SeedAtletPanel — superadmin sahaja ──────────────────────────────────────

function SeedAtletPanel({ onSeeded }) {
  const [open,     setOpen]     = useState(false)
  const [running,  setRunning]  = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [checking, setChecking] = useState(false)

  const [progress, setProgress] = useState(null)  // { done, total, sekolah, label }
  const [logs,     setLogs]     = useState([])
  const [result,   setResult]   = useState(null)
  const [done,     setDone]     = useState(false)
  const [prefly,   setPrefly]   = useState(null)  // hasil checkSeedReady

  const logRef = React.useRef(null)

  function addLog(msg) {
    setLogs(l => [...l, msg])
    // Auto-scroll log ke bawah
    setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, 30)
  }

  const pct = progress && progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : 0

  // Pre-flight semasa buka panel
  async function handleOpen() {
    const nowOpen = !open
    setOpen(nowOpen)
    if (nowOpen && !prefly && !checking) {
      setChecking(true)
      try {
        const r = await checkSeedReady()
        setPrefly(r)
      } catch (e) {
        setPrefly({ ready: false, warnings: [`Ralat semasa semak: ${e.message}`] })
      } finally {
        setChecking(false)
      }
    }
  }

  async function handleSeed() {
    setRunning(true)
    setResult(null)
    setDone(false)
    setLogs([])
    setProgress({ done: 0, total: prefly?.sekolah?.count || 20, sekolah: '—', label: 'Menyediakan…' })
    try {
      const res = await seedPendaftaran(
        p   => setProgress(p),
        msg => addLog(msg)
      )
      setResult(res)
      setDone(true)
      onSeeded?.()
      // Refresh pre-flight
      const r = await checkSeedReady()
      setPrefly(r)
    } catch (err) {
      addLog(`✗ RALAT: ${err.message}`)
      setResult({ err: err.message })
    } finally {
      setRunning(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Padam SEMUA rekod isSeedData=true?\n\nTermasuk atlet + pendaftaran dalam semua kejohanan.\nTindakan tidak boleh diundur.')) return
    setDeleting(true)
    setLogs([])
    setResult(null)
    setDone(false)
    try {
      const res = await deleteSeedData(msg => addLog(msg))
      addLog(`\n✅ ${res.deleted} rekod seed dipadam.`)
      onSeeded?.()
      setPrefly(null) // reset prefly supaya semak semula
      const r = await checkSeedReady()
      setPrefly(r)
    } catch (err) {
      addLog(`✗ RALAT: ${err.message}`)
    } finally {
      setDeleting(false)
    }
  }

  const busy = running || deleting || checking

  return (
    <div className="mt-3 border border-dashed border-teal-300 rounded bg-teal-50">

      {/* ── Header toggle ── */}
      <button onClick={handleOpen}
        className="w-full flex items-center justify-between px-4 py-3 text-left">
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-teal-200 text-teal-900 font-bold px-2 py-0.5 rounded uppercase tracking-wider">Dev Only</span>
          <span className="text-xs font-semibold text-teal-800">Seed Pendaftaran — 10 Atlet × Setiap Sekolah</span>
        </div>
        <svg className={`w-4 h-4 text-teal-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">

          {/* ── Pre-flight status ── */}
          {checking ? (
            <div className="text-[10px] text-teal-600 animate-pulse">⏳ Semak kesediaan sistem…</div>
          ) : prefly && (
            <div className="space-y-1.5">
              {/* 3 syarat */}
              {[
                { label: `Sekolah dalam sistem`, ok: prefly.sekolah.ok, val: prefly.sekolah.count > 0 ? `${prefly.sekolah.count} sekolah` : 'Tiada' },
                { label: `Kejohanan`, ok: prefly.kejohanan.ok, val: prefly.kejohanan.nama || 'Tiada' },
                { label: `Acara dalam kejohanan`, ok: prefly.acara.ok, val: prefly.acara.count > 0 ? `${prefly.acara.count} acara` : 'Tiada' },
              ].map(row => (
                <div key={row.label} className={`flex items-center gap-2 text-[10px] px-3 py-1.5 rounded border ${
                  row.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'
                }`}>
                  <span className="shrink-0">{row.ok ? '✓' : '✗'}</span>
                  <span className="font-semibold">{row.label}</span>
                  <span className="ml-auto font-mono">{row.val}</span>
                </div>
              ))}
              {/* Extra warnings */}
              {prefly.warnings.map((w, i) => (
                <div key={i} className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded">
                  ⚠ {w}
                </div>
              ))}
              {/* Nota format seed */}
              {prefly.ready && !done && (
                <div className="text-[10px] text-teal-700 bg-white border border-teal-200 px-3 py-2 rounded space-y-0.5">
                  <p className="font-semibold">Format seed yang akan dijana:</p>
                  <p>• SR → 5L + 5P, lahir {prefly.kejohanan.tahun - 12}–{prefly.kejohanan.tahun - 9} (Kat A + B)</p>
                  <p>• SM → 5L + 5P, lahir {prefly.kejohanan.tahun - 18}–{prefly.kejohanan.tahun - 13} (Kat C + D + E)</p>
                  <p>• PPKI → 5L + 5P, Kat PPKI</p>
                  <p>• Setiap atlet → 2 acara bersesuaian · noBib = bibPrefix + counter</p>
                </div>
              )}
            </div>
          )}

          {/* ── Progress bar ── */}
          {running && progress && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-teal-700 font-medium">
                <span>📚 {progress.sekolah}</span>
                <span>{progress.done}/{progress.total} sekolah ({pct}%)</span>
              </div>
              <div className="h-2.5 bg-teal-200 rounded-full overflow-hidden">
                <div className="h-full bg-teal-500 transition-all duration-300 rounded-full"
                  style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          {/* ── Log output (konsol) ── */}
          {logs.length > 0 && (
            <div ref={logRef}
              className="bg-gray-900 text-green-400 rounded text-[10px] font-mono p-3 h-56 overflow-y-auto leading-relaxed">
              {logs.map((l, i) => (
                <div key={i} className={
                  l.startsWith('✗') ? 'text-red-400' :
                  l.startsWith('⚠') ? 'text-yellow-400' :
                  l.startsWith('✅') ? 'text-green-300 font-bold' :
                  l.startsWith('📚') ? 'text-teal-300 mt-1' :
                  l.startsWith('═') ? 'text-gray-500' :
                  l.startsWith('─') ? 'text-gray-600' :
                  'text-green-400'
                }>{l}</div>
              ))}
            </div>
          )}

          {/* ── Result summary ── */}
          {result && !result.err && (
            <div className="grid grid-cols-4 gap-2">
              {[
                { l: 'Sekolah', v: result.sekolahCount, c: 'text-teal-700 bg-teal-50 border-teal-200' },
                { l: 'Atlet',   v: result.atletOk,      c: 'text-blue-700 bg-blue-50 border-blue-200' },
                { l: 'Pendaftaran', v: result.pendOk,   c: 'text-green-700 bg-green-50 border-green-200' },
                { l: 'Skip/Gagal', v: (result.atletSkip||0) + (result.fail||0), c: 'text-gray-600 bg-gray-50 border-gray-200' },
              ].map(s => (
                <div key={s.l} className={`text-center px-2 py-2 rounded border ${s.c}`}>
                  <p className="text-lg font-black">{s.v}</p>
                  <p className="text-[9px] font-semibold uppercase tracking-wide">{s.l}</p>
                </div>
              ))}
            </div>
          )}
          {result?.err && (
            <div className="text-xs font-semibold px-3 py-2 rounded border bg-red-50 border-red-200 text-red-700">
              ✗ {result.err}
            </div>
          )}

          {/* ── Butang ── */}
          <div className="flex gap-2 flex-wrap items-center">
            <button onClick={handleSeed} disabled={busy || !prefly?.ready}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-xs font-bold rounded transition-colors">
              {running ? `Menjana… ${progress?.done || 0}/${progress?.total || '?'} sekolah` : '▶ Seed Pendaftaran'}
            </button>
            <button onClick={handleDelete} disabled={busy}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-xs font-bold rounded transition-colors">
              {deleting ? 'Membuang…' : '🗑 Padam Semua Seed Data'}
            </button>
            {!running && (
              <button onClick={async () => { setChecking(true); setPrefly(null); const r = await checkSeedReady(); setPrefly(r); setChecking(false) }}
                disabled={busy}
                className="px-3 py-2 text-teal-700 border border-teal-300 bg-white text-xs font-semibold rounded hover:bg-teal-50 disabled:opacity-40">
                ↺ Semak Semula
              </button>
            )}
          </div>

          {done && (
            <p className="text-[10px] text-teal-600 italic">
              Seed selesai. Panel ini boleh dikeluarkan dari Dashboard.jsx selepas testing selesai.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── SeedKeputusanPanel ───────────────────────────────────────────────────────

function SeedKeputusanPanel({ onSeeded }) {
  const [open,    setOpen]    = useState(false)
  const [running, setRunning] = useState(false)
  const [logs,    setLogs]    = useState([])
  const [result,  setResult]  = useState(null)
  const [pct,     setPct]     = useState(0)
  const [label,   setLabel]   = useState('')
  const logRef                = React.useRef(null)

  function addLog(msg) {
    setLogs(l => [...l, msg])
    setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, 30)
  }

  async function handleSeed() {
    setRunning(true); setResult(null); setLogs([]); setPct(0)
    try {
      const res = await seedKeputusan(
        (p, lbl) => { setPct(p); setLabel(lbl || '') },
        msg => addLog(msg)
      )
      setResult(res)
      onSeeded?.()
    } catch (e) {
      addLog(`✗ RALAT: ${e.message}`)
    } finally { setRunning(false) }
  }

  return (
    <div className="mt-3 border border-dashed border-purple-300 rounded bg-purple-50">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-purple-200 text-purple-800 font-bold px-2 py-0.5 rounded uppercase tracking-wider">Dev Only</span>
          <span className="text-xs font-semibold text-purple-800">Seed Keputusan — Jana Keputusan Rawak untuk Semua Heat</span>
        </div>
        <svg className={`w-4 h-4 text-purple-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-[10px] text-purple-700 leading-relaxed">
            Jana keputusan rawak (masa/jarak) untuk semua heat yang belum ada keputusan.
            Heat yang sudah ada keputusan akan dilangkau. Semua heat ditanda <code>isSeedData: true</code>.
            Jalankan <strong>selepas</strong> Seed Sekolah + Seed Pendaftaran + Jana Start List.
          </p>

          {/* Progress */}
          {running && (
            <div>
              <div className="flex justify-between text-[10px] text-purple-600 mb-1">
                <span>{label}</span><span>{pct}%</span>
              </div>
              <div className="h-1.5 bg-purple-200 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 transition-all duration-300" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          {/* Log terminal */}
          {logs.length > 0 && (
            <div ref={logRef} className="bg-gray-900 rounded p-3 text-[10px] font-mono text-gray-300 h-40 overflow-y-auto space-y-0.5">
              {logs.map((l, i) => (
                <div key={i} className={l.startsWith('✗') ? 'text-red-400' : l.startsWith('✓') ? 'text-green-400' : 'text-gray-300'}>
                  {l}
                </div>
              ))}
            </div>
          )}

          {/* Keputusan */}
          {result && (
            <div className={`text-xs px-3 py-2 rounded border font-medium ${result.heatFail === 0 ? 'bg-green-50 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
              ✓ {result.heatOk} heat dikemaskini | {result.heatSkip} dilangkau | {result.heatFail} gagal
            </div>
          )}

          <button
            onClick={handleSeed}
            disabled={running}
            className="px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:bg-purple-300 text-white text-xs font-bold rounded transition-colors"
          >
            {running ? `Menjalankan… (${pct}%)` : '▶ Jana Keputusan Rawak'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── SeedJadualAcaraPanel ─────────────────────────────────────────────────────

function SeedJadualAcaraPanel({ onSeeded }) {
  const [open,      setOpen]      = useState(false)
  const [running,   setRunning]   = useState(false)
  const [logs,      setLogs]      = useState([])
  const [result,    setResult]    = useState(null)
  const [kejohanan, setKejohanan] = useState(null)  // { id, nama }
  const [loading,   setLoading]   = useState(false)
  const logRef                    = React.useRef(null)

  function addLog(msg) {
    setLogs(l => [...l, msg])
    setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, 30)
  }

  async function handleOpen() {
    const nowOpen = !open
    setOpen(nowOpen)
    if (nowOpen && !kejohanan && !loading) {
      setLoading(true)
      try {
        const k = await getKejohananAktif()
        setKejohanan(k)
      } catch (e) {
        setKejohanan({ id: null, nama: `Ralat: ${e.message}` })
      } finally {
        setLoading(false)
      }
    }
  }

  async function handleSeed() {
    if (!kejohanan?.id) return
    setRunning(true)
    setResult(null)
    setLogs([])
    try {
      const res = await seedJadualAcara(kejohanan.id, msg => addLog(msg))
      setResult(res)
      onSeeded?.()
    } catch (e) {
      addLog(`✗ RALAT: ${e.message}`)
    } finally {
      setRunning(false)
    }
  }

  const ready = !!kejohanan?.id && !running

  return (
    <div className="mt-3 border border-dashed border-indigo-300 rounded bg-indigo-50">
      <button
        onClick={handleOpen}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-indigo-200 text-indigo-800 font-bold px-2 py-0.5 rounded uppercase tracking-wider">Dev Only</span>
          <span className="text-xs font-semibold text-indigo-800">Seed Jadual Acara — {TOTAL_ACARA} Acara Standard KOAM</span>
        </div>
        <svg className={`w-4 h-4 text-indigo-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-[10px] text-indigo-700 leading-relaxed">
            Akan menulis <strong>{TOTAL_ACARA} acara standard</strong> ke
            <code className="mx-1 bg-indigo-100 px-1 rounded">kejohanan/{'{id}'}/acara</code>.
            Acara yang sudah wujud akan diskip. Jalankan <strong>selepas</strong> kejohanan dibuat.
          </p>

          {/* Kejohanan aktif */}
          <div className={`flex items-center gap-2 text-[10px] px-3 py-1.5 rounded border ${
            loading ? 'bg-gray-50 border-gray-200 text-gray-500' :
            kejohanan?.id ? 'bg-green-50 border-green-200 text-green-800' :
            'bg-red-50 border-red-200 text-red-700'
          }`}>
            <span className="shrink-0">{loading ? '⏳' : kejohanan?.id ? '✓' : '✗'}</span>
            <span className="font-semibold">Kejohanan Aktif</span>
            <span className="ml-auto font-mono">
              {loading ? 'Menyemak…' : kejohanan?.nama || 'Tiada'}
            </span>
          </div>

          {/* Log terminal */}
          {logs.length > 0 && (
            <div ref={logRef} className="bg-gray-900 rounded p-3 text-[10px] font-mono text-gray-300 h-40 overflow-y-auto space-y-0.5">
              {logs.map((l, i) => (
                <div key={i} className={
                  l.startsWith('✗') ? 'text-red-400' :
                  l.startsWith('✓') || l.startsWith('✅') ? 'text-green-400' :
                  l.startsWith('⟳') ? 'text-yellow-400' :
                  l.startsWith('─') || l.startsWith('═') ? 'text-gray-600' :
                  'text-gray-300'
                }>{l}</div>
              ))}
            </div>
          )}

          {/* Result summary */}
          {result && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { l: 'Berjaya', v: result.berjaya, c: 'text-green-700 bg-green-50 border-green-200' },
                { l: 'Diskip',  v: result.skip,    c: 'text-gray-600 bg-gray-50 border-gray-200' },
                { l: 'Gagal',   v: result.gagal,   c: result.gagal > 0 ? 'text-red-700 bg-red-50 border-red-200' : 'text-gray-400 bg-gray-50 border-gray-200' },
              ].map(s => (
                <div key={s.l} className={`text-center px-2 py-2 rounded border ${s.c}`}>
                  <p className="text-lg font-black">{s.v}</p>
                  <p className="text-[9px] font-semibold uppercase tracking-wide">{s.l}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 flex-wrap items-center">
            <button
              onClick={handleSeed}
              disabled={!ready}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-xs font-bold rounded transition-colors"
            >
              {running ? 'Menjalankan…' : `▶ Seed ${TOTAL_ACARA} Acara`}
            </button>
            {!running && (
              <button
                onClick={async () => { setLoading(true); setKejohanan(null); const k = await getKejohananAktif().catch(e => ({ id: null, nama: `Ralat: ${e.message}` })); setKejohanan(k); setLoading(false) }}
                disabled={loading}
                className="px-3 py-2 text-indigo-700 border border-indigo-300 bg-white text-xs font-semibold rounded hover:bg-indigo-50 disabled:opacity-40"
              >
                ↺ Semak Semula
              </button>
            )}
          </div>

          {result && result.gagal === 0 && (
            <p className="text-[10px] text-indigo-600 italic">
              Seed selesai. Panel ini boleh dikeluarkan dari Dashboard.jsx selepas acara disahkan.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── FirstRunSetup ────────────────────────────────────────────────────────────

function FirstRunSetup() {
  const { user, claimSuperadmin } = useAuth()
  const [nama,  setNama]  = useState('')
  const [busy,  setBusy]  = useState(false)
  const [err,   setErr]   = useState('')

  async function handleClaim(e) {
    e.preventDefault()
    if (!nama.trim()) return setErr('Nama diperlukan.')
    setBusy(true)
    setErr('')
    try {
      await claimSuperadmin(nama.trim())
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="bg-white border border-orange-200 rounded-xl shadow-lg max-w-md w-full p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-800">Setup Pertama — Akaun Superadmin</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Profil Firestore belum ditetapkan untuk akaun ini.</p>
          </div>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <p className="text-[10px] text-gray-400 font-mono">UID: {user?.uid}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{user?.email}</p>
        </div>

        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</p>}

        <form onSubmit={handleClaim} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Nama Penuh</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/25 focus:border-[#003399] bg-gray-50"
              value={nama}
              onChange={e => setNama(e.target.value)}
              placeholder="cth: Ahmad bin Hashim"
              autoFocus
            />
          </div>
          <button type="submit" disabled={busy}
            className="w-full bg-[#003399] hover:bg-[#002277] disabled:bg-gray-300 text-white font-bold py-2.5 rounded-lg text-xs tracking-widest transition-colors">
            {busy ? 'Menetapkan…' : 'TUNTUT SEBAGAI SUPERADMIN'}
          </button>
        </form>

        <p className="text-[10px] text-gray-400 leading-relaxed">
          Butang ini hanya berfungsi jika tiada superadmin lain dalam sistem. Selepas ditetapkan, halaman akan segar semula secara automatik.
        </p>
      </div>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { userData, userRole, needsSetup } = useAuth()
  const [stats, setStats] = useState({ atlet: null, sekolah: null, kejohanan: null, aktif: null })

  async function fetchStats() {
    try {
      const [atletSnap, sekolahSnap, kejohananSnap] = await Promise.all([
        getCountFromServer(collection(db, 'atlet')),
        getCountFromServer(collection(db, 'sekolah')),
        getCountFromServer(collection(db, 'kejohanan')),
      ])
      const aktifSnap = await getCountFromServer(
        query(collection(db, 'kejohanan'), where('statusKejohanan', '==', 'aktif'))
      )
      setStats({
        atlet:     atletSnap.data().count,
        sekolah:   sekolahSnap.data().count,
        kejohanan: kejohananSnap.data().count,
        aktif:     aktifSnap.data().count,
      })
    } catch {
      setStats({ atlet: 0, sekolah: 0, kejohanan: 0, aktif: 0 })
    }
  }

  useEffect(() => { if (!needsSetup) fetchStats() }, [needsSetup])

  if (needsSetup) return <FirstRunSetup />

  const isSuperAdmin = userRole === 'superadmin'

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Page title */}
      <div className="mb-6">
        <h1 className="text-lg font-bold text-gray-800">
          Selamat Datang, {userData?.nama || 'Pengguna'}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Sistem Statistik Pengurusan Kejohanan Olahraga Antara Murid (KOAM)
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Jumlah Atlet"
          value={stats.atlet}
          sub="Berdaftar dalam sistem"
          color="bg-blue-100 text-blue-700"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />
        <StatCard
          label="Jumlah Sekolah"
          value={stats.sekolah}
          sub="Sekolah berdaftar"
          color="bg-green-100 text-green-700"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          }
        />
        <StatCard
          label="Kejohanan"
          value={stats.kejohanan}
          sub="Semua kejohanan"
          color="bg-yellow-100 text-yellow-700"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          }
        />
        <StatCard
          label="Aktif Sekarang"
          value={stats.aktif}
          sub="Kejohanan sedang berjalan"
          color="bg-red-100 text-red-700"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />
      </div>

      {/* Quick actions — superadmin */}
      {isSuperAdmin && (
        <div className="mb-8">
          <h2 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">
            Tindakan Pantas
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <QuickLink label="Buat Kejohanan Baru"   path="/dashboard/kejohanan" desc="Setup kejohanan, tarikh, dan lokasi" />
            <QuickLink label="Setup Sekolah"          path="/dashboard/sekolah"   desc="Tambah, edit, reset PIN sekolah" />
            <QuickLink label="Urus Pengguna"          path="/dashboard/pengguna"  desc="Tambah admin, pencatat, pengurus teknik" />
            <QuickLink label="Setup Acara"            path="/dashboard/acara"     desc="Konfigurasikan acara dan lorong" />
            <QuickLink label="Semak Rekod"            path="/dashboard/rekod"     desc="Rekod daerah, negeri, kebangsaan" />
            <QuickLink label="Medal Tally"            path="/dashboard/medal"     desc="Kedudukan semasa sekolah" />
            <QuickLink label="Log Audit"              path="/dashboard/audit"     desc="Semak semua perubahan data" />
          </div>
        </div>
      )}

      {/* System info banner */}
      <div className="bg-[#003399]/5 border border-[#003399]/20 rounded p-4">
        <p className="text-xs font-semibold text-[#003399] mb-1">Status Sistem</p>
        <div className="flex flex-wrap gap-2">
          {['Firebase Auth ✓', 'Firestore ✓', 'Rules Aktif ✓', 'Hosting Live ✓'].map(item => (
            <span key={item} className="text-[10px] bg-green-100 text-green-700 font-medium px-2 py-0.5 rounded-full">
              {item}
            </span>
          ))}
          <span className="text-[10px] bg-yellow-100 text-yellow-700 font-medium px-2 py-0.5 rounded-full">
            Modul dalam pembangunan ⏳
          </span>
        </div>
      </div>

      {/* ── SEED PANELS — superadmin sahaja, padam selepas guna ──────────── */}
      {isSuperAdmin && <SeedPanel              onSeeded={fetchStats} />}
      {isSuperAdmin && <SeedAtletPanel         onSeeded={fetchStats} />}
      {isSuperAdmin && <SeedKeputusanPanel     onSeeded={fetchStats} />}
      {isSuperAdmin && <SeedJadualAcaraPanel   onSeeded={fetchStats} />}
    </div>
  )
}
