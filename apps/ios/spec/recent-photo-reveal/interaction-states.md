# 照片显现：状态

每张**已显示的** Recent 照片各有一份显现状态。状态属于这张照片在这次阅读里的注意过程，不属于 Asset 或 Moment 领域对象。

---

## 1. 状态

| 状态 | 含义 |
| --- | --- |
| `not-seen` | 还没被这次阅读注意到。照片已在布局里（opacity 约 0.85，下移 8pt），不是隐藏。 |
| `revealing` | 已进入视口，正在按原则表走完一次显现。 |
| `revealed` | 这次阅读已经注意到。保持最终样子（opacity 1，translateY 0）。 |

缺失照片、加载失败、未知媒体：没有显现状态。不进入 `revealing`。

---

## 2. 转换

```
not-seen
  ↓ 进入 viewport
revealing
  ↓ 动画完成
revealed
```

规则：

- `revealed` 之后保持。不得回到 `not-seen` 或再进 `revealing`。
- 不重复播放。滚出再滚回、快滑经过、停在中途再继续，都不得再闪一次。
- `revealing` 中途离开视口：仍把这一次走完到 `revealed`（或立刻落到 `revealed`），不要取消后再播。
- 返回页面可恢复：进程内离开「最近」（详情、回看、留下）再回来，已 `revealed` 的保持。不要在返回时整页重播。
- 冷启动、杀进程：不要求记住显现状态。下次打开按阅读重新显现即可。
- 不要把显现状态写入 Moment / Asset / ViewModel / 路由参数。

首屏已在视口内的照片：等用户开始阅读滚动、或该照片被判定进入视口后再从 `not-seen` 进入 `revealing`。禁止在页面 `load` / 首帧用定时器自动开播。若实现时「进入视口」在首帧就成立，仍只允许每张一次，且 Reduce Motion 直接 `revealed`。

---

## 3. Reduce Motion

系统开启 Reduce Motion：

- 直接 `revealed`
- 不播放动画
- 初态也不停留在 0.85 / 8pt

未开 Reduce Motion：走 [`design-principles.md`](./design-principles.md) 的推荐表。
