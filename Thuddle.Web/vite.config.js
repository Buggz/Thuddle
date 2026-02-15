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
    host: true,
    port: parseInt(process.env.PORT || '5173'),
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.services__api__https__0 || process.env.services__api__http__0 || 'https://localhost:7100',
        changeOrigin: true,
        secure: false
      }
    }
  }
})
