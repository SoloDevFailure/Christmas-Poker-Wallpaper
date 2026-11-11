import { H, W, project, type Point } from './geometry';
import { stampDimensions, type Placement } from './types';
export const MAX_TRACKING_AGE = 350, DROPOUT_HOLD = 250;
export type Viewport = {
    width: number;
    height: number;
    imageWidth: number;
    imageHeight: number;
    scale: number;
    x: number;
    y: number;
};
export function videoViewport(width: number, height: number, imageWidth: number, imageHeight: number, fit: 'contain' | 'cover' = 'contain'): Viewport {
    const scale = (fit === 'contain' ? Math.min : Math.max)(width / imageWidth, height / imageHeight);
    return { width, height, imageWidth, imageHeight, scale, x: (width - imageWidth * scale) / 2, y: (height - imageHeight * scale) / 2 };
}
export function viewToImage(p: Point, v: Viewport): Point { return { x: (p.x - v.x) / v.scale, y: (p.y - v.y) / v.scale }; }
export function imageToView(p: Point, v: Viewport): Point { return { x: p.x * v.scale + v.x, y: p.y * v.scale + v.y }; }
export function onVideo(p: Point, v: Viewport) { const q = viewToImage(p, v); return q.x >= 0 && q.y >= 0 && q.x <= v.imageWidth && q.y <= v.imageHeight; }
export function wrapAngle(degrees: number) { return ((degrees + 180) % 360 + 360) % 360 - 180; }
export type Gesture = {
    placement: Placement;
    points: Point[];
};
// Touch positions are first projected onto the wallpaper plane. Apply exactly
// one similarity transform there; camera motion is never added as an offset.
export function manipulate(base: Gesture, points: Point[]): Placement {
    const count = Math.min(base.points.length, points.length, 2);
    if (!count)
        return base.placement;
    const centroid = (p: Point[]) => ({ x: p.slice(0, count).reduce((s, v) => s + v.x, 0) / count, y: p.slice(0, count).reduce((s, v) => s + v.y, 0) / count });
    const before = centroid(base.points), after = centroid(points);
    let ratio = 1, angle = 0;
    if (count === 2) {
        const a = { x: base.points[1].x - base.points[0].x, y: base.points[1].y - base.points[0].y }, b = { x: points[1].x - points[0].x, y: points[1].y - points[0].y };
        if (Math.hypot(a.x, a.y) < 1e-6)
            return base.placement;
        ratio = Math.hypot(b.x, b.y) / Math.hypot(a.x, a.y);
        ratio = Math.max(32 / base.placement.scale, Math.min(600 / base.placement.scale, ratio));
        angle = Math.atan2(b.y, b.x) - Math.atan2(a.y, a.x);
    }
    const x = base.placement.position_x * W - before.x, y = base.placement.position_y * H - before.y;
    return { ...base.placement, position_x: (after.x + ratio * (x * Math.cos(angle) - y * Math.sin(angle))) / W, position_y: (after.y + ratio * (x * Math.sin(angle) + y * Math.cos(angle))) / H, scale: base.placement.scale * ratio, rotation: wrapAngle(base.placement.rotation + angle * 180 / Math.PI) };
}
export function stickerCorners(p: Placement): Point[] {
    const angle = p.rotation * Math.PI / 180, { width, height } = stampDimensions(p);
    return [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]].map(([x, y]) => ({ x: p.position_x * W + width * x * Math.cos(angle) - height * y * Math.sin(angle), y: p.position_y * H + width * x * Math.sin(angle) + height * y * Math.cos(angle) }));
}
export function trackingPhase(at: number, now: number, valid: boolean) {
    if (valid && now - at <= MAX_TRACKING_AGE)
        return 'locked';
    return now - at <= DROPOUT_HOLD ? 'holding' : 'lost';
}
export function cameraPoint(h: number[], p: Point, v: Viewport) { return project(h, viewToImage(p, v)); }
