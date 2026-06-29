# Gold Podium — Sistem Pengurusan Kejohanan Sukan

Platform pengurusan kejohanan olahraga sekolah berasaskan web. Multi-tenant — setiap sekolah ada data tersendiri.

**Live:** https://goldpodium.web.app  
**GitHub:** https://github.com/msrab1979-ai/goldpodium

---

## Stack

- **Frontend:** React 19, Vite, Tailwind CSS
- **Backend:** Firebase Firestore, Firebase Hosting, Firebase Auth
- **PDF:** jsPDF + jsPDF-AutoTable
- **Auth:** Firebase Authentication (admin/superadmin) + PIN sessionStorage (pencatat/pengurus)

---

## Changelog

### 30 Jun 2026 — Multi-User Safety Fix (commit `baa36cc`)

**InputKeputusan — Rebuild 1:1 KOAM**
- `AccordionSection` — kumpulan acara by `kategoriKod`
- `InputSemuaPeserta` — semua heat dalam satu grid (`modSemua` toggle)
- `jenisBadge` — Saringan / Final / Terus Final per acara row
- `kesanKonflikMasa` — amber border bila dua peserta ada masa sama tanpa tiebreaker
- `kedudukan` SELECT dropdown (ganti text input)
- `sekolahMap` — nama sekolah dipapar dari `tenants/{schoolId}/sekolah`
- `carianBib` — carian & highlight per BIB
- `handleSaveSemuaPeserta` — simpan semua heat sekaligus (draf atau hantar)

**Multi-User Concurrent Write — Fixed**
- `handleSave`, `handleHantar`, `handleSaveSemuaPeserta` kini guna `runTransaction()`
- Save baca fresh `peserta[]` dari Firestore dalam transaction, merge, tulis balik
- Dua pencatat simpan serentak = tiada silent overwrite (last-writer-wins dihapus)

**Stale Data Banner — New**
- `onSnapshot` listener dikembangkan: kini refresh `peserta[]` dalam state
- Jika data berubah dari luar (pencatat lain save semasa user sedang input), banner amber muncul: "Data dikemaskini oleh pencatat lain — Muat Semula"
- Pencatat boleh muat semula atau teruskan input sendiri

**PencatatDashboard — Bug Fix**
- `HeatKeputusan`: data dari `heat.peserta[]` (betul) bukan `heat.keputusan{}` (lama)
- Tab Semak Keputusan kini paparkan nama atlet, masa, dan kedudukan dengan betul

**Firestore Rules — Tightened**
- `atlet` write: `if true` → `if isAuth()` (data murid PDPA dilindungi)
- `heat` write: kekal `if true` (pencatat PIN-based tiada Firebase Auth), concurrent safety via transaction
- Tambah komen dokumentasi untuk setiap collection yang open

---

### 29 Jun 2026 — Pencatat Slug-Based Multi-Tenant (commit `71a25b9`)

- `PencatatLayout` — sidebar layout 1:1 KOAM, 6 menu items
- `PencatatHome` — stats dashboard (atlet, sekolah, kejohanan, aktif)
- Semua routes pencatat: `/{slug}/pencatat/*` (bukan global)
- `RequirePencatat` guard: semak role + schoolSlug vs URL slug
- Back navigation admin pages (StartListSetup, CetakAcara, Rekod) aware pencatat route

---

### 28 Jun 2026 — Admin + Superadmin Full Wire (commit `a1dfee2`)

- 14 bug fix: pencatat login, heat rules, superadmin viewSchoolId, padamSekolah subcol, login_attempts key
- Semua 30+ admin routes wired dalam `AdminDashboard`
- `runPostRasmi` wired dalam kedua-dua admin dan pencatat `InputKeputusan`
- Pencatat routes betul, RequireAuth allow sessionStorage users

---

## Modul Siap (30 Jun 2026)

### Admin

