# Chronicle PDF and export polish device acceptance

PR #144 / release/album-export-polish. This branch includes the prior Chronicle work; it does not require merging either draft PR first. Keep both PRs unmerged during device acceptance.

## Install from the existing Mac device checkout

Preserve any local modifications before switching. If Git reports a conflict, use `git status --short` and retain the files; do not reset/clean the checkout. Existing StoreKit files and signing settings should remain in place. No new npm/Pod dependency or native filename was added in this update.

```bash
git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 fetch origin &&
git switch release/album-export-polish &&
git merge --ff-only origin/release/album-export-polish &&
git log -1 --oneline &&
open apps/ios/ios/Lampy.xcworkspace
```

In Xcode use Lampy / your iPhone / Release and the existing StoreKit configuration containing app.lampy.export.designtest. Build and run over the existing app without uninstalling. New Swift drawing code requires native recompilation; Metro refresh alone is insufficient. If the workspace does not exist, use the existing prepare-chronicle-device.sh workflow after preserving any StoreKit file stored inside generated ios/.

## Verify new editions

- Export page: no Life anthology selector. New EPUB creation always uses Photo journal; previously saved literary editions can still be shared.
- Create EPUB/PDF: calm progress bar and cancellation; no success shown for a failed/cancelled job. Existing-file sharing must not recreate the edition.
- Swipe saved EPUB and PDF rows: transparent share/delete icons and labels. Tap row shares the corresponding format. Delete still requires confirmation and never deletes the source moments.
- Lock/relaunch/background: Lampy / quiet private-life copy / Open Lampy; no private data exposed. Face ID/device-passcode behaviour unchanged.
- A5 PDF: single photos fully visible; two photos staggered without printed overlap; three photos use compact ratio-aware walls. Tiny, unknown and extreme dimensions use separate complete plates. Maximum remains three photos per moment.
- Short caption (<=2 measured lines) stays below its photos; long prose uses separate pages, max nine measured lines per page, initial enlargement, quotes, closing rule and breathing room. Test CJK, English, emoji, combining accents, paragraphs and long unbroken words.
- Check PDF text selection/search and source writing completeness, all images and sound markers once, native emoji validation and 100% print size. PDF contains sound information, not playable audio.
- Paper preview uses the same native measured layout as a new PDF. Source/style change or leaving the screen must discard stale preview work.
- Generate NEW PDF and EPUB editions. Historical saved files remain unchanged.

## Evidence limits

Linux validation covers TypeScript, lint, 157 focused tests, content/range integrity, image order/ratios, no box overlap and print bounds. The four-page static PDF proof uses the explicitly labelled glyph-width test double and WeasyPrint. It is not a native iPhone PDF and cannot establish Core Text font resolution, PDFKit selection or Xcode compilation. Record device model, iOS, app language, commit and failures/screenshots during native acceptance.
