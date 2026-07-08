# Goldpodium — Claude Code Notes

## Stack
- React + Vite + TailwindCSS
- Firebase Firestore (multi-tenant: `tenants/{schoolId}/...`)
- Firebase Hosting → `goldpodium.web.app`
- jsPDF + autoTable untuk PDF generation
- PWA (Vite PWA plugin)

## Deploy
```
npm run build && firebase deploy --only hosting
```

## Peringkat System (TERKINI)

### Nilai peringkat yang digunakan
| Nilai | Label | Keterangan |
|---|---|---|
| `saringan_qf` | Saringan/QF | Heat pertama, jana SF auto |
| `saringan_sf` | Saringan/SF | Heat terus ke Final |
| `separuh_akhir` | Separuh Akhir | AUTO DIJANA — bukan manual |
| `akhir` | Final/Terus Final | Tanpa heat (terus final) |
| `final_p` | Final | Ada parentAcaraId |

### Flow
- **Flow A**: `saringan_qf` → result → **auto jana** `separuh_akhir` → result → **auto jana** `akhir` → medal
- **Flow B**: `saringan_sf` → result → **auto jana** `akhir` → medal

### fasaJana
- `saringan_qf` → `'sukuKeSeparuh'` → cipta acara separuh_akhir baru
- `saringan_sf` → `'toFinal'` → cipta acara akhir baru
- `separuh_akhir` → `'toFinal'` → cipta acara akhir baru

### Gate Medal
- `grantMedal: true` HANYA pada acara `akhir` (Final)
- Semua peringkat lain = `grantMedal: false`

### Dropdown Manual (AcaraSetup)
Hanya 4 pilihan — `separuh_akhir` TIDAK boleh dibuat manual:
1. Saringan / QF
2. Saringan / SF
3. Final (ada parent)
4. Terus Final

## StartList
- Route: `/admin/kejohanan/:kejId/startlist` → `StartList.jsx` (2-panel KOAM-style)
- Panel kiri: senarai acara dengan badge QF/SF/FINAL/T.FINAL
- Panel kanan: detail heat + butang Cetak/Reset/Jana Heat/Jana Final
- Butang "Jana Heat" sentiasa nampak (disabled bila 0 peserta)
- Heat path Firestore: `tenants/{schoolId}/kejohanan/{kejId}/heat/{heatId}`
- Heat doc ada `aceraId` field untuk link ke acara
- Heat doc simpan `fasa: 'heat'` (bukan `saringan_qf/sf`) — filter `selectFinalists` guna `h.fasa`
- `canJanaFinal`: semua acara yang jana ke acara lain (saringan_qf/sf, separuh_akhir) semak `finalDijanaKe`
- `resolveIsLompatTinggi(acara)` — guna field Firestore `isLompatTinggi` dulu, fallback regex
- `rollbackPostRasmi()` — undo medal_tally + mata_olahragawan bila PADAM keputusan rasmi
- `kejDefaultLorong` — baca dari `kej.defaultLorong`, hantar ke GenerateModal/JanaFinalModal/JanaSemuaModal sebagai fallback jika acara tiada `bilanganLorong`
- `sekolahList` dibina dari koleksi `sekolah` dulu (ada `namaSekolah` + `bibPrefix`), fallback ke koleksi `atlet`
- Relay PDF "No BIB" guna `bibPrefixMap[kodSekolah]` — bibPrefix sekolah (bukan BIB atlet)
- **Jangan buang orderBy('noHeat')** — sudah dibuang, sort dalam JS: `.sort((a,b) => (a.noHeat??0)-(b.noHeat??0))`

### Heat fasa values
| fasa dalam heat doc | Bermaksud |
|---|---|
| `heat` | Saringan (QF atau SF) |
| `separuh_akhir` | Separuh Akhir (dijana dari QF) |
| `final` | Final atau Terus Final |

