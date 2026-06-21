# KOAM — Sistem Pengurusan Kejohanan Olahraga MSSD Kemaman

Sistem pengurusan kejohanan olahraga sekolah (MSSD) berasaskan web, dibina dengan React + Firebase.

**Live:** https://mssdkemaman-olahraga.web.app

---

## Stack

- **Frontend:** React 19, Vite, Tailwind CSS
- **Backend:** Firebase Firestore, Firebase Hosting, Firebase Auth
- **PDF:** jsPDF + jsPDF-AutoTable, html2canvas
- **Excel:** SheetJS (xlsx)

---

## Modul Utama

| Modul | Path | Keterangan |
|---|---|---|
| Home | `/` | Papan pemuka awam — jadual, keputusan, rekod |
| Pendaftaran | `/daftar` | Login sekolah, daftar atlet, pilih acara |
| Pencatat | `/pencatat` | Input keputusan masa/jarak/markah |
| Dashboard Admin | `/dashboard` | Pengurusan penuh kejohanan |

### Dashboard Admin

| Menu | Path | Keterangan |
|---|---|---|
| Analisis Pendaftaran | `/dashboard/analisis` | Ringkasan acara & analisis sekolah |
| Acara Setup | `/dashboard/acara` | Urus senarai acara |
| Jadual Setup | `/dashboard/jadual` | Urus jadual pertandingan |
| Kategori Setup | `/dashboard/kategori` | Urus kategori atlet (SR/SM/PPKI) |
| Sekolah Setup | `/dashboard/sekolah` | Urus sekolah & PIN |
| Pendaftaran Setup | `/dashboard/pendaftaran` | Semak & urus pendaftaran atlet |
| Start List | `/dashboard/startlist` | Jana & cetak start list PDF |
| Input Keputusan | `/dashboard/keputusan` | Masuk & publish keputusan |
| Medal Tally | `/dashboard/medal` | Kedudukan pingat |
| Olahragawan | `/dashboard/olahragawan` | Rekod & PDF sijil/hadiah |
| Rekod | `/dashboard/rekod` | Urus rekod kejohanan |
| Buku Kejohanan | `/dashboard/buku` | Jana buku program PDF |
| Cetak Acara | `/dashboard/cetak-acara` | Cetak keputusan ikut acara |
| Tetapan Home | `/dashboard/tetapan` | Urus dokumen & pautan |
| Cetakan Hadiah | `/dashboard/cetakan-hadiah` | Cetak PDF hadiah & sijil by acara |
| Sijil Penyertaan | `/dashboard/esijil` | Setup template Sijil Penyertaan (drag-drop) |
| Setup Sijil Pencapaian | `/dashboard/esijil-pencapaian` | Setup template Sijil Pencapaian + toggle ON/OFF + had kedudukan dinamik |
| Kongsi Buku | `/dashboard/buku-kongsi-setup` | Kongsi URL Google Drive (max 10) untuk PP muat turun |
| Muat Turun Sijil | `/dashboard/muaturunsijil` | Admin muat turun ZIP sijil penyertaan by sekolah |
| Backup Sistem | `/dashboard/backup` | Muat turun & pulihkan data (.koam) |
| Reset Sistem | `/dashboard/reset` | Reset data kejohanan secara selektif |
| User Management | `/dashboard/users` | Urus akaun pengguna |

### Pengurus Pasukan (PP)

| Menu | Path | Keterangan |
|---|---|---|
| Sijil Penyertaan | `/dashboard/sijilsaya` | Senarai atlet sekolah + muat turun sijil penyertaan PDF/ZIP |
| Sijil Pencapaian | `/dashboard/sijil-pencapaian` | Senarai atlet sekolah dapat tempat 1 – hadKedudukan + muat turun PDF (tersembunyi kalau admin OFF) |
| Buku Kejohanan | `/dashboard/buku-kongsi` | Buka PDF dari Google Drive yang admin kongsi (tersembunyi kalau admin OFF) |

---

## Struktur Firestore

