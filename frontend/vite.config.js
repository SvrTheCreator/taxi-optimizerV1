import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Такси Оптимизатор',
        short_name: 'Такси',
        description: 'Оптимизация маршрутов такси',
        theme_color: '#FFDD2D',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  server: {
    host: true,  // слушает на 0.0.0.0 — доступно с телефона в той же сети
    port: 5173,
    // proxy перенаправляет запросы /api/* на бэкенд во время разработки
    // так фронтенд думает что бэкенд это он сам, нет проблем с CORS
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
