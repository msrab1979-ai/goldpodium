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

## TetapanHome — Kawal Tab Halaman Awam (2026-07-09)
- Section "Tab Halaman Awam" dalam `/admin/tetapan` → `TetapanHome.jsx`
- 3 toggle: **showJadual** | **showKeputusan** | **showRekod** — simpan ke `tetapan/home`
- Default semua `true` (dipapar) — field kosong dalam Firestore = papar juga
- `SchoolLanding.jsx` tapis tab pills dengan `.filter(t => t.show)` berdasarkan `cfg` dari `onSnapshot`
- `useEffect` auto-switch `activeTab` ke tab pertama yang ON kalau tab aktif disembunyikan
- `cfg` default kosong (tiada showRekod/showKeputusan/showJadual) → `undefined !== false` = `true` (selamat)
- **JadualSetup.jsx** ada toggle `showJadual` tersendiri — sama field, tiada konflik

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
- `src/utils/sijilUtils.js` — penjana PDF Sijil Penyertaan (dikongsi admin preview + PP)
- `src/utils/sijilPencapaianUtils.js` — senarai pencapaian (individu + relay) + penjana PDF Sijil Pencapaian

## E-Sijil (fix 2026-07-09)

**PDF WYSIWYG** — kedua-dua penjana sijil (`sijilUtils.js`, `sijilPencapaianUtils.js`):
- `pdf.text()` guna `baseline: 'middle'` — mesti padan dengan preview drag admin (`translateY(-50%)`)
- Saiz halaman PDF ikut nisbah template (`getImageProperties`), bukan paksa A4 — template bukan-A4 tak herot
- `ESijil.jsx` handlePreview panggil `janaSijilPDF()` yang sama dengan PP — JANGAN tulis logic PDF berasingan

**Kelayakan sijil:**
- Sijil Penyertaan: SEMUA atlet dalam collection `atlet` (kodSekolah match) — TIADA tapisan acara.
  SENGAJA: pemain simpanan pun dapat sijil. Jangan tambah filter pendaftaran/acaraIds.
- Sijil Pencapaian individu: `mata_olahragawan.acaraDetail_*` rank ≤ hadKedudukan
- Sijil Pencapaian relay: scan heat final (`fasa` final/terus_final), `statusKeputusan` dalam
  `['ada_keputusan', 'rasmi', 'diterima']` — `ada_keputusan` = publish admin, `diterima` = publish
  pencatat. Setiap ahli `ahliPasukan[]` dapat sijil individu sendiri (nama sendiri, bukan nama pasukan).

**Relay pasukan tanpa ahli (fix 2026-07-09, commit f92cc7b):**
- `ambilSenaraiPencapaian()` return `{ senarai, pasukanTanpaAhli }` — BUKAN array terus
- `pasukanTanpaAhli` = pasukan relay menang (rank ≤ had) tapi `ahliPasukan[]` kosong/tiada nama —
  dulu dilangkau senyap, sekarang dikesan dan dilaporkan
- `SijilPencapaianPP.jsx` papar kotak amaran amber: senarai acara/pasukan/kedudukan terjejas +
  arahan hubungi admin untuk isi nama ahli dalam heat
- Nota UI dibetulkan: relay dapat sijil individu automatik (nota lama "hubungi admin" mengelirukan)

## Security — Firestore Rules (SIAP 2026-07-08, S1 fix 2026-07-09)

**Rating semasa: 4.8/5 — SIAP untuk deploy peringkat daerah/negeri**

### Multi-Tenant Isolation via Session Doc (commit 6af7947)
- `canWriteTenant(schoolId)` — semua write kena verify:
  - `isSuperadmin()`, ATAU
  - `isAdminOfSchool(schoolId)`, ATAU
  - `sessionExists(schoolId)` — anonymous user dengan session doc valid
- Session doc: `tenants/{schoolId}/sessions/{anonUid}` — dicipta lepas PIN verified
- Rules cegah spoof: `anonUid == request.auth.uid`, schoolId path == data, kodSekolah wujud
- Immutable (create + delete sahaja, no update)
- Auto-expire 8 jam via `expireAt` field

### S1 — Ketatkan session pencatat (commit 46aa4fe, 2026-07-09)
- **Masalah lama:** rules buta percaya client bila `role=='pencatat'` — sesiapa
  boleh cipta session pencatat palsu untuk mana-mana tenant.
- **Fix:** helper `getUserDoc(schoolId, userDocId)` — rules kini sahkan di server:
  - `userDocId` wujud dalam `tenants/{schoolId}/users/`
  - `role == 'pencatat'`, `kodAkses` padan, `isAktif != false`
