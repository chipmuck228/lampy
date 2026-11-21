# Lampy electronic edition — EPUB 3

Base: `ios/album-export-showcase` at `fccabc07478fd13be22df5472a4c66ab1293ddbb`.
This is a stacked PR: target the showcase branch until that branch is integrated.

## Delivered behavior

Personal album export keeps its existing purchase and binding flow. After binding,
each saved edition offers **保存电子册 EPUB / Save electronic album · EPUB**.
Creating an EPUB uses that edition's frozen content and media, not the current library.
A later record edit requires binding a new edition. The first EPUB creation requires
current export access; an already created, intact file remains shareable under the same
policy as saved PDFs. Creating an EPUB never starts a purchase automatically.

The publication is reflowable EPUB 3: cover (chosen photo or typographic), title page,
optional original opening, navigable contents, month/date sections, ordered records,
full text, photos, audio controls, and a colophon with the edition creation date.
Consecutive months create sections; records are never sorted or regrouped.
Unknown dates stay unknown. The date labels come from the edition's frozen paper layout.
English/Chinese interface copy follows the export language; user-authored content is unchanged.

Warm ivory, pine accents, restrained type hierarchy and generous spacing form the plain
style. Handmade adds paper color and photo mats. Reader-selected fonts/themes may
change the appearance. Use licensed device fonts; no Apple system font files are packaged.
No synthetic story, background music, automatic playback, scripts, remote resource URLs,
private file paths, or source account/moment IDs are included. Library cover rendering and
native audio control appearance belong to the reader and require acceptance on device.

## Media and storage

- Native image manipulator decodes/orients HEIF and other supported inputs, makes PNG
  derivatives at up to 2048 pixels wide, preserving transparency and whole-image aspect.
  Original records, frozen PDF media and system photos are not rewritten.
- M4A/MP4-container audio and MP3 are recognized; unsupported audio fails explicitly.
  No audio is silently dropped. Sound remains a user-triggered native audio element.
- All resources are inside the EPUB. The installed reading application is responsible
  for playback and its own cloud sync. Lampy does not upload this file to a provider.
- Package resources are limited to 64 MiB. The current ZIP writer buffers data in JS;
  very large albums should be split. Streaming packaging is future work.
- Frozen manifest/media integrity is checked; generated archive digest is checked before
  publishing. File creation uses a partial file; temporary conversion outputs are cleaned.
  Background, lock, navigation and cancellation invalidate generation/sharing via existing
  screen guards. Existing default-off paid/export release flags remain unchanged.
- No new native module is added. The existing share sheet accepts the EPUB file URL.
  The parent showcase's renderScale change still requires its documented native rebuild.

## Scope

Personal editions only. Family PDF/EPUB export, Google Play Books compatibility,
custom Apple-specific scripting and a dedicated reader are not delivered here.
PDF and EPUB use the same frozen edition but do not share page numbers: EPUB reflows.
The current flow binds PDF before creating EPUB; standalone EPUB creation is future work.
This file is a finished publication, not a library backup and cannot be imported as records.
External copies cannot be recalled after withdrawal/deletion in Lampy.

## Verification

- TypeScript and changed-file ESLint passed; 4 relevant Jest suites, 46 tests passed.
- EPUBCheck 5.3.0: generated text and photo/AAC fixtures both passed with 0 errors and 0 warnings; not a visual reader test.
- Native build, actual Apple Books import, visual layout, audio, HEIF conversion, memory
  peaks and system share availability remain **NOT VERIFIED in this Linux environment**.

## Mac/device acceptance

Use the parent's development build and configured local StoreKit product. Run `npm ci`
inside `apps/ios` after updating. Keep the existing release flags closed for App Store 1.0.0.

1. In a development build with personal export enabled, create a real album containing
   an opening, long Chinese/English text, emoji, portrait/landscape HEIF, camera photo,
   transparent PNG and a short voice recording. Select a photo cover; also test word cover.
2. Explicitly bind an edition. Select its EPUB action and choose Books in the system
   share menu (or save to Files and open the file with Books). Do not publish to a store.
3. Check cover, title/opening, contents links, original order, unknown/year-only dates,
   complete text, photo orientation/transparency and manual audio play/pause.
4. Enable airplane mode after import. Images and all audio must remain available.
5. Check large text, dark theme, rotation, navigation and searching. Exact PDF pagination
   and native audio player appearance are not promised.
6. Modify the original album; export the old edition again: its content must stay unchanged.
   Bind a new edition and verify the changes appear there. Restart and repeat old-file share.
7. Cancel the share sheet, background/lock during generation, retry, and verify no late
   share or successful UI appears while blocked. Check existing PDF and original audio.
8. Without export rights, a new EPUB must not be created; a previously generated file
   may still be saved. No purchase should start from merely tapping the EPUB action.
9. Test a large album; oversize resources show the split-album message, not a partial book.
