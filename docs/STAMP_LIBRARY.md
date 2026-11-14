# Personal stamps and camera recovery

## Identity and recovery

The existing Supabase anonymous Auth user is the phone profile. There is no separate named profile or new login. The SDK persists its session/refresh token in origin-scoped browser storage and refreshes it normally. Identity initialization is now single-flight so simultaneous startup requests cannot create competing anonymous users.

Refreshing, restarting the same browser, and scanning the event QR in that **same browser profile/origin** retain library access while its refresh token remains valid. A new phone/browser, private-browsing session, cleared/evicted site data, revoked/expired refresh credentials, or an iOS standalone context with separate storage can create a different identity. There is no account-linking or cross-device recovery promise. Do not sign users out to recover the camera.

The phone now remembers its last pairing code separately from the presentation. An explicit QR session parameter takes precedence. Pairing is still checked through the existing membership RPC. Current prepared artwork and world placement are stored locally under an Auth-user + wallpaper-session key; scale/rotation/position are validated on restore. Camera-relative size, rotation and display zoom use the same scoped key. Recovery writes are throttled and flushed on page hide/cleanup, while explicit artwork selection is saved immediately. Browser-storage failure leaves the cloud library as fallback. Rejoining a closed/unavailable event still requires a valid pairing/network; cached artwork is not erased. A deleted library item may remain as the user's already-selected local PNG copy; it is not shown as a saved library entry.

## Private library

- Bucket: **personal-stamps**, private, PNG only, maximum **49,134 bytes** per prepared image.
- Metadata: **public.personal_stamps** (no image payloads), associated with the verified Auth user.
- Image limit: existing **512 × 256** preparation bounds and **65,536-character** stamp payload remain unchanged; alpha/aspect are preserved.
- Quota: **100 non-deleted stamps / 5 MiB per identity**, including pending/deleting saves. Quota checks serialize per owner using a transaction advisory lock.
- Accepting **Use AI Stamp**, **Use Original Photo**, completed drawing Finish or text Place queues saving. Individual emoji picks are not added to the library. Reuse downloads the existing PNG and never calls AI or debits AI quotas.
- My Stamps provides private thumbnails, dates, reuse and confirmed deletion. Thumbnails use short-lived signed URLs; reuse obtains a fresh authenticated download. Previously downloaded bytes/previews can remain in a browser cache; deletion cannot recall copies already downloaded.

The stamp-library Edge Function authenticates against Supabase Auth, ignores any supplied owner ID, bounds/decodes PNG bytes and dimensions, hashes content, reserves metadata, uploads to Storage with a service-only credential, and marks ready only after confirmation. Raw photos are not stored—only the existing prepared stamp PNG. Authenticated clients have owner-only metadata/Storage reads and no direct mutation grants. RLS requires both the owner folder and matching ready metadata for object reads. RPC mutations are service-role-only; service credentials are never sent to the browser.

Unique owner/content-hash reservations prevent duplicate saves; interrupted saves remain pending and retry the same object. Pending/deleting gallery entries can be deleted after confirmation. Failed saves retain selected artwork, explain that cloud saving did not succeed, and offer **Retry saving** without generation. **Keep selected locally** explicitly continues without claiming a successful cloud save. After a refresh or interrupted save, open My Stamps and choose **Save selected artwork** to retry the cached PNG without regeneration; this is also an explicit option for saving a selected emoji. Deletion first marks the row deleting, removes the object through the Storage API, then retains a deleted metadata tombstone. A delayed upload cannot mark a deleted record ready; resaving identical content uses a fresh object ID. Copies previously placed on the wallpaper are self-contained PNG payloads and are unaffected. Rare uncertain uploads interrupted between object transfer and completion may need an administrator to retry/delete the pending entry; do not delete Storage rows directly with SQL.

## Reset Tracking

The camera component stays mounted so selected PNG, camera-relative size/rotation, zoom, pairing and authentication survive. Reset synchronously invalidates its epoch/pose/precision state, cancels frame callbacks/timers and the single-flight gate, terminates the old detector worker, stops every old track, and clears the video's stream. It then starts a new instance through the existing camera effect. No detection resolution, marker thresholds, homography math, capture constraints, cropping or gesture calculations change.

