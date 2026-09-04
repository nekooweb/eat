# Eat

A lightweight static “今天吃什么？” restaurant decision page.

Live site: `https://nekooweb.github.io/eat/`

## Current focus
The current development milestone is a reliable `TOKYO / 地区1️⃣` restaurant pool inside a strict 1.2km straight-line boundary. Restaurant candidates are discovered from public sources, but production recommendations require Google Maps/Places business verification.

## Runtime stack
- static HTML
- CSS
- vanilla JavaScript
- Leaflet + OpenStreetMap for the three-result overview map
- GitHub Pages hosting

There is no runtime backend and no runtime restaurant API call.

## Maintenance/data stack
- Python scripts under `scripts/`
- OpenStreetMap candidate collection
- Google Places API (New) verification/enrichment
- Tabelog/manual source-backed enrichment
- GitHub Actions for data generation and deployment

Google credentials are maintenance-only GitHub Secrets and are never shipped to the browser.

## Main files

### Frontend
- `index.html` — page structure and static asset/data load order
- `styles.css` — responsive visual system
- `app.js` — filters, eligibility, weighted random selection, result rendering and maps

### Data
- `data/` — candidate, enrichment, Google verification cache/overlay and other static datasets

### Maintenance
- `scripts/build_area1_osm.py` — Area1 OSM candidate builder
- `scripts/verify_google_places.py` — Google Place resolution, detail enrichment and QC
- `.github/workflows/verify-google-places.yml` — staged/batch Google verification
- `.github/workflows/pages.yml` — GitHub Pages deployment

## Documentation
- `REQUIREMENTS.md` — authoritative product and data requirements
- `ARCHITECTURE.md` — frontend/data/build architecture and code responsibilities
- `DEVELOPMENT.md` — development phases, maintenance procedure and definition of done
- `DATA_RESEARCH.md` — source research and restaurant-data investigation notes
- `CHANGELOG.md` — implementation/decision log

When code and documentation disagree, treat `REQUIREMENTS.md` as the intended product rule and verify the implementation before assuming it complies.

## Core recommendation rules
- only Google-verified production entities
- Area1 absolute straight-line distance <=1.2km
- optional food exclusion / budget / preferred-distance filters
- three distinct primary cuisine families when possible
- browser crypto randomness
- verified 百名店 sampling weight currently 2.2 vs ordinary 1.0
- no popularity/rating ranking
- no opening-hours exclusion until the final holiday/opening rule is specified

## Data-source policy
Google Maps/Places is the final business-identity gate. OSM and Tabelog can discover or enrich candidates, but their presence alone does not make a restaurant production-eligible. Unknown metadata stays unknown rather than being invented.

## Current work
Google Places QC v2 is being applied to the Area1 candidate pool. After verification stabilizes, the next major task is to normalize the accumulated data files into a canonical verified Area1 dataset and then add Google-first discovery to audit coverage beyond OSM candidates.
