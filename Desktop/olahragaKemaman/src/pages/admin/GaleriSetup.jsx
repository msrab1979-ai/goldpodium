/**
 * GaleriSetup — /dashboard/galeri-setup
 *
 * Admin setup pautan Galeri Gambar untuk Home page awam.
 * Simpan ke: tetapan/galeri
 */

import AksesPantasSetup from '../../components/admin/AksesPantasSetup'

export default function GaleriSetup() {
  return (
    <AksesPantasSetup
      docId="galeri"
      title="Galeri Gambar"
      icon="📸"
      gradient="from-purple-500 to-indigo-600"
      description="Kongsi pautan Google Photos atau Drive folder untuk galeri gambar kejohanan. Akan dipaparkan dalam section Akses Pantas di Home page awam."
      urlPlaceholder="https://photos.google.com/share/..."
      contohPenerangan="Contoh: Lihat momen terbaik kejohanan"
    />
  )
}
