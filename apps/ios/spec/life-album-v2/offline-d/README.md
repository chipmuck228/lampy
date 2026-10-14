# 阶段 D：离线生活册文件与按次打开阅读

阶段 C 已经普通合并：PR #112，main `6a4ad7672577f588d2b4bb08f5da5cdf9efaa9d9`。
本阶段独立分支 `ios/life-album-offline-d`。实现候选，未称原生编译／系统文件打开／跨设备离线验收完成。

## 成品与边界

- 创建入口仍为 `__DEV__` 且 `EXPO_PUBLIC_ALBUM_FILE_EVAL=1`，位于打印验收的已生成版本下「制作生活册文件」。同时需要开启阶段 C 的打印验收开关。制作使用选中的固定版本，不重新读取原 Moment；需要新版时先生成新的阶段 C 成品。
- 一个 `.lampy` 文件，标准 ZIP 的严格 stored 子集（method 0、无加密、无描述符、无额外字段、无压缩）。内部只接受 `book.json`、`album.pdf`、受控 `media-N.png/m4a`，不泛化为任意 ZIP 解包器。
- 版本 1 清单使用明确白名单：册名、开篇、风格、时间精度、原文、相对媒体、PDF与媒体 SHA、字体策略。没有原记录／用户／家庭 ID、来源绝对路径、服务端地址、token。读入时产生本次会话 ID。
- 同一 C 快照的 PDF 原样复制并核对 SHA；照片经 ImageIO 按方向重新编码 PNG，源 EXIF 不进入输出，新尺寸用于阅读比例。音频导出 AppleM4A 并清空容器 metadata，声音内容与质量、标签是否完全去除须实文件检查；不称原音频字节不变。媒体不进入全册 Base64。
- 不分发未经许可的系统字体二进制。文件记录实际系统 PostScript 字面及 `system-not-redistributed` 策略。接收设备缺所需字面时拒绝，不静默改字体；完整合法字体打包和跨系统字体可移植性仍待后续字体方案。连续阅读版本固定为 readingVersion 1，未知版本拒绝。
- 「生成」与「保存成品」分开；只有 UIDocumentPicker 导出确认回调才显示保存完成。取消保存不称成功，可以再保存。不依赖付费或家庭账户，不展示购买。
- 外部文件通过 iOS Viewer 文件类型和既有 native-intent 入口，直接进入只读连续阅读；保留原家庭邀请路由校验。无「导入」、分类、永久收藏或首页条目。外部入口跳过首次记录引导，不读取个人记录库。
- 外部阅读复用连续阅读呈现，禁止改风格、生成新成品或跳到来源工作册。照片、声音来自本次校验后的会话目录。位置／播放进度仅在组件会话内，关闭不写工作册位置或 recent 播放历史。
- 关闭暂停并释放播放器，然后清理本次目录；重复打开当前文件聚焦同一 token；新文件作废旧任务，等待旧任务结束后清理，旧标题不能覆盖新册。后台只是暂停／遮挡，不等同于关闭；进程结束不恢复文件，需从原文件再次打开。
- root 启动首次清理临时目录，临时根目录排除备份。读取使用 NSFileCoordinator 和 security-scoped URL，在本次读取结束释放权限，不删除外部原件。文件提供者／微信可能维护自身副本，不承诺控制外部副本。

## 校验与容量候选

本切片限制 512MiB、512个文件、2000条记录、4MiB清单、PDF不超过2000页、静态图片单边16000像素且不超过4000万像素、声音不超过24小时；这是保守开发上限，不是设备压测通过结果。打包后用原生读取器重新打开校验并清理验证目录，保存前再次检查整个文件SHA及资格。生成前估算已有文件量与空间，PNG重编码／音频重封装后的最终体积再次核对。资源极限与取消响应必须由设备测试调整。

