import test from 'node:test';
import assert from 'node:assert/strict';
import { bendCardPoint } from '../src/game/squeezeSurface.ts';
test('card bending preserves local material lengths instead of stretching a flap', () => {
    for (const progress of [.01, .2, .5, 1])
        for (let x = 10; x < 140; x += 19)
            for (let y = 10; y < 200; y += 13) {
                const p = bendCardPoint(x, y, progress), dx = bendCardPoint(x + .001, y, progress), dy = bendCardPoint(x, y + .001, progress);
                const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
                assert.ok(Math.abs(distance(p, dx) - .001) < 1e-7);
                assert.ok(Math.abs(distance(p, dy) - .001) < 1e-7);
                assert.ok(p.z >= 0, 'The card cannot penetrate the felt');
            }
});
test('zero pressure leaves the sheet flat and the far corner anchored', () => {
    assert.deepEqual(bendCardPoint(45, 190, 0), { x: 45, y: 190, z: 0 });
    for (const p of [.1, .5, 1])
        assert.deepEqual(bendCardPoint(145, 0, p), { x: 145, y: 0, z: 0 });
});
test('card stock thickness and inter-card separation follow the surface normal', () => {
    for (const progress of [.1, .5, 1])
        for (let x = 0; x <= 145; x += 10)
            for (let y = 0; y <= 203; y += 10) {
                const face = bendCardPoint(x, y, progress, -.12), back = bendCardPoint(x, y, progress, .12);
                const nextFace = bendCardPoint(x, y, progress, .55 - .12);
                assert.ok(Math.abs(Math.hypot(face.x - back.x, face.y - back.y, face.z - back.z) - .24) < 1e-9);
                assert.ok(Math.abs(Math.hypot(nextFace.x - back.x, nextFace.y - back.y, nextFace.z - back.z) - .31) < 1e-9);
            }
});
