import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Visual from '../../components/PanduanVisual'

const TABS = [
  { id: 'menu',   label: 'Menu Sistem',            icon: '🗂️' },
  { id: 'daftar', label: '1 · Daftar Atlet',       icon: '📝' },
  { id: 'sijil',  label: '2 · Sijil & Dokumen',    icon: '🎓' },
]

/* ============================================================
   TAB MENU SISTEM — penerangan ringkas setiap menu
   ============================================================ */
const MENU_SISTEM = [
  {
    group: 'Menu Kiri (Bar Sisi)',
    items: [
      { icon: '🏠', nama: 'Dashboard', apa: 'Tempat utama anda bekerja — daftar atlet, daftar acara, cetak dan sahkan.' },
      { icon: '🎓', nama: 'Sijil Penyertaan', apa: 'Muat turun sijil untuk SEMUA atlet sekolah anda.' },
      { icon: '🏅', nama: 'Sijil Pencapaian', apa: 'Muat turun sijil untuk atlet yang menang sahaja.' },
      { icon: '📚', nama: 'Buku Kongsi', apa: 'Dokumen yang dikongsi oleh urus setia — buku program, surat, dll.' },
      { icon: '📖', nama: 'Panduan', apa: 'Halaman ini.' },
    ],
  },
  {
    group: 'Tab Dalam Dashboard',
    items: [
      { icon: '👥', nama: 'Atlet Saya', apa: 'Tambah, edit atau padam atlet sekolah anda.' },
      { icon: '✍️', nama: 'Daftar Acara', apa: 'Pilih acara untuk setiap atlet.' },
      { icon: '📊', nama: 'Status', apa: 'Senarai penuh — atlet dan acara yang sudah didaftar.' },
      { icon: '🔍', nama: 'Analisa', apa: 'Ringkasan ikut kategori — acara mana sudah/belum diisi.' },
      { icon: '🖨️', nama: 'Cetak', apa: 'Cetak senarai pendaftaran dalam PDF.' },
      { icon: '✅', nama: 'Pengesahan Pendaftaran', apa: 'Sahkan penyertaan selepas heat dijana oleh urus setia.' },
    ],
  },
]

/* ============================================================
   LANGKAH — tabDest: tab dashboard, pagePath: halaman pengurus
   ============================================================ */
