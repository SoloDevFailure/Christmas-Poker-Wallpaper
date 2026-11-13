// Real browser Canvas/PNG/EXIF regression checks. No network or database writes.
import { decodePhoto, preparePhoto } from '../src/photoStamp';
import { validCustomAsset, MAX_IMAGE_DATA_LENGTH } from '../src/customStamp';
import { exportArt } from '../src/art';
const ensure = (value: unknown, message: string) => { if (!value) throw Error(message); };
const output = document.getElementById('result')!;
async function file(canvas: HTMLCanvasElement, type = 'image/png') {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error('Encode failed')), type));
  return new File([blob], type === 'image/png' ? 'photo.png' : 'photo.jpg', { type });
}
async function check() {
  const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 80;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ff000080'; ctx.fillRect(30, 20, 60, 40);
  const decoded = await decodePhoto(await file(canvas));
  try {
    const asset = await preparePhoto(decoded.image);
    ensure(validCustomAsset(asset), 'Transparent PNG failed validation');
    ensure(asset.image_width === 120 && asset.image_height === 80, 'Small PNG aspect changed');
    const image = new Image(); image.src = asset.image_data; await image.decode();
    ctx.clearRect(0, 0, 120, 80); ctx.drawImage(image, 0, 0);
    ensure(ctx.getImageData(0, 0, 1, 1).data[3] === 0, 'Transparent corner became opaque');
    ensure(Math.abs(ctx.getImageData(60, 40, 1, 1).data[3] - 128) <= 1, 'Semi-transparency changed');
    let exported = '';
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { exported = this.href; };
    try {
      await exportArt([{ stamp_type: 'custom', ...JSON.parse(JSON.stringify(asset)), position_x: .5, position_y: .5, scale: 120, rotation: 0 }]);
      const png = new Image(); png.src = exported; await png.decode();
      const check = document.createElement('canvas'); check.width = 1920; check.height = 1080;
      const pixels = check.getContext('2d')!; pixels.drawImage(png, 0, 0);
      ensure(png.width === 1920 && png.height === 1080 && pixels.getImageData(960, 540, 1, 1).data[0] > 100, 'Export lost persisted photo pixels');
      await exportArt([]); png.src = exported; await png.decode(); pixels.drawImage(png, 0, 0);
      ensure(pixels.getImageData(960, 540, 1, 1).data[0] === 6, 'Export retained removed artwork');
    } finally { HTMLAnchorElement.prototype.click = click; }
  } finally { decoded.dispose(); }
  ctx.fillStyle = 'blue'; ctx.fillRect(0, 0, 120, 80);
  const jpeg = new Uint8Array(await (await file(canvas, 'image/jpeg')).arrayBuffer());
  const exif = new Uint8Array([255,225,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0]);
  const rotated = await decodePhoto(new File([jpeg.slice(0, 2), exif, jpeg.slice(2)], 'rotated.jpg', { type: 'image/jpeg' }));
  try {
    ensure(rotated.image.naturalWidth === 80 && rotated.image.naturalHeight === 120, 'EXIF orientation was not applied');
    const asset = await preparePhoto(rotated.image);
    ensure(asset.image_width === 80 && asset.image_height === 120, 'Oriented PNG aspect changed');
  } finally { rotated.dispose(); }
  canvas.width = 2000; canvas.height = 1500;
  const noise = ctx.createImageData(canvas.width, canvas.height);
  let seed = 17;
  for (let i = 0; i < noise.data.length; i += 4) {
    for (let c = 0; c < 3; c++) { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; noise.data[i + c] = seed >>> 24; }
    noise.data[i + 3] = 255;
  }
  ctx.putImageData(noise, 0, 0);
  const large = await decodePhoto(await file(canvas));
  try {
    const asset = await preparePhoto(large.image);
    ensure(validCustomAsset(asset) && asset.image_data.length <= MAX_IMAGE_DATA_LENGTH, 'Noisy photo exceeded payload cap');
    ensure(asset.image_width < 341 && asset.image_height < 256, 'Oversized PNG did not downsample');
    ensure(asset.image_width >= 100, 'Photo became unnecessarily small');
    ensure(Math.abs(asset.image_width / asset.image_height - 4 / 3) < .025, 'Downsampling stretched photo');
    output.textContent = `PASS: transparent and semi-transparent PNG, EXIF orientation, aspect ratio, photo export/removal, large/noisy photo resized to ${asset.image_width}×${asset.image_height} (${asset.image_data.length} characters).`;
  } finally { large.dispose(); }
  const broken = new File(['not a photo'], 'bad.heic', { type: 'image/heic' });
  try { await decodePhoto(broken); throw Error('Corrupt HEIC accepted'); }
  catch (e) { ensure(e instanceof Error && e.message.includes('Export it as JPEG'), 'HEIC fallback was unclear'); }
}
void check().catch(e => { output.textContent = 'FAIL: ' + String(e); console.error(e); });
