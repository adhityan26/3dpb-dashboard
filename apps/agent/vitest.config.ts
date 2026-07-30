import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    // `.build-win-deploy/` (scripts/build-win.mjs) is a full `pnpm deploy`
    // snapshot of this package's own source, including its test files --
    // without this exclude, vitest double-collects every test from inside
    // it (duplicate describe blocks, doubled file count).
    exclude: [...configDefaults.exclude, '.build-win-deploy/**']
  },
  resolve: {
    alias: {
      '@': path.resolve('src/renderer')
    }
  }
})
