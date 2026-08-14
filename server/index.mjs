import { createApp } from './app.mjs';
import { loadConfig } from './config.mjs';
import { createDatabase, runMigrations } from './db.mjs';
import { createS3Storage } from './storage.mjs';
import { createStripeBilling } from './billing.mjs';

const config = loadConfig();
const database = createDatabase(config);
const storage = createS3Storage(config);
const billing = createStripeBilling(config);

await runMigrations(database);

const app = createApp({ database, config, storage, billing });
const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(JSON.stringify({
    level: 'info',
    message: 'EZ Copyright API listening',
    port: config.port,
    environment: config.nodeEnvironment,
  }));
});

async function shutdown(signal) {
  console.log(JSON.stringify({ level: 'info', message: 'Shutting down', signal }));
  server.close(async () => {
    await database.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
