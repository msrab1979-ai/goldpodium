import { useState, useEffect } from 'react'

// Detect iOS
function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream
}

// Detect standalone mode (already installed)
function isInStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showAndroid, setShowAndroid] = useState(false)
  const [showIOS, setShowIOS] = useState(false)

  useEffect(() => {
    if (isInStandaloneMode()) return

    if (isIOS()) {
      const dismissed = localStorage.getItem('gp_pwa_ios_dismissed')
      if (!dismissed) setShowIOS(true)
      return
    }

    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      const dismissed = localStorage.getItem('gp_pwa_android_dismissed')
      if (!dismissed) setShowAndroid(true)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function handleInstallAndroid() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setShowAndroid(false)
    }
    setDeferredPrompt(null)
  }

  function dismissAndroid() {
    localStorage.setItem('gp_pwa_android_dismissed', '1')
    setShowAndroid(false)
  }

  function dismissIOS() {
    localStorage.setItem('gp_pwa_ios_dismissed', '1')
    setShowIOS(false)
  }

  // Android prompt
  if (showAndroid) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:w-80">
        <div className="bg-white rounded-xl shadow-2xl border border-gray-200 p-4 flex items-start gap-3">
          <img src="/logo192.png" alt="Gold Podium" className="w-12 h-12 rounded-xl flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 text-sm">Pasang Gold Podium</p>
            <p className="text-gray-500 text-xs mt-0.5">Tambah ke skrin utama untuk akses lebih pantas</p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleInstallAndroid}
                className="flex-1 bg-blue-700 text-white text-xs font-semibold py-1.5 rounded-lg hover:bg-blue-800 transition-colors"
              >
                Pasang
              </button>
              <button
                onClick={dismissAndroid}
                className="flex-1 bg-gray-100 text-gray-600 text-xs font-semibold py-1.5 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Nanti
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // iOS instructions
  if (showIOS) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50">
        <div className="bg-white rounded-xl shadow-2xl border border-gray-200 p-4">
          <div className="flex items-start gap-3">
            <img src="/logo192.png" alt="Gold Podium" className="w-12 h-12 rounded-xl flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-gray-900 text-sm">Pasang Gold Podium</p>
              <p className="text-gray-500 text-xs mt-0.5 mb-3">Tambah ke skrin utama iPhone/iPad</p>
              <ol className="text-xs text-gray-700 space-y-1.5">
                <li className="flex items-center gap-2">
                  <span className="bg-blue-100 text-blue-700 rounded-full w-5 h-5 flex items-center justify-center font-bold flex-shrink-0">1</span>
                  Tekan ikon <span className="inline-block mx-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="inline w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                  </span> (Share) di bawah Safari
                </li>
                <li className="flex items-center gap-2">
                  <span className="bg-blue-100 text-blue-700 rounded-full w-5 h-5 flex items-center justify-center font-bold flex-shrink-0">2</span>
                  Pilih <strong>"Add to Home Screen"</strong>
                </li>
                <li className="flex items-center gap-2">
                  <span className="bg-blue-100 text-blue-700 rounded-full w-5 h-5 flex items-center justify-center font-bold flex-shrink-0">3</span>
                  Tekan <strong>"Add"</strong>
                </li>
              </ol>
            </div>
          </div>
          <button
            onClick={dismissIOS}
            className="mt-3 w-full bg-gray-100 text-gray-600 text-xs font-semibold py-2 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Faham, terima kasih
          </button>
        </div>
      </div>
    )
  }

  return null
}
