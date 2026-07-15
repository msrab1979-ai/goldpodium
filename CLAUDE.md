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

### Sistem Lorong 4–8 (fix 2026-07-09)
- `kej.defaultLorong` (4–8, set dalam KejohananSetup) kini BENAR-BENAR dipakai:
  AcaraSetup load kej doc → acara baru ditulis `bilanganLorong: kejDefaultLorong` (bukan hardcode 8)
- `assignLorongFinal(..., bilanganLorong = 8)` — param ke-5 baru:
  - `=== 8` → rules WA kekal 100% (kumpulan undian `[3,4,5,6]/[2,7]/[1,8]` + waConfig)
  - `!== 8` → **formula mudah** `lorongUrutanMudah(N)`: rank 1 → lorong 3, 4, ..., N, 2, 1 (deterministik, tiada undian)
- `assignLorongHeat` — bila `!== 8`, urutan kosongkan = songsangan formula (1, 2, N, N-1, ...) ganti jadual WA
- JanaFinalModal papar warning amber bila bilangan finalis > bilangan lorong (finalis lebihan dapat `lorong: null`)
- Acara sedia ada dalam Firestore semua tertulis 8 → laluan WA lama, zero behaviour change
- Test: 66 unit test (4/5/6/7/8 lorong × 4 jenisLorong) — semua lulus
- **JANGAN** ubah rules WA 8-lorong; formula mudah hanya untuk trek bukan-8
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
- Sijil Penyertaan (`/:slug/pengurus/sijil-penyertaan`) — hide bila `tetapan/sijil.aktif === false`
- Sijil Pencapaian (`/:slug/pengurus/sijil-pencapaian`) — hide bila `tetapan/sijilPencapaian.aktif === false`
- Buku Kongsi (`/:slug/pengurus/buku-kongsi`)

### Toggle Sijil ON/OFF (2026-07-11)
- Admin ESijil + ESijilPencapaian ada toggle `aktif` — **AUTO-SAVE serta-merta**
  (`setDoc(..., { aktif }, { merge: true })` — JANGAN ikat pada butang Simpan, user tolak double kerja)
- `PengurusLayout.jsx` baca 2 doc tetapan (`getDoc` sekali + cache module `sijilShowCache`
  — doc ada base64 template, jangan fetch berulang/onSnapshot) → filter menu sidebar
- Default papar: `aktif === undefined` = ON (selamat tenant lama); hanya `false` yang hide
- Guard URL langsung: `SijilPenyertaanPP` + `SijilPencapaianPP` redirect PP ke dashboard bila OFF
- PP yang sedang login perlu refresh untuk nampak perubahan (cache per sesi)

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

## Panduan 3 Portal (overhaul 2026-07-10)
Konsep seragam admin + PP + pencatat: tab pertama **Menu Sistem** (penerangan 1 ayat
setiap menu sidebar), diikuti tab langkah bernombor. Setiap langkah ada:
📍 lokasi menu · "Cara buat" bernombor · 💡 nota amber · 🖼️ ilustrasi skrin · butang navigasi.

- **`src/components/PanduanVisual.jsx`** — komponen ilustrasi skrin KONGSI (mockup CSS,
  tiada fail imej). Jenis: `borang / senarai / semak / duaPanel / masa / medal / pdf / excel / sijil / toggle`
- **Admin**: `/admin/panduan` → `Panduan.jsx` — 6 tab (Menu Sistem + Setup/Pendaftaran/
  Hari Pertandingan/Hadiah/Tetapan Lanjutan), 22 langkah (termasuk Pengesahan Peserta).
  Butang guna `gp_kej_aktif` sessionStorage untuk resolve kejId. Sistem lorong 4–8
  didokumen di langkah 1, 4, 20
- **PP**: `/:slug/pengurus/panduan` → `PanduanPP.jsx` — 3 tab, 11 langkah.
  Butang tab dashboard hantar `state.tab` — `PengurusDashboard` baca `location.state?.tab`
- **Pencatat**: `/:slug/pencatat/panduan` → `PanduanPencatat.jsx` — 3 tab, 10 langkah.
  Menu 'Panduan' dalam sidebar pencatat (seksyen BANTUAN)

## Butang Kembali — WAJIB ke Landing Tenant (fix 2026-07-10)
Bila tenant ramai, "Kembali" mesti ke `/{slug}`, bukan promo page:
- `PengurusLogin`: guna `slugFromUrl || slug` (ditaip) — JANGAN `navigate(-1)`
- `Login` (admin) + `PencatatLogin`: guna `location.state?.schoolSlug` (dihantar
  SchoolLanding modal Akses Staff); link silang Admin↔Pencatat sambung `state`
- `PencatatLogin`: medan slug pra-isi dari state; fallback slug ditaip dalam borang
- `ErrorBoundary.handleGoHome`: derive slug dari pathname dengan senarai RESERVED
  (admin/login/superadmin/dashboard/pengurus/tukar-password/privasi/syarat)
