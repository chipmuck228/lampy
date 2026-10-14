# 阶段 C：个人册打印 PDF、冻结与本机保存

最新状态（2026-10-14）：#112 已普通合并至 main `6a4ad7672577f588d2b4bb08f5da5cdf9efaa9d9`。用户报告 `97a935e` 后 emoji 真机测试通过；同册追加及新册生成测试通过。开发入口仍默认关闭，未开放正式导出。下方待编译／失败段落是历史记录，不能覆盖此状态；字体、复杂emoji、实纸、iPad、大册与独立文件检查仍须各自验收。阶段 D 见 ../offline-d/README.md。

基线：#111 普通合并 `683e0c9ae751ad99467218b89a94fc92d4555e34`。分支：`ios/life-album-print-c`。阶段 B 真机功能／模拟器视觉报告仍保留；本阶段改了原生模块，不能沿用旧构建声称 C 已通过。

## 实现与门控

双门控：`__DEV__` 且 `EXPO_PUBLIC_ALBUM_PRINT_EVAL=1`。个人册菜单「打印验收」与直接路由都检查；Release即使配置变量也不开放，正式导出／付费未完成。

一次明确「生成并保存测试PDF」：读取当前个人册→有效来源核对→真实字体诊断→冻结白名单内容／媒体副本→Core Text分页→原生按页写PDF→重新打开核对→再次复核来源→写manifest及校验和→同文件系统移动目录发布。成功前没有新成品或自动分享。

- 新片遇到缺记录、缺媒体、未知媒体类型时阻止并提示核对；不静默省略或自动移出。完整“带缺失说明继续”交互尚未实现。
- native按64KiB流式SHA-256；媒体复制前／后及生成后核对来源字节。声音不整段载入JS。复制不改原记录／原媒体。
- 精确A5 148×210mm（419.527559×595.275591pt），布局 `album-a5-v5`。共用风格、Unicode原文、原比例整图；长文避免单行尾段，未知时间续页不继承上条日期。纸页／PDF页码一致；声音保留标记、时长与单独一行“在电子册中听”。PDF不含声音，电子册文件包属于D。
- 核对标题、开篇、正文标量范围、照片／声音次数、重叠与边界。PDF重新打开核对页数、物理尺寸、可选择标题／开篇／正文；未通过即清理，不交付混版本输出。
- 字体记录请求名、实际解析PostScript名、Core Text字形运行字体。用实际解析名测量和绘制，不把回退当Songti命中。
- CGPDF真实FontDescriptor／DescendantFonts检查FontFile／FontFile2／FontFile3；Type3检查CharProcs。未知资源／未检查Form保持 `fontsEmbedded=null`，不靠关键词。可保存带明确“未确认／未完整嵌入”标记的**测试成品**，不能当正式嵌入PASS。
- manifest包含固定内容、排版、风格、诊断、媒体SHA、PDFSHA及生成时间；相对媒体文件名，不保留原作者路径。每次新ID，旧成品不改写；ID碰撞不能清理旧成品。
- 取消、失焦、后台、锁定作废资格；迟到结果不能显示或发布。失败清理本任务暂存；提交中失效清理本任务已发布目录。清理失败明确失败；新进程首次使用清理中断暂存，不删除已完成成品。
- 已保存版本在同册打印验收页重开可见，UI只保留摘要。另一次“保存或打印PDF”复查PDF SHA及当前资格，打开系统面板。取消面板不删除本机成品、不重复生成；已交付外部副本不能追回。
- 来源像素尺寸与纸上尺寸计算DPI，低于300提示核对，不上采样；缺尺寸为未知。极长图整张缩入纸页，需实页核对是否过小。

## 保存边界

应用私有 `Documents/album-print-evaluation/print_*/` 下为 `manifest.json`、`manifest.sha256`、`album.pdf`与`media-N`。这不是 `.lampy` 文件包或外部阅读器；不对外分享该目录／字体／原始媒体副本。图片原始副本只留私有验收目录；D打包前需剥离照片元数据。PDF通过像素绘制不复制照片EXIF。

用户通过系统面板保存到Files的PDF独立于来源册。原文后来改动不修改旧PDF，再生成新版本。卸载应用会丢失私有验收目录，不把美化PDF当原记录备份。不承诺PDF/X、CMYK、专业印厂或云声音二维码。

## Mac启动与验收

在已有本地仓库根目录，从新main的阶段C远程分支建立独立工作目录，保留B目录：

```bash
git -c http.proxy=http://127.0.0.1:7897 fetch origin
git worktree add -b ios/life-album-print-c-dev \
  /Users/zhen/WeChatProjects/lampy-life-album-print-c \
  origin/ios/life-album-print-c
cd /Users/zhen/WeChatProjects/lampy-life-album-print-c/apps/ios
npm ci
npm run check-env
npx expo prebuild --platform ios --no-install
EXPO_USE_PRECOMPILED_MODULES=0 pod install --project-directory=ios
EXPO_PUBLIC_ALBUM_PRINT_EVAL=1 npx expo run:ios --device
```

选择模拟器。新增Swift文件须pod install和原生重编，只重载Metro不足以验证。后续迭代 `EXPO_PUBLIC_ALBUM_PRINT_EVAL=1 npm start -- --clear`。

从连续阅读页选素纸／手作→个人册菜单→打印验收→生成并保存测试PDF→保存或打印PDF。逐项比较「看纸页」和保存的PDF完整册。

必测（全部新增原生／设备待验收）：

