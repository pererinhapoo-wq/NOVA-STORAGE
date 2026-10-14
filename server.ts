import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { app } from './src/server/app.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);

// Frontend integration: Vite middleware in development, static build in production container
if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(__dirname, 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.resolve(distPath, 'index.html'));
  });
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: {
      middlewareMode: true,
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[NOVA STORAGE] Servidor backend ativo na porta ${PORT}`);
  console.log(`[NOVA STORAGE] Rota de integridade disponível em http://localhost:${PORT}/api/health`);
});
