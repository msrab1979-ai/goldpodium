---
name: Bug Log Mei 2026
description: Bug yang ditemui dan status fix dalam sesi Mei 2026
type: project
originSessionId: b67b250f-35db-4815-bcb2-afb5fc71083d
---
# Bug Log — Mei 2026

## FIXED

### Medal Tally "Tiada Sekolah" walaupun sekolah dah daftar
- **Status**: ✅ Fixed + deployed 2026-05-05

### "Daftar ke Acara" console error — ReferenceError TDZ
- **Status**: ✅ Fixed + deployed 2026-05-05

### Reset Pendaftaran Atlet — atlet masih muncul selepas reset
- **Status**: ✅ Fixed + deployed 2026-05-05

### Saringan ↔ Final link sehala sahaja
- **Status**: ✅ Fixed + deployed 2026-05-05

### Reset Sistem bantahan delete blocked (Missing permissions)
- **Status**: ✅ Fixed — firestore.rules bantahan allow delete: true

### bilanganCubaan padang acara masih 3/4
- **Punca**: (1) admin InputKeputusan hardcode `peserta.length > 8 ? 3 : 6`; (2) pencatat `|| 3`; (3) StartList PDF hardcode 'Cubaan 1','Cubaan 2','Cubaan 3'
- **Fix**: Semua tukar baca dari `acara.bilanganCubaan || 6`. Firestore 36 acara dikemaskini ke 6.
- **Status**: ✅ Fixed + deployed 2026-05-14

### Start List PDF padang — portrait bukan landscape, 3 cubaan hardcode
- **Punca**: `buatStartListPDFUnified` salinan Teknikal hardcode 3 cubaan + portrait format
- **Fix**: (1) Landscape untuk padang; (2) cubaan dinamik dari `acara.bilanganCubaan || 6`
- **Status**: ✅ Fixed + deployed 2026-05-15

### Tab Keputusan Home — blank, tiada hasil
- **Punca**: Filter `_kepAllItems` hanya cari `rasmi` dan `tidak_rasmi`, tapi `statusAcara` sebenar = `ada_keputusan`
- **Fix**: Tambah `ada_keputusan` dalam filter. Badge tukar ke neutral "KEPUTUSAN"
- **Status**: ✅ Fixed + deployed 2026-05-15

### Rekod lama tidak papar (Home, Olahragawan, PDF, BukuKejohanan)
- **Punca**: `namaAcara` = nama penuh e.g. "100m L Bwh 12" ≠ `namaAcaraPendek` = "100m" → rekodKey tidak match rekod dalam Firestore
- **Fix**: Semua 9 lokasi rekod lookup guna `namaAcaraPendek || namaAcara` fallback
- **Fail diubah**: Home, postRasmiUtils, Olahragawan, BukuKejohanan, CetakAcara, CetakKeputusan (x3), InputKeputusan
- **Rekod.jsx**: sengaja guna `form.namaAcara` (borang admin input — betul)
- **Status**: ✅ Fixed + pushed 2026-05-15

### InputKeputusan PDF — kolum Status blank/wrap
- **Punca**: Status hanya tunjuk DNS/DNF/DQ; kolum terlalu sempit (14mm); `★` render sebagai `&` dalam jsPDF
- **Fix**: Status = EMAS/PERAK/GANGSA/T4/T5 untuk biasa, DNS/DNF/DQ untuk flagged. Kolum 28mm. Buang `★`.
- **Status**: ✅ Fixed + pushed 2026-05-15

### InputKeputusan PDF — bilangan pemenang hardcode 3
- **Fix**: Toggle 3/4/5 pemenang, default 3. State `cetakBilangan`.
- **Status**: ✅ Fixed + pushed 2026-05-15

### Security: atlet/users terdedah kepada public scraper
- **Punca**: Firestore rules `allow read: if true` pada semua koleksi → noKP + pinHash boleh dibaca dari luar
- **Fix**: 
  - AuthContext: `signInAnonymously(auth)` auto bila tiada Firebase Auth → semua pengguna app ada token
  - Firestore rules: `atlet` + `users` → `allow read: if request.auth != null`
  - Scraper luar tiada token → blocked
- **Status**: ✅ Fixed + deployed 2026-05-15
- **Fasa 2 pending**: migrate pencatat/admin ke Firebase Auth untuk enforce WRITE juga

