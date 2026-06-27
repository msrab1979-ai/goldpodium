import { Link } from 'react-router-dom'

const CIRI = [
  {
    no: '01',
    icon: '📖',
    tajuk: 'Buku Kejohanan Auto Jana',
    hurai: 'Jadual, start list & keputusan terkumpul dalam satu PDF profesional. Tiada taip manual.',
    warna: 'from-blue-500 to-blue-700',
    bg: 'bg-blue-50',
    teks: 'text-blue-700',
  },
  {
    no: '02',
    icon: '🎓',
    tajuk: 'E-Sijil Auto Jana',
    hurai: 'Sijil pencapaian dijana automatik dari keputusan rasmi. Upload template, sistem isi nama.',
    warna: 'from-amber-500 to-orange-600',
    bg: 'bg-amber-50',
    teks: 'text-amber-700',
  },
  {
    no: '03',
    icon: '🥇',
    tajuk: 'Atlet Terbaik Auto Pilih',
    hurai: 'Sistem kira mata & pingat automatik. Cadangan Atlet Terbaik L & P terus tersedia.',
    warna: 'from-yellow-500 to-yellow-600',
    bg: 'bg-yellow-50',
    teks: 'text-yellow-700',
  },
  {
    no: '04',
    icon: '⚡',
    tajuk: 'Laju & Stabil',
    hurai: 'Ramai pencatat input serentak tanpa lag. Data segerak masa nyata atas Firebase.',
    warna: 'from-green-500 to-emerald-600',
    bg: 'bg-green-50',
    teks: 'text-green-700',
  },
  {
    no: '05',
    icon: '📊',
    tajuk: 'Keputusan Rasmi di Home',
    hurai: 'Ibu bapa & pegawai semak keputusan terkini dari telefon — langsung dari padang.',
    warna: 'from-cyan-500 to-blue-600',
    bg: 'bg-cyan-50',
    teks: 'text-cyan-700',
  },
  {
    no: '06',
    icon: '✍️',
    tajuk: 'Kemudahan Pencatat',
    hurai: 'Antara muka satu tangan di padang. Input masa, kedudukan & DNS/DNF dengan pantas.',
    warna: 'from-purple-500 to-violet-600',
    bg: 'bg-purple-50',
    teks: 'text-purple-700',
  },
  {
    no: '07',
    icon: '🏆',
    tajuk: 'Auto Trigger Rekod + Badge RBK',
    hurai: 'Rekod pecah dikesan automatik semasa keputusan dihantar. Badge RBK terpapar di Home.',
    warna: 'from-red-500 to-rose-600',
    bg: 'bg-red-50',
    teks: 'text-red-700',
  },
]


