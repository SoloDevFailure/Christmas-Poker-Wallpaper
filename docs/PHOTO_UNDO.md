# Photo stamps and individual undo

## Deployment

1. Run the entire `supabase/migrations/202611130001_individual_undo.sql` transaction once in the existing Supabase project's SQL Editor, after migrations `202611110001` and `202611110002`. The normal Supabase CLI migration workflow also works. No Storage bucket, Edge Function, OpenAI setup or new keys are needed.
2. Against a migrated **test project**, run `node --env-file=.env.local --import tsx scripts/check-undo.ts`. It uses the public URL/anon key, creates isolated anonymous users/session and resets only its own test artwork. Accounts and the empty test session remain for administrator cleanup.
3. Deploy through the existing Pages workflow and reload all controllers/receivers. Photos use the existing custom-stamp schema; Undo is disabled if its RPC is unavailable, with the migration/connection explanation in its tooltip.

The additive migration backfills saved stamps and does not alter PNG limits, existing artwork, tracking, presentation or export. When rolling back the frontend, leave the history table/triggers installed so older clients' inserts still enter authenticated history. Never grant clients direct DELETE/UPDATE or history-table access.

## Photo limits and behavior

The toolbar is **Text | Emoji | Draw | Camera | Import**. Camera uses a native file input with `capture="environment"`; phones can offer the rear photo camera, and unsupported browsers use a regular file picker. Import omits capture. Neither opens another `getUserMedia` stream nor changes tracking constraints/resolution. A native camera can background the browser; returning uses existing visibility/tracking recovery and fresh-pose rules. Real camera handoff needs Safari/Android acceptance testing.

Accept JPEG, PNG, WebP and HEIC/HEIF when the browser supports decoding. No HEIC decoder dependency is bundled; unsupported HEIC gives instructions to export JPEG/PNG. Native browser decoding applies EXIF rotation/mirroring. Reject sources above **20 MiB compressed** or **64 megapixels decoded** (dimensions are checked after browser decoding).

Preparation retains the original File/object URL until Cancel or Use Original Photo. **Convert to AI Stamp — Coming soon** is disabled, with no handler or API integration. No photo is uploaded during preparation. Object URLs and file input selections are released on exit/transfer to component state.

Use Original Photo fits the whole image inside **512 × 256**, preserves aspect ratio to integer-pixel precision and transparency, and never enlarges small sources. PNG encodes are progressively resized by 0.85 until the existing CustomAsset validator accepts the **65,536-character data URL** (at most **49,134 PNG bytes**). No crop, opaque fill, JPEG flattening or database constraint change. Fine detail is reduced to meet that cap; photos are stickers, not full-resolution archives. The noisy 2000 × 1500 Chromium stress fixture fits at 151 × 114; normal photos vary.

The prepared PNG enters existing placement, pinch/rotate, Preview and explicit Stamp. All devices and exports use its same stored pixels.

## Authenticated undo

Device ownership uses the existing persistent anonymous Supabase auth identity for that browser profile. Reload retains it; clearing storage, private sessions or switching browsers creates another identity and does not transfer undo rights. APIs do not accept an owner ID.

`wallpaper_stamp_history` records UUID, session, authenticated creator, stacking sequence and deletion timestamp, without photo pixels. RLS is enabled with no client table privileges. Insert triggers enforce membership, derive ownership from `auth.uid()`, serialize device/session insert/undo operations with transaction advisory locks and reserve successful stamp UUIDs. Delete triggers retain tombstones, including owner resets. Existing direct DELETE/UPDATE restrictions remain.

`wallpaper_undo_history(target)` selects the device's latest **five creations**, then excludes removed entries. Tombstones remain in the window: removing newer stamps cannot make an older sixth stamp eligible. Interleaved users do not consume each other's windows; new stamps advance the window even if preceding entries were undone.

`undo_wallpaper_stamp(target, stamp_id)` checks authenticated ownership/membership and permits only the newest surviving eligible stamp under the same lock. Retrying a successful removed UUID returns false harmlessly. Stale/out-of-order targets fail without deletion and the controller refreshes eligibility. The in-flight client guard prevents double taps; concurrent requests with the same auth identity serialize on the server. Duplicate INSERTs are treated as already saved only after verifying their session/creator/ID; an undone UUID cannot recreate artwork.

After deletion, a private `stamps-changed` broadcast is only a refresh hint. Peers read RLS-authorized rows instead of trusting a broadcast deletion ID. Postgres subscriptions, reconnect/resume loads and existing 15-second reconciliation cover missed hints and DELETE-filter limitations. Reload and export use surviving database artwork.

## Verification

- Local checks: `npx tsc -b`, `npm test`, `npm run build`.
- Local database checks: open `/Christmas-Poker-Wallpaper/tests/undo-sql.fixture.html` with Vite running. It downloads a pinned PGlite PostgreSQL runtime from jsDelivr, stubs only Supabase auth/realtime setup, then applies all actual migrations and tests RLS, grants, triggers and undo functions in an isolated in-memory database. No SQL or test data is sent to Supabase. This does not emulate live concurrency or realtime delivery.
- Browser PNG/EXIF/transparency, noisy-image resizing and photo export/removal: open `/Christmas-Poker-Wallpaper/tests/photo-preparation.fixture.html` with Vite running. No backend writes.
- UI checks: `/Christmas-Poker-Wallpaper/tests/emoji-picker.fixture.html?visual` uses the existing synthetic tracking camera and in-memory stamps for file picker, preparation, Cancel and explicit placement checks.
- `scripts/check-undo.ts` exercises ownership/direct-access denial, latest-five/newest-first rules, interleaving, no resurrection of old history, restored auth, duplicate/concurrent requests, persistence and private realtime refresh. It must run after migration; local unit tests do not verify deployed RLS.
- Physical acceptance: rear capture/return to tracking, EXIF/HEIC on Safari/Chrome, two phones interleaving stamps/undo, reload, receiver removal and PNG export.
