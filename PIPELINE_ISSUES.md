# 数据识别逻辑、问题与修复状态

更新日期：2026-09-10。当前统计基线：`ac33c147504457e518e9c053c38c2554ef6783f9`。

## 统计必须分层

- 全量目录：2,804 个 Place ID。
- 当前主线 public named runtime：1,422 家，未公开 1,382 条。
- 当前主线推荐菜 590 家、特色菜 656 家、任一中文菜品 725 家；集合有重叠，不相加。
- 当前 recommendation gap：832；其中官网线索 224、留存第三方 318、需要新来源 290。
- 数据提交、SQLite 构建、生产部署是三个独立状态；网页是否采用某次数据提交仍以对应 Pages deploy 为准。

## 已确认的数据层问题

| 优先级 | 状态 | 问题 | 已有证据 | 修复与验收 |
| --- | --- | --- | --- | --- |
| P0 | 本分支修复，待 PR 验证 | 证据合并按 6 条截断 | 旧 `merge_google_inventory_detail_evidence.mjs` 在完整 union 后执行 `slice(0,6)`；6 旧+1 新时会丢一条历史证据，餐厅计数却可能不变 | merge 改为保存完整去重 union；新增 6旧+1新、同 key richer replacement、空抓取保留的逐证据回归；展示/导出仍可自行限量 |
| P0 | 待修 | 缺失名称变成有效字符串 | `reconcile_private_google_hints.py` 将缺失 `displayName.text` 转成字符串 `None`，非空门禁通过 | 类型/缺失值检查先于字符串转换；重新量化历史影响，不推断所有记录受影响 |
| P0 | 待修 | 固定公开数量再次出现 | `build_reviewed_doutor_chain_gap_recommendations.mjs` 等一次性审核脚本仍存在写死 1422 的基线判断 | 改为 current catalog/runtime/queue ID 集合与统计自洽校验，新增店铺不阻断 |
| P1 | 部分改善，仍待统一 | 证据提交与发布脱节 | 历史上主线推荐菜数与已部署版本曾不一致 | 当前 reviewed-chain workflow 已执行指定提交重建、精确 delta 验证和写回；仍需把同一发布 handoff 规则推广到其它数据工作流 |
| P1 | 待修/持续隔离 | 来源实体正确不代表其网站/电话正确 | `source_field_quarantine.json` 已隔离 Minatoya 个案 | 字段级归属验证；错误网站不导致直接删除正确身份 |
| P1 | 待修 | 季节菜单缺少完整生命周期 | DOUTOR/current-chain updater 保存审核日期及当期菜单项 | 明确分店/链级适用范围、复核或有效期；过期与网络失败分开，过期不等于历史证据删除 |
| P2 | 待整理 | 多套报告、文档和旧原型检查滞后 | 部分文档分母和合并状态过期，旧原型校验被允许失败 | 从运行 manifest 更新当前状态，历史报告明确标注，不降低正式数据门禁 |

## 当前识别方案

身份和菜品分开执行：

1. 有名称/地址/电话/官网线索的未知身份：定向核对分店页。
2. 有候选但对应不确定：联合比较别名、分店地址、电话、网站归属。距离/同楼/邮编不能单独证明同店。
3. 只有 Place ID：保留待识别状态，不生成猜测名称。
4. 已确认身份的菜品：官网 → 留存第三方事实 → 新独立菜单/PDF来源。
5. 推荐语义与具体菜名同时成立才作为 R；普通真实菜单作为 F；推测和翻译不确定保留 candidate/pending。
6. 先验证独立店、连锁、多分店、错网站和缺失资料样本，再扩大批次。

保存已确认目录名、来源别名和候选名，不互相覆盖。Overture 与其相同上游不能作为两份独立证据。Google 公开详情入口仍需验证；授权保存资料不等于已存在可用的免 Key 批量接口。

当前主线 recommendation gap：官网线索 224、留存第三方 318、需要新来源 290。数量随数据更新；后续从当前队列读取，不写成业务逻辑常数。

## 2026-09-10 已完成的数据推进

- retained source 菜名翻译缺口从 9 个审核项中解决 7 个确定性规范化，保留 `えびず焼き` 与 `ソルベージュ®エスプレッソ` 两个 intentionally-pending 项。
- reviewed current-chain 第二批新增 Gusto `黒酢タルタルのビッグチキンカツ定食` 与 Ringer Hut `夏辛ちゃんぽん` 的严格官方推荐证据。
- 自动写回验证后，`recommendedDishesKnown` 从 588 增至 590，任一中文菜品从 723 增至 725，无菜品记录从 699 降至 697，recommendation gap 从 834 降至 832。
- current-chain updater 已改为 gap-only/idempotent：历史已补目标跳过，不覆盖；实际输出多少条，重建后必须精确增长多少条。

## 公开界面相关已完成事项

PR #56 只修改页面呈现及说明，不删除餐厅/source data：

- 64 种原始菜系标签存在同义中日写法，统一 display/filter/group mapping，原始对象保持不变。
- 首页不再把 public `placeIdOnly=0` 误写成完整目录待补量。
- 卡片与对比表减少重复，对比默认折叠，并省略全空字段行。
- 页脚内部数据流说明移入开发文档，保留必要来源署名、更新时间风险提示、隐私和条款。
- 常见菜系默认最多 12 项，其余可展开选择。

另一个待后续处理的包体问题：`index.html` 仍加载 canonical、provenance、source facts、Hot Pepper rich 辅助文件。不能直接删文件，因为 `source_facts.js` 还带有运行时菜品清理副作用。要先证明 materialized runtime 与移除前后行为等价，再停止浏览器加载；这些文件仍供构建/主库使用。

## 验证边界

本次证据 retention 修复不发起餐厅网络采集、不做 SQLite reset、不改变 R/F/C 语义，也不扩大任何来源域名。正式完成状态以 PR Review、no-paid-data-API 检查及合并后的主线状态为准。
