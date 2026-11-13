import { db } from './backend';
export class AiConversionError extends Error {
  constructor(message: string, public retryable: boolean, public requestId: string, public ambiguous = false) { super(message); }
}
// Use the full original composition at a useful AI resolution, not the tiny
// 512×256 stamp. Browser decoding has already handled HEIC and EXIF orientation.
export async function prepareAiUpload(image: HTMLImageElement): Promise<File> {
  const factor = Math.min(1, 1536 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * factor)); canvas.height = Math.max(1, Math.round(image.naturalHeight * factor));
  const ctx = canvas.getContext('2d'); if (!ctx) throw Error('This browser cannot prepare an AI photo.');
  ctx.imageSmoothingQuality = 'high'; ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(Error('The photo could not be prepared.')), 'image/png'));
  if (blob.size > 8 * 1024 * 1024) throw Error('This photo is too detailed for AI upload. Choose a smaller photo.');
  return new File([blob], 'photo.png', { type: 'image/png' });
}
export async function convertAiPhoto(file: File, sessionId: string, requestId: string): Promise<Blob> {
  if (!db) throw new AiConversionError('The wallpaper is not connected.', true, requestId);
  const { data, error } = await db.auth.getSession();
  if (error || !data.session) throw new AiConversionError('Your session expired. Reopen the controller.', false, requestId);
  const form = new FormData(); form.set('image', file); form.set('session_id', sessionId); form.set('request_id', requestId);
  // Raw fetch avoids automatic SDK retries of paid work and preserves error details.
  let response: Response;
  try {
    response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-stamp`, {
      method: 'POST', headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY }, body: form,
      signal: AbortSignal.timeout(140000),
    });
  } catch { throw new AiConversionError('Connection lost. The conversion may still be running. Use the original photo for now.', false, requestId, true); }
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new AiConversionError(typeof result.error === 'string' ? result.error : 'AI conversion is unavailable. Your original photo is still here.', result.retryable === true, requestId);
  }
  const blob = await response.blob();
  if (blob.type !== 'image/png' || blob.size > 8 * 1024 * 1024) throw new AiConversionError('The AI response was not a usable PNG.', false, requestId);
  return blob;
}
