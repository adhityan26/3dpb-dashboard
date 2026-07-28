import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    // Default vitest excludes don't cover .claude/ — worktrees created there
    // (e.g. apps/dashboard/.claude/worktrees/<name>) carry their own full
    // node_modules, so leaving this unset lets vitest pick up a second,
    // physically distinct React/react-dom copy and duplicate test suites
    // from whatever commit that worktree happens to be on.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      '**/.claude/**',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