- Sumber slug MESTI deterministik (URL param / state / input user) — JANGAN localStorage

## SchoolLanding — Perf & Kos (2026-07-10) ⚠️ JANGAN REVERT
User arahan tegas: JIMAT KOS FIRESTORE — halaman awam TIADA onSnapshot langsung:
- Medal tally: `getDocs` sekali + butang "🔄 Muat Semula" (state `tick` + `refreshing`)
- Acara/jadual: `getDocs` + `jadualTick`; butang refresh tab turut fetch semula acara
- `tetapan/home` + `aksesPantas`: `getDoc` sekali (bukan listener)
- `toggleAcara`: query `where('aceraId'/'acaraId', '==', key)` selari + dedupe —
  JANGAN muat turun seluruh koleksi heat
- Accordion eksklusif semua tutup default: jadual hari + Kedudukan Pingat —
  buka satu, yang lain tutup (`new Set([key])` / `new Set()`)
- Footer: banner promo gradient biru + butang "Saya Berminat →" (link `/` tab baru)
- `TetapanHome.mampatkanImej(file, maxDim)` — logo auto-resize (512px/header 256px,
  webp/png terkecil, SVG kekal) sebelum simpan base64

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

## AcaraSetup — Sisip Acara & Padam Berantai (2026-07-13)

### Sisip Acara (AddAcaraRow.handleSisip)
- Bila `noAcara` yang ditaip dah wujud → tawar "Sisip" — semua acara ≥ target nombor
  semula +1 (padam doc lama, cipta doc baru — turun dari nombor tertinggi ke bawah
  supaya tiada overwrite), `parentAcaraId` yang terjejas turut diselaraskan
- Gate keselamatan: TOLAK sisip jika mana-mana acara dalam julat yang kena nombor
  semula sudah ada `statusAcara !== 'akan_datang'` ATAU ada atlet berdaftar
  (`acaraIds` dalam koleksi `pendaftaran`) — elak korup rujukan heat/keputusan sedia ada
- Fix 2026-07-13: `createFinalAcara` (nama fungsi tak wujud, typo) → `createNextAcara`
  — punca ralat "createFinalAcara is not defined" lepas sisip berjaya tapi toggle
  "Tambah Final Serentak" gagal cipta Final. Data sisip sendiri (nombor semula + acara
  baru) TETAP selamat walau langkah Final gagal — hanya Final tak tercipta

### Padam Acara Berantai (DeleteModal overhaul)
- `cariRantaianAcara(root, acaraList)` — BFS cari root + semua anak (QF→SF→Final) via
  `parentAcaraId` (anak→induk) ATAU `finalDijanaKe` (induk→anak); padam 1 acara kini
  padam SELURUH rantaian sekali gus (dulu hanya padam 1 doc, tinggalkan heat/anak yatim)
- Scan setiap acara dalam rantaian untuk heat + `bilRasmi` (heat dengan
  `statusKeputusan` rasmi/diterima — dah lalui `runPostRasmi`, ada pingat/mata tercatat)
- **Gate rasmi**: kalau ada heat rasmi DAN bukan superadmin → butang padam DIKUNCI
  (`blokRasmi`), mesej suruh padam keputusan dulu atau hubungi superadmin. Superadmin
  boleh padam terus — rollback pingat/mata jalan automatik dulu (`rollbackPostRasmi`
  per heat rasmi, `grantMedal` ikut peringkat final/terus_final) SEBELUM padam heat+acara
- Urutan padam: rollback dulu (gagal → tiada apa dipadam) → padam heat → padam acara
  (batch 400 write) — kalau proses terganggu separuh jalan, tiada heat yatim tanpa acara
- Induk yang TIDAK ikut dipadam (user padam SF/Final sahaja, bukan dari root QF) →
  `finalDijanaKe` di-clear supaya butang "Jana Final" muncul semula di StartList/pencatat

## Hand Timing (HT) — Paparan Sahaja (2026-07-13)

**Konsep:** acara bertanda HT (jam tangan, bukan photo-finish) papar masa bundar WA
(0.1s naik) sebagai paparan UTAMA, masa asal dalam kurungan — `10.30s (10.21s)`
(format pilihan user 2026-07-13, bundar dipapar 2 titik perpuluhan, tiada suffix 'h').
Kedudukan/ranking/Q/medal/mata/rekod KEKAL guna masa asal (`keputusan`, tidak diubah)
— sengaja begitu supaya tidak clash bila ramai atlet dapat masa bundar sama
(kedudukan tetap ikut jam, cth. 10.21 rank 1 walaupun papar 10.30s sama dgn rank 2).

- `src/utils/htUtils.js` — `bundarHT(val)` (kira integer/sen, elak ralat float:
  `10.30→10.3` tak naik, `10.31→10.4`), `isAcaraHT(acara)` (skip acara padang)
