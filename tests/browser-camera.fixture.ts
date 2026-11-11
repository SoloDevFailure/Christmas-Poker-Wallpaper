// Browser-only synthetic camera fixture. Import temporarily from bootstrap for QA; never include in a deployed build.
import Aruco from 'js-aruco2';
import { markers, SIZE, W, H } from '../src/geometry';
const canvas = document.createElement('canvas');
canvas.width = W;
canvas.height = H;
const ctx = canvas.getContext('2d')!;
const dictionary = new Aruco.AR.Dictionary('ARUCO');
const images = await Promise.all(markers.map(async (m) => { const image = new Image(); image.src = 'data:image/svg+xml,' + encodeURIComponent(dictionary.generateSVG(m.id).replace('viewBox="0 0 9 9"', 'viewBox="1 1 7 7"')); await image.decode(); return image; }));
let visibleCount = 3;
function draw() { ctx.fillStyle = '#06281f'; ctx.fillRect(0, 0, W, H); markers.forEach((m, i) => { if (![0,2,5,7,1,3,4,6].slice(0,visibleCount).includes(i))
    return; ctx.fillStyle = 'white'; ctx.fillRect(m.x - 24, m.y - 24, SIZE + 48, SIZE + 48); ctx.drawImage(images[i], m.x, m.y, SIZE, SIZE); }); }
draw();
setInterval(draw, 50);
Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => canvas.captureStream(20) });
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
async function check() {
    const result = document.createElement('output');
    result.id = 'qa-test-result';
    result.style.cssText = 'position:fixed;bottom:72px;left:12px;z-index:99;background:#111;color:white;font:11px monospace;padding:8px';
    document.body.append(result);
    try {
        (document.querySelector('button[aria-label="Options"]') as HTMLElement)?.click();await wait(50);
        const mode=document.querySelector('select[aria-label="Placement mode"]') as HTMLSelectElement;if(mode){mode.value='legacy';mode.dispatchEvent(new Event('change',{bubbles:true}));}
        for (let n = 0; n < 150; n++) {
            if (document.querySelector('.tracking-status.locked'))
                break;
            await wait(100);
        }
        if (!document.querySelector('.tracking-status.locked'))
            throw Error('Synthetic camera did not lock');
        const stage = document.querySelector('.camera-view') as HTMLElement, image = document.querySelector('.camera-stamp')!;
        stage.setPointerCapture = () => { }; // Synthetic events have no active native pointer.
        function centre() { const r = image.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width }; }
        function touch(type: string, id: number, x: number, y: number) { stage.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true, buttons: type === 'pointerup' ? 0 : 1 })); }
        const a = centre();
        touch('pointerdown', 1, a.x, a.y);
        touch('pointermove', 1, a.x + 40, a.y + 20);
        touch('pointerup', 1, a.x + 40, a.y + 20);
        await wait(150);
        const b = centre();
        if (Math.hypot(b.x - a.x - 40, b.y - a.y - 20) > 2)
            throw Error('One-finger placement drift');
        touch('pointerdown', 1, b.x - 40, b.y);
        touch('pointerdown', 2, b.x + 40, b.y);
        touch('pointermove', 1, b.x, b.y - 60);
        touch('pointermove', 2, b.x, b.y + 60);
        touch('pointerup', 2, b.x, b.y + 60);
        touch('pointerup', 1, b.x, b.y - 60);
        await wait(150);
        const c = centre();
        if (Math.hypot(c.x - b.x, c.y - b.y) > 2 || Math.abs(c.width / b.width - 1.5) > .08)
            throw Error('Two-finger centre/scale drift');
        const matrix = new DOMMatrix((image as HTMLElement).style.transform);
        if (Math.abs(matrix.a) > .02 || matrix.b <= 0)
            throw Error('Rotation did not follow fingers');
        visibleCount = 2;
        draw();
        await wait(180);
        if ((document.querySelector('.phone-actions button:last-child') as HTMLButtonElement).disabled)
            throw Error('Grace did not keep Stamp enabled');
        await wait(1100);
        if ((image as HTMLElement).style.display !== 'none')
            throw Error('Stale sticker remained visible');
        visibleCount = 3;
        draw();
        for (let n = 0; n < 30; n++) {
            if (document.querySelector('.tracking-status.locked'))
                break;
            await wait(100);
        }
        if (!document.querySelector('.tracking-status.locked'))
            throw Error('Tracking did not recover');
        function normalizedCentre() { const r = image.getBoundingClientRect(), v = (document.querySelector('video') as HTMLVideoElement), scale = Math.min(innerWidth / v.videoWidth, innerHeight / v.videoHeight); return { x: (r.x + r.width / 2 - (innerWidth - v.videoWidth * scale) / 2) / scale / v.videoWidth, y: (r.y + r.height / 2 - (innerHeight - v.videoHeight * scale) / 2) / scale / v.videoHeight }; }
        const anchoredCentre = normalizedCentre();
        result.textContent = 'PASS: synthetic 3-marker camera, drag, pinch/rotation, dropout disables Stamp and recovers';
        addEventListener('resize', () => { void (async () => { await wait(800); const q = normalizedCentre(); if (Math.hypot(q.x - anchoredCentre.x, q.y - anchoredCentre.y) > .01)
            result.textContent = 'FAIL: orientation changed anchored sticker';
        else
            result.textContent = 'PASS: synthetic camera + gestures + dropout + anchored orientation change'; })(); });
    }
    catch (e) {
        result.textContent = 'FAIL: ' + String(e);
    }
}
void check();
