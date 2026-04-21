import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    // Avoid wildcard binds on Windows that can fail with EACCES on reserved/excluded ports.
    host: process.env.HOST || '127.0.0.1',
    port: parseInt(process.env.PORT || '5173'),
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.services__api__http__0 || process.env.services__api__https__0 || 'http://localhost:5208',
        changeOrigin: true,
        secure: false
      },
      '/hubs': {
        target: process.env.services__api__http__0 || process.env.services__api__https__0 || 'http://localhost:5208',
        changeOrigin: true,
        secure: false,
        ws: true
      }
    }
  }
})
