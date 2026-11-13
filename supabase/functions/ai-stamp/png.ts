import { inflateSync } from 'node:zlib';
import { Buffer } from 'node:buffer';
export const MAX_AI_UPLOAD = 8 * 1024 * 1024;
export type PngPixels = { width: number; height: number; data: Uint8Array };
const signature = [137, 80, 78, 71, 13, 10, 26, 10];
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let c = value; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
});
function crc(bytes: Uint8Array) {
  let value = 0xffffffff; for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8); return (value ^ 0xffffffff) >>> 0;
}
export function decodePng(bytes: Uint8Array, maxEdge = 1536): PngPixels {
  if (bytes.length < 45 || bytes.length > MAX_AI_UPLOAD || signature.some((n, i) => bytes[i] !== n)) throw Error('Invalid PNG');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8, width = 0, height = 0, channels = 0, ended = false;
  const compressed: Uint8Array[] = [];
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset), end = offset + 12 + length;
    if (end > bytes.length) throw Error('Truncated PNG');
    const kind = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (crc(bytes.subarray(offset + 4, end - 4)) !== view.getUint32(end - 4)) throw Error('Invalid PNG checksum');
    const data = bytes.subarray(offset + 8, end - 4);
    if (kind === 'IHDR') {
      if (offset !== 8 || length !== 13 || width) throw Error('Invalid PNG header');
      width = view.getUint32(offset + 8); height = view.getUint32(offset + 12);
      if (!width || !height || width > maxEdge || height > maxEdge) throw Error('PNG dimensions exceed limit');
      if (data[8] !== 8 || ![2, 6].includes(data[9]) || data[10] || data[11] || data[12]) throw Error('Use a non-interlaced 8-bit RGB/RGBA PNG');
      channels = data[9] === 6 ? 4 : 3;
    } else if (!width) throw Error('Missing PNG header');
    else if (kind === 'IDAT') compressed.push(data);
    else if (kind === 'IEND') { ended = true; offset = end; break; }
    else if (kind[0] === kind[0].toUpperCase()) throw Error('Unsupported PNG chunk');
    offset = end;
  }
  if (!ended || offset !== bytes.length || !compressed.length) throw Error('Incomplete PNG');
  const stride = width * channels, expected = height * (stride + 1);
  // Bound decompression before allocating pixels, including malicious IDAT bombs.
  const inflated = inflateSync(Buffer.concat(compressed), { maxOutputLength: expected });
  if (inflated.length !== expected) throw Error('Invalid PNG pixel length');
  const raw = new Uint8Array(stride * height);
  function paeth(a: number, b: number, c: number) {
    const p = a + b - c, x = Math.abs(p - a), y = Math.abs(p - b), z = Math.abs(p - c);
    return x <= y && x <= z ? a : y <= z ? b : c;
  }
  for (let y = 0; y < height; y++) {
    const filter = inflated[y * (stride + 1)]; if (filter > 4) throw Error('Invalid PNG filter');
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x, a = x >= channels ? raw[at - channels] : 0, b = y ? raw[at - stride] : 0, c = y && x >= channels ? raw[at - stride - channels] : 0;
      raw[at] = inflated[y * (stride + 1) + x + 1] + (filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : paeth(a, b, c));
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0, p = 0; i < raw.length; i += channels, p += 4) {
    rgba[p] = raw[i]; rgba[p + 1] = raw[i + 1]; rgba[p + 2] = raw[i + 2]; rgba[p + 3] = channels === 4 ? raw[i + 3] : 255;
  }
  return { width, height, data: rgba };
}
export function assertStickerTransparency(image: PngPixels) {
  const { width, height, data } = image; let transparent = 0, foreground = 0, border = 0, clearBorder = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const alpha = data[(y * width + x) * 4 + 3];
    if (alpha <= 8) transparent++; if (alpha >= 128) foreground++;
    if (!x || !y || x === width - 1 || y === height - 1) { border++; if (alpha <= 8) clearBorder++; }
  }
  const total = width * height;
  if (transparent < total * .05 || foreground < total * .01 || clearBorder < border * .8)
    throw Error('The generated image did not have a clear transparent background.');
}
