export default function LesenTamat({ lessenTamat, onLogout }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="max-w-sm w-full bg-white rounded-2xl shadow-lg border border-red-100 overflow-hidden">
        <div className="bg-red-600 px-6 py-5 text-center">
          <svg className="w-10 h-10 text-white mx-auto mb-2" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          <p className="text-white font-black text-lg tracking-wide">SISTEM DITUTUP</p>
        </div>
        <div className="px-6 py-6 text-center space-y-3">
          <p className="text-sm font-semibold text-gray-800">Tempoh langganan sistem telah tamat.</p>
          {lessenTamat && (
            <p className="text-xs text-gray-500">
              Tarikh tamat: <span className="font-bold text-red-600">{lessenTamat}</span>
            </p>
          )}
          <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-xs text-gray-500 text-left space-y-1">
            <p>Untuk menyambung semula akses sistem:</p>
            <p>📞 Hubungi pentadbir Gold Podium untuk perbaharui langganan.</p>
          </div>
          {onLogout && (
            <button onClick={onLogout}
              className="w-full mt-2 py-2.5 rounded-xl text-xs font-bold text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors">
              Log Keluar
            </button>
          )}
        </div>
        <div className="px-6 py-3 border-t border-gray-100 text-center">
          <p className="text-[10px] text-gray-300">Gold Podium — Sistem Pengurusan Olahraga</p>
          <p className="text-[10px] text-gray-300">goldpodium.web.app</p>
        </div>
      </div>
    </div>
  )
}
