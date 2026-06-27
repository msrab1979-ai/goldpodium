import { useState, useEffect } from 'react'
import { collection, getDocs, doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function TeacherDashboard() {
  const { userData, logout } = useAuth()
  const navigate = useNavigate()
  const schoolId = userData?.schoolId || ''

  const [events,   setEvents]   = useState([])
  const [athletes, setAthletes] = useState([])
  const [results,  setResults]  = useState([])
  const [loading,  setLoading]  = useState(true)

  // Input result form
  const [form,        setForm]        = useState({ eventId: '', athleteId: '', value: '', notes: '' })
  const [formLoading, setFormLoading] = useState(false)
  const [formMsg,     setFormMsg]     = useState('')

  useEffect(() => {
    async function load() {
      if (!schoolId) { setLoading(false); return }
      try {
        const [evSnap, athSnap, resSnap] = await Promise.all([
          getDocs(collection(db, 'tenants', schoolId, 'events')),
          getDocs(collection(db, 'tenants', schoolId, 'athletes')),
          getDocs(collection(db, 'tenants', schoolId, 'results')),
        ])
        const evs = evSnap.docs.map(d => d.data()).filter(e => e.status !== 'cancelled')
        setEvents(evs)
        setAthletes(athSnap.docs.map(d => d.data()))
        setResults(resSnap.docs.map(d => d.data()))
        if (evs.length > 0 && !form.eventId) {
          setForm(f => ({ ...f, eventId: evs[0].id }))
        }
      } catch { /* skip */ }
      setLoading(false)
    }
    load()
  }, [schoolId]) // eslint-disable-line

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.eventId || !form.athleteId || !form.value.trim()) {
      setFormMsg('Sila isi semua medan yang diperlukan.')
      return
    }
    setFormLoading(true)
    setFormMsg('')
    try {
      const id = `result_${Date.now()}`
      await setDoc(doc(db, 'tenants', schoolId, 'results', id), {
        id,
        eventId:   form.eventId,
        athleteId: form.athleteId,
        value:     form.value.trim(),
        notes:     form.notes.trim(),
        inputBy:   userData?.email || '',
        createdAt: serverTimestamp(),
      })
      setResults(r => [...r, { id, eventId: form.eventId, athleteId: form.athleteId, value: form.value }])
      setForm(f => ({ ...f, athleteId: '', value: '', notes: '' }))
      setFormMsg('Keputusan berjaya disimpan.')
      setTimeout(() => setFormMsg(''), 3000)
    } catch {
      setFormMsg('Gagal disimpan. Sila cuba semula.')
    }
    setFormLoading(false)
  }

  const activeEvent  = events.find(e => e.id === form.eventId)
  const eventResults = results.filter(r => r.eventId === form.eventId)
    .map(r => ({
      ...r,
      athleteName: athletes.find(a => a.id === r.athleteId)?.name || r.athleteId,
    }))

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="bg-[#003399] text-white px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-[#003399]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </div>
          <div>
            <p className="text-[9px] text-white/50 uppercase tracking-widest">Gold Podium</p>
            <p className="text-sm font-bold leading-tight">Papan Pemuka Guru</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:block text-right">
            <p className="text-xs font-semibold">{userData?.name || userData?.email}</p>
            <span className="text-[9px] bg-blue-400 text-blue-900 font-bold px-1.5 py-0.5 rounded">GURU</span>
          </div>
          <button onClick={handleLogout} className="text-white/60 hover:text-white transition-colors p-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* Read-only notice */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-blue-700">
            Akses guru — anda boleh <strong>input keputusan</strong> dan <strong>lihat papan kedudukan</strong>.
            Tetapan dan pemadaman adalah terhad.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <span className="text-sm">Memuatkan…</span>
          </div>
        ) : (
          <>
            {/* Input Keputusan Form */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <p className="text-sm font-bold text-gray-800">Input Keputusan</p>
                <p className="text-xs text-gray-400 mt-0.5">Masukkan keputusan atlet bagi acara yang dipilih</p>
              </div>
              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                {formMsg && (
                  <div className={`rounded-xl px-4 py-3 text-xs font-medium ${
                    formMsg.includes('berjaya')
                      ? 'bg-green-50 border border-green-200 text-green-700'
                      : 'bg-red-50 border border-red-200 text-red-700'
                  }`}>
                    {formMsg}
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Event</label>
                  <select value={form.eventId} onChange={e => setForm(f => ({ ...f, eventId: e.target.value }))}
                    required className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50">
                    <option value="">Pilih acara…</option>
                    {events.map(ev => (
                      <option key={ev.id} value={ev.id}>{ev.name} — {ev.sport}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Athlete</label>
                  <select value={form.athleteId} onChange={e => setForm(f => ({ ...f, athleteId: e.target.value }))}
                    required className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50">
                    <option value="">Pilih atlet…</option>
                    {athletes.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  {athletes.length === 0 && (
                    <p className="text-[10px] text-amber-600 mt-1">Tiada atlet berdaftar. Minta pentadbir tambah atlet terlebih dahulu.</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                      Keputusan (masa/jarak)
                    </label>
                    <input type="text" value={form.value}
                      onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                      required placeholder="cth. 12.45s / 5.80m"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Catatan (pilihan)</label>
                    <input type="text" value={form.notes}
                      onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="DNS / DQ / ulasan"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50" />
                  </div>
                </div>

                <button type="submit" disabled={formLoading}
                  className="w-full bg-[#003399] hover:bg-[#002277] disabled:bg-gray-300 text-white font-bold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
                  {formLoading && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
                  {formLoading ? 'Menyimpan…' : 'Simpan Keputusan'}
                </button>
              </form>
            </div>

            {/* Results Leaderboard */}
            {form.eventId && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <p className="text-sm font-bold text-gray-800">
                    {activeEvent?.name || 'Event'} — Keputusan
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{eventResults.length} keputusan direkodkan</p>
                </div>
                {eventResults.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">Tiada keputusan lagi untuk acara ini.</p>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {eventResults.map((r, i) => (
                      <div key={r.id} className="flex items-center px-5 py-3 gap-3">
                        <span className="text-sm font-black text-gray-300 w-6 text-center">
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                        </span>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-gray-800">{r.athleteName}</p>
                          {r.notes && <p className="text-[10px] text-gray-400">{r.notes}</p>}
                        </div>
                        <span className="font-mono font-bold text-sm text-[#003399]">{r.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
