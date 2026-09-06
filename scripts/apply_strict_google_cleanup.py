#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


def write(rel, text):
    (ROOT / rel).write_text(text, encoding="utf-8")


def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f"missing expected block: {label}")
    return text.replace(old, new, 1)


def delete_between(text, start, end, label):
    i = text.find(start)
    if i < 0:
        raise RuntimeError(f"missing start marker: {label}")
    j = text.find(end, i)
    if j < 0:
        raise RuntimeError(f"missing end marker: {label}")
    return text[:i] + end + text[j + len(end):]


# 1) Production identities: strict legacy Google QC only, exact verified geo only.
p = read("scripts/build_production_dataset.mjs")
p = replace_once(
    p,
    """import {\n  LEGACY_IDENTITY_ADMISSION,\n  CATALOG_IDENTITY_ADMISSION,\n  AREA1_MAX_DISTANCE_M,\n  buildCatalogAdmissionRoots,\n  isLegacyIdentityRow,\n  isCatalogIdentityRow\n} from './catalog_identity.mjs';""",
    """import {\n  LEGACY_IDENTITY_ADMISSION,\n  AREA1_MAX_DISTANCE_M,\n  isLegacyIdentityRow\n} from './catalog_identity.mjs';""",
    "production identity imports",
)
p = replace_once(
    p,
    """const verifiedRows = areaRows.filter((row) => isLegacyIdentityRow(row));\nconst { roots: catalogAdmissionRoots } = buildCatalogAdmissionRoots(DATA, PROFILE, AREA);\nconst legacyIds = new Set(verifiedRows.map((row) => row.googlePlaceId));\nfor (const row of catalogAdmissionRoots) {\n  if (legacyIds.has(row.googlePlaceId)) {\n    throw new Error(`catalog admission duplicates legacy verified identity: ${row.googlePlaceId}`);\n  }\n}\nconst identityRows = [...verifiedRows, ...catalogAdmissionRoots];""",
    """const verifiedRows = areaRows.filter((row) => isLegacyIdentityRow(row));\nconst identityRows = verifiedRows;""",
    "strict verified identity roots",
)
p = replace_once(
    p,
    """// Production identities have two explicit admission paths:\n// 1) legacy independently-QC'd historical identities, and\n// 2) explicit catalog admissions reviewed against multiple independent current\n//    sources. Source-only rows never create identities by themselves.""",
    """// Production identities are strict Google-bound identities only. A row must\n// already carry the independently reviewed historical googleStatus=verified\n// binding. Source-only rows and catalog-only admissions never create identities.""",
    "identity policy comment",
)
p = replace_once(
    p,
    """  const catalogIdentity = sourceRows.find((row) => isCatalogIdentityRow(row)) || null;\n  const legacyIdentity = sourceRows.find((row) => isLegacyIdentityRow(row)) || null;\n  if (!catalogIdentity && !legacyIdentity) throw new Error(`production group lacks identity root: ${placeId}`);\n  if (catalogIdentity && legacyIdentity) throw new Error(`production group has conflicting identity roots: ${placeId}`);\n  const identityAdmission = catalogIdentity\n    ? CATALOG_IDENTITY_ADMISSION\n    : LEGACY_IDENTITY_ADMISSION;""",
    """  const legacyIdentity = sourceRows.find((row) => isLegacyIdentityRow(row)) || null;\n  if (!legacyIdentity) throw new Error(`production group lacks verified Google identity root: ${placeId}`);\n  const identityAdmission = LEGACY_IDENTITY_ADMISSION;""",
    "canonical strict identity",
)
geo_start = """  // Geospatial data remains independent of live Google Places. Legacy verified\n  // OSM wins for legacy identities; an explicitly reviewed catalog coordinate\n  // wins before any unreviewed open-data candidate for catalog admissions.\n  const geo = sourceRows.find((row) =>\n    row.source === 'OpenStreetMap'\n    && row.googleStatus === 'verified'\n    && isFiniteNumber(row.lat)\n    && isFiniteNumber(row.lng)\n    && isFiniteNumber(row.distanceMeters)\n  ) || catalogIdentity || sourceRows.find((row) =>\n    row.source === 'OpenStreetMap'\n    && isFiniteNumber(row.lat)\n    && isFiniteNumber(row.lng)\n    && isFiniteNumber(row.distanceMeters)\n  ) || sourceRows.find((row) =>\n    !row.sourceOnly\n    && isFiniteNumber(row.lat)\n    && isFiniteNumber(row.lng)\n    && isFiniteNumber(row.distanceMeters)\n  );\n\n  const distanceMeters = geo?.distanceMeters\n    ?? firstBy(sourceRows.filter((row) => !row.sourceOnly), (row) => isFiniteNumber(row.distanceMeters), (row) => row.distanceMeters)\n    ?? firstBy(sourceRows.filter((row) => !row.sourceOnly), (row) => isFiniteNumber(row.distance), (row) => row.distance);\n  if (!isFiniteNumber(distanceMeters) || distanceMeters > MAX_DISTANCE) return null;"""
geo_new = """  // Geospatial admission is strict: coordinates and distance must come from the\n  // exact OpenStreetMap candidate that was independently matched to this Google\n  // Place ID and marked googleStatus=verified. No open-catalog fallback is allowed.\n  const geo = sourceRows.find((row) =>\n    row.source === 'OpenStreetMap'\n    && row.googleStatus === 'verified'\n    && row.googlePlaceId === placeId\n    && isFiniteNumber(row.lat)\n    && isFiniteNumber(row.lng)\n    && isFiniteNumber(row.distanceMeters)\n  );\n  if (!geo) return null;\n\n  const distanceMeters = geo.distanceMeters;\n  if (!isFiniteNumber(distanceMeters) || distanceMeters < 0 || distanceMeters > MAX_DISTANCE) return null;"""
p = replace_once(p, geo_start, geo_new, "strict verified geospatial source")
p = replace_once(p, ") || catalogIdentity || geo;", ") || geo;", "remove catalog identity name fallback")
p = replace_once(
    p,
    """    googlePlaceId: placeId,\n    ...(identityAdmission === LEGACY_IDENTITY_ADMISSION ? { googleStatus: 'verified' } : {}),\n    identityAdmission,\n    ...(catalogIdentity ? { identityReviewedAt: catalogIdentity.admissionReviewedAt } : {}),""",
    """    googlePlaceId: placeId,\n    googleStatus: 'verified',\n    identityAdmission,""",
    "strict public identity fields",
)
p = replace_once(
    p,
    """const invalid = production.filter((row) => !row.name || !row.googlePlaceId || !row.cuisine);\nconst schemaInvalid = production.filter((row) =>\n  ![LEGACY_IDENTITY_ADMISSION, CATALOG_IDENTITY_ADMISSION].includes(row.identityAdmission)\n  || (row.identityAdmission === LEGACY_IDENTITY_ADMISSION && row.googleStatus !== 'verified')\n  || (row.identityAdmission === CATALOG_IDENTITY_ADMISSION && Object.hasOwn(row, 'googleStatus'))\n  || !Array.isArray(row.recommendedDishes)""",
    """const invalid = production.filter((row) =>\n  !row.name\n  || !row.googlePlaceId\n  || !row.cuisine\n  || row.googleStatus !== 'verified'\n  || !isFiniteNumber(row.lat)\n  || !isFiniteNumber(row.lng));\nconst schemaInvalid = production.filter((row) =>\n  row.identityAdmission !== LEGACY_IDENTITY_ADMISSION\n  || row.googleStatus !== 'verified'\n  || !Array.isArray(row.recommendedDishes)""",
    "strict production schema",
)
p = replace_once(
    p,
    """  verifiedSourceRows: verifiedRows.length,\n  catalogAdmissionRoots: catalogAdmissionRoots.length,\n  legacyVerifiedEntities: production.filter((row) => row.identityAdmission === LEGACY_IDENTITY_ADMISSION).length,\n  catalogReviewedEntities: production.filter((row) => row.identityAdmission === CATALOG_IDENTITY_ADMISSION).length,""",
    """  verifiedSourceRows: verifiedRows.length,\n  legacyVerifiedEntities: production.length,""",
    "strict production stats",
)
write("scripts/build_production_dataset.mjs", p)

