# Chinese / English — phase 3: life albums

Depends on #89 (and #88). This PR targets `ios/i18n-onboarding-settings-phase-2` so only album localization appears in its review diff. Retarget after prerequisites merge; no automatic merge or TestFlight upload.

## Product scope
Album wall/guide, collect sheet, create, manage/edit/organize, preview controls and accessibility descriptions use the launch-selected language. An untouched existing album name, opening, note or unknown feeling is never translated. A new blank/default-name album uses the current language's default name; no migration renames existing albums.

Counts use the same plural rules as personal records. Collected-date labels follow the existing calendar offset. Album occurrence dates preserve year/month/day precision and original placement keys; unknown dates remain unknown.

## Paper contract
`album-a5-v3` invalidates previous in-process layouts. Generated layouts/fingerprints carry language and font policy. Requested faces: Chinese Songti SC / PingFang SC; English Georgia / HelveticaNeue. Core Text resolves and measures those same requested faces. Mixed-language source content still uses real system glyph fallback. Font diagnosis accepts the requested faces and reports actual resolution; no claim that every glyph uses the primary family or that PDF fonts are embedded.

Each generated page carries `rendering` (serif/UI faces and authored source/media notices). The native preview and PDF probe consume the same metadata and shared draw routine. Missing-media text is not selected from the device language independently. Known feelings are translated in the derived layout; input Moment/feeling values are unchanged. Original note ranges and scalar slicing remain intact.

Backward-compatible optional metadata in TypeScript fixtures/old page JSON does not allow production reuse of v2: generation always emits v3 and current language/font metadata. No production fallback to the Jest glyph-width measurer was added.

## Build and verification
Swift module/API changed: Metro Reload is insufficient. Rebuild through prebuild/pods/Xcode using the existing Xcode 26.3 compatibility fixes (#87) in a separate test checkout. Do not uninstall or clear Liuz17. Do not use a personal library as synthetic PDF-probe input; probe identity and explicit dev write gates remain unchanged.

No formal export, share, purchase, family, AI, schema or owner changes. English legal notices inherited from phase 2 remain candidates. iOS native draw, real fonts, spoken VoiceOver and device layouts are not proved by JavaScript tests.
