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

## Final text-validation regression (after f50e524)

Device feedback: EPUB image open/return passed. PDF fails near completion; the provided ExtensionKit termination message alone does not identify the export failure stage.

Code review found a deterministic final-validation bug: each page's DOM text checks and source title/note checks were flattened into one consuming search sequence. These are overlapping observations of the same printed text. A title rendered once was therefore required twice, and positioned text could be forced into DOM order even when PDF spatial extraction differed. Keep independent checks separate; preserve segment order within each individual source check and reject missing text. Single-page and final merged-PDF checks now use the same independent semantics. Do not bypass the validation.

On the Mac, run the actual production Foundation-only Swift matcher regression before building:

```bash
bash apps/ios/scripts/check-chronicle-pdf-text.sh
```

Expected output: `CHRONICLE_PDF_TEXT_CHECKS_OK: 15 production Swift cases`. The script extracts the actual matching functions from AlbumPrint.swift (no separate implementation). Swift/Xcode are unavailable in the Linux environment, so these native cases have not been executed there.

Rebuild in Xcode and create a new PDF. Confirm completion, text search, actual file size, same Chronicle layout/ending, then revisit EPUB open/return. If export still fails, filter Xcode logs for `[LampyPrint]`: native output reports controlled stage/page/code; the JS service reports controlled stage/code/reason. Neither includes writing, photos, album identifiers or file paths. Keep the branch draft until iPhone PDF acceptance passes.

## Page-two text extraction feedback (after 6399c52)

The device now identifies `CHECK_PAGE_TEXT / page=2 / PDF_TEXT`, before the final merge. The second page is the opening. This evidence identifies the failing stage but not the individual text check. Do not infer that ExtensionKit cleanup logs caused the failure.

The inspection had included explicitly aria-hidden ornamental quote glyphs in searchable text checks. It now still checks their geometry, while excluding their text from search validation. User quotes inside opening words or moment writing remain required. Compatibility normalization for PDF comparison accepts presentation ligatures such as `ﬁ`/`fi` and discretionary invisible line-break marks; it never rewrites the source or PDF, drops visible hyphens, or accepts missing letters. Independent run checks and source checks remain active on both raw pages and the merged result.

On another mismatch native diagnostics now add `check`, controlled `kind` (opening/philosophy/writing/imprint/source), and expected/extracted scalar counts. No text or file path is logged. Native Swift matching cases have expanded to 15; the two new DOM tests execute the exact inspection JavaScript extracted from AlbumPrint.swift. They validate semantic/decorative selection, not PDFKit extraction. Run the Mac Swift script, rebuild, and export a NEW PDF. The exact device mismatch and resulting size remain pending device verification.

## Mixed-font short writing feedback (after 7b61b0a)

The device advances to page 17 and reports `kind=writing expected=13 extracted=13`. The user identifies a 13-character CJK/Latin mixed short note. Equal length alone is not evidence of complete/correct text; neither the actual extracted string nor its glyph mapping was supplied. Do not claim the precise cause is established.

The normal string check remains first. On mismatch, reconstruct text from PDFKit character bounds within the DOM text/source region, group horizontal lines, and order actual characters left-to-right. Compare the reconstructed string with the source using the same strict checks. Do not rearrange characters to fit the source or accept an unordered character inventory. Missing/substituted characters and incorrect visible order still fail. The same adapter validates the final merged PDF, with viewport-to-media-box coordinate conversion.

DOM inspection now supplies aligned text/source regions. Diagnostic `sameCharacters=yes/no` only classifies a failure; it is never an acceptance condition and logs no writing. The Mac check script now extracts the actual production spatial helpers and PDFKit adapter, tests mixed font-run order, wrapping, punctuation, missing/replaced glyphs and incorrect visible order, and creates synthetic CoreText PDFs. The synthetic text is not the user's original note.

Expected Mac script output: `CHRONICLE_PDF_TEXT_CHECKS_OK: 24 production Swift/PDFKit cases`. This is not a WebKit/iPhone export test. Swift/PDFKit are unavailable in this Linux environment; these native checks and real-device export remain unverified here. Run the Mac script before another device build. Do not merge before an iPhone PDF succeeds and its size/layout/search are checked.