export default function Landing() {
  const NO_WA  = '60199761693'
  const MSG_WA = encodeURIComponent('Assalamualaikum, saya berminat dengan sistem Gold Podium untuk sekolah saya.')
  const URL_WA = `https://wa.me/${NO_WA}?text=${MSG_WA}`

  return (
    <div className="min-h-screen bg-white font-sans">

      {/* ── NAV ── */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[#003399] rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </div>
            <span className="font-black text-[#003399] tracking-wider text-sm">GOLD PODIUM</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/demo" className="text-xs font-semibold text-gray-500 hover:text-gray-800 px-3 py-2 rounded-lg transition-colors hidden sm:block">
              Demo
            </Link>
            <a href={URL_WA} target="_blank" rel="noreferrer"
              className="text-xs font-semibold text-gray-600 hover:text-gray-900 px-3 py-2 rounded-lg transition-colors hidden sm:block">
              WhatsApp
            </a>
            <Link to="/login"
              className="text-xs font-bold text-white bg-[#003399] hover:bg-[#002277] px-4 py-2 rounded-lg transition-colors shadow-sm">
              Log Masuk
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="pt-20 bg-[#003399] text-white overflow-hidden relative">
        {/* decorative circles */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-yellow-400/10 rounded-full translate-y-1/2 -translate-x-1/4 pointer-events-none" />

        <div className="max-w-6xl mx-auto px-5 pt-16 pb-0 relative">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-yellow-400/20 border border-yellow-400/30 text-yellow-300 text-[11px] font-bold px-3 py-1.5 rounded-full mb-6 tracking-wide">
              🏃 Dibina Khas untuk Kejohanan Olahraga Sekolah
            </div>
            <h1 className="text-4xl sm:text-6xl font-black leading-[1.1] mb-5">
              Urus Kejohanan<br />
              <span className="text-yellow-400">Olahraga</span> dengan<br />
              Lebih Profesional
            </h1>
            <p className="text-base sm:text-lg text-white/70 mb-8 max-w-lg leading-relaxed">
              Dari pendaftaran atlet hingga keputusan rasmi, sijil dan rekod kejohanan —
              <strong className="text-white"> semua automatik.</strong> Tanpa kertas. Tanpa kesilapan.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mb-12">
              <Link to="/demo"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 bg-yellow-400 hover:bg-yellow-300 text-[#003399] font-black rounded-xl text-sm transition-all shadow-xl hover:shadow-yellow-400/30 hover:-translate-y-0.5">
                Cuba Demo Percuma →
              </Link>
              <a href={URL_WA} target="_blank" rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold rounded-xl text-sm transition-all">
                <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
                Hubungi via WhatsApp
              </a>
            </div>
          </div>

          {/* stat bar */}
          <div className="border-t border-white/10 grid grid-cols-3 divide-x divide-white/10">
            {[
              { nilai: '100%', label: 'Auto — tiada input manual' },
              { nilai: 'Masa Nyata', label: 'Keputusan langsung di telefon' },
              { nilai: '7 Ciri', label: 'Eksklusif sistem olahraga' },
            ].map(s => (
              <div key={s.label} className="px-6 py-5 text-center">
                <p className="text-xl sm:text-2xl font-black text-yellow-400">{s.nilai}</p>
                <p className="text-[11px] text-white/50 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES — alternating rows ── */}
      <section className="py-20 px-5 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[10px] font-bold text-[#003399] uppercase tracking-widest mb-2">Mengapa Gold Podium?</p>
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900">7 Ciri yang <span className="text-[#003399]">Mengubah</span> Cara Anda Urus Kejohanan</h2>
          </div>

          <div className="space-y-4">
            {/* Row 1 — 3 kad */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {CIRI.slice(0, 3).map(c => (
                <KadCiri key={c.no} c={c} />
              ))}
            </div>
            {/* Row 2 — featured wide + 1 */}
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
              <div className="sm:col-span-3">
                <KadCiriWide c={CIRI[3]} />
              </div>
              <div className="sm:col-span-2">
                <KadCiri c={CIRI[4]} tall />
              </div>
            </div>
            {/* Row 3 — 1 wide + 1 */}
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
              <div className="sm:col-span-2">
                <KadCiri c={CIRI[5]} tall />
              </div>
              <div className="sm:col-span-3">
                <KadCiriHighlight c={CIRI[6]} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SOCIAL PROOF banner ── */}
      <section className="bg-[#003399] py-10 px-5">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6 text-white">
          <div>
            <p className="text-2xl font-black">Sistem yang Telah Diuji di Padang Sebenar</p>
            <p className="text-white/60 text-sm mt-1">Bukan prototaip. Bukan konsep. Sistem aktif digunakan dalam kejohanan MSSD.</p>
          </div>
          <Link to="/demo"
            className="shrink-0 px-7 py-3.5 bg-yellow-400 hover:bg-yellow-300 text-[#003399] font-black rounded-xl text-sm transition-all shadow-lg whitespace-nowrap">
            Cuba Demo →
          </Link>
        </div>
      </section>

      {/* ── HARGA — WA CTA ── */}
      <section className="py-20 px-5 bg-gray-50" id="harga">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-[10px] font-bold text-[#003399] uppercase tracking-widest mb-3">Harga Langganan</p>
          <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-4">
            Harga Mengikut<br className="sm:hidden" /> <span className="text-[#003399]">Keperluan Anda</span>
          </h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-10 max-w-lg mx-auto">
            Setiap sekolah dan kejohanan berbeza. Hubungi kami terus via WhatsApp —
            kami akan cadangkan pakej yang paling sesuai untuk anda.
          </p>

          {/* WA card */}
          <div className="bg-white border-2 border-green-200 rounded-2xl p-8 shadow-sm max-w-md mx-auto mb-8">
            <div className="w-14 h-14 bg-green-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
              </svg>
            </div>
            <h3 className="text-lg font-black text-gray-900 mb-1">Bincang Terus dengan Kami</h3>
            <p className="text-sm text-gray-500 mb-6">Balas dalam masa 24 jam. Tiada komitmen diperlukan.</p>
            <a
              href={`https://wa.me/${NO_WA}?text=${encodeURIComponent('Assalamualaikum, saya berminat dengan sistem Gold Podium. Boleh saya tahu pakej dan harga yang sesuai untuk sekolah saya?')}`}
              target="_blank" rel="noreferrer"
              className="w-full inline-flex items-center justify-center gap-2.5 bg-green-500 hover:bg-green-600 text-white font-black py-4 rounded-xl text-sm transition-all shadow-lg hover:shadow-green-200 hover:-translate-y-0.5">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
              </svg>
              WhatsApp Sekarang
            </a>
          </div>

          {/* trust chips */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {['✅ Tiada kontrak panjang','✅ Harga berpatutan','✅ Sokongan penuh disediakan'].map(t => (
              <span key={t} className="text-xs text-gray-500 bg-white border border-gray-200 px-3 py-1.5 rounded-full">{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="py-20 px-5 bg-[#003399] text-center relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-72 h-72 bg-white/5 rounded-full translate-x-1/3 -translate-y-1/3" />
          <div className="absolute bottom-0 left-0 w-56 h-56 bg-yellow-400/10 rounded-full -translate-x-1/4 translate-y-1/4" />
        </div>
        <div className="max-w-xl mx-auto relative">
          <div className="text-5xl mb-5">🏆</div>
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-3">
            Bersedia Bawa Kejohanan<br />Anda ke Tahap Seterusnya?
          </h2>
          <p className="text-sm text-white/60 mb-8 leading-relaxed">
            Ribuan atlet, puluhan acara — semua terurus dalam satu sistem yang pantas dan stabil.
          </p>
          <Link to="/demo"
            className="inline-flex items-center gap-2 px-10 py-4 bg-yellow-400 hover:bg-yellow-300 text-[#003399] font-black rounded-xl text-sm transition-all shadow-2xl hover:shadow-yellow-400/30 hover:-translate-y-1">
            Cuba Demo Percuma — Percuma Sepenuhnya →
          </Link>
          <p className="text-white/40 text-xs mt-4">Tiada pendaftaran. Tiada kad kredit.</p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="py-6 px-5 bg-gray-900 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-5 h-5 bg-[#003399] rounded flex items-center justify-center">
            <svg className="w-3 h-3 text-yellow-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </div>
          <span className="text-xs font-black text-white tracking-wider">GOLD PODIUM</span>
        </div>
        <p className="text-xs text-gray-500">
          © {new Date().getFullYear()} Gold Podium · Sistem Pengurusan Kejohanan Olahraga ·{' '}
          <a href={URL_WA} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-white transition-colors">
            Sokongan WhatsApp
          </a>
        </p>
      </footer>
    </div>
  )
}

function KadCiri({ c, tall }) {
  return (
    <div className={`bg-gray-50 border border-gray-100 rounded-2xl p-6 hover:shadow-lg transition-all hover:-translate-y-0.5 ${tall ? 'h-full' : ''}`}>
      <div className={`inline-flex items-center justify-center w-11 h-11 rounded-xl text-xl mb-4 ${c.bg}`}>
        {c.icon}
      </div>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${c.bg} ${c.teks}`}>{c.no}</span>
        <h3 className="text-sm font-bold text-gray-900">{c.tajuk}</h3>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">{c.hurai}</p>
    </div>
  )
}

function KadCiriWide({ c }) {
  return (
    <div className={`rounded-2xl p-7 h-full bg-gradient-to-br ${c.warna} text-white hover:shadow-xl transition-all hover:-translate-y-0.5`}>
      <div className="text-3xl mb-4">{c.icon}</div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[9px] font-black bg-white/20 px-2 py-0.5 rounded-full">{c.no}</span>
        <h3 className="text-base font-bold">{c.tajuk}</h3>
      </div>
      <p className="text-sm text-white/80 leading-relaxed">{c.hurai}</p>
    </div>
  )
}

function KadCiriHighlight({ c }) {
  return (
    <div className="rounded-2xl p-7 h-full bg-gray-900 text-white hover:shadow-xl transition-all hover:-translate-y-0.5 relative overflow-hidden">
      <div className="absolute top-0 right-0 text-8xl opacity-10 leading-none">{c.icon}</div>
      <div className="relative">
        <div className="text-3xl mb-4">{c.icon}</div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[9px] font-black bg-red-500 text-white px-2 py-0.5 rounded-full">{c.no}</span>
          <h3 className="text-base font-bold">{c.tajuk}</h3>
        </div>
        <p className="text-sm text-white/70 leading-relaxed">{c.hurai}</p>
        <div className="mt-4 inline-flex items-center gap-1.5 bg-red-500/20 border border-red-500/30 text-red-300 text-[10px] font-bold px-3 py-1.5 rounded-full">
          🔴 LIVE — Aktif semasa kejohanan berlangsung
        </div>
      </div>
    </div>
  )
}
