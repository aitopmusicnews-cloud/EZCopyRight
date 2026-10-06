import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createRemoteJWKSet,jwtVerify } from 'jose';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { safeError } from './policy.mjs';
export function ownerVerifier(config,providedJwks){
 const issuer=`https://cognito-idp.${config.AWS_REGION}.amazonaws.com/${config.COGNITO_USER_POOL_ID}`;
 const jwks=providedJwks || createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
 return async token=>{const {payload}=await jwtVerify(token,jwks,{issuer,audience:config.COGNITO_CLIENT_ID,algorithms:['RS256']});
  if(payload.token_use!=='id'||!config.OWNER_SUBS.includes(payload.sub))throw new Error('Owner access required');return payload.sub;};
}
export function createServer({config,store,connectors,verify=ownerVerifier(config)}){
 const app=express();app.disable('x-powered-by');app.set('trust proxy',1);app.use(helmet({contentSecurityPolicy:{directives:{connectSrc:["'self'",config.COGNITO_DOMAIN]}}}));app.use(express.json({limit:'600kb'}));
 app.get('/health/live',(_req,res)=>res.json({ok:true}));
 app.get('/health/ready',async(_req,res)=>{try{await store.pool.query('SELECT 1 FROM ez_agent.state LIMIT 1');res.json({ok:true});}catch{res.status(503).json({ok:false});}});
 app.get('/config',(_req,res)=>res.json({origin:config.AGENT_ORIGIN,domain:config.COGNITO_DOMAIN,client_id:config.COGNITO_CLIENT_ID}));
 app.use('/api',rateLimit({windowMs:60000,limit:60,standardHeaders:'draft-8',legacyHeaders:false}));
 app.use('/api',async(req,res,next)=>{
  if(req.headers.origin && req.headers.origin!==config.AGENT_ORIGIN)return res.status(403).json({error:'Origin denied'});
  res.set('Cache-Control','no-store');
  try{const token=req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];if(!token)throw new Error();req.owner=await verify(token);next();}catch{res.status(401).json({error:'Sign in with an authorized owner account.'});}
 });
 app.get('/api/status',async(_req,res)=>res.json({writes_enabled:config.ENABLE_WRITES,stripe_mode:config.STRIPE_LIVE?'live':'test',monitor_minutes:config.MONITOR_MINUTES,max_refund_cents:config.MAX_REFUND_CENTS,repository:config.GITHUB_REPOSITORY,model:config.OPENAI_MODEL}));
 app.get('/api/jobs',async(_req,res)=>res.json(await store.jobs()));
 app.get('/api/actions',async(_req,res)=>res.json(await store.actions()));
 app.get('/api/audit',async(_req,res)=>res.json((await store.pool.query('SELECT actor,event,resource_id,detail,created_at FROM ez_agent.audit ORDER BY id DESC LIMIT 100')).rows));
 app.post('/api/jobs',rateLimit({windowMs:60000,limit:5}),async(req,res)=>{
  const {prompt}=z.object({prompt:z.string().trim().min(3).max(6000)}).strict().parse(req.body);
  const queued=Number((await store.pool.query("SELECT count(*) FROM ez_agent.jobs WHERE status IN ('queued','running')")).rows[0].count);
  if(queued>=20)return res.status(429).json({error:'The work queue is full. Wait for current tasks to finish.'});
  const id=await store.enqueue(req.owner,prompt);await store.audit(req.owner,'job.requested',id);res.status(202).json({id,status:'queued'});
 });
 app.post('/api/actions/:id/decision',async(req,res)=>{
  const id=z.string().uuid().parse(req.params.id);
  const {approve}=z.object({approve:z.boolean()}).strict().parse(req.body);
  if(approve && !config.ENABLE_WRITES)return res.status(403).json({error:'Actions are disabled. Enable writes in the deployment configuration first.'});
  const action=await store.decide(id,req.owner,approve);
  if(!action)return res.status(409).json({error:'Action is already decided or expired.'});
  await store.audit(req.owner,approve?'action.approved':'action.rejected',id,{kind:action.kind});
  if(!approve)return res.json({id,status:'rejected'});
  try{
   const result=await connectors.execute(action);
   await store.finishAction(id,'completed',result);await store.audit(req.owner,'action.completed',id,{kind:action.kind});res.json({id,status:'completed',result});
  }catch(e){
   const result=safeError(e);await store.finishAction(id,'needs_reconciliation',result);await store.audit(req.owner,'action.needs_reconciliation',id,{kind:action.kind});
   res.status(502).json({id,status:'needs_reconciliation',...result});
  }
 });
 app.use(express.static(fileURLToPath(new URL('../public',import.meta.url)),{index:'index.html'}));
 app.use((error,_req,res,_next)=>{const validation=error instanceof z.ZodError;res.status(validation?400:500).json(validation?{error:'Invalid request'}:safeError(error));});
 return app;
}