### Jana Final gate (canJanaFinal)
- Semak `allHeatRasmi` — semua heat phase selesai + disahkan
- Semak `finalExists` — guna `finalDijanaKe` untuk saringan_qf/sf + separuh_akhir; guna `h.fasa==='final'` untuk terus_final
- Bila jana: tulis `finalDijanaKe` ke acara saringan supaya butang hilang

## Rekod System (TERKINI)

### Peringkat Rekod
| Kod | Label | Keterangan |
|---|---|---|
| `S` | Sekolah | Rekod peringkat sekolah (multi-tenant — per tenant) |
| `D` | Daerah | Rekod peringkat daerah |
| `N` | Negeri | Rekod peringkat negeri |
| `K` | Kebangsaan | Rekod peringkat kebangsaan |

### Key Format
`{NAMAACARA}_{JANTINA}_{KATEGORIKOD}_{S/D/N/K}` — uppercase, non-alphanumeric → `_`

### Flow Pecah Rekod
1. Pencatat/Admin input → `runPostRasmi()` → `peringkatKej` dari `kej.peringkat` (`sekolah→S`, `daerah→D`, dll)
2. Bandingkan prestasi: larian `newR < oldR`, padang `newR > oldR`
3. Pecah → tulis `rekod/{key}_tuntutan` (pending) + simpan `rekod_{acaraId}` dalam `mata_olahragawan`
4. Admin sahkan → `rekod/{key}` aktif

### Syarat Pecah Rekod
- `rank === 1` sahaja
- Bukan relay, ada `keputusan`
- Berlaku di **SEMUA fasa** (saringan, SF, final)

### peringkatKej Mapping (WAJIB)
```js
const PKOD = { sekolah: 'S', daerah: 'D', negeri: 'N', kebangsaan: 'K' }
const peringkatKej = PKOD[(kej.peringkat || '').toLowerCase()] || 'D'
```
- Field Firestore: `kej.peringkat` (string lowercase: `'sekolah'`, `'daerah'`, dll)
- **JANGAN** guna `kej.peringkatKej` — field itu tidak wujud

### Data Rekod — 3 Tempat Paparan
| Tempat | Sumber | Siapa |
|---|---|---|
| SchoolLanding badge RBK | `heat.peserta[].pecahRekod` + fetch `rekod/_tuntutan` | Public |
| Olahragawan badge 🏆R | `mata_olahragawan.rekod_*` | Admin |
| Rekod page Tab Tuntutan | `rekod/{key}_tuntutan` | Admin |

### Rekod — Bug Fixes (2026-07-06)
- `RekodModal` perlu `schoolId` prop — tanpanya throw `indexOf` error (Firebase path undefined)
- Kategori load: wajib `kod: data.kod || d.id` — sama seperti AcaraSetup.jsx
- Sort `localeCompare` perlu null-guard: `(a.namaAcara || '').localeCompare(...)`
- `AnalisisPendaftaran`: sekolahList dari koleksi `sekolah` dulu, fallback ke atlet

## SchoolLanding — Badge & Features
- **RBK badge** — boleh klik → `RekodModal` (rekod lama vs baru + delta)
- **MRKL badge** — menyamai rekod
- **Q/q badge** — finalist layak, disambung ke `finalistUtils.selectFinalists()`
- **Rekod S/D/N/K strip** — bawah setiap heat result (auto-load masa expand)
- **Row highlight biru** — atlet layak final
- `finalSetup` diload dari `tenants/{schoolId}/tetapan/finalSetup`

## PP (Pengurus Pasukan) — Nav
- Dashboard
- Sijil Penyertaan (`/:slug/pengurus/sijil-penyertaan`)
- Sijil Pencapaian (`/:slug/pengurus/sijil-pencapaian`)
- Buku Kongsi (`/:slug/pengurus/buku-kongsi`)

