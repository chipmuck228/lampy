> Superseded PDF geometry: the A5 adaptation described below is historical. New production PDF uses the same 4:3 Chronicle XHTML/CSS as EPUB through native WebKit, prepared ≤1600px JPEGs and the shared Lampy ending. See CHRONICLE-PDF-DEVICE-ACCEPTANCE.md for current acceptance and evidence limits. The old A5 proof is not evidence for this renderer.

# Export polish and A5 print adaptation — 2026-11-25

Branch: release/album-export-polish; PR #144 targets the unmerged Chronicle branch. No merge or server deploy.

## Implementation

- New personal EPUBs use Photo journal only; historical literary files retain their saved bytes and sharing path.
- Callback-driven monotonic stage progress, quieter labels and accessible progress bars.
- Transparent share/delete icon actions; delete confirmation and disabled behaviour retained. Formal PDF rows share on tap and reveal share/delete on swipe. Developer PDF-to-EPUB controls remain only in the evaluation UI.
- Lock cover copy simplified; authentication/privacy state machine remains unchanged.
- Formal PDF preview reads current source and uses the same native measured layout as PDF export.
- A5 portrait print adaptation: separate moment pages, full-aspect single-photo plates, two-photo staggered non-overlapping composition, shared Chronicle three-photo wall geometry, safe independent plates for small/extreme/unknown dimensions. This is a print adaptation, not the landscape EPUB overlap/overlay design.
- Photos precede writing. A caption fitting at most two native measured lines stays below the photographs; long prose uses at most nine measured lines per block/page, 32pt leading, top/bottom breathing room, enlarged first grapheme, paired decorative quotes and a closing rule. Source text/ranges are unchanged; line layout reserves room for the large glyph. Larger glyph font usage is included in native font inspection.
- New print pages use warm paper and the Chronicle feeling stripe; printed feeling labels are replaced by the stripe. Existing saved PDFs and in-app continuous pagination are unchanged.

## Validation and remaining work

TypeScript, ESLint and 12 related suites / 157 tests pass in the execution environment. Automated integrity checks enforce complete text/ranges, each image/audio once, aspect ratios, printable bounds and no content-box overlap. Static proof uses an explicitly labelled glyph-width test double and a non-native PDF renderer. It does not validate iOS font resolution or native selectable-text extraction.

Xcode/iPhone compilation, native PDF text/emoji checks, printing and Books controls remain device acceptance. Rebuild native code for the new initial/decoration drawing; do not validate only with a Metro reload. Create NEW PDF/EPUB editions. Keep draft until those checks complete.

## Static proof

`LAMPY_PRINT_PROOF_OUTPUT=/tmp/lampy-print-proof.json npx jest --runInBand src/application/album-publication.test.ts`

`python3 scripts/render-chronicle-print-proof.py /tmp/lampy-print-proof.json OUTPUT_DIR`

Python/WeasyPrint/PyMuPDF/Pillow are development-only proof dependencies, not app dependencies.

## Chinese moment body typography

Moment prose and captions now prefer system Kaiti. EPUB body selectors keep the refined Latin font stack and add Kaiti SC / STKaiti / KaiTi before Songti for CJK fallback. Cover, opening and date typography are retained. Readers without a usable Kai face fall back; no font asset is bundled.

For Chinese-containing moment notes in new PDFs (regardless of app language), native font diagnosis requests Kaiti SC and records the actual body face in rendering.bodySerif plus the request in bodyFontRequest. Native resolution searches installed Kai faces, then reports Songti/system fallback honestly. The resolved body face drives measurement, short-caption capacity, enlarged-initial drawing and PDF text/font inspection. Cover/date/UI and in-app continuous reading keep their existing font policy. Font availability, actual Books appearance and native PDF selection require a rebuilt device test.


## Shared date/moment ink

Moment writing now uses the date numeral's deep teal #105f62 across Chronicle EPUB single/pair/three-photo captions, standalone prose and generic/daily-note paths. PDF rendering carries the same bodyColor for note text and enlarged initials; metadata and static proof renderer use that ink too. Date layout, cover/opening typography, feeling gradients, ornaments and the main in-app moment screen remain unchanged. New exports only.


## Closing-page navigation correction

Complete-image views now live in a hidden `aside` at the root of their originating fixed page. Photo links target a same-document fragment; CSS `:target` displays the complete image above the composition, outside rotated photo frames. The return link restores the originating photo fragment and hides the view. No scripts, additional spine documents or duplicated media resources are introduced. The physical spine now ends at archive, even in readers that previously exposed non-linear documents.

The earlier `linear=no` hint could not enforce hiding auxiliary pages: EPUB 3.3 explicitly permits reading systems to show non-linear content in sequence or at the end (https://www.w3.org/TR/epub-33/). Source/return anchors, default/open/closed CSS states and the final physical spine item are regression-tested. Native Books anchor/view behaviour still needs device acceptance. Generate a NEW EPUB; historical files remain unchanged.

Validation for the closing-page correction: 7 suites / 99 tests pass; TypeScript, scoped ESLint and diff checks pass. Chinese/English production fixture EPUBs pass EPUBCheck 5.4.0 with zero errors/warnings. Both physical spines end in archive; 36 photo-view links and all local fragment destinations were checked. Tests check default/open/closed computed CSS display states and ensure the view is outside transformed photo frames. These checks do not replace iPhone Books interaction acceptance.
