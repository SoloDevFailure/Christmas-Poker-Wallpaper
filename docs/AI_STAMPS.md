# AI photo-to-cartoon stamps

## Model verification (13 November 2026)

Default: **`gpt-image-2.5-flare`**, Image API **`POST /v1/images/edits`**, `n=1`, `size=1024x1024`, `quality=medium`, `background=transparent`, `output_format=png`. No `input_fidelity`, PNG `output_compression`, automatic retries, partial images or automatic paid background-removal requests. The fixed prompt is in `supabase/functions/ai-stamp/core.ts`; the browser cannot choose the model, prompt, quality, count or event.

The official edit reference explicitly supports transparent PNG output for GPT-Image-2.5 Flare. This replaces `gpt-image-2`, which rejected the live request with HTTP 400, `invalid_value`, parameter `background`: transparent background is not supported for that model on this project.

Published **Standard** rates are **US$5 / million text input tokens, US$8 / million image input tokens and US$30 / million image output tokens**. The previous document incorrectly labelled Batch rates as Standard rates. The official calculator estimates 439 output tokens / **US$0.01317 output-only** for 1024×1024 medium quality. Total edit cost also includes the reference photograph and prompt. Hypothetical usage of 200 text input and 2,000 image input tokens plus that output estimate totals **US$0.03017 per attempt**; input usage is illustrative, not measured. Retries add cost per accepted conversion. Actual usage metadata is retained for review.

`gpt-image-1-mini` and `gpt-image-1.5` retire **1 December 2026**, before this event. Flare supports editing and favors fast everyday image work. This project's access, actual latency, likeness, transparency quality and cost have **not** been verified with a paid generation. Set server secret `AI_IMAGE_MODEL=gpt-image-2.5-flare` when deploying: an existing environment override takes precedence over the source default. There is no hidden expensive fallback. Keep the existing US$0.10 estimated attempt reservation and all quotas/budget safeguards unchanged; this estimate is not a guaranteed billing cap.

Official sources checked:

- https://developers.openai.com/api/docs/models/gpt-image-2.5-flare
- https://developers.openai.com/api/reference/resources/images/methods/edit
- https://developers.openai.com/api/docs/pricing
- https://developers.openai.com/api/docs/deprecations
- https://developers.openai.com/api/docs/models/gpt-image-1-mini

## Deployment to the existing project

Project reference: **`qdzeubaaodqcgighseaf`**. The existing `OPENAI_API_KEY` stays in Supabase secrets. Do not retrieve it, copy it into the repository, put it in a `VITE_` variable or paste it into frontend code.

