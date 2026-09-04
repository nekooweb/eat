# Eat Page Requirements

## Scope
- Single-page static web app hosted at `https://nekooweb.github.io/eat/`.
- No backend. All behavior and data are maintained directly in repository code/data files.
- Fast loading and usable on both mobile and desktop.
- Initial users: `ziko` and `neko`.

## UI flow
1. User selector at the top with the two names: `ziko` and `neko`.
2. Area selector.
3. Food-category rejection filters using checkboxes or equivalent multi-select controls.
4. Expected-budget filter using checkbox/range-style preset controls.
5. One primary button to generate a proposal.
6. After clicking, filter the local food repository by the selected conditions and then choose one eligible entry with uniform random selection.
7. Result view shows at minimum:
   - restaurant / food-place name;
   - Google Maps map preview;
   - direct Google Maps link to the place page, where the user can inspect ratings/reviews and approximate price information available from Google.

## Data model
- Food repository is stored locally in static JS/JSON data.
- Each entry should support at least: name, area, rejected-category tags / cuisine tags, budget band, Google Maps query or Place ID, and optional address/coordinates.
- Random selection must be performed only after all active filters are applied.
- Eligible entries should have equal probability unless a future requirement explicitly adds weighting.

## Technical direction
- Static HTML + CSS + vanilla JavaScript.
- Use Pico CSS as the lightweight responsive baseline, preferably vendored locally rather than loaded from a CDN.
- Keep dependencies minimal and avoid a build step unless later requirements make one necessary.
- Use Google Maps URLs for the direct place link; Google Maps URLs do not require an API key.
- Map preview should remain simple and not introduce a backend.

## Visual direction
- Bright, playful, rounded, cute visual language inspired by the energetic yellow/white feel associated with Usagi from Chiikawa, without copying official character artwork.
- Primary palette direction: warm yellow + white, with dark text and small accent colors.
- Large touch targets, rounded cards/buttons, clear spacing, minimal page chrome.

## Open questions
- Exact list of selectable areas.
- Exact food-category taxonomy used for rejection filters.
- Exact budget presets.
- Whether `ziko` and `neko` will have separate saved/default preferences or are initially only identity selectors.
- Whether the same restaurant can belong to multiple food categories and budget bands.
