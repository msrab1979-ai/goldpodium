---
name: bug-log-jun-2026
description: "Feature baru dan bug fix dalam sesi Jun 2026 — PP import daftar, gate G0, bypass pengesahan, auto-replace heat, UX InputKeputusan, format masa mm.ss.ms"
metadata: 
  node_type: memory
  type: project
  originSessionId: eff6356c-4870-482b-a838-ada5ff75c31e
---

# Bug Log & Feature — Jun 2026

## FEATURE BARU

### PP Import Excel — Daftar Acara
- **Feature**: PP boleh upload Excel untuk daftar atlet ke acara secara pukal
- **Template**: 3 kolum wajib — `noBib`, `noKP`, `noAcara` (header mesti tepat, STOP jika salah)
- **downloadTemplateDaftar()**: Sheet DAFTAR + SENARAI ACARA + PANDUAN
- **Validation**: header check dulu → 8-gate per baris → jadual SAH(hijau)/ERROR(merah)
- **Import**: SAH sahaja, download laporan error tersedia
- **noBib dalam import**: biarkan sahaja (prefix tidak divalidasi ketat), focus pada 8 gate
- **Status**: ✅ Built + deployed + pushed 2026-06-03

### Gate G0 — noBib Prefix dalam handleDaftarSave (PP Daftar Acara manual)
- **Feature**: Semak noBib atlet sebelum 8 gate sedia ada
- **3 semakan**: noBib tiada | prefix salah vs sekolah | noBib duplikat dengan atlet lain
- **Sumber**: `sekolahData.bibPrefix` dari Firestore `sekolah/{kodSekolah}`
- **Jika bibPrefix kosong**: gate dilangkau (fail-open)
- **Lokasi**: `handleDaftarSave` dalam `PPPendaftaranView`, sebelum `setDaftarSaving(true)`
- **Status**: ✅ Built + deployed + pushed 2026-06-03

### Bypass Pengesahan Fix — canEdit
- **Bug**: Admin aktif `bypassPengesahan` tapi PP masih tidak boleh tukar atlet
- **Punca**: `canEdit = bypassed || (!acaraLock && !isDikunci)` — heat lock (`acaraLock=true`) override walaupun `isDikunci=false`
- **Fix**: `const bypassSahkanAktif = sekolahData?.bypassPengesahan === true` → `canEdit = bypassSahkanAktif || bypassed || (!acaraLock && !isDikunci)`
- **Lokasi**: `renderTabDaftar` → daftarRows loop, line ~5025
- **Status**: ✅ Fixed + deployed + pushed 2026-06-03

### Auto-Replace Heat — Tukar Atlet PP
- **Feature**: Bila PP tukar atlet (bypass pengesahan), heat doc dikemaskini terus
- **Lorong**: KEKAL sama — hanya nama/noBib/noKP berubah
- **PP lain**: tidak terjejas langsung
- **Tiada jana heat semula**: admin terus cetak start list → atlet baru muncul
- **Skip**: relay (struktur berbeza) + heat status='selesai'
- **Lokasi**: `handleTukarSimpan` dalam `PPPendaftaranView`, selepas step 2 (daftar atlet baru)
- **Firestore fields reset**: keputusan=null, status='belum', cubaan=[], rankDalamHeat=null
- **Status**: ✅ Built + deployed + pushed 2026-06-03

## FIX — Sesi 9 Jun 2026 (commit 2de0e02)

### E-Sijil Sistem — Bina dari Scratch
- **Feature**: Admin setup template PNG (drag-drop 3 field: nama atlet, nama kejohanan, tarikh kejohanan), preview PDF, simpan ke `tetapan/sijil`
- **Pengurus**: Download sijil per atlet atau ZIP semua (JSZip + FileSaver)
- **Route admin**: `/dashboard/esijil` (ESijil.jsx)
- **Route PP**: `/dashboard/sijilsaya` (SijilPengurus.jsx)
- **Menu**: DashboardLayout + PengurusLayout kedua-dua ada E-Sijil
- **Sumber atlet**: `atlet` collection by `kodSekolah` (bukan hanya yang daftar acara)
- **Status**: ✅ Built + deployed

### Fix cetakByAcara — Kategori Label Salah
- **Bug**: `Kat A/B/C/D` hardcoded — sepatutnya `L12/P15` dll
- **Fix**: resolve kod lama A-H ke label dari `kategoriList`
- **Lokasi**: `PendaftaranSetup.jsx` cetakByAcara
- **Status**: ✅ Fixed

### Fix cetakByAtlet — 3 Bug
- **Bug 1**: BIB dari `atlet.noBib` (lama), sepatutnya `pRec.noBib` (pendaftaran)
- **Bug 2**: Semua atlet muncul walaupun tidak daftar acara
- **Bug 3**: `kategoriKod` dikira semula, sepatutnya guna `pRec.kategoriKod`
- **Fix**: filter atlet yang ada acaraIds, guna pRec.noBib + pRec.kategoriKod
- **Status**: ✅ Fixed

### Fix Pendaftaran Flow — 3 Bug

**B1 — handleTukarSimpan buat pendaftaran tidak lengkap**
- Bila tukar atlet dan atlet baru belum ada pendaftaran, rekod dicipta tanpa `jantina`, `tarikhLahir`, `kategoriKod`, `namaSekolah`, `isAktif`, `isRelay`
- Fix: tambah semua field dari `atletBaru` + `kiraKategori`
- Lokasi: `handleTukarSimpan` dalam `PPPendaftaranView`

**B2 — Counter noBib tidak ambil kira atlet.noBib**
- PP `handleDaftarSave` floor counter hanya dari pendaftaran — boleh clash dengan noBib manual
- Fix: gabung `pendaftaran.noBib` + `atletSekolah.noBib` untuk floor (sama seperti Tab Admin)
- Lokasi: `handleDaftarSave` dalam `PPPendaftaranView`

**B3 — PP pendaftaran baru tiada namaSekolah**
- Fix: tambah `namaSekolah: sekolahData?.namaSekolah || kodSekolah`
- Lokasi: `handleDaftarSave` Pass 2 dalam `PPPendaftaranView`

- **Status semua**: ✅ Fixed + deployed + pushed

## FIX — Sesi 13 Jun 2026 (commit ad468f5)

### Muat Turun Sijil — Menu Baru Admin
- **Feature**: Menu baru sidebar SIJIL → "Muat Turun Sijil" (superadmin + admin)
- **Tab 1 — By Sekolah**: cari sekolah (nama, bukan kod), papar senarai atlet, download ZIP
- **Tab 2 — Semua Atlet**: progress bar, download ZIP semua atlet seluruh kejohanan
- **Shared util**: `src/utils/sijilUtils.js` — `janaSijilPDF` + `namaFail` dikongsi antara SijilPengurus + MuatTurunSijil
- **Route**: `/dashboard/muaturunsijil`
- **ZIP filename**: guna `namaSekolah` (bukan `kodSekolah`)
- **Field fix**: sekolah guna `namaSekolah` bukan `nama` (field Firestore betul)
- **Status**: ✅ Built + deployed + pushed

### Fix kiraKategori — Kategori Salah (P11 dapat P10)
- **Bug**: atlet umur 10 dapat kategori M (L11) kerana sort guna `umurHad` sahaja
- **Root cause**: kategori M/N (L11/P11) ada `umurMin=0`, lebih rendah dari C/D (L10/P10)
- **Fix**: guna `label` untuk detect jantina (L/P) bukan `kod` — `lbl.startsWith('L')` / `lbl.startsWith('P')`
- **Fail**: `PendaftaranSetup.jsx` → `kiraKategori` + `KatDropdown`
- **Status**: ✅ Fixed + deployed

### Fix AnalisisPendaftaran — Double Column (LL12, L12 dua kali)
- **Bug 1**: `${a.jantina}${katLabel}` → label sudah ada L/P prefix → jadi LL12, PP10
- **Fix**: buang `${a.jantina}` prefix dari 4 lokasi
- **Bug 2**: Acara final (parentAcaraId) dimasukkan → kolum L12 muncul dua kali
- **Fix**: tambah `&& !a.parentAcaraId` filter dalam buildAnalisis + buildAnalisisBySekolah
- **Status**: ✅ Fixed + deployed

### Fix MedalTally + Home — Sekolah Nyahaktif Tersembunyi
- **Feature**: sekolah `isAktif=false` tidak muncul dalam medal tally (admin + public)
- **MedalTally.jsx**: `activeTally` filter + `sekolahMap` ada `isAktif` field
- **Home.jsx**: skip sekolah `isAktif=false` dalam step 3 + step 5
- **Status**: ✅ Fixed + deployed

### Fix SekolahSetup — Carian No BIB
- **Feature**: column search detect pattern `/^[A-Z]+\d+$/` → query `atlet where noBib == val`
- **Hasil**: green badge nama atlet, table filter ke sekolah berkenaan / red "tidak dijumpai"
- **Status**: ✅ Fixed + deployed

### Ghost Check Firestore — Keputusan (READ ONLY)
- **516 rekod pendaftaran** (buang 1 test ABC123): semua bersih
- **aceraId = docId**: 0 mismatch ✅
- **acaraIds valid**: semua 104 aceraId wujud dalam acara collection ✅
- **noBib sync**: 100% sync antara pendaftaran ↔ atlet ✅
- **noBib duplikat**: 18 kes — semua BEZA sekolah (normal, prefix berbeza) ✅
- **Semua atlet ada noBib**: 516/516 ✅
- **Isu yang dijumpai**: 23 atlet ada `kategoriKod` lama (M/N) dalam pendaftaran vs C/D dalam atlet — cosmetic sahaja, tidak affect heat assignment
- **Kesimpulan**: Selamat jana heat — tutup pendaftaran dulu baru jana

## FIX — Sesi 10 Jun 2026 (sesi ini)

