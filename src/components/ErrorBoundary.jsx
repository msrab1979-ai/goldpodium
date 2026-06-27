/**
 * ErrorBoundary — React error catcher
 *
 * Tangkap render error dalam children component tree.
 * Bila ada crash → tunjuk UI mesej (bukan white page).
 * User boleh klik "Muat Semula" untuk reload page.
 *
 * Safety notes:
 *   - Pattern React standard (class component dengan componentDidCatch)
 *   - TIDAK sentuh Firestore / state / logic apa-apa
 *   - Bila tiada error → 100% invisible, render children macam biasa
 *   - Log error ke console untuk debug (admin boleh check)
 */

import { Component } from 'react'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      errorMsg: '',
    }
  }

  static getDerivedStateFromError(error) {
    // Update state supaya next render tunjuk fallback UI
    return {
      hasError: true,
      errorMsg: error?.message || 'Ralat tidak diketahui',
    }
  }

  componentDidCatch(error, errorInfo) {
    // Log untuk debug — admin boleh check console
    console.error('[KOAM ErrorBoundary]', error)
    console.error('[KOAM ErrorBoundary Stack]', errorInfo?.componentStack)
  }

  handleReload = () => {
    // Soft reload — clear state, retry render
    window.location.reload()
  }

  handleGoHome = () => {
    // Hard navigate ke home
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-gradient-to-br from-gray-50 to-blue-50">
          <div className="max-w-sm w-full">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 sm:p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-50 border-2 border-amber-200 flex items-center justify-center">
                <span className="text-3xl">⚠️</span>
              </div>

              <h1 className="text-base sm:text-lg font-bold text-gray-800 mb-2">
                Maaf, ada masalah memuatkan halaman
              </h1>

              <p className="text-xs text-gray-500 mb-1">
                Sila cuba muat semula halaman atau semak sambungan internet anda.
              </p>

              <p className="text-[10px] text-gray-400 mb-6">
                Jika masalah berterusan, hubungi admin sistem.
              </p>

              <div className="space-y-2">
                <button
                  onClick={this.handleReload}
                  className="w-full py-3 bg-[#003399] hover:bg-[#002280] text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
                >
                  🔄  Muat Semula Halaman
                </button>

                <button
                  onClick={this.handleGoHome}
                  className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold transition-colors"
                >
                  🏠  Kembali ke Laman Utama
                </button>
              </div>

              {/* Technical detail — hanya tunjuk kalau dalam dev mode */}
              {this.state.errorMsg && (
                <details className="mt-5 text-left">
                  <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-600">
                    Maklumat teknikal
                  </summary>
                  <pre className="mt-2 p-2 bg-gray-50 rounded text-[9px] text-gray-600 overflow-auto max-h-24 font-mono">
                    {this.state.errorMsg}
                  </pre>
                </details>
              )}
            </div>

            <p className="text-center text-[10px] text-gray-400 mt-4">
              Sistem KOAM · MSSD Kemaman
            </p>
          </div>
        </div>
      )
    }

    // Tiada error → render children macam biasa (zero impact)
    return this.props.children
  }
}

export default ErrorBoundary
