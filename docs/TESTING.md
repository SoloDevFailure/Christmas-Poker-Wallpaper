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

## Camera Stamp and eight-marker border update (historical)

- Automated checks: 79 tests cover centred aiming, portrait/landscape and display zoom mapping, centred pinch/rotation, legacy precision screen/world conversion, unchanged stored transforms, inset presentation/export, all distributed three-marker combinations, actual detector frames for eight/seven tags and every three-corner subset in both orientations, outliers and jitter/large motion. The noisy steep-angle extrapolation test now uses 108px markers and bounds error to 12 logical pixels; the original 140px marker test used 8px.
- Production-browser harness: tests/browser-modes.fixture.tsx uses actual video/canvas/worker detection and PointerEvents with local in-memory submissions. It checks default no-drag, pinch/rotation, camera movement, zoom, legacy anchor/drag/hold/release, invalid-hold cancellation, stream reuse and manual miniature/gestures. Synthetic events stub native pointer capture; this does not validate physical multitouch. The harness is never imported by the application. The older browser-camera fixture exercises legacy mode.
- Repeat in isolation: create a temporary root qa.html containing a root div and module script /tests/browser-modes.fixture.tsx, then a temporary Vite config with the React plugin, base /, build.rollupOptions.input qa.html and build.outDir dist-qa. Build/preview using that config and open /qa.html at 844×390 and 390×844. An on-page PASS/FAIL reports results. ?wallpaper shows the presentation. Remove temporary HTML/config/output before deployment.
- Real-device checks still required: reload both PC and phones (new marker IDs), scan the bottom QR at the TV, test 2m then 4m with 3–8 tags, oblique aiming/phone rotation, Safari and Android rear-camera choice, true multitouch, legacy release accuracy and lost-tracking cancellation. Four-metre performance depends on optics, display size, focus and glare. Verify custom-text previews/stamps, reload, second phone and export on that hardware. No new physical-device test has been performed for this update.
- No new database migration or credentials are required. The user's existing custom-stamp migration and working Supabase flow are retained. Historical verification sections above describe earlier versions.

Current production preview also verified configured Supabase session creation, manual custom PNG creation, preview delivery acknowledgement, permanent stamp submission, live PC stamp count update and persistence after reload. These were desktop-browser checks, not physical phone tracking.

## Tracking reliability correction (current)

Reproduced using the committed previous estimator: five detections with three valid top-edge tags plus two displaced outliers returned "Marker fit is not reliable". The corrected estimator accepts the three valid tags. A local close view with an unobserved lower-wallpaper horizon was also rejected before and is accepted now. Marker IDs, rendered bounds and inset coordinate conversion were checked and remain unchanged. No physical phone frames were captured here, so the precise mix of rejection reasons on the user's device remains for the new diagnostics to identify.

Causes corrected: global marker-centre triangle coverage (discarded real corner geometry); full-wallpaper projection/motion validation (extrapolated unseen corners); fixed pixel residual thresholds across adaptive resolutions; rejection-triggered upscaling; portrait frames exceeding the intended pixel budget; and capture-time dropout timing that consumed the recovery interval during processing.

- Three or more complete tags use corner-footprint conditioning and robust marker consensus. Refits trim marginal outliers; local aim/horizon and leave-one-tag-out consistency checks reject bad extrapolations. The residual threshold remains equivalent to 4px at 1280px longest edge, scaled for resolution.
- Detection and fitting run together in the worker. Temporal motion confirmation compares shared detected tags, while smoothing operates around the aiming region. Original uncropped capture remains independent of display zoom. Resolution increases only when tags need detail and processing has headroom; slow frames back off.
- Recovery holds the last image for 700ms since the last good result receipt. Every rejected/stale frame immediately disables submissions and cancels legacy precision hold. A held pose cannot become stampable through hysteresis. Resize/orientation/background changes invalidate immediately.
- Debug in Options distinguishes raw detections, matched known IDs, usable complete tags, consensus inliers and accepted tags, current state and current/last rejection, capture/processing size, processing latency, FPS, reprojection error and confidence. Display defaults to relative 2×. All three modes are selected inside Options; manual remains camera-permission independent.
- Automated coverage includes all 56 three-tag combinations, all 56 five-tag combinations, noisy single-edge views, five detections with two outliers, partial-view horizons, explicit rejection reasons, equivalent thresholds across resolutions, portrait pixel budgets, changing accepted marker sets, repeated short dropouts, stale frames and genuine loss. Existing storage, custom PNG, export and gesture regression tests remain included.
- Updated production-browser harness verifies actual worker detection across 5↔8 tags and a three-top-tag view, default 2×, mode selection through Options, no camera restart between camera modes, centred gestures, legacy hold/release, safe cancellation and manual placement. Physical Apple/Android/TV retesting is still required, including close approaches. No schema or Supabase configuration changes.

