/**
 * seedJadual2026.js — Seed Jadual Acara MSSM Kemaman 2026
 * 152 acara | 5 Hari | 9 Sesi | 28 Jun – 2 Julai 2026
 * Lokasi: SMK Sultan Ismail, Kemaman
 *
 * No Acara = Document ID utama (kunci seluruh sistem)
 * Format: [noAcara, masa, namaAcara, kelas, peringkat, hari, sesi, lokasi]
 */

import { db } from '../firebase/config'
import {
  collection, doc, setDoc, getDoc, getDocs, deleteDoc,
  query, where, writeBatch, Timestamp,
} from 'firebase/firestore'

// ─── Tarikh Mapping ───────────────────────────────────────────────────────────

function tarikh2026(hari) {
  return { 1:'2026-06-28', 2:'2026-06-29', 3:'2026-06-30', 4:'2026-07-01', 5:'2026-07-02' }[hari] || '2026-06-28'
}

// ─── Auto-detect Helpers ──────────────────────────────────────────────────────

function detectJenis(nama) {
  const n = nama.toLowerCase()
  if (/\d\s*x\s*\d|4\s*x/.test(n))                        return 'relay'
  if (/jalan kaki|3000|5000|1500|800/.test(n))             return 'mass_start'
  if (/lompat jauh|lompat kijang|lompat tinggi/.test(n))   return 'padang_lompat'
  if (/lontar|lempar|rejam|peluru|cakera|lembing/.test(n)) return 'padang_balin'
  return 'lorong'
}

function detectAdaHeat(peringkat) { return /saringan/i.test(peringkat) }

function detectBilanganHeat(peringkat) {
  const m = peringkat.match(/(\d+)\s*[-–]\s*(\d+)/)
  return m ? parseInt(m[2]) : 1
}

function detectWindReading(nama) {
  return /100\s*m(?!eta)|200\s*m(?!eta)|lompat jauh|lompat kijang/.test(nama.toLowerCase())
}

function detectKategoriKod(kelas) {
  const umurStr = kelas.trim().replace(/^[LP]\s*/, '').trim()
  if (umurStr === 'PPKI')    return 'PPKI'
  if (umurStr === 'Terbuka') return 'E'
  const umur = parseInt(umurStr)
  if (isNaN(umur)) return 'E'
  if (umur <= 10) return 'A'
  if (umur <= 12) return 'B'
  if (umur <= 14) return 'C'
  if (umur <= 16) return 'D'
  return 'E'
}

// ─── Data Jadual Lengkap — 152 Acara ─────────────────────────────────────────

