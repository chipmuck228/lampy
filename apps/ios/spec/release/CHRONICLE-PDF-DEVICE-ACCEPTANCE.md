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
- New PDF: landscape 4:3 (600 × 450 pt), using the same Chronicle XHTML/CSS as Photo journal EPUB. Compare cover, opening, date, single-photo triptych, staggered pairs, compact three-photo wall, overlays, long prose and final Lampy ending side by side. No old moment/photo-count colophon.
- Chinese writing prefers Kaiti, Latin typography follows the shared CSS, body ink matches the date numeral. Verify enlarged first grapheme, margin quotes, ending rule and all writing, including Unicode/emoji/CRLF and long words. Check selection/search in the final PDF.
- Before PDF composition, local ImageIO creates orientation-normalized JPEG derivatives (long edge ≤1600 px, quality .82, no enlargement); author originals and frozen media are unchanged. Record actual PDF bytes for the reported 13-moment/~30-photo album. No measured iPhone size reduction has been established yet. Native renderer refuses an over-budget result instead of publishing it.
- PDF contains a static sound notice in place of audio controls. Audio playback remains EPUB-only. Formal export no longer offers the obsolete A5 preview.
- EPUB: tap each image to open an uncropped, contain-fitted image on the same page; tap 返回正文 / Back to reading to close. Verify all three wall photos, both overlapping pair frames and fallback pages. Try swiping/pinching: control handlers consume taps only. The last reading page must remain the Lampy ending, with no appended full-image pages.
- Generate NEW PDF and EPUB editions. Historical saved files remain unchanged.

## Evidence limits

The shared composer and touch/click handlers have automated coverage; generated scripted EPUB passes EPUBCheck 5.4.0 with zero errors/warnings. TypeScript and scoped ESLint are checked. These checks are not Apple Books gesture tests or native WebKit/PDFKit execution. This Linux environment has no Xcode/iOS SDK: Swift compilation, real-device font/text extraction, actual PDF bytes and memory, visual comparison, and Apple Books open/return remain pending. The prior static A5 proof is historical and must not be used to accept the new shared 4:3 renderer.
