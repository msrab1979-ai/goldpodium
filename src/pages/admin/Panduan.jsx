import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'

const TABS = [
  { id: 'setup',          label: 'Setup',               icon: '⚙️' },
  { id: 'pendaftaran',    label: 'Pendaftaran',          icon: '👥' },
  { id: 'pertandingan',   label: 'Hari Pertandingan',    icon: '🏃' },
  { id: 'hadiah',         label: 'Hadiah & Laporan',     icon: '🏆' },
  { id: 'tetapan',        label: 'Tetapan Lanjutan',     icon: '🔧' },
]

// path: null = tanpa kejId, string = sub-path dalam /admin/kejohanan/:id/...
// adminPath: string = path terus /admin/...
const LANGKAH = {
  setup: [
    {
      no: '1',
      tajuk: 'Bina Kejohanan',
      penerangan: 'Cipta rekod kejohanan baru — nama, tarikh, peringkat (sekolah/daerah/negeri/kebangsaan) dan status.',
      perlu: ['Nama kejohanan', 'Tarikh mula & tamat', 'Peringkat kejohanan'],
      adminPath: '/admin/kejohanan-setup',
      label: 'Pergi ke Kejohanan',
    },
    {
      no: '2',
      tajuk: 'Daftar Sekolah / Pasukan',
      penerangan: 'Masukkan senarai sekolah atau pasukan yang akan menyertai kejohanan ini.',
      perlu: ['Kod sekolah (unik)', 'Nama sekolah penuh'],
      adminPath: '/admin/sekolah',
      label: 'Pergi ke Sekolah',
    },
    {
      no: '3',
      tajuk: 'Setup Kategori',
      penerangan: 'Tetapkan kategori peserta seperti A, B, C, D, Veteran. Kategori ini akan digunakan semasa daftar acara dan atlet.',
      perlu: ['Kod kategori', 'Label kategori'],
      kejPath: 'kategori',
      label: 'Pergi ke Kategori',
    },
    {
      no: '4',
      tajuk: 'Setup Acara',
      penerangan: 'Senaraikan semua acara — 100m, Lompat Jauh, Relay 4×100m, dll. Tetapkan jantina, kategori, peringkat (Saringan QF/SF, Final) dan bilangan lorong.',
      perlu: ['Nama acara', 'Jantina', 'Kategori', 'Peringkat (QF/SF/Final)', 'Bilangan lorong'],
      kejPath: 'acara',
      label: 'Pergi ke Acara',
    },
    {
      no: '5',
      tajuk: 'Tetapkan Jadual',
      penerangan: 'Masukkan waktu dan lokasi untuk setiap acara. Jadual akan dipaparkan dalam halaman awam dan PDF start list.',
      perlu: ['Tarikh acara', 'Masa mula', 'Lokasi/gelanggang'],
      kejPath: 'acara',
      label: 'Pergi ke Jadual Acara',
    },
  ],
  pendaftaran: [
    {
      no: '6',
      tajuk: 'Daftar Atlet',
      penerangan: 'Masukkan data atlet — nama, No. Bib, sekolah dan kategori. No. Bib mestilah unik dalam satu kejohanan.',
      perlu: ['Nama atlet', 'No. Bib', 'Sekolah', 'Kategori'],
      kejPath: 'pendaftaran',
      label: 'Pergi ke Pendaftaran',
    },
    {
      no: '7',
      tajuk: 'Daftarkan Atlet ke Acara',
      penerangan: 'Assign setiap atlet kepada acara yang mereka akan sertai. Seorang atlet boleh menyertai lebih dari satu acara.',
      perlu: ['Atlet sudah didaftar (Langkah 6)', 'Acara sudah dibina (Langkah 4)'],
      kejPath: 'pendaftaran',
      label: 'Pergi ke Pendaftaran',
    },
    {
      no: '8',
      tajuk: 'Semak & Sahkan Pendaftaran',
      penerangan: 'Semak senarai pendaftaran per sekolah. Sahkan supaya Pengurus Pasukan tidak boleh ubah lagi selepas tarikh tutup.',
      perlu: ['Pendaftaran atlet ke acara selesai'],
      adminPath: '/admin/analisis-pendaftaran',
      label: 'Analisis Pendaftaran',
    },
  ],
  pertandingan: [
    {
      no: '9',
      tajuk: 'Jana Start List',
      penerangan: 'Jana heat secara automatik — sistem akan bahagikan atlet ke heat, elak atlet sekolah sama dalam heat yang sama, dan assign lorong mengikut piawai WA.',
      perlu: ['Pendaftaran atlet ke acara selesai', 'Bilangan lorong ditetapkan dalam Acara'],
      kejPath: 'startlist',
      label: 'Pergi ke Start List',
    },
    {
      no: '10',
      tajuk: 'Cetak Start List (PDF)',
      penerangan: 'Cetak start list dalam format 4 salinan (Juruhebah / Call Room / Teknikal / Fail). Padang dalam format landscape.',
      perlu: ['Heat sudah dijana (Langkah 9)'],
      kejPath: 'startlist',
      label: 'Pergi ke Start List',
    },
    {
      no: '11',
      tajuk: 'Input Keputusan',
      penerangan: 'Pencatat masukkan masa, jarak atau ketinggian untuk setiap atlet. Sistem auto-kira kedudukan dan kenal pasti atlet layak ke peringkat seterusnya.',
      perlu: ['Start list sudah dijana'],
      kejPath: 'keputusan',
      label: 'Pergi ke Keputusan',
    },
    {
      no: '12',
      tajuk: 'Jana Separuh Akhir / Final',
      penerangan: 'Selepas semua heat saringan selesai dan disahkan, sistem akan pilih finalis mengikut bestHeat + bestTime (wildcard) dan jana heat seterusnya secara automatik.',
      perlu: ['Semua heat saringan disahkan (Rasmi)', 'Tetapan Finalis dikonfigurasi (pilihan)'],
      kejPath: 'startlist',
      label: 'Pergi ke Start List',
    },
  ],
  hadiah: [
    {
      no: '13',
      tajuk: 'Semak Rekod Pecah',
      penerangan: 'Sistem akan kesan secara automatik jika rekod sekolah/daerah/negeri/kebangsaan dipecahkan. Semak tuntutan rekod dan sahkan.',
      perlu: ['Keputusan disahkan Rasmi'],
      adminPath: '/admin/rekod',
      label: 'Pergi ke Rekod',
    },
    {
      no: '14',
      tajuk: 'Medal Tally',
      penerangan: 'Paparan kedudukan sekolah mengikut bilangan pingat emas, perak dan gangsa. Dikira automatik selepas keputusan disahkan.',
      kejPath: 'medal',
      label: 'Pergi ke Medal Tally',
    },
    {
      no: '15',
      tajuk: 'Buku Kejohanan (PDF)',
      penerangan: 'Jana PDF buku kejohanan lengkap — semua keputusan, medal tally dan rekod dalam satu dokumen rasmi.',
      adminPath: '/admin/buku-kejohanan',
      label: 'Pergi ke Buku Kejohanan',
    },
    {
      no: '16',
      tajuk: 'Sijil Pemenang',
      penerangan: 'Setup template sijil pencapaian dan muat turun sijil untuk setiap pemenang. Pengurus Pasukan boleh muat turun terus dari portal mereka.',
      adminPath: '/admin/esijil-pencapaian',
      label: 'Setup Sijil Pencapaian',
    },
    {
      no: '17',
      tajuk: 'Sijil Penyertaan',
      penerangan: 'Setup template sijil penyertaan untuk semua atlet yang telah mendaftar. Boleh dimuat turun oleh Pengurus Pasukan.',
      adminPath: '/admin/esijil',
      label: 'Setup Sijil Penyertaan',
    },
  ],
  tetapan: [
    {
      no: '18',
      tajuk: 'Tetapan Finalis (bestHeat / bestTime)',
      penerangan: 'Konfigurasi bilangan atlet layak dari setiap heat (bestHeat) dan bilangan wildcard masa terbaik (bestTime). Boleh override per acara.',
      perlu: ['Acara sudah dibina'],
      adminPath: '/admin/tetapan',
      label: 'Pergi ke Tetapan',
    },
    {
      no: '19',
      tajuk: 'Tetapan Lorong WA',
      penerangan: 'Konfigurasi kumpulan lorong untuk undian final mengikut piawai WA — lurus, dua ratus, selekoh, 800m. Boleh customise per kejohanan.',
      adminPath: '/admin/tetapan',
      label: 'Pergi ke Tetapan',
    },
    {
      no: '20',
      tajuk: 'Pengurusan Pengguna',
      penerangan: 'Tambah atau urus akaun pengguna — Admin, Pencatat dan Pengurus Pasukan. Setiap rol mempunyai akses yang berbeza.',
      adminPath: '/admin/pengguna',
      label: 'Pergi ke Pengguna',
    },
    {
      no: '21',
      tajuk: 'Backup Data',
      penerangan: 'Eksport data kejohanan sebagai JSON untuk simpanan atau pemulihan. Digalakkan dibuat selepas kejohanan selesai.',
      adminPath: '/admin/backup',
      label: 'Pergi ke Backup',
    },
  ],
}