- Flag `acara.adaHandTiming` (boolean, toggle dalam AcaraSetup Semak Acara + modal
  edit acara) — disalin automatik ke acara SF/Final yang dijana (3 titik cipta:
  `createNextAcara` ×2, `buildAcaraDoc`, `buildPayload`)
- Paparan: SchoolLanding + Home (landing lama) + CetakanHadiah PDF + slip inline
  pencatat + InputKeputusan pencatat (badge `HT ⏱` header + preview `→ 10.40h`
  bawah medan input, semua jenis: lorong/mass-start/relay)
- **JANGAN** guna nilai bundar untuk `selectFinalists`, `runPostRasmi`, ranking,
  atau apa-apa gate — HT bukan sumber kebenaran, cuma anotasi paparan
- Field lama `masaSebenar` (photocell tiebreak dalam finalistUtils/postRasmiUtils)
  TIDAK berkaitan dengan HT — jangan gabung/keliru dua konsep ini

## Analisis Pendaftaran — normJenis (2026-07-13)

**Bug:** Tab Analisis Sekolah bandingkan `s.kategori === jenisSekolah` terus — koleksi
`sekolah` simpan kod pendek (`SR`/`SM`) manakala koleksi `kategori` sesetengah tenant
(PPKI) simpan teks penuh (`SEKOLAH RENDAH`/`SEKOLAH MENENGAH`). Mismatch → 0 sekolah,
0 acara dipapar walaupun data lengkap.
- Fix: `normJenis()` (`AnalisisPendaftaran.jsx`, fungsi tempatan bukan-export — Fast
  Refresh perlu fail hanya eksport komponen) normalize kedua-dua format ke `SR`/`SM`,
  nilai custom kekal. Dipakai di tapisan sekolah, tapisan kategori, dan dedupe butang
  toggle (elak papar "SR" + "SEKOLAH RENDAH" berasingan bila data tenant bercampur)

## Slot Khas — Koleksi jadualKhas (2026-07-13)

**Bug:** AcaraSetup (`SlotKhas` component, `slotColPath`) SIMPAN ke koleksi
`jadualKhas` (camelCase). Tapi SchoolLanding tak pernah baca slot langsung, dan
Home.jsx (landing lama) BACA dari `jadual_khas` (snake_case, koleksi lain/kosong) —
slot perasmian/rehat/solat/hadiah tak pernah muncul di paparan public.
- Fix: SchoolLanding.jsx kini turut fetch `jadualKhas` (sekali, bukan listener —
  ikut `jadualTick`) dan selit ke jadual hari ikut masa (baris amber + badge jenis).
  Home.jsx dibetulkan baca `jadualKhas` juga (fetch dua-dua koleksi, gabung, untuk
  data lama). PDF cetak jadual (kedua-dua fail) turut selit slot
- Path: `tenants/{schoolId}/kejohanan/{kejId}/jadualKhas/{docId}`

## AcaraSetup — Tab Semak Acara crash (2026-07-13)

**Bug:** Butang + modal "Padam Semua Acara" dalam tab Semak Acara guna state
`pamadSemua`/`setPamadSemua`/`pamadLoading`/`handlePamadSemua` yang dideklarasi
dalam komponen induk `AcaraSetup`, bukan dalam `SemakAcara` — buka tab terus crash
`pamadSemua is not defined`. Fix: state+handler dihantar sebagai props ke `SemakAcara`.

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

**Fix 2026-07-13 — medan kosong & multi-baris:**
- Preview admin (`handlePreview`) dulu ada fallback dummy (`'15 Jun 2025'`, `'Nama Kejohanan Belum Ditetapkan'`)
  walaupun kolum dikosongkan — preview tak sepadan PDF sebenar (PP). DIBUANG — kini `namaKejohanan`/
  `tarikhKejohanan` dihantar terus tanpa fallback. Medan kosong = `if (!pos || !teks) return` dalam
  `lukis()` = terus tak dicetak, WYSIWYG 100% dengan sijil PP
- **Nama Kejohanan sokong 2 baris** — input jadi `<textarea>`, admin tekan Enter untuk pecah baris
  (cth. baris 1 nama, baris 2 daerah/tahun). `lukis()` dalam kedua-dua util `.split('\n')`, blok
  di-center menegak pada titik y (`y0 = pos.y - (lines.length-1)/2 * lineH`), `lineH` guna unit pt→mm
  (`size * 0.3528 * 1.15`). Preview drag label guna `whiteSpace: 'pre'` + `lineHeight: 1.15` supaya sama

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

## Audit Multi-Tenant Menyeluruh (9 Jul 2026)

**Rating sistem keseluruhan: 4.7/5 — SEDIA PRODUKSI peringkat daerah/negeri**

Objektif user: multi-tenant terasing, selamat, laju bila ramai user. Semua fix
di-test emulator + deploy live + push GitHub.

