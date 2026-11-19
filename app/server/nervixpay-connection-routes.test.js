// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { createNervixPayConnectionRoutes } from './nervixpay-connection-routes.js';

function fixture(){
 const calls=[];let result;
 const connections={status:id=>({enabled:true,hasRecord:false,status:'unconfigured',userId:id}),start:async value=>(calls.push(['start',value]),{status:'pending'}),poll:async id=>(calls.push(['poll',id]),{status:'verified'}),disconnect:async id=>(calls.push(['disconnect',id]),{status:'disabled'})};
 const route=createNervixPayConnectionRoutes({connections,requireUser:(req)=>req.user===null?null:req.user||{id:7},readBody:async req=>req.body,json:(_res,status,body)=>{result={status,body}},isGuestUser:user=>!!user.is_guest});
 const call=async(path='/api/account/nervixpay',method='GET',body,user={id:7})=>{result=undefined;await route({method,body,user},{},new URL('http://test'+path));return result;};
 return{calls,call};
}
test('routes bind authenticated identity and expose status metadata',async()=>{const f=fixture();assert.equal((await f.call()).body.userId,7);assert.equal(await f.call('/api/account/nervixpay','GET',undefined,null),undefined);await f.call('/api/account/nervixpay/connect','POST',{merchantId:'m',mode:'live'});assert.deepEqual(f.calls[0][1],{userId:7,merchantId:'m',mode:'live'});});
test('guests and extra fields are rejected before provider actions',async()=>{const f=fixture();await assert.rejects(f.call('/api/account/nervixpay/connect','POST',{merchantId:'m',mode:'live'},{id:7,is_guest:true}),e=>e.status===403);await assert.rejects(f.call('/api/account/nervixpay/connect','POST',{merchantId:'m',mode:'live',token:'secret'}),/Unexpected/);assert.equal(f.calls.length,0);});
test('poll and disconnect accept no client identity or secret fields',async()=>{const f=fixture();await f.call('/api/account/nervixpay/poll','POST',{});await f.call('/api/account/nervixpay','DELETE');assert.deepEqual(f.calls,[['poll',7],['disconnect',7]]);await assert.rejects(f.call('/api/account/nervixpay/poll','POST',{deviceCode:'secret'}),/Unexpected/);});
