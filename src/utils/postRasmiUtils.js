/**
 * postRasmiUtils.js
 * ─────────────────
 * Logic post-rasmi yang dikongsi antara KeputusanRasmi (admin) dan
 * InputKeputusan (pencatat).
 *
 * Fungsi utama:
 *   runPostRasmi(db, heatDoc, acaraDoc, kejId, config)
 *
 * Config:
 *   schoolId          — tenant ID (WAJIB untuk GP multi-tenant)
 *   mataPingat        — { 1: 5, 2: 3, 3: 2, 4: 1 }  (dari kejohanan doc)
 *   bilanganKedudukan — bilangan kedudukan yang dapat medal_tally (default 8)
 *   peringkatKej      — 'S' | 'D' | 'N' | 'K'  (peringkat kejohanan)
 *   grantMedal        — boolean (adakah heat ini layak bagi medal)
 *   isRelay           — boolean
 *   onPesertaPatch    — callback(pesertaPatched) untuk update UI state (optional)
 *
 * GP Paths (multi-tenant):
 *   tenants/{schoolId}/kejohanan/{kejId}/heat/{heatId}          — heat FLAT
 *   tenants/{schoolId}/kejohanan/{kejId}/mata_olahragawan/{id}  — mata atlet
 *   tenants/{schoolId}/kejohanan/{kejId}/medal_tally/{id}       — tally sekolah
 *   tenants/{schoolId}/rekod/{rekodKey}                         — rekod kejohanan
 */

import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, increment,
} from 'firebase/firestore'

// ─── Konstanta ────────────────────────────────────────────────────────────────
const NAMA_PINGAT = { 1: 'emas', 2: 'perak', 3: 'gangsa', 4: 'tempat4', 5: 'tempat5' }
const DEFAULT_MATA_PINGAT = { 1: 5, 2: 3, 3: 2, 4: 1 }

export function rekodKeyStr(namaAcara, jantina, kategoriKod, peringkat) {
  // Normalize nama acara supaya format konsisten:
  // "5000 METER" → "5000M", "5000 M" → "5000M", "5000METER" → "5000M"
  // Elak duplicate rekod sebab format penulisan berbeza
  const normalized = String(namaAcara || '')
    .toUpperCase()
    .replace(/(\d)\s*METER\b/g, '$1M')   // "5000 METER" / "5000METER" → "5000M"
    .replace(/(\d)\s+M\b/g, '$1M')        // "5000 M" → "5000M"
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_]/g, '_')
  return [normalized, jantina, kategoriKod, peringkat]
    .join('_').toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/_+/g, '_')
}

/**
 * Jalankan proses selepas keputusan RASMI:
 *   1. Kira rank + mata olahragawan
 *   2. Kemas kini medal_tally
 *   3. Detect rekod baru (tuntutan)
 *   4. Patch peserta dalam heat doc dengan pecahRekod flag
 */
