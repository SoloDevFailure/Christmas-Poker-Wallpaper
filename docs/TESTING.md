# Real-device acceptance checks

These are checks to run, not claims of completed hardware testing.

1. Open deployed PC URL, create wallpaper, enter Fullscreen. All eight tags and QR must be visible.
2. Scan QR with iPhone, open Safari, confirm Connected.
3. Manual mode: enter text/emoji using Aa and Place, tap off-centre, Preview. PC shows a translucent stamp for 10 seconds. Refresh PC: no permanent stamp yet.
4. Preview and Stamp. Refresh PC: one permanent stamp remains. Rapid double tap must not create duplicates.
5. Enter different artwork, stamp over the first, check layering. Join on a second phone and add another stamp; all clients update.
6. Enable Debug. Aim with camera and allow rear camera access. Keep at least three well-distributed tags visible. Check green lock, reprojection error, X/Y, rotation, scale and FPS.
7. Aim at centre (X/Y approximately .5/.5), Preview and compare camera overlay to PC position. Pinch/rotate and repeat at edges and oblique angles, after phone rotation and PC resize/fullscreen.
8. Cover tags until only two remain: warning and disabled Preview/Stamp. Aim outside wallpaper: disabled. Hide phone tab and resume: reacquire before stamping.
9. Adjust aiming offsets: confirm crosshair and PC preview agree. Reset offsets.
10. Disconnect/reconnect network: controls follow socket status and stamps reconcile. Retry a failed stamp without changing placement: same UUID, no duplicate.
11. Export: 1920×1080 PNG, permanent inner-canvas artwork, correct stacking; no border/title/suits, tags, QR or previews.
12. Reset from original creator PC: confirmation, all stamps removed, reload confirms empty. Joining phones cannot reset.

## Supabase integration test

After dependencies and `.env.local` are configured:

```powershell
node --env-file=.env.local --import tsx scripts/check-supabase.ts
```

This creates three anonymous test users and two sessions. Checks: persistence, duplicate request UUID, cross-session read/write isolation, private preview broadcast and owner-only reset. Delete its reported empty sessions and auth test users in the dashboard afterwards. It needs network and working Supabase.

Verify **Realtime → Settings → Allow public access** is disabled: otherwise a client could request a public channel and bypass private-channel authorization. Also review/remove unrelated permissive RLS policies if reusing an existing project.

## Verification completed here

- Passed: clean lockfile dependency installation; five automated tests, including actual ArUco detection on independently rasterized markers and a 90-degree camera rotation.
- Passed: TypeScript and production build using installed Vite 7.x; camera worker bundled successfully.
- Passed: generated root/phone/404 HTML preserves repository asset paths; workflow uses npm ci with the lockfile and required Pages permissions.
- Passed against the configured Supabase project: anonymous sign-in, persisted stamps, duplicate UUID protection, cross-session read/write isolation, private preview broadcast and owner-only reset. The first realtime connection returned CHANNEL_ERROR; the repeated integration run passed.
- Dependency audit: zero reported vulnerabilities after compatible fixes.
- Local connection values are in ignored .env.local; no credentials were added to tracked source. Built browser files intentionally contain the public project URL/publishable key and are ignored by Git.
- Not run: actual GitHub deployment, physical iPhone camera tracking, pinch/rotation accuracy, two physical phones or browser PNG export. These need browser/device acceptance testing.
- Integration checks create anonymous test users and sessions. Remove their test entries in the dashboard when desired.

## React startup crash regression

Reproduced React #527 on the deployed site and the local production bundle: React 19.3.1 was paired with react-dom 19.2.8. Both dependencies are now pinned to 19.2.8 in the manifest and lockfile; the production preflight rejects mismatches. App and Camera hooks were reviewed; this failure occurred before component rendering.

Verified in the browser against the production preview: session creation, the full wallpaper/QR/four markers and Live status. Temporary diagnostic builds verified both the outside-React startup catch and the React render boundary. Diagnostic throws were removed before the final build. Seven automated tests cover the existing geometry/detector cases plus real renderer loading and mismatch rejection.

## Version 0.2 verification