Latency regression: a valid frame taking 200ms to process, followed by the old 60ms pause and another 200ms result, leaves the preceding capture older than the 350ms stamp limit before its successor arrives. Resolution budgeting now accounts for two processing intervals plus a 30ms pause; it reduces pixel work rather than extending the freshness limit. A focused test verifies this expiration and the lower-resolution continuous-freshness case. The correction passes 96 automated tests and TypeScript.

Final production-browser harness passed at 844×390 and 390×844. Options/debug showed populated detection/acceptance counts, state/rejection history, capture/processing size, latency, reprojection error and confidence. The main interface had no mode selector; camera opened at relative 2×. These are synthetic camera/desktop-browser checks, not new physical Apple/Android tests.

## Visual tracking debugger

- Instrumentation-only update: no solver equations, acceptance comparisons, consensus ranking, marker positions, camera resolution policy or tracking state timings changed. Optional trace data exposes the existing branches; a parity test confirms debug-on and debug-off return identical three-marker fits. Existing 56-combination three-tag coverage and actual detector cases still pass.
- New tests cover three accepted tags, five detections with two reprojection outliers, unknown/duplicate/tiny tags, failed-model check reporting, actual-corner preview mapping at 1×/2× in portrait/landscape, motion-confirmation/timeout colours, and stale-outline hiding. All 107 tests and TypeScript pass.
- The isolated production-browser fixture now enables Tracking Debug through Options, checks green accepted outlines, injects an actual independently decoded ID 999 and checks its red unknown-ID outline, verifies pointer-events passthrough, then exercises existing gestures/stamping, three-marker tracking, legacy hold/release and manual mode with debugging enabled. No physical Safari/Android test is claimed.
- Real test: enable Options → Tracking Debug and close Options; record a dropout with the panel visible. Use 1× if display cropping hides the detected tags. Check the frame reason plus each coloured ID; distinguish unknown/malformed tags, fit outliers, an unvalidated candidate model, motion confirmation and stale processing. HELD never implies fresh accepted tags or permission to stamp. Full per-marker text is also in Options → Debug information.

The most recent rejected frame reason/time and its per-marker decisions are retained (one frame only), so a brief failure between 8Hz overlay updates remains inspectable. Current outlines still show the latest detector result; stale historical corners are never substituted. Full last-rejected per-tag text is available in Options → Debug information.

Final production-browser fixture passed at 844×390 and 390×844. Visual inspection at 1× confirmed the green corner dots/outlines sit on the actual black tag edges, with the live panel and camera controls visible. Debugging stayed enabled during gesture/stamp, legacy and manual regression checks. TypeScript, 107 automated tests and production build passed. Physical iPhone Safari/Android Chrome testing remains pending.

## One-second stamping grace and bottom visual overlay (current)

- Replaces the earlier non-stampable recovery contract. The monotonic acceptance receipt creates a fixed validUntil = receipt + 1000ms. A held sample carries the original capture time and original deadline through Camera, PhoneController and App. No reuse/touch/rejection changes that deadline. Stamp/Preview can use the frozen reliable transform in HELD; LOST rejects both even between UI timer ticks. New camera frames still face the original 350ms freshness/geometry validation.
- Brief validation failures retain pointer captures, gesture state and legacy precision hold. Touch movement during HELD is recorded only for rebasing, never applied to the stale homography. Fresh recovery rebases before manipulation resumes. Camera Stamp and legacy precision release both use the last reliable snapshot during HELD; precision after expiry cancels. Resize waits preserve grace; explicit camera/background invalidation clears it. Normal HELD badges have a 120ms cosmetic debounce, with no fade/grey-out of artwork or Stamp.
- The debug SVG connects only centres computed from current accepted detections. Rejected, pending, expired and held detections cannot create green connection lines. Actual detected corners continue to use the preview containment/relative zoom transform. A readable strip above the bottom action buttons shows the state/age, current IDs and labelled HELD IDs, rejection/check, capture/processing size, error and detection age. Pointer events remain disabled.
- Focused tests cover initial absence, exact 1000ms boundary, repeated rejection/stale-result non-renewal, recovery, final-submission deadline checks and connections/held-vs-current detections. Existing tests were updated to the explicitly requested HELD-stampable contract; no homography thresholds were changed.
- Production-browser harness exercises a Camera Stamp tap after over 350ms of lost tracking, verifies its frozen saved transform and expiry, maintains a live legacy drag across dropout without a jump, commits a legacy precision release at the frozen pose during HELD, cancels after a longer loss, and checks connections/strip placement plus manual/gesture regressions. No physical-device test is claimed.