export default function Panduan() {
  const [tab, setTab] = useState('setup')
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
        <p className="text-sm text-gray-500 mt-0.5">Ikut langkah-langkah ini untuk setup dan kendalikan kejohanan dari mula hingga selesai.</p>
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
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              tab === t.id ? 'bg-[#003399]/10 text-[#003399]' : 'bg-gray-200 text-gray-400'
            }`}>{LANGKAH[t.id]?.length}</span>
          </button>
        ))}
      </div>

      {/* Langkah-langkah */}
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

                {l.perlu && l.perlu.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Perlu sedia:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {l.perlu.map((item, i) => (
                        <span key={i} className="text-[10px] bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

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

      {/* Footer info */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-700">
        <p className="font-bold mb-1">Tips untuk tenant baru</p>
        <ul className="space-y-1 list-disc list-inside text-blue-600">
          <li>Mulakan dari tab <strong>Setup</strong> — jangan skip langkah</li>
          <li>Selesaikan semua setup sebelum buka pendaftaran kepada Pengurus Pasukan</li>
          <li>Tetapan Lanjutan (lorong WA, finalis) boleh ditinggalkan dulu — sistem guna nilai default</li>
          <li>Hubungi sokongan jika ada masalah teknikal</li>
        </ul>
      </div>

    </div>
  )
}
