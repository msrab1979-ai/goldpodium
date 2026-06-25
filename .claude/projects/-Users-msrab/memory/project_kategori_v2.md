---
name: KOAM Kategori jenisSekolah — V2.0 Plan
description: jenisSekolah dalam kategori perlu dijadikan dinamik dalam v2.0 — 4 fail perlu diubah serentak
type: project
originSessionId: a1662eb6-df4e-4c16-a1e7-60a71f2a1485
---
Perubahan ini ditangguhkan ke **Versi 2.0**. Jangan buat sekarang melainkan user kata "baiki kategori" atau "v2.0 kategori".

## Masalah semasa
`jenisSekolah` dalam KategoriSetup hardcode kepada SR/SM/PPKI. Admin tidak boleh tambah jenis baru (cth: SMKA, Teknik, Kolej).

## 4 fail yang MESTI diubah serentak (bukan 1 sahaja)

| Fail | Apa yang hardcode | Perubahan diperlukan |
|------|-------------------|----------------------|
| `KategoriSetup.jsx` | `JENIS_DEFAULTS`, butang pilih jenis | Baca unik jenisSekolah dari Firestore, admin boleh taip bebas |
| `SekolahSetup.jsx` | `KATEGORI_LIST = ['SR','SM','PPKI']` | Dropdown baca dari kategori collection |
| `Home.jsx` | `PREFERRED_ORDER`, `JENIS_LABEL`, warna tab medal tally | Baca dinamik, fallback warna untuk jenis baru |
| `BukuKejohanan.jsx` | `KAT_ORDER`, `KAT_LABEL` | Baca dinamik dari Firestore |

**Why:** Data Firestore sudah dinamik (jenisSekolah = string biasa). Yang statik hanya UI display. Jika ubah KategoriSetup sahaja, sekolah tidak boleh pilih jenis baru, dan medal tally awam akan salah susun.

## Bahagian yang SELAMAT (tidak perlu ubah)
- Keputusan, Heat, Start List — tidak bergantung pada jenisSekolah
- Pendaftaran atlet — bergantung pada `kategoriKod` (A/B/C/D/E), bukan jenisSekolah
- `ManualPendaftaran.jsx` line `kat.id === 'PPKI'` — perlu semak jika ada jenis PPKI baru

## How to apply
Apabila user sebut "baiki kategori" atau "v2.0 kategori", ubah keempat-empat fail ini serentak dalam satu sesi.
