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


### 真机反馈修订：完成状态与日期编排
文件发布并进入 SHARE 阶段即显示“已保存在 Lampy”，切换 Books 不再把已完成文件标为制作中断。发布前的后台、离开和取消仍会中止任务。EPUB 投影对副本按 moment 时间升序稳定排序，相同时间保留选择顺序，未知／无效时间放最后；不修改原册或冻结快照。每个日期单独扉页，随后该日全部记录；不把未知时间猜成某一天。文集去掉整月大标题，照片改为保守的单列流式排版，降低照片高度并移除书末大视口留白，以减少阅读器分页空白。影像册保留固定横向布局。需要重新生成 EPUB 验证 Books 返回状态、顺序、日期页、空白页。

### Photo journal 组合模板第一版
每条 moment 以最多3张照片为约束：横图短文、竖图侧文、双联、三竖图、三图主次组合，以及原有纯文字／长文和声音续页。保留原始照片顺序，不使用4图模板；历史超限或混合媒体走原有连续展示，不丢内容。版式按尺寸比例和文字预算选择，正文仍可选取，不整页栅格化。

按图片与实际固定槽位比例，只有保留画面面积≥82%才允许居中 cover 裁剪，其余 contain。点击正文照片通过普通离线链接进入完整画面页，再经明确链接返回具体正文锚点；完整画面页在 spine 标为 linear=no，不加入目录。复用已优化的1600px图片，不重复打包，也不宣称是拍摄原始文件。无脚本、无网络。需真机检查 Books 对非线性附页、点击／返回的行为；阅读器仍可能允许手动翻到附页。

此次只做一套自动组合模板原型，不新增用户模板选择，不加入主体识别或裁剪焦点编辑。文字仍采用保守分页预算，尚未接入跨字体原生精确测量；短文限制100字符且无换行，否则走连续分页。多模板、字体精确测量及裁剪预览调整需在原型方向确认后推进。

### 参考版式第二版
以参考图建立8种固定几何：单图无文铺满内容区；单图有文按横／竖图采用上图下文或左右图文（左右随记录序号交替）；双图无文上下排，双图有文交错两图片区与两段正文区；三图无文为上大下双或三竖列；三图有文为三图加一个正文区。无新增 moment 标题，顶部只保留真实日期／作者／感受。默认每条最多3张照片，更多图片和滚动动画不在此次范围。

每个文字区域单独预算容量，优先在句尾断开；长文可续页，原始文字不截断。精确跨字体原生测量仍未实现。居中裁剪继续最多去掉18%画面；无法安全填满参考框的图片完整缩放，可能保留白边，不拉伸、不复制背景。点击完整图片与返回正文继续离线可用。需实际 Books 检查双图交错文字阅读顺序、原图返回与长文续页。


### 真机反馈：以实际图像矩形替代固定框内 contain
照片可用区统一为 x64/y128/w1072/h700，底部留72。无文字布局按实际源比例计算每张照片的可见矩形，比较等高横排、等宽竖排、上大下双、左大右双；总显示面积和最小照片面积各占一半评分，避免牺牲两张照片去放大一张。三竖图优先结果由尺寸及均衡评分决定；双竖图在上下排显著缩小时自动横排。这是对固定“所有双图必须竖排”规则的修正。
单图带字优先大图侧文，只有较宽横图采用上图下文；双图带字改为等高图片组合加连续正文，消除交错模板右下角小图。三图带字保留已接受四区结构，在安全区内缩进。无文字图不再依赖 object-fit contain 在巨大固定框内生成隐形空白；未知尺寸才使用保守比例。测试增加实际照片占版率、最小尺寸、准确比例、区域不重叠和底部安全线。测试通过不代表 Books 实际验收通过。


### 单图三联画与三图文字照片墙
单图且无文：移除正文页日期／作者／心情文字。适合4:3页面且保留原图面积至少82%时，单张统一缩放裁剪的图铺满1200×900，覆盖两道8px竖缝，构成同页连续三联画，不复制三个独立缩放图；无法安全裁剪的竖图完整显示，不强制三联。已选心情沿用正式心情色板，左侧5px细色条；无心情不显示。日期仍在日期扉页，作者与心情文字保留在完整图片页，点击返回锚点不变。EPUB外侧阅读器黑边无法控制。
三图加文字：撤销等分四区，按源比例比较等高行、左大右双、上大下双，以占版面积与最小图片面积选择照片墙，正文单独成连续区域，短文132高、长文220高，超出续页；原始照片顺序不变。正文安全边距仍为64/128/72，单图铺页是明确例外。不加入滚动／动画／脚本。实际阅读器仍待验收。


