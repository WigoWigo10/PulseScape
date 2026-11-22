import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages de projeto: https://wigowigo10.github.io/PulseScape/ (P2.1, D20).
  // Em desenvolvimento o app também fica em http://localhost:5173/PulseScape/.
  base: '/PulseScape/',
  plugins: [react()],
})
