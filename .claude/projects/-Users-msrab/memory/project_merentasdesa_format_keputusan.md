---
name: project-merentasdesa-format-keputusan
description: Format keputusan PDF + Buku Kejohanan Merentas Desa — rujukan dari gambar MSSM Labuan 2026
metadata: 
  node_type: memory
  type: project
  originSessionId: 252d00ea-8be6-4f69-8c8b-a3de54c29d43
---

# Format Keputusan — Rujukan MSSM Merentas Desa

**Sumber:** Gambar IMG_0440, IMG_0441, IMG_0442 dari MSSM Merentas Desa, Kompleks Sukan Laut Antarabangsa, WP Labuan, 23-26 April 2026.

**PENTING:** PDF report DAN Buku Kejohanan mesti guna format ini sebagai rujukan reka bentuk.

---

## 1 — KEPUTUSAN INDIVIDU (per kategori)

Format jadual (rujuk IMG_0442):
```
Header: Logo + Nama Kejohanan + Tarikh
Tajuk:  KEPUTUSAN INDIVIDU - [KATEGORI] (cth: L 18)

KED | BIB  | NAMA                          | PASUKAN         | MASA
 1  | P162 | HAKIMIE AL-MUHANNIF            | MSS JOHOR       | 27:57
 2  | P155 | SHEIKH NAIF AL MUKMIN          | MSS JOHOR       | 28:36
...
DNF | ...  | ...                            | ...             | DNF
```

- Kolum: KED, BIB, NAMA, PASUKAN, MASA
- DNF dipapar di bawah sekali
- Font: standard serif/sans, header besar

---

## 2 — KEPUTUSAN BERPASUKAN (per kategori)

Format jadual (rujuk IMG_0441):
```
Header: Logo + Nama Kejohanan + Tarikh
Tajuk:  KEPUTUSAN BERPASUKAN - [KATEGORI] (cth: L 18)

KED | PASUKAN              | MATA
 11 | MSS PULAU PINANG     |  159
        BIB   NAMA
        P162  Muhammad Fiqz...
        P164  Jayden Goh...
        P165  Ryan Yeap...
        P63   Danish Hakal...
 12 | MSS PAHANG           |  191
        ...
DNF | MSS xxx              |
        BIB  NAMA  (atlet yang DNF)
```

- Tunjuk nama atlet dikira di bawah setiap pasukan (indent)
- Tunjuk BIB + NAMA atlet
- DNF pasukan ditunjuk juga
- Kolum utama: KED, PASUKAN, MATA

---

## 3 — PUNGUTAN MATA (keseluruhan — SK berasingan dari SM)

Format jadual (rujuk IMG_0440):
```
Header: Logo + Nama Kejohanan + Tarikh
Tajuk:  PUNGUTAN MATA

KED | NAMA PASUKAN    | P12        | L12        | JUMLAH    ← SK
                        Mata  Ked   Mata  Ked    MATA

KED | NAMA PASUKAN    | P15  P18   L15   L18    | JUMLAH    ← SM
                       M  K  M  K  M  K  M  K    MATA
```

Contoh baris SM (dari gambar):
```
 1  | MSS SELANGOR   | 75  2  53  2  46  2  56  2  70  2 | 559
 2  | MSS JOHOR      | 84  3 133  7 108  6  42  1  48  1 | 510
DNQ | ...
```

- Sub-kolum setiap kategori: **Mata** + **Ked** (kedudukan berpasukan)
- DNQ sekolah dipapar di bawah
- Jumlah = gabungan semua mata kategori
- **SK berasingan** (L12+P12) dan **SM berasingan** (L15+P15+L18+P18)

---

## Logic Skor (disahkan oleh user)

- Skor pasukan per kategori = jumlah kedudukan terbaik N atlet (N = `kiraanPasukan`)
- Syarat layak = `minLayak` atlet mesti finish
- Kurang dari minLayak → ikut `kaedahKurang` (DNQ atau ambil semua)
- DNQ mana-mana kategori → **DNQ keseluruhan** dalam pungutan mata
- Pungutan mata SK dan SM = **dua jadual berasingan**

---

## PPKI

Ditangguhkan. Ada logic khusus — selesaikan SK+SM dulu.

**Why:** User minta simpan format ini sebagai rujukan untuk bina PDF report dan Buku Kejohanan.  
**How to apply:** Bila bina PDF/cetak feature, guna layout ini — kolum, susunan, header format.