A synchronous guard prevents repeated resets. Old worker replies are ignored, delayed image bitmaps are closed, and late getUserMedia results are stopped after cleanup/unmount. Camera startup times out after 15 seconds and permits another manual attempt. Stamp remains disabled until a fresh valid tracking solution arrives. Manual placement stays available on permission/startup failure.

Health detection uses actual video-time progress, pending processing age and repeated capture failures, **never marker count**. After six seconds without new frames or processing progress, an ended camera track, or eight capture failures, it stops the failed pipeline and highlights Reset Tracking. It does not automatically restart. Hidden tabs and deliberate drawing pauses do not trigger restart loops. Visibility changes explicitly reset health deadlines so suspended browser timers cannot cause an immediate false stall on resume; stale tracking still requires a fresh solution.

## Deployment

1. Apply the additive `supabase/migrations/20261114043502_personal_stamp_library.sql` migration after the existing migrations. It creates the private bucket, metadata table, service-only RPCs and owner read policies; it does not alter player, wallpaper or AI history. The filename matches the verified hosted migration version after deployment.
2. Deploy **stamp-library**, entrypoint stamp-library/index.ts, with stamp-library/{core.ts,index.ts,deno.json} and ai-stamp/png.ts. The existing SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY runtime values are used. Existing AI_ALLOWED_ORIGINS is reused as the origin allowlist; no new secret or OpenAI access is needed. From an authenticated CLI, use `npx supabase@3.1.0 functions deploy stamp-library --remote=qdzeubaaodqcgighseaf --no-verify-jwt --use-api --yes`. Gateway JWT checking stays disabled because the handler validates Auth itself, as ai-stamp already does.
3. Deploy the frontend using the existing Pages workflow. Refresh phones once to get My Stamps/Reset Tracking. Existing previously-generated art cannot be recovered retroactively unless still selected/cached on the phone.

No changes to ai-stamp, its model/prompt, quotas, budget, Undo, realtime, drawing tools, emoji picker, presentation or export are required.

## Verification

- npm test; application and Edge TypeScript; npm run build.
- tests/library-sql.fixture.html: isolated actual PostgreSQL ownership/RLS, service-only writes, private bucket, duplicate/concurrent reservations, interrupted saves, 100-stamp quota, deletion/late completion.
- scripts/check-stamp-library.ts: opt-in live private Storage test with two disposable anonymous profiles and synthetic PNG only. Checks upload, concurrent deduplication, cross-user read/delete/upload denial, forged owner rejection, session restoration, reuse, fresh URL denial after deletion, resaving deleted content and independent placed copies. It removes its test images and resets its own wallpaper artwork; its anonymous profiles, empty wallpaper session and immutable creation-history row remain for audit. Close the fixture session after the check. It makes no OpenAI requests.
- tests/camera-recovery.fixture.html?independent: synthetic camera + real detector + mocked AI/library. Import → AI preview → Use AI Stamp → failed save/retry → My Stamps reuse → worker stall → rapid reset → same PNG → successful Stamp; also permission denial/retry and unmount during pending getUserMedia.
- Add &resume to that fixture after the first pass to verify same-profile reload recovery without generation.

Physical Android Chrome/iPhone Safari camera-permission and OS resume testing is still recommended; desktop responsive/synthetic tests cannot prove hardware-specific behavior.

## Verified deployment (14 November 2026)

The migration is applied on qdzeubaaodqcgighseaf (hosted version 20261114043502). The private bucket, size/MIME settings, RLS and service-only RPC grants were queried. The deployed deletion routine also handles stale retries without affecting a newly resaved copy. stamp-library version **2** is ACTIVE, its source matches the repository, and an unauthenticated POST returns 401. Live private Storage tests passed. All uploaded fixture objects were removed. Earlier temporary profiles were removed; the final shared-wallpaper persistence fixture is closed with no artwork, retaining two anonymous test profiles, deleted library metadata and one immutable creation-history record. No AI function, AI history or quota configuration was changed, and no paid image generation was performed.

Final verification passed: 173 automated tests, both TypeScript configurations, production build, 20 isolated PostgreSQL assertions, live two-identity Storage isolation, actual wallpaper-copy persistence after library deletion, full mocked photo/AI/save-failure/library/reuse/camera-reset flow, rapid resets, permission failure/retry, unmount during startup, pinch/rotation preservation and same-profile refresh recovery. Responsive checks covered 320×568, 390×844 and 568×320; physical phone testing remains the final hardware check.