- **Silap masuk tenant lain: MUSTAHIL** — schoolId dalam path, session terkunci, rules halang. Conflict antara tenant takkan berlaku.
- **Skala 10k user: TAHAN** — baca jutaan OK (cost naik, bukan lambat), tulis tersebar per-tenant, `pendaftaran_counter` per-sekolah + transaction (tiada hotspot).
- **Fix siap:** S1 (session pencatat), R1 (double-count medal), S2 (rate-limit), P1 (lazy xlsx) — lihat seksyen bawah.
- **Backup per-tenant: SELAMAT** — semua path `tenants/{schoolId}`, dilindung kod+rules 2 lapis.
- **0.3 yang tinggal:** rate-limit belum kalis-pintas 100% (perlu Cloud Function), tiada backend logik server, medal_tally teori boleh dekati 1 MiB pada kejohanan sangat besar, 11 lint error pre-existing.
- **Jadi 5.0 bila:** tambah Cloud Functions (rate-limit server-side + operasi sensitif + audit log).

## Security — Firestore Rules (SIAP 2026-07-08, S1 fix 2026-07-09)

**Rating keselamatan: 4.8/5 — SIAP untuk deploy peringkat daerah/negeri**

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
- ~~P1: 4 static import xlsx bengkakkan bundle~~ ✅ FIXED (2026-07-09)
  SekolahSetup, Rekod, Backup, PengurusDashboard tukar `import * as XLSX` →
  `const XLSX = await import('xlsx')` dalam fungsi. xlsx (419 KB) kini chunk
  berasingan, dimuat hanya bila user tekan Template/Import/Backup. Load pertama
  PengurusDashboard turun ~525 KB → 106 KB. Semua rujukan XLSX ada import lokal.
- ~~S2: `login_attempts` public write — rate-limit boleh dipintas~~ ✅ HARDENED (2026-07-09)
  Rules: delete DILARANG; update DITOLAK bila SEDANG terkunci (lockedUntil > now).
  Aliran sah kekal (create + naik attempts + reset selepas lock tamat).
  NOTA: reset penuh kalis-pintas masih perlu Cloud Function — Firestore tanpa
  server tak boleh tahu PIN betul/salah, jadi tulis "attempts:0" tak dapat
  disekat sepenuhnya. Test S2: 5 kes lulus (aliran sah + serangan ditolak).
- Cadangan future: Cloud Function untuk (1) rate-limit server-side penuh (2) audit log

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

### Fix 2026-07-13 — gate simpan `overrideByAcara` + label QF→SF
- **Bug:** `handleSave` (TetapanFinal) ada gate `bestHeat>0||bestTime>0` untuk
  `sukuKeSeparuhByAcara` dan `separuhKeAkhirByAcara`, tapi `overrideByAcara` (→ Final)
  TIADA gate — admin kosongkan kotak BH/BT → tersimpan `{bestHeat:0,bestTime:0}` →
  `getFinalistSetup` terima nilai tu (0 ≠ null) → `selectFinalists` pilih 0 finalis →
  Jana Final kosong. FIXED: gate sama ditambah, kosongkan kotak = balik ke default (1,3)
- **Bug label:** baris QF→SF (UI TetapanFinal) tanda hijau bila jumlah = 8 — tapi QF→SF
  sasaran sebenar ialah GANDAAN 8 (16 tipikal = 2 heat SF × 8 lorong). FIXED: hijau bila
  `total % 8 === 0`, label kini tunjuk maksud terus (`= 16 → 2 heat SF penuh`)

## Cetak Keputusan Admin — Overhaul (2026-07-11, commit 02d3255)
- `/admin/cetak-keputusan` → `CetakKeputusan.jsx`
- **Sumber jadual: `acara.tarikhAcara`** (doc acara sendiri) — BUKAN koleksi `jadual`
  (koleksi tu kosong untuk tenant GP → page kosong "Tiada jadual"). Acara tanpa tarikh → tab "Lain-lain" (`tba`)
- Carian no/nama acara + dropdown filter kategori + butang Padam Tapisan
- Papar SEMUA fasa heat (SARINGAN → SF → FINAL via `sortHeats`/`heatLabel`);
  heat tanpa keputusan berlabel "Belum ada keputusan" (web/PDF/Excel) — JANGAN skip senyap
- PDF ikut hari terpilih + tapisan aktif (dicatat dalam header PDF)
- Excel: **1 sheet per hari**, checkbox ☑ pada tab hari pilih hari mana masuk (default semua)
- `isSelesai(h)` = statusKeputusan dalam `['ada_keputusan','diterima','rasmi']`
- **Menu "Cetak Acara" DIBUANG dari admin** (sidebar/dashboard/route/panduan) —
  Cetak Keputusan rangkum semua. Portal pencatat KEKAL guna `CetakAcara.jsx` (slip hadiah/juruhebah)
