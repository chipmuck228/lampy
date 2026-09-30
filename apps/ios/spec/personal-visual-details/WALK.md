# 感受点缀、回看日期行、首次三屏 · 走查

Base：`origin/main` `e7580e33f01429d9945ee2d8a2b5a3980b3c4e92`（#47 merge）。  
分支 `ios/personal-visual-details`。只改 `apps/ios`。家庭入口关闭。未卸 Liuz17，未清个人库。

模拟器结果 **不是** 真机 PASS。横屏 / iPad / VoiceOver 未听音，记 **NOT VERIFIED**。

## 命令

在 `apps/ios`：

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | **FAIL**（预存：`account-screen.tsx:511` `"/account-diagnostics"` 不在 typed routes。本轮未改该文件，#47 WALK 曾记 PASS） |
| 相关 Jest（feeling-accent / recent-feeling / moment-feeling-screen / lookback-book* / first-run* / recent-reading / recent-life / personal-settings-visibility / device-lock / screen-privacy） | **PASS** 23 suites / 102 tests |
| 本轮 ESLint（改动的 ts/tsx） | **PASS** 0 errors |
| `git diff --check -- apps/ios` | **PASS** |

## 模拟器（可丢弃 iPhone 17 Pro / iOS 26.5）

Dev Client `app.lampy.ios`，Metro `127.0.0.1:8082`（本分支）。另开已擦除模拟器，**未**使用 Liuz17 数据。示意行写入该模拟器 `lampy.db`，只为拍最近/回看。

| 项 | 结果 |
| --- | --- |
| 最近：未选感受无色点、无缺省词 | **PASS**（模拟器：`只写字，没有选感受。` 无感受行） |
| 最近：七词之一有小色点，文字仍是感受词 | **PASS**（模拟器：`高兴` / `平静` 有点；点不铺整卡） |
| 最近：未知旧词原样 + 中性点 | **PASS**（模拟器：`喜悦` 仍显示，中性点） |
| 详情感受无色点（未误改共享组件） | **PASS**（模拟器：详情 `当时的感受 · 高兴` 无点） |
| 回看日期行：主 `18日`、次 `周五`、浅底 `2条`、整行展开 | **PASS**（`shots/after-lookback-date-row.png`） |
| 三类未确认仍独立，不套成某日 | **PASS**（`时间未确认 · 1条` 在书页顶，不写成 18 日） |
| 摘录 / 还有 N 条 / 七列月历 | 未加月历。摘录未在本轮展开日里走完 → 摘录 **NOT VERIFIED**（模拟器） |
| 最大字号日期行两行、不裁字 | 常规字号日期行 **PASS**。`accessibility-extra-extra-extra-large` 落到未确认页，正文折行可见（`after-lookback-xxxl.png`）。日期行最大字号 **NOT VERIFIED** |
| 运行中改字号后滚回 | 已把模拟器字号复位 `large`。滚动容器是否重建 **NOT VERIFIED** |
| 首次三屏构图与动效 | 可丢弃安装后未出现三屏，进了空「最近」（既有 skip：已完成或读库未知）。三屏运行中 **NOT VERIFIED** |
| Reduce Motion 引导 | **NOT VERIFIED**（三屏未出现） |
| 播放状态 / 本机保护 | 本轮未改代码路径。模拟器未复测播放与保护 → **NOT VERIFIED** |
| 横屏 / iPad / VoiceOver | **NOT VERIFIED** |

改前对照：`shots/before-recent.png`（#47 前「最近」，感受无色点）、`shots/before-lookback.png`（书页日期仍写「9月27日 · 星期日」）。  
改后：`shots/after-lookback.png`、`shots/after-lookback-date-row.png`、`shots/after-unconfirmed.png`（未确认入口仍独立）。

## 真机 Liuz17

本轮 **未** 在 Liuz17 走查，不把模拟器写成真机 PASS。未卸 App，未清库。

### 复测步骤

1. Xcode 打开本分支 `apps/ios`，Release 或已装 Dev Client + 本分支 Metro，覆盖安装到 Liuz17，**不要卸、不要清个人库**。
2. 最近：同日多条、混合媒体；未选感受无点；已选七词有点；若有旧词则原词 + 中性点。存储词不变。详情仍无色点。
3. 回看：展开月份 → 日期行是「18日 / 周五 / N条」而不是「9月18日 · 星期五」。进摘录 → 详情 → 返回。三种未确认入口仍独立。
4. 设置里把字号拉到最大再拉回，最近/回看不丢位置。
5. 首次引导用 **另一台可丢弃设备或擦除后的模拟器**，不要在 Liuz17 上重置。走完三屏才应写下完成；中途退出再开仍从引导来。开/关「减少动态效果」各走一遍。
6. 抽查一条声音的播放/暂停，以及本机保护开关，确认本轮没带回旧问题。

VoiceOver：日期行应读「年、月、日、星期、条数、已展开/已收起」；色点不应单独朗读。
