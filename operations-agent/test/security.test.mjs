import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { validateAction,safePath,safeError } from '../src/policy.mjs';
import { ownerVerifier,createServer } from '../src/server.mjs';
import { dispatchTool,runAgent } from '../src/agent.mjs';
import { Connectors } from '../src/connectors.mjs';
import { loadConfig,poolOptions } from '../src/config.mjs';\nimport { databasePoolOptions } from '../src/database.mjs';
const owner='owner-sub';
const config={AWS_REGION:'us-west-2',COGNITO_USER_POOL_ID:'us-west-2_pool',COGNITO_CLIENT_ID:'agent-client',COGNITO_DOMAIN:'https://auth.example.com',OWNER_SUBS:[owner],AGENT_ORIGIN:'https://agent.example.com',ENABLE_WRITES:true,MAX_REFUND_CENTS:2500,STRIPE_LIVE:false,STRIPE_READ_KEY:'rk_test_dummy',STRIPE_WRITE_KEY:'rk_test_dummy',STRIPE_PRICE_ID:'price_app',STRIPE_PRODUCT_ID:'prod_app',OPENAI_MODEL:'test-model'};
test('refunds enforce positive integer cents, cap, exact payload and IDs',()=>{
 for(const amount of [-1,0,0.5,2501])assert.throws(()=>validateAction('stripe_refund',{payment_intent:'pi_abc',amount},config));
 assert.throws(()=>validateAction('stripe_refund',{payment_intent:'pi_abc',amount:1,destination:'acct_x'},config));
 assert.equal(validateAction('stripe_refund',{payment_intent:'pi_abc',amount:2500},config).amount,2500);
});
test('unregistered actions cannot become generic API or shell access',()=>{
 for(const kind of ['__proto__','toString','shell','stripe_payout','database_query'])assert.throws(()=>validateAction(kind,{},config));
});
test('repository access rejects traversal, secrets and dotfiles',()=>{
 for(const p of ['../secret','/etc/passwd','src/../../a','.env','src/.env.production','src/key.pem','a\\b','a//b','.git/config'])assert.throws(()=>safePath(p));
 assert.equal(safePath('server/app.mjs'),'server/app.mjs');
});
test('SDK errors cannot disclose tokens or request data',()=>{
 const out=JSON.stringify(safeError(Object.assign(new Error('sk_live_secret'),{code:'StripeError',request:{key:'secret'}})));
 assert.ok(!out.includes('secret'));assert.ok(out.includes('StripeError'));
});
test('database URL ssl options cannot disable verified TLS',()=>{
 const options=poolOptions({DATABASE_SSL:'true'},'postgres://u:p@host/db?sslmode=no-verify');
 assert.equal(options.ssl.rejectUnauthorized,true);assert.ok(!options.connectionString.includes('sslmode'));
});
test('IAM database auth uses dedicated DB roles and dynamic token callbacks',async()=>{
 const base={DATABASE_IAM_AUTH:true,DATABASE_HOST:'db.example.com',DATABASE_PORT:5432,DATABASE_NAME:'ezcopyright',DATABASE_RUNTIME_USER:'ez_agent_runtime',APP_DATABASE_USER:'ez_agent_app_reader',DATABASE_SSL:'true',AWS_REGION:'us-west-2'};
 const fake=()=>({getAuthToken:async()=> 'token'});
 const runtime=databasePoolOptions(base,'runtime',fake),reader=databasePoolOptions(base,'reader',fake);
 assert.equal(runtime.user,'ez_agent_runtime');assert.equal(reader.user,'ez_agent_app_reader');
 assert.equal(await runtime.password(),'token');assert.equal(runtime.ssl.rejectUnauthorized,true);
});
test('owner authentication verifies signature, audience, issuer, token use and sub',async()=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256');const jwk=await exportJWK(publicKey);jwk.kid='test';
 const verify=ownerVerifier(config,createLocalJWKSet({keys:[jwk]}));
 const sign=(extra={},aud='agent-client')=>new SignJWT({token_use:'id',...extra}).setProtectedHeader({alg:'RS256',kid:'test'}).setSubject(owner).setIssuer('https://cognito-idp.us-west-2.amazonaws.com/us-west-2_pool').setAudience(aud).setIssuedAt().setExpirationTime('5m').sign(privateKey);
 assert.equal(await verify(await sign()),owner);
 await assert.rejects(verify(await sign({token_use:'access'})));
 await assert.rejects(verify(await sign({},'other-client')));
 const nonOwner=ownerVerifier({...config,OWNER_SUBS:['different']},createLocalJWKSet({keys:[jwk]}));await assert.rejects(nonOwner(await sign()));
});
async function fixture(t,overrides={}){
 const id='11111111-1111-4111-8111-111111111111';let state='pending',calls=0;const audits=[];
 const store={pool:{query:async()=>({rows:[]})},jobs:async()=>[],actions:async()=>[],audit:async(...a)=>audits.push(a),decide:async(_id,_actor,approve)=>{if(state!=='pending')return;state=approve?'executing':'rejected';return {id,kind:'stripe_cancel_subscription',payload:{subscription:'sub_app'}};},finishAction:async(_id,s)=>{state=s;}};
 const connectors={execute:async()=>{calls++;if(overrides.fail)throw new Error('private secret');return {ok:true};}};
 const server=createServer({config:{...config,...overrides.config},store,connectors,verify:async token=>{if(token!=='owner')throw new Error();return owner;}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}`;
 const decision=(headers={},approve=true)=>fetch(base+`/api/actions/${id}/decision`,{method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'application/json',...headers},body:JSON.stringify({approve})});
 return {base,decision,get calls(){return calls;},get state(){return state;},audits};
}
test('HTTP API requires owner authorization and same origin',async t=>{
 const f=await fixture(t);assert.equal((await fetch(f.base+'/api/jobs')).status,401);
 assert.equal((await f.decision({Origin:'https://evil.example'})).status,403);assert.equal(f.calls,0);
});
test('duplicate simultaneous approval requests execute once',async t=>{
 const f=await fixture(t);const responses=await Promise.all([f.decision(),f.decision()]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal(f.calls,1);assert.equal(f.state,'completed');
});
test('rejection never calls execution',async t=>{const f=await fixture(t);assert.equal((await f.decision({},false)).status,200);assert.equal(f.calls,0);assert.equal(f.state,'rejected');});
test('operator kill switch prevents execution and leaves proposal pending',async t=>{
 const f=await fixture(t,{config:{ENABLE_WRITES:false}});assert.equal((await f.decision()).status,403);assert.equal(f.calls,0);assert.equal(f.state,'pending');
});
test('uncertain action result requires reconciliation, never automatic retry',async t=>{
 const f=await fixture(t,{fail:true});const first=await f.decision();assert.equal(first.status,502);assert.equal(f.state,'needs_reconciliation');assert.ok(!JSON.stringify(await first.json()).includes('private secret'));assert.equal((await f.decision()).status,409);assert.equal(f.calls,1);
});
test('model tool dispatcher cannot execute or approve',async()=>{
 await assert.rejects(dispatchTool('execute_action',{},{config}));await assert.rejects(dispatchTool('approve_action',{},{config}));
});
test('model can propose only validated actions, without calling provider writes',async()=>{
 let proposed;const result=await dispatchTool('propose_action',{kind:'stripe_refund',payload_json:'{"payment_intent":"pi_app","amount":500}',reason:'Owner asked for refund review'},{config,job:{id:'job'},store:{actions:async()=>[],propose:async(...args)=>{proposed=args;return {status:'pending'};}},connectors:{execute:()=>assert.fail('No writes from agent')}});
 assert.equal(result.status,'pending');assert.equal(proposed[1],'stripe_refund');
});
test('cross-app subscription changes fail before Stripe write',async()=>{
 const c=new Connectors(config,{query:async()=>({rows:[]})});c.stripe={subscriptions:{retrieve:async()=>({id:'sub_other',livemode:false,customer:'cus_other',items:{data:[{price:{id:'price_app'}}]}})}};c.stripeWrite={subscriptions:{update:()=>assert.fail('must not write')}};
 await assert.rejects(c.execute({id:'action',kind:'stripe_cancel_subscription',payload:{subscription:'sub_other'}}));
});
test('refund must be tied to this app invoice, not just a shared customer',async()=>{
 const c=new Connectors(config,{query:async()=>({rows:[{user_id:'u'}]})});c.stripe={paymentIntents:{retrieve:async()=>({id:'pi_app',customer:'cus_app',livemode:false,status:'succeeded',amount_received:2500})},invoicePayments:{list:async()=>({data:[]})}};c.stripeWrite={refunds:{create:()=>assert.fail('must not write')}};
 await assert.rejects(c.execute({id:'action',kind:'stripe_refund',payload:{payment_intent:'pi_app',amount:500}}));
});
test('valid refunds carry stable provider idempotency keys',async()=>{
 const c=new Connectors(config,{query:async()=>({rows:[{user_id:'u'}]})});let request;
 c.stripe={paymentIntents:{retrieve:async()=>({id:'pi_app',customer:'cus_app',livemode:false,status:'succeeded',amount_received:2500})},invoicePayments:{list:async()=>({data:[{invoice:'in_app'}]})},invoices:{retrieve:async()=>({parent:{subscription_details:{subscription:'sub_app'}},lines:{data:[{pricing:{price_details:{product:'prod_app'}}}],has_more:false}})},subscriptions:{retrieve:async()=>({id:'sub_app',customer:'cus_app',livemode:false,items:{data:[{price:{id:'price_app'}}]}})}};
 c.stripeWrite={refunds:{create:async(...args)=>{request=args;return {id:'re_ok',status:'succeeded',amount:500,currency:'usd'};}}};
 const result=await c.execute({id:'stable-id',kind:'stripe_refund',payload:{payment_intent:'pi_app',amount:500}});assert.equal(result.id,'re_ok');assert.equal(request[1].idempotencyKey,'ez-agent-stable-id');
});
test('Responses loop carries tool output and reasoning forward without model writes',async()=>{
 let count=0;const seen=[];const client={responses:{create:async input=>{seen.push(structuredClone(input));count++;return count===1?{output:[{type:'reasoning',id:'r',summary:[]},{type:'function_call',name:'repository_files',arguments:'{}',call_id:'call1'}]}:{output:[],output_text:'Review finished',status:'completed'};}}};
 const context={config,store:{jobs:async()=>[],actions:async()=>[],audit:async()=>{}},connectors:{listFiles:async()=>({paths:['README.md']})}};
 assert.equal(await runAgent({id:'job',prompt:'Review'},context,client),'Review finished');assert.ok(seen[1].input.some(i=>i.type==='reasoning'));assert.ok(seen[1].input.some(i=>i.type==='function_call_output'));assert.equal(seen[0].store,false);
});
