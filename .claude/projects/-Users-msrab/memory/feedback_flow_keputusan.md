---
name: Flow Keputusan KOAM — Terus Publish
description: statusAcara='ada_keputusan' adalah state PUBLISHED, bukan draf — sistem tidak guna rasmi/tidak_rasmi lagi
type: feedback
originSessionId: 1e0ffaee-3bfb-45fe-977d-fa05ba6fac4a
---
Sistem KOAM **tidak lagi guna** flow `tidak_rasmi` → `rasmi` dalam tab Keputusan Home.

Flow semasa:
- Pencatat hantar keputusan → `statusKeputusan: 'diterima'`, `statusAcara: 'ada_keputusan'`
- postRasmi jalan terus → medal tally dikemaskini
- `ada_keputusan` = **PUBLISHED**, bukan draf

**Why:** User dah tukar flow — terus publish, tiada langkah "Sahkan Rasmi" berasingan.

**How to apply:**
- Filter tab Keputusan di Home mesti include `'ada_keputusan'`
- Jangan label `ada_keputusan` sebagai "DRAF" atau "SEMENTARA"
- Badge sepatutnya neutral: "KEPUTUSAN" sahaja
- Jangan sort/prioritize berdasarkan rasmi vs tidak_rasmi
