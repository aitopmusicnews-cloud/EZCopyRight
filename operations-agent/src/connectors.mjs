import Stripe from 'stripe';
import { AppRunnerClient, DescribeServiceCommand, StartDeploymentCommand } from '@aws-sdk/client-apprunner';
import { AmplifyClient, ListJobsCommand, StartJobCommand } from '@aws-sdk/client-amplify';
import { RDSClient, DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
import { CloudWatchClient, DescribeAlarmsCommand } from '@aws-sdk/client-cloudwatch';
import { CognitoIdentityProviderClient, DescribeUserPoolCommand, AdminDisableUserCommand, AdminEnableUserCommand, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { S3Client, GetBucketVersioningCommand, GetPublicAccessBlockCommand } from '@aws-sdk/client-s3';
import { safePath, safeError, validateAction, requireWrites } from './policy.mjs';

export class Connectors {
 constructor(config,appDb){
  this.c=config;this.db=appDb;
  const options={region:config.AWS_REGION,maxAttempts:1,requestHandler:{requestTimeout:12000,connectionTimeout:5000}};
  this.aws={api:new AppRunnerClient(options),frontend:new AmplifyClient(options),db:new RDSClient(options),alarms:new CloudWatchClient(options),auth:new CognitoIdentityProviderClient(options),storage:new S3Client(options)};
  this.stripe=new Stripe(config.STRIPE_READ_KEY,{timeout:15000,maxNetworkRetries:1});
  this.stripeWrite=config.STRIPE_WRITE_KEY?new Stripe(config.STRIPE_WRITE_KEY,{timeout:15000,maxNetworkRetries:1}):null;
 }
 async github(path,options={}){
  const response=await fetch(`https://api.github.com/repos/${this.c.GITHUB_REPOSITORY}${path}`,{
   ...options,headers:{Authorization:`Bearer ${this.c.GITHUB_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!response.ok) throw Object.assign(new Error('GitHub operation failed'),{code:`GitHubHTTP${response.status}`});
  return response.json();
 }
 async health(){
  return Promise.all([['frontend',this.c.APP_ORIGIN],['api_live',`${this.c.API_ORIGIN}/health/live`],['api_ready',`${this.c.API_ORIGIN}/health/ready`]].map(async([name,url])=>{
   const start=Date.now();try {const response=await fetch(url,{signal:AbortSignal.timeout(10000),redirect:'error'});await response.body?.cancel();return {name,url,ok:response.ok,status:response.status,latency_ms:Date.now()-start};} catch(e){return {name,url,ok:false,...safeError(e)};}
  }));
 }
 async database(){
  const queries={works:"SELECT status,count(*)::int AS count FROM public.works GROUP BY status",uploads:"SELECT status,count(*)::int AS count FROM public.file_uploads WHERE created_at>now()-interval '24 hours' GROUP BY status",stale_uploads:"SELECT count(*)::int AS count FROM public.file_uploads WHERE status='pending' AND created_at<now()-interval '2 hours'",billing:"SELECT subscription_status,count(*)::int AS count FROM public.billing_customers GROUP BY subscription_status",webhooks:"SELECT event_type,count(*)::int AS count,max(processed_at) AS last_processed FROM public.stripe_events WHERE processed_at>now()-interval '24 hours' GROUP BY event_type"};
  const result={};for(const [name,sql] of Object.entries(queries))result[name]=(await this.db.query(sql)).rows;
  return result;
 }
 async awsStatus(){
  const c=this.c;
  const checks={
   api:async()=>{const {Service:s}=await this.aws.api.send(new DescribeServiceCommand({ServiceArn:c.APP_RUNNER_ARN}));return {status:s.Status,updated_at:s.UpdatedAt,url:s.ServiceUrl};},
   frontend:async()=>{const r=await this.aws.frontend.send(new ListJobsCommand({appId:c.AMPLIFY_APP_ID,branchName:c.AMPLIFY_BRANCH,maxResults:5}));return r.jobSummaries;},
   database:async()=>{const r=await this.aws.db.send(new DescribeDBInstancesCommand({DBInstanceIdentifier:c.RDS_INSTANCE_ID}));return r.DBInstances.map(d=>({id:d.DBInstanceIdentifier,status:d.DBInstanceStatus,storage_encrypted:d.StorageEncrypted,backup_retention_days:d.BackupRetentionPeriod,latest_restorable_time:d.LatestRestorableTime,publicly_accessible:d.PubliclyAccessible}));},
   identity:async()=>{const {UserPool:p}=await this.aws.auth.send(new DescribeUserPoolCommand({UserPoolId:c.COGNITO_USER_POOL_ID}));return {estimated_users:p.EstimatedNumberOfUsers,mfa:p.MfaConfiguration};},
   storage:async()=>{const versioning=await this.aws.storage.send(new GetBucketVersioningCommand({Bucket:c.S3_BUCKET}));const access=await this.aws.storage.send(new GetPublicAccessBlockCommand({Bucket:c.S3_BUCKET}));return {versioning:versioning.Status || 'not_enabled',public_access_block:access.PublicAccessBlockConfiguration};},
   alarms:async()=>{if(!c.ALARM_NAMES.length)return {configured:false};const r=await this.aws.alarms.send(new DescribeAlarmsCommand({AlarmNames:c.ALARM_NAMES}));return {metric:r.MetricAlarms?.map(a=>({name:a.AlarmName,state:a.StateValue,reason:a.StateReason})),composite:r.CompositeAlarms?.map(a=>({name:a.AlarmName,state:a.StateValue}))};}
  };
  return this.settle(checks);
 }
 async settle(checks){const entries=await Promise.all(Object.entries(checks).map(async([name,fn])=>{try{return [name,{ok:true,data:await fn()}];}catch(e){return [name,{ok:false,...safeError(e)}];}}));return Object.fromEntries(entries);}
 async billing(){
  const subscriptions=[];let hasMore=false;
  // Cap the scan and report incompleteness rather than presenting sample totals as account totals.
  let cursor;
  for(let page=0;page<5;page++){
   const r=await this.stripe.subscriptions.list({price:this.c.STRIPE_PRICE_ID,status:'all',limit:100,...(cursor?{starting_after:cursor}:{})});
   for(const s of r.data){this.checkMode(s);subscriptions.push({id:s.id,customer:typeof s.customer==='string'?s.customer:s.customer.id,status:s.status,cancel_at_period_end:s.cancel_at_period_end});}
   hasMore=r.has_more;if(!hasMore)break;cursor=r.data.at(-1)?.id;
  }
  const price=await this.stripe.prices.retrieve(this.c.STRIPE_PRICE_ID);this.checkMode(price);
  if(price.product!==this.c.STRIPE_PRODUCT_ID)throw new Error('Configured price/product mismatch');
  return {mode:this.c.STRIPE_LIVE?'live':'test',price:{id:price.id,unit_amount:price.unit_amount,currency:price.currency,recurring:price.recurring},subscriptions,scan_complete:!hasMore,limit:500};
 }
 checkMode(object){if(object.livemode!==this.c.STRIPE_LIVE)throw new Error('Stripe mode mismatch');}
 async customer(customer){
  if(!/^cus_[A-Za-z0-9]+$/.test(customer))throw new Error('Invalid customer ID');
  await this.assertCustomer(customer);
  const [invoices,subs]=await Promise.all([this.stripe.invoices.list({customer,limit:20}),this.stripe.subscriptions.list({customer,status:'all',limit:20})]);
  return {customer,subscriptions:subs.data.filter(s=>s.items.data.some(i=>i.price.id===this.c.STRIPE_PRICE_ID)).map(s=>({id:s.id,status:s.status,cancel_at_period_end:s.cancel_at_period_end})),invoices:invoices.data.map(i=>({id:i.id,status:i.status,currency:i.currency,amount_due:i.amount_due,amount_paid:i.amount_paid,attempt_count:i.attempt_count,created:i.created})),has_more_invoices:invoices.has_more,has_more_subscriptions:subs.has_more};
 }
 async invoice(id){
  if(!/^in_[A-Za-z0-9]+$/.test(id))throw new Error('Invalid invoice ID');
  const invoice=await this.stripe.invoices.retrieve(id);this.checkMode(invoice);
  await this.assertCustomer(typeof invoice.customer==='string'?invoice.customer:invoice.customer?.id);
  const sub=invoice.parent?.subscription_details?.subscription;
  if(!sub)throw new Error('Invoice has no app subscription');
  await this.subscription(typeof sub==='string'?sub:sub.id);
  const payments=await this.stripe.invoicePayments.list({invoice:id,limit:100});
  return {id,status:invoice.status,currency:invoice.currency,amount_due:invoice.amount_due,amount_paid:invoice.amount_paid,payments:payments.data.map(p=>({id:p.id,status:p.status,amount_paid:p.amount_paid,payment_intent:typeof p.payment?.payment_intent==='string'?p.payment.payment_intent:p.payment?.payment_intent?.id})),has_more:payments.has_more};
 }
 async assertCustomer(customer){const {rows}=await this.db.query('SELECT user_id FROM public.billing_customers WHERE stripe_customer_id=$1',[customer]);if(!rows.length)throw new Error('Customer is outside EZCopyRight');return rows[0];}
 async subscription(id){const s=await this.stripe.subscriptions.retrieve(id);this.checkMode(s);await this.assertCustomer(typeof s.customer==='string'?s.customer:s.customer.id);if(s.items.data.length!==1 || s.items.data[0].price.id!==this.c.STRIPE_PRICE_ID)throw new Error('Subscription is outside configured product');return s;}
 async repoStatus(){const [runs,prs]=await Promise.all([this.github(`/actions/runs?branch=${encodeURIComponent(this.c.GITHUB_BRANCH)}&per_page=5`),this.github('/pulls?state=open&per_page=20')]);return {runs:runs.workflow_runs.map(r=>({id:r.id,name:r.name,status:r.status,conclusion:r.conclusion,url:r.html_url,head_sha:r.head_sha})),pull_requests:prs.map(p=>({number:p.number,title:p.title,url:p.html_url,draft:p.draft,head:p.head.sha}))};}
 async listFiles(){const ref=await this.github(`/git/ref/heads/${encodeURIComponent(this.c.GITHUB_BRANCH)}`);const commit=await this.github(`/git/commits/${ref.object.sha}`);const tree=await this.github(`/git/trees/${commit.tree.sha}?recursive=1`);return {sha:ref.object.sha,truncated:tree.truncated,paths:tree.tree.filter(t=>t.type==='blob').map(t=>t.path).filter(p=>{try{safePath(p);return true;}catch{return false;}}).slice(0,1500)};}
 async readFile(path){safePath(path);const f=await this.github(`/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(this.c.GITHUB_BRANCH)}`);if(f.type!=='file'||f.encoding!=='base64'||f.size>60000)throw new Error('File unavailable or too large');return {path,sha:f.sha,content:Buffer.from(f.content,'base64').toString('utf8')};}
 async overview(){return {observed_at:new Date().toISOString(),...await this.settle({health:()=>this.health(),database:()=>this.database(),aws:()=>this.awsStatus(),stripe:()=>this.billing(),github:()=>this.repoStatus()})};}
 async execute(action){
  requireWrites(this.c,action.kind);
  const p=validateAction(action.kind,action.payload,this.c),key=`ez-agent-${action.id}`;
  switch(action.kind){
   case 'stripe_refund':{
    const pi=await this.stripe.paymentIntents.retrieve(p.payment_intent);this.checkMode(pi);
    await this.assertCustomer(typeof pi.customer==='string'?pi.customer:pi.customer?.id);
    // Require linkage to an invoice for this app's subscription, not merely the same customer.
    const payments=await this.stripe.invoicePayments.list({payment:{type:'payment_intent',payment_intent:pi.id},limit:10});
    let linked=false;
    for(const payment of payments.data){const invoice=await this.stripe.invoices.retrieve(typeof payment.invoice==='string'?payment.invoice:payment.invoice.id);const sub=invoice.parent?.subscription_details?.subscription;if(sub && invoice.lines?.data?.length && !invoice.lines.has_more && invoice.lines.data.every(line=>line.pricing?.price_details?.product===this.c.STRIPE_PRODUCT_ID)){try{await this.subscription(typeof sub==='string'?sub:sub.id);linked=true;}catch{}}}
    if(!linked || pi.status!=='succeeded' || p.amount>pi.amount_received)throw new Error('Payment not eligible for this app refund');
    const r=await this.stripeWrite.refunds.create({payment_intent:pi.id,amount:p.amount,metadata:{ez_agent_action:action.id}},{idempotencyKey:key});return {id:r.id,status:r.status,amount:r.amount,currency:r.currency};
   }
   case 'stripe_cancel_subscription':case 'stripe_resume_subscription':{
    const s=await this.subscription(p.subscription);if(['canceled','incomplete_expired'].includes(s.status))throw new Error('Subscription cannot be resumed or scheduled');
    const r=await this.stripeWrite.subscriptions.update(s.id,{cancel_at_period_end:action.kind==='stripe_cancel_subscription'},{idempotencyKey:key});return {id:r.id,status:r.status,cancel_at_period_end:r.cancel_at_period_end};
   }
   case 'stripe_create_coupon':{const r=await this.stripeWrite.coupons.create({...p,duration:'once',applies_to:{products:[this.c.STRIPE_PRODUCT_ID]},metadata:{ez_agent_action:action.id}},{idempotencyKey:key});return {id:r.id,valid:r.valid,percent_off:r.percent_off};}
   case 'aws_deploy_api':{const r=await this.aws.api.send(new StartDeploymentCommand({ServiceArn:this.c.APP_RUNNER_ARN}));return {operation_id:r.OperationId,state:'deployment_requested'};}
   case 'aws_deploy_frontend':{const r=await this.aws.frontend.send(new StartJobCommand({appId:this.c.AMPLIFY_APP_ID,branchName:this.c.AMPLIFY_BRANCH,jobType:'RELEASE'}));return {job_id:r.jobSummary.jobId,status:r.jobSummary.status};}
   case 'cognito_disable_user':case 'cognito_enable_user':{
    const args={UserPoolId:this.c.COGNITO_USER_POOL_ID,Username:p.username};const u=await this.aws.auth.send(new AdminGetUserCommand(args));
    const sub=u.UserAttributes?.find(a=>a.Name==='sub')?.Value;if(!sub || this.c.OWNER_SUBS.includes(sub))throw new Error('Cannot change owner access');
    // The existing pool may be shared; only app customers are eligible.
    const {rows}=await this.db.query('SELECT user_id FROM public.billing_customers WHERE user_id=$1',[sub]);if(!rows.length)throw new Error('User is outside EZCopyRight');
    const command=action.kind==='cognito_disable_user'?AdminDisableUserCommand:AdminEnableUserCommand;
    await this.aws.auth.send(new command(args));return {username:p.username,enabled:action.kind==='cognito_enable_user'};
   }
   case 'github_draft_pr':return this.draftPr(action.id,p);
   default:throw new Error('Unsupported action');
  }
 }
 async draftPr(id,p){
  const ref=await this.github(`/git/ref/heads/${encodeURIComponent(this.c.GITHUB_BRANCH)}`);
  const commit=await this.github(`/git/commits/${ref.object.sha}`);
  const tree=[];
  for(const f of p.files){const blob=await this.github('/git/blobs',{method:'POST',body:JSON.stringify({content:f.content,encoding:'utf-8'})});tree.push({path:f.path,mode:'100644',type:'blob',sha:blob.sha});}
  const created=await this.github('/git/trees',{method:'POST',body:JSON.stringify({base_tree:commit.tree.sha,tree})});
  const next=await this.github('/git/commits',{method:'POST',body:JSON.stringify({message:p.title,tree:created.sha,parents:[ref.object.sha]})});
  const branch=`ez-agent/${id}`;
  await this.github('/git/refs',{method:'POST',body:JSON.stringify({ref:`refs/heads/${branch}`,sha:next.sha})});
  const pr=await this.github('/pulls',{method:'POST',body:JSON.stringify({title:p.title,body:p.body,head:branch,base:this.c.GITHUB_BRANCH,draft:true})});
  return {number:pr.number,url:pr.html_url,branch,tests:'Not run by this agent. Check CI on the PR before merge.'};
 }
}
