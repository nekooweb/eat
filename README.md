# Eat — 今天吃什么？

[网页](https://nekooweb.github.io/eat/)在 TOKYO 地区1的餐饮目录中随机给出三家选择。页面地图使用 Leaflet / OpenStreetMap，Google Place ID 仅保留普通地图跳转用途。

## 当前数据载入

已修复数量写死、任务 schema 不匹配、失败任务遗漏和危险重置。统一入口：

```sh
python3 scripts/reload_data.py --outdir _audit/data-reload --database _local/eat-main.sqlite --reset
```

完整离线重建基线（2026-09-08）：2,804 个目录 ID、1,422 家公开命名记录、254 家有中文推荐菜、424 家有特色菜、629 家有可展示的规范化营业时间。推荐/特色菜集合有重叠，不应相加。

重置前自动备份，临时库验证成功后替换。公开包不含完整主库或嵌套采集诊断。普通代码推送不再触发旧网络采集，维护任务改为手动执行。

- [开发状态](DEVELOPMENT.md)
- [输入、处理、输出及重置](DATA_PIPELINE.md)
- [本轮根因、清理和验证日志](logs/2026-09-08-data-loading-reset.md)
- [推荐菜语义契约](RECOMMENDED_DISH_PIPELINE.md)

SQLite 与网页使用同一次离线构建的输入，但 SQLite shadow export 尚未切换为网页唯一数据源。资料缺口仍存在；本次重置没有新增网络采集。
