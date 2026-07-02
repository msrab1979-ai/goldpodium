import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

const PANDUAN_STEPS = [
  {
    id: 'mulakan',
    tajuk: 'Langkah 1 — Sebelum Bermula',
    warna: 'blue',
    langkah: [
      { n: 1, teks: 'Pastikan anda telah log masuk dengan akaun Pengurus Pasukan (PP) yang betul.' },
      { n: 2, teks: 'Semak nama sekolah anda di bahagian atas kiri panel — pastikan ia betul.' },
      { n: 3, teks: 'Hubungi pentadbir jika tiada kejohanan aktif dipaparkan.' },
    ],
  },
  {
    id: 'tambah-atlet',
    tajuk: 'Langkah 2 — Daftar Atlet Sekolah',
    warna: 'indigo',
    tabDest: 'atlet',
    langkah: [
      { n: 1, teks: 'Pergi ke Dashboard → tab "Atlet Saya".' },
      { n: 2, teks: 'Klik butang "Tambah Atlet" untuk tambah seorang atlet. Isikan No. Kad Pengenalan — tarikh lahir dan jantina akan diisi secara automatik.' },
      { n: 3, teks: 'Atau klik "Import Excel" untuk import ramai atlet sekaligus. Muat turun templat yang disediakan, isikan maklumat atlet, kemudian muat naik semula.' },
      { n: 4, teks: 'Setiap atlet mesti mempunyai Nombor Badan (BIB) yang unik.' },
      { n: 5, teks: 'Kategori atlet (contoh: L15, P12) akan dikira secara automatik berdasarkan tarikh lahir dan tahun kejohanan.' },
    ],
    nota: 'Tip: Import Excel lebih cepat jika atlet melebihi 10 orang.',
  },
  {
    id: 'daftar-acara',
    tajuk: 'Langkah 3 — Daftar Atlet ke Acara',
    warna: 'green',
    tabDest: 'daftar',
    langkah: [
      { n: 1, teks: 'Pergi ke Dashboard → tab "Daftar Acara".' },
      { n: 2, teks: 'Senarai acara dipaparkan mengikut kategori. Klik pada mana-mana acara untuk kembangkan senarai peserta.' },
      { n: 3, teks: 'Atlet yang layak (mengikut jantina dan kategori umur) akan dipaparkan di bawah. Pilih atlet dan klik "Daftar".' },
      { n: 4, teks: 'Badge "PENUH" bermaksud had atlet sekolah ini untuk acara berkenaan telah dipenuhi.' },
      { n: 5, teks: 'Untuk buang atlet dari acara, klik butang "Buang" pada nama atlet dalam senarai "Sudah Daftar".' },
    ],
    nota: 'Pendaftaran akan ditutup secara automatik apabila tarikh tutup tiba atau heat sudah dijana.',
  },
  {
    id: 'tukar-kategori',
    tajuk: 'Langkah 4 — Tukar Kategori Atlet (Naik Kategori)',
    warna: 'amber',
    tabDest: 'atlet',
    langkah: [
      { n: 1, teks: 'Pergi ke Dashboard → tab "Atlet Saya".' },
      { n: 2, teks: 'Klik ikon ↕ (Tukar Kategori) pada baris atlet yang ingin dinaikkan kategori.' },
      { n: 3, teks: 'Pilih kategori yang lebih tinggi sahaja (contoh: L15 → L17). Kategori asal tidak boleh dipilih semula.' },
      { n: 4, teks: 'Jika atlet sudah ada pendaftaran acara, semua pendaftaran akan dipadam — anda perlu daftar semula ke acara kategori baru.' },
      { n: 5, teks: 'Selepas override aktif, atlet hanya akan nampak dalam senarai layak untuk acara kategori baru sahaja.' },
      { n: 6, teks: 'Untuk batalkan override, klik semula ↕ dan pilih "Buang Override — Kembali ke kategori asal".' },
    ],
    nota: 'Override kategori hanya berkuat kuasa untuk kejohanan semasa sahaja.',
  },
  {
    id: 'semak-status',
    tajuk: 'Langkah 5 — Semak & Analisa Pendaftaran',
    warna: 'purple',
    langkah: [
      { n: 1, teks: 'Tab "Status" — semak senarai setiap atlet dan acara yang telah didaftarkan.' },
      { n: 2, teks: 'Tab "Analisa" — paparan ringkasan mengikut kategori: acara mana yang sudah daftar dan mana yang belum.' },
      { n: 3, teks: 'Pastikan semua acara yang dikehendaki sudah berstatus "Daftar" sebelum tarikh tutup pendaftaran.' },
    ],
  },
  {
    id: 'cetak',
    tajuk: 'Langkah 6 — Cetak Senarai Pendaftaran',
    warna: 'rose',
    tabDest: 'cetak',
    langkah: [
      { n: 1, teks: 'Pergi ke Dashboard → tab "Cetak".' },
      { n: 2, teks: '"Cetak Mengikut Atlet" — satu baris per atlet dengan semua acara yang didaftarkan.' },
      { n: 3, teks: '"Cetak Mengikut Acara" — satu blok per acara dengan nama peserta.' },
      { n: 4, teks: 'Fail PDF akan dimuat turun secara automatik ke peranti anda.' },
    ],
    nota: 'Sila serah salinan bercetak kepada Setiausaha Kejohanan sebelum tarikh tutup.',
  },
  {
    id: 'pengesahan',
    tajuk: 'Langkah 7 — Pengesahan Pendaftaran',
    warna: 'teal',
    tabDest: 'startlist',
    langkah: [
      { n: 1, teks: 'Tab "Pengesahan Pendaftaran" akan aktif setelah pentadbir menjana heat untuk acara anda.' },
      { n: 2, teks: 'Semak nombor lorong atau urutan atlet anda dalam setiap heat.' },
      { n: 3, teks: 'Klik "Sahkan Penyertaan" apabila semua maklumat telah disemak dan disahkan.' },
      { n: 4, teks: 'Setelah disahkan, tiada perubahan boleh dibuat. Hubungi pentadbir jika ada ralat.' },
    ],
  },
]

