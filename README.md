# CHRISTMAS POKER 2026 — Version 0.2

React + TypeScript + Vite prototype with a PC wallpaper, phone camera controller, custom transparent text/emoji PNGs, eight-marker ArUco tracking in a worker, direct sticker gestures and a perspective-aware camera overlay, private Supabase previews, persistent ordered stamps, owner-only reset and PNG export.

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
3. The controller defaults to **Camera Stamp**. Allow the rear camera and show at least three well-distributed tags; additional tags are preferred. Artwork stays phone-centred: physically aim, pinch to resize, rotate with two fingers, then tap Preview or Stamp. One finger does not drag it.
4. The mode selector inside **Options** also offers **Legacy Camera** (world-anchored drag/pinch/rotation; hold Stamp to freeze it in the phone view, release to commit; lost tracking cancels) and **Manual Placement** (no camera permission; live miniature, drag/pinch/rotate and tap Stamp). Switching between camera modes keeps the stream alive. Settings contains debugging and legacy aiming calibration. The 1×/2× button starts at **2×** and is relative display zoom only; pinch resizes artwork, never the camera.
5. Overlap another stamp, join with a second phone, export PNG on PC.

PC must show Live and phone Connected. Debug shows tracking metrics and received previews. See [the complete test checklist and optional Supabase integration test](docs/TESTING.md).

## Tracking contract

- Saved/exported artwork remains **1920×1080**, with unchanged normalized positions, scale and rotation. Presentation insets it at (96,54), size 1728×972, leaving a 5% border. Marker corners are converted from presentation to canvas coordinates before fitting the camera homography; letterboxing/fullscreen do not change this mapping.
- Eight original ARUCO tags, black bounds 108px plus 24px white quiet zones: IDs **41, 73, 105, 137, 169, 201, 233, 265**, ordered across top, middle sides and bottom. Exact geometry is in src/geometry.ts. IDs differ from the old layout deliberately: reload both PC and phones after deployment.
- Normalized least-squares fitting uses every corner of each inlier marker, with marker-level consensus over three-marker groups. Three suitable complete tags are required; ill-conditioned corner footprints, ambiguous IDs, malformed quads, unsafe local projections and corner residuals above 4 reference pixels (scaled from a 1280px longest edge) are rejected. Three tags on one screen edge can track using their full corner geometry. Leave-one-tag-out aim checks reject unsafe extrapolation. More consistent markers are preferred. No missing corner is invented.
- Rear camera requests up to 3840×2160 where available, without changing lens/zoom constraints after opening. Worker receives original uncropped frames downsampled initially to a 1280px longest edge, increasing to 1920px only for small/missing tags with sufficient processing headroom. Slow processing falls back to 1280px/960px with a cooldown. Detection and homography fitting both run in the worker. Display zoom never changes detector input.
- Camera Stamp maps the phone centre and rotated artwork axes through the display viewport and homography each frame. Legacy stores one world transform; precision hold snapshots its screen centre/size/angle. Existing storage supports translation, uniform scale and rotation, so under oblique perspective the phone overlay reprojects the actual saved planar artwork (it may appear foreshortened), rather than promising a screen rectangle that cannot be saved. Manual uses the same canvas transforms.
- Small subpixel jitter is smoothed; deliberate motion bypasses smoothing. Lost/outside/stale tracking disables submission. Dropout imagery remains dimmed during a 700ms recovery window measured from the last accepted result receipt, but cannot be stamped. Stamping still requires a fresh accepted frame no older than 350ms. Motion checks use shared observed tags, not unobserved wallpaper corners; smoothing uses the local aiming region. Orientation/resize invalidates in-flight frames and cancels precision holds. Release saves an explicit fresh tracking sample.
- Only explicit Preview/Stamp actions send placement data to Supabase; no camera images or continuous aiming streams. Markers, title, suits and QR are foreground presentation overlays. **PNG exports include only the inner background and permanent artwork**, excluding the border, controls, overlays and previews.

## Persistence and reliability

`wallpaper_sessions` stores owner/status/join code; `wallpaper_members` stores membership; `wallpaper_stamps` stores transformations and a database-generated stacking sequence. Preview broadcasts expire after 10 seconds, one per sender, and never become database artwork.

