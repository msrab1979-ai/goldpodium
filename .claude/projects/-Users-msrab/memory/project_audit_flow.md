---
name: Audit Flow Sistem KOAM
description: Audit menyeluruh flow pendaftaran→startlist→keputusan→medal→rekod + identifier integrity (April 2026)
type: project
originSessionId: a1662eb6-df4e-4c16-a1e7-60a71f2a1485
---
# Audit Flow: Pendaftaran → Rekod (April 2026)

## Ringkasan Status

| Bahagian | Status | Isu |
|----------|--------|-----|
| Pendaftaran | ✅ | — |
| Start List | ✅ | — |
| Masuk Keputusan | ⚠️ | Tiada warning peserta tanpa rankDalamHeat |
| Sahkan Rasmi (postRasmi) | ✅ | postRasmiSelesai flag cegah double count |
| Medal Tally | ✅ | medal_tally + medal_tally_kat + mata_olahragawan |
| Trigger Rekod | ⚠️ | 2 isu (lihat bawah) |

## Identifier Integrity — noKP / kodSekolah / noBib

### noKP (No. IC) — KUAT ✅
- Firestore doc ID untuk `atlet/{noKP}` dan `pendaftaran/{noKP}` — unik dijamin
- Format regex `/^\d{12}$/` + duplicate check sebelum create
- Global — seorang atlet satu noKP merentas semua sekolah

### kodSekolah — SEPARUH KUAT ⚠️
- Firestore doc ID untuk `sekolah/{kodSekolah}` — unik dijamin
- Gap: tiada format standard dipaksa (admin bebas masuk apa-apa)
- Gap KRITIKAL: tiada cascade update jika kodSekolah diubah — semua `atlet.kodSekolah` dan `pendaftaran.kodSekolah` jadi orphan/stale
- Fix: block perubahan kodSekolah jika ada atlet berdaftar

### noBib — LEMAH DI TAB 1 ⚠️
- **Tab 2 DaftarModal**: Firestore Transaction dengan `pendaftaran_counter` — KUAT ✅
- **Tab 1 AtletModal**: client-side check sahaja (existingBibs cache) — race condition boleh berlaku ❌
- Uniqueness scoped per sekolah via bibPrefix — betul by design
- Jika bibPrefix tidak diset → fallback ke kodSekolah → masih selamat

### Impak noBib Clash

**Kod sekolah SAMA + noBib SAMA:**
- Firestore tiada uniqueness constraint pada field noBib — tidak diblock
- Padang events (lompat/balin): slot keputusan = noBib → result satu atlet overwrite yang lain — result hilang senyap
- Start list: dua nama untuk satu slot bib → confusion di padang

**Kod sekolah LAIN + noBib SAMA:**
- Selamat jika bibPrefix berbeza per sekolah (design betul)
- Jika prefix sama/tidak diset → clash boleh berlaku
- Dalam heat yang sama: padang events → same collision, result hilang
- Lorong events (track): slot = lorong (lane) bukan noBib → keputusan selamat, tapi confusion fizikal

### Fix Diperlukan (keutamaan)
1. **SEDERHANA** — noBib Tab 1 (AtletModal) semak cache sahaja (existingBibs prop), bukan live Firestore. Race condition jika dua admin tambah serentak dalam sekolah sama.
   - Cross-school noBib clash TIDAK BAHAYA — SR (kat A/B) dan SM (kat C/D/E) tidak pernah dalam heat sama. Contoh: TBB2025(SR)-PP01 dan TMA4509(SM)-PP01 DIBENARKAN — kategori lain, heat lain.
   - Sama kategori (SR vs SR) dilindungi oleh bibPrefix unik per sekolah (diurus manual oleh admin).
   - Syarat selamat: admin MESTI set bibPrefix unik per sekolah sejenis dalam SekolahSetup.
2. **TINGGI** — block edit kodSekolah jika ada atlet berdaftar
3. **SEDERHANA** — paksa bibPrefix unik semasa setup sekolah

## Isu Pending — Masuk Keputusan

`postRasmi` bergantung penuh kepada `rankDalamHeat` dan `status === 'selesai'`.
Jika peserta tiada rank → dilangkau senyap. Tiada warning kepada admin sebelum sahkan rasmi.

