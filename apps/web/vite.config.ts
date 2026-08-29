import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// SPA statique (Cloudflare Pages en prod). En dev, le Worker tourne sur :8787
// (`pnpm dev:server`) et Vite proxifie API + WebSockets.
export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/auth': 'http://127.0.0.1:8787',
      '/admin': 'http://127.0.0.1:8787',
      '/ws': { target: 'ws://127.0.0.1:8787', ws: true },
    },
  },
});
