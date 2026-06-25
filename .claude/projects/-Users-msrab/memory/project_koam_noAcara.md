---
name: KOAM — No Acara sebagai Kunci Sistem
description: No Acara adalah ID utama yang menghubungkan semua modul dalam sistem KOAM
type: project
originSessionId: 60446c49-f2f8-4b36-861f-71d6a2ed1d3e
---
No Acara adalah **primary key / document ID** untuk semua operasi dalam sistem KOAM.

**Why:** Setiap fungsi dalam sistem bergantung kepada No Acara sebagai penghubung.

**How to apply:** Setiap kali bina atau ubah mana-mana modul (keputusan, start list, PDF, jadual), pastikan No Acara digunakan sebagai rujukan utama — bukan nama acara atau ID auto-generate.

## Penggunaan No Acara

| Modul | Fungsi |
|-------|--------|
| Jadual Acara | Senarai acara, sort, filter |
| Input Keputusan | Pencatat pilih No Acara → masuk keputusan |
| Start List PDF | Generate by No Acara |
| Final List | Linked by No Acara |
| Keputusan Rasmi PDF | Filter by No Acara |
| Home Public View | Display + expand keputusan |
| Kategori Filter | Boleh query by noAcara atau kelas |

## Firestore Path

```
kejohanan/{kejohananId}/acara/{noAcara}          ← Doc ID = noAcara
kejohanan/{kejohananId}/acara/{noAcara}/heat/    ← Keputusan
jadual_acara/{kejohananId}-{noAcara}             ← Jadual public
```

## Format No Acara

- 3 digit: 101–517
- Hari 1: 101–137 (37 acara)
- Hari 2: 201–239 (39 acara)
- Hari 3: 301–330 (30 acara)
- Hari 4: 401–429 (29 acara)
- Hari 5: 501–517 (17 acara)
- **JUMLAH: 152 acara**

## Data Lengkap 2026

152 entri dalam JADUAL_2026 (bukan 62 lama).
Tarikh: 28 Jun – 2 Julai 2026, SMK Sultan Ismail Kemaman.
Saringan dan Akhir = DUA entri berasingan (contoh: 108=Saringan 100m P10, 122=Akhir 100m P10).