原生先核对 ZIP footer、central/local 一致性、连续偏移、受控文件名、重复名、CRC和可用空间，再解到随机会话目录。拒绝穿越、绝对路径、压缩炸弹、链接／脚本／隐藏额外文件、未知格式。校验PNG类型和像素上限、可读音轨、PDF可打开且无catalog主动动作／JavaScript入口，再核对清单 SHA 与全部引用。PDF检查并非通用恶意PDF净化器；候选包来源不被当成已认证发送者，CRC/SHA只表示完整性。

取消不强行中断正在执行的媒体编码／协调读取；作废资格，待原生步骤结束后清理。无空间、损坏、字体缺失与未知版本显示失败，不回退为不完整成品。异常退出后的临时残留在下次启动重试清理。

## Mac 测试

使用新的 worktree，不改 C 测试目录；已有同名分支时不要重复 `-b`，可按指定提交 detached 测试。

```bash
cd /Users/zhen/WeChatProjects/lampy-life-album-local
git -c http.proxy=http://127.0.0.1:7897 fetch origin
git worktree add --detach /Users/zhen/WeChatProjects/lampy-life-album-offline-d origin/ios/life-album-offline-d
cd /Users/zhen/WeChatProjects/lampy-life-album-offline-d/apps/ios
npm ci
npm run check-env
npx expo prebuild --platform ios --no-install
EXPO_USE_PRECOMPILED_MODULES=0 pod install --project-directory=ios
EXPO_PUBLIC_ALBUM_PRINT_EVAL=1 EXPO_PUBLIC_ALBUM_FILE_EVAL=1 npm run ios -- --port 8083
```

新 Swift、文档类型与原生 ABI 必须重编；只重载 Metro 不足以测试。之后仅 JS 迭代可以使用两个开关启动 `npx expo start --dev-client --clear --port 8083`。

必测：

1. 原工作册包含中英、emoji、照片与声音，先生成测试 PDF；在该成品下制作文件、取消保存、再次保存到 Files。生成完成不显示保存成功，系统确认后才显示。
2. 在 Files 对 `.lampy` 使用「用 Lampy 打开」（必要时分享面板中选 Lampy）。直接阅读、能播声音、照片方向比例正确；不出现个人册条目、来源编辑或永久导入流程。
3. 完整获取文件后断网、退出原家庭账号、停止 Metro（使用可脱离 Metro 的原生构建）；仍可读听。Development Build 停 Metro 不能证明 JS离线启动，正式离线验收需独立打包 JS 的构建。
4. 同文件重复打开不叠播放器；另一个文件到来时不回填旧册。关闭后从原文件重开从封面开始；杀进程重启不自动恢复外部册。
5. 保护开启时后台／锁定／认证无标题、正文、照片泄露；声音暂停且不自动恢复。当前会话解锁后保留位置，关闭后临时目录清理，不删 Files原件。
6. 损坏、未知版本、穿越、重复名、压缩条目、超额、缺失音轨／图／PDF、SHA不符，明确失败；取消或关闭正在读取／编码的任务无迟到成品。无空间与清理失败可重试。
7. 源照片有 EXIF定位与旋转、音频有标签；独立查输出元数据／方向／音效，连续版与内含PDF一致。复杂emoji、字体缺失、iPad保存面板、大册内存和取消时间另行实测。

独立只读检查（不解包到文件系统）：

```bash
python3 scripts/inspect-album-file.py /实际路径/一册.lampy
```

脚本核对 stored容器结构、CRC、SHA、引用与PNG EXIF，保留 nativeRoundTrip／audioMetadata／visualReview 为 NOT_VERIFIED。合成脚本夹具与端口 double 只能验证代码／容器逻辑，不能当作原生Round Trip通过。

## 本轮自动检查

TypeScript、25个新增／变更TS/TSX与插件文件ESLint、git diff --check通过；相关Jest 13 suites / 84 tests通过，含来源隔离、取消、迟到读取、保存取消与系统确认、清理重试、原有声音／引导／PDF回归。6项独立容器Python回归通过。新增Swift、真实PNG与音频编码、native容器往返、系统保存／外部打开未在本环境运行；不称全量Jest或全设备通过。
