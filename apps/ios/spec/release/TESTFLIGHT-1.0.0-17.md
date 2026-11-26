# TestFlight 1.0.0 (17)

Based on main 70e49c8. Explicit `testflight-sandbox` archive profile uses family-test.yunpura.com, email login, personal/family Chronicle preview, unified paid EPUB export with App Store product lampyepubexport, and no PDF entry. No local StoreKit fixture; Apple TestFlight purchases use Sandbox. This is a test-server beta, not a production-backend archive.

On the Mac, from a fresh checkout/worktree of release/testflight-1.0.0-17:

```bash
cd apps/ios
npm ci
LAMPY_BUILD_NUMBER=17 LAMPY_ARCHIVE_OUT="$HOME/Desktop/Lampy-TestFlight-1.0.0-17" bash scripts/release-archive.sh --testflight-sandbox
open "$HOME/Desktop/Lampy-TestFlight-1.0.0-17/Lampy.xcarchive"
```

The script refuses an existing generated ios directory rather than overwriting native edits. Prefer a fresh worktree. It archives and inspects metadata, signing team, embedded JS and native flags; it does not upload. Profile is persisted for independent Xcode Archive runs.

In Organizer choose Distribute App → App Store Connect → Upload (wording varies by Xcode; use the App Store Connect distribution method if external testing may follow). Bundle app.lampy.ios, team B283NY984J, version 1.0.0, build 17. If 17 has since been uploaded, set a new unused build number. Do not attach the local StoreKit file. Apple signing/authentication stays on the Mac. Do not send keys/passwords through chat.

Wait for Apple processing, resolve actual export-compliance questions, then add build 17 to the intended internal TestFlight group. No tester invitations or external Beta App Review are sent automatically. Install over the existing app, preserving records. Check offline launch without Metro, Capture/Revisit, personal/family preview, Sandbox purchase/restore, EPUB save/share, member free preview, no PDF entry. Do not treat archive metadata checks as installed TestFlight acceptance.

Validation in Linux: 13 Node configuration/archive/native-fix tests pass and shell syntax passes. macOS archive/signing/upload and TestFlight installation remain pending, requiring Xcode and the account on the Mac. No backend deployment or database migration.