# 2) Frontend: canonical only, no open expansion, no inferred reference dishes.
a = read("app.js")
a = replace_once(
    a,
    """  const canonical = Array.isArray(window.PRODUCTION_RESTAURANTS)\n    ? window.PRODUCTION_RESTAURANTS\n    : [];\n  const publicOpen = Array.isArray(window.PUBLIC_OPEN_RESTAURANTS)\n    ? window.PUBLIC_OPEN_RESTAURANTS\n    : [];\n  const production = [...canonical, ...publicOpen];""",
    """  const canonical = Array.isArray(window.PRODUCTION_RESTAURANTS)\n    ? window.PRODUCTION_RESTAURANTS\n    : [];\n  const production = canonical;""",
    "canonical-only frontend pool",
)
a = replace_once(
    a,
    """  const restaurantKey = (restaurant) => restaurant.identityKey\n    || restaurant.googlePlaceId\n    || restaurant.openPlaceId\n    || restaurant.id\n    || `${restaurant.name}|${restaurant.lat}|${restaurant.lng}`;""",
    """  const restaurantKey = (restaurant) => restaurant.googlePlaceId || restaurant.id;""",
    "Google identity key",
)
start = a.find("  const GENERIC_DISH_HINTS = new Map([")
end = a.find("  function rand01()", start)
if start < 0 or end < 0:
    raise RuntimeError("missing generic dish hint block")
