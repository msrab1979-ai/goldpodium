---
name: project_suku_separuh_akhir
description: "Upgrade KOAM — tambah peringkat Suku Akhir & Separuh Akhir, WA TR20 serpentine seed, kajian mendalam sifir sedia ada"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1e75eee1-2133-4651-803c-b283bd6c0e7e
---

## Status: KAJIAN — belum bina (25 Jun 2026)

### Keperluan
Sistem sekarang hanya ada `saringan → akhir`. User nak tambah:
- `suku_akhir` → `separuh_akhir` → `akhir`
- `separuh_akhir` → `akhir` (sudah berfungsi, tiada ubah)
- `terus_akhir` (sudah ada)

Kejohanan 2026 dah selesai — data lama selamat, tiada input baru.

---

### Sifir Sedia Ada (JANGAN ROSAK)

**1. Lorong WA — `wa_config/{kejohananId}`**
- `lorongKumpulan` → `assignLorongFinal()` — untuk heat final/separuh akhir
- `lorongHeatRemove` → `assignLorongHeat()` — untuk heat saringan/suku akhir
- ✅ Tidak perlu ubah — guna semula

**2. Heat Rules — `tentukanFasa()` dalam StartList.jsx line 68**
```js
bilanganPeserta <= bilanganLorong       → 'terus_final'
bilanganPeserta <= bilanganLorong * 3   → 'heat_final'
else                                    → 'saringan_heat_final'
```
- ✅ Tidak perlu ubah — admin jana manual untuk suku/separuh akhir

**3. Tetapan Final — `tetapan/finalSetup` (Firestore)**
```
larian: { L12: { bestHeat: 2, bestTime: 2 }, ... }
relay: { ... }
padang: { ... }
overrideByAcara: { '113': { bestHeat: 3, bestTime: 1 } }
```
- Sekarang guna 1 kali: saringan → akhir
- Perlu berfungsi 2 kali: suku→separuh DAN separuh→akhir
- ⚠️ Cadang extend dengan block `sukuKeSeparuh: { larian: {...}, overrideByAcara: {...} }`
- `getFinalistSetup(acara, finalSetup, fasa='toFinal')` — tambah param `fasa`, default kekal

**4. `selectFinalists()` dalam finalistUtils.js**
- Filter: `h.peringkat !== 'final'` — separuh akhir heats lulus ✅
- Q+q logic — sama untuk semua peringkat ✅

---

### Masalah Yang Perlu Dibina

**M1 — `isSaringanAcara` check (InputKeputusan.jsx line 1699-1701)**
```js
// Sekarang — GAGAL untuk suku_akhir:
return p.includes('saringan') || n.includes('saringan')

// Perlu jadi:
return ['saringan','suku_akhir','separuh_akhir'].includes(p)
```
Ada di 2 tempat: line 1699 dan line 1930

**M2 — `heatPhaseHeats` filter (StartList.jsx line 1052)**
```js
// Sekarang:
heatList.filter(h => h.fasa === 'heat' || h.fasa === 'saringan')
// Heat suku akhir MESTI disimpan dengan fasa:'heat' — bukan fasa:'suku_akhir'
```

**M3 — Serpentine seed untuk Separuh Akhir**
- Qualify Q+q dari suku akhir → dapat senarai finalis
- Bahagi ke 2 heat SA ikut WA TR20 serpentine:
  - Rank 1→SA1, 2→SA2, 3→SA2, 4→SA1, 5→SA1, 6→SA2...
  - Lorong dalam setiap SA: Q=lane 3,4,5,6 (random), q=lane 1,2,7,8
- Fungsi baru `serpentineSeed(finalists, bilHeat)` dalam finalistUtils.js
- **Kefahaman serpentine: 70%** — perlu baca WA TR20 lebih teliti

**M4 — `buatHeatId` kod clash (StartList.jsx line 161)**
```js
// Sekarang: suku akhir dan separuh akhir sama-sama dapat kod 'H'
fasa === 'final' ? 'F' : fasa === 'saringan' ? 'S' : 'H'

// Perlu:
fasa === 'final'          ? 'F'
: fasa === 'suku_akhir'   ? 'QF'
: fasa === 'separuh_akhir'? 'SF'
: fasa === 'saringan'     ? 'S' : 'H'
```

**M5 — Label baru (kecil)**
- `startListPdfUtils.js` fasaStr: tambah 'SUKU AKHIR' / 'SEPARUH AKHIR'
- `FasaBadge` colors dalam StartList.jsx
- `CetakKeputusan.jsx` label
- `BukuKejohanan.jsx` label

---

### Cadangan Fasa Bina

**Fasa 1 (selamat, cepat):**
- AcaraSetup: tambah dropdown suku_akhir/separuh_akhir
- isSaringanAcara fix (M1)
- buatHeatId fix (M4)
- Label baru semua fail (M5)
- Guna tetapan/finalSetup yang sama (tanpa serpentine)

**Fasa 2 (WA strict):**
- serpentineSeed() (M3)
- sukuKeSeparuh block dalam tetapan/finalSetup

---

### Soalan Belum Jawab
1. Serpentine — WA strict atau assign lorong biasa macam final sekarang?
2. Berapa heat Separuh Akhir — admin set manual atau auto-kira?
3. sukuKeSeparuh tetapan — siapa set, ada UI atau auto-kira?

**Why:** User nak upgrade sistem selepas kejohanan 2026 selesai. Sistem 100% stabil sekarang.
**How to apply:** Bina Fasa 1 dulu, confirm berfungsi, baru Fasa 2 serpentine WA.
