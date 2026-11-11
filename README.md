# Christmas Poker 2026 — Interactive Wallpaper

React + TypeScript + Vite prototype with a PC wallpaper, phone camera controller, three consistent transparent SVG stamps, local ArUco tracking in a worker, perspective-aware camera overlay, private Supabase previews, persistent ordered stamps, owner-only reset and PNG export.

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
3. Select **Aim with camera**, allow rear camera and keep **all four tags visible**. Wait for green “Tracking locked · 4/4 markers”.
4. Move phone to aim; pinch to resize and turn two fingers to rotate. Sliders also work. Preview checks position; Stamp saves it. Aiming-offset controls provide adjustment.
5. Overlap another stamp, join with a second phone, export PNG on PC.

PC must show Live and phone Connected. Debug shows tracking metrics and received previews. See [the complete test checklist and optional Supabase integration test](docs/TESTING.md).

## Tracking contract

- Logical wallpaper: **1920×1080**, centred/aspect-preserving. SVG scales markers and art together through letterboxing, browser resizing and fullscreen.
- Dictionary: original **ARUCO**, 7×7 including black border, using pinned `js-aruco2@2.0.0`. IDs **17, 133, 271, 409**, clockwise from top-left. Black marker bounds are 140×140 logical pixels plus 24px white quiet zones. Locations: `src/geometry.ts`.
- Least-squares homography uses all **16 orientation-corrected marker corners**. Reverse fit reports RMS reprojection error in processed camera pixels; fits over 5px are rejected. All four unique tags are mandatory.
- Camera processing stays on phone, at up to 1280px width, in a worker. No camera frames, gyroscope readings or continuous aiming coordinates go to Supabase. Only explicit previews and saved stamps are sent.
- X/Y are normalized centre coordinates; scale is logical square side length (32–600 pixels); rotation is clockwise degrees in wallpaper Y-down space. The camera image centre plus optional offset is projected onto the board. Camera rotation direction maps through the homography; the stamp is perspective-projected back onto the contained video.
- Lost, outside-board or stale tracking disables placement. Title, suits, tags and QR stay above all artwork/previews. PNG includes permanent artwork/title/suits, excluding tags/QR/previews.

## Persistence and reliability

`wallpaper_sessions` stores owner/status/join code; `wallpaper_members` stores membership; `wallpaper_stamps` stores transformations and a database-generated stacking sequence. Preview broadcasts expire after 10 seconds, one per sender, and never become database artwork.

Stamp UUIDs are retained on failed retries; duplicate primary-key conflicts mean already saved. In-flight locking and a one-second cooldown prevent accidental double taps. Retry an ambiguous failure before changing placement; changing settings starts a new request.

Database rows are the source of truth. Clients load on subscribe, listen for Postgres changes, reconcile on tab resume and every 15 seconds as a missed-event fallback. Owner reset deletes through an RPC and broadcasts refresh. Preview clear is best effort; expiry still removes it.

## Limitations / verification

This is implemented source, **not a verified real-device demonstration**. All five automated tests, TypeScript and the production build passed. Live Supabase checks passed for session isolation, persistence, duplicate UUIDs, private preview broadcasts and owner-only reset. The first private-channel connection failed transiently; the repeat succeeded. Pages output contains real phone and fallback entry files with correct repository asset paths. GitHub deployment and physical iPhone camera tracking remain unverified. [TESTING.md](docs/TESTING.md) records exactly what passed and remains unverified.

Glare, moiré, focus, small tags, oblique angles and lens distortion affect accuracy. Start facing the display directly, fill most of the camera view with the monitor, keep all tags visible and enable Debug. No lens calibration or partial-marker recovery yet; older phones may be slow. Stamp centres must stay inside the board; edges may clip.

Safari/Chrome permission prompts, rear-camera choice and background-tab behavior need physical-device testing. Rear-facing camera is requested as a preference. Camera mode fills the viewport with controls overlaid; switch to Manual to stop it. The PC Fullscreen API may be unavailable on mobile Safari. No native app or installation is needed.

For wider public use, add CAPTCHA/rate limits, invitation rotation and moderation. Sessions and anonymous accounts are not automatically expired/cleaned up.

References: [js-aruco2](https://github.com/damianofalcioni/js-aruco2), [Supabase private Realtime authorization](https://supabase.com/docs/guides/realtime/authorization).
