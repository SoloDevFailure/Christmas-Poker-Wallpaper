# CHRISTMAS POKER 2026 — Version 0.2

React + TypeScript + Vite prototype with a PC wallpaper, phone camera controller, three consistent transparent SVG stamps, three/four-marker ArUco tracking in a worker, direct sticker gestures and a perspective-aware camera overlay, private Supabase previews, persistent ordered stamps, owner-only reset and PNG export.

## 1. Configure Supabase

1. Create your Supabase project.
2. Enable **Authentication → Sign In / Providers → Anonymous Sign-Ins**. These visitors receive authenticated user IDs; they do not use unrestricted anonymous database access.
3. Run [the SQL migration](supabase/migrations/202611110001_wallpaper.sql) once in SQL Editor, or through `supabase db push` in a linked project. It includes tables, membership RPCs, constrained writes, RLS and Realtime publication/policies.
4. Disable **Realtime → Settings → Allow public access**. Use a dedicated prototype project, or review other policies: existing permissive policies can weaken these restrictions.
5. Copy `.env.example` to `.env.local`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the project's **public publishable key** (`sb_publishable_…`) or legacy anon key. Never use a secret/service-role key.
6. Ensure **Data API** is enabled and `public` is an exposed schema. The migration grants only the required table/function permissions. In Database Publications, `supabase_realtime` must include `public.wallpaper_stamps` (the migration adds it).

Sydney requires no region setting in this application: use that project's HTTPS URL. No Storage bucket, Edge Function, OAuth provider or auth callback URL is required for this anonymous-sign-in flow.

No Edge Function is needed: narrowly scoped `SECURITY DEFINER` SQL functions validate creation/join/reset; normal reads/writes use RLS. Random UUID-derived join codes are invitation secrets. Knowing a session UUID alone grants no access. Only the creator can reset; retain the original PC browser's site data to preserve that identity.

## 2. Run locally

Use Node 22.12+ or Node 24:

```powershell
npm ci
npm test
npm run build
npm run dev
```

Open `http://localhost:5173/Christmas-Poker-Wallpaper/`. Create a wallpaper. Open its **Open phone controller** link in another desktop tab for manual placement testing.

Dependency installation needs internet. `package-lock.json` is included; local setup and CI use `npm ci` for reproducible installs. `.env.local` is ignored by Git and supplies local connection values. GitHub Pages builds receive their connection values through repository Actions variables.

Phone camera access requires **HTTPS**. A phone opening `http://192.168.x.x:5173/…` does not get the localhost exemption. Use Pages for the first phone test, or your own trusted HTTPS development URL. `VITE_PUBLIC_URL`, if set, must include the repository path and omit `/phone`.

## 3. Deploy to GitHub Pages

1. In repository **Settings → Secrets and variables → Actions → Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (public key only). `VITE_PUBLIC_URL` is optional; leave unset for normal Pages.
2. Set **Settings → Pages → Source** to **GitHub Actions**.
3. Commit/push to `main`, or manually run **Deploy GitHub Pages** in Actions.
4. After success, open `https://SoloDevFailure.github.io/Christmas-Poker-Wallpaper/`.

The workflow sets the Vite repository base path, tests/builds and deploys `dist`. The build writes a real `phone/index.html` and a 404 fallback, so `/phone/?session=…` supports direct access and refresh. QR links use the actual origin/base path unless overridden. For a custom domain at `/`, change the workflow's `VITE_BASE_PATH` to `/` and configure the domain separately.

## 4. First PC-to-iPhone test

1. Create a wallpaper on PC, enter Fullscreen and scan its QR with iPhone.
2. Open Safari, select a stamp, tap the Manual placement canvas, **Preview on PC**, then **Stamp**. Refresh PC to confirm persistence.
3. The controller opens in camera mode. Allow rear camera and keep **at least three tags visible**. Four reliable tags are preferred. A compact status shows tracking strength.
4. Move the phone to aim initially, then drag the sticker with one finger. Two fingers translate, scale and rotate around their centre. After touching, the sticker stays anchored to the wallpaper as the phone moves. **Re-aim** restores camera-centre aiming. Preview checks position; Stamp saves it. Settings holds manual placement, calibration and debugging.
5. Overlap another stamp, join with a second phone, export PNG on PC.

PC must show Live and phone Connected. Debug shows tracking metrics and received previews. See [the complete test checklist and optional Supabase integration test](docs/TESTING.md).

## Tracking contract

