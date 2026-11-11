import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const live = Boolean(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY);
  // Live builds swap the demo backend (which contains demo answer keys) for an
  // empty stub, so correct answers never ship in the production JavaScript.
  const demoModule = live ? './src/backend/demoDisabled.js' : './src/backend/demoBackend.js';
  return {
    plugins: [react()],
    resolve: {
      alias: { 'metr-demo-backend': fileURLToPath(new URL(demoModule, import.meta.url)) },
    },
    build: { target: 'es2020', sourcemap: false },
  };
});
