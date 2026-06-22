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
