import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { startServer } from './test-helpers.js';

test('initial session failure rolls back both signup paths and their welcome credit', async () => {
  const srv = await startServer();
  try {
    const db = new DatabaseSync(join(srv.dataDir, 'ggpoker.db'));
    try {
      const counts = () => ['users','transactions','bonus_claims','sessions'].map(t => db.prepare('SELECT count(*) n FROM '+t).get().n);
      const before = counts();
      db.exec("CREATE TRIGGER fixture_fail_session BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
      const body = {login:'fixtureuser',nick:'FixtureUser',password:'fixturepassword'};
      for (const path of ['register','guest']) {
        assert.equal((await srv.post('/api/auth/'+path,{body})).status,500);
        assert.deepEqual(counts(),before);
      }
      db.exec('DROP TRIGGER fixture_fail_session');
      assert.equal((await srv.post('/api/auth/register',{body})).status,200);
    } finally { db.close(); }
  } finally { await srv.stop(); }
});
