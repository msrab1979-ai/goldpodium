---
name: project-mssd-merentasdesa
description: "Sistem Merentas Desa MSSD Kemaman — Firebase + HTML/JS, auth tanpa Firebase Auth, pasukan login model, setup/collections semasa"
metadata: 
  node_type: memory
  type: project
  originSessionId: 22fd7155-657b-4723-b8ad-4306a96d6652
---

# Sistem Merentas Desa

**Stack:** Firebase Firestore + Hosting + HTML/CSS/JS + Tailwind CSS CDN + Vanilla JS ES Module  
**Firebase Project:** mssdkemaman-merentasdesa  
**GitHub:** https://github.com/msrab1979-ai/merentasdesakemaman  
**Folder Lokal:** `/Users/msrab/Desktop/mssdMerentasDesa`  
**Live URL:** https://mssdkemaman-merentasdesa.web.app

## Struktur Folder
```
public/
├── index.html              (Home — papan keputusan)
├── setup.html              (Setup awal DB — padam selepas guna)
├── admin/index.html        (Setup + pengurusan sistem)
├── pencatat/index.html     (Rekod keputusan semasa larian)
├── pengurus/index.html     (Daftar atlet per pasukan)
├── papan/
│   ├── individu.html
│   └── pasukan.html
└── js/
    ├── firebase-config.js  (Firestore sahaja — NO auth export)
    ├── auth.js             (sessionStorage login — NO Firebase Auth)
    ├── hash.js             (SHA256 noKP)
    └── pdf.js
```

## Firebase Config
```js
apiKey: "AIzaSyDcyYZaaLJbUcSGbKqv0eZ_EMb0Mimv6Gk"
projectId: "mssdkemaman-merentasdesa"
```

## Auth Model (PENTING — TIADA Firebase Auth)
Sistem guna **sessionStorage** sepenuhnya. Firebase Auth DIBUANG.

| Role | Login | Session Key |
|---|---|---|
| Admin / Pencatat | email + password → query `users` | `mssd_md_user` |
| Pengurus Pasukan | Kod Sekolah + PIN → query `pasukan` | `mssd_md_pasukan` |

**Lupa PIN (self-service):**
- Masuk Kod Sekolah + Email Sekolah → jika match → papar PIN semasa

**firebase-config.js** — export `db` sahaja (bukan `auth`)  
**auth.js** — fungsi: `login`, `logout`, `getUserData`, `onAuth`, `attachSessionListeners`, `auditLog`

## Collections Utama
- `/settings/main` — tetapan kejohanan: `namaB1`, `namaB2`, `namaB3`, `logoKiri`, `logoKanan`, `tarikhKejohanan`, `tarikhTutupPendaftaran`
- `/kategori/{id}` — kategori larian (jenis, jantina, umurMin/Max, hadDaftar, kiraanPasukan, minLayak, kaedahKurang)
- `/kumpulanLarian/{id}` — gabung beberapa kategori start serentak
- `/pasukan/{kodSekolah}` — **doc ID = kodSekolah** (uppercase), fields: nama, jenis(SK/SM/PPKI), bib, email, pin, aktif
- `/atlet/{id}` — noKPHash, noKPMask, noBib, bibAngka, pasukanId, kategoriId, jenis, aktif
- `/keputusan/{id}` — atletId, pasukanId, kategoriId, kedudukan, masa, adaMasa, statusAtlet(selesai/dns/dnf/dq)
- `/publikasi/{kategoriId}` — status draft/tidakRasmi/rasmi, dariKedudukan, hinggaKedudukan
- `/users/{docId}` — admin/pencatat sahaja, fields: nama, email, password, role, aktif
- `/auditLog/{id}` — semua aksi penting

## Tetapan Penting (/settings/main)
- `tarikhTutupPendaftaran` — Timestamp. Selepas tarikh ini pengurus tidak boleh daftar atlet.
- `tarikhKejohanan` — Timestamp. Dipapar di header home + header cetakan.
- `namaB1/B2/B3` — nama kejohanan 3 baris (B1=besar, B2=atas, B3=bawah)
- `logoKiri`, `logoKanan` — URL logo untuk header home + cetakan

