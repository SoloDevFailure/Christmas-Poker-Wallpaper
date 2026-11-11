export type Point = {
    x: number;
    y: number;
};
export const W = 1920, H = 1080, SIZE = 140;
export const markers = [{ id: 17, x: 40, y: 40, suit: '♠' }, { id: 133, x: 1740, y: 40, suit: '♥' }, { id: 271, x: 1740, y: 900, suit: '♣' }, { id: 409, x: 40, y: 900, suit: '♦' }];
export function project(h: number[], p: Point): Point { const z = h[6] * p.x + h[7] * p.y + 1; return { x: (h[0] * p.x + h[1] * p.y + h[2]) / z, y: (h[3] * p.x + h[4] * p.y + h[5]) / z }; }
// Least-squares eight-parameter homography, using every detected marker corner.
export function homography(from: Point[], to: Point[]): number[] {
    if (from.length !== to.length || from.length < 4)
        throw Error('At least four point pairs required');
    const a: number[][] = [], b: number[] = [];
    from.forEach(({ x, y }, i) => { const u = to[i].x, v = to[i].y; a.push([x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(u, v); });
    const m = Array.from({ length: 8 }, (_, i) => Array.from({ length: 9 }, (_, j) => a.reduce((s, r, k) => s + r[i] * (j === 8 ? b[k] : r[j]), 0)));
    for (let i = 0; i < 8; i++) {
        let k = i;
        for (let j = i + 1; j < 8; j++)
            if (Math.abs(m[j][i]) > Math.abs(m[k][i]))
                k = j;
        [m[i], m[k]] = [m[k], m[i]];
        const d = m[i][i];
        if (Math.abs(d) < 1e-10)
            throw Error('Degenerate marker geometry');
        for (let j = i; j < 9; j++)
            m[i][j] /= d;
        for (let r = 0; r < 8; r++)
            if (r !== i) {
                const f = m[r][i];
                for (let j = i; j < 9; j++)
                    m[r][j] -= f * m[i][j];
            }
    }
    return m.map(r => r[8]);
}
export function fitMarkers(found: {
    id: number;
    corners: Point[];
}[]) {
    const from: Point[] = [], to: Point[] = [];
    for (const m of markers) {
        const matches = found.filter(f => f.id === m.id);
        if (matches.length !== 1)
            throw Error('All four unique markers required');
        from.push(...matches[0].corners);
        to.push({ x: m.x, y: m.y }, { x: m.x + SIZE, y: m.y }, { x: m.x + SIZE, y: m.y + SIZE }, { x: m.x, y: m.y + SIZE });
    }
    const h = homography(from, to), inverse = homography(to, from);
    const error = Math.sqrt(to.reduce((s, p, i) => { const q = project(inverse, p); return s + (q.x - from[i].x) ** 2 + (q.y - from[i].y) ** 2; }, 0) / to.length);
    return { h, inverse, error };
}
