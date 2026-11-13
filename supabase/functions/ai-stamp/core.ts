import { openAiDiagnostic, type OpenAiDiagnostic } from './diagnostics.ts';
import { assertStickerTransparency, decodePng, MAX_AI_UPLOAD } from './png.ts';
export const CARTOON_PROMPT = `Identify the main subject of the photograph, whether a person, group, animal, vehicle, drink or other object.

Preserve recognisable facial features, colours, proportions and distinguishing details.

Transform the subject into an attractive, colourful 2D cartoon sticker with bold clean outlines and consistent shading.

Remove the entire background and produce genuine transparency.

Keep the complete subject visible. Do not add unrelated objects, scenery or text.`;
export type Config = { model: string; event: string; origins: string[]; openaiKey: string };
export type Dependencies = {
  authenticate: (token: string) => Promise<string | null>;
  reserve: (args: { user: string; session: string; request: string; hash: string; model: string; event: string }) => Promise<{ status: string; remaining?: number }>;
  finish: (id: string, status: 'succeeded' | 'failed' | 'unknown', code?: string, usage?: unknown) => Promise<boolean>;
  fetch: typeof fetch;
  logDiagnostic?: (entry: OpenAiDiagnostic) => void;
};
export class AiError extends Error {
  constructor(public code: string, message: string, public status = 400, public retryable = false) { super(message); }
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const quotaErrors: Record<string, [string, number, boolean]> = {
  AI_NOT_MEMBER: ['Join this wallpaper before converting photos.', 403, false],
  AI_EVENT_DISABLED: ['AI stamps are not enabled for this event yet.', 503, false],
  AI_USER_ACTIVE: ['Your previous conversion is still running or awaiting review. Use the original photo for now.', 409, false],
  AI_EVENT_BUSY: ['Other photos are being converted. Please try again shortly.', 429, true],
  AI_USER_LIMIT: ['You have used your five AI conversions.', 429, false],
  AI_EVENT_LIMIT: ['The event has reached its AI conversion limit.', 429, false],
  AI_ATTEMPT_LIMIT: ['The AI attempt limit has been reached. Use the original photo.', 429, false],
  AI_COOLDOWN: ['Please wait a little before another AI attempt.', 429, true],
  AI_BUDGET_LIMIT: ['The event AI spending safeguard has stopped new conversions.', 429, false],
  AI_REQUEST_CONFLICT: ['This conversion request ID was already used.', 409, false],
};
export function quotaError(message: string): AiError {
  const code = Object.keys(quotaErrors).find(key => message.includes(key));
  return code ? new AiError(code, ...quotaErrors[code]) : new AiError('AI_UNAVAILABLE', 'AI conversion is unavailable. Please try later.', 503, false);
}
export async function readLimited(body: ReadableStream<Uint8Array> | null, max: number, timeoutMs: number): Promise<Uint8Array> {
  if (!body) throw new AiError('EMPTY_BODY', 'No image was received.');
  const reader = body.getReader(); let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const chunks: Uint8Array[] = []; let length = 0;
        while (true) { const next = await reader.read(); if (next.done) break; length += next.value.length;
          if (length > max) throw new AiError('IMAGE_TOO_LARGE', 'The image upload is too large.', 413);
          chunks.push(next.value);
        }
        const result = new Uint8Array(length); let at = 0; for (const chunk of chunks) { result.set(chunk, at); at += chunk.length; } return result;
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new AiError('TIMEOUT', 'The request timed out.', 504)), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); void reader.cancel().catch(() => {}); }
}
export function createAiHandler(config: Config, deps: Dependencies) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('origin');
    const cors: Record<string, string> = { 'Cache-Control': 'no-store', 'Vary': 'Origin' };
    if (origin && config.origins.includes(origin)) cors['Access-Control-Allow-Origin'] = origin;
    const json = (error: AiError) => new Response(JSON.stringify({ code: error.code, error: error.message, retryable: error.retryable }), { status: error.status, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (origin && !config.origins.includes(origin)) return json(new AiError('ORIGIN_DENIED', 'This site cannot use AI conversion.', 403));
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods': 'POST,OPTIONS' } });
    if (req.method !== 'POST') return json(new AiError('METHOD', 'Use POST.', 405));
    let admitted: string | null = null, outcome: 'failed' | 'unknown' = 'failed';
    try {
      const authorization = req.headers.get('authorization') || '';
      if (!/^Bearer \S+$/i.test(authorization)) throw new AiError('AUTH_REQUIRED', 'Sign in to the wallpaper first.', 401);
      const user = await deps.authenticate(authorization.slice(7));
      if (!user) throw new AiError('AUTH_REQUIRED', 'Your session expired. Reopen the controller.', 401);
      if (!config.openaiKey) throw new AiError('AI_UNAVAILABLE', 'AI conversion has not been configured.', 503);
      if (Number(req.headers.get('content-length')) > MAX_AI_UPLOAD + 65536) throw new AiError('IMAGE_TOO_LARGE', 'The image upload is too large.', 413);
      const type = req.headers.get('content-type') || '';
      if (!type.startsWith('multipart/form-data;')) throw new AiError('IMAGE_FORMAT', 'Upload an image using the photo tool.');
      const body = await readLimited(req.body, MAX_AI_UPLOAD + 65536, 15000);
      const form = await new Response(Uint8Array.from(body), { headers: { 'Content-Type': type } }).formData();
      const file = form.get('image'), session = form.get('session_id'), request = form.get('request_id');
      if (!(file instanceof File) || file.type !== 'image/png' || !file.size || file.size > MAX_AI_UPLOAD) throw new AiError('IMAGE_FORMAT', 'Use the photo tool to prepare a PNG image up to 8 MB.');
      if (typeof session !== 'string' || typeof request !== 'string' || !uuid.test(session) || !uuid.test(request)) throw new AiError('INVALID_REQUEST', 'Invalid wallpaper or request ID.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      try { decodePng(bytes); } catch { throw new AiError('IMAGE_FORMAT', 'This photo could not be decoded. Reimport it before converting.'); }
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
      let reservation: Awaited<ReturnType<Dependencies['reserve']>>;
      try { reservation = await deps.reserve({ user, session, request, hash, model: config.model, event: config.event }); }
      catch (e) { throw quotaError(e instanceof Error ? e.message : ''); }
      if (reservation.status !== 'admitted') throw new AiError('REQUEST_ALREADY_USED', reservation.status === 'succeeded'
        ? 'This request already completed. Use the cartoon preview, or Retry for a new conversion.'
        : 'This request is already recorded. It will not be submitted to OpenAI again.', 409, reservation.status === 'failed' || reservation.status === 'succeeded');
      admitted = request;
      const edit = new FormData();
      edit.set('image', new Blob([bytes], { type: 'image/png' }), 'photo.png');
      edit.set('model', config.model); edit.set('prompt', CARTOON_PROMPT);
      edit.set('n', '1'); edit.set('size', '1024x1024'); edit.set('quality', 'medium');
      edit.set('background', 'transparent'); edit.set('output_format', 'png');
      // Exactly one upstream request. No SDK retries, quality escalation, streaming
      // partial images, user-selected model/prompt, or follow-up paid cleanup.
      outcome = 'unknown';
      let response: Response;
      try { response = await deps.fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${config.openaiKey}` }, body: edit, signal: AbortSignal.timeout(110000) }); }
      catch { throw new AiError('UPSTREAM_UNCERTAIN', 'The AI request timed out or lost its connection. Its outcome needs review; use the original photo for now.', 504, false); }
      // Log only selected, sanitised fields. Logging must not alter error mapping,
      // quota finalisation or the one-request/no-retry policy.
      const logFailure = (error: unknown) => {
        try {
          const entry = openAiDiagnostic({ job: request, model: config.model, status: response.status, requestId: response.headers.get('x-request-id') }, error, [config.openaiKey, authorization.slice(7)]);
          if (deps.logDiagnostic) deps.logDiagnostic(entry); else console.error(JSON.stringify(entry));
        } catch { /* Diagnostics must never interfere with request handling. */ }
      };
      let resultBytes: Uint8Array;
      try { resultBytes = await readLimited(response.body, 16 * 1024 * 1024, 10000); }
      catch (e) { if (!response.ok) logFailure({ type: 'unreadable_response', message: 'OpenAI response body could not be read.' }); throw e; }
      let result: { data?: { b64_json?: string }[]; usage?: unknown; error?: { code?: string; type?: string; message?: string; param?: string } };
      try { result = JSON.parse(new TextDecoder().decode(resultBytes)); } catch { if (!response.ok) logFailure({ type: 'unreadable_response', message: 'OpenAI returned a non-JSON error response; raw body omitted.' }); throw new AiError('UPSTREAM_UNCERTAIN', 'The AI returned an unreadable response. Use the original photo for now.', 502); }
      outcome = response.status >= 500 ? 'unknown' : 'failed';
      if (!response.ok) {
        logFailure(result?.error);
        if (response.status >= 500) throw new AiError('UPSTREAM_UNCERTAIN', 'The AI service could not confirm the result. Its outcome needs review; use the original photo for now.', 502, false);
        if (response.status === 429) throw new AiError('AI_RATE_LIMIT', 'AI is busy or its account limit was reached. Please try later.', 429, true);
        if (/moderation|safety|content_policy/i.test(result.error?.code || '')) throw new AiError('AI_MODERATION', 'This photo could not be converted under the image safety rules. You can use the original photo or choose another.', 422, true);
        if (response.status === 401 || response.status === 403 || response.status === 404) throw new AiError('AI_CONFIGURATION', 'The image model or API account needs administrator setup.', 503);
        throw new AiError('AI_API_ERROR', 'AI conversion failed. Use the original photo or try later.', 502, response.status < 500);
      }
      outcome = 'failed';
      const base64 = result.data?.[0]?.b64_json;
      if (!base64 || base64.length > 12 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new AiError('INVALID_OUTPUT', 'AI did not return a usable PNG.', 502, true);
      let png: Uint8Array;
      try { png = Uint8Array.from(atob(base64), c => c.charCodeAt(0)); assertStickerTransparency(decodePng(png, 1024)); }
      catch { throw new AiError('OPAQUE_OUTPUT', 'AI did not return a genuine transparent sticker. Use the original photo or Retry.', 422, true); }
      if (!await deps.finish(request, 'succeeded', undefined, result.usage)) throw new AiError('FINALIZE_FAILED', 'This conversion could not be confirmed. Use the original photo for now.', 503);
      admitted = null;
      return new Response(Uint8Array.from(png), { headers: { ...cors, 'Content-Type': 'image/png', 'X-AI-Remaining': String(reservation.remaining ?? 0), 'Access-Control-Expose-Headers': 'X-AI-Remaining' } });
    } catch (e) {
      if (admitted) {
        try { await deps.finish(admitted, outcome, e instanceof AiError ? e.code : 'internal_error'); } catch { /* Fail closed: the reserved job remains active for review. */ }
      }
      return json(e instanceof AiError ? e : new AiError('AI_UNAVAILABLE', 'AI conversion is unavailable. Your original photo is still available.', 503));
    }
  };
}
