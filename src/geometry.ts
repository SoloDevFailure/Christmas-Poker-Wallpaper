export type Point = {
    x: number;
    y: number;
};
export const W = 1920, H = 1080, SIZE = 140;
export const markers = [{ id: 17, x: 40, y: 40, suit: '♠' }, { id: 133, x: 1740, y: 40, suit: '♥' }, { id: 271, x: 1740, y: 900, suit: '♣' }, { id: 409, x: 40, y: 900, suit: '♦' }];
export function project(h: number[], p: Point): Point { const z = h[6] * p.x + h[7] * p.y + 1; return { x: (h[0] * p.x + h[1] * p.y + h[2]) / z, y: (h[3] * p.x + h[4] * p.y + h[5]) / z }; }
// Least-squares eight-parameter homography, using every detected marker corner.
function solveHomography(from: Point[], to: Point[]): number[] {
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
function multiply(a: number[], b: number[]) {
    return Array.from({ length: 9 }, (_, i) => [0, 1, 2].reduce((s, k) => s + a[Math.floor(i / 3) * 3 + k] * b[k * 3 + i % 3], 0));
}
function normalized(points: Point[]) {
    const cx = points.reduce((s, p) => s + p.x, 0) / points.length, cy = points.reduce((s, p) => s + p.y, 0) / points.length;
    const distance = points.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / points.length;
    if (!Number.isFinite(distance) || distance < 1e-8)
        throw Error('Degenerate marker geometry');
    const s = Math.SQRT2 / distance;
    return { points: points.map(p => ({ x: (p.x - cx) * s, y: (p.y - cy) * s })), matrix: [s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1], inverse: [1 / s, 0, cx, 0, 1 / s, cy, 0, 0, 1] };
}
// Normalized least squares avoids losing precision on large/oblique coordinates.
export function homography(from: Point[], to: Point[]) {
    if (from.length !== to.length || from.length < 4)
        throw Error('At least four point pairs required');
    const a = normalized(from), b = normalized(to);
    const h = multiply(b.inverse, multiply([...solveHomography(a.points, b.points), 1], a.matrix));
    if (!Number.isFinite(h[8]) || Math.abs(h[8]) < 1e-12)
        throw Error('Degenerate perspective');
    return h.slice(0, 8).map(v => v / h[8]);
}
export function invertHomography(h: number[]) {
    const [a, b, c, d, e, f, g, k] = h;
    const m = [e - f * k, c * k - b, b * f - c * e, f * g - d, a - c * g, c * d - a * f, d * k - e * g, b * g - a * k, a * e - b * d];
    if (Math.abs(m[8]) < 1e-12)
        throw Error('Singular perspective');
    return m.slice(0, 8).map(v => v / m[8]);
}
export type Detection = {
    id: number;
    corners: Point[];
};
export const MAX_REPROJECTION_ERROR = 4;
export function markerCorners(m: typeof markers[number]): Point[] {
    return [{ x: m.x, y: m.y }, { x: m.x + SIZE, y: m.y }, { x: m.x + SIZE, y: m.y + SIZE }, { x: m.x, y: m.y + SIZE }];
}
function soundQuad(points: Point[]) {
    if (points.length !== 4 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
        return false;
    const cross = points.map((p, i) => { const q = points[(i + 1) % 4], r = points[(i + 2) % 4]; return (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x); });
    return cross.every(v => v > 0) && points.every((p, i) => Math.hypot(p.x - points[(i + 1) % 4].x, p.y - points[(i + 1) % 4].y) >= 12);
}
export function fitMarkers(found: Detection[]) {
    const visible = markers.flatMap(m => {
        const matches = found.filter(f => f.id === m.id);
        // Duplicate IDs are ambiguous, even when one candidate looks plausible.
        // An ambiguous ID is discarded; three other complete markers can still track.
        return matches.length === 1 && soundQuad(matches[0].corners) ? [{ marker: m, camera: matches[0].corners }] : [];
    });
    if (visible.length < 3)
        throw Error('Three complete markers required');
    type Group = typeof visible;
    const fit = (group: Group) => {
        const board = group.flatMap(v => markerCorners(v.marker)), camera = group.flatMap(v => v.camera);
        const inverse = homography(board, camera), h = invertHomography(inverse);
        const distances = (v: Group[number]) => markerCorners(v.marker).map((p, i) => { const q = project(inverse, p); return Math.hypot(q.x - v.camera[i].x, q.y - v.camera[i].y); });
        const residual = (v: Group[number]) => Math.max(...distances(v));
        const rms = (v: Group[number]) => Math.sqrt(distances(v).reduce((s, d) => s + d * d, 0) / 4);
        return { h, inverse, residual, rms };
    };
    // Deterministic marker-level RANSAC: evaluate every 3-marker hypothesis and
    // the full 4-marker fit. A marker is an inlier only if all its corners agree.
    const hypotheses: Group[] = [visible];
    if (visible.length === 4)
        for (let i = 0; i < 4; i++)
            hypotheses.push(visible.filter((_, j) => i !== j));
    let best: ReturnType<typeof fit> & {
        error: number;
        ids: number[];
    } | null = null;
    for (const sample of hypotheses)
        try {
            let model = fit(sample);
            const inliers = visible.filter(v => model.residual(v) <= MAX_REPROJECTION_ERROR);
            if (inliers.length < 3)
                continue;
            model = fit(inliers);
            const errors = inliers.map(v => model.rms(v));
            if (inliers.some(v => model.residual(v) > MAX_REPROJECTION_ERROR))
                continue;
            if (errors.some(e => !Number.isFinite(e) || e > MAX_REPROJECTION_ERROR))
                continue;
            // Reject a horizon crossing the wallpaper or an implausible folded quad.
            const board = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
            const denominators = board.map(p => model.inverse[6] * p.x + model.inverse[7] * p.y + 1);
            if (!denominators.every(v => v > 0) || !soundQuad(board.map(p => project(model.inverse, p))))
                continue;
            const error = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length), ids = inliers.map(v => v.marker.id);
            if (!best || ids.length > best.ids.length || ids.length === best.ids.length && error < best.error)
                best = { ...model, error, ids };
        }
        catch { /* Ignore ill-conditioned hypotheses, never invent a fourth corner. */ }
    if (!best)
        throw Error('Marker fit is not reliable');
    return { h: best.h, inverse: best.inverse, error: best.error, ids: best.ids, count: best.ids.length, confidence: best.ids.length === 4 && best.error < 2 ? 'high' : 'good' };
}
