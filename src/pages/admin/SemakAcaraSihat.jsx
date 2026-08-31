/**
 * SemakAcaraSihat — /admin/semak-acara
 *
 * Skrin BACA SAHAJA untuk memeriksa kesihatan acara sebelum & semasa kejohanan.
 * Sengaja diasingkan daripada Health Check:
 *   • Health Check ialah bilik kecemasan — alat yang MENULIS (tukar peringkat,
 *     padam keputusan, baiki rekod). Digunakan bila sesuatu sudah rosak.
 *   • Skrin ini untuk semakan harian. Ia TIDAK menulis apa-apa ke Firestore,
 *     jadi admin boleh membukanya tanpa risiko tersalah tekan.
 *
 * Bila menemui isu, ia menghalakan admin ke alat yang betul di Health Check
 * dan bukan membaikinya sendiri — satu tempat sahaja yang boleh menulis.
 *
 * Kos Firestore: tiga bacaan koleksi (acara, pendaftaran, heat) apabila admin
 * menekan Semak. TIADA auto-scan dan TIADA onSnapshot — selaras dengan dasar
 * kos projek. Heat dibaca SEKALI dan dipetakan, bukan query per-acara.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../../firebase/config'
import useSchoolId from '../../hooks/useSchoolId'
import { noAcaraPapar, adaNoPapar } from '../../utils/acaraPaparUtils'

const SARINGAN_PERINGKAT = ['saringan_qf', 'saringan_sf', 'separuh_akhir']
const FINAL_PERINGKAT    = ['akhir', 'final', 'terus_final', 'final_p']

// Keterukan menentukan susunan dan warna — admin nampak yang penting dahulu.
const TERUK = {
  kritikal: { label: 'Kritikal', warna: 'bg-red-100 text-red-700 border-red-200' },
  amaran:   { label: 'Amaran',   warna: 'bg-amber-100 text-amber-700 border-amber-200' },
  info:     { label: 'Info',     warna: 'bg-blue-100 text-blue-700 border-blue-200' },
}

export default function SemakAcaraSihat() {
  const { schoolId } = useSchoolId()
  const navigate = useNavigate()

  const [memuat, setMemuat]   = useState(false)
  const [hasil, setHasil]     = useState(null)   // { senarai, kiraan, namaKej }
  const [ralat, setRalat]     = useState('')
  const [tapis, setTapis]     = useState('isu')  // 'isu' | 'semua'

  async function semak() {
    setMemuat(true); setRalat(''); setHasil(null)
    try {
      // Kejohanan aktif
      const kejSnap = await getDocs(query(
        collection(db, 'tenants', schoolId, 'kejohanan'),
        where('statusKejohanan', 'in', ['aktif', 'draf', 'persediaan'])
      ))
      if (kejSnap.empty) throw new Error('Tiada kejohanan aktif untuk disemak.')
      const kejDoc  = kejSnap.docs[0]
      const kejId   = kejDoc.id
      const namaKej = kejDoc.data().namaKejohanan || kejDoc.data().nama || ''

      const [acaraSnap, pendSnap, heatSnap] = await Promise.all([
        getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'acara')),
        getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'pendaftaran')),
        getDocs(collection(db, 'tenants', schoolId, 'kejohanan', kejId, 'heat')),
      ])

      const acaraList = acaraSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const pendData  = pendSnap.docs.map(d => d.data())

      // Satu bacaan heat → peta per-acara (elak query berulang)
      const heatMap = new Map()
      heatSnap.docs.forEach(h => {
        const hd  = h.data()
        const aid = hd.aceraId || hd.acaraId
        if (!aid) return
        const cur = heatMap.get(aid) || { bil: 0, adaKeputusan: false, fasa: new Set() }
        cur.bil += 1
        cur.fasa.add(hd.fasa)
        if (['rasmi', 'diterima'].includes(hd.statusKeputusan)) cur.adaKeputusan = true
        heatMap.set(aid, cur)
      })

      const aktif = acaraList
        .filter(a => a.isAktif !== false && a.jenisAcara !== 'relay')
        .sort((x, y) => String(x.noAcara ?? '').localeCompare(String(y.noAcara ?? ''), undefined, { numeric: true }))

      const senarai = aktif.map(a => {
        const nP    = pendData.filter(p => (p.acaraIds || []).includes(a.id)).length
        const bilL  = a.bilanganLorong || 8
        const hInfo = heatMap.get(a.id) || { bil: 0, adaKeputusan: false, fasa: new Set() }

        const isSaringan = SARINGAN_PERINGKAT.includes(a.peringkat)
        const isFinal    = FINAL_PERINGKAT.includes(a.peringkat)
        const adaParent  = !!a.parentAcaraId
        const jenis = isSaringan ? 'Saringan'
                    : adaParent  ? 'Final (anak)'
                    : isFinal    ? 'Terus Final'
                    : (a.peringkat || '—')

        const isu = []

        // Pingat tidak akan masuk: acara final tetapi heat masih bertanda saringan.
        // grantMedal perlukan peringkat final DAN heat.fasa final — lihat CLAUDE.md.
        if (isFinal && hInfo.bil > 0 && hInfo.fasa.has('heat')) {
          isu.push({
            teruk: 'kritikal',
            teks: 'Acara final tetapi ada heat bertanda saringan — pingat TIDAK akan masuk.',
            tindakan: 'Health Check → Jadikan Terus Final',
          })
        }

        // Saringan yang pesertanya muat sekali lari — patut terus final.
        if (isSaringan && nP > 0 && nP <= bilL) {
          isu.push({
            teruk: 'kritikal',
            teks: `Saringan tetapi peserta (${nP}) tidak melebihi lorong (${bilL}) — pingat tidak akan masuk.`,
            tindakan: 'Health Check → Jadikan Terus Final',
          })
        }

        // Atlet sudah daftar tetapi heat belum dijana.
        if (nP > 0 && hInfo.bil === 0) {
          isu.push({
            teruk: 'amaran',
            teks: `${nP} atlet berdaftar tetapi heat belum dijana.`,
            tindakan: 'Start List → Jana Heat',
          })
        }

        // Acara terus final yang langsung kosong.
        if (isFinal && !adaParent && nP === 0 && hInfo.bil === 0) {
          isu.push({
            teruk: 'amaran',
            teks: 'Tiada atlet berdaftar dan tiada heat.',
            tindakan: 'Semak sama ada acara ini masih perlu',
          })
        }

        // Rantaian QF → SF → Final terputus.
        if (adaParent) {
          const parent = acaraList.find(p => p.id === a.parentAcaraId)
          if (!parent) {
            isu.push({
              teruk: 'kritikal',
              teks: `Acara induk #${a.parentAcaraId} tidak dijumpai — rantaian putus.`,
              tindakan: 'Setup Acara → semak rantaian',
            })
          }
        }

        // Saringan tanpa pendaftaran langsung.
        if (isSaringan && nP === 0 && hInfo.bil === 0) {
          isu.push({
            teruk: 'info',
            teks: 'Tiada atlet berdaftar.',
            tindakan: 'Semak pendaftaran sekolah',
          })
        }

        const tahap = isu.some(i => i.teruk === 'kritikal') ? 'kritikal'
                    : isu.some(i => i.teruk === 'amaran')   ? 'amaran'
                    : isu.length ? 'info' : 'ok'

        return { acara: a, jenis, nP, bilL, bilHeat: hInfo.bil,
                 adaKeputusan: hInfo.adaKeputusan, isu, tahap }
      })

      const kiraan = {
        jumlah:   senarai.length,
        ok:       senarai.filter(s => s.tahap === 'ok').length,
        kritikal: senarai.filter(s => s.tahap === 'kritikal').length,
        amaran:   senarai.filter(s => s.tahap === 'amaran').length,
        info:     senarai.filter(s => s.tahap === 'info').length,
      }

      setHasil({ senarai, kiraan, namaKej })
    } catch (e) {
      setRalat(e.message || 'Ralat semasa menyemak.')
    }
    setMemuat(false)
  }

  const dipapar = !hasil ? [] :
    tapis === 'isu' ? hasil.senarai.filter(s => s.tahap !== 'ok') : hasil.senarai

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

      {/* Kepala */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-black text-gray-900">🔍 Semak Acara</h1>
            <p className="text-xs text-gray-500 mt-1 max-w-xl">
              Periksa kesihatan semua acara sebelum kejohanan. Skrin ini hanya membaca —
              tiada data akan berubah.
            </p>
          </div>
          <button onClick={semak} disabled={memuat}
            className="px-4 py-2 bg-[#003399] hover:bg-[#002266] text-white text-xs font-bold rounded-lg disabled:opacity-40 transition-colors whitespace-nowrap">
            {memuat ? 'Menyemak…' : 'Semak Sekarang'}
          </button>
        </div>
        {hasil?.namaKej && (
          <p className="text-[11px] text-gray-400 mt-3 font-mono">{hasil.namaKej}</p>
        )}
      </div>

      {ralat && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-red-700">{ralat}</p>
        </div>
      )}

      {!hasil && !memuat && !ralat && (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
          <p className="text-sm text-gray-400">
            Tekan <span className="font-bold text-gray-600">Semak Sekarang</span> untuk memeriksa semua acara.
          </p>
        </div>
      )}

      {hasil && (
        <>
          {/* Kiraan */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ['Jumlah Acara', hasil.kiraan.jumlah,   'text-gray-800',   'bg-white'],
              ['Tiada Isu',    hasil.kiraan.ok,       'text-emerald-600','bg-emerald-50'],
              ['Kritikal',     hasil.kiraan.kritikal, 'text-red-600',    'bg-red-50'],
              ['Amaran',       hasil.kiraan.amaran,   'text-amber-600',  'bg-amber-50'],
            ].map(([label, nilai, warna, bg]) => (
              <div key={label} className={`${bg} rounded-xl border border-gray-200 px-4 py-3`}>
                <p className={`text-2xl font-black ${warna}`}>{nilai}</p>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Tapis */}
          <div className="flex items-center gap-2">
            {[['isu', `Isu sahaja (${hasil.kiraan.jumlah - hasil.kiraan.ok})`],
              ['semua', `Semua (${hasil.kiraan.jumlah})`]].map(([val, lbl]) => (
              <button key={val} onClick={() => setTapis(val)}
                className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-colors ${
                  tapis === val ? 'bg-[#003399] text-white' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}>
                {lbl}
              </button>
            ))}
          </div>

          {/* Senarai */}
          {dipapar.length === 0 ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-8 text-center">
              <p className="text-sm font-bold text-emerald-700">✓ Semua acara sihat</p>
              <p className="text-xs text-emerald-600 mt-1">Tiada isu ditemui.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {dipapar.map(s => (
                <div key={s.acara.id}
                  className={`bg-white rounded-xl border px-4 py-3 ${
                    s.tahap === 'kritikal' ? 'border-red-200'
                    : s.tahap === 'amaran' ? 'border-amber-200'
                    : s.tahap === 'info'   ? 'border-blue-200'
                    : 'border-gray-200'
                  }`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-gray-900">
                        #{s.acara.noAcara} {s.acara.namaAcara}
                        {adaNoPapar(s.acara) && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[9px] font-bold">
                            papar #{noAcaraPapar(s.acara)}
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        {s.jenis} · <span className="font-bold text-gray-700">{s.nP}</span>/{s.bilL} lorong
                        {' · '}{s.bilHeat > 0 ? `${s.bilHeat} heat` : 'tiada heat'}
                        {s.adaKeputusan && ' · keputusan rasmi'}
                      </p>
                    </div>
                    {s.tahap === 'ok' ? (
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 shrink-0">✓ OK</span>
                    ) : (
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full border shrink-0 ${TERUK[s.tahap].warna}`}>
                        {TERUK[s.tahap].label}
                      </span>
                    )}
                  </div>

                  {s.isu.length > 0 && (
                    <div className="mt-2.5 space-y-1.5">
                      {s.isu.map((i, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <span className="text-[11px] shrink-0 mt-0.5">
                            {i.teruk === 'kritikal' ? '🔴' : i.teruk === 'amaran' ? '🟠' : '🔵'}
                          </span>
                          <div className="min-w-0">
                            <p className="text-[11.5px] text-gray-700 leading-snug">{i.teks}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">→ {i.tindakan}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Halakan ke alat pembaikan — skrin ini tidak menulis */}
          {hasil.kiraan.jumlah - hasil.kiraan.ok > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-[11.5px] text-blue-800">
                Skrin ini membaca sahaja. Untuk membaiki, gunakan alat di Health Check.
              </p>
              <button onClick={() => navigate('/admin/health')}
                className="px-3 py-1.5 bg-white border border-blue-300 hover:bg-blue-100 text-blue-700 text-[11px] font-bold rounded-lg transition-colors whitespace-nowrap">
                Buka Health Check →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
