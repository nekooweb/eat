# 2026-09-06 Voice / Mascot Release Log

## Scope

This release is intentionally limited to the random-button media feedback layer. Restaurant data, filters, recommendation sampling, maps and source-maintenance logic were not changed.

## Asset organization

- moved random voices to `voice/1.mp3` and `voice/2.mp3`;
- moved mascot artwork to `image/YahaUsagi.webp`;
- presentation behavior lives in `effects.js` and `effects.css`, separate from `app.js`.

## Runtime behavior

On every click of `#generate`:

1. the existing restaurant generation logic continues unchanged;
2. `effects.js` randomly chooses one file from its explicit `voices` list;
3. any previous voice is paused, rewound and discarded before the new voice starts;
4. playback volume is `0.55`;
5. voice playback is capped at **2 seconds**; shorter clips end naturally;
6. audio errors are ignored so they cannot block restaurant generation;
7. `YahaUsagi.webp` pops out from the generate-button edge for about 1.9 seconds and then hides;
8. repeated clicks restart both feedback effects cleanly without stacking audio.

## Cache / release handling

`index.html` now loads `effects.js?v=20260906-voice2` so GitHub Pages browsers request the new two-second-capped implementation instead of a cached `voice1` script.

## Implementation commits

- `a65c2704305a079bcd3016171a0026c2c27bba3f` — cap random voice playback at two seconds;
- `14934e0a4febe3087c0fdd0c7434aa1c003faeaa` — bump the public effect-script cache version;
- `054d0f21eff2eda05342f3d3818c607f5b15e9be` — document the media-feedback architecture in `DEVELOPMENT.md`.

## Maintenance rule

Adding a new voice requires both placing the media file under `voice/` and adding its path to the `voices` array in `effects.js`. The static browser application does not enumerate repository directories at runtime.
