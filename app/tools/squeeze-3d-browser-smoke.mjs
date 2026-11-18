#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { startSandbox } from './contributor-sandbox.mjs';
const artifacts = path.resolve(process.env.ARTIFACTS_DIR || 'artifacts/squeeze-3d');
await mkdir(artifacts, { recursive: true });
const sandbox = await startSandbox();
let browser;
try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome'), headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.evaluateOnNewDocument(() => {
        const get = HTMLCanvasElement.prototype.getContext;
        window.gpuCanvases = [];
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
            if (type === 'webgl2') {
                if (window.denyGpu)
                    return null;
                window.gpuCanvases.push(this);
            }
            return get.call(this, type, ...args);
        };
    });
    await page.goto(sandbox.url);
    const pixels = await page.evaluate(async () => {
        const { createSqueeze3D } = await import('/src/game/squeeze3d.ts');
        const target = document.createElement('canvas');
        target.width = 652;
        target.height = 484;
        const ctx = target.getContext('2d', { willReadFrequently: true });
        const render = async (cards, frame) => { const canvas = document.createElement('canvas'); const renderer = await createSqueeze3D(canvas, cards, () => { }); renderer.paint(frame); ctx.clearRect(0, 0, 652, 484); ctx.drawImage(canvas, 0, 0); const data = Array.from(ctx.getImageData(0, 0, 652, 484).data); renderer.dispose(); return data; };
        const a = await render([10, 44], 30), b = await render([22, 44], 30), c = await render([10, 40], 30), d = await render([10, 44], 60), e = await render([22, 44], 60);
        const diff = (a, b) => a.reduce((n, v, i) => n + (Math.abs(v - b[i]) > 2 ? 1 : 0), 0);
        return { hidden: diff(a, b), first: diff(a, c), second: diff(d, e) };
    });
    assert.equal(pixels.hidden, 0, 'Occluded card must not leak its identity');
    assert.ok(pixels.first > 100 && pixels.second > 100, 'Both card identities must be visible at their reveal stages');
    await page.evaluate(async () => {
        document.body.innerHTML = '<div id="host" style="position:fixed;inset:0;background:#143624"></div>';
        const { createSqueezePanel } = await import('/src/game/squeeze.ts');
        window.closes = 0;
        window.mount = (enabled = true) => { window.disposePanel = createSqueezePanel(document.querySelector('#host'), ['4h', 'Kc'], () => { window.closes++; }, undefined, enabled); };
        window.mount();
    });
    const ready = async () => { await page.waitForSelector('.cardSqueeze[aria-busy="false"]'); await page.$eval('.cardSqueeze', async (n) => { await Promise.all(n.getAnimations().map(a => a.finished)); }); };
    await ready();
    assert.equal(await page.$eval('.cardSqueeze', n => n.dataset.renderer), 'webgl');
    await page.evaluate(() => { window.disposePanel(); window.mount(false); });
    await ready();
    assert.equal(await page.$eval('.cardSqueeze', n => n.dataset.renderer), '2d-default', 'Free default must not activate the paid renderer');
    await page.evaluate(() => { window.disposePanel(); window.mount(); });
    await ready();
    await page.screenshot({ path: path.join(artifacts, 'ready.png') });
    await page.evaluate(() => { const canvas = window.gpuCanvases.at(-1); const gl = canvas.getContext('webgl2'); const extension = gl.getExtension('WEBGL_lose_context'); if (!extension)
        throw Error('Context loss extension required for rehearsal'); extension.loseContext(); });
    await page.waitForFunction(() => document.querySelector('.cardSqueeze')?.dataset.renderer === '2d-fallback');
    assert.equal(await page.$eval('.cardSqueeze', n => n.dataset.renderer), '2d-fallback');
    await page.click('.squeezeOpen');
    await page.waitForFunction(() => window.closes === 1);
    await page.evaluate(() => { window.denyGpu = true; window.mount(); });
    await ready();
    assert.equal(await page.$eval('.cardSqueeze', n => n.dataset.renderer), '2d-fallback');
    await page.click('.squeezeOpen');
    await page.waitForFunction(() => window.closes === 2);
    await page.evaluate(() => { window.denyGpu = false; window.mount(); window.disposePanel(); });
    await new Promise(r => setTimeout(r, 500));
    assert.equal(await page.$('.cardSqueeze'), null, 'Disposal while loading cannot resurrect panel');
    for (let i = 0; i < 8; i++) {
        await page.evaluate(() => window.mount());
        await ready();
        await page.evaluate(() => window.disposePanel());
    }
    const released = await page.evaluate(() => window.gpuCanvases.every(canvas => canvas.getContext('webgl2')?.isContextLost()));
    assert.equal(released, true, 'Disposed panels release every tracked GPU context');
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.evaluate(() => window.mount());
    await ready();
    await page.click('.squeezeOpen');
    await page.waitForFunction(() => window.closes === 3);
    assert.equal(await page.$('.cardSqueeze'), null);
    assert.deepEqual(errors, []);
    const result = { ok: true, pixels, checks: ['free default never activates 3D', '3D card occlusion and actual identities', 'context-loss fallback and one completion', 'WebGL unavailable fallback', 'dispose during loading', 'eight repeated mount/dispose cycles', 'reduced motion Open'], errors };
    await writeFile(path.join(artifacts, 'results.json'), JSON.stringify(result, null, 2));
    console.log(result);
}
finally {
    await browser?.close();
    await sandbox.close();
}
