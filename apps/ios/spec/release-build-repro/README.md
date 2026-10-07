# Reproducible native release builds (Xcode 26.3)

Base: main d76edf1 after #86. No personal functionality changes, no upload.

## Recorded incident
User's TestFlight 0.1.0 (4) terminated before JS: DYLD could not load
@rpath/React.framework/React referenced by ExpoModulesWorklets.framework.
The local fix disabled Expo precompiled modules, retained React prebuilt core,
and applied JSI + EventEmitter Swift compiler compatibility changes.
User reports Release startup/unlock/record/save/play PASS, Archive includes React,
and TestFlight 0.1.0 (5) download/start/run PASS. The locally edited build is not a
clean-checkout build of this PR; these are distinct evidence.

## Reproduction
Use a new worktree. `npm ci` runs version-checked native patches automatically.
`npm run native:patch` can be repeated. Patch mismatch or version drift is an error;
do not bypass it after upgrades. Requires git available on PATH.
The local Expo config plugin writes EXPO_USE_PRECOMPILED_MODULES=0 at the top of
the generated Podfile on every prebuild; it does not disable prebuilt React Core.
No global concurrency-check suppression or dependency version upgrades.

Set expo.version / expo.ios.buildNumber in app.json BEFORE generating ios/.
Build 5 is already occupied in Connect; choose the next unused number, not a
hardcoded value in this PR. `bash scripts/release-archive.sh` prepares Release,
stashes developer dotenv, applies patches and refuses replacement of existing ios/
unless its documented backup option is explicitly selected. Do not source scripts.
Manual Xcode builds should prebuild after changing version/build, and verify actual
Info.plist and Organizer metadata. Do not assume General CURRENT_PROJECT_VERSION
wins over a literal CFBundleVersion in the plist.

`bash scripts/release-archive.sh --inspect /path/to/Lampy.xcarchive` rejects wrong
bundle/version/build/team, missing bundle and missing non-system Mach-O dependencies.
The scanner checks main and nested Mach-O files, resolves standard Frameworks @rpath,
@loader_path and @executable_path references. Unsupported paths fail for review.
This is not codesign-chain, OS ABI, full LC_RPATH or actual runtime verification;
install and cold-launch the uploaded TestFlight build before distribution.

## Patch rationale
JSI patch is the complete file supplied by the user from the successful Xcode 26.3
build. Core 57.0.18 uses existing NonisolatedUnsafeWeakVar (@unchecked Sendable)
instead of capturing a weak non-Sendable emitter across JavaScriptActor. Only
withEventTarget is accessed inside the actor; module mutable state is not changed.
Both patches are pinned; reconsider/remove when upstream compiler support changes.

## Verification boundary
Node tool tests, actual clean dependency install / patch replay and static checks:
see PR results. Native clean-checkout prebuild/pod/Archive/TestFlight reproduction
of THIS branch remains NOT VERIFIED on Linux. Build 5 user report is not that check.
No ios/, node_modules, credentials, crash logs or private media are committed.

Checks run here: Node build-tool tests 7/7 (real package patch application,
idempotence, incompatible source rejection, version drift, missing React fixture,
embedded dependencies, otool failure); bash syntax; TypeScript and changed CJS lint.
The JSI patch bytes are preserved from the supplied file. This PR does not change
version/build to 5: it is already uploaded, and every new upload needs a fresh number.

Final Linux reproduction: clean npm ci applied BOTH patches; repeated native:patch
reported already patched. NODE_ENV=production expo prebuild --platform ios
--no-install completed and generated Podfile with the disable setting before
require/autolinking. This validates config generation only, not CocoaPods or Xcode.