- Kongsi 1 kodAkses antara banyak pencatat TETAP dibenarkan (userDocId sama sah).
  Tiap peranti dapat anon UID unik → session doc berasingan.
- Disahkan 25/25 test emulator lulus; deployed live.

### TTL Cleanup
- `expireAt` field ditambah ke `sessions` (8 jam) + `login_attempts` (7 hari)
- TTL policy setup di Firebase Console Firestore → TTL (per collection group)
- Firestore auto-padam docs dalam 24 jam selepas expireAt

### Emulator Test
- `test-multitenant-rules.cjs` — 25 test cases, semua pass
- Guna `@firebase/rules-unit-testing` (perlu Java: `/opt/homebrew/opt/openjdk/bin`)
- Jalan: `PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npx firebase emulators:exec --only firestore "node test-multitenant-rules.cjs"`
- Verify cross-tenant write dihalang untuk anon, admin, pencatat, PP
- Termasuk 4 test S1: pencatat sah lulus; palsu (tiada userDocId / userDocId tak wujud / kodAkses salah / cross-tenant) ditolak

### Storage Rules
- Anonymous user TAK boleh upload logos/sijil (size + content-type check)
- Belum enable Firebase Storage untuk projek — rules standby

### Yang Boleh Improved
- ~~Pencatat session — rules tak verify kodAkses~~ ✅ FIXED (S1, commit 46aa4fe)
- ~~R1: `runPostRasmi` medal write guna `getDoc→updateDoc`~~ ✅ FIXED (2026-07-09)
  2 blok kritikal (`mata_olahragawan` + `medal_tally`) dibalut `runTransaction` —
  baca prevDetail/prevContr + tulis dalam satu operasi atomik. Cegah double-count
  bila acara SAMA diproses 2 peranti serentak. Semua logik shift pingat/kat/mata
  dikekalkan. Terbukti: `test-r1-race.cjs` 4/4 lulus (2 proses serentak → kekal 1 emas).
- S2: `login_attempts` public write — rate-limit boleh dipintas. Sederhana.
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

### JanaFinalPanel — Susun Lorong Manual (checkbox)
- Default: **WA seeding auto** — preview tunjuk anggaran WA, jana guna `assignLorongFinal`
- Checkbox **"Susun Lorong Manual"** (hanya untuk `fasaJana !== 'sukuKeSeparuh'` + `isLorongAcara`)
- Tick → ▲▼ aktif, `useEffect` tidak reset susunan, jana guna susunan panel terus
- Untick → reset ke WA preview semula
- QF→SF (serpentine seeding) — checkbox **disembunyikan**, WA auto sahaja
- `handleJanaFinal(finalistList, isManual)` — `isManual=true` skip `assignLorongFinal`
- `lorongKumpulan` prop dipass dari parent untuk WA preview dalam panel
- LT (padang_lompat) — checkbox tidak muncul (`isLorongAcara=false`), lorong tidak diassign

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

## PP Dashboard — Pautan Kumpulan & Dokumen (2026-07-09)

### TetapanHome — field baru Pautan Kumpulan
- `tajukWasap` + `arahanWasap` — tajuk & arahan untuk card WhatsApp dalam PP
- `tajukTelegram` + `arahanTelegram` — tajuk & arahan untuk card Telegram dalam PP
- **Logik hide:** kalau `tajukWasap` kosong → card WhatsApp TIDAK dipapar (walaupun `linkWasap` ada)
- Sama untuk Telegram — `tajukTelegram` kosong = hide

### PengurusDashboard — card compact 2-kolum
- Card muncul di atas tab bar, betul bawah header
- Grid 2-kolum (sm ke atas), 1-kolum pada mobile
- Icon bulat warna + tajuk tebal + arahan kecil + anak panah hover
- Dokumen muat turun dalam format card yang sama (navy)
- Fetch dari `tetapan/home` dalam `fetchAll` yang sedia ada

### Target user
- Pengurus Pasukan umur 45+, kemahiran ICT sederhana/lemah
- Card compact — bukan butang besar full-width (feedback: terlalu besar)
- Teks tindakan jelas, arahan dari admin boleh customise per kejohanan

## Admin Pengesahan Peserta (2026-07-09)

- Route: `/admin/kejohanan/:kejId/pengesahan-peserta` → `PengesahanPeserta.jsx`
- Sidebar: Group Pengurusan, bawah Start List, label `✅ Pengesahan Peserta`
- Header: counter besar `X / Y Sekolah Disahkan` + badge status keseluruhan
- Filter: `Semua` | `Disahkan` | `Belum Sahkan` dengan counter per tab
- Jadual flat: Bil · Sekolah · Kod · Status (✓ Disahkan / Belum Sahkan / Bypass) · Tarikh Sahkan
- Bypass buka kunci/kunci semula terus dari page ini (dengan confirm dialog)
- PDF ringkas: nama sekolah, status, tarikh — header biru
- Data: `pengesahan/{kodSekolah}` per kejohanan + `sekolah/{kodSekolah}.bypassPengesahan`
- **Tapis sekolah**: baca `pendaftaran` kejohanan → ambil `kodSekolah` unik → match koleksi `sekolah` — sekolah yang tak daftar tidak dipapar (selamat untuk old + new tenant)

