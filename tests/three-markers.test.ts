import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitMarkers, markers, markerCorners, project, type Detection } from '../src/geometry.ts';
const views = [
    [.5, .02, 50, .01, .55, 25, .00012, .00004],
    [.42, .13, 160, -.03, .55, 90, .00037, .00018],
    [.13, -.5, 650, .45, .08, 60, .00015, .00024]
];
const samples = [{ x: 60, y: 80 }, { x: 960, y: 540 }, { x: 1830, y: 990 }, { x: 300, y: 800 }];
function detections(h: number[], noise = false): Detection[] { return [markers[0],markers[2],markers[5],markers[7]].map(m => ({ id: m.id, corners: markerCorners(m).map((p, j) => { const q = project(h, p); return { x: q.x + (noise ? Math.sin(m.id + j) * .35 : 0), y: q.y + (noise ? Math.cos(m.id - j) * .35 : 0) }; }) })); }
for (const [angle, h] of views.entries())
    for (let missing = 0; missing < 4; missing++)
        test('three-marker perspective: view ' + angle + ', missing ' + [markers[0],markers[2],markers[5],markers[7]][missing].id, () => {
            const found = detections(h).filter((_, i) => i !== missing), fit = fitMarkers(found);
            assert.equal(fit.count, 3);
            assert.ok(fit.error < 1e-6);
            for (const p of samples) {
                const q = project(fit.h, project(h, p));
                assert.ok(Math.hypot(q.x - p.x, q.y - p.y) < .001);
            }
            // Subpixel detector noise is amplified at the extrapolated missing corner.
            const noisy = fitMarkers(detections(h, true).filter((_, i) => i !== missing));
            for (const p of samples) {
                const q = project(noisy.h, project(h, p));
                assert.ok(Math.hypot(q.x - p.x, q.y - p.y) < 12, 'Noisy placement error: ' + Math.hypot(q.x - p.x, q.y - p.y));
            }
        });
test('prefer four inliers, reject each possible displaced fourth marker', () => {
    for (let bad = 0; bad < 4; bad++) {
        const found = detections(views[1]);
        assert.equal(fitMarkers(found).count, 4);
        found[bad].corners = found[bad].corners.map(p => ({ x: p.x + 90, y: p.y - 45 }));
        const fit = fitMarkers(found);
        assert.equal(fit.count, 3);
        assert.ok(!fit.ids.includes(found[bad].id));
        for (const p of samples) {
            const q = project(fit.h, project(views[1], p));
            assert.ok(Math.hypot(q.x - p.x, q.y - p.y) < .001);
        }
    }
});
test('reject insufficient, malformed and inconsistent observations', () => {
    const found = detections(views[0]);
    assert.throws(() => fitMarkers(found.slice(0, 2)));
    found[0].corners[0].x += 150;
    assert.throws(() => fitMarkers(found.slice(0, 3)));
    const duplicate = detections(views[0]);
    assert.equal(fitMarkers([...duplicate, duplicate[0]]).count, 3);
    const tiny = detections(views[0]).map(m => ({ ...m, corners: m.corners.map(p => ({ x: p.x / 100, y: p.y / 100 })) }));
    assert.throws(() => fitMarkers(tiny));
});
