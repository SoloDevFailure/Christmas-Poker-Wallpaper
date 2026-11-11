import { createClient } from '@supabase/supabase-js';
import type { Placement, Session, Stamp } from './types';
const url = import.meta.env.VITE_SUPABASE_URL, key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const db = url && key && !url.includes('YOUR_PROJECT') ? createClient(url, key) : null;
export async function identity() { if (!db)
    throw Error('Configure Supabase in .env.local first.'); const { data, error } = await db.auth.getSession(); if (error)
    throw error; if (data.session)
    return data.session.user.id; const result = await db.auth.signInAnonymously(); if (result.error)
    throw result.error; return result.data.user!.id; }
export async function openSession(code?: string): Promise<Session> { await identity(); const { data, error } = await db!.rpc(code ? 'join_wallpaper' : 'create_wallpaper', code ? { code } : {}); if (error)
    throw error; return data as Session; }
export async function loadStamps(id: string): Promise<Stamp[]> { const { data, error } = await db!.from('wallpaper_stamps').select('*').eq('session_id', id).order('sequence'); if (error)
    throw error; return data; }
export async function saveStamp(session_id: string, p: Placement, id: string) { const { error } = await db!.from('wallpaper_stamps').insert({ ...p, id, session_id }); if (error && error.code !== '23505')
    throw error; }
