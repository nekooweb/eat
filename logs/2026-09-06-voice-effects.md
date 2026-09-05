# 2026-09-06 Voice / Mascot Release Log

## Scope

This release is intentionally limited to the random-button media feedback layer. Restaurant data, filters, recommendation sampling, maps and source-maintenance logic were not changed.

## Asset organization

- random voices live under `voice/`;
- current voice pool: `1.mp3`, `1maybevaluable.mp3`, `2.mp3`, `2currency.mp3`, `4maps.mp3`;
- mascot artwork lives under `image/`;
- current mascot pool: `YahaUsagi.webp`, `Momonga.webp`, `SweetBabyHachiware2.webp`;
- presentation behavior lives in `effects.js` and `effects.css`, separate from `app.js`.

## Runtime behavior

On every click of `#generate`:

1. the existing restaurant generation logic continues unchanged;
2. `effects.js` randomly chooses one configured voice from the five-file pool;
3. any previous voice is paused, rewound and discarded before the new voice starts;
4. playback volume is `0.45`;
5. voice playback is capped at **2 seconds**; shorter clips end naturally;
6. audio errors are ignored so they cannot block restaurant generation;
7. one mascot is chosen from the configured WebP pool;
8. one placement is chosen from **top-left, top-center, top-right, side-left or side-right**;
9. the immediately previous mascot **and** immediately previous placement are both excluded from the next random choice;
10. the selected mascot appears for about 1.9 seconds and then hides.

With three mascot images and five placement classes, the current UI has 15 character/position combinations while still preventing obvious immediate repetition of either dimension.

## Mascot placement correction

The first mascot implementation intentionally placed the artwork behind the button (`z-index: 1` versus the button's `z-index: 2`) to create a peek-out effect. With the actual artwork this made too much of the character appear underneath the button and looked visually incorrect.

The corrected behavior is:

- mascot layer is above the button at `z-index: 4`;
- the wrapper explicitly allows visible overflow;
- each placement has its own entrance direction, rotation and exit direction;
- side placements use a slightly smaller mascot so they do not dominate the button;
- mobile offsets are tightened so the character stays within the visible screen area;
- the mascot remains `pointer-events: none`, so it can visually overlap the button without blocking clicks.

This is still a presentation-only effect. Mascot choice and placement have no relationship to the selected restaurants or voice clip.

## Cache / release handling

`index.html` currently loads `effects.css?v=20260906-mascot2` and `effects.js?v=20260906-voice3`. The JavaScript cache version was incremented so Pages clients immediately receive the expanded five-voice pool and the new 45% playback volume.

## CI / Pages integration

The first deployment attempt after adding the isolated effect layer exposed two stale deployment assumptions:

- `scripts/audit_repository.mjs` still required exactly two local runtime scripts (`production_area1.js` + `app.js`);
- `.github/workflows/pages.yml` did not copy the new effect scripts/styles or media directories into `_site`.

These were corrected and later generalized:

- repository audit explicitly permits and validates `effects.js` as the third local runtime script;
- the audit checks the 2,000 ms voice cap and verifies that every WebP currently present in `image/` is configured in the mascot pool;
- the audit verifies that character and placement repeat-prevention state remains present;
- Pages static checks run `node --check effects.js`;
- public-site assembly copies `voice/*.mp3` and `image/*.webp` rather than hard-coding individual media filenames.

This means newly committed MP3 and WebP files are automatically included in the deployed Pages artifact. Runtime selection is still controlled explicitly by the `voices` and `mascots` arrays in `effects.js`, because a static browser cannot enumerate repository directories at runtime.

The failed pre-fix Pages run was `33975561481`; its failure was the expected old audit assertion, not a data-build or JavaScript syntax failure.

## Implementation commits

- `a65c2704305a079bcd3016171a0026c2c27bba3f` — cap random voice playback at two seconds;
- `14934e0a4febe3087c0fdd0c7434aa1c003faeaa` — bump the first public effect-script cache version;
- `054d0f21eff2eda05342f3d3818c607f5b15e9be` — document the media-feedback architecture in `DEVELOPMENT.md`;
- `f07b92c3304a3927792fde27fa1d935f9edff1a0` — update the repository audit contract for the isolated effect layer;
- `6548aa3833e96745d7598ca63aa0adb16296e582` — include effect runtime/media in Pages checks and public-site assembly;
- `731b53e5b084e8849ad472ede29e03d75fbe0865` — move the mascot above the button and define five responsive placement styles;
- `9f51c1d88756cc0437ba4228c519d130fd7a0d31` — choose a different random mascot placement on every click;
- `ddcbaa732ccf01f77edf0f28d91d010e99b0a110` — refresh both effect assets with the `mascot2` cache version;
- `8a3bbce20678dacbce68bf2737ff9391800a5bcd` — add YahaUsagi, Momonga and SweetBabyHachiware2 to the mascot pool and prevent immediate character repeats;
- `d9155f616b47ec9309ced75aab0553af84421775` — deploy all MP3/WebP assets via wildcard media copying;
- `a19e94f71f0166dab37ad6e06c1cb9381d07f1d9` — audit every repository WebP against the configured mascot pool;
- `9009f57e21e74989e666722f13b02abd837dcc72` — bump the multi-mascot JavaScript cache version;
- `96dab607a972d6838796299888fac4b0b5348c6f` — expand the random voice pool to five MP3 files and lower playback volume to 45%;
- `4a4420102209f4e1641a1b4e872745ebb1eefcd3` — bump the public effect runtime cache to `voice3`.

## Maintenance rule

Adding a new voice requires placing the media file under `voice/` and adding its path to the `voices` array in `effects.js` if it should be selectable. Pages already copies all `voice/*.mp3` files automatically.

Adding a new mascot requires placing the `.webp` file under `image/` and adding its path to the `mascots` array in `effects.js`. Pages will copy all WebPs automatically, while the repository audit intentionally fails if an image exists but was forgotten in the runtime pool.

New mascot positions should be implemented as a paired change: add the placement class name to `mascotPlacements` in `effects.js`, then add the matching responsive position and motion variables in `effects.css`. Keep all mascot placements around or above the generate button and retain `pointer-events: none`.
