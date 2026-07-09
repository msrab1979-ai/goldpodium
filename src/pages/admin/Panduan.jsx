import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import Visual from '../../components/PanduanVisual'

const TABS = [
  { id: 'menu',           label: 'Menu Sistem',          icon: '🗂️' },
  { id: 'setup',          label: '1 · Setup',            icon: '⚙️' },
  { id: 'pendaftaran',    label: '2 · Pendaftaran',      icon: '👥' },
  { id: 'pertandingan',   label: '3 · Hari Pertandingan', icon: '🏃' },
  { id: 'hadiah',         label: '4 · Hadiah & Laporan', icon: '🏆' },
  { id: 'tetapan',        label: 'Tetapan Lanjutan',     icon: '🔧' },
]

/* ============================================================
   TAB MENU SISTEM — penerangan ringkas setiap menu sidebar
   ============================================================ */
const MENU_SISTEM = [
  {
    group: 'Utama',
    items: [
      { icon: '🏠', nama: 'Dashboard', apa: 'Muka depan admin. Lihat ringkasan kejohanan sepintas lalu.' },
      { icon: '📖', nama: 'Panduan', apa: 'Halaman ini — panduan langkah demi langkah.' },
      { icon: '🏆', nama: 'Kejohanan', apa: 'Bina kejohanan baru. Ini langkah PERTAMA anda.' },
      { icon: '⚙️', nama: 'Tetapan', apa: 'Logo, nama sekolah, tab halaman awam, pautan WhatsApp/Telegram.' },
    ],
  },
  {
    group: 'Pengurusan',
    items: [
      { icon: '🏫', nama: 'Daftar Sekolah', apa: 'Senarai sekolah/pasukan yang bertanding.' },
      { icon: '🏷️', nama: 'Setup Kategori', apa: 'Kategori umur peserta — contoh: L12, P12, L10.' },
      { icon: '📅', nama: 'Acara & Jadual', apa: 'Senarai acara (100m, Lompat Jauh...) dan waktu perlawanan.' },
      { icon: '📋', nama: 'Start List', apa: 'Jana heat & lorong automatik. Cetak PDF start list.' },
      { icon: '✅', nama: 'Pengesahan Peserta', apa: 'Semak sekolah mana sudah sahkan pendaftaran.' },
      { icon: '👤', nama: 'Pengguna', apa: 'Cipta akaun Pencatat (kod akses + PIN).' },
      { icon: '📝', nama: 'Pendaftaran', apa: 'Analisis pendaftaran atlet semua sekolah.' },
      { icon: '🎖️', nama: 'Rekod', apa: 'Rekod kejohanan. Sahkan tuntutan bila rekod dipecahkan.' },
      { icon: '🥇', nama: 'Atlet Terbaik', apa: 'Kiraan mata olahragawan/olahragawati.' },
    ],
  },
  {
    group: 'Cetakan',
    items: [
      { icon: '📖', nama: 'Buku Kejohanan', apa: 'PDF lengkap — semua keputusan, medal tally, rekod.' },
      { icon: '🖨️', nama: 'Cetak Acara', apa: 'Cetak senarai acara & peserta.' },
      { icon: '📄', nama: 'Cetak Keputusan', apa: 'Cetak keputusan rasmi setiap acara.' },
    ],
  },
  {
    group: 'Sijil',
    items: [
      { icon: '🎓', nama: 'Sijil Penyertaan', apa: 'Template sijil untuk SEMUA atlet berdaftar.' },
      { icon: '🏆', nama: 'Setup Sijil Pencapaian', apa: 'Template sijil untuk pemenang (tempat 1-2-3).' },
      { icon: '📚', nama: 'Kongsi Buku', apa: 'Kongsi dokumen/buku program kepada Pengurus Pasukan.' },
      { icon: '⬇️', nama: 'Muat Turun Sijil', apa: 'Admin muat turun sijil bagi pihak sekolah.' },
    ],
  },
  {
    group: 'Akses Pantas Home',
    items: [
      { icon: '⚡', nama: 'Akses Pantas Home', apa: 'Kad pintasan di halaman awam — galeri, buku program, dll. (maks 6).' },
    ],
  },
  {
    group: 'Sistem',
    items: [
      { icon: '💾', nama: 'Backup', apa: 'Simpan salinan data kejohanan. Buat selepas kejohanan tamat.' },
      { icon: '🩺', nama: 'Health Check', apa: 'Semak kesihatan data sistem.' },
      { icon: '🔄', nama: 'Reset Sistem', apa: '⚠️ Padam data. Guna dengan berhati-hati.' },
    ],
  },
]