| Modul | Route | Status |
|-------|-------|--------|
| Admin Dashboard | `/admin` | ✅ |
| Kejohanan Setup | `/admin/kejohanan-setup` | ✅ |
| Kejohanan Detail | `/admin/kejohanan/:id` | ✅ |
| Kategori Setup | `/admin/kejohanan/:id/kategori` | ✅ |
| Acara Setup | `/admin/kejohanan/:id/acara` | ✅ |
| Pendaftaran | `/admin/kejohanan/:id/pendaftaran` | ✅ |
| Start List | `/admin/kejohanan/:id/startlist` | ✅ |
| Input Keputusan | `/admin/kejohanan/:id/keputusan` | ✅ |
| Medal Tally | `/admin/kejohanan/:id/medal` | ✅ |
| Laporan Cetakan | `/admin/kejohanan/:id/laporan` | ✅ |
| Sekolah Setup | `/admin/sekolah` | ✅ |
| User Management | `/admin/pengguna` | ✅ |
| Tetapan | `/admin/tetapan` | ✅ |
| Jadual | `/admin/jadual` | ✅ |
| Rekod | `/admin/rekod` | ✅ |
| Olahragawan | `/admin/olahragawan` | ✅ |
| Analisa Pingat | `/admin/analisa-pingat` | ✅ |
| Reset Sistem | `/admin/reset` | ✅ |
| Health Check | `/admin/health` | ✅ |
| Buku Kejohanan | `/admin/buku-kejohanan` | ✅ |
| Cetak Acara | `/admin/cetak-acara` | ✅ |
| Cetak Keputusan | `/admin/cetak-keputusan` | ✅ |
| E-Sijil | `/admin/esijil` | ✅ |
| Analisis Pendaftaran | `/admin/analisis-pendaftaran` | ✅ |
| Backup | `/admin/backup` | ✅ |

### Pencatat (slug-based)

| Modul | Route | Status |
|-------|-------|--------|
| Dashboard | `/{slug}/pencatat/dashboard` | ✅ |
| Input Keputusan | `/{slug}/pencatat/input-keputusan` | ✅ |
| Input Heat | `/{slug}/pencatat/kejohanan/:id/keputusan` | ✅ |
| Start List | `/{slug}/pencatat/startlist` | ✅ |
| Rekod | `/{slug}/pencatat/rekod` | ✅ |
| Cetak Acara | `/{slug}/pencatat/cetak-acara` | ✅ |
| Cetakan Hadiah | `/{slug}/pencatat/cetakan-hadiah` | ✅ |

### Pengurus Pasukan (slug-based)

| Modul | Route | Status |
|-------|-------|--------|
| Login | `/{slug}/pengurus/login` | ✅ |
| Dashboard | `/{slug}/pengurus/dashboard` | ✅ |

### Awam

| Modul | Route | Status |
|-------|-------|--------|
| Landing | `/` | ✅ |
| School Landing | `/:slug` | ✅ |

---

## Firestore Structure

```
tenants/{schoolId}/
  ├── atlet/{atletId}
  ├── sekolah/{kodSekolah}
  ├── users/{uid}
  ├── tetapan/{docId}
  ├── pendaftaran_counter/{docId}
  └── kejohanan/{kejId}/
        ├── acara/{acaraId}
        ├── heat/{heatId}          ← FLAT, field aceraId
        ├── jadual/{acaraId}
        ├── medal_tally/{id}
        ├── mata_olahragawan/{id}
        └── tetapan/finalSetup

slugIndex/{slug}  →  { slug, schoolId, aktif }
login_attempts/{key}
```

---

## Security

- Admin/Superadmin: Firebase Auth (email/password)
- Pencatat/Pengurus: PIN + sessionStorage `gp_session` (tiada Firebase Auth)
- Heat write: `allow write: if true` — concurrent safety via `runTransaction()`
- Atlet/Pendaftaran write: `allow write: if isAuth()` (PDPA)
- Tenant isolation: semua path scoped ke `tenants/{schoolId}/...`

---

## Deploy

```bash
npm run build && firebase deploy --only hosting,firestore:rules
```
