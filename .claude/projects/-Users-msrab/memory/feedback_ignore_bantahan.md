---
name: feedback_ignore_bantahan
description: "Bantahan + rasmi/tidak_rasmi flow — IGNORE, jangan sebut, jangan cadang buang, jangan debug"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 1e75eee1-2133-4651-803c-b283bd6c0e7e
---

Jangan sentuh, sebut, atau cadang ubah mana-mana kod berkaitan:
- `bantahan` collection + `dalam_bantahan` status
- `rasmi` / `tidak_rasmi` flow (statusKeputusan lama)
- `bantahanDiterima` field

**Why:** User tidak guna flow ini langsung. Sistem dah beralih ke flow baru (`diterima`). Kod lama masih ada tapi tidak aktif. Setiap kali aku sebut atau "tersilap baca" kod lama ini, ia mengelirukan debug dan perbincangan.

**How to apply:** Bila baca kod dan jumpa `bantahan`, `rasmi`, `tidak_rasmi`, `bantahanDiterima` — SKIP, anggap dead code. Jangan sebut dalam debug, jangan cadang fix, jangan cadang buang. Kekal biar sahaja.
