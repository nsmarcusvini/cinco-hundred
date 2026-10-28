import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { routePreload } from './scripts/route-preload.ts'

export default defineConfig({
  build: { manifest: true }, // usado por scripts/check-budgets.mjs
  plugins: [
    react(),
    tailwindcss(),
    routePreload(),
    VitePWA({
      strategies: 'injectManifest', // service worker próprio (src/sw.ts) para receber push
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false, // registrado em src/main.tsx
      manifest: {
        name: 'Cinco Hundred',
        short_name: 'Cinco Hundred',
        description: 'Junte R$ 125.250 bloco a bloco.',
        lang: 'pt-BR',
        start_url: '/app',
        display: 'standalone',
        background_color: '#f4f1e8',
        theme_color: '#0b3d2e',
        icons: [
          { src: '/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: { globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico}'] },
      devOptions: { enabled: true, type: 'module' },
    }),
  ],
})