1. 中文／英文、长标题／开篇、长文、段落、emoji混排；全文一致，可选择，无缺字／截字／孤立日期。
2. 两风格，横／竖／极长图、三图、低清图、声音与未知时间；纸页/PDF页数与页码一致。真实A5按100%比例打印，检查边距、字号、纸色、清晰度。
3. 生成中改记录／封面／媒体，删除或不可访问；明确失败，无混版本，原记录不变。完成后改源记录／移出／删源册，外部保存的PDF不变。
4. 重复点按、取消、离页、换册、后台、锁定；无迟到成品／私密回填。过程中杀进程，下一次清理暂存；完成后杀进程仍能重开已保存版本。
5. 无空间、媒体损坏、native缺失、分享取消、保存PDF被改写；不假成功、不静默缺图、不误删旧版，失败可重试。
6. 停Metro后打开外部PDF，选择文字、查看比例与声音提示。系统分享／打印面板、iPad面板、系统VoiceOver实测。
7. 大册、长音频、大图时间／内存／取消响应。文件校验分块、PDF按页写，但图片解码／PDFKit检查峰值内存仍待测，不能由Jest推导通过。

## 独立文件检查

从模拟器／设备应用容器取出对应 `print_*` 整个目录到Mac临时路径。仅有Files中的PDF不足以核对冻结媒体。

```bash
python3 -m pip install pypdf
# --render 还需要系统 Poppler（pdftoppm）。
python3 scripts/inspect-album-print.py /实际路径/print_xxx --render
```

脚本独立核对manifest／PDF／媒体SHA、A5、页数、可选择正文，递归读字体资源；`--render`输出页PNG。逐页人工查看PNG及实纸；解析成功仍保持 `visualReview=NOT_VERIFIED`。

## 当前证据限制

本环境没有Xcode／Swift/UIKit，未编译新增Swift、未生成native PDF，也没有真实字体嵌入、PNG、实纸或新增设备PASS。独立检查脚本只做语法检查，未拿native文件运行。原生签名及文件行为须Mac验证，不能用合成PDF代替真实输出。

阶段C为实施候选，保持草稿待验收。D–F、#109不纳入，不部署服务器／不上传TestFlight／不开放正式导出。

本轮自动检查：TypeScript、15个变更TS/TSX文件ESLint、git diff --check PASS；相关Jest 16 suites / 83 tests PASS。Python独立检查脚本语法PASS，实际文件检查未运行。没有跑／宣称全量Jest PASS，旧页面act警告与既有全量基线失败状态保留。


## 首次Mac构建反馈修正

2026-10-14用户报告三处Swift编译错误：CGPDFPage.dictionary和CGPDFStreamGetDictionary的结果为可选值，新增显式解包；已安装ExpoModulesCore的Promise.reject仅有Error／Exception单参数或code+description双参数重载，原三参数调用改为双参数，保留脱敏错误。异常catch同样修正。构建脚本依赖分析警告与这三项编译错误无关，本次不修改该脚本。当前环境没有Xcode，不称重新编译通过；需Mac再次构建。


## 模拟器首次文件与再次生成反馈

2026-10-14用户报告：首次PDF可以生成并保存到系统Files；同册新增记录后再生成、新册加入记录后生成均显示通用失败提示，其他模拟器测试正常。运行版本目标ce81e8e，实际JS SHA未独立核实；不据此称独立字体／打印／真机验收通过。

此次移除纸页顶端重复“第N页，共M页”，保留纸内页码，并补24pt顶部留白。对再次生成失败，尚无原生具体异常，未宣称根因已修复；新增固定阶段／错误码／原因诊断，不输出正文、册名、媒体路径或任意native错误原文。PDF页数、文本、尺寸、字体运行与排版完整性校验继续保留，失败清理不放宽。

应用层新增“追加记录后第二次生成”与“前一册生成后新册生成”回归，能成功并保留旧成品；这些测试使用测量／PDF端口double，不替代真实native复现。诊断将区分READ_SOURCE、CHECK_INPUT、BEGIN_STORAGE、COPY_MEDIA、LAYOUT_CHECK、WRITE_PDF、PDF_CHECK、VERIFY_MEDIA、RECHECK_SOURCE、WRITE_MANIFEST、COMMIT／CLEANUP；若失败请提供页面底部固定诊断行，例如PDF_CHECK / INVALID_PDF / PDF_TEXT，再定位真实原生问题。

本次只有TS/TSX与文档，不需要重编Swift；拉取新提交后重启带EXPO_PUBLIC_ALBUM_PRINT_EVAL=1的Metro或重载JS即可。再次生成失败仍保留为阻塞验收项，PR #112保持草稿。

本轮新运行TypeScript、6个变更TS/TSX ESLint、git diff --check PASS；相关Jest 4 suites / 29 tests PASS。包含同册追加再生成、新册生成、诊断脱敏、PDF文本失败分类和纸页导航回归；未用新的native真实文件验证失败根因。

### Color emoji text validation

User's simulator comparison isolated emoji-bearing records as the PDF_TEXT trigger. The checker now excludes only UTF-16 ranges actually shaped as AppleColorEmoji by CoreText; ordinary segments on each line must match in order. Original content and drawing are unchanged. The manifest records exact color ranges, nonColorTextSelectable, and emojiVisualCheckRequired; textSelectable remains false when color glyphs need visual review. The saved-edition UI and independent inspection script report emoji as NOT_VERIFIED, not full text-selection success. Native rebuild and exported PDF visual validation, including lobster/poop, ZWJ, modifiers, flags and emoji-only text, are still required.