export const JADUAL_2026 = [

  // HARI 1 — SESI 1 (Ahad 28 Jun 2026 Pagi)
  ['101','08:00','3000 Meter','P Terbuka','Akhir',1,1,'Trek Utama'],
  ['102','08:00','Lompat Jauh','L 11','Akhir',1,1,'Padang A'],
  ['103','08:00','Lompat Kijang','P 18','Akhir',1,1,'Padang A'],
  ['104','08:00','Rejam Lembing','P 15','Akhir',1,1,'Padang B'],
  ['105','08:00','Lompat Tinggi','L 15','Akhir',1,1,'Padang C'],
  ['106','08:00','Lontar Peluru','L 18','Akhir',1,1,'Padang B'],
  ['107','08:30','5000 Meter Jalan Kaki','L 15','Akhir',1,1,'Trek Utama'],
  ['108','09:15','100 Meter','P 10','Saringan (Heat 1-6)',1,1,'Trek Utama'],
  ['109','09:30','100 Meter','L 10','Saringan (Heat 1-6)',1,1,'Trek Utama'],
  ['110','09:45','100 Meter','P 11','Saringan (Heat 1-6)',1,1,'Trek Utama'],
  ['111','10:00','100 Meter','L 11','Saringan (Heat 1-6)',1,1,'Trek Utama'],
  ['112','10:15','100 Meter','P 12','Saringan (Heat 1-6)',1,1,'Trek Utama'],
  ['113','10:30','100 Meter','L 12','Saringan (Heat 1-6)',1,1,'Trek Utama'],
  ['114','11:00','100 Meter','P 15','Saringan (Heat 1-6)',1,1,'Trek Utama'],
  ['115','11:15','100 Meter','L 15','Saringan (Heat 1-6)',1,1,'Trek Utama'],
  ['116','11:30','100 Meter','P 18','Saringan (Heat 1-6)',1,1,'Trek Utama'],
  ['117','11:45','100 Meter','L 18','Saringan (Heat 1-6)',1,1,'Trek Utama'],

  // HARI 1 — SESI 2 (Ahad 28 Jun 2026 Petang)
  ['118','14:30','Lompat Jauh','P 15','Akhir',1,2,'Padang A'],
  ['119','14:30','Rejam Lembing','L 18','Akhir',1,2,'Padang B'],
  ['120','14:30','Lontar Peluru','L 12','Akhir',1,2,'Padang B'],
  ['121','14:30','Lompat Tinggi','P 11','Akhir',1,2,'Padang C'],
  ['122','14:30','100 Meter','P 10','Akhir',1,2,'Trek Utama'],
  ['123','14:35','100 Meter','L 10','Akhir',1,2,'Trek Utama'],
  ['124','14:40','100 Meter','P 11','Akhir',1,2,'Trek Utama'],
  ['125','14:45','100 Meter','L 11','Akhir',1,2,'Trek Utama'],
  ['126','14:50','100 Meter','P 12','Akhir',1,2,'Trek Utama'],
  ['127','14:55','100 Meter','L 12','Akhir',1,2,'Trek Utama'],
  ['128','15:00','100 Meter','P 15','Akhir',1,2,'Trek Utama'],
  ['129','15:05','100 Meter','L 15','Akhir',1,2,'Trek Utama'],
  ['130','15:10','100 Meter','P 18','Akhir',1,2,'Trek Utama'],
  ['131','15:15','100 Meter','L 18','Akhir',1,2,'Trek Utama'],
  ['132','15:30','800 Meter','P 12','Akhir',1,2,'Trek Utama'],
  ['133','15:40','800 Meter','L 12','Akhir',1,2,'Trek Utama'],
  ['134','15:50','800 Meter','P 15','Akhir',1,2,'Trek Utama'],
  ['135','16:00','800 Meter','L 15','Akhir',1,2,'Trek Utama'],
  ['136','16:10','800 Meter','P 18','Akhir',1,2,'Trek Utama'],
  ['137','16:20','800 Meter','L 18','Akhir',1,2,'Trek Utama'],

  // HARI 2 — SESI 3 (Isnin 29 Jun 2026 Pagi)
  ['201','08:00','5000 Meter Jalan Kaki','L 18','Akhir',2,3,'Trek Utama'],
  ['202','08:00','Lompat Jauh','L 12','Akhir',2,3,'Padang A'],
  ['203','08:00','Lompat Kijang','L 15','Akhir',2,3,'Padang A'],
  ['204','08:00','Rejam Lembing','P 18','Akhir',2,3,'Padang B'],
  ['205','08:00','Lompat Tinggi','P 15','Akhir',2,3,'Padang C'],
  ['206','08:00','Lontar Peluru','P 12','Akhir',2,3,'Padang B'],
  ['207','09:00','200 Meter','P 10','Saringan (Heat 1-5)',2,3,'Trek Utama'],
  ['208','09:20','200 Meter','L 10','Saringan (Heat 1-5)',2,3,'Trek Utama'],
  ['209','09:40','200 Meter','P 11','Saringan (Heat 1-5)',2,3,'Trek Utama'],
  ['210','10:00','200 Meter','L 11','Saringan (Heat 1-5)',2,3,'Trek Utama'],
  ['211','10:30','80m Lari Berpagar','P 11','Saringan (Heat 1-5)',2,3,'Trek Utama'],
  ['212','10:45','80m Lari Berpagar','P 12','Saringan (Heat 1-5)',2,3,'Trek Utama'],
  ['213','11:00','80m Lari Berpagar','L 11','Saringan (Heat 1-5)',2,3,'Trek Utama'],
  ['214','11:15','80m Lari Berpagar','L 12','Saringan (Heat 1-5)',2,3,'Trek Utama'],
  ['215','11:30','100m Lari Berpagar','P 15','Saringan (Heat 1-4)',2,3,'Trek Utama'],
  ['216','11:45','100m Lari Berpagar','P 18','Saringan (Heat 1-4)',2,3,'Trek Utama'],
  ['217','12:00','110m Lari Berpagar','L 15','Saringan (Heat 1-4)',2,3,'Trek Utama'],
  ['218','12:15','110m Lari Berpagar','L 18','Saringan (Heat 1-4)',2,3,'Trek Utama'],

  // HARI 2 — SESI 4 (Isnin 29 Jun 2026 Petang)
  ['219','14:30','Rejam Lembing','L 15','Akhir',2,4,'Padang B'],
  ['220','14:30','Lompat Jauh','P 11','Akhir',2,4,'Padang A'],
  ['221','14:30','Lompat Kijang','P 15','Akhir',2,4,'Padang A'],
  ['222','14:30','Lompat Tinggi','L 12','Akhir',2,4,'Padang C'],
  ['223','14:30','Lontar Peluru','P 10','Akhir',2,4,'Padang B'],
  ['224','14:30','110m Lari Berpagar','L 18','Akhir',2,4,'Trek Utama'],
  ['225','14:35','110m Lari Berpagar','L 15','Akhir',2,4,'Trek Utama'],
  ['226','14:50','100m Lari Berpagar','P 18','Akhir',2,4,'Trek Utama'],
  ['227','14:55','100m Lari Berpagar','P 15','Akhir',2,4,'Trek Utama'],
  ['228','15:05','80m Lari Berpagar','P 11','Akhir',2,4,'Trek Utama'],
  ['229','15:10','80m Lari Berpagar','P 12','Akhir',2,4,'Trek Utama'],
  ['230','15:15','80m Lari Berpagar','L 11','Akhir',2,4,'Trek Utama'],
  ['231','15:20','80m Lari Berpagar','L 12','Akhir',2,4,'Trek Utama'],
  ['232','15:50','200 Meter','P 10','Akhir',2,4,'Trek Utama'],
  ['233','15:55','200 Meter','L 10','Akhir',2,4,'Trek Utama'],
  ['234','16:00','200 Meter','P 11','Akhir',2,4,'Trek Utama'],
  ['235','16:05','200 Meter','L 11','Akhir',2,4,'Trek Utama'],
  ['236','16:15','1500 Meter','P 15','Akhir',2,4,'Trek Utama'],
  ['237','16:25','1500 Meter','L 15','Akhir',2,4,'Trek Utama'],
  ['238','16:35','1500 Meter','P 18','Akhir',2,4,'Trek Utama'],
  ['239','16:45','1500 Meter','L 18','Akhir',2,4,'Trek Utama'],

  // HARI 3 — SESI 5 (Selasa 30 Jun 2026 Pagi)
  ['301','08:00','3000 Meter','L Terbuka','Akhir',3,5,'Trek Utama'],
  ['302','08:00','Lompat Jauh','P 10','Akhir',3,5,'Padang A'],
  ['303','08:00','Lempar Cakera','L 18','Akhir',3,5,'Padang B'],
  ['304','08:00','Lontar Peluru','L 15','Akhir',3,5,'Padang B'],
  ['305','08:00','Lompat Tinggi','L 11','Akhir',3,5,'Padang C'],
  ['306','08:40','400 Meter','P 15','Saringan (Heat 1-5)',3,5,'Trek Utama'],
  ['307','09:00','400 Meter','L 15','Saringan (Heat 1-5)',3,5,'Trek Utama'],
  ['308','09:20','400 Meter','P 18','Saringan (Heat 1-5)',3,5,'Trek Utama'],
  ['309','09:40','400 Meter','L 18','Saringan (Heat 1-5)',3,5,'Trek Utama'],
  ['310','10:30','4 x 100 Meter','P 12','Saringan (Heat 1-5)',3,5,'Trek Utama'],
  ['311','10:50','4 x 100 Meter','L 12','Saringan (Heat 1-5)',3,5,'Trek Utama'],
  ['312','11:10','4 x 100 Meter','P 15','Saringan (Heat 1-3)',3,5,'Trek Utama'],
  ['313','11:30','4 x 100 Meter','L 15','Saringan (Heat 1-3)',3,5,'Trek Utama'],
  ['314','11:50','4 x 100 Meter','P 18','Saringan (Heat 1-3)',3,5,'Trek Utama'],
  ['315','12:10','4 x 100 Meter','L 18','Saringan (Heat 1-3)',3,5,'Trek Utama'],

  // HARI 3 — SESI 6 (Selasa 30 Jun 2026 Petang)
  ['316','14:30','Lompat Jauh','L 15','Akhir',3,6,'Padang A'],
  ['317','14:30','Lempar Cakera','P 15','Akhir',3,6,'Padang B'],
  ['318','14:30','Lompat Tinggi','P 18','Akhir',3,6,'Padang C'],
  ['319','14:30','Lompat Kijang','L 18','Akhir',3,6,'Padang A'],
  ['320','14:30','Lontar Peluru','L 10','Akhir',3,6,'Padang B'],
  ['321','14:30','400 Meter','P 15','Akhir',3,6,'Trek Utama'],
  ['322','14:35','400 Meter','L 15','Akhir',3,6,'Trek Utama'],
  ['323','14:40','400 Meter','P 18','Akhir',3,6,'Trek Utama'],
  ['324','14:45','400 Meter','L 18','Akhir',3,6,'Trek Utama'],
  ['325','15:15','4 x 100 Meter','P 12','Akhir',3,6,'Trek Utama'],
  ['326','15:25','4 x 100 Meter','L 12','Akhir',3,6,'Trek Utama'],
  ['327','15:35','4 x 100 Meter','P 15','Akhir',3,6,'Trek Utama'],
  ['328','15:45','4 x 100 Meter','L 15','Akhir',3,6,'Trek Utama'],
  ['329','15:55','4 x 100 Meter','P 18','Akhir',3,6,'Trek Utama'],
  ['330','16:05','4 x 100 Meter','L 18','Akhir',3,6,'Trek Utama'],

  // HARI 4 — SESI 7 (Rabu 1 Julai 2026 Pagi)
  ['401','08:00','3000 Meter Jalan Kaki','P 15','Akhir',4,7,'Trek Utama'],
  ['402','08:00','Lompat Jauh','P 18','Akhir',4,7,'Padang A'],
  ['403','08:00','Lempar Cakera','L 15','Akhir',4,7,'Padang B'],
  ['404','08:00','Lontar Peluru','L 11','Akhir',4,7,'Padang B'],
  ['405','08:00','Lompat Tinggi','P 12','Akhir',4,7,'Padang C'],
  ['406','09:00','200 Meter','P 12','Saringan (Heat 1-5)',4,7,'Trek Utama'],
  ['407','09:20','200 Meter','L 12','Saringan (Heat 1-5)',4,7,'Trek Utama'],
  ['408','09:40','200 Meter','P 15','Saringan (Heat 1-4)',4,7,'Trek Utama'],
  ['409','10:00','200 Meter','L 15','Saringan (Heat 1-4)',4,7,'Trek Utama'],
  ['410','10:30','200 Meter','P 18','Saringan (Heat 1-4)',4,7,'Trek Utama'],
  ['411','10:45','200 Meter','L 18','Saringan (Heat 1-4)',4,7,'Trek Utama'],
  ['412','11:00','200m Lari Berpagar','L 15','Saringan (Heat 1-4)',4,7,'Trek Utama'],
  ['413','11:15','200m Lari Berpagar','P 15','Saringan (Heat 1-4)',4,7,'Trek Utama'],
  ['414','11:30','400m Lari Berpagar','P 18','Saringan (Heat 1-4)',4,7,'Trek Utama'],
  ['415','11:45','400m Lari Berpagar','L 18','Saringan (Heat 1-4)',4,7,'Trek Utama'],

  // HARI 4 — SESI 8 (Rabu 1 Julai 2026 Petang)
  ['416','14:30','Lompat Jauh','P 12','Akhir',4,8,'Padang A'],
  ['417','14:30','Lempar Cakera','P 18','Akhir',4,8,'Padang B'],
  ['418','14:30','Lontar Peluru','P 15','Akhir',4,8,'Padang B'],
  ['419','14:30','Lompat Tinggi','L 18','Akhir',4,8,'Padang C'],
  ['420','14:30','400m Lari Berpagar','L 18','Akhir',4,8,'Trek Utama'],
  ['421','14:35','400m Lari Berpagar','P 18','Akhir',4,8,'Trek Utama'],
  ['422','14:45','200m Lari Berpagar','P 15','Akhir',4,8,'Trek Utama'],
  ['423','14:50','200m Lari Berpagar','L 15','Akhir',4,8,'Trek Utama'],
  ['424','15:20','4 x 200 Meter','P 12','Saringan (Heat 1-5)',4,8,'Trek Utama'],
  ['425','15:40','4 x 200 Meter','L 12','Saringan (Heat 1-5)',4,8,'Trek Utama'],
  ['426','16:10','4 x 400 Meter','P 15','Saringan (Heat 1-3)',4,8,'Trek Utama'],
  ['427','16:25','4 x 400 Meter','L 15','Saringan (Heat 1-3)',4,8,'Trek Utama'],
  ['428','16:50','4 x 400 Meter','P 18','Saringan (Heat 1-3)',4,8,'Trek Utama'],
  ['429','17:05','4 x 400 Meter','L 18','Saringan (Heat 1-3)',4,8,'Trek Utama'],

  // HARI 5 — SESI 9 (Khamis 2 Julai 2026 Pagi)
  ['501','08:00','5000 Meter Jalan Kaki','P 18','Akhir',5,9,'Trek Utama'],
  ['502','08:00','Lompat Jauh','L 10','Akhir',5,9,'Padang A'],
  ['503','08:00','Lontar Peluru','P 18','Akhir',5,9,'Padang B'],
  ['504','08:00','Lompat Jauh','L 18','Akhir',5,9,'Padang A'],
  ['505','08:00','Lontar Peluru','P 11','Akhir',5,9,'Padang B'],
  ['506','09:00','200 Meter','P 12','Akhir',5,9,'Trek Utama'],
  ['507','09:05','200 Meter','L 12','Akhir',5,9,'Trek Utama'],
  ['508','09:10','200 Meter','P 15','Akhir',5,9,'Trek Utama'],
  ['509','09:15','200 Meter','L 15','Akhir',5,9,'Trek Utama'],
  ['510','09:20','200 Meter','P 18','Akhir',5,9,'Trek Utama'],
  ['511','09:25','200 Meter','L 18','Akhir',5,9,'Trek Utama'],
  ['512','09:45','4 x 200 Meter','P 12','Akhir',5,9,'Trek Utama'],
  ['513','09:50','4 x 200 Meter','L 12','Akhir',5,9,'Trek Utama'],
  ['514','09:55','4 x 400 Meter','P 15','Akhir',5,9,'Trek Utama'],
  ['515','10:00','4 x 400 Meter','L 15','Akhir',5,9,'Trek Utama'],
  ['516','10:05','4 x 400 Meter','P 18','Akhir',5,9,'Trek Utama'],
  ['517','10:10','4 x 400 Meter','L 18','Akhir',5,9,'Trek Utama'],
]

