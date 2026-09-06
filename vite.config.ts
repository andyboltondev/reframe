import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// The desktop shell (Tauri) attaches to this exact port, so it must not drift.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Registration is done by hand in src/platform/registerSW.ts so that a
      // new build waits for the next launch instead of reloading a page that
      // may be mid-conversion.
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Reframe — Convert. Resize. Optimise.',
        short_name: 'Reframe',
        description:
          'Convert, resize and optimise images entirely on your own device. ' +
          'Nothing is uploaded.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#f6f6f7',
        theme_color: '#2f6df6',
        categories: ['graphics', 'photo', 'utilities'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
        // The AVIF encoder alone is ~3.5 MB; without this it would be skipped
        // and offline conversion would fail for exactly the formats that need
        // the WebAssembly fallback.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        // Let the running page finish on the build it started with.
        clientsClaim: false,
        skipWaiting: false,
      },
      devOptions: { enabled: false },
    }),
  ],
  worker: { format: 'es' },
  // The codec glue is pre-bundled emscripten output; letting esbuild
  // pre-optimise it breaks the wasm loading path.
  optimizeDeps: { exclude: ['@jsquash/webp', '@jsquash/avif'] },
  clearScreen: false,
  server: { port: 5199, strictPort: true },
})
