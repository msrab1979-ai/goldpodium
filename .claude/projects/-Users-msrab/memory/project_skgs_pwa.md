---
name: project-skgs-pwa
description: "SKGS PWA — Sistem Kehadiran & e-Gerak Pintar untuk SK Sultan Ismail, Firebase project thumbin-9a08d, single-file index.html"
metadata: 
  node_type: memory
  type: project
  originSessionId: 920b06a8-e216-4b77-84bf-09f205b4f2ae
---

# SKGS PWA — Sistem Kehadiran & e-Gerak Pintar

**Firebase project:** thumbin-9a08d  
**Hosting URL:** https://thumbin-9a08d.web.app  
**Lokasi fail:** /Users/msrab/Desktop/SKGS-PWA/index.html (single-file, 98KB+)  
**Deploy:** `firebase deploy --only hosting` (dari folder SKGS-PWA)

## Stack
- Vanilla HTML/JS + Firebase (Auth + Firestore)
- Google Apps Script (GAS) — hanya untuk `saveSelfie` ke Google Drive
- PWA dengan Service Worker (skgs-v5)
- SHA-256 PIN hashing via Web Crypto API

## Firestore Collections
| Collection | Kegunaan |
|-----------|---------|
| `settings/config` | GAS URL, folder selfie ID, nama sekolah, koordinat, radius, dll |
| `users/{email}` | Data staf: nama, email, ic, syif, role, status, pin, device, tgId |
| `syif/{id}` | Syif kerja: id, nama, kategori (akademik/pejabat/semua), jadual per hari |
| `cuti/{id}` | Cuti: tarikh, nama, jenis, skop (akademik/pejabat/semua), negeri, tahun |
| `kehadiran/{docId}` | Rekod punch masuk/pulang |
| `egerak/{docId}` | Rekod e-Gerak |
| `kelulusan/{docId}` | Kelulusan punch lewat/awal |
| `reminders/{docId}` | Peringatan |

## Auth Flow
- Google signInWithPopup → semak Firestore users/{email}
- Email/password → step 1: email, step 2: PIN (4 digit, SHA-256)
- Device lock: fingerprint (canvas+WebGL+screen+localStorage) → simpan dalam users.device
- Tukar device: perlu selfie + kelulusan admin

## GAS — Hanya untuk Selfie
- GAS URL dan selfie folder ID dinamik dari Firestore settings/config
- `saveSelfie` → simpan foto ke Google Drive folder
- Selfie WAJIB untuk punch kehadiran
- Semua fungsi lain (staf, kehadiran, laporan) → kena migrate ke Firestore

## Syif & Cuti Integration
- Syif ada `kategori`: akademik / pejabat / semua
- Cuti ada `skop`: akademik / pejabat / semua
- Logic: jika cuti.skop match syif.kategori staf → status = Cuti (bukan Tidak Hadir)
- Skop cuti boleh toggle-klik terus pada badge dalam senarai cuti

## Status Pembangunan (Mei 2026)
| Modul | Status |
|-------|--------|
| Login (Google + PIN) | ✅ Siap, Firestore-based |
| Device Lock | ✅ Siap |
| Urus Syif | ✅ Siap, Firestore CRUD |
| Kalendar Cuti | ✅ Siap |
| Pengurusan Staf | ✅ Siap, Firestore CRUD |
| Punch Kehadiran | ✅ Siap, Firestore direct |
| Monitor Admin | ✅ Siap, Firestore direct |
| Laporan/Rekod | ✅ Siap, Firestore direct, ada Harian/Bulanan filter |
| Selfie → Drive | ⏳ PENDING — saveSelfie berfungsi tapi URL tidak kembali ke app |
| Selfie link Monitor | ⏳ PENDING — bergantung pada selfie URL selesai |

## ISU KRITIKAL: Selfie URL Callback (belum selesai)
**Simptom:** Gambar selfie berjaya disimpan dalam Google Drive (65KB confirmed), tapi `selfieUrlMasuk`/`selfieUrlPulang` kosong dalam Firestore.

**Punca ditemui (26 Mei 2026):**
- Error: `Exception: Access denied: DriveApp.` — dari GAS response
- URL dalam Firestore `settings/config.gas_url` = `AKfycbwT...` (betul, matching GAS deployment)
- GAS deployment settings: Execute as Me ✓, Anyone ✓
- TAPI: deployment lama mungkin authorization tidak sempurna

**Yang sudah dicuba:**
- Compression canvas 640px JPEG 0.7 ✓
- Plain fetch tanpa AbortController ✓  
- waitAppConfig() race condition fix ✓
- URL kemaskini dalam Firestore ✓
- Run setupDriveFolder() manual — berjaya (tiada error, tiada auth dialog)

**Langkah seterusnya (BELUM dibuat):**
- Buat **NEW GAS deployment** (Deploy → New deployment) → authorization dialog AKAN keluar → Allow
- Salin URL baru → kemaskini Firestore settings/config.gas_url
- Test semula selfie

**Debug log** (uploadSelfieGAS):
- `[GAS] hantar saveSelfie:` — fetch dibuat ✓
- `[GAS] status: 200 url: script.googleusercontent.com/...` — redirect berlaku ✓
- `[GAS] response raw: {"ok":false,"msg":"Gagal simpan: Exception: Access denied: DriveApp."}` — punca

**Why:** GAS backend hanya ada saveSelfie. Semua modul lain dah migrate ke Firestore terus.  
**How to apply:** Jangan guna GAS untuk fungsi baru — Firestore direct sahaja.
