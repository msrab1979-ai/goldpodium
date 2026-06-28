import { useState, useEffect } from 'react'
import { collection, getDocs, doc, setDoc, updateDoc, serverTimestamp, query, where, orderBy } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'

// ── Ikon ──────────────────────────────────────────────────────────────────────

const Ikon = {
  tambah:    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>,
  keluar:    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
  masuk:     <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" /></svg>,
  kalender:  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  lokasi:    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  trophy:    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>,
}

const STATUS_LABEL = { aktif: 'Sedang Berlangsung', selesai: 'Selesai', draf: 'Draf' }
const STATUS_WARNA = {
  aktif:   'bg-green-100 text-green-700 border-green-200',
  selesai: 'bg-gray-100 text-gray-500 border-gray-200',
  draf:    'bg-yellow-100 text-yellow-700 border-yellow-200',
}

// ── Modal Buat Kejohanan ───────────────────────────────────────────────────────

function ModalBuatKejohanan({ schoolId, onTutup, onBerjaya }) {
  const HARI_INI = new Date().toISOString().split('T')[0]
  const [borang, setBorang] = useState({
    namaKejohanan: '', lokasi: '', tarikhMula: HARI_INI, tarikhTamat: HARI_INI,
  })
  const [muatTurun, setMuatTurun] = useState(false)
  const [ralat, setRalat] = useState('')

  function set(k, v) { setBorang(b => ({ ...b, [k]: v })); setRalat('') }

  async function handleHantar(e) {
    e.preventDefault()
    if (!borang.namaKejohanan.trim()) return setRalat('Nama kejohanan diperlukan.')
    if (!borang.lokasi.trim()) return setRalat('Lokasi diperlukan.')
    if (borang.tarikhTamat < borang.tarikhMula) return setRalat('Tarikh tamat mesti selepas tarikh mula.')

    setMuatTurun(true)
    try {
      const id = `kej_${Date.now()}`
      await setDoc(doc(db, 'tenants', schoolId, 'kejohanan', id), {
        id,
        namaKejohanan:  borang.namaKejohanan.trim(),
        lokasi:         borang.lokasi.trim(),
        tarikhMula:     borang.tarikhMula,
        tarikhTamat:    borang.tarikhTamat,
        statusKejohanan: 'draf',
        schoolId,
        createdAt:      serverTimestamp(),
      })
      onBerjaya()
      onTutup()
    } catch (err) {
      setRalat('Gagal mencipta kejohanan. Sila cuba semula.')
    } finally {
      setMuatTurun(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={e => e.target === e.currentTarget && onTutup()}>
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-[#003399] px-5 py-4 flex items-center justify-between">
          <p className="text-sm font-bold text-white">Buat Kejohanan Baru</p>
          <button onClick={onTutup} className="text-white/50 hover:text-white">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleHantar} className="p-5 space-y-3">
          {ralat && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{ralat}</p>}

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Nama Kejohanan</label>
            <input type="text" value={borang.namaKejohanan} onChange={e => set('namaKejohanan', e.target.value)}
              required autoFocus placeholder="MSSD Kemaman 2026"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50" />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Lokasi</label>
            <input type="text" value={borang.lokasi} onChange={e => set('lokasi', e.target.value)}
              required placeholder="Stadium Kemaman"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Tarikh Mula</label>
              <input type="date" value={borang.tarikhMula} onChange={e => set('tarikhMula', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Tarikh Tamat</label>
              <input type="date" value={borang.tarikhTamat} onChange={e => set('tarikhTamat', e.target.value)}
                min={borang.tarikhMula}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] bg-gray-50" />
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
            <p className="text-[10px] text-blue-600">
              Kejohanan akan disimpan sebagai <strong>Draf</strong> dulu. Anda boleh kemaskini dan aktifkan bila sedia.
            </p>
          </div>

          <button type="submit" disabled={muatTurun}
            className="w-full bg-[#003399] hover:bg-[#002277] disabled:bg-gray-300 text-white font-bold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
            {muatTurun
              ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Menyimpan…</>
              : 'Buat Kejohanan'
            }
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Kad Kejohanan ─────────────────────────────────────────────────────────────

function KadKejohanan({ kej, onPilih, onTukarStatus }) {
  const [muatTurun, setMuatTurun] = useState(false)

  async function handleTukarStatus(status) {
    setMuatTurun(true)
    await onTukarStatus(kej.id, status)
    setMuatTurun(false)
  }

  const tarikhMula  = kej.tarikhMula  ? new Date(kej.tarikhMula).toLocaleDateString('ms-MY')  : '—'
  const tarikhTamat = kej.tarikhTamat ? new Date(kej.tarikhTamat).toLocaleDateString('ms-MY') : '—'

  return (
    <div className={`bg-white border-2 rounded-2xl p-5 hover:shadow-md transition-all ${
      kej.statusKejohanan === 'aktif' ? 'border-green-300' : kej.statusKejohanan === 'draf' ? 'border-yellow-200' : 'border-gray-100'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border mb-1.5 ${STATUS_WARNA[kej.statusKejohanan] || STATUS_WARNA.draf}`}>
            {kej.statusKejohanan === 'aktif' && <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1 animate-pulse" />}
            {STATUS_LABEL[kej.statusKejohanan] || 'Draf'}
          </span>
          <h3 className="text-sm font-bold text-gray-900 leading-tight truncate">{kej.namaKejohanan}</h3>
        </div>
      </div>

      {/* Info */}
      <div className="space-y-1.5 mb-4">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          {Ikon.lokasi}
          <span className="truncate">{kej.lokasi || '—'}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          {Ikon.kalender}
          <span>{tarikhMula} — {tarikhTamat}</span>
        </div>
      </div>

      {/* Butang */}
      <div className="flex gap-2">
        <button onClick={() => onPilih(kej)}
          className="flex-1 bg-[#003399] hover:bg-[#002277] text-white text-xs font-bold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5">
          {Ikon.masuk} Urus Kejohanan
        </button>

        {kej.statusKejohanan === 'draf' && (
          <button onClick={() => handleTukarStatus('aktif')} disabled={muatTurun}
            className="px-3 bg-green-500 hover:bg-green-600 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50">
            Aktif
          </button>
        )}
        {kej.statusKejohanan === 'aktif' && (
          <button onClick={() => handleTukarStatus('selesai')} disabled={muatTurun}
            className="px-3 bg-gray-500 hover:bg-gray-600 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50">
            Tamat
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { userData, logout } = useAuth()
  const navigate = useNavigate()

  const isSuperadmin = userData?.role === 'superadmin'
  // Superadmin guna schoolId yang dipilih dari panel, admin guna schoolId sendiri
  const viewSchoolId = isSuperadmin
    ? (() => { try { return JSON.parse(sessionStorage.getItem('gp_view_school') || '{}').schoolId || '' } catch { return '' } })()
    : null
  const schoolId = viewSchoolId || userData?.schoolId
  const viewNamaSekolah = isSuperadmin
    ? (() => { try { return JSON.parse(sessionStorage.getItem('gp_view_school') || '{}').namaSekolah || '' } catch { return '' } })()
    : null

  const [kejohanan,   setKejohanan]   = useState([])
  const [muatTurun,   setMuatTurun]   = useState(true)
  const [modalBuat,   setModalBuat]   = useState(false)

  async function muatKejohanan() {
    if (!schoolId) return
    setMuatTurun(true)
    try {
      const snap = await getDocs(
        query(collection(db, 'tenants', schoolId, 'kejohanan'), orderBy('createdAt', 'desc'))
      )
      setKejohanan(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch { /* langkau */ }
    setMuatTurun(false)
  }

  useEffect(() => { muatKejohanan() }, [schoolId])

  async function handleTukarStatus(kejId, status) {
    try {
      await updateDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId), {
        statusKejohanan: status, updatedAt: serverTimestamp()
      })
      setKejohanan(list => list.map(k => k.id === kejId ? { ...k, statusKejohanan: status } : k))
    } catch { /* langkau */ }
  }

  function handlePilihKejohanan(kej) {
    sessionStorage.setItem('gp_kej_aktif', JSON.stringify({ id: kej.id, namaKejohanan: kej.namaKejohanan, schoolId }))
    navigate(`/admin/kejohanan/${kej.id}`)
  }

  const aktif   = kejohanan.filter(k => k.statusKejohanan === 'aktif')
  const draf    = kejohanan.filter(k => k.statusKejohanan === 'draf')
  const selesai = kejohanan.filter(k => k.statusKejohanan === 'selesai')

  return (
    <div className="max-w-4xl mx-auto space-y-6">

        {/* Welcome + CTA */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center justify-between gap-4 shadow-sm">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Dashboard Admin</p>
            <h2 className="text-lg font-black text-gray-900">Kejohanan Anda</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {aktif.length > 0
                ? `${aktif.length} kejohanan sedang berlangsung`
                : 'Tiada kejohanan aktif — buat kejohanan baru'}
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <button onClick={() => navigate('/admin/sekolah')}
              className="flex items-center gap-1.5 border border-gray-200 hover:border-[#003399] text-gray-600 hover:text-[#003399] font-bold px-3 py-2.5 rounded-xl text-xs transition-colors">
              🏫 Sekolah
            </button>
            <button onClick={() => setModalBuat(true)}
              className="flex items-center gap-2 bg-[#003399] hover:bg-[#002277] text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-colors shadow-sm">
              {Ikon.tambah}
              Buat Kejohanan
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Sedang Berlangsung', nilai: aktif.length,   warna: 'bg-green-50 border-green-200 text-green-700' },
            { label: 'Draf',               nilai: draf.length,    warna: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
            { label: 'Selesai',            nilai: selesai.length, warna: 'bg-gray-50 border-gray-200 text-gray-500' },
          ].map(s => (
            <div key={s.label} className={`border rounded-xl p-4 ${s.warna}`}>
              <p className="text-xs font-medium opacity-70">{s.label}</p>
              <p className="text-3xl font-black mt-1">{s.nilai}</p>
            </div>
          ))}
        </div>

        {/* Quick Links — Pengurusan */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Pengurusan</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Senarai Kejohanan',    ikon: '📋', path: '/admin/kejohanan-setup' },
              { label: 'Urus Pengguna',        ikon: '👥', path: '/admin/pengguna' },
              { label: 'Urus Sekolah',         ikon: '🏫', path: '/admin/sekolah' },
              { label: 'Tetapan Sistem',       ikon: '⚙️', path: '/admin/tetapan' },
              { label: 'Rekod Kejohanan',      ikon: '🏆', path: '/admin/rekod' },
              { label: 'Jadual Acara',         ikon: '📅', path: '/admin/jadual' },
              { label: 'Olahragawan',          ikon: '🏅', path: '/admin/olahragawan' },
              { label: 'Analisa Pingat',       ikon: '📊', path: '/admin/analisa-pingat' },
              { label: 'Analisis Pendaftaran', ikon: '🔍', path: '/admin/analisis-pendaftaran' },
              { label: 'Manual Pendaftaran',   ikon: '📖', path: '/admin/manual-pendaftaran' },
              { label: 'Backup Data',          ikon: '💾', path: '/admin/backup' },
              { label: 'Health Check',         ikon: '🩺', path: '/admin/health' },
              { label: 'Reset Sistem',         ikon: '🔄', path: '/admin/reset' },
            ].map(item => (
              <button key={item.path} onClick={() => navigate(item.path)}
                className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl px-3 py-3 text-left hover:border-[#003399]/30 hover:shadow-sm transition-all group">
                <span className="text-base">{item.ikon}</span>
                <span className="text-xs font-semibold text-gray-600 group-hover:text-[#003399] transition-colors leading-tight">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Quick Links — Cetakan & Sijil */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Cetakan & Sijil</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Buku Kejohanan',      ikon: '📚', path: '/admin/buku-kejohanan' },
              { label: 'Buku Kongsi',         ikon: '🔗', path: '/admin/buku-kongsi' },
              { label: 'Buku Program',        ikon: '📰', path: '/admin/buku-program' },
              { label: 'Link Buku Kejohanan', ikon: '🌐', path: '/admin/buku-kejohanan-link' },
              { label: 'Cetak Acara',         ikon: '🖨️', path: '/admin/cetak-acara' },
              { label: 'Cetak Keputusan',     ikon: '📄', path: '/admin/cetak-keputusan' },
              { label: 'E-Sijil Penyertaan',  ikon: '🎖️', path: '/admin/esijil' },
              { label: 'E-Sijil Pencapaian',  ikon: '🥇', path: '/admin/esijil-pencapaian' },
              { label: 'Muat Turun Sijil',    ikon: '⬇️', path: '/admin/muat-turun-sijil' },
              { label: 'Sijil Pengurus',      ikon: '🏫', path: '/admin/sijil-pengurus' },
              { label: 'Galeri',              ikon: '🖼️', path: '/admin/galeri' },
            ].map(item => (
              <button key={item.path} onClick={() => navigate(item.path)}
                className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl px-3 py-3 text-left hover:border-[#003399]/30 hover:shadow-sm transition-all group">
                <span className="text-base">{item.ikon}</span>
                <span className="text-xs font-semibold text-gray-600 group-hover:text-[#003399] transition-colors leading-tight">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Senarai Kejohanan */}
        {muatTurun ? (
          <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <span className="text-sm">Memuatkan kejohanan…</span>
          </div>
        ) : kejohanan.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
            <div className="text-5xl mb-3">🏆</div>
            <p className="text-gray-800 font-bold text-sm mb-1">Belum ada kejohanan</p>
            <p className="text-gray-400 text-xs mb-5">Mulakan dengan membuat kejohanan pertama anda</p>
            <button onClick={() => setModalBuat(true)}
              className="inline-flex items-center gap-2 bg-[#003399] hover:bg-[#002277] text-white font-bold px-5 py-2.5 rounded-xl text-xs transition-colors">
              {Ikon.tambah} Buat Kejohanan Pertama
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Aktif dulu */}
            {aktif.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-green-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse inline-block" />
                  Sedang Berlangsung
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {aktif.map(k => (
                    <KadKejohanan key={k.id} kej={k} onPilih={handlePilihKejohanan} onTukarStatus={handleTukarStatus} />
                  ))}
                </div>
              </div>
            )}

            {/* Draf */}
            {draf.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-yellow-600 uppercase tracking-widest mb-2">Draf</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {draf.map(k => (
                    <KadKejohanan key={k.id} kej={k} onPilih={handlePilihKejohanan} onTukarStatus={handleTukarStatus} />
                  ))}
                </div>
              </div>
            )}

            {/* Selesai */}
            {selesai.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Selesai</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selesai.map(k => (
                    <KadKejohanan key={k.id} kej={k} onPilih={handlePilihKejohanan} onTukarStatus={handleTukarStatus} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      {modalBuat && (
        <ModalBuatKejohanan
          schoolId={schoolId}
          onTutup={() => setModalBuat(false)}
          onBerjaya={muatKejohanan}
        />
      )}
    </div>
  )
}
