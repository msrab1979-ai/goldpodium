---
name: Deploy — selalu Firebase live, bukan localhost
description: Bila user minta deploy atau test, selalu build + deploy ke Firebase Hosting, bukan jalankan dev server
type: feedback
originSessionId: 9574af08-ab42-4fb5-80cc-e8e7b0ebda5f
---
Bila user minta "deploy", "test", "check live", "semak" pada URL mssdkemaman-olahraga.web.app — selalu jalankan:

```bash
cd /Users/msrab/Desktop/olahragaKemaman && npm run build && firebase deploy --only hosting
```

**Why:** User test di URL live Firebase (mssdkemaman-olahraga.web.app), bukan localhost. Perubahan kod lokal tidak akan kelihatan sehingga di-deploy.

**How to apply:** Selepas sebarang perubahan kod yang diminta user untuk dilihat/test — terus build dan deploy tanpa perlu tanya.
