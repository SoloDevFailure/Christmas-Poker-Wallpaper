import { test } from 'node:test';
import assert from 'node:assert/strict';
import Aruco from 'js-aruco2';
const { AR } = Aruco;
import { fitMarkers, markers, project, SIZE } from '../src/geometry.ts';
// Independently rasterize the original ArUco codewords, rather than testing the
// detector against its own encoder. Rasterized at half presentation scale.
export function board(rotate = false, missing?: number, only?:number[]): ImageData {
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

// Repeat detection through real resize/orientation changes on ONE persistent
// engine. Previous tests constructed a fresh detector for every image.
import {TrackerEngine,trimDetectorBuffers} from '../src/trackerEngine.ts';
function resized(image:ImageData,longest:number):ImageData {
 const scale=longest/Math.max(image.width,image.height),width=Math.round(image.width*scale),height=Math.round(image.height*scale),data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const from=(Math.min(image.height-1,Math.floor(y/scale))*image.width+Math.min(image.width-1,Math.floor(x/scale)))*4;data.set(image.data.subarray(from,from+4),(y*width+x)*4);}
 return {width,height,data,colorSpace:'srgb'} as ImageData;
}
test('persistent real detector recovers through zero detections, changing tag sets, resolution and orientation',()=>{
 const engine=new TrackerEngine();
 for(const [i,ids] of [[0,1,2,3,4,5,6],[0,2,5],[],[2,4,7],[0,1,2,3,4,5,6,7],[5,6,7],[],[0,3,5]].entries()){
  const image=resized(board(i%2===1,undefined,ids.map(i=>markers[i].id)),[1280,1920,960,640,576][i%5]);
  const result=engine.process(image,true);
  assert.deepEqual(result.found.map(m=>m.id).sort((a,b)=>a-b),ids.map(i=>markers[i].id).sort((a,b)=>a-b));
  if(ids.length){assert.equal(result.fit?.count,ids.length);assert.ok(result.fit!.error<4);}else{assert.equal(result.fit,undefined);assert.equal(result.reason,'insufficient-markers');}
  assert.ok(result.detectorMs>=0);assert.ok(result.fitMs>=0);assert.ok(result.workerMs>=result.detectorMs);
 }
});
test('adaptive resize truncates js-aruco grayscale/threshold tails and contour scratch storage',()=>{
 const detector={grey:{data:new Array(1920*1080)},thres:{data:new Array(1920*1080)},binary:new Array(1922*1082)};
 trimDetectorBuffers(detector,640,360);assert.equal(detector.grey.data.length,640*360);assert.equal(detector.thres.data.length,640*360);assert.equal(detector.binary.length,642*362);
 trimDetectorBuffers(detector,360,640);assert.equal(detector.grey.data.length,360*640);
});
test('invalid pixel acquisition is a detector failure, never a zero-marker result',()=>{
 const engine=new TrackerEngine();assert.throws(()=>engine.process({width:640,height:360,data:new Uint8ClampedArray(0)} as ImageData),/Invalid camera RGBA frame/);
});

test('halving portrait processing resolution can destroy visible small-marker detail',()=>{
 const width=720,height=1280,data=new Uint8ClampedArray(width*height*4);for(let i=0;i<data.length;i+=4){data[i]=data[i+1]=data[i+2]=25;data[i+3]=255;}
 const small=resized(board(),640),left=40,top=550;for(let y=0;y<small.height;y++)for(let x=0;x<small.width;x++)data.set(small.data.subarray((y*small.width+x)*4,(y*small.width+x)*4+4),((y+top)*width+x+left)*4);
 const full={width,height,data,colorSpace:'srgb'} as ImageData,engine=new TrackerEngine(),restored=engine.process(full),degraded=engine.process(resized(full,640));
 assert.ok(restored.found.length>=3,'1280px portrait frame must retain sufficient small tags');assert.ok(restored.fit,'Retained corners must produce a valid homography');assert.ok(degraded.found.length<3,'Half-sized image loses usable small-marker detail');
});
