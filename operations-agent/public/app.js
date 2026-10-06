const $=id=>document.getElementById(id);
const config=await fetch('/config').then(r=>r.json());
let token=sessionStorage.getItem('ez_agent_id_token'),writes=false;
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const random=()=>b64(crypto.getRandomValues(new Uint8Array(32)));
function notice(message){$('notice').textContent=message;}
async function login(){
 const state=random(),verifier=random(),nonce=random();sessionStorage.setItem('ez_agent_oauth',JSON.stringify({state,verifier,nonce,created:Date.now()}));
 const challenge=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
 const url=new URL('/oauth2/authorize',config.domain);url.search=new URLSearchParams({client_id:config.client_id,response_type:'code',scope:'openid email',redirect_uri:config.origin+'/',state,nonce,code_challenge:challenge,code_challenge_method:'S256'});location.assign(url);
}
$('login').onclick=()=>login().catch(()=>notice('Could not start sign-in.'));
$('logout').onclick=()=>{sessionStorage.removeItem('ez_agent_id_token');const url=new URL('/logout',config.domain);url.search=new URLSearchParams({client_id:config.client_id,logout_uri:config.origin+'/'});location.assign(url);};
const params=new URLSearchParams(location.search);
if(params.has('code')||params.has('error')){
 try{
  const saved=JSON.parse(sessionStorage.getItem('ez_agent_oauth')||'null');sessionStorage.removeItem('ez_agent_oauth');
  if(!saved||saved.state!==params.get('state')||Date.now()-saved.created>600000||params.has('error'))throw new Error('Invalid sign-in response');
  const r=await fetch(new URL('/oauth2/token',config.domain),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:config.client_id,code:params.get('code'),redirect_uri:config.origin+'/',code_verifier:saved.verifier})});
  if(!r.ok)throw new Error('Token exchange failed');const data=await r.json();
  const segment=data.id_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');const claims=JSON.parse(atob(segment));
  if(claims.nonce!==saved.nonce)throw new Error('Nonce mismatch');
  token=data.id_token;sessionStorage.setItem('ez_agent_id_token',token);
 }catch{notice('Sign-in failed. Please sign in again.');}
 history.replaceState({},'', '/');
}
async function api(path,options={}){
 const r=await fetch('/api'+path,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},cache:'no-store'});
 const body=await r.json();if(!r.ok){if(r.status===401){token=null;sessionStorage.removeItem('ez_agent_id_token');$('workspace').hidden=true;$('login').hidden=false;$('logout').hidden=true;}throw new Error(body.error||body.message||'Request failed');}return body;
}
function el(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function empty(parent,message){parent.replaceChildren(el('p',message,'muted'));}
function renderJobs(jobs){const parent=$('jobs');parent.replaceChildren();if(!jobs.length)return empty(parent,'Your first review will appear here.');for(const job of jobs){const box=el('article',undefined,'item');box.append(el('span',job.status,'badge '+job.status),el('h3',job.prompt),el('small',new Date(job.created_at).toLocaleString()));if(job.result)box.append(el('p',job.result));parent.append(box);}}
function renderActions(actions){const parent=$('actions');parent.replaceChildren();$('pending').textContent=actions.filter(a=>a.status==='pending').length;if(!actions.length)return empty(parent,'No actions proposed. Your agent will explain any action it recommends.');for(const action of actions){const box=el('article',undefined,'item');box.append(el('span',action.status,'badge '+action.status),el('h3',action.kind.replaceAll('_',' ')),el('p',action.reason));const details=el('details');details.append(el('summary','View exact action'),el('pre',JSON.stringify(action.payload,null,2)));box.append(details);if(action.result)box.append(el('pre',JSON.stringify(action.result,null,2)));if(action.status==='pending'){const buttons=el('div',undefined,'actions');for(const approve of [true,false]){const button=el('button',approve?'Approve & execute':'Reject',approve?'':'reject');button.disabled=approve&&!writes;button.onclick=async()=>{if(approve&&!confirm(`Execute ${action.kind}? Review the exact parameters above before proceeding.`))return;button.disabled=true;try{await api(`/actions/${action.id}/decision`,{method:'POST',body:JSON.stringify({approve})});notice(approve?'Action finished. See its result below.':'Action rejected.');}catch(e){notice(e.message);}finally{await refresh();}};buttons.append(button);}box.append(buttons,el('small',`Expires ${new Date(action.expires_at).toLocaleString()}`));}parent.append(box);}}
async function refresh(){if(!token)return;try{const [status,jobs,actions,audit]=await Promise.all([api('/status'),api('/jobs'),api('/actions'),api('/audit')]);writes=status.writes_enabled;$('workspace').hidden=false;$('login').hidden=true;$('logout').hidden=false;$('connection').textContent='Owner signed in';$('mode').textContent=status.stripe_mode.toUpperCase();$('controls').textContent=writes?'Owner approval':'Observe & propose';$('cadence').textContent=`${status.monitor_minutes} minutes`;renderJobs(jobs);renderActions(actions);$('audit').replaceChildren(...audit.map(a=>el('p',`${new Date(a.created_at).toLocaleString()} · ${a.event} · ${a.resource_id||''}`)));}catch(e){notice(e.message);}}
$('task').onsubmit=async event=>{event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;try{await api('/jobs',{method:'POST',body:JSON.stringify({prompt:$('prompt').value})});$('prompt').value='';notice('Task queued. Your agent will pick it up shortly.');await refresh();}catch(e){notice(e.message);}finally{button.disabled=false;}};
for(const button of document.querySelectorAll('[data-prompt]'))button.onclick=()=>{$('prompt').value=button.dataset.prompt;$('prompt').focus();};
$('refresh').onclick=refresh;
if(token){notice('');await refresh();}setInterval(refresh,10000);
