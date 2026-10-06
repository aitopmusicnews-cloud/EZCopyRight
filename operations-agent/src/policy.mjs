import { z } from 'zod';
const id = prefix=>z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9]+$`));
export function safePath(path){
  if(typeof path!=='string' || path.length>250 || path.startsWith('/') || path.includes('\\') || path.split('/').some(p=>!p || p==='.' || p==='..' || (p.startsWith('.') && p!=='.github'))) throw new Error('Unsafe repository path');
  if(/(^|\/)(node_modules|vendor|\.git)(\/|$)|\.(pem|key|p12|pfx)$|(^|\/)(credentials|secrets)(\.|\/|$)/i.test(path)) throw new Error('Sensitive repository path');
  return path;
}
export function validateAction(kind,payload,config){
  const shapes={
    stripe_refund:z.object({payment_intent:id('pi'),amount:z.number().int().positive().max(config.MAX_REFUND_CENTS)}).strict(),
    stripe_cancel_subscription:z.object({subscription:id('sub')}).strict(),
    stripe_resume_subscription:z.object({subscription:id('sub')}).strict(),
    stripe_create_coupon:z.object({name:z.string().min(1).max(80),percent_off:z.number().int().min(1).max(100),max_redemptions:z.number().int().min(1).max(100),redeem_by:z.number().int().positive()}).strict(),
    aws_deploy_api:z.object({}).strict(), aws_deploy_frontend:z.object({}).strict(),
    cognito_disable_user:z.object({username:z.string().min(1).max(128)}).strict(),
    cognito_enable_user:z.object({username:z.string().min(1).max(128)}).strict(),
    github_draft_pr:z.object({title:z.string().min(1).max(120),body:z.string().min(1).max(8000),files:z.array(z.object({path:z.string().transform(safePath),content:z.string().max(60000)}).strict()).min(1).max(8)}).strict()
  };
  if(!Object.hasOwn(shapes,kind)) throw new Error('Action not supported');
  const parsed=shapes[kind].parse(payload);
  if(kind==='stripe_create_coupon' && (parsed.redeem_by<=Date.now()/1000 || parsed.redeem_by>Date.now()/1000+90*86400)) throw new Error('Coupon expiry must be within 90 days');
  if(kind==='github_draft_pr' && new Set(parsed.files.map(f=>f.path)).size!==parsed.files.length) throw new Error('Duplicate file path');
  return parsed;
}
export function requireWrites(config,kind){
  if(!config.ENABLE_WRITES) throw new Error('Writes are disabled by the operator');
  if(kind.startsWith('stripe_') && !config.STRIPE_WRITE_KEY) throw new Error('Stripe write credentials are not configured');
}
export function safeError(error){
  // Never persist SDK error objects, request headers, SQL strings, or tokens.
  const code=String(error?.code || error?.name || 'Error').replace(/[^A-Za-z0-9_.-]/g,'').slice(0,80);
  return {error:code || 'Error',message:'Operation failed. Check service permissions, configuration and provider status. No success is assumed.'};
}