/* ============================================================
   LANGKAH — path: adminPath = /admin/..., kejPath = ikut kejId
   ============================================================ */
const LANGKAH = {
  setup: [
    {
      no: '1',
      tajuk: 'Bina Kejohanan',
      penerangan: 'Cipta kejohanan baru. Semua data lain akan masuk di bawah kejohanan ini.',
      lokasi: 'Utama → Kejohanan',
      cara: ['Klik butang "+ Tambah Kejohanan"', 'Isi nama, tarikh dan peringkat (sekolah/daerah/negeri)', 'Klik Simpan'],
      visual: 'borang',
      adminPath: '/admin/kejohanan-setup',
      label: 'Pergi ke Kejohanan',
    },
    {
      no: '2',
      tajuk: 'Daftar Sekolah / Pasukan',
      penerangan: 'Masukkan senarai sekolah atau rumah sukan yang bertanding.',
      lokasi: 'Pengurusan → Daftar Sekolah',
      cara: ['Klik "+ Tambah Sekolah"', 'Isi kod sekolah (unik) dan nama penuh', 'Ulang untuk semua sekolah — atau import Excel'],
      visual: 'senarai',
      adminPath: '/admin/sekolah',
      label: 'Pergi ke Daftar Sekolah',
    },
    {
      no: '3',
      tajuk: 'Setup Kategori',
      penerangan: 'Tetapkan kategori umur. Contoh: L12, P12, L10, P10.',
      lokasi: 'Pengurusan → Setup Kategori',
      cara: ['Klik "+ Tambah Kategori"', 'Isi kod dan nama kategori', 'Simpan'],
      visual: 'senarai',
      kejPath: 'kategori',
      label: 'Pergi ke Kategori',
    },
    {
      no: '4',
      tajuk: 'Setup Acara',
      penerangan: 'Senaraikan semua acara — 100m, Lompat Jauh, 4×100m dan lain-lain.',
      lokasi: 'Pengurusan → Acara & Jadual',
      cara: ['Klik "+ Tambah Acara"', 'Pilih jantina, kategori dan jenis peringkat (Saringan / Terus Final)', 'Tetapkan bilangan lorong jika perlu'],
      visual: 'senarai',
      kejPath: 'acara',
      label: 'Pergi ke Acara',
    },
    {
      no: '5',
      tajuk: 'Susun Jadual',
      penerangan: 'Tetapkan tarikh, masa dan lokasi setiap acara. Jadual akan terpapar di halaman awam.',
      lokasi: 'Pengurusan → Acara & Jadual',
      cara: ['Pilih acara', 'Isi tarikh, masa dan lokasi', 'Simpan — halaman awam terus dikemas kini'],
      visual: 'borang',
      adminPath: '/admin/jadual',
      label: 'Pergi ke Jadual',
    },
  ],
  pendaftaran: [
    {
      no: '6',
      tajuk: 'Daftar Atlet',
      penerangan: 'Masukkan data atlet. Pengurus Pasukan juga boleh daftar sendiri melalui portal mereka.',
      lokasi: 'Kejohanan → Pendaftaran',
      cara: ['Isi nama, No. Bib, sekolah dan kategori', 'No. Bib mesti unik dalam satu kejohanan', 'Boleh import ramai serentak guna Excel'],
      visual: 'senarai',
      kejPath: 'pendaftaran',
      label: 'Pergi ke Pendaftaran',
    },
    {
      no: '7',
      tajuk: 'Daftar Atlet ke Acara',
      penerangan: 'Pilih acara untuk setiap atlet. Seorang atlet boleh sertai lebih dari satu acara.',
      lokasi: 'Kejohanan → Pendaftaran',
      cara: ['Pilih atlet', 'Tandakan acara yang disertai', 'Simpan'],
      visual: 'semak',
      kejPath: 'pendaftaran',
      label: 'Pergi ke Pendaftaran',
    },
    {
      no: '8',
      tajuk: 'Semak Pendaftaran',
      penerangan: 'Lihat jumlah atlet dan acara setiap sekolah. Pastikan tiada yang tertinggal.',
      lokasi: 'Pengurusan → Pendaftaran',
      cara: ['Buka Analisis Pendaftaran', 'Semak bilangan atlet setiap sekolah', 'Hubungi sekolah yang belum lengkap'],
      visual: 'semak',
      adminPath: '/admin/analisis-pendaftaran',
      label: 'Analisis Pendaftaran',
    },
    {
      no: '9',
      tajuk: 'Pengesahan Peserta',
      penerangan: 'Pantau sekolah mana sudah sahkan penyertaan. Selepas sah, Pengurus Pasukan tidak boleh ubah lagi.',
      lokasi: 'Pengurusan → Pengesahan Peserta',
      cara: ['Lihat senarai sekolah — hijau = sudah sah', 'Boleh buka kunci semula (bypass) jika sekolah perlu betulkan data', 'Cetak PDF status pengesahan'],
      visual: 'semak',
      kejPath: 'pengesahan-peserta',
      label: 'Pergi ke Pengesahan',
    },
  ],
  pertandingan: [
    {
      no: '10',
      tajuk: 'Jana Start List',
      penerangan: 'Sistem bahagikan atlet ke heat dan susun lorong secara automatik.',
      lokasi: 'Pengurusan → Start List',
      cara: ['Pilih acara di panel kiri', 'Klik "Jana Heat"', 'Sistem elak atlet sekolah sama dalam heat yang sama'],
      visual: 'duaPanel',
      kejPath: 'startlist',
      label: 'Pergi ke Start List',
    },
    {
      no: '11',
      tajuk: 'Cetak Start List (PDF)',
      penerangan: 'Cetak 4 salinan — Juruhebah, Call Room, Teknikal dan Fail.',
      lokasi: 'Pengurusan → Start List',
      cara: ['Pilih acara yang sudah dijana', 'Klik "Cetak"', 'PDF terus dimuat turun'],
      visual: 'pdf',
      kejPath: 'startlist',
      label: 'Pergi ke Start List',
    },
    {
      no: '12',
      tajuk: 'Input Keputusan',
      penerangan: 'Masukkan masa/jarak setiap atlet. Sistem kira kedudukan secara automatik.',
      lokasi: 'Kejohanan → Keputusan (atau login Pencatat)',
      cara: ['Pilih heat', 'Isi masa atau jarak setiap atlet', 'Klik "Sahkan Rasmi" — medal tally & rekod dikira automatik'],
      visual: 'masa',
      kejPath: 'keputusan',
      label: 'Pergi ke Keputusan',
    },
    {
      no: '13',
      tajuk: 'Jana Separuh Akhir / Final',
      penerangan: 'Selepas semua heat saringan rasmi, sistem pilih finalis dan jana peringkat seterusnya.',
      lokasi: 'Pengurusan → Start List',
      cara: ['Pastikan semua heat saringan sudah "Rasmi"', 'Butang "Jana Final" akan muncul — klik', 'Semak senarai finalis, kemudian sahkan'],
      visual: 'duaPanel',
      kejPath: 'startlist',
      label: 'Pergi ke Start List',
    },
  ],
  hadiah: [
    {
      no: '14',
      tajuk: 'Sahkan Rekod Pecah',
      penerangan: 'Sistem kesan rekod pecah secara automatik. Anda hanya perlu semak dan sahkan.',
      lokasi: 'Pengurusan → Rekod',
      cara: ['Buka tab "Tuntutan"', 'Semak prestasi lama vs baru', 'Klik Sahkan — rekod baru berkuat kuasa'],
      visual: 'semak',
      adminPath: '/admin/rekod',
      label: 'Pergi ke Rekod',
    },
    {
      no: '15',
      tajuk: 'Medal Tally',
      penerangan: 'Kedudukan sekolah ikut pingat. Dikira automatik — tak perlu buat apa-apa.',
      lokasi: 'Kejohanan → Medal Tally',
      cara: ['Buka untuk semak sahaja', 'Terpapar juga di halaman awam secara langsung'],
      visual: 'medal',
      kejPath: 'medal',
      label: 'Pergi ke Medal Tally',
    },
    {
      no: '16',
      tajuk: 'Buku Kejohanan (PDF)',
      penerangan: 'Satu PDF lengkap — semua keputusan, medal tally dan rekod.',
      lokasi: 'Cetakan → Buku Kejohanan',
      cara: ['Pilih kejohanan', 'Klik Jana PDF', 'Sesuai untuk laporan rasmi & simpanan'],
      visual: 'pdf',
      adminPath: '/admin/buku-kejohanan',
      label: 'Pergi ke Buku Kejohanan',
    },
    {
      no: '17',
      tajuk: 'Sijil Pencapaian (Pemenang)',
      penerangan: 'Upload template sijil, susun kedudukan teks. Pengurus Pasukan muat turun sendiri.',
      lokasi: 'Sijil → Setup Sijil Pencapaian',
      cara: ['Upload gambar template sijil', 'Seret kedudukan nama, acara dan tempat', 'Tetapkan had kedudukan (contoh: tempat 1–3)'],
      visual: 'sijil',
      adminPath: '/admin/esijil-pencapaian',
      label: 'Setup Sijil Pencapaian',
    },
    {
      no: '18',
      tajuk: 'Sijil Penyertaan (Semua Atlet)',
      penerangan: 'Sijil untuk SEMUA atlet berdaftar — termasuk pemain simpanan.',
      lokasi: 'Sijil → Sijil Penyertaan',
      cara: ['Upload gambar template sijil', 'Seret kedudukan nama atlet', 'Pengurus Pasukan muat turun dari portal mereka'],
      visual: 'sijil',
      adminPath: '/admin/esijil',
      label: 'Setup Sijil Penyertaan',
    },
  ],
  tetapan: [
    {
      no: '19',
      tajuk: 'Tetapan Finalis',
      penerangan: 'Berapa atlet layak dari setiap heat ke final. Boleh biar default — sistem sudah ada nilai standard.',
      lokasi: 'Utama → Tetapan',
      cara: ['Set bilangan layak per heat (bestHeat)', 'Set bilangan wildcard masa terbaik (bestTime)', 'Boleh override untuk acara tertentu'],
      visual: 'toggle',
      adminPath: '/admin/tetapan',
      label: 'Pergi ke Tetapan',
    },
    {
      no: '20',
      tajuk: 'Tetapan Lorong',
      penerangan: 'Susunan lorong final ikut piawai World Athletics. Boleh biar default.',
      lokasi: 'Utama → Tetapan',
      cara: ['Pilih jenis trek (lurus / selekoh / 800m)', 'Sistem susun lorong automatik masa jana final'],
      visual: 'toggle',
      adminPath: '/admin/tetapan',
      label: 'Pergi ke Tetapan',
    },
    {
      no: '21',
      tajuk: 'Akaun Pencatat',
      penerangan: 'Cipta akaun untuk pencatat di padang — mereka login guna kod akses + PIN.',
      lokasi: 'Pengurusan → Pengguna',
      cara: ['Klik "+ Tambah Pengguna"', 'Pilih peranan Pencatat, set kod akses dan PIN 6 digit', 'Kongsi kod + PIN kepada pencatat'],
      visual: 'borang',
      adminPath: '/admin/pengguna',
      label: 'Pergi ke Pengguna',
    },
    {
      no: '22',
      tajuk: 'Backup Data',
      penerangan: 'Simpan salinan data kejohanan. Digalakkan selepas kejohanan tamat.',
      lokasi: 'Sistem → Backup',
      cara: ['Klik Eksport', 'Simpan fail di komputer anda'],
      visual: 'pdf',
      adminPath: '/admin/backup',
      label: 'Pergi ke Backup',
    },
  ],
}