## Firestore Structure
```
tenants/{schoolId}/
  kejohanan/{kejId}/
    acara/{aceraId}     — setup acara
    heat/{heatId}       — heat (aceraId field untuk link)
    pendaftaran/{docId} — pendaftaran (acaraIds[] field)
    jadual/{docId}      — jadual acara
    kategori/{katId}    — kategori
    pengesahan/{sekolah}
    medal_tally/{kodSekolah}
  atlet/{atletId}
  rekod/{key}           — rekod aktif (key = NAMAACARA_J_KAT_S/D/N/K)
  rekod/{key}_tuntutan  — rekod pending sahkan
  tetapan/home          — logo, tajuk
  tetapan/sijil         — template sijil penyertaan
  tetapan/sijilPencapaian — template sijil pencapaian
  tetapan/finalSetup    — finalist algorithm config
  tetapan/waConfig      — lorong config
  tetapan/aksesPantas   — { items: [{id, emoji, tajuk, url, penerangan, aktif}] } max 6
```

## Panduan Admin
- Route: `/admin/panduan` → `Panduan.jsx`
- 5 tab: Setup · Pendaftaran · Hari Pertandingan · Hadiah & Laporan · Tetapan Lanjutan
- 21 langkah bernombor, setiap langkah ada penerangan + syarat perlu + butang navigasi terus
- Butang guna `gp_kej_aktif` sessionStorage untuk resolve kejId
- Entry 'Panduan' dalam sidebar admin (group Utama, bawah Dashboard)

## Akses Pantas Home
- Route setup: `/admin/akses-pantas` → `AksesPantasPage.jsx`
- Sidebar: group "Akses Pantas Home" bawah group "Sijil"
- Admin bebas tambah/edit/padam cards (max 6), pilih emoji dari picker, susun ▲▼
- Card "Pengurus Pasukan" kekal tetap — tidak masuk sistem bebas
- Firestore: `tetapan/aksesPantas` → `{ items: [{id, emoji, tajuk, url, penerangan, aktif}] }`
- Auto-migrate dari 3 doc lama (galeri/bukuKejohananLink/bukuProgram) jika ada
- Home.jsx + SchoolLanding.jsx baca real-time dari `tetapan/aksesPantas`
- Animasi icon: pulse scale hover (keyframe `pulse-icon` dalam tailwind.config.js)
- Sidebar admin: "Tetapan" dipindah ke group Utama (bawah Kejohanan)

## Files Penting
- `src/pages/admin/AksesPantasPage.jsx` — setup Akses Pantas Home (sistem bebas)
- `src/pages/admin/AcaraSetup.jsx` — setup acara + peringkat flow + simpan `isLompatTinggi` field
- `src/pages/admin/StartList.jsx` — 2-panel start list (AKTIF)
- `src/pages/admin/Panduan.jsx` — panduan langkah demi langkah untuk tenant baru
- `src/pages/admin/InputKeputusan.jsx` — input result + jana finalis
- `src/pages/admin/Rekod.jsx` — rekod S/D/N/K, tuntutan, semak, PDF
- `src/pages/admin/BukuKejohanan.jsx` — PDF buku kejohanan
- `src/pages/pencatat/InputKeputusan.jsx` — pencatat version (toast, rollback PADAM)
- `src/pages/pencatat/CetakanHadiah.jsx` — sekolahMap dari koleksi 'sekolah'
- `src/pages/pengurus/SijilPenyertaanPP.jsx` — PP muat turun sijil penyertaan
- `src/pages/pengurus/SijilPencapaianPP.jsx` — PP muat turun sijil pencapaian
- `src/pages/SchoolLanding.jsx` — halaman public (jadual/keputusan/rekod)
- `src/utils/postRasmiUtils.js` — rekod detection + medal_tally + mata_olahragawan + rollbackPostRasmi
- `src/utils/rekodUtils.js` — fetch rekod S/D/N/K per acara
- `src/utils/finalistUtils.js` — algoritma pilih finalis (selectFinalists guna h.fasa)
- `src/utils/startListPdfUtils.js` — PDF generation + resolveIsLompatTinggi + assignLorongFinal/Heat

