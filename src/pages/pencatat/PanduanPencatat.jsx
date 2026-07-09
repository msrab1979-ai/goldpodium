import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Visual from '../../components/PanduanVisual'

const TABS = [
  { id: 'menu',    label: 'Menu Sistem',          icon: '🗂️' },
  { id: 'input',   label: '1 · Input Keputusan',  icon: '⏱️' },
  { id: 'cetakan', label: '2 · Cetakan & Semakan', icon: '🖨️' },
]

/* ============================================================
   TAB MENU SISTEM — penerangan ringkas setiap menu
   ============================================================ */
const MENU_SISTEM = [
  {
    group: 'Menu Kiri (Bar Sisi)',
    items: [
      { icon: '🏠', nama: 'Dashboard', apa: 'Muka depan — ringkasan kejohanan dan tugasan anda.' },
      { icon: '📋', nama: 'Start List', apa: 'Lihat dan cetak senarai heat & lorong setiap acara.' },
      { icon: '⏱️', nama: 'Input Keputusan', apa: 'Kerja utama anda — isi masa/jarak dan sahkan keputusan.' },
      { icon: '🎁', nama: 'Cetakan Hadiah', apa: 'Cetak slip pemenang untuk penyampaian hadiah.' },
      { icon: '🎖️', nama: 'Rekod Semasa', apa: 'Senarai rekod kejohanan — semak sebelum umum rekod pecah.' },
      { icon: '📄', nama: 'Cetak Acara', apa: 'Cetak senarai acara dan peserta.' },
      { icon: '📖', nama: 'Panduan', apa: 'Halaman ini.' },
    ],
  },
]

/* ============================================================
   LANGKAH — pagePath: halaman pencatat
   ============================================================ */
