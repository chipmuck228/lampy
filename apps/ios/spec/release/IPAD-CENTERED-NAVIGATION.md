# iPad centered bottom navigation

Baseline: main 9c32028deac955dcc0c08bbf917f17ed5c40a5a8. User approved the landscape iPad concept: no left navigation rail; compact centered bottom navigation, warm paper, sage Lucide icons, fine rule and subtle selected marker. This PR implements that navigation/Capture treatment using existing journal content, fonts and interaction contracts. The concept's sample photograph, invented moment titles and waveform are not new product requirements.

## Behavior

- All reading roots retain the order Recent → Revisit → Family → Albums and existing capability/role gates.
- The root frame is always a vertical reading pane followed by navigation. There is no alternate side-rail tree to remount the reader during rotation.
- Regular windows (existing >=768pt width and >=500pt height rule) receive a centered, at most 560pt-wide navigation band, fine top rule and small selected underline. Existing equal phone items, labels, icons and touch targets are reused; narrow split view uses the phone layout.
- Existing bounded reading columns and date composition remain. No full-width stretching of record text, stock media insertion or font replacement.
- Capture remains above the bottom band. In regular windows it aligns with the bounded reading page, loses the soft shadow/fill and uses a lightly rounded outline; iPhone appearance and long-press recording behavior remain.
- Reading scroll reserve, private/lock gates, audio state, root routing and permissions remain in place. No purchase/export/API/database/media changes.
- M4A/MP3 file import scope is confirmed for a subsequent implementation, not included here.

## Verification

Updated layout regression covers centered iPad navigation, order and selected state, Capture placement/actions, and mounted reader preservation across portrait/landscape/narrow split view. Existing phone layout/routing and reading measure tests remain. Album overview CI now includes these tests and lint for changed production UI.

The current execution environment is unavailable. Local tests, native compilation and actual iPad rendering have not been run for this PR; GitHub Actions and installed acceptance must be recorded separately. No main merge or TestFlight upload is performed.

## Mac device acceptance

Run individually from an existing repository; stop on errors and do not force existing directories or erase records.

```bash
cd /Users/zhen/WeChatProjects/lampy-ui-e9daad5
git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 fetch origin
git worktree add --detach /Users/zhen/WeChatProjects/lampy-ipad-nav-device origin/ui/ipad-centered-navigation
cd /Users/zhen/WeChatProjects/lampy-ipad-nav-device
git log -1 --oneline
LAMPY_FAMILY_EPUB_PRODUCT_ID=lampyepubexport bash apps/ios/scripts/prepare-family-epub-device.sh sandbox
```

Xcode: Lampy scheme, physical iPad, Release Run, StoreKit Configuration None, existing signing team. Install over the current app. Check all four roots in portrait and landscape: centered narrow bottom band, consistent Lucide linework/order/selected marker, no left menu, bounded readable body, reachable Capture above navigation and last record unobscured. Verify keyboard, narrow split view/window resizing, background/lock and reduced motion, plus normal-member controls. Confirm rotation preserves reader position/state and Capture draft; perform iPhone regression to verify previous phone appearance/entry behavior. This is local device testing, not TestFlight acceptance.
