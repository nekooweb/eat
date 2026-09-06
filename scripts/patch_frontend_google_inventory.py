#!/usr/bin/env python3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
app_path = root / 'app.js'
index_path = root / 'index.html'

app = app_path.read_text(encoding='utf-8')

if 'const inventoryRuntime = Array.isArray(window.GOOGLE_INVENTORY_RESTAURANTS)' not in app:
    app = app.replace(
        "  const production = canonical;\n",
        "  const inventoryRuntime = Array.isArray(window.GOOGLE_INVENTORY_RESTAURANTS)\n"
        "    ? window.GOOGLE_INVENTORY_RESTAURANTS\n"
        "    : [];\n"
        "  const production = inventoryRuntime.length ? inventoryRuntime : canonical;\n",
        1,
    )

old_distance = """  function distanceText(restaurant) {\n    const distance = restaurant.distanceMeters;\n    return distance >= 1000\n      ? `约${(distance / 1000).toFixed(1)}km`\n      : `约${Math.round(distance / 10) * 10}m`;\n  }\n"""
new_distance = """  function distanceText(restaurant) {\n    const distance = restaurant.distanceMeters;\n    if (!Number.isFinite(distance)) {\n      return restaurant.inventoryWithinRadius ? '1.2km内' : '距离待补';\n    }\n    return distance >= 1000\n      ? `约${(distance / 1000).toFixed(1)}km`\n      : `约${Math.round(distance / 10) * 10}m`;\n  }\n"""
if old_distance in app:
    app = app.replace(old_distance, new_distance, 1)

old_meta = """          ${awardBadge(restaurant)}\n          <span class=\"pill\">${escapeHtml(restaurant.cuisine)}</span>\n          <span class=\"pill\">${escapeHtml(distanceText(restaurant))}</span>\n        </div>\n        ${price ? `<p class=\"budget\"><b>预算：</b>${escapeHtml(price)}</p>` : ''}\n"""
new_meta = """          ${awardBadge(restaurant)}\n          ${restaurant.cuisine ? `<span class=\"pill\">${escapeHtml(restaurant.cuisine)}</span>` : '<span class=\"pill\">菜系待补</span>'}\n          <span class=\"pill\">${escapeHtml(distanceText(restaurant))}</span>\n        </div>\n        ${restaurant.basicInfoState === 'google_place_id_only' ? '<p class=\"note\"><b>基础信息：</b>Google Maps 已收录；店名、地址和详细资料补全中。</p>' : ''}\n        ${price ? `<p class=\"budget\"><b>预算：</b>${escapeHtml(price)}</p>` : ''}\n"""
if old_meta in app:
    app = app.replace(old_meta, new_meta, 1)

old_eligible = """  function eligible(restaurant) {\n    if (!hasGooglePlaceId(restaurant) || restaurant.googleStatus !== 'verified') return false;\n    if (!validCoords(restaurant)) return false;\n    if (!Number.isFinite(restaurant.distanceMeters) || restaurant.distanceMeters < 0 || restaurant.distanceMeters > MAX_DISTANCE) return false;\n    if (restaurant.distanceMeters > distanceLimit) return false;\n    if (rejected.has(restaurant.cuisine)) return false;\n    return budgetOK(restaurant);\n  }\n"""
new_eligible = """  function eligible(restaurant) {\n    if (!hasGooglePlaceId(restaurant)) return false;\n    const frozenInventory = restaurant.inventoryWithinRadius === true;\n    if (!frozenInventory && restaurant.googleStatus !== 'verified') return false;\n    const hasDistance = Number.isFinite(restaurant.distanceMeters);\n    if (hasDistance) {\n      if (restaurant.distanceMeters < 0 || restaurant.distanceMeters > MAX_DISTANCE) return false;\n      if (restaurant.distanceMeters > distanceLimit) return false;\n    } else {\n      // Frozen inventory membership proves <=1.2 km, but not a smaller distance bucket.\n      if (!frozenInventory || distanceLimit !== MAX_DISTANCE) return false;\n    }\n    if (!validCoords(restaurant) && !frozenInventory) return false;\n    if (restaurant.cuisine && rejected.has(restaurant.cuisine)) return false;\n    return budgetOK(restaurant);\n  }\n"""
if old_eligible in app:
    app = app.replace(old_eligible, new_eligible, 1)

