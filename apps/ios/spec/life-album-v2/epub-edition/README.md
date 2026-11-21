# Personal electronic editions — EPUB 3

PR135 is stacked on `ios/album-export-showcase` (`fccabc0`). It remains draft until
native/device acceptance. Paid/export switches for the App Store profile remain closed.

## User flow

With local export access enabled and owned, personal album export offers **制作电子册
（含声音） / Create electronic album with audio**. No PDF, Core Text pagination or font
inspection is required for this action. The new edition freezes the selected records
and media, then creates an offline EPUB and opens the system share menu. Completed
electronic editions are listed independently and can be shared again after restart.
Existing PDF editions also retain their EPUB action, using that PDF's frozen content.
Creating a new EPUB requires current export rights; sharing an existing intact file does
not start a purchase or regenerate it. Original records/photos/audio and PDFs are unchanged.

Reflowable content includes cover, title page, original opening, linked contents,
consecutive month sections, original ordered text and photos, user-triggered embedded
audio, and a dated colophon. Unknown dates stay unknown; records are not regrouped or
rewritten. Plain/handmade styles use warm paper and restrained green accents. Reader
font/theme/controls remain reader-owned. No remote resources, scripts, source IDs or
private file paths appear in the publication. No Apple system font files are embedded.
This is a finished publication, not an importable library backup; external copies cannot
be recalled. Family EPUB and Google Play Books acceptance remain out of scope.

## Large-album foundation

- Media is no longer accumulated as JavaScript byte arrays, and the device path does
  not use `zipSync`. ZIP entries stream from disk in 64 KiB reads/writes with an
  incremental SHA-256 digest and an event-loop yield between chunks. Directory metadata
  and authored text still grow with entry count; memory is not claimed to be constant.
- Native ImageIO creates transformed thumbnails directly at up to 2048 pixels on the
  long edge, within an autorelease pool. HEIF/JPEG photos become JPEG at quality 0.82;
  PNG stays PNG for transparency. Full-resolution UIImages are not used in this path.
- Prepared pictures live in an owned work directory. Audio streams from the frozen
  copy and is never loaded whole in JS. Supported audio is M4A/MP4 container or MP3.
- Disk space is checked before copying/preparing and before ZIP writing. Mid-write
  failures close handles and clean owned work; originals and completed editions survive.
- The old 64 MiB package cap is removed. A conservative ZIP32 boundary below 2 GiB and
  60,000 entries remains; it is a format/safety guard, not a tested capacity promise.
  No yearly/multiyear device capacity is claimed until pressure tests pass.
- A new standalone snapshot reads the source again and verifies original media hashes
  before publication. Changes or lost access abort the edition. Interrupted new snapshots
  are discarded; completed files survive sharing errors and can be shared explicitly.

## Background, lock, navigation and cancellation

The policy is **stop, clean, and require an explicit new start**. There is no background
continuation, scheduled continuation or automatic share on return.

1. Existing screen foreground/lock/focus generations invalidate work permanently for
   that attempt; returning to active cannot make an old attempt valid again.
2. Each copy/conversion boundary and each archive chunk checks validity. A native image
   conversion already in progress may finish its single bounded task before cleanup;
   its late result cannot advance the archive or open a share sheet.
3. A cancel button is shown next to the current action. The operation stays owned until
   cleanup finishes, so a retry cannot race its old files.
4. ZIP output is written inside `.epub-work-*`; hashes and current rights are checked
   before final publication. A cancellation during publication rolls back incomplete output.
5. All opened readers/writers close on success, error and cancellation. Job ownership is
   released even if cleanup fails. Cleanup failures are explicit, not successful editions.
6. After process death there is no promised JS cleanup. On the next catalog/export access,
   abandoned standalone staging/unpublished snapshots are removed; the next access to a
   PDF-derived edition removes abandoned EPUB work. Active snapshots are excluded.
7. The native share method also rejects presentation while the application is not active.
   A deliberately opened share sheet may temporarily make the app inactive; completed files
   are retained, and no second sheet is opened automatically.

## Validation and limits

- TypeScript and changed-file ESLint pass. Seven targeted suites / 72 tests pass and cover standalone freezing, source
  changes, integrity, rights, low disk, chunk cancellation, late native image results,
  publication rollback, cleanup, retry, active snapshot protection and UI cancellation.
- A synthetic 70 MiB resource exercises chunked output beyond the former cap with reads
  no larger than 64 KiB. This is not a device memory or Apple Books performance measurement.
- Streamed photo/AAC EPUB: EPUBCheck 5.3.0 passes with 0 errors and 0 warnings.
- **Native iOS compilation is NOT VERIFIED here** (Linux has no Apple SDK). Apple Books
  import/layout/audio, HEIF orientation/PNG transparency, memory peaks, large real libraries,
  storage exhaustion and real lifecycle transitions still require Mac/device acceptance.
- PDF's existing renderer is not rewritten by this change. Users can avoid PDF work for
  electronic-only output. Family export and release-profile switches remain unchanged.

## Mac rebuild and device acceptance

This update adds native `prepareEpubImage`: **Metro reload alone is insufficient**.
In the dedicated PR135 worktree, run `npm ci` and `npx pod-install` from `apps/ios`,
open `ios/Lampy.xcworkspace`, keep the local StoreKit configuration selected, then Run
from Xcode to the simulator/device. Use the same `.pr135-env.sh` for Metro/Xcode.
Do not uninstall the app or clean its data.

- Test the new direct EPUB action before generating any PDF. It must not invoke PDF creation.
- Test a year-like ordered collection with long text, many portrait/landscape HEIF/JPEG/PNG
  pictures, transparent PNG, emoji and multiple audio clips. Import into Books and verify
  contents links, whole photos, orientation and offline playback. Repeat an existing PDF edition.
- At snapshot copying, image preparation, archive writing and verification, separately cancel,
  switch to another page, background and lock. Return: no automatic continuation or share.
  Retry explicitly: no busy deadlock, old completed files intact, original records unchanged.
- Force-kill during snapshot copy and archive output; restart and verify abandoned work is
  recovered without deleting completed files or another active job.
- Interrupt near final publication; incomplete versions must not appear as completed.
  Cancel or fail only the system share: the completed version remains shareable.
- Check progress counts and cancel responsiveness. Measure peak memory and elapsed time on
  an actual iPhone; compare small/medium/large photo sets and long audio. A simulated 70 MiB
  streaming test does not replace this acceptance.
- Deny new export access: no new electronic edition; existing intact EPUB/PDF remains usable.

## Reader typography revision

Device screenshots showed oversized headings, duplicate cover/title pages, a large
printed contents/end page and author paper color painted as content rectangles.
The updated design removes duplicate title/end pages and the printed contents page
(the EPUB navigation remains available in the reader). A single cover leads to the
optional original opening and compact month sections. Consecutive records in a month
share one XHTML so short entries can flow on the same reader page. Dates and feelings
share a quiet metadata line. Portrait photos are inset; consecutive compatible portrait
pairs may share a row without cropping. Text remains selectable and user-resizable.
Paper follows the reading application's theme rather than painting body backgrounds.
A compact colophon sits at the end of the last section. No notes, media order or user
language are changed. English scaffolding still follows the selected export language.

Create a **new** electronic edition to see this revision: previously completed files
are immutable and the save action intentionally reuses them. Reimport the new edition
into Books, select its original/publisher typography for baseline inspection, then test
large fonts, dark theme, landscape, photos and audio. Browser/XML checks are not an
Apple Books visual acceptance; device screenshots are still required after this revision.