## Confirmed synthetic PDFKit boundary failure (after 574d36a)

Mac diagnostics show an out-of-order raw string and malformed negative stored widths, including a Latin terminal character and two initial CJK characters. The previous per-character guard inspected standardized CGRect.width/height, inadvertently accepting negative stored widths. Union/minX then moved the last Latin character before its word. This is an observed failure in the test adapter, not evidence of missing source text.

Read stored size.width/height to reject malformed anchors. A second spatial path preserves the internal text order of whitespace-delimited extracted blocks and positions each block using only its valid positive character bounds. Every character remains in the comparison; an entirely unanchored block fails closed. Blocks are never ordered using expected text or an unordered character inventory. Both raw-page and final-merged checks use this adapter. Missing/replaced text remains rejected.

The script replays the exact measured coordinates of the synthetic sample, with additional missing/replaced/unanchored negative cases. It now has 25 pure matching/spatial cases and three real CoreText/PDFKit cases. Expected final output is `CHRONICLE_PDF_TEXT_CHECKS_OK: 28 production Swift/PDFKit cases`. Mac execution of this revision and subsequent iPhone export remain required. Do not install again until the script passes; diagnostic output remains available if it fails. No original Album text is embedded in tests.

## Device character-map mismatch after Mac matcher acceptance

The user's Mac passed all 28 CoreText/PDFKit cases, but the iPhone WebKit export still rejects page 17 with `sameCharacters=no`, expected/extracted lengths both 13. This is not established as an ordering-only problem. The existing CoreText sample is not a WebKit rendering test. Do not weaken text equality or declare the original issue resolved.

The optional `--webkit` mode of check-chronicle-pdf-text.sh now tests the actual WKWebView.createPDF API with current pair typography CSS read from source, then Kaiti-first and Songti-first diagnostic alternatives. It uses the same production matching/PDFKit adapter. It prints WEBKIT_CASE, WEBKIT_RAW, WEBKIT_DIFF (missing/extra Unicode scalar counts) and WEBKIT_FONTS for inline test text. Default text is synthetic; LAMPY_PDF_PROBE_TEXT explicitly supplies one local test sentence. It reads no Album or media. No production font change is included.

```bash
LAMPY_PDF_PROBE_TEXT='自选的一句中英文混排文字' bash apps/ios/scripts/check-chronicle-pdf-text.sh --webkit
```

Run from the repository root on a Mac desktop session. After the unchanged 28 CoreText cases, it compares three WebKit cases. The current-font case controls the final exit status; the alternatives are diagnostics only. Timeout/load failures return nonzero. Mac WebKit execution is pending; even a Mac success cannot prove identical iOS font fallback. Inspect these results before another device install. Raw probe text is printed only for the explicitly supplied/default test sentence; normal App diagnostics remain content-free.

## Mac WebKit passed; capture iPhone-only scalar difference

User results for --webkit: current Baskerville + STKaitiSC-Regular, Kaiti-first, and Songti-first all have exact=true, accepted=true with no normalized scalar differences. Songti's compatibility radical normalizes correctly. This does not reproduce the iPhone sameCharacters=no case. No font substitution or relaxed acceptance is justified by this evidence.

The next revision adds a native PDF_TEXT_DIFF error line in the existing local StoreKit design-test product only (`app.lampy.export.designtest`). It prints up to six unordered missing/extra Unicode scalar values per side and up to eight actual PDF font resource names. Unicode values identify the differing characters; this is character-level test diagnostics, not anonymous metadata. It does not print complete writing, Album identifiers or local file paths. Ordinary/unconfigured product exports do not enable it; explicit tests cover that gate. Native error summary reports diagnostics=yes/no.

Rebuild in Xcode with the existing design-test product/signing/StoreKit and export the same Album. Report [LampyPrint] PDF_TEXT_DIFF plus the stage line. Do not repeat Mac WebKit font comparisons. If diagnostics=no appears, check the local EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID configuration instead of repeatedly exporting. The export still fails safely until the actual iPhone character mismatch is understood. No rendering/font/layout acceptance change is included in this diagnostic revision.