- **Fix 2026-07-13:** `CetakAcara.jsx` (portal pencatat) ada bug SAMA — masih baca
  koleksi `jadual` kosong → "Tiada acara untuk hari ini" walaupun acara penuh. Dibaiki
  guna sumber sama (`acara.tarikhAcara`) — fix ni tak dibuat masa overhaul 02d3255 sebab
  fail ni tak disentuh (dikira "portal pencatat, bukan admin")

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

## Kategori Utils — Fix PPKI "Di luar julat" (2026-07-13)

**`src/utils/kategoriUtils.js`** — util KONGSI untuk semua logik kategori umur
(PengurusDashboard, PendaftaranSetup admin, validasiPendaftaran). JANGAN tulis
semula `kiraKategori`/`layakUmurMSSM` lokal dalam page baru — import dari sini.

- **Punca bug lama:** penapis jantina `lbl.startsWith('L'/'P')` — kod PPKI seperti
  `BDL12`/`BDP12` (huruf jantina di TENGAH) tersingkir → semua atlet tenant PPKI
  (cth. mssdppki) dapat "Di luar julat kategori"
- `jantinaKategori(k)` — regex `([LP])\d` pada kod/label/nama, fallback huruf pertama,
  tiada penanda → `null` = unisex (layak semua jantina)
- `senaraiKategoriLayak()` — return ARRAY calon tier umurHad terendah sahaja
  (PPKI boleh >1 calon seumur: BDP12/BLP12/BPP12; tenant biasa sentiasa 1).
  Naik kategori KEKAL melalui `kategoriOverride` — julat bertindih 15/19 tak auto-naik
- Semakan kelayakan acara guna `katLayak.includes(acara.kategoriKod)` (bukan `===`
  nilai tunggal); `kategoriKod` yang ditulis ikut kategori acara didaftar jika layak
- TukarKategoriModal kini benarkan kategori SEUMUR (adik-beradik PPKI) + lebih tinggi
- Test: `senaraiKategoriLayak` 16 kes (data sebenar mssdppki + tenant biasa) lulus

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

### Lupa Kata Laluan Login Admin (2026-07-12)
- `Login.jsx` ada link "Lupa kata laluan?" bawah medan kata laluan — panggil
  `hantarResetPassword(emel)` (`firebase/auth.js`, `sendPasswordResetEmail`)
- Mesej maklum balas SAMA walau akaun tak wujud — elak user enumeration
- Berfungsi untuk superadmin + semua admin tenant (Firebase Auth email/password)
- Superadmin juga boleh reset via Firebase Console → Authentication → Reset password

### Lupa PIN PengurusLogin
- Fix 2026-07-13: dulu gagal "Ralat sistem" — PP belum login tiada session, rules tolak write.
  Kini: modal `signInAnonymously` dulu; rules `sekolah/{kod}` benarkan update TERHAD
  `hasOnly(['pinHash','pin','updatedAt'])` + `request.auth != null`. PIN = kawalan lembut
  (pinHash public-readable); reset selamat penuh perlu Cloud Function (future)
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
- **Fix 2026-07-12:** kategori jenis custom WAJIB tetap dipapar — dikumpul bawah group/tab
  `LAIN` (`jenisOf(k)` helper). Dulu whitelist buat kategori custom HILANG terus dari
  paparan (page nampak kosong walaupun JUMLAH > 0, cth tenant MSSDPPKI 18 kategori)
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

## Superadmin Impersonation — Admin / Pencatat / PP (2026-07-11)

### Hook berpusat `src/hooks/useSchoolId.js` — WAJIB untuk page admin baru
- `useSchoolId()` → `{ schoolId, namaSekolah, isSuperadmin }` — resolve `gp_view_school`
  (sessionStorage) untuk superadmin, `userData.schoolId` untuk admin biasa
- **JANGAN** baca `userData?.schoolId` terus dalam page admin — superadmin dapat kosong
  → page tersangkut loading (bug freeze sidebar lama). Guna hook, atau `viewSchool()`
  untuk fungsi bukan-hook (cth. `AdminLayout`, `Panduan.getKejId`)
- Fix freeze 2026-07-11: AdminPanel, AksesPantasPage, BukuKongsiSetup, PengesahanPeserta,
  MedalTally, StartList, Panduan, AdminLayout — semua kini guna hook/helper

### Konteks kejohanan `gp_kej_aktif` — fix stale (2026-07-12)
- Masalah: superadmin masuk Tenant A → `gp_kej_aktif` simpan kejId Tenant A; masuk
  Tenant B pula → menu kejohanan (Kategori/Acara/StartList/Pengesahan) navigate guna
  kejId lama → page kosong / "Sesi Tamat"
- Fix 1: `masukSebagaiAdmin()` (SuperadminPanel) — `removeItem('gp_kej_aktif')` setiap masuk tenant
- Fix 2: `navKejohanan()` (AdminLayout) — cache hanya dipakai bila `kej.schoolId`
  padan tenant semasa (`viewSchool().schoolId` untuk superadmin); tak padan → fallback
  fetch Firestore. Semua penulis `gp_kej_aktif` memang simpan `schoolId` dalam doc

