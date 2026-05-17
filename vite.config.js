import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Use mkcert-generated certificates if available, otherwise fall back to basicSsl.
// Run: mkcert localhost 192.168.88.38  (or your IP) in the project root
// to generate trusted SSL certs that work on Android too.
const certPath = path.resolve('./localhost+1.pem');
const keyPath = path.resolve('./localhost+1-key.pem');
const hasCerts = fs.existsSync(certPath) && fs.existsSync(keyPath);

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm', 'sqlite-vec-wasm'],
  },
  server: {
    https: hasCerts ? {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    } : undefined,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-site',
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
        ws: true,
        configure: (proxyServer) => {
          // Suppress harmless WS teardown errors (ECONNRESET, socket ended)
          // that occur when the browser closes the WebSocket connection while
          // Vite is running over HTTPS. These are not real errors.
          proxyServer.on('error', (err) => {
            const harmless = ['ECONNRESET', 'EPIPE', 'ENOTCONN'];
            const harmlessMsg = ['socket has been ended', 'read ECONNRESET'];
            const isHarmless = harmless.includes(err.code) ||
              harmlessMsg.some(m => err.message?.includes(m));
            if (!isHarmless) console.error('[Proxy Error]', err.message);
          });
        }
      }
    }
  },
  worker: {
    format: 'es',
  },
})