export async function runPostRasmi(db, heatDoc, acaraDoc, kejId, config = {}) {
  const {
    schoolId          = '',
    mataPingat        = DEFAULT_MATA_PINGAT,
    bilanganKedudukan = 8,
    peringkatKej      = 'D',
    grantMedal        = false,
    isRelay           = acaraDoc.isRelay || acaraDoc.jenisAcara === 'relay',
    onPesertaPatch    = null,
  } = config

  // ── Path helpers (GP multi-tenant) ──────────────────────────────────────────
  // schoolId WAJIB ada — jika kosong, postRasmi tidak akan tulis apa-apa ke Firestore
  const tPath  = (col, id)      => doc(db, 'tenants', schoolId, 'kejohanan', kejId, col, id)
  const rekodP = (key)          => doc(db, 'tenants', schoolId, 'rekod', key)

  const pecahRekodMap      = {} // noBib     → peringkat (individu) — pecah rekod
  const pecahRekodRelayMap = {} // kodSekolah → peringkat (relay) — pecah rekod
  const samaiRekodMap      = {} // noBib     → peringkat (individu) — samai rekod
  const samaiRekodRelayMap = {} // kodSekolah → peringkat (relay) — samai rekod

  // namaSekolah — guna yang tersimpan dalam peserta terus (GP simpan namaSekolah dalam heat)
  const getNamaSekolah = p => p.namaSekolah || p.kodSekolah || ''

  // Kira rank dari keputusan (on-the-fly — lebih tepat dari rankDalamHeat yang mungkin lapuk)
  const isPadang = ['padang_lompat', 'padang_balin'].includes(acaraDoc.jenisAcara)
  const semua    = heatDoc.peserta || []
  const isLompatTinggi = /lompat tinggi/i.test(
    acaraDoc.namaAcara || acaraDoc.namaAcaraPendek || ''
  )
  const finishers = semua
    .filter(p => !['DNS','DNF','DQ'].includes(p.status) && p.keputusan != null && Number(p.keputusan) > 0)
    .sort((a, b) => {
      if (isPadang) return Number(b.keputusan) - Number(a.keputusan)
      const diff = Number(a.keputusan) - Number(b.keputusan)
      if (diff !== 0) return diff
      // Masa bundar sama — tiebreak 1: masaSebenar
      const aHT = Number(a.masaSebenar) || null
      const bHT = Number(b.masaSebenar) || null
      if (aHT !== null && bHT !== null) return aHT - bHT
      if (aHT !== null) return -1
      if (bHT !== null) return 1
      // Tiebreak 2: kedudukan manual pencatat
      const aK = Number(a.kedudukan) || null
      const bK = Number(b.kedudukan) || null
      if (aK !== null && bK !== null) return aK - bK
      if (aK !== null) return -1
      if (bK !== null) return 1
      return 0
    })
  // Relay guna kodSekolah sebagai key; individu guna noBib (bukan noKP — PDPA)
  const pKey = p => isRelay ? (p.kodSekolah || p.lorong) : (p.noBib || p.noKP)
  const computedRankMap = new Map()
  // Lompat Tinggi: GUNA kedudukan manual pencatat (count-back rules MSSM)
  // Lain: sequential auto dengan tiebreak masaSebenar → kedudukan manual
  if (isLompatTinggi) {
    finishers.forEach(p => {
      if (p.kedudukan) computedRankMap.set(pKey(p), Number(p.kedudukan))
    })
  } else {
    finishers.forEach((p, i) => {
      computedRankMap.set(pKey(p), i + 1)
    })
  }

  // ── Loop peserta ─────────────────────────────────────────────────────────────
  for (const p of semua) {
    const rank      = computedRankMap.get(pKey(p)) || p.rankDalamHeat || null
    const isFlagged = ['DNS','DNF','DQ'].includes(p.status)
    const hasResult = p.keputusan != null && Number(p.keputusan) > 0
    if (!rank || isFlagged || !hasResult) continue

    // ── Mata olahragawan (individu, bukan relay, top 4, fasa final sahaja) ─────
    // Doc ID guna noBib (bukan noKP — PDPA, mata_olahragawan allow read: if true)
    if (grantMedal && !isRelay && p.noBib && rank <= 4) {
      const mata      = mataPingat[rank] ?? 0
      const pingat    = NAMA_PINGAT[rank]
      const mId       = `${p.noBib}_${kejId}`
      const mRef      = tPath('mata_olahragawan', mId)
      const unitAcara = isPadang ? 'm' : 's'
      const acaraKey  = `acaraDetail_${acaraDoc.id}`
      try {
        await setDoc(mRef, {
          noBib:       p.noBib       || '',
          namaAtlet:   p.namaAtlet   || '',
          kodSekolah:  p.kodSekolah  || '',
          namaSekolah: getNamaSekolah(p),
          jantina:     acaraDoc.jantina    || '',
          kategoriKod: acaraDoc.isTerbuka ? (p.kategoriKod || acaraDoc.kategoriKod || '') : (acaraDoc.kategoriKod || ''),
          kejohananId: kejId,
        }, { merge: true })

        const existingSnap = await getDoc(mRef)
        const existingData = existingSnap.exists() ? existingSnap.data() : {}
        const prevDetail   = existingData[acaraKey]

        const patch = { [acaraKey]: { aceraId: acaraDoc.id, namaAcara: acaraDoc.namaAcara, pingat, mata, rank, prestasi: p.keputusan ?? null, unit: unitAcara } }
        if (prevDetail) {
          const prevMata   = prevDetail.mata   || 0
          const prevPingat = prevDetail.pingat  || ''
          if (mata !== prevMata)     patch.jumlahMata           = increment(mata - prevMata)
          if (pingat !== prevPingat) {
            patch[`pingat_${prevPingat}`] = increment(-1)
            patch[`pingat_${pingat}`]     = increment(1)
          }
        } else {
          patch.jumlahMata          = increment(mata)
          patch[`pingat_${pingat}`] = increment(1)
        }
        await updateDoc(mRef, patch)
      } catch (e) { console.warn('mata_olahragawan:', e.message) }
    }

    // ── Medal tally (per sekolah, fasa final sahaja) ─────────────────────────
    if (grantMedal && p.kodSekolah && rank <= Math.min(bilanganKedudukan, 5) && NAMA_PINGAT[rank]) {
      const pingat     = NAMA_PINGAT[rank]
      const tId        = `${p.kodSekolah}_${kejId}`
      const tRef       = tPath('medal_tally', tId)
      // Relay: guna kodSekolah; individu: guna noBib → lorong → rank (bukan noKP — PDPA)
      const contribKey = `contrib_${heatDoc.id}_${isRelay ? p.kodSekolah : (p.noBib || p.lorong || rank)}`
      try {
        await setDoc(tRef, {
          kodSekolah: p.kodSekolah, namaSekolah: getNamaSekolah(p), kejohananId: kejId,
        }, { merge: true })

        const tSnap    = await getDoc(tRef)
        const tData    = tSnap.exists() ? tSnap.data() : {}
        const prevContr = tData[contribKey]

        // Relay guna 'RELAY' sebagai katKey supaya breakdown tally papar row berasingan
        const katKey       = isRelay ? 'RELAY' : (acaraDoc.isTerbuka ? (p.kategoriKod || acaraDoc.kategoriKod || '') : (acaraDoc.kategoriKod || ''))
        const katPingat    = `kat_${katKey}_${acaraDoc.jantina}_${pingat}`
        // noKP TIDAK disimpan dalam medal_tally — public-readable collection
        const tPatch = { [contribKey]: { pingat, noBib: p.noBib || null, rank, kategoriKod: katKey, jantina: acaraDoc.jantina, isRelay: !!isRelay } }
        if (prevContr) {
          const prevPingat   = prevContr.pingat      || ''
          const prevKat      = prevContr.kategoriKod || katKey
          const prevJantina  = prevContr.jantina     || acaraDoc.jantina
          const prevKatField = `kat_${prevKat}_${prevJantina}_${prevPingat}`
          // BUG FIX: kalau pingat/kat/jantina berubah — net jumlahPingat = 0
          // Tapi pingat field & kat field perlu shift (undo lama, apply baru)
          // Field SAMA tidak boleh assign 2x dalam object (yg kedua overwrite yg pertama)
          if (prevPingat !== pingat) {
            tPatch[prevPingat] = increment(-1)
            tPatch[pingat]     = increment(1)
          }
          if (prevKatField !== katPingat) {
            tPatch[prevKatField] = increment(-1)
            tPatch[katPingat]    = increment(1)
          }
          // jumlahPingat tidak berubah — 1 contrib = 1 pingat (cuma tukar jenis)
        } else {
          tPatch[pingat]      = increment(1)
          tPatch.jumlahPingat = increment(1)
          tPatch[katPingat]   = increment(1)
        }
        await updateDoc(tRef, tPatch)
      } catch (e) { console.warn('medal_tally:', e.message) }
    }

    // ── Rekod detection — individu, tempat 1, semua fasa (saringan/final/terus final) ──
    const isPadangAcara = ['padang_lompat', 'padang_balin'].includes(acaraDoc.jenisAcara)
    if (
      !isRelay && rank === 1 &&
      p.keputusan != null && p.keputusan !== '' &&
      acaraDoc.jantina && acaraDoc.kategoriKod && (acaraDoc.namaAcaraPendek || acaraDoc.namaAcara)
    ) {
      try {
        const unit      = isPadangAcara ? 'm' : 's'
        const rekodNama = acaraDoc.namaAcaraPendek || acaraDoc.namaAcara

        // Cuba pelbagai key format — sama seperti rekodUtils.cariRekodUntukAcara
        // Format baru: kategoriKod (A/B/C) | Format lama: kelasDariNama (L12/P12)
        const namaPenuh  = (acaraDoc.namaAcara      || '').trim()
        const namaPendek = (acaraDoc.namaAcaraPendek || '').trim()
        const kelasDariNamaI = (namaPenuh && namaPendek && namaPenuh !== namaPendek)
          ? namaPenuh.slice(namaPendek.length).trim() : ''
        const katsToTryI = [...new Set([acaraDoc.kategoriKod, kelasDariNamaI].filter(Boolean))]

        // Cuba pelbagai nama acara — kalau ada variant (cth: namaAcara vs namaAcaraPendek)
        const namaToTry = [...new Set([rekodNama, namaPenuh, namaPendek].filter(Boolean))]

        // Cari key yang wujud dalam Firestore — cuba SEMUA kombinasi nama × kat × peringkat
        // Peringkat: cuba peringkatKej dulu, kemudian D, N, K (yg lebih tinggi guna sbg baseline)
        const peringkatToTry = [...new Set([peringkatKej, 'D', 'N', 'K'])]
        let rKey = rekodKeyStr(rekodNama, acaraDoc.jantina, acaraDoc.kategoriKod, peringkatKej)
        let rekodSnap = null, tuntutanSnap = null
        outer:
        for (const nama of namaToTry) {
          for (const kat of katsToTryI) {
            for (const pr of peringkatToTry) {
              const k = rekodKeyStr(nama, acaraDoc.jantina, kat, pr)
              const [rs, ts] = await Promise.all([getDoc(rekodP(k)), getDoc(rekodP(k + '_tuntutan'))])
              if (rs.exists() || ts.exists()) { rKey = k; rekodSnap = rs; tuntutanSnap = ts; break outer }
            }
          }
        }
        // Jika tiada yang jumpa — fetch primary key (return not-exists snap)
        if (!rekodSnap) {
          const [rs, ts] = await Promise.all([getDoc(rekodP(rKey)), getDoc(rekodP(rKey + '_tuntutan'))])
          rekodSnap = rs; tuntutanSnap = ts
        }
        const primaryKey  = rekodKeyStr(rekodNama, acaraDoc.jantina, acaraDoc.kategoriKod, peringkatKej)
        const rekodRef    = rekodP(primaryKey)
        const tuntutanRef = rekodP(primaryKey + '_tuntutan')
        const newPrestasi = Number(p.keputusan)

        // Semak rekod sedia ada — dari rekodRef (aktif) atau tuntutanRef (pending)
        // Exclude tuntutan dari heat yang sama supaya tidak compare dengan diri sendiri
        const rekodSedia = rekodSnap.exists() && rekodSnap.data().statusRekod === 'aktif'
          ? rekodSnap.data()
          : tuntutanSnap.exists() && tuntutanSnap.data().heatId !== heatDoc.id
            ? tuntutanSnap.data()
            : null

        let isBetter = false
        let isEqual  = false
        if (rekodSedia) {
          // Normalise format mm.ss → saat penuh (rekod lama manual < 10 = format mm.ss)
          const normaliseSaat = v => {
            const n = Number(v)
            if (unit === 's' && n > 0 && n < 10) {
              const m = Math.floor(n)
              const s = Math.round((n - m) * 100)
              return m * 60 + s
            }
            return n
          }
          const oldPrestasi = normaliseSaat(rekodSedia.prestasi)
          const newR = Number(newPrestasi.toFixed(2))
          const oldR = Number(oldPrestasi.toFixed(2))
          isBetter = unit === 's' ? newR < oldR : newR > oldR
          isEqual  = !isBetter && (newR === oldR)
        } else {
          isBetter = true // rekod pertama untuk acara ini
        }

        // Samai rekod — badge MRKL, tiada tuntutan (rekod tidak berubah)
        if (isEqual && p.noBib) {
          samaiRekodMap[p.noBib] = peringkatKej
        }

        if (isBetter) {
          const today    = new Date().toISOString().split('T')[0]
          if (p.noBib) pecahRekodMap[p.noBib] = peringkatKej

          // Simpan dalam mata_olahragawan untuk paparan Olahragawan
          if (p.noBib) {
            const rekodLama = rekodSedia ?? null
            await setDoc(tPath('mata_olahragawan', `${p.noBib}_${kejId}`), {
              [`rekod_${acaraDoc.id}`]: {
                namaAcara:        acaraDoc.namaAcara,
                namaAcaraPendek:  acaraDoc.namaAcaraPendek || acaraDoc.namaAcara,
                kategoriKod:      acaraDoc.kategoriKod,
                jantina:      acaraDoc.jantina,
                peringkat:    peringkatKej,
                unit,
                prestasiBaru: Number(p.keputusan),
                tarikhBaru:   today,
                prestasiLama: rekodLama ? Number(rekodLama.prestasi) : null,
                tahunLama:    rekodLama ? String(rekodLama.tarikhRekod || '').slice(0, 4) : null,
                namaLama:     rekodLama?.namaAtlet   || null,
                lokasiLama:   rekodLama?.namaSekolah || rekodLama?.namaDaerah || rekodLama?.namaNegeri || null,
                catatanLama:  rekodLama?.catatanKhas || null,
              },
            }, { merge: true }).catch(() => {})
          }

          const rekodData = {
            rekodId:      primaryKey,
            namaAcara:    acaraDoc.namaAcara,
            jantina:      acaraDoc.jantina,
            kategoriKod:  acaraDoc.kategoriKod,
            peringkat:    peringkatKej,
            // noKP TIDAK disimpan — public-readable collection (PDPA)
            // atletId guna noBib sebagai ref (bukan IC)
            atletId:      p.noBib   || '',
            namaAtlet:    p.namaAtlet  || '',
            kodSekolah:   p.kodSekolah || '',
            namaSekolah:  getNamaSekolah(p),
            prestasi:     newPrestasi,
            unit,
            windSpeed:    heatDoc.windSpeed  ?? null,
            isWindLegal:  heatDoc.isWindLegal ?? true,
            jenisRekod:   'elektronik',
            statusRekod:  'aktif',
            tarikhRekod:  today,
            kejohananId:  kejId,
            acaraId:      acaraDoc.id  || null,
            heatId:       heatDoc.id   || null,
            prestasiLama: rekodSedia ? Number(rekodSedia.prestasi) : null,
            tahunLama:    rekodSedia ? String(rekodSedia.tarikhRekod || '').slice(0, 4) : null,
            namaLama:     rekodSedia?.namaAtlet   || null,
            lokasiLama:   rekodSedia?.namaSekolah || rekodSedia?.namaDaerah || null,
            updatedAt:    serverTimestamp(),
          }

          // Tulis ke tuntutan SAHAJA — admin perlu approve sebelum masuk rekod aktif
          await setDoc(tuntutanRef, { ...rekodData, rekodId: primaryKey + '_tuntutan', rekodAsal: primaryKey })

          // Jika tuntutan lama tersimpan di key lain (format lama) — padam untuk elak orphan
          // JANGAN padam rekod/{rKey} — mungkin rekod lama sudah diluluskan admin
          if (rKey !== primaryKey) {
            await deleteDoc(rekodP(rKey + '_tuntutan')).catch(() => {})
          }
        }
      } catch (e) { console.warn('rekod_tuntutan:', e.message) }
    }

    // ── Rekod relay — semua fasa (saringan/final/terus final) ────────────────
    if (
      isRelay && rank === 1 &&
      p.keputusan != null && p.keputusan !== '' && p.kodSekolah &&
      acaraDoc.jantina && acaraDoc.kategoriKod && (acaraDoc.namaAcaraPendek || acaraDoc.namaAcara)
    ) {
      try {
        const rekodNama = acaraDoc.namaAcaraPendek || acaraDoc.namaAcara

        // Cuba pelbagai key format (sama seperti individu di atas)
        const namaPenuhR  = (acaraDoc.namaAcara      || '').trim()
        const namaPendekR = (acaraDoc.namaAcaraPendek || '').trim()
        const kelasDariNamaR = (namaPenuhR && namaPendekR && namaPenuhR !== namaPendekR)
          ? namaPenuhR.slice(namaPendekR.length).trim() : ''
        const katsToTryR = [...new Set([acaraDoc.kategoriKod, kelasDariNamaR].filter(Boolean))]
        const namaToTryR = [...new Set([rekodNama, namaPenuhR, namaPendekR].filter(Boolean))]
        const peringkatToTryR = [...new Set([peringkatKej, 'D', 'N', 'K'])]

        let rKey = rekodKeyStr(rekodNama, acaraDoc.jantina, acaraDoc.kategoriKod, peringkatKej)
        let rekodSnap = null, tuntutanSnap = null
        outer2:
        for (const nama of namaToTryR) {
          for (const kat of katsToTryR) {
            for (const pr of peringkatToTryR) {
              const k = rekodKeyStr(nama, acaraDoc.jantina, kat, pr)
              const [rs, ts] = await Promise.all([getDoc(rekodP(k)), getDoc(rekodP(k + '_tuntutan'))])
              if (rs.exists() || ts.exists()) { rKey = k; rekodSnap = rs; tuntutanSnap = ts; break outer2 }
            }
          }
        }
        if (!rekodSnap) {
          const [rs, ts] = await Promise.all([getDoc(rekodP(rKey)), getDoc(rekodP(rKey + '_tuntutan'))])
          rekodSnap = rs; tuntutanSnap = ts
        }
        const primaryKeyR = rekodKeyStr(rekodNama, acaraDoc.jantina, acaraDoc.kategoriKod, peringkatKej)
        const rekodRef    = rekodP(primaryKeyR)
        const tuntutanRef = rekodP(primaryKeyR + '_tuntutan')
        const newPrestasi = Number(p.keputusan)

        const rekodSediaRelay = rekodSnap.exists() && rekodSnap.data().statusRekod === 'aktif'
          ? rekodSnap.data()
          : tuntutanSnap.exists() ? tuntutanSnap.data() : null

        let isBetter = false
        let isEqual  = false
        if (rekodSediaRelay) {
          const newR = Number(newPrestasi.toFixed(2))
          const oldR = Number(Number(rekodSediaRelay.prestasi).toFixed(2))
          isBetter = newR < oldR
          isEqual  = !isBetter && (newR === oldR)
        } else {
          isBetter = true
        }

        // Samai rekod relay — badge MRKL, tiada tuntutan
        if (isEqual && p.kodSekolah) {
          samaiRekodRelayMap[p.kodSekolah] = peringkatKej
        }

        if (isBetter) {
          const today     = new Date().toISOString().split('T')[0]
          // Tandakan pasukan ini untuk patch pecahRekod dalam heat doc
          pecahRekodRelayMap[p.kodSekolah] = peringkatKej
          const rekodLama = rekodSediaRelay ?? null
          const relayData = {
            rekodId:      primaryKeyR,
            namaAcara:    acaraDoc.namaAcara,
            jantina:      acaraDoc.jantina,
            kategoriKod:  acaraDoc.kategoriKod,
            peringkat:    peringkatKej,
            noKP:         null,
            namaAtlet:    getNamaSekolah(p),
            kodSekolah:   p.kodSekolah || '',
            namaSekolah:  getNamaSekolah(p),
            prestasi:     newPrestasi,
            unit:         's',
            isRelay:      true,
            windSpeed:    null,
            isWindLegal:  true,
            jenisRekod:   'elektronik',
            statusRekod:  'aktif',
            tarikhRekod:  today,
            kejohananId:  kejId,
            acaraId:      acaraDoc.id   || null,
            heatId:       heatDoc.id    || null,
            prestasiLama: rekodLama ? Number(rekodLama.prestasi) : null,
            tahunLama:    rekodLama ? String(rekodLama.tarikhRekod || '').slice(0, 4) : null,
            namaLama:     rekodLama?.namaAtlet  || null,
            lokasiLama:   rekodLama?.namaSekolah || null,
            updatedAt:    serverTimestamp(),
          }
          // Tulis ke tuntutan SAHAJA — admin perlu approve sebelum masuk rekod aktif
          await setDoc(tuntutanRef, { ...relayData, rekodId: primaryKeyR + '_tuntutan', rekodAsal: primaryKeyR })
          // Jika tuntutan lama di key format lama — padam untuk elak orphan
          // JANGAN padam rekod/{rKey} — mungkin rekod lama sudah diluluskan admin
          if (rKey !== primaryKeyR) {
            await deleteDoc(rekodP(rKey + '_tuntutan')).catch(() => {})
          }
        }
      } catch (e) { console.warn('rekod_relay:', e.message) }
    }
  }

  // ── Patch peserta dalam heat doc dengan pecahRekod + samaiRekod flag ────────
  const hasIndivRekod = Object.keys(pecahRekodMap).length > 0
  const hasRelayRekod = Object.keys(pecahRekodRelayMap).length > 0
  const hasIndivSamai = Object.keys(samaiRekodMap).length > 0
  const hasRelaySamai = Object.keys(samaiRekodRelayMap).length > 0
  if (hasIndivRekod || hasRelayRekod || hasIndivSamai || hasRelaySamai) {
    try {
      const pesertaPatched = semua.map(p => {
        if (isRelay) {
          const pecah = pecahRekodRelayMap[p.kodSekolah]
          const samai = samaiRekodRelayMap[p.kodSekolah]
          if (pecah) return { ...p, pecahRekod: pecah }
          if (samai) return { ...p, samaiRekod: samai }
        } else {
          const pecah = pecahRekodMap[p.noBib]
          const samai = samaiRekodMap[p.noBib]
          if (pecah) return { ...p, pecahRekod: pecah }
          if (samai) return { ...p, samaiRekod: samai }
        }
        return p
      })
      const hRef = tPath('heat', heatDoc.id)
      await updateDoc(hRef, { peserta: pesertaPatched, updatedAt: serverTimestamp() })
      if (onPesertaPatch) onPesertaPatch(pesertaPatched)
    } catch (e) { console.warn('patch rekod flag:', e.message) }
  }
}
