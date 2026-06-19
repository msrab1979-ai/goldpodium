/**
 * BukuKejohananLinkSetup — /dashboard/buku-kejohanan-link-setup
 *
 * Admin setup pautan Buku Kejohanan (PDF) untuk Home page awam.
 * Simpan ke: tetapan/bukuKejohananLink
 *
 * NOTA: Document berasingan dari tetapan/bukuKejohanan (yang menyimpan
 * cover custom untuk PDF Buku Kejohanan generator).
 */

import AksesPantasSetup from '../../components/admin/AksesPantasSetup'

export default function BukuKejohananLinkSetup() {
  return (
    <AksesPantasSetup
      docId="bukuKejohananLink"
      title="Buku Kejohanan"
      icon="📖"
      gradient="from-blue-600 to-blue-800"
      description="Kongsi pautan PDF Buku Kejohanan (rekod rasmi, keputusan, atlet pemenang) untuk muat turun awam dari Home page."
      urlPlaceholder="https://drive.google.com/file/d/.../view"
      contohPenerangan="Contoh: Rekod rasmi & atlet pemenang"
    />
  )
}
