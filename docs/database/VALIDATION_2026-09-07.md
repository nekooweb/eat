# 数据来源与导入流程验证

日期：2026-09-07。输入提交：`bb503c159f8908af8b6c9c6c3a16a371e46b56e5`。

## 验证边界

通过 GitHub 插件读取固定提交的关键文件，在内存中解析 JSON 及已知 JSON 赋值包装；未克隆仓库到本地编辑。公开来源通过网页工具抽样读取。关系模型使用 SQLite 3.53.3 内存数据库演练。

未执行批量网络采集、永久主库建立、生产数据修改或主库到 Pages 端到端发布。本次不存在可以声称已创建的本地备份文件。

## 已重算的数据

| 项目 | 结果 |
| --- | ---: |
| 冻结目录 / 唯一 ID / 运行时条目 | 2,804 / 2,804 / 2,804 |
| 运行时 ID 集合及顺序 | 完全一致 |
| 有名称及坐标 / 仅 ID | 1,411 / 1,393 |
| 地址 / 非泛化菜系 | 1,073 / 1,249 |
| 午餐 / 晚餐预算 | 165 / 607 |
| 规范化时间 | 363 |
| 推荐 / 特色 / 任一种菜品资料 | 186 / 181 / 295 |
| 基础绑定 / 唯一来源 ID | 760 / 755 |
| Hot Pepper catalog / rich | 535 / 135（有重叠） |
| 菜品证据记录 / 项目 | 211 / 283 |
| 提供方事实记录 / 涉及 ID | 575 / 447 |
| 来源链接 / 涉及 ID | 644 / 447 |
| Overture / OSM 候选 | 3,908 / 1,273 |

原运行时 `cuisineKnown=1411` 只检查非空，因此包括「餐厅」等泛化分类。重新按非泛化定义得到 1,249，后续必须固定统计口径。

## 已确认问题

### 营业字段未映射

[旧运行时构建器](../../scripts/build_google_inventory_runtime.mjs)读取 `facts.open / facts.close`。实际 [Hot Pepper 留存格式](../../data/hotpepper_catalog_facts.json)使用 `facts.openingHoursText / facts.closedText`。

全量关联检查发现 353 条 source-matched Hot Pepper 运行时记录都有这两个原文字段，却没有运行时营业时间。这是确定的映射缺失。本次仅记录并作为新适配器回归条件，未修改运行时代码。

### 身份关联不能只检查 Place ID 唯一

760 条基础绑定没有重复 Place ID，但有 5 个提供方来源 ID 各绑定两个 Place ID：

- Overture：Venchi Otemachi One Store。
- Hot Pepper：J004403751，酔助 水道橋店。
- Overture：Hub Tokyo Dome City LaQua。
- Overture：edge。
- Overture：とんかつ まい泉食堂 エキュートエディション御茶ノ水店。

这是复用/可能重复 listing 的核对队列，不是已经证明其中哪个 ID 错误。内存模型保留所有 10 条绑定，标为冲突且不选择 canonical 名称。完整 ID 清单在 [机器报告](validation-2026-09-07.json)。

### 预算与推荐仍需语义校验

旧运行时存在对「N 以上」人工增加 2,000 上界的代码。本次没有在当前 Hot Pepper budget.name 中发现开放区间，不能宣称已有多少价格被该分支污染；新适配器仍必须移除这种假定。

菜品证据的 283 个项目都具备 URL、日期及证据片段。但格式完整不能证明每个片段都充分支持「严格推荐」；应保存为原始证据再执行统一语义规则。

### 多套派生数据仍然并存

输入树有 82 个数据文件、40 个 enrichment 分片、37 个 workflow。旧矩阵/队列仍有不同口径。新管线不得把它们相互回灌当作新证据。

## 公开来源抽样

Bondy 分店页与菜单、ベト屋神保町分店页可以读取多个字段；后者历史节假日区块存在日期异常，需排除该区块。Google Maps、Royal Host 和豚山样本未通过本次工具访问，不把工具错误解读为店铺不存在。

文档层面已验证 Hot Pepper 的 Key 和批次要求、Overture 的公共资料入口、Geofabrik Kanto 区域文件及 SQLite 一致性备份方式。[来源链接与方法](SOURCES.md)。

这些检查不是全部网站可访问性、最新营业状态或完整字段覆盖证明。

## 内存导入与恢复检查

运行真实 2,804 个目录 ID 和 760 条基础绑定，12 项检查通过：

1. 2804 exact inventory IDs imported
2. 760 retained bindings imported twice without duplicate growth
3. 5 reused source IDs / 10 bindings quarantined as conflicts without selected canonical name
4. unknown new observation does not erase the selected known name
5. duplicate directory key rejected
6. unknown Place ID source binding rejected
7. cross-place/cross-field resolution rejected by composite foreign key
8. known field without value rejected
9. malformed JSON rejected
10. failed batch rollback preserves original rows
11. SQLite backup/restore in memory preserves 2804 IDs and referential integrity
12. final foreign-key audit clean

最终内存表：2,804 条目录、755 条去重来源记录、760 条绑定、761 条观察（含 1 条空值回归样例）、760 条字段采用/冲突记录。不是永久数据库中的实际计数。

复现命令：

```sh
python3 docs/database/validate_schema.py
```

脚本只读取当前仓库的两个源 JSON 和本目录 SQL，校验输入 blob SHA，在内存中测试并输出 JSON。它不访问外网、不写本地文件、不调用任何 Google 数据接口。

## 尚待实施验收

公开 Google 页面采集成功样本、批量任务恢复、营业规范化、预算和推荐语义、公开字段白名单、真实备份侧文件完整性、持久库恢复及网页切换，都需要在实际实现后单独测试。本次不将它们标记为已完成。