### 模板封面收口：时序 · Chronicle
模板设计标识 chronicle-v1，显示名“时序 / Chronicle”，用于后续个人册与家庭册共用的模板选择；此阶段只替换 Photo journal 的封面，未开放家庭导出或新增选择入口。采用一张照片贯穿上下背景、中央白色信息带、两侧竖向分隔线与带外白色细线。左边为册内最早已知记录日期，中间为原始册名，右边为最晚日期；遵守年／月精度和冻结显示日期，不使用生成时间。长册名自适应字号与信息带高度，不截断。
照片优先用户指定；未指定时优选册内较清晰、接近横向的照片，全部低于优选尺寸也会从已有图片选择；无图片才用图形底。背景中心裁切铺满，白色信息带会遮盖照片中部；当前无主体识别或封面裁切焦点编辑。此次未修改开篇、日期扉页、moment、照片墙、三联画、书末或原生 PDF。
样张脚本 publication-cover-fixture.cjs 包含指定封面、自动封面、竖图、英文、长中文册名、无照片六种情况。确认封面后再逐项收拢正文设计。

### 封面已确认；开篇页收口候选
封面构图按用户确认保持，只明确英文标题 lang=en（即使 App 使用中文），优先 Baskerville / Palatino / Georgia；中文保持宋体衬线。没有嵌入完整字体或动态子集，系统缺少首选字体时仍回退；不同阅读器需实际字体检查。

Chronicle 开篇页采用浅暖纸色、LAMPY 小型刊头、细横线、低对比引号、侧线及页脚署名。主体使用用户原始 opening，未填写使用既有默认开篇，不替换或修改用户文字。页脚产品理念独立于用户文字：中文“留住普通生活里的文字、影像与声音。让今天的片刻，成为往后可以重温的记忆。”；英文“Keep the words, photographs and voices of ordinary life. A little of today, to return to tomorrow.”，只在第一个开篇页出现。长开篇保守分页，按语言优选书籍衬线字体、宽行距、左对齐；无重复 Opening words 标题或页码装饰。

只改 Chronicle 开篇及英文封面字体规则，未调整 moment、日期扉页、三联画、照片墙、书末、原生 PDF 或服务器。publication-opening-fixture.cjs 生成中英默认／自填／长文6类检查样张。正文仍可选取；装饰标记 aria-hidden；字形与分页须 Apple Books 复核。

### 封面、开篇与日期页已定稿
用户于2026-11-24确认日期页最终样张（实现提交05b961c）；封面、开篇与日期页三部分均已视觉定稿，后续优化 moment 版式时保持这三部分。
日期页保留暖纸、衬线字体、刊头与细线。年与月合为一行，整体顺时针旋转90°置于渐变竖线左侧；日号在竖线右侧，以260px衬线数字水平及垂直居中。移除心情标题、色块、图例和说明，保留充足留白。
3px竖线按当天 moment 的时间顺序由上至下柔和渐变，使用正式心情色板；未选择心情以浅中性色承接，全部未选时为中性色线。渐变使用静态 SVG，无脚本、动画、分数或曲线。
同一显示日期的 day/exact/minute 精度共用扉页；年/月精度不补日号，不确定日期保留原标签。所有渐变节点保留在一条竖线中，无需续页。中英文普通日、多种心情日和40条记录日样张已供审阅。视觉定稿不等同于 Books 真机验收，实际阅读器仍需复核。PR143继续保持草稿，未授权合并。

### 单张照片 moment：视觉样张候选，尚未接入正式导出
脚本 publication-single-study.cjs 使用现有授权的咖啡横图、窗边竖图与合成中英文文字，展示无文字、短文字、长文字共六组。无文字横图铺页加连续三联缝；竖图完整等比显示占满页高。短文字横图采用上图下文、竖图左图右文。长文字照片独立一页，随后为宽边距文字书页，使用小刊头、短侧线、细页脚与局部页码；正文29px/1.85，中英文分别选衬线字体，优先整段分页，不压缩文字密度。
此脚本仅生成可审阅样册，不改变生产导出函数、正式单图规则或已经定稿的封面/开篇/日期。长短文的正式容量判断和任意用户段落分页待样张确认后实现；当前样张文字均已验证完整保留。含声音的 moment 不在此次范围，声音页单独设计。预览与 EPUB 需视觉确认；静态显示及格式校验不代替 Books 真机验收。

