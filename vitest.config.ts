import { defineConfig } from 'vitest/config'

// The browser app in web/ is its own package with its own runner and a DOM environment; this
// project is the poller and the page server. Without the boundary, `npm test` here picks up
// web/src/*.test.tsx and fails on a missing document.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
})