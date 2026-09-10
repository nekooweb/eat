// Shared contract for scripts that consume the materialized public runtime.
// The frozen catalog size is stable; the number of currently publishable named
// rows is allowed to change as identities are recovered or quarantined.
export function assertRuntimeCatalogContract(runtime, { expectedCatalogTotal = 2804 } = {}) {
  const rows = Array.isArray(runtime?.GOOGLE_INVENTORY_RESTAURANTS)
    ? runtime.GOOGLE_INVENTORY_RESTAURANTS
    : [];
  const stats = runtime?.GOOGLE_INVENTORY_STATS || {};
  const catalogTotal = Number(stats.catalogTotal);
  const inventoryTotal = Number(stats.inventoryTotal);
  const unpublished = Number(stats.unpublishedPlaceIdOnly || 0);

  if (catalogTotal !== expectedCatalogTotal) {
    throw new Error(`Frozen catalog mismatch: ${catalogTotal}/${expectedCatalogTotal}`);
  }
  if (inventoryTotal !== rows.length) {
    throw new Error(`Published runtime/stat count mismatch: ${rows.length}/${inventoryTotal}`);
  }
  if (rows.length + unpublished !== expectedCatalogTotal) {
    throw new Error(`Public/unpublished catalog reconciliation mismatch: ${rows.length}+${unpublished}/${expectedCatalogTotal}`);
  }

  const ids = rows.map((row) => String(row?.googlePlaceId || '').trim());
  if (ids.some((id) => !id)) throw new Error('Public runtime contains a missing Place ID');
  if (new Set(ids).size !== ids.length) throw new Error('Public runtime contains duplicate Place IDs');

  return { rows, stats, catalogTotal, inventoryTotal, unpublished };
}
