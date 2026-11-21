import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { WebSocket } from 'ws';
import { startServer } from './test-helpers.js';

test('a URL parser rejection returns HTTP 400 before the socket opens', {timeout:10000}, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'upgrade-validation-'));
  let srv;
  try {
    const preload = join(dir, 'parser.cjs');
    await writeFile(preload, "const parse = URL.parse.bind(URL); URL.parse = (s,b) => s === '/ws?fixture' ? null : parse(s,b);");
    srv = await startServer({env:{NODE_OPTIONS:'--require=' + JSON.stringify(preload), GGPOKER_BIND:'127.0.0.1'}});
    const address = srv.base.replace('http:', 'ws:') + '/ws';
    const rejected = new WebSocket(address + '?fixture');
    rejected.on('error', () => {});
    const status = await new Promise((resolve, reject) => {
      rejected.once('open', () => { rejected.close(); reject(new Error('Upgrade was accepted')); });
      rejected.once('unexpected-response', (req, res) => { res.resume(); req.destroy(); resolve(res.statusCode); });
    });
    assert.equal(status, 400);
    assert.equal((await srv.get('/healthz')).status, 200);
    const valid = new WebSocket(address);
    try { assert.equal(JSON.parse((await once(valid, 'message'))[0]).type, 'hello'); }
    finally { valid.close(); await once(valid, 'close'); }
  } finally {
    if (srv) { await srv.stop(); await rm(srv.dataDir,{recursive:true,force:true}); }
    await rm(dir,{recursive:true,force:true});
  }
});
