// Closed allow-list for provider labels that may appear on accepted dish evidence.
// Additions must correspond to an already-maintained reviewed/source-fact provider;
// this is intentionally not derived from arbitrary input data at runtime.
export const ALLOWED_DISH_EVIDENCE_PROVIDERS = Object.freeze([
  'Hot Pepper',
  'sourceWebsite',
  'Tabelog',
  'official',
  'Visit Chiyoda',
  'Tokyo Ramen of the Year'
]);

export function allowedDishEvidenceProviderSet() {
  return new Set(ALLOWED_DISH_EVIDENCE_PROVIDERS);
}
