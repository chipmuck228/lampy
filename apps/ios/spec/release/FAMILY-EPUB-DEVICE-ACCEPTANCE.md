# Family Chronicle EPUB acceptance

Family albums now share the personal Chronicle compositor, photo viewer, audio pages and native full-screen reader. All current family members can preview without a purchase. The current family creator saves/shares only after the existing server family grant check. PDF stays closed. No schema migration or new API endpoint is required.

## Mac / iPhone

From this branch's repository root:

```bash
bash apps/ios/scripts/prepare-family-epub-device.sh
```

The default preview mode enables Family and Albums explicitly (including Release), preserving the current app data. Use Xcode's Release Run configuration. Open Albums → family album → 翻阅. Preview should match personal EPUB, include author attribution and all available photos/audio/text, and end at the closing page. It must not offer share or a paid dialog. Noncreators can preview too. Existing continuous reader remains accessible only as the secondary old reader; it is not the main preview.

## Paid test requires the existing server purchase configuration

Local `.storekit` design-test transactions are not accepted by the family server. To test real paid family export, configure an App Store Connect product and Apple Sandbox account, and the existing server verifier. The server needs its existing history/albums flags plus:

- `LAMPY_UNIFIED_PURCHASES=1`
- `LAMPY_FAMILY_ALBUM_EXPORT_ENABLED=1`
- `LAMPY_UNIFIED_PRODUCT_ID=<matching product>`
- `LAMPY_PURCHASE_ENVIRONMENT=Sandbox` and the existing Apple key/issuer/root certificate configuration in `purchase-apple-node.ts`.

Do not change production purchase verification, disable receipt checks, or substitute `Xcode` as the server environment. This PR does not deploy or change the running server. After the server configuration is ready:

```bash
LAMPY_FAMILY_EPUB_PRODUCT_ID='<matching App Store Connect product>' \
  bash apps/ios/scripts/prepare-family-epub-device.sh sandbox
```

In Xcode set StoreKit Configuration to **None**, use Release Run, and test Apple Sandbox purchase/restore. Client and server must agree on product and authenticated Lampy account. The creator explicitly taps “使用我的购买解锁这个家庭” after purchasing/restoring; a purchase alone never starts export. A previously valid family grant can be used by the current creator without requiring a second personal purchase.

## Acceptance matrix

| Case | Expected |
| --- | --- |
| Unpaid current member | Free full-screen preview; no save/share entry in album overview |
| Unpaid current creator | Free preview; purchase/restore shown when server export is enabled |
| Paid/granted creator | Save/share standalone EPUB; open in Books; offline image expansion/return and audio work |
| Saved edition | Tap shares; swipe shows icon share/delete; newest marked; delete affects this account/family/album's local edition only |
| Content revision/withdrawal | Close stale preview; refresh required; old local edition retained but cannot be re-shared against new validation |
| Removed/changed account | Hide preview and history; deny late downloads and share |
| Background, lock, back, cancel | Stop preparation and dispose preview cache; never open a delayed share sheet |
| Share sheet dismissed or fails | Verified completed edition retained; original family sources untouched |
| Server export disabled/offline | Free preview if source validation works; no paid export bypass |
| Personal regression | Existing free preview and paid EPUB still work; PDF remains closed |

Completed local files and already delivered external copies cannot be recalled. A history row is scoped to the signed-in viewer, family and album; changing source validation requires a fresh edition for sharing. Withdrawn references are omitted from free preview, while paid export continues to use the existing server policy requiring active album contents.

## Verification limits

Linux checks cover TypeScript, Jest source/rendering/file isolation and existing server authorization tests. Apple Sandbox, native Xcode build, actual Books playback and two-account device withdrawal checks require the above Mac/iPhone acceptance. Do not treat local JavaScript tests as those device checks.

Local checks: targeted EPUB/family/server/UI regression suites, TypeScript and changed-code ESLint; 15 Node device/archive profile tests. The full Jest run exposed the existing 9 failures in `src/family-admin/server.test.ts`, reproduced on the clean main baseline; it is not reported as an all-green full suite.
