/**
 * MedalTallySetup — /admin/kejohanan/:kejId/medal
 * Gold Podium — multi-tenant
 *
 * Kira pingat (emas, perak, gangsa) dari keputusan heat final.
 * Agregat per sekolah/pasukan — hanya ambil heat yang ada statusKeputusan = 'ada_keputusan'.
 * Kedudukan 1 = emas, 2 = perak, 3 = gangsa.
 *
 * Firestore paths (read only):
 *   tenants/{sId}/kejohanan/{kId}/acara/{aId}/heat/{hId}
 *   tenants/{sId}/kejohanan/{kId}/pendaftaran/{atletId}
 *   tenants/{sId}/atlet/{atletId}
 */

import { useState, useEffect, useCallback } from 'react'
import { collection, getDocs, doc, getDoc, query, orderBy } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getKejContext() {
  try { return JSON.parse(sessionStorage.getItem('gp_kej_aktif') || '{}') } catch { return {} }
}

function masaKeSaat(str) {
  if (!str || !String(str).trim()) return null
  const s = String(str).trim().replace(',', '.')
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s)
  const m = s.match(/^(\d+):(\d{2})(\.\d+)?$/)
  if (m) return parseInt(m[1]) * 60 + parseInt(m[2]) + parseFloat(m[3] || '.0')
  return null
}

function jarakTerbaik(cubaan = []) {
  const valid = (cubaan || []).map(c => parseFloat(c) || 0).filter(v => v > 0)
  return valid.length ? Math.max(...valid) : null
}

function saatKeStr(saat) {
  if (saat === null || saat === undefined) return ''
  if (saat < 60) return saat.toFixed(2)
  const m = Math.floor(saat / 60)
  const s = (saat % 60).toFixed(2).padStart(5, '0')
  return `${m}:${s}`
}

const MEDAL_WARNA = [
  'bg-yellow-400 text-yellow-900',   // emas
  'bg-gray-300 text-gray-700',       // perak
  'bg-amber-600 text-amber-100',     // gangsa
]
const MEDAL_LABEL = ['🥇 Emas', '🥈 Perak', '🥉 Gangsa']
const MEDAL_EMOJI = ['🥇', '🥈', '🥉']

const Ikon = {
  balik:  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>,
  trophy: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>,
  keluar: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
  refresh:<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
  pdf:    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>,
}

// ─── Kira pingat dari heats ───────────────────────────────────────────────────

function kiraDataPingat(heats, acara, atletMap) {
  // Sekolah → { emas, perak, gangsa, jumlah, senarai }
  const tally = {}
  // Juga simpan senarai pemenang untuk jadual terperinci
  const pemenangList = []

  for (const heat of heats) {
    if (heat.statusKeputusan !== 'ada_keputusan') continue
    if (!heat.peserta?.length) continue

    // Ambil fasa heat — hanya ambil final / terus_final
    const fasa = heat.fasa || ''
    if (!['final', 'terus_final', 'suku_akhir', 'separuh_akhir'].includes(fasa)) continue

    const a = acara.find(x => x.id === (heat.aceraId || heat.acaraId))
    const isPadang = a?.jenis === 'padang_lompat' || a?.jenis === 'padang_balin'
    const isRelay  = a?.jenis === 'relay'

    // Sort peserta mengikut keputusan
    const sorted = [...heat.peserta]
      .filter(p => !p.dns && !p.dnf && !p.dq)
      .sort((a2, b2) => {
        if (isPadang) return (jarakTerbaik(b2.cubaan) || 0) - (jarakTerbaik(a2.cubaan) || 0)
        return (masaKeSaat(a2.masa) || 9999) - (masaKeSaat(b2.masa) || 9999)
      })

    sorted.slice(0, 3).forEach((p, i) => {
      let sekolah = ''
      if (isRelay) {
        sekolah = p.namaPasukan || p.kodSekolah || 'Tidak Diketahui'
      } else {
        // GP peserta simpan nama & sekolah terus dalam doc peserta (namaAtlet, sekolah)
        sekolah = p.sekolah || atletMap[p.noKP]?.sekolah || atletMap[p.atletId]?.sekolah || 'Tidak Diketahui'
      }

      const jenisPin = i === 0 ? 'emas' : i === 1 ? 'perak' : 'gangsa'

      if (!tally[sekolah]) tally[sekolah] = { sekolah, emas: 0, perak: 0, gangsa: 0, jumlah: 0 }
      tally[sekolah][jenisPin]++
      tally[sekolah].jumlah++

      pemenangList.push({
        kedudukan: i + 1,
        sekolah,
        namaAtlet: isRelay ? (p.namaPasukan || '—') : (p.namaAtlet || atletMap[p.noKP]?.nama || atletMap[p.atletId]?.nama || p.nama || p.noKP || '—'),
        acara:     a?.nama || heat.aceraId || heat.acaraId || '—',
        kategori:  a?.kategori || '',
        jantina:   a?.jantina || '',
        keputusan: isPadang
          ? `${(jarakTerbaik(p.cubaan) || 0).toFixed(2)}m`
          : saatKeStr(masaKeSaat(p.masa)),
        jenisPin,
      })
    })
  }

  // Sort tally: emas desc → perak → gangsa → nama
  const sorted = Object.values(tally).sort((a2, b2) => {
    if (b2.emas   !== a2.emas)   return b2.emas   - a2.emas
    if (b2.perak  !== a2.perak)  return b2.perak  - a2.perak
    if (b2.gangsa !== a2.gangsa) return b2.gangsa - a2.gangsa
    return a2.sekolah.localeCompare(b2.sekolah)
  })

  return { tally: sorted, pemenangList }
}