## Security — Firestore Rules (SIAP 2026-07-08)

**Rating semasa: 4.5/5 — SIAP untuk deploy peringkat daerah/negeri**

### Multi-Tenant Isolation via Session Doc (commit 6af7947)
- `canWriteTenant(schoolId)` — semua write kena verify:
  - `isSuperadmin()`, ATAU
  - `isAdminOfSchool(schoolId)`, ATAU
  - `sessionExists(schoolId)` — anonymous user dengan session doc valid
- Session doc: `tenants/{schoolId}/sessions/{anonUid}` — dicipta lepas PIN verified
- Rules cegah spoof: `anonUid == request.auth.uid`, schoolId path == data, kodSekolah wujud
- Immutable (create + delete sahaja, no update)
- Auto-expire 8 jam via `expireAt` field

### TTL Cleanup
- `expireAt` field ditambah ke `sessions` (8 jam) + `login_attempts` (7 hari)
- TTL policy setup di Firebase Console Firestore → TTL (per collection group)
- Firestore auto-padam docs dalam 24 jam selepas expireAt

### Emulator Test
- `test-multitenant-rules.cjs` — 20 test cases, semua pass
- Guna `@firebase/rules-unit-testing`
- Verify cross-tenant write dihalang untuk anon, admin, pencatat, PP

### Storage Rules
- Anonymous user TAK boleh upload logos/sijil (size + content-type check)
- Belum enable Firebase Storage untuk projek — rules standby

### Yang Boleh Improved
- Pencatat session — rules tak boleh verify `kodAkses` (Firestore rules tak query). Attack surface kecil.
- Cadangan future: Cloud Function untuk audit log

## PP Dashboard — Fixes Kritikal (2026-07-05)

### Pendaftaran Atlet (PengurusDashboard.jsx)
- `handleDaftar` — batch write (1 commit) gantikan sequential await per atlet
- `pendSnap` dalam `handleDaftar` filter `where('kodSekolah', '==', kodSekolah)` — elak pasukan sekolah lain affect label pasukan
- `pasukanUntukBatch` dikira dari `pendSnap` fresh (bukan `pesertaSek` stale) — relay Pasukan B dapat label betul
- Bila relay update (atlet dah ada doc), simpan `pasukanRelay` dalam updateDoc
- Had relay: `hadAcara = hadPasukan × saizPasukan` (bukan raw `hadAtletPerSekolah`)

### Import Excel
- Batch parallel read + batch write (gantikan sequential loop)
- Atlet dah exist + sekolah sama → update (bukan skip)
- Atlet dah exist + sekolah lain → skip + report "X dilangkau (noKP milik sekolah lain)"
- `kodSekolah` dalam atlet doc guna `kodSekolah` dari props (bukan `sekolahData?.kodSekolah`)

### Multi-tenant isolation
- Query `pendaftaranList` filter `where('kodSekolah', '==', kodSekolah)` — PP hanya nampak data sekolah sendiri
- `refreshPend` juga filter by `kodSekolah`

### Tambah button "Padam Semua" dalam Tab Atlet PP
- Hard delete semua atlet + pendaftaran sekolah sendiri (batch delete)
- Confirm dialog sebelum padam

### Admin
- Dashboard: buang button "Sekolah" dan "Buat Kejohanan" — superadmin yang create
- KejohananSetup: create kejohanan terus `statusKejohanan: 'aktif'` (bukan `'persediaan'`)
- KejohananSetup: field `tempoBantahan` + `timerAutoRasmi` telah DIBUANG — tidak dipakai dalam sistem
- KejohananSetup: ada field `defaultLorong` (4–8, default 8) — guna sebagai fallback lorong untuk StartList

