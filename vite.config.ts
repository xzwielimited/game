import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: 'client',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  resolve: {
    alias: {
      '@common': path.resolve(__dirname, 'common'),
    },
  },
  server: {
    port: 3000,
    host: true,
  },
});