const WARNA_MAP = {
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',  badge: 'bg-blue-600',   num: 'bg-blue-100 text-blue-700',   title: 'text-blue-900' },
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200',badge: 'bg-indigo-600', num: 'bg-indigo-100 text-indigo-700',title: 'text-indigo-900' },
  green:  { bg: 'bg-green-50',  border: 'border-green-200', badge: 'bg-green-600',  num: 'bg-green-100 text-green-700', title: 'text-green-900' },
  amber:  { bg: 'bg-amber-50',  border: 'border-amber-200', badge: 'bg-amber-500',  num: 'bg-amber-100 text-amber-700', title: 'text-amber-900' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200',badge: 'bg-purple-600', num: 'bg-purple-100 text-purple-700',title: 'text-purple-900' },
  rose:   { bg: 'bg-rose-50',   border: 'border-rose-200',  badge: 'bg-rose-600',   num: 'bg-rose-100 text-rose-700',   title: 'text-rose-900' },
  teal:   { bg: 'bg-teal-50',   border: 'border-teal-200',  badge: 'bg-teal-600',   num: 'bg-teal-100 text-teal-700',   title: 'text-teal-900' },
}

export default function PanduanPP() {
  const [buka, setBuka] = useState(PANDUAN_STEPS[0].id)
  const navigate = useNavigate()
  const { slug } = useParams()

  function goToDashboard(tab) {
    navigate(`/${slug}/pengurus/dashboard`, { state: { tab } })
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 w-full max-w-3xl">
      <div className="bg-[#003399] rounded-xl px-5 py-4 text-white">
        <p className="text-sm font-black">Panduan Pengurus Pasukan</p>
        <p className="text-[11px] text-blue-200 mt-0.5">Ikut langkah-langkah berikut untuk mendaftarkan atlet sekolah anda.</p>
      </div>

      {PANDUAN_STEPS.map((step, idx) => {
        const w      = WARNA_MAP[step.warna] || WARNA_MAP.blue
        const isOpen = buka === step.id
        return (
          <div key={step.id} className={`rounded-xl border overflow-hidden ${w.border}`}>
            <button
              onClick={() => setBuka(isOpen ? '' : step.id)}
              className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${isOpen ? w.bg : 'bg-white hover:bg-gray-50/60'}`}>
              <div className="flex items-center gap-3">
                <span className={`w-6 h-6 rounded-full text-[10px] font-black text-white flex items-center justify-center shrink-0 ${w.badge}`}>
                  {idx + 1}
                </span>
                <span className={`text-xs font-bold ${isOpen ? w.title : 'text-gray-700'}`}>{step.tajuk}</span>
              </div>
              <svg className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isOpen && (
              <div className={`px-4 pb-4 pt-2 ${w.bg} border-t ${w.border}`}>
                <ol className="space-y-2.5 mt-1">
                  {step.langkah.map(l => (
                    <li key={l.n} className="flex items-start gap-2.5">
                      <span className={`w-5 h-5 rounded-full text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5 ${w.num}`}>
                        {l.n}
                      </span>
                      <p className="text-xs text-gray-700 leading-relaxed">{l.teks}</p>
                    </li>
                  ))}
                </ol>
                {step.nota && (
                  <div className="mt-3 flex items-start gap-2 bg-white/70 border border-white rounded-lg px-3 py-2">
                    <svg className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-[10px] text-gray-500 leading-relaxed">{step.nota}</p>
                  </div>
                )}
                {step.tabDest && (
                  <button onClick={() => goToDashboard(step.tabDest)}
                    className={`mt-3 flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-white rounded-lg ${w.badge} hover:opacity-90 transition-opacity`}>
                    Pergi ke Dashboard
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}

      <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-start gap-2">
        <svg className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
        <p className="text-[10px] text-gray-500 leading-relaxed">
          Untuk sebarang pertanyaan atau bantuan teknikal, sila hubungi <strong>Setiausaha Kejohanan</strong> atau pentadbir sistem.
        </p>
      </div>
    </div>
  )
}
