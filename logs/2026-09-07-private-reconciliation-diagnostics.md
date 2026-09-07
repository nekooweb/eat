# 2026-09-07 Batch E2 private reconciliation diagnostics

## Batch E v1 结果

Commit `cc4570a6cdd81a33a4c78b6fdcaaf9405cfb8fc1` 的 private probe 已通过。

- current id-only：1,392；
- historical hints available：1,391；
- historical non-operational：1；
- without historical hint：1；
- strict independent proposals：0；
- durable rows：0；
- Google display payload leakage：0；
- new Google API calls：0。

说明历史线索本身覆盖充分，但当前 Hot Pepper / OSM / Overture candidate 与剩余 id-only 的严格可证明重合度不足。

## E2 实现

不改变 durable acceptance rule，只增加 private aggregate/near-match diagnostics：

- 120m 内是否有 independent candidate；
- exact normalized name 的 10/20/30/50/80/120m 分布；
- similarity ≥0.995/0.99/0.98/0.95/0.90 的距离分布；
- postcode/address match；
- provider coverage 1/2/3；
- 两个以上 independent providers 是否同时支持历史 hint；
- provider 间 name/location 是否相互一致。

Near-miss private artifact 仅保存 Place ID、independent provider/source ID 与 similarity/distance/address signal；不保存 Google displayName、formattedAddress、location 等内容。

E2 的用途是判断存在“被 6m 门槛误杀的安全簇”，还是 independent-source coverage 本身不足。前者才新增可解释的 strict rule；后者直接进入免费公开页面 collector，不再通过不断放宽阈值追数量。
