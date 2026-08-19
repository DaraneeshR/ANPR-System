import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Keeps the frontend origin-clean: /api, /storage and /demo-frames all
      // go to the FastAPI server.
      '/api': 'http://127.0.0.1:8000',
      '/storage': 'http://127.0.0.1:8000',
      '/demo-frames': 'http://127.0.0.1:8000',
    },
  },
})
