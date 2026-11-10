import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const REQUIRED_ENV = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // These are baked into the bundle at build time. Without them the bundler
  // drops the whole app as unreachable and still reports success, so fail the
  // build instead of publishing a blank site (e.g. a Netlify site missing them).
  if (command === 'build') {
    const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
    const missing = REQUIRED_ENV.filter((name) => !env[name])
    if (missing.length) {
      throw new Error(
        `Missing ${missing.join(', ')}. Set them in .env.local (local) or in Netlify → Site configuration → Environment variables.`,
      )
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
