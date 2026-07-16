import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/**
 * El cliente se sirve como sitio estático (Vercel/Netlify/Cloudflare Pages).
 * En desarrollo, Vite proxyea Socket.IO al servidor de juego local; en
 * producción el cliente se conecta a VITE_SERVER_URL.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@aether/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
