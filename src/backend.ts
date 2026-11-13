import { createClient } from '@supabase/supabase-js';
import { validPlacement, type Placement, type Session, type Stamp } from './types';
import { confirmedDuplicate, type UndoState } from './stampUndo';
const url = import.meta.env.VITE_SUPABASE_URL, key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const db = url && key && !url.includes('YOUR_PROJECT') ? createClient(url, key) : null;
export async function identity() {
    if (!db)
        throw Error('Configure Supabase in .env.local first.');
    const { data, error } = await db.auth.getSession();
    if (error)
        throw error;
    if (data.session)
        return data.session.user.id;
    const result = await db.auth.signInAnonymously();
    if (result.error)
        throw result.error;
    return result.data.user!.id;
}
export async function openSession(code?: string): Promise<Session> {
    await identity();
    const { data, error } = await db!.rpc(code ? 'join_wallpaper' : 'create_wallpaper', code ? { code } : {});
    if (error)
        throw error;
    return data as Session;
}
export async function loadStamps(id: string): Promise<Stamp[]> {
    const { data, error } = await db!.from('wallpaper_stamps').select('*').eq('session_id', id).order('sequence');
    if (error)
        throw error;
    return data;
}
export async function saveStamp(session_id: string, p: Placement, id: string) {
    if (!validPlacement(p))
        throw Error('This stamp is not valid.');
    const row = { id, session_id, stamp_type: p.stamp_type, position_x: p.position_x, position_y: p.position_y, scale: p.scale, rotation: p.rotation, ...(p.stamp_type === 'custom' ? { image_data: p.image_data, image_width: p.image_width, image_height: p.image_height } : {}) };
    const { error } = await db!.from('wallpaper_stamps').insert(row);
    if (error?.code === '23505') {
        const user = await identity();
        const result = await db!.from('wallpaper_stamps').select('id,session_id,created_by').eq('id', id).maybeSingle();
        if (result.error) throw result.error;
        if (!confirmedDuplicate(result.data, id, session_id, user))
            throw Error('This stamp ID is no longer available. Select or move artwork before stamping again.');
        return;
    }
    if (error) {
        if (p.stamp_type === 'custom' && ['PGRST204', '42703', '23514'].includes(error.code))
            throw Error('Custom image stamps are not enabled in the database yet. Apply the custom-stamps SQL migration, then retry.');
        throw error;
    }
}
export async function loadUndoState(session_id: string): Promise<UndoState> {
    try {
        const { data, error } = await db!.rpc('wallpaper_undo_history', { target: session_id });
        if (error) return { entries: [], unavailable: ['PGRST202', '42883'].includes(error.code)
            ? 'Undo needs the individual-undo database migration.' : 'Undo history unavailable. Check your connection.' };
        return { entries: data, unavailable: '' };
    } catch { return { entries: [], unavailable: 'Undo history unavailable. Check your connection.' }; }
}
export async function undoStamp(session_id: string, id: string) {
    const { error } = await db!.rpc('undo_wallpaper_stamp', { target: session_id, stamp_id: id });
    if (error) throw error;
}
