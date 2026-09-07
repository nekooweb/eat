# 2026-09-07 Refactor mode 与新主库开发基线

## 本次完成

- 将整体流程进入 `EAT_REFACTOR_MODE=1`，为数据库、resolver 和 export 重构降低旧架构审查阻断。
- 保留硬门槛：禁止付费 Google 数据 API、基础语法、2,804 冻结目录完整性/唯一性、已知距离不越过 1.2 km、敏感/受限制字段不进入公开 runtime、Pages fallback 可构建和部署。
- 将旧 canonical/overlay/normalized-field/source-binding/strict provenance/coverage/dish-first queue 等旧模型检查改为 warning 或 report，不再因旧数据模型暂时不一致阻断整个重构。
- 数据库契约 workflow 进入 refactor mode：Python 语法仍阻断；关系模型业务测试在重构阶段允许以 warning 形式失败，后续切换前恢复新架构 strict checks。
- 更新开发主线：persistent SQLite → retained source migration → unified resolver → catalog/recommendation exports → regression → Pages cutover → incremental enrichment。
- 明确 catalog 与 recommendation 分离：2,804 个 Place ID 全部保留在 catalog；`id_only` 不应自动进入推荐池，也不再使用伪店名。
- 明确第一批迁移对象：2,804 catalog、760 retained bindings、5 组/10 条 provider-ID conflict、535 Hot Pepper records、353 条 hours/closure raw text、rich metadata/source facts/provenance/dish evidence。
- 明确关键语义修复：`openingHoursText` / `closedText` 分离 raw 与 normalized；`N以上` 保存开放上界；失败请求不覆盖 known observation；derived field 保存 rule/provenance。
- 明确每批开发完成后必须同步更新 `DEVELOPMENT.md`、相关架构/数据文档和 `logs/`。

## 当前仍未完成

- 尚未创建 persistent `main.sqlite` 或正式 migration runner。
- 尚未迁移 535 条 Hot Pepper 数据到 SQLite。
- 353 条营业/休息日原文尚未写入新主库或替换旧 runtime。
- 5 组 reused provider ID 尚未进入生产 conflict resolver，只在原型中验证过。
- 新 catalog/recommendation export 尚未生成。
- Pages 仍使用旧 runtime fallback。

## 下一批开发

1. 创建 production SQLite 初始化/迁移脚本与版本目录。
2. 导入 2,804 catalog 和 760 retained bindings，验证幂等与 conflict quarantine。
3. 实现 Hot Pepper retained adapter，先处理 353 条 hours/closure regression。
4. 建立最小 resolver 和第一版 catalog/recommendation export。
5. 用 warning-mode CI 做新旧 output diff，不提前拆除旧 fallback。
