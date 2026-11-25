# Export polish candidate — 2026-11-25

Base: 058fc84. This candidate has NOT been compiled or tested: the execution environment was unavailable. Do not merge or replace the device-tested branch until validation completes.

## Source changes prepared

- New EPUB creation always uses imagebook (Photo journal); remove the design radio choices. Legacy saved files retain their original design and sharing paths.
- EPUB progress is driven by snapshot/media/package/write/verify/publish callbacks. Fraction is monotonic within a job and capped below completion; no timed fake progress. Existing PDF progress gets a quieter label and an accessible progress value.
- Revealed shelf actions use transparent paper, muted ink and SF/Material share/trash symbols, preserving confirmation and disabled states.
- Lock cover uses Lampy, a quiet lock symbol, a short private-life line and Open Lampy. Authentication/privacy state machine is unchanged.
- Chinese/English copy and affected screen expectations updated.

## Still outstanding

- TypeScript, lint, UI suites, screen snapshots and iPhone install.
- Recheck no progress regression when stages re-enter per media, no progress on failed/cancelled job, and no success before SHARE.
- Whole-row PDF sharing / consolidation is not changed in this candidate; legacy PDF-row actions remain.
- PDF composition redesign is NOT implemented. It must be done with native measured text, shared photo planning and the PDF renderer/integrity checks available. Preserve A5 print margins, source writing/emoji, aspect ratios, no missing media, non-playable sound markers and immutable historical files. Do not claim the current PDF equals Chronicle EPUB.
