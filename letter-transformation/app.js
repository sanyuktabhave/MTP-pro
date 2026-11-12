/* ------------------------------------------------------------------
   Evolution of the akshara /ka/
   Geometry source: the uploaded transformation sheet (SVG).
   Every keyframe is the original vector outline, extracted by
   tools/extract.py, flattened and arc-length resampled. Nothing in
   this file redraws, substitutes or approximates a letterform; the
   only geometry computed at runtime is the linear interpolation
   between two extracted outlines.
   ------------------------------------------------------------------ */

import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

const VIEW_H = 1.78;          // world units visible vertically
const DEPTH = 0.22;           // extrusion depth
const BEVEL_T = 0.075;
const BEVEL_S = 0.035;
const FRONT = new THREE.Vector3(0, 0, 1);

const boot = document.getElementById('boot');
const fail = (m) => { boot.className = 'boot err'; boot.textContent = m; };

let DATA;
try {
  const res = await fetch('glyphs.json');
  if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
  DATA = await res.json();
} catch (e) {
  fail('Could not load glyphs.json\n\n' + e.message +
       '\n\nThis page must be served over http://, not opened as a file.\nRun:  npm start');
  throw e;
}

let DATA_A = null;
try {
  const r = await fetch('glyphs-a.json');
  if (r.ok) DATA_A = await r.json();
} catch (e) { DATA_A = null; }

async function loadJSON(url) {
  try { const r = await fetch(url); return r.ok ? await r.json() : null; }
  catch (e) { return null; }
}
const MORPH_A = await loadJSON('morph-a.json');
const DATA_CA = await loadJSON('glyphs-ca.json');
const MORPH_CA = await loadJSON('morph-ca.json');
const DATA_KO = await loadJSON('glyphs-ko.json');
const MORPH_KO = await loadJSON('morph-ko.json');
const DATA_SA = await loadJSON('glyphs-sa.json');
const MORPH_SA = await loadJSON('morph-sa.json');
const DATA_TA = await loadJSON('glyphs-ta.json');
const MORPH_TA = await loadJSON('morph-ta.json');
const DATA_NA = await loadJSON('glyphs-na.json');
const MORPH_NA = await loadJSON('morph-na.json');

/* Row 1 frames 4-7 are animated as a rotating shiro-rekha over a morphing
   letter body rather than as a whole-glyph morph. See tools/stemanim.py. */
let STEM = null;
try {
  const r = await fetch('stemanim.json', { cache: 'no-store' });
  if (r.ok) STEM = await r.json();
} catch (e) { STEM = null; }

/* ================= geometry ================= */

const bboxOf = (pts) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
  }
  return [x0, y0, x1, y1];
};

/** Linear interpolation between two extracted contours. Correspondence
 *  is index-to-index: both arrays were arc-length resampled to the same
 *  count and cyclically start-aligned at extraction time. */
function lerpRing(a, b, u, stride) {
  const n = a.length, out = [];
  for (let i = 0; i < n; i += stride) {
    const ax = a[i][0], ay = a[i][1];
    out.push([ax + (b[i][0] - ax) * u, ay + (b[i][1] - ay) * u]);
  }
  return out;
}

function ringToPath(pts, Ctor) {
  const p = new Ctor();
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  p.closePath();
  return p;
}

function placeRing(pts, angDeg, cen) {
  const a = angDeg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const x = pts[i][0], y = pts[i][1];
    out.push([x * c - y * s + cen[0], x * s + y * c + cen[1]]);
  }
  return out;
}

function extrude(shape) {
  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.22, curveSegments: 1, steps: 1,
    bevelEnabled: true, bevelThickness: 0.045, bevelSize: 0.018,
    bevelOffset: 0, bevelSegments: 6,
  });
}

/** The stem segment covering t, or null when the ordinary morph applies.
 *  Within ~1% of a keyframe the exact source contour is used instead, so a
 *  parked frame is always the untouched glyph, drawn as one solid. */
function stemAt(rowIndex, t) {
  if (!STEM || rowIndex !== STEM.row) return null;
  const i = Math.floor(t), u = t - i;
  if (u < 0.012 || u > 0.988) return null;
  const s = STEM.segments.find((x) => x.seg === i);
  return s ? { s, u } : null;
}

/** Frame 7 of row 1 is constructed (frame 6 with the vertical stem removed and
 *  the cross-stroke tilted), not source path #20, so a parked frame 7 must draw
 *  the construction rather than the source contour. */
function stemKeyframe(rowIndex, t) {
  if (!STEM || rowIndex !== STEM.row || !STEM.overrides) return null;
  const i = Math.round(t);
  if (Math.abs(t - i) > 0.012) return null;
  return STEM.overrides[String(i)] || null;
}

