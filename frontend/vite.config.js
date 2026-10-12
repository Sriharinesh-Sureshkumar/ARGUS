import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The backend's CORS allows only http://localhost:5173. Without
    // strictPort, Vite would silently move to 5174 when 5173 is busy and
    // every API call would fail with a CORS error. Fail loudly instead.
    strictPort: true,
  },
})
