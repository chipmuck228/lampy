# iOS Home Screen Quick Actions

Related: issue #85. Baseline: main `98ba119` (localization phases 1–3 merged).

Four static iOS shortcuts are shipped in `UIApplicationShortcutItems`, localized through `InfoPlist.strings`:

| Action | English | Result |
|---|---|---|
| 写一句 | Write a line | Restore the draft, then focus its text input. |
| 拍一张 | Take a photo | Restore the draft, then open the existing camera path once. A draft with three photos stays intact. |
| 录一段 | Record a sound | Restore the draft, then use the existing recording path once. Existing sound is not replaced. |
| 分享 Lampy | Share Lampy | Open the system share sheet for `https://yunpura.com` only. No App Store link is invented. |

The last item shares the public introduction website; it does not distribute a TestFlight build or share private moments. iOS may separately offer its own Share App system item.

## Delivery and privacy

Local Expo module `lampy-quick-actions` registers an AppDelegate subscriber. Expo 57 forwards scene cold-launch shortcut delivery to that subscriber; legacy launch options and warm invocations are also accepted. The native mailbox contains only the latest allowlisted action and a generated request ID. Subscribe before consuming the mailbox; repeated JS delivery with the same request ID is ignored. No URI or `params.href` supplied externally is executed.

The root capture remains mounted during onboarding. Dispatch exists only after FirstRunGate exposes the navigator, and requires a ready navigator, active AppState and unlocked local protection. Onboarding completion skips its ordinary composer navigation when a shortcut is waiting, preventing two pushes. Authentication failure/cancellation or a subsequent background transition discards the queued action. A new explicit shortcut is needed to try again.

Composer actions use in-process, one-use tokens. An arbitrary deep link cannot open the camera or recorder. Draft hydration comes first. Leaving the route or entering background forgets unused tokens. The camera shortcut rechecks qualification after camera permission; recording uses the existing foreground, interruption and draft guards. Manual camera and the existing floating-button recording gesture retain their behavior.

The native module is optional in an old development binary: ordinary startup still works, but hot JS reload cannot install Home Screen shortcuts or their delegate. No additional npm dependency was added. The third-party quick-actions README lists SDK57/6.1.0 compatibility, but that package version was unavailable in the registry during implementation; the project uses its existing local Expo-module architecture instead.

## Mac installation (Xcode 26.3)

Use a separate worktree from this PR branch; do not uninstall or clear the existing personal library. Install dependencies and regenerate native configuration before rebuilding:

```sh
cd <this-worktree>/apps/ios
npm ci
npx expo prebuild --platform ios --no-install
cd ios
pod install
cd ..
open ios/Lampy.xcworkspace
```

Use scheme Lampy, bundle `app.lampy.ios`, team `B283NY984J`, and the desired device. Existing Xcode26.3 compatibility work is a separate PR (#87); apply that branch's configuration/patches in a disposable integration worktree if required. Keep both localization and compatibility plugins when resolving app.json. This PR neither copies nor merges #87 and does not bump the release build.

Home Screen menus require the rebuilt installation. Metro reload or a previous TestFlight build cannot prove this implementation. Generated `ios/`, node_modules and private data are not committed.
