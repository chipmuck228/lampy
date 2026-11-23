# iOS launch — stage 2: everyday UI and copy

Branch: `release/ios-ui-polish`, based on stage 1 (`release/ios-launch-foundation`). Review this as a stacked PR. Merge stage 1 before retargeting/merging stage 2 to main. No server deployment, data migration, permission expansion or dependency upgrade is introduced.

## Presentation rules

- Keep warm paper, ink and sage. Avoid adding dashboard cards or large explanatory panels.
- Place a persistent label above a writing surface. A placeholder supplements the label rather than replacing it. Show focus with a stronger lower edge; preserve keyboard type, autofill, character limits and disabled state.
- Give the current confirmation a filled action. Resend and alternate actions are quieter. Separate account exit/deletion from ordinary account management, retaining the destructive confirmation.
- Keep privacy, linking and deletion consequences visible. Do not remove required disclosures merely to shorten a screen.
- Keep identifiers, response codes and diagnostic timings out of normal user pages, including ordinary Debug device builds. An explicit diagnostics opt-in remains available.

## Route audit and changes

| Page group | Result |
| --- | --- |
| Settings and all SettingsPage-based routes | Long navigation titles can wrap; back targets remain at least 48 points high. Article hierarchy and top spacing tightened without removing paragraphs. |
| Email login, registration, verification, email change and deletion | Labeled writing surfaces, focused state, clear primary action, quiet resend/alternate actions, separate account exit/deletion area. Existing delivery/limit timers, owner guards and deletion callbacks retained. |
| Apple login/profile and controlled test account | Same labeled inputs; deletion is visually secondary with a destructive label, while confirmation remains unchanged. Test-only content remains gated. |
| Family directory/create | Labeled family name; create/join actions can wrap on narrow widths. Normal failure states hide diagnostic dumps unless explicitly enabled. |
| Family invitation | Labeled invite input; existing preview, sign-in, confirmation and expiry checks retained. |
| New personal/family album | Shared labeled album name and clear creation action, with spacing between the writing surface and confirmation. |
| Album editing | Existing labeled name/opening editor retained; its visible save controls and focus states already cover this need. |
| Family library, reading and paper preview | Simpler refresh/access-change copy; explicit opt-in diagnostics only in the normal library/editor pages. Refresh/lease/access safeguards retained. |
| Personal export page | Keep the previously accepted book presentation. Simplify purchase-check copy. No EPUB/PDF rendering or decoration changes here. |
| Family export/purchase status | Replace some technical eligibility/check wording with ordinary export/purchase wording. Existing availability and purchase guards retained. |
| Purchase explanation | Launch build describes personal exports, price confirmation and where to purchase/restore. Older closed profiles retain their closed-scope explanation. |
| Recent, Revisit, compose, record detail and reading | Existing editorial layouts retained. Regression checks cover these routes; this is not a claim that every page received a new design. |
| Privacy/terms/help | Preserve stage 1 Chinese/English disclosures. Improve shared article spacing; do not collapse essential notices behind an optional control. |

## Validation and limits

The UI code is rendered and exercised by React Native component tests. The acceptance environment could bundle a web component preview but could not start Chromium due to a prohibited socket operation. No screenshot, browser layout, iOS simulator or device visual check is claimed.

Two existing screen tests were updated to match the current navigation (including Life albums and narrow four-item grid) and the current collected-album accessibility label. Product navigation and collection behavior were not changed to satisfy these tests.

Keep this PR in draft until visual acceptance. In particular, validate a compact iPhone, normal portrait, landscape and iPad, in both Chinese and English. The app's pre-existing fixed font scaling policy is unchanged.

## Device checklist

Use the existing test account/backend and the same development build environment used for stage 1. Pull this branch rather than main. Do not uninstall Lampy just to update the build; preserve your local records.

