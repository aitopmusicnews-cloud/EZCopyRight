import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { Store } from '../src/store.mjs';
const sql=await readFile(new URL('../src/migration.sql',import.meta.url),'utf8');
async function fixture(t){const db=new PGlite();await db.exec(sql);t.after(()=>db.close());return {db,store:new Store(db)};}
test('PostgreSQL job claim is exclusive and persists report',async t=>{
 const {store}=await fixture(t);const id=await store.enqueue('owner','Review billing');const first=await store.claim();assert.equal(first.id,id);assert.equal(first.status,'running');assert.equal(await store.claim(),undefined);
 await store.finishJob(id,'completed','Healthy');const jobs=await store.jobs();assert.equal(jobs[0].result,'Healthy');assert.ok(jobs[0].finished_at);
});
test('PostgreSQL action transition rejects a second decision and preserves parameters',async t=>{
 const {store}=await fixture(t);const job=await store.enqueue('owner','Review');const action=await store.propose(job,'stripe_refund',{payment_intent:'pi_app',amount:500},'Requested refund');
 const first=await store.decide(action.id,'owner',true);assert.equal(first.status,'executing');assert.deepEqual(first.payload,{payment_intent:'pi_app',amount:500});assert.equal(await store.decide(action.id,'owner',true),undefined);
 await store.finishAction(action.id,'completed',{id:'re_app'});assert.equal((await store.actions())[0].status,'completed');
});
test('expired proposals cannot execute and interrupted actions are not replayed',async t=>{
 const {db,store}=await fixture(t);const job=await store.enqueue('owner','Review');const expired=await store.propose(job,'aws_deploy_api',{},'Review');const interrupted=await store.propose(job,'aws_deploy_api',{},'Review');
 await db.query("UPDATE ez_agent.actions SET expires_at=now()-interval '1 minute' WHERE id=$1",[expired.id]);assert.equal(await store.decide(expired.id,'owner',true),undefined);
 await store.decide(interrupted.id,'owner',true);await db.query("UPDATE ez_agent.actions SET decided_at=now()-interval '11 minutes' WHERE id=$1",[interrupted.id]);
 await store.schedule({MONITOR_MINUTES:15,MAX_RUNS_PER_DAY:120});const actions=await store.actions();assert.equal(actions.find(a=>a.id===expired.id).status,'expired');assert.equal(actions.find(a=>a.id===interrupted.id).status,'needs_reconciliation');
});
test('scheduled reviews do not accumulate every poll and daily budget stops work',async t=>{
 const {db,store}=await fixture(t);const config={MONITOR_MINUTES:15,MAX_RUNS_PER_DAY:1};assert.equal(await store.schedule(config),true);assert.equal(await store.schedule(config),true);assert.equal((await store.jobs()).length,1);
 await store.claim();assert.equal(await store.schedule(config),false);
 await db.query("UPDATE ez_agent.jobs SET started_at=now()-interval '11 minutes' WHERE status='running'");await store.schedule(config);assert.equal((await store.jobs())[0].status,'failed');
});
