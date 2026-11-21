import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { startServer } from './test-helpers.js';

test('a read-marker batch can be replayed after a competing writer releases its lock', async () => {
  const srv = await startServer();
  try {
    const token = await srv.login('admin', 'admin123');
    const mark = keys => srv.post('/api/notifications/read', { token, body: { keys } });
    assert.equal((await mark(['fixture:first'])).status, 200);
    const db = new DatabaseSync(join(srv.dataDir, 'ggpoker.db'));
    try {
      const rows = db.prepare("SELECT item_key,read_at FROM notification_reads WHERE item_key LIKE 'fixture:%' ORDER BY item_key");
      const original = rows.all();
      const batch = ['fixture:first', 'fixture:second', 'fixture:second'];
      db.exec('BEGIN IMMEDIATE');
      try {
        const busy = await mark(batch);
        assert.equal(busy.status, 503);
        assert.equal(busy.headers.get('retry-after'), '1');
      }
      finally { db.exec('ROLLBACK'); }
      assert.deepEqual(rows.all(), original);
      assert.equal((await mark(batch)).status, 200);
      const saved = rows.all();
      assert.deepEqual(saved.map(r => r.item_key), ['fixture:first','fixture:second']);
      assert.deepEqual(saved[0], original[0]);
    } finally { db.close(); }
  } finally { await srv.stop(); }
});