1. Run the entire `supabase/migrations/202611130002_ai_stamps.sql` once in this project's SQL Editor, after the three previous migrations. It creates private quota/history tables and service-role-only reservation/completion functions. The event starts **disabled**. If earlier migrations were run manually in the SQL Editor, do not blindly replay all migrations using `db push`; use your actual remote migration history.
2. On an authenticated development machine, from the repository root:

   ```powershell
   npx supabase@3.1.0 login
   npx supabase@3.1.0 secrets set AI_IMAGE_MODEL=gpt-image-2.5-flare AI_EVENT_ID=christmas-poker-2026 AI_ALLOWED_ORIGINS=https://solodevfailure.github.io --remote=qdzeubaaodqcgighseaf --yes
   npx supabase@3.1.0 functions deploy ai-stamp --remote=qdzeubaaodqcgighseaf --no-verify-jwt --yes
   ```

   `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are Supabase-provided Edge environment values. `OPENAI_API_KEY` is already saved. The CLI command does not read or print it. Add any custom frontend origin to the comma-separated `AI_ALLOWED_ORIGINS`; these are origins without URL paths. Do not add localhost to the production allowlist just to run fixtures: fixtures need no backend.

3. The gateway's legacy JWT check is disabled in `supabase/config.toml` because the handler explicitly verifies the bearer token against **Supabase Auth `/auth/v1/user`**, supporting modern JWT signing keys. It rejects absent/invalid/expired tokens. This function is **not public**; do not remove the handler's authentication. Only the service role can call quota RPCs. The authenticated user must also belong to the requested active wallpaper session.
4. Before admitting paid guest conversions, enable the event and review its server-side guardrails in SQL Editor:

   ```sql
   update public.ai_stamp_events
   set enabled=true,
       success_limit=100, user_success_limit=5,
       attempt_limit=150, user_attempt_limit=10,
       active_limit=3, cooldown_seconds=30,
       budget_usd=10.00, attempt_reserve_usd=0.10
   where id='christmas-poker-2026';
   ```

   These are configurable admission safeguards. Every admitted attempt permanently debits the configured **estimated** US$0.10 reservation, including failed requests, so the default US$10 safeguard admits at most 100 attempts. That figure is **not a verified per-image price or guaranteed OpenAI billing cap**. Actual charges can differ, and requests outside this function are outside this counter. Changing the model/quality/rates requires reconsidering the reservation. Monitor provider usage. Set `enabled=false` to stop new admissions.
5. Deploy the frontend through the existing Pages workflow and refresh the phones. The API key never enters that build. No Storage bucket or public photo URL is required.
6. A live paid test needs explicit approval after the model and estimated spend have been reported. No paid calls were made during implementation. Organization verification, model access, safety behavior, actual latency/price/likeness and physical phone handoff remain live acceptance checks. API errors do not trigger a different model or automatic retry.

Deployment documentation: https://supabase.com/docs/guides/functions/deploy and https://supabase.com/docs/guides/functions/auth-headers

## Limits, concurrency and failure recovery

`reserve_ai_stamp` locks the event row before checking/inserting a job and debiting its estimate. Running/reserved jobs count toward the **five per authenticated user / 100 per event** ceilings, preventing concurrent successful jobs from overshooting. All active wallpaper sessions use the same server-selected event. A partial unique index permits only one running/uncertain job per user across events. There is also a global concurrent-job limit, a cooldown and lifetime failed-attempt limits. Anonymous identities are browser profiles, not verified people; clearing browser storage can create a new identity, while the event-wide caps still apply.

A caller supplies a request UUID but never an owner ID. The Edge Function derives the owner from verified Supabase Auth. Request UUIDs bind to the user, event, session and SHA-256 hash of the normalized photograph. Reusing an ID never causes another upstream edit, even after failure; changing its image/identity is rejected. A deliberate Retry creates a new bounded attempt. **Every successful cartoon, including a successful Retry, uses one success allowance even if it is not stamped.**

Known failures (rate limit, moderation, invalid/opaque result, definite 4xx errors) free the successful-generation slot, but keep their attempt/spending debit. Network loss, timeout, HTTP 5xx and crashed workers are uncertain: their reservation remains blocked pending reconciliation, because the upstream request might have incurred cost. An active/unknown job is never automatically refunded or silently retried. Existing request metadata or stale running rows can be inspected by an administrator:

```sql
select id,user_id,status,model,started_at,finished_at,error_code,reserved_usd,usage
from public.ai_stamp_jobs
where event_id='christmas-poker-2026'
order by started_at desc;
```

Only after confirming a stopped/failed upstream outcome should an administrator mark a stuck job failed, using the service-only `finish_ai_stamp` RPC from trusted server code or `select public.finish_ai_stamp('<job UUID>','failed','operator_reconciled');` in SQL Editor. Do not release an ongoing generation. A later duplicate completion is harmless; a slot must be confirmed before a PNG is returned. Retained job rows contain metadata/usage/hash only, **no original photograph or generated image**.

## Images and phone behavior

The original selected File stays in the existing preparation screen throughout conversion/retries. For AI only, its browser-decoded, EXIF-oriented composition is normalized to an **8-bit PNG up to 1536px on the longest edge**, without crop/stretch, preserving alpha. This handles browser-supported HEIC/JPEG/WebP and avoids uploading the tiny stamp preview. The Edge Function accepts only this PNG normalization, not raw HEIC. The raw original still drives Use Original Photo exactly as before.

Server upload limit: **8 MiB**, bounded while streaming even without Content-Length; maximum normalized dimensions **1536×1536**. PNG signature/chunk CRCs/header, actual bounded decompressed scanlines and all PNG row filters are checked. Only non-interlaced 8-bit RGB/RGBA PNG is accepted; the browser normalization produces this format. No untrusted input dimensions are used for unbounded allocation. Auth is checked before reading/decoding uploads.

The server requests actual alpha output. It decodes returned PNG pixels, requiring significant transparent area, visible foreground and a predominantly clear border. An opaque checkerboard, opaque background, empty image or token transparent pixel is rejected; a checkerboard is never substituted for alpha. This is a decoded-alpha/background check, not semantic vision proof that every part of a generated subject is correct. No generation is represented as reliably good without live acceptance. There is no paid automatic background-removal chain: use Original or explicitly Retry when validation fails.

Phone flow: Convert → progress → cartoon preview → **Retry / Use AI Stamp / Use Original Photo**. Retry preserves the earlier usable cartoon while a replacement is attempted. Errors preserve the original. Uncertain/budget/exhausted-limit errors disable further retries in that screen while leaving existing art/original usable. No automatic selection or stamping occurs.

Use AI Stamp calls existing `preparePhoto`: the result fits **512×256**, preserves aspect/alpha and progressively resizes to **65,536 data-URL characters**. Camera preview, stored wallpaper and exports all reuse that same selected PNG. ArUco code, gestures, original-photo preparation, drawing, undo, realtime and export implementations are unchanged.

## Verification

```powershell
npx tsc -b
npx tsc -p tsconfig.edge.json
npm test
npm run build
```

The Edge entry point has a separate TypeScript config; `npm test` imports/tests its pure handler/PNG modules with mocked Auth/RPC/OpenAI dependencies. No test uses `OPENAI_API_KEY`.

With Vite running:

- `tests/ai-sql.fixture.html`: all four real migrations and PostgreSQL role/grant/quota tests via pinned PGlite from jsDelivr. Exercises membership, atomic admissions, concurrent requests, 5/100 ceilings, failure release, attempt limits, cooldown, idempotency, budget and uncertain outcomes. Runs locally; no Supabase/provider writes. PGlite has one serialized connection, so live multi-connection contention remains a deployment acceptance check.
- `tests/ai-ui.fixture.html` and `?failure`: mocked success/error/retry, high-resolution normalized input, preserved original, progress, preview actions, explicit selection and transparent bounded stamp. `?visual` leaves the mock flow for responsive inspection. It is clearly labeled mock output, not evidence of OpenAI quality.
- Existing photo, undo and synthetic-camera fixtures still cover the preserved systems.

## First live failure: diagnostic follow-up

The first deployed v1 request failed after approximately 1.67 seconds with job status `failed`, application error `AI_API_ERROR` and no usage. The handler converts an unclassified OpenAI rejection into its own HTTP 502; that 502 is not evidence that OpenAI returned 502. In v1, upstream 5xx errors map to `UPSTREAM_UNCERTAIN`, 401/403/404 to `AI_CONFIGURATION`, 429 to `AI_RATE_LIMIT`, and recognized safety codes to `AI_MODERATION`. The observed path points toward another early rejection, commonly HTTP 400/422, but cannot establish its precise cause.

The deployed v1 code discarded the upstream error status/body and did not log it. Invocation metadata cannot recover those details retrospectively. Empty Responses logs do not establish that the request was never received: this app calls Images edits, not Responses.

Current official documentation was rechecked for the exact request: multipart `POST https://api.openai.com/v1/images/edits`, one PNG file in `image`, `model=gpt-image-2`, `n=1`, `size=1024x1024`, `quality=low`, `background=transparent`, `output_format=png`. These are documented options; transparency on this model is explicitly preview support. A project-specific preview rejection, an image/request validation error, or another unsupported-value/access condition remains plausible. No model/parameter changes are justified by the generic stored error alone. No OpenAI request was made during this diagnostic work.