单图样册色彩微调：装订色边保持最左侧，宽16px；同一 moment 的照片页及长文续页使用相同颜色。样册心情色谱统一为低饱和青绿至青黛：高兴#BACDC0、感动#9FBAB0、平静#829E96、疲惫#718A87、难过#455F65、烦乱#526C6C、说不清#8D9F9A。日期页渐变节点使用同一色谱，细线宽度3px、位置及日期构图不变。样册同一天含六种心情以供比较；无颜色图例或解释插入正文。此为样张内候选色谱，未修改 App 全局心情颜色，正式模板接入待确认。

### 单图边界样张：待确认
publication-edge-assets.py 用现有授权咖啡照片生成160×107小图、1400×175极宽裁切测试图，以及600×3600合成六段长截图；另有实际1400×932但记录元数据为空的图片。测试图不是用户照片，极宽裁切仅为构造比例边界，导出排版本身不裁切。publication-edge-fixture.cjs 接收实际解码尺寸，生成四种完整等比展示页：可用区1040×756，居中，小图样张最大放大2倍（候选规则，不等于各设备清晰度保证）。元数据缺失案例先根据解码结果恢复比例，仍无法解码的情况不在此样册模拟。
沿用16px左侧装订色边及青绿青黛色谱；封面、开篇和日期布局复用定稿。点击完整图和返回锚点保留。长截图全貌页在手机上必然很细，完整保存不代表细节可读，阅读器缩放仍待真机验证；本次未实现长图分段细节页、OCR或内容识别。此为边界视觉样张，没有改动正式导出。
复现：python3 scripts/publication-edge-assets.py NEW_ASSET_DIR [CJK_FONT_PATH]，再执行 node scripts/publication-edge-fixture.cjs ASSET_DIR NEW_OUTPUT_DIR。Python脚本仅样张开发使用，依赖Pillow。

### 单图规则正式接入（替代以上“仅样张”状态）
已将已确认单图无字/短文/长文、16px左侧装订色边、青绿青黛色谱及图片尺寸兜底接入 imagebookPages 正式导出路径。Chronicle 色谱独立，不改变 App 全局和原生 PDF。日期只换色谱，构图与3px细线保持。普通单图短文容量按保守字体宽度、换行计算；长文和边界图文字另页，优先整段，超长段落可续页，保留原文、emoji和CRLF。段首纯换行在续页不绘制，DOM文字不丢失；宽拉丁字母和长单词也使用保守预算。
小图最长边不足600px或缺少可靠尺寸时不做三联；极端比例<0.4或>2.5独立完整展示，已知尺寸在阅读页最多放大2倍。已知尺寸优先于旧比例。原生ImageIO准备过程上限取min(1600,源最长边)，不提前放大小图；转换后尺寸覆盖缺失/过期元数据，但不回写冻结记录。解码失败保留明确错误；未知尺寸保守contain。原图入口仍复用优化后的EPUB图片，不重复嵌入原始高分辨率文件；长图细节页未加入。
publication-acceptance-fixture.cjs 直接使用正式投影，不替换样张HTML/CSS，中英各11条记录覆盖6种单图、4种尺寸边界及照片伴随声音。单图声音独立页保留现有播放能力，新声音视觉设计未收口。旧已完成电子册仍保持原文件，需要新建电子册。
验证：TypeScript/ESLint/diff检查通过；19套180项相关测试通过；中英验收EPUB均EPUBCheck零错误零警告；54张正式阅读页完成静态单页、文字边界、原文完整和离线链接检查。对相同验收输入比较12个已定稿封面/开篇/日期/书末文档，除日期渐变节点颜色外保持一致。原生Swift编译及实际iPhone/Books字体、缩放、播放器验收尚未进行，不能标记真机通过。
设备准备脚本 scripts/prepare-chronicle-device.sh 只在Mac运行，完成依赖、显式测试开关、prebuild/Pods、Xcode环境及workspace打开。完整步骤和验收表见 CHRONICLE-SINGLE-DEVICE-ACCEPTANCE.md。无服务器更新、无新家庭导出入口、无真实支付产品变更；继续保持PR143草稿，未合并。

