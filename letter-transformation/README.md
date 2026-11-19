# Evolution of the akshara

An interactive 3D exploration of eight letters: /ka/, /a/, /ca/, /ko/, /sa/, /ta/, /na/, and /pa/. Includes Gujarati, Bengali, and Tamil transformation branches, chrome rendering, timeline scrubbing, and playback with milestone holds.

## Run locally

Requires Python 3. From this directory:

```sh
python3 -m http.server 8765
```

Open http://localhost:8765. Serve over HTTP so the browser can load the geometry JSON and JavaScript modules.

## Source

- `index.html`, `styles.css`, `app.js`: interface and animation.
- `glyphs*.json`, `morph*.json`, `stemanim.json`: milestone outlines and transformation geometry.
- `vendor/`: bundled Three.js and OrbitControls.

The Gujarati transitions remove the upper headline while retaining the letter's internal strokes. The /na/ sheet contains 22 milestones across its three branches.

The /pa/ sheet contains 19 milestones: 7 toward Gujarati, 6 toward Bengali, and 6 toward Tamil. Its upper Devanagari headline retracts before the Gujarati form.
