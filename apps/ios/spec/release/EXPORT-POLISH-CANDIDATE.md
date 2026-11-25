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
