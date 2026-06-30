import { useEffect } from 'react'

export function usePWATitle(nama) {
  useEffect(() => {
    if (!nama) return
    const title = `${nama} | Gold Podium`
    document.title = title
    // iOS ambil nama app dari meta tag ini
    let meta = document.querySelector('meta[name="apple-mobile-web-app-title"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'apple-mobile-web-app-title'
      document.head.appendChild(meta)
    }
    meta.content = nama
  }, [nama])
}
