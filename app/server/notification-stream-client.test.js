import test from 'node:test';
import assert from 'node:assert/strict';
import { subscribeNotifications } from '../src/lib/notificationStream.ts';

test('notification client reconnects on EOF without a URL credential and stops on denial', async t => {
  const calls = [], delivered = [];
  let finish;
  const denied = new Promise(resolve => { finish = resolve; });
  t.mock.method(globalThis,'fetch',async (url,options) => {
    calls.push([url,options.headers.authorization]);
    if (calls.length === 2) { finish(); return new Response(null,{status:401}); }
    return new Response(new ReadableStream({start(c) {
      for (const part of [': ping\n\nda','ta: {"n":1}\r\n','\r\n']) c.enqueue(new TextEncoder().encode(part));
      c.close();
    }}));
  });
  const unsubscribe = subscribeNotifications(()=> 'fixture', s=>delivered.push(JSON.parse(s)),5);
  try {
    await denied;
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.deepEqual(calls,Array(2).fill(['/api/notifications/stream','Bearer fixture']));
    assert.deepEqual(delivered,[{n:1}]);
  } finally { unsubscribe(); }
});
