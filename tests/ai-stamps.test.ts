import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAiHandler, readLimited, type Dependencies, CARTOON_PROMPT } from '../supabase/functions/ai-stamp/core';
import { assertStickerTransparency, decodePng, MAX_AI_UPLOAD } from '../supabase/functions/ai-stamp/png';
import { openAiDiagnostic, sanitiseMessage, type OpenAiDiagnostic } from '../supabase/functions/ai-stamp/diagnostics';
import { pngFixture } from './ai-png.fixture';
const session = '11111111-1111-4111-8111-111111111111', requestId = '22222222-2222-4222-8222-222222222222';
function request(png: Uint8Array = pngFixture(), token = 'valid-token', id = requestId) {
  const form = new FormData(); form.set('session_id', session); form.set('request_id', id); form.set('image', new Blob([Uint8Array.from(png)], { type: 'image/png' }), 'photo.png');
  return new Request('https://test.invalid/ai-stamp', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}`, Origin: 'https://event.invalid' } : {}, body: form });
}
function harness(options: { quotaCode?: string; retryAfterSeconds?: number; rejection?: string; upstreamStatus?: number; upstreamCode?: string; upstreamMessage?: string; upstreamType?: string; upstreamParam?: string; upstreamRaw?: string; loggerFails?: boolean; output?: Buffer; networkError?: boolean; authenticated?: boolean; finishFails?: boolean } = {}) {
  const logs: OpenAiDiagnostic[] = [];
  let calls = 0, reservations = 0; const finished: { status: string; code?: string }[] = [], seen = new Set<string>();
  const deps: Dependencies = {
    allowance: async () => options.quotaCode ? { status: 'blocked', code: options.quotaCode, retry_after_seconds: options.retryAfterSeconds } : { status: 'ready', remaining: 15, attempts_remaining: 40 },
    logDiagnostic: entry => { if (options.loggerFails) throw Error('logger unavailable'); logs.push(entry); },
    authenticate: async () => options.authenticated === false ? null : 'authenticated-user',
    reserve: async args => { reservations++; if (options.quotaCode) return { status: 'blocked', code: options.quotaCode, retry_after_seconds: options.retryAfterSeconds };  assert.equal(args.user, 'authenticated-user'); assert.match(args.hash, /^[a-f0-9]{64}$/);
      if (options.rejection) throw Error(options.rejection);
      if (seen.has(args.request)) return { status: 'running' }; seen.add(args.request); return { status: 'admitted', remaining: 4 };
    },
    finish: async (_, status, code) => { if (options.finishFails) throw Error('db offline'); finished.push({ status, code }); return true; },
    fetch: async (url, init) => {
      calls++; assert.equal(url, 'https://api.openai.com/v1/images/edits');
      const form = init!.body as FormData; assert.equal(form.get('model'), 'gpt-image-2.5-flare'); assert.equal(form.get('prompt'), CARTOON_PROMPT);
      assert.equal(form.get('quality'), 'medium'); assert.equal(form.get('size'), '1024x1024'); assert.equal(form.get('input_fidelity'), null); assert.equal(form.get('background'), 'transparent'); assert.equal(form.get('n'), '1'); assert.equal(form.get('output_format'), 'png'); assert.equal(form.get('output_compression'), null);
      if (options.networkError) throw Error('private-api-key MUST NOT APPEAR');
      return new Response(options.upstreamRaw ?? JSON.stringify(options.upstreamStatus ? { error: { code: options.upstreamCode, type: options.upstreamType, param: options.upstreamParam, message: options.upstreamMessage ?? 'private upstream details' } } : { data: [{ b64_json: (options.output || pngFixture()).toString('base64') }], usage: { input_tokens: 1, output_tokens: 2 } }), { status: options.upstreamStatus || 200, headers: { 'x-request-id': 'req_test-upstream' } });
    },
  };
  const handler = createAiHandler({ model: 'gpt-image-2.5-flare', event: 'event', origins: ['https://event.invalid'], openaiKey: 'private-api-key' }, deps);
  return { handler, stats: () => ({ calls, reservations, finished, logs }) };
}
test('PNG validation decodes all five filters and requires real useful alpha', () => {
  const expected = decodePng(pngFixture()).data;
  for (let filter = 0; filter < 5; filter++) {
    const decoded = decodePng(pngFixture(16, 16, 'sticker', filter));
    assert.deepEqual(decoded.data, expected); assertStickerTransparency(decoded);
  }
  assert.throws(() => assertStickerTransparency(decodePng(pngFixture(16, 16, 'opaque'))), /transparent/);
  assert.throws(() => assertStickerTransparency(decodePng(pngFixture(16, 16, 'empty'))), /transparent/);
  const broken = pngFixture(); broken[50] ^= 1; assert.throws(() => decodePng(broken), /checksum/);
  assert.throws(() => decodePng(pngFixture(1600, 1)), /dimensions/);
  assert.throws(() => decodePng(new Uint8Array(MAX_AI_UPLOAD + 1)), /Invalid/);
  assert.throws(() => decodePng(pngFixture().subarray(0, 50)), /Truncated|Incomplete/);
  assert.throws(() => decodePng(pngFixture(16, 16, 'sticker', 0, { width: 1, height: 1 })), /larger|length|size|buffer/i);
});
test('authentication and image validation happen before any paid reservation or API call', async () => {
  for (const token of ['', 'invalid']) {
    const h = harness({ authenticated: false }); const result = await h.handler(request(undefined, token));
    assert.equal(result.status, 401); assert.equal(h.stats().calls, 0); assert.equal(h.stats().reservations, 0);
  }
  const h = harness(); const invalid = await h.handler(request(new Uint8Array([1, 2, 3])));
  assert.equal(invalid.status, 400); assert.equal(h.stats().reservations, 0); assert.equal(h.stats().calls, 0);
  const origin = new Request('https://test.invalid', { method: 'POST', headers: { origin: 'https://outsider.invalid' } });
  assert.equal((await h.handler(origin)).status, 403);
});
test('atomic database refusals cannot trigger an upstream request', async () => {
  for (const rejection of ['AI_USER_LIMIT', 'AI_EVENT_LIMIT', 'AI_BUDGET_LIMIT', 'AI_ATTEMPT_LIMIT', 'AI_COOLDOWN', 'AI_USER_ACTIVE', 'AI_EVENT_BUSY', 'AI_NOT_MEMBER', 'AI_EVENT_DISABLED', 'AI_REQUEST_CONFLICT']) {
    const h = harness({ rejection }); const response = await h.handler(request());
    assert.notEqual(response.status, 200); assert.equal((await response.json()).code, rejection); assert.equal(h.stats().calls, 0);
  }
});
test('concurrent duplicate submissions dispatch one upstream edit with a fixed prompt and safe parameters', async () => {
  const h = harness(); const responses = await Promise.all([h.handler(request()), h.handler(request())]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]); assert.equal(h.stats().calls, 1);
  const result = responses.find(r => r.status === 200)!;
  assert.equal(result.headers.get('content-type'), 'image/png'); assert.equal(result.headers.get('cache-control'), 'no-store');
  assertStickerTransparency(decodePng(new Uint8Array(await result.arrayBuffer())));
  assert.equal(h.stats().finished[0].status, 'succeeded');
});
test('rate limits and moderation failures release success slots with no automatic retry', async () => {
  for (const [status, code, expected] of [[429, 'rate_limit_exceeded', 'AI_RATE_LIMIT'], [400, 'moderation_blocked', 'AI_MODERATION'], [401, 'invalid_api_key', 'AI_CONFIGURATION']] as const) {
    const h = harness({ upstreamStatus: status, upstreamCode: code }); const response = await h.handler(request()); const body = await response.json();
    assert.equal(body.code, expected); assert.equal(h.stats().calls, 1); assert.equal(h.stats().finished[0].status, 'failed');
    assert.ok(!JSON.stringify(body).includes('private'));
  }
});
test('opaque checkerboards are rejected rather than presented as transparent stickers', async () => {
  const h = harness({ output: pngFixture(16, 16, 'opaque') }); const response = await h.handler(request());
  assert.equal((await response.json()).code, 'OPAQUE_OUTPUT'); assert.equal(h.stats().finished[0].status, 'failed');
});
test('uncertain upstream outcomes keep their reservation for review and never reveal secrets', async () => {
  for (const options of [{ networkError: true }, { upstreamStatus: 500 }]) {
    const h = harness(options); const response = await h.handler(request()); const body = await response.json();
    assert.equal(body.retryable, false); assert.equal(h.stats().finished[0].status, 'unknown'); assert.equal(h.stats().calls, 1);
    assert.ok(!JSON.stringify(body).includes('private'));
  }
  const h = harness({ finishFails: true }); assert.notEqual((await h.handler(request())).status, 200);
});
test('streaming size and time limits apply even without a Content-Length header', async () => {
  const big = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(33)); controller.close(); } });
  await assert.rejects(readLimited(big, 32, 100), /large/);
  const slow = new ReadableStream<Uint8Array>({ start() {} });
  await assert.rejects(readLimited(slow, 32, 10), /timed out/);
});

test('upstream 400 diagnostics preserve safe status/type/code/parameter without changing the client or quota outcome', async () => {
  const h = harness({ upstreamStatus: 400, upstreamCode: 'invalid_value', upstreamType: 'invalid_request_error', upstreamParam: 'background',
    upstreamMessage: "Invalid value: 'transparent'. Supported values are: 'opaque' and 'auto'." });
  const response = await h.handler(request());
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.code, 'AI_API_ERROR'); assert.ok(!JSON.stringify(body).includes('Supported values'));
  assert.equal(h.stats().calls, 1); assert.equal(h.stats().finished[0].status, 'failed');
  assert.deepEqual(h.stats().logs, [{
    event: 'ai_stamp_openai_error', job_id: requestId, model: 'gpt-image-2.5-flare',
    upstream_status: 400, openai_request_id: 'req_test-upstream',
    error_code: 'invalid_value', error_type: 'invalid_request_error', error_param: 'background',
    message: "Invalid value: 'transparent'. Supported values are: 'opaque' and 'auto'.",
  }]);
});
test('diagnostic messages redact credentials, image data, URLs, emails, control characters and arbitrary quoted values', () => {
  const key = 'sk-proj-diagnostic-secret', token = 'signed-session-secret';
  const message = [
    'Invalid parameter background.', key, 'Bearer ' + token,
    'sk-other-masked*********key', 'Authorization: another-secret',
    'api_key="hidden-credential"', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJleGFtcGxlIn0.signature_value',
    'data:image/png;base64,' + 'A'.repeat(200), 'B'.repeat(200),
    'https://example.invalid/private?token=secret', 'private@example.invalid',
    "'private text reflected from input'", '\nFORGED\u202eLOG\u0000',
  ].join(' ');
  const safe = sanitiseMessage(message, [key, token]);
  for (const forbidden of [key, token, 'another-secret', 'hidden-credential', 'eyJ', 'AAAA', 'BBBB', 'example.invalid', 'private@example', 'private text', '\n', '\u202e', '\u0000', 'sk-other'])
    assert.ok(!safe.includes(forbidden), forbidden);
  assert.ok(safe.includes('Invalid parameter background'));
  assert.ok(safe.length <= 512);
  assert.equal(sanitiseMessage(null, []), 'OpenAI returned no structured error message.');
  assert.ok(!sanitiseMessage('prefix ' + key.repeat(500), [key]).includes(key));
  assert.ok(sanitiseMessage('x'.repeat(2000), []).length <= 512);
});
test('safe diagnostic fields reject header injection, objects, secrets and non-identifier values', () => {
  const log = openAiDiagnostic({ job: requestId, model: 'gpt-image-2.5-flare', status: 422, requestId: 'Bearer header-secret' },
    { code: { leaked: 'secret' }, type: 'sk-proj-secret', param: 'Authorization: Bearer secret', message: 'Short useful error.' }, ['secret']);
  assert.equal(log.error_code, null); assert.equal(log.error_type, null); assert.equal(log.error_param, null); assert.equal(log.openai_request_id, null);
  assert.deepEqual(Object.keys(log).sort(), ['event', 'job_id', 'model', 'upstream_status', 'openai_request_id', 'error_code', 'error_type', 'error_param', 'message'].sort());
});
test('non-JSON upstream failures log status and a static message without echoing the raw body', async () => {
  const h = harness({ upstreamStatus: 400, upstreamRaw: '<html>Bearer secret data:image/png;base64,privatephotograph</html>' });
  const response = await h.handler(request());
  assert.equal((await response.json()).code, 'UPSTREAM_UNCERTAIN');
  const [log] = h.stats().logs;
  assert.equal(log.upstream_status, 400); assert.equal(log.error_type, 'unreadable_response');
  assert.ok(!JSON.stringify(log).includes('privatephotograph')); assert.ok(!JSON.stringify(log).includes('Bearer'));
  assert.equal(h.stats().finished[0].status, 'unknown'); assert.equal(h.stats().calls, 1);
});
test('failed HTTP responses are logged across status classes and logger failure never affects finalisation', async () => {
  for (const status of [400, 401, 403, 404, 422, 429, 500]) {
    const h = harness({ upstreamStatus: status, upstreamType: 'invalid_request_error' });
    await h.handler(request());
    assert.equal(h.stats().logs.length, 1); assert.equal(h.stats().logs[0].upstream_status, status); assert.equal(h.stats().calls, 1);
  }
  const h = harness({ upstreamStatus: 400, loggerFails: true }); const response = await h.handler(request());
  assert.equal((await response.json()).code, 'AI_API_ERROR'); assert.equal(h.stats().finished[0].status, 'failed');
  const success = harness(); assert.equal((await success.handler(request())).status, 200); assert.deepEqual(success.stats().logs, []);
});

test('rolling limit responses include a safe recovery delay without dispatching paid work', async () => {
  for (const code of ['AI_USER_LIMIT', 'AI_USER_ATTEMPT_LIMIT', 'AI_COOLDOWN']) {
    const h = harness({ quotaCode: code, retryAfterSeconds: 123 });
    const response = await h.handler(request());
    assert.equal(response.status, 429);
    const body = await response.json();
    assert.equal(body.code, code); assert.equal(body.retry_after_seconds, 123);
    assert.equal(h.stats().calls, 0); assert.deepEqual(h.stats().finished, []);
  }
});
test('allowance GET authenticates and validates membership via RPC without reserving or generating', async () => {
  const url = 'https://test.invalid/ai-stamp?session_id=' + session;
  const h = harness();
  const response = await h.handler(new Request(url, { headers: { Authorization: 'Bearer valid-token' } }));
  assert.equal(response.status, 200); assert.equal((await response.json()).available, true);
  assert.equal(h.stats().calls, 0); assert.equal(h.stats().reservations, 0);
  assert.equal((await h.handler(new Request(url))).status, 401);
  const expired = harness({ authenticated: false });
  assert.equal((await expired.handler(new Request(url, { headers: { Authorization: 'Bearer expired' } }))).status, 401);
  assert.equal((await h.handler(new Request('https://test.invalid/ai-stamp?session_id=bad', { headers: { Authorization: 'Bearer valid-token' } }))).status, 400);
  const limited = harness({ quotaCode: 'AI_USER_ATTEMPT_LIMIT', retryAfterSeconds: 60 });
  const denied = await limited.handler(new Request(url, { headers: { Authorization: 'Bearer valid-token' } }));
  assert.equal(denied.status, 429); assert.equal((await denied.json()).retry_after_seconds, 60);
  assert.equal(limited.stats().reservations, 0); assert.equal(limited.stats().calls, 0);
});
