---
name: Rekod Pecah — Flow & Status Setiap Lokasi
description: Apa berlaku bila rekod dipecah: trigger, badge Home, Olahragawan, PDF mana kena tunjuk
type: project
originSessionId: f34f875e-8755-4d53-a506-8cb244459784
---
## Trigger (postRasmiUtils.js)
Bila pencatat HANTAR keputusan → `runPostRasmi` jalankan:
1. `isBetter = true` (masa/jarak lebih baik dari rekod sedia, atau rekod pertama)
2. Tulis rekod baru ke **PRIMARY key** (namaAcaraPendek + kategoriKod format baru) + `kejohananId`
3. Simpan `prestasiLama`, `namaLama`, `lokasiLama` dalam rekod doc
4. Set `pecahRekod: 'D'/'N'/'K'` pada field peserta dalam heat doc
5. Jika old key berbeza (format lama), DELETE old key → elak orphan

**KRITIKAL**: Sentiasa tulis ke PRIMARY key (fix 2026-05-18). Sebelum fix, tulis ke found key (boleh format lama) → PDF miss.

## Lokasi Yang Tunjuk Rekod Pecah

### 1. Home — Tab Keputusan ✅
- `p.pecahRekod` ada dalam heat peserta → badge `🏆 REKOD` (amber) pada row atlet
- Klik → RekodModal tunjuk rekod lama vs baru + prestasi

### 2. Olahragawan (admin) ✅
- UI: Badge rekod warna (K=amber, N=biru, D=hijau) per atlet dari `mata_olahragawan`
- PDF: 3 halaman auto — Page 1 (MC/Pengacara), Page 2 (Slip Hadiah), Page 3 (Fail Rasmi)
- MC + Fail: jadual acara + section REKOD DIPECAHKAN (rekod baru vs lama + pemegang lama)
- Fallback: jika `rekod_*` kosong dalam `mata_olahragawan` → fetch dari `rekod` collection (noKP + kejohananId)

### 3. PDF CetakKeputusan (admin → Cetak Keputusan) ✅
- `cariRekodDalamMap(acara, peringkatKej, rekodMap)` — cuba primary key dulu, fallback ke format lama
- `rekodBaru = rekodDoc && rekodDoc.kejohananId === kejId`
- Jika ya → kotak kuning `[REKOD DAERAH/NEGERI BARU]` + prestasi baru + rekod lama

### 4. PDF CetakAcara ✅ (rekod library, bukan rekod pecah)
- Tunjuk `★ REKOD BARU` dari rekod_tuntutan — untuk rujukan semasa pertandingan

## PDF YANG PERLU TUNJUK REKOD PECAH
1. **CetakKeputusan** ✅ — sudah ada kotak rekod baru
2. **Olahragawan PDF** ✅ — sudah ada section rekod dipecahkan
3. **CetakAcara** — menunjuk rekod library, bukan "rekod dipecah dalam kejohanan ini"
4. **BukuKejohanan** — belum implement, boleh tambah masa depan

## Bug Yang Pernah Berlaku
- postRasmiUtils tulis ke fallback key (format lama) → PDF primary lookup miss → no badge/kotak
- Fix: tulis ke PRIMARY key selalu, padam old key jika berbeza (2026-05-18)
- CetakKeputusan: tambah `cariRekodDalamMap()` yang cuba fallback untuk data lama

**Why:** Home badge dan PDF kotak bergantung pada rekod ada di PRIMARY key dengan `kejohananId` set.
**How to apply:** Jika ada PDF baru yang perlu tunjuk rekod pecah, guna `cariRekodDalamMap()` bukan terus `rekodMap[rKey]`.