**Fix:** Tambah semakan sebelum butang Sahkan Rasmi — alert jika ada peserta status selesai tapi rankDalamHeat kosong.

## Isu Pending — Trigger Rekod

**Isu 1 — Tuntutan berganda:**
Jika rekod masih `statusRekod: 'tuntutan'`, acara sama berlari semula → sistem anggap tiada rekod aktif → tuntutan kedua dicipta.
Fix: semak juga `rKey + '_tuntutan'` sebelum buat tuntutan baru.

**Isu 2 — Relay tiada rekod:**
Acara relay langsung tidak dicek rekod. Confirm dengan user — mungkin by design.

## Flow Keputusan Semasa (Mei 2026) — UPDATED

**Terus Publish — tiada langkah Sahkan Rasmi berasingan:**
- Pencatat hantar → `statusKeputusan: 'diterima'`, `statusAcara: 'ada_keputusan'`
- `postRasmi()` jalan terus selepas hantar — medal tally dikemaskini serta-merta
- `ada_keputusan` = PUBLISHED (bukan draf)
- `KeputusanRasmi.jsx` telah DIPADAM — tidak digunakan lagi

**Nota:** `rasmi` / `tidak_rasmi` masih wujud dalam kod auto-rasmi timer (legacy), tapi bukan flow utama.

## Kefahaman Penuh — BIB dalam Seluruh Flow Sistem

### Prinsip Asas
- **noKP** = primary key SEBENAR untuk semua operasi kritikal (pendaftaran doc ID, medal tally, rekod, mata olahragawan)
- **noBib** = paparan & ID fizikal sahaja — digunakan sebagai slot key dalam pencatat untuk padang events
- **kodSekolah** = skop sekolah

### Kenapa noBib Selamat Merentas Sekolah
- SR (kat A/B) dan SM (kat C/D/E) TIDAK PERNAH dalam heat yang sama
- Heat dibina dari pendaftaran yang sudah ditapis mengikut kategoriKod
- Jadi semua peserta dalam satu heat = kategori sama = jenis sekolah sama = bibPrefix berbeza = noBib unik dalam heat

### Flow: Start List → Pencatat → Medal Tally

**Start List:**
- Dijana dari `pendaftaran` yang sudah ditapis ikut acara (kategoriKod sama)
- Semua peserta dalam heat = sekolah sejenis = prefix berbeza = noBib unik ✅

**Pencatat Input Keputusan:**
- Lorong/relay: slot = lorong (lane number) — noBib tidak digunakan sebagai key ✅
- Padang (lompat/balin): slot = noBib — SELAMAT kerana dalam heat padang, semua peserta kategori sama, prefix berbeza, noBib unik ✅
- mass_start: slot = giliran — noBib tidak digunakan sebagai key ✅

**Medal Tally & Rekod (postRasmi):**
- Guna `noKP` dan `kodSekolah` — bukan noBib ✅
- noBib tidak terlibat dalam pengiraan medal/rekod/mata ✅

### Syarat Sistem Kekal Selamat
1. Setiap sekolah MESTI ada bibPrefix unik dalam kalangan sekolah sejenis (SR sesama SR, SM sesama SM)
2. Admin set bibPrefix dalam SekolahSetup — tiada auto-enforce dalam sistem sekarang
3. Jika dua sekolah sejenis guna prefix sama → noBib clash dalam heat → padang events result overwrite

### Isu Masih Pending
- Tab 1 AtletModal: semak noBib dari cache sahaja, bukan live Firestore — race condition dalam sekolah sama

## Gates Status — KUAT (semua 8 live dari Firestore)
- G1: hadAcaraIndividu/Beregu dari kategori collection ✅
- G2: hadAtletPerSekolah dari acara doc — relay perlu admin set betul (cth: 4 untuk 4x100m) ✅
- G3: umurMin/umurHad dari kategori collection, WA standard ✅
- G4: jantina live check atlet vs acara ✅
- G5: 3-hop lookup sekolah→acara→kategori.jenisSekolah ✅
- G6: duplikasi check ✅
- G7: konflik jadual masa ✅
- G8: heat sudah dijana → tutup pendaftaran ✅
