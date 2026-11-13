export const UNDO_LIMIT = 5;
export type UndoStamp = { id: string; sequence: number };
export type UndoState = { entries: UndoStamp[]; unavailable: string };
// Broadcasts are refresh hints only: clients always read authorized database rows.
// Never apply client-provided deletion IDs directly to the shared wallpaper.
export const STAMPS_CHANGED_EVENT = 'stamps-changed';
export function confirmedDuplicate(row: { id: string; session_id: string; created_by?: string } | null, id: string, session: string, user: string) {
  return !!row && row.id === id && row.session_id === session && row.created_by === user;
}
