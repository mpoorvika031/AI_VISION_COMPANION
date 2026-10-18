import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// `npm run dev`        -> http://localhost:5173 (camera works on localhost)
// `npm run dev:https`  -> https://<your-pc-ip>:5173 with a self-signed certificate,
//                         needed to test the camera from a phone on the same Wi-Fi.
export default defineConfig(({ mode }) => ({
  plugins: [react(), mode === 'https' ? basicSsl() : null].filter(Boolean),
  server: { host: true, port: 5173 },
  build: { chunkSizeWarningLimit: 2500 },
}))