## Pengurusan Pengguna (UserManagement) — Pencatat Login

- Route admin: `/admin/pengurusan-pengguna` → `UserManagement.jsx`
- Firestore path: `tenants/{schoolId}/users/{docId}` — ada `kodAkses`, `pinHash`, `role`, `isAktif`
- Login pencatat guna: **slug sekolah** (bukan schoolId) + **kodAkses** (uppercase) + **PIN 6 digit**

### Debug Pencatat Gagal Login — Semak Urutan
1. **"Kod sekolah tidak dijumpai"** → `slugIndex/{slug}` tiada atau `aktif: false` — berlaku kalau tenat dibuat manual (bukan via SuperadminPanel)
2. **"Kod akses tidak dijumpai"** → `tenants/{schoolId}/users` kosong, atau `kodAkses` tak match (sensitif huruf besar — kod login auto-uppercase, Firestore wajib simpan uppercase juga)
3. **"PIN tidak betul"** → `pinHash` dalam Firestore tak match — berlaku kalau PIN ditukar tapi hash lama masih ada, atau PIN diinput dengan spasi
4. **"Akaun ini tidak aktif"** → `isAktif: false` dalam user doc

### Punca biasa tenat baru gagal
- `slugIndex/{slug}` wujud tapi `aktif: false` — semak Firebase Console → Firestore → `slugIndex`
- User doc ada `pin` field (plain text lama) tapi tiada `pinHash` — wajib ada `pinHash` untuk login berjaya
- Superadmin create tenat via `SuperadminPanel.jsx` → `createAdminAccount()` → `slugIndex` auto-cipta dengan `aktif: true`

## SuperadminPanel UX Overhaul (2026-07-09)

### Kad Statistik Clickable + Filter
- 4 kad KPI (Jumlah/Aktif/Digantung/Perlu Tindakan) — clickable untuk auto-tapis
- Klik kad → set `tabAktif='sekolah'` + `tapis=<jenis>` dengan ring biru sekeliling kad aktif
- "Perlu Tindakan" kira sekolah baki ≤30 hari (termasuk yang sudah tamat)

### Toolbar Cari + Filter + Susun
- Search box: nama sekolah, daerah, slug, nama admin
- Filter chip: Semua / Aktif / Digantung / Expiry ≤30 (segmented control style)
- Susun dropdown: Nama / Expiry / Status
- Counter "X / Y sekolah" di kanan

### Row Table
- Avatar bulat inisial sekolah dengan warna auto (hash nama) — `warnaAvatar()` + `inisial()`
- Buang prefix `SK/SMK/SR/SM/PPKI/SJK` dari inisial
- Status pill besar dengan dot warna (hijau/merah/kuning)
- Expiry tunjuk tarikh + label baki hari untuk ≤30 hari
- Hover row = highlight biru halus
- Header sticky (`sticky top-0 bg-gray-50`)

### Menu ⋯ Dropdown (fixed position)
- Buang 5 butang inline; kekal butang "Masuk" primary + ikon ⋯
- Dropdown pakai `position: fixed` dengan koordinat dari `getBoundingClientRect()` — supaya tak clipped oleh parent overflow
- Auto tutup bila scroll/resize/click luar
- Items: Reset Password / Perbaharui Langganan / Tangguh/Aktifkan / Data & Reset / Padam
- Header dropdown tunjuk nama sekolah (context)

### Tab Bar
- Underline tebal (`h-0.5 rounded-t`) untuk tab aktif
- Saiz teks `text-sm` (dari `text-xs`)
- Padding `px-6 py-4` untuk sentuh yang lebih besar

### Kolum URL
- Papar URL penuh `goldpodium.web.app/{slug}` (bukan hanya `/slug`)
- Klik terus buka halaman sekolah

## Auto-Suspend Bila Expired / Suspend (2026-07-09)

### Sync `tenants.status` ⇄ `slugIndex.aktif`
- `tangguhSekolah` — update `tenants.status='suspended'` + `slugIndex.aktif=false`
- `aktifkanSekolah` — update `tenants.status='active'` + `slugIndex.aktif=true`
- Public SchoolLanding baca dari `slugIndex.aktif` — sync ini pastikan public block juga

