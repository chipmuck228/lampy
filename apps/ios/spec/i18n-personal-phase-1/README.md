# Chinese / English — phase 1

Base: current main d76edf1 (#86). Independent of OPEN #87 (native build repair).
No merge, TestFlight upload, private-library access or data migration.

## Language contract
One app and one personal library. Use iOS per-app language, declared zh-Hans / en;
no duplicate in-app language switch. expo-localization 57.0.2 matches Expo 57's
bundledNativeModules; i18next uses bundled resources synchronously, no network.
Select language once at launch. iOS App language changes take effect on relaunch;
do not key/remount navigation, composers, audio or the lock provider by language.
Chinese tags resolve to simplified Chinese (not a Traditional Chinese release).
Unsupported or unavailable language resolves to English. Native locale acquisition
failure is also English; the new native module requires a rebuilt client.

`src/i18n/en.json` uses explicit Chinese authored-copy keys to preserve existing
Chinese copy and distinguish it from user strings; tr's keys are typed. Chinese
resources are derived from those keys, with the same numbered interpolation slots.
English singular/plural resources use i18next's count support. Never feed an
arbitrary note, album name, opening, caption or unknown feeling into tr.

## Included
Recent, Revisit (including legacy day/year/month and unconfirmed routes), Capture,
detail, sound controls/recording, permission explanations, App Lock, shared root
navigation/FAB and VoiceOver labels. Personal use-case presentation/errors are
localized; identifiers, request generations, limits, persistence and workflows stay.
Calendar presentation wraps existing calendar parts/offsets and precision; no UTC
reinterpretation, fabricated day or placement changes. Known feeling labels are
localized at the screen boundary, while onChange stores the original vocabulary.
Unknown free strings, notes, album names/openings, media and ownerId stay untouched.
Existing fixed type scale, Reduce Motion, 48pt hits, FAB timing and lock logic stay.

## Deliberately incomplete English release
Phase 2: first-run copy/fonts, startup branding, Settings and its reading pages,
help/terms/privacy. Phase 3: album list/collect/manage/preview paper labels,
locale-aware layout/cache and native text/PDF checks. Those routes can still contain
Chinese; this PR is NOT a complete English TestFlight release. Family/AI/paid
features remain gated. Shared nav's Albums label does not claim album localization.
No legal approval or translated legal equivalence is asserted.

## Terminology (whole-app direction)
Recent 最近; Revisit 回看; Albums 生活册; Capture 留下; Read the full moment
阅读完整记录; Feeling 当时的感受; App Lock 本机保护; Date index 时间目录.
English first-run copy will be adapted for tone in phase 2, not mechanically copied.

## Native permissions
app.json declares supported iOS locales and per-language InfoPlist.strings sources.
Chinese Face ID purpose text now describes entry/background-return authentication,
not merely enabling the switch. Both languages state Lampy does not receive face data.
Prebuild generates native strings; Metro reload alone cannot verify permissions or
per-app language selection. Do not prebuild --clean over an existing native project.
Use a separate checkout/install; do not uninstall or clear Liuz17.

## Verification boundary
Linux config generation, TypeScript/Jest/lint are not iOS device passes. Main's two
failing tests (life-page old two-tab expectation and life-album-detail-sheet obsolete
AX label) are compared under the SAME dependencies/commands, not inferred from diff.
See WALK.md for actual run results. #87's Xcode 26.3 build fixes remain separate;
if not merged, native testing needs the already documented local compatibility fixes.