### New safe log event

Unsuccessful OpenAI HTTP responses emit one structured `ai_stamp_openai_error` record containing only:

- `job_id`, validated `model`, actual `upstream_status`, and validated OpenAI `openai_request_id` for correlation.
- Safe identifiers `error_code`, `error_type`, `error_param`.
- A sanitized `message`, bounded to 512 characters.

No request/response object, photograph, raw body, headers collection, stack trace or credentials are serialized. The sanitizer removes exact configured credentials/session tokens, key/bearer/JWT patterns, image/base64 data, URLs, email addresses, control characters and arbitrary quoted values. Recognized parameter names/settings remain readable. Malformed/non-JSON error bodies get a static message, never their raw content. Logging failures cannot change finalization or client responses. Success responses are not logged.

The client retains the same generic error and retry policy. Authentication, request parameters/model, quota/budget transitions and the one-upstream-request policy are unchanged. No migration, additional secret or frontend change is needed.

### Deployment and inspection

Redeploy only `ai-stamp`, including `index.ts`, `core.ts`, new `diagnostics.ts`, `png.ts` and `deno.json`. Preserve existing secrets and `verify_jwt=false`: the handler continues its own Supabase Auth verification. Existing deployment instructions above apply; include the new relative dependency.

In Supabase → Edge Functions → `ai-stamp` → Logs, include runtime console events and filter for `ai_stamp_openai_error`. The next failed user-requested conversion will reveal the sanitized upstream rejection and OpenAI request ID. This cannot reconstruct the missing v1 response. Do not replay the old job, refund counters or make paid diagnostic generations automatically.

Mocked tests cover 400/401/403/404/422/429/500, missing fields, non-JSON errors, secret/image redaction, log bounds, unchanged client/quota outcomes and a failing logger.

Diagnostic update deployment: `ai-stamp` version 2 is ACTIVE and its deployed files match the tested repository files. An unauthenticated POST returned HTTP 401 / AUTH_REQUIRED. The jobs table still contained only the original failed job afterward. No OpenAI requests, new conversion jobs, quota resets, migrations or frontend deployments were performed during this follow-up.
