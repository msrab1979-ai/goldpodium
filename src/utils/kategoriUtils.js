// ─── Utiliti kategori dikongsi (admin + PP + validasi) ────────────────────────
//
// Fix 2026-07-13: penapis jantina lama guna `lbl.startsWith('L'/'P')` — kod PPKI
// seperti BDL12/BDP12 (huruf jantina di tengah) tersingkir terus, semua atlet
// tenant PPKI dapat "Di luar julat kategori". Pengesanan jantina kini:
//   1) huruf L/P betul-betul sebelum digit (L12, P15, BDL12, BLP19)
//   2) fallback: huruf pertama label (kekalkan perangai lama utk tenant sedia ada)
//   3) tiada penanda → null = kategori unisex, layak semua jantina
//
// Kategori PPKI juga boleh beri BEBERAPA calon seumur (BDP12/BLP12/BPP12) —
// guna senaraiKategoriLayak() untuk semakan kelayakan, kiraKategori() hanya
// untuk paparan/nilai tunggal (deterministik: umurHad, urutan, kod).

export function jantinaKategori(k) {
  if (!k) return null
  for (const f of [k.kod, k.label, k.nama]) {
    const m = String(f || '').toUpperCase().match(/([LP])\d/)
    if (m) return m[1]
  }
  const first = String(k.label || k.nama || k.kod || '').toUpperCase().charAt(0)
  return first === 'L' || first === 'P' ? first : null
}

export function padanJantina(k, jantina) {
  const j = jantinaKategori(k)
  return j === null || j === jantina
}

export function layakUmurMSSM(tarikhLahir, umurHad, umurMin, tahunKejohanan) {
  if (!tarikhLahir || !umurHad || !tahunKejohanan) return true
  const tKej = Number(tahunKejohanan)
  const tarikhTerawal = new Date(`${tKej - Number(umurHad)}-01-02`)
  const tarikhTerkini = umurMin
    ? new Date(`${tKej - Number(umurMin) + 1}-01-01`)
    : new Date(`${tKej + 1}-01-01`)
  const tLahir = new Date(tarikhLahir)
  return tLahir >= tarikhTerawal && tLahir < tarikhTerkini
}

// Kategori default atlet — hanya tier umurHad TERENDAH yang layak (perangai asal;
// naik kategori mesti melalui kategoriOverride). Tier terendah boleh mengandungi
// beberapa kategori seumur (PPKI), sebab itu return array.
export function senaraiKategoriLayak(tarikhLahir, jantina, tahunKejohanan, kategoriList = []) {
  if (!tarikhLahir || !tahunKejohanan) return []
  const calon = kategoriList
    .filter(k => {
      if (!k.kod || !k.umurHad) return false
      const lbl = (k.label || k.nama || k.kod || '').toUpperCase()
      if (lbl.includes('OPEN') || lbl.includes('TERBUKA')) return false
      if (!padanJantina(k, jantina)) return false
      return layakUmurMSSM(tarikhLahir, k.umurHad, k.umurMin, tahunKejohanan)
    })
    .sort((a, b) =>
      Number(a.umurHad) - Number(b.umurHad) ||
      Number(a.urutan ?? 99) - Number(b.urutan ?? 99) ||
      String(a.kod).localeCompare(String(b.kod))
    )
  if (calon.length === 0) return []
  return calon.filter(k => Number(k.umurHad) === Number(calon[0].umurHad))
}

export function kiraKategori(tarikhLahir, jantina, tahunKejohanan, kategoriList = []) {
  const calon = senaraiKategoriLayak(tarikhLahir, jantina, tahunKejohanan, kategoriList)
  return calon.length ? calon[0].kod : null
}

// Kelas warna badge kategori — ikut jantina yang dikesan, bukan huruf pertama.
export function warnaBadgeKategori(k, label = '') {
  const j = jantinaKategori(k || { label })
  if (j === 'L') return 'bg-blue-100 text-blue-700'
  if (j === 'P') return 'bg-pink-100 text-pink-700'
  const lbl = String(label || k?.label || k?.nama || k?.kod || '').toUpperCase()
  if (lbl.includes('OPEN') || lbl.includes('TERBUKA')) return 'bg-violet-100 text-violet-700'
  return 'bg-gray-100 text-gray-500'
}
