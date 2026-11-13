import { createAiHandler, type Dependencies } from './core.ts';

// The only runtime-specific entry point. Everything else is tested without keys
// or paid generations. No request headers, photographs or API errors are logged.
const runtime = (globalThis as unknown as { Deno: { env: { get: (name: string) => string | undefined }; serve: (handler: (request: Request) => Promise<Response>) => void } }).Deno;
const env = (name: string) => runtime.env.get(name) || '';
const url = env('SUPABASE_URL'), serviceKey = env('SUPABASE_SERVICE_ROLE_KEY'), anonKey = env('SUPABASE_ANON_KEY');
async function rpc(name: string, args: unknown): Promise<unknown> {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args), signal: AbortSignal.timeout(10000),
  });
  const data = await response.json();
  if (!response.ok) throw Error(typeof data.message === 'string' ? data.message : 'AI_UNAVAILABLE');
  return data;
}
const deps: Dependencies = {
  authenticate: async token => {
    if (!url || !anonKey || !serviceKey) return null;
    const response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) return null;
    const user = await response.json(); return typeof user.id === 'string' ? user.id : null;
  },
  reserve: async args => await rpc('reserve_ai_stamp', {
    p_event: args.event, p_user: args.user, p_session: args.session, p_request: args.request, p_hash: args.hash, p_model: args.model,
  }) as { status: string; remaining?: number },
  finish: async (id, status, code, usage) => await rpc('finish_ai_stamp', { p_request: id, p_status: status, p_error: code ?? null, p_usage: usage ?? null }) === true,
  fetch,
};
runtime.serve(createAiHandler({
  openaiKey: env('OPENAI_API_KEY'),
  model: env('AI_IMAGE_MODEL') || 'gpt-image-2',
  event: env('AI_EVENT_ID') || 'christmas-poker-2026',
  origins: (env('AI_ALLOWED_ORIGINS') || 'https://solodevfailure.github.io').split(',').map(value => value.trim()).filter(Boolean),
}, deps));
