import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // Same-origin in development so the session cookie can stay SameSite=Strict.
    proxy: { '/api': { target: 'http://127.0.0.1:4000' } },
  },
  build: { sourcemap: false },
});