### AnalisisPendaftaran — Tab 2 & 3 lengkap
- **Tab 2**: toggle Sudah/Belum Daftar, rumusan kolum = filledEvents/totalEvents, PDF A4 dua mod
- **Tab 3**: search sekolah, kat label betul (L12/P15), PDF A4
- **Tab 1**: PDF A4 tambah
- **PDF bug fix**: `import autoTable from 'jspdf-autotable'` + `autoTable(doc,{})` bukan `doc.autoTable({})`
- **Status**: ✅ Fixed + deployed

### Login.jsx — Tab 2 guna fungsi login salah
- **Bug**: loginWithKodAkses (=loginPengurus) digunakan untuk SEMUA role termasuk pencatat
- **Fix**: isPengurusPasukan → loginPengurus, lain-lain → loginPencatat
- **Status**: ✅ Fixed + deployed

### UserManagement — PIN hash + Buka Kunci
- **Fix 1**: CREATE — PIN kini di-hash via hashPin(), simpan sebagai `pinHash` (bukan plain `pin`)
- **Fix 2**: EDIT — hashPin(newPin) → `pinHash` baru + `pin = deleteField()` (buang stale hash)
- **Root cause bug lama**: edit simpan `pin` plain text TAPI tidak padam `pinHash` lama → loginPencatat guna hash comparison → gagal
- **Fix 3**: Butang "Buka Kunci" (biru) — clear `login_attempts/user_{kodAkses}` bila pengguna terkunci 30 min
- **Status**: ✅ Fixed + deployed
- **Perhatian**: Pengguna lama (sebelum fix) perlu Edit + re-enter PIN atau Reset PIN

## FIX — Sesi 14 Jun 2026 (commit 263e0a0)

### Jana Sheet Excel — Backup.jsx
- **Feature**: Tab baru "Jana Sheet Excel" — 8 tab, No BIB → VLOOKUP nama & sekolah auto dari tab PENDAFTARAN
- **KEPUTUSAN tab**: Admin isi No BIB (kolum E/H/K/N/Q), nama atlet + kod sekolah auto via VLOOKUP
- **MEDAL_TALLY**: COUNTIF kolum G/J/M (Kod Sekolah auto)
- **OLAHRAGAWAN**: COUNTIF kolum F/I/L/O (Nama Atlet auto)
- **Status**: ✅ Built + deployed + pushed

### Fix Carian Sekolah — AnalisisPendaftaran.jsx Tab Pendaftaran Sekolah
- **Bug 1**: Filter guna `s.namaSekolah` tapi objek `sekolahAda` hanya ada `{ kod, nama }` → carian gagal
- **Fix**: guna `s.nama` (betul ikut struktur sekolahAda)
- **Bug 2**: `selectedSekolah` tidak auto-tukar bila carian menapis → data sekolah lama masih papar
- **Fix**: `kodPapar` — auto-pilih sekolah pertama dalam `sekolahTapis` jika `selectedSekolah` tiada dalam tapis
- **Status**: ✅ Fixed + deployed + pushed

### Fix bibPrefix Duplikat — SekolahSetup.jsx
- **Bug**: Semakan duplikat prefix global — reject prefix sama walaupun kategori berbeza (SK vs SM)
- **Fix**: Semak duplikat dalam kategori sama sahaja — prefix `Z` boleh dipakai SK dan SM serentak
- **Status**: ✅ Fixed + deployed + pushed

### Fix PDF Analisis Sekolah — Status kolum
- **Ubah**: Status `'Lengkap'`/`'Sebahagian'` → `'Daftar'` (hijau) jika filledEvents ≥ 1, `'Belum Daftar'` (merah) jika 0
- **Kolum Daftar**: tunjuk `47 / 152` format
- **Status**: ✅ Fixed + deployed + pushed

## FIX — Sesi 21 Jun 2026

### UX InputKeputusan — Besarkan Table & Cerahkan Teks
- **Feature**: Semua 4 komponen input (InputLorong, InputMassStart, InputPadang, InputRelay) dibesarkan
- **Perubahan**: `text-sm`/`text-base` (dari `text-[10px]`/`text-[11px]`), `border-2 border-gray-300`, `py-2.5`, grid lebih lebar
- **Container**: `max-w-2xl` → `max-w-5xl` (guna lebih ruang desktop)
- **InputPadang**: susun kolum baru — No BIB | Sekolah | Nama Atlet | Jarak | Kddk | Catatan (nama penuh, tidak terpotong)
- **Bug fix**: `bilPes` tidak didefinisikan dalam InputPadang → ErrorBoundary crash. Fix: tambah `const bilPes = peserta.length`
- **Status**: ✅ Fixed + deployed

### Carian No BIB — InputKeputusan
- **Feature**: Search box atas table — taip BIB → row highlight kuning + sort ke atas
- **State**: `carianBib` — uppercase, pass sebagai prop ke semua 4 komponen
- **Semua 4 komponen**: ada sort + highlight logic
- **Status**: ✅ Built + deployed

### Format Masa Input — mm.ss.ms (Larian Sahaja)
- **Feature**: Input masa larian tukar dari number `0.00` ke text `m.ss.ms`
- **Format simpan**: saat tulen (cth `2.58.34` → simpan `178.34`)
- **Fungsi baru**: `parseMasaInput()` + `fmtMasaDisplay()` dalam InputKeputusan.jsx
- **UX**: Pencatat taip `2.58.34` → blur → sistem parse → papar `2:58.34` di bawah input sebagai pengesahan
- **Scope**: InputLorong + InputMassStart + InputRelay sahaja (InputPadang TIDAK disentuh)
- **Keserasian rekod**: `normaliseSaat` dalam postRasmiUtils handle data lama (`< 10`) — data baru (`>= 10`) terus betul
- **Risiko campur format**: Tiada — satu heat = satu format (sama ada semua data lama atau semua baru)
- **Status**: ✅ Built + deployed

### RekodModal Badge — rekod lama kosong (acara 132 & 133)
- **Bug**: Klik badge 🏆 → modal tunjuk rekod baru sahaja, rekod lama kosong
- **Punca**: Bila `t` (tuntutan) null, kod baca `r.prestasi` (rekod baru) bukan `r.prestasiLama`
- **Fix**: `const prestasiLama = t != null ? t.prestasiLama : (r?.prestasiLama != null ? Number(r.prestasiLama) : null)`
- **Lokasi**: `Home.jsx` — RekodModal section
- **Status**: ✅ Fixed + deployed

### normaliseSaat — Format mm.ss untuk rekod lama 800M
- **Bug**: Rekod 800M tersimpan sebagai `2.58` (mm.ss). Perbandingan rekod salah kerana `2.58 < 178.34` (nombor berbeza magnitud)
- **Fix**: `normaliseSaat` dalam postRasmiUtils: jika `unit === 's' && n < 10` → convert mm.ss ke saat tulen
- **Contoh**: `2.58` → minit=2, saat=58 → `178` saat
- **Status**: ✅ Fixed + deployed

### stripUndef — Firestore undefined field error
- **Bug**: `Ralat menyimpan: undefined` bila klik HANTAR
- **Punca**: `...p` spread copy field undefined dari Firestore doc
- **Fix**: `stripUndef` function sebelum `updateDoc` dalam `handleSave`
- **Status**: ✅ Fixed + deployed

## FIX — Sesi 21 Jun 2026 (commit d806d82)

### Fix Mata Olahragawan — Heat Saringan Dikira sebagai Pingat
- **Bug**: Atlet menang heat saringan (rank 1) → dapat EMAS dalam Olahragawan. Masuk final menang lagi → dapat EMAS kedua. Acara sama dikira dua kali.
- **Punca**: `postRasmiUtils.js` blok `mata_olahragawan` (line 106) tiada syarat `grantMedal` — ditulis untuk SETIAP heat termasuk saringan
- **Fix**: Tambah `grantMedal &&` pada syarat — kini sama seperti medal tally, hanya `fasa='final'` atau `fasa='terus_final'` dikira
- **Nota**: Data lama yang tersimpan semasa heat saringan masih ada. Pencatat perlu HANTAR semula pada heat final untuk override.
- **Fail**: `src/utils/postRasmiUtils.js` — 1 perkataan ditambah

### Fix Tab Kategori Olahragawan — Label Salah
- **Bug**: Tab papar `Kat A — Bwh 12` bukan `L12`
- **Punca**: `katLabel()` bina string hardcode bukan guna `info.label` dari Firestore
- **Fix**: `return info.label || \`Kat ${kod}\``
- **Fail**: `src/pages/admin/Olahragawan.jsx`

### Fix Tab Olahragawan — Atlet Pecah Rekod Tanpa Pingat Hilang dari Tab
- **Bug**: Atlet pecah rekod tapi tempat 5+ (tanpa pingat) → `jumlahMata = 0` → tidak masuk mana-mana tab kategori dalam Olahragawan
- **Punca**: `katDariData` filter hanya `jumlahMata > 0` — terlepas atlet yang ada `rekod_*` fields sahaja
- **Fix**: `filter(a => (a.jumlahMata || 0) > 0 || getRekodDetail(a).length > 0)` — sertakan atlet ada rekod walaupun tiada pingat
- **Counter tab**: dikemaskini sama — kira atlet rekod tanpa pingat
- **Fail**: `src/pages/admin/Olahragawan.jsx` — 2 baris
- **Status**: ✅ Fixed + deployed + pushed (commit 9e3e1cc)

## FIX — Sesi 22 Jun 2026 (commit 94a54fe)

### Cetak PDF Kedudukan Pingat — Home.jsx
- **Feature**: Butang "Cetak PDF" dalam header panel Kedudukan Pingat
- **Format**: Landscape A4, SR halaman pertama, SM halaman kedua
- **Table**: No | Nama Sekolah | Kod | Emas | Perak | Gangsa | Jumlah
- **Warna**: rank1=kuning, rank2=putih, rank3=oren — tiada gray gelap
- **Header**: logo kiri+kanan, nama kejohanan, garisan warna ikut jenis sekolah
- **Baris jumlah**: jumlah keseluruhan di bawah table
- **State baru**: `cetakPingatLoading`
- **Fungsi baru**: `handleCetakPingat()`
- **Fail**: `src/pages/Home.jsx`

