import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { picwordProxy } from './server/proxyPlugin.ts';

export default defineConfig({
  // 相对路径部署：dist/ 拷到任何子目录都能用（纯静态部署时 AI 走浏览器直连）
  base: './',
  plugins: [react(), tailwindcss(), picwordProxy()],
  server: { port: 5173, host: '127.0.0.1' },
  preview: { port: 4173, host: '127.0.0.1' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
