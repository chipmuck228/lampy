# Lampy iOS

Expo SDK 57 Development Build。当前可运行范围是本机个人 Moment：文字、最多三张照片、一段现场录音、可选的当时感受、草稿恢复、最近、精确 id 详情。权限拒绝、磁盘不足、复制失败和部分媒体不可用时保留已写文字与可恢复草稿。

```bash
npm run check-env
npx expo run:ios
```

不要用 Expo Go 作为发布前验证。不要在这里改仓库根目录的微信领域代码。

规格与决策（均在 `spec/`）：

- 产品：`LAMPY_APP_PRODUCT_DESIGN_GUIDE.md`
- 审计：`PHASE_0_DOMAIN_AUDIT.md`
- 实施拆分：`PHASE_0_IMPLEMENTATION_PLAN.md`
- 未实现能力：`PHASE_0_UNIMPLEMENTED.md`
- 验证：`PHASE_0_VERIFICATION.md`
- ADR：`adr/0001`–`0004`（Expo、共享边界、SQLite/文件、家庭同步隔离）
