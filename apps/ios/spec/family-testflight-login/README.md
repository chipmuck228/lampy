# Family internal TestFlight login and build profile

Independent slice after #104 merge 708fb8c. Internal testers only; no public registration, paid access, password recovery or account deletion added. Invited operator accounts are provisioned on the server. This PR does not deploy the server or upload an archive.

## Login

Normal personal release remains closed. Explicit internal marker plus the exact approved HTTPS API origin and both product gates permits email login and nickname editing without opening developer diagnostics. Availability must advertise publicTestLogin=true, controlledEmailAccounts=true and emailRegistration=false; missing/failed/mismatched health never opens the form. Registration requires explicit emailRegistration=true outside internal builds. Internal login has no registration or Apple/legacy fallback. Existing request generation, background cancellation, password clearing, invitation preservation and explicit confirmation remain in use. Login is not acceptance of an invitation. My profile also provides explicit confirmed sign-out using the existing local/session revocation path; a failed local pending-revoke write keeps identity visible, and an offline server revoke leaves an explanatory signed-out message.

## Mac preparation

Use a separate clean worktree. Pick a new build number greater than all builds already uploaded to App Store Connect; 8 in automated fixtures is illustrative, not a reserved upload number. Bundle app.lampy.ios / Team B283NY984J and app.json version remain unchanged.

IMPORTANT: main does not yet contain Xcode 26.3 compatibility PR #87 (ios/release-build-repro). This slice does not claim to fix its known Expo JSI/EventEmitter errors. Review/integrate that independent PR before real Xcode archive testing, or use a disposable device-test integration branch containing both. Do not clean an existing native folder that contains the user's only compatibility edits. No npm updates or audit fix are required by this profile.

From apps/ios (after dependencies and native compatibility are ready):

```bash
LAMPY_BUILD_NUMBER=YOUR_NEW_NUMBER bash scripts/release-archive.sh --family-internal --prepare
open ios/Lampy.xcworkspace
```

Choose Lampy, Release, and a real device to test. For archive choose Any iOS Device (arm64). Generated ios/.xcode.env.local contains non-secret profile flags for the later manual Xcode bundle step, with Expo dotenv loading disabled. Do not point this internal profile at a local server. The linked invite-domain plugin uses the approved HTTPS origin to generate associated domains. AASA/public invitation-link behavior still requires device verification.

If ios/ already exists, preparation refuses to replace it. Back it up or use LAMPY_ALLOW_PREBUILD_CLEAN=1 only in this disposable worktree (script copies it before clean). The source .env.production stays closed; shell flags and local dotenv do not reopen ordinary archives. Normal archive script clears the internal marker/profile and regenerates native config. Never reuse a generated internal native project to upload a personal archive without regenerating it.

Direct archive, without upload:

```bash
LAMPY_BUILD_NUMBER=YOUR_NEW_NUMBER bash scripts/release-archive.sh --family-internal
LAMPY_BUILD_NUMBER=YOUR_NEW_NUMBER bash scripts/release-archive.sh --family-internal --inspect /path/to/Lampy.xcarchive
```

Inspector checks bundle/version/build/team, JS bundle, internal Info.plist marker, exact API origin and signed associated-domain entitlement. It is not runtime flag or Metro-independent evidence. Existing dependency inspection limitations remain. User must check generated/archive version/build in Xcode and install the Release/TestFlight binary before accepting it. No passwords/tokens belong in env, source, archive report or PR.

## Before internal distribution

The isolated service was updated to #104 merge 708fb8c on 2026-10-11; startup/health and both account login/profile smoke passed by user report (see WALK). Earlier advanced acceptance belongs to 0883b4c; the new timeout/method corrections have automated regression evidence, not new public adversarial/concurrency acceptance. Check API runtime dependencies separately; the previous full npm inventory includes app/development dependencies and is not a runtime audit. Keep registration closed. Updated privacy information for test family uploads and the invitation webpage/download instructions must be reviewed before giving the build to testers. This PR alone is not a distribution approval.

## Profile placement update (2026-10-11)

Settings now embeds Profile (我的资料): default avatar, nickname input, explicit
Save nickname, and confirmed Sign out. No profile-page navigation is required.
Signed-out settings offers Login; completing/cancelling this login returns to
Settings. The family directory no longer links to Profile. Old /family-profile
links redirect to /account. Invitation login continues to use its existing
return and explicit join confirmation. Personal release gates remain closed.
Network failures stay failures with retry, not a signed-out state.

The earlier eight-item physical-device Release acceptance was user-reported
before this placement update, with runtime SHA/build not supplied; it does not
verify this new UI. Recheck inline save, confirmed logout/login, keyboard scroll,
protection, Chinese/English, and invitation return on the updated Release build.
