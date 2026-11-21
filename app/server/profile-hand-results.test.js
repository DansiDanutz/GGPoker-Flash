import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './test-helpers.js';

test('profile counts played hands, wins, and largest award from SQLite hand history', async () => {
  const srv = await startServer();
  try {
    const {user,token} = (await srv.post('/api/auth/register',{body:{login:'profiler',nick:'Profiler',password:'secret123'}})).data;
    const db = new DatabaseSync(path.join(srv.dataDir,'ggpoker.db'));
    try {
      const add = db.prepare("INSERT INTO hands(hand_no,table_id,table_name,game,players,board,pot,result,actions) VALUES(1,'test','Test','holdem',?,'',1000,?,'[]')");
      const hand = (inHand,result) => add.run(JSON.stringify([{id:user.id,inHand}]),result);
      hand(true,JSON.stringify({winners:[{id:user.id,amount:80},{id:user.id,amount:200}]}));
      hand(true,JSON.stringify({winners:[{id:99999,amount:1000}]}));
      hand(true,'broken legacy JSON');
      hand(false,'{}');
    } finally { db.close(); }
    const response = await srv.get('/api/users/'+user.id+'/profile',{token});
    assert.equal(response.status,200);
    assert.deepEqual(response.data.stats,{played:3,won:1,biggest:200});
  } finally { await srv.stop(); }
});
