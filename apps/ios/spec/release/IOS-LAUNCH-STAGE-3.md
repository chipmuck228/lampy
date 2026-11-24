# Stage 3 — a keepsake, rather than an activity export

This branch is stacked on stage 2. A simple recording experience and a refined publication serve different moments: recording should feel effortless; the exported album should reward rereading, keeping and gifting.

## Implemented

### A pure publication projection

The existing `albumEpubDocuments` function already returns a virtual EPUB file tree without filesystem, network, Expo or React Native dependencies. Keep this implementation in its current directory instead of introducing a second `epubProjection.js` or restructuring the repository. Its input is the frozen `AlbumLayoutInput`, prepared resource metadata and supplied date labels. It is reusable for personal or family-shaped snapshots; this does not itself authorize a family export.

`album-publication.ts` adds the shared `keepsake-v1` composition policy and real record/photo/voice counts. EPUB styling is now separate from XML generation. The node fixture script exercises the actual projection outside any mobile runtime.

### Publication structure and rhythm

- Retain the user-selected cover and the complete original title. Use a restrained cover rule, literary typography, and a green cover treatment for the image-led edition.
- Add a keepsake page with a small L imprint, an authored dedication line, actual counts and the creation date. This is not an invented quote, account attribution, location summary or personal history.
- Preserve original opening words in full, with their own breathing space.
- Give each consecutive month/year/unknown-date group a chapter opener. Ordinals are chapter numbers, not fabricated month numbers. Repeated months remain in the user's chosen order rather than being regrouped.
- Keep record date and existing attribution before the photographs, including image-led entries, so a fallback layout cannot leave the reader guessing which record a large photo group belongs to.
- Keep the dated colophon with the last record. Do not add a duplicate full printed contents page; the EPUB navigation includes the keepsake page and chapter links.
- A short cover subtitle may list one or two supplied chapter labels. It does not infer exact date ranges from partial or unknown dates.

### Photographs

The shared policy recognizes solo, diptych, portrait-plus-two-landscapes, and four-photo contact-sheet groups. It is conservative with missing/invalid dimensions. More photos are handled in ordered chunks, and EPUB groups never cross an intervening audio item. Numeric image captions are positions, not generated descriptions.

The EPUB uses CSS table layouts for paired/triptych/contact arrangements, without requiring Grid or JavaScript. On narrow screens the groups become a readable vertical sequence. Images retain their full content and intrinsic proportions; contact sheets do not silently crop faces, annotations or borders. Viewport height limits have ordinary em-based fallbacks. Reader font, size and night theme remain reader-controlled.

The native EPUB preparation long edge is now 1600px. JPEG quality remains 0.82; PNG remains PNG to preserve transparency. Original files are not changed. The prepared image's actual, orientation-normalized dimensions drive composition without modifying the frozen source manifest. PDF retains source image resolution for print quality.

### Voices

A current-color inline waveform and the real duration frame the reader's native audio controls. Native controls are deliberately retained for accessibility and reading-system compatibility. A visible fallback explains that a reader with audio support may be needed. No autoplay, remote resources, generated transcripts or fictitious waveform analysis is added.

M4A/MP4 containing supported AAC and existing MP3 remain supported; an AAC file is not renamed `.mp3`. Unsupported formats still fail explicitly rather than disappearing from a supposedly complete book. This stage does not add SILK/AMR transcoding or ASR. Each XHTML containing the decorative inline SVG declares its SVG property in the EPUB manifest.

### PDF: shared personal/family print path

The existing personal and authorized family PDF adapters both use `layoutAlbumPrint`, so they receive the same print-only publication policy:

- A separate keepsake page and explicit month/year/unknown-date divider pages.
- A cover border, running title, restrained rule, single folio and a closing imprint. Furniture stays outside the measured source text boxes.
- Ordered, uncropped photo compositions and internal white mounting borders. An audio interruption remains between its original surrounding images.
- Voice labels preserve the duration and state that PDF keeps voice details only.
- Content integrity validation still covers every original text range, photo and voice. The in-app paginator defaults to the existing layout; publication pages are an explicit print opt-in.
- Print image lifetimes are bounded per page by an autorelease pool. This is not a measured capacity guarantee for a large family album.

New decoration metadata is frozen with the new edition. Existing intact PDF/EPUB files are reused and shared; they are not silently regenerated. An old snapshot without a completed EPUB can be rendered with the new generator while keeping its frozen source content. There is no migration or replacement of completed files.

## Important scope boundaries

Family PDF remains behind its existing server and purchase/access controls. No family EPUB endpoint, queued server job, download URL, flag opening or deployment is added. A future server-side family export can consume the same pure projection after enforcing current membership/content permissions and freezing its sources. Moving personal data to a server solely for design or adding server transcoding is unnecessary here.

Dynamic per-export font subsetting is not implemented. Python FontTools cannot simply be called from an iOS app, and Apple system fonts must not be copied into EPUBs. The bundled first-run UI fonts are intentionally limited character subsets and are not suitable as general book fonts. The CSS requests reader-installed serif faces; exact rendering still varies by reader and font override. A future embedded-font solution must use appropriately licensed fonts, preserve all exported characters and demonstrate a bounded local implementation. A 300–600 KB size is not promised.