```
kejohanan/{kejId}
  ├─ acara/{acaraId}         — senarai acara (noAcara, namaAcara, jantina, kategoriKod, jenisLorong)
  ├─ acara/{acaraId}/heat/{heatId}  — heat (peserta[], lorong, giliran, statusKeputusan)
  ├─ pendaftaran/{noKP}      — rekod atlet (acaraIds[], kodSekolah, noBib, kategoriKod)
  └─ jadual/{jadualId}       — jadual pertandingan (tarikhAcara, masaMula, lokasi)

kategori/{kod}               — kategori atlet (jenisSekolah, label, urutan, hadAtlet)
sekolah/{kodSekolah}         — data sekolah (namaSekolah, kategori, bibPrefix, pin)
atlet/{noKP}                 — rekod atlet (nama, sekolah, kategoriKod)
rekod/{id}                   — rekod aktif (diluluskan admin) — acara, masa/jarak, pemegang, tahun
rekod/{id}_tuntutan          — rekod pending (belum lulus) — auto-cipta apabila prestasi baru pecah rekod
rekod_sejarah/{id}           — audit trail edit/padam rekod
pendaftaran_counter/{kejId_kodSekolah} — counter noBib per sekolah per kejohanan (dipadam semasa Reset Pendaftaran)
wa_config/{kejId}            — konfigurasi lorong WA per kejohanan (lorongKumpulan per jenisLorong)
tetapan/home                 — tetapan papan pemuka awam (logo, tajuk)
tetapan/finalSetup           — tetapan pilih finalis (bestHeat, bestTime per kategori)
tetapan/sijil                — Sijil Penyertaan: template + posisi + gaya (drag-drop 3 item)
tetapan/sijilPencapaian      — Sijil Pencapaian: { aktif, templateImg, hadKedudukan, posisi×6, style×6, tempatKejohanan[] }
tetapan/bukuKongsi           — Buku Kongsi: { aktif, senarai: [{ id, tajuk, url, createdAt }] }
mata_olahragawan/{noKP}_{kejId}  — { acaraDetail_{acaraId}: { rank, pingat, namaAcara, prestasi, ... } } — sumber data Sijil Pencapaian
```

---

## Sijil Pencapaian

Sijil pencapaian (Tempat 1-N) automatik dijana selepas keputusan rasmi.

**Trigger:** `runPostRasmi()` tulis `mata_olahragawan.acaraDetail_{acaraId}` (individu) atau scan `kejohanan/.../acara` jenisAcara=relay heat fasa=final/terus_final statusKeputusan=rasmi/diterima (relay — setiap ahli pasukan dapat sijil sendiri).

**Layak:** rank ≤ hadKedudukan (default 5, dinamik 1-10), bukan DNS/DNF/DQ, filter kodSekolah untuk PP.

**Label kedudukan:** JOHAN / NAIB JOHAN / KETIGA / KEEMPAT / KELIMA / KEENAM…KESEPULUH.

**6 item drag-drop:** Nama Atlet, Kedudukan, Acara, Nama Kejohanan, Tarikh, Tempat Kejohanan (multi-baris dinamik max 5 baris).

**Toggle ON/OFF (admin):** `tetapan/sijilPencapaian.aktif` — bila OFF, menu PP tersembunyi dan akses URL langsung redirect ke `/dashboard`. Real-time via `onSnapshot` dalam `DashboardLayout`.

---

## Buku Kongsi (Google Drive Share)

Admin kongsi URL Google Drive (cth Buku Kejohanan PDF) untuk PP muat turun.

**Validate:** Hanya URL `drive.google.com`. Auto-extract FILE_ID. Convert ke View Link (PP klik → Drive viewer dalam tab baru → ada butang download).

**Limit:** Max 10 buku per kejohanan.

**Toggle ON/OFF:** Sama pattern macam Sijil Pencapaian — `tetapan/bukuKongsi.aktif`.

**Setup Drive yang betul:**
1. Klik kanan PDF di Google Drive → Share
2. General access: "Anyone with the link"
3. Role: "Viewer" (BUKAN Editor)
4. Copy URL → paste dalam Kongsi Buku

---

## Analisis Pendaftaran (`/dashboard/analisis`)

Dua pandangan:

1. **Ringkasan Acara** — baris = jenis acara, lajur = kategori atlet (L12, P12…), nilai = bilangan pendaftaran
2. **Analisis Sekolah** — baris = sekolah, lajur grouped = acara × sub-kategori, rumusan ✓/✗ ikut kelengkapan pendaftaran. Filter jenis sekolah dinamik dari Firestore.

---

## Penetapan Lorong Final (WA)

Lorong final ditetapkan mengikut piawaian World Athletics (WA) — undian rawak dalam kumpulan:

| Jenis (`jenisLorong`) | Acara | Kumpulan (default) |
|---|---|---|
| `lurus` | 100m, Berpagar 100m/110m | [3,4,5,6] → [2,7] → [1,8] |
| `dua_ratus` | 200m | [5,6,7] → [3,4,8] → [1,2] |
| `selekoh` | 400m+, semua relay | [4,5,6,7] → [3,8] → [1,2] |