a = a[:start] + a[end:]
start = a.find("  function dishInfo(restaurant) {")
end = a.find("  function recommendationText(restaurant) {", start)
if start < 0 or end < 0:
    raise RuntimeError("missing dishInfo block")
new_dish = """  function dishInfo(restaurant) {\n    if (Array.isArray(restaurant.recommendedDishes) && restaurant.recommendedDishes.length) {\n      return {\n        label: '推荐菜',\n        text: restaurant.recommendedDishes.slice(0, 2).filter(Boolean).join(' · ')\n      };\n    }\n    if (Array.isArray(restaurant.featuredDishes) && restaurant.featuredDishes.length) {\n      return {\n        label: '特色菜',\n        text: restaurant.featuredDishes.slice(0, 2).map(featuredDishText).filter(Boolean).join(' · ')\n      };\n    }\n    return { label: '', text: '' };\n  }\n\n"""
a = a[:start] + new_dish + a[end:]
start = a.find("  function dataTierBadge(restaurant) {")
end = a.find("  function renderStoreMap(restaurant, index) {", start)
if start < 0 or end < 0:
    raise RuntimeError("missing data-tier badge block")
a = a[:start] + a[end:]
a = a.replace("          ${dataTierBadge(restaurant)}\n", "", 1)
a = a.replace("['特色/参考菜品', ...restaurants.map((restaurant) => recommendationText(restaurant) || '—')],", "['推荐/特色菜', ...restaurants.map((restaurant) => recommendationText(restaurant) || '—')],", 1)
a = replace_once(
    a,
    """  function eligible(restaurant) {\n    const canonicalEligible = hasGooglePlaceId(restaurant) && restaurant.googleStatus === 'verified';\n    const publicEligible = restaurant.identityAdmission === 'open_public_catalog';\n    if (!canonicalEligible && !publicEligible) return false;\n    if (!Number.isFinite(restaurant.distanceMeters) || restaurant.distanceMeters > MAX_DISTANCE) return false;""",
    """  function eligible(restaurant) {\n    if (!hasGooglePlaceId(restaurant) || restaurant.googleStatus !== 'verified') return false;\n    if (!validCoords(restaurant)) return false;\n    if (!Number.isFinite(restaurant.distanceMeters) || restaurant.distanceMeters < 0 || restaurant.distanceMeters > MAX_DISTANCE) return false;""",
    "strict frontend eligibility",
)
start = a.find("  function renderStats() {")
end = a.find("  function showMessage(message) {", start)
if start < 0 or end < 0:
    raise RuntimeError("missing renderStats block")