### Shortcut login superadmin dari landing tenant (2026-07-12, fix race 2026-07-15)
- `Login.jsx`: bila role `superadmin` DAN datang dari SchoolLanding (`state.schoolSlug` ada)
  → auto set `gp_view_school` (schoolId dari `state.schoolId`, fallback resolve `slugIndex/{slug}`)
  + `clearViewPortal()` + buang `gp_kej_aktif` → terus ke `/admin` tenant tu
  (sama kesan seperti tekan "Masuk" dalam SuperadminPanel)
- Login superadmin dari `/login` terus (tanpa state slug) → ke `/superadmin` macam biasa
- Admin tenant biasa (role `admin`) tidak terjejas — haluan ikut `HALUAN_PERANAN`
- **Bug fix 2026-07-15**: `handleHantar` (submit borang log masuk) dulu `navigate(HALUAN_PERANAN[role])`
  terus lepas `login()` berjaya — race dengan `useEffect` shortcut di atas (baris ~70) yang
  patut redirect ke `/admin` tenant. Submit borang menang race → superadmin dari landing tenant
  (klik "Login Staff" → "Admin") tersasar ke `/superadmin` walaupun `slugTenant` wujud dalam
  `location.state`. Fix: `handleHantar` kini semak `sesi.role === 'superadmin' && slugTenant` dulu
  — kalau match, biarkan `useEffect` uruskan redirect (jangan navigate terus dalam handler)

### Portal Pencatat & PP untuk superadmin
- SuperadminPanel menu ⋯ → "📝 Masuk sebagai Pencatat" / "👥 Masuk sebagai PP"
- Konteks: sessionStorage `gp_view_portal` = `{ schoolId, schoolSlug, kodSekolah?, namaSekolah?, name }`
  — helper `viewPortal()/setViewPortal()/clearViewPortal()/withPortalView()` dalam useSchoolId.js
- `withPortalView(userData)` — gabung konteks portal ke userData bila role superadmin
  (role KEKAL 'superadmin' supaya semakan bolehEdit dll lulus). Semua page portal
  (pencatat ×5, pengurus ×5) guna pattern `const { userData: authData } = useAuth();
  const userData = withPortalView(authData)`
- Guard `RequirePencatat`/`RequirePengurus` (App.jsx): superadmin lulus jika
  `viewPortal().schoolId` ada; jika tiada → redirect `/superadmin`
- **PP perlu kodSekolah**: `PengurusLayout` papar picker sekolah (`PilihSekolahSuper`)
  bila superadmin belum pilih; banner amber "⚡ Mod Superadmin" ada butang
  Tukar Sekolah + Kembali ke Superadmin; `<main>` di-key `kodSekolah` supaya page remount
- Logout dalam portal (superadmin) = keluar mod sahaja (`clearViewPortal` + `/superadmin`),
  BUKAN logout Firebase
- Firestore rules TIDAK diubah — `isSuperadmin()` memang dah benarkan semua tenant
- `masukSebagaiAdmin` panggil `clearViewPortal()` — elak konteks portal stale

### Fix 2026-07-13 — page dikongsi admin+pencatat (Rekod.jsx, CetakAcara.jsx) tersangkut kosong
- **Bug:** `admin/Rekod.jsx` dan `admin/CetakAcara.jsx` dipakai serentak sebagai page
  admin (`/admin/rekod`) DAN page pencatat (`/:slug/pencatat/rekod`, `/:slug/pencatat/cetak-acara`
  — lihat App.jsx lazy import `PencatatRekod`/`PencatatCetakAcara`). Bila superadmin
  "Masuk sebagai Pencatat", cuma `gp_view_portal` diset — tapi dua fail ni baca
  `gp_view_school` sahaja (konteks mod admin) → `schoolId` kosong → error Firestore
  "Invalid collection reference" (`tenants//rekod`) / page tersangkut "Memuatkan..."
- Fix: `Rekod.jsx` + `CetakAcara.jsx` kini `withPortalView(authData)` macam page portal lain
- Fix tambahan `useSchoolId()` hook sendiri — utamakan `viewPortal()` bila wujud
  (hanya wujud semasa mod portal aktif; `gp_view_school` boleh stale dari tenant admin
  sebelumnya) — ini turut fix `StartList.jsx` pencatat yang guna hook ni terus
- **Pengajaran:** page yang lazy-import dua kali dalam App.jsx (sekali untuk route admin,
  sekali untuk route pencatat/pengurus) WAJIB guna `withPortalView` — jangan baca
  `userData?.schoolId` terus walaupun nampak macam "page admin"

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

## Demo Tenant + Promo Page + Footer Kredit (2026-07-09)