// ─── Cetak PDF ────────────────────────────────────────────────────────────────

function cetakPDF(tally, pemenangList, namaKej) {
  const pdf    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const lebar  = pdf.internal.pageSize.getWidth()
  const tarikh = new Date().toLocaleDateString('ms-MY', { day: '2-digit', month: 'long', year: 'numeric' })

  pdf.setFontSize(14)
  pdf.setFont('helvetica', 'bold')
  pdf.text('MEDAL TALLY', lebar / 2, 18, { align: 'center' })
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.text(namaKej || 'Kejohanan', lebar / 2, 25, { align: 'center' })
  pdf.setFontSize(8)
  pdf.text(`Dicetak: ${tarikh}`, lebar / 2, 30, { align: 'center' })

  // Jadual medal tally
  autoTable(pdf, {
    startY: 36,
    head: [['#', 'Sekolah / Pasukan', '🥇 Emas', '🥈 Perak', '🥉 Gangsa', 'Jumlah']],
    body: tally.map((t, i) => [i + 1, t.sekolah, t.emas, t.perak, t.gangsa, t.jumlah]),
    headStyles:   { fillColor: [0, 51, 153], textColor: 255, fontSize: 8, fontStyle: 'bold' },
    bodyStyles:   { fontSize: 8 },
    alternateRowStyles: { fillColor: [245, 247, 255] },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 18, halign: 'center' },
      5: { cellWidth: 18, halign: 'center' },
    },
    margin: { left: 14, right: 14 },
  })

  // Jadual pemenang terperinci
  if (pemenangList.length > 0) {
    const lastY = pdf.lastAutoTable?.finalY || 80
    pdf.addPage()
    pdf.setFontSize(12)
    pdf.setFont('helvetica', 'bold')
    pdf.text('SENARAI PEMENANG', lebar / 2, 18, { align: 'center' })
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'normal')
    pdf.text(namaKej || 'Kejohanan', lebar / 2, 24, { align: 'center' })

    autoTable(pdf, {
      startY: 30,
      head: [['Pingat', 'Acara', 'Kategori', 'Nama / Pasukan', 'Sekolah', 'Keputusan']],
      body: pemenangList.map(p => [
        MEDAL_EMOJI[p.kedudukan - 1] || '',
        p.acara,
        `${p.kategori}${p.jantina ? ' ' + p.jantina : ''}`,
        p.namaAtlet,
        p.sekolah,
        p.keputusan,
      ]),
      headStyles:   { fillColor: [0, 51, 153], textColor: 255, fontSize: 7, fontStyle: 'bold' },
      bodyStyles:   { fontSize: 7 },
      alternateRowStyles: { fillColor: [248, 249, 255] },
      columnStyles: { 0: { cellWidth: 14, halign: 'center' } },
      margin: { left: 10, right: 10 },
    })
  }

  const footerText = 'Gold Podium — Sistem Pengurusan Kejohanan Sukan'
  const nHalaman  = pdf.internal.getNumberOfPages()
  for (let i = 1; i <= nHalaman; i++) {
    pdf.setPage(i)
    pdf.setFontSize(7)
    pdf.setTextColor(150)
    pdf.text(footerText, lebar / 2, pdf.internal.pageSize.getHeight() - 8, { align: 'center' })
    pdf.text(`${i} / ${nHalaman}`, lebar - 14, pdf.internal.pageSize.getHeight() - 8, { align: 'right' })
  }

  pdf.save(`medal-tally-${(namaKej || 'kejohanan').replace(/\s+/g, '-').toLowerCase()}.pdf`)
}

// ─── Komponen Utama ───────────────────────────────────────────────────────────

