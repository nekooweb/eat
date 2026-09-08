# 推荐菜来源与中文字段流程

更新日期：2026-09-08。

## 固定语义

来源不需要提供中文。保留日文或其他原菜名、具体 URL、提供方、检查时间和证据片段，再确定性规范化成中文。不能根据菜系、店名或品牌常识补造菜品。

- **R / recommendedDishes**：具体菜名与来源明确表达的推荐、名物、看板、人气或 signature 等局部语义。
- **F / featuredDishes**：来源明确出现的普通菜单菜品；没有足够推荐语义时不能升级为 R。
- **C / candidate**：推测、分类模板及尚未完成身份核验的线索，只用于内部任务。

普通菜单项允许的 evidence class 包括 retained_source_menu_item、provider_promotional_dish_text、structured_menu_item、source_menu_text；Tabelog 菜单通道仍需准确分店绑定，不读取顾客评论充当菜单。

## 输入与规范化

1. `build_retained_dish_evidence.mjs` 无网络读取已保存且有来源声明的菜品事实。
2. 公开采集任务仅访问已确认的独立来源，按域名限流并遵守访问限制。
3. `recommended_dish_extractor.mjs` 使用 specific-first 菜名规则；词典只翻译来源中真实出现的词。
4. 不确定的品牌/自造词保留原文并进入 translation-pending，不强制生成中文。
5. `merge_google_inventory_detail_evidence.mjs` 以 nameZh + provider + sourceUrl + evidenceClass 去重，短期抓取失败不删除既有有效证据。
6. SQLite `resolve_dish_translation_evidence.py` 在可靠、无冲突身份上保存 recommended_dishes.zh / featured_dishes.zh，原文留在证据层。
7. materialize 阶段校验中文显示、禁止 generic/approximate filler，公开包不再携带旧 `dishes` 数组。

明确闭店、错绑或来源撤销仍需单独更正；monotonic union 不是永远不能纠错。

## 当前载入与计数

不再写死 public named count。冻结目录仍为 2,804；公开 runtime 数量、queue ID 集合和候选计划必须由同一次离线构建产生。

[run 34215698634](https://github.com/nekooweb/eat/actions/runs/34215698634)验证：

- public named runtime：1,422；
- recommendedDishes：254 家；
- featuredDishes：424 家；
- 任一中文菜品：486 家；
- 无中文菜品：936 家；
- approximate / generic filler：禁止。

推荐与特色集合有重叠，不能直接相加。SQLite eligibility 与 generated runtime 当前仍不同，两者的菜品覆盖也必须分别报告。

## 任务与执行

统一刷新命令：

```sh
python3 scripts/reload_data.py --public-only --outdir _audit/data-reload
```

该命令只重新载入已有数据并生成队列，不访问餐厅页面。完整主库重建省略 `--public-only`，需要重置时显式加 `--reset`。

公开 dish batch plan 在这次验证中有 1,230 个工作行：
official_crawl 270、retained_source_mining 597、independent_source_discovery 301、official_or_retained_featured 62。

这些公开工作行与 SQLite 的 2,641 active tasks 不属于同一指标，不能相加。所有采集 workflow 需手动触发；不得将普通代码 push 当作全量采集指令。Tabelog 访问受限时使用 retained evidence，不进行规避式重试。

## 门禁

- 目录完整、公开/queue ID 集合一致。
- 来源、分店身份和原文可追溯；R/F 不越级。
- 中文规范化不得吞掉 specific dish，无法确定时保留 pending。
- 禁止付费 Google 数据接口、登录或验证码绕过。
- 同一推荐组合大量重复触发人工审查，不通过模板填充来增加覆盖。
- 仅真实 accepted evidence 可改变字段；规划成功不等于采集完成。

完整载入、重置、备份和发布说明以 [DATA_PIPELINE](DATA_PIPELINE.md) 为准；过去阶段的 run 数量见日期型历史日志。
