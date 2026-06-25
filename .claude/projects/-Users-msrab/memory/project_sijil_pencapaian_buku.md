---
name: project_sijil_pencapaian_buku
description: "Sijil Pencapaian + Buku Kongsi Google Drive — 4 fail baru + 2 fail diubah, toggle ON/OFF kawal visibility PP. Isolation penuh dari Sijil Penyertaan sedia ada."
metadata: 
  node_type: memory
  type: project
  originSessionId: d20a2b2f-6c86-4d80-a811-8babdba50f5f
---

## Sijil Pencapaian (18 Jun 2026)

**Fail baru:**
- `src/pages/admin/ESijilPencapaian.jsx` — Setup template, drag-drop 6 item
- `src/pages/pengurus/SijilPencapaianPP.jsx` — Senarai pencapaian PP + muat turun PDF/ZIP
- `src/utils/sijilPencapaianUtils.js` — Query mata_olahragawan + scan relay + PDF generator

**Firestore:** `tetapan/sijilPencapaian` (collection berasingan dari `tetapan/sijil`)

**6 item drag-drop:** Nama Atlet, Kedudukan (JOHAN/NAIB JOHAN/KETIGA/KEEMPAT/KELIMA), Acara, Nama Kejohanan, Tarikh, Tempat (multi-baris dinamik max 5)

**Logic trigger:**
- Individu: dari `mata_olahragawan.acaraDetail_*` (ditulis oleh `runPostRasmi` postRasmiUtils.js)
- Relay: scan `kejohanan/{kejId}/acara` jenisAcara=relay, heat fasa=final/terus_final, statusKeputusan=rasmi/diterima → loop `peserta.ahliPasukan[]` → satu sijil per ahli
- Filter `rank ≤ hadKedudukan` (default 5, admin set dinamik 1-10)
- Filter `kodSekolah` untuk PP

**Toggle ON/OFF:** `tetapan/sijilPencapaian.aktif` — default ON. Kalau OFF: sidebar PP sembunyi menu, akses URL langsung redirect ke `/dashboard`. Real-time via `onSnapshot` dalam `DashboardLayout.jsx`.

## Buku Kongsi (18 Jun 2026)

**Fail baru:**
- `src/pages/admin/BukuKongsiSetup.jsx` — Senarai URL Google Drive (max 10)
- `src/pages/pengurus/BukuKongsiPP.jsx` — PP list + buka Drive viewer
- `src/utils/bukuKongsiUtils.js` — Extract Drive FILE_ID + validate URL

**Firestore:** `tetapan/bukuKongsi` = `{ aktif: bool, senarai: [{ id, tajuk, url, createdAt }] }`

**Validate:** Hanya `drive.google.com` URL. Auto-extract FILE_ID dari pelbagai format (`/d/{id}/`, `?id={id}`). Convert ke View Link untuk buka (bukan auto-download).

**Toggle ON/OFF:** Sama pattern macam Sijil Pencapaian — `tetapan/bukuKongsi.aktif`.

## Rename Menu Admin (18 Jun 2026)

- PP sidebar: "E-Sijil" → **"Sijil Penyertaan"**
- Admin sidebar: "Setup E-Sijil" → **"Sijil Penyertaan"** (juga rename, untuk jelas)
- Menu baru admin: "Setup Sijil Pencapaian", "Kongsi Buku"
- Menu baru PP: "Sijil Pencapaian", "Buku Kejohanan"

## Approach Confirmed: Isolation Penuh

Fail sedia ada TIDAK disentuh kecuali tambah baris:
- `App.jsx` — 4 route baru (2 admin + 2 PP)
- `DashboardLayout.jsx` — 4 menu baru + 2 `onSnapshot` toggle listener
- `firestore.rules` — TIDAK perlu ubah (rules `tetapan/{id}` sedia ada cover)

Tak usik: `ESijil.jsx`, `MuatTurunSijil.jsx`, `SijilPengurus.jsx`, `sijilUtils.js`, `postRasmiUtils.js`, `MedalTally.jsx`, `Olahragawan.jsx`.

Pattern reference: `ESijil.jsx` (drag-drop), `MuatTurunSijil.jsx` (ZIP download).

Linked: [[feedback_jangan_usik_fail_lain]] — terbukti pattern ni works.
