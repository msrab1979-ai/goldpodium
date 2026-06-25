---
name: TODO selepas audit pendaftaran
description: Fitur & fix yang ditangguhkan — dibina selepas pendaftaran audit selesai
type: project
originSessionId: 9574af08-ab42-4fb5-80cc-e8e7b0ebda5f
---
Selepas audit pendaftaran selesai, bina perkara berikut:

1. **Analisa pendaftaran matrix** — table acara × sekolah dengan kiraan slot (view + PDF)
2. **Borang pendaftaran peserta** — per sekolah, ditandatangani, save as PDF
3. **Laporan status pendaftaran** — overview semua sekolah, save as PDF
4. **Fix noBib race condition** — guna Firestore transaction untuk assign noBib
5. **Semak pencatat (InputKeputusan)** — aliran keputusan + statusAcara update
6. **Home.jsx KeputusanExpanded** — pastikan final heat view betul

**Why:** User minta semak pendaftaran dahulu secara menyeluruh, tangguhkan yang lain.
**How to apply:** Buka TODO ini bila pendaftaran dah stabil dan user minta fitur baru.
