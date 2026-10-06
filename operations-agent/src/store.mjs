import { randomUUID } from 'node:crypto';
export class Store {
  constructor(pool){this.pool=pool;}
  async audit(actor,event,resourceId,detail={}){await this.pool.query('INSERT INTO ez_agent.audit(actor,event,resource_id,detail) VALUES($1,$2,$3,$4)',[actor,event,resourceId,detail]);}
  async enqueue(actor,prompt){const id=randomUUID();await this.pool.query('INSERT INTO ez_agent.jobs(id,requested_by,prompt) VALUES($1,$2,$3)',[id,actor,prompt]);return id;}
  async jobs(){return (await this.pool.query('SELECT * FROM ez_agent.jobs ORDER BY created_at DESC LIMIT 50')).rows;}
  async actions(){return (await this.pool.query('SELECT * FROM ez_agent.actions ORDER BY created_at DESC LIMIT 100')).rows;}
  async propose(jobId,kind,payload,reason){
    const id=randomUUID();
    await this.pool.query('INSERT INTO ez_agent.actions(id,job_id,kind,payload,reason) VALUES($1,$2,$3,$4,$5)',[id,jobId,kind,payload,reason]);
    await this.audit('agent','action.proposed',id,{kind});return {id,status:'pending',kind,payload,reason};
  }
  async decide(id,actor,approve){
    const {rows}=await this.pool.query(`UPDATE ez_agent.actions SET status=$3,decided_by=$2,decided_at=now()
      WHERE id=$1 AND status='pending' AND expires_at>now() RETURNING *`,[id,actor,approve?'executing':'rejected']);
    return rows[0];
  }
  async finishAction(id,status,result){await this.pool.query('UPDATE ez_agent.actions SET status=$2,result=$3 WHERE id=$1 AND status=\'executing\'',[id,status,result]);}
  async finishJob(id,status,result){await this.pool.query('UPDATE ez_agent.jobs SET status=$2,result=$3,finished_at=now() WHERE id=$1',[id,status,result]);}
  async claim(){return (await this.pool.query(`UPDATE ez_agent.jobs SET status='running',started_at=now() WHERE id=(
    SELECT id FROM ez_agent.jobs WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`)).rows[0];}
  async schedule(config){
    await this.pool.query(`UPDATE ez_agent.jobs SET status='failed',result='Worker interrupted; rerun the read-only investigation.',finished_at=now()
      WHERE status='running' AND started_at<now()-interval '10 minutes'`);
    await this.pool.query(`UPDATE ez_agent.actions SET status='needs_reconciliation' WHERE status='executing' AND decided_at<now()-interval '10 minutes'`);
    await this.pool.query(`UPDATE ez_agent.actions SET status='expired' WHERE status='pending' AND expires_at<=now()`);
    const count=Number((await this.pool.query("SELECT count(*) FROM ez_agent.jobs WHERE started_at>now()-interval '24 hours'")).rows[0].count);
    if(count>=config.MAX_RUNS_PER_DAY) return false;
    const last=(await this.pool.query("SELECT created_at FROM ez_agent.jobs WHERE requested_by='scheduler' ORDER BY created_at DESC LIMIT 1")).rows[0];
    if(!last || Date.now()-new Date(last.created_at).getTime()>config.MONITOR_MINUTES*60000){
      await this.enqueue('scheduler','Run a complete operations review: application health, AWS, billing, webhook processing, uploads and evidence records, and GitHub CI. Report observed failures, coverage gaps, priorities and concrete next steps. Read relevant source files when investigating. Propose a specific action only when evidence supports it.');
    }
    return true;
  }
}
