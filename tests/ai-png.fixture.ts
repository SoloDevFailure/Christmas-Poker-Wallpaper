import { deflateSync } from 'node:zlib';
// Tiny deterministic PNG fixtures, independent of the production decoder.
export function pngFixture(width = 16, height = 16, kind: 'sticker' | 'opaque' | 'empty' = 'sticker', filter = 0, headerSize?: { width: number; height: number }): Buffer {
  function chunk(name: string, data: Buffer) {
    const content = Buffer.concat([Buffer.from(name), data]); let crc = 0xffffffff;
    for (const byte of content) { crc ^= byte; for (let i = 0; i < 8; i++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1; }
    const header = Buffer.alloc(4), checksum = Buffer.alloc(4); header.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([header, content, checksum]);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(headerSize?.width ?? width); header.writeUInt32BE(headerSize?.height ?? height, 4); header[8] = 8; header[9] = 6;
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = (y * width + x) * 4, shade = ((x >> 2) + (y >> 2)) % 2 ? 180 : 240;
    pixels[at] = shade; pixels[at + 1] = kind === 'sticker' ? 70 : shade; pixels[at + 2] = 50;
    pixels[at + 3] = kind === 'opaque' || kind === 'sticker' && x > 3 && y > 3 && x < width - 4 && y < height - 4 ? 255 : 0;
  }
  const scanlines = Buffer.alloc(height * (width * 4 + 1)), stride = width * 4;
  for (let y = 0; y < height; y++) {
    scanlines[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x, a = x >= 4 ? pixels[at - 4] : 0, b = y ? pixels[at - stride] : 0, c = y && x >= 4 ? pixels[at - stride - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = a; if (filter === 2) predictor = b; if (filter === 3) predictor = Math.floor((a + b) / 2);
      if (filter === 4) { const p = a + b - c, distances = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)]; predictor = [a, b, c][distances.indexOf(Math.min(...distances))]; }
      scanlines[y * (stride + 1) + x + 1] = pixels[at] - predictor;
    }
  }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))]);
}