Stamp UUIDs are retained on failed retries; duplicate primary-key conflicts mean already saved. In-flight locking and a one-second cooldown prevent accidental double taps. Retry an ambiguous failure before changing placement; changing settings starts a new request.

Database rows are the source of truth. Clients load on subscribe, listen for Postgres changes, reconcile on tab resume and every 15 seconds as a missed-event fallback. Owner reset deletes through an RPC and broadcasts refresh. Preview clear is best effort; expiry still removes it.

## Limitations / verification

The previous deployed prototype's physical tracking, custom stamps and Supabase flow were confirmed working by the user. This update is checked with automated geometry/detector tests and a production browser using a synthetic camera; it still requires physical TV/phone acceptance. See docs/TESTING.md for the current checks.

Glare, moiré, focus, small tags, oblique angles and lens distortion affect accuracy. Start facing the display directly, fill most of the camera view with the monitor, keep at least three well-distributed tags visible and enable Debug. No lens calibration or tracking with fewer than three complete markers yet; older phones may be slow. Stamp centres must stay inside the board; edges may clip.

Safari/Chrome permission prompts, rear-camera choice and background-tab behavior need physical-device testing. Rear-facing camera is requested as a preference. Camera mode fills the viewport with controls overlaid; switch to Manual to stop it. The PC Fullscreen API may be unavailable on mobile Safari. No native app or installation is needed.

For wider public use, add CAPTCHA/rate limits, invitation rotation and moderation. Sessions and anonymous accounts are not automatically expired/cleaned up.

References: [js-aruco2](https://github.com/damianofalcioni/js-aruco2), [Supabase private Realtime authorization](https://supabase.com/docs/guides/realtime/authorization).

React and react-dom are pinned to the same exact version. `npm run build` checks runtime compatibility before bundling. Startup import failures and component rendering failures show visible messages with reload controls. The production wallpaper has been verified in a browser; physical iPhone tracking remains a separate acceptance test.

Version 0.2 preserves the database schema and existing stamp transformations. No Supabase migration is needed. Portrait/landscape adaptation uses the actual contained video rectangle and safe-area spacing; it does not request an orientation lock. Precision size/rotation sliders are only in manual mode.

## Custom text and keyboard emoji stamps

Use the **Aa** button for custom text/emoji. Existing saved preset stamps still render. Enter ordinary text, emojis from the native keyboard, mixed content or up to four lines, then press **Place**. The result uses the same camera/manual controls and preview/stamp flow.

Text is rasterized once on the originating phone into a transparent PNG using its normal system font/emoji rendering. That exact image is used on the PC and in exports. Input is bounded to 160 UTF-16 characters, images to 512×256 pixels and data URLs to 65,536 characters (at most 48 KiB encoded PNG bytes). Oversized images are downsampled or rejected. Scale represents the longest side; presets keep their existing square sizing and stored coordinates.

**Required additive SQL migration:** run `supabase/migrations/202611110002_custom_stamps.sql` once in the existing project SQL Editor. It adds three nullable fields (PNG data, width and height), accepts the custom stamp type and validates PNG header dimensions/size. Existing session membership/RLS policies remain in force. No Storage bucket, service-role key, new project or separate emoji picker is used. Preset writes continue to work before this migration, but permanent custom stamps require it.

The custom-stamp migration has already been applied and the feature was reported working on the deployed prototype. This camera/border update requires **no new Supabase migration or configuration**.

At 2–4 metres, detection remains limited by TV size, camera optics, focus, glare and marker pixel size. Digital display zoom does not help detection. At steep angles, three-marker extrapolation amplifies detector noise; the synthetic noisy oblique case is bounded to 12 logical pixels, and additional markers reduce uncertainty. Four-metre reliability is not guaranteed or physically verified.

Tracking diagnostics are inside **Options → Debug information**: raw/known/usable/accepted marker counts, current state, current and last rejection reasons, capture/processing resolution, frame latency, FPS, reprojection error and confidence. A held transform never enables Stamp. With fewer than three usable tags, a marker-free view, or an aim too far beyond a narrow observed strip, move back or use Manual Placement. Camera Stamp remains the default and mode selection persists while Options opens/closes.