### Auth isolation
- PP (Anonymous Auth) dan Admin (Firebase Auth) kongsi localStorage — jangan buka dalam tab browser yang sama
- Guna incognito/InPrivate untuk PP

## finalSetup Path — WAJIB Per-Kejohanan (2026-07-07)

**Path betul:** `tenants/{schoolId}/kejohanan/{kejId}/tetapan/finalSetup`
**JANGAN guna:** `tenants/{schoolId}/tetapan/finalSetup` (global — kosong, salah)

### Fields dalam finalSetup
- `overrideByAcara{}` — key = **acara aceraId**
- `sukuKeSeparuhByAcara{}` — key = **QF aceraId** (untuk QF → SF)
- `separuhKeAkhirByAcara{}` — key = **SF aceraId** (BUKAN QF aceraId!) — untuk SF → Final

### getFinalistSetup lookup
- Semak `separuhKeAkhirByAcara[aceraId]` DAHULU (SF aceraId) sebelum `overrideByAcara`
- `aceraKeys` semak SEMUA — `noAcara`, `aceraId`, `acaraId`, `id`
- Kalau `fasa === 'sukuKeSeparuh'` → guna `sukuKeSeparuhByAcara` sahaja

### KategoriSetup migration
- Bila load `separuhKeAkhirByAcara` dari Firestore, migrate key lama (QF aceraId) → key baru (SF aceraId) guna `sfAceraIdMap`
- Auto-save migration ke Firestore supaya SchoolLanding dapat key betul

### Files yang baca finalSetup (semua per-kejohanan)
| File | Path |
|---|---|
| `admin/KategoriSetup.jsx` | SIMPAN `kejohanan/{kejId}/tetapan/finalSetup` |
| `SchoolLanding.jsx` | BACA — load bila kej bertukar |
| `Home.jsx` | BACA — load bila kejohanan aktif dijumpai |
| `admin/StartList.jsx` | BACA — guna `kejohananId` prop |
| `pencatat/CetakanHadiah.jsx` | BACA — load dari kejohanan aktif |
| `pencatat/InputKeputusan.jsx` | BACA — guna `kejId` dari URL |

## Cetak Hadiah Inline dalam InputKeputusan (2026-07-07)

- Butang **"Cetak Keputusan (Juruhebah / Hadiah / Fail)"** muncul dalam pencatat InputKeputusan
- Syarat: `isRasmi && isFinalHeatType && !isSaringanAcara`
- Toggle **3/4/5 pemenang** (default 3, sokong tie via `rank ≤ cetakBilangan`)
- PDF 3 salinan: JURUHEBAH (biru), HADIAH (hijau), FAIL (kelabu)
- Header logo + nama kejohanan + KEPUTUSAN RASMI + tarikh
- Jadual medal (EMAS/PERAK/GANGSA/T4/T5) + Q/q untuk saringan
- Kotak RBK (rekod baru) / rujukan rekod semasa
- Kotak MRKL (menyamai rekod)
- Filename: `Keputusan_No{noAcara}_{kategori}.pdf`
- Load `homeCfg` (logo) dari `tenants/{schoolId}/tetapan/home`
- Load `kategoriMap` dari `tenants/{schoolId}/kejohanan/{kejId}/kategori`

## Fixes Kritikal SF/Final (2026-07-07)

### 1. SF heat carry-over keputusan dari QF
- `handleJanaFinal` dalam pencatat: bila tulis heat SF/Final baru, WAJIB reset peserta:
  ```js
  const resetPeserta = p => ({ ...p, keputusan: null, status: 'belum', kedudukan: null,
    rankDalamHeat: null, pecahRekod: null, samaiRekod: null })
  ```
- Admin `StartList.jsx` guna `buatEntryPeserta` yang set `keputusan: null` — betul

### 2. isBetter check untuk rekod
- `rollbackPostRasmi` dan `runPostRasmi`: JANGAN semak `statusRekod === 'aktif'` — rekod lama (manual import) mungkin tiada field ini
- Guna: `rekodSnap.exists()` sahaja

