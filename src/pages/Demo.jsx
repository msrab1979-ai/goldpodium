import { useState } from 'react'
import { Link } from 'react-router-dom'

const ACARA_DEMO = [
  { id: 'ac1', nama: 'Lari 100 Meter', sukan: 'Olahraga', tarikh: '2024-08-01', status: 'selesai' },
  { id: 'ac2', nama: 'Lari 200 Meter', sukan: 'Olahraga', tarikh: '2024-08-01', status: 'sedang_berjalan' },
  { id: 'ac3', nama: 'Lompat Jauh', sukan: 'Olahraga', tarikh: '2024-08-02', status: 'akan_datang' },
  { id: 'ac4', nama: 'Lari Berganti-ganti 4x100 Meter', sukan: 'Olahraga', tarikh: '2024-08-02', status: 'akan_datang' },
]

const KEPUTUSAN_DEMO = [
  { acara: 'Lari 100 Meter', kedudukan: 1, nama: 'Ahmad Faris', sekolah: 'SK Chukai',     keputusan: '12.34s' },
  { acara: 'Lari 100 Meter', kedudukan: 2, nama: 'Muhammad Rafi', sekolah: 'SK Kemasik',  keputusan: '12.56s' },
  { acara: 'Lari 100 Meter', kedudukan: 3, nama: 'Hariz Izzat', sekolah: 'SK Paka',       keputusan: '12.78s' },
  { acara: 'Lari 100 Meter', kedudukan: 4, nama: 'Danial Haziq', sekolah: 'SK Kijal',     keputusan: '13.01s' },
  { acara: 'Lari 100 Meter', kedudukan: 5, nama: 'Farhan Asyraf', sekolah: 'SK Ayer Puteh', keputusan: '13.24s' },
]

const TALLY_DEMO = [
  { sekolah: 'SK Chukai',     emas: 3, perak: 2, gangsa: 1, jumlah: 6 },
  { sekolah: 'SK Kemasik',    emas: 2, perak: 3, gangsa: 2, jumlah: 7 },
  { sekolah: 'SK Paka',       emas: 2, perak: 1, gangsa: 3, jumlah: 6 },
  { sekolah: 'SK Kijal',      emas: 1, perak: 2, gangsa: 1, jumlah: 4 },
  { sekolah: 'SK Ayer Puteh', emas: 1, perak: 1, gangsa: 2, jumlah: 4 },
]

const WARNA_STATUS = {
  selesai:          'bg-gray-100 text-gray-600',
  sedang_berjalan:  'bg-green-100 text-green-700',
  akan_datang:      'bg-yellow-100 text-yellow-700',
}

const LABEL_STATUS = {
  selesai:          'Selesai',
  sedang_berjalan:  'Sedang Berlangsung',
  akan_datang:      'Akan Datang',
}

