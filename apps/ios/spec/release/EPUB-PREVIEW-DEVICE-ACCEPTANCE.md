# EPUB preview and paid export acceptance

2026-11-25 · PR #144 · release/album-export-polish

PDF creation/preview are withdrawn. PDF renderer code is retained dormant and previous saved files are preserved. No migration, original media deletion, new SKU, npm dependency, Pod dependency or new native source filename is introduced. Family PDF routes are protected and their entry/purchase panel removed; this does not enable new family export permissions.

## Implementation

- Album menu → 电子册 / Electronic album. Preview remains visible independently of export feature flags and purchase state.
- Free full-screen reader uses the exact Chronicle `albumEpubDocuments` composer and local resources, with cover through closing page, photo open/return and inline audio. It does not use the legacy paper renderer or PDF generator.
- A disposable cache lives under cache/album-epub-preview/preview_*. Closing, leaving, locking or failed preparation removes only that preview. Delayed results are discarded; source changes during preparation reject the mixed preview. No saved .epub, manifest edition, share sheet or purchase call is made by this path.
- Native WKWebView is ephemeral/offline, accepts only local publication navigation, disables image callout menus, and clears playback/content on background/removal. This is access control for the app flow, not screenshot prevention or DRM.
- New EPUB creation and every cached EPUB share require current export entitlement. Purchase and restore remain explicit; purchase does not automatically export. Completed editions survive a denied share.
- Historical PDF files remain listed under History and can be shared/deleted. They are never regenerated or previewed.

## Mac / iPhone

Keep local signing and StoreKit configuration. Do not uninstall Lampy or clean its data.

```bash
git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 pull --ff-only origin release/album-export-polish
bash apps/ios/scripts/prepare-chronicle-device.sh
```

The script opens ios/Lampy.xcworkspace. Select the iPhone, Release Run and the existing local StoreKit test configuration. Build and install over the current app. A native rebuild is required for the new reader view; Metro reload alone cannot add it. PDF diagnostic scripts are no longer a release prerequisite.

## Device checklist (pending)

1. Clear only StoreKit test transactions (not Lampy data). Without purchasing, open Album → menu → Electronic album → Full-screen preview. Entire book is readable; no purchase dialog or share sheet appears.
2. Check actual single/two/three image pages, opening, dates, long prose, and closing. Landscape/portrait fit the same 4:3 publication. Tap a photo, inspect full image and return to body. Play/pause audio without clipped controls. Swipe and buttons turn pages; audio stops on page change. Image-detail swipes do not turn the book.
3. Lock/background during preparation and while audio plays. No private content remains visible in the reader after lock, playback stops, returning rebuilds correctly. Close/reopen and repeat; no duplicate saved edition is created.
4. Before purchase, an existing EPUB row must not open the share sheet. Purchase/restore the existing product, then explicitly Save & share. Share to Books / Files and reopen there. Returning from share leaves an intact saved edition. After revoking StoreKit entitlement and refreshing/reopening, cached EPUB share must again be denied.
5. Prior PDF/EPUB rows and original records still exist. Prior PDF shares without generation; delete only after intentionally selecting a disposable edition. No PDF creation/preview, family paper/PDF route, or PDF product promise remains.
6. Test English copy and unavailable purchase product: free preview must remain usable. An older native build must show a rebuild/update message rather than silently opening paper preview.

## Validation boundary

Automated JS/TypeScript tests exercise unpaid/config-disabled preview, explicit purchase, owned export, cached entitlement rejection, history sharing, lock cleanup, delayed-result cleanup, source revision rejection, original content preservation and shared EPUB composer output. Swift/WebKit compilation and this iPhone checklist require Xcode and remain NOT VERIFIED in the Linux execution environment. Do not mark the PR ready based on JS tests alone.