function rotRing(pts, angDeg, pivot, stride) {
  const a = angDeg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const out = [];
  for (let i = 0; i < pts.length; i += (stride || 1)) {
    const x = pts[i][0] - pivot[0], y = pts[i][1] - pivot[1];
    out.push([x * c - y * s + pivot[0], x * s + y * c + pivot[1]]);
  }
  return out;
}

/** rest + shiro-rekha for one instant of the stem animation.
 *  The sheet rotates the whole letter, not only the shiro-rekha, so the body
 *  morph is carried out in the rotating frame: frame A is turned forward by
 *  theta(u) and frame B back by theta(u)-delta before they are blended. The
 *  blend then only has to account for the shape difference, not the rotation,
 *  which is what made the plain morph collapse. u=0 and u=1 are unchanged. */
function buildStem(s, u, stride) {
  // The letter body is not a rotation of the previous frame's - its best-fit
  // rotation is only a few degrees, the sheet redraws it - so blending the two
  // outlines produces a shape that is not a letterform. Exactly one body is
  // drawn at a time instead, switched at the midpoint of the stem's travel:
  // whatever is on screen is always untouched source geometry, fully opaque,
  // with no ghost of the other frame behind it.
  let rest;
  if (s.kind === 'tilt') {
    // flipbook of the cross-stroke tilting, lerped between adjacent steps
    const n = s.steps.length, f = u * (n - 1);
    const k = Math.min(n - 2, Math.floor(f)), w = f - k;
    rest = lerpRing(s.steps[k], s.steps[k + 1], w, stride);
  } else if (s.kind === 'morph') {
    rest = lerpRing(s.restA, s.restB, u, stride);
  } else {
    rest = lerpRing(s.restA, s.restB, u, stride);
  }
  let bar = null, opacity = 1;
  if (s.kind === 'rotate') {
    const ang = s.angA + (s.angB - s.angA) * u;
    const d = (ang - s.angA) * Math.PI / 180, c = Math.cos(d), si = Math.sin(d);
    const ax = s.cA[0] - s.pivot[0], ay = s.cA[1] - s.pivot[1];
    const cen = [s.pivot[0] + ax * c - ay * si, s.pivot[1] + ax * si + ay * c];
    bar = placeRing(lerpRing(s.barA, s.barB, u, 1), ang, cen);
  } else {
    opacity = Math.max(0, 1 - u / s.fadeEnd);
    if (opacity > 0.002 && s.barA.length) bar = placeRing(s.barA, s.angA, s.cA);
  }

  const refA = s.restA || s.steps[0], refB = s.restB || s.steps[s.steps.length - 1];
  const ba = bboxOf(refA), bb2 = bboxOf(refB);
  let x0 = Math.min(ba[0], bb2[0]), x1 = Math.max(ba[2], bb2[2]);
  if (bar) { const b = bboxOf(bar); x0 = Math.min(x0, b[0]); x1 = Math.max(x1, b[2]); }
  // Keep the transition centered on its endpoints, never on the moving bar.
  const xoff = -(Math.min(ba[0], bb2[0]) + Math.max(ba[2], bb2[2])) / 2;

  function mk(ring, dz) {
    const g = extrude(ringToPath(ring, THREE.Shape));
    g.translate(xoff, -0.5, -(DEPTH / 2) + (dz || 0));
    g.computeVertexNormals();
    return g;
  }
  return {
    geo: mk(rest), opA: 1, geoB: null, opB: 0,
    barGeo: bar ? mk(bar, 0.0016) : null, opacity, xoff,
  };
}

/** One stage of a sequence letter, exactly as extracted: every solid of the
 *  stage (the letter plus any separate dot) with its counters as holes. No
 *  interpolation of any kind happens here. */
function buildStageGeo(frame, stride) {
  const shapes = [];
  let x0 = Infinity, x1 = -Infinity;
  for (const sol of solidsOf(frame)) {
    const r = lerpRing(sol.outer, sol.outer, 0, stride);
    const bb = bboxOf(r);
    if (bb[0] < x0) x0 = bb[0];
    if (bb[2] > x1) x1 = bb[2];
    const sh = ringToPath(r, THREE.Shape);
    for (const h of sol.holes) {
      sh.holes.push(ringToPath(lerpRing(h, h, 0, Math.max(1, stride >> 1)), THREE.Path));
    }
    shapes.push(sh);
  }
  const xoff = -(x0 + x1) / 2;
  const geo = extrude(shapes);
  geo.translate(xoff, -0.5, -(DEPTH / 2));
  geo.computeVertexNormals();
  return { geo, xoff };
}

