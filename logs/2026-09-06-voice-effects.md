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

## CI / Pages integration

The first deployment attempt after adding the isolated effect layer exposed two stale deployment assumptions:

- `scripts/audit_repository.mjs` still required exactly two local runtime scripts (`production_area1.js` + `app.js`);
- `.github/workflows/pages.yml` did not copy the new effect scripts/styles or media directories into `_site`.

These were corrected as part of the same release:

- repository audit now explicitly permits and validates `effects.js` as the third local runtime script;
- the audit checks that `effects.css`, both voice files and `YahaUsagi.webp` exist and that the 2,000 ms voice cap remains configured;
- Pages static checks now run `node --check effects.js`;
- public-site assembly now copies `effects.js`, `effects.css`, `voice/1.mp3`, `voice/2.mp3` and `image/YahaUsagi.webp` into the deployed artifact.

The failed pre-fix Pages run was `33975561481`; its failure was the expected old audit assertion, not a data-build or JavaScript syntax failure.

## Implementation commits

- `a65c2704305a079bcd3016171a0026c2c27bba3f` — cap random voice playback at two seconds;
- `14934e0a4febe3087c0fdd0c7434aa1c003faeaa` — bump the public effect-script cache version;
- `054d0f21eff2eda05342f3d3818c607f5b15e9be` — document the media-feedback architecture in `DEVELOPMENT.md`;
- `f07b92c3304a3927792fde27fa1d935f9edff1a0` — update the repository audit contract for the isolated effect layer;
- `6548aa3833e96745d7598ca63aa0adb16296e582` — include effect runtime/media in Pages checks and public-site assembly.

## Maintenance rule

Adding a new voice requires both placing the media file under `voice/` and adding its path to the `voices` array in `effects.js`. The static browser application does not enumerate repository directories at runtime. If additional public media types are added, the Pages `_site` assembly whitelist and repository audit must be updated at the same time.