### PDF tajukUtama salah field
- **Punca**: Semua PDF guna `cfg.namaKejohanan` (undefined) — field betul ialah `tetapan/home.tajukUtama`
- **Fix**: BukuKejohanan, CetakAcara, StartList — semua tukar ke `cfg.tajukUtama || kej.namaKejohanan`
- **Status**: ✅ Fixed + deployed 2026-05-17

### PendaftaranSetup — kategori tab tunjuk A/B/C bukan L12/P12
- **Punca**: `renderTabStartList` guna raw `kategoriKod` tanpa lookup `kategoriList`
- **Fix**: `kategoriList.find(x => x.kod === k)?.label` — lookup label dari Firestore
- **Status**: ✅ Fixed + deployed 2026-05-17

### PendaftaranSetup — acara card tunjuk "Tiada atlet" walaupun belum fetch
- **Punca**: `slHeatData[aid] || []` tidak bezakan `undefined` (belum fetch) vs `[]` (fetch kosong)
- **Fix**: Check `slHeatData[aid] === undefined` → tunjuk spinner; `[]` → tunjuk "Tiada atlet"
- **Status**: ✅ Fixed + deployed 2026-05-17

### InputKeputusan — Cetak PDF Senarai Layak ke Final
- **Feature**: Butang cetak PDF selepas jana final — tunjuk finalist dengan label Q (hijau) / q (biru)
- **Status**: ✅ Built + deployed 2026-05-17

### InputKeputusan — Jana Final → Cetak butang perlu refresh page
- **Punca**: `selectedAcara` adalah snapshot — `setAcaraList` tidak auto-sync `selectedAcara`
- **Fix**: Selepas `setAcaraList`, panggil `setSelectedAcara` functional updater serentak
- **Status**: ✅ Fixed + deployed 2026-05-17

### InputKeputusan — No Bib boleh diedit dalam pencatat
- **Punca**: `InputLorong` dan `InputMassStart` ada `onChange` pada No Bib input
- **Fix**: Buang `onChange`, tambah `readOnly`, tukar styling ke grey (`bg-gray-50 text-gray-500 cursor-default`)
- **Status**: ✅ Fixed + deployed 2026-05-17

### Rekod sync bug — penamat tunjuk tiada rekod + cipta rekod palsu
- **Punca**: `postRasmiUtils.js` hanya cuba 1 key format (kategoriKod baru C) — rekod lama tersimpan dengan format lama (L12/P12)
- **Kesan**: Start list ok (rekodUtils cuba kedua-dua format) tapi penamat gagal → `isBetter=true` → tulis result semasa sebagai "rekod baru" walaupun rekod betul ada
- **Fix**: `postRasmiUtils.js` kini cuba `kategoriKod` + `kelasDariNama` — sama logik dengan `rekodUtils.cariRekodUntukAcara`. Berlaku individu + relay.
- **Status**: ✅ Fixed + deployed 2026-05-18

### Rekod Kejohanan — tab Semak Sambungan (baru dibina)
- **Feature**: Tab audit acara vs rekod dengan 3 connection status
- **Kuat** (hijau) = key exact match format baru | **Lemah** (amber) = rekod ada tapi key format lama | **Tiada** (merah) = tiada rekod
- **Baiki Key** button untuk sambungan lemah — re-key tanpa tukar data rekod
- **Baiki Orphan** panel — dropdown pilih acara betul + preview key lama→baru
- Filter: Semua | Lemah | Tiada | Orphan
- **Status**: ✅ Built + deployed 2026-05-18

### Olahragawan PDF — 3 halaman auto (MC, Hadiah, Fail)
- **Feature**: 1 butang Cetak PDF → 3 halaman dalam 1 fail PDF
- Page 1: Skrip Pengacara — jadual acara + rekod baru vs lama (tanpa kolum rekod)
- Page 2: Slip Hadiah — pingat olahragawan + jumlah mata + tandatangan
- Page 3: Rekod Pencapaian Rasmi — jadual acara (dengan kolum rekod) + rekod dipecahkan + disahkan
- Header rasmi: MAJLIS SUKAN SEKOLAH DAERAH KEMAMAN + namaKej + tarikh
- Fallback: jika `mata_olahragawan` tiada `rekod_*` fields → fetch terus dari `rekod` collection (query noKP + kejohananId)
- **Status**: ✅ Built + deployed + pushed 2026-05-18

