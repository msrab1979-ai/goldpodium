---
name: project_suku_separuh_akhir
description: "Upgrade KOAM — tambah peringkat Suku Akhir & Separuh Akhir, WA TR20 serpentine seed, kajian mendalam sifir sedia ada"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1e75eee1-2133-4651-803c-b283bd6c0e7e
---

## Status: FASA 1 + TETAPAN FINAL SIAP (26 Jun 2026)

### Yang Dah Dibina

**Fasa 1 — commit `1e1ff99`:**
- AcaraSetup: dropdown + modal tambah `suku_akhir` / `separuh_akhir`, `adaHeat=true`, badge teal/indigo, filter bar
- InputKeputusan: `isSaringanAcara` (3 tempat) + `janaFinalEligible` — tambah suku_akhir/separuh_akhir → `grantMedal=false`
- StartList: `FASA_LABEL`, `FasaBadge`, `buatHeatId` (QF/SF), `fasaStr` dalam 4 PDF fungsi
- startListPdfUtils: fasaStr "SUKU AKHIR 1/3" / "SEPARUH AKHIR 1/2"
- BukuKejohanan: heatLabel dalam PDF keputusan

**Tetapan Final + Fix B3/B4 — commit `9109bf0`:**
- KategoriSetup: kolum baru `BH→SF` + `BT→SF` (teal) — hanya untuk acara `suku_akhir`
  - State `sukuOv` berasingan dari `overrides`
  - Simpan ke `sukuKeSeparuhByAcara` dalam `tetapan/finalSetup`
  - `setDoc merge:true` — fix risiko overwrite field lain
- finalistUtils: `getFinalistSetup(acara, finalSetup, fasa='toFinal')`
  - `fasa='sukuKeSeparuh'` → baca `sukuKeSeparuhByAcara`
  - `fasa='toFinal'` (default) → baca `overrideByAcara` (backward compat)
  - `selectFinalists` juga terima param `fasa`
- StartList JanaFinalModal:
  - `fasaJana = acara.peringkat === 'suku_akhir' ? 'sukuKeSeparuh' : 'toFinal'`
  - Jana heat suku→SF dengan `fasa:'heat'` (bukan `fasa:'final'`) — Fix B3
  - Baca sifir BH+BT yang betul ikut fasa — Fix B4

---

### Flow Lengkap (Sekarang Boleh Guna)

```
saringan → akhir              ← data lama KOAM 2026, kekal
separuh_akhir → akhir         ← gantikan saringan untuk event baru (professional)
suku_akhir → separuh_akhir → akhir  ← flow baru lengkap
terus_akhir                   ← padang / peserta sikit
```

Admin set dalam AcaraSetup dropdown. `saringan` label kekal untuk data lama — `separuh_akhir` untuk event baru.

---

### Sifir Firestore

```
tetapan/finalSetup:
  overrideByAcara: { '113': { bestHeat:3, bestTime:1 } }       ← saringan/SF→akhir
  sukuKeSeparuhByAcara: { '113': { bestHeat:4, bestTime:0 } }  ← suku→SF (BARU)
```

---

### KIV — Fasa 2 Serpentine WA TR20

- `serpentineSeed(finalists, bilHeat)` dalam finalistUtils.js
- Rank 1→SA1, 2→SA2, 3→SA2, 4→SA1 (zig-zag)
- Lorong Q=tengah (3,4,5,6), q=tepi (1,2,7,8)
- Belum bina — tunggu event guna suku akhir dulu

### KIV — Soalan Belum Jawab
1. Serpentine — WA strict atau assign lorong biasa?
2. Berapa heat SF — admin set manual atau auto-kira?

**Why:** User nak upgrade sistem untuk event akan datang. Data KOAM 2026 zero sentuh.
**How to apply:** Flow lengkap dah boleh guna. Serpentine KIV Fasa 2.
