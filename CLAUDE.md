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

## Files Penting
- `src/pages/admin/AcaraSetup.jsx` — setup acara + peringkat flow
- `src/pages/admin/StartList.jsx` — 2-panel start list (AKTIF)
- `src/pages/admin/InputKeputusan.jsx` — input result + jana finalis
- `src/pages/admin/Rekod.jsx` — rekod S/D/N/K, tuntutan, semak, PDF
- `src/pages/admin/BukuKejohanan.jsx` — PDF buku kejohanan
- `src/pages/pencatat/InputKeputusan.jsx` — pencatat version
- `src/pages/pengurus/SijilPenyertaanPP.jsx` — PP muat turun sijil penyertaan
- `src/pages/pengurus/SijilPencapaianPP.jsx` — PP muat turun sijil pencapaian
- `src/pages/SchoolLanding.jsx` — halaman public (jadual/keputusan/rekod)
- `src/utils/postRasmiUtils.js` — rekod detection + medal_tally + mata_olahragawan
- `src/utils/rekodUtils.js` — fetch rekod S/D/N/K per acara
- `src/utils/finalistUtils.js` — algoritma pilih finalis
- `src/utils/startListPdfUtils.js` — PDF generation shared utils

## Jangan Buat
- Jangan bina `separuh_akhir` dalam dropdown manual
- Jangan bagi `grantMedal: true` pada bukan acara `akhir`
- Jangan tukar route startlist ke StartListSetup semula
- Jangan ubah logic multi-tenant — HANYA UI/UX boleh diubah
