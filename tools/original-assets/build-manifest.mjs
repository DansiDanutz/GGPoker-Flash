// Lists every third-party asset the app can load, with the facts a replacement must match.
// Usage: node tools/original-assets/build-manifest.mjs <extracted-assets-dir> > manifest.json
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const src = path.resolve(process.argv[2]);
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const code = execFileSync('grep', ['-rhoE', "assets/[A-Za-z0-9_./${}`+-]+", 'app/src', 'app/server', 'app/index.html'], { cwd: repo, encoding: 'utf8' });
const refs = [...new Set(code.split('\n').filter(Boolean).map((r) => r.replace(/^assets\//, '').replace(/\$\{.*$/, '').replace(/[`'"]$/, '')))];
const KEEP = new Set(['brand/logo.png', 'README.md', 'Roboto-Bold.ttf', 'RobotoCondensed-Italic.ttf', 'RobotoCondensed-Regular.ttf']);

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const full = path.join(dir, e.name);
  return e.isDirectory() ? walk(full) : [full];
});
const isUsed = (rel) => refs.some((r) => r && (rel === r || (r.endsWith('/') || r.endsWith('_') || r.endsWith('-') ? rel.startsWith(r) : false)))
  || rel.startsWith('sounds/') || rel.startsWith('squeeze/') || rel.startsWith('table/clock/') || rel.startsWith('chrome/') || rel.startsWith('tables/');

const out = [];
for (const full of walk(src)) {
  const rel = path.relative(src, full);
  if (KEEP.has(rel) || rel.startsWith('swf/') && false) continue;
  if (!isUsed(rel)) continue;
  const ext = path.extname(rel).toLowerCase();
  const entry = { path: rel, bytes: fs.statSync(full).size };
  if (ext === '.png' || ext === '.jpg' || ext === '.webp') {
    const info = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', full], { encoding: 'utf8' });
    entry.width = Number(info.match(/pixelWidth: (\d+)/)[1]);
    entry.height = Number(info.match(/pixelHeight: (\d+)/)[1]);
  } else if (ext === '.mp3') {
    entry.seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', full], { encoding: 'utf8' }).trim());
  }
  out.push(entry);
}
process.stdout.write(JSON.stringify(out, null, 1) + '\n');
