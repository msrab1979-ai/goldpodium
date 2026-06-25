---
name: PBD Firebase Sistem
description: Sistem Rekod PBD — vanilla HTML/JS + Firebase, SK Sultan Ismail, penilaian berasaskan darjah (PBS), hipersispbd project
type: project
originSessionId: 39d95728-7227-465b-8ba7-8230c95f1244
---
# Sistem Rekod PBD — SK Sultan Ismail

**Folder:** `/Users/msrab/Desktop/PBD_firebase/`
**Firebase Project:** `hipersispbd`
**Tech:** Vanilla HTML/JS + Firebase Firestore compat SDK v9.22 (NO React/build step)
**Deploy:** `firebase deploy --only hosting` → static files di `public/`

---

## Pages & JS Files

| Page | JS File | Fungsi |
|------|---------|--------|
| `index.html` | (inline) | Menu utama, load config |
| `masuk-rekod.html` | `masuk-rekod.js` | Masuk rekod penilaian |
| `rekod-pbd.html` | `rekod-pbd.js` | Lihat/edit/PDF rekod |
| `analisa.html` | `analisa.js` | Analytics 5 tab |
| `daftar-topik.html` | `daftar-topik.js` | Urus topik & sub-topik |
| `pengurusan-murid.html` | `murid.js` | Urus murid |
| `admin.html` | `admin.js` | Admin: stats, CSV import, subjek, settings |

**Shared:** `firebase-config.js` — init Firebase, `firestoreRetry`, offline banner, helper functions (`showLoading`, `hideLoading`, `showToast`, `getTimestamp`, `formatDate`)

---

## Firestore Collections

### `murid` — doc ID = noKp (IC number)
Fields: `noKp`, `namaMurid`, `tahun` (SATU/DUA/TIGA/EMPAT/LIMA/ENAM), `kelas`, `jantina` (LELAKI/PEREMPUAN), `agama` (ISLAM/BUKAN_ISLAM, default ISLAM), `status` (AKTIF), `tahun_kelas` (composite: "SATU_A"), `searchName` (lowercase), `tarikhDaftar`, `updatedAt`

### `subjek` — subjects
Fields: `id_subjek`, `subjek` (display name), `aktif` (bool), `urutan` (sort order), `murid_terlibat` (SEMUA/ISLAM/BUKAN_ISLAM)

### `topik_pembelajaran` — topics & sub-topics (same collection)
Fields: `id_subjek`, `subjek`, `tahun`, `topik` (4-char short code), `topik_pembelajaran` (full name), `is_subtopik` (bool), `parent_topik_id` (null for topik, ID for sub-topik), `urutan`, `aktif`

### `rekod_pbd` — assessment records (main data)
Fields: `id_rekod` (R00001 format), `tahun`, `kelas` (full: "SATU A"), `subjek`, `id_subjek`, `topik` (code), `topik_pembelajaran_main`, `sub_topik`, `nama_guru`, `tarikh` (Timestamp), `tarikh_string` (YYYY-MM-DD), `murid[]` (array: {bil, noKp, namaMurid, tp 1-6, penguasaan, catatan}), `jumlah_murid`, `jumlah_menguasai`, `jumlah_belum_menguasai`, composite keys (`kelas_subjek`, `kelas_subjek_topik`, `kelas_subjek_topik_subtopik`), `tahun_rekod` (calendar year "2026")

### `config/system_settings`
Fields: `tahunSemasa`, `lastRekodId` (auto-increment counter), `adminPassword` (plain text!), `headerTitle`, `namaSekolah`, `logoBase64`

---

## Business Logic

- **Primary key murid:** `noKp` (IC) = Firestore doc ID
- **Tahap Penguasaan (TP):** 1-6 (kurikulum Malaysia PBD)
- **Penguasaan:** Binary "Menguasai" / "Belum Menguasai"
- **tahun:** Darjah dalam Malay word (SATU..ENAM)
- **tahun_rekod:** Calendar year ("2026") — year rekod dibuat
- **Duplicate check:** `kelas_subjek_topik_subtopik` + `tarikh_string` — requires composite Firestore index
- **murid data** adalah denormalized DALAM rekod_pbd.murid[] — tidak reference semula ke collection murid
- **agama** menentukan murid ikut subjek tertentu (Pendidikan Islam = ISLAM sahaja, Pendidikan Moral = BUKAN_ISLAM sahaja)

