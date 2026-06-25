---
name: project-sukanyusman
description: "Sistem Sukan Tahunan SK Sultan Ismail — GAS + Google Sheets, sekolah rendah, bukan Firebase"
metadata: 
  node_type: memory
  type: project
  originSessionId: 3d88f357-f86d-48bd-ac0a-bf793b2122f3
---

Sistem pengurusan Sukan Tahunan SK Sultan Ismail, Kemaman.

**Stack:** Google Apps Script (GAS) + HTML templates + Google Sheets sebagai database. Tiada Firebase.

**Fail utama (7 fail):**
- `code.gs` (4813 baris) — backend utama, gaya prosedural
- `model.gs` (1304 baris) — OOP layer baru (class-based), belum fully integrated
- `home.html` — paparan awam: medal tally, menu navigasi
- `adminSetup.html` — admin setup (sidebar): rumah, kategori, acara, pengguna
- `adminOps.html` — admin operasi: pendaftaran, heat management
- `adminresult.html` — kemasukan keputusan
- `urusetia.html` — halaman urusetia/pengurus

**Routing (doGet):** ?page=home | admin-setup | admin-ops | admin-results | urusetia | pencatat | pengurus

**Database (Google Sheets tables):**
- tbl_settings — key/value
- tbl_users — username, password, role, id_rumah
- tbl_rumah_sukan — id, nama, warna, kod, medal counts, mata
- tbl_kategori — id, kod, nama, jantina, umin, umax, kuota_individu/kumpulan/terbuka
- tbl_acara_master — template acara (dengan kategori_json, kuota, min/max_ahli)
- tbl_acara_jana — instans acara dijana per kategori dari master
- tbl_murid — no_kp, nama, id_rumah, id_kategori, auto-derive jantina+tarikh_lahir dari KP
- tbl_pendaftaran — individu registration (6 gates)
- tbl_pendaftaran_kumpulan — team/relay registration (ahli_json)
- tbl_heat / tbl_peserta_heat — heat management + undian lorong
- tbl_keputusan / tbl_keputusan_akhir — keputusan

**Ciri utama:**
1. Auto-derive dari IC: jantina (digit terakhir ganjil=L), tarikh_lahir, umur
2. 6 gates pendaftaran: buka? → jenis acara → verify murid → rumah match → semak umur → kuota
3. Import murid dari CSV
4. `janaAcara` — jana tbl_acara_jana dari tbl_acara_master per kategori
5. Undian lorong (random shuffle ke heat)
6. Medal tally + mata (emas/perak/gangsa/ke4 configurable)
7. Murid Terbaik per kategori
8. AuditLog model
9. Session via CacheService (6 jam)
10. togglePendaftaranAcara — buka/tutup per acara

**Dua gaya kod:**
- `code.gs` = prosedural, array index (production, berfungsi)
- `model.gs` = OOP class (BaseModel, subclasses), lebih clean, belum integrate penuh ke code.gs

**Bezanya dengan KOAM:**
- KOAM = Firebase/Firestore + React PWA (mssdkemaman-olahraga)
- sukanYusman = Google Sheets + GAS HTML (SK Sultan Ismail sekolah)
- KOAM = peringkat daerah (MSSD); sukanYusman = peringkat sekolah

**Why:** Sistem sekolah (berbeza owner), tidak ada Firebase account, lebih mudah guna Sheets.
**How to apply:** Jangan suggest Firebase; jangan campurkan konsep KOAM dengan ini. GAS constraint berlaku: execution time limit, no real-time, no auth token.