/** Morph between two stages of a multi-solid letter. Slot k of stage i is
 *  interpolated against slot k of stage i+1; slots that do not exist in a
 *  stage are degenerate points there, so a dot or counter grows out of, or
 *  shrinks into, the place it belongs. */
function buildMorphMulti(mrow, t, stride) {
  const F = mrow.frames;
  let i = Math.floor(t);
  if (i >= F.length - 1) i = F.length - 2;
  if (i < 0) i = 0;
  const u = Math.max(0, Math.min(1, t - i));
  const A = F[i], B = F[i + 1];

  const shapes = [];
  let x0 = Infinity, x1 = -Infinity;
  for (let k = 0; k < A.solids.length; k++) {
    if (A.solids[k].deg && B.solids[k].deg) continue;
    const r = lerpRing(A.solids[k].o, B.solids[k].o, u, stride);
    const bb = bboxOf(r);
    if ((bb[2] - bb[0]) < 3e-3 && (bb[3] - bb[1]) < 3e-3) continue;
    if (bb[0] < x0) x0 = bb[0];
    if (bb[2] > x1) x1 = bb[2];
    shapes.push({ sh: ringToPath(r, THREE.Shape), main: k === 0 });
  }
  const main = shapes.find((s) => s.main) || shapes[0];
  for (let k = 0; k < A.holes.length; k++) {
    if (A.holes[k].deg && B.holes[k].deg) continue;
    const r = lerpRing(A.holes[k].h, B.holes[k].h, u, Math.max(1, stride >> 1));
    const bb = bboxOf(r);
    if ((bb[2] - bb[0]) < 3e-3 && (bb[3] - bb[1]) < 3e-3) continue;
    if (main) main.sh.holes.push(ringToPath(r, THREE.Path));
  }
  const xoff = (x0 > x1) ? 0 : -(x0 + x1) / 2;
  const geo = extrude(shapes.map((s) => s.sh));
  geo.translate(xoff, -0.5, -(DEPTH / 2));
  geo.computeVertexNormals();
  return { geo, barGeo: null, opacity: 1, xoff, i, u };
}

function buildKeyframe(ring, stride) {
  const r = lerpRing(ring, ring, 0, stride);
  const bb = bboxOf(r);
  const xoff = -(bb[0] + bb[2]) / 2;
  const geo = extrude(ringToPath(r, THREE.Shape));
  geo.translate(xoff, -0.5, -(DEPTH / 2));
  geo.computeVertexNormals();
  return { geo, opA: 1, geoB: null, opB: 0, barGeo: null, opacity: 1, xoff };
}

function buildGeometry(row, t, stride) {
  const F = row.frames;
  let i = Math.floor(t);
  if (i >= F.length - 1) i = F.length - 2;
  if (i < 0) i = 0;
  const u = Math.max(0, Math.min(1, t - i));
  const A = F[i], B = F[i + 1];

  const outer = lerpRing(A.outer, B.outer, u, stride);
  const shape = ringToPath(outer, THREE.Shape);

  for (let h = 0; h < A.holes.length; h++) {
    const ring = lerpRing(A.holes[h], B.holes[h], u, Math.max(1, stride >> 1));
    const bb = bboxOf(ring);
    if (bb[2] - bb[0] < 2e-3 && bb[3] - bb[1] < 2e-3) continue;  // closed counter
    shape.holes.push(ringToPath(ring, THREE.Path));
  }

  const geo = extrude(shape);

  const bb = bboxOf(outer);
  const xoff = -(bb[0] + bb[2]) / 2;
  geo.translate(xoff, -0.5, -(DEPTH / 2));   // x centred, baseline fixed at y = -0.5
  geo.computeVertexNormals();
  return { geo, barGeo: null, opacity: 1, xoff, i, u };
}

/* ================= scene ================= */

const canvas = document.getElementById('gl');
const viewport = document.getElementById('viewport');
const ovl = document.getElementById('ovl');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setClearColor(0xf5f4f2, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf5f4f2);

// Large studio cards give the silver surface broad, readable reflections.
const studio = new THREE.Scene();
studio.background = new THREE.Color(0x343638);
for (const [x,y,z,w,h,power] of [[-3,2,3,2,6,5],[3,1,2,1,5,3],[0,4,-1,6,2,4],[-1,-3,2,4,1,1.5]]) {
  const card = new THREE.Mesh(new THREE.PlaneGeometry(w,h), new THREE.MeshBasicMaterial({color:new THREE.Color().setScalar(power),side:THREE.DoubleSide}));
  card.position.set(x,y,z); card.lookAt(0,0,0); studio.add(card);
}
const pmrem = new THREE.PMREMGenerator(renderer);
const studioMap = pmrem.fromScene(studio, 0.08);
scene.environment = studioMap.texture;
pmrem.dispose();

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -50, 50);
camera.position.set(2.8, 1.1, 10);
camera.lookAt(0, 0, 0);

