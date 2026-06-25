---
name: KOAM Acara+Jadual V2 Architecture
description: Keputusan reka bentuk semula sistem acara, jadual, saringan→final, dan tetapan kelayakan final
type: project
originSessionId: a1662eb6-df4e-4c16-a1e7-60a71f2a1485
---
# Acara + Jadual V2 — Keputusan Reka Bentuk

## 1. Merged Page: Setup Acara + Jadual = 1 Halaman
- Buang halaman berasingan JadualSetup
- Satu halaman `/dashboard/acara` handle semua: buat acara + jadual serentak
- List view: acara dikumpul by hari (sama seperti JadualSetup sekarang)
- Modal tambah/edit: semua field dalam 1 form (nama, kategori, peringkat, jenis, tarikh, masa, lokasi)
- Save → tulis serentak ke `kejohanan/{id}/acara/{noAcara}` DAN `jadual_acara/{kejId}-{noAcara}`

## 2. Saringan → Final: Linked Acara via parentAcaraId
- BUANG `peringkat: 'saringan_akhir'` — ganti dengan 2 acara berasingan
- Acara 101: `peringkat: 'saringan'`, `parentAcaraId: null`
- Acara 201: `peringkat: 'akhir'`, `parentAcaraId: '101'`
- No Acara encode hari: 101-199=Hari1, 201-299=Hari2 (natural)
- Admin start fresh — padam semua acara & jadual lama

## 3. Tetapan Final — Table Setup by Kategori
Disimpan dalam `tetapan/finalSetup`

### Larian & Relay: bestHeat + bestTime
```js
{
  larian: {
    L12:  { bestHeat: 4, bestTime: 4 },  // total=8
    L10:  { bestHeat: 2, bestTime: 4 },  // total=6
    PPKI: { bestHeat: 0, bestTime: 6 },  // total=6, pure best time
  },
  relay: {
    L12:  { bestHeat: 2, bestTime: 2 },  // total=4
    L15:  { bestHeat: 3, bestTime: 3 },  // total=6
  },
  padang: {
    L12:  { total: 8, cubaanAwal: 3, cubaanAkhir: 3 },
    PPKI: { total: 6, cubaanAwal: 3, cubaanAkhir: 3 },
  }
}
```

### Field Names (jelas untuk admin):
- **Best Heat** = tempat untuk pemenang heat terpantas
- **Best Time** = tempat dari masa terbaik keseluruhan
- **Total** = Best Heat + Best Time (auto-kira, admin tak isi)

### Padang berbeza — tiada heat:
- **Total Final** = berapa masuk peringkat akhir
- **Cubaan Awal** = bilangan cubaan semua peserta
- **Cubaan Akhir** = bilangan cubaan top N sahaja

## 4. UI Tetapan Final
- Dalam KategoriSetup → Tab baru "Tetapan Final"
- Sub-tab: [Larian] [Relay] [Padang]
- Kategori diload dynamic dari Firestore (bukan hardcode)

## 5. StartList Flow (selepas V2)
### Saringan (acara tiada parentAcaraId):
- Load dari pendaftaran → bahagi ke heat → PDF

### Final (acara ada parentAcaraId):
- Load keputusan dari acara parent (saringan)
- Baca tetapan dari `tetapan/finalSetup` by kategori + jenis
- pilihFinalis(): ambil bestHeat juara heat + bestTime masa terbaik
- Auto-assign lorong WA standard (rank 1→lorong 4, dll)
- Jana PDF final

**Why:** Admin start fresh, reka bentuk bersih, tiada ambiguiti saringan_akhir
**How to apply:** Semua bina baru — jangan extend kod lama yang ada saringan_akhir