new_stats = """  function renderStats() {\n    const stats = window.PRODUCTION_STATS || {};\n    const total = production.length;\n    const cuisineKnown = production.filter((restaurant) =>\n      restaurant.cuisine && restaurant.cuisine !== '餐厅').length;\n    const recommendedKnown = production.filter((restaurant) =>\n      Array.isArray(restaurant.recommendedDishes) && restaurant.recommendedDishes.length).length;\n    const featuredKnown = production.filter((restaurant) =>\n      Array.isArray(restaurant.featuredDishes) && restaurant.featuredDishes.length).length;\n    const awards = stats.awards ?? production.filter((restaurant) => restaurant.hyakumeiten).length;\n    $('#stats').innerHTML = `Google Maps 已核验 <b>${total.toLocaleString()}</b> 家 · 推荐菜 <b>${recommendedKnown.toLocaleString()}</b> · 特色菜 <b>${featuredKnown.toLocaleString()}</b> · 已知菜系 <b>${cuisineKnown.toLocaleString()}</b> · 百名店 <b>${awards.toLocaleString()}</b>`;\n  }\n\n"""
a = a[:start] + new_stats + a[end:]
write("app.js", a)

# 3) Public page wording/runtime.
i = read("index.html")
old_footer = """      <p>当前开放 TOKYO · 地区1️⃣，范围为内部基准点直线距离 1.2 km。高置信核心餐厅与开放数据扩展池分层保留，不把开放数据候选伪装成已完成独立身份核验的记录。</p>\n      <p>“特色菜”表示已有餐厅/来源证据支持；“参考菜品”仅依据已知菜系、品牌或连锁菜单类型提供，用于数据尚未补全时帮助选择，不等同于已核实的该店招牌菜。</p>\n      <p>三店总览和开放数据餐厅的单店地图使用 OpenStreetMap；有历史 Google Place ID 的餐厅可直接打开对应 Google Maps，其余使用店名和地址搜索。</p>\n      <p>地图与部分基础地点信息 © OpenStreetMap contributors（ODbL）；开放地点扩展同时使用 Overture Maps 公共数据。</p>"""
new_footer = """      <p>当前开放 TOKYO · 地区1️⃣，仅保留内部基准点直线距离 1.2 km 内、且已完成 Google Place ID 独立核验的餐厅。</p>\n      <p>“推荐菜”优先展示严格来源支持的推荐条目；“特色菜”仅在有明确来源证据时展示。没有可靠菜品证据时不做菜系推断。</p>\n      <p>每家餐厅均绑定 Google Maps Place ID；页面坐标与距离来自已与该 Google 身份完成独立匹配的地理记录。</p>\n      <p>地图基础图层 © OpenStreetMap contributors（ODbL）。</p>"""
i = replace_once(i, old_footer, new_footer, "strict footer")
i = i.replace('  <script src="./data/production_area1.js?v=20260907-openpool1"></script>\n  <script src="./data/public_pool_area1.js?v=20260907-openpool1"></script>\n', '  <script src="./data/production_area1.js?v=20260907-strictgoogle1"></script>\n', 1)
i = i.replace('source_provenance.js?v=20260907-openpool1', 'source_provenance.js?v=20260907-strictgoogle1')
i = i.replace('source_facts.js?v=20260907-openpool1', 'source_facts.js?v=20260907-strictgoogle1')
i = i.replace('hotpepper_rich_metadata.js?v=20260907-openpool1', 'hotpepper_rich_metadata.js?v=20260907-strictgoogle1')
i = i.replace('app.js?v=20260907-openpool1', 'app.js?v=20260907-strictgoogle1')
write("index.html", i)

