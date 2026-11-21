// SPDX-License-Identifier: AGPL-3.0-only
// Manual local supplier test. No OpenPoker database or wallet is opened.
import { createGamingoSandboxProvider } from '../server/gamingo-provider.js';

try {
  if (process.argv.length !== 2) throw new Error('Catalog only. Game launches are disabled.');
  if (['GAMINGO_OPERATOR_ID', 'GAMINGO_KEY_ID', 'GAMINGO_KEY_SECRET', 'GAMINGO_JURISDICTION'].some(key => !process.env[key])) {
    throw new Error('Supply Gamingo sandbox credentials and the assigned jurisdiction securely through the environment. See docs/GAMINGO.md.');
  }
  const provider = createGamingoSandboxProvider({ operatorId: process.env.GAMINGO_OPERATOR_ID,
    keyId: process.env.GAMINGO_KEY_ID, secret: process.env.GAMINGO_KEY_SECRET,
    aggregatorId: process.env.GAMINGO_AGGREGATOR_ID });
  const jurisdiction = process.env.GAMINGO_JURISDICTION;
  const catalog = await provider.games(jurisdiction);
  console.log(JSON.stringify({ sandbox: true, games: catalog.games.map(({ game_id, title, enabled, maintenance }) => ({ game_id, title, enabled, maintenance })) }, null, 2));
} catch (error) {
  console.error(error.message); process.exitCode = 1;
}