### Tenant Demo — goldpodium.web.app/demo
- Tenant dummy SEBENAR untuk butang "Cuba Demo": slug `demo`, schoolId `skl_demo`, kejohanan `KEJ-DEMO-2026`
- Route statik `/demo` (mockup `Demo.jsx`) DIBUANG dari `App.jsx` — URL `/demo` kini ditangkap `/:slug` → SchoolLanding sebenar. `Demo.jsx` DIPADAM terus (2026-07-10, commit 31eed88) — ada harga RM150 yang tak sepatutnya dipapar
- Data fiktif: 6 sekolah (GML/HRJ/SAM/BKI/PEM/TMM), 8 acara — 4 selesai (heat `fasa: 'final'`, `statusKeputusan: 'rasmi'`) + 4 akan datang, medal_tally + contrib, 4 rekod `D` aktif
- Tenant expiry 2099 — takkan kena auto-suspend
- **Reset data demo**: `ADMIN_PASSWORD=... node seed-demo-tenant.cjs` (login superadmin, idempotent — overwrite doc sama)

### Promo Page (Landing.jsx)
- Seksyen baru "Kelebihan Sistem" — 8 kad (Portal PP, Start List Auto, Medal Tally, Rekod S/D/N/K, Multi-tenant Selamat, Cetakan 1 Klik, PWA, Pengesahan Online) — antara banner social proof dan seksyen Harga, guna const `KELEBIHAN`
- Stat bar hero: `7 Ciri` → `15+ Kelebihan`
- Semua butang "Cuba Demo" kekal `<Link to="/demo">` — tak perlu ubah, slug tangkap

### Footer Kredit Tenant (SchoolLanding.jsx)
- Baris footer semua tenant: "Sistem ini dibina oleh **Gold Podium** · **Berminat? →**" — dua-dua link ke `/` (promo page), buka tab baru
- Terpakai automatik semua tenant (hardcoded dalam SchoolLanding, bukan per-tenant config)

## PageSpeed / Perf & A11y (2026-07-11)
Baseline PageSpeed: promo `/` mobile 70 / desktop 96; tenant `/ppkikmn` mobile 56 / desktop 83
(LCP mobile 7.3s — punca: bundle JS + tunggu Firestore; TBT rendah, bukan isu kod berat).
Fix yang dibuat (terpakai semua tenant):
- `index.html`: `preconnect` firestore + identitytoolkit, `lang="ms"`, meta description, title deskriptif
- `SchoolLanding.jsx`: aria-label butang refresh, kontras `white/40→75` (namaAgensi) +
  ikon refresh `white/35→70`, tab pill `gray-500→600`, landmark `<main>` balut kandungan
- Skor 90+ mobile first-visit perlu SSR — TIDAK berbaloi, jangan cadang ubah seni bina
- Lawatan ulangan laju (PWA cache) — skor lab first-visit sahaja

## Dasar Harga (2026-07-10)
- **JANGAN papar sebarang harga (RM)** di promo page, demo tenant, footer atau mana-mana halaman awam
- CTA sentiasa hubungi WhatsApp (`NO_WA` dalam `Landing.jsx`) — seksyen #harga guna kad "Bincang Terus dengan Kami"
- Harga hanya wujud dalam Tab Akaun superadmin (rekod bayaran dalaman)

## Audit 4-Fasa PP→StartList→InputKeputusan→Final (2026-07-14)

User arah audit menyeluruh rantaian pendaftaran→keputusan rasmi guna Explore
subagent (4 fasa), semua fix disahkan dengan data Firestore sebenar (bukan
cuma UI) guna tenant `ppkikmn` sebagai sandbox test — bukan tenant produksi.

### Fasa 1 — PP Pendaftaran (fix, deployed)
- `validasiPendaftaran.js` Gate 4 jantina: check `=== 'campuran'` tapi data
  sebenar simpan `'C'` — acara campuran GAGAL terima sesiapa. Fix: terima
  `['C','Campuran','campuran']`
- `PengurusDashboard.jsx` label pasukan relay A-F: bila 6 pasukan penuh,
  `.find() || 'A'` diam-diam collide pasukan ke-7 dengan Pasukan A. Fix:
  tolak dengan mesej "Had X pasukan sudah penuh", tiada fallback silent
- Path B (tab "Daftar Acara") tak re-check umur/jantina semasa simpan
  (hanya harap filter checkbox awal yang mungkin stale). Fix: tambah Gate 3/4
  re-check dalam `handleDaftar` sebelum queue batch write

### Fasa 2 — StartList/Heat (fix, deployed)
- `pencatat/InputKeputusan.jsx` `initKeputusanDariPeserta`: peserta dengan
  `lorong: null` (overflow bila finalis > bilangan lorong) DIBUANG dari
  `kpMap` — hilang terus dari skrin pencatat, tiada baris, tiada amaran.
  Fix: kunci fallback `overflow_{noBib}`, baris tambahan label "TIADA LORONG"
  di `InputLorong` + `InputRelay`, `buildUpdatedPeserta` guna kunci sama