const LANGKAH = {
  daftar: [
    {
      no: '1',
      tajuk: 'Semak Akaun Anda',
      penerangan: 'Sebelum mula, pastikan anda log masuk dengan akaun sekolah yang betul.',
      lokasi: 'Bar sisi kiri (atas)',
      cara: ['Lihat nama sekolah di bahagian atas kiri', 'Pastikan nama itu sekolah anda', 'Hubungi urus setia jika tiada kejohanan dipaparkan'],
      visual: 'semak',
    },
    {
      no: '2',
      tajuk: 'Daftar Atlet',
      penerangan: 'Masukkan semua atlet sekolah anda — termasuk pemain simpanan.',
      lokasi: 'Dashboard → tab Atlet Saya',
      cara: ['Klik "+ Tambah Atlet"', 'Isi No. Kad Pengenalan — tarikh lahir & jantina terisi sendiri', 'Setiap atlet mesti ada No. Badan (BIB) yang unik'],
      nota: 'Kategori umur (contoh: L12, P12) dikira secara automatik.',
      visual: 'senarai',
      tabDest: 'atlet',
    },
    {
      no: '3',
      tajuk: 'Import Excel (Jika Atlet Ramai)',
      penerangan: 'Lebih cepat jika atlet melebihi 10 orang.',
      lokasi: 'Dashboard → tab Atlet Saya',
      cara: ['Klik "Import Excel"', 'Muat turun templat, isi maklumat atlet', 'Muat naik semula fail yang sudah diisi'],
      visual: 'excel',
      tabDest: 'atlet',
    },
    {
      no: '4',
      tajuk: 'Daftar Atlet ke Acara',
      penerangan: 'Pilih acara untuk setiap atlet. Hanya atlet yang layak (jantina & umur sesuai) akan disenaraikan.',
      lokasi: 'Dashboard → tab Daftar Acara',
      cara: ['Klik acara untuk buka senarai', 'Pilih atlet, klik "Daftar"', 'Tanda "PENUH" = had sekolah untuk acara itu sudah cukup', 'Silap daftar? Klik "Buang" pada nama atlet'],
      nota: 'Pendaftaran ditutup automatik bila tarikh tutup tiba atau heat sudah dijana.',
      visual: 'semak',
      tabDest: 'daftar',
    },
    {
      no: '5',
      tajuk: 'Tukar Kategori Atlet (Jika Perlu)',
      penerangan: 'Untuk atlet yang naik kategori — contoh L15 bertanding dalam L17.',
      lokasi: 'Dashboard → tab Atlet Saya',
      cara: ['Klik ikon ↕ pada baris atlet', 'Pilih kategori lebih tinggi sahaja', 'Pendaftaran acara lama dipadam — daftar semula ke acara kategori baru'],
      nota: 'Berkuat kuasa untuk kejohanan semasa sahaja. Klik ↕ semula untuk batalkan.',
      visual: 'borang',
      tabDest: 'atlet',
    },
    {
      no: '6',
      tajuk: 'Semak Sebelum Tarikh Tutup',
      penerangan: 'Pastikan semua atlet dan acara sudah lengkap.',
      lokasi: 'Dashboard → tab Status & tab Analisa',
      cara: ['Tab "Status" — senarai penuh setiap atlet', 'Tab "Analisa" — acara mana belum diisi ikut kategori', 'Lengkapkan yang tertinggal sebelum tarikh tutup'],
      visual: 'semak',
      tabDest: 'status',
    },
    {
      no: '7',
      tajuk: 'Cetak Senarai Pendaftaran',
      penerangan: 'Simpan salinan PDF untuk rekod sekolah dan serahan kepada urus setia.',
      lokasi: 'Dashboard → tab Cetak',
      cara: ['"Cetak Mengikut Atlet" — satu baris setiap atlet', '"Cetak Mengikut Acara" — satu blok setiap acara', 'PDF dimuat turun terus ke peranti anda'],
      visual: 'pdf',
      tabDest: 'cetak',
    },
    {
      no: '8',
      tajuk: 'Sahkan Penyertaan',
      penerangan: 'Langkah terakhir — sahkan selepas urus setia jana heat.',
      lokasi: 'Dashboard → tab Pengesahan Pendaftaran',
      cara: ['Semak lorong / urutan atlet dalam setiap heat', 'Klik "Sahkan Penyertaan"', 'Selepas sah, tiada perubahan boleh dibuat — hubungi urus setia jika ada ralat'],
      nota: 'Lorong disusun automatik oleh sistem ikut bilangan lorong trek (4–8, ditetapkan urus setia). Jangan risau jika trek padang anda bukan 8 lorong.',
      visual: 'semak',
      tabDest: 'startlist',
    },
  ],
  sijil: [
    {
      no: '9',
      tajuk: 'Sijil Penyertaan',
      penerangan: 'Sijil untuk SEMUA atlet berdaftar — termasuk pemain simpanan.',
      lokasi: 'Menu kiri → Sijil Penyertaan',
      cara: ['Buka halaman Sijil Penyertaan', 'Pilih atlet — atau muat turun semua sekaligus', 'PDF sijil siap dengan nama atlet'],
      nota: 'Sijil tersedia selepas admin siapkan template.',
      visual: 'sijil',
      pagePath: 'sijil-penyertaan',
    },
    {
      no: '10',
      tajuk: 'Sijil Pencapaian (Pemenang)',
      penerangan: 'Sijil untuk atlet yang menang — muncul selepas keputusan disahkan rasmi.',
      lokasi: 'Menu kiri → Sijil Pencapaian',
      cara: ['Buka halaman Sijil Pencapaian', 'Senarai pencapaian atlet terpapar automatik', 'Klik muat turun — acara relay pun dapat sijil individu'],
      visual: 'sijil',
      pagePath: 'sijil-pencapaian',
    },
    {
      no: '11',
      tajuk: 'Buku Kongsi',
      penerangan: 'Dokumen yang dikongsi urus setia — buku program, surat panggilan dan lain-lain.',
      lokasi: 'Menu kiri → Buku Kongsi',
      cara: ['Buka halaman Buku Kongsi', 'Klik dokumen untuk muat turun'],
      visual: 'pdf',
      pagePath: 'buku-kongsi',
    },
  ],
}

