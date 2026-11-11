export type StampType = 'star' | 'tree' | 'eggplant';
export type Placement = {
    stamp_type: StampType;
    position_x: number;
    position_y: number;
    scale: number;
    rotation: number;
};
export type Stamp = Placement & {
    id: string;
    session_id: string;
    created_at: string;
    sequence: number;
};
export type Session = {
    id: string;
    join_code: string;
    owner_id: string;
    status: string;
};
export type Preview = Placement & {
    sender: string;
    expires: number;
};
export const icons: Record<StampType, string> = { star: '⭐', tree: '🎄', eggplant: '🍆' };
export function validPlacement(p: Placement) { return ['star', 'tree', 'eggplant'].includes(p.stamp_type) && Number.isFinite(p.position_x) && p.position_x >= 0 && p.position_x <= 1 && Number.isFinite(p.position_y) && p.position_y >= 0 && p.position_y <= 1 && Number.isFinite(p.scale) && p.scale >= 32 && p.scale <= 600 && Number.isFinite(p.rotation) && Math.abs(p.rotation) <= 360; }