1. Settings: long page titles, return navigation, privacy/help article headings and account nickname remain readable.
2. Email: empty login, code sent, wrong code, expired code and rate limiting. Input labels remain visible while typing. Verify keyboard/autofill, scroll to confirmation, and ensure no fake resend timer starts on failure.
3. First registration: default nickname, editable input, one-time nickname notice, successful return.
4. Email change and deletion: account owner and sessions stay correct; destructive confirmation remains; successful deletion returns to Settings with personal records retained.
5. Family: create/cancel, paste an invite and preview before accepting. Creation/join actions must fit or wrap on a narrow screen. No diagnostic code/timing appears unless explicitly enabled.
6. Albums: create, create-and-collect, retry a failed collect without creating a duplicate, edit name/opening, read and resume after restart.
7. Export: purchase-state feedback, EPUB/PDF selection, saved editions and system save/share controls. Generated file design belongs to stage 3.
8. Repeat with keyboard open, horizontal rotation, small phone width and English. Confirm inputs/buttons are reachable and labels are not clipped. This is the outstanding visual acceptance step.

For a test-backend native workspace on macOS, from this branch's `apps/ios` directory:

```bash
npm ci
export LAMPY_BUILD_NUMBER=21
export LAMPY_EMAIL_CODE_RELEASE_URL=https://family-test.yunpura.com
bash scripts/release-archive.sh --family-internal --prepare
open ios/Lampy.xcworkspace
```

`21` is only a local example; choose a higher unused build number if archiving/uploading later. This command preserves the internal profile's closed purchase/export scope. To review the full production candidate and its purchase explanation, use stage 1's `--appstore-launch` instructions with the configured real product ID; a test-backend preview is not production or Sandbox purchase validation. There is no upload in this preparation command.


## Device-feedback follow-up: simpler account controls

- Remove proactive Apple linking from signed-in profile screens. Keep Apple sign-in and existing backend identities, including Apple reauthentication for deletion. This does not enable iCloud backup or split existing accounts.
- Keep one “Change email” entry. If fresh authentication is required, send a code to the session's current verified mailbox; display only its masked address. Then ask for the new address and verify it. A recent login can satisfy the existing five-minute authentication requirement.
- Email-only deletion likewise uses the current verified mailbox without retyping. Server-side recipient resolution, session/purpose binding, Apple-linked deletion guards, delivery/attempt limits and cleanup remain authoritative. Old clients supplying the matching address remain supported; mismatched recipients are rejected.
- Backend and app must both be updated for these flows; deploy the API before the app. No schema, dependencies or SMTP configuration changes are needed. The deployed PR141 API does not yet support omitting the current address.
- Device acceptance: no Apple-link action after email login; old linked Apple sign-in still returns to the same account; change-email flow has no current-address input; new email verified once; another device's old session expires; pure-email deletion sends to the current address, returns to settings and clears countdowns; limit failures do not imply delivery. Apple-linked deletion still uses fresh Apple authentication and supports cancellation.


## Settings navigation and safety-page follow-up

Audited every settings destination: Login and recovery, Records and storage, My life albums, Blocking and reports, Subscribe and payments (when enabled), Help, About Lampy, Terms and Privacy. Titles match menu labels. Device protection remains an inline control. Existing storage/help/about/legal/subscription headers already matched and retain their existing settings return labels; the album title already uses My life albums.

The account entry now consistently reads Login and recovery, with the nickname as secondary text. The email screen's visible back label is Local settings when opened there; family-invitation login retains Back to match its actual navigation. Blocking and reports now uses the same title as its menu, with separate blocked-member rows, direct per-person unblock actions with confirmation, report progress and a support action. Remove developer/process explanations and chip-selection instructions. Keep privacy gating and coarse report metadata; do not reveal report IDs, record bodies or media. No server/dependency/schema changes.


## Temporary email-only development scope (merge decision)

There are no production users. Apple-only account management is deferred: normal and diagnostic native Apple sign-in entries are hidden by `appleLoginEntryOpen()` returning false. Existing server identities and fresh Apple deletion authorization remain intact; do not weaken deletion guards or remove bindings. Email sign-in, sign-out and deletion remain enabled. This is a development-stage merge, not approval to publish the launch profile. Before reopening Apple sign-in, implement a unified summary for Apple-only accounts with optional email linking plus sign-out and Apple-authenticated deletion, and verify it on device. Apple flow unit tests remain for that work. No API deployment is needed for this UI gate.
