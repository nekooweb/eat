#!/usr/bin/env python3
"""Verify only OSM candidates that overlap an existing curated restaurant name.

This keeps the normal verifier/QC implementation authoritative while allowing us
to recover historical curated metadata without running the unresolved half of the
entire OSM pool.
"""

import verify_google_places as verifier


def main():
    all_rows = verifier.load_candidates()
    selected = [row for row in all_rows if row.get('curatedOverlap')]
    print(
        f'curated_overlap_mode total_candidates={len(all_rows)} '
        f'selected={len(selected)}'
    )

    # Reuse the normal verifier unchanged. Its terminal QC-v4 cache entries are
    # skipped automatically, so only new/unresolved overlap rows consume calls.
    verifier.load_candidates = lambda: selected
    verifier.BATCH_LIMIT = 0
    verifier.main()


if __name__ == '__main__':
    main()
