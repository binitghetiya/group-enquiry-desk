import './config/dotenv';
import { fileURLToPath } from 'node:url';
import { createProvider } from './ai/provider';
import { createApp } from './app';
import { loadConfig } from './config/env';
import { openDb } from './db/db';

// Local and self-hosted runs serve the built React app from the same origin (production only).
const config = { ...loadConfig(), clientDist: fileURLToPath(new URL('../../client/dist', import.meta.url)) };
const db = await openDb(config.database);
const llm = createProvider(config.ai);
const app = createApp({ config, db, llm });

// Bind to loopback only: this is a local assessment prototype. Vercel uses src/vercel.ts instead.
const server = app.listen(config.port, '127.0.0.1', () => {
  console.log(`[server] Group Enquiry Desk API on http://127.0.0.1:${config.port} (AI provider: ${llm.name})`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
