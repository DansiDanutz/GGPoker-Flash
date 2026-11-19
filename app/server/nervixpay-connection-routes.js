// SPDX-License-Identifier: AGPL-3.0-only
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
function fields(body,allowed){if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!allowed.includes(key)))fail('Unexpected request field.');return body;}

export function createNervixPayConnectionRoutes({connections,requireUser,readBody,json,isGuestUser=()=>false}){
 return async(req,res,url)=>{
  const base='/api/account/nervixpay';
  if(url.pathname!==base&&!url.pathname.startsWith(base+'/'))return false;
  const user=requireUser(req,res);if(!user)return true;
  if(isGuestUser(user))fail('Sign in with a permanent account to connect NervixPay.',403);
  if(url.pathname===base&&req.method==='GET'){json(res,200,connections.status(user.id));return true;}
  if(url.pathname===base&&req.method==='DELETE'){json(res,200,await connections.disconnect(user.id));return true;}
  if(url.pathname===base+'/connect'&&req.method==='POST'){const body=fields(await readBody(req),['merchantId','mode']);json(res,200,await connections.start({userId:user.id,merchantId:body.merchantId,mode:body.mode}));return true;}
  if(url.pathname===base+'/poll'&&req.method==='POST'){fields(await readBody(req),[]);json(res,200,await connections.poll(user.id));return true;}
  if([base,base+'/connect',base+'/poll'].includes(url.pathname))fail('Method not allowed.',405);
  fail('NervixPay connection route not found.',404);
 };
}
