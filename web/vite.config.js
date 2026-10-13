import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// In production Vercel serves web/api/*.js as serverless functions.
// In `npm run dev` this plugin routes the same files through Vite,
// so there is exactly one copy of the server code.
const API_ROUTES = {
  '/api/register': '/api/register.js',
  '/api/resend-pass': '/api/resend-pass.js',
};

function localApi(env) {
  return {
    name: 'local-api',
    configureServer(server) {
      // Make .env values (server-only ones too) visible to the API handlers in dev.
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined) process.env[key] = value;
      }
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0];
        const file = API_ROUTES[path];
        if (!file) return next();
        try {
          const mod = await server.ssrLoadModule(file);
          await mod.default(req, res);
        } catch (err) {
          console.error(`[local-api] ${path} failed`, err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'SERVER_ERROR' }));
          }
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), localApi(env)],
    server: { port: 3000 },
  };
});