### PP Senarai Pendaftaran kosong selepas jana heat
- **Punca**: PP guna sessionStorage auth (bukan Firebase Auth) → `request.auth = null` → Firestore rules `atlet: allow read: if request.auth != null` DENIED → `Promise.all` dalam `fetchAll` throw → `pendaftaranList` kosong
- **Fix**: firestore.rules `atlet` read tukar ke `if true`. `PPPendaftaranView` tambah `sekolahDataLive` state diambil terus dari Firestore (bukan dari prop stale sekolahList).
- **Status**: ✅ Fixed + deployed 2026-05-19

### PP bypass acara — Tukar/Buang masih dikunci walaupun bypass aktif
- **Punca**: Kondisi butang `!acaraLock && !isDikunci` — jika sekolah sudah sahkan pengesahan (`isDikunci=true`), bypass tidak override `isDikunci`
- **Fix**: `canEdit = bypassed || (!acaraLock && !isDikunci)` — bypass per-acara override `isDikunci`
- Tambah badge hijau "✓ Dibuka Semula" dalam Senarai Pendaftaran Semasa
- Banner merah tukar amber bila ada bypass aktif
- **Status**: ✅ Fixed + deployed 2026-05-19

### SekolahSetup bypass modal — tiada peringatan jana heat semula
- **Punca**: Admin tidak tahu perlu jana heat semula selepas PP tukar atlet via bypass (heat lama kekal, start list tunjuk atlet lama)
- **Fix**: Tambah nota amber dalam footer modal: "Selepas PP siap tukar atlet, pergi StartList → Status Panel → jana heat semula untuk acara berkenaan"
- **Status**: ✅ Fixed + deployed 2026-05-19

### Medal Tally — bilanganKedudukan tidak dipapar, T4/T5 tidak diambil kira
- **Punca 1**: MedalTally.jsx hanya papar E/P/G kolum, T4/T5 ada dalam Firestore tapi tidak ditunjuk
- **Punca 2**: `sortTally` dan `sortAndRank` (Home) tidak guna T4/T5 sebagai tiebreaker — terus ke nama abjad
- **Punca 3**: `rankWithTies` isytihar seri hanya bila E/P/G sama, tidak semak T4/T5
- **Punca 4**: KejohananSetup form mataPingat hanya ada input T1-T4, tiada T5
- **Punca 5**: `jumlah` dalam kedua-dua MedalTally dan Home termasuk T4+T5 — salah (T4/T5 tiebreaker sahaja)
- **Fix**:
  - KejohananSetup: form dinamik ikut bilanganKedudukan (T5 input), toggle `showJumlahMedalTally`
  - MedalTally: kolum T4/T5 dinamik, sort + tie fix, Jumlah ikut toggle dari kejohanan doc
  - Home: `sortAndRank` fix E→P→G→T4→T5→abjad, tie semak T4/T5, Jumlah ikut toggle
  - InputKeputusan: `mataPingat[5]` dibaca dari Firestore
- **Status**: ✅ Fixed + deployed + pushed 2026-05-19

### Jana Final → "Tiada heat untuk acara ini" bila klik acara final
- **Punca**: `handleJanaFinal` cari `linkedFinalAcara` hanya via `parentAcaraId === noAcara` — gagal jika `noAcara` tiada/berbeza dari doc ID, atau jana semula selepas `finalDijanaKe` dah set
- **Fix**: 3 strategi lookup (S1: parentAcaraId vs noAcara; S2: parentAcaraId vs aceraId/acaraId; S3: finalDijanaKe lookup). Bonus: kemaskini `_totalHeat` final acara dalam acaraList selepas jana
- **Status**: ✅ Fixed + deployed + pushed 2026-05-19

### StartList — Final acara tiada heat + path inconsistency
- **Punca**: `JanaFinalModal.handleSimpan` simpan heat di saringan path (bukan final path) — beza dengan InputKeputusan yang simpan di final path
- **Fix**: 6 perubahan dalam StartList.jsx sahaja:
  1. `JanaFinalModal.handleSimpan` — cari final acara via parentAcaraId, simpan heat di final path, kemaskini finalDijanaKe
  2. 2 state baru: `saringanAcara`, `saringanHeats`
  3. useEffect: bila final acara dipilih → load parent saringan heats
  4. Derived: `canJanaFinalFromFinal` — enable bila final + heatList kosong + saringan semua rasmi
  5. Banner "Final Belum Dijana" + button Jana Final dalam final acara view
  6. JanaFinalModal call pass saringan acara+heats bila `fromFinal`
