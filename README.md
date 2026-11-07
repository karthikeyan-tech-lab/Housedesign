# HouseDesign

A mobile-first, interactive 2D house planner built with React, TypeScript and SVG. No account or backend is required. Designs stay in this browser until exported.

## Run locally

Requires Node.js 22.12+ (Node 24 recommended) and npm.

```sh
npm ci
npm run dev
```

Vite serves the development app at `/`. Production assets use relative URLs so the same build works at the Vercel domain root and the GitHub Pages `/Housedesign/` subpath. For a production build:

```sh
npm run build
npm run preview
```

## Using the planner on Android Chrome

1. Open **Add**, tap a room template, and drag the room on the plan. Desktop users can also drag templates onto the canvas.
2. Select a room and drag its green corner to resize. **Edit** offers exact feet/inches, name, position, 6-inch move buttons and 90° rotation.
3. Select a room or internal wall to add doors/windows. Drag openings around their owner's edges, or edit edge, width and offset. Door swing can be reversed.
4. Pinch with two fingers to zoom and pan. Use **Pan mode** to pan with one finger over rooms. **Fit** restores the whole plot. Undo/redo records edits across both floors.
5. Use **Plot** to change the four corner coordinates, road bearing or wall thickness. Coordinates are in feet. Corners must form a convex quadrilateral; boundary lengths and area update immediately.
6. **Checks** flags room overlaps, rooms/walls outside the plot, overlapping openings and missing schematic door routes. Select an issue to inspect it. Invalid arrangements stay editable with visible warnings.
7. Choose one of four starting layouts from **Add**. Applying a layout changes only the current floor and can be undone.
8. Switch to **First floor (future)** to edit independently over a faded ground-floor reference. Add a porch and door to explore a separate entrance.
9. **Designs** saves named snapshots, loads or duplicates designs, exports PNG/PDF of the current floor, and imports/exports editable JSON containing both floors. Keep JSON backups; browser data can be cleared or unavailable.

## Plot geometry and compass

Initial side lengths are front 15 ft, rear 15 ft, left 45 ft and right 43.5 ft. Side lengths alone do not fix a unique quadrilateral. The initial geometry assumes a perpendicular front-left corner, then solves a circle intersection to preserve **all four lengths**. Its calculated area is approximately **662.06 ft²**, rather than the supplied 663.75 ft² reference. We do not stretch the plot to force an incompatible area. Adjust the coordinates against a survey.

Corners run P1 rear-left, P2 rear-right, P3 front-right, P4 front-left. The frontage is P4 → P3. The road-facing bearing is the outward normal toward the road, initially 39° clockwise from true North. North therefore points 141° clockwise from screen up in the initial plan. Compass and room-centre Vastu sectors follow the actual front-edge angle and bearing, including edited plot geometry.

Room dimensions are **outer footprints including wall thickness**, initially 4.5 inches. Clear interior area deducts wall thickness on both sides. The footprint summary uses an exact polygon union and clips against the plot, avoiding duplicate area from overlaps. Unassigned plot is not automatically circulation space or legally buildable area.

## What V1 includes

- Measured irregular plot and one-foot grid; one-inch drag snap.
- Touch move/resize, pan/zoom, fullscreen, undo/redo.
- Eleven room/passage templates, editable walls, doors/windows and schematic stairs.
- Four distinct editable layouts; independent ground/first floors.
- Bearing-aware compass and optional traditional Vastu guidance.
- Local autosave, named snapshots, duplicate/load and validated JSON import.
- PNG export and A4 PDF export, entirely in the browser.
- GitHub Pages build/deployment workflow.

## Deliberate limits

This is a **concept planner, not a construction-ready architectural drawing**. Rooms and walls are axis-aligned rectangles; rotation is in 90° steps. Individual room polygons, arbitrary-angle walls, automatic shared-wall merging, engineered stair geometry and code-compliant access/egress calculations are not implemented. Doors/windows belong to a room or independent wall, not a merged building wall network. Shared boundaries are schematic.

Door-route warnings use adjacency at opening centres and treat a door leading to unassigned space as a possible route. They do not verify an unobstructed route to the road, door clearances, wall obstructions, minimum widths, setbacks, ventilation, fire safety or local approvals. Floor plans and wall junctions need professional refinement. Vastu is optional cultural guidance, separate from safety.

No structural suitability for G+1, foundations or columns is certified. Consult a Tamil Nadu architect/structural engineer and the applicable local authority. Suggested room sizes and example layouts are editable starting points, not approved designs.

The interactive **3D module is deferred until the 2D editor is approved**, as requested. The versioned geometry model in `src/model.ts` keeps plot, floor, room, wall and opening data separate from SVG rendering so a later Three.js adapter can consume real measurements. No generated images substitute for editable geometry.

## Validation

```sh
npm test          # geometry, compass, layout, area, connectivity and import tests
npm run build    # strict TypeScript check and production build
npm run test:e2e # mobile Chromium interactions and browser export/storage tests
npm run test:deployment # build and test production assets at root and repo subpath
```

The Playwright config uses the system Chromium at `/usr/bin/chromium`. Override `CHROMIUM_PATH` if installed elsewhere. On another machine, install Chromium or use Playwright's browser (`npx playwright install chromium`, then `CHROMIUM_PATH=bundled npm run test:e2e`). Browser tests use a Pixel 7 touch viewport, real CDP touch events, and portrait/landscape/desktop sizes. They cover moving Kitchen to East, resizing Bedroom, adding Pooja, moving stairs, opening repositioning, overlap/outside warnings, undo/redo, saving/reloading and JSON/PNG/PDF export. These are emulated mobile checks; physical Android testing remains recommended.

## Deploy to GitHub Pages

The workflow in `.github/workflows/deploy.yml` tests and builds on pull requests. Pushes to `main` (or manual runs on `main`) additionally deploy `dist` using GitHub Pages Actions. In repository **Settings → Pages**, choose **GitHub Actions** as the source. No credentials are bundled in the app. Relative asset paths support the repository subpath without a host-specific build.

## Deploy to Vercel

Import the GitHub repository into Vercel and use the Vite framework preset. `vercel.json` specifies `npm run build` and the `dist` output directory. Serve the output at the domain root; no `/Housedesign/` prefix or asset rewrite is required. A connected Vercel project can redeploy when `main` is pushed. The production hosting regression tests serve the same `dist` files at both `/` and `/Housedesign/`, checking application startup, styles, asset responses and lazy-loaded PDF export.

## Code map

- `src/model.ts`: versioned domain model, geometry, presets, validation and direction rules.
- `src/Editor.tsx`: SVG rendering, selection and pointer gestures.
- `src/App.tsx`: editing controls, undo/redo, floor and design workflow.
- `src/storage.ts`: validated local persistence reads.
- `src/exports.ts`: portable JSON download and SVG-to-PNG/PDF export (PDF loaded on demand).
- `tests/`: domain and browser regression tests.

Future cloud tasks should use the existing isolated checkout rather than creating a worktree. Install with `npm ci`, start with `npm run dev`, then verify the `/` route and run the checks above after changes.