export default function Demo() {
  const [tabAktif, setTabAktif] = useState('acara')

  const TAB = [
    { id: 'acara',    label: 'Acara' },
    { id: 'keputusan', label: 'Keputusan' },
    { id: 'tally',    label: 'Tally Pingat' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Sepanduk Demo */}
      <div className="bg-amber-400 text-amber-900 px-4 py-2.5 text-center text-xs font-bold">
        🎭 MOD DEMO — Data contoh sahaja. Ditetapkan semula setiap 24 jam. &nbsp;
        <Link to="/login" className="underline hover:no-underline">Log masuk ke akaun sebenar →</Link>
      </div>

      {/* Pengepala */}
      <header className="bg-[#003399] text-white px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-[#003399]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </div>
          <div>
            <p className="text-[9px] text-white/50 uppercase tracking-widest">Gold Podium · Demo</p>
            <p className="text-sm font-bold leading-tight">SK Demo Kemaman</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] bg-amber-400 text-amber-900 font-bold px-2 py-1 rounded">DEMO</span>
          <Link to="/" className="text-white/60 hover:text-white transition-colors p-1.5 text-xs font-medium">
            ← Laman Utama
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* Seruan Naik Taraf */}
        <div className="bg-gradient-to-r from-[#003399] to-[#0044cc] text-white rounded-2xl p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold">Suka apa yang anda lihat?</p>
            <p className="text-xs text-white/70 mt-0.5">Daftarkan sekolah anda mulai RM150 setahun</p>
          </div>
          <Link to="/#harga"
            className="shrink-0 bg-yellow-400 hover:bg-yellow-300 text-[#003399] font-black text-xs px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap">
            Naik Taraf Sekarang
          </Link>
        </div>

        {/* Statistik */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Acara',   nilai: ACARA_DEMO.length },
            { label: 'Atlet',   nilai: 48 },
            { label: 'Rekod Keputusan', nilai: KEPUTUSAN_DEMO.length },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-100 rounded-xl p-4 text-center shadow-sm">
              <p className="text-2xl font-black text-[#003399]">{s.nilai}</p>
              <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tab Kandungan */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex border-b border-gray-100">
            {TAB.map(t => (
              <button key={t.id} onClick={() => setTabAktif(t.id)}
                className={`flex-1 py-3 text-xs font-bold transition-colors ${
                  tabAktif === t.id
                    ? 'text-[#003399] border-b-2 border-[#003399] bg-blue-50/50'
                    : 'text-gray-400 hover:text-gray-600'
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Senarai Acara */}
          {tabAktif === 'acara' && (
            <div className="divide-y divide-gray-50">
              {ACARA_DEMO.map(ac => (
                <div key={ac.id} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{ac.nama}</p>
                    <p className="text-xs text-gray-400">{ac.sukan} · {ac.tarikh}</p>
                  </div>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${WARNA_STATUS[ac.status]}`}>
                    {LABEL_STATUS[ac.status]}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Keputusan */}
          {tabAktif === 'keputusan' && (
            <div>
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                <p className="text-xs font-bold text-gray-500">Lari 100 Meter — Keputusan Akhir</p>
              </div>
              <div className="divide-y divide-gray-50">
                {KEPUTUSAN_DEMO.map(k => (
                  <div key={k.kedudukan} className={`flex items-center px-5 py-3 gap-3 ${k.kedudukan === 1 ? 'bg-amber-50/30' : ''}`}>
                    <span className="text-lg w-6 text-center">
                      {k.kedudukan === 1 ? '🥇' : k.kedudukan === 2 ? '🥈' : k.kedudukan === 3 ? '🥉'
                        : <span className="text-xs text-gray-400 font-bold">{k.kedudukan}</span>}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-800">{k.nama}</p>
                      <p className="text-xs text-gray-400">{k.sekolah}</p>
                    </div>
                    <span className="font-mono font-bold text-sm text-[#003399]">{k.keputusan}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tally Pingat */}
          {tabAktif === 'tally' && (
            <div>
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                <p className="text-xs font-bold text-gray-500">Kedudukan Pingat</p>
              </div>
              <div className="divide-y divide-gray-50">
                {TALLY_DEMO.map((t, i) => (
                  <div key={t.sekolah} className={`flex items-center px-5 py-3 gap-3 ${i === 0 ? 'bg-amber-50/30' : ''}`}>
                    <span className="text-sm font-black text-gray-300 w-5">
                      {i === 0 ? '🥇' : i + 1}
                    </span>
                    <p className="text-sm font-semibold text-gray-800 flex-1">{t.sekolah}</p>
                    <div className="flex items-center gap-3 text-xs font-bold">
                      <span className="text-amber-600">{t.emas}🥇</span>
                      <span className="text-gray-400">{t.perak}🥈</span>
                      <span className="text-orange-600">{t.gangsa}🥉</span>
                      <span className="text-[#003399] w-8 text-right">{t.jumlah}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400">
          Ini adalah data demo sahaja · <Link to="/login" className="text-[#003399] hover:underline font-semibold">Log masuk ke akaun sebenar</Link>
        </p>
      </div>
    </div>
  )
}