old_stats = """  function renderStats() {\n    const stats = window.PRODUCTION_STATS || {};\n    const total = production.length;\n    const cuisineKnown = production.filter((restaurant) =>\n      restaurant.cuisine && restaurant.cuisine !== '餐厅').length;\n    const recommendedKnown = production.filter((restaurant) =>\n      Array.isArray(restaurant.recommendedDishes) && restaurant.recommendedDishes.length).length;\n    const featuredKnown = production.filter((restaurant) =>\n      Array.isArray(restaurant.featuredDishes) && restaurant.featuredDishes.length).length;\n    const awards = stats.awards ?? production.filter((restaurant) => restaurant.hyakumeiten).length;\n    $('#stats').innerHTML = `Google Maps 已核验 <b>${total.toLocaleString()}</b> 家 · 推荐菜 <b>${recommendedKnown.toLocaleString()}</b> · 特色菜 <b>${featuredKnown.toLocaleString()}</b> · 已知菜系 <b>${cuisineKnown.toLocaleString()}</b> · 百名店 <b>${awards.toLocaleString()}</b>`;\n  }\n"""
new_stats = """  function renderStats() {\n    const runtimeStats = window.GOOGLE_INVENTORY_STATS || null;\n    const stats = runtimeStats || window.PRODUCTION_STATS || {};\n    const total = production.length;\n    const cuisineKnown = production.filter((restaurant) =>\n      restaurant.cuisine && restaurant.cuisine !== '餐厅').length;\n    const recommendedKnown = production.filter((restaurant) =>\n      Array.isArray(restaurant.recommendedDishes) && restaurant.recommendedDishes.length).length;\n    const featuredKnown = production.filter((restaurant) =>\n      Array.isArray(restaurant.featuredDishes) && restaurant.featuredDishes.length).length;\n    if (runtimeStats) {\n      $('#stats').innerHTML = `Google Maps 1.2km 库存 <b>${total.toLocaleString()}</b> 家 · 已有基础资料 <b>${runtimeStats.namedBasic.toLocaleString()}</b> · 仅 Place ID 待补 <b>${runtimeStats.placeIdOnly.toLocaleString()}</b> · 推荐菜 <b>${recommendedKnown.toLocaleString()}</b> · 特色菜 <b>${featuredKnown.toLocaleString()}</b> · 已知菜系 <b>${cuisineKnown.toLocaleString()}</b>`;\n      return;\n    }\n    const awards = stats.awards ?? production.filter((restaurant) => restaurant.hyakumeiten).length;\n    $('#stats').innerHTML = `Google Maps 已核验 <b>${total.toLocaleString()}</b> 家 · 推荐菜 <b>${recommendedKnown.toLocaleString()}</b> · 特色菜 <b>${featuredKnown.toLocaleString()}</b> · 已知菜系 <b>${cuisineKnown.toLocaleString()}</b> · 百名店 <b>${awards.toLocaleString()}</b>`;\n  }\n"""
if old_stats in app:
    app = app.replace(old_stats, new_stats, 1)

required = [
    'window.GOOGLE_INVENTORY_RESTAURANTS',
    "return restaurant.inventoryWithinRadius ? '1.2km内' : '距离待补';",
    'Frozen inventory membership proves <=1.2 km',
    'Google Maps 1.2km 库存',
]
for marker in required:
    if marker not in app:
        raise SystemExit(f'app.js patch marker missing: {marker}')
app_path.write_text(app, encoding='utf-8')

index = index_path.read_text(encoding='utf-8')
production_script = '<script src="./data/production_area1.js?v=20260907-strictgoogle1"></script>'
runtime_script = '<script src="./data/google_inventory_runtime.js?v=20260907-inventory2804"></script>'
if runtime_script not in index:
    if production_script not in index:
        raise SystemExit('production script marker missing in index.html')
    index = index.replace(production_script, production_script + '\n  ' + runtime_script, 1)

index = index.replace(
    '当前开放 TOKYO · 地区1️⃣，仅保留内部基准点直线距离 1.2 km 内、且已完成 Google Place ID 独立核验的餐厅。',
    '当前开放 TOKYO · 地区1️⃣，使用已完成覆盖核验的 Google Maps 1.2 km 冻结库存，共 2,804 个唯一 Place ID。',
)
index = index.replace(
    '每家餐厅均绑定 Google Maps Place ID；页面坐标与距离来自已与该 Google 身份完成独立匹配的地理记录。',
    '每家餐厅均强绑定 Google Maps Place ID；可持久化的店名、坐标和其他资料仅使用独立来源。尚未完成来源匹配的记录直接通过 Google Maps 展示真实地点，不伪造店名或坐标。',
)
if '2,804 个唯一 Place ID' not in index or 'google_inventory_runtime.js' not in index:
    raise SystemExit('index.html inventory patch failed')
index_path.write_text(index, encoding='utf-8')

print('patched app.js and index.html for exact 2,804 Google inventory runtime')
