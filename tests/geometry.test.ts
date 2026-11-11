import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homography, project, fitMarkers, markers, SIZE } from '../src/geometry.ts';
import { validPlacement } from '../src/types.ts';
test('perspective mapping recovers an oblique screen including interior points', () => {
    const h = [.6, .03, 70, .02, .7, 45, .00012, .00008];
    const pts = [{ x: 0, y: 0 }, { x: 1920, y: 0 }, { x: 1920, y: 1080 }, { x: 0, y: 1080 }, { x: 400, y: 800 }];
    const camera = pts.map(p => project(h, p)), inverse = homography(camera, pts);
    for (const p of [{ x: 960, y: 540 }, { x: 1700, y: 200 }, { x: 0, y: 0 }]) {
        const q = project(inverse, project(h, p));
        assert.ok(Math.hypot(p.x - q.x, p.y - q.y) < .001);
    }
});
test('four-marker fit uses all corners and rejects ambiguous IDs', () => {
    const h = [.5, .03, 30, .02, .5, 20, .0001, .00003];
    const found = markers.map(m => ({ id: m.id, corners: [{ x: m.x, y: m.y }, { x: m.x + SIZE, y: m.y }, { x: m.x + SIZE, y: m.y + SIZE }, { x: m.x, y: m.y + SIZE }].map(p => project(h, p)) }));
    const fit = fitMarkers(found);
    assert.ok(fit.error < .001);
    const q = project(fit.h, project(h, { x: 960, y: 540 }));
    assert.ok(Math.abs(q.x - 960) < .001);
    assert.equal(fitMarkers(found.slice(1)).count, 3);
    assert.throws(() => fitMarkers(found.slice(2)));
    assert.equal(fitMarkers([...found, found[0]]).count, 3);
});
test('reject degenerate geometry and invalid placements', () => {
    assert.throws(() => homography(Array(4).fill({ x: 0, y: 0 }), Array(4).fill({ x: 1, y: 1 })));
    const good = { stamp_type: 'star' as const, position_x: .4, position_y: .5, scale: 160, rotation: 0 };
    assert.ok(validPlacement(good));
    for (const bad of [{ position_x: NaN }, { position_y: 1.1 }, { scale: Infinity }, { rotation: 361 }])
        assert.equal(validPlacement({ ...good, ...bad }), false);
});
