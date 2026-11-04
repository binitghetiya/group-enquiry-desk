import { createProvider } from './ai/provider';
import { createApp } from './app';
import { loadConfig } from './config/env';
import { openDb } from './db/db';

const config = loadConfig();
const db = openDb(config.dbPath);
const llm = createProvider(config.ai);
const app = createApp({ config, db, llm });

// Bind to loopback only: this is a local assessment prototype.
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
