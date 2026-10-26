import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/zustand')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'icons-vendor';
          }
          if (id.includes('/src/engine/') || id.includes('/src/store/') || id.includes('/src/services/') || id.includes('/src/utils/')) {
            return 'engine-store';
          }
          if (id.includes('/src/components/Modals/')) {
            return 'modals';
          }
        },
      },
    },
  },
})
