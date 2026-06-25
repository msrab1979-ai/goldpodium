---
name: KOAM Project Status
description: Sistem Statistik Pengurusan Kejohanan Olahraga — React+Firebase, status semasa dan keputusan rekabentuk
type: project
originSessionId: a318a46a-e622-4932-a1ff-ae0a0aa68c26
---
**Projek:** KOAM — /Users/msrab/Desktop/olahragaKemaman
**Firebase:** mssdkemaman-olahraga (mssdkemaman-olahraga.web.app)
**Stack:** React 18 + Vite + Tailwind + Firebase Firestore/Auth

**Why:** Sistem pengurusan kejohanan olahraga peringkat kebangsaan (KOAM) dengan multi-role (superadmin, admin, pencatat, pengurus_teknik, viewer).

**Status terakhir (14 Jun 2026):**
- ✅ Login, Dashboard, UserManagement, KejohananSetup, SekolahSetup
- ✅ MedalTally (Olympic style) — nyahaktif sekolah tersembunyi
- ✅ Olahragawan (mata E=5 P=3 G=2 T4=1)
- ✅ PendaftaranSetup — Urus Atlet + Daftar Acara + Pengesahan PP
- ✅ validasiPendaftaran.js — 8-gate + Gate G0 noBib prefix
- ✅ PPPendaftaranView — Import Excel, bypass fix, auto-replace heat
- ✅ kiraKategori — guna `label` untuk detect jantina (fix kategori salah M/N vs C/D)
- ✅ InputKeputusan — terus publish
- ✅ PDF: Start List, Cetak Acara, Cetak Keputusan, Buku Kejohanan
- ✅ AnalisisPendaftaran — fix double column LL12, fix acara final duplikat
- ✅ E-Sijil — setup template (admin) + download PP (SijilPengurus)
- ✅ Muat Turun Sijil — menu baru admin: ZIP by sekolah + ZIP semua atlet
- ✅ sijilUtils.js — shared util janaSijilPDF + namaFail
- ✅ SekolahSetup — carian no bib dalam column search; bibPrefix duplikat semak dalam kategori sama sahaja
- ✅ Backup — Jana Sheet Excel (8 tab, No BIB→VLOOKUP nama auto)
- ✅ AnalisisPendaftaran — fix carian sekolah Tab 3, fix PDF status (Daftar hijau ≥1 acara)
- ✅ Ghost check Firestore — 516 pendaftaran bersih, sedia jana heat
- ❌ Paparan awam (/live /stadium /rekod)
- ⏳ Relay auto-replace heat — skip, admin jana heat semula
- ⏳ 23 atlet kategoriKod lama (M/N dalam pendaftaran, C/D dalam atlet) — cosmetic, boleh sync selepas kejohanan

**Auth System (Jun 2026) — PENTING:**
- `Login.jsx` Tab 1 (E-mel): guna `loginSuperadmin` = Firebase Auth (email + password)
- `Home.jsx` AdminModal: guna `loginAdmin` = Firestore `users` (email + PIN 6-digit)
- `AuthContext`: TIADA `onAuthStateChanged` / `signInAnonymously` — semua via sessionStorage
- `firestore.rules`: semua write = `if true` (tiada Firebase Auth dependency)
- `auth.js`: ada fungsi `loginAdminByEmail` (email + PIN dari Firestore users)
- Superadmin Firestore doc (`users/rEOjmh0jOnYT2mk4mhuW9FqFtp62`): ada field `pin: "123456"` (ditambah manual Jun 2026)

**Fail struktur (Jun 2026):**
- DIPADAM: `src/pages/admin/KeputusanRasmi.jsx`
- BARU: `src/pages/admin/AnalisisPendaftaran.jsx`
- BARU: `src/pages/admin/MuatTurunSijil.jsx`
- BARU: `src/pages/admin/HealthCheck.jsx`
- BARU: `src/utils/finalistUtils.js`
- BARU: `src/utils/postRasmiUtils.js`
- BARU: `src/utils/sijilUtils.js`

**How to apply:** Semak brief KOAM_MASTER_BRIEF.md di root projek untuk detail penuh sebelum buat perubahan.

**Koleksi Firestore penting:**
- atlet/{noKP} — master identity
- sekolah/{kodSekolah}
- kejohanan/{id}/acara/{aceraId}
- kejohanan/{id}/pendaftaran/{noBib}
- kategori/{kategoriId} — had acara + tahun lahir min/max (perlu admin setup)
- jadual_acara/{jadualId} — time schedule
