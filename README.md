# PDF Coloring Studio

A tablet-first browser prototype for coloring your own black-and-white PDF pages and images. Import, fill closed regions, draw, and export a PNG. All processing stays on the device. There is no account, server, or payment flow.

This is an experiment for clean line art, not a promise that every PDF will color correctly.

## Architecture

The page is three layers:

1. **Source pixels** stay immutable. Region detection always reads them, never the colored result.
2. **Paint** is a transparent buffer. Fills and brushes write solid color into it, including when you recolor a region.
3. **Line art** is composited last. Dark source pixels darken the paint underneath, so outlines stay visible and anti-aliased edges do not leave a white halo.

Modules:

| Module | Role |
| --- | --- |
| `src/editor/document.ts`, `pdf.ts`, `raster.ts` | PNG/JPEG decode and PDF page render |
| `src/editor/regions.ts` | Threshold, gap sealing, flood fill |
| `src/editor/paint.ts`, `composite.ts` | Brushes, fills, and the final composite |
| `src/editor/coordinates.ts`, `components/Stage.tsx` | Pointer events, zoom, and pan |
| `src/editor/history.ts` | Undo and redo snapshots of the paint buffer |
| `src/editor/exportPng.ts` | PNG export at the working resolution |
| `src/components/` | Toolbar, page strip, and the drawing surface |

### Region mask

- Pixels at or below luminance 186 become ink.
- The ink mask is dilated by 2 pixels, which seals orthogonal gaps of about 4 pixels and blocks leaks through gray anti-aliased edges.
- A scanline flood fill (4-connected) runs on that barrier.
- A soft rim, up to 2 pixels, paints paper that the dilation consumed, but it stops at real ink (luminance 78 or darker) and will not step into the outside of the shape.
- If the resulting area touches the image border and covers at least 20% of the page, the first tap does not paint. A second tap fills it. That is how the outer margin, and a leak through a large gap, stay intentional.
- Taps that land on a line sample nearby open pixels and prefer a closed interior over the page margin.

The free brush is not clipped. The inside brush uses the same mask and clips every stamp to it. Both sit under the line overlay, so strokes can cross an outline without erasing it.

Zoom and pan use a CSS transform. Pointer positions are mapped with `getBoundingClientRect()`, so CSS zoom and device pixel ratio stay aligned with source pixels. Two-finger gestures and the Pan tool never paint. The mouse wheel zooms toward the pointer.

## Requirements

- Node.js 22 or newer
- npm

TypeScript is pinned to 5.9 because `typescript-eslint` does not yet accept TypeScript 7. The Vite toolchain and ESLint flat config are both set up.

## Setup

```bash
cd pdf-coloring-studio
npm install
npm run fixtures
```

`npm run fixtures` rewrites the sample pages in `public/fixtures/`. Those files are already generated in this project.

## Develop

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Test

```bash
npm test
```

Vitest checks closed fills, a 3 px sealed gap, a 12 px leak that requires confirmation, outline taps, recoloring, clipped strokes, and undo/redo.

```bash
npm run lint
npm run build
```

## Production build

```bash
npm run build
npm run preview
```

The preview server prints a local URL, usually [http://localhost:4173](http://localhost:4173).

## Samples

- `closed-simple.png` — frame, circle, square, and diamond, all closed
- `detailed-bw.png` — overlapping petal outlines, center, stem, and leaves
- `small-gap.png` — left square has a 3 px opening (sealed); right square has a 12 px opening (open area, second tap)
- `multi-page.pdf` — page 1 is a house, page 2 is rings and a triangle

## Manual checklist

1. Open **Closed shapes**. Fill the circle. Color stays inside. Fill it again with another swatch. The new color replaces the old one.
2. Switch to **Brush** and draw across an outline. The stroke continues on the other side and the line stays dark.
3. Switch to **Inside**, tap the diamond, and scribble past its border. Paint stops at the outline.
4. Undo and redo each of those.
5. Open **Small gap**. Fill the left square: it should stay inside. Fill the right square: the status line should call it an open area and wait for a second tap.
6. Open **Multi-page PDF**, color page 1, switch to page 2, and come back. Page 1 still has its paint.
7. Export PNG and confirm the file matches the size shown in the status line.
8. Zoom with the buttons, the wheel, and a trackpad pinch. Pan with **Pan**, Space-drag, or two fingers. The page underneath the browser should not scroll while a finger is on the canvas.
9. Drop a damaged file or a text file. The status line should explain the failure without losing the last good page... a failed open leaves the previous page in place only if one was already open; the error stays visible.

## iPad Safari

1. On the computer, run `npm run dev -- --host`.
2. Use the Network URL Vite prints. The iPad must be on the same Wi-Fi.
3. Open that URL in Safari. Add to Home Screen if you want a full-screen icon.
4. Allow nothing else. There is no login.
5. Walk the checklist above with a finger and, if you have one, an Apple Pencil. Pencil pressure changes the free and inside brushes.
6. Pinch with two fingers on the page. That gesture pans and zooms and must not leave a stroke.
7. Export PNG. If Safari does not download immediately, the file is still generated from the current page resolution; check the Downloads folder or the share sheet. The export runs synchronously from the button tap so the browser keeps the user gesture.
8. Rotate the iPad and tap **Fit**.

Scrolling the browser chrome while touching the canvas is suppressed with `touch-action: none` and `overscroll-behavior: none`.

## Limits

- Tuned for clean black line art on a light background. Pencil scans, gray paper, color scans, and photos will leak or seal the wrong places.
- Gaps larger than about 4 px stay open. Very thin details closer than about 4 px can merge into one region.
- Pages are scaled so the long edge is at most 1600 px. Export uses that working resolution, not a larger original.
- Undo keeps 8 paint snapshots per page. Several large PDF pages held in memory at once can get heavy; pages render when you select them, and each keeps its own paint.
- Password-protected PDFs are rejected. Unusual PDF features (optional content, some blend modes, live form widgets) may render incompletely because annotations are turned off.
- There is no bucket tolerance slider, no layers panel, and no cloud save.