const controls = new OrbitControls(camera, canvas);
controls.enablePan = false;
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.rotateSpeed = 0.7;
controls.minZoom = 0.45;
controls.maxZoom = 4;

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const hemi = new THREE.HemisphereLight(0xffffff, 0xc9ccd1, 0.65);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xffffff, 1.35);
key.position.set(-0.95, 1.35, 6.4);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.radius = 8;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
const sc = key.shadow.camera;
sc.left = -1.6; sc.right = 1.6; sc.top = 1.6; sc.bottom = -1.6; sc.near = 0.1; sc.far = 12;
sc.updateProjectionMatrix();
scene.add(key);

const fill = new THREE.DirectionalLight(0xffffff, 0.45);
fill.position.set(3.2, 0.6, 2.4);
scene.add(fill);

const rim = new THREE.DirectionalLight(0xffffff, 0.3);
rim.position.set(0.4, -1.8, -2.6);
scene.add(rim);

const material = new THREE.MeshStandardMaterial({
  color: 0xe7e8eb, roughness: 0.19, metalness: 1, envMapIntensity: 1.25,
});

const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
mesh.castShadow = true;
scene.add(mesh);

// the shiro-rekha while it rotates clear of the letter, and while it dissolves
const barMaterial = new THREE.MeshStandardMaterial({
  color: 0xe7e8eb, roughness: 0.19, metalness: 1, envMapIntensity: 1.25,
  transparent: true, opacity: 1,
});
const barMesh = new THREE.Mesh(new THREE.BufferGeometry(), barMaterial);
barMesh.castShadow = true;
barMesh.visible = false;
scene.add(barMesh);

// the incoming letter body during a cross-dissolve
const bodyBMaterial = new THREE.MeshStandardMaterial({
  color: 0xe7e8eb, roughness: 0.19, metalness: 1, envMapIntensity: 1.25,
  transparent: true, opacity: 1,
});
// dedicated fading materials for sequence letters, so the morph letter's
// material can stay opaque
const seqMatIn = new THREE.MeshStandardMaterial({
  color: 0xe7e8eb, roughness: 0.19, metalness: 1, envMapIntensity: 1.25, transparent: true, opacity: 1,
});
const seqMatOut = new THREE.MeshStandardMaterial({
  color: 0xe7e8eb, roughness: 0.19, metalness: 1, envMapIntensity: 1.25, transparent: true, opacity: 1,
});
const bodyBMesh = new THREE.Mesh(new THREE.BufferGeometry(), bodyBMaterial);
bodyBMesh.castShadow = true;
bodyBMesh.visible = false;
scene.add(bodyBMesh);

// shadow catcher behind the letter
const catcher = new THREE.Mesh(
  new THREE.PlaneGeometry(9, 9),
  new THREE.ShadowMaterial({ opacity: 0.10 })
);
catcher.position.z = -0.17;
catcher.receiveShadow = true;
// No ground shadow.
catcher.visible = false;

/* ---- anatomical guides, in 3D so they orbit with the letter ---- */
const guideGroup = new THREE.Group();
guideGroup.visible = false;
scene.add(guideGroup);

function buildGuides(row) {
  guideGroup.clear();
  const g = row.guides;
  const lines = [
    ['topZone', g.topZone, 0xdfe2e5],
    ['topLine', g.topLine, 0xc2c6ca],
    ['baseLine', g.baseLine, 0xc2c6ca],
    ['botZone', g.botZone, 0xdfe2e5],
  ];
  for (const [, y, col] of lines) {
    const pts = [];
    const X = 1.45, N = 56;
    for (let i = 0; i < N; i++) {                       // dashed, as on the sheet
      const a = -X + (2 * X) * (i / N), b = a + (2 * X) / N * 0.5;
      pts.push(new THREE.Vector3(a, y - 0.5, 0), new THREE.Vector3(b, y - 0.5, 0));
    }
    guideGroup.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: col })
    ));
  }
}

/* ================= state ================= */

/* Two letters. /ka/ morphs between outlines; /a/ is shown as a sequence of
   independent stages that fade from one to the next, never morphing. */
