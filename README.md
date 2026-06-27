# Gold Podium — Sistem Pengurusan Kejohanan Sukan

Platform pengurusan kejohanan olahraga sekolah berasaskan web. Multi-tenant — setiap sekolah ada data tersendiri.

**Live:** https://goldpodium.web.app

---

## Stack

- **Frontend:** React 19, Vite, Tailwind CSS
- **Backend:** Firebase Firestore, Firebase Hosting, Firebase Auth
- **PDF:** jsPDF + jsPDF-AutoTable
- **Auth:** Firebase Authentication (email/password)

---

## Modul Siap (27 Jun 2026)

| Modul | Route | Status |
|-------|-------|--------|
| Login | `/login` | ✅ |
| Superadmin Setup | `/superadmin/setup` | ✅ |
| Superadmin Panel | `/superadmin` | ✅ |
| Admin Dashboard | `/admin` | ✅ |
| Kejohanan Detail | `/admin/kejohanan/:id` | ✅ |
| Kategori & Acara Setup | `/admin/kejohanan/:id/kategori` | ✅ |
| Acara Setup | `/admin/kejohanan/:id/acara` | ✅ |
| Pendaftaran Atlet | `/admin/kejohanan/:id/pendaftaran` | ✅ |
| Start List | `/admin/kejohanan/:id/startlist` | ✅ |
| Input Keputusan | `/admin/kejohanan/:id/keputusan` | 🔜 |
| Medal Tally | `/admin/kejohanan/:id/medal` | 🔜 |
| Laporan & Cetakan | `/admin/kejohanan/:id/laporan` | 🔜 |

---

## Firestore Paths (Multi-Tenant)

```
tenants/{schoolId}/                              — data sekolah
tenants/{schoolId}/kejohanan/{kejId}/            — kejohanan
tenants/{schoolId}/kejohanan/{kejId}/kategori/   — kategori peserta
tenants/{schoolId}/kejohanan/{kejId}/acara/      — acara
tenants/{schoolId}/kejohanan/{kejId}/acara/{id}/heat/  — start list heat
tenants/{schoolId}/kejohanan/{kejId}/pendaftaran/ — daftar atlet ke acara
tenants/{schoolId}/kejohanan/{kejId}/jadualKhas/ — slot khas jadual
tenants/{schoolId}/kejohanan/{kejId}/tetapan/waConfig  — WA lorong config
tenants/{schoolId}/atlet/                        — master atlet sekolah
```

---

## Roles

| Role | Akses |
|------|-------|
| `superadmin` | Panel superadmin, semua sekolah |
| `admin` | Dashboard admin, data sekolah sendiri |
| `teacher` | Dashboard guru (akan datang) |

---

## Setup

```bash
npm install
cp .env.local.example .env.local   # isi Firebase config
npm run dev
```

## Deploy

```bash
npm run build && firebase deploy --only hosting
```

---

## Perbezaan dari KOAM

Gold Podium adalah sistem **baru** yang berasingan sepenuhnya dari KOAM (`olahragaKemaman`):
- Firebase project berbeza: `goldpodium`
- GitHub repo berbeza
- Multi-tenant — sokong banyak sekolah dalam satu platform
- Tiada `jadual_acara` top-level collection (KOAM ada, GP tidak)
- WA config dalam `tetapan/waConfig` subcollection (bukan top-level `wa_config`)
