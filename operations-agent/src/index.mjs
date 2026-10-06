import pg from 'pg';
import { loadConfig } from './config.mjs';
import { databasePoolOptions } from './database.mjs';
import { Store } from './store.mjs';
import { Connectors } from './connectors.mjs';
import { createServer } from './server.mjs';
import { startWorker } from './worker.mjs';
const config=loadConfig();
const pool=new pg.Pool(databasePoolOptions(config,'runtime'));
const appDb=new pg.Pool(databasePoolOptions(config,'reader'));
// Enforce read-only on every application DB connection, in addition to SQL grants.
appDb.on('connect',client=>{client.query('SET default_transaction_read_only = on').catch(()=>client.end());});
const store=new Store(pool),connectors=new Connectors(config,appDb);
await pool.query('SELECT 1 FROM ez_agent.state LIMIT 1');
const context={config,store,connectors};
const server=createServer(context).listen(config.PORT,'0.0.0.0',()=>console.log('EZCopyRight agent listening'));
const stop=startWorker(context);
process.on('SIGTERM',()=>{stop();server.close();setTimeout(()=>process.exit(0),25000).unref();});