# 4) Data completion queue: recommended dishes first, then featured dishes.
e = read("scripts/build_enrichment_queue.mjs")
e = replace_once(
    e,
    """function gaps(row) {\n  const missing = [];\n  if (!Array.isArray(row.featuredDishes) || !row.featuredDishes.length) missing.push('featuredDishes');""",
    """function gaps(row) {\n  const missing = [];\n  if (!Array.isArray(row.recommendedDishes) || !row.recommendedDishes.length) missing.push('recommendedDishes');\n  if (!Array.isArray(row.featuredDishes) || !row.featuredDishes.length) missing.push('featuredDishes');""",
    "recommendation gap",
)
e = replace_once(
    e,
    """  if (gaps.has('lunchBudget')) {""",
    """  if (gaps.has('recommendedDishes')) return 'extract_strict_recommended_menu_item';\n  if (gaps.has('featuredDishes')) return 'extract_menu_or_signature_items';\n  if (gaps.has('lunchBudget')) {""",
    "recommendation next action",
)
e = e.replace("  if (gaps.has('featuredDishes')) return 'extract_menu_or_signature_items';\n  return 'review';", "  return 'review';", 1)
old_priority = """function priorityScore(record) {\n  let score = 0;\n  if (record.gaps.includes('lunchBudget')) score += 50;\n  if (record.gaps.includes('dinnerBudget')) score += 30;\n  if (record.gaps.includes('openingHours')) score += 20;\n  if (record.gaps.includes('address')) score += 15;\n  if (record.gaps.includes('cuisine')) score += 15;\n  if (record.gaps.includes('featuredDishes')) score += 5;"""
new_priority = """function priorityScore(record) {\n  let score = 0;\n  if (record.gaps.includes('recommendedDishes')) score += 120;\n  if (record.gaps.includes('featuredDishes')) score += 80;\n  if (record.gaps.includes('openingHours')) score += 25;\n  if (record.gaps.includes('lunchBudget')) score += 20;\n  if (record.gaps.includes('dinnerBudget')) score += 15;\n  if (record.gaps.includes('address')) score += 10;\n  if (record.gaps.includes('cuisine')) score += 10;"""
e = replace_once(e, old_priority, new_priority, "dish-first priority scoring")
e = replace_once(
    e,
    """  .sort((a, b) =>\n    (b.gapCounts.lunchBudget || 0) - (a.gapCounts.lunchBudget || 0)\n    || b.restaurants - a.restaurants""",
    """  .sort((a, b) =>\n    (b.gapCounts.recommendedDishes || 0) - (a.gapCounts.recommendedDishes || 0)\n    || (b.gapCounts.featuredDishes || 0) - (a.gapCounts.featuredDishes || 0)\n    || b.restaurants - a.restaurants""",
    "dish-first source group sorting",
)
write("scripts/build_enrichment_queue.mjs", e)

# 5) Repository audit: reject open runtime and require strict verified Google rows.
r = read("scripts/audit_repository.mjs")
r = replace_once(
    r,
    """import {\n  LEGACY_IDENTITY_ADMISSION,\n  CATALOG_IDENTITY_ADMISSION,\n  loadCatalogAdmissionPayload\n} from './catalog_identity.mjs';""",
    """import { LEGACY_IDENTITY_ADMISSION } from './catalog_identity.mjs';""",
    "audit imports",
)
for block in [
    """const publicPoolSource = fs.existsSync(path.join(DATA, 'public_pool_area1.js'))\n  ? read('data/public_pool_area1.js')\n  : '';\n""",
    """const admissionPayload = loadCatalogAdmissionPayload(DATA);\nconst admittedIds = new Set((admissionPayload.rows || []).map((row) => row.googlePlaceId));\nif (admittedIds.size !== (admissionPayload.rows || []).length) fail('catalog admission ledger contains duplicate IDs');\n""",
]:
    if block not in r:
        raise RuntimeError("missing audit setup block")
    r = r.replace(block, "", 1)