const LETTERS = [{ id: 'ka', label: '/ka/', data: DATA, morph: 'builtin' }];
if (DATA_A) LETTERS.push({ id: 'a', label: '/a/', data: DATA_A, morph: MORPH_A });
if (DATA_CA) LETTERS.push({ id: 'ca', label: '/ca/', data: DATA_CA, morph: MORPH_CA });
if (DATA_KO) LETTERS.push({ id: 'ko', label: '/ko/', data: DATA_KO, morph: MORPH_KO });
if (DATA_SA) LETTERS.push({ id: 'sa', label: '/sa/', data: DATA_SA, morph: MORPH_SA });
if (DATA_TA) LETTERS.push({ id: 'ta', label: '/ta/', data: DATA_TA, morph: MORPH_TA });
if (DATA_NA) LETTERS.push({ id: 'na', label: '/na/', data: DATA_NA, morph: MORPH_NA });

const ST = LETTERS.map((L) => L.data.rows.map(() => ({ t: 0 })));
const SEQ = LETTERS.map((L) => L.data.rows.map(() => ({ stage: 0, from: null, p: 1, hold: 0 })));
const ANIM = LETTERS.map(() => 'morph');     // per letter: 'morph' | 'sequence'
let LI = 0;
let rows = LETTERS[0].data.rows;
let st = ST[0];
let seq = SEQ[0];
const mode = () => (ANIM[LI] === 'sequence' ? 'sequence' : 'morph');
const canMorph = () => !!LETTERS[LI].morph;

/** Both letters expose their stages as a list of solids, so the sequential
 *  view can render either one. */
function solidsOf(frame) {
  if (frame.solids) return frame.solids;
  return [{ outer: frame.outer, holes: (frame.holes || []).filter((h) => {
    const b = bboxOf(h);
    return (b[2] - b[0]) > 2e-3 || (b[3] - b[1]) > 2e-3;
  }) }];
}

const HOLD_MS = 850, TRANS_MS = 1600;   // dwell, then a 300ms cross-fade
let cur = 0;
let playing = false, speed = 1, anim = null;
let showRef = false, showGuides = false;
let lastBuilt = -1, lastStride = 0, lastRow = -1;

const el = (id) => document.getElementById(id);
const sl = () => document.getElementById('scrub');
const NOOP = { textContent: '', innerHTML: '', classList: { toggle() {}, add() {}, remove() {} } };
const elo = (id) => document.getElementById(id) || NOOP;   // optional node
const pad = (n) => (n < 10 ? '0' : '') + n;

/* ---- navigation ---- */
const nav = el('nav');
const letterNav = el('letters');
LETTERS.forEach((L, k) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = L.label;
  b.onclick = () => selectLetter(k);
  letterNav.appendChild(b);
});

function selectRow(i) {
  cur = i;
  const row = rows[i];
  playing = false; anim = null;
  [...nav.children].forEach((b, k) => b.setAttribute('aria-current', k === i ? 'true' : 'false'));
  const parts = row.name.split(' to ');
  el('endA').textContent = parts[0].toUpperCase();
  el('endB').textContent = parts[parts.length - 1].toUpperCase();
  const n = row.frames.length;
  const s = el('scrub');
  seq[i] = { stage: 0, from: null, p: 1, hold: 0 };
  st[i].t = 0;
  s.min = 0; s.max = String(n - 1);
  s.step = mode() === 'sequence' ? '1' : '0.001';
  s.value = '0';
  const dots = el('dots');
  dots.innerHTML = '';
  row.frames.forEach((f, k) => {
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'dot' + (f.named ? ' named' : '');
    d.title = (f.stage ? f.stage + ' — ' : '') +
      (f.named ? 'Named on the sheet: ' + f.named : 'Drawn on the sheet, unnamed') +
      ' — source path #' + f.pid;
    d.setAttribute('aria-label', 'Stage ' + (f.stage || k + 1));
    d.onclick = () => goToStage(k, true);
    dots.appendChild(d);
  });
  buildGuides(row);
  lastRow = -1; lastBuilt = -1; lastKey = '';
  syncUI(true);
}

function selectLetter(k) {
  LI = k;
  rows = LETTERS[k].data.rows;
  st = ST[k];
  seq = SEQ[k];
  [...letterNav.children].forEach((b, j) => b.setAttribute('aria-current', j === k ? 'true' : 'false'));
  el('title-letter').textContent = LETTERS[k].label;
  syncAnimBtn();
  nav.innerHTML = '';
  rows.forEach((r, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    const tail = r.name.split(' to ').slice(1).join(' / ').toUpperCase();
    b.textContent = (r.key ? r.key + '  ' : pad(i + 1) + ' ') + tail;
    b.onclick = () => selectRow(i);
    nav.appendChild(b);
  });
  selectRow(0);
}

/** Jump to a stage. `instant` shows it immediately, as a timeline marker
 *  click should; otherwise it cross-fades in over TRANS_MS. */
