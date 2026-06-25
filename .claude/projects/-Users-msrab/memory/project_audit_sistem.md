---
name: Audit Sistem KOAM — Dapatan & Keutamaan Fix
description: Hasil audit menyeluruh sistem: pendaftaran, kategori, acara, pencatat, medal tally, olahragawan, rekod — dengan keutamaan fix
type: project
originSessionId: 9574af08-ab42-4fb5-80cc-e8e7b0ebda5f
---
## Dapatan Audit (April 2026)

### 1. Punca Masalah Utama — detectKatKod (KRITIKAL)
`AcaraSetup.jsx` fungsi `detectKatKod(umur)` mengembalikan `'SR'/'SM'` tapi seluruh sistem guna format MSSM `'A'/'B'/'C'/'D'/'E'/'PPKI'`. Ini menyebabkan:
- Acara manual ada `kategoriKod:'SR'` dalam Firestore
- `seedPendaftaran` tidak boleh match atlet → "tiada acara sesuai"
- Tab 2 `katDibenar` filter menyembunyikan acara tersebut
- Gate 5 baca `kategori/SR` → doc tidak wujud → validation fail

### 2. Hardcode Mappings Perlu Dinamik
- `KAT_BY_JENIS = {SR:['A','B'], SM:['C','D','E']}` dalam PendaftaranSetup.jsx (2 tempat)
- `KATS_BY_TYPE` dalam SeedAtletModal
- `kiraKategori` hardcode umur ranges (sepatutnya baca `kategori.umurMin/umurHad`)
- `tahunLahirByKat` hardcode birth years
- `KAT_UMUR_LABEL/FULL` hardcode display labels
- Semua ni sepatutnya derive dari `kategori` collection Firestore

### 3. Status Setiap Modul
| Modul | Status | Isu |
|-------|--------|-----|
| Pendaftaran (gates) | ✅ Betul | Gate 2,3,5,6 sudah dinamik dari Firestore |
| Pendaftaran (seed) | ❌ Rosak | detectKatKod → kategoriKod salah → skip semua |
| Pencatat | ✅ Sesuai | Flow betul, role-appropriate |
| Medal Tally | ✅ Sesuai | Bergantung pada pendaftaran betul dahulu |
| Olahragawan | ⚠️ Separuh | Semua kategori dicampur — sepatutnya per kat A/B/C/D/E |
| Rekod | ⚠️ Separuh | Backend tuntutan ada, tapi badge/stripe display tiada langsung |

### 4. Rekod — Gap Display
- `KeputusanRasmi` auto-detect & tulis tuntutan ✅
- `Rekod.jsx` pengurus teknik sahkan/tolak ✅
- Badge "REKOD BARU" dalam KeputusanRasmi ❌
- Stripe/badge dalam Olahragawan ❌
- Home.jsx banner bila rekod dipecah ❌
- `mata_olahragawan` tiada flag `isRekod` ❌

**Why:** Sistem direka untuk jangka panjang — jika kategori/acara berubah, semua hardcode akan pecah.
**How to apply:** Fix mengikut keutamaan di bawah. Jangan bina semula DB — strukturnya betul.
