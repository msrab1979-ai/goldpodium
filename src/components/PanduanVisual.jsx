/**
 * PanduanVisual — ilustrasi skrin mini (mockup CSS, tiada fail imej)
 * Dikongsi oleh Panduan admin + PanduanPP (Pengurus Pasukan)
 */

function BarisJadual({ lebar = ['w-16', 'w-24', 'w-10'], aktif = false }) {
  return (
    <div className={`flex items-center gap-2 px-2 py-1 rounded ${aktif ? 'bg-blue-50' : ''}`}>
      {lebar.map((w, i) => (
        <div key={i} className={`h-1.5 rounded-full ${aktif && i === 0 ? 'bg-blue-400' : 'bg-gray-200'} ${w}`} />
      ))}
    </div>
  )
}

export default function Visual({ jenis }) {
  const bingkai = 'bg-white border border-gray-200 rounded-lg p-2.5 w-full max-w-[240px]'
  const tajukBar = <div className="h-2 w-20 bg-[#003399]/70 rounded-full mb-2" />

  const isi = {
    /* Borang: isi maklumat + butang simpan */
    borang: (
      <div className={bingkai}>
        {tajukBar}
        {['w-full', 'w-3/4', 'w-1/2'].map((w, i) => (
          <div key={i} className="mb-1.5">
            <div className="h-1 w-10 bg-gray-300 rounded-full mb-0.5" />
            <div className={`h-4 ${w} bg-gray-100 border border-gray-200 rounded`} />
          </div>
        ))}
        <div className="flex justify-end mt-1">
          <div className="h-5 w-16 bg-[#003399] rounded flex items-center justify-center">
            <span className="text-[7px] text-white font-bold">SIMPAN ✓</span>
          </div>
        </div>
      </div>
    ),
    /* Senarai/jadual data */
    senarai: (
      <div className={bingkai}>
        {tajukBar}
        <div className="flex justify-end mb-1">
          <div className="h-4 w-14 bg-emerald-500 rounded flex items-center justify-center">
            <span className="text-[7px] text-white font-bold">+ TAMBAH</span>
          </div>
        </div>
        <BarisJadual aktif />
        <BarisJadual />
        <BarisJadual />
        <BarisJadual />
      </div>
    ),
    /* Senarai semak dengan tanda ✓ */
    semak: (
      <div className={bingkai}>
        {tajukBar}
        {[true, true, false].map((ok, i) => (
          <div key={i} className="flex items-center gap-2 px-2 py-1">
            <span className={`text-[9px] ${ok ? 'text-emerald-500' : 'text-amber-500'}`}>{ok ? '✅' : '⏳'}</span>
            <div className="h-1.5 w-24 bg-gray-200 rounded-full" />
            <span className={`text-[6px] font-bold px-1 rounded ${ok ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
              {ok ? 'SAH' : 'BELUM'}
            </span>
          </div>
        ))}
      </div>
    ),
    /* Start List 2 panel */
    duaPanel: (
      <div className={`${bingkai} flex gap-2`}>
        <div className="w-1/3 space-y-1">
          <div className="h-1.5 w-full bg-blue-300 rounded-full" />
          <div className="h-1.5 w-full bg-gray-200 rounded-full" />
          <div className="h-1.5 w-full bg-gray-200 rounded-full" />
          <div className="h-1.5 w-3/4 bg-gray-200 rounded-full" />
        </div>
        <div className="flex-1 border-l border-gray-100 pl-2">
          <div className="h-1.5 w-16 bg-gray-300 rounded-full mb-1.5" />
          <BarisJadual lebar={['w-4', 'w-16', 'w-6']} aktif />
          <BarisJadual lebar={['w-4', 'w-14', 'w-6']} />
          <BarisJadual lebar={['w-4', 'w-16', 'w-6']} />
          <div className="flex gap-1 mt-1.5">
            <div className="h-4 w-16 bg-[#003399] rounded flex items-center justify-center">
              <span className="text-[6px] text-white font-bold">JANA HEAT</span>
            </div>
            <div className="h-4 w-12 bg-gray-200 rounded flex items-center justify-center">
              <span className="text-[6px] text-gray-500 font-bold">CETAK</span>
            </div>
          </div>
        </div>
      </div>
    ),
    /* Input masa/keputusan */
    masa: (
      <div className={bingkai}>
        {tajukBar}
        {[['1', '11.25', '🥇'], ['2', '11.40', '🥈'], ['3', '11.52', '🥉']].map(([l, t, m], i) => (
          <div key={i} className="flex items-center gap-2 px-2 py-1">
            <span className="text-[8px] font-bold text-gray-400 w-3">{l}</span>
            <div className="h-1.5 w-16 bg-gray-200 rounded-full" />
            <div className="h-4 w-12 bg-blue-50 border border-blue-200 rounded flex items-center justify-center">
              <span className="text-[7px] font-mono text-blue-700">{t}</span>
            </div>
            <span className="text-[9px]">{m}</span>
          </div>
        ))}
        <div className="flex justify-end mt-1">
          <div className="h-4 w-16 bg-emerald-500 rounded flex items-center justify-center">
            <span className="text-[6px] text-white font-bold">SAHKAN ✓</span>
          </div>
        </div>
      </div>
    ),
    /* Medal tally / podium */
    medal: (
      <div className={bingkai}>
        {tajukBar}
        {[['SEK A', '5', '3', '1'], ['SEK B', '3', '4', '2'], ['SEK C', '2', '1', '4']].map(([n, e, p, g], i) => (
          <div key={i} className="flex items-center gap-2 px-2 py-1">
            <span className="text-[8px] font-bold text-gray-400 w-3">{i + 1}</span>
            <span className="text-[7px] font-bold text-gray-500 w-10">{n}</span>
            <span className="text-[7px]">🥇{e}</span>
            <span className="text-[7px]">🥈{p}</span>
            <span className="text-[7px]">🥉{g}</span>
          </div>
        ))}
      </div>
    ),
    /* PDF / dokumen */
    pdf: (
      <div className={`${bingkai} flex items-center gap-3`}>
        <div className="w-12 h-16 bg-gray-50 border border-gray-200 rounded shadow-sm p-1.5 shrink-0">
          <div className="h-1 w-full bg-red-300 rounded-full mb-1" />
          <div className="h-0.5 w-full bg-gray-200 rounded-full mb-0.5" />
          <div className="h-0.5 w-full bg-gray-200 rounded-full mb-0.5" />
          <div className="h-0.5 w-3/4 bg-gray-200 rounded-full mb-1" />
          <div className="h-0.5 w-full bg-gray-200 rounded-full mb-0.5" />
          <div className="h-0.5 w-full bg-gray-200 rounded-full" />
        </div>
        <div>
          <div className="text-[8px] font-bold text-gray-500 mb-1">📄 PDF sedia dimuat turun</div>
          <div className="h-5 w-20 bg-red-500 rounded flex items-center justify-center">
            <span className="text-[7px] text-white font-bold">⬇ MUAT TURUN</span>
          </div>
        </div>
      </div>
    ),
    /* Import Excel */
    excel: (
      <div className={`${bingkai} flex items-center gap-3`}>
        <div className="w-12 h-16 bg-emerald-50 border border-emerald-200 rounded shadow-sm p-1.5 shrink-0">
          <div className="h-1 w-full bg-emerald-400 rounded-full mb-1" />
          <div className="grid grid-cols-3 gap-0.5">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-1 bg-emerald-100 rounded-sm" />
            ))}
          </div>
        </div>
        <div>
          <div className="text-[8px] font-bold text-gray-500 mb-1">📊 Templat Excel</div>
          <div className="h-4 w-20 bg-emerald-600 rounded flex items-center justify-center mb-1">
            <span className="text-[6px] text-white font-bold">⬇ MUAT TURUN TEMPLAT</span>
          </div>
          <div className="h-4 w-20 bg-[#003399] rounded flex items-center justify-center">
            <span className="text-[6px] text-white font-bold">⬆ MUAT NAIK SEMULA</span>
          </div>
        </div>
      </div>
    ),
    /* Sijil */
    sijil: (
      <div className={`${bingkai} flex items-center gap-3`}>
        <div className="w-16 h-12 bg-amber-50 border-2 border-amber-300 rounded p-1 shrink-0 flex flex-col items-center justify-center">
          <span className="text-[8px]">🎓</span>
          <div className="h-0.5 w-10 bg-amber-300 rounded-full mt-1" />
          <div className="h-0.5 w-8 bg-amber-200 rounded-full mt-0.5" />
        </div>
        <div>
          <div className="text-[8px] font-bold text-gray-500 mb-1">Nama atlet dicetak automatik</div>
          <div className="h-4 w-16 bg-[#003399] rounded flex items-center justify-center">
            <span className="text-[6px] text-white font-bold">MUAT TURUN</span>
          </div>
        </div>
      </div>
    ),
    /* Tetapan toggle */
    toggle: (
      <div className={bingkai}>
        {tajukBar}
        {[true, true, false].map((on, i) => (
          <div key={i} className="flex items-center justify-between px-2 py-1">
            <div className="h-1.5 w-20 bg-gray-200 rounded-full" />
            <div className={`w-7 h-3.5 rounded-full flex items-center px-0.5 ${on ? 'bg-emerald-400 justify-end' : 'bg-gray-300 justify-start'}`}>
              <div className="w-2.5 h-2.5 bg-white rounded-full shadow" />
            </div>
          </div>
        ))}
      </div>
    ),
  }

  return (
    <div className="mt-3 bg-gray-50 border border-gray-100 rounded-xl p-3 flex flex-col items-center">
      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-2 self-start">🖼️ Gambaran skrin</p>
      {isi[jenis] || null}
    </div>
  )
}
