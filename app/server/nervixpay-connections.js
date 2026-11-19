// SPDX-License-Identifier: AGPL-3.0-only
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';

const ORIGIN='https://nervixpay.live', VERIFY_URI=ORIGIN+'/integrations';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPES=['payment_links:write','payments:read','integrations:verify'];
const VERIFIED_SCOPES=['payment_links:read',...SCOPES];
const POLL_MS=5000;
function fail(message,status=400){throw Object.assign(new Error(message),{status,code:'nervixpay_connection_error'});}
function transaction(db,work){if(db.isTransaction)return work();db.exec('BEGIN IMMEDIATE');try{const result=work();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}
function keyFrom(value){if(typeof value!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))return null;const key=Buffer.from(value,'base64');return key.length===32?key:null;}
function safeJson(response){return response.text().then(text=>{try{return text?JSON.parse(text):null;}catch{return null;}});}

export function createNervixPayConnections({db,encryptionKey=process.env.NERVIXPAY_CONNECTION_KEY,fetchImpl=fetch,now=Date.now}={}){
 const key=keyFrom(encryptionKey);
 db.exec(`CREATE TABLE IF NOT EXISTS nervixpay_user_connections(
  user_id INTEGER PRIMARY KEY,merchant_id TEXT,mode TEXT,status TEXT NOT NULL,attempt_id TEXT NOT NULL,
  device_cipher TEXT,device_iv TEXT,device_tag TEXT,user_code TEXT,verification_uri TEXT,device_expires_at TEXT,next_poll_at INTEGER,poll_claim TEXT,poll_claimed_at INTEGER,
  token_cipher TEXT,token_iv TEXT,token_tag TEXT,credential_id TEXT,credential_expires_at TEXT,scopes_json TEXT,last_error TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
 );
 CREATE TABLE IF NOT EXISTS nervixpay_revocations(
  id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,merchant_id TEXT NOT NULL,token_cipher TEXT NOT NULL,token_iv TEXT NOT NULL,token_tag TEXT NOT NULL,created_at TEXT NOT NULL
 )`);
 const table=name=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
 function user(userId){if(!Number.isSafeInteger(userId)||userId<1)fail('Sign in to connect NervixPay.',401);if(table('users')){const row=db.prepare('SELECT * FROM users WHERE id=?').get(userId);if(!row||row.banned||row.deleted_at)fail('This account cannot connect NervixPay.',403);}return userId;}
 const stamp=()=>new Date(now()).toISOString();
 const row=id=>db.prepare('SELECT * FROM nervixpay_user_connections WHERE user_id=?').get(id);
 const encrypt=(plaintext,aad)=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(aad));const body=Buffer.concat([cipher.update(plaintext,'utf8'),cipher.final()]);return{cipher:body.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64')};};
 const decrypt=(cipher,iv,tag,aad)=>{const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64'));decipher.setAAD(Buffer.from(aad));decipher.setAuthTag(Buffer.from(tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(cipher,'base64')),decipher.final()]).toString('utf8');};
 const aad=(r,kind)=>kind==='token'?`${kind}:${r.user_id}:${r.merchant_id}`:`${kind}:${r.user_id}:${r.merchant_id}:${r.attempt_id}`;
 function view(r){const expired=r?.status==='verified'&&Date.parse(r.credential_expires_at)<=now(),unavailable=r&&!key;return{enabled:!!key,hasRecord:!!r,status:unavailable?'error':expired?'expired':r?.status||'unconfigured',merchantId:r?.merchant_id||null,mode:r?.mode||null,userCode:r?.user_code||null,verificationUri:r?.verification_uri||null,expiresAt:r?.device_expires_at||null,credentialExpiresAt:r?.credential_expires_at||null,nextPollAt:r?.next_poll_at?new Date(r.next_poll_at).toISOString():null,lastError:unavailable?'NervixPay connections are unavailable on this server.':expired?'Reconnect NervixPay to continue.':r?.last_error||null};}
 function status(userId){return view(row(user(userId)));}
 async function request(path,init={}){let response;try{response=await fetchImpl(ORIGIN+path,{redirect:'error',signal:AbortSignal.timeout(10000),...init,headers:{'content-type':'application/json',...(init.headers||{})}});}catch{return{network:true,response:null,body:null};}return{network:false,response,body:await safeJson(response)};}
 const validScopes=list=>Array.isArray(list)&&VERIFIED_SCOPES.every(scope=>list.includes(scope));
 async function revoke(token){return request('/api/v1/credential',{method:'DELETE',headers:{authorization:`Bearer ${token}`}});}
 const revokeAad=item=>`revoke:${item.id}:${item.user_id}:${item.merchant_id}`;
 async function queueRevocation(userId,merchantId,token){const item={id:randomUUID(),user_id:userId,merchant_id:merchantId},secret=encrypt(token,revokeAad(item));db.prepare('INSERT INTO nervixpay_revocations VALUES(?,?,?,?,?,?,?)').run(item.id,userId,merchantId,secret.cipher,secret.iv,secret.tag,stamp());const result=await revoke(token);if(result.response?.ok||result.response?.status===401)db.prepare('DELETE FROM nervixpay_revocations WHERE id=?').run(item.id);return result.response?.ok||result.response?.status===401;}
 async function retryRevocations(userId){for(const item of db.prepare('SELECT * FROM nervixpay_revocations WHERE user_id=?').all(userId)){let token;try{token=decrypt(item.token_cipher,item.token_iv,item.token_tag,revokeAad(item));}catch{continue;}const result=await revoke(token);if(result.response?.ok||result.response?.status===401)db.prepare('DELETE FROM nervixpay_revocations WHERE id=?').run(item.id);}return db.prepare('SELECT COUNT(*) count FROM nervixpay_revocations WHERE user_id=?').get(userId).count;}

 async function start({userId,merchantId,mode}){
  userId=user(userId);if(!key)fail('NervixPay connections are not configured on this server.',503);if(!UUID.test(merchantId||''))fail('Enter a valid NervixPay Merchant ID.');if(!['test','live'].includes(mode))fail('Choose test or live NervixPay access.');
  const before=row(userId);
  if(['starting','pending','verifying'].includes(before?.status)||(before?.status==='verified'&&Date.parse(before.credential_expires_at)>now()))fail('Disconnect the current NervixPay connection before starting another.',409);
  if(before?.token_cipher){await disconnect(userId);if(row(userId)?.token_cipher)fail('Retry Disconnect to finish revoking the previous NervixPay connection.',503);}
  const attempt=randomUUID(),ts=stamp();
  transaction(db,()=>{const current=row(userId);if(['starting','pending','verifying'].includes(current?.status)||(current?.status==='verified'&&Date.parse(current.credential_expires_at)>now())||current?.token_cipher)fail('Disconnect the current NervixPay connection before starting another.',409);db.prepare(`INSERT INTO nervixpay_user_connections(user_id,merchant_id,mode,status,attempt_id,created_at,updated_at) VALUES(?,?,?,'starting',?,?,?)
   ON CONFLICT(user_id) DO UPDATE SET merchant_id=excluded.merchant_id,mode=excluded.mode,status='starting',attempt_id=excluded.attempt_id,device_cipher=NULL,device_iv=NULL,device_tag=NULL,user_code=NULL,verification_uri=NULL,device_expires_at=NULL,next_poll_at=NULL,poll_claim=NULL,poll_claimed_at=NULL,token_cipher=NULL,token_iv=NULL,token_tag=NULL,credential_id=NULL,credential_expires_at=NULL,scopes_json=NULL,last_error=NULL,updated_at=excluded.updated_at`).run(userId,merchantId,mode,attempt,ts,ts);});
  const result=await request('/api/agent/device/request',{method:'POST',body:JSON.stringify({merchantId,clientName:'DanGG / OpenPoker',scopes:SCOPES,mode,metadata:{platform:'server'}})});
  const current=row(userId);if(!current||current.attempt_id!==attempt||current.status!=='starting')return status(userId);
  const body=result.body,expires=Date.parse(body?.expiresAt);
  if(result.network||!result.response?.ok||typeof body?.deviceCode!=='string'||body.deviceCode.length<20||body.deviceCode.length>200||typeof body.userCode!=='string'||body.verificationUri!==VERIFY_URI||body.mode!==mode||!validScopes(body.scopes)||!Number.isFinite(expires)||expires<=now()||Number(body.interval)<5){
   db.prepare("UPDATE nervixpay_user_connections SET status='error',last_error='NervixPay connection could not be started.',updated_at=? WHERE user_id=? AND attempt_id=? AND status='starting'").run(stamp(),userId,attempt);return status(userId);
  }
  const secret=encrypt(body.deviceCode,aad(current,'device'));
  db.prepare(`UPDATE nervixpay_user_connections SET status='pending',device_cipher=?,device_iv=?,device_tag=?,user_code=?,verification_uri=?,device_expires_at=?,next_poll_at=?,last_error=NULL,updated_at=? WHERE user_id=? AND attempt_id=? AND status='starting'`).run(secret.cipher,secret.iv,secret.tag,body.userCode,VERIFY_URI,new Date(expires).toISOString(),now()+Math.max(POLL_MS,Number(body.interval)*1000),stamp(),userId,attempt);
  return status(userId);
 }

 function claimPoll(userId){return transaction(db,()=>{const r=row(userId);if(!r)fail('Start a NervixPay connection first.',404);if(['verified','denied','expired','error','disabled'].includes(r.status))return{row:r,done:true};if(!['pending','verifying'].includes(r.status))fail('NervixPay connection is not ready to check.',409);if((r.next_poll_at||0)>now())fail('Wait five seconds before checking again.',429);if(r.poll_claim&&now()-(r.poll_claimed_at||0)<10000)fail('NervixPay approval is already being checked.',429);const claim=randomUUID();db.prepare('UPDATE nervixpay_user_connections SET poll_claim=?,poll_claimed_at=?,next_poll_at=?,updated_at=? WHERE user_id=? AND attempt_id=?').run(claim,now(),now()+POLL_MS,stamp(),userId,r.attempt_id);return{row:{...r,poll_claim:claim},claim};});}
 function release(userId,r,claim,values){const entries=Object.entries(values),set=entries.map(([name])=>`${name}=?`).join(',');db.prepare(`UPDATE nervixpay_user_connections SET ${set},poll_claim=NULL,poll_claimed_at=NULL,updated_at=? WHERE user_id=? AND attempt_id=? AND poll_claim=?`).run(...entries.map(([,value])=>value),stamp(),userId,r.attempt_id,claim);}
 async function rejectStoredToken(userId,r,claim,token,message){const revoked=await revoke(token),confirmed=revoked.response?.ok||revoked.response?.status===401;release(userId,r,claim,confirmed?{status:'error',last_error:message,token_cipher:null,token_iv:null,token_tag:null,credential_id:null,credential_expires_at:null,scopes_json:null}:{status:'disabled',last_error:'Disconnected locally; NervixPay revocation is pending.'});return status(userId);}
 async function verifyStored(userId,r,claim){let token;try{token=decrypt(r.token_cipher,r.token_iv,r.token_tag,aad(r,'token'));}catch{release(userId,r,claim,{status:'disabled',last_error:'Saved authorization is unreadable. Restore the correct encryption key or revoke it in NervixPay Agents.'});return status(userId);}
  const result=await request('/api/v1/verify',{method:'GET',headers:{authorization:`Bearer ${token}`}});
  if(result.network||result.response?.status>=500){release(userId,r,claim,{status:'verifying',last_error:'NervixPay verification is temporarily unavailable.'});return status(userId);}
  const body=result.body,expiry=Date.parse(body?.credential?.expiresAt),valid=result.response?.ok&&body?.merchant?.id===r.merchant_id&&body.merchant.onboardingCompleted===true&&body.merchant.blocked===false&&body.credential?.id===r.credential_id&&body.credential.mode===r.mode&&validScopes(body.credential.scopes)&&Number.isFinite(expiry)&&expiry>now();
  if(!valid)return rejectStoredToken(userId,r,claim,token,'NervixPay rejected or mismatched this connection.');
  release(userId,r,claim,{status:'verified',last_error:null,credential_expires_at:new Date(expiry).toISOString(),scopes_json:JSON.stringify(body.credential.scopes),user_code:null,verification_uri:null,device_expires_at:null});return status(userId);
 }
 async function poll(userId){userId=user(userId);if(!key)fail('NervixPay connections are not configured on this server.',503);const claimed=claimPoll(userId);if(claimed.done)return view(claimed.row);let r=claimed.row,claim=claimed.claim;
  if(r.status==='verifying')return verifyStored(userId,r,claim);
  let deviceCode;try{deviceCode=decrypt(r.device_cipher,r.device_iv,r.device_tag,aad(r,'device'));}catch{release(userId,r,claim,{status:'error',last_error:'Saved NervixPay approval could not be opened.',device_cipher:null,device_iv:null,device_tag:null});return status(userId);}
  const result=await request('/api/agent/device/token',{method:'POST',body:JSON.stringify({deviceCode})});
  const code=result.body?.error?.code;
  if(result.network||result.response?.status>=500){release(userId,r,claim,{last_error:'NervixPay approval check is temporarily unavailable.'});return status(userId);}
  if(result.response?.status===409&&code==='authorization_pending'){release(userId,r,claim,{last_error:null});return status(userId);}
  if(code==='device_code_denied'||code==='device_code_expired') {release(userId,r,claim,{status:code.endsWith('denied')?'denied':'expired',last_error:code.endsWith('denied')?'The NervixPay request was denied.':'The NervixPay approval code expired.',device_cipher:null,device_iv:null,device_tag:null,user_code:null,verification_uri:null});return status(userId);}
  const body=result.body,expiry=Date.parse(body?.expiresAt),issued=typeof body?.accessToken==='string'&&UUID.test(body.credentialId||'')&&body.accessToken.startsWith(`nvp.${body.credentialId}.`);
  if(!result.response?.ok||!issued) {release(userId,r,claim,{status:'error',last_error:'NervixPay returned an invalid authorization.',device_cipher:null,device_iv:null,device_tag:null,user_code:null,verification_uri:null});return status(userId);}
  const tokenSecret=encrypt(body.accessToken,aad(r,'token')),contractValid=body.mode===r.mode&&validScopes(body.scopes)&&Number.isFinite(expiry)&&expiry>now();
  release(userId,r,claim,{status:'verifying',device_cipher:null,device_iv:null,device_tag:null,user_code:null,verification_uri:null,token_cipher:tokenSecret.cipher,token_iv:tokenSecret.iv,token_tag:tokenSecret.tag,credential_id:body.credentialId,credential_expires_at:Number.isFinite(expiry)?new Date(expiry).toISOString():null,scopes_json:JSON.stringify(Array.isArray(body.scopes)?body.scopes:[]),last_error:null});
  const saved=row(userId);if(saved.attempt_id!==r.attempt_id||saved.status!=='verifying'){await queueRevocation(userId,r.merchant_id,body.accessToken);return status(userId);}
  const verifyClaim=randomUUID();db.prepare('UPDATE nervixpay_user_connections SET poll_claim=?,poll_claimed_at=? WHERE user_id=? AND attempt_id=? AND status=\'verifying\'').run(verifyClaim,now(),userId,r.attempt_id);const verifying={...saved,poll_claim:verifyClaim};return contractValid?verifyStored(userId,verifying,verifyClaim):rejectStoredToken(userId,verifying,verifyClaim,body.accessToken,'NervixPay returned an invalid authorization.');
 }
 async function disconnect(userId){userId=user(userId);const current=row(userId);if(!current)return status(userId);const attempt=randomUUID();db.prepare(`UPDATE nervixpay_user_connections SET status='disabled',attempt_id=?,device_cipher=NULL,device_iv=NULL,device_tag=NULL,user_code=NULL,verification_uri=NULL,device_expires_at=NULL,next_poll_at=NULL,poll_claim=NULL,poll_claimed_at=NULL,last_error=NULL,updated_at=? WHERE user_id=?`).run(attempt,stamp(),userId);
  if(!key)return status(userId);let pending=await retryRevocations(userId);if(!current.token_cipher){if(pending)db.prepare("UPDATE nervixpay_user_connections SET last_error='Disconnected locally; NervixPay revocation is pending.',updated_at=? WHERE user_id=? AND attempt_id=?").run(stamp(),userId,attempt);return status(userId);}let token;try{token=decrypt(current.token_cipher,current.token_iv,current.token_tag,aad(current,'token'));}catch{db.prepare("UPDATE nervixpay_user_connections SET last_error='Saved authorization is unreadable. Restore the correct encryption key or revoke it in NervixPay Agents.',updated_at=? WHERE user_id=? AND attempt_id=?").run(stamp(),userId,attempt);return status(userId);}
  const result=await revoke(token);if(result.response?.ok||result.response?.status===401)db.prepare('UPDATE nervixpay_user_connections SET token_cipher=NULL,token_iv=NULL,token_tag=NULL,credential_id=NULL,credential_expires_at=NULL,scopes_json=NULL,last_error=?,updated_at=? WHERE user_id=? AND attempt_id=?').run(pending?'Disconnected locally; NervixPay revocation is pending.':null,stamp(),userId,attempt);else db.prepare("UPDATE nervixpay_user_connections SET last_error='Disconnected locally; NervixPay revocation is pending.',updated_at=? WHERE user_id=? AND attempt_id=?").run(stamp(),userId,attempt);return status(userId);
 }
 function connectionFor(userId){try{userId=user(userId);}catch{return null;}if(!key)return null;const r=row(userId);if(!r||r.status!=='verified'||r.mode!=='live'||Date.parse(r.credential_expires_at)<=now())return null;try{return{merchantId:r.merchant_id,token:decrypt(r.token_cipher,r.token_iv,r.token_tag,aad(r,'token'))};}catch{return null;}}
 return{status,start,poll,disconnect,connectionFor};
}
