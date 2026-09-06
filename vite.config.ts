import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The desktop shell (Tauri) attaches to this exact port, so it must not drift.
export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  clearScreen: false,
  server: { port: 5199, strictPort: true },
})