## FIX — Sesi 22 Jun 2026 (commit caf3951)

### Fix handleTolak — Badge Rekod Tidak Hilang Selepas Tolak
- **Bug**: Admin tolak tuntutan rekod → badge 🏆 dalam heat peserta masih ada di Home
- **Punca**: `handleTolak` hanya `deleteDoc(tuntutan)` sahaja, tidak bersihkan `pecahRekod` dalam heat
- **Fix**: Tambah `await autoCleanKesanRekod(tuntutan)` selepas padam tuntutan
- **Fail**: `src/pages/admin/Rekod.jsx`

### postRasmiUtils — acaraId + heatId dalam relayData
- **Fix**: Tambah `acaraId` dan `heatId` ke `relayData` (sama seperti individu rekodData)
- **Tujuan**: `handleTolak` boleh jumpa heat dengan tepat untuk buang badge
- **Fail**: `src/utils/postRasmiUtils.js`

### CetakKeputusan — Nama Sekolah dalam PDF + Excel
- **Bug**: Kolum Sekolah tunjuk kod sekolah (TEA2035) bukan nama (SMK SULTAN ISMAIL)
- **Fix**: Load `sekolah` collection → bina `skolMap` → guna `getNamaSkol()` dalam PDF + Excel
- **Fail**: `src/pages/admin/CetakKeputusan.jsx`

### InputKeputusan — Mod Semua Peserta (v2 — carian + hantar)
- **Feature**: Toggle "☰ Semua Peserta" — semua heat dalam satu table
- **Kolum**: H | Lrg | BIB | Nama/Sekolah | Masa | Kddk | Catatan
- **Carian BIB**: box carian kuning, highlight + sort ke atas (sama seperti heat biasa)
- **Sort**: Auto by masa selepas blur input → kedudukan auto
- **Butang**: "Simpan Draf" (simpan sahaja) + "HANTAR Semua (N Heat) ▶" (simpan + diterima + postRasmi semua heat)
- **JanaFinalPanel**: muncul dalam panel mod semua bila semua heat eligible
- **Logik HANTAR**: loop setiap heat → updateDoc(diterima) → runPostRasmi — sama seperti heat biasa
- **Scope**: Larian lorong + mass_start sahaja, boleh edit sahaja
- **Fail**: `src/pages/pencatat/InputKeputusan.jsx`

### InputKeputusan — Buang Countdown Auto-Rasmi (22 Jun 2026)
- **Dibuang**: flow `tidak_rasmi` → countdown timer → auto-rasmi selepas 15 min
- **Flow baru**: HANTAR → terus `diterima` (tiada countdown, tiada auto-rasmi)
- **Deep remove**: `fmtCountdown`, `tsToMs`, `timerMenit`, `pubMs`, `countdownMs`, `autoRasmiExpired`, `isPublished`, `isBantahanDiterima`, auto-rasmi logic dalam `selectHeat`, `countdownTamat` dari listener, `publishedAt` dari handleHantar
- **Kekal**: `tidak_rasmi` dalam display badge + `janaFinalEligible` — untuk backward compat data lama
- **Fail**: `src/pages/pencatat/InputKeputusan.jsx`

### HealthCheck — Panel Bersih Badge Rekod (Imbas + Tally)
- **Feature**: Imbas → tally prestasi atlet vs rekod semasa → tunjuk SAH/TIDAK SAH
- **Tally**: `kategoriKod + jantina` sahaja (nama acara format berbeza-beza)
- **Check prestasi**: atlet larian lebih laju dari rekod → SAH, lebih lambat → TIDAK SAH
- **normaliseSaat**: handle format lama mm.ss (< 10) dan format panjang (cth 28.06)
- **Buang**: Hanya badge TIDAK SAH yang dibuang

### HealthCheck — Panel Reset Keputusan Acara
- **Feature**: Masukkan No Acara → reset semua heat → keputusan kosong, peserta kekal
- **Fields reset**: keputusan=null, rankDalamHeat=null, status='belum', pecahRekod dibuang
- **statusKeputusan**: set ke 'kosong'

### HealthCheck — Panel Pindah Peserta Antara Heat
- **Feature**: Pindah seorang peserta dari heat A ke heat B dalam acara sama
- **Input**: No Acara, No BIB, Dari Heat, Ke Heat, Lorong destinasi
- **Semak**: Lorong destinasi mesti kosong sebelum pindah
- **Format heatId**: `{acaraId}-H{noHeat}` (cth 215-H1, 215-H2)

## AUDIT DB — 22 Jun 2026

### Acara 113 & 127 — Audit Keputusan Kosong
- **Acara 113**: 100M L L12 saringan — 6 heat, 47 peserta, `statusKeputusan=diterima` semua heat
- **Punca kosong**: Hanya 8 atlet ada masa (1-2 terpantas per heat), 39 lain `keputusan=null` — pencatat masukkan separuh masa sahaja sebelum HANTAR
- **Acara 127**: 100M L L12 final — 1 heat (`final_1782051764680`), 8 finalis betul (lorong 1-8 lengkap), semua `keputusan=null`, `statusKeputusan=belum`
- **Kesimpulan**: Data tidak hilang — final 127 belum berlari / belum diinput. Saringan 113 lengkap dari segi finalis tapi masa atlet lain tidak dimasukkan.
- **Tindakan**: Tiada kod diubah — audit read-only sahaja

## FIX — Sesi 23 Jun 2026 (commit 78f47ae)

### Rekod Acara 217 — Firestore Direct Update (tiada kod diubah)
- **Isu**: Atlet S14 MUHAMMAD SYAMIR IRFFAN (noKP: 120205-06-0223) pecah rekod 110M Lari Berpagar L15 semasa saringan — rekod tidak update di Tab Rekod Kejohanan, AnalisaPingat, dan badge Home
- **Punca 1**: Rekod library dimasukkan manual dengan key salah `110M_LARI_BERPAGAR_L15_L_E_D` (ada L15 lebih) dan noKP salah `110108-11-0349`
- **Punca 2**: `pecahRekod` field tiada dalam heat 217-H2 peserta S14
- **Fix**: 3 update Firestore terus (tiada kod diubah):
  1. Cipta key betul `rekod/110M_LARI_BERPAGAR_L_E_D` dengan noKP/kodSekolah betul, prestasi 16.16s, prestasiLama 16.65s (pemegang lama: MUHAMMAD AYREEL AL TAFIEY BIN MOHD ZAMRI, SMK SULTAN ISMAIL, 2025)
  2. Patch heat `217-H2` peserta S14 → tambah `pecahRekod: "D"`
  3. Padam key salah `110M_LARI_BERPAGAR_L15_L_E_D`
- **mata_olahragawan**: `rekod_217` sudah ada dan betul — tidak disentuh
- **Nota penting**: Acara 217 adalah saringan (`fasa: 'heat'`) — `grantMedal=false` betul, tiada pingat. Rekod detection sahaja yang berlaku.
- **Status**: ✅ Done (23 Jun 2026)

### InputKeputusan — Masa Tidak Hilang Bila Klik Simpan/Hantar Tanpa Blur
- **Bug**: Pencatat taip masa → terus klik Simpan Draf/HANTAR tanpa blur → masa hilang
- **Punca**: Input guna `defaultValue` + `key={masa-lorong-${kp.keputusan}}` — React remount input bila state update → nilai dalam DOM hilang sebelum masuk state
- **Fix**: Tukar ke controlled input `value={kp._raw}` + `onChange` update `_raw` setiap keystroke → `onBlur` parse ke saat tulen + kemaskini `keputusan`
- **Field `_raw`**: String sementara dalam state sahaja — distrip oleh `stripUndef` (kini strip semua field prefix `_`) sebelum simpan ke Firestore
- **4 komponen diubah**: InputLorong, InputMassStart, InputRelay, InputSemuaPeserta
- **3 lokasi DNS/DNF/DQ**: tambah `onChange(slot, '_raw', '')` bila status set
- **initKeputusanDariPeserta + initKeputusanSemua**: tambah `_raw` init dari `fmtMasaDisplay(p.keputusan)`
- **stripUndef**: `!k.startsWith('_') && v !== undefined` — buang semua field `_` sebelum Firestore
- **Fail**: `src/pages/pencatat/InputKeputusan.jsx`
- **Status**: ✅ Fixed + deployed (23 Jun 2026)

## FIX — Sesi 25 Jun 2026 (Backup + Rules + Start List PDF + Fasa 1 Plan)

### Backup — Ralat Missing Permissions (Firestore rules tidak lengkap)
- **Bug**: Backup fail dengan `Missing or insufficient permissions` pada beberapa collection
- **Punca 1**: Collection `medal_tally_kat`, `rekod_tuntutan`, `wa_config`, `anugerah_custom`, `pengesahan` tiada dalam `firestore.rules` → Firestore deny by default
- **Punca 2**: `bantahan` guna `allow read: if isStaff()` → panggil `getRole()` → extra Firestore read → gagal dalam sessionStorage auth context
- **Fix**: Tambah semua collection yang tiada dalam rules, tukar `bantahan` read ke `if true`
- **Sub-collection baru**: `pengesahan` ditambah di bawah `kejohanan`
- **Debug method**: Per-collection try-catch dengan `addLog` untuk kenal pasti collection yang gagal
- **Commit**: `dec1f10` ✅

### Start List PDF — Format Heat 1/N (bukan Heat 1)
- **Bug**: Bila cetak satu heat sahaja (dari tombol "Cetak Heat Ini"), PDF tunjuk "HEAT 1/1" bukan "HEAT 1/6"
- **Punca**: `cetakHeatDariHari` dan `cetakSatuHeat` hantar hanya `[heat]` (1 item) ke `buatStartListPDFUnified`, menyebabkan `heats.filter(...).length = 1` sentiasa
- **Fix**: Tambah parameter `jumlahHeatTotal = null` ke `buatStartListPDFUnified`
  - `cetakHeatDariHari`: query semua heat dari Firestore, kira `jumlahHeatTotal` sebelum panggil PDF
  - `cetakSatuHeat`: guna `heatList` state yang dah ada untuk kira `jumlahHeatTotal`
