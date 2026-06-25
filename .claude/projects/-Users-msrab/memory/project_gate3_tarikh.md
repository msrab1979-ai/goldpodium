---
name: project-gate3-tarikh
description: Kerja separuh jalan — tukar Gate 3 kelayakan umur dari by-tahun ke by-tarikh (standard MSSM 2 Jan cut-off)
metadata: 
  node_type: memory
  type: project
  originSessionId: 1e75eee1-2133-4651-803c-b283bd6c0e7e
---

## Kerja Pending: Gate 3 Umur — Tukar dari Tahun ke Tarikh

**Status**: ✅ SIAP — dibina 25 Jun 2026. Cut-off = 2 Januari (MSSM standard).

### Masalah
Gate 3 kelayakan umur semasa hanya semak **tahun lahir** sahaja (bukan tarikh penuh).
- Standard MSSM: cut-off = **2 Januari** setiap tahun
- Atlet lahir 1 Jan 2014 → sistem semasa LULUS (tahun 2014 dalam julat)
- Atlet lahir 1 Jan 2014 → sepatutnya GAGAL (belum capai cut-off 2 Jan)

### 3 Fail Yang Perlu Diubah
1. `src/utils/validasiPendaftaran.js` baris 190–221 — fungsi `gate3_kelayakanUmur()` — **KRITIKAL**
2. `src/pages/admin/KategoriSetup.jsx` baris 49–55 — fungsi `tahunLahirLabel()` — display
3. `src/pages/admin/ManualPendaftaran.jsx` baris 427–430 — label display untuk pengurus

### Data Firestore: ZERO sentuhan
- `umurHad` dan `umurMin` kekal integer (umur dalam tahun) — tiada schema change
- Pendaftaran sedia ada tidak re-validate — hanya pendaftaran BARU kena gate baru

### Risiko
- Atlet lahir tepat 1 Januari sesuatu tahun — sebelum ini LULUS, selepas tukar GAGAL
- Ini intended behaviour (MSSM standard) tapi user belum confirm cut-off: 1 Jan atau 2 Jan?

### Soalan Belum Dijawab
- Cut-off: **2 Januari** (standard MSSM) atau **1 Januari** (inclusive)?
- User belum bagi jawapan — tanya bila sambung semula

**Why:** User mahu sistem ikut standard MSSM tarikh betul, bukan sekadar tahun.
**How to apply:** Bila user kata sambung/bina, tanya dulu cut-off date sebelum kod.
