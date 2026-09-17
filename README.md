# Eat — 今天吃什么？

[网页](https://nekooweb.github.io/eat/)在 TOKYO 地区1的餐饮目录中随机给出三家选择。页面地图使用 Leaflet / OpenStreetMap，Google Place ID 仅保留普通地图跳转用途。

## 当前生产状态

截至 2026-09-17，最终菜品证据整合已经合入 `main` 并通过 GitHub Pages 生产部署。当前冻结目录为 2,804 个 ID，其中公开命名记录 1,422 家；619 家有严格推荐菜（R），707 家有特色/菜单菜品（F），774 家至少有一种可展示菜品，推荐菜缺口为 803 家。

本轮相对整合前基线增加 24 家推荐菜覆盖、32 家特色菜覆盖和 34 家任一菜品覆盖；推荐菜缺口减少 24 家。最终 replay 为幂等：第二次执行的公开计数和 R/F evidence 增量均为 0。完整指标见 [`data/final_dish_integration_metrics.json`](data/final_dish_integration_metrics.json)。

随机按钮的媒体反馈也已经进入生产版本：语音从 `voice/` 中随机选择，音量固定为 45%，最多播放 2 秒；角色从 `image/` 中随机选择，并在按钮周围的多个位置随机出现。媒体资产与运行数组由仓库审计保持同步。

## 数据载入

统一维护入口：

```sh
python3 scripts/reload_data.py --outdir _audit/data-reload --database _local/eat-main.sqlite --reset
```

重置前自动备份，临时库验证成功后替换。公开包不含完整主库或嵌套采集诊断。普通代码推送不触发旧网络采集，维护任务保持手动执行；常规 Pages 构建仅执行公开构建路径。

- [当前正式发布状态](RELEASE.md)
- [开发状态与后续计划](DEVELOPMENT.md)
- [输入、处理、输出及重置](DATA_PIPELINE.md)
- [推荐菜语义契约](RECOMMENDED_DISH_PIPELINE.md)
- [最终菜品整合日志](logs/2026-09-15-final-dish-integration.md)
- [语音 / 角色效果发布日志](logs/2026-09-06-voice-effects.md)

SQLite 与网页使用同一次离线构建的输入，但 SQLite shadow export 尚未切换为网页唯一数据源。身份长尾、translation-pending 与剩余菜品证据缺口仍属于后续数据维护范围。
