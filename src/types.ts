import { validCustomAsset } from './customStamp';
export type PresetType = 'star' | 'tree' | 'eggplant';
export type StampType = PresetType | 'custom';
export type Placement = {
    stamp_type: StampType;
    image_data?: string | null;
    image_width?: number | null;
    image_height?: number | null;
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
export const icons: Record<PresetType, string> = { star: '⭐', tree: '🎄', eggplant: '🍆' };
export function validPlacement(p: Placement) { return !!p && (p.stamp_type === 'custom' ? validCustomAsset(p) : ['star', 'tree', 'eggplant'].includes(p.stamp_type)) && Number.isFinite(p.position_x) && p.position_x >= 0 && p.position_x <= 1 && Number.isFinite(p.position_y) && p.position_y >= 0 && p.position_y <= 1 && Number.isFinite(p.scale) && p.scale >= 32 && p.scale <= 600 && Number.isFinite(p.rotation) && Math.abs(p.rotation) <= 360; }
// Scale keeps its existing meaning for presets; for rectangles it is the longest side.
export function stampDimensions(p: Placement) { const ratio = p.stamp_type === 'custom' && p.image_width && p.image_height ? p.image_width / p.image_height : 1; return { width: p.scale * Math.min(1, ratio), height: p.scale / Math.max(1, ratio) }; }
export function stampAsset(p: Placement) { return { stamp_type: p.stamp_type, image_data: p.image_data, image_width: p.image_width, image_height: p.image_height }; }
