/**
 * HealthCheck — /dashboard/healthcheck
 * Semak integriti data sistem KOAM secara on-demand.
 * Laporan sahaja — tiada auto-fix.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, getDocs, getDocsFromServer, query, where, doc, deleteDoc, updateDoc, setDoc, getDoc, writeBatch, serverTimestamp, deleteField } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Badge({ type }) {
  if (type === 'ok')   return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">✓ OK</span>
  if (type === 'warn') return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">⚠ Amaran</span>
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">✕ Ralat</span>
}

function Section({ title, checks }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
        <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">{title}</p>
      </div>
      <div className="divide-y divide-gray-100">
        {checks.map((c, i) => (
          <div key={i} className="px-4 py-3">
            <div className="flex items-start gap-3">
              <Badge type={c.status} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800">{c.label}</p>
                {c.count != null && c.status !== 'ok' && (
                  <p className="text-[11px] text-gray-500 mt-0.5">{c.count} rekod terjejas</p>
                )}
                {c.details && c.details.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {c.details.slice(0, 10).map((d, j) => (
                      <p key={j} className="text-[10px] font-mono bg-gray-50 rounded px-2 py-1 text-gray-600 break-all">{d}</p>
                    ))}
                    {c.details.length > 10 && (
                      <p className="text-[10px] text-gray-400">...dan {c.details.length - 10} lagi</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function HealthCheck() {
  const { userData } = useAuth()
  const navigate = useNavigate()
  const schoolId = userData?.schoolId || ''
  const [running, setRunning]   = useState(false)
  const [result, setResult]     = useState(null)
  const [progress, setProgress] = useState('')

  // ── Bersih Badge Rekod ────────────────────────────────────────────────────────
  const [badgeRunning, setBadgeRunning] = useState(false)
  const [badgeImbas, setBadgeImbas]     = useState(null)
  const [badgeBuang, setBadgeBuang]     = useState(false)
  const [badgeDone, setBadgeDone]       = useState(null)

  async function jalanImbas() {
    setBadgeRunning(true)
    setBadgeImbas(null)
    setBadgeDone(null)
    try {
      const kejId = await getKejId()

      // Load semua rekod — bina map: jantina_kategoriKod → rekod terbaik { prestasi, unit }
      // Guna kategoriKod+jantina sahaja — nama acara format berbeza-beza
      const rekodSnap = await getDocs(collection(db, 'tenants', schoolId, 'rekod'))
      const rekodMap = {}
      for (const r of rekodSnap.docs) {
        const d = r.data()
        if (r.id.endsWith('_tuntutan')) continue
        const k = `${d.jantina||''}_${d.kategoriKod||''}`
        const unit = d.unit || 's'
        const prestasi = Number(d.prestasi)
        if (!rekodMap[k]) {
          rekodMap[k] = { prestasi, unit }
        } else {
          // ambil rekod terbaik: larian = terkecil, padang = terbesar
          if (unit === 's' && prestasi < rekodMap[k].prestasi) rekodMap[k] = { prestasi, unit }
          if (unit !== 's' && prestasi > rekodMap[k].prestasi) rekodMap[k] = { prestasi, unit }
        }
      }

      // normaliseSaat — sama seperti postRasmiUtils: format lama mm.ss (< 10 minit) → saat tulen
      function normaliseSaat(val) {
        const n = Number(val)
        if (isNaN(n)) return null
        // format lama: nilai < 10 bermaksud mm.ss (cth 2.58 = 2 min 58s)
        if (n < 10) {
          const mm = Math.floor(n)
          const ss = Math.round((n - mm) * 100)
          return mm * 60 + ss
        }
        // format baru: saat tulen (cth 178.34)
        // format lama panjang: cth 28.06 = 28 min 6s — nilai > 10 tapi masih mm.ss
        // detect: bahagian perpuluhan ≤ 0.59 dan nilai keseluruhan boleh jadi minit
        const fracPart = n - Math.floor(n)
        if (fracPart <= 0.595 && Math.floor(n) >= 1) {
          // semak jika ini mungkin mm.ss — jika prestasi > 10 min dalam saat tulen mustahil untuk acara biasa
          // heuristik: jika nilai < 100 dan ada perpuluhan ≤ 0.59, anggap mm.ss
          if (n < 100 && fracPart > 0) {
            const mm = Math.floor(n)
            const ss = Math.round(fracPart * 100)
            if (ss < 60) return mm * 60 + ss
          }
        }
        return n
      }

      const acaraSnap = await getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'acara'))
      const senarai = []
      for (const acaraDoc of acaraSnap.docs) {
        const ad = acaraDoc.data()
        const rekodKey = `${ad.jantina||''}_${ad.kategoriKod||''}`
        const rekodSemasa = rekodMap[rekodKey] || null

        const heatSnap = await getDocs(query(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat'), where('aceraId', '==', acaraDoc.id)))
        for (const hDoc of heatSnap.docs) {
          const hd = hDoc.data()
          const peserta = hd.peserta || []
          const badgePeserta = peserta.filter(p => p.pecahRekod || p.samaiRekod)
          if (badgePeserta.length === 0) continue

          const pesertaInfo = badgePeserta.map(p => {
            let statusPrestasi = 'tiada_rekod'
            let notaTally = ''
            if (rekodSemasa && p.keputusan != null && p.keputusan !== '') {
              const prestasiAtlet = Number(p.keputusan)
              const rekorSaat    = normaliseSaat(rekodSemasa.prestasi)
              const atletSaat    = prestasiAtlet // data baru sudah saat tulen
              if (rekodSemasa.unit === 's') {
                // larian: lebih kecil = lebih baik
                if (atletSaat <= rekorSaat)      statusPrestasi = 'betul'
                else                             statusPrestasi = 'salah'
                notaTally = `atlet=${atletSaat?.toFixed(2)}s rekod=${rekorSaat?.toFixed(2)}s`
              } else {
                // padang: lebih besar = lebih baik
                if (prestasiAtlet >= rekodSemasa.prestasi) statusPrestasi = 'betul'
                else                                        statusPrestasi = 'salah'
                notaTally = `atlet=${prestasiAtlet} rekod=${rekodSemasa.prestasi}`
              }
            } else if (!rekodSemasa) {
              statusPrestasi = 'tiada_rekod'
              notaTally = 'tiada rekod dalam sistem'
            } else {
              statusPrestasi = 'tiada_prestasi'
              notaTally = 'tiada keputusan dalam heat'
            }
            return {
              teks:   `${p.noBib || '—'} ${p.namaAtlet || '—'}`,
              jenis:  p.pecahRekod ? '🏆 pecah' : '🤝 samai',
              statusPrestasi,
              notaTally,
            }
          })

          // Heat SAH jika SEMUA badge peserta prestasi betul
          const adaSalah = pesertaInfo.some(p => p.statusPrestasi === 'salah')
          const adaTiadaRekod = pesertaInfo.some(p => p.statusPrestasi === 'tiada_rekod')
          const adaRekod = !adaTiadaRekod && !adaSalah

          senarai.push({
            acaraId:    acaraDoc.id,
            heatId:     hDoc.id,
            label:      `#${ad.noAcara || acaraDoc.id} ${ad.namaAcara || '—'} — Heat ${hd.noHeat || hDoc.id}`,
            adaRekod,
            peserta:    pesertaInfo,
            hRef:       hDoc.ref,
            allPeserta: peserta,
          })
        }
      }
      setBadgeImbas({ senarai, kejId })
    } catch (e) {
      setBadgeImbas({ senarai: [], error: e.message })
    }
    setBadgeRunning(false)
  }

  async function jalanBuangBadge() {
    if (!badgeImbas) return
    // Buang yang tiada rekod ATAU prestasi tidak layak
    const sasaran = badgeImbas.senarai.filter(item => !item.adaRekod)
    if (sasaran.length === 0) return
    if (!window.confirm(`Buang badge TIDAK SAH dari ${sasaran.length} heat?\n\nBadge yang SAH TIDAK akan disentuh.`)) return
    setBadgeBuang(true)
    let heatDikemas = 0, pesertaDikemas = 0
    try {
      for (const item of sasaran) {
        const newPeserta = item.allPeserta.map(p => {
          if (p.pecahRekod || p.samaiRekod) {
            const { pecahRekod, samaiRekod, ...rest } = p
            return rest
          }
          return p
        })
        await updateDoc(item.hRef, { peserta: newPeserta })
        heatDikemas++
        pesertaDikemas += item.peserta.length
      }
      setBadgeDone({ heat: heatDikemas, badge: pesertaDikemas })
      setBadgeImbas(null)
    } catch (e) {
      setBadgeDone({ error: e.message })
    }
    setBadgeBuang(false)
  }

  // ── Buang SEMUA Badge + Pulih Badge ─────────────────────────────────────────
  const [buangSemuaRunning, setBuangSemuaRunning] = useState(false)
  const [buangSemuaDone,    setBuangSemuaDone]    = useState(null)
  const [pulihRunning,      setPulihRunning]      = useState(false)
  const [pulihDone,         setPulihDone]         = useState(null)

  async function jalanBuangSemua() {
    if (!window.confirm('Buang SEMUA badge 🏆 rekod pecah dari Home?\n\nData rekod & tuntutan TIDAK disentuh. Boleh dipulihkan kemudian.')) return
    setBuangSemuaRunning(true)
    setBuangSemuaDone(null)
    try {
      const kejId = await getKejId()
      const acaraSnap = await getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'acara'))
      let heatDikemas = 0
      for (const aDoc of acaraSnap.docs) {
        const heatSnap = await getDocs(query(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat'), where('aceraId', '==', aDoc.id)))
        for (const hDoc of heatSnap.docs) {
          const peserta = hDoc.data().peserta || []
          const adaBadge = peserta.some(p => p.pecahRekod || p.samaiRekod)
          if (!adaBadge) continue
          const newPeserta = peserta.map(p => {
            const { pecahRekod, samaiRekod, ...rest } = p
            return rest
          })
          await updateDoc(hDoc.ref, { peserta: newPeserta })
          heatDikemas++
        }
      }
      setBuangSemuaDone({ ok: true, heat: heatDikemas })
    } catch (e) {
      setBuangSemuaDone({ ok: false, error: e.message })
    }
    setBuangSemuaRunning(false)
  }

  async function jalanPulihBadge() {
    if (!window.confirm('Pulih badge 🏆 rekod pecah berdasarkan data rekod_tuntutan?\n\nIni akan tulis semula pecahRekod pada peserta yang ada tuntutan rekod.')) return
    setPulihRunning(true)
    setPulihDone(null)
    try {
      const kejId = await getKejId()
      // Load semua rekod_tuntutan untuk kejohanan ini
      const tuntSnap = await getDocs(query(collection(db, 'tenants', schoolId, 'rekod'), where('kejohananId', '==', kejId)))
      if (tuntSnap.empty) { setPulihDone({ ok: true, heat: 0, nota: 'Tiada rekod_tuntutan dijumpai.' }); setPulihRunning(false); return }

      // Group tuntutan by acaraId+heatId
      const tuntByHeat = {}
      for (const tDoc of tuntSnap.docs) {
        const t = tDoc.data()
        if (!t.acaraId || !t.heatId || !t.noKP) continue
        const key = `${t.acaraId}__${t.heatId}`
        if (!tuntByHeat[key]) tuntByHeat[key] = []
        tuntByHeat[key].push({ noKP: t.noKP, peringkat: t.peringkat || 'D' })
      }

      let heatDikemas = 0
      for (const [key, tuntList] of Object.entries(tuntByHeat)) {
        const [acaraId, heatId] = key.split('__')
        const hRef = doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat', heatId)
        const hSnap = await getDocs(query(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat'), where('aceraId', '==', acaraId)))
        const hDoc = hSnap.docs.find(d => d.id === heatId)
        if (!hDoc) continue
        const peserta = hDoc.data().peserta || []
        let ada = false
        const newPeserta = peserta.map(p => {
          const match = tuntList.find(t => t.noKP === p.noKP)
          if (match) { ada = true; return { ...p, pecahRekod: match.peringkat } }
          return p
        })
        if (ada) {
          await updateDoc(hRef, { peserta: newPeserta })
          heatDikemas++
        }
      }
      setPulihDone({ ok: true, heat: heatDikemas })
    } catch (e) {
      setPulihDone({ ok: false, error: e.message })
    }
    setPulihRunning(false)
  }

  // ── Reset Keputusan Acara ─────────────────────────────────────────────────────
  const [resetAcaraId, setResetAcaraId] = useState('')
  const [resetLog, setResetLog]         = useState([])
  const [resetting, setResetting]       = useState(false)

  async function jalanResetAcara() {
    const acaraId = resetAcaraId.trim()
    if (!acaraId) { setResetLog(['❌ Masukkan No Acara dahulu.']); return }
    if (!window.confirm(`Reset SEMUA keputusan dalam acara ${acaraId}?\n\nPeserta dan lorong KEKAL. Hanya keputusan, rankDalamHeat dan status akan dikosongkan.`)) return
    setResetting(true)
    setResetLog([`🔍 Mencari acara ${acaraId}...`])
    try {
      const kejId = await getKejId()
      const heatSnap = await getDocs(query(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat'), where('aceraId', '==', acaraId)))
      if (heatSnap.empty) { setResetLog(l => [...l, '⚠ Tiada heat dijumpai untuk acara ini.']); setResetting(false); return }
      setResetLog(l => [...l, `✓ Jumpa ${heatSnap.docs.length} heat`])
      for (const hDoc of heatSnap.docs) {
        const peserta = hDoc.data().peserta || []
        const resetPeserta = peserta.map(p => ({
          ...p,
          keputusan:     null,
          rankDalamHeat: null,
          status:        'belum',
          cubaan:        p.cubaan ? p.cubaan.map(() => null) : p.cubaan,
          pecahRekod:    undefined,
          samaiRekod:    undefined,
        })).map(p => {
          const { pecahRekod, samaiRekod, ...rest } = p
          return rest
        })
        await updateDoc(hDoc.ref, {
          peserta:         resetPeserta,
          statusKeputusan: 'kosong',
          postRasmiSelesai: false,
        })
        setResetLog(l => [...l, `✓ Heat ${hDoc.id} — ${peserta.length} peserta direset`])
      }
      setResetLog(l => [...l, '✅ Selesai. Semua keputusan acara ' + acaraId + ' telah dikosongkan.'])
    } catch (e) {
      setResetLog(l => [...l, '❌ Ralat: ' + e.message])
    }
    setResetting(false)
  }

  // ── Pindah Peserta Antara Heat ───────────────────────────────────────────────
  const [pindahAcaraId, setPindahAcaraId] = useState('')
  const [pindahNoBib,   setPindahNoBib]   = useState('')
  const [pindahDariH,   setPindahDariH]   = useState('')
  const [pindahKeH,     setPindahKeH]     = useState('')
  const [pindahLorong,  setPindahLorong]  = useState('')
  const [pindahLog,     setPindahLog]     = useState([])
  const [pindahing,     setPindahing]     = useState(false)

  async function jalanPindah() {
    const acaraId = pindahAcaraId.trim()
    const noBib   = pindahNoBib.trim().toUpperCase()
    const dariH   = pindahDariH.trim()
    const keH     = pindahKeH.trim()
    const lorong  = Number(pindahLorong.trim())
    if (!acaraId || !noBib || !dariH || !keH || !lorong) {
      setPindahLog(['❌ Semua field wajib diisi.']); return
    }
    if (!window.confirm(`Pindah ${noBib} dari Heat ${dariH} ke Heat ${keH} Lorong ${lorong}?\n\nTindakan ini tidak boleh dibatalkan.`)) return
    setPindahing(true)
    setPindahLog([`🔍 Mencari kejohanan aktif...`])
    try {
      const kejId = await getKejId()
      const dariRef = doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat', `${acaraId}-H${dariH}`)
      const keRef   = doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat', `${acaraId}-H${keH}`)

      const dariDoc = await getDocs(query(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat'), where('aceraId', '==', acaraId)))
      const dariHDoc = dariDoc.docs.find(d => d.id === `${acaraId}-H${dariH}`)
      const keHDoc   = dariDoc.docs.find(d => d.id === `${acaraId}-H${keH}`)

      if (!dariHDoc) { setPindahLog(l => [...l, `❌ Heat ${dariH} tidak dijumpai.`]); setPindahing(false); return }
      if (!keHDoc)   { setPindahLog(l => [...l, `❌ Heat ${keH} tidak dijumpai.`]); setPindahing(false); return }

      const dariPeserta = dariHDoc.data().peserta || []
      const kePeserta   = keHDoc.data().peserta   || []

      // Cari peserta dalam heat asal
      const targetIdx = dariPeserta.findIndex(p => (p.noBib || '').toUpperCase() === noBib)
      if (targetIdx === -1) { setPindahLog(l => [...l, `❌ ${noBib} tidak dijumpai dalam Heat ${dariH}.`]); setPindahing(false); return }

      const targetP = { ...dariPeserta[targetIdx], lorong, status: 'belum', keputusan: null, rankDalamHeat: null }

      // Semak lorong destinasi kosong
      const lorongDuduki = kePeserta.find(p => p.lorong === lorong)
      if (lorongDuduki) { setPindahLog(l => [...l, `❌ Lorong ${lorong} dalam Heat ${keH} dah ada peserta: ${lorongDuduki.noBib}.`]); setPindahing(false); return }

      // Buang dari heat asal
      const newDariPeserta = dariPeserta.filter((_, i) => i !== targetIdx)
      // Tambah ke heat destinasi
      const newKePeserta = [...kePeserta, targetP].sort((a, b) => (a.lorong || 0) - (b.lorong || 0))

      await updateDoc(dariHDoc.ref, { peserta: newDariPeserta, updatedAt: serverTimestamp() })
      await updateDoc(keHDoc.ref,   { peserta: newKePeserta,   updatedAt: serverTimestamp() })

      setPindahLog(l => [...l,
        `✓ ${noBib} dibuang dari Heat ${dariH}`,
        `✓ ${noBib} ditambah ke Heat ${keH} Lorong ${lorong}`,
        `✅ Selesai.`
      ])
    } catch (e) {
      setPindahLog(l => [...l, '❌ Ralat: ' + e.message])
    }
    setPindahing(false)
  }

  // ── Panel Pembaikan Khas ──────────────────────────────────────────────────────
  const [fixNoKP, setFixNoKP]         = useState('')
  const [fixAceraId, setFixAceraId]   = useState('')
  const [fixKodSkl, setFixKodSkl]     = useState('')
  const [fixLog, setFixLog]           = useState([])
  const [fixing, setFixing]           = useState(false)

  async function getKejId() {
    const kejSnap = await getDocs(query(collection(db, 'tenants', schoolId, 'kejohanan'), where('statusKejohanan', '==', 'aktif')))
    if (kejSnap.empty) throw new Error('Tiada kejohanan aktif.')
    return kejSnap.docs[0].id
  }

  // ── Baiki Rekod ──────────────────────────────────────────────────────────────
  const [brkNoAcara,     setBrkNoAcara]     = useState('')
  const [brkSenarai,     setBrkSenarai]     = useState(null)   // senarai rekod untuk noAcara ini
  const [brkLoading,     setBrkLoading]     = useState(false)
  const [brkPilihan,     setBrkPilihan]     = useState(null)   // rekod yang dipilih untuk edit
  const [brkForm,        setBrkForm]        = useState(null)   // nilai baru
  const [brkPreview,     setBrkPreview]     = useState(false)  // tunjuk before/after
  const [brkSaving,      setBrkSaving]      = useState(false)
  const [brkLog,         setBrkLog]         = useState([])
  // Undo
  const [brkArkibList,   setBrkArkibList]   = useState(null)   // senarai arkib untuk noAcara
  const [brkUndoLoading, setBrkUndoLoading] = useState(false)
  const [brkUndoPilihan, setBrkUndoPilihan] = useState(null)

  function formatPrestasiHC(val, unit) {
    if (val === null || val === undefined || val === '') return '—'
    const v = Number(val)
    if (isNaN(v)) return String(val)
    if (unit === 's') {
      if (v >= 60) {
        const m = Math.floor(v / 60)
        const s = (v - m * 60).toFixed(2).padStart(5, '0')
        return `${m}:${s}`
      }
      return v.toFixed(2) + 's'
    }
    if (unit === 'm') return v.toFixed(2) + 'm'
    return String(v)
  }

  async function brkCariRekod() {
    const noAcara = brkNoAcara.trim()
    if (!noAcara) return
    setBrkLoading(true)
    setBrkSenarai(null)
    setBrkPilihan(null)
    setBrkForm(null)
    setBrkPreview(false)
    setBrkLog([])
    setBrkArkibList(null)
    setBrkUndoPilihan(null)
    try {
      const kejId = await getKejId()
      // Cari acara by noAcara
      const acaraSnap = await getDocs(query(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'acara'), where('noAcara', '==', Number(noAcara))))
      if (acaraSnap.empty) { setBrkLog([`❌ Acara #${noAcara} tidak dijumpai.`]); setBrkLoading(false); return }
      const acaraData = { id: acaraSnap.docs[0].id, ...acaraSnap.docs[0].data() }

      // Cari rekod berkaitan: by namaAcara + kategoriKod + jantina
      const rekodSnap = await getDocs(collection(db, 'tenants', schoolId, 'rekod'))
      const namaAcara = acaraData.namaAcara || ''
      const kategoriKod = acaraData.kategoriKod || ''
      const jantina = acaraData.jantina || ''

      const senarai = rekodSnap.docs
        .filter(d => !d.id.endsWith('_tuntutan'))
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(r => {
          const match =
            r.namaAcara?.toUpperCase() === namaAcara.toUpperCase() &&
            r.kategoriKod?.toUpperCase() === kategoriKod.toUpperCase() &&
            r.jantina === jantina
          return match
        })

      if (senarai.length === 0) {
        setBrkLog([`⚠ Tiada rekod dijumpai untuk Acara #${noAcara} — ${namaAcara} ${jantina} ${kategoriKod}`])
      } else {
        setBrkSenarai({ acara: acaraData, list: senarai })
        setBrkLog([])
      }
    } catch (e) {
      setBrkLog([`❌ Ralat: ${e.message}`])
    }
    setBrkLoading(false)
  }

  function brkPilihRekod(rekod) {
    setBrkPilihan(rekod)
    setBrkForm({
      prestasi:    String(rekod.prestasi ?? ''),
      prestasiLama: String(rekod.prestasiLama ?? ''),
      namaAtlet:   rekod.namaAtlet || '',
      noKP:        rekod.noKP || '',
      kodSekolah:  rekod.kodSekolah || '',
      namaSekolah: rekod.namaSekolah || '',
      tarikhRekod: rekod.tarikhRekod || '',
      catatanKhas: rekod.catatanKhas || '',
    })
    setBrkPreview(false)
  }

  async function brkSimpan() {
    if (!brkPilihan || !brkForm) return
    if (!window.confirm(`Simpan perubahan rekod?\n\nRekod lama akan diarkibkan ke rekod_sejarah sebelum dikemaskini.`)) return
    setBrkSaving(true)
    setBrkLog([`🔧 Mengarkibkan rekod lama...`])
    try {
      const rKey = brkPilihan.id
      const rekodRef = doc(db, 'tenants', schoolId, 'rekod', rKey)
      const snapSemasa = await getDoc(rekodRef)

      // 1. Arkibkan ke rekod_sejarah
      if (snapSemasa.exists()) {
        const sejarahRef = doc(collection(db, 'tenants', schoolId, 'rekod_sejarah'))
        await setDoc(sejarahRef, {
          ...snapSemasa.data(),
          rekodId:      rKey,
          diarchivPada: serverTimestamp(),
          sebab:        'baiki_rekod_healthcheck',
          diarchivOleh: userData?.uid || null,
        })
        setBrkLog(l => [...l, `✓ Rekod lama diarkibkan ke rekod_sejarah`])
      }

      // 2. Kemaskini rekod utama
      const patch = {
        prestasi:    Number(brkForm.prestasi),
        prestasiLama: brkForm.prestasiLama !== '' ? Number(brkForm.prestasiLama) : null,
        namaAtlet:   brkForm.namaAtlet.trim(),
        noKP:        brkForm.noKP.trim(),
        kodSekolah:  brkForm.kodSekolah.trim().toUpperCase(),
        namaSekolah: brkForm.namaSekolah.trim(),
        tarikhRekod: String(brkForm.tarikhRekod).slice(0, 4),
        catatanKhas: brkForm.catatanKhas.trim(),
        updatedAt:   serverTimestamp(),
        dikemasOleh: userData?.uid || null,
      }
      await updateDoc(rekodRef, patch)
      setBrkLog(l => [...l, `✓ Rekod dikemaskini`])

      // 3. Kemaskini mata_olahragawan jika noKP berubah
      const noKPLama = brkPilihan.noKP
      const noKPBaru = brkForm.noKP.trim()
      const acaraId  = brkSenarai?.acara?.id
      const mataKejId = brkPilihan.kejohananId || (await getKejId())
      if (acaraId && noKPLama && noKPBaru !== noKPLama) {
        const mataRefLama = doc(db, 'tenants', schoolId, 'kejohanan', mataKejId, 'mata_olahragawan', noKPLama)
        const mataSnapLama = await getDoc(mataRefLama)
        if (mataSnapLama.exists()) {
          const fieldKey = `rekod_${acaraId}`
          await updateDoc(mataRefLama, { [fieldKey]: deleteField() })
          setBrkLog(l => [...l, `✓ Rekod dibuang dari mata_olahragawan ${noKPLama}`])
        }
        if (noKPBaru) {
          const mataRefBaru = doc(db, 'tenants', schoolId, 'kejohanan', mataKejId, 'mata_olahragawan', noKPBaru)
          await setDoc(mataRefBaru, {
            [`rekod_${acaraId}`]: {
              acaraId,
              namaAcara:  brkPilihan.namaAcara,
              kategoriKod: brkPilihan.kategoriKod,
              jantina:    brkPilihan.jantina,
              peringkat:  brkPilihan.peringkat,
              prestasiBaru: Number(brkForm.prestasi),
              prestasiLama: brkForm.prestasiLama !== '' ? Number(brkForm.prestasiLama) : null,
            }
          }, { merge: true })
          setBrkLog(l => [...l, `✓ Rekod ditambah ke mata_olahragawan ${noKPBaru}`])
        }
      } else if (acaraId && noKPBaru) {
        // Kemaskini nilai dalam mata_olahragawan (noKP sama, prestasi mungkin berubah)
        const mataRef = doc(db, 'tenants', schoolId, 'kejohanan', mataKejId, 'mata_olahragawan', noKPBaru)
        const mataSnap = await getDoc(mataRef)
        if (mataSnap.exists() && mataSnap.data()[`rekod_${acaraId}`]) {
          await updateDoc(mataRef, {
            [`rekod_${acaraId}.prestasiBaru`]: Number(brkForm.prestasi),
            [`rekod_${acaraId}.prestasiLama`]: brkForm.prestasiLama !== '' ? Number(brkForm.prestasiLama) : null,
          })
          setBrkLog(l => [...l, `✓ mata_olahragawan ${noKPBaru} dikemaskini`])
        }
      }

      setBrkLog(l => [...l, `✅ Selesai — rekod berjaya dibaiki.`])
      setBrkPilihan(null)
      setBrkForm(null)
      setBrkPreview(false)
      // Reload senarai
      await brkCariRekod()
    } catch (e) {
      setBrkLog(l => [...l, `❌ Ralat: ${e.message}`])
    }
    setBrkSaving(false)
  }

  async function brkPadamRekod() {
    if (!brkPilihan) return
    if (!window.confirm(`PADAM rekod ini terus?\n\n${brkPilihan.namaAcara} ${brkPilihan.jantina} ${brkPilihan.kategoriKod} (${brkPilihan.peringkat})\n\nRekod akan diarkibkan dahulu sebelum dipadam.`)) return
    if (!window.confirm(`Pengesahan kedua — PADAM TERUS rekod ini? Tindakan ini kekal.`)) return
    setBrkSaving(true)
    setBrkLog([`🗑 Mengarkibkan dan memadam rekod...`])
    try {
      const rKey = brkPilihan.id
      const rekodRef = doc(db, 'tenants', schoolId, 'rekod', rKey)
      const snapSemasa = await getDoc(rekodRef)
      if (snapSemasa.exists()) {
        const sejarahRef = doc(collection(db, 'tenants', schoolId, 'rekod_sejarah'))
        await setDoc(sejarahRef, {
          ...snapSemasa.data(),
          rekodId:      rKey,
          diarchivPada: serverTimestamp(),
          sebab:        'padam_healthcheck',
          dipadamOleh:  userData?.uid || null,
        })
      }
      await deleteDoc(rekodRef)

      // Buang dari mata_olahragawan
      const noKP   = brkPilihan.noKP
      const acaraId = brkSenarai?.acara?.id
      const padamKejId = brkPilihan.kejohananId || (await getKejId())
      if (noKP && acaraId) {
        const mataRef = doc(db, 'tenants', schoolId, 'kejohanan', padamKejId, 'mata_olahragawan', noKP)
        const mataSnap = await getDoc(mataRef)
        if (mataSnap.exists()) {
          await updateDoc(mataRef, { [`rekod_${acaraId}`]: deleteField() })
          setBrkLog(l => [...l, `✓ Rekod dibuang dari mata_olahragawan`])
        }
      }

      setBrkLog(l => [...l, `✅ Rekod dipadam dan diarkibkan.`])
      setBrkPilihan(null)
      setBrkForm(null)
      setBrkPreview(false)
      setBrkSenarai(null)
    } catch (e) {
      setBrkLog(l => [...l, `❌ Ralat: ${e.message}`])
    }
    setBrkSaving(false)
  }

  async function brkMuatArkib() {
    if (!brkSenarai) return
    setBrkUndoLoading(true)
    setBrkArkibList(null)
    setBrkUndoPilihan(null)
    try {
      const snap = await getDocs(query(
        collection(db, 'tenants', schoolId, 'rekod_sejarah'),
        where('rekodId', '==', brkPilihan?.id || '')
      ))
      if (snap.empty) {
        setBrkArkibList([])
      } else {
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.diarchivPada?.seconds ?? 0) - (a.diarchivPada?.seconds ?? 0))
        setBrkArkibList(list)
      }
    } catch (e) {
      setBrkLog(l => [...l, `❌ Ralat muatkan arkib: ${e.message}`])
    }
    setBrkUndoLoading(false)
  }

  async function brkUndoRekod() {
    if (!brkUndoPilihan || !brkPilihan) return
    if (!window.confirm(`Undo: Pulihkan rekod lama ini?\n\nRekod semasa akan diarkibkan dahulu.`)) return
    setBrkSaving(true)
    setBrkLog([`♻ Memulihkan rekod dari arkib...`])
    try {
      const rKey = brkPilihan.id
      const rekodRef = doc(db, 'tenants', schoolId, 'rekod', rKey)
      const snapSemasa = await getDoc(rekodRef)

      // Arkibkan rekod semasa
      if (snapSemasa.exists()) {
        const sejarahRef = doc(collection(db, 'tenants', schoolId, 'rekod_sejarah'))
        await setDoc(sejarahRef, {
          ...snapSemasa.data(),
          rekodId:      rKey,
          diarchivPada: serverTimestamp(),
          sebab:        'undo_ke_arkib',
          diarchivOleh: userData?.uid || null,
        })
        setBrkLog(l => [...l, `✓ Rekod semasa diarkibkan`])
      }

      // Pulihkan dari arkib yang dipilih
      const { id: _sejarahId, diarchivPada: _d, sebab: _s, dipecahOleh: _dp, ...dataArkib } = brkUndoPilihan
      await setDoc(rekodRef, {
        ...dataArkib,
        rekodId:   rKey,
        statusRekod: 'aktif',
        updatedAt: serverTimestamp(),
        dipulihkanOleh: userData?.uid || null,
        dipulihkanDari: brkUndoPilihan.id,
      })
      setBrkLog(l => [...l, `✓ Rekod dipulihkan dari arkib`, `✅ Undo berjaya.`])
      setBrkArkibList(null)
      setBrkUndoPilihan(null)
      setBrkPilihan(null)
      setBrkForm(null)
      await brkCariRekod()
    } catch (e) {
      setBrkLog(l => [...l, `❌ Ralat: ${e.message}`])
    }
    setBrkSaving(false)
  }

  async function jalanFix() {
    const noKP = fixNoKP.trim()
    const aceraId = fixAceraId.trim()
    if (!noKP) { setFixLog(['❌ Masukkan noKP dahulu.']); return }
    setFixing(true)
    setFixLog(['🔍 Mencari kejohanan aktif...'])
    try {
      const kejId = await getKejId()
      setFixLog(l => [...l, `✓ Kejohanan: ${kejId}`])
      setFixLog(l => [...l, '🔍 Memuatkan pendaftaran dari Firestore...'])
      const pendSnap = await getDocsFromServer(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'pendaftaran'))
      const logs = []
      const targetDocs = pendSnap.docs.filter(d => d.data().noKP === noKP)
      logs.push(`✓ Jumpa ${targetDocs.length} doc dengan noKP=${noKP}`)
      if (targetDocs.length === 0) { setFixLog(l => [...l, ...logs, '⚠ Tiada doc dijumpai.']); setFixing(false); return }
      for (const d of targetDocs) {
        const data = d.data()
        logs.push(`  Doc ID: ${d.id} | namaAtlet: ${data.namaAtlet} | acaraIds: [${(data.acaraIds||[]).join(', ')}]`)
        if (!aceraId) {
          await deleteDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'pendaftaran', d.id))
          logs.push(`  🗑 Doc ${d.id} DIPADAM.`)
        } else {
          const acaraIds = data.acaraIds || []
          if (!acaraIds.includes(aceraId)) {
            logs.push(`  ⚠ aceraId '${aceraId}' tiada dalam doc — langkau.`)
          } else {
            const newIds = acaraIds.filter(id => id !== aceraId)
            if (newIds.length === 0) {
              await deleteDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'pendaftaran', d.id))
              logs.push(`  🗑 Doc ${d.id} DIPADAM (tiada acara baki).`)
            } else {
              await updateDoc(doc(db, 'tenants', schoolId, 'kejohanan', kejId, 'pendaftaran', d.id), { acaraIds: newIds, updatedAt: serverTimestamp() })
              logs.push(`  ✏ Doc ${d.id} dikemaskini. Acara baki: [${newIds.join(', ')}]`)
            }
          }
        }
      }
      logs.push('✅ Selesai.')
      setFixLog(l => [...l, ...logs])
    } catch (e) { setFixLog(l => [...l, '❌ Ralat: ' + e.message]) }
    setFixing(false)
  }

  async function jalanFixSekolah() {
    const kodSkl = fixKodSkl.trim().toUpperCase()
    if (!kodSkl) { setFixLog(['❌ Masukkan Kod Sekolah dahulu.']); return }
    if (!window.confirm(`Padam SEMUA pendaftaran untuk sekolah "${kodSkl}"? Tindakan ini tidak boleh dibatalkan.`)) return
    setFixing(true)
    setFixLog([`🔍 Mencari pendaftaran untuk sekolah ${kodSkl}...`])
    try {
      const kejId = await getKejId()
      setFixLog(l => [...l, `✓ Kejohanan: ${kejId}`])
      const pendSnap = await getDocsFromServer(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'pendaftaran'))
      const targetDocs = pendSnap.docs.filter(d => d.data().kodSekolah === kodSkl)
      setFixLog(l => [...l, `✓ Jumpa ${targetDocs.length} rekod untuk sekolah ${kodSkl}`])
      if (targetDocs.length === 0) { setFixLog(l => [...l, '⚠ Tiada rekod dijumpai.']); setFixing(false); return }
      // Padam dalam batch
      const BATCH_SIZE = 400
      for (let i = 0; i < targetDocs.length; i += BATCH_SIZE) {
        const batch = writeBatch(db)
        targetDocs.slice(i, i + BATCH_SIZE).forEach(d => batch.delete(d.ref))
        await batch.commit()
      }
      setFixLog(l => [...l, `🗑 ${targetDocs.length} rekod DIPADAM untuk sekolah ${kodSkl}.`, '✅ Selesai.'])
    } catch (e) { setFixLog(l => [...l, '❌ Ralat: ' + e.message]) }
    setFixing(false)
  }

  async function jalanSemak() {
    setRunning(true)
    setResult(null)
    setProgress('Mencari kejohanan aktif...')

    try {
      // ── 0. Cari kejohanan aktif ──────────────────────────────────────────────
      const kejSnap = await getDocs(
        query(collection(db, 'tenants', schoolId, 'kejohanan'), where('statusKejohanan', '==', 'aktif'))
      )
      if (kejSnap.empty) {
        setResult({ error: 'Tiada kejohanan aktif ditemui.' })
        setRunning(false)
        return
      }
      const kej   = { id: kejSnap.docs[0].id, ...kejSnap.docs[0].data() }
      const kejId = kej.id

      // ── 1. Load data utama ───────────────────────────────────────────────────
      setProgress('Memuatkan data pendaftaran, atlet dan acara...')
      const [pendSnap, atletSnap, acaraSnap] = await Promise.all([
        getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'pendaftaran')),
        getDocs(collection(db, 'tenants', schoolId, 'atlet')),
        getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'acara')),
      ])

      const pendList  = pendSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const atletMap  = {}
      atletSnap.docs.forEach(d => { atletMap[d.id] = d.data() })
      const acaraList = acaraSnap.docs.map(d => ({ id: d.id, ...d.data() }))

      // ── BLOK 1: Pendaftaran ──────────────────────────────────────────────────
      setProgress('Menyemak integriti pendaftaran...')

      // C1 — noBib mismatch
      const mismatch = []
      for (const p of pendList) {
        const a = atletMap[p.noKP]
        if (!a) continue
        if (a.noBib && p.noBib && a.noBib !== p.noBib) {
          mismatch.push(`noKP:${p.noKP} | atlet.noBib:${a.noBib} ≠ daftar.noBib:${p.noBib} | ${p.namaAtlet || '—'} (${p.kodSekolah || '—'})`)
        }
      }

      // C2 — noBib duplikat dalam pendaftaran (dalam kategori sekolah yang sama sahaja)
      // SK vs SM dibenar sama prefix — duplikat hanya error jika SR+SR atau SM+SM atau PPKI+PPKI
      const sekolahSnap = await getDocs(collection(db, 'tenants', schoolId, 'atlet'))
      const sekolahKatMap = {}
      sekolahSnap.docs.forEach(d => {
        const k = d.data().kodSekolah
        if (k) sekolahKatMap[k] = d.data().kategoriSekolah || ''
      })

      // Key = noBib + '|' + kategoriSekolah
      const bibCount = {}
      for (const p of pendList) {
        if (!p.noBib) continue
        const katSkl = sekolahKatMap[p.kodSekolah] || ''
        const key = `${p.noBib}|${katSkl}`
        bibCount[key] = bibCount[key] || []
        bibCount[key].push(`${p.noKP} / ${p.namaAtlet || '—'} / ${p.kodSekolah || '—'} [${katSkl || '?'}]`)
      }
      const dupBib = []
      for (const [key, list] of Object.entries(bibCount)) {
        if (list.length > 1) {
          const [bib, kat] = key.split('|')
          dupBib.push(`noBib:${bib} [${kat || '?'}] → ${list.join(' | ')}`)
        }
      }

      // C3 — noBib kosong dalam pendaftaran
      const noBibKosong = pendList
        .filter(p => !p.noBib)
        .map(p => `noKP:${p.noKP} | ${p.namaAtlet || '—'} | ${p.kodSekolah || '—'}`)

      // C4 — Rekod tidak lengkap (tiada noKP / namaAtlet / jantina / tarikhLahir)
      const tidakLengkap = pendList
        .filter(p => !p.noKP || !p.namaAtlet || !p.jantina || !p.tarikhLahir)
        .map(p => {
          const hilang = []
          if (!p.noKP)        hilang.push('noKP')
          if (!p.namaAtlet)   hilang.push('namaAtlet')
          if (!p.jantina)     hilang.push('jantina')
          if (!p.tarikhLahir) hilang.push('tarikhLahir')
          return `id:${p.id} | ${p.namaAtlet || '—'} | tiada: ${hilang.join(', ')}`
        })

      // ── BLOK 2: Heat ────────────────────────────────────────────────────────
      setProgress('Menyemak integriti heat...')

      const heatNoBibKosong = []
      const heatNoKPKosong  = []
      const heatLorongDup   = []
      const acaraSatuPeserta = []

      // C8 — Acara dengan 1 peserta dalam pendaftaran
      for (const acara of acaraList) {
        if (acara.jenisAcara === 'relay') continue
        const pesertaAcara = pendList.filter(p =>
          (p.acaraIds || []).includes(acara.id)
        )
        if (pesertaAcara.length === 1) {
          acaraSatuPeserta.push(`#${acara.noAcara || acara.id} ${acara.namaAcara || '—'} (1 peserta: ${pesertaAcara[0].namaAtlet || pesertaAcara[0].noKP})`)
        }
      }

      // C5, C6, C7 — Heat peserta checks
      for (const acara of acaraList) {
        const heatSnap = await getDocs(
          query(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat'), where('aceraId', '==', acara.id))
        )
        for (const hDoc of heatSnap.docs) {
          const h = hDoc.data()
          const label = `Acara #${acara.noAcara || acara.id} Heat ${h.noHeat || hDoc.id}`
          const lorongs = []
          for (const p of (h.peserta || [])) {
            // noBib kosong dalam heat
            if (!p.noBib && acara.jenisAcara !== 'relay') {
              heatNoBibKosong.push(`${label} | ${p.namaAtlet || '—'}`)
            }
            // noKP kosong dalam heat
            if (!p.noKP && acara.jenisAcara !== 'relay') {
              heatNoKPKosong.push(`${label} | ${p.namaAtlet || '—'}`)
            }
            // Lorong duplikat
            if (p.lorong != null) {
              if (lorongs.includes(p.lorong)) {
                heatLorongDup.push(`${label} | Lorong ${p.lorong} berganda`)
              } else {
                lorongs.push(p.lorong)
              }
            }
          }
        }
      }

      // ── BLOK 3: Status Lama ──────────────────────────────────────────────────
      setProgress('Menyemak status keputusan...')

      const statusLama = []
      for (const acara of acaraList) {
        const heatSnap = await getDocs(
          query(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat'), where('aceraId', '==', acara.id))
        )
        for (const hDoc of heatSnap.docs) {
          const h = hDoc.data()
          if (h.statusKeputusan === 'tidak_rasmi') {
            statusLama.push(`Acara #${acara.noAcara || acara.id} Heat ${h.noHeat || hDoc.id} — status 'tidak_rasmi' (data lama)`)
          }
        }
      }

      // ── Susun keputusan ──────────────────────────────────────────────────────
      setProgress('Menyusun laporan...')

      const blok1 = [
        {
          label: 'noBib pendaftaran sepadan dengan atlet.noBib',
          status: mismatch.length === 0 ? 'ok' : 'error',
          count: mismatch.length,
          details: mismatch,
        },
        {
          label: 'Tiada noBib duplikat dalam pendaftaran',
          status: dupBib.length === 0 ? 'ok' : 'error',
          count: dupBib.length,
          details: dupBib,
        },
        {
          label: 'Tiada noBib kosong dalam pendaftaran',
          status: noBibKosong.length === 0 ? 'ok' : 'warn',
          count: noBibKosong.length,
          details: noBibKosong,
        },
        {
          label: 'Rekod pendaftaran lengkap (noKP, nama, jantina, tarikhLahir)',
          status: tidakLengkap.length === 0 ? 'ok' : 'error',
          count: tidakLengkap.length,
          details: tidakLengkap,
        },
      ]

      const blok2 = [
        {
          label: 'Tiada noBib kosong dalam heat',
          status: heatNoBibKosong.length === 0 ? 'ok' : 'error',
          count: heatNoBibKosong.length,
          details: heatNoBibKosong,
        },
        {
          label: 'Tiada noKP kosong dalam heat',
          status: heatNoKPKosong.length === 0 ? 'ok' : 'error',
          count: heatNoKPKosong.length,
          details: heatNoKPKosong,
        },
        {
          label: 'Tiada lorong berganda dalam heat',
          status: heatLorongDup.length === 0 ? 'ok' : 'error',
          count: heatLorongDup.length,
          details: heatLorongDup,
        },
        {
          label: 'Acara dengan 1 peserta sahaja',
          status: acaraSatuPeserta.length === 0 ? 'ok' : 'warn',
          count: acaraSatuPeserta.length,
          details: acaraSatuPeserta,
        },
      ]

      const blok3 = [
        {
          label: 'Tiada heat dengan status lama (tidak_rasmi)',
          status: statusLama.length === 0 ? 'ok' : 'warn',
          count: statusLama.length,
          details: statusLama,
        },
      ]

      const totalError = [mismatch, dupBib, tidakLengkap, heatNoBibKosong, heatNoKPKosong, heatLorongDup]
        .reduce((sum, arr) => sum + arr.length, 0)
      const totalWarn = [noBibKosong, acaraSatuPeserta, statusLama]
        .reduce((sum, arr) => sum + arr.length, 0)

      setResult({
        kejohanan: kej.namaKejohanan || kejId,
        totalPendaftaran: pendList.length,
        totalAcara: acaraList.length,
        totalError,
        totalWarn,
        blok1,
        blok2,
        blok3,
        masa: new Date().toLocaleTimeString('ms-MY'),
      })
    } catch (e) {
      setResult({ error: 'Ralat semasa semak: ' + e.message })
    }
    setProgress('')
    setRunning(false)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#003399] text-white px-4 py-3 flex items-center gap-3 shadow-lg">
        <button onClick={() => navigate('/admin')}
          className="text-white/70 hover:text-white transition-colors p-1">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div>
          <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Admin</p>
          <p className="text-sm font-black">Health Check Sistem</p>
        </div>
      </header>
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-gray-800">Semak Kesihatan Sistem</h1>
          <p className="text-xs text-gray-500 mt-0.5">Semak integriti data — pendaftaran, heat, keputusan</p>
        </div>
        <button
          onClick={jalanSemak}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-[#003399] text-white text-xs font-bold rounded-xl hover:bg-[#002288] disabled:opacity-50 transition-colors shrink-0"
        >
          {running ? (
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
            </svg>
          )}
          {running ? 'Menyemak...' : 'Semak Sekarang'}
        </button>
      </div>

      {/* Progress */}
      {running && progress && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
          <p className="text-xs text-blue-700 font-medium">{progress}</p>
        </div>
      )}

      {/* Error */}
      {result?.error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-sm font-medium text-red-700">{result.error}</p>
        </div>
      )}

      {/* Result */}
      {result && !result.error && (
        <>
          {/* Ringkasan */}
          <div className={`rounded-xl border px-4 py-4 ${
            result.totalError > 0 ? 'bg-red-50 border-red-200' :
            result.totalWarn  > 0 ? 'bg-amber-50 border-amber-200' :
            'bg-green-50 border-green-200'
          }`}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">
                {result.totalError > 0 ? '❌' : result.totalWarn > 0 ? '⚠️' : '✅'}
              </span>
              <div>
                <p className={`text-sm font-bold ${
                  result.totalError > 0 ? 'text-red-800' :
                  result.totalWarn  > 0 ? 'text-amber-800' :
                  'text-green-800'
                }`}>
                  {result.totalError > 0
                    ? `${result.totalError} ralat kritikal ditemui`
                    : result.totalWarn > 0
                    ? `Sistem OK — ${result.totalWarn} amaran`
                    : 'Sistem bersih — tiada isu ditemui'}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {result.kejohanan} · {result.totalPendaftaran} pendaftaran · {result.totalAcara} acara · Semak pada {result.masa}
                </p>
              </div>
            </div>
            <div className="flex gap-4 text-[11px]">
              <span className="text-red-700 font-semibold">{result.totalError} Ralat</span>
              <span className="text-amber-700 font-semibold">{result.totalWarn} Amaran</span>
              <span className="text-green-700 font-semibold">
                {result.blok1.filter(c => c.status === 'ok').length +
                 result.blok2.filter(c => c.status === 'ok').length +
                 result.blok3.filter(c => c.status === 'ok').length} Lulus
              </span>
            </div>
          </div>

          {/* Blok 1 */}
          <Section title="Blok 1 — Integriti Pendaftaran" checks={result.blok1} />

          {/* Blok 2 */}
          <Section title="Blok 2 — Integriti Heat" checks={result.blok2} />

          {/* Blok 3 */}
          <Section title="Blok 3 — Status Keputusan" checks={result.blok3} />

          {/* Nota */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
            <p className="text-[11px] text-gray-500 leading-relaxed">
              <span className="font-semibold text-gray-600">Cara guna:</span> Jika ada ralat, salin butiran dan hantar kepada Claude untuk disahkan dan dibaiki.
              Health check ini hanya laporan — tiada perubahan data dibuat.
            </p>
          </div>
        </>
      )}

      {/* Idle state */}
      {!result && !running && (
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-8 text-center">
          <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
          </svg>
          <p className="text-sm font-medium text-gray-400">Tekan "Semak Sekarang" untuk mula</p>
          <p className="text-xs text-gray-300 mt-1">Semak akan mengambil masa 10–30 saat bergantung pada saiz data</p>
        </div>
      )}

      {/* ── Panel Reset Keputusan Acara ── */}
      <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
        <div className="px-4 py-3 bg-red-50 border-b border-red-100 flex items-center gap-2">
          <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          <p className="text-xs font-bold text-red-700 uppercase tracking-wide">Pembaikan Khas — Reset Keputusan Acara</p>
        </div>
        <div className="px-4 py-4 space-y-3">
          <p className="text-[11px] text-gray-500">Kosongkan semua keputusan dalam satu acara. Peserta dan lorong <span className="font-semibold">KEKAL</span> — hanya masa, rank dan status dikosongkan.</p>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 mb-1">No Acara</label>
            <input value={resetAcaraId} onChange={e => setResetAcaraId(e.target.value)}
              placeholder="cth: 215"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-300"/>
          </div>
          <button onClick={jalanResetAcara} disabled={resetting || !resetAcaraId.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg disabled:opacity-40 transition-colors">
            {resetting ? 'Mereset...' : 'Reset Keputusan Acara Ini'}
          </button>
          {resetLog.length > 0 && (
            <div className="space-y-1 pt-1">
              {resetLog.map((l, i) => (
                <p key={i} className="text-[10px] font-mono bg-gray-50 rounded px-2 py-1 text-gray-700 break-all">{l}</p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Panel Pindah Peserta ── */}
      <div className="bg-white rounded-xl border border-purple-200 overflow-hidden">
        <div className="px-4 py-3 bg-purple-50 border-b border-purple-100 flex items-center gap-2">
          <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>
          </svg>
          <p className="text-xs font-bold text-purple-700 uppercase tracking-wide">Pembaikan Khas — Pindah Peserta Antara Heat</p>
        </div>
        <div className="px-4 py-4 space-y-3">
          <p className="text-[11px] text-gray-500">Pindah seorang peserta dari satu heat ke heat lain dalam acara yang sama.</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-1">No Acara</label>
              <input value={pindahAcaraId} onChange={e => setPindahAcaraId(e.target.value)}
                placeholder="cth: 215"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-300"/>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-1">No BIB Peserta</label>
              <input value={pindahNoBib} onChange={e => setPindahNoBib(e.target.value.toUpperCase())}
                placeholder="cth: L77"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-300"/>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-1">Dari Heat (no)</label>
              <input value={pindahDariH} onChange={e => setPindahDariH(e.target.value)}
                placeholder="cth: 1"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-300"/>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-1">Ke Heat (no)</label>
              <input value={pindahKeH} onChange={e => setPindahKeH(e.target.value)}
                placeholder="cth: 2"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-300"/>
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] font-bold text-gray-500 mb-1">Lorong dalam Heat Destinasi</label>
              <input value={pindahLorong} onChange={e => setPindahLorong(e.target.value)}
                placeholder="cth: 8"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-300"/>
            </div>
          </div>
          <button onClick={jalanPindah} disabled={pindahing || !pindahAcaraId.trim() || !pindahNoBib.trim() || !pindahDariH.trim() || !pindahKeH.trim() || !pindahLorong.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg disabled:opacity-40 transition-colors">
            {pindahing ? 'Memindah...' : 'Pindah Peserta'}
          </button>
          {pindahLog.length > 0 && (
            <div className="space-y-1 pt-1">
              {pindahLog.map((l, i) => (
                <p key={i} className="text-[10px] font-mono bg-gray-50 rounded px-2 py-1 text-gray-700 break-all">{l}</p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Panel Pembaikan Khas ── */}
      <div className="bg-white rounded-xl border border-orange-200 overflow-hidden">
        <div className="px-4 py-3 bg-orange-50 border-b border-orange-100 flex items-center gap-2">
          <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <p className="text-xs font-bold text-orange-700 uppercase tracking-wide">Pembaikan Khas — Buang Rekod Pendaftaran</p>
        </div>
        <div className="px-4 py-4 space-y-3">
          <p className="text-[11px] text-gray-500">Buang rekod pendaftaran yang gagal dipadam melalui PP/Admin.</p>

          {/* Fix by noKP */}
          <div className="border border-orange-100 rounded-lg p-3 space-y-2">
            <p className="text-[10px] font-bold text-orange-600 uppercase">Buang by No KP Atlet</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-1">No KP Atlet</label>
                <input value={fixNoKP} onChange={e => setFixNoKP(e.target.value)}
                  placeholder="cth: 160215-11-0390"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-300"/>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-1">ID Acara (kosong = padam semua)</label>
                <input value={fixAceraId} onChange={e => setFixAceraId(e.target.value)}
                  placeholder="cth: 112 (kosong = padam doc)"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-300"/>
              </div>
            </div>
            <button onClick={jalanFix} disabled={fixing || !fixNoKP.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg disabled:opacity-40 transition-colors">
              {fixing ? 'Membaiki...' : 'Buang by noKP'}
            </button>
          </div>

          {/* Fix by kodSekolah */}
          <div className="border border-red-100 rounded-lg p-3 space-y-2">
            <p className="text-[10px] font-bold text-red-600 uppercase">Padam Semua Pendaftaran by Kod Sekolah</p>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-1">Kod Sekolah</label>
              <input value={fixKodSkl} onChange={e => setFixKodSkl(e.target.value)}
                placeholder="cth: ABC123"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-300"/>
            </div>
            <button onClick={jalanFixSekolah} disabled={fixing || !fixKodSkl.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg disabled:opacity-40 transition-colors">
              {fixing ? 'Membuang...' : 'Padam Semua Pendaftaran Sekolah Ini'}
            </button>
          </div>
          {fixLog.length > 0 && (
            <div className="space-y-1 pt-1">
              {fixLog.map((l, i) => (
                <p key={i} className="text-[10px] font-mono bg-gray-50 rounded px-2 py-1 text-gray-700 break-all">{l}</p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Panel Bersih Badge Rekod ── */}
      <div className="bg-white rounded-xl border border-blue-200 overflow-hidden">
        <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"/>
          </svg>
          <p className="text-xs font-bold text-blue-700 uppercase tracking-wide">Pembaikan Khas — Bersih Badge Rekod</p>
        </div>
        <div className="px-4 py-4 space-y-3">
          <p className="text-[11px] text-gray-500">Imbas dahulu untuk lihat heat yang ada badge. Semak, kemudian buang.</p>

          {/* Step 1: Imbas */}
          {!badgeImbas && !badgeDone && (
            <button onClick={jalanImbas} disabled={badgeRunning}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg disabled:opacity-40 transition-colors">
              {badgeRunning ? (
                <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Mengimbas...</>
              ) : 'Imbas Badge'}
            </button>
          )}

          {/* Step 2: Hasil imbas */}
          {badgeImbas && (
            <div className="space-y-3">
              {badgeImbas.error && (
                <p className="text-[11px] text-red-600">❌ Ralat: {badgeImbas.error}</p>
              )}
              {!badgeImbas.error && badgeImbas.senarai.length === 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <p className="text-[11px] text-green-700 font-semibold">✅ Tiada badge rekod ditemui — sistem bersih.</p>
                </div>
              )}
              {!badgeImbas.error && badgeImbas.senarai.length > 0 && (() => {
                const yatim = badgeImbas.senarai.filter(i => !i.adaRekod)
                const sah   = badgeImbas.senarai.filter(i => i.adaRekod)
                return (
                  <>
                    <div className="flex gap-2 flex-wrap">
                      <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">⚠ {badgeImbas.senarai.length} heat ada badge</span>
                      {yatim.length > 0 && <span className="text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">❌ {yatim.length} tidak sah (prestasi/rekod salah)</span>}
                      {sah.length > 0   && <span className="text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">✅ {sah.length} sah (prestasi betul)</span>}
                    </div>
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {badgeImbas.senarai.map((item, i) => (
                        <div key={i} className={`border rounded-lg px-3 py-2 ${item.adaRekod ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold">{item.adaRekod ? '✅ SAH' : '❌ TIDAK SAH'}</span>
                            <p className="text-[11px] font-semibold text-gray-700">{item.label}</p>
                          </div>
                          {item.peserta.map((p, j) => (
                            <div key={j} className="pl-2 mt-0.5">
                              <p className="text-[10px] font-mono text-gray-600">{p.teks} — {p.jenis}</p>
                              {p.notaTally && (
                                <p className={`text-[10px] font-mono mt-0.5 ${p.statusPrestasi === 'salah' ? 'text-red-500' : p.statusPrestasi === 'betul' ? 'text-green-600' : 'text-gray-400'}`}>
                                  {p.statusPrestasi === 'salah' ? '✗ ' : p.statusPrestasi === 'betul' ? '✓ ' : '? '}{p.notaTally}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-1 flex-wrap">
                      {yatim.length > 0 && (
                        <button onClick={jalanBuangBadge} disabled={badgeBuang}
                          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg disabled:opacity-40 transition-colors">
                          {badgeBuang ? 'Membuang...' : `Buang ${yatim.length} Badge Tidak Sah`}
                        </button>
                      )}
                      <button onClick={() => { setBadgeImbas(null); setBadgeDone(null) }} disabled={badgeBuang}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg disabled:opacity-40 transition-colors">
                        Batal
                      </button>
                    </div>
                    {yatim.length === 0 && (
                      <p className="text-[11px] text-green-700 font-semibold">✅ Semua badge sah — prestasi atlet lebih baik dari rekod semasa.</p>
                    )}
                  </>
                )
              })()}
              {badgeImbas.senarai.length === 0 && (
                <button onClick={() => setBadgeImbas(null)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg transition-colors">
                  Imbas Semula
                </button>
              )}
            </div>
          )}

          {/* Step 3: Selesai */}
          {badgeDone && (
            <div className="space-y-2">
              {badgeDone.error ? (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <p className="text-[11px] text-red-700">❌ Ralat: {badgeDone.error}</p>
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <p className="text-[11px] text-green-700 font-semibold">✅ Selesai — {badgeDone.heat} heat dikemas, {badgeDone.badge} badge dibuang.</p>
                </div>
              )}
              <button onClick={() => { setBadgeDone(null); setBadgeImbas(null) }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg transition-colors">
                Imbas Semula
              </button>
            </div>
          )}

          {/* ── Divider ── */}
          <div className="border-t border-blue-100 pt-3 space-y-2">
            <p className="text-[11px] font-bold text-gray-600">Tindakan Terus (tanpa imbas)</p>

            {/* Buang SEMUA badge */}
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={jalanBuangSemua} disabled={buangSemuaRunning || pulihRunning}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg disabled:opacity-40 transition-colors">
                {buangSemuaRunning
                  ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Membuang…</>
                  : '🗑 Buang SEMUA Badge Rekod'}
              </button>
              {buangSemuaDone && (
                buangSemuaDone.ok
                  ? <span className="text-[11px] text-green-700 font-semibold">✅ {buangSemuaDone.heat} heat dikemas — badge habis dibuang</span>
                  : <span className="text-[11px] text-red-600">❌ {buangSemuaDone.error}</span>
              )}
            </div>

            {/* Pulih badge dari rekod_tuntutan */}
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={jalanPulihBadge} disabled={pulihRunning || buangSemuaRunning}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg disabled:opacity-40 transition-colors">
                {pulihRunning
                  ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Memulihkan…</>
                  : '♻ Pulih Badge dari Rekod Tuntutan'}
              </button>
              {pulihDone && (
                pulihDone.ok
                  ? <span className="text-[11px] text-green-700 font-semibold">✅ {pulihDone.heat} heat dipulihkan{pulihDone.nota ? ` — ${pulihDone.nota}` : ''}</span>
                  : <span className="text-[11px] text-red-600">❌ {pulihDone.error}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Panel Baiki Rekod ── */}
      <div className="bg-white rounded-xl border border-teal-200 overflow-hidden">
        <div className="px-4 py-3 bg-teal-50 border-b border-teal-100 flex items-center gap-2">
          <svg className="w-4 h-4 text-teal-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
          </svg>
          <p className="text-xs font-bold text-teal-700 uppercase tracking-wide">Pembaikan Khas — Baiki Rekod</p>
        </div>
        <div className="px-4 py-4 space-y-3">
          <p className="text-[11px] text-gray-500">Baiki rekod yang salah: ubah prestasi, pemegang, sekolah. Rekod lama diarkibkan automatik sebelum disimpan. Sokong undo dan padam.</p>

          {/* Step 1: Cari by No Acara */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-gray-500 mb-1">No Acara</label>
              <input
                value={brkNoAcara}
                onChange={e => setBrkNoAcara(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && brkCariRekod()}
                placeholder="cth: 101"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-300"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={brkCariRekod}
                disabled={brkLoading || !brkNoAcara.trim()}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg disabled:opacity-40 transition-colors"
              >
                {brkLoading ? 'Mencari...' : 'Cari'}
              </button>
            </div>
          </div>

          {/* Log mesej */}
          {brkLog.length > 0 && (
            <div className="space-y-1">
              {brkLog.map((l, i) => (
                <p key={i} className="text-[10px] font-mono bg-gray-50 rounded px-2 py-1 text-gray-700 break-all">{l}</p>
              ))}
            </div>
          )}

          {/* Step 2: Senarai rekod dijumpai */}
          {brkSenarai && !brkPilihan && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-gray-700">
                Acara #{brkSenarai.acara.noAcara} — {brkSenarai.acara.namaAcara} {brkSenarai.acara.jantina} {brkSenarai.acara.kategoriKod}
              </p>
              <p className="text-[10px] text-gray-500">{brkSenarai.list.length} rekod dijumpai. Pilih rekod untuk dibaiki:</p>
              {brkSenarai.list.map(rekod => (
                <div
                  key={rekod.id}
                  onClick={() => brkPilihRekod(rekod)}
                  className="border border-teal-200 rounded-lg px-3 py-2 cursor-pointer hover:bg-teal-50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold text-teal-700 uppercase mr-2">{rekod.peringkat === 'D' ? 'Daerah' : rekod.peringkat === 'N' ? 'Negeri' : 'Kebangsaan'}</span>
                      <span className="text-[11px] font-mono font-semibold text-gray-800">{formatPrestasiHC(rekod.prestasi, rekod.unit)}</span>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${rekod.statusRekod === 'aktif' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {rekod.statusRekod}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-600 mt-0.5">{rekod.namaAtlet || '—'} · {rekod.namaSekolah || rekod.kodSekolah || '—'} · {rekod.tarikhRekod || '—'}</p>
                  <p className="text-[10px] text-gray-400 font-mono mt-0.5">{rekod.id}</p>
                </div>
              ))}
            </div>
          )}

          {/* Step 3: Form edit */}
          {brkPilihan && brkForm && !brkPreview && (
            <div className="space-y-3 border border-teal-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-teal-700">Edit Rekod — {brkPilihan.peringkat === 'D' ? 'Daerah' : brkPilihan.peringkat === 'N' ? 'Negeri' : 'Kebangsaan'}</p>
                <button onClick={() => { setBrkPilihan(null); setBrkForm(null) }} className="text-[10px] text-gray-400 hover:text-gray-600">✕ Batal</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1">Prestasi Baru ({brkPilihan.unit})</label>
                  <input
                    value={brkForm.prestasi}
                    onChange={e => setBrkForm(f => ({ ...f, prestasi: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-300"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1">Prestasi Lama ({brkPilihan.unit})</label>
                  <input
                    value={brkForm.prestasiLama}
                    onChange={e => setBrkForm(f => ({ ...f, prestasiLama: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-300"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-gray-500 mb-1">Nama Atlet</label>
                  <input
                    value={brkForm.namaAtlet}
                    onChange={e => setBrkForm(f => ({ ...f, namaAtlet: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-300"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1">No KP</label>
                  <input
                    value={brkForm.noKP}
                    onChange={e => setBrkForm(f => ({ ...f, noKP: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-300"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1">Kod Sekolah</label>
                  <input
                    value={brkForm.kodSekolah}
                    onChange={e => setBrkForm(f => ({ ...f, kodSekolah: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-300"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-gray-500 mb-1">Nama Sekolah</label>
                  <input
                    value={brkForm.namaSekolah}
                    onChange={e => setBrkForm(f => ({ ...f, namaSekolah: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-300"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1">Tahun Rekod</label>
                  <input
                    value={brkForm.tarikhRekod}
                    onChange={e => setBrkForm(f => ({ ...f, tarikhRekod: e.target.value }))}
                    placeholder="cth: 2026"
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-300"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1">Catatan Khas</label>
                  <input
                    value={brkForm.catatanKhas}
                    onChange={e => setBrkForm(f => ({ ...f, catatanKhas: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-300"
                  />
                </div>
              </div>
              <button
                onClick={() => setBrkPreview(true)}
                className="w-full py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg transition-colors"
              >
                Pratonton Before/After →
              </button>
            </div>
          )}

          {/* Step 4: Preview before/after */}
          {brkPilihan && brkForm && brkPreview && (
            <div className="space-y-3 border-2 border-teal-400 rounded-lg p-3">
              <p className="text-[11px] font-bold text-teal-700">Pratonton Perubahan</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-red-50 border border-red-200 rounded-lg p-2 space-y-1">
                  <p className="text-[10px] font-bold text-red-600 uppercase">Sebelum</p>
                  <p className="text-[10px] text-gray-700">Prestasi: <span className="font-mono font-bold">{formatPrestasiHC(brkPilihan.prestasi, brkPilihan.unit)}</span></p>
                  <p className="text-[10px] text-gray-700">Prestasi Lama: <span className="font-mono">{formatPrestasiHC(brkPilihan.prestasiLama, brkPilihan.unit)}</span></p>
                  <p className="text-[10px] text-gray-700">Atlet: {brkPilihan.namaAtlet || '—'}</p>
                  <p className="text-[10px] text-gray-700">No KP: <span className="font-mono">{brkPilihan.noKP || '—'}</span></p>
                  <p className="text-[10px] text-gray-700">Sekolah: {brkPilihan.namaSekolah || brkPilihan.kodSekolah || '—'}</p>
                  <p className="text-[10px] text-gray-700">Tahun: {brkPilihan.tarikhRekod || '—'}</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-2 space-y-1">
                  <p className="text-[10px] font-bold text-green-600 uppercase">Selepas</p>
                  <p className="text-[10px] text-gray-700">Prestasi: <span className="font-mono font-bold">{formatPrestasiHC(Number(brkForm.prestasi), brkPilihan.unit)}</span></p>
                  <p className="text-[10px] text-gray-700">Prestasi Lama: <span className="font-mono">{formatPrestasiHC(brkForm.prestasiLama !== '' ? Number(brkForm.prestasiLama) : null, brkPilihan.unit)}</span></p>
                  <p className="text-[10px] text-gray-700">Atlet: {brkForm.namaAtlet || '—'}</p>
                  <p className="text-[10px] text-gray-700">No KP: <span className="font-mono">{brkForm.noKP || '—'}</span></p>
                  <p className="text-[10px] text-gray-700">Sekolah: {brkForm.namaSekolah || brkForm.kodSekolah || '—'}</p>
                  <p className="text-[10px] text-gray-700">Tahun: {brkForm.tarikhRekod || '—'}</p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={brkSimpan}
                  disabled={brkSaving}
                  className="flex-1 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg disabled:opacity-40 transition-colors"
                >
                  {brkSaving ? 'Menyimpan...' : '✓ Simpan Perubahan'}
                </button>
                <button
                  onClick={brkPadamRekod}
                  disabled={brkSaving}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg disabled:opacity-40 transition-colors"
                >
                  🗑 Padam Terus
                </button>
                <button
                  onClick={() => setBrkPreview(false)}
                  disabled={brkSaving}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg disabled:opacity-40 transition-colors"
                >
                  ← Edit Semula
                </button>
              </div>
            </div>
          )}

          {/* Undo: Lihat Arkib */}
          {brkPilihan && !brkPreview && (
            <div className="border-t border-teal-100 pt-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={brkMuatArkib}
                  disabled={brkUndoLoading}
                  className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold rounded-lg disabled:opacity-40 transition-colors"
                >
                  {brkUndoLoading ? 'Memuatkan...' : '♻ Lihat Arkib / Undo'}
                </button>
                <span className="text-[10px] text-gray-400">Pulihkan rekod lama dari arkib</span>
              </div>

              {brkArkibList !== null && (
                <div className="space-y-1">
                  {brkArkibList.length === 0 ? (
                    <p className="text-[11px] text-gray-500">Tiada arkib dijumpai untuk rekod ini.</p>
                  ) : (
                    <>
                      <p className="text-[10px] font-bold text-gray-600">{brkArkibList.length} arkib dijumpai — pilih untuk undo:</p>
                      {brkArkibList.map((arkib, i) => {
                        const tarikh = arkib.diarchivPada?.seconds
                          ? new Date(arkib.diarchivPada.seconds * 1000).toLocaleString('ms-MY')
                          : '—'
                        const isSelected = brkUndoPilihan?.id === arkib.id
                        return (
                          <div
                            key={arkib.id}
                            onClick={() => setBrkUndoPilihan(isSelected ? null : arkib)}
                            className={`border rounded-lg px-3 py-2 cursor-pointer transition-colors ${isSelected ? 'border-amber-400 bg-amber-50' : 'border-gray-200 hover:bg-gray-50'}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-amber-700">Arkib {i + 1}</span>
                              <span className="text-[10px] text-gray-400">{tarikh}</span>
                            </div>
                            <p className="text-[10px] font-mono text-gray-700 mt-0.5">
                              Prestasi: {formatPrestasiHC(arkib.prestasi, arkib.unit)} · {arkib.namaAtlet || '—'}
                            </p>
                            <p className="text-[10px] text-gray-500">{arkib.sebab || 'arkib biasa'}</p>
                          </div>
                        )
                      })}
                      {brkUndoPilihan && (
                        <button
                          onClick={brkUndoRekod}
                          disabled={brkSaving}
                          className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg disabled:opacity-40 transition-colors"
                        >
                          {brkSaving ? 'Memulihkan...' : `♻ Undo — Pulihkan Arkib Ini`}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

    </div>
    </div>
  )
}
