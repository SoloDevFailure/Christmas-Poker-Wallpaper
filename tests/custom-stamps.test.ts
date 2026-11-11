import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateText, graphemes, layoutText, validCustomAsset, MAX_TEXT_LENGTH, MAX_IMAGE_DATA_LENGTH } from '../src/customStamp.ts';
import { stampDimensions, validPlacement, type Placement } from '../src/types.ts';
import { stickerCorners, manipulate } from '../src/manipulation.ts';
import { stampSource, sources } from '../src/art.ts';
import { W, H } from '../src/geometry.ts';
// Header fixture validates payload constraints, not browser PNG decoding.
function asset(width = 320, height = 80) { const data = Buffer.alloc(45); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(data); data.write('IHDR', 12); data.writeUInt32BE(width, 16); data.writeUInt32BE(height, 20); return { image_data: 'data:image/png;base64,' + data.toString('base64'), image_width: width, image_height: height }; }
test('native keyboard content supports Unicode, mixed text and explicit newlines', () => {
    assert.equal(validateText('Merry Christmas 🎄\r\nHello 👨‍👩‍👧‍👦'), 'Merry Christmas 🎄\nHello 👨‍👩‍👧‍👦');
    assert.deepEqual(graphemes('🇦🇺👨‍👩‍👧‍👦👍🏽'), ['🇦🇺', '👨‍👩‍👧‍👦', '👍🏽']);
    for (const invalid of ['', '  \n ', 'a'.repeat(MAX_TEXT_LENGTH + 1), '1\n2\n3\n4\n5', 'bad\u0000'])
        assert.throws(() => validateText(invalid));
});
test('text wrapping stays bounded without breaking joined emoji sequences', () => {
    const text = 'Hello 👨‍👩‍👧‍👦 🇦🇺\n' + 'x'.repeat(100), layout = layoutText(text, (s, size) => graphemes(s).length * size * .65);
    assert.ok(layout.width <= 512 && layout.height <= 256);
    assert.ok(layout.fontSize >= 10);
    assert.ok(layout.lines.join('').includes('👨‍👩‍👧‍👦'));
    assert.equal(layoutText('A\nB', (s, size) => s.length * size).lines.length, 2);
});
test('custom assets reject oversized, unsafe and inconsistent image data', () => {
    const png = asset();
    assert.equal(validCustomAsset(png), true);
    for (const invalid of [{ ...png, image_width: 321 }, { ...png, image_height: 0 }, { ...asset(513, 80) }, { ...asset(200, 257) }, { ...png, image_data: 'data:image/svg+xml,<svg/>' }, { ...png, image_data: 'https://example.com/x.png' }, { ...png, image_data: 'data:image/png;base64,' + 'a'.repeat(MAX_IMAGE_DATA_LENGTH) }])
        assert.equal(validCustomAsset(invalid), false);
});
test('wide and tall images keep their aspect in camera, wallpaper and export geometry', () => {
    const p: Placement = { stamp_type: 'custom', ...asset(), position_x: .5, position_y: .5, scale: 200, rotation: 35 };
    assert.equal(validPlacement(p), true);
    assert.deepEqual(stampDimensions(p), { width: 200, height: 50 });
    assert.equal(stampSource(p), p.image_data);
    const c = stickerCorners(p);
    assert.ok(Math.abs(Math.hypot(c[1].x - c[0].x, c[1].y - c[0].y) - 200) < 1e-6);
    assert.ok(Math.abs(Math.hypot(c[3].x - c[0].x, c[3].y - c[0].y) - 50) < 1e-6);
    assert.deepEqual(stampDimensions({ ...p, ...asset(40, 160) }), { width: 50, height: 200 });
    const moved = manipulate({ placement: p, points: [{ x: 960, y: 540 }] }, [{ x: 1060, y: 590 }]);
    assert.equal(moved.image_data, p.image_data);
    assert.equal(moved.scale, p.scale);
    assert.equal(moved.rotation, p.rotation);
    assert.equal(moved.position_x * W, 1060);
    assert.equal(moved.position_y * H, 590);
});
test('presets and old stored transformations remain unchanged', () => {
    for (const stamp_type of ['star', 'tree', 'eggplant'] as const) {
        const p: Placement = { stamp_type, position_x: .25, position_y: .8, scale: 160, rotation: -40 };
        assert.equal(validPlacement(p), true);
        assert.deepEqual(stampDimensions(p), { width: 160, height: 160 });
        assert.equal(stampSource(p), sources[stamp_type]);
        assert.deepEqual(JSON.parse(JSON.stringify(p)), p);
    }
    assert.equal(validPlacement({ stamp_type: 'custom', position_x: .5, position_y: .5, scale: 160, rotation: 0 }), false);
});