No dependency upgrade, payment redesign, new time-range picker, generated summaries or consent change is part of this PR.

## Samples and acceptance

`node scripts/publication-fixture.cjs OUTPUT_DIRECTORY` generates two actual EPUBs plus their unpacked documents using the production projection. Records, dates and attributions are synthetic. Photos are the existing licensed first-run fixtures and are deliberately reused; audio is the repository's existing demo clip. These samples contain no user records or API calls.

The companion PDF design proofs are print renderings of the actual EPUB XHTML/CSS with system-installed Noto CJK fonts used only by the proof renderer. They are **not iOS-native PDFs**, do not prove native Core Text typography, and are not a substitute for a device export. Audio controls in the proofs are replaced by an explanatory line because PDF is static. Proof font embedding does not imply that EPUBs embed that font.

Acceptance still requires Apple Books on iPhone/iPad (portrait, landscape/two columns, font-size changes and night theme), at least one Android EPUB reader, and a newly compiled iOS app for native PDF. Verify long original titles/openings/paragraphs, emoji, extreme image ratios, images interrupted by audio, unknown/partial dates, repeated months, family attribution and revoked/missing content. Check cancellation/backgrounding, source changes, restart/share, and already-saved edition preservation.

Real Sandbox purchases, production deployment and store checks remain stages 4 and 5. Keep the PR draft until native compilation and actual-reader/device visual acceptance.

References: [W3C EPUB Reading Systems](https://www.w3.org/TR/epub-rs-33/) and [EPUB core media types](https://www.w3.org/TR/epub-33/#sec-core-media-types). Reading-system audio support depends on the reader's capabilities; standard-conforming packaging is not proof of identical layout or playback everywhere.

## Reproduce synthetic design proofs

```bash
node scripts/publication-fixture.cjs /tmp/lampy-keepsake-samples
# Optional development renderer; install WeasyPrint and PyMuPDF in a local Python environment.
python3 scripts/render-publication-proof.py --samples /tmp/lampy-keepsake-samples
```

The fixture directory must be new: existing sample/source files are not overwritten by the EPUB generator. Native PDF syntax gets a separate macOS CI check; that check does not typecheck/link the Expo app or establish visual acceptance.


## PR143 device-test baseline after stages 1/2 merge

Synchronized with main ee665c5, including the email-only development gate and accepted settings navigation. No server changes are needed for personal EPUB/native PDF design acceptance. The family-internal preparation command intentionally closes export flags and cannot be used for this test. Use explicit local StoreKit non-consumable configuration (for example app.lampy.export.designtest, a local-only fixture identifier) with enabled paid personal export, unified purchases off, family finished export off, and the test account API. This validates design and local simulated access, not real Sandbox purchases.

After setting those explicit flags, run iOS prebuild, Pods, write-family-xcode-env.sh and a fresh native Release build. Use the same bundle ID and signing team and install over the existing app. Keep a copy of any custom Xcode StoreKit configuration outside generated ios/ before regeneration. In Xcode select the local StoreKit configuration for Run. Generate a new edition: intact existing editions deliberately retain their original layout. Test both literary/imagebook EPUB designs in Apple Books, and a newly generated native PDF in Files; do not substitute the synthetic EPUB print proof for native PDF acceptance. Source records must remain intact; restart and share the saved edition again. Family export and real Sandbox acceptance remain later work.


## 第一版横向影像册修订

影像小册采用 1200×900 固定版式 EPUB：大图封面、默认或自填开篇、按月份组织的记录、书末制作记录。照片完整显示，无外框及可见图片编号；短文在图旁垂直居中、左对齐。长文按保守字符宽度预算分页，不截断正文；不同阅读器字体仍需真机验证。生活文集保持流式 EPUB，不强制阅读器横屏。

iPhone App 限竖屏，iPad 保留方向支持。新生成 PDF 的分享／打印入口只保留在已生成列表中。原有导出文件不会重排，验收时请新生成一份。

验证：运行 EPUB 相关回归、TypeScript、ESLint、EPUBCheck；静态 XHTML 排版检查每个固定页面为一页且内容未越界。静态证明不能替代 Apple Books 真机验收；PDF 原生排版需另行真机检查。


### 整册编排修订
EPUB 使用纯逻辑整册计划：尊重指定封面；未指定时选择长边至少1200、短边至少800且比例0.65—2的照片中最接近4:3的一张。没有合适照片使用正式 Lampy 标志的图形封面，不引入无关生活照片。短文字同日相邻且至多三条合页，长文和未知日期保持独立；纯照片按整幅、双联或三／四张拼组；双图短文共页；其他图文与声音保留顺序。书末仅标志、Lampy、册名、已知记录日期范围、留存日期，不显示统计标题。图像尺寸不代表主体识别；预览仍需人工确认。
