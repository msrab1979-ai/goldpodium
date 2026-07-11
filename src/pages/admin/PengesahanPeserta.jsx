import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import {
  collection, doc, getDocs, getDoc, updateDoc, serverTimestamp, query, where,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import useSchoolId from '../../hooks/useSchoolId'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function PengesahanPeserta() {
  const { kejId } = useParams()
  const { schoolId } = useSchoolId()

  const [namaKej, setNamaKej]           = useState('')
  const [sekolahList, setSekolahList]   = useState([])
  const [pengesahanMap, setPengesahanMap] = useState({})
  const [loading, setLoading]           = useState(true)
  const [filter, setFilter]             = useState('semua') // semua | disahkan | belum
  const [confirmBypass, setConfirmBypass] = useState(null) // { kod, nama, bypass }
  const [bypasLoading, setBypasLoading] = useState(false)

  useEffect(() => {
    if (!schoolId || !kejId) return
    load()
  }, [schoolId, kejId])

  async function load() {
    setLoading(true)
    try {
      // Nama kejohanan
      const kejSnap = await getDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId))
      if (kejSnap.exists()) setNamaKej(kejSnap.data().namaKejohanan || '')

      // Sekolah yang ada pendaftaran dalam kejohanan ini sahaja
      const pendSnap = await getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'pendaftaran'))
      const kodSet = new Set(pendSnap.docs.map(d => d.data().kodSekolah).filter(Boolean))

      const sSnap = await getDocs(collection(db, 'tenants', schoolId, 'sekolah'))
      const sekolahMap = {}
      sSnap.docs.forEach(d => { sekolahMap[d.id] = { kodSekolah: d.id, ...d.data() } })

      const list = [...kodSet]
        .map(kod => sekolahMap[kod] || { kodSekolah: kod, namaSekolah: kod })
        .sort((a, b) => (a.namaSekolah || '').localeCompare(b.namaSekolah || '', 'ms'))
      setSekolahList(list)

      // Pengesahan map
      const pgSnap = await getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'pengesahan'))
      const map = {}
      pgSnap.docs.forEach(d => { map[d.id] = d.data() })
      setPengesahanMap(map)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  // Sekolah rows dengan status pengesahan
  const rows = useMemo(() => {
    return sekolahList.map(s => {
      const pg = pengesahanMap[s.kodSekolah] || null
      const bypass = !!s.bypassPengesahan
      const disahkan = pg?.disahkan === true && !bypass
      return { ...s, pg, bypass, disahkan }
    })
  }, [sekolahList, pengesahanMap])

  const filtered = useMemo(() => {
    if (filter === 'disahkan') return rows.filter(r => r.disahkan)
    if (filter === 'belum')    return rows.filter(r => !r.disahkan)
    return rows
  }, [rows, filter])

  const totalDisahkan = rows.filter(r => r.disahkan).length
  const total = rows.length

  function tarikhStr(pg) {
    if (!pg?.tarikhSahkan) return '—'
    return new Date(pg.tarikhSahkan?.toDate?.() || pg.tarikhSahkan)
      .toLocaleString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  async function doBypass(row) {
    setBypasLoading(true)
    try {
      await updateDoc(doc(db, 'tenants', schoolId, 'sekolah', row.kodSekolah), {
        bypassPengesahan: !row.bypass,
        updatedAt: serverTimestamp(),
      })
      setSekolahList(prev => prev.map(s =>
        s.kodSekolah === row.kodSekolah ? { ...s, bypassPengesahan: !row.bypass } : s
      ))
    } catch (e) {
      alert('Ralat: ' + e.message)
    } finally {
      setBypasLoading(false)
      setConfirmBypass(null)
    }
  }

  function cetakPDF() {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = pdf.internal.pageSize.getWidth()
    const now = new Date().toLocaleString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

    pdf.setFillColor(0, 51, 153)
    pdf.rect(0, 0, pageW, 22, 'F')
    pdf.setFontSize(11)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(255, 255, 255)
    pdf.text('LAPORAN PENGESAHAN PESERTA', pageW / 2, 10, { align: 'center' })
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'normal')
    pdf.text(namaKej || 'Kejohanan', pageW / 2, 16, { align: 'center' })

    pdf.setTextColor(100, 100, 100)
    pdf.setFontSize(7.5)
    pdf.text(`Dicetak: ${now}`, 14, 28)
    pdf.text(`${totalDisahkan} / ${total} sekolah disahkan`, pageW - 14, 28, { align: 'right' })

    autoTable(pdf, {
      startY: 32,
      head: [['Bil', 'Sekolah', 'Kod', 'Status', 'Tarikh Pengesahan']],
      body: rows.map((r, i) => [
        i + 1,
        r.namaSekolah || r.kodSekolah,
        r.kodSekolah,
        r.disahkan ? 'Disahkan' : r.bypass ? 'Bypass' : 'Belum Sahkan',
        r.disahkan ? tarikhStr(r.pg) : '—',
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [0, 51, 153], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        2: { font: 'courier', cellWidth: 22 },
        3: { halign: 'center', cellWidth: 28 },
        4: { cellWidth: 42 },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const val = data.cell.raw
          if (val === 'Disahkan') {
            data.cell.styles.textColor = [21, 128, 61]
            data.cell.styles.fontStyle = 'bold'
          } else if (val === 'Belum Sahkan') {
            data.cell.styles.textColor = [180, 83, 9]
          }
        }
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    })

    pdf.save(`Pengesahan_Peserta_${namaKej || kejId}.pdf`)
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <svg className="w-6 h-6 animate-spin text-[#003399]/40" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Pengesahan Peserta</p>
              <h1 className="text-base font-bold text-gray-900 leading-tight">{namaKej || '—'}</h1>
            </div>
            <div className="flex items-center gap-2 shrink-0 mt-0.5">
              {/* Counter */}
              <div className="text-right">
                <p className="text-2xl font-black text-[#003399] leading-none">{totalDisahkan}<span className="text-sm font-normal text-gray-400"> / {total}</span></p>
                <p className="text-[9px] text-gray-400 uppercase tracking-wide">Sekolah Disahkan</p>
              </div>
              {/* Badge */}
              {total > 0 && (
                totalDisahkan === total
                  ? <span className="text-[9px] font-bold px-2 py-1 bg-green-100 text-green-700 rounded-full whitespace-nowrap">Semua Disahkan ✓</span>
                  : <span className="text-[9px] font-bold px-2 py-1 bg-amber-100 text-amber-700 rounded-full whitespace-nowrap">{total - totalDisahkan} Belum Sahkan</span>
              )}
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Filter tabs */}
          <div className="flex items-center gap-1 bg-white border border-gray-100 rounded-lg p-1 shadow-sm">
            {[
              { k: 'semua',    l: 'Semua' },
              { k: 'disahkan', l: 'Disahkan' },
              { k: 'belum',    l: 'Belum Sahkan' },
            ].map(({ k, l }) => (
              <button key={k} onClick={() => setFilter(k)}
                className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-colors ${filter === k ? 'bg-[#003399] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                {l}
                {k === 'disahkan' && <span className="ml-1 opacity-70">{totalDisahkan}</span>}
                {k === 'belum'    && <span className="ml-1 opacity-70">{total - totalDisahkan}</span>}
              </button>
            ))}
          </div>

          {/* PDF button */}
          <button onClick={cetakPDF}
            className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold border border-[#003399] text-[#003399] rounded-lg hover:bg-blue-50 transition-colors shadow-sm">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Cetak PDF
          </button>
        </div>

        {/* Jadual */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {filtered.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm font-bold text-gray-400">Tiada rekod</p>
              <p className="text-[10px] text-gray-300 mt-1">Tiada sekolah dalam kategori ini</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-3 py-2.5 text-left text-[9px] font-bold text-gray-400 uppercase w-8">#</th>
                  <th className="px-3 py-2.5 text-left text-[9px] font-bold text-gray-400 uppercase">Sekolah</th>
                  <th className="px-3 py-2.5 text-center text-[9px] font-bold text-gray-400 uppercase w-28">Status</th>
                  <th className="px-3 py-2.5 text-left text-[9px] font-bold text-gray-400 uppercase">Tarikh Sahkan</th>
                  <th className="px-3 py-2.5 text-center text-[9px] font-bold text-gray-400 uppercase w-20">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((r, i) => (
                  <tr key={r.kodSekolah} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-3 text-[10px] text-gray-400 text-center">{i + 1}</td>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-gray-800 text-[11px]">{r.namaSekolah || r.kodSekolah}</p>
                      <p className="font-mono text-gray-400 text-[9px]">{r.kodSekolah}</p>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {r.disahkan
                        ? <span className="text-[9px] font-bold px-2 py-0.5 bg-green-100 text-green-700 rounded-full">✓ Disahkan</span>
                        : r.bypass
                          ? <span className="text-[9px] font-bold px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full">Bypass</span>
                          : <span className="text-[9px] font-bold px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">Belum Sahkan</span>
                      }
                    </td>
                    <td className="px-3 py-3 text-[10px] text-gray-500">
                      {r.disahkan ? tarikhStr(r.pg) : '—'}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {r.disahkan && (
                        <button
                          onClick={() => setConfirmBypass({ ...r, actionLabel: 'Buka Kunci' })}
                          className="text-[9px] font-bold px-2 py-1 border border-amber-300 text-amber-700 rounded-md hover:bg-amber-50 transition-colors">
                          Buka Kunci
                        </button>
                      )}
                      {!r.disahkan && r.bypass && (
                        <button
                          onClick={() => setConfirmBypass({ ...r, actionLabel: 'Kunci Semula' })}
                          className="text-[9px] font-bold px-2 py-1 border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50 transition-colors">
                          Kunci Semula
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>

      {/* Confirm Dialog Bypass */}
      {confirmBypass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">{confirmBypass.actionLabel} Pengesahan</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{confirmBypass.namaSekolah}</p>
              </div>
            </div>
            <p className="text-xs text-gray-600 mb-5">
              {confirmBypass.actionLabel === 'Buka Kunci'
                ? 'Pendaftaran sekolah ini akan dibuka semula. Pengurus Pasukan boleh membuat perubahan.'
                : 'Bypass akan dikunci semula. Status pengesahan akan dikira dari tindakan PP.'}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmBypass(null)}
                className="flex-1 py-2 text-xs font-bold border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors">
                Batal
              </button>
              <button onClick={() => doBypass(confirmBypass)} disabled={bypasLoading}
                className="flex-1 py-2 text-xs font-bold bg-[#003399] text-white rounded-xl hover:bg-blue-800 transition-colors disabled:opacity-50">
                {bypasLoading ? 'Proses...' : 'Ya, Teruskan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
