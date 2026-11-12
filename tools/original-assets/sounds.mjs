// Generates the original DanGG sound set into app/public/assets/sounds/.
// Run from the repo root: node tools/original-assets/sounds.mjs
// Synthesis: deterministic JS DSP (sound-dsp.mjs) + ffmpeg filters/encoding. Voice lines are
// recorded takes in voice/ (Dan's cloned voice from VoiceStudio; see voice/README.md). Never use a
// system text-to-speech voice here.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SR, edgeFade } from './sound-dsp.mjs';
import { TABLE } from './sound-table.mjs';
import { FX } from './sound-fx.mjs';
import { bgm } from './sound-bgm.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '../..');
const OUT_DIR = path.join(ROOT, 'app/public/assets/sounds');
const SOUND_TS = path.join(ROOT, 'app/src/lib/sound.ts');
const MANIFEST = path.join(HERE, 'manifest.json');

const VOICE_DIR = path.join(HERE, 'voice');
const VOICES = {
  'VoiceRaise.mp3': 'VoiceRaise.wav', 'VoiceAllIn.mp3': 'VoiceAllIn.wav', 'VoiceCheck.mp3': 'VoiceCheck.wav',
  'VoiceFold.mp3': 'VoiceFold.wav', 'VoiceCall.mp3': 'VoiceCall.wav', 'VoiceBet.mp3': 'VoiceBet.wav',
};
const RECIPES = { ...TABLE, ...FX, 'BgmLobby.mp3': bgm };

// Loudness targets (dBFS): loudest 50 ms RMS window, with a hard peak ceiling.
const LEVELS = {
  sfx: { rms: -14, peak: -1 },
  alert: { rms: -16, peak: -1.5 },
  music: { rms: -20, peak: -3 },
};
const ALERTS = new Set(['NotificationTimeTurnToAct.mp3', 'NotificationTimeBank.mp3', 'NotificationTimeWinding.mp3', 'tick.mp3']);
const DURATION_TOLERANCE = 0.3;

function run(cmd, args, input) {
  const res = spawnSync(cmd, args, { input, maxBuffer: 1 << 30 });
  if (res.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed:\n${res.stderr?.toString().slice(-800)}`);
  return res.stdout;
}

const toBuf = (data) => Buffer.from(data.buffer, data.byteOffset, data.byteLength);
const fromBuf = (buf) => new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const RAW_IN = ['-hide_banner', '-loglevel', 'error', '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', 'pipe:0'];
const RAW_OUT = ['-f', 'f32le', '-ar', String(SR), '-ac', '1', 'pipe:1'];

/** Run samples through an ffmpeg filter chain and get samples back. */
const ffFilter = (data, filter) => fromBuf(run('ffmpeg', [...RAW_IN, '-af', filter, ...RAW_OUT], toBuf(data)));

function normalise(data, { rms, peak }) {
  const win = Math.round(SR * 0.05);
  let maxRms = 0;
  let maxPeak = 0;
  for (let s = 0; s < data.length; s += Math.floor(win / 2)) {
    let sum = 0;
    const end = Math.min(data.length, s + win);
    for (let i = s; i < end; i++) sum += data[i] * data[i];
    maxRms = Math.max(maxRms, Math.sqrt(sum / Math.max(1, end - s)));
  }
  for (const x of data) maxPeak = Math.max(maxPeak, Math.abs(x));
  if (maxPeak === 0) throw new Error('silent render');
  const db = (x) => 20 * Math.log10(x);
  const gainDb = Math.min(rms - db(maxRms), peak - db(maxPeak));
  const g = 10 ** (gainDb / 20);
  return data.map((x) => x * g);
}

function encode(file, data, bitrate) {
  run('ffmpeg', [...RAW_IN, '-c:a', 'libmp3lame', '-b:a', bitrate, '-ar', String(SR), '-ac', '1',
    '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-y', file], toBuf(data));
}

/** Load a recorded voice take, trim leading/trailing silence, then fit and pad to the target length. */
function voice(take, target) {
  const source = path.join(VOICE_DIR, take);
  let data = fromBuf(run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', source, ...RAW_OUT]));
  const loud = (x) => Math.abs(x) > 0.01;
  const first = data.findIndex(loud);
  const last = data.length - 1 - [...data].reverse().findIndex(loud);
  data = data.slice(Math.max(0, first - Math.round(SR * 0.01)), last + Math.round(SR * 0.03));
  const maxLen = target * 0.85;
  if (data.length / SR > maxLen) data = ffFilter(data, `atempo=${(data.length / SR / maxLen).toFixed(3)}`);
  const padded = new Float32Array(Math.round(target * SR));
  padded.set(data.subarray(0, padded.length), Math.round(SR * 0.02));
  return padded;
}

function referencedSounds() {
  const src = fs.readFileSync(SOUND_TS, 'utf8');
  return [...new Set([...src.matchAll(/'([\w-]+\.mp3)'/g)].map((m) => m[1]))];
}

function probe(file) {
  const out = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,sample_rate,channels',
    '-of', 'json', file]).toString();
  const j = JSON.parse(out);
  return { seconds: Number(j.format.duration), codec: j.streams[0].codec_name, rate: Number(j.streams[0].sample_rate) };
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const originals = new Map(manifest.filter((e) => e.path.startsWith('sounds/')).map((e) => [path.basename(e.path), e.seconds]));
  const wanted = referencedSounds();
  const missing = wanted.filter((f) => !RECIPES[f] && !VOICES[f]);
  if (missing.length) throw new Error(`No recipe for referenced sound(s): ${missing.join(', ')}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const failures = [];
  for (const name of wanted) {
    const target = originals.get(name);
    let data;
    let level = ALERTS.has(name) ? LEVELS.alert : LEVELS.sfx;
    if (VOICES[name]) data = voice(VOICES[name], target);
    else {
      const recipe = RECIPES[name]();
      data = recipe.post ? ffFilter(recipe.data, recipe.post) : recipe.data;
      if (name === 'BgmLobby.mp3') level = LEVELS.music;
    }
    const file = path.join(OUT_DIR, name);
    encode(file, edgeFade(normalise(data, level)), name === 'BgmLobby.mp3' ? '112k' : '96k');
    const p = probe(file);
    const ok = p.codec === 'mp3' && p.rate === SR && Math.abs(p.seconds - target) <= target * DURATION_TOLERANCE;
    if (!ok) failures.push(name);
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(34)} ${p.seconds.toFixed(3)}s (orig ${target.toFixed(3)}s) ${p.codec} ${p.rate}Hz ${fs.statSync(file).size}B`);
  }
  const unused = [...originals.keys()].filter((f) => !wanted.includes(f));
  console.log(`\nGenerated ${wanted.length} files. Unreferenced manifest sounds (not generated): ${unused.length}`);
  console.log(unused.join('\n'));
  if (failures.length) {
    console.error(`\nVerification failed: ${failures.join(', ')}`);
    process.exit(1);
  }
}

main();