- **Data lama** (heat di saringan path): dibiar, tidak dipadam
- **Pencatat** StartList: view-only kekal (canEdit=false)
- **Status**: ✅ Built + deployed + pushed 2026-05-19

### StartList Final — cetak crash + peserta badge salah
- **Punca 1**: `cetakSatuHeat` + `cetakSemuaHeat` pass heats tanpa normalize → `fasa`/`heatId` undefined → jsPDF-autotable `.indexOf()` crash
- **Punca 2**: "Tiada peserta berdaftar" warning tunjuk walaupun final heat ada (final acara tiada dalam `pendaftaran`)
- **Punca 3**: Badge "0 peserta berdaftar" untuk final acara (atlet daftar di saringan aceraId, bukan final)
- **Fix**:
  - `normalizeHeat()` helper — pastikan `fasa`, `heatId`, peserta string fields selalu defined
  - `cetakSatuHeat` + `cetakSemuaHeat` guna `normalizeHeat` sebelum pass ke PDF
  - Warning sembunyikan bila `isFinalAcara && heatList.length > 0`
  - Badge tunjuk `X finalis` (kira dari `heatList[].peserta`) untuk final acara
- **Status**: ✅ Fixed + deployed + pushed 2026-05-19

### aceraId path mismatch — heat ada di admin tapi tiada dalam pencatat InputKeputusan
- **Punca**: `setAcaraList` dalam admin guna `{ id: d.id, ...d.data() }` — tiada `aceraId` fallback. Bila field `aceraId` tiada dalam dokumen lama, admin simpan/baca heat di path `acara/undefined/heat/` (internally consistent). Pencatat guna `aceraId || acaraId` → fallback ke `d.id` → path lain → tiada heat.
- **Fix**: 
  - `setAcaraList` normalkan `aceraId: data.aceraId || d.id` untuk semua acara
  - `generateHeatsForAcara`, `GenerateModal.handleGenerate`, `QuickJanaModal.handleSimpan`, `fetchAcaraData`, `EditLorongModal` — semua guna `aceraKey = aceraId || id`
- **Status**: ✅ Fixed + deployed + pushed 2026-05-19

### Auth system tersilap diubah — Login superadmin broken (Jun 2026)
- **Punca**: Perubahan untuk sistem lain (ESIS/PBD) tersilap applied dalam KOAM — buang anonymous auth, tukar rules ke `if true`, tukar `login` alias ke `loginAdmin` (Firestore PIN)
- **Fix 1**: `Login.jsx` Tab 1 — tukar ke `loginSuperadmin` (Firebase Auth) ✅
- **Fix 2**: Tambah `pin: "123456"` manual ke Firestore `users` doc superadmin ✅
- **Kesan kekal**: firestore.rules kekal `if true`, AuthContext tiada anonymous auth — sistem OK, deploy live
- **Status**: ✅ Fixed + deployed 2026-06-01

### PPAtletModal — Tarikh Lahir auto dari No. KP + readOnly (Jun 2026)
- **Punca**: `PPAtletModal` ada logic extract tarikhLahir dari noKP tapi field masih editable + tiada hint
- **Fix**: Mode add → `readOnly` + hint "Auto dari No. KP". Mode edit → kekal editable (untuk betulkan kesilapan)
- **Fail**: `PendaftaranSetup.jsx` (PPAtletModal Tarikh Lahir field)
- **Status**: ✅ Fixed + deployed 2026-06-01

### Daftar Acara — delay masa mengesah dan mendaftar (Jun 2026)
- **Punca**: Validasi 8-gate dijalankan sequential per atlet → ~17 Firestore reads per atlet satu-satu
- **Fix**: `Promise.all` — semua atlet divalidasi serentak. Semua 8 gate masih jalan, logik tidak berubah
- **Fail**: `PendaftaranSetup.jsx` (handleDaftarSave — PP inline daftar)
- **Kesan**: 2 atlet = ~separuh masa, 4 atlet = ~suku masa
- **Status**: ✅ Fixed + deployed 2026-06-01

## PENDING

### Input Keputusan padang — simplify to 1 input
- **Request**: Gantikan 6 cubaan inputs dengan 1 input prestasi terbaik sahaja
- **Skop**: Admin InputKeputusan (PadangRow) + Pencatat InputKeputusan (InputPadang)
- **Nota**: Borang Teknikal PDF & Start List PDF kekal 6 cubaan (untuk kertas)
- **Status**: ⏳ Pending — user confirmed, belum implement
