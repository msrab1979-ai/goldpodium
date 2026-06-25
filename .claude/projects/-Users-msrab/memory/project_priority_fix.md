---
name: Priority Fix List KOAM
description: Senarai fix mengikut keutamaan — mulakan apabila user kata "let go"
type: project
originSessionId: a1662eb6-df4e-4c16-a1e7-60a71f2a1485
lastUpdated: 2026-05-03
---
# Fix Priority List — Status Semasa

## ✅ SELESAI — Semua Kritikal

### P1 — noBib Duplicate (Tab 1) ✅ DONE
Live Firestore semak di PendaftaranSetup.jsx ~line 278-288.

### P2 — Bantahan Heat Final bypass postRasmi ✅ DONE
UI hide "Sahkan Rasmi" untuk final heat → show "Hubungi Admin" (InputKeputusan.jsx:1841-1851).

### P3 — terus_final dalam statusAcara ✅ DONE
Line 1176: `x.fasa === 'terus_final'` sudah ada.
Bonus fix: Line 1360 `h.peringkat` → `h.fasa` (field name salah) — FIXED 2026-05-03.

### P0 (baru ditemui) — handleSahkanRasmi field name ✅ DONE (2026-05-03)
`h.peringkat === 'final'` → `h.fasa === 'final' || h.fasa === 'terus_final'` di InputKeputusan.jsx:1360
**Why:** heat doc guna field `fasa`, bukan `peringkat`. Silap field menyebabkan statusAcara boleh tersalah kira jika ada heat bantahan + heat final.

## 🟡 SEDERHANA — Belum Fix

### P4 — Warning peserta tanpa rankDalamHeat
postRasmi skip peserta tiada rankDalamHeat senyap.
**Fix:** KeputusanRasmi — sebelum Sahkan Rasmi, semak `status==='selesai' && rankDalamHeat===null` → warning dialog.

### P5 — Tuntutan Rekod Berganda
Jika rekod dalam 'tuntutan', acara berlari semula → tuntutan kedua dicipta.
**Fix:** postRasmi semak `rKey + '_tuntutan'` sudah wujud sebelum buat baru.

### P6 — kodSekolah edit cascade
Ubah kodSekolah → atlet.kodSekolah orphan.
**Fix:** SekolahSetup block edit kodSekolah jika ada atlet berdaftar.

## 🟢 KECIL

### P7 — bibPrefix unik enforcement
Tiada semak bibPrefix unik per jenis sekolah.

### P8 — Relay rekod ✅ DONE (2026-05-04)
Relay rekod kini disokong dalam postRasmi. Pasukan tempat 1 (fasa final) buat tuntutan rekod atas nama sekolah (namaAtlet = namaSekolah, noKP = null, isRelay = true). Sama logik tuntutan berganda — setDoc overwrite jika prestasi lebih baik.

## 📋 FEATURE — Bila Kritikal & Sederhana Selesai

### F1 — Slip Hadiah + Kertas Juruhebah
### F2 — Buku Kejohanan PDF
### F3 — Cetakan Keputusan by Day (PDF + Excel)
(Draf lengkap dalam project_cetak_admin.md)