// ─── Seed ─────────────────────────────────────────────────────────────────────

export async function seedJadualAcara2026(kejohananId, onLog = console.log) {
  if (!kejohananId) { onLog('❌ kejohananId diperlukan'); return { berjaya:0, skip:0, gagal:0 } }

  let berjaya = 0, skip = 0, gagal = 0
  onLog(`🚀 Seed ${JADUAL_2026.length} acara → ${kejohananId}`)

  for (const row of JADUAL_2026) {
    const [noAcara, masa, namaAcara, kelas, peringkat, hari, sesi, lokasi] = row
    try {
      const acaraRef = doc(db, 'kejohanan', kejohananId, 'acara', String(noAcara))
      if ((await getDoc(acaraRef)).exists()) { onLog(`⏭ Skip ${noAcara}`); skip++; continue }

      const jenisAcara   = detectJenis(namaAcara)
      const adaHeat      = detectAdaHeat(peringkat)
      const bilanganHeat = adaHeat ? detectBilanganHeat(peringkat) : 0
      const jantina      = kelas.trim().startsWith('P') ? 'P' : kelas.trim().startsWith('L') ? 'L' : 'Campuran'
      const kategoriUmur = kelas.trim().replace(/^[LP]\s*/, '').trim()
      const tarikhAcara  = tarikh2026(hari)
      const isPadang     = ['padang_lompat','padang_balin'].includes(jenisAcara)
      const isLorong     = ['lorong','relay'].includes(jenisAcara)

      await setDoc(acaraRef, {
        noAcara: String(noAcara), aceraId: String(noAcara),
        namaAcara: `${namaAcara} ${kelas}`.trim(), namaAcaraPendek: namaAcara,
        kelas, jantina, kategoriUmur,
        kategoriKod:  detectKategoriKod(kelas),
        jenisAcara, hari, sesi, tarikhAcara, masa, lokasi,
        peringkat, adaHeat, bilanganHeat,
        isWindReading:     detectWindReading(namaAcara),
        bilanganCubaan:    isPadang ? 4 : 0,
        unitUkuran:        isPadang ? 'm' : 's',
        bilanganLorong:    isLorong ? 8 : null,
        bilanganFinalis:   8,
        caraPilihFinal:    adaHeat ? 'hybrid' : 'terus',
        wildcardSlot:      2,
        hadAtletPerSekolah:jenisAcara === 'relay' ? 1 : 2,
        statusAcara:       'akan_datang',
        isSeedData:        true,
        createdAt:         Timestamp.now(),
      })

      const jadualDocId = `${kejohananId}-${noAcara}`
      await setDoc(doc(db, 'jadual_acara', jadualDocId), {
        jadualId: jadualDocId,
        aceraId: String(noAcara), acaraId: String(noAcara), kejohananId,
        tarikhAcara, masaMula: masa, lokasi, hari, sesi,
        statusJadual: 'aktif',
        namaAcara: `${namaAcara} ${kelas}`.trim(),
        isSeedData: true, createdAt: Timestamp.now(),
      }, { merge: true })

      onLog(`✅ ${noAcara} — ${namaAcara} ${kelas}`)
      berjaya++
    } catch (e) { onLog(`❌ ${noAcara}: ${e.message}`); gagal++ }
  }

  onLog(`\n📊 Selesai: ✅ ${berjaya} · ⏭ ${skip} · ❌ ${gagal}`)
  return { berjaya, skip, gagal }
}

