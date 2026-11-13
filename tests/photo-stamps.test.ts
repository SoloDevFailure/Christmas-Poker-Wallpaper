import { test } from 'node:test';
import assert from 'node:assert/strict';
import { photoDimensions, validatePhotoFile, MAX_PHOTO_BYTES, MAX_PHOTO_PIXELS } from '../src/photoStamp';
import { confirmedDuplicate } from '../src/stampUndo';

test('photo fitting preserves landscape, portrait and square aspect ratios without upscaling', () => {
  assert.deepEqual(photoDimensions(4000, 3000), { width: 341, height: 256 });
  assert.deepEqual(photoDimensions(3000, 4000), { width: 192, height: 256 });
  assert.deepEqual(photoDimensions(4000, 4000), { width: 256, height: 256 });
  assert.deepEqual(photoDimensions(8000, 1000), { width: 512, height: 64 });
  assert.deepEqual(photoDimensions(50, 30), { width: 50, height: 30 });
  for (const [w, h] of [[4000, 3000], [3000, 4000], [8000, 1000]]) {
    const fitted = photoDimensions(w, h, .85 ** 3);
    assert.ok(fitted.width <= 512 && fitted.height <= 256);
    assert.ok(Math.abs((fitted.width / fitted.height) / (w / h) - 1) < .02);
  }
});
test('photo input rejects oversized files, unsafe formats and excessive decoded pixels', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']) validatePhotoFile({ size: 1, type, name: 'photo' });
  validatePhotoFile({ size: 1, type: '', name: 'photo.HEIC' });
  assert.throws(() => validatePhotoFile({ size: MAX_PHOTO_BYTES + 1, type: 'image/jpeg', name: 'photo.jpg' }), /20 MB/);
  assert.throws(() => validatePhotoFile({ size: 0, type: 'image/png', name: 'photo.png' }), /empty/);
  assert.throws(() => validatePhotoFile({ size: 50, type: 'image/svg+xml', name: 'photo.svg' }), /JPEG/);
  assert.throws(() => validatePhotoFile({ size: 50, type: 'image/svg+xml', name: 'photo.jpg' }), /JPEG/);
  for (const [w, h] of [[Infinity, 1], [0, 100], [NaN, 1], [MAX_PHOTO_PIXELS + 1, 1]]) assert.throws(() => photoDimensions(w, h));
});
test('ambiguous duplicate inserts count as successful only for the same authenticated creator and wallpaper', () => {
  const row = { id: 'stamp', session_id: 'wallpaper', created_by: 'device' };
  assert.equal(confirmedDuplicate(row, 'stamp', 'wallpaper', 'device'), true);
  assert.equal(confirmedDuplicate(row, 'stamp', 'wallpaper', 'other-device'), false);
  assert.equal(confirmedDuplicate(row, 'stamp', 'other-wallpaper', 'device'), false);
  assert.equal(confirmedDuplicate(null, 'stamp', 'wallpaper', 'device'), false);
});
