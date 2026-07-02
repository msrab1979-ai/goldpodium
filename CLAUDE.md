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
  atlet/{atletId}
  tetapan/home          — logo, tajuk
  tetapan/waConfig      — lorong config
```

## Files Penting
- `src/pages/admin/AcaraSetup.jsx` — setup acara + peringkat flow
- `src/pages/admin/StartList.jsx` — 2-panel start list (AKTIF)
- `src/pages/admin/StartListSetup.jsx` — lama, tidak digunakan untuk admin
- `src/pages/admin/InputKeputusan.jsx` — input result + jana finalis
- `src/pages/pencatat/InputKeputusan.jsx` — pencatat version
- `src/utils/startListPdfUtils.js` — PDF generation shared utils
- `src/utils/finalistUtils.js` — algoritma pilih finalis

## Jangan Buat
- Jangan bina `separuh_akhir` dalam dropdown manual
- Jangan bagi `grantMedal: true` pada bukan acara `akhir`
- Jangan tukar route startlist ke StartListSetup semula