export default function MedalTallySetup() {
  const { userData, logout } = useAuth()
  const navigate = useNavigate()

  const isSuperadmin = userData?.role === 'superadmin'
  const viewSchoolId = isSuperadmin
    ? (() => { try { return JSON.parse(sessionStorage.getItem('gp_view_school') || '{}').schoolId || '' } catch { return '' } })()
    : null
  const schoolId = viewSchoolId || userData?.schoolId

  const kej   = getKejContext()
  const kejId = kej.id

  const [tally,       setTally]       = useState([])
  const [pemenang,    setPemenang]    = useState([])
  const [muatTurun,   setMuatTurun]   = useState(true)
  const [tabAktif,    setTabAktif]    = useState('tally')
  const [filterSek,   setFilterSek]   = useState('')
  const [refresh,     setRefresh]     = useState(0)

  const muatData = useCallback(async () => {
    if (!schoolId || !kejId) return
    setMuatTurun(true)
    try {
      // Nama sekolah dari tenant doc (GP single-school — semua atlet dari sekolah sama)
      const tenantSnap = await getDoc(doc(db, 'tenants', schoolId))
      const namaSekolah = tenantSnap.data()?.namaSekolah || schoolId

      // Muat semua acara
      const aSnap = await getDocs(
        query(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'acara'), orderBy('nama'))
      )
      const semuaAcara = aSnap.docs.map(d => ({ id: d.id, ...d.data() }))

      // Muat semua heat — 1 query (flat collection)
      const heatSnap   = await getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat'))
      const semuaHeats = heatSnap.docs.map(d => ({ id: d.id, ...d.data() }))

      // Muat atlet map (key = noKP = doc ID)
      const atsSnap = await getDocs(collection(db, 'tenants', schoolId, 'atlet'))
      const atletMap = {}
      atsSnap.docs.forEach(d => { atletMap[d.id] = { ...d.data(), sekolah: namaSekolah } })

      const { tally: t, pemenangList } = kiraDataPingat(semuaHeats, semuaAcara, atletMap)
      setTally(t)
      setPemenang(pemenangList)
    } catch { /* langkau */ }
    setMuatTurun(false)
  }, [schoolId, kejId, refresh])

  useEffect(() => { muatData() }, [muatData])

  const totalEmas   = tally.reduce((s, t) => s + t.emas,   0)
  const totalPerak  = tally.reduce((s, t) => s + t.perak,  0)
  const totalGangsa = tally.reduce((s, t) => s + t.gangsa, 0)

  const pemenangTapis = pemenang.filter(p =>
    !filterSek || p.sekolah.toLowerCase().includes(filterSek.toLowerCase())
  )

  if (!schoolId || !kejId) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-sm text-gray-400">Sila pilih kejohanan dari panel admin.</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">

      {isSuperadmin && (
        <div className="bg-amber-400 text-amber-900 px-4 py-2 flex items-center justify-between text-xs font-bold">
          <span>⚡ Mode Superadmin</span>
          <button onClick={() => { sessionStorage.removeItem('gp_view_school'); navigate('/superadmin') }}
            className="underline hover:no-underline">← Balik ke Panel Superadmin</button>
        </div>
      )}

      <header className="bg-[#003399] text-white px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/admin/kejohanan/${kejId}`)}
            className="text-white/60 hover:text-white transition-colors p-1 -ml-1">
            {Ikon.balik}
          </button>
          <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center shrink-0">
            {Ikon.trophy}
          </div>
          <div className="min-w-0">
            <p className="text-[9px] text-white/50 uppercase tracking-widest">Gold Podium</p>
            <p className="text-sm font-bold leading-tight truncate">Medal Tally</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setRefresh(r => r + 1)} title="Muat semula"
            className="text-white/60 hover:text-white transition-colors p-1.5">
            {Ikon.refresh}
          </button>
          <button onClick={async () => { await logout(); navigate('/login') }}
            className="text-white/60 hover:text-white transition-colors p-1.5 flex items-center gap-1.5 text-xs">
            {Ikon.keluar}
            <span className="hidden sm:block">Log Keluar</span>
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-4">

        {/* Ringkasan */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Emas', nilai: totalEmas,   warna: 'bg-yellow-50 border-yellow-200 text-yellow-800', dot: 'bg-yellow-400' },
            { label: 'Perak', nilai: totalPerak,  warna: 'bg-gray-50 border-gray-200 text-gray-700',      dot: 'bg-gray-400' },
            { label: 'Gangsa', nilai: totalGangsa, warna: 'bg-amber-50 border-amber-200 text-amber-800',  dot: 'bg-amber-600' },
          ].map(k => (
            <div key={k.label} className={`border rounded-2xl px-4 py-3 ${k.warna}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <div className={`w-2 h-2 rounded-full ${k.dot}`} />
                <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">{k.label}</p>
              </div>
              <p className="text-2xl font-black">{k.nilai}</p>
            </div>
          ))}
        </div>

        {/* Tab */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="flex border-b border-gray-100">
            {[
              { id: 'tally',   label: 'Tally Sekolah' },
              { id: 'senarai', label: `Senarai Pemenang (${pemenang.length})` },
            ].map(t => (
              <button key={t.id} onClick={() => setTabAktif(t.id)}
                className={`flex-1 py-3 text-xs font-bold transition-colors ${
                  tabAktif === t.id
                    ? 'text-[#003399] border-b-2 border-[#003399] bg-blue-50/40'
                    : 'text-gray-400 hover:text-gray-600'
                }`}>
                {t.label}
              </button>
            ))}
            <button
              onClick={() => cetakPDF(tally, pemenang, kej.nama)}
              className="m-2 px-3 py-1.5 bg-[#003399] hover:bg-[#002277] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shrink-0 transition-colors">
              {Ikon.pdf} PDF
            </button>
          </div>

          {muatTurun ? (
            <div className="flex justify-center py-14">
              <svg className="w-6 h-6 animate-spin text-gray-300" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            </div>
          ) : (

            /* ── Tab: Tally Sekolah ── */
            tabAktif === 'tally' ? (
              tally.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-gray-400">Tiada keputusan final lagi.</p>
                  <p className="text-[10px] text-gray-300 mt-1">Rekod keputusan dalam modul Input Keputusan terlebih dahulu.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                        <th className="px-4 py-3 text-center w-10">#</th>
                        <th className="px-3 py-3 text-left">Sekolah / Pasukan</th>
                        <th className="px-3 py-3 text-center w-14">🥇</th>
                        <th className="px-3 py-3 text-center w-14">🥈</th>
                        <th className="px-3 py-3 text-center w-14">🥉</th>
                        <th className="px-3 py-3 text-center w-16">Jumlah</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tally.map((t, i) => (
                        <tr key={t.sekolah}
                          className={`border-b border-gray-50 transition-colors ${
                            i === 0 ? 'bg-yellow-50/40' : i === 1 ? 'bg-gray-50/40' : i === 2 ? 'bg-amber-50/30' : 'hover:bg-gray-50/30'
                          }`}>
                          <td className="px-4 py-3 text-center">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black mx-auto ${
                              i === 0 ? 'bg-yellow-400 text-yellow-900'
                              : i === 1 ? 'bg-gray-300 text-gray-700'
                              : i === 2 ? 'bg-amber-600 text-white'
                              : 'text-gray-400'
                            }`}>
                              {i < 3 ? MEDAL_EMOJI[i] : i + 1}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-semibold text-gray-800 text-xs">{t.sekolah}</p>
                          </td>
                          <td className="px-3 py-3 text-center font-black text-yellow-600">{t.emas || '—'}</td>
                          <td className="px-3 py-3 text-center font-black text-gray-500">{t.perak || '—'}</td>
                          <td className="px-3 py-3 text-center font-black text-amber-700">{t.gangsa || '—'}</td>
                          <td className="px-3 py-3 text-center">
                            <span className="font-black text-[#003399]">{t.jumlah}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )

            /* ── Tab: Senarai Pemenang ── */
            ) : (
              <div className="p-4 space-y-3">
                <input
                  type="text"
                  value={filterSek}
                  onChange={e => setFilterSek(e.target.value)}
                  placeholder="Tapis mengikut sekolah..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399]"
                />

                {pemenangTapis.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">Tiada pemenang lagi.</p>
                ) : (
                  <div className="space-y-1.5">
                    {pemenangTapis.map((p, i) => (
                      <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${
                        p.kedudukan === 1 ? 'bg-yellow-50 border-yellow-200'
                        : p.kedudukan === 2 ? 'bg-gray-50 border-gray-200'
                        : 'bg-amber-50 border-amber-200'
                      }`}>
                        <span className="text-lg shrink-0">{MEDAL_EMOJI[p.kedudukan - 1]}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-800 truncate">{p.namaAtlet}</p>
                          <p className="text-[10px] text-gray-500 truncate">{p.sekolah}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] font-bold text-gray-600 truncate max-w-[120px]">{p.acara}</p>
                          <p className="text-[10px] text-gray-400">{p.kategori}{p.jantina ? ' · ' + p.jantina : ''}</p>
                        </div>
                        <span className="text-xs font-mono font-bold text-gray-600 shrink-0">{p.keputusan}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          )}
        </div>

        {/* Nota */}
        <p className="text-[10px] text-gray-300 text-center">
          Kiraan berdasarkan heat final sahaja (Final / Terus Final / Suku Akhir / Separuh Akhir yang telah ada keputusan)
        </p>
      </div>
    </div>
  )
}
