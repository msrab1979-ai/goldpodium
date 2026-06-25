---
name: KOAM Roadmap — Keutamaan Fix & Feature
description: Senarai kerja mengikut keutamaan selepas audit April 2026 — dari kritikal ke enhancement
type: project
originSessionId: 9574af08-ab42-4fb5-80cc-e8e7b0ebda5f
---
## FASA 1 — KRITIKAL (Sistem Tidak Berfungsi Tanpa Ini)

### 1A. Betulkan kategoriKod dalam AcaraSetup
**Fail:** `AcaraSetup.jsx`
- Buang `detectKatKod` — ganti dengan dropdown `kategoriKod` terus dari `kategoriList` Firestore
- Tukar `kategoriUmur` → pilih `kategoriKod` (A/B/C/D/E/PPKI) dengan hint umur dari `kategori.umurHad`
- Reseed/migrate acara lama yang ada `kategoriKod:'SR'/'SM'`

### 1B. Buat Mappings Dinamik
**Fail:** `PendaftaranSetup.jsx`, `seedAtlet.js`
- `KAT_BY_JENIS` → derive dari `kategori` collection: `groupBy(jenisSekolah)`
- `KATS_BY_TYPE` dalam SeedAtletModal → sama
- `kiraKategori` → baca `umurMin/umurHad` dari `kategoriList` Firestore
- `tahunLahirByKat` → guna `kategori.umurHad/umurMin`
- `KAT_UMUR_LABEL/FULL` → baca dari `kategori.nama` atau compute dari `umurHad`

**Kesan:** Jika admin tambah kategori baru dalam KategoriSetup → terus berfungsi tanpa ubah kod.

---

## FASA 2 — PENTING (Keputusan & Ranking)

### 2A. Olahragawan per Kategori
**Fail:** `Olahragawan.jsx`, `KeputusanRasmi.jsx`
- Sekarang: semua kat dicampur dalam satu ranking
- Fix: ranking berasingan per kategoriKod (Kat A L, Kat A P, Kat B L, ... dsb)
- `mata_olahragawan` perlu ada field `kategoriKod`
- `KeputusanRasmi` perlu tulis `kategoriKod` dalam `mata_olahragawan` doc

### 2B. Rekod — Badge & Stripe Display
**Fail:** `KeputusanRasmi.jsx`, `Olahragawan.jsx`, `Home.jsx`
- Tambah badge "R" / stripe emas dalam baris atlet di KeputusanRasmi bila `isBetter = true`
- Dalam Olahragawan: badge "Rekod Daerah/Negeri" pada baris atlet yang ada rekod sahih
- `mata_olahragawan` tambah field `rekodPecah: [{peringkat, namaAcara, prestasi}]`
- Home.jsx: banner/notifikasi bila rekod baru disahkan

---

## FASA 3 — ENHANCEMENT (Lengkapkan Sistem)

### 3A. Analisa Pendaftaran (dari TODO lama)
- Table acara × sekolah dengan kiraan slot (view + PDF)
- Borang pendaftaran peserta per sekolah (PDF dengan tandatangan)
- Laporan status pendaftaran semua sekolah (PDF)

### 3B. Fix noBib Race Condition
- Guna Firestore transaction untuk assign noBib
- Elak clash jika 2 pengurus daftar serentak

### 3C. Home.jsx KeputusanExpanded
- Pastikan final heat view betul
- Link ke keputusan rasmi

---

## Urutan Kerja Disyorkan

```
1A → 1B → test seed → 2A → 2B → 3A → 3B → 3C
```

Jangan teruskan ke Fasa 2 sebelum Fasa 1 selesai — medal tally dan olahragawan bergantung pada pendaftaran betul.

**Why:** Setiap modul downstream (medal, olahragawan, rekod) bergantung pada pendaftaran yang betul dan kategoriKod yang konsisten.
**How to apply:** Mulakan dengan 1A bila user minta fix. Tanya: "Adakah kategori sudah di-seed dalam KategoriSetup?" sebelum fix AcaraSetup.
