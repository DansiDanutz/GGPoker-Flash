import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './test-helpers.js';

test('legacy devices survive restart without stored or listed bearer secrets', async () => {
  let srv = await startServer();
  const dir = srv.dataDir;
  try {
    const token = await srv.login('admin', 'admin123');
    assert.ok(token);
    const other = await srv.login('admin', 'admin123');
    await srv.stop(); srv = null;
    const file = join(dir, 'ggpoker.db');
    const old = new DatabaseSync(file);
    try {
      old.exec("DROP TABLE sessions; CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id INTEGER NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,expires_at TEXT NOT NULL,device TEXT)");
      const insert = old.prepare("INSERT INTO sessions(token,user_id,expires_at,device) SELECT ?, id, ?, ? FROM users WHERE login='admin'");
      for (const [key,device] of [[token,'first'],[other,'second']]) insert.run(key,new Date(Date.now()+86400000).toISOString(),device);
    } finally { old.close(); }
    srv = await startServer({dataDir: dir});
    const list = await srv.get('/api/sessions',{token});
    assert.equal(list.status,200);
    assert.equal(list.data.sessions.length,2);
    assert.ok(!JSON.stringify(list.data).includes(other));
    const second = list.data.sessions.find(s=>!s.current);
    assert.ok(second.id);
    const db = new DatabaseSync(file,{readOnly:true});
    try { assert.equal(db.prepare('SELECT count(*) AS n FROM sessions WHERE token IN (?,?)').get(token,other).n,0); } finally { db.close(); }
    assert.equal((await srv.get('/api/sessions',{token:second.id})).status,401);
    assert.equal((await srv.del('/api/sessions/'+second.id,{token})).status,200);
    assert.equal((await srv.get('/api/sessions',{token:other})).status,401);
    assert.equal((await srv.get('/api/sessions',{token})).data.sessions.length,1);
    const fresh = await srv.login('admin','admin123');
    const storage = new DatabaseSync(file);
    try {
      assert.equal(storage.prepare('SELECT COUNT(*) AS n FROM sessions WHERE token=?').get(fresh).n,0);
      const id = (await srv.get('/api/sessions',{token:fresh})).data.sessions.find(s=>s.current).id;
      const verifier = storage.prepare('SELECT token FROM sessions WHERE device_id=?').get(id).token;
      assert.equal((await srv.get('/api/sessions',{token:verifier})).status,401);
      storage.prepare('UPDATE sessions SET expires_at=? WHERE device_id=?').run(new Date(Date.now()-1000).toISOString(),id);
      assert.equal((await srv.get('/api/sessions',{token:fresh})).status,401);
    } finally { storage.close(); }
  } finally { if(srv) await srv.stop(); rmSync(dir,{recursive:true,force:true}); }
});

test('device revocation ends its open WebSocket and notification stream', { timeout:10000 }, async () => {
  const srv = await startServer();
  const controller = new AbortController();
  try {
    const current = await srv.login('admin','admin123'), other = await srv.login('admin','admin123');
    const socket = srv.socket(other); await socket.opened; await socket.nextType('hello');
    const closed = new Promise(resolve => socket.ws.once('close',resolve));
    const stream = await fetch(srv.base+'/api/notifications/stream',{headers:{authorization:`Bearer ${other}`},signal:controller.signal});
    const reader = stream.body.getReader(); await reader.read();
    const {sessions} = (await srv.get('/api/sessions',{token:current})).data;
    assert.equal((await srv.del('/api/sessions/'+sessions.find(s=>!s.current).id,{token:current})).status,200);
    assert.equal(await closed,4001);
    assert.equal((await reader.read()).done,true);
    assert.equal((await srv.get('/api/sessions',{token:current})).status,200);
  } finally { controller.abort(); await srv.stop(); rmSync(srv.dataDir,{recursive:true,force:true}); }
});

test('idle realtime connections end at natural session expiry', { timeout:10000 }, async () => {
  const srv = await startServer();
  const controller = new AbortController();
  try {
    const token = await srv.login('admin','admin123');
    const db = new DatabaseSync(join(srv.dataDir,'ggpoker.db'));
    try {
      db.prepare("UPDATE sessions SET expires_at=? WHERE user_id=(SELECT id FROM users WHERE login='admin')").run(new Date(Date.now()+1800).toISOString());
    } finally { db.close(); }
    const socket = srv.socket(token); await socket.opened; await socket.nextType('hello');
    const closed = new Promise(resolve => socket.ws.once('close',resolve));
    const stream = await fetch(srv.base+'/api/notifications/stream',{headers:{authorization:`Bearer ${token}`},signal:controller.signal});
    assert.equal(stream.status,200);
    const reader = stream.body.getReader(); await reader.read();
    assert.equal(await closed,4001);
    assert.equal((await reader.read()).done,true);
    assert.equal((await srv.get('/api/sessions',{token})).status,401);
  } finally { controller.abort(); await srv.stop(); rmSync(srv.dataDir,{recursive:true,force:true}); }
});

test('browser WebSocket handshake selects only the public protocol on reconnect', async () => {
  const srv = await startServer();
  try {
    const token = await srv.login('admin','admin123');
    for (let i=0;i<2;i++) {
      const client = new WebSocket('ws://127.0.0.1:'+srv.port+'/ws',['dangg.v1','auth.'+token]);
      try {
        const hello = await new Promise((resolve,reject) => { client.onmessage=e=>resolve(JSON.parse(e.data)); client.onerror=reject; });
        assert.equal(client.protocol,'dangg.v1');
        assert.ok(hello.userId);
        assert.equal(new URL(client.url).search,'');
      } finally { client.close(); }
    }
  } finally { await srv.stop(); rmSync(srv.dataDir,{recursive:true,force:true}); }
});

for (const action of ['logout', 'password change', 'resetpw', 'ban']) {
  test(action + ' closes existing socket and notification stream', {timeout:10000}, async () => {
    const srv = await startServer();
    const controller = new AbortController();
    try {
      const signup = await srv.post('/api/auth/register', {body:{login:'sessionowner', nick:'Session Owner', password:'secret12'}});
      assert.equal(signup.status,200);
      const {token,user} = signup.data;
      const socket = srv.socket(token); await socket.opened; await socket.nextType('hello');
      const closed = new Promise(resolve => socket.ws.once('close',resolve));
      const stream = await fetch(srv.base+'/api/notifications/stream',{headers:{authorization:'Bearer '+token},signal:controller.signal});
      assert.equal(stream.status,200);
      const reader = stream.body.getReader(); assert.equal((await reader.read()).done,false);
      let response;
      if (action === 'logout') response = await srv.post('/api/auth/logout',{token,body:{}});
      else if (action === 'password change') {
        const current = await srv.login('sessionowner','secret12');
        response = await srv.post('/api/password',{token:current,body:{current:'secret12',next:'changed12'}});
        assert.equal((await srv.get('/api/sessions',{token:current})).status,200);
      } else {
        const admin = await srv.login('admin','admin123');
        response = await srv.post('/api/admin/users/'+user.id,{token:admin,body:action==='ban'?{action}:{action,password:'changed12'}});
      }
      assert.equal(response.status,200);
      assert.equal(await closed,4001);
      assert.equal((await reader.read()).done,true);
      assert.equal((await srv.get('/api/sessions',{token})).status,401);
    } finally { controller.abort(); await srv.stop(); rmSync(srv.dataDir,{recursive:true,force:true}); }
  });
}