- **Fail**: `src/utils/startListPdfUtils.js`, `src/pages/admin/StartList.jsx`
- **Commit**: `491261a` ✅

### bantahan — Dead Code, Ignore Selamanya
- **Penemuan**: Collection `bantahan` + flow `rasmi`/`tidak_rasmi` + `bantahanDiterima` adalah dead code
- **User confirm**: "aku x guna dah flow and logic tu"
- **Keputusan**: Kekal dalam code, JANGAN sentuh, debug, atau sebut dalam perbincangan masa depan
- **Memory**: Disimpan dalam `feedback_ignore_bantahan.md`

### Suku Akhir / Separuh Akhir — Kajian Fasa 1 + Fasa 2
- **Kajian mendalam**: 6 fail dianalisa untuk kesan semua perubahan yang diperlukan
- **Dapatan penting**:
  - `selectFinalists` + `parentAcaraId` chain: sudah handle separuh akhir → akhir ✅
  - Rekod trigger: betul — rank 1 semua fasa (termasuk suku/separuh akhir) ✅
  - `isSaringanAcara` mesti diubah: tambah `suku_akhir` + `separuh_akhir` untuk block `grantMedal`
  - `buatHeatId`: QF/SF clash — mesti disambungkan
  - WA TR20 serpentine: seeded draw untuk separuh akhir (rank 1→SA1, 2→SA2, 3→SA2, 4→SA1...)
- **Plan**: Fasa 1 (selamat, tanpa serpentine) → Fasa 2 (WA strict serpentine)
- **Memory**: Disimpan dalam `project_suku_separuh_akhir.md`

## FIX — Sesi 26 Jun 2026 (Suku/Separuh Akhir Fasa 1 + Tetapan Final)

### Fasa 1 — Suku Akhir + Separuh Akhir (commit `1e1ff99`)
- **AcaraSetup**: dropdown + modal tambah `suku_akhir`/`separuh_akhir`, `adaHeat=true`, badge teal/indigo, filter bar, `getPeringkat()` dikemaskini
- **InputKeputusan**: `isSaringanAcara` + `isSaringanLocal` + `janaFinalEligible` — tambah suku_akhir/separuh_akhir → `grantMedal=false` untuk kedua-dua
- **StartList**: `FASA_LABEL` + `FasaBadge` + `buatHeatId` (QF/SF) + `fasaStr` dalam 4 PDF fungsi
- **startListPdfUtils**: fasaStr "SUKU AKHIR 1/3" / "SEPARUH AKHIR 1/2"
- **BukuKejohanan**: heatLabel dalam PDF keputusan

### UX Tetapan Final — Card Layout (commit `898ca76`)
- **Tukar**: Table 7 kolum → card per acara dengan 2 bahagian jelas
- **Kotak ungu**: "Saringan / SF → Akhir" — BH + BT + kiraan = Final
- **Kotak teal**: "Suku Akhir → Separuh Akhir" — hanya muncul bila acara ada `peringkat:'suku_akhir'`
- **Nota**: Kotak teal tidak muncul untuk KOAM 2026 — betul, tiada acara suku akhir lagi

### Tetapan Final Suku Akhir + Fix B3/B4 (commit `9109bf0`)
- **KategoriSetup**: kolum baru `BH→SF` + `BT→SF` (teal) hanya untuk acara `suku_akhir`, state `sukuOv` berasingan, simpan ke `sukuKeSeparuhByAcara`, `setDoc merge:true` (fix overwrite risiko)
- **finalistUtils**: `getFinalistSetup` + `selectFinalists` terima param `fasa` — `'sukuKeSeparuh'` baca `sukuKeSeparuhByAcara`, `'toFinal'` kekal `overrideByAcara`
- **StartList JanaFinalModal**: detect `peringkat === 'suku_akhir'` → `fasaJana='sukuKeSeparuh'` → baca sifir betul (B4) + jana heat `fasa:'heat'` bukan `fasa:'final'` (B3)
- **Data lama**: zero sentuh ✅

## FIX — Sesi 25 Jun 2026 (Gate 3, Start List, Analytics, Security)

### Gate 3 Kelayakan Umur — By Tarikh (cut-off 2 Januari MSSM)
- **Sebelum**: Semak `tahunLahir` sahaja (by tahun)
- **Selepas**: Semak tarikh penuh — `tLahir >= 2 Jan (tKej-umurHad)` dan `tLahir < 1 Jan (tKej-umurMin+1)`
- **Standard**: MSSM cut-off 2 Januari — atlet lahir 1 Jan dikira TERLALU TUA
- **Data Firestore**: ZERO sentuh — `umurHad`/`umurMin` kekal integer
- **Label display**: KategoriSetup + ManualPendaftaran kini tunjuk `2 Jan 2014 – 31 Dis 2016`
- **Fail**: `validasiPendaftaran.js`, `KategoriSetup.jsx`, `ManualPendaftaran.jsx`
- **Status**: ✅ Fixed + deployed (25 Jun 2026)

### Start List PDF — Format Heat 1/3
- **Sebelum**: `"HEAT 1"` sahaja
- **Selepas**: `"HEAT 1/3"` (heat semasa / jumlah heat saringan)
- **Final + Saringan**: kekal `"FINAL"` / `"SARINGAN"` — tidak terjejas
- **Fail**: `src/utils/startListPdfUtils.js`
- **Status**: ✅ Fixed + deployed (25 Jun 2026)

### Google Analytics — Pasang GA
- **measurementId**: `G-PRD3GWTZZG`
- **Cara**: `isSupported().then()` — hanya aktif dalam browser, selamat SSR
- **Fail**: `src/firebase/config.js`, `.env.local`
- **Status**: ✅ Deployed (25 Jun 2026)

### Security — Kunci `tetapan` collection
- **Sebelum**: `allow write: if true`
- **Selepas**: `allow write: if isAdminOrAbove()`
- **Semak**: Semua writer ke `tetapan` adalah halaman admin (ada Firebase Auth) ✅
- **Status**: ✅ Firestore rules deployed (25 Jun 2026)

## FIX — Sesi 26 Jun 2026 (Ghost Run Sweep — suku_akhir bugs)

### Bug #1 — janaFinalEligible panel Jana Final muncul untuk suku/separuh akhir (InputKeputusan)
- Pencatat HANTAR heat suku akhir → panel "Jana Final ▶" muncul → keliru
- Fix: `janaFinalEligible` exclude `suku_akhir`/`separuh_akhir` → tambah `selesaiTanpaJana` → kotak teal "Semua Heat Selesai — Admin jana dalam Start List"
- Fail: `InputKeputusan.jsx`

### Bug #2 — selectFinalists guna sifir salah (4 lokasi, InputKeputusan)
- `finalisBibs`, `finalisQMap`, `cetakQMap`, `handleJanaFinal` panggil `_selectFinalists` tanpa `fasa` param
- Untuk suku_akhir: baca `overrideByAcara` (salah) bukan `sukuKeSeparuhByAcara`
- Badge Q/q dalam panel pencatat silap; cetakQMap dalam PDF silap
- Fix: semua 4 lokasi pass `fasa='sukuKeSeparuh'` bila `peringkat === 'suku_akhir'`
- Fail: `InputKeputusan.jsx`

### Bug #3 — cetakAcaraDariHari fasaStr tertinggal (StartList tab Hari)
- Fungsi cetak PDF dari tab Hari: `fasaStr` tiada case `suku_akhir`/`separuh_akhir` → PDF cetak `HEAT undefined`
- Fix: tambah kedua-dua case, selaras dengan 3 fungsi PDF lain
- Fail: `StartList.jsx`

### Bug #4 — isSaringanAcara Home.jsx silap
- `isSaringanAcara` check `p.includes('saringan')` sahaja → suku_akhir/separuh_akhir dianggap acara final
- Kesan: kolum Q/q tidak muncul dalam paparan Home untuk acara suku/separuh akhir
- Fix: `['saringan', 'suku_akhir', 'separuh_akhir'].includes(p)`
- Fail: `Home.jsx`

### Bug #5 — finalExists silap untuk suku_akhir (KRITIKAL, StartList)
- SF dijana dengan `fasa:'heat'` (Fix B3) → `finalExists = heatList.some(h => h.fasa === 'final')` sentiasa false
- Kesan: butang "Jana SF" muncul semula selepas SF dijana → boleh overwrite heat SF
- Fix: untuk suku_akhir, guna `!!selectedAcara.finalDijanaKe` sebagai flag
- Fail: `StartList.jsx`

### Bug #6 — allHeatRasmi tidak terima 'diterima' (StartList)
- Flow baru guna `statusKeputusan:'diterima'` — tapi `allHeatRasmi` check `=== 'rasmi'` sahaja
- Kesan: butang Jana SF/Final tidak muncul walaupun semua heat dah HANTAR
- Fix: `['rasmi', 'diterima'].includes(h.statusKeputusan)`
- Fail: `StartList.jsx`

### Bug #7 — Label modal "Jana Heat Final" untuk suku_akhir (StartList JanaFinalModal)
- Header, bilangan atlet, butang Cipta semua tulis "Final" bila sepatutnya "Separuh Akhir"
- Gate info check `overrideByAcara` untuk suku_akhir (patut `sukuKeSeparuhByAcara`)
- Fix: conditional render ikut `fasaJana === 'sukuKeSeparuh'`
- Fail: `StartList.jsx`

### Bug #8 — peringkatBadge PendaftaranSetup silap (TabPP)
- `suku_akhir`/`separuh_akhir` masuk else branch → badge "Terus Final" (salah)
- Dropdown label juga kosong untuk kedua-dua peringkat baru
- Fix: tambah case eksplisit — badge teal (suku_akhir), indigo (separuh_akhir)
- Fail: `PendaftaranSetup.jsx`

### Rekod trigger — CONFIRMED BETUL
- `postRasmiUtils` rekod detection tidak bergantung pada `grantMedal`
- Rank 1 dalam heat suku_akhir → rekod tuntutan ditulis jika lebih pantas
- Badge RBK muncul dalam Home → admin sahkan dalam tab Tuntutan
- Tiada kod diubah — sudah betul dari mula

