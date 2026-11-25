# kres+ – modded KRESKA.art

Static archive of the KRESKA.art drawing and painting app (https://kreska.art/app/), captured 2026-11-25.

- `index.html` – the app (entry point)
- `kresplus.css`, `kresplus-ui.js` – the glass interface and small-screen controls
- `core/`, `*.js` – app code and libraries
- `preview/`, `icons/` – brush previews and icons
- `archive/` – capture manifest and rendered page snapshot

Third-party trackers/ads captured in the archive were not included. kres+ is an unofficial mod and remake of KRESKA.art. Original app, engine and brushes by Michal Bednarczyk (https://kreska.art/); donations belong to the original creator.

## Archive limitations

The capture does not include the original `shape/`, `grain/`, or `fonts/` assets. Some textured brushes, including the default pencil and eraser, cannot make marks without their missing textures. Select **Basic → hard round** in the Paint or Erase brush panel to use a built-in brush that works without them. Missing fonts fall back to system fonts.

## UI checks

Run the dependency-free gesture tests with `node --test tests/kresplus-ui.test.cjs`.