### 导出页电子册操作收拢
列表标题改为“已生成的电子册 / Created electronic albums”；移除逐行“保存电子册”按钮和“电子册已保存在Lampy中，可再次点击保存。”提示。点按整行分享，左滑显露分享、删除双操作，不因滑动直接执行操作；删除继续通过原确认流程。VoiceOver支持分享、删除及显示操作，忙碌/锁定时禁用。
本页新创建成功的一册置顶并显示“刚刚生成 / Just created”，标记绑定当前Album与新成品ID，在Books切换回来时保持，重分享历史册不会改变该标记；仅页面会话内区分，不改文件时间或持久化元数据。既有PDF/家庭列表保留原操作方式，共用组件的双操作为电子册可选能力。此次不修改任何EPUB版式；两图附文布局下一步先讨论并做样张。

### 两张照片版式：计算选型样张，未接入正式导出
publication-pair-assets.py 从仓库授权照片制作横横、竖竖、横竖、近方形及一大一小尺寸样本；素材裁切仅为构造比例测试，EPUB排版不裁切。publication-pair-plan.cjs 根据解码宽高比较等高并置、等宽竖排、双图下文、双图侧文、横竖混排候选，以总显示面积与最小图片面积各半评分，在保留原顺序、比例、2倍放大上限、24px间距和80/72安全边距下选型。短文容量按Chronicle字体保守行数预算；长文另页，尺寸悬殊拆图页，文字单独续页。
publication-pair-study.cjs 生成中英各11条记录：五种组合×有短文/无文，加双图长文。沿用定稿封面、开篇、日期、暖纸、16px装订色边与青绿青黛色系；长文复用正式装饰正文页。每张图片可离线进入完整图并返回其真正来源页（含拆页的第二张图）。这是候选样张代码，没有改变App双图导出行为，等待视觉确认。
复现：python3 scripts/publication-pair-assets.py NEW_ASSET_DIR；node scripts/publication-pair-study.cjs ASSET_DIR NEW_OUTPUT_DIR。Python仅开发素材工具，依赖Pillow。

### 双图二稿：参考照片叠放，未接入正式导出
根据用户参考图改为缩小照片的错位叠放：两竖图轻微反向倾斜，不同比例保持自身尺寸比例，第一张深青绿纸边、第二张浅纸边，适度加宽照片下沿。不加入参考图图标，不使用成排网格。无字组合在页面中居中；短文固定右侧，长文另起已定稿的装饰正文页，沿用16px装订色边与暖纸背景。
publication-pair-collage-plan.cjs 从源宽高计算图片框尺寸、叠放偏移和整体缩放，验证旋转后的边界；用凸多边形相交计算前景照片框对后景实际图片的遮挡，候选上限10%（不等于主体识别或确保主体不遮挡）。叠放页有少量遮挡，但不裁切源图片，点击进入完整图后返回原位置。低分辨率和极端比例继续拆页，最大放大2倍。publication-pair-collage.cjs 生成中英五组有字/无字与长文样张；前一版对齐布局保留为历史对照，App双图正式排版尚未替换。
复现：先使用publication-pair-assets.py准备素材，再 node scripts/publication-pair-collage.cjs ASSET_DIR NEW_OUTPUT_DIR。

### 双图叠放已确认并正式接入
用户确认二稿后，album-chronicle-pair.ts 已接入 imagebookPages 正式导出，替代双图默认对齐布局：按实际尺寸计算照片框、轻微倾斜、错位、纸边和整体缩放；短文在右侧，长文复用装饰正文续页；无参考图图标。旋转角点保持安全边界，凸多边形遮挡比不超过10%。小图、极端比例及无可靠尺寸仍独立contain展示，文字另页，最大放大2倍。不进行主体识别。
两图伴随声音时保留独立声音页及原始媒体顺序；声音处于两张照片之间时强制拆图页，避免将声音挪到别处。每个完整图片入口由真实来源页生成返回锚点，拆页第二张也能准确返回。单图和三图版式、定稿封面/开篇/日期、App心情色板及原生PDF保持既有行为。
publication-pair-acceptance.cjs 直接调用正式albumEpubDocuments/buildAlbumEpub，不替换HTML/CSS；中英各11条记录覆盖五种组合有字/无字及长文。22套212项相关测试、TypeScript/ESLint/diff检查通过；中英正式验收EPUB均EPUBCheck零错误零警告，41张阅读文档完成单页、文字边界、原文完整与原图返回链接验证；8个封面/开篇/日期/书末文档与上一提交逐字节一致。未运行实际iPhone/Books验收；继续保持PR143草稿，不合并。