function goToStage(n, instant) {
  if (mode() !== 'sequence') { goTo(n); return; }
  const s = seq[cur];
  n = Math.max(0, Math.min(rows[cur].frames.length - 1, n));
  if (n === s.stage && s.p >= 1) return;
  playing = false;
  s.from = instant ? null : s.stage;
  s.stage = n;
  s.p = instant ? 1 : 0;
  s.hold = 0;
  syncUI();
}

/* ---- info rail ---- */
let syncKey = '';
function syncUI(force) {
  const row = rows[cur];
  const sequence = mode() === 'sequence';
  const fi = sequence ? seq[cur].stage : Math.round(st[cur].t);
  const f = row.frames[Math.max(0, Math.min(row.frames.length - 1, fi))];
  if (!dragging) {
    const v = sequence ? String(fi) : String(st[cur].t);
    if (el('scrub').value !== v) el('scrub').value = v;
  }
  const k = LI + '|' + cur + '|' + fi + '|' + playing;
  if (k === syncKey && !force) return;
  syncKey = k;

  el('stag').innerHTML =
    '<b>' + (f.stage || pad(fi + 1) + ' / ' + pad(row.frames.length)) + '</b>' +
    '<span>' + (f.named ? f.named : 'unnamed stage') + '</span>';
  el('cap').textContent = f.caption
    ? '\u201c' + f.caption + '\u201d — annotation on the sheet'
    : (row.source ? 'traced resource: ' + row.source : '');

  [...el('dots').children].forEach((d, j) => d.classList.toggle('on', j === fi));
  el('play').textContent = playing ? 'Pause' : 'Play';
  el('play').classList.toggle('on', playing);
}

/* ---- reference overlay (front view only) ---- */
function drawOverlay(xoff) {
  const row = rows[cur], t = st[cur].t;
  const w = viewport.clientWidth, h = viewport.clientHeight;
  ovl.setAttribute('viewBox', `0 0 ${w} ${h}`);

  const frontish = camera.position.clone().normalize().dot(FRONT) > 0.9995;
  if (!showRef || !frontish || Math.abs(t - Math.round(t)) > 0.002) { ovl.innerHTML = ''; return; }

  const f = row.frames[Math.round(t)];
  const k = h * camera.zoom / VIEW_H;      // px per world unit
  const U = DATA.unit, s = k / U;
  const TX = w / 2 - k * f.cx / U + k * xoff;
  const TY = h / 2 - k * row.base / U + 0.5 * k;

  const marks = (row.marks || []).map((m) => m.stroke
    ? `<path d="${m.d}" fill="none" stroke="#C8CCD0" stroke-width="${m.width}"/>`
    : `<path d="${m.d}" fill="#E3E6E9"/>`).join('');

  ovl.innerHTML =
    `<g transform="translate(${TX.toFixed(3)},${TY.toFixed(3)}) scale(${s.toFixed(6)})">` +
    `<path d="${f.rawD}" fill="none" stroke="#1F4FD8" stroke-width="1.6" ` +
    `vector-effect="non-scaling-stroke" opacity="0.95"/>` +
    f.rawHoles.map((d) => `<path d="${d}" fill="none" stroke="#1F4FD8" ` +
      `stroke-width="1.6" vector-effect="non-scaling-stroke" opacity="0.95"/>`).join('') +
    `</g>` +
    `<text x="16" y="${h - 16}" font-family="JetBrains Mono, monospace" font-size="10" ` +
    `fill="#1F4FD8" letter-spacing="1">ORIGINAL SVG OUTLINE · PATH #${f.pid}</text>`;
}

/* ---- rebuild / render ---- */
let lastKey = '';
function refreshSequence(stride) {
  const row = rows[cur], s = seq[cur];
  const key = LI + '|' + cur + '|' + s.stage + '|' + s.from + '|' + s.p.toFixed(3) + '|' + stride;
  if (key === lastKey) return;
  lastKey = key;
  const e = s.p * s.p * (3 - 2 * s.p);              // smooth in/out

  const inc = buildStageGeo(row.frames[s.stage], stride);
  mesh.geometry.dispose();
  mesh.geometry = inc.geo;
  mesh.material = seqMatIn;
  mesh.userData.xoff = inc.xoff;
  seqMatIn.opacity = e;
  mesh.scale.setScalar(0.96 + 0.04 * e);            // 96% -> 100%

  bodyBMesh.geometry.dispose();
  if (s.from != null && s.p < 1) {
    const out = buildStageGeo(row.frames[s.from], stride);
    bodyBMesh.geometry = out.geo;
    bodyBMesh.material = seqMatOut;
    bodyBMesh.scale.setScalar(1);
    seqMatOut.opacity = 1 - e;
    bodyBMesh.visible = true;
  } else {
    bodyBMesh.geometry = new THREE.BufferGeometry();
    bodyBMesh.visible = false;
  }
  barMesh.geometry.dispose();
  barMesh.geometry = new THREE.BufferGeometry();
  barMesh.visible = false;
}

