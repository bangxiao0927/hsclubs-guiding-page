import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

// The built app is served by src/serve.ts out of web/dist. In development the API comes from a
// running `npm run serve`, so the two halves are never mocked against each other.
export default defineConfig({
  plugins: [react(), tailwind()],
  server: { proxy: { '/api': 'http://127.0.0.1:4180' } },
  build: { outDir: 'dist', emptyOutDir: true },
})