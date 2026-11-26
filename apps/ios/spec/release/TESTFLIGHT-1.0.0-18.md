# TestFlight 1.0.0 (18)

Source baseline: main `5d39cdd46478aa10b4bb44fcef2e0a773ca7c60e`, including merged PR147–151. Release branch: `release/testflight-1.0.0-18`. Only the sandbox profile's default build number, its regression expectations and this release record change. No application behavior, website, database or server deployment changes.

## Configuration

- Version/build: 1.0.0 (18); bundle: app.lampy.ios; signing team: B283NY984J.
- Profile: testflight-sandbox; service: https://family-test.yunpura.com.
- Personal/family full-screen EPUB previews enabled; unified paid EPUB save/share enabled; product: lampyepubexport.
- PDF disabled; account diagnostics/test-driver disabled. Android purchase/export gates unchanged.
- StoreKit Configuration: None. Use Apple's TestFlight Sandbox transactions, not the local design-test StoreKit fixture.

## Mac archive and upload

Use a fresh worktree to avoid overwriting native project edits or a worktree holding main. Run commands individually and stop on errors:

```bash
cd /Users/zhen/WeChatProjects/lampy-ui-e9daad5
git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 fetch origin
git worktree add --detach /Users/zhen/WeChatProjects/lampy-testflight-18 origin/release/testflight-1.0.0-18
cd /Users/zhen/WeChatProjects/lampy-testflight-18/apps/ios
npm ci
LAMPY_BUILD_NUMBER=18 LAMPY_ARCHIVE_OUT="$HOME/Desktop/Lampy-TestFlight-1.0.0-18" bash scripts/release-archive.sh --testflight-sandbox
open "$HOME/Desktop/Lampy-TestFlight-1.0.0-18/Lampy.xcarchive"
```

The existing script prepares, signs, archives and inspects the archive; it does not upload. It refuses to overwrite an existing generated ios/ directory without explicit backup opt-in. Do not use that override merely to bypass an error.

In Xcode Organizer verify version 1.0.0, build 18, bundle and signing team. Select Distribute App → App Store Connect → Upload. Use existing Xcode Apple account/signing credentials on the Mac; do not share credentials in chat. If build 18 is already used, stop and select another build number rather than uploading a mismatched archive.

After successful upload, wait for Apple processing in App Store Connect → Lampy → TestFlight. Resolve any actual compliance prompts accurately, then select the intended internal testing group. External review/tester invitations are not automatically authorized by this release preparation.

## Acceptance

Install over the existing app without deleting records. Check offline launch without Metro; Capture/Revisit; Recent/Revisit/Family/Albums navigation; unified personal/family album UI and photo loading; free preview; Sandbox account-bound purchase/restore and purchase-history entry; EPUB save/share; member-only preview restrictions; invitation QR save/link input/explicit join; managed-family deletion protection; background/lock recovery; no PDF entry.

Prior user iPhone acceptance for PR147–151 is recorded in the PRs. The merged main build and TestFlight 18 itself still require installed acceptance. Full deletion after family transfer/dissolution and Android gallery acceptance remain deferred; do not mark them as passed.

## Verification and status

Linux configuration/archive/native patch regression checks: 10 tests passed, using the existing installed dependencies from the prior worktree; shell syntax and git diff checks passed. No macOS compiler/signing or Apple upload session is available in the execution environment. Archive creation, App Store Connect upload/processing and installed TestFlight acceptance are **pending**, not completed by publishing this release branch.
