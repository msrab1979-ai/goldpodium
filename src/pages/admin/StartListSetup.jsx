/**
 * StartListSetup — /admin/kejohanan/:kejId/startlist
 *
 * Gold Podium — multi-tenant
 *
 * Fungsi utama:
 *  1. Papar senarai acara + bilangan peserta + bilangan heat
 *  2. Jana heat dari pendaftaran (random draw / seeding)
 *  3. Lihat & edit lorong/giliran heat
 *  4. Cetak PDF start list setiap heat
 *  5. Jana final dari heat (selepas keputusan saringan)
 *
 * Firestore paths:
 *  tenants/{schoolId}/kejohanan/{kejId}/acara/{acaraId}/heat/{heatId}
 *  tenants/{schoolId}/kejohanan/{kejId}/pendaftaran/{atletId}
 *  tenants/{schoolId}/kejohanan/{kejId}/tetapan/waConfig
 *  tenants/{schoolId}/atlet/{atletId}
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  collection, getDocs, getDoc, doc, setDoc, deleteDoc, updateDoc,
  serverTimestamp, query, where, orderBy, writeBatch, deleteField,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  WA_LORONG_KUMPULAN_DEFAULT,
  WA_LORONG_HEAT_REMOVE,
  assignLorongFinal,
  assignLorongHeat,
  detectJenisLorong,
} from '../../utils/startListPdfUtils'
import { selectFinalists, getFinalistSetup, serpentineSeed } from '../../utils/finalistUtils'

// ─── Path helpers ─────────────────────────────────────────────────────────────

function getKejContext() {
  try {
    const raw = sessionStorage.getItem('gp_kej_aktif')
    if (!raw) return {}
    return JSON.parse(raw)
  } catch { return {} }
}

const acaraColPath = (sId, kId)            => `tenants/${sId}/kejohanan/${kId}/acara`
const heatColPath  = (sId, kId)            => `tenants/${sId}/kejohanan/${kId}/heat`
const heatDocPath  = (sId, kId, hId)       => `tenants/${sId}/kejohanan/${kId}/heat/${hId}`
const pendColPath  = (sId, kId)            => `tenants/${sId}/kejohanan/${kId}/pendaftaran`
const atletColPath = (sId)                 => `tenants/${sId}/atlet`
const waDocPath    = (sId, kId)            => [`tenants/${sId}/kejohanan/${kId}/tetapan`, 'waConfig']

// ─── Const ────────────────────────────────────────────────────────────────────

let LORONG_KUMPULAN    = { ...WA_LORONG_KUMPULAN_DEFAULT }
let LORONG_HEAT_REMOVE = { ...WA_LORONG_HEAT_REMOVE }

const FASA_LABEL = {
  heat:          'Heat',
  final:         'Final',
  saringan:      'Saringan',
  suku_akhir:    'Suku Akhir',
  separuh_akhir: 'Separuh Akhir',
  terus_final:   'Terus Final',
}

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-[#003399]/25 focus:border-[#003399] bg-gray-50'

const Ikon = {
  balik:  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>,
  trophy: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>,
  keluar: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
  print:  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>,
  edit:   <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
  padam:  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tentukanFasa(nPeserta, nLorong) {
  if (nPeserta <= nLorong)      return 'terus_final'
  if (nPeserta <= nLorong * 3)  return 'heat_final'
  return 'saringan_heat_final'
}

function buatHeatId(aceraId, fasa, noHeat) {
  const k = fasa === 'final' ? 'F' : fasa === 'suku_akhir' ? 'QF' : fasa === 'separuh_akhir' ? 'SF' : fasa === 'saringan' ? 'S' : 'H'
  return `${aceraId}-${k}${noHeat}`
}

function assignGiliran(peserta) {
  return peserta.map((p, i) => ({ ...p, giliran: i + 1 }))
}

function bahagikanKeHeatAdil(peserta, nLorong) {
  const n = peserta.length
  if (n === 0) return []
  const H = Math.ceil(n / nLorong)
  if (H === 1) return [peserta]
  const maxSize = Math.ceil(n / H)
  const heats = Array.from({ length: H }, () => [])
  const groups = {}
  for (const p of peserta) {
    const k = p.kodSekolah || '__'
    if (!groups[k]) groups[k] = []
    groups[k].push(p)
  }
  const sorted = Object.values(groups).sort((a, b) => b.length - a.length).flat()
  for (const atlet of sorted) {
    const ks = atlet.kodSekolah || '__'
    const same  = heats.map(h => h.filter(p => (p.kodSekolah || '__') === ks).length)
    const total = heats.map(h => h.length)
    let best = -1
    for (let i = 0; i < H; i++) {
      if (total[i] >= maxSize) continue
      if (best === -1 || same[i] < same[best] || (same[i] === same[best] && total[i] < total[best])) best = i
    }
    if (best === -1) { let m = Infinity; for (let i = 0; i < H; i++) if (total[i] < m) { m = total[i]; best = i } }
    heats[best].push(atlet)
  }
  return heats
}

function katLabel(kod, kategoriList = []) {
  if (!kod) return kod || ''
  const k = kategoriList.find(x => x.kod === kod || x.id === kod)
  return k?.label || k?.nama || kod
}

// ─── Badge ────────────────────────────────────────────────────────────────────

function FasaBadge({ fasa }) {
  const colors = {
    heat: 'bg-blue-100 text-blue-700', final: 'bg-purple-100 text-purple-700',
    saringan: 'bg-orange-100 text-orange-700', suku_akhir: 'bg-teal-100 text-teal-700',
    separuh_akhir: 'bg-indigo-100 text-indigo-700', terus_final: 'bg-green-100 text-green-700',
  }
  return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${colors[fasa]||'bg-gray-100 text-gray-500'}`}>{FASA_LABEL[fasa]||fasa}</span>
}

// ─── PDF export ───────────────────────────────────────────────────────────────

function cetakStartListPDF(acara, heatList, namaKej, atletMap = {}, kategoriList = []) {
  const pdf   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const now   = new Date().toLocaleString('ms-MY')
  const isPadang = ['padang_lompat','padang_balin'].includes(acara.jenisAcara)
  const isMass   = acara.jenisAcara === 'mass_start'

  heatList.forEach((heat, hIdx) => {
    if (hIdx > 0) pdf.addPage()
    pdf.setFontSize(12); pdf.setFont('helvetica', 'bold')
    pdf.text('START LIST', pageW / 2, 16, { align: 'center' })
    pdf.setFontSize(10)
    pdf.text(namaKej, pageW / 2, 22, { align: 'center' })
    pdf.setFontSize(9); pdf.setFont('helvetica', 'normal')
    pdf.text(`${acara.namaAcara} — Kat ${katLabel(acara.kategoriKod, kategoriList)}`, pageW / 2, 28, { align: 'center' })
    pdf.text(`${FASA_LABEL[heat.fasa]||heat.fasa} ${heat.noHeat} | ID: ${heat.heatId}`, pageW / 2, 33, { align: 'center' })

    const head = isPadang || isMass
      ? [['Giliran', 'No. BIB', 'Nama Atlet', 'Catatan']]
      : [['Lorong',  'No. BIB', 'Nama Atlet', 'Catatan']]

    const rows = [...(heat.peserta || [])]
      .sort((a, b) => isPadang || isMass ? (a.giliran??99) - (b.giliran??99) : (a.lorong??99) - (b.lorong??99))
      .map(p => [
        isPadang || isMass ? (p.giliran ?? '—') : (p.lorong ?? '—'),
        p.noBib || '—',
        p.namaAtlet || atletMap[p.noKP]?.nama || '—',
        '',
      ])

    autoTable(pdf, {
      startY: 38,
      head, body: rows,
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [0, 51, 153], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 247, 255] },
      columnStyles: { 0: { halign: 'center', cellWidth: 18 }, 1: { cellWidth: 20 }, 3: { cellWidth: 30 } },
      margin: { left: 15, right: 15 },
    })

    const finalY = pdf.lastAutoTable.finalY + 8
    pdf.setFontSize(8)
    pdf.text(`Dicetak: ${now}`, 15, finalY)
    pdf.text('Gold Podium — Tandatangan Pegawai: ________________', pageW - 15, finalY, { align: 'right' })
    pdf.setDrawColor(0, 51, 153); pdf.setLineWidth(0.4)
    pdf.line(15, finalY + 4, pageW - 15, finalY + 4)
  })

  pdf.save(`StartList_${acara.id||acara.aceraId}_${Date.now()}.pdf`)
}

// ─── Modal Jana Heat ──────────────────────────────────────────────────────────

function JanaHeatModal({ acara, peserta, schoolId, kejId, onClose, onDone }) {
  const isPadang = ['padang_lompat','padang_balin'].includes(acara.jenisAcara)
  const isMass   = acara.jenisAcara === 'mass_start'
  const isLorong = !isPadang && !isMass

  const [bilanganLorong, setBL]     = useState(acara.bilanganLorong || 8)
  const [caraDraw, setCaraDraw]     = useState('random')
  const [preview, setPreview]       = useState(null)
  const [saving, setSaving]         = useState(false)

  function buatPreview() {
    const p = [...peserta]
    if (caraDraw === 'random') {
      for (let i = p.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [p[i], p[j]] = [p[j], p[i]]
      }
    }
    const jenis = detectJenisLorong(acara)
    const bilL  = Number(bilanganLorong)
    const fasa  = isPadang || isMass ? 'terus_final' : tentukanFasa(p.length, bilL)
    let heats   = []

    if (fasa === 'terus_final' || isPadang || isMass) {
      const assigned = isPadang || isMass
        ? assignGiliran(p)
        : assignLorongFinal(p, jenis, LORONG_KUMPULAN)
      heats = [{ fasa: 'final', noHeat: 1, peserta: assigned }]
    } else {
      const groups = bahagikanKeHeatAdil(p, bilL)
      heats = groups.map((hp, i) => ({
        fasa: 'heat', noHeat: i + 1,
        peserta: assignLorongHeat(hp, jenis, bilL, LORONG_HEAT_REMOVE),
      }))
    }
    setPreview({ fasa, heats })
  }

  async function handleSimpan() {
    if (!preview) return
    setSaving(true)
    const aceraKey = acara.aceraId || acara.id
    try {
      // Padam heat lama untuk acara ini
      const existSnap = await getDocs(query(collection(db, heatColPath(schoolId, kejId)), where('aceraId', '==', aceraKey)))
      if (!existSnap.empty) {
        const del = writeBatch(db)
        existSnap.docs.forEach(d => del.delete(d.ref))
        await del.commit()
      }
      // Tulis heat baru
      const batch = writeBatch(db)
      for (const h of preview.heats) {
        const heatId = buatHeatId(aceraKey, h.fasa, h.noHeat)
        const ref    = doc(db, heatColPath(schoolId, kejId), heatId)
        batch.set(ref, {
          heatId, aceraId: aceraKey,
          schoolId, kejId,
          fasa: h.fasa, noHeat: h.noHeat,
          status: 'belum_mula',
          peserta: h.peserta.map(p => ({
            noBib:       p.noBib       || '',
            noKP:        p.noKP        || '',
            namaAtlet:   p.namaAtlet   || '',
            kategoriKod: p.kategoriKod || '',
            lorong:      p.lorong      ?? null,
            giliran:     p.giliran     ?? null,
            keputusan:   null,
            status:      'belum',
          })),
          finalisDipilih: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: false })
      }
      await batch.commit()
      // Mark heatDijanaAt dalam acara doc
      updateDoc(doc(db, acaraColPath(schoolId, kejId), aceraKey), {
        heatDijanaAt: serverTimestamp(),
      }).catch(() => {})
      onDone()
      onClose()
    } catch (e) {
      alert('Ralat: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const fasaLabel = peserta.length > 0 && isLorong
    ? ({ terus_final: 'Terus Final', heat_final: 'Heat → Final', saringan_heat_final: 'Saringan → Heat → Final' }[tentukanFasa(peserta.length, Number(bilanganLorong))])
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between shrink-0">
          <div>
            <h2 className="text-sm font-black text-gray-900">Jana Start List</h2>
            <p className="text-xs text-gray-500 mt-0.5">{acara.namaAcara} — {peserta.length} peserta</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {peserta.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-center">
              <p className="text-sm font-semibold text-amber-800">Tiada peserta berdaftar</p>
              <p className="text-xs text-amber-600 mt-1">Daftar atlet dahulu dalam Pendaftaran Atlet.</p>
            </div>
          ) : (
            <>
              {isLorong && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Bilangan Lorong</label>
                    <input type="number" min={4} max={10} value={bilanganLorong}
                      onChange={e => { setBL(e.target.value); setPreview(null) }} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Kaedah Draw</label>
                    <select value={caraDraw} onChange={e => { setCaraDraw(e.target.value); setPreview(null) }} className={inputCls}>
                      <option value="random">Random (Loteri)</option>
                      <option value="seeding">Seeding (urutan daftar)</option>
                    </select>
                  </div>
                </div>
              )}

              {isLorong && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700">
                  <span className="font-bold">{peserta.length} peserta</span>
                  {fasaLabel && <span> → <strong>{fasaLabel}</strong></span>}
                </div>
              )}

              {(isPadang || isMass) && (
                <div className="bg-green-50 border border-green-100 rounded-lg px-3 py-2 text-xs text-green-700">
                  {peserta.length} peserta akan assign giliran 1–{peserta.length} secara {caraDraw === 'random' ? 'rawak' : 'urutan'}.
                </div>
              )}

              {preview && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{preview.heats.length} Heat</p>
                  {preview.heats.map(h => (
                    <div key={h.noHeat} className="border border-gray-100 rounded-xl overflow-hidden">
                      <div className="px-3 py-2 bg-[#003399] flex items-center justify-between">
                        <span className="text-[10px] font-bold text-white">{FASA_LABEL[h.fasa]||h.fasa} {h.noHeat} — {h.peserta.length} peserta</span>
                        <span className="text-[9px] text-blue-200">{buatHeatId(acara.aceraId||acara.id, h.fasa, h.noHeat)}</span>
                      </div>
                      <table className="w-full text-[10px]">
                        <tbody>
                          {[...h.peserta].sort((a,b)=> isPadang||isMass ? (a.giliran??99)-(b.giliran??99) : (a.lorong??99)-(b.lorong??99))
                            .map((p, idx) => (
                              <tr key={p.noBib||p.noKP||idx} className="border-t border-gray-50">
                                <td className="px-3 py-1 text-center font-black text-[#003399] w-8">{isPadang||isMass?p.giliran:p.lorong}</td>
                                <td className="px-2 py-1 font-mono text-gray-400">{p.noBib}</td>
                                <td className="px-2 py-1 font-semibold text-gray-800">{p.namaAtlet}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {peserta.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 flex justify-between items-center gap-2 shrink-0">
            <button onClick={buatPreview}
              className="px-4 py-2 text-xs font-bold border border-[#003399] text-[#003399] rounded-lg hover:bg-blue-50 transition-colors">
              {preview ? 'Jana Semula' : 'Preview'}
            </button>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 text-xs text-gray-600 hover:bg-gray-100 rounded-lg">Batal</button>
              <button onClick={handleSimpan} disabled={!preview || saving}
                className="px-5 py-2 text-xs font-bold bg-[#003399] text-white rounded-lg hover:bg-[#002288] disabled:opacity-50">
                {saving ? 'Menyimpan…' : 'Simpan Start List'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Modal Edit Lorong ────────────────────────────────────────────────────────

function EditLorongModal({ heat, acara, schoolId, kejId, onClose, onSaved }) {
  const isPadang = ['padang_lompat','padang_balin'].includes(acara.jenisAcara)
  const isMass   = acara.jenisAcara === 'mass_start'
  const [peserta, setPeserta] = useState(
    [...(heat.peserta||[])].sort((a,b) => isPadang||isMass ? (a.giliran??99)-(b.giliran??99) : (a.lorong??99)-(b.lorong??99))
  )
  const [saving, setSaving] = useState(false)

  function update(idx, field, val) {
    setPeserta(p => p.map((x, i) => i === idx ? { ...x, [field]: Number(val) || 0 } : x))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const aceraKey = acara.aceraId || acara.id
      await setDoc(
        doc(db, heatColPath(schoolId, kejId), heat.heatId),
        { peserta, updatedAt: serverTimestamp() },
        { merge: true }
      )
      onSaved()
      onClose()
    } catch (e) { alert(e.message); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="text-sm font-black text-gray-900">Edit {isPadang||isMass?'Giliran':'Lorong'}</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-2">
          {peserta.map((p, i) => (
            <div key={p.noBib||p.noKP||i} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-xl">
              <input
                type="number" min={1} max={isPadang||isMass?peserta.length:10}
                value={isPadang||isMass ? (p.giliran||0) : (p.lorong||0)}
                onChange={e => update(i, isPadang||isMass?'giliran':'lorong', e.target.value)}
                className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center font-black text-[#003399] focus:outline-none focus:ring-2 focus:ring-[#003399]/25"
              />
              <div>
                <p className="text-xs font-bold text-gray-800">{p.namaAtlet}</p>
                <p className="text-[9px] font-mono text-gray-400">{p.noBib}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-xs text-gray-600 hover:bg-gray-100 rounded-lg">Batal</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 text-xs font-bold bg-[#003399] text-white rounded-lg hover:bg-[#002288] disabled:opacity-50">
            {saving?'Menyimpan…':'Simpan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Jana Finalis (QF→SF atau SF/QF→Final) ─────────────────────────────

function JanaFinalisModal({ acara, heatList, finalSetup, fasa, schoolId, kejId, kategoriList, onClose, onDone }) {
  // fasa: 'sukuKeSeparuh' (QF→SF) atau 'toFinal' (→Final)
  const isPadang  = ['padang_lompat','padang_balin'].includes(acara.jenisAcara)
  const isMass    = acara.jenisAcara === 'mass_start'
  const isLorong  = !isPadang && !isMass
  const aceraKey  = acara.aceraId || acara.id

  const fasaLabel   = fasa === 'sukuKeSeparuh' ? 'Separuh Akhir (SF)' : 'Akhir / Final'
  const targetFasa  = fasa === 'sukuKeSeparuh' ? 'separuh_akhir' : 'final'

  const [bilanganHeat, setBH]   = useState(fasa === 'sukuKeSeparuh' ? 2 : 1)
  const [preview,      setPreview] = useState(null)
  const [saving,       setSaving]  = useState(false)
  const [err,          setErr]     = useState('')

  const setup = finalSetup ? getFinalistSetup(acara, finalSetup, fasa) : null

  // Heat yang ada keputusan rasmi
  const heatBerkeputusan = heatList.filter(h =>
    ['rasmi','tidak_rasmi','diterima'].includes(h.statusKeputusan)
  )

  function buatPreview() {
    setErr('')
    if (heatBerkeputusan.length === 0) {
      return setErr('Tiada heat dengan keputusan rasmi lagi. Masukkan keputusan dahulu.')
    }
    if (!setup) {
      return setErr('Tetapan Final (BH/BT) belum ditetapkan. Pergi ke Tetapan Final → Kategori dahulu.')
    }

    const finalis = selectFinalists(heatBerkeputusan, acara, finalSetup, fasa)
    if (finalis.length === 0) {
      return setErr('Tiada finalis dapat dipilih. Semak keputusan heat dan tetapan BH/BT.')
    }

    const jenis = detectJenisLorong(acara)
    let heats

    if (fasa === 'sukuKeSeparuh' && Number(bilanganHeat) > 1) {
      // Serpentine seeding untuk SF
      const ranked = [...finalis].sort((a, b) => isPadang ? b.keputusan - a.keputusan : a.keputusan - b.keputusan)
      const groups = serpentineSeed(ranked, Number(bilanganHeat))
      heats = groups.map((g, i) => ({
        fasa: 'separuh_akhir', noHeat: i + 1,
        peserta: assignLorongHeat(g, jenis, Number(bilanganHeat === 1 ? 8 : 8), LORONG_HEAT_REMOVE),
      }))
    } else {
      // Final — 1 heat, assign lorong
      const ranked = [...finalis].sort((a, b) => isPadang ? b.keputusan - a.keputusan : a.keputusan - b.keputusan)
      const assigned = isPadang || isMass
        ? ranked.map((f, i) => ({ ...f, giliran: i + 1 }))
        : assignLorongFinal(ranked, jenis, LORONG_KUMPULAN)
      heats = [{ fasa: targetFasa, noHeat: 1, peserta: assigned }]
    }

    setPreview({ heats, finalis })
  }

  async function handleSimpan() {
    if (!preview) return
    setSaving(true)
    try {
      // Padam heat lama untuk fasa ini (SF atau Final)
      const existSnap = await getDocs(
        query(collection(db, heatColPath(schoolId, kejId)),
          where('aceraId', '==', aceraKey),
          where('fasa', '==', targetFasa))
      )
      if (!existSnap.empty) {
        const del = writeBatch(db)
        existSnap.docs.forEach(d => del.delete(d.ref))
        await del.commit()
      }

      // Tulis heat baru
      const batch = writeBatch(db)
      for (const h of preview.heats) {
        const heatId = buatHeatId(aceraKey, h.fasa, h.noHeat)
        const ref    = doc(db, heatColPath(schoolId, kejId), heatId)
        batch.set(ref, {
          heatId, aceraId: aceraKey,
          schoolId, kejId,
          fasa: h.fasa, noHeat: h.noHeat,
          status: 'belum_mula',
          peserta: h.peserta.map(p => ({
            noBib:       p.noBib       || '',
            noKP:        p.noKP        || '',
            namaAtlet:   p.namaAtlet   || '',
            kategoriKod: p.kategoriKod || acara.kategoriKod || '',
            kodSekolah:  p.kodSekolah  || '',
            lorong:      p.lorong      ?? null,
            giliran:     p.giliran     ?? null,
            qualifyType: p.qualifyType || 'Q',
            keputusan:   null,
            status:      'belum',
          })),
          finalisDipilih: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: false })
      }
      await batch.commit()
      onDone()
      onClose()
    } catch (e) {
      setErr('Ralat: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between shrink-0">
          <div>
            <h2 className="text-sm font-black text-gray-900">Jana Finalis → {fasaLabel}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{acara.namaAcara}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Status heat */}
          <div className={`rounded-xl px-4 py-3 text-xs ${heatBerkeputusan.length > 0 ? 'bg-green-50 border border-green-100' : 'bg-amber-50 border border-amber-200'}`}>
            <p className={`font-bold ${heatBerkeputusan.length > 0 ? 'text-green-700' : 'text-amber-700'}`}>
              {heatBerkeputusan.length > 0
                ? `✓ ${heatBerkeputusan.length} heat ada keputusan rasmi`
                : '⚠ Tiada heat dengan keputusan rasmi'}
            </p>
            {heatBerkeputusan.length === 0 && (
              <p className="text-amber-600 mt-1">Masukkan keputusan heat dahulu sebelum jana finalis.</p>
            )}
          </div>

          {/* Status tetapan BH/BT */}
          {setup ? (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs">
              <p className="font-bold text-blue-700">✓ Tetapan Final — BH: {setup.bestHeat} · BT: {setup.bestTime}</p>
              <p className="text-blue-500 mt-0.5">
                {heatBerkeputusan.length > 0
                  ? `Jangkaan: ${heatBerkeputusan.length}×${setup.bestHeat} + ${setup.bestTime} = ${heatBerkeputusan.length * setup.bestHeat + setup.bestTime} finalis`
                  : 'Masukkan keputusan heat dahulu'}
              </p>
            </div>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs">
              <p className="font-bold text-red-700">⚠ Tetapan Final belum ditetapkan</p>
              <p className="text-red-500 mt-0.5">Pergi ke tab Tetapan Final dalam Acara &amp; Jadual untuk tetapkan BH/BT dahulu.</p>
            </div>
          )}

          {/* Bilangan heat SF (hanya untuk QF→SF) */}
          {fasa === 'sukuKeSeparuh' && (
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Bilangan Heat SF</label>
              <input type="number" min={1} max={4} value={bilanganHeat}
                onChange={e => { setBH(e.target.value); setPreview(null); setErr('') }}
                className={inputCls + ' max-w-[100px]'} />
              <p className="text-[10px] text-gray-400 mt-1">Finalis diagihkan ikut serpentine seeding WA</p>
            </div>
          )}

          {/* Error */}
          {err && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700 font-semibold">{err}</div>
          )}

          {/* Preview */}
          {preview && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                {preview.finalis.length} finalis → {preview.heats.length} heat {fasaLabel}
              </p>
              {preview.heats.map(h => (
                <div key={h.noHeat} className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-[#003399] flex items-center justify-between">
                    <span className="text-[10px] font-bold text-white">{FASA_LABEL[h.fasa]||h.fasa} {h.noHeat} — {h.peserta.length} peserta</span>
                    <span className="text-[9px] text-blue-200">{buatHeatId(aceraKey, h.fasa, h.noHeat)}</span>
                  </div>
                  <table className="w-full text-[10px]">
                    <tbody>
                      {[...h.peserta].sort((a,b) => isPadang||isMass ? (a.giliran??99)-(b.giliran??99) : (a.lorong??99)-(b.lorong??99))
                        .map((p, idx) => (
                          <tr key={p.noBib||p.noKP||idx} className="border-t border-gray-50">
                            <td className="px-3 py-1 text-center font-black text-[#003399] w-8">{isPadang||isMass?p.giliran:p.lorong}</td>
                            <td className="px-2 py-1 font-mono text-gray-400">{p.noBib}</td>
                            <td className="px-2 py-1 font-semibold text-gray-800">{p.namaAtlet}</td>
                            <td className="px-2 py-1 text-[9px]">
                              <span className={`px-1 py-0.5 rounded font-bold ${p.qualifyType==='Q'?'bg-green-100 text-green-700':'bg-blue-100 text-blue-600'}`}>
                                {p.qualifyType}
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-between items-center gap-2 shrink-0">
          <button onClick={buatPreview} disabled={heatBerkeputusan.length === 0 || !setup}
            className="px-4 py-2 text-xs font-bold border border-[#003399] text-[#003399] rounded-lg hover:bg-blue-50 disabled:opacity-40 transition-colors">
            {preview ? 'Jana Semula' : 'Preview Finalis'}
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-xs text-gray-600 hover:bg-gray-100 rounded-lg">Batal</button>
            <button onClick={handleSimpan} disabled={!preview || saving}
              className="px-5 py-2 text-xs font-bold bg-[#003399] text-white rounded-lg hover:bg-[#002288] disabled:opacity-50">
              {saving ? 'Menyimpan…' : 'Simpan Finalis'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Panel Acara: heat list + cetak ──────────────────────────────────────────

function AcaraHeatPanel({ acara, schoolId, kejId, namaKej, kategoriList, atletMap, onRefresh }) {
  const [heatList,    setHeatList]    = useState([])
  const [peserta,     setPeserta]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [modal,       setModal]       = useState(null) // 'jana' | 'janaFinalisQF' | 'janaFinalisFinal' | { type:'edit', heat }
  const [printing,    setPrinting]    = useState(null) // heatId
  const [finalSetup,  setFinalSetup]  = useState(null)

  const { userRole } = useAuth()
  const canEdit = ['admin','superadmin'].includes(userRole)
  const aceraKey = acara.aceraId || acara.id

  // Peringkat acara — tentukan butang jana finalis yang perlu dipapar
  const isQF = acara.peringkat === 'suku_akhir'
  const isSF = acara.peringkat === 'separuh_akhir'
  const showJanaQFtoSF    = isQF  // QF → SF
  const showJanaSFtoFinal = isSF  // SF → Final
  const showJanaToFinal   = !isQF && !isSF && acara.peringkat !== 'akhir' && acara.peringkat !== 'final'

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [heatSnap, pendSnap, setupSnap] = await Promise.all([
        getDocs(query(collection(db, heatColPath(schoolId, kejId)), where('aceraId', '==', aceraKey), orderBy('noHeat'))),
        getDocs(collection(db, pendColPath(schoolId, kejId))),
        getDoc(doc(db, `tenants/${schoolId}/kejohanan/${kejId}/tetapan`, 'finalSetup')),
      ])
      setHeatList(heatSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      const allPend = pendSnap.docs.map(d => d.data())
      setPeserta(allPend.filter(p => (p.acaraIds || []).includes(aceraKey)))
      setFinalSetup(setupSnap.exists() ? setupSnap.data() : null)
    } catch (ex) { console.error(ex) }
    finally { setLoading(false) }
  }, [schoolId, kejId, aceraKey])

  useEffect(() => { fetchData() }, [fetchData])

  async function handlePadam() {
    if (!window.confirm('Padam semua heat acara ini?')) return
    try {
      const batch = writeBatch(db)
      heatList.forEach(h => batch.delete(doc(db, heatColPath(schoolId, kejId), h.heatId)))
      await batch.commit()
      await updateDoc(doc(db, acaraColPath(schoolId, kejId), aceraKey), { finalDijanaKe: deleteField() }).catch(()=>{})
      setHeatList([])
      onRefresh()
    } catch (e) { alert(e.message) }
  }

  async function handleCetak(heat) {
    setPrinting(heat.heatId)
    try {
      cetakStartListPDF(acara, [heat], namaKej, atletMap, kategoriList)
      await updateDoc(
        doc(db, heatColPath(schoolId, kejId), heat.heatId),
        { bilanganCetak: (heat.bilanganCetak || 0) + 1, tarikhCetak: serverTimestamp() }
      )
      setHeatList(prev => prev.map(h =>
        h.heatId === heat.heatId ? { ...h, bilanganCetak: (h.bilanganCetak||0)+1 } : h
      ))
    } catch (e) { alert(e.message) }
    finally { setPrinting(null) }
  }

  async function handleCetakSemua() {
    if (!heatList.length) return
    cetakStartListPDF(acara, heatList, namaKej, atletMap, kategoriList)
  }

  if (loading) return (
    <div className="flex justify-center py-8">
      <svg className="w-5 h-5 animate-spin text-[#003399]" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
    </div>
  )

  return (
    <div className="space-y-3">
      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500">{peserta.length} peserta · {heatList.length} heat</span>
        <div className="flex-1" />
        {canEdit && heatList.length > 0 && (
          <>
            <button onClick={handleCetakSemua}
              className="flex items-center gap-1.5 text-xs border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">
              {Ikon.print} Cetak Semua
            </button>
            <button onClick={handlePadam}
              className="flex items-center gap-1.5 text-xs border border-red-200 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50">
              {Ikon.padam} Reset Heat
            </button>
          </>
        )}
        {canEdit && (showJanaQFtoSF || showJanaSFtoFinal || showJanaToFinal) && heatList.length > 0 && (
          <>
            {showJanaQFtoSF && (
              <button onClick={() => setModal('janaFinalisQF')}
                className="flex items-center gap-1.5 text-xs bg-teal-600 text-white px-3 py-1.5 rounded-lg hover:bg-teal-700">
                Jana Finalis QF→SF
              </button>
            )}
            {showJanaSFtoFinal && (
              <button onClick={() => setModal('janaFinalisSF')}
                className="flex items-center gap-1.5 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700">
                Jana Finalis SF→Final
              </button>
            )}
            {showJanaToFinal && (
              <button onClick={() => setModal('janaFinalisFinal')}
                className="flex items-center gap-1.5 text-xs bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700">
                Jana Finalis →Final
              </button>
            )}
          </>
        )}
        {canEdit && (
          <button onClick={() => setModal('jana')}
            className="flex items-center gap-1.5 text-xs bg-[#003399] text-white px-3 py-1.5 rounded-lg hover:bg-[#002277]">
            {heatList.length > 0 ? 'Jana Semula' : 'Jana Heat'}
          </button>
        )}
      </div>

      {/* Heat list */}
      {heatList.length === 0 ? (
        <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-6 text-center">
          <p className="text-sm text-gray-400">Belum ada start list untuk acara ini.</p>
          {peserta.length === 0 && <p className="text-xs text-gray-400 mt-1">Daftar atlet dahulu dalam Pendaftaran Atlet.</p>}
        </div>
      ) : heatList.map(heat => {
        const isPadang = ['padang_lompat','padang_balin'].includes(acara.jenisAcara)
        const isMass   = acara.jenisAcara === 'mass_start'
        const sorted   = [...(heat.peserta||[])].sort((a,b) => isPadang||isMass ? (a.giliran??99)-(b.giliran??99) : (a.lorong??99)-(b.lorong??99))
        return (
          <div key={heat.heatId} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 bg-[#003399] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FasaBadge fasa={heat.fasa} />
                <span className="text-xs font-bold text-white">{heat.noHeat}</span>
                <span className="text-[9px] text-blue-200">#{heat.heatId}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {heat.bilanganCetak > 0 && (
                  <span className="text-[9px] text-blue-200">Cetak: {heat.bilanganCetak}×</span>
                )}
                {canEdit && (
                  <button onClick={() => setModal({ type: 'edit', heat })}
                    className="text-blue-200 hover:text-white p-1">{Ikon.edit}</button>
                )}
                <button onClick={() => handleCetak(heat)}
                  disabled={printing === heat.heatId}
                  className="flex items-center gap-1 text-[9px] font-bold bg-white/20 hover:bg-white/30 text-white px-2 py-1 rounded disabled:opacity-50">
                  {printing === heat.heatId ? '…' : Ikon.print}
                  <span>PDF</span>
                </button>
              </div>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-center text-[9px] font-bold text-gray-400 w-10">{isPadang||isMass?'Gil':'Lorong'}</th>
                  <th className="px-3 py-2 text-left text-[9px] font-bold text-gray-400">BIB</th>
                  <th className="px-3 py-2 text-left text-[9px] font-bold text-gray-400">Nama</th>
                  <th className="px-3 py-2 text-left text-[9px] font-bold text-gray-400 hidden sm:table-cell">Kategori</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, idx) => (
                  <tr key={p.noBib||p.noKP||idx} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2 text-center font-black text-[#003399]">{isPadang||isMass ? p.giliran : p.lorong}</td>
                    <td className="px-3 py-2 font-mono text-gray-700">{p.noBib || '—'}</td>
                    <td className="px-3 py-2 font-semibold text-gray-800">{p.namaAtlet || atletMap[p.noKP]?.nama || '—'}</td>
                    <td className="px-3 py-2 hidden sm:table-cell">
                      <span className="text-[9px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">{katLabel(p.kategoriKod, kategoriList) || '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}

      {/* Modals */}
      {modal === 'jana' && (
        <JanaHeatModal
          acara={acara}
          peserta={peserta}
          schoolId={schoolId}
          kejId={kejId}
          onClose={() => setModal(null)}
          onDone={() => { fetchData(); onRefresh() }}
        />
      )}
      {modal?.type === 'edit' && (
        <EditLorongModal
          heat={modal.heat}
          acara={acara}
          schoolId={schoolId}
          kejId={kejId}
          onClose={() => setModal(null)}
          onSaved={fetchData}
        />
      )}
      {(modal === 'janaFinalisQF' || modal === 'janaFinalisSF' || modal === 'janaFinalisFinal') && (
        <JanaFinalisModal
          acara={acara}
          heatList={heatList}
          finalSetup={finalSetup}
          fasa={modal === 'janaFinalisQF' ? 'sukuKeSeparuh' : 'toFinal'}
          schoolId={schoolId}
          kejId={kejId}
          kategoriList={kategoriList}
          onClose={() => setModal(null)}
          onDone={() => { fetchData(); onRefresh() }}
        />
      )}
    </div>
  )
}

// ─── Halaman Utama ────────────────────────────────────────────────────────────

export default function StartListSetup() {
  const navigate = useNavigate()
  const { userData, logout } = useAuth()
  const isSuperadmin  = userData?.role === 'superadmin'
  const isPencatat    = userData?.role === 'pencatat'
  const pencatatSlug  = userData?.schoolSlug || ''

  const ctx      = getKejContext()
  const schoolId = ctx.schoolId || ''
  const kejId    = ctx.id       || ''
  const namaKej  = ctx.namaKejohanan || ctx.nama || ''

  function navBack() {
    if (isPencatat) return navigate(`/${pencatatSlug}/pencatat/input-keputusan`)
    return navigate(`/admin/kejohanan/${kejId}`)
  }
  function navGuardBack() {
    if (isPencatat) return navigate(`/${pencatatSlug}/pencatat/input-keputusan`)
    return navigate('/admin')
  }

  const [acaraList,      setAcaraList]      = useState([])
  const [kategoriList,   setKategoriList]   = useState([])
  const [atletMap,       setAtletMap]       = useState({})   // noKP → atlet
  const [heatCountMap,   setHeatCountMap]   = useState({})   // aceraId → count
  const [pesertaCountMap,setPesertaCountMap]= useState({})   // aceraId → count
  const [selectedAcara,  setSelectedAcara]  = useState(null)
  const [loading,        setLoading]        = useState(true)
  const [cari,           setCari]           = useState('')
  const [filterKat,      setFilterKat]      = useState('semua')
  const [tick,           setTick]           = useState(0)

  // Guard
  if (!schoolId || !kejId) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm text-gray-500 font-semibold">Tiada kejohanan dipilih.</p>
        <button onClick={navGuardBack}
          className="text-xs text-[#003399] border border-[#003399] rounded-xl px-4 py-2 hover:bg-[#003399] hover:text-white transition-colors">
          ← Balik Dashboard
        </button>
      </div>
    )
  }

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      // WA config
      const waSnap = await getDoc(doc(db, ...waDocPath(schoolId, kejId)))
      if (waSnap.exists()) {
        const d = waSnap.data()
        if (d.lorongKumpulan) {
          const parsed = {}
          Object.entries(d.lorongKumpulan).forEach(([jenis, grps]) => {
            parsed[jenis] = grps.map(s => String(s).split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v)))
          })
          LORONG_KUMPULAN = { ...WA_LORONG_KUMPULAN_DEFAULT, ...parsed }
        }
        if (d.lorongHeatRemove) {
          const parsed = {}
          Object.entries(d.lorongHeatRemove).forEach(([jenis, arr]) => {
            parsed[jenis] = String(arr).split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v))
          })
          LORONG_HEAT_REMOVE = { ...WA_LORONG_HEAT_REMOVE, ...parsed }
        }
      }

      const [acaraSnap, katSnap, atletSnap, pendSnap] = await Promise.all([
        getDocs(query(collection(db, acaraColPath(schoolId, kejId)), orderBy('noAcara'))),
        getDocs(query(collection(db, `tenants/${schoolId}/kejohanan/${kejId}/kategori`), orderBy('urutan'))),
        getDocs(collection(db, atletColPath(schoolId))),
        getDocs(collection(db, pendColPath(schoolId, kejId))),
      ])

      const acara = acaraSnap.docs.map(d => ({ id: d.id, aceraId: d.data().aceraId || d.id, ...d.data() }))
      setAcaraList(acara)
      setKategoriList(katSnap.docs.map(d => ({ id: d.id, ...d.data() })))

      const am = {}
      atletSnap.docs.forEach(d => { am[d.id] = d.data() })
      setAtletMap(am)

      // Peserta count per acara
      const pm = {}
      pendSnap.docs.forEach(d => {
        const p = d.data()
        ;(p.acaraIds || []).forEach(aid => { pm[aid] = (pm[aid] || 0) + 1 })
      })
      setPesertaCountMap(pm)

      // Heat count per acara — 1 query sahaja (flat collection)
      const hm = {}
      const allHeatSnap = await getDocs(collection(db, heatColPath(schoolId, kejId))).catch(() => ({ docs: [] }))
      allHeatSnap.docs.forEach(d => {
        const aid = d.data().aceraId
        if (aid) hm[aid] = (hm[aid] || 0) + 1
      })
      setHeatCountMap(hm)
    } catch (ex) { console.error(ex) }
    finally { setLoading(false) }
  }, [schoolId, kejId, tick])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Senarai unik kategori untuk filter
  const katOptions = useMemo(() => {
    const kods = [...new Set(acaraList.map(a => a.kategoriKod).filter(Boolean))]
    return kods.map(k => ({ k, lbl: katLabel(k, kategoriList) })).sort((a,b) => a.lbl.localeCompare(b.lbl))
  }, [acaraList, kategoriList])

  const filtered = acaraList.filter(a => {
    if (filterKat !== 'semua' && a.kategoriKod !== filterKat) return false
    if (cari) {
      const q = cari.toLowerCase()
      if (!a.namaAcara?.toLowerCase().includes(q) &&
          !String(a.noAcara).includes(q) &&
          !a.kategoriKod?.toLowerCase().includes(q)) return false
    }
    return true
  })

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Superadmin banner */}
      {isSuperadmin && (
        <div className="bg-amber-400 text-amber-900 px-4 py-2 flex items-center justify-between text-xs font-bold">
          <span>⚡ Mode Superadmin</span>
          <button onClick={() => { sessionStorage.removeItem('gp_view_school'); navigate('/superadmin') }}
            className="underline hover:no-underline">
            ← Balik ke Panel Superadmin
          </button>
        </div>
      )}

      {/* Header */}
      <header className="bg-[#003399] text-white px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <button onClick={navBack}
            className="text-white/60 hover:text-white transition-colors p-1 -ml-1">
            {Ikon.balik}
          </button>
          <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center shrink-0">
            {Ikon.trophy}
          </div>
          <div className="min-w-0">
            <p className="text-[9px] text-white/50 uppercase tracking-widest">Gold Podium</p>
            <p className="text-sm font-bold leading-tight truncate">{namaKej || 'Start List'}</p>
          </div>
        </div>
        <button onClick={async () => { await logout(); navigate('/login') }}
          className="text-white/60 hover:text-white transition-colors p-1.5 flex items-center gap-1.5 text-xs shrink-0">
          {Ikon.keluar}
          <span className="hidden sm:block">Log Keluar</span>
        </button>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-5 space-y-4">

        {/* Filter + cari */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" value={cari} onChange={e => setCari(e.target.value)}
              placeholder="Cari nama acara, no…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#003399]/20 bg-white" />
          </div>
          <select value={filterKat} onChange={e => setFilterKat(e.target.value)}
            className="text-xs border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#003399]/20">
            <option value="semua">Semua Kategori</option>
            {katOptions.map(o => <option key={o.k} value={o.k}>{o.lbl}</option>)}
          </select>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Jumlah Acara', val: acaraList.length, cls: 'text-[#003399]' },
            { label: 'Ada Heat', val: Object.values(heatCountMap).filter(v=>v>0).length, cls: 'text-green-600' },
            { label: 'Belum Heat', val: acaraList.filter(a=>!heatCountMap[a.aceraId||a.id]).length, cls: 'text-orange-500' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-100 rounded-xl p-3 text-center">
              <p className={`text-xl font-black ${s.cls}`}>{s.val}</p>
              <p className="text-[9px] text-gray-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Senarai acara — table by kategori (KOAM pattern) */}
        {loading ? (
          <div className="flex justify-center py-12">
            <svg className="w-5 h-5 animate-spin text-[#003399]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          </div>
        ) : (() => {
          // Kumpul by kategori ikut urutan
          const katUnik = [...new Set(filtered.map(a => a.kategoriKod).filter(Boolean))]
            .map(kod => ({ kod, kat: kategoriList.find(k => k.kod === kod) }))
            .sort((a, b) => (a.kat?.urutan || 99) - (b.kat?.urutan || 99))

          if (filtered.length === 0) return (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
              <p className="text-sm text-gray-400">Tiada acara dijumpai.</p>
            </div>
          )

          return (
            <div className="space-y-4">
              {katUnik.map(({ kod, kat }) => {
                const acaraKat = filtered.filter(a => a.kategoriKod === kod)
                return (
                  <div key={kod} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    {/* Header kategori */}
                    <div className="px-4 py-2.5 flex items-center gap-2"
                      style={{ backgroundColor: kat?.warna || '#003399' }}>
                      <span className="text-xs font-black text-white">{kat?.label || kod}</span>
                      <span className="text-[10px] text-white/60">{acaraKat.length} acara</span>
                    </div>

                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-50 bg-gray-50">
                          <th className="px-3 py-2 text-left text-[9px] font-bold text-gray-400 w-10">No</th>
                          <th className="px-3 py-2 text-left text-[9px] font-bold text-gray-400">Acara</th>
                          <th className="px-3 py-2 text-center text-[9px] font-bold text-gray-400 w-16">Peserta</th>
                          <th className="px-3 py-2 text-center text-[9px] font-bold text-gray-400 w-14">Heat</th>
                          <th className="px-3 py-2 w-48"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {acaraKat.map((a, i) => {
                          const aid     = a.aceraId || a.id
                          const heatCnt = heatCountMap[aid] || 0
                          const pCnt    = pesertaCountMap[aid] || 0
                          const isSelected = selectedAcara?.id === a.id
                          const isFinal = !!a.parentAcaraId
                          const isQF    = a.peringkat === 'suku_akhir'
                          const isSF    = a.peringkat === 'separuh_akhir'

                          const peringkatBadge = isFinal
                            ? <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">FINAL</span>
                            : isQF
                            ? <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700">QF</span>
                            : isSF
                            ? <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">SF</span>
                            : null

                          return (
                            <tr key={aid}
                              className={`border-t border-gray-50 transition-colors ${isSelected ? 'bg-blue-50/40' : 'hover:bg-gray-50/60'} ${isFinal ? 'bg-purple-50/10' : ''}`}>
                              <td className={`py-2.5 text-[10px] font-mono text-gray-400 ${isFinal ? 'pl-6' : 'pl-3'}`}>
                                {isFinal ? '└' : ''}{a.noAcara || '—'}
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {peringkatBadge}
                                  <span className="font-semibold text-gray-800">{a.namaAcara}</span>
                                </div>
                                {isFinal && a.parentAcaraId && (
                                  <p className="text-[8px] text-purple-400 mt-0.5">← #{a.parentAcaraId}</p>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-center font-bold text-gray-700">
                                {pCnt > 0 ? pCnt : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-3 py-2.5 text-center font-bold text-[#003399]">
                                {heatCnt > 0
                                  ? <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[9px] font-bold">{heatCnt}</span>
                                  : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center justify-end gap-1.5">
                                  {heatCnt > 0 && (
                                    <button
                                      onClick={() => setSelectedAcara(isSelected ? null : a)}
                                      className={`text-[9px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${
                                        isSelected
                                          ? 'bg-[#003399] text-white border-[#003399]'
                                          : 'border-[#003399] text-[#003399] hover:bg-blue-50'
                                      }`}>
                                      {isSelected ? '✕ Tutup' : 'Lihat →'}
                                    </button>
                                  )}
                                  {pCnt > 0 && (
                                    <button
                                      onClick={() => {
                                        setSelectedAcara(a)
                                        // trigger modal jana dari AcaraHeatPanel via ref tidak diperlukan
                                        // — user klik Lihat → then Jana Heat dalam panel
                                        if (heatCnt === 0) setSelectedAcara(a)
                                      }}
                                      className={`text-[9px] font-bold px-2.5 py-1 rounded-lg transition-colors shadow-sm ${
                                        heatCnt > 0
                                          ? 'border border-amber-300 text-amber-700 hover:bg-amber-50'
                                          : 'bg-[#003399] text-white hover:bg-[#002288]'
                                      }`}>
                                      {heatCnt > 0 ? 'Jana Semula' : 'Jana Heat'}
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })}

              {/* Panel heat — tunjuk di bawah table bila acara dipilih */}
              {selectedAcara && (
                <div className="bg-white rounded-2xl border-2 border-[#003399]/20 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 bg-[#003399]/5 border-b border-[#003399]/10 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black text-[#003399]">{selectedAcara.namaAcara}</p>
                      <p className="text-[9px] text-gray-400 mt-0.5">Start List — Heat & Lorong</p>
                    </div>
                    <button onClick={() => setSelectedAcara(null)}
                      className="text-gray-400 hover:text-gray-600 text-xl leading-none font-bold">×</button>
                  </div>
                  <div className="px-4 py-4">
                    <AcaraHeatPanel
                      acara={selectedAcara}
                      schoolId={schoolId}
                      kejId={kejId}
                      namaKej={namaKej}
                      kategoriList={kategoriList}
                      atletMap={atletMap}
                      onRefresh={() => setTick(t => t + 1)}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })()}

      </div>
    </div>
  )
}
