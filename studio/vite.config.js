import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The studio frontend (5173) proxies API calls to the Express backend (5177).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5177',
    },
  },
});