## FIX — Sesi 26 Jun 2026 (Ghost Run Separuh Akhir — 2 bug baru)

### Bug #9 — sarAllRasmi tidak terima 'diterima' (StartList, commit `3e3d13e`)
- `canJanaFinalFromFinal` (admin view acara akhir, parentAcaraId = separuh_akhir) — butang Jana Final tidak muncul walaupun semua heat SF dah HANTAR
- Punca: `sarAllRasmi` check `=== 'rasmi'` sahaja, bukan `'diterima'`
- Fix: `sarPhaseHeats.every(h => ['rasmi', 'diterima'].includes(h.statusKeputusan))`
- Fail: `StartList.jsx` line 2849-2850

### Bug #10 — finalExists silap untuk separuh_akhir (StartList, commit `85df169`)
- Selepas Jana Final dari acara SF, butang "Jana Final" masih muncul dalam acara separuh_akhir
- Punca: SF menyimpan heat akhir dalam acara akhir (bukan dalam SF doc) → `heatList.some(h => h.fasa === 'final')` sentiasa false untuk SF
- sama konsep seperti Bug #5 (suku_akhir) — `finalDijanaKe` ditulis ke separuh_akhir doc tapi tidak disemak
- Fix: extend `finalExists` guna `finalDijanaKe` untuk kedua-dua `suku_akhir` + `separuh_akhir`:
  ```js
  const isSeparuhAkhirAcara = selectedAcara?.peringkat === 'separuh_akhir'
  const finalExists = (isSukuAkhirAcara || isSeparuhAkhirAcara)
    ? !!(selectedAcara?.finalDijanaKe)
    : heatList.some(h => h.fasa === 'final')
  ```
- Fail: `StartList.jsx`