export default function PanduanPP() {
  const [tab, setTab] = useState('menu')
  const navigate = useNavigate()
  const { slug } = useParams()

  function handleNav(l) {
    if (l.pagePath) { navigate(`/${slug}/pengurus/${l.pagePath}`); return }
    if (l.tabDest) navigate(`/${slug}/pengurus/dashboard`, { state: { tab: l.tabDest } })
  }

  const langkahTab = LANGKAH[tab] || []

  return (
    <div className="p-4 sm:p-6 w-full max-w-3xl space-y-5">

      {/* Header */}
      <div className="bg-[#003399] rounded-xl px-5 py-4 text-white">
        <p className="text-sm font-black">Panduan Pengurus Pasukan</p>
        <p className="text-[11px] text-blue-200 mt-0.5">
          Baru mula? Ikut tab <strong>1 → 2</strong> mengikut urutan. Tab <strong>Menu Sistem</strong> menerangkan fungsi setiap menu.
        </p>
      </div>

      {/* Tab */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              tab === t.id ? 'bg-white text-[#003399] shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
            {LANGKAH[t.id] && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                tab === t.id ? 'bg-[#003399]/10 text-[#003399]' : 'bg-gray-200 text-gray-400'
              }`}>{LANGKAH[t.id].length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ===== TAB MENU SISTEM ===== */}
      {tab === 'menu' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-700">
            Ini senarai menu dalam panel anda dan fungsinya. Kerja utama anda semua berlaku dalam <strong>Dashboard</strong>.
          </div>
          {MENU_SISTEM.map(g => (
            <div key={g.group} className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{g.group}</p>
              </div>
              <div className="divide-y divide-gray-50">
                {g.items.map(m => (
                  <div key={m.nama} className="flex items-start gap-3 px-4 py-2.5">
                    <span className="text-base shrink-0">{m.icon}</span>
                    <div>
                      <p className="text-xs font-bold text-gray-800">{m.nama}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{m.apa}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== TAB LANGKAH ===== */}
      {tab !== 'menu' && (
        <div className="space-y-3">
          {langkahTab.map((l, idx) => (
            <div key={l.no} className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <div className="flex items-start gap-4">

                {/* Nombor */}
                <div className="w-9 h-9 rounded-full bg-[#003399] text-white text-sm font-bold flex items-center justify-center shrink-0">
                  {l.no}
                </div>

                {/* Kandungan */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-gray-900">{l.tajuk}</h3>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{l.penerangan}</p>

                  {/* Lokasi */}
                  {l.lokasi && (
                    <div className="mt-2 inline-flex items-center gap-1.5 bg-gray-50 border border-gray-100 px-2.5 py-1 rounded-lg">
                      <span className="text-[10px]">📍</span>
                      <span className="text-[10px] font-semibold text-gray-600">Lokasi: {l.lokasi}</span>
                    </div>
                  )}

                  {/* Cara buat */}
                  {l.cara && l.cara.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Cara buat:</p>
                      <ol className="space-y-1">
                        {l.cara.map((c, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                            <span className="w-4 h-4 rounded-full bg-blue-50 text-[#003399] text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                            <span>{c}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* Nota */}
                  {l.nota && (
                    <div className="mt-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-amber-700 leading-relaxed">💡 {l.nota}</p>
                    </div>
                  )}

                  {/* Ilustrasi skrin */}
                  {l.visual && <Visual jenis={l.visual} />}

                  {(l.tabDest || l.pagePath) && (
                    <div className="mt-3">
                      <button
                        onClick={() => handleNav(l)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#003399] text-white text-xs font-semibold rounded-lg hover:bg-[#002288] transition-colors"
                      >
                        Pergi ke {l.pagePath ? l.tajuk : 'Dashboard'}
                        <span>→</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Garis sambung */}
              {idx < langkahTab.length - 1 && (
                <div className="ml-4 mt-3 pl-[18px] border-l-2 border-dashed border-gray-100 h-2" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-700">
        <p className="font-bold mb-1">💡 Perlu bantuan?</p>
        <p className="text-blue-600">
          Untuk sebarang pertanyaan atau bantuan teknikal, sila hubungi <strong>Setiausaha Kejohanan</strong> atau pentadbir sistem.
        </p>
      </div>

    </div>
  )
}