function refresh() {
  const moving = playing || anim !== null || dragging;
  const stride = 1;
  if (mode() === 'sequence') { refreshSequence(stride); return; }
  const row = rows[cur], t = st[cur].t;
  mesh.material = material;
  mesh.scale.setScalar(1);
  const key = LI + '|' + cur + '|' + t + '|' + stride;
  if (key === lastKey) return;
  lastKey = key;
  lastBuilt = t; lastStride = stride; lastRow = cur;
  let built;
  if (LETTERS[LI].id !== 'ka') {
    // parked on a stage: draw the full-resolution extracted geometry
    const near = Math.round(t);
    built = (Math.abs(t - near) < 0.012)
      ? buildStageGeo(row.frames[near], stride)
      : buildMorphMulti(LETTERS[LI].morph.rows[cur], t, stride);
    built.opA = 1; built.geoB = null; built.barGeo = null;
  } else {
    const sa = stemAt(cur, t);
    const kf = sa ? null : stemKeyframe(cur, t);
    if (sa) built = buildStem(sa.s, sa.u, stride);
    else if (kf) built = buildKeyframe(kf, stride);
    else built = buildGeometry(row, t, stride);
  }
  mesh.geometry.dispose();
  mesh.geometry = built.geo;
  mesh.userData.xoff = built.xoff;
  material.opacity = built.opA === undefined ? 1 : built.opA;
  bodyBMesh.geometry.dispose();
  if (built.geoB) {
    bodyBMesh.geometry = built.geoB;
    bodyBMaterial.opacity = built.opB;
    bodyBMesh.visible = true;
  } else {
    bodyBMesh.geometry = new THREE.BufferGeometry();
    bodyBMesh.visible = false;
  }
  barMesh.geometry.dispose();
  if (built.barGeo) {
    barMesh.geometry = built.barGeo;
    barMaterial.opacity = built.opacity;
    barMesh.visible = true;
  } else {
    barMesh.geometry = new THREE.BufferGeometry();
    barMesh.visible = false;
  }
}

function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  if (!w || !h) return;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(w, h, false);
  const a = w / h;
  camera.left = -VIEW_H * a / 2; camera.right = VIEW_H * a / 2;
  camera.top = VIEW_H / 2; camera.bottom = -VIEW_H / 2;
  camera.updateProjectionMatrix();
}

let milestoneHold = 0;
let prevT = performance.now();
function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.1, (now - prevT) / 1000); prevT = now;

  if (mode() === 'sequence') {
    const s = seq[cur], n = rows[cur].frames.length;
    if (s.p < 1) {
      s.p = Math.min(1, s.p + dt * 1000 / (TRANS_MS / speed));
    } else if (playing) {
      s.hold += dt * 1000;
      if (s.hold >= HOLD_MS / speed) {
        s.hold = 0;
        if (s.stage >= n - 1) playing = false;
        else { s.from = s.stage; s.stage += 1; s.p = 0; }
      }
    }
    syncUI();
  } else {
    const row = rows[cur], s = st[cur];
    if (anim) {
      const p = (now - anim.t0) / anim.dur;
      if (p >= 1) { s.t = anim.to; anim = null; }
      else {
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        s.t = anim.from + (anim.to - anim.from) * e;
      }
      syncUI();
    } else if (playing) {
      // Integrate a slow-fast-slow velocity profile between exact milestones.
      if (milestoneHold > 0) milestoneHold = Math.max(0, milestoneHold - dt * speed);
      else {
        const base = Math.floor(s.t + 1e-7);
        const fraction = s.t - base;
        const velocity = 0.16 + 0.80 * Math.pow(Math.sin(Math.PI * fraction), 2);
        const next = s.t + dt * velocity * speed;
        if (next >= base + 1) { s.t = base + 1; milestoneHold = 0.85; }
        else s.t = next;
      }
      if (s.t >= row.frames.length - 1) { s.t = row.frames.length - 1; playing = false; }
      syncUI();
    }
    syncUI();                    // cheap: early-exits unless the stage changed
    if (sl() && !dragging) { const v = String(s.t); if (sl().value !== v) sl().value = v; }
  }

  resize();
  refresh();
  controls.update();
  guideGroup.visible = showGuides;
  renderer.render(scene, camera);
  drawOverlay(mesh.userData.xoff || 0);
}

/* ================= controls ================= */

