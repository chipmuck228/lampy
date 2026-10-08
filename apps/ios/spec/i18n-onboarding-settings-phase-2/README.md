# Chinese / English — phase 2

Depends on phase 1 (#88). This PR targets `ios/i18n-personal-phase-1` so its diff contains only phase 2. Retarget to the latest main after phase 1 is merged; do not merge the prerequisite automatically.

## Scope
- Three welcome pages: caption, complete heading accessibility label, authored heading lines, body, actions, progress and photo descriptions.
- Production Settings root and offline About, Storage, Help, Subscriptions, Terms and Privacy pages. Closed diagnostics page is translated; enabled development account diagnostics remain outside the English MVP.
- Existing native installed version/build, route destinations, app-lock behavior, drafts, recording and completion rules are unchanged.
- Source user content is never sent to `tr`. Album names, opening text and original moments are untouched.

## Typography and motion
Existing bundled welcome fonts are Chinese subsets lacking most ASCII letters. English uses iOS Georgia for welcome headings/photo captions and System for body/brand. It does not register Chinese font files under English system names. Chinese retains all three bundled fonts. No new remote fonts or requests.

Existing narrow copy column, wrapping, scroll measurements, photo/copy entrance qualification, native splash handoff, Reduce Motion and final-button-only completion are preserved. Fixed app font sizes remain in force. System font rendering and short-screen English overflow still require device verification.

## Notices
English translates the existing MVP candidate notices without inventing operator, contact, subscription or legal-review claims. The microphone notice in both languages now includes the already implemented long-press Capture path. Operator/contact/region, system-backup boundaries and dependency network behavior still require release review. Translation is not legal approval.

## Next
Phase 3 (album interface, native paper labels, locale-aware layout/cache) is not started. This is not a complete bilingual release and has not been uploaded to TestFlight.
