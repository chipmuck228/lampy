# ADR 0002：TypeScript / JavaScript 共享边界

状态：已接受（Phase 0）
日期：2026-09-24

## 决策

1. **一份领域真相**：Moment / Asset / Transmission 语义以根目录 `domain/` 与 `spec/moment-*.md` 为准。
2. **不复制领域文件**进 `apps/ios`。禁止维护第二套会漂移的字段。
3. **不把根目录改成 TypeScript 工程**，也不为 iOS 改微信领域代码。
4. iOS 通过 `apps/ios/src/domain-adapters/` 调用或包装现有 CommonJS 模块。
5. 下一轮垂直切片优先：在 iOS Jest 里 `require()` 根目录领域模块跑同一套不变量；若 Metro 打包需要，再用极薄 adapter 做 ESM interop，**不改命令语义**。
6. 展示层语言（最近 / 留下 / 回看）只存在于 Projection / ViewModel，不重命名存储实体。

## 依赖方向

application 协调仓库和领域命令。projection 只接收已经读取的数据，生成只读 ViewModel。**Projection 不得自行查询 SQLite 或文件系统。**

```text
screens / routes
    → application（use cases）
         ├→ domain-adapters（领域命令 / 不变量）
         ├→ infrastructure（仓库、文件、权限）
         └→ projections（对已读取数据做只读 ViewModel）
```

禁止：UI → SQLite / 文件系统。禁止：projection → infrastructure。禁止：infrastructure 依赖 React 组件。

## 后果

- 根目录 `npm test` 继续是领域回归门。
- iOS 新增的「最多 3 图 / 最多 1 音频」约束放在 application，并加测试；暂不改 `attachAsset`。
- 若未来把领域迁成双端可 import 的 TS，必须仍是**一份**源，另开 ADR。