## Pengurus — Gate (PENTING)
- Semak bib duplikat LUAR transaction (bukan dalam runTransaction), global (semua kategori)
- Semak KP duplikat GLOBAL — `where('noKPHash','==',hash).where('aktif','==',true)` tanpa filter kategoriId
- **Semak umur dari No KP** — ekstrak tahun lahir (2 digit pertama YYMMDD), kira umur = tahunKejohanan - tahunLahir, bandingkan dengan `umurMin`/`umurMax` kategori → SEKAT jika diluar had
- Live feedback semasa taip No KP (hijau = layak, merah = diluar had)
- `cadangBib()` query Firestore semua atlet pasukan (semua kategori), bukan semuaAtlet semasa

## Pencatat — Ciri-ciri (Jun 2026)
- Jadual keputusan: Ked | No Bib | Nama | Pasukan | Masa | Catatan | Tindakan
- Catatan: selesai / DNS / DNF / DQ
- Sunting dalam baris (inline edit) — tanpa modal
- **Penyemak Tally**: jumlah berdaftar vs direkod, panel "belum direkod" dengan butang DNS/DNF/DQ terus
- **Susun Semula by Masa**: atur semula kedudukan 1,2,3... tanpa lubang; DNS/DNF/DQ → kedudukan null
- **onSnapshot** (masa nyata) — semuaKeputusan dikemaskini automatik dari Firestore, duplikat bib disekat serta-merta
- **Optimistik UI** — rekod papar terus (tanpa tunggu Firestore), Firestore simpan di latar belakang
- Masa pilihan — boleh simpan tanpa masa, isi kemudian (klik sel kuning dalam jadual)
- Kedudukan auto (max+1) jika kosong
- 2 peranti boleh guna serentak: peranti 1 masuk Bib, peranti 2 isi masa
- Counter "X tiada masa" dalam bar statistik
- Bib disekat + butang Simpan digreyed jika bib sudah direkod

## Pencatat — Cetakan (Jun 2026)
Butang dalam **navbar** (sentiasa nampak): 📄 Individu | 🏫 Pasukan

**Cetakan Individu:**
- Header dinamik: namaB2 + namaB1(besar) + namaB3 + tarikh + logo kiri/kanan
- Jadual: KED | BIB | NAMA | PASUKAN | MASA
- DNS/DNF/DQ diasingkan di bawah dengan pemisah

**Cetakan Pasukan:**
- Header sama
- Format: KED | PASUKAN | MATA
- Di bawah setiap pasukan: BIB | NAMA | KED.IND (kedudukan individu)
- Baris jumlah: `(1 + 3 + 8 = 12)` untuk semak kesilapan
- DNQ pasukan di bawah + sebab (bilangan selesai vs minimum)
- Logik: kiraanPasukan terbaik, minLayak wajib, DQ tidak dikira

## Status Semasa (Jun 2026)
- ✅ Auth flow (admin, pencatat, pengurus)
- ✅ Pasukan setup (modal + jenis/bib/PIN)
- ✅ Pengurus login (kodSekolah+PIN + lupa PIN)
- ✅ Tarikh tutup pendaftaran (admin tetapkan, countdown di pengurus)
- ✅ Gate bib — global, luar transaction
- ✅ Gate KP — global semua kategori
- ✅ Semak umur dari No KP — sekat jika diluar umurMin/umurMax
- ✅ Pencatat — onSnapshot + optimistik UI + masa pilihan + 2 peranti
- ✅ Cetakan Individu + Pasukan (header dinamik dari settings)
- ⏳ Papan keputusan — belum diuji
- ⏳ PDF keputusan rasmi — belum dibina

**Why:** Sistem MSSD merentas desa lengkap tanpa Firebase Auth — lebih mudah setup, tiada kos tambahan.
