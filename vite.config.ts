import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import veauryVitePlugins from 'veaury/vite/esm/index.mjs';

export default defineConfig({
  plugins: [
    veauryVitePlugins({
      type: 'react',
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/account-service': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, req) => {
            console.log('[proxy error]', req.url, err.message);
          });
          proxy.on('proxyReq', (_proxyReq, req) => {
            console.log('[proxy req]', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req) => {
            console.log('[proxy res]', req.url, proxyRes.statusCode);
          });
        },
      },
      '/master-service': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/stock-service': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
      },
      '/search-service': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ai-service': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