const LANGKAH = {
  input: [
    {
      no: '1',
      tajuk: 'Log Masuk',
      penerangan: 'Guna maklumat yang diberi oleh urus setia / admin.',
      lokasi: 'Halaman login Pencatat',
      cara: ['Masukkan kod sekolah (contoh: nama pendek sekolah)', 'Masukkan Kod Akses (huruf besar)', 'Masukkan PIN 6 digit'],
      nota: 'Lupa kod akses atau PIN? Hubungi admin — mereka boleh semak atau tetapkan semula.',
      visual: 'borang',
    },
    {
      no: '2',
      tajuk: 'Buka Acara & Heat',
      penerangan: 'Pilih acara yang anda bertugas.',
      lokasi: 'Menu kiri → Input Keputusan',
      cara: ['Pilih kejohanan aktif', 'Pilih acara di senarai', 'Pilih heat yang sedang berlangsung'],
      visual: 'duaPanel',
      pagePath: 'input-keputusan',
      labelNav: 'Input Keputusan',
    },
    {
      no: '3',
      tajuk: 'Isi Keputusan',
      penerangan: 'Masukkan masa (larian) atau jarak/tinggi (padang) untuk setiap atlet.',
      lokasi: 'Menu kiri → Input Keputusan',
      cara: ['Isi keputusan setiap atlet — sistem susun kedudukan sendiri', 'Atlet tidak hadir / tidak habis? Tanda DNS, DNF atau DQ', 'Acara padang: kedudukan dicadang automatik — boleh Edit Manual jika perlu'],
      nota: 'Format masa: 11.25 (saat) atau 1:52.30 (minit:saat). Semak betul-betul sebelum simpan.',
      visual: 'masa',
      pagePath: 'input-keputusan',
      labelNav: 'Input Keputusan',
    },
    {
      no: '4',
      tajuk: 'Sahkan Keputusan Rasmi',
      penerangan: 'Selepas disahkan, medal tally, mata olahragawan dan rekod dikira secara automatik.',
      lokasi: 'Menu kiri → Input Keputusan',
      cara: ['Semak semula semua masa dan kedudukan', 'Klik "Sahkan" — keputusan terus terpapar di halaman awam', 'Tersilap selepas sah? Edit semula — sistem betulkan pingat automatik'],
      nota: 'Jika ada rekod pecah, sistem tanda badge RBK secara automatik. Admin akan sahkan tuntutan rekod.',
      visual: 'semak',
      pagePath: 'input-keputusan',
      labelNav: 'Input Keputusan',
    },
    {
      no: '5',
      tajuk: 'Jana Separuh Akhir / Final',
      penerangan: 'Bila semua heat saringan sudah rasmi, butang jana akan muncul.',
      lokasi: 'Menu kiri → Input Keputusan',
      cara: ['Pastikan SEMUA heat saringan acara itu sudah disahkan', 'Klik "Jana Final" / "Jana Separuh Akhir"', 'Semak senarai finalis dan lorong, kemudian sahkan'],
      nota: 'Lorong disusun automatik ikut bilangan lorong trek (4–8, set oleh admin). Trek 8 lorong ikut piawai penuh World Athletics; trek 4–7 lorong susunan automatik — ranking terbaik dapat lorong tengah. Jika finalis melebihi bilangan lorong, sistem beri amaran.',
      visual: 'duaPanel',
      pagePath: 'input-keputusan',
      labelNav: 'Input Keputusan',
    },
    {
      no: '6',
      tajuk: 'Cetak Keputusan (3 Salinan)',
      penerangan: 'Untuk acara final yang sudah rasmi — satu klik, tiga salinan.',
      lokasi: 'Menu kiri → Input Keputusan (dalam heat rasmi)',
      cara: ['Buka heat final yang sudah rasmi', 'Klik "Cetak Keputusan"', 'PDF keluar 3 salinan: JURUHEBAH, HADIAH dan FAIL', 'Boleh pilih 3, 4 atau 5 pemenang'],
      visual: 'pdf',
      pagePath: 'input-keputusan',
      labelNav: 'Input Keputusan',
    },
  ],
  cetakan: [
    {
      no: '7',
      tajuk: 'Cetak Start List',
      penerangan: 'Cetak senarai heat & lorong untuk diedar sebelum acara bermula.',
      lokasi: 'Menu kiri → Start List',
      cara: ['Pilih acara', 'Klik "Cetak"', 'PDF 4 salinan: Juruhebah, Call Room, Teknikal dan Fail'],
      visual: 'pdf',
      pagePath: 'startlist',
      labelNav: 'Start List',
    },
    {
      no: '8',
      tajuk: 'Cetakan Hadiah',
      penerangan: 'Slip pemenang untuk majlis penyampaian hadiah.',
      lokasi: 'Menu kiri → Cetakan Hadiah',
      cara: ['Pilih acara yang sudah rasmi', 'Semak nama pemenang dan sekolah', 'Klik cetak — serahkan kepada urus setia hadiah'],
      visual: 'medal',
      pagePath: 'cetakan-hadiah',
      labelNav: 'Cetakan Hadiah',
    },
    {
      no: '9',
      tajuk: 'Semak Rekod Semasa',
      penerangan: 'Rujuk rekod kejohanan sebelum juruhebah mengumumkan rekod pecah.',
      lokasi: 'Menu kiri → Rekod Semasa',
      cara: ['Cari acara berkenaan', 'Bandingkan keputusan baru dengan rekod lama', 'Rekod pecah ditanda RBK secara automatik oleh sistem'],
      visual: 'senarai',
      pagePath: 'rekod',
      labelNav: 'Rekod Semasa',
    },
    {
      no: '10',
      tajuk: 'Cetak Acara',
      penerangan: 'Cetak senarai acara dan peserta untuk rujukan petugas.',
      lokasi: 'Menu kiri → Cetak Acara',
      cara: ['Pilih acara atau kategori', 'Klik cetak — PDF dimuat turun terus'],
      visual: 'pdf',
      pagePath: 'cetak-acara',
      labelNav: 'Cetak Acara',
    },
  ],
}

export default function PanduanPencatat() {
  const [tab, setTab] = useState('menu')
  const navigate = useNavigate()
  const { slug } = useParams()

  function handleNav(l) {
    if (l.pagePath) navigate(`/${slug}/pencatat/${l.pagePath}`)
  }

  const langkahTab = LANGKAH[tab] || []

  return (
    <div className="p-4 sm:p-6 w-full max-w-3xl space-y-5">

      {/* Header */}
      <div className="bg-[#003399] rounded-xl px-5 py-4 text-white">
        <p className="text-sm font-black">Panduan Pencatat</p>
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
            Ini senarai menu dalam panel anda dan fungsinya. Kerja utama anda ialah <strong>Input Keputusan</strong>.
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

                  {l.pagePath && (
                    <div className="mt-3">
                      <button
                        onClick={() => handleNav(l)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#003399] text-white text-xs font-semibold rounded-lg hover:bg-[#002288] transition-colors"
                      >
                        Pergi ke {l.labelNav}
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
        <p className="font-bold mb-1">💡 Peringatan penting</p>
        <ul className="space-y-1 list-disc list-inside text-blue-600">
          <li>Semak masa/jarak dua kali sebelum klik <strong>Sahkan</strong> — keputusan terus terpapar kepada awam</li>
          <li>Atlet tidak hadir jangan dibiar kosong — tanda <strong>DNS</strong></li>
          <li>Ada masalah teknikal? Hubungi <strong>urus setia</strong> atau admin sistem</li>
        </ul>
      </div>

    </div>
  )
}