// ─── Padam Seed (isSeedData=true) sahaja ─────────────────────────────────────

export async function deleteJadualSeed(kejohananId, onLog = console.log) {
  if (!kejohananId) return
  const [s1, s2] = await Promise.all([
    getDocs(query(collection(db, 'kejohanan', kejohananId, 'acara'), where('isSeedData','==',true))),
    getDocs(query(collection(db, 'jadual_acara'), where('isSeedData','==',true))),
  ])
  for (const d of s1.docs) await deleteDoc(d.ref)
  for (const d of s2.docs) await deleteDoc(d.ref)
  onLog(`🗑️ Padam ${s1.size} acara + ${s2.size} jadual_acara`)
  return { acara: s1.size, jadual: s2.size }
}

// ─── Padam SEMUA Acara kejohanan (termasuk bukan seed) ───────────────────────

export async function deleteAllAcara(kejohananId, onLog = console.log) {
  if (!kejohananId) return
  onLog(`⚠️ Padam SEMUA acara + jadual untuk kejohanan: ${kejohananId}`)
  const BATCH = 400

  // Padam acara subcollection
  const acaraSnap = await getDocs(collection(db, 'kejohanan', kejohananId, 'acara'))
  let b = writeBatch(db), n = 0
  for (const d of acaraSnap.docs) {
    b.delete(d.ref); n++
    if (n % BATCH === 0) { await b.commit(); b = writeBatch(db) }
  }
  if (n % BATCH !== 0) await b.commit()

  // Padam jadual_acara untuk kejohanan ini
  const jSnap = await getDocs(query(collection(db, 'jadual_acara'), where('kejohananId','==',kejohananId)))
  let jb = writeBatch(db), jn = 0
  for (const d of jSnap.docs) {
    jb.delete(d.ref); jn++
    if (jn % BATCH === 0) { await jb.commit(); jb = writeBatch(db) }
  }
  if (jn % BATCH !== 0) await jb.commit()

  // Padam jadual_acara dari kejohanan lain yang ada isSeedData (bersihkan salah seed lama)
  const oldSnap = await getDocs(query(collection(db, 'jadual_acara'), where('isSeedData','==',true)))
  let ob = writeBatch(db), on = 0
  for (const d of oldSnap.docs) {
    if (d.data().kejohananId !== kejohananId) { ob.delete(d.ref); on++ }
  }
  if (on > 0) await ob.commit()

  onLog(`🗑️ Padam ${n} acara + ${jn + on} jadual_acara (termasuk ${on} dari seed lama)`)
  return { acara: n, jadual: jn + on }
}
