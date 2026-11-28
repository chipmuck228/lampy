# TestFlight 1.0.0 (19)

Release branch: release/testflight-1.0.0-19. Baseline: main 9c32028deac955dcc0c08bbf917f17ed5c40a5a8, including merged and user-device-accepted PR152. This release changes only the Sandbox default build number, regression expectations and release instructions; no additional product code, backend configuration, website or database changes.

## Archive configuration

- Version/build: 1.0.0 (19).
- Bundle/team: app.lampy.ios / B283NY984J.
- Explicit profile: testflight-sandbox.
- Account/family API: https://lampy-api.5sparks.ai; iOS associated domain matches.
- Personal/family free full-screen EPUB preview and unified paid EPUB save/share enabled.
- Store product: lampyepubexport. Purchase environment remains Apple Sandbox; no local StoreKit fixture.
- PDF, test driver and account diagnostics remain closed. Android restrictions unchanged.

Do not reuse the old-host TestFlight 18 branch or move server credentials into public app configuration. Self-owned domain does not make this a Production purchase/backend release.

## Mac preparation

Run individually from an existing repository, stopping on errors. Use a new worktree to preserve existing native projects and branch checkouts:

```bash
cd /Users/zhen/WeChatProjects/lampy-ui-e9daad5
git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 fetch origin
git worktree add --detach /Users/zhen/WeChatProjects/lampy-testflight-19 origin/release/testflight-1.0.0-19
cd /Users/zhen/WeChatProjects/lampy-testflight-19/apps/ios
npm ci
LAMPY_BUILD_NUMBER=19 LAMPY_ARCHIVE_OUT="$HOME/Desktop/Lampy-TestFlight-1.0.0-19" bash scripts/release-archive.sh --testflight-sandbox
open "$HOME/Desktop/Lampy-TestFlight-1.0.0-19/Lampy.xcarchive"
```

If the worktree or output directory already exists, inspect it before proceeding rather than deleting or forcing replacement. Archive script refuses to replace a generated ios directory unless explicitly opted into a backup; prefer this fresh worktree.

## Upload and install

The script builds and inspects an archive; it does not upload. In Xcode Organizer verify version/build 1.0.0 (19), bundle, signing team and no local StoreKit Configuration. Choose Distribute App → App Store Connect → Upload with the existing Mac signing/account session. Stop if App Store Connect reports build 19 is already used. No Apple credentials should be sent in chat.

Wait for Apple processing and resolve actual compliance prompts accurately, then add build 19 to the intended internal TestFlight group. No external review or tester invitations are sent automatically. Install over the existing app; do not uninstall or erase records. Keep the retired old test API stopped.

Installed acceptance: launch without Metro; Capture/Revisit; original family/history/media; email code delivery and Apple login; personal/family full-screen previews; existing purchase access/restore without paying twice; EPUB save/share to Books; ordinary-member restrictions; new-domain invitation QR/link and explicit joining; background/lock recovery; no PDF entry. Do not report Xcode-device acceptance as TestFlight-build acceptance.

## Verification status

10 local Node configuration/archive/native-patch regression tests passed, along with shell syntax and git diff checks. Existing installed dependencies from the prior worktree were reused. Baseline PR152's four CI workflows and user-reported physical-device acceptance passed before merge. This does not establish macOS archive/signing, Apple upload/processing, or installed TestFlight 19 acceptance; all remain pending execution on the Mac and iPhone. App Store Connect build-number occupancy was not readable from this environment.