### Auto-suspend bila langganan tamat (cascade)
- `firebase/auth.js` — bila admin cuba login & `tarikhExpiry < now`:
  - Auto set `tenants.status='suspended'` + `slugIndex.aktif=false` + `autoSuspendPada`
  - Throw `auth/account-expired`
- `SchoolLanding.jsx` — first line of defence untuk public:
  - Load tenant → semak `expiryMs`
  - Kalau expired → auto-suspend + tunjuk skrin `tidakAktif`
  - Kalau `status='suspended'` → skrin `tidakAktif`

### Kesan cascade
- Admin login → error
- Admin dah login → `useLesen` hook block dashboard
- Public landing → skrin Tidak Aktif
- Pencatat/PP login → block via `slugIndex.aktif=false`

## Panel Superadmin — Tab Akaun (2026-07-09)

### Purpose
- Track pendapatan langganan Goldpodium (SaaS multi-tenant)
- Superadmin cipta entry manual bila terima bayaran

### Firestore Path
```
tenants/{schoolId}/langganan_sejarah/{docId}
  ├── schoolId, tarikhBayaran, tarikhMula, tarikhTamat (Timestamp)
  ├── pakej: 'free'|'school'|'district'
  ├── jumlahRM: number
  ├── status: 'sah' | 'menunggu'  (Batal DIBUANG — guna Padam)
  ├── noRujukan: 'INV-2026-001' (auto-jana ikut collectionGroup scan)
  ├── nota: string
  └── dicipta, dikemaskinPada (serverTimestamp)
```

### Firestore Rules
- Path spesifik: `match /tenants/{schoolId}/langganan_sejarah/{docId}` — superadmin sahaja
- Collection group: `match /{path=**}/langganan_sejarah/{docId}` — untuk `collectionGroup(db, 'langganan_sejarah')` query dalam Tab Akaun

### Files
- `src/pages/superadmin/TabAkaun.jsx` — komponen utama tab
- `src/pages/superadmin/SuperadminPanel.jsx` — integrate TabAkaun via `<TabAkaun sekolahList={sekolah} />`

### KPI Cards (5)
- Bulan Ini · Tahun Ini · Sepanjang Masa · Menunggu Bayaran · Purata/Bulan

### Carta
- Bar chart 12 bulan terkini (SVG native) — status Sah sahaja
- Pie chart pecahan pakej (Percuma/Sekolah/Daerah)

### Modal Entry (Tambah/Edit)
- Sekolah (dropdown, disabled masa Edit)
- Pakej + Status
- Jumlah RM (input manual)
- 3 tarikh: Bayaran / Mula / Tamat
- No Rujukan — auto-jana `INV-{tahun}-{nnn}` kalau kosong (scan collectionGroup)
- Nota

### Modal Backfill Auto
- Scan semua tenant → cipta entry dari `tarikhMula` + `tarikhExpiry` sedia ada
- Jumlah RM = 0 (edit manual selepas)
- Skip sekolah yang sudah ada entry (idempotent)
- Log real-time

### Cetak Resit (per row — 1 klik)
- Butang **ikon 📄** dalam kolum Tindakan (bukan dalam menu ⋯)
- PDF A4: header biru "GOLD PODIUM" + label "RESIT" kuning
- Butiran: no resit, tarikh, nama sekolah, pakej, tempoh, status, jumlah dalam kotak biru besar
- Signature line, filename `Resit_{noRujukan}_{sekolah}.pdf`

### Cetak Statement Sekolah
- Butang toolbar "📑 Statement Sekolah"
- Modal: search + pilih sekolah + toggle sepanjang masa / Dari-Hingga
- PDF: header, autoTable semua entry, ringkasan (Sah + Menunggu + Jumlah Keseluruhan)

### Export Semua (filtered)
- PDF landscape dengan autoTable (semua entry dipapar)
- Excel dengan xlsx lib (semua entry dipapar, satu sheet)

### Menu ⋯ per entry
- Edit / Tandakan Sah / Tandakan Menunggu / 🗑 Padam
- Status "Batal" DIBUANG — kalau nak buang entry, guna Padam

## Jangan Buat
- Jangan bina `separuh_akhir` dalam dropdown manual
- Jangan bagi `grantMedal: true` pada bukan acara `akhir`
- Jangan tukar route startlist ke StartListSetup semula
- Jangan ubah logic multi-tenant — HANYA UI/UX boleh diubah
- Jangan guna `h.peringkat` dalam heat doc — field itu tidak wujud, guna `h.fasa`
- Jangan simpan `noKP` dalam heat docs, rekod, medal_tally, tuntutan (PDPA — public readable)
- Jangan deploy ke peringkat daerah/negeri sebelum Firestore rules diketatkan
- **Jangan ubah kod tanpa izin user**
