---
name: PendaftaranSetup — dua lokasi mesti fix serentak
description: PendaftaranSetup.jsx ada DUA komponen berasingan dengan logik yang sama — fix satu MESTI fix keduanya sekaligus
type: feedback
originSessionId: 6ef9f8ad-7edd-4a5b-9de4-c7de4e63b4ba
---
PendaftaranSetup.jsx ada DUA komponen dengan logik pendaftaran berasingan:
- **TabPendaftaran** (~line 2483) — untuk admin/superadmin
- **TabPP** (~line 3600+) — untuk pengurus_pasukan

Mana-mana perubahan pada logik ini MESTI dilakukan pada KEDUA lokasi serentak:
- `KAT_BY_JENIS` — peta jenis sekolah → senarai kategoriKod
- `katDibenar` — kategori yang dibenarkan untuk sekolah semasa
- `acaraIkutSekolah` — penapis acara berdasarkan katDibenar
- Sebarang logik filtering/validation lain yang berkaitan

**Why:** User sangat kecewa bila fix dibuat separuh (satu lokasi sahaja) — terpaksa balik semula untuk fix yang sama di lokasi kedua. Ini double kerja yang tidak perlu.

**How to apply:** Sebelum commit fix dalam PendaftaranSetup, WAJIB grep untuk pattern yang sama di seluruh fail dan fix SEMUA lokasi dalam satu commit.
