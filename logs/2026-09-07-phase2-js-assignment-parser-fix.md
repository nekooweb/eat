# 2026-09-07 — Phase 2 JS assignment parser 修复

## 失败现象

`5734d92` 的 Phase 2 persistent smoke 在读取 `data/source_facts.js` 时失败：

`JSONDecodeError: Unterminated string`

基础 SQLite v1、语法检查和旧 prototype 均正常，失败发生在 Phase 2 输入解析开始阶段。

## 根因

历史 retained overlay 是：

`window.SOURCE_FACTS=<JSON>;`

第一版 parser 在赋值右侧寻找第一个 `;` 作为结束位置。但 JSON 的文本字段内部本身允许出现分号，因此 parser 会在字符串中提前截断合法 JSON。

## 修复

- 将 Phase 2 importer 实现保留为 `scripts/database/retained_phase2_core.py`。
- 新 `scripts/database/retained_phase2.py` 只负责安全 assignment 解析及导出 importer functions。
- 解析方式改为 `json.JSONDecoder().raw_decode()`：从 `window.X=` 右侧解析一个完整 JSON value，不依赖分号位置。
- 不执行 JS，不使用 eval/vm，不允许 wrapper 文本改变 importer 执行逻辑。
- database workflow 增加 `retained_phase2_core.py` 与 wrapper 的 py_compile。

## 验证状态

修复已实现，等待新的 blocking persistent smoke。通过前 Phase 2 仍不标记完成。
