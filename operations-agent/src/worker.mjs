import { runAgent } from './agent.mjs';
import { safeError } from './policy.mjs';
export function startWorker(context){
 let stopped=false,timer;
 async function tick(){
  let connection,locked=false;
  try{
   connection=await context.store.pool.connect();
   locked=(await connection.query('SELECT pg_try_advisory_lock(791014216) AS locked')).rows[0].locked;
   if(locked && await context.store.schedule(context.config)){
    const job=await context.store.claim();
    if(job){try{await context.store.finishJob(job.id,'completed',await runAgent(job,context));}catch(e){await context.store.finishJob(job.id,'failed',JSON.stringify(safeError(e)));}}
   }
  }catch(e){console.error(JSON.stringify({event:'worker.failure',...safeError(e)}));}
  finally{if(connection){if(locked)await connection.query('SELECT pg_advisory_unlock(791014216)').catch(()=>{});connection.release();}if(!stopped)timer=setTimeout(tick,10000);}
 }
 tick();return ()=>{stopped=true;clearTimeout(timer);};
}
