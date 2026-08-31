// ── acaraPaparUtils — nombor acara untuk PAPARAN ──────────────────────────────
//
// KENAPA WUJUD
// Nombor acara ialah ID dokumen Firestore (`acara/101`). Firestore tidak boleh
// menamakan semula dokumen, dan nombor itu dirujuk di enam tempat:
//   heat.aceraId · heatId (`101-H1`) · pendaftaran.acaraIds[] · parentAcaraId
//   mata_olahragawan.acaraDetail_101 · medal_tally.contrib_101-H1_*
// Menukar ID sebenar akan meyatimkan semua rujukan itu.
//
// Penyelesaian: ID kekal, tetapi acara boleh membawa `noAcaraPapar` — nombor
// yang dilihat orang. Contoh: acara saringan 101 yang ditukar menjadi terus
// final boleh dipaparkan sebagai 201 (nombor final), sedangkan dokumennya
// kekal `101` dan setiap rujukan kekal utuh.
//
// PERATURAN
//  • Guna noAcaraPapar(acara) untuk SEMUA teks yang dilihat pengguna —
//    jadual, start list, PDF, sijil, papan keputusan.
//  • JANGAN gunakannya untuk mencari, memadan, atau menulis dokumen. Carian
//    dan rujukan silang mesti kekal menggunakan `acara.id` / `noAcara`.
//  • Medan ini pilihan. Acara tanpa `noAcaraPapar` (majoriti) berkelakuan
//    persis seperti sebelum ini — tiada migrasi diperlukan.

/**
 * Nombor acara untuk dipaparkan kepada pengguna.
 * Jatuh balik ke nombor sebenar apabila tiada nombor paparan ditetapkan.
 * @param {object} acara — doc acara
 * @returns {string} nombor untuk dipapar (sentiasa string, '' jika tiada)
 */
export function noAcaraPapar(acara) {
  if (!acara) return ''
  const papar = acara.noAcaraPapar
  // Terima 0 sebagai nilai sah; tolak null/undefined/'' sahaja
  if (papar !== null && papar !== undefined && String(papar).trim() !== '') {
    return String(papar).trim()
  }
  return String(acara.noAcara ?? acara.aceraId ?? acara.id ?? '')
}

/**
 * Adakah acara ini memaparkan nombor berbeza daripada ID sebenarnya?
 * Berguna untuk memberi admin petunjuk visual dalam skrin pengurusan.
 */
export function adaNoPapar(acara) {
  if (!acara) return false
  const papar = acara.noAcaraPapar
  if (papar === null || papar === undefined || String(papar).trim() === '') return false
  return String(papar).trim() !== String(acara.noAcara ?? acara.id ?? '')
}

/**
 * Label untuk skrin admin: tunjuk kedua-dua nombor bila ia berbeza,
 * supaya admin sentiasa tahu ID sebenar acara yang sedang diurus.
 * Contoh: "201 (ID: 101)" atau hanya "101".
 */
export function labelAcaraAdmin(acara) {
  const papar = noAcaraPapar(acara)
  if (!adaNoPapar(acara)) return papar
  return `${papar} (ID: ${acara.noAcara ?? acara.id})`
}

/**
 * Sahkan nombor paparan yang dimasukkan admin.
 * Menolak nilai yang akan mengelirukan atau berlanggar dengan acara lain.
 * @param {string} nilai — input admin
 * @param {object} acara — acara yang sedang diubah
 * @param {Array}  acaraList — semua acara dalam kejohanan (untuk semak perlanggaran)
 * @returns {{ok: boolean, ralat?: string, nilai?: string}}
 */
export function sahkanNoPapar(nilai, acara, acaraList = []) {
  const bersih = String(nilai ?? '').trim()

  // Kosong bermakna "kembali kepada nombor sebenar" — sentiasa dibenarkan
  if (bersih === '') return { ok: true, nilai: '' }

  if (bersih.length > 12) {
    return { ok: false, ralat: 'Nombor paparan terlalu panjang (maksimum 12 aksara).' }
  }

  // Sama dengan nombor sebenar → tiada gunanya menyimpannya
  if (bersih === String(acara?.noAcara ?? acara?.id ?? '')) {
    return { ok: true, nilai: '' }
  }

  // Berlanggar dengan ID sebenar acara LAIN — dua baris akan kelihatan sama
  const langgarId = acaraList.find(a => a.id !== acara?.id && String(a.noAcara ?? a.id) === bersih)
  if (langgarId) {
    return { ok: false, ralat: `Nombor ${bersih} sudah digunakan oleh acara sebenar (${langgarId.namaAcara || langgarId.id}).` }
  }

  // Berlanggar dengan nombor paparan acara lain
  const langgarPapar = acaraList.find(a => a.id !== acara?.id && String(a.noAcaraPapar ?? '').trim() === bersih)
  if (langgarPapar) {
    return { ok: false, ralat: `Nombor ${bersih} sudah dipakai sebagai nombor paparan oleh acara ${langgarPapar.noAcara || langgarPapar.id}.` }
  }

  return { ok: true, nilai: bersih }
}