### 3. rollbackPostRasmi lengkap
- Rollback: medal_tally, mata_olahragawan (rekod_ field), tuntutan, badge (pecahRekod/samaiRekod)
- Parameter `grantMedal` — kawal apa yang di-rollback (medal only untuk Final, badge/tuntutan untuk semua fasa)
- Rollback DIPANGGIL bila edit ATAU padam heat rasmi

### 4. buildUpdatedPeserta clear badges
- Tambah `pecahRekod: null, samaiRekod: null` dalam entry — clear badge lama semasa edit

### 5. JanaFinalPanel label BH/BT
- `getFinalistSetup(acara, finalSetup, fasaJana)` — WAJIB pass `fasaJana` supaya label tunjuk nilai yang betul

## AnalisaPingat Sekolah Map (2026-07-07)

- Load `skolMap` dari koleksi `sekolah` dulu, fallback ke `atlet`
- Key = `data.kodSekolah || d.id`, value = `data.namaSekolah || data.nama || kod`

## Lompat Tinggi Auto-Suggest (2026-07-08)

### Logik ranking (`kiraRankLompatTinggi`)
- Sort desc by keputusan (tinggi terbaik dulu)
- Tinggi berbeza → rank sequential (1, 2, 3)
- Tinggi sama → rank sama (tie)
- Manual `p.kedudukan` menang atas auto-suggest
- Return `{ rankMap, tieMap, tieGroups }`

### UI InputPadang
- Board tunjuk badge nombor rank (bulat emas/perak/gangsa) — bukan status "selesai"
- Warning amber untuk tie groups + minta pencatat semak count-back
- **Butang "✎ Edit Manual"** — mode edit, badge circle jadi input number
- Manual override badge "MANUAL" biru
- Auto-uppercase input jenis institusi

### Merentasi tempat
- `postRasmiUtils.runPostRasmi` — auto-suggest jadi rank rasmi bila kedudukan kosong
- `pencatat/CetakanHadiah` PDF + UI preview — sama logic
- Padang biasa (bukan LT) juga terima manual override

## Rekod Detection Gate (2026-07-08)

### HANYA acara akhir/final/terus_final
```js
const isFinalPeringkat = ['akhir', 'final', 'terus_final'].includes(acaraDoc.peringkat || '')
```
- Sebelum: rekod detect di **semua fasa** (saringan_qf/sf, separuh_akhir) → badge RBK muncul di heat saringan
- Sekarang: gate `isFinalPeringkat` untuk individu + relay
- **JANGAN** revert ke "semua fasa" — konfusi audience

### `getNamaSekolah` prefetch sekolah collection
- Fallback: `p.namaSekolah` → `sekolahNamaMap[kodSekolah]` → `p.kodSekolah`
- Rekod relay simpan namaSekolah betul (SK PASIR GAJAH) bukan kodSekolah (TBA2006)

### `isBetter` — buang normaliseSaat buggy
- Prestasi disimpan sebagai saat penuh (100M 9.58s = `9.58`, 800M 1:52.30 = `112.30`)
- Sebelum: `n < 10` dianggap mm.ss format → 5.00s dinormalise jadi 300 → tuntutan 10s "lebih baik"
- Sekarang: bandingkan terus tanpa normalisasi

### `autoCleanKesanRekod` — match variant + loop semua
- Match namaAcara vs namaAcaraPendek dari kedua sisi (rekod ↔ acara)
- Loop **SEMUA** acara match (kalau ada 100M L12A heat + final berasingan)
- Padam badge dari heat + `mata_olahragawan.rekod_{acaraId}` untuk semua

## Medal Tally Rollback + Backfill (2026-07-08)