### Fasa 3+4 — Rollback "Jana Semula"/Reset (fix, deployed, 3 bug berturut)
**Masalah asal**: reset heat saringan clear `finalDijanaKe` senyap → admin
boleh "Jana Final" sekali lagi → heat Final RASMI ditimpa finalis baru
TANPA rollback pingat/mata/rekod lama → data anak yatim/double.

Fix (`StartList.jsx`) — 3 bug ditemui berturut semasa test, semua dibaiki:
1. **Gate role**: admin tenant biasa disekat reset (hanya superadmin) —
   user putuskan admin PATUT boleh reset (dia pemilik tenant sendiri).
   Ubah `userRole !== 'superadmin'` → `!['superadmin','admin'].includes(...)`
   di 2 tempat (`handlePadamSemuaHeat`, `handleResetHeatAcara`)
2. **Rollback tak cover heat "sendiri"**: `rollbackFinalHeatJikaRasmi` cuma
   rollback heat ANAK (Final dijana dari saringan) — acara Terus Final
   (tiada anak) di-reset terus TANPA rollback. Fix: helper baru
   `rollbackHeatRasmiUntukAcara(acara, heatDocs)` dipanggil untuk acara
   semasa DAN acara anak, di ketiga-tiga fungsi reset
   (`handlePadamSemuaHeat`, `handleResetHeatAcara`, `handleResetSemuaHeat`)
3. **`heatList` React state stale** (root cause sebenar): `heatList` diisi
   sekali bila `selectedAcara` dipilih, TIDAK auto-refresh bila keputusan
   rasmi dimasukkan oleh tab/peranti lain. Rollback dipanggil dengan
   snapshot LAMA (peserta kosong) → tiada apa untuk rollback. Fix:
   `handlePadamSemuaHeat` fetch heat TERKINI dari Firestore (`getDocs`)
   sebelum gate/rollback/padam, bukan guna state React yang mungkin lapuk
   (`handleResetHeatAcara`/`handleResetSemuaHeat` memang sudah fetch fresh)

**Bug bonus jumpa semasa test** (bukan dari fix di atas, kod sedia ada):
`GenerateModal` (StartList.jsx baris 539/561) guna `selectedAcara` yang
tak wujud dalam scope komponen (patut `acara` — prop komponen) → crash
"selectedAcara is not defined" bila preview heat untuk acara `isTerbuka`.
Fix: tukar ke `acara`.

**Fix tambahan**: `admin/InputKeputusan.jsx` (`ModalInputLorong`,
`ModalInputPadang`) tak rollback sebelum re-save keputusan rasmi sedia ada
(unlike laluan pencatat yang sudah betul) — risiko double-count bila admin
edit keputusan rasmi terus. Fix: tambah rollback sebelum `updateDoc`,
pattern sama macam pencatat (`['rasmi','diterima'].includes(heat.statusKeputusan)`)

**Disahkan dengan Firestore console** (bukan cuma UI):
- Reset heat: `acaraDetail_*`, `rekod_*` field dalam `mata_olahragawan`
  betul-betul padam selepas fix #3; `jumlahMata`/`pingat_emas` kembali 0
- Edit keputusan rasmi (pencatat): nilai lama ditarik balik SEBELUM nilai
  baru ditulis — `jumlahMata`/`pingat_emas` kekal 1 set (bukan double)
- Atlet Terbaik/Analisa Pingat, Medal Tally, Badge — semua rollback
  serentak (kira on-the-fly dari heat + `mata_olahragawan` fields)
- **Rekod tuntutan** (`rekod/{key}_tuntutan`) HANYA rollback jika belum
  diluluskan admin (`aktifSnap` belum exists) — rekod yang admin dah sahkan
  KEKAL walau keputusan sumber dipadam/edit (sengaja, elak auto-cabut
  keputusan manusia)

### Isu automation ditemui (bukan bug sistem)
- Firebase Auth (admin, email/password) dan Anonymous Auth (pencatat/PP)
  kongsi session dalam TAB/window sama — login pencatat/PP di tab yang
  baru sahaja ada sesi admin → "Missing or insufficient permissions".
  Punca: bukan bug rules, tapi auth state bercelaru. Fix: guna Incognito
  window berasingan untuk pencatat/PP semasa testing (sudah didokumen di
  seksyen "Auth isolation" — CLAUDE.md sedia ada, disahkan semula hari ni)

## Jangan Buat
- Jangan bina `separuh_akhir` dalam dropdown manual
- Jangan bagi `grantMedal: true` pada bukan acara `akhir`
- Jangan tukar route startlist ke StartListSetup semula
- Jangan ubah logic multi-tenant — HANYA UI/UX boleh diubah
- Jangan guna `h.peringkat` dalam heat doc — field itu tidak wujud, guna `h.fasa`
- Jangan simpan `noKP` dalam heat docs, rekod, medal_tally, tuntutan (PDPA — public readable)
- Jangan deploy ke peringkat daerah/negeri sebelum Firestore rules diketatkan
- **Jangan ubah kod tanpa izin user**
