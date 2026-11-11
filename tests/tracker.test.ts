import { test } from 'node:test';
import assert from 'node:assert/strict';
import Aruco from 'js-aruco2';
const { AR } = Aruco;
import { fitMarkers, markers, project, SIZE } from '../src/geometry.ts';
// Independently rasterize the original ArUco codewords, rather than testing the
// detector against its own encoder. Rasterized at half presentation scale.
function board(rotate = false, missing?: number, only?:number[]): ImageData {
    const width = 960, height = 540, data = new Uint8ClampedArray(width * height * 4);
    function pixel(x: number, y: number, value: number) { const i = (y * width + x) * 4; data[i] = data[i + 1] = data[i + 2] = value; data[i + 3] = 255; }
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
            pixel(x, y, 25);
    const words = ['10000', '10111', '01001', '01110'];
    for (const m of markers) {
        if (m.id === missing || only&&!only.includes(m.id))
            continue;
        const left = m.x / 2, top = m.y / 2;
        for (let y = -12; y < SIZE/2+12; y++)
            for (let x = -12; x < SIZE/2+12; x++)
                pixel(left + x, top + y, 255);
        for (let y = 0; y < SIZE/2; y++)
            for (let x = 0; x < SIZE/2; x++) {
                const col = Math.floor(x / (SIZE/14)) - 1, row = Math.floor(y / (SIZE/14)) - 1;
                const white = row >= 0 && row < 5 && col >= 0 && col < 5 && words[(m.id >> (2 * (4 - row))) & 3][col] === '1';
                pixel(left + x, top + y, white ? 255 : 0);
            }
    }
    if (!rotate)
        return { data, width, height, colorSpace: 'srgb' } as ImageData;
    const output = new Uint8ClampedArray(data.length);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const src = (y * width + x) * 4, dst = (x * height + (height - 1 - y)) * 4;
            output.set(data.subarray(src, src + 4), dst);
        }
    return { data: output, width: height, height: width, colorSpace: 'srgb' } as ImageData;
}
for (const rotated of [false, true])
    test(`actual detector recognizes eight independently rendered tags${rotated ? ' after 90-degree camera rotation' : ''}`, () => {
        const detector = new AR.Detector({ dictionaryName: 'ARUCO' }), image = board(rotated);
        const found = detector.detect(image);
        assert.deepEqual(found.map(f => f.id).sort((a, b) => a - b), markers.map(m => m.id).sort((a, b) => a - b));
        const fit = fitMarkers(found), centre = project(fit.h, { x: image.width / 2, y: image.height / 2 });
        assert.ok(fit.error < 3, `Reprojection error ${fit.error}`);
        assert.ok(Math.hypot(centre.x - 960, centre.y - 540) < 8, `Centre ${JSON.stringify(centre)}`);
        assert.match(new AR.Dictionary('ARUCO').generateSVG(markers[0].id), /<svg/);
    });
for (const rotated of [false, true])
    for (const missing of markers)
        test('actual detector tracks seven tags missing ' + missing.id + (rotated ? ' rotated' : ''), () => {
            const found = new AR.Detector({ dictionaryName: 'ARUCO' }).detect(board(rotated, missing.id));
            assert.equal(found.length, 7);
            const fit = fitMarkers(found);
            assert.equal(fit.count, 7);
            assert.ok(fit.error < 3);
        });

for(const rotated of [false,true])for(let missing=0;missing<4;missing++)test('real detector tracks each distributed corner triple '+missing+' rotated '+rotated,()=>{const ids=[markers[0],markers[2],markers[5],markers[7]].filter((_,i)=>i!==missing).map(m=>m.id),found=new AR.Detector({dictionaryName:'ARUCO'}).detect(board(rotated,undefined,ids));assert.equal(found.length,3);assert.equal(fitMarkers(found).count,3);});
