import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
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
    // Tingkatkan had warning (PDF libs memang besar)
    chunkSizeWarningLimit: 600,
  },
})
