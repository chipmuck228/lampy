# TestFlight 1.0.0 (21)

Source: main 3fcbc283cfc8b42a05d5e851d9a7727964eda435 (PR153 merged).
Release branch: release/testflight-1.0.0-21.
Only this release document is added to the source snapshot. Application behavior is exactly the merged main source.

## Status

PREPARED; NOT ARCHIVED; NOT UPLOADED.
The current executor is Linux without Xcode or Apple signing. Do not report this as an IPA or App Store Connect upload.
Local checks passed: 7 Node tests covering testflight-sandbox configuration/archive inspection; release shell syntax; actual resolved app.config version=1.0.0, build=21, API/product/profile/unified flags. Base PR153 had all four CI workflows passing, including 187 Album overview tests.
Availability of build number 21 in App Store Connect has not been independently checked. The user reported 20 as the installed/latest test version.

## Release configuration

- Profile: testflight-sandbox
- Version/build: 1.0.0 (21), supplied explicitly by LAMPY_BUILD_NUMBER=21
- Bundle/team: app.lampy.ios / B283NY984J
- API and account API: https://lampy-api.5sparks.ai
- Product: lampyepubexport; unified personal/creator-owned family entitlement
- Free personal/family full-screen EPUB preview, paid EPUB save/share; PDF entry disabled
- Email login and family entry enabled; diagnostics/test-driver disabled
- No local StoreKit fixture. TestFlight uses Apple Sandbox.
- No backend deployment or database migration.

## Mac archive

Run each command separately and stop on errors. Create a fresh worktree; do not overwrite an existing directory or uninstall Lampy.

```bash
cd /Users/zhen/WeChatProjects/lampy-ui-e9daad5
git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 fetch origin
git worktree add --detach /Users/zhen/WeChatProjects/lampy-testflight-21 origin/release/testflight-1.0.0-21
cd /Users/zhen/WeChatProjects/lampy-testflight-21
git log -1 --oneline
cd apps/ios
npm ci
LAMPY_BUILD_NUMBER=21 LAMPY_ARCHIVE_OUT="$HOME/Desktop/Lampy-TestFlight-1.0.0-21" bash scripts/release-archive.sh --testflight-sandbox
open "$HOME/Desktop/Lampy-TestFlight-1.0.0-21/Lampy.xcarchive"
```

The archive script refuses an existing generated ios directory to protect native edits. A fresh worktree avoids that. It archives and inspects the archive but DOES NOT upload it. Confirm ARCHIVE SUCCEEDED and inspect_exit=0 in archive-report.txt.

## Upload and acceptance

In Xcode Organizer select Lampy 1.0.0 (21) → Distribute App → App Store Connect → Upload. Confirm the correct team and bundle. Resolve signing locally; never share passwords, private keys or codes in chat. Do not select TestFlight Internal Only if external testing is intended.
After Apple processing, answer export-compliance questions accurately and select build 21 for the intended existing internal group. No external Beta App Review or new tester invitation is authorized by this document.
Install over existing Lampy, preserving records.

Check iPad portrait/landscape shared page frames and Capture action alignment; fast year/month/day selection and draft persistence; Settings purchase button consistent with Electronic album; free preview, valid Sandbox purchase/restore and EPUB save/share, ordinary-family-member permissions, audio/image/full-screen interactions, and offline launch without Metro. Confirm PDF remains closed.

## Open issue retained

Old Sandbox purchase history / Lampy account binding remains UNRESOLVED. A new Sandbox tester completed purchase/unlock in build 20 for the same Lampy account; the older tester had a November 25 purchase record and generic failure. This does not identify the exact cause or fix old-account restore. Keep old history for diagnosis. No entitlement reassignment or verification bypass is included in build 21.
M4A/MP3 file import remains a separate task.