### `rollbackPostRasmi` scan medal_tally penuh
- Sebelum: loop peserta dari caller (mungkin peserta BARU selepas edit) — miss stale contrib
- Sekarang: STEP 1 scan collection medal_tally, cari `contrib_{heatId}_*` semua, padam
- STEP 2 rollback mata_olahragawan untuk peserta semasa
- Pastikan tally konsisten walaupun peserta ubah kedudukan

### `backfill-medal-tally.cjs` — Nuclear rebuild
- Padam SEMUA medal_tally + mata_olahragawan existing
- Rebuild dari heat rasmi (fasa=`final`/`terus_final` + statusKeputusan=`rasmi`/`diterima`)
- Skip saringan, DNS/DNF/DQ
- Guna admin login (`ADMIN_EMAIL` + `ADMIN_PASSWORD` env vars)
- Jalan bila medal tally salah sync dengan heat

## UX Improvements (2026-07-08)

### Modal Akses Staff (Home.jsx + SchoolLanding.jsx)
- Buang card Pengurus Pasukan (redundan — dah ada di Akses Pantas)
- Ganti footer "Log Masuk Admin" jadi card ADMIN besar
- Modal sekarang: **PENCATAT (hijau) + ADMIN (biru gelap)**

### Lupa PIN PengurusLogin
- Trigger di `PengurusLogin` (page paling logik untuk PP)
- Flow: kod sekolah + e-mel → semak match → jana PIN 6 digit rawak → hash simpan → papar sekali
- Hanya muncul bila schoolId sudah resolved dari slug

### bibPrefix untuk relay
- Row relay tunjuk `namaSekolah` + `bibPrefix` (biru mono) + `Pskmn A/B/C`
- Sebelum: cuma `TBA2001` (kod sekolah teknikal) — susah untuk juruhebah
- `matchCarian` tambah bibPrefix ke carian
- `sekolahMap` + `bibPrefixMap` dua-dua load dari `tenants/{schoolId}/sekolah`

### JanaFinalPanel — Custom lorong (▲▼)
- Panel auto-jana lorong 1-N untuk finalis relay/lorong
- Butang ▲▼ swap lorong sebelum jana (state local)
- Klik "Jana Semula" → susunan custom disimpan (bukan `assignLorongFinal` WA seeding)
- `handleJanaFinal` semak `hasCustomLorong` — kalau ada, guna susunan itu

### AcaraSetup — noAcara flexible
- Buang restriction `/\D/g` strip non-digit
- Allow text/number/mix: `101`, `OSSOM-P`, `A1`, `4x100M-FINAL`
- Sistem features `Number(noAcara)` auto-langkau text (NaN filter)

### KategoriSetup cleanup
- Tab filter: whitelist `SR/SM/PPKI` sahaja (buang custom tenant seperti "SEKOLAH RENDAH")
- Modal: buang butang preset — input text sahaja + panduan biru
- Modal: buang Bahagian 3 "Kuota Atlet Per Sekolah" — sekolah bebas daftar tanpa had
- Table: buang kolum "Atlet / Sekolah (L | P)"
- Had per acara dikawal oleh `acara.hadAtletPerSekolah` dalam AcaraSetup

### AcaraSetup — buang duplicate butang
- Buang butang top-right "Padam Semua" + "Tambah Acara"
- Kekal butang dalam toolbar tengah + footer jadual

## Jangan Buat
- Jangan bina `separuh_akhir` dalam dropdown manual
- Jangan bagi `grantMedal: true` pada bukan acara `akhir`
- Jangan tukar route startlist ke StartListSetup semula
- Jangan ubah logic multi-tenant — HANYA UI/UX boleh diubah
- Jangan guna `h.peringkat` dalam heat doc — field itu tidak wujud, guna `h.fasa`
- Jangan simpan `noKP` dalam heat docs, rekod, medal_tally, tuntutan (PDPA — public readable)
- Jangan deploy ke peringkat daerah/negeri sebelum Firestore rules diketatkan
- **Jangan ubah kod tanpa izin user**
