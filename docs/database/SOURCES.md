# 关键数据来源与可导入字段

更新日期：2026-09-07。统计固定到 `bb503c159f8908af8b6c9c6c3a16a371e46b56e5`，详见 [验证报告](VALIDATION_2026-09-07.md)。

「可以导入」首先表示可以保存为有来源的记录，不代表所有字段已经通过身份、时效或语义校验，也不代表可直接参与推荐。

## 1. 现存资料的导入分类

| 输入 | 本次重算 | 导入位置 | 采用条件 |
| --- | ---: | --- | --- |
| `data/area1_google_ids.json` | 2,804 个唯一 ID | 全量目录 | 保留原始顺序、范围与历史快照时间 |
| `data/production_area1.js` | 654 条，其中 651 条属于冻结目录 | 迁移参考及已知字段 | 另外 3 条进入范围例外表，不删原数据、不扩展冻结目录 |
| `data/google_basic_source_matches.json` | 760 条绑定，755 个来源 ID | 来源记录、身份绑定、字段观察 | 5 组复用来源 ID 涉及 10 条绑定，先列为冲突 |
| `data/hotpepper_catalog_facts.json` | 535 条，全部属于冻结目录 | 来源原文与结构化字段 | 保留原有 Hot Pepper ID、绑定依据与原始字段名 |
| `data/hotpepper_rich_metadata.js` | 135 条 | 来源属性 | 不与上面 535 条简单相加；按来源 ID 和版本去重 |
| `data/source_facts.js` | 447 个目录 ID、575 条提供方事实 | 字段观察 | 联结来源 URL、字段声明与原检查时间，不把导入时间当核验时间 |
| `data/source_provenance.js` | 447 个 ID、644 条链接 | 来源及字段证据 | 按具体字段找对应链接；仅提供方相同不足以锁定单一页面 |
| `data/google_inventory_detail_evidence.json` | 211 个 ID、283 个菜品证据项 | 菜品证据 | 既有抽取输出不是新一轮逐店语义复核 |
| `data/official_candidate_index.json` | 194 条记录 | 公开网页任务 | 索引本身不是网页事实；进入分店识别和字段提取 |
| `data/overture_area1_candidates.json` | 3,908 条候选 | 未绑定来源记录 | 未确认与 Place ID 的对应关系前，不采用为该店资料 |
| `data/area1_osm.js` | 1,273 条候选 | 未绑定来源记录 | 同上；其数量不与 Overture 或主目录相加 |

所有旧 enrichment、resolution、cache、queue 和 catalog 文件均进入迁移前备份。队列、评分、汇总和已生成 JS 是派生资料，不能循环作为自己的独立事实来源。原始 Google 详情响应在旧流程中未被完整保留，不能从 ID 清单恢复出来。

## 2. Google 公开入口：身份核对渠道，批量详情仍未验证