export default function Panduan() {
  const [tab, setTab] = useState('menu')
  const { userData } = useAuth()
  const navigate = useNavigate()

  async function getKejId() {
    try {
      const kej = JSON.parse(sessionStorage.getItem('gp_kej_aktif') || '{}')
      if (kej.id) return kej.id
    } catch { /* langkau */ }
    const schoolId = userData?.schoolId || ''
    if (!schoolId) return null
    try {
      const snap = await getDocs(query(
        collection(db, 'tenants', schoolId, 'kejohanan'),
        where('statusKejohanan', 'in', ['aktif', 'persediaan', 'draf'])
      ))
      if (!snap.empty) {
        const d = snap.docs[0]
        sessionStorage.setItem('gp_kej_aktif', JSON.stringify({ id: d.id, namaKejohanan: d.data().namaKejohanan || '', schoolId }))
        return d.id
      }
    } catch { /* langkau */ }
    return null
  }

  async function handleNav(langkah) {
    if (langkah.adminPath) { navigate(langkah.adminPath); return }
    if (langkah.kejPath) {
      const id = await getKejId()
      if (id) navigate(`/admin/kejohanan/${id}/${langkah.kejPath}`)
      else navigate('/admin/kejohanan-setup')
    }
  }

  const langkahTab = LANGKAH[tab] || []

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Panduan Sistem</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Baru mula? Ikut tab <strong>1 → 2 → 3 → 4</strong> mengikut urutan. Tab <strong>Menu Sistem</strong> menerangkan fungsi setiap menu.
        </p>
      </div>

      {/* Tab */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              tab === t.id
                ? 'bg-white text-[#003399] shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
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
            Ini senarai semua menu di <strong>bar sisi kiri</strong> dan fungsinya. Menu disusun ikut kumpulan yang sama seperti dalam sistem.
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

                  {/* Lokasi menu */}
                  {l.lokasi && (
                    <div className="mt-2 inline-flex items-center gap-1.5 bg-gray-50 border border-gray-100 px-2.5 py-1 rounded-lg">
                      <span className="text-[10px]">📍</span>
                      <span className="text-[10px] font-semibold text-gray-600">Menu: {l.lokasi}</span>
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

                  {/* Ilustrasi skrin */}
                  {l.visual && <Visual jenis={l.visual} />}

                  <div className="mt-3">
                    <button
                      onClick={() => handleNav(l)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#003399] text-white text-xs font-semibold rounded-lg hover:bg-[#002288] transition-colors"
                    >
                      {l.label}
                      <span>→</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Garis sambung ke langkah seterusnya */}
              {idx < langkahTab.length - 1 && (
                <div className="ml-4 mt-3 pl-[18px] border-l-2 border-dashed border-gray-100 h-2" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Footer info */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-700">
        <p className="font-bold mb-1">💡 Tips untuk tenant baru</p>
        <ul className="space-y-1 list-disc list-inside text-blue-600">
          <li>Mulakan dari tab <strong>1 · Setup</strong> — ikut urutan, jangan langkau langkah</li>
          <li>Selesaikan semua setup dulu sebelum buka pendaftaran kepada Pengurus Pasukan</li>
          <li><strong>Tetapan Lanjutan</strong> boleh ditinggalkan — sistem sudah guna nilai standard</li>
          <li>Hubungi sokongan jika ada masalah teknikal</li>
        </ul>
      </div>

    </div>
  )
}