Final checks: TypeScript, 114 tests and production build pass. The synthetic production-browser harness passed in portrait and landscape, including actual HELD taps/releases beyond 350ms, frozen coordinates, expiry, gesture recovery, current-marker connections, bottom-strip bounds and unchanged manual operation. Visual inspection confirmed accepted-node connections align with the detected tags. Real Apple/Android camera behaviour remains unverified for this update.

### Frame pipeline reliability follow-up

Compared the original fixed-1280 four-marker capture loop with the eight-marker adaptive-resolution worker. Both were already serial; no concurrent detector calls were found. The newer adaptive path could remain at its 960px floor even when each result consumed almost the entire 350ms freshness allowance. Also, js-aruco2 retains oversized grayscale/threshold arrays after shrinking: confirmed by inspecting a 1920→960 sequence (2,073,600 grayscale elements for a 518,400-pixel frame). Its threshold loops use array length, wasting work. Trim those buffers; permit latency-driven full-frame downshifts to 640, without changing fit thresholds. Extremely small tags may then be undetectable: speed cannot recover unavailable camera detail.

The prior overlay replaced expired detected counts with zero. That was not evidence of zero detector observations. Counts now remain explicitly labelled as the last processed frame; stale outlines are still hidden. Each worker response carries its frame ID, capture timestamp, detector/fit/worker durations and readback duration; the UI reports acquisition/skip status separately. Presentation-to-result age includes frame presentation wait, readback, worker and delivery time; presentationTime is a browser compositor timestamp, not a guaranteed physical exposure timestamp. The old timestamp was taken AFTER readback and its “processingMs” combined worker and delivery time. A reported 335ms therefore did not establish a detector-only duration.

requestVideoFrameCallback (currentTime deduplication fallback) captures only new presented frames. A single-flight frame gate rejects mismatched replies; hidden/unready/readback/worker failures differ from valid processed frames finding zero tags. Last homography, accepted raw observations, error, accepted timestamp and eight-result history persist locally across ordinary failures and changing marker sets. Neither skipped frames nor rejected fits renew stamping permission. The 1000ms grace and geometric acceptance checks are unchanged; original full-frame drawImage capture and independent 2× CSS preview remain.

New regression coverage uses one real detector across changing 7/3/0/3/8 marker sets, resolution changes, orientation, malformed frames, duplicate/late replies, sustainable processing budgets and stale-count rendering. Physical iPhone/Android tests still needed at television distances and under thermal/CPU load. Inspect detector versus readback/delivery timing to distinguish genuine zero-tag observations from slow/unavailable frames; verify motion placement accuracy, close-up partial views and both zoom levels.

The browser stress fixture uses the real detector and delayed worker delivery equivalent to 335ms at 960px, scaled by pixel area. Lowering the processing limit below 640 caused the browser-resampled small synthetic tags to disappear despite the independently rasterized tests passing at those resolutions. Kept a 640px detail floor. Under severely delayed delivery, short logical HELD intervals may still occur; this test checks actual retained detections and bounded stamping availability, rather than claiming every frame stays VALID.

Final validation: TypeScript, 122 automated tests and the production build passed. Portrait and landscape synthetic camera placement checks passed. The final delayed-delivery stress run retained eight actual detections and enabled Stamp throughout all 40 samples; 5 samples were logically HELD and none LOST. This is not a claim of continuous fresh tracking under arbitrary device load. No physical-phone testing was performed for this update.
