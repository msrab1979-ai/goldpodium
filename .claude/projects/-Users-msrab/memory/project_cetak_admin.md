---
name: Cetak Admin Menu
description: Draf menu cetakan admin — Buku Kejohanan & Keputusan by Day (belum dibina)
type: project
originSessionId: a1662eb6-df4e-4c16-a1e7-60a71f2a1485
---
# Menu Cetakan Admin (Belum Dibina)

Dua item dalam menu cetak admin:

## 1. Buku Kejohanan (PDF) — DRAF SIAP, belum bina + KIV: Publish Digital via Google Drive

**KIV — Publish Digital (13 Jun 2026):**
- Buku Kejohanan dijana SELEPAS kejohanan selesai (ada semua keputusan)
- Flow: Admin jana PDF → download → upload Google Drive → copy link → letak dalam TetapanHome
- Home page tunjuk butang "📖 Buku Kejohanan" → buka Google Drive link (tab baru)
- Kos = RM0 (Google Drive percuma, tiada Firebase reads)
- 500 pengguna dijangka — Google Drive mampu tanpa kos
- **Perlu bina**: field "Link Buku Kejohanan" dalam TetapanHome + butang dalam Home page
- **Bila bina**: selepas kejohanan selesai — KIV dulu

**2 mod cetak:**
- **Cetak Penuh** — satu PDF lengkap (Cover + Statistik + Semua Hari + Rekod)
- **Cetak Keputusan Hari** — dropdown pilih hari, PDF hari tersebut sahaja (Jadual + Keputusan)

**Struktur muka surat:**
- Muka 1: Cover — logo kiri+kanan (dari tetapan home), nama kejohanan, tarikh, tempat
- Muka 2: Statistik Penyertaan — jumlah sekolah/atlet (L/P)/acara, pecahan SR/SM/PPKI
- Muka 3+: Jadual & Keputusan by Hari — setiap hari mula muka baru, jadual acara + keputusan final di bawah setiap acara
- Muka terakhir: Rekod Kejohanan (dari `rekod` collection)
- Footer: Nama Kejohanan + Muka X/Y

**Data sources:**
- Logo: dari `tetapan/home` (logoKiri, logoKanan) — susun ikut protokol (kanan lebih utama)
- Keputusan final: heat `fasa: 'final'` atau `'terus_final'`, kedudukan emas/perak/gangsa/4/5 ikut setting
- Rekod: dari `rekod` collection

## 2. Cetakan Keputusan By Day — DRAF SIAP, belum bina

**Filter:**
- Pilih Hari: Hari 1 / Hari 2 / ... / Semua Hari
- Pilih Acara: Semua Acara / dropdown pilih acara tertentu

**Dua mod output:**
- **Heat to Final** — tunjuk semua heat, kemudian final di bawah (PDF sahaja)
- **Final Sahaja** — terus keputusan final, tiada heat (PDF + Excel)

**PDF Layout (setiap acara = satu block):**
- Header: No Acara · Nama Acara · Kategori · Jantina
- Heat 1, Heat 2... (jika mod Heat to Final): Nama | Sekolah | Masa/Jarak | Tempat
- Final: Nama | Sekolah | Masa/Jarak | Tempat (🥇/🥈/🥉/4/5) | Rekod indicator jika rekod baru
- Acara beregu: satu row per ahli, kolum sekolah = nama pasukan
- Acara tiada keputusan: skip atau "Belum Ada Keputusan"
- Spacing professional, tidak terlalu padat

**Excel Layout (Final Sahaja sahaja):**
- 1 hari = 1 sheet (nama: "Hari 1", "Hari 2"...)
- Kolum: No | Nama | Sekolah | Masa/Jarak | Tempat | Rekod
- Block per acara, spacer row antara acara

**Data sources:**
- Heat: subcollection heats dalam jadual_acara
- Final: heat fasa 'final' atau 'terus_final'
- Rekod: bandingkan dengan rekod collection
- Kedudukan: field kedudukan dalam heat results (emas/perak/gangsa/4/5 ikut setting)

## 3. Cetakan Acara — Slip Hadiah + Kertas Juruhebah — DRAF SIAP, belum bina

**Lokasi:** Urusetia + Admin + Pencatat panels

**Workflow:**
- Browse jadual ikut hari → pilih No Acara
- Satu butang `Cetak Acara` → generate 2 PDF serentak

**Slip Hadiah (PDF 1):**
- Header: Logo kiri+kanan, nama kejohanan
- No Acara, Nama Acara, Kategori, Jantina
- Tempat 🥇🥈🥉 + Nama + Sekolah + Masa/Jarak
- Rekod: rekod dipecahkan + rekod terkini (max 2 baris)
- Jika tiada rekod baru: tunjuk rekod terkini sahaja (1 baris)
- Margin: 15mm, font 10-12pt, nama pemenang bold

**Kertas Juruhebah (PDF 2):**
- 1 acara = 1 muka penuh, font besar
- Header: No Acara · Nama Acara · Kategori · Jantina (18pt)
- Jadual: Tempat | Nama (14pt bold) | Sekolah | Masa/Jarak — kedudukan 1-5
- Rekod baru (★) + rekod lama dipecahkan (max 2 baris)
- Margin: 15mm

**Data sources:**
- Keputusan: heat fasa 'final'/'terus_final'
- Rekod: rekod collection — rekod terkini & rekod yang dipecahkan
- Logo: tetapan/home (logoKiri, logoKanan)
