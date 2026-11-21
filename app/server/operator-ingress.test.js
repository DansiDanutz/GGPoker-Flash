import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import https from 'node:https';
import net from 'node:net';
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { startServer } from './test-helpers.js';

test('only the pinned operator certificate reaches admin login on the separate listener', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'operator-tls-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const name of ['server', 'operator', 'other']) {
    execFileSync('openssl', ['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost',
      '-keyout',join(dir,name+'.key'),'-out',join(dir,name+'.pem')], {stdio:'ignore'});
  }
  const file = name => readFileSync(join(dir,name));
  const probe = net.createServer(); await new Promise(r => probe.listen(0,'127.0.0.1',r));
  const port = probe.address().port; await new Promise(r => probe.close(r));
  const password = randomUUID();
  const srv = await startServer({env:{ NODE_ENV:'production', GGPOKER_ADMIN_PASSWORD:password, GGPOKER_ADMIN_TLS_DIR:dir, GGPOKER_ADMIN_TLS_PORT:String(port),
    GGPOKER_ADMIN_ORIGIN:'https://localhost:'+port }});
  t.after(() => srv.stop());
  assert.equal((await srv.get('/api/admin/stats')).status,403);
  const request = (name,headers={}) => new Promise((resolve,reject) => {
    https.get({hostname:'127.0.0.1',port,servername:'localhost',headers:{host:'localhost:'+port,...headers},path:'/api/admin/stats',
      ca:file('server.pem'),...(name ? {cert:file(name+'.pem'),key:file(name+'.key')} : {})}, res => {res.resume();resolve(res.statusCode)}).on('error',reject);
  });
  await assert.rejects(request()); await assert.rejects(request('other'));
  if (process.platform === 'linux' && process.env.GITHUB_ACTIONS === 'true') {
    // Hosted runners allow an actual second UID; give it only the public server certificate.
    const publicDir = mkdtempSync(join(tmpdir(),'operator-public-ca-'));
    t.after(() => rmSync(publicDir,{recursive:true,force:true}));
    const caPath = join(publicDir,'server.pem');
    writeFileSync(caPath,file('server.pem'));
    chmodSync(caPath,0o644); chmodSync(publicDir,0o755);
    const otherUser = (...args) => spawnSync('sudo',['-n','-u','nobody','--','curl','--noproxy','*','--max-time','5','-sS',...args],
      {encoding:'utf8'});
    const plain = otherUser('-o','/dev/null','-w','%{http_code}',srv.base+'/api/admin/stats');
    assert.equal(plain.status,0,plain.stderr);
    assert.equal(plain.stdout,'403');
    const tls = otherUser('--ipv4','--cacert',caPath,'https://localhost:'+port+'/api/admin/stats');
    assert.notEqual(tls.status,0);
    assert.match(tls.stderr,/certificate required|alert certificate|handshake failure/i);
  }
  assert.equal(await request('operator'),401);
  assert.equal(await request('operator',{origin:'https://other.invalid'}),403);
  const token = await srv.login('admin',password);
  assert.ok(token);
  assert.equal((await srv.get('/api/admin/stats',{token})).status,403);
  assert.equal(await request('operator',{authorization:'Bearer '+token}),200);
  const ws = new WebSocket('wss://localhost:'+port+'/ws',{family:4,origin:'https://localhost:'+port,
    ca:file('server.pem'),cert:file('operator.pem'),key:file('operator.key')});
  try {
    const hello = await new Promise((resolve,reject) => { ws.once('message',resolve); ws.once('error',reject); });
    assert.equal(JSON.parse(hello).type,'hello');
  } finally { ws.terminate(); }
});
