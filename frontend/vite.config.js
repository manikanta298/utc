import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  build: {
    // Raise warning limit — recharts/socket.io are just big
    chunkSizeWarningLimit: 600,

    rollupOptions: {
      output: {
        manualChunks: {
          // Core React — cached separately, rarely changes
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],

          // State + HTTP — small, separate chunk
          'vendor-utils': ['zustand', 'axios', 'date-fns', 'react-hot-toast'],

          // Heavy UI libs — split so main bundle stays light
          'vendor-charts': ['recharts'],
          'vendor-icons':  ['lucide-react'],
          'vendor-socket': ['socket.io-client'],
        },
      },
    },
  },

  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://utc-cafe.onrender.com',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'https://utc-cafe.onrender.com',
        ws: true,
      },
    },
  },
});
