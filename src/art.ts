import { H, W, markers, SIZE } from './geometry';
import { icons, type Placement } from './types';
// Embedded transparent SVG artwork avoids platform-specific system emoji fonts.
const art: Record<string, string> = { star: '<path fill="#ffd544" stroke="#b67b17" stroke-width="3" d="M50 5 63 34 95 38 71 61 77 94 50 78 23 94 29 61 5 38 37 34Z"/>', tree: '<path fill="#83532f" d="M43 73h14v24H43z"/><path fill="#15884b" stroke="#075d35" stroke-width="2" d="M50 3 73 33H63L85 60H72L97 84H3L28 60H15L37 33H27Z"/><g fill="#e34236"><circle cx="46" cy="29" r="4"/><circle cx="60" cy="53" r="5"/><circle cx="34" cy="70" r="5"/></g><g fill="#ffdb4c"><circle cx="38" cy="48" r="4"/><circle cx="66" cy="73" r="4"/></g>', eggplant: '<path fill="#7135a0" stroke="#452068" stroke-width="3" d="M66 22C99 30 88 69 54 89 25 107 4 89 22 72 39 56 35 25 66 22Z"/><path fill="#67ac42" d="m59 25-9-13 17 5 9-15 3 17 17 3-16 9-2 15-12-13-15 6Z"/><path fill="none" stroke="#ad70d0" stroke-width="5" stroke-linecap="round" d="M60 40Q58 65 34 82"/>' };
export const sources = Object.fromEntries(Object.entries(art).map(([k, v]) => [k, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${v}</svg>`)]));
export function background(ctx: CanvasRenderingContext2D) { ctx.fillStyle = '#06281f'; ctx.fillRect(0, 0, W, H); ctx.strokeStyle = '#947940'; ctx.lineWidth = 3; ctx.strokeRect(24, 24, W - 48, H - 48); }
export async function exportArt(stamps: Placement[]) {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;
    background(ctx);
    for (const s of stamps) {
        const img = new Image();
        img.src = sources[s.stamp_type];
        await img.decode();
        ctx.save();
        ctx.translate(s.position_x * W, s.position_y * H);
        ctx.rotate(s.rotation * Math.PI / 180);
        ctx.drawImage(img, -s.scale / 2, -s.scale / 2, s.scale, s.scale);
        ctx.restore();
    }
    ctx.fillStyle = '#06281f';
    ctx.fillRect(210, 45, 1310, 150);
    ctx.fillStyle = '#e6cc89';
    ctx.font = 'bold 68px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText('CHRISTMAS POKER 2026', W / 2, 125);
    for (const [i, m] of markers.entries()) {
        ctx.fillStyle = '#06281f';
        ctx.fillRect(m.x, m.y < 500 ? m.y + SIZE + 16 : m.y - 62, SIZE, 48);
        ctx.fillStyle = i % 2 ? '#ec6c67' : '#e6cc89';
        ctx.font = '48px Georgia';
        ctx.fillText(m.suit, m.x + SIZE / 2, m.y < 500 ? m.y + SIZE + 54 : m.y - 22);
    }
    const a = document.createElement('a');
    a.download = 'christmas-poker-2026.png';
    a.href = c.toDataURL('image/png');
    a.click();
}
export { icons };
