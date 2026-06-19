/**
 * BukuProgramSetup — /dashboard/buku-program-setup
 *
 * Admin setup pautan Buku Program untuk Home page awam.
 * Simpan ke: tetapan/bukuProgram
 */

import AksesPantasSetup from '../../components/admin/AksesPantasSetup'

export default function BukuProgramSetup() {
  return (
    <AksesPantasSetup
      docId="bukuProgram"
      title="Buku Program"
      icon="📋"
      gradient="from-orange-500 to-red-500"
      description="Kongsi pautan PDF Buku Program (jadual acara, peraturan, maklumat peserta) untuk rujukan awam sebelum dan semasa kejohanan."
      urlPlaceholder="https://drive.google.com/file/d/.../view"
      contohPenerangan="Contoh: Jadual & maklumat acara"
    />
  )
}
