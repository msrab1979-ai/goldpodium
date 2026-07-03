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
1. Pencatat input → `runPostRasmi()` → `peringkatKej` dari `kej.peringkat` (`sekolah→S`, `daerah→D`, dll)
2. Bandingkan prestasi: larian `newR < oldR`, padang `newR > oldR`
3. Pecah → tulis `rekod/{key}_tuntutan` (pending)
4. Admin sahkan → `rekod/{key}` aktif

### Syarat Pecah Rekod
- `rank === 1` sahaja
- Bukan relay, ada `noKP`, ada `keputusan`
- Berlaku di **SEMUA fasa** (saringan, SF, final)

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
```

## Panduan Admin
- Route: `/admin/panduan` → `Panduan.jsx`
- 5 tab: Setup · Pendaftaran · Hari Pertandingan · Hadiah & Laporan · Tetapan Lanjutan
- 21 langkah bernombor, setiap langkah ada penerangan + syarat perlu + butang navigasi terus
- Butang guna `gp_kej_aktif` sessionStorage untuk resolve kejId
- Entry 'Panduan' dalam sidebar admin (group Utama, bawah Dashboard)

## Files Penting
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

## Security — Firestore Rules (AUDIT DIPERLUKAN)

**Rating semasa: 2.5/5 — BELUM SELAMAT untuk peringkat daerah/negeri**

### Isu Kritikal
- `write: if isAuth()` terlalu luas — Anonymous Auth mudah didapat, sesiapa boleh tulis
- Cross-tenant write tidak disekat — user sekolah A boleh tulis ke sekolah B
- `/tetapan`, `/atlet`, `/rekod` boleh ditulis oleh mana-mana authenticated user
- Tiada audit log — tidak boleh kesan siapa yang buat perubahan

### Yang Perlu Difix
```js
// Tukar dari:
allow write: if isAuth();
// Kepada:
allow write: if canAccessSchool(schoolId);
// Untuk pencatat (Anonymous Auth + PIN):
allow write: if canAccessSchool(schoolId) || isPencatat(schoolId);
```

### Risiko Mengikut Skala
| Senario | Selamat? |
|---|---|
| Sekolah sendiri, sorang admin | ✅ OK |
| Beberapa sekolah, kejohanan daerah | ⚠️ Perlu fix |
| Ramai sekolah, kejohanan negeri/kebangsaan | 🔴 Mesti fix dulu |

**TODO: Fix Firestore rules sebelum deploy ke peringkat daerah/negeri**

## Jangan Buat
- Jangan bina `separuh_akhir` dalam dropdown manual
- Jangan bagi `grantMedal: true` pada bukan acara `akhir`
- Jangan tukar route startlist ke StartListSetup semula
- Jangan ubah logic multi-tenant — HANYA UI/UX boleh diubah
- Jangan guna `h.peringkat` dalam heat doc — field itu tidak wujud, guna `h.fasa`
- Jangan simpan `noKP` dalam heat docs, rekod, medal_tally, tuntutan (PDPA — public readable)
- Jangan deploy ke peringkat daerah/negeri sebelum Firestore rules diketatkan
