---
name: project_suku_separuh_akhir
description: "Upgrade KOAM — tambah peringkat Suku Akhir & Separuh Akhir, WA TR20 serpentine seed, kajian mendalam sifir sedia ada"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1e75eee1-2133-4651-803c-b283bd6c0e7e
---

## Status: SIAP PENUH + SERPENTINE (26 Jun 2026) — commit `c0cb528`

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

**Ghost Run Sweep — commits `229a654` → `b1fd39f` (8 bug ditemui + fixed):**

- InputKeputusan: `janaFinalEligible` exclude suku/separuh akhir → `selesaiTanpaJana` kotak teal
- InputKeputusan: 4 lokasi `_selectFinalists` pass `fasa='sukuKeSeparuh'` untuk suku_akhir
- StartList: `cetakAcaraDariHari` fasaStr tambah suku_akhir/separuh_akhir
- Home.jsx: `isSaringanAcara` tambah suku_akhir/separuh_akhir
- StartList: `finalExists` untuk suku_akhir guna `finalDijanaKe` (SF fasa='heat', bukan 'final')
- StartList: `allHeatRasmi` terima `'diterima'` selain `'rasmi'`
- StartList: `JanaFinalModal` label modal/butang — "Jana SF"/"Separuh Akhir" bila suku_akhir
- PendaftaranSetup: badge + dropdown label untuk suku_akhir (teal) dan separuh_akhir (indigo)

**Ghost Run Separuh Akhir — commits `3e3d13e` + `85df169` (2 bug ditemui + fixed):**
- Bug #9: `sarAllRasmi` (canJanaFinalFromFinal gate) tidak terima `'diterima'` — Jana Final tidak muncul
- Bug #10: `finalExists` untuk separuh_akhir tidak guna `finalDijanaKe` — butang Jana Final muncul semula selepas jana
- Extend `finalExists` logic: `(isSukuAkhirAcara || isSeparuhAkhirAcara) ? !!finalDijanaKe : heatList.some(h => h.fasa==='final')`

**Fasa 2 Serpentine — commit `c0cb528` (SIAP):**
- `finalistUtils.js`: fungsi baru `serpentineSeed(finalis, bilHeat)` — zig-zag ikut blok
  - blok genap: kiri→kanan (H1,H2,...), blok ganjil: kanan→kiri (...,H2,H1)
  - 8 finalis, 2 heat: H1=[rank1,4,5,8], H2=[rank2,3,6,7] ✓ seimbang
- `StartList.jsx JanaFinalModal`:
  - Tambah state `bilHeatSF` (default 2), load dari `wa_config.bilHeatSukuAkhir`
  - `handleSimpan` bahagi kepada 2 laluan: serpentine (sukuKeSeparuh) vs satu heat (lain)
  - Serpentine: sort→seed→assign lorong WA per heat→batch write N heat docs
  - Helper `buatEntryPeserta()` — elak duplikasi kod peserta entry
- `AcaraSetup.jsx WaConfigPanel`:
  - Field baru `bilHeatSukuAkhir` (integer, default 2) dalam tab Lorong Final
  - Kotak teal "Suku Akhir → Separuh Akhir" — admin set bilangan heat SF
  - `WA_CONFIG_DEFAULT` tambah `bilHeatSukuAkhir: 2`

**Ghost Run Serpentine — BERSIH:**
- `fasaJana='sukuKeSeparuh'` → masuk laluan serpentine ✓
- `bilHeatSF` baca dari `wa_config` ✓
- Sort finalis by masa → serpentine → lorong WA per heat ✓
- Simpan N heat `fasa:'heat'` dalam acara separuh_akhir (targetKey) ✓
- `finalDijanaKe` ditulis → butang Jana SF hilang ✓
- Auto-register finalis ke pendaftaran acara SF ✓

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

### Rekod Trigger — Confirmed Betul
- `postRasmiUtils` rekod detection tidak bergantung pada `grantMedal`
- Rank 1 dalam heat suku_akhir → rekod tuntutan ditulis jika lebih pantas
- Badge RBK muncul dalam Home → admin sahkan dalam tab Tuntutan
- `grantMedal=false` untuk suku/separuh akhir — medal dan mata olahragawan TIDAK ditulis

---

**Why:** User nak upgrade sistem untuk event akan datang. Data KOAM 2026 zero sentuh.
**How to apply:** Flow lengkap dah boleh guna termasuk serpentine. Tiada KIV berbaki.