let dragging = false;
const scrub = el('scrub');
scrub.addEventListener('pointerdown', () => { dragging = true; });
window.addEventListener('pointerup', () => { dragging = false; });
scrub.addEventListener('input', (e) => {
  anim = null; playing = false;
  const v = parseFloat(e.target.value) || 0;
  if (mode() === 'sequence') goToStage(Math.round(v), true);
  else { st[cur].t = v; syncUI(); }
});

function goTo(to) {
  const row = rows[cur];
  to = Math.max(0, Math.min(row.frames.length - 1, to));
  if (Math.abs(to - st[cur].t) < 1e-4) return;
  playing = false;
  anim = { from: st[cur].t, to, t0: performance.now(), dur: 1250 / speed };
}
el('next').onclick = () => (mode() === 'sequence'
  ? goToStage(seq[cur].stage + 1, false)
  : goTo(Math.floor(st[cur].t + 1e-4) + 1));
el('prev').onclick = () => (mode() === 'sequence'
  ? goToStage(seq[cur].stage - 1, false)
  : goTo(Math.ceil(st[cur].t - 1e-4) - 1));
el('play').onclick = () => {
  anim = null;
  if (mode() === 'sequence') {
    const s = seq[cur];
    if (!playing && s.stage >= rows[cur].frames.length - 1 && s.p >= 1) {
      s.stage = 0; s.from = null; s.p = 1; s.hold = 0;       // restart
    }
    s.hold = 0;
  } else if (!playing && st[cur].t >= rows[cur].frames.length - 1 - 1e-3) {
    st[cur].t = 0;
  }
  playing = !playing; syncUI(true);
};
el('reset').onclick = () => {
  anim = null; playing = false;
  if (mode() === 'sequence') seq[cur] = { stage: 0, from: null, p: 1, hold: 0 };
  else st[cur].t = 0;
  camera.zoom = 1; frontView(); lastKey = ''; syncUI(true);
};
function frontView() {
  controls.target.set(0, 0, 0);
  camera.position.set(2.8, 1.1, 10);
  camera.up.set(0, 1, 0);
  camera.updateProjectionMatrix();
  controls.update();
}
el('front').onclick = frontView;
el('tgAnim').onclick = () => {
  if (!canMorph()) return;
  ANIM[LI] = ANIM[LI] === 'morph' ? 'sequence' : 'morph';
  playing = false; anim = null;
  const s = el('scrub');
  s.step = mode() === 'sequence' ? '1' : '0.001';
  const n = rows[cur].frames.length;
  if (mode() === 'sequence') {
    const k = Math.round(Math.max(0, Math.min(n - 1, st[cur].t)));
    seq[cur] = { stage: k, from: null, p: 1, hold: 0 };
  } else {
    st[cur].t = seq[cur].stage;
  }
  lastKey = ''; syncAnimBtn(); syncUI(true);
};
function syncAnimBtn() {
  const b = el('tgAnim');
  b.textContent = mode() === 'sequence' ? 'Sequence' : 'Morph';
  b.classList.toggle('on', mode() === 'morph');
  b.title = mode() === 'sequence'
    ? 'Each stage shown independently, cross-fading between them'
    : 'Geometry interpolated between consecutive stages';
}
el('tgRef').onclick = (e) => { showRef = !showRef; e.target.classList.toggle('on', showRef); };
el('tgGrid').onclick = (e) => { showGuides = !showGuides; e.target.classList.toggle('on', showGuides); };
document.querySelectorAll('.sp').forEach((b) => {
  b.onclick = () => {
    speed = parseFloat(b.dataset.s);
    document.querySelectorAll('.sp').forEach((x) => x.classList.toggle('on', x === b));
  };
});
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' && e.key !== ' ') return;
  if (e.key === 'ArrowRight') { el('next').click(); e.preventDefault(); }
  else if (e.key === 'ArrowLeft') { el('prev').click(); e.preventDefault(); }
  else if (e.key === ' ') { el('play').click(); e.preventDefault(); }
});
let hintT = setTimeout(() => el('hint').classList.add('off'), 5000);
canvas.addEventListener('pointerdown', () => {
  clearTimeout(hintT); el('hint').classList.add('off');
});

/* ================= go ================= */
selectLetter(0);
resize();
frontView();
boot.classList.add('off');
requestAnimationFrame(tick);

// expose for the automated validation harness
window.__ka = {
  get LETTERS() { return LETTERS; },
  get rows() { return rows; },
  get st() { return st; },
  get seq() { return seq; },
  get mode() { return mode(); },
  get cur() { return cur; },
  camera, mesh, selectRow, selectLetter, goTo, goToStage,
  get t() { return st[cur].t; },
};
