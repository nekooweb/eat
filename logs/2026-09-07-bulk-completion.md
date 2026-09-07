# 2026-09-07 批量补齐开发记录

## Batch A — retained official identity recovery

完成，CI pass。194 input / 193 reviewed / 1 conflict-deferred；新恢复 id-only 1；shadow safe-added 1 / unsafe 0。

## Batch B — retained verified OSM identity QC

完成，CI pass。662 verified pairs / 657 reviewed / 3 candidate / 2 conflict；新恢复 id-only 0；新增发现 2 collision groups / 4 Place ID；总 conflict Places 20。

## Batch C — deterministic retained-field resolver v2

完成，CI pass。1,176 candidate place-fields 中安全 derived 188：closure.days.raw 123、closure.raw 58、hours.raw 7；Tabelog 156 / official 32；missing-only repeat build 新增 0。

## Batch D — Hot Pepper candidate field-only review

完成，CI pass。Commit `a33fc72`。

58 candidate bindings：

- eligible candidate identity consistency：6；
- consistency rejected：22；
- identity not publishable：30。

6 家共补 59 fields：dinner 6、hours 6、closure 6、card 6、course 5、free drink 6、free food 6、lunch 6、parking 6、private room 6。

Master：4,686 source records/bindings、46,260 observations、30,913 resolutions。Identity 保持 651 verified / 746 source_matched / 1,392 id_only / 15 conflict。Field gaps：address 337、coordinates 1、cuisine 1、dinner 789、hours 666、lunch 1,228、practical 906。Repeat build Batch D 新增 0；backup/export pass。

## Batch E — historical private Google hint reconciliation

状态：代码/私有 workflow 已实现，等待 CI probe。

### 发现

旧 workflow `recover-google-inventory-basic.yml` 明确引用两次 2026-09-06 私有 Google sweep：

- run `34018919233` / artifact `full-area1-collection-private-audit`；
- run `34019078280` / artifact `full-area1-retry-private-audit`。

两个 artifact 当前仍有效至 2026-09-09。下载审计确认：

- initial `full_inventory_place_details.json`：2,159 rows，其中 1,716 success + 443 error；
- retry `full_inventory_retry_private.json`：443 rows，全部取得 name/address/coordinates/status；
- 合并后当时 2,159 条非核心 inventory 具备历史成功 detail hint；
- 本轮不产生任何新 Google API request / cost。

### 持久化边界

历史 Google display content 只作为 private ephemeral hint，不写入 durable master/repository/public export。Durable proposal 只允许 Google Place ID + independent Hot Pepper/OSM/Overture facts。

### 新增实现

- `scripts/database/reconcile_private_google_hints.py`
  - 构建当前 1,392 id-only set；
  - 合并 initial + retry private hint；
  - 对 Hot Pepper / OSM / Overture 建 spatial candidate index；
  - provider ID 已被其他 PID 使用时拒绝；
  - 同 provider 有近似竞争候选时拒绝；
  - single-source 只允许 ultra-tight exact/super-exact match；
  - 较宽条件要求 multi-provider consensus；
  - 输出 private metrics 与 independent-only durable proposal 两份文件。

- `.github/workflows/private-historical-reconciliation.yml`
  - `actions: read` 下载两个历史 artifact；
  - 构建/验证当前 SQLite master；
  - 执行 reconciliation；
  - blocking 检查 durable proposal 不含 Google display payload；
  - 上传 2-day private reconciliation artifact；
  - 不自动 commit proposal。

Probe 通过后先记录 strict proposal 实际数量和 provider/rule 分布，再决定是否正式导入。若数量很少，不降低门槛，转向免费公开来源 collector。