- Logical wallpaper: **1920×1080**, centred/aspect-preserving. SVG scales markers and art together through letterboxing, browser resizing and fullscreen.
- Dictionary: original **ARUCO**, 7×7 including black border, using pinned `js-aruco2@2.0.0`. IDs **17, 133, 271, 409**, clockwise from top-left. Black marker bounds are 140×140 logical pixels plus 24px white quiet zones. Locations: `src/geometry.ts`.
- Normalized least-squares homography uses **12 or 16 orientation-corrected marker corners**. Deterministic marker-level RANSAC tests the full fit and every available three-marker group; an inlier requires every corner within 4 processed camera pixels. Bad/ambiguous detections are discarded. Four inliers are preferred; fewer than three disables placement. No fourth corner is invented.
- Camera processing stays on phone, at up to 1280px width, in a worker. No camera frames, gyroscope readings or continuous aiming coordinates go to Supabase. Only explicit previews and saved stamps are sent.
- X/Y are normalized centre coordinates; scale is logical square side length (32–600 pixels); rotation is clockwise degrees in wallpaper Y-down space. Before touch manipulation, the camera image centre plus calibration is projected onto the board. Once grabbed, the sticker has one wallpaper-space transform. Touches are mapped through the inverse video containment and homography, then apply one similarity transform around the gesture centre. Camera movement only reprojects the anchored sticker; it is not added as another translation.
- Lost, outside-board or stale tracking disables placement. A last valid overlay can remain visible for up to 250ms during a dropout, but cannot be stamped. Camera frames older than 350ms are rejected; resizing/orientation changes invalidate in-flight results and reacquire without changing the anchored transform. Title, suits, tags and QR stay above all artwork/previews. PNG includes permanent artwork/title/suits, excluding tags/QR/previews.

## Persistence and reliability

`wallpaper_sessions` stores owner/status/join code; `wallpaper_members` stores membership; `wallpaper_stamps` stores transformations and a database-generated stacking sequence. Preview broadcasts expire after 10 seconds, one per sender, and never become database artwork.

Stamp UUIDs are retained on failed retries; duplicate primary-key conflicts mean already saved. In-flight locking and a one-second cooldown prevent accidental double taps. Retry an ambiguous failure before changing placement; changing settings starts a new request.

Database rows are the source of truth. Clients load on subscribe, listen for Postgres changes, reconcile on tab resume and every 15 seconds as a missed-event fallback. Owner reset deletes through an RPC and broadcasts refresh. Preview clear is best effort; expiry still removes it.

## Limitations / verification

This is implemented source, **not a verified real-device demonstration**. All 40 automated tests, TypeScript and the production build passed. Live Supabase checks passed for session isolation, persistence, duplicate UUIDs, private preview broadcasts and owner-only reset. The first private-channel connection failed transiently; the repeat succeeded. Pages output contains real phone and fallback entry files with correct repository asset paths. GitHub deployment and physical iPhone camera tracking remain unverified. [TESTING.md](docs/TESTING.md) records exactly what passed and remains unverified.

Glare, moiré, focus, small tags, oblique angles and lens distortion affect accuracy. Start facing the display directly, fill most of the camera view with the monitor, keep all tags visible and enable Debug. No lens calibration or tracking with fewer than three complete markers yet; older phones may be slow. Stamp centres must stay inside the board; edges may clip.

Safari/Chrome permission prompts, rear-camera choice and background-tab behavior need physical-device testing. Rear-facing camera is requested as a preference. Camera mode fills the viewport with controls overlaid; switch to Manual to stop it. The PC Fullscreen API may be unavailable on mobile Safari. No native app or installation is needed.

For wider public use, add CAPTCHA/rate limits, invitation rotation and moderation. Sessions and anonymous accounts are not automatically expired/cleaned up.

References: [js-aruco2](https://github.com/damianofalcioni/js-aruco2), [Supabase private Realtime authorization](https://supabase.com/docs/guides/realtime/authorization).

React and react-dom are pinned to the same exact version. `npm run build` checks runtime compatibility before bundling. Startup import failures and component rendering failures show visible messages with reload controls. The production wallpaper has been verified in a browser; physical iPhone tracking remains a separate acceptance test.

Version 0.2 preserves the database schema and existing stamp transformations. No Supabase migration is needed. Portrait/landscape adaptation uses the actual contained video rectangle and safe-area spacing; it does not request an orientation lock. Precision size/rotation sliders are only in manual mode.

## Custom text and keyboard emoji stamps

The controller retains the three presets and adds an **Aa** button. Enter ordinary text, emojis from the native keyboard, mixed content or up to four lines, then press **Place**. The result uses the same camera/manual controls and preview/stamp flow.

Text is rasterized once on the originating phone into a transparent PNG using its normal system font/emoji rendering. That exact image is used on the PC and in exports. Input is bounded to 160 UTF-16 characters, images to 512×256 pixels and data URLs to 65,536 characters (at most 48 KiB encoded PNG bytes). Oversized images are downsampled or rejected. Scale represents the longest side; presets keep their existing square sizing and stored coordinates.

**Required additive SQL migration:** run `supabase/migrations/202611110002_custom_stamps.sql` once in the existing project SQL Editor. It adds three nullable fields (PNG data, width and height), accepts the custom stamp type and validates PNG header dimensions/size. Existing session membership/RLS policies remain in force. No Storage bucket, service-role key, new project or separate emoji picker is used. Preset writes continue to work before this migration, but permanent custom stamps require it.

This addition has not been deployed or integration-tested against the database yet. Browser automation stopped before the migration could be run. TypeScript, 45 automated tests and the production build passed; actual browser rasterization, native phone keyboard behavior and saved custom-image preview/export still need verification after applying the migration.