r = r.replace("if (!/data\\/public_pool_area1\\.js/.test(index)) fail('public open restaurant pool is not loaded');", "if (/data\\/public_pool_area1\\.js/.test(index)) fail('public open restaurant pool must not be loaded');", 1)
r = replace_once(
    r,
    """const expectedRuntimePaths = [\n  './data/production_area1.js',\n  './data/public_pool_area1.js',\n  './data/source_provenance.js',""",
    """const expectedRuntimePaths = [\n  './data/production_area1.js',\n  './data/source_provenance.js',""",
    "strict runtime list",
)
r = r.replace("if (!/Overture Maps/.test(index)) fail('Overture Maps attribution is missing');\nif (!/参考菜品/.test(index + app)) fail('public dish hints must be explicitly labeled as reference dishes');", "if (/开放扩展|参考菜品|open_public_catalog|PUBLIC_OPEN_RESTAURANTS/.test(index + app)) fail('open expansion or inferred reference-dish runtime logic remains');", 1)
start = r.find("if (publicPoolSource) {")
end = r.find("const placeIds = new Set();", start)
if start < 0 or end < 0:
    raise RuntimeError("missing public-pool audit block")
r = r[:start] + r[end:]
r = r.replace("let catalogAdmissionRows = 0;\n", "", 1)
branch_start = r.find("  if (row.identityAdmission === CATALOG_IDENTITY_ADMISSION) {")
branch_end = r.find("\n\n  if (!Number.isFinite(row.distanceMeters)", branch_start)
if branch_start < 0 or branch_end < 0:
    raise RuntimeError("missing identity admission audit branch")
strict_branch = """  if (row.identityAdmission !== LEGACY_IDENTITY_ADMISSION || row.googleStatus !== 'verified') {\n    fail(`production row is not strict Google-verified identity: ${row.name}`);\n  }\n  legacyAdmissionRows += 1;\n  if (!Number.isFinite(row.lat) || !Number.isFinite(row.lng)) {\n    fail(`verified production row lacks coordinates: ${row.name}`);\n  }"""
r = r[:branch_start] + strict_branch + r[branch_end:]
start = r.find("const missingAdmittedIds = [...admittedIds]")
end = r.find("const sourceBackedRows =", start)
if start < 0 or end < 0:
    raise RuntimeError("missing catalog statistic audit block")
replacement = """if (stats?.legacyVerifiedEntities != null && stats.legacyVerifiedEntities !== legacyAdmissionRows) {\n  fail(`legacy identity statistic mismatch: stats=${stats.legacyVerifiedEntities}, actual=${legacyAdmissionRows}`);\n}\n\n"""
r = r[:start] + replacement + r[end:]
r = r.replace("    catalogAdmissionRows,\n", "", 1)
write("scripts/audit_repository.mjs", r)

# 6) Pages: canonical-only deploy; public expansion is no longer built or shipped.
y = read(".github/workflows/pages.yml")
start = y.find("      - name: Build 2000+ public restaurant pool\n")
end = y.find("      - name: Static and canonical repository checks\n", start)
if start < 0 or end < 0:
    raise RuntimeError("missing Pages public-pool build step")
y = y[:start] + y[end:]
for line in [
    "            node --check data/public_pool_area1.js\n",
    "            node --check scripts/build_public_open_pool.mjs\n",
    "            node --check scripts/apply_hotpepper_catch_featured_dishes.mjs\n",
    "            node --check scripts/collect_public_featured_dishes.mjs\n",
    "            node --check scripts/apply_public_featured_dishes.mjs\n",
    "            node --check scripts/audit_public_featured_dishes.mjs\n",
    "            node --check scripts/build_public_dish_queue.mjs\n",
    "            test -s data/public_pool_area1.js\n",
]:
    y = y.replace(line, "", 1)
