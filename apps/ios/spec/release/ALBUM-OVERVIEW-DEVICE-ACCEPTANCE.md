# Personal album overview acceptance

2026-11-25 · PR #144 · release/album-export-polish

The user reported commit bdd7bf3 passed iPhone full-screen preview, paid save/export and PDF entry closure. This change refines the personal album overview only. The existing entitlement checks, EPUB content, data models and saved files remain unchanged.

## Overview
- Navigation shows a back arrow and one album menu. The album name appears once below a larger cover, followed by quiet date range and record count.
- Two visible actions: Read opens the free full-screen EPUB reader on iOS; Save & share opens the existing export/purchase/history page. Android keeps continuous reading and its export closure.
- Edit album, Organize moments, Continuous reading and Delete album live in the same header menu. The menu is outside the scrolling content, so it remains reachable after scrolling.
- Browsing uses two-column photo/text summaries. Adjacent equal dates merge without sorting the album. Photo captions show at most two lines; text-only summaries show at most four. Decorative photo stacks replace repeated visible photo-count lines. Audio durations and unavailable content remain visible; accessible labels retain media counts.
- Edit/organize are exclusive modes. Their tools are hidden during browsing. Header Cancel discards unsaved edits; Done leaves organizing. Source mutation and confirmation paths are retained.

## Device checklist (new layout pending)
1. Pull this branch and open apps/ios/ios/Lampy.xcworkspace. No new native module, dependency, StoreKit ID or Pod change is introduced by this overview update. Build/run with existing signing/configuration, without uninstalling or deleting data.
2. Open the tested album: one title, larger chosen cover, two visible actions, no repeated photo-count rows. Scroll down then open the header menu; all management actions must be visible.
3. Read goes directly to free full-screen preview. Save & share reaches the existing paid gate/history page; unpaid users must not bypass entitlement. Continuous reading remains accessible from the menu.
4. Inspect mixed photo, text-only, voice, missing media/source and empty albums. Tap summaries to open the corresponding original moment. Same-day neighbors share one date heading, while manual order remains unchanged.
5. Edit: change name/opening, select a cover, save individual fields. Unsaved opening must survive a cover/name save. Cancel exits editing. Organize: move records, remove a disposable album entry and finish; the original moment must remain intact.
6. Delete album must still require confirmation. Test narrow iPhone width, landscape and English. Confirm PDF creation/preview remains absent and prior saved files remain available.

## Checks
The local execution environment was unavailable for this update. A scoped GitHub Actions check runs TypeScript, ESLint and the overview/EPUB-flow tests. Device appearance and Xcode execution remain unverified until the checklist above is completed.