[Maps URLs 官方说明](https://developers.google.com/maps/documentation/urls/get-started)确认可以不使用 API Key，利用 `query_place_id` 打开指定地点。该入口不是返回结构化店铺详情的数据接口；参数 `api=1` 也不是 Places 数据 API 授权。

本次使用已有 Place ID 测试公开 Maps URL，网页读取工具返回访问错误，未取得可解析的名称或详情。这个结果不能证明店铺不存在，也不能证明所有普通浏览器均无法访问。

[Place Details 官方文档](https://developers.google.com/maps/documentation/places/web-service/place-details)描述了带 Key、FieldMask 的结构化接口；本项目不将其作为此次「不用旧 API」要求的替代实现，不发起该类请求。

后续公开页面适配器的准入要求：

1. 先以少量已知与未补全 ID 验证公开页面能返回实际内容。
2. 同时保存请求 ID、最终页面标识和明确的地点身份证据。URL 中的输入 ID 不等于返回页面已证明该 ID；查询回退到搜索结果时必须拒绝自动关联。
3. 只提取公开可见且已授权保存的字段；每次采集记录原文、时间、解析器版本和内容校验值。
4. 遇到同意页、登录页、验证码、访问限制或仅脚本空壳，标记任务受阻，不绕过限制，不填入猜测。
5. 成功完成样本解析、身份核对和重复运行验证后，才扩大批次。

目前不能承诺仅靠已验证的 Google 免 Key 入口补完剩余 1,393 个未知名称。它们仍完整保存在目录中。已经合法取得的公开页面快照或授权导出也可以走相同原始记录导入协议。

## 3. Hot Pepper：已留存结构化资料的主要来源

535 条留存记录可提供名称、假名、地址、经纬度、菜系、晚餐预算、营业原文、休息日、车站、交通、午餐有无和部分设施；135 条 rich 记录还有座位、支付方式等属性。字段是否存在，以每条源记录为准。

[官方 API 文档](https://webservicestr.hotpepper.jp/doc/hotpepper/reference.html)要求 API Key，详情查询一次最多 20 个店铺 ID、列表每页最多 100 条。因此「公开 API」不等于「免 Key」。本次未请求 Hot Pepper API，仅验证了文档和留存数据。后续刷新使用现有已绑定店铺 ID、独立适配器和保密凭据，不恢复旧 Google 搜索逻辑。

关键映射：

| 留存原字段 | 主库字段 |
| --- | --- |
| `facts.name / nameKana` | 名称、名称假名 |
| `facts.address / lat / lng` | 地址、来源坐标 |
| `facts.openingHoursText` | 营业原文，另行规范化 |
| `facts.closedText` | 休息日原文，另行解析 |
| `facts.budget` | 提供方预算对象，另行区分餐段与上下界 |
| `facts.lunchAvailabilityText` | 午餐服务状态，不推导午餐价格 |
| `facts.stationName / access` | 车站、交通说明 |
| `facts.urls.pc` | 具体店铺来源链接 |

公开显示 Hot Pepper 来源资料时保留服务署名。按项目现有范围不导入图片、Logo 或顾客评论全文。

## 4. 官网、分店页与菜单：多字段补全的主要公开来源

优先使用已经绑定的分店 URL。每次访问依次尝试结构化数据、分店语义区块、菜单链接；有明确来源且必要时再解析文本 PDF。保留日文原文，译名是独立派生字段。

本次抽样：

- [Bondy 店铺页](https://bondy.co.jp/web/contents/shoplist.html)：可读取神保町本店地址、电话、工作日与周末时间。同页包含其他分店，必须按分店区块提取。
- [Bondy 菜单](https://bondy.co.jp/web/contents/menu.html)：可读取菜品与单品价格；这些价格不直接等于人均消费预算。
- [ベト屋神保町店](https://betoya.jp/store/jimbocho/)：可读取地址、电话、每周时间、30 个座位、交通、支付方式及招牌菜说明。页面中的历史节假日区块日期异常，不能采用为当前休息日。
- Royal Host、豚山 locator 样本未通过本次网页工具访问；没有提取结果，不判定为闭店。

官网页面可读只证明样本可用，不证明所有 194 条索引都可读、都为准确分店或允许同样的抓取频率。

## 5. Overture 与 OSM：公开候选、地理及来源线索

[Overture Places 文档](https://docs.overturemaps.org/guides/places/)与[获取方式](https://docs.overturemaps.org/getting-data/)提供公共批量数据入口。当前留存版本为 `2026-08-19.0`。保留 ID、名称、分类、坐标、地址、网站、电话及记录级来源；先空间筛选，再做精确半径判断。

本次候选记录的上游包括 Foursquare、Microsoft、Meta、AllThePlaces 和 Overture。Overture 与其同一上游记录的相符不能算两份独立证据。

[Geofabrik Kanto](https://download.geofabrik.de/asia/japan/kanto.html)提供 OSM 区域文件。后续批量更新应读取固定版本区域文件并保留 OSM 元素 ID、标签和版本，不用公共地理编码服务枚举全部店铺。地图署名和记录级许可信息随导出保留。

公开候选名称不能凭位置相近就填给未知 Place ID。没有身份线索时，任务仍属于「待绑定」。

## 6. Tabelog 与其他旧来源

既有逐店来源、预算、时间和证据可以迁移为历史观察记录。本次没有验证 Tabelog 的全量刷新通道，也不把搜索摘要或旧文档里的「已核验」视作新的核验结果。

未来新来源统一走原始记录、身份绑定、字段观察协议，不再按批次新增互相覆盖的 JS 文件。