### Ghost Run Separuh Akhir — Semua Gate Confirmed
Flow pengurus daftar → StartList jana heat SF → pencatat input masa → admin jana Final:
- `isSaringanAcara` untuk separuh_akhir: betul (`grantMedal=false`) ✓
- `selesaiTanpaJana` dalam InputKeputusan: muncul bila semua heat SF selesai ✓
- `janaFinalEligible`: false untuk separuh_akhir ✓
- `canJanaFinalFromFinal` (Bug #9 fix): gate betul ✓
- JanaFinalModal `fromFinal=true`: acara = saringanAcara (separuh_akhir), `fasaJana='toFinal'`, `fasaHeat='final'` ✓
- `targetAcara`: cari acara akhir via `parentAcaraId` ✓
- `selectFinalists` dengan `fasa='toFinal'`: baca `overrideByAcara` ✓
- `finalDijanaKe` ditulis ke separuh_akhir (Bug #10 fix): butang Jana Final hilang ✓
- Heat akhir `fasa:'final'`, `grantMedal=true`: medal + mata olahragawan ditulis ✓
- Rekod trigger: fires untuk rank 1 (tidak bergantung grantMedal) ✓

## Ghost Run — Sesi 26 Jun 2026 (Terus Akhir + Relay — BERSIH)

### Terus Akhir (peringkat='akhir', tiada parentAcaraId)
- Heat dijana `fasa:'final'` (bukan 'terus_final' — 'terus_final' adalah label logic sahaja)
- `isSaringanAcara = false` → `grantMedal = true` ✓
- postRasmi: medal + mata_olahragawan + rekod — semua betul ✓
- `janaFinalEligible = false` (peringkat bukan 'saringan') → tiada butang Jana Final ✓
- **BERSIH — tiada bug**

### Relay Saringan → Final
- Jana heat: `fasa:'heat'` (atau 'final' jika terus_final, tapi relay saringan pasti 'heat')
- InputKeputusan relay saringan: `isSaringanAcara = true` → `grantMedal = false` ✓ tiada medal
- JanaFinalModal relay: `fasaJana = 'toFinal'`, `isRelay = true`, skip auto-register pendaftaran ✓
- postRasmi relay final: `grantMedal = true`, `!isRelay` → skip mata_olahragawan ✓, medal_tally ditulis ✓, rekod relay fires (`isRelay && rank === 1`) ✓
- **BERSIH — tiada bug**

### Relay Terus Final (peringkat='akhir', satu heat)
- Heat `fasa:'final'` → `grantMedal = true` → medal_tally ditulis ✓, rekod relay fires ✓
- **BERSIH — tiada bug**

### Ringkasan Semua 5 Flow (Ghost Run Lengkap)
| Flow | grantMedal | medal_tally | mata_olah | rekod |
|---|---|---|---|---|
| Terus akhir larian/padang | true | ✓ | ✓ | ✓ |
| Terus akhir relay | true | ✓ | skip (isRelay) | ✓ relay |
| Relay saringan heat | false | skip | skip | ✓ fires |
| Relay final | true | ✓ | skip (isRelay) | ✓ relay |
| Saringan → Akhir | false→true | ✓ akhir sahaja | ✓ akhir sahaja | ✓ semua fasa |
| Suku Akhir → SF → Akhir | false→false→true | ✓ akhir sahaja | ✓ akhir sahaja | ✓ semua fasa |

## PENDING

### KIV — Semak Kiraan Umur Standard MSSM (14 Jun 2026)
- **Isu**: Sistem sekarang kira umur = `tahunKejohanan - tahunLahir` (tahun sahaja)
- **Belum disahkan**: Standard MSSM kira umur pada tarikh apa? (31 Dis? Tarikh acara? Tahun sahaja?)
- **Contoh test**: Murid lahir 1.1.2013, kejohanan 2026 → sistem kira 13 tahun (P13/L13) — betul atau salah?
- **KIV**: Semak standard MSSM dengan user, kemudian update gate3_kelayakanUmur jika perlu
- **Fail**: `src/utils/validasiPendaftaran.js` → `gate3_kelayakanUmur()` line ~190

### KIV — Kategori Overwrite by Acara (14 Jun 2026)
- **Isu**: Murid P10 boleh masuk acara P11/P12 JIKA acara itu tidak ditawarkan dalam P10
- **Logik**: Semak nama acara sama dalam kategori murid — jika tiada → benarkan naik kategori
- **Cadangan**: Field baru dalam acara `kategoriDibenar[]` — admin set senarai kategori lain yang boleh masuk
- **Gate baru**: Semak `kategoriDibenar[]` sebelum reject Gate 3 (kelayakan umur)
- **Siapa boleh daftar**: PP sahaja
- **KIV**: Bina bila user minta — "tukar kategori by acara, update semula"

### Relay auto-replace heat
- Struktur relay berbeza (ahliPasukan array dalam pasukan) — belum dibina
- Skip untuk sekarang, admin kena jana heat semula untuk relay

### CetakKeputusan canJanaFinal
- Masih guna `statusKeputusan === 'rasmi'` — perlu update ke `'diterima'`

## FIX — Sesi 15 Jun 2026

### Slot Khas (jadual_khas) — AcaraSetup + Home + PDF
- **Feature**: Slot bukan-acara dalam jadual: Perasmian Pembukaan, Perasmian Penutup, Rehearsal, Majlis Hadiah, Rehat, Waktu Solat, Lain-lain
- **Firestore**: `jadual_khas/{id}` collection — field: `kejohananId`, `tarikhAcara`, `masa`, `perkara`, `jenis`
- **AcaraSetup.jsx**: Tab baru "Slot Khas" — CRUD per hari, `JENIS_SLOT` constant 7 jenis statik
- **Home.jsx — loadJadualData**: Langkah 4 load `jadual_khas` dan inject item dengan `_slotKhas` marker, `acara=null`
- **Home.jsx — jadual render**: Row khas dengan warna ikut jenis sebelum `AcaraTableRow`
- **Home.jsx — `_allJadualItems`**: `.filter(item => !item._slotKhas)` untuk keputusan/PDF/filter
- **Bug 1**: Home crash `Cannot read properties of null (reading 'statusAcara')` — fix: filter `_slotKhas` dari `_allJadualItems`
- **Bug 2**: PDF cetak jadual crash `Cannot read properties of null (reading 'noAcara')` — fix: check `item._slotKhas` dulu dalam `tableBody` map, render row `[ Majlis Hadiah ] Perkara...` dengan `didParseCell` warna kuning
- **Firestore rules**: tambah `jadual_khas` collection, deployed
- **Status**: ✅ Built + deployed

### TetapanFinal — Rewrite Penuh (Per Acara Sahaja)
- **Sebelum**: Default per kategori (larian/relay/padang) + override per acara
- **Selepas**: HANYA per acara — BH/BT input terus, tiada butang aktif, tiada default per kategori
- **Sifir rujukan**: 1 heat→BH=8/BT=0, 2→3/2, 3→2/2, 4→1/4, 5→1/3, 6→1/2
- **Component baru**: `SifirRujukan({ heatAcara, bh, bt })` — 6-row table, highlight matching row
- **Filter**: per kategori, collapsible per-kat, warnCount + ovCount badges
- **Table Master Sifir**: di bahagian atas TetapanFinal
- **Simpan**: hanya `overrideByAcara` ke Firestore `tetapan/finalSetup`
- **Status**: ✅ Built + deployed

### Semakan Per Acara — Read Override (bukan default)
- **Bug**: Tunjuk ⚠ walaupun override BH/BT betul — punca: guna default kategori bukan override
- **Fix**: `overrides[a.id]?.bestHeat` dulu sebelum fallback ke default kategori
- **Status**: ✅ Fixed + deployed

## FIX — Sesi 22 Jun 2026 (commit 7646960)

### Rekod.jsx — Tab Rekod Kejohanan (rebuild)
- **Bug**: Tab tunjuk data sekejap lepas refresh lepas tu hilang (race condition)
- **Punca**: `rekodKejList` diload dalam `load()` — dipanggil semula reset ke `[]`
- **Fix**: Pisahkan ke `useEffect([aktifKejId])` berasingan dengan `cancelled` cleanup
- **Fail**: `src/pages/admin/Rekod.jsx`

### Rekod.jsx — Fix load() query Firestore index error
- **Bug**: Page fail load — semua data kosong, button tidak respond
- **Punca**: `orderBy('updatedAt', 'desc')` pada `rekod` collection + `orderBy('kategoriKod')` pada acara subcollection — Firestore index belum dibina → query rejected → `Promise.allSettled` fulfilled kosong
- **Fix**: Buang `orderBy` dari Firestore query, sort dalam JS selepas fetch
- **Fail**: `src/pages/admin/Rekod.jsx` — `load()` function

### Rekod.jsx — Buang panel standalone Rekod Dipecah
- **Bug**: Panel standalone `showRekodKej=true` by default — mendominasi page, tab hilang dari view
- **Fix**: Buang keseluruhan panel standalone, data kekal dalam tab "Rekod Kejohanan" sahaja
- **Fail**: `src/pages/admin/Rekod.jsx`

### Rekod.jsx — Cetak PDF tab Rekod Kejohanan
- **Feature**: Butang "Cetak PDF" dalam header info bar tab Rekod Kejohanan
- **Format**: A4 portrait, grouped by kategori (header biru), 8 kolum
- **Kolum**: Nama Acara | Jan. | Atlet Baru | Sekolah | Prestasi Baru | Prestasi Lama | Pemegang Lama | Tahun
- **Fail**: `src/pages/admin/Rekod.jsx` — `handleCetakRekodKej()`

### Rekod.jsx — Audit Rekod Tertinggal
- **Feature**: Panel "Semak Rekod Tertinggal" dalam tab Rekod Kejohanan
- **Logic**: Imbas heat `diterima` → bandingkan prestasi vs rekod library → kesan peserta yang patut pecah rekod tapi tiada `rekod_` field dalam `mata_olahragawan` DAN tiada tuntutan
- **Output**: Jadual merah — Nama Acara | Kat | Jan | Atlet | Prestasi | Status (rekod ada tapi tuntutan tiada / rekod baru tiada dalam library)
- **Fail**: `src/pages/admin/Rekod.jsx` — `handleAuditRekod()`

### AnalisaPingat.jsx — Modul baru
- **Feature**: Senarai atlet + pingat by kategori, data dari `mata_olahragawan`
- **Rekod**: Baca `rekod_` fields dari `mata_olahragawan` (bukan `rekod/_tuntutan`)
- **Cetak PDF**: A4 landscape, semua kategori, kolum: # | Nama Atlet | Sekolah | Emas | Perak | Gangsa | Mata | Rekod Dipecah
- **Route**: `/dashboard/analisapingat`
- **Fail**: `src/pages/admin/AnalisaPingat.jsx` (baru), `src/App.jsx`, `src/components/layout/DashboardLayout.jsx`

## FIX — Sesi 22 Jun 2026 (commit 44d59bc)

### AnalisaPingat.jsx — Panel Audit Dual (Medal + Rekod)
- **Feature**: Panel Audit dalam AnalisaPingat — semak konsistensi medal DAN rekod serentak
- **Audit 1 — Medal berbeza**: Bandingkan `pingat_emas/perak/gangsa` dalam Firestore vs dikira semula dari heat final — tunjuk beza jika tidak sama
- **Audit 2 — Rekod stale**: Baca `rekod_` fields dari `mata_olahragawan`, bandingkan `rKey` vs rekod library aktif — kesan fields yang sudah lapuk (rekod dah bertukar tapi field tidak dipadam)
- **Audit 3 — Rekod pending**: Tuntutan dalam `rekod` collection masih belum disahkan
- **Fix rKey false stale**: Guna `val.namaAcaraPendek || val.namaAcara` (sebelum: `val.namaAcara` sahaja → 26 false positives kerana nama penuh cth "100m L L12" ≠ kunci "100m")
- **Fail**: `src/pages/admin/AnalisaPingat.jsx`

### AnalisaPingat — Tab Atlet Terbaik Dinamik + Cetak PDF 3 Salinan (commit 1cac6b0)
- **Feature**: Tab baru "Atlet Terbaik" (paling kanan) — admin cipta tajuk bebas (cth: Atlet Terbaik L12)
- **Simpan**: Firestore `tetapan/atletTerbaik` → kekal lepas refresh
- **Pilih atlet**: Butang per tajuk di hujung kanan setiap row table kategori → confirm modal jika ganti
- **Preview**: Tab Atlet Terbaik tunjuk semua tajuk bertingkat — table format Nama|Sekolah|Pingat&Acara|Rekod
- **PDF**: Landscape 3 salinan (JURUHEBAH/HADIAH/PENGURUS PESERTA), header standard nama kejohanan
- **Format kolum**: Pingat text (Emas(1):100M), Rekod senarai bernombor dengan prestasi baru/lama+nama lama
- **Fail**: `src/pages/admin/AnalisaPingat.jsx`

### AnalisaPingat — Nama Acara Terus Display dalam Kolum Pingat (commit f585a58)
- **Feature**: Bawah nombor pingat (🥇/🥈/🥉), nama acara ditunjuk terus — tiada hover
- **Contoh**: Kolum Emas tunjuk `2` dan bawahnya `100M` + `Lompat Jauh`
- **Data**: Semasa `load()` loop heat final, `acaraPingat: {1:[],2:[],3:[]}` dikumpul bersama `pingat`
- **Fail**: `src/pages/admin/AnalisaPingat.jsx`

### Fix L12 Hilang — fasa=null dalam heat acara final
- **Bug**: Kategori L12 tidak muncul dalam AnalisaPingat — heat final larian L12 ada peserta `diterima` tapi tidak dikira
- **Punca**: Heat docs untuk acara final larian (acara 231 dll.) ada `fasa=null` — `FASA_FINAL.includes(null)=false` → semua peserta dalam heat ini diskip
- **Fix A (kod)**: Tambah `isFinalAcara = !!ad.parentAcaraId` → `fasaOk = FASA_FINAL.includes(hd.fasa) || (isFinalAcara && hd.fasa == null)` — terima heat dari acara final walaupun fasa null
- **Fix B (data)**: Patch Firestore `kejohanan/KOAM-2026-WBRC/acara/231/heat/final_1782098957160` → set `fasa='final'` via REST PATCH
- **Fail kod**: `src/pages/admin/AnalisaPingat.jsx` — `handleAudit()` + seksyen medal loading

## FIX — Sesi 23 Jun 2026 (Firestore direct, tiada kod diubah)

### Fix mata_olahragawan — Stale Saringan Pingat (Faris, TBA2013)
- **Bug**: MUHAMMAD FARIS ZULHUSNI (TBA2013) ada `pingat_emas=2`, `jumlahMata=10` — sepatutnya 1 dan 5
- **Punca**: `acaraDetail_113` (saringan heat 100M L L12) tersimpan `pingat=emas` — bug lama sebelum 21 Jun fix
- **Fix**: 3 field dalam `mata_olahragawan/140415-11-0215_KOAM-2026-WBRC`:
  1. `acaraDetail_113` → PADAM
  2. `pingat_emas`: 2 → 1
  3. `jumlahMata`: 10 → 5
- **Skrip**: `fix-faris-mata.cjs`
- **Status**: ✅ Done (23 Jun 2026)

### Fix medal_tally — Stale Contrib (3 sekolah)
- **Punca**: Bug saringan lama — contrib dengan heatId `1782051764680` + `1782011521952` tersimpan dari heat saringan sebagai pingat
- **Pattern stale**: noKP sama ada 2 contrib berbeza heatId dalam 1 sekolah

**TBA2013 SK Kijal:**
- `contrib_final_1782051764680_140415-11-0215` (emas stale Faris) → PADAM
- `emas`: 4→3, `jumlahPingat`: 9→8, `kat_A_L_emas`: 3→2
- Skrip: `fix-kijal-tally.cjs` ✅

**TBA2009 SK Ayer Puteh:**
- `contrib_final_1782051764680_140623-11-0607` (gangsa stale Izzat) → PADAM
- `gangsa`: 2→1, `jumlahPingat`: 3→2
- Skrip: `fix-ayer-puteh-tally.cjs` ✅

**TBA2044 SK Seri Iman:**
- `contrib_final_1782051764680_141121-11-0695` (perak stale) → PADAM
- `contrib_final_1782011521952_160111-11-0468` (emas stale) → PADAM
- `emas`: 2→1, `perak`: 5→4, `jumlahPingat`: 15→13
- Skrip: `fix-seri-iman-tally.cjs` ✅

### Audit SR Medal Tally — Skrip Dibina
- **audit-saringan-pingat.cjs**: Cari `acaraDetail_` dengan `pingat` field dalam `mata_olahragawan` — 226 doc disemak, bersih ✅
- **audit-tally-sr.cjs**: Cross-check `mata_olahragawan` vs `medal_tally contrib` untuk SR (kat A/B/C/D/K/L/M/N) — tapis relay + SM — **kejohanan masih berjalan**, beza MA>Contrib adalah normal
- **Nota**: Semak semula selepas SEMUA acara selesai untuk audit penuh

## FIX — Sesi 23 Jun 2026 (Firestore direct, lanjutan)

### Fix mata_olahragawan + medal_tally — NUR ATIQA ZAHRA (TBA2044 SK Seri Iman)
- **Bug**: `pingat_emas=3`, `jumlahMata=15` — sepatutnya 2 dan 10
- **Punca**: `acaraDetail_108` (saringan 100M P P10) tersimpan `pingat=emas` — stale dari bug lama
- **Punca 2**: `emas` counter dalam medal_tally TBA2044 = 1 selepas fix stale, tapi NUR ATIQA menang 2 final (acara 122 + 232) → counter under-count
- **Fix mata_olahragawan** (`160111-11-0468_KOAM-2026-WBRC`):
  1. `acaraDetail_108` → PADAM
  2. `pingat_emas`: 3 → 2
  3. `jumlahMata`: 15 → 10
- **Fix medal_tally** (`TBA2044_KOAM-2026-WBRC`):
  1. `emas`: 1 → 2 (NUR ATIQA 2 final menang: acara 122 + 232)
  2. `jumlahPingat`: 13 → 14
  3. `kat_D_P_emas`: kekal 2 (sudah betul)
- **Skrip**: `fix-seri-iman-atiqa.cjs` ✅
- **Status final TBA2044**: E=2 P=4 G=2 jumlah=14 ✅

## FIX — Sesi 23 Jun 2026 (Home.jsx expand medal tally)

### Medal Tally Expand — Nama Acara Per Kategori
- **Feature**: Klik nama sekolah dalam Kedudukan Pingat → expand → tunjuk nama acara yang dimenangi per kategori
- **State baru**: `acaraSekolahCache` (kodSekolah → map) + `acaraSekolahLoading`
- **Fungsi**: `loadAcaraSekolah(kodSekolah)` — baca contrib_ fields (ground truth kat/jan/pingat) + getDoc mata_olahragawan per noKP untuk namaAcara
- **Display**: Bawah nombor E/P/G dalam expand row, nama acara pendek dalam teks kecil
- **Relay**: Skip dalam loadAcaraSekolah (noKP=null) — relay row tunjuk bilangan sahaja
- **Bug fix**: Awal guna `data.kategoriKod` (kat atlet) → salah. Fix: guna contrib_ sebagai ground truth untuk kat+jan+pingat
- **Fail**: `src/pages/Home.jsx`

## FIX — Sesi 23 Jun 2026 (PWA + button refresh + start list semua acara)

### Panduan Install PWA — Modal + Button "Pasang App"
- **Feature**: Button "Pasang App" bersebelahan "Kemaskini" dalam panel jadual
- **Modal**: Panduan langkah demi langkah — Android (Chrome) + iOS (Safari)
- **Android**: 4 langkah, nombor biru #003399
- **iOS**: 4 langkah, nombor merah #cc0001
- **Logo icon**: background biru #003399 ditambah via Python Pillow — iOS tidak lagi tunjuk kotak putih
- **Fail**: `src/pages/Home.jsx`

### PWA — Install pada Homescreen
- **Feature**: App boleh install pada homescreen Android + iOS
- **Fail baru**: `public/manifest.json`, `public/logo.png` (2048x2048), `public/logo192.png`, `public/logo512.png`
- **index.html**: tambah `<link rel="manifest">`, `apple-touch-icon`, `theme-color`, `apple-mobile-web-app-*`
- **Nama app**: "Olahraga Kemaman", theme `#003399`
- **Scope**: homescreen install sahaja — tiada service worker, tiada offline cache
- **Android**: Chrome → menu ⋮ → Add to Home Screen
- **iOS**: Safari → Share → Add to Home Screen

### Button Refresh — Header Home
- **Feature**: Button 🔄 dalam header Home (sebelah gear icon)
- **Fungsi**: `window.location.reload()`
- **Tujuan**: Guna untuk PWA (tiada browser bar) + user mudah refresh
- **Fail**: `src/pages/Home.jsx`

### Start List — Semua Acara (saringan + final + padang)
- **Update**: Dari final sahaja → semua acara (buang syarat `isFinalAcara`)
- **Heat berasingan**: "Heat 1", "Heat 2" dll — bukan gabungan
- **Padang**: guna field `giliran` (bukan `lorong`)
- **Label**: "📋 Start List Heat 1" — tiada teks "belum mula"
- **Fail**: `src/pages/Home.jsx`

## FIX — Sesi 23 Jun 2026 (Home.jsx start list final)

### Start List Final — Home Expand Acara
- **Feature**: Acara final (ada `parentAcaraId`) belum berlari → tunjuk start list peserta
- **Trigger**: `heatsWithResult.length === 0` + `isFinalAcara=true` + heat ada `peserta[]`
- **Display**: Sort ikut lorong, kolum Lrg | BIB | Nama Atlet / Sekolah
- **Relay**: Lrg | Nama Sekolah (guna `sekolahMap[kodSekolah]` — string terus, bukan `.namaSekolah`)
- **Effect bila keputusan ada**: start list hilang auto, keputusan papar seperti biasa
- **Saringan**: KIV — skip (return null)
- **Fail**: `src/pages/Home.jsx` — dalam `KeputusanExpanded`, blok `heatsWithResult.length === 0`

## FIX — Sesi 23 Jun 2026 (AnalisaPingat PDF — buang semua warna)

### AnalisaPingat PDF — Hitam Putih Sepenuhnya
- **Bug**: Header biru gelap + teks putih/kuning dalam semua PDF cetak
- **Fix**: Buang semua `fillColor` biru + `setFillColor(0,51,153)` → putih/tiada
- **Scope**: 3 fungsi PDF — Analisa Pingat, Atlet Terbaik (drawPageHeader + buildTajukTable)
- **Termasuk**: header rect biru, headStyles table, alternateRowStyles, jumlah row, label SALINAN
- **Fail**: `src/pages/admin/AnalisaPingat.jsx`

## FIX — Sesi 23 Jun 2026 (HealthCheck — Baiki Rekod)

### HealthCheck — Panel Baiki Rekod (Baru)
- **Feature**: Panel baharu teal dalam `/dashboard/healthcheck` — baiki rekod yang salah semasa kejohanan
- **Flow**: Masuk No Acara → cari rekod (match by namaAcara+kategoriKod+jantina) → pilih rekod → form edit → pratonton Before/After → simpan/padam
- **Arkib automatik**: Setiap perubahan arkibkan rekod lama ke `rekod_sejarah` dengan `sebab: 'baiki_rekod_healthcheck'` sebelum simpan
- **Field yang boleh diubah**: prestasi, prestasiLama, namaAtlet, noKP, kodSekolah, namaSekolah, tarikhRekod, catatanKhas
- **mata_olahragawan**: Kemaskini jika noKP berubah (padam dari lama, tambah ke baru)
- **Padam Terus**: Double confirm → arkib → padam rekod + buang rekod_ dari mata_olahragawan
- **Undo**: Butang "Lihat Arkib" → senarai rekod_sejarah → pilih → pulihkan bila-bila masa
- **Tidak disentuh**: heat badge `pecahRekod`, `medal_tally`, `pendaftaran`
- **Fail**: `src/pages/admin/HealthCheck.jsx`
- **Status**: ✅ Built + deployed (23 Jun 2026)

## AUDIT — Sesi 23 Jun 2026 (grantMedal flow deep check)

### Audit Flow grantMedal → medal_tally — 100% SELAMAT

**Soalan**: Adakah flow SR/SM → acara final → medal_tally sync dan tepat?

**Dapatan:**
- 152 acara total: 48 final (parentAcaraId), 48 saringan, 56 terus final
- **Semua 48 acara saringan** ada perkataan "saringan" dalam `peringkat` atau `namaAcara` → `isSaringanAcara=true` → `grantMedal=false` — tiada risiko salah beri medal dari saringan ✅
- **SR vs SM** tidak perlu dibeza dalam `grantMedal` — dua-dua layak pingat ikut `fasa='final'`, `medal_tally` doc ID guna `kodSekolah` prefix berbeza (TBA=SR, TEA=SM) ✅
- Bug lama (Faris, Kijal, Ayer Puteh, Seri Iman) bukan dari bug logik kod — dari bug sebelum 21 Jun (saringan tulis ke mata_olahragawan) yang dah difix

**Logic grantMedal (betul):**
```js
isSaringanAcara = peringkat.includes('saringan') || namaAcara.includes('saringan')
grantMedal = !isSaringanAcara && (heat.fasa==='final' || heats.length===1)

## FIX — Sesi 24 Jun 2026 (Firestore direct, tiada kod diubah)

### Fix Timezone — isToday (Home.jsx)
- **Bug**: "HARI INI" highlight pada hari salah selepas tengah malam (tunjuk semalam)
- **Punca**: `new Date().toISOString().slice(0,10)` guna UTC — pada pukul 12AM-8AM Malaysia, UTC masih hari sebelum
- **Fix**: `new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Kuala_Lumpur' })` — return YYYY-MM-DD dalam GMT+8
- **Fail**: `src/pages/Home.jsx` line 1672
- **Status**: ✅ Fixed + deployed (24 Jun 2026)

### Fix Rekod Acara 109 — RIFQY XX63 (100M L L10)
- **Bug**: Rekod library `100M_L_C_D` masih tunjuk HARRAZ 14.54s — sepatutnya RIFQY 14.48s
- **Punca**: Tiada tuntutan dicipta — rekod library tidak auto-kemaskini
- **Fix**:
  1. Rekod library `100M_L_C_D` → RIFQY 14.48s (HARRAZ diarkibkan ke rekod_sejarah)
  2. Badge `pecahRekod: "D"` ditambah pada XX63 dalam heat 109-H4
- **mata_olahragawan** RIFQY `rekod_109` sudah betul — tidak disentuh
- **Skrip**: `fix-rekod-109-rifqy.cjs` ✅

### Fix Rekod Acara 101 — AUNI U72 (3000M OPENSM-P)
- **Bug**: Rekod library `3000M_P_J_D` masih tunjuk DAYANA 13.18s — sepatutnya AUNI 13.14s
- **Punca**: Rekod lama dimasukkan manual tanpa noKP — sistem gagal buat tuntutan
- **Fix**:
  1. Rekod library `3000M_P_J_D` → AUNI 13.14s (DAYANA diarkibkan)
  2. Badge `pecahRekod: "D"` ditambah pada U72 dalam heat 101-F1
- **mata_olahragawan** AUNI `rekod_101` sudah betul — tidak disentuh
- **Skrip**: `fix-rekod-101-auni.cjs` ✅

### Fix HARRAZ Stale — mata_olahragawan (100M L L10)
- **Bug**: HARRAZ ada `rekod_109`, `acaraDetail_109 (pingat:emas)`, `pingat_emas:1`, `jumlahMata:8` — semua salah
- **Punca**: Bug lama — saringan tulis ke mata_olahragawan sebelum fix 21 Jun. HARRAZ rank 1 dalam heat saringan 109-H5 (14.54s) tapi RIFQY lebih laju (14.48s) dalam heat lain
- **Betul**: HARRAZ hanya dapat perak dalam final acara 123 (15.43s, rank 2)
- **medal_tally TBA2009**: sudah betul (perak:1, tiada emas) — tidak disentuh
- **Fix** (4 field dalam mata_olahragawan HARRAZ):
  1. Padam `rekod_109`
  2. Padam `acaraDetail_109`
  3. Padam `pingat_emas`
  4. `jumlahMata`: 8 → 3
- **Skrip**: `fix-harraz-stale-rekod.cjs` ✅

### Security — API Key Exposed in GitHub (24 Jun 2026)
- **Isu**: GitHub Secret Scanning alert — `AIzaSyC6sHvn5JUkstFBzPpyGcENDmPAWCMBBk0` hardcoded dalam 3 .cjs scripts (commit ce78b16)
- **Fix**:
  1. Tukar hardcoded key → `require('dotenv').config({ path: '.env.local' })` + `process.env.VITE_FIREBASE_API_KEY`
  2. `git rm --cached` ketiga-tiga .cjs dari tracking
  3. `.gitignore`: tambah `fix-*.cjs`
- **Commit**: `ba2b197` ✅
- **Nota**: Key lama masih dalam git history — tidak kritikal (Firebase web key dilindungi Firestore Rules)

### Fix Rekod Acara 313 — SMK MAK LAGAM 48.30s (4x100M L15)
- **Bug**: Rekod library `4X100M_L_E_D` tersalah tunjuk SMK CHUKAI 48.4s (2026). Badge `pecahRekod:"D"` ada pada SMK CHUKAI 48.75s dalam heat 313-H1 DAN final 328 48.4s
- **Rekod betul**: SMK MAK LAGAM 48.30s (2020), `kodSekolah: TEA2032`
- **Fix**:
  1. Restore library → SMK MAK LAGAM 48.30s (arkib SMK CHUKAI 48.4s ke rekod_sejarah)
  2. Padam `pecahRekod:"D"` dari SMK CHUKAI 48.75s dalam heat 313-H1
  3. Padam `pecahRekod:"D"` dari SMK CHUKAI 48.4s dalam final 328
  4. Padam rekod_sejarah SMK CHUKAI 48.75s (salah) — GAGAL permission denied, perlu padam manual di Firebase Console (`LEavHyMzymxJ2aKSTUVs`)
- **Skrip**: `fix-rekod-313-maklarum.cjs` + `fix-badge-328-chukai.cjs` ✅
- **Status**: ✅ Done (24 Jun 2026)

## FIX — Sesi 24 Jun 2026 (UI + BukuKejohanan)

### Menu: Analisa Pingat → Atlet Terbaik
- **Tukar**: Label menu sidebar `Analisa Pingat` → `Atlet Terbaik`
- **Fail**: `src/components/layout/DashboardLayout.jsx`
- **Commit**: `4256d9f` ✅

### Menu: Olahragawan dibuang dari sidebar
- **Tindakan**: Buang entry dari `navItems` — route `/dashboard/olahragawan` masih wujud, boleh akses via URL terus
- **Sebab**: User guna Atlet Terbaik sebagai ganti — Olahragawan tidak diperlukan dalam menu
- **Fail**: `src/components/layout/DashboardLayout.jsx`
- **Commit**: `4256d9f` ✅

### BukuKejohanan — Bahagian Atlet Terbaik
- **Sebelum**: Baca dari `pilihan_olahragawan` (collection menu Olahragawan)
- **Selepas**: Baca dari `tetapan/atletTerbaik` (setup di tab Atlet Terbaik)
- **Dinamik**: Ya — setiap jana PDF reflect setup terkini
- **Fail**: `src/pages/admin/BukuKejohanan.jsx`
- **Commit**: `fd60dbe` ✅

### BukuKejohanan — Rekod Dipecah dari mata_olahragawan
- **Sebelum**: Baca dari `rekod` collection (`kejohananId == kejId`) — kurang rekod
- **Selepas**: Baca dari `mata_olahragawan` field `rekod_*` — **sama sumber Tab Rekod Kejohanan** — 32 rekod
- **Kolum baru**: Nama Atlet | Sekolah | Acara | Kat | Prestasi Baru | Prestasi Lama | Pemegang Lama | Tahun
- **Optimasi**: Buang double-load `mata_olahragawan` — guna semula satu query
- **Fail**: `src/pages/admin/BukuKejohanan.jsx`
- **Commit**: `fd60dbe` ✅

## PENDING

### Fix CetakKeputusan — UI tunjuk nama sekolah bukan kod
- **Bug**: Preview keputusan dalam UI tunjuk `TBA2035` dll — sepatutnya nama penuh
- **Punca**: `skolMap` hanya wujud dalam scope fungsi PDF — UI tidak ada akses
- **Fix**: Tambah `skolMap` state + load `sekolah` collection masa init (parallel dengan load lain)
- **Fail**: `src/pages/admin/CetakKeputusan.jsx`
- **Commit**: `49bb408` ✅

### KRITIKAL: Deploy Firestore Rules Betul (24 Jun 2026)
- **Bug**: Rules live = longgar — semua collection boleh dibaca tanpa auth (termasuk `atlet` noKP, `users` hash)
- **Punca**: `firestore.rules` root ada rules expired Mac 2026. Rules betul ada dalam `src/firebase/rules/firestore.rules` tapi tidak pernah di-deploy
- **Fix**: `cp src/firebase/rules/firestore.rules firestore.rules` → `firebase deploy --only firestore:rules`
- **Verify**: `atlet`, `users`, `rekod_sejarah`, `medal_tally` → 🔒 ditolak tanpa auth ✅
- **Awam kekal**: `rekod`, `sekolah`, `kejohanan`, `mata_olahragawan` → ✅ boleh baca (Home page perlukan)
- **Commit**: `db93025` ✅

### Repo GitHub Baru (24 Jun 2026)
- **Sebab**: Repo lama `msddOlahragaKemaman` ada API key dalam git history (commit ce78b16)
- **Repo baru**: `msrab1979-ai/olahragaKemaman` — private, history bersih
- **Remote**: `git remote set-url origin https://github.com/msrab1979-ai/olahragaKemaman.git`

## FIX — Sesi 25 Jun 2026 (Firestore rules + audit tally)

### Firestore Rules — Buka Write Semua Collection Operasi
- **Bug**: Pencatat HANTAR keputusan → `Missing or insufficient permissions` (write `heat`, `keputusan`, `medal_tally`, `mata_olahragawan`, `rekod`, `rekod_sejarah`)
- **Punca**: Semua write rules guna `isPencatat()`/`isPengurusTeknik()` = Firebase Auth — sistem guna sessionStorage
- **Fix**: Buka `allow write: if true` untuk `heat`, `keputusan`, `medal_tally`, `mata_olahragawan`, `rekod`, `rekod_sejarah`
- **KIV selepas kejohanan**: Migrate Firebase Auth → sekat semula

### Audit Tally Penuh — 101 hingga 501 (25 Jun 2026)
- **Skrip**: `audit-tally-full.cjs` (read-only)
- **Dapatan**: 93 acara selesai, 11 belum, 48 saringan (skip)
- **Hasil**: **E=93 P=94 G=95** — Ground Truth (heat) = Firestore (medal_tally) ✅
- **62 sekolah semak**: 0 beza — 100% tally betul
- **Kesimpulan**: Masalah permission semalam tidak menyebabkan data rosak

### KIV PDPA — noKP Terdedah Awam (fix selepas kejohanan)
- **Isu**: `atlet` collection `allow read: if true` → noKP + nama + tarikh lahir kanak-kanak boleh dibaca sesiapa
- `mata_olahragawan` doc ID = noKP → boleh enumerate semua noKP
- **Bintang keselamatan**: ⭐⭐/5 — pelanggaran PDPA 2010
- **Keputusan user**: Terima risiko sementara, fix selepas kejohanan habis
- **Fix perlu dibuat**: (1) migrate semua login ke Firebase Auth, (2) `atlet` → `allow read: if isStaff()`, (3) tukar doc ID `mata_olahragawan` dari noKP ke UUID

### KIV — Padam rekod_sejarah SMK CHUKAI 48.75s
- Doc ID: `LEavHyMzymxJ2aKSTUVs` dalam collection `rekod_sejarah`
- Perlu padam manual di Firebase Console (permission denied via skrip)

## FIX — Sesi 24 Jun 2026 (Firestore Rules v2 + index.html)

### Firestore Rules — Login Broken Fix
- **Bug**: Semua login gagal selepas deploy rules ketat — 403 pada `users` query
- **Punca**: Rules guna `isAuth()` = Firebase Auth, tapi sistem guna sessionStorage auth — `request.auth` sentiasa null → semua read gagal
- **Fix 1**: `users` → `allow read: if true` (login Admin/Pencatat/Pengurus Teknik query users tanpa Firebase Auth)
- **Fix 2**: `sekolah` → `allow read: if true` (login Pengurus Pasukan)
- **Fix 3**: `login_attempts` → `allow read, write: if true` (rate limiting semasa login)
- **Fix 4**: `atlet` → `allow read: if true` (Dashboard getCountFromServer + sijil + pendaftaran)
- **Write kekal selamat**: superadmin sahaja boleh ubah `users`, `sekolah`, `atlet`
- **Commit**: rules deployed ✅

### index.html — Deprecated Meta Tag
- **Warning**: `<meta name="apple-mobile-web-app-capable">` deprecated
- **Fix**: Tambah `<meta name="mobile-web-app-capable" content="yes">` — tag Apple kekal untuk iOS
- **Fail**: `index.html`
```

**Risiko teoridikal (tidak berlaku sekarang):** Acara saringan baru tanpa perkataan "saringan" + belum jana heat kedua → `grantMedal=true` secara salah. Mitigasi: semua 48 acara saringan dah ada "saringan" dalam nama.

**Skrip audit**: `/tmp/audit-acara-peringkat.cjs` (read-only, tidak disimpan dalam repo)
