# 回看书页 C′ 实现走查

实现 PR 基于 `origin/main`（#37 merge `a556a87`）。**没有**从 #36 年页展开分支开发。#36 仍 OPEN。

Jest 与本目录 storyboard **≠** 原生页面 PASS。

## 本机命令（实现提交时）

在 `apps/ios`：

- `npx tsc --noEmit`：通过
- `npx jest --no-coverage`：88 suites / 492 tests 通过
- `npx expo lint`：3 errors，均在既有 `leave.tsx` / `share/[id].tsx`；本书页文件无新增 error
- `git diff --check`：通过

Jest 与本目录 storyboard **仍 ≠** 原生页面 PASS。

## 运行中页面

本轮实现提交时**没有**在模拟器或真机上走完下列路径。全部标 **NOT VERIFIED**，不得用 Jest 顶替。

| 路径 | 结果 |
| --- | --- |
| 稀疏月：展开有记录的一个月，选一天，看见摘录 | **NOT VERIFIED** |
| 密集月：摘录跟在选中日下，换日旧摘录消失 | **NOT VERIFIED** |
| 同日多条：最多 2 条，「还有 N 条」进日页 | **NOT VERIFIED** |
| 长文 6 行截断、三图只显示 1 张 | **NOT VERIFIED** |
| 仅声音：播放与「看这条」分点 | **NOT VERIFIED** |
| 时间未确认 / 月份未确认 / 日子未确认 | **NOT VERIFIED** |
| 最大字号可滚可点 | **NOT VERIFIED** |
| 最近 → 回看 → 详情 → 返回 | **NOT VERIFIED** |
| 冷月深链 `/lookback/:year/:month` | **NOT VERIFIED** |
| 冷日深链 `/lookback/:year/:month/:day` 再返回书页 | **NOT VERIFIED** |
| 展开/换日/进详情再回后的声音状态 | **NOT VERIFIED** |
| 横屏 | **NOT VERIFIED**（#34） |
| iPad | **NOT VERIFIED**（#34） |
| VoiceOver | **NOT VERIFIED**（#34） |

月/年精度：留下页仍只能写 `day` / `unknown`。用户路径无法创建。仓库测试可读既有 `month` / `year`。

## 建议复审时的设备走查

Dev Client `app.lampy.ios`，运行中用 `lampy:///lookback/2026/09`（三斜线）。不要用 `exp+…/--/lookback`。
