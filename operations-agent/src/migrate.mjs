import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { poolOptions } from './config.mjs';
// Use a schema-owner migration login, never the production application owner.
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
const pool=new pg.Pool(poolOptions({DATABASE_SSL:process.env.DATABASE_SSL || 'true', DATABASE_CA:process.env.DATABASE_CA},process.env.DATABASE_URL));
try { await pool.query(await readFile(new URL('./migration.sql',import.meta.url),'utf8')); console.log('Agent schema ready'); }
finally { await pool.end(); }
