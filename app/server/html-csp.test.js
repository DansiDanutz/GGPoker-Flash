import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

for (const mode of ['production', 'development']) {
  test(mode + ' HTML connection policy', () => {
    const moduleUrl = new URL('./security.js', import.meta.url).href;
    const csp = execFileSync(process.execPath, ['--input-type=module', '-e',
      `import { HTML_CSP } from ${JSON.stringify(moduleUrl)}; console.log(HTML_CSP)`],
    { encoding: 'utf8', env: { ...process.env, NODE_ENV: mode } });
    const connect = csp.trim().split('; ').find(d => d.startsWith('connect-src '));
    assert.equal(connect, mode === 'production' ? "connect-src 'self'" :
      "connect-src 'self' ws://127.0.0.1:* ws://localhost:*");
  });
}
