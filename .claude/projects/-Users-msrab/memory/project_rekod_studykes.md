---
name: KOAM Rekod — Study Kes & Format
description: Format rekod dalam start list, keputusan badge rekod baru, olahragawan rekod pecah — untuk implementasi masa depan
type: project
originSessionId: a1662eb6-df4e-4c16-a1e7-60a71f2a1485
---
## A. Format Rekod dalam Start List PDF

Rekod muncul sebagai table kecil DI ANTARA header acara dan jadual heat/peserta.

### Kolum yang betul:
| Rekod | Tahun | Masa/Jarak | Nama | Catatan |
|-------|-------|------------|------|---------|
| Daerah | 1990 | 10.90s | Ali bin Ahmad | SK Teluk Kalong |
| Negeri | 1993 | 9.87s | Abu Hassan | Daerah Kemaman |
| Kebangsaan | 2020 | 7.99s | Ahmad Zikri | Terengganu |

- "Prestasi" → tukar ke **"Masa/Jarak"**
- "Pemegang" → tukar ke **"Nama"**
- Kolum **"Catatan"** = konteks lokasi:
  - Daerah → nama sekolah pemegang rekod
  - Negeri → nama daerah
  - Kebangsaan → nama negeri
- Jika tiada rekod → row tetap ada, nilai = "—" (blank)
- Emoji icon TIDAK sesuai untuk PDF (render issue) — guna teks sahaja: "Daerah", "Negeri", "Kebangsaan"

### Format rekod Firestore yang sesuai:
```
rekod/{rekodKey}
  namaAcara: '100m'
  jantina: 'L'
  kategoriKod: 'C'
  peringkat: 'D' | 'N' | 'K'
  prestasi: 10.90  (nombor — format semasa paparan)
  unit: 's' | 'm'
  tarikhRekod: '1990-06-15'  (YYYY-MM-DD — ambil tahun sahaja untuk paparan)
  namaAtlet: 'Ali bin Ahmad'
  namaSekolah: 'SK Teluk Kalong'   ← untuk Daerah (kolum Catatan)
  namaDaerah: 'Kemaman'            ← untuk Negeri (kolum Catatan)
  namaNeigeri: 'Terengganu'        ← untuk Kebangsaan (kolum Catatan)
```

**Why:** Kolum Catatan perlu data konteks lokasi yang berbeza mengikut peringkat.
**How to apply:** Bila implement rekod dalam start list, fetch 3 doc (D, N, K) menggunakan rekodKey, render table sebelum jadual atlet.

---

## E. Baiki Orphan — 1 fix merangkumi saringan + final

rekodKey TIDAK mengandungi fasa (saringan/final/terus_final).
Jadi `100m saringan` dan `100m final` → SAMA key: `100M_L_C_D`.
Satu baiki orphan auto merangkumi semua fasa untuk namaAcara tersebut.

Dropdown label cadangan: `[noAcara] namaAcara · fasa` — info context sahaja, bukan pilihan berasingan.

**Why:** Fasa bukan sebahagian rekod library — rekod adalah per-acara, bukan per-fasa.
**How to apply:** Jangan buat 2 rekod untuk 100m saringan dan 100m final. Satu rekod sahaja.

---

## D. Pattern rekodKey — WAJIB ikut

`rekodKey = namaAcaraPendek_jantina_kategoriKod_peringkat` (uppercase, non-alphanumeric → `_`)

**Kritikal**: Guna `namaAcaraPendek || namaAcara` — BUKAN `namaAcara` sahaja.
- `namaAcara` = nama penuh e.g. "100m L Bwh 12"
- `namaAcaraPendek` = nama pendek e.g. "100m"
- Rekod dalam Firestore disimpan guna `namaAcaraPendek` → mesti match

**KRITIKAL**: `postRasmiUtils.js` mesti cuba kedua-dua format juga — jika tidak, akan cipta rekod palsu bila rekod lama ada tapi key tidak match.
Fix 2026-05-18: postRasmiUtils kini sama dengan rekodUtils — cuba `[kategoriKod, kelasDariNama]`.

**Fail yang perlu ikut pattern ini (9 lokasi, 8 fail)**:
- `rekodUtils.js` — `(namaAcaraPendek || namaAcara || '').trim()`
- `postRasmiUtils.js` — rekodNama variable
- `Home.jsx` — rekodNama variable
- `StartList.jsx` — guna `cariRekodUntukAcara()` dari rekodUtils ✅
- `CetakAcara.jsx`, `CetakKeputusan.jsx` (x3), `BukuKejohanan.jsx`, `Olahragawan.jsx` (x2)
- `Rekod.jsx` — sengaja `form.namaAcara` (admin input borang — betul)

**Why:** Rekod lama tidak papar jika guna namaAcara penuh.
**How to apply:** Bila tambah mana-mana lookup rekod baru, SENTIASA guna `namaAcaraPendek || namaAcara`.

---

## B. Study Kes — Keputusan Menu: Badge Rekod Baru

Apabila keputusan dimasukkan dan system detect rekod baru:
- Tunjukkan **stripe/badge "REKOD BARU"** pada row atlet dalam jadual keputusan
- Warna: merah/emas mencolok
- Klik badge → popup/modal tunjukkan:
  - Rekod LAMA: peringkat, nama, prestasi, tahun
  - Rekod BARU: nama atlet, prestasi baru, tarikh
  - Perbandingan delta (selisih masa/jarak)

**Why:** Untuk dokumentasi rasmi dan mudah kesan siapa pecah rekod semasa.
**How to apply:** Dalam InputKeputusan/KeputusanRasmi, selepas simpan keputusan, compare dengan rekod collection. Jika prestasi baru lebih baik → set flag `isPecahRekod: true` pada keputusan doc.

---

## C. Study Kes — Olahragawan Menu: Rekod Pecah

Dalam halaman Olahragawan (murid terbaik):
- Tunjukkan **badge rekod** jika atlet pernah pecah rekod dalam kejohanan ini
- Rekod pecah = olahragawan istimewa untuk dokumentasi
- Berguna untuk cari atlet terbaik secara manual

**Why:** Dokumentasi rasmi + mudah cadang wakil ke peringkat lebih tinggi.
**How to apply:** Query keputusan dengan flag `isPecahRekod: true`, cross-reference dengan noKP atlet.
