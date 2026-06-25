---
name: project_prasekolah_kiv
description: "Idea kejohanan pra-sekolah KIV — repo + Firebase project berasingan dari KOAM. Belum mula, hanya bincang."
metadata: 
  node_type: memory
  type: project
  originSessionId: d20a2b2f-6c86-4d80-a811-8babdba50f5f
---

## Status: KIV (18 Jun 2026)

User cadang bina sistem kejohanan untuk **pra-sekolah** sahaja, berasingan dari KOAM (yang untuk SR/SM).

## Cadangan Aku (untuk rujukan bila user revisit):

**Opsyen pilihan: Repo + Firebase project berasingan**
- Folder baru: `~/Desktop/olahragaPraSekolah/`
- Firebase project baru: cth `kejohanan-prasekolah-kemaman`
- Hosting URL baru: `kejohanan-prasekolah.web.app`
- Firestore DB berasingan — total isolation

**Sebab:**
- KOAM live dengan data sebenar — risiko break tinggi kalau multi-tenancy
- Pra-sekolah berbeza sangat: tiada saringan/final, tiada rekod tahunan, peserta umur 4-6, format acara fun-based
- Free tier Firebase cukup untuk 2 project (50K reads/day each)

**Bukan pilihan:**
- Multi-tenancy dalam KOAM sama (Opsyen 2) — risiko cross-contamination tinggi
- Branch berbeza dengan code share (Opsyen 3) — cognitive load tinggi untuk solo dev

## Soalan Yang User Perlu Jawab Bila Revisit:

1. Berapa peserta pra-sekolah? (impact: Firebase tier)
2. Berapa kerap dianjurkan?
3. Siapa pengurus pasukan?
4. Fitur KOAM mana yang TAK perlu untuk pra-sekolah?
5. Fitur khas pra-sekolah yang KOAM tak ada?

## Phase Plan (kalau dibangun):

- **Phase 1 (1-2 hari):** Copy KOAM → ubah Firebase config → deploy baru
- **Phase 2 (3-7 hari):** Buang fitur tak perlu (StartList complex, Rekod, Medal Tally jenisSekolah)
- **Phase 3:** Custom UI/branding pra-sekolah

User cakap "peming, malas fikir, KIV" — tunggu user revisit.
