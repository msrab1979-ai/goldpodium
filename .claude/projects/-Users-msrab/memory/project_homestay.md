---
name: project-homestay
description: "Homestay Chukai Utama Kemaman — Firebase website, admin panel, SEO status"
metadata: 
  node_type: memory
  type: project
  originSessionId: c8602bab-335b-48c7-9abe-aeccccad776c
---

# Homestay Chukai Utama Kemaman

## Project Info
- **Folder**: `~/Desktop/homestay/`
- **Firebase Project**: `homestaykemaman-dbdcc`
- **Live URL**: https://homestaykemaman-dbdcc.web.app
- **Admin URL**: https://homestaykemaman-dbdcc.web.app/admin.html
- **Admin Password**: `msrab1979`
- **GitHub**: https://github.com/msrab1979-ai/homestaykemaman

## Owner Info
- **No Tel/WA**: 019-976 1693 (format Firebase: 60199761693)
- **Alamat**: 15295 Taman Pandan, Jalan Cukai Utama 2, 24000 Chukai, Terengganu
- **Koordinat**: lat 4.223241, lng 103.41758
- **Google Maps link**: https://maps.app.goo.gl/pNFeJoK86tsGzBFq8

## Stack
- Vanilla HTML/CSS/JS (tiada framework)
- Firebase Hosting + Firestore + Storage + Analytics
- Firebase CLI version 15.13.0

## Struktur Fail
```
homestay/
├── firebase.json
├── firestore.rules
├── storage.rules
├── .firebaserc
└── public/
    ├── index.html          ← home page (SEO optimized)
    ├── admin.html          ← admin panel
    ├── googlebbe5a9772492fde1.html  ← Google Search Console verify
    ├── sitemap.xml
    ├── robots.txt
    ├── css/
    │   ├── style.css
    │   └── admin.css
    └── js/
        ├── main.js         ← nav, lightbox, gear icon, password modal
        ├── home.js         ← Firebase loader (module)
        └── admin.js        ← admin panel (module)
```

## Firestore Structure
```
config/homestay → {nama, tagline, alamat, noWa, noTel, kemudahan[], mapsEmbed, updatedAt}
galeri/{id}    → {url, storagePath, caption, order, createdAt}
```

## Kemudahan Semasa
- ❄️ Air Cond
- 🍳 Dapur Lengkap
- 🚗 Parking Luas
- 📺 TV Astro NJOI
- 🛏️ 3 Bilik Tidur
- 🚿 2 Bilik Air
- 💧 Penapis Air Cuckoo

## Lokasi Berdekatan
- 🏖️ Pantai Monica Bay — 5km
- 🎓 Kolej Kemahiran Tinggi Malaysia — 5km
- 🏢 Ranaco — 2km
- 🏥 Hospital — 2km
- 🏦 Bank — 0.5km
- 🛒 Pasaraya Nirwana — 0.3km
- 🕌 Masjid Pengkalan Pandan — 0.1km

## SEO Status (29 Mei 2026)
- Google Search Console: ✅ Verified
- Sitemap: submitted (status "Couldn't fetch" — cached error, sitemap OK)
- Google Index: Belum indexed (website baru)
- Target keywords: homestay kemaman, homestay chukai, homestay chukai kemaman, homestay cukai
- Google Business Profile: ✅ Ada (4.7⭐, 60 reviews) — nama "homestay kemaman - chukai utama"
- Rank #1: "homestay chukai" ✅
- Rank kalah: "homestay kemaman" — perlu tambah Service Area dalam GBP

## Pending / TODO
- [ ] Upload gambar sebenar homestay (guna admin panel → Tab Galeri)
- [ ] Update info di Admin panel (nama, no tel, alamat) → simpan ke Firestore
- [ ] Tambah Service Area "Kemaman" dalam Google Business Profile
- [ ] Update description GBP dengan keywords
- [ ] Custom domain homestaykemaman.com.my (optional)
- [ ] Google Business Profile video verification (pending)
- [ ] Sitemap status tunggu Google re-crawl

## Deploy Command
```bash
cd ~/Desktop/homestay
firebase deploy --only hosting --project homestaykemaman-dbdcc
```

## Cara Admin
1. Klik ⚙️ gear icon bawah kiri website
2. Password: msrab1979
3. Tab Info → edit maklumat → Simpan
4. Tab Galeri → upload gambar homestay