- 40 automated tests: every missing-marker combination at three projective camera angles, subpixel noise (worst extrapolated test error <8 logical pixels), four-marker preference, displaced-marker rejection, duplicate/malformed observations, real detector frames with each missing tag and 90-degree rotation.
- Coordinate/gesture tests: contain/cover in portrait and landscape, one-finger drag, two-finger centroid translation/scale/rotation, finger-count rebasing, scale limits, anchor preservation and stale/dropout states.
- Browser production preview: camera-first layout at 390×844 and 844×390, compact settings/manual controls, existing Supabase preview/stamp/persistence, and unchanged older stamp transforms.
- Temporary synthetic camera build: actual worker detected three markers; browser PointerEvents exercised drag and two-finger scale/rotation. Removing a second marker disabled Stamp and hid the stale overlay; restoring three reacquired tracking. Rotation of the viewport preserved the anchored sticker. The synthetic fixture is tests/browser-camera.fixture.ts; native pointer capture was stubbed because synthetic events do not create real native pointers. This does not verify Safari multitouch or physical camera behavior.
- To repeat that browser-only fixture, temporarily import it from src/bootstrap.tsx, build and open a joined phone controller in the local preview. Remove that import and rebuild before deploying. The production bootstrap must not import the fixture.
- Physical iPhone verification remains required: rear camera behavior, fast motion/dropout recovery, calibration, true multitouch, safe-area/browser chrome behavior, and three-marker accuracy at real viewing angles. No physical device tests were performed here.

## Custom text/image stamp checks

45 automated tests pass, covering native keyboard Unicode/ZWJ segmentation, newline/input limits, bounded wrapping, PNG header/payload validation, rectangular camera geometry, scale/rotation/translation and unchanged preset transforms. TypeScript and production build pass.

Pending real-browser/database checks after migration 202611110002_custom_stamps.sql: enter multiline mixed text/emoji, Place, drag/pinch/rotate, preview on another client, stamp, reload PC and export PNG. Verify alpha transparency and matching aspect/appearance in every view. Browser automation stopped because it could not confidently determine the Windows browser URL; the migration was not executed and this addition has not been deployed.

## Camera Stamp and eight-marker border update (current)

- Automated checks: 79 tests cover centred aiming, portrait/landscape and display zoom mapping, centred pinch/rotation, legacy precision screen/world conversion, unchanged stored transforms, inset presentation/export, all distributed three-marker combinations, actual detector frames for eight/seven tags and every three-corner subset in both orientations, outliers and jitter/large motion. The noisy steep-angle extrapolation test now uses 108px markers and bounds error to 12 logical pixels; the original 140px marker test used 8px.
- Production-browser harness: tests/browser-modes.fixture.tsx uses actual video/canvas/worker detection and PointerEvents with local in-memory submissions. It checks default no-drag, pinch/rotation, camera movement, zoom, legacy anchor/drag/hold/release, invalid-hold cancellation, stream reuse and manual miniature/gestures. Synthetic events stub native pointer capture; this does not validate physical multitouch. The harness is never imported by the application. The older browser-camera fixture exercises legacy mode.
- Repeat in isolation: create a temporary root qa.html containing a root div and module script /tests/browser-modes.fixture.tsx, then a temporary Vite config with the React plugin, base /, build.rollupOptions.input qa.html and build.outDir dist-qa. Build/preview using that config and open /qa.html at 844×390 and 390×844. An on-page PASS/FAIL reports results. ?wallpaper shows the presentation. Remove temporary HTML/config/output before deployment.
- Real-device checks still required: reload both PC and phones (new marker IDs), scan the bottom QR at the TV, test 2m then 4m with 3–8 tags, oblique aiming/phone rotation, Safari and Android rear-camera choice, true multitouch, legacy release accuracy and lost-tracking cancellation. Four-metre performance depends on optics, display size, focus and glare. Verify custom-text previews/stamps, reload, second phone and export on that hardware. No new physical-device test has been performed for this update.
- No new database migration or credentials are required. The user's existing custom-stamp migration and working Supabase flow are retained. Historical verification sections above describe earlier versions.

Current production preview also verified configured Supabase session creation, manual custom PNG creation, preview delivery acknowledgement, permanent stamp submission, live PC stamp count update and persistence after reload. These were desktop-browser checks, not physical phone tracking.