---

## Analisa Tabs (analisa.html)
1. **Individu** — seorang murid, group by topik, purata TP, graf line, cadangan guru
2. **Prestasi Kelas** — satu kelas, group by topik, bar chart TP distribution
3. **Intervensi** — murid perlu intervensi (TP ≤ kriteria), high/medium priority
4. **Perbandingan Kelas** — semua kelas dalam satu tahun darjah, ranking, heat map
5. **Trend Subjek** — semua kelas + topik, heat map besar, purata keseluruhan

PDF export semua tab guna `jsPDF + autoTable`.
rekod-pbd.html guna `html2pdf.js`.

---

## Admin Features
- CSV import murid (columns: noKp, nama, tahun, kelas, jantina — **agama tidak diimport, default ISLAM**)
- Manage subjek (tambah/edit/padam, tetapkan murid_terlibat)
- System settings (namaSekolah, tahunSemasa, adminPassword, headerTitle, logo upload base64)
- Reset rekod (by tahun_rekod)
- Stats dashboard

---

## Bug Log / Issues

**B1 — KRITIKAL — Firestore Rules SALAH:**
`firestore.rules` hanya protect collections lama (`students`, `teachers`, `surat_*`) bukan collections sebenar (`murid`, `subjek`, `topik_pembelajaran`, `rekod_pbd`, `config`). Data TIDAK dilindungi Firestore Security Rules. Semua orang boleh baca/tulis.

**B2 — KRITIKAL — Race Condition lastRekodId:**
`performSave()` dalam masuk-rekod.js buat: get config → lastRekodId++ → add rekod → update config. BUKAN dalam Firestore transaction. Dua guru save serentak → sama rekodId.

**B3 — SEDERHANA — adminPassword plain text:**
Disimpan dalam Firestore `config/system_settings.adminPassword` tanpa hash. Sesiapa ada Firestore access boleh baca.

**B4 — SEDERHANA — Admin login bypass:**
`localStorage.setItem('adminRemembered', 'true')` dalam console browser bypass login sepenuhnya. Bukan auth sebenar.

**B5 — KECIL — CSV import tiada column agama:**
Murid diimport semua default ISLAM. Murid bukan Islam perlu diedit manual satu-persatu selepas import.

**B6 — KECIL — rekod-pbd.js redefines global helpers:**
`showLoading`, `hideLoading`, `showToast`, `openModal`, `closeModal`, `getTimestamp` defined SEMULA dalam rekod-pbd.js. `openModal` guna `style.display='flex'` tapi `closeModal` guna `style.display='none'` manakala pages lain guna `classList.add/remove('active')`. Mixed modal system.

**B7 — KECIL — pdfHeader hardcode nama sekolah:**
`analisa.js pdfHeader()` hardcode 'SK SULTAN ISMAIL'. Bila nama sekolah ditukar dalam admin settings, PDF masih tunjuk nama lama.

**B8 — PERFORMANCE — Analisa baca semua rekod:**
Tab individu fetch ALL rekod untuk kelas+subjek untuk cari seorang murid. Tab perbandingan fetch ALL rekod semua kelas. Bila data besar (>1000 rekod), slow.

**B9 — KECIL — `tahun` vs `tahun_rekod` confusion risk:**
`tahun` = darjah (SATU-ENAM), `tahun_rekod` = calendar year (2026). Field names boleh confuse developer baru.

---

## Security Summary
- No Firebase Authentication
- Admin password dalam Firestore (boleh bypass via localStorage)
- Firestore rules tidak cover actual collections → open read/write
- ADMIN_PASSWORD constant dalam firebase-config.js: 'adminpbd2024' (hardcoded fallback)

**Why:** Sistem sekolah kecil, satu sekolah sahaja, guru-guru sahaja guna. Security bukan keutamaan tapi perlu diberi tahu.
**How to apply:** Sebelum suggest feature baru, ingatkan B1 (Firestore rules) sebagai paling kritikal untuk fix.