start = y.find("      - name: Apply website featured dishes and build completion queue\n")
end = y.find("      - name: Coverage report\n", start)
if start < 0 or end < 0:
    raise RuntimeError("missing Pages public dish step")
y = y[:start] + y[end:]
y = y.replace("cp data/production_area1.js data/public_pool_area1.js data/source_provenance.js data/source_facts.js data/hotpepper_rich_metadata.js _site/data/", "cp data/production_area1.js data/source_provenance.js data/source_facts.js data/hotpepper_rich_metadata.js _site/data/", 1)
write(".github/workflows/pages.yml", y)

# 7) Remove open expansion runtime/automation assets. OSM/Overture source data stay internal for QC only.
for rel in [
    ".github/workflows/collect-public-featured-dishes.yml",
    "scripts/build_public_open_pool.mjs",
    "scripts/apply_hotpepper_catch_featured_dishes.mjs",
    "scripts/collect_public_featured_dishes.mjs",
    "scripts/apply_public_featured_dishes.mjs",
    "scripts/audit_public_featured_dishes.mjs",
    "scripts/build_public_dish_queue.mjs",
    "data/public_pool_area1.js",
    "data/public_featured_dishes_auto.json",
]:
    path = ROOT / rel
    if path.exists():
        path.unlink()

# 8) Development policy + log.
dev = read("DEVELOPMENT.md")
marker = "## Strict Google-bound production policy (2026-09-07)"
if marker not in dev:
    dev += """\n\n## Strict Google-bound production policy (2026-09-07)\n\nThe public recommendation pool is now intentionally narrower than the discovery inventory. A restaurant may reach production only when all of the following are true:\n\n- it has a non-empty Google Place ID;\n- the historical independent identity QC status is exactly `googleStatus=verified`;\n- its matched geographic row has finite latitude/longitude and is the exact row bound to that Google Place ID;\n- `distanceMeters` is finite and `0 <= distanceMeters <= 1200`;\n- open-catalog / Overture / OSM-only candidates never enter the public recommendation pool. Open data may remain as internal QC/source evidence only.\n\nData-completion priority is now dish-first: **strict recommended dishes > source-backed featured/signature dishes > hours/prices/address/cuisine**. Generic cuisine-derived dish hints are not shown publicly.\n"""
    write("DEVELOPMENT.md", dev)

log = ROOT / "logs/2026-09-07-strict-google-radius-and-dish-priority.md"
log.parent.mkdir(parents=True, exist_ok=True)
log.write_text("""# 2026-09-07 — Strict Google binding, 1.2 km radius, dish-first priority\n\n## User requirement\n\n- Public site must contain only restaurants within 1.2 km.\n- Every public restaurant must be strongly bound to a Google Maps Place ID.\n- Entries without a verified Google binding must be excluded.\n- Recommended/featured dishes are the highest-priority enrichment target.\n- Open-expansion/reference-dish runtime concepts should be removed.\n\n## Implementation\n\n- Removed the Overture/OSM/Hot-Pepper public expansion runtime layer.\n- Production admission now requires `googleStatus=verified` and exact matched geospatial evidence.\n- The six catalog-only admissions are no longer allowed into production.\n- Production rejects missing coordinates, missing Place IDs, negative/invalid distances, and distances above 1200 m.\n- Frontend no longer merges `PUBLIC_OPEN_RESTAURANTS` and no longer displays generic `参考菜品`.\n- Frontend shows strict `推荐菜` first, then source-backed `特色菜`.\n- Enrichment queue priority changed from price-first to dish-first.\n- Pages no longer builds or ships `public_pool_area1.js`.\n\n## Expected production effect\n\nThe prior 662-row canonical pool contained 656 legacy Google-verified identities plus six catalog-only reviewed identities. Under this stricter rule, expected production size is approximately 656 before final CI verification.\n""", encoding="utf-8")

print("strict Google-bound cleanup applied")
