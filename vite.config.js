import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'logo192.png', 'logo512.png'],
      manifest: {
        name: 'Gold Podium',
        short_name: 'Gold Podium',
        description: 'Sistem Pengurusan Kejohanan Sukan',
        start_url: '/',
        display: 'standalone',
        background_color: '#003399',
        theme_color: '#003399',
        orientation: 'portrait',
        icons: [
          { src: '/logo192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/logo512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2}', '**/logo192.png', '**/logo512.png'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'firebase-cache', networkTimeoutSeconds: 10 },
          },
        ],
      },
    }),
  ],
  build: {
    minify: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/jspdf') || id.includes('node_modules/jspdf-autotable')) {
            return 'vendor-pdf'
          }
          if (id.includes('node_modules/firebase')) {
            return 'vendor-firebase'
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) {
            return 'vendor-react'
          }
          if (id.includes('node_modules/dompurify')) {
            return 'vendor-dompurify'
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
})
