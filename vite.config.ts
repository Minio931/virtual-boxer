/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import tailwindcss from '@tailwindcss/vite';

// HTTPS jest wymagane: przeglądarka w telefonie da dostęp do kamery tylko na stronie https.
// Serwer sygnalizacyjny (server/signaling.mjs) działa na porcie 8787; Vite przekazuje do niego /ws i /api,
// więc telefon łączy się z jednym adresem.
const SIGNAL = `localhost:${process.env.SIGNAL_PORT ?? 8787}`;

const proxy = {
  '/ws': { target: `ws://${SIGNAL}`, ws: true },
  '/api': { target: `http://${SIGNAL}` },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), basicSsl()],
  server: { host: true, port: 5173, proxy },
  preview: { host: true, port: 4173, proxy },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
