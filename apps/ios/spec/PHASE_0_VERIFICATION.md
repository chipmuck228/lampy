# Phase 0 验证报告

机器：macOS 26.6，Xcode 26.6，Node v24.7.0。日期：2026-09-25。

本轮是「当时的感受」（分支 `ios/emotion-moment`，PR #7）。基线已更新到 `origin/main` = `3043b95`（回看 PR #5 已合并）。不覆盖回看浏览位置或媒体失败恢复语义。

| 命令 | 工作目录 | 结果 |
| --- | --- | --- |
| `npx tsc --noEmit` | `apps/ios` | 待重跑 |
| `npx expo lint` | `apps/ios` | 待重跑 |
| `npm test` | `apps/ios` | 待重跑 |
| `npx expo run:ios --device "iPhone 17"` | `apps/ios` | 待重跑 |
| `git diff --check` | 仓库根 | 待重跑 |

## 自动化覆盖

- exact / day / month / year / unknown 五种精度的浏览位置（回看已在 main）
- 未选择感受时，纯文字、仅照片、仅声音和混合内容均可保存
- 选择、改选、清除感受；只选感受不能保存
- 选择感受不改 `recordedAt` / `occurredAt` / Asset / 个人范围
- 草稿重启后恢复同一 draft id 与已选感受
- 保存失败后感受仍在草稿，重试不重复创建 Moment
- 未知旧值（如微信词表「喜悦」）在最近、详情、回看日页和未确认页原样显示，不改写存储
- 词表映射不做趋势、评分或诊断

见 `apps/ios/spec/adr/0005-lookback-browse-placement.md`。

## 未验证

| 项 | 说明 |
| --- | --- |
| 真机选择、清除、草稿恢复与详情 / 回看展示 | **未验证** |
| 真机 VoiceOver 读出选中状态 | **未验证** |
| 真机超大字号换行 | **未验证** |
| 真机杀进程后草稿感受仍在 | **未验证** |
| App Store / 签名发布 | **未验证** |

以上真机项不能用编译或模拟器结果代替。

## 根目录领域回归（只读，未改代码）

本轮未改微信领域文件，未重跑根目录 `npm test`。`content.emotion` 仍是可选自由字符串，词表只在 iOS 展示层映射。
