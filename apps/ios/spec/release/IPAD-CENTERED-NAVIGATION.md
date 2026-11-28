# iPad centered bottom navigation

Baseline: main 9c32028deac955dcc0c08bbf917f17ed5c40a5a8. User approved the landscape iPad concept: no left navigation rail; compact centered bottom navigation, warm paper, sage Lucide icons, fine rule and subtle selected marker. This PR implements the navigation/Capture treatment and regular-window Recent editorial composition using existing journal content and interaction contracts. The concept's sample photograph, invented moment titles and waveform are not new product requirements.

## Behavior

- All reading roots retain the order Recent → Revisit → Family → Albums and existing capability/role gates.
- The root frame is always a vertical reading pane followed by navigation. There is no alternate side-rail tree to remount the reader during rotation.
- Regular windows (existing >=768pt width and >=500pt height rule) receive a centered, at most 560pt-wide navigation band, fine top rule and small selected underline. Existing equal phone items, labels, icons and touch targets are reused; narrow split view uses the phone layout.
- Recent uses a bounded page up to 1120pt, a concise Recent heading and smaller date metadata in regular windows. Photos and notes sit side by side, with a larger 23pt/40pt note measure. One/two/three-photo walls retain every slot and image order, fit the complete image within a viewport-dependent height budget and preserve missing-image explanations. Long notes keep their existing explicit expand/collapse behavior. Phone typography and composition remain. No stock media or invented titles are inserted.
- Capture remains above the bottom band. In regular windows it occupies its own dock outside the reader ScrollView, so it cannot cover photos, and aligns with the bounded reading page. It uses a lightly rounded outline; phone appearance and long-press recording behavior remain.
- Reading scroll reserve, private/lock gates, audio state, root routing and permissions remain in place. No purchase/export/API/database/media changes.
- M4A/MP3 file import scope is confirmed for a subsequent implementation, not included here.

## Verification

Updated layout regression covers centered iPad navigation, order and selected state, Capture placement/actions, and mounted reader preservation across portrait/landscape/narrow split view. Existing phone layout/routing and reading measure tests remain. Album overview CI now includes these tests and lint for changed production UI.

Initial navigation-only head 8bf4d10 passed its remote layout/type/lint CI. The user then supplied a 13-inch iPad Pro screenshot and rejected the visual match: narrow phone-style content, giant vertically stacked photos and Capture over content. The current follow-up adds the missing editorial body and separate Capture dock. Local TypeScript, changed production ESLint and 15 suites / 106 tests passed; this is not a claim of native screenshot parity or installed acceptance. Updated CI and another iPad visual check are required. No main merge or TestFlight upload is performed.

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

Follow-up acceptance: on the same 13-inch iPad Pro and the same leaf/flower moment, confirm the page is wider, photos and note share a row, both photos are visible as bounded previews, original aspect ratios/content and record order are retained, and Capture does not cover any photo. Also check single-photo, photo-only, text-only, expanded long text, unavailable-photo and audio records. Verify portrait, landscape and narrow split view with real content, not only the synthetic concept image.

## Shared iPad page frame follow-up

The user accepted installation/navigation but rejected inconsistent page frames across roots and interior pages. A shared pageFrame(width,height) now governs the 1120pt maximum outer column, 48pt regular gutters, 28pt top spacing and 640pt focused prose/form measure. Recent, Revisit, Family and Albums share the regular 42/56 root heading. Albums and Family content no longer stretch to the screen edge or collapse to a centered phone column. SettingsPage, used by account, invitation, family history, sharing and album tools, bounds the header and body to this same frame; focused content stays left-aligned at the common content edge, while album/photo tools opt into its full width. Capture, record detail and the legacy family profile use the same regular outer frame. The collection sheet is bounded to 640pt. EPUB full-screen reading is intentionally a separate immersive surface.

These changes are made without an available local executor. Do not reuse the preceding 106-test result as validation of this follow-up. Remote TypeScript/lint/regression CI must pass, followed by actual iPad portrait and landscape review. New tests exercise frame equality, real SettingsPage/Revisit layout, portrait/landscape/narrow resizing and unsaved field retention. Existing phone, family, album and record-detail tests are included.

Acceptance matrix: Recent, Revisit (time catalog and day), Family (list, selected family, invite, join, members/history), Albums (personal/family, detail, edit/organize, save/share), Settings (each subpage), Capture (keyboard and media), record detail and collection sheet. In each portrait and landscape window verify the same content-edge alignment, header top/scale, bounded controls, reachable bottom actions, and no resets when rotating. Also check 600pt split view and a landscape phone. Immersive EPUB previews must remain full-screen and retain close/image/audio interactions. This matrix remains pending device acceptance.