Kumpulan boleh dikonfigurasi per kejohanan melalui **Acara Setup → WA Config**.

Saringan (heat) guna undian terus standard: rank 1 → lorong 4, rank 2 → lorong 5, dll.

---

## Flow Rekod Kejohanan

```
Prestasi rasmi → postRasmiUtils → rekod/{id}_tuntutan  (pending)
                                        ↓
                              Admin semak di /dashboard/rekod → tab Tuntutan
                                        ↓
                              Sahkan → rekod/{id}  (aktif)
                              Tolak  → tuntutan dipadam
```

Rekod tidak pernah ditulis secara automatik tanpa kelulusan admin.

**Paparan dalam Olahragawan:**
- Tab kategori (L12, P12...) tunjuk atlet yang ada pingat (`jumlahMata > 0`) **atau** ada rekod dipecah (`rekod_*` fields)
- Atlet pecah rekod tanpa pingat (tempat 5+) tetap muncul dalam tab mereka
- `mata_olahragawan` hanya ditulis semasa fasa `final` / `terus_final` — heat saringan tidak dikira

**Format prestasi rekod:**
- Data baru (Jun 2026+): disimpan dalam **saat tulen** (cth `178.34` = 2:58.34)
- Data lama: format `mm.ss` (cth `2.58` = 2 minit 58 saat) — `normaliseSaat()` dalam postRasmiUtils handle kedua-dua format untuk perbandingan rekod

---

## Format Input Masa — Acara Larian

Pencatat input masa dalam format `m.ss.ms` (minit.saat.milisaat):

| Input pencatat | Nilai disimpan | Dipapar |
|---|---|---|
| `2.58.34` | `178.34` saat | `2:58.34` |
| `58.34` | `58.34` saat | `58.34s` |
| `1.05.67` | `65.67` saat | `1:05.67` |

Selepas pencatat taip dan keluar dari field (blur), sistem parse dan papar semula nilai dalam format `m:ss.ms` di bawah input sebagai pengesahan visual.

---

## Reset Sistem (`/dashboard/reset`)

Reset data kejohanan secara selektif. Setiap toggle bebas dan boleh digabung:

| Toggle | Koleksi | Level |
|---|---|---|
| Pendaftaran Atlet | `atlet.noBib`, `kejohanan/.../pendaftaran`, `pendaftaran_counter` | Sederhana |
| Jadual Acara | `jadual_acara` | Sederhana |
| Keputusan & Heat | `kejohanan/.../acara/.../heat`, `bantahan`, `kejohanan/.../pengesahan` | Bahaya |
| Rekod Pecah Kejohanan | `rekod (filter kejohananId)` | Sederhana |
| Medal Tally | `medal_tally`, `medal_tally_kat` | Sederhana |
| Mata & Pilihan Olahragawan | `mata_olahragawan`, `pilihan_olahragawan` | Sederhana |
| Setup Acara | `kejohanan/.../acara` (cascade) | Bahaya |
| Kategori | `kategori` | Bahaya |
| Sekolah | `sekolah` | Bahaya |

Reset Pendaftaran juga memadam `pendaftaran_counter` supaya noBib mula semula dari 1 selepas reset.

Reset Keputusan & Heat juga memadam `pengesahan` — status PP kembali ke Belum Sah.

---

## Keselamatan

- **Firestore rules** — semua write memerlukan `request.auth != null` (anonymous token). Bot luar tanpa token ditolak.
- **PIN hashing** — PBKDF2-SHA256, 10,000 iterasi. Auto-migrate dari plain text semasa login pertama.
- **Rate limiting** — 5 percubaan gagal → kunci 30 minit (`login_attempts` collection).
- **Audit trail** — `rekod_sejarah` dan `log_reset` immutable (update/delete = false).
- **sessionStorage** — sesi pencatat/PP luput bila tab ditutup. Bukan localStorage.
- **Blaze plan** — set Budget Alert di Firebase Console (cadang: USD 5 warning, USD 20 critical).

## Start List — Counter Cetak

Field `bilanganCetak` disimpan dalam setiap heat doc. Paparan dalam tab Hari:

- `○` — belum dicetak
- `✓N` — dicetak N kali

Selepas Reset Keputusan & Heat + Jana Heat semula → counter bermula dari 0.

---

## Develop Lokal

```bash
npm install
npm run dev
```

## Deploy

```bash
npm run build && firebase deploy --only hosting
```
