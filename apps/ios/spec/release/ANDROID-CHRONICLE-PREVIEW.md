# Android Chronicle / family preview

Branch based on main 4b50008 (family EPUB PR145 included). Android now has the personal and family Chronicle preview, family account/login/invites, family shared photos/audio and the existing Capture/Revisit/album-management flows. It does not offer purchases, subscriptions, PDF, EPUB save/share, or completed-edition management. Sharing a moment into a family is still supported; that is separate from exporting an album.

## Build and install

Android Studio / JDK 21, Android SDK platform 36, build-tools 36.0.0 and a USB-debug-enabled Android device are required. From apps/ios:

```bash
npm ci
npm run android:preview:prebuild
npm run android:preview:release
```

`release` embeds the Android JavaScript bundle, so the test phone does not need Metro. For an installable arm64 internal-test APK without a connected phone:

```bash
npm run android:preview:apk
```

Output: `android/app/build/outputs/apk/release/app-release.apk`. This uses the generated development signing setup and is not a Play Store release. Install over a matching signed existing test build; do not uninstall or clear storage to resolve a signature mismatch, because that would remove local records. The GitHub “Android Chronicle preview” workflow produces the same APK artifact after tests and native build pass.

The older `android:prebuild`/`android:release` personal-only profile stays available for baseline regression; use the `android:preview:*` commands for this PR. Both profiles force purchases and exports off even if inherited shell variables enable iOS purchases. No Google Play billing dependency/product is added. No backend deployment or schema migration is needed.

## Backend / accounts

This is an internal preview connected to `https://family-test.yunpura.com`; email verification is the Android login entry, including return to the original family/invitation. No Apple ID native login is offered on Android. Existing signed-in sessions and server membership/safety/withdrawal checks are reused. Test email delivery and two-account family flows on real devices; local tests do not certify the running server. Recording retains the existing free per-segment limit; this change does not grant or simulate an Apple purchase.

## Native implementation

Chronicle uses the same publication generator as iOS. Android's WebView can read only the active private cache root. All resource requests are intercepted; network/file/content navigation, downloads, popups, permission prompts and file picking are blocked. JavaScript is limited by CSP to the bundled photo viewer; no JS/native bridge exists. Background/detach clears the native document and stops audio; the React layer recreates and revalidates caches. Audio byte ranges support seeking. The 4:3 page fits within portrait and landscape layouts, with next/previous buttons and horizontal swipes. System Android serif/CJK fallback is used; Apple fonts are not redistributed.

Preview photo derivatives apply orientation, bound the longest edge to 1600px and do not upscale tiny pictures. Family uploads use independent orientation-normalized, metadata-stripped copies (2304px max, 8MiB upload max), never original bytes as a fallback. Unsupported/corrupt input fails safely. Launcher shortcuts reuse the existing one-use Capture dispatch and lock gate; they carry no moment/album data. “Share Lampy” shares only the public introduction URL, never an album.

## Acceptance on an Android phone

- Capture: text, camera, picker (up to 3 photos), sound, draft recovery, permissions declined/retry, no record loss after background/relaunch.
- Revisit / album management: date lookup, collect/remove/reorder, cover/opening edits, grid summary and continuous reading.
- Personal Chronicle: cover/date/opening, 1/2/3 photos with short/long text, tiny/panorama/portrait fallbacks, photo expand/return, audio play/pause/seek, ending page, rotation and font fallback.
- Family: email sign-in/out, profile, create/join by invitation, choose members, share/withdraw, membership changes and account deletion entry; two-account photos/audio and family album creation/organization.
- Family Chronicle: same layout, author attribution, free member preview, no creator/member export button, no purchase/restore controls.
- Privacy: locking/background/back stops audio and clears/hides the preview; changed account, removal or withdrawal prevents late content from reappearing; no public URLs or private device files can be opened by a preview.
- Closed capabilities: no purchase/subscription/save/share-export UI, no album print/export routes by deep link, no native exporter, no billing permission.
- iOS regression: accepted personal/family preview and paid EPUB remain intact.

Device-specific permission dialogs, WebView rendering/audio, camera orientation/HEIF decoding, launcher delivery and real two-account withdrawal must be recorded as device acceptance; automated builds do not replace them.
