import { z } from 'zod';
const bool = z.enum(['true','false']).default('false').transform(v => v === 'true');
const https = z.string().url().refine(v => new URL(v).protocol === 'https:', 'HTTPS required');
const schema = z.object({
  NODE_ENV:z.string().default('production'), PORT:z.coerce.number().int().min(1).max(65535).default(8080),
  AGENT_ORIGIN:https, APP_ORIGIN:https.default('https://ezwaycopyrights.com'), API_ORIGIN:https,
  DATABASE_IAM_AUTH:bool, DATABASE_URL:z.string().min(1).optional(), APP_DATABASE_URL:z.string().min(1).optional(),
  DATABASE_HOST:z.string().min(1).optional(), DATABASE_PORT:z.coerce.number().int().min(1).max(65535).default(5432), DATABASE_NAME:z.string().min(1).optional(),
  DATABASE_RUNTIME_USER:z.string().min(1).default('ez_agent_runtime'), APP_DATABASE_USER:z.string().min(1).default('ez_agent_app_reader'),
  DATABASE_CA:z.string().optional(), DATABASE_SSL: z.enum(['true','false']).default('true'),
  AWS_REGION:z.string().default('us-west-2'), COGNITO_USER_POOL_ID:z.string().min(1), COGNITO_CLIENT_ID:z.string().min(1), COGNITO_DOMAIN:https,
  OWNER_SUBS:z.string().min(1).transform(v=>v.split(',').map(s=>s.trim()).filter(Boolean)).refine(v=>v.length>0),
  OPENAI_API_KEY:z.string().min(1), OPENAI_MODEL:z.string().min(1),
  STRIPE_READ_KEY:z.string().regex(/^(rk|sk)_(test|live)_/), STRIPE_WRITE_KEY:z.string().regex(/^(rk|sk)_(test|live)_/).optional(), STRIPE_LIVE:bool,
  STRIPE_PRICE_ID:z.string().regex(/^price_/), STRIPE_PRODUCT_ID:z.string().regex(/^prod_/),
  GITHUB_TOKEN:z.string().min(1), GITHUB_REPOSITORY:z.string().default('aitopmusicnews-cloud/EZCopyRight'), GITHUB_BRANCH:z.string().default('main'),
  APP_RUNNER_ARN:z.string().min(1), AMPLIFY_APP_ID:z.string().min(1), AMPLIFY_BRANCH:z.string().default('main'),
  RDS_INSTANCE_ID:z.string().min(1), S3_BUCKET:z.string().min(1), ALARM_NAMES:z.string().default('').transform(v=>v.split(',').filter(Boolean)),
  ENABLE_WRITES:bool, MAX_REFUND_CENTS:z.coerce.number().int().min(1).max(1000000).default(2500),
  MONITOR_MINUTES:z.coerce.number().int().min(5).default(15), MAX_RUNS_PER_DAY:z.coerce.number().int().min(1).max(1000).default(120),
});
export function loadConfig(env=process.env) {
  const config=schema.parse({...JSON.parse(env.AGENT_SECRETS_JSON || '{}'),...env});
  for(const key of ['STRIPE_READ_KEY','STRIPE_WRITE_KEY']) if(config[key] && config[key].includes('_live_')!==config.STRIPE_LIVE) throw new Error(`${key} mode mismatch`);
  if(config.NODE_ENV==='production' && config.DATABASE_SSL!=='true') throw new Error('Production database TLS is required');
  if(config.DATABASE_IAM_AUTH){
    for(const key of ['DATABASE_HOST','DATABASE_NAME']) if(!config[key]) throw new Error(`${key} required when DATABASE_IAM_AUTH=true`);
  } else {
    for(const key of ['DATABASE_URL','APP_DATABASE_URL']) if(!config[key]) throw new Error(`${key} required when DATABASE_IAM_AUTH=false`);
  }
  if(!/^[\w.-]+\/[\w.-]+$/.test(config.GITHUB_REPOSITORY)) throw new Error('Invalid repository');
  for(const k of ['AGENT_ORIGIN','APP_ORIGIN','API_ORIGIN']) {
    const u=new URL(config[k]);
    if(u.username || u.password || u.search || u.hash || u.pathname!=='/') throw new Error(`${k} must be an origin`);
    config[k]=u.origin;
  }
  return config;
}
export function poolOptions(config, connectionString) {
  // Reject URL SSL options that override node-postgres TLS verification.
  const url=new URL(connectionString);
  for(const key of [...url.searchParams.keys()]) if(key.startsWith('ssl')) url.searchParams.delete(key);
  return {connectionString:url.toString(), max:5, connectionTimeoutMillis:10000, statement_timeout:15000,
    ssl:config.DATABASE_SSL==='true'?{rejectUnauthorized:true,...(config.DATABASE_CA?{ca:config.DATABASE_CA}:{})}:false};
}
