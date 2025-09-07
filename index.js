// index.js
// Three.js background scene: starfield + planets + warped spacetime grid

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const canvas = document.getElementById('bg-canvas');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true, // keep background transparent so page shows through
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75)); // cap DPR for perf
window.addEventListener('resize', resize);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2000);

// --- Framing + zoom helpers ---
function lerp(a, b, t) { return a + (b - a) * t; }
// nice S-curve: starts gentle, ends gentle
function easeInOut(t) { return t * t * (3 - 2 * t); } 

// f = 0 center; f = 1 puts origin at the right edge
// zoom = 1 keeps your base FOV; <1 zooms out; >1 zooms in
function setFraming({ fractionRight = 0.0, zoom = 1.0 }) {
  const W = renderer.domElement.clientWidth;
  const H = renderer.domElement.clientHeight;

  const offsetX = -(W * 0.5 * fractionRight);
  camera.setViewOffset(W, H, offsetX, 0, W, H);

  const baseFov = 55;              // your starting FOV
  camera.fov = baseFov / zoom;     // zoom<1 => larger FOV (zoomed out)
  camera.updateProjectionMatrix();
}

camera.position.set(0, 18, 32);
camera.lookAt(0, 0, 0);
resize();

// --- Scroll-driven composition ---
let heroHeight = 0;

// Start state (at page load)
const START_FRAC = 0.20; // 20% from center toward right edge
const START_ZOOM = 0.92; // slightly zoomed out
// End state (post-hero)
const END_FRAC = 0.00;   // centered
const END_ZOOM = 1.00;   // base zoom

// Cache the hero height for our mapping
function measureHero() {
  const heroEl = document.querySelector('.hero');
  heroHeight = heroEl ? heroEl.getBoundingClientRect().height : window.innerHeight;
}
measureHero();

let scrollRafPending = false;
function onScroll() {
  if (!scrollRafPending) {
    scrollRafPending = true;
    requestAnimationFrame(applyScrollFraming);
  }
}
window.addEventListener('scroll', onScroll, { passive: true });

function applyScrollFraming() {
  scrollRafPending = false;

  // Progress through the hero: 0 at top, 1 near the end of hero
  const y = window.scrollY || window.pageYOffset || 0;
  const range = heroHeight * 0.8; // end a bit before hero ends
  let t = Math.max(0, Math.min(1, y / Math.max(1, range))); // clamp 0..1
  t = easeInOut(t);

  const f = lerp(START_FRAC, END_FRAC, t);
  const z = lerp(START_ZOOM, END_ZOOM, t);

  setFraming({ fractionRight: f, zoom: z });
}

// After you create your camera and run your initial resize:
setFraming({ fractionRight: START_FRAC, zoom: START_ZOOM });
applyScrollFraming(); // ensures consistent on refresh-at-offset

// --- Starfield (sparse white points) ---
// Replaces previous "makeStarfield" code
function makeStarfield({
  count = 700,        // low density
  spread = 450,       // overall bounds
  minRadius = 40,     // keep stars away from camera
  zBias = -60,        // bias stars to be mostly behind the scene
} = {}) {
  const positions = [];
  const tmp = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    // sample in a box, then reject if too close to camera
    let x, y, z;
    let tries = 0;
    do {
      x = (Math.random() - 0.5) * spread;
      y = (Math.random() - 0.5) * spread * 0.5; // a bit flatter vertically
      z = (Math.random() - 0.5) * spread + zBias; // push overall behind camera/look target
      tmp.set(x, y, z);
      tries++;
      // avoid a bubble around the camera origin (we’re roughly looking at (0,0,0))
      // If your camera isn’t at the world origin, you can subtract camera.position here.
    } while (tmp.length() < minRadius && tries < 8);

    positions.push(x, y, z);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color: 0xffffff,       // white stars
    size: 0.7,             // tiny points
    sizeAttenuation: true, // smaller with distance
    transparent: true,
    opacity: 0.65,         // faint for legibility
    depthWrite: false,     // don’t affect depth buffer
    depthTest: true,       // OK to test depth so distant stars hide behind planets
  });

  const stars = new THREE.Points(geom, mat);
  stars.renderOrder = -1;
  return stars;
}

scene.add(makeStarfield({
  count: 550,   // tweak to taste: 400–900 looks good
  spread: 720,
  minRadius: 55,
  zBias: -100,
}));

// --- SUN (at scene origin) and lighting ---

// Remove your previous ambient/key lights and planet lights.
// Keep a gentle ambient if you like:
scene.add(new THREE.AmbientLight(0xffffff, 0.25));

const sun = new THREE.Mesh(
  new THREE.SphereGeometry(2.4, 64, 64),
  new THREE.MeshStandardMaterial({
    emissive: 0xffcc55,
    emissiveIntensity: 1.0,
    color: 0x221100,
    roughness: 0.6,
    metalness: 0.0,
  })
);
sun.position.set(0, 0, 0);
scene.add(sun);

// Point light from the Sun
const sunLight = new THREE.PointLight(0xffeeaa, 12.2, 900, 1.0);
sunLight.position.copy(sun.position);
scene.add(sunLight);

// Soft corona (additive glow)
{
  const corona = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 64, 64),
    new THREE.MeshBasicMaterial({
      color: 0xffcc55,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  scene.add(corona);
}


// --- Planets + Orbits ---

const AU = 10;               // world units per AU
const YEAR_SECONDS = 60;     // 1 "year" in animation seconds (tweak for speed)
const TWO_PI = Math.PI * 2;

// Earth baseline size; others scale from it
const EARTH_R = 1.2;

function makePlanet({
  name,
  radius,       // mesh radius
  color,
  orbitAU,      // orbital radius in AU
  yearDays,     // orbital period (days)
  axialTilt = 0,
  selfSpin = 0.005,  // radians/frame-ish; small
  phase = Math.random() * TWO_PI, // random starting position
}) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 64, 64),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      metalness: 0.1,
      emissive: 0x000000,
    })
  );
  mesh.rotation.z = THREE.MathUtils.degToRad(axialTilt);
  mesh.userData = {
    name,
    orbitR: orbitAU * AU,
    omega: TWO_PI / (YEAR_SECONDS * (yearDays / 365)), // rad/sec using our timescale
    phase,
    selfSpin,
  };
  scene.add(mesh);

  // optional orbit ring (faint wire)
  const ring = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(
      new Array(256).fill(0).map((_, i) => {
        const a = (i / 256) * TWO_PI;
        return new THREE.Vector3(Math.cos(a) * mesh.userData.orbitR, 0, Math.sin(a) * mesh.userData.orbitR);
      })
    ),
    new THREE.LineBasicMaterial({ color: 0x8e99dd, transparent: true, opacity: 0.15 })
  );
  scene.add(ring);

  return mesh;
}

const mercury = makePlanet({
  name: 'Mercury',
  radius: EARTH_R * 0.383,
  color: 0xb7b7b7,
  orbitAU: 0.39,
  yearDays: 88,
  axialTilt: 0.03,
  selfSpin: 0.002,
});

const venus = makePlanet({
  name: 'Venus',
  radius: EARTH_R * 0.949,
  color: 0xe0c69b,
  orbitAU: 0.72,
  yearDays: 225,
  axialTilt: 177.4,       // retrograde (we won't simulate retro spin here; just the tilt)
  selfSpin: 0.0004,
});

const earth = makePlanet({
  name: 'Earth',
  radius: EARTH_R,
  color: 0x5aa7ff,        // stylized blue
  orbitAU: 1.0,
  yearDays: 365,
  axialTilt: 23.4,
  selfSpin: 0.007,
});

const mars = makePlanet({
  name: 'Mars',
  radius: EARTH_R * 0.532,
  color: 0xd76b42,
  orbitAU: 1.52,
  yearDays: 687,
  axialTilt: 25.2,
  selfSpin: 0.006,
});

const planets = [mercury, venus, earth, mars];

// --- Subtle mouse parallax ---
const mouse = new THREE.Vector2(0, 0);
window.addEventListener('mousemove', (e) => {
  const mx = (e.clientX / window.innerWidth) * 2 - 1;
  const my = (e.clientY / window.innerHeight) * 2 - 1;
  mouse.set(mx, my);
});

function updateParallax(dt) {
  // small camera nudge only (don’t make users seasick)
  const targetX = mouse.x * 1.0;
  const targetY = mouse.y * 0.6;
  camera.position.x += (targetX - camera.position.x * 0.05) * 0.08;
  camera.position.y += ((18 + targetY) - camera.position.y) * 0.06;
  camera.lookAt(0, 0, 0);
}

// --- Minimal Starship with ogive (+ flaps) ---

// === Hinged flap helper ===
// Hinge axis is vertical (Y). Flap area lies in the XZ plane.
// The inner edge (hinge) sits exactly on the hull at x = ±bodyRadius.
// 'outboardX' = how far the flap sticks out from the hull.
// 'chordZ'    = fore–aft length.
// 'thicknessY' = very thin vertical thickness.
function makeHingedFlap({
  side,           // 'L' or 'R'
  y, z,           // placement on the hull
  outboardX,      // extent out from hull (X)
  chordZ,         // fore–aft length (Z)
  thicknessY = 0.035, // THIN (vertical)
  deflectDeg = 0, // initial feather angle (rotate about Y)
  mat,
  bodyRadius
}) {
  // Box: (X = outboard), (Y = THIN), (Z = chord) -> plane is XZ
  const geo = new THREE.BoxGeometry(outboardX, thicknessY, chordZ);

  // Move origin to the inboard X edge so the hinge line is at x = 0
  if (side === 'R') {
    geo.translate(+outboardX / 2, 0, 0); // mass extends toward +X
  } else {
    geo.translate(-outboardX / 2, 0, 0); // mass extends toward -X
  }

  const flap = new THREE.Mesh(geo, mat);
  flap.material.side = THREE.DoubleSide;

  // Put hinge exactly on the body skin
  const x = (side === 'R') ? +bodyRadius : -bodyRadius;
  flap.position.set(x, y, z);

  // Feather around vertical hinge (Y axis)
  const sgn = (side === 'R') ? +1 : -1;
  flap.rotation.y = THREE.MathUtils.degToRad(sgn * deflectDeg);

  return flap;
}

// --- Minimal Starship with ogive (+ hinged flaps) ---
function makeSimpleStarship({ scale = 0.4 } = {}) {
  const ship = new THREE.Group();

  // Body aligned to Z
  const BODY_R   = 0.42;
  const BODY_LEN = 3.2;

  const bodyGeo = new THREE.CylinderGeometry(BODY_R, BODY_R, BODY_LEN, 12);
  bodyGeo.rotateX(Math.PI / 2); // Y -> Z
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.6, roughness: 0.5 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  ship.add(body);

  // Ogive (tip forward into -Z)
  const NOSE_LEN = 0.9;
  const noseGeo = new THREE.ConeGeometry(BODY_R, NOSE_LEN, 20, 1, false);
  noseGeo.rotateX(-Math.PI / 2); // tip -> -Z
  const nose = new THREE.Mesh(
    noseGeo,
    new THREE.MeshStandardMaterial({ color: 0xb9bfcf, metalness: 0.55, roughness: 0.45 })
  );
  nose.position.z = -(BODY_LEN / 2) - (NOSE_LEN / 2);
  ship.add(nose);

  // --- Flaps (thin plates sticking straight out) ---
  const flapMat = new THREE.MeshStandardMaterial({ color: 0x9ea5b6, metalness: 0.5, roughness: 0.5 });

  // Forward flaps (near the nose)
  const fCfg = {
    outX: 0.35,   // sticks out from hull
    chord: 0.50,  // fore–aft
    thinY: 0.035, // very thin vertically
    z: -1.20,
    y: 0.15,
    defl: 12
  };
  const fFlapL = makeHingedFlap({ side: 'L', y: fCfg.y, z: fCfg.z, outboardX: fCfg.outX, chordZ: fCfg.chord, thicknessY: fCfg.thinY, deflectDeg: fCfg.defl, mat: flapMat, bodyRadius: BODY_R });
  const fFlapR = makeHingedFlap({ side: 'R', y: fCfg.y, z: fCfg.z, outboardX: fCfg.outX, chordZ: fCfg.chord, thicknessY: fCfg.thinY, deflectDeg: fCfg.defl, mat: flapMat, bodyRadius: BODY_R });
  ship.add(fFlapL, fFlapR);

  // Aft flaps (near the tail)
  const aCfg = {
    outX: 0.30,
    chord: 0.98,
    thinY: 0.04,
    z: 1.00,
    y: -0.05,
    defl: 0
  };
  const aFlapL = makeHingedFlap({ side: 'L', y: aCfg.y, z: aCfg.z, outboardX: aCfg.outX, chordZ: aCfg.chord, thicknessY: aCfg.thinY, deflectDeg: aCfg.defl, mat: flapMat, bodyRadius: BODY_R });
  const aFlapR = makeHingedFlap({ side: 'R', y: aCfg.y, z: aCfg.z, outboardX: aCfg.outX, chordZ: aCfg.chord, thicknessY: aCfg.thinY, deflectDeg: aCfg.defl, mat: flapMat, bodyRadius: BODY_R });
  ship.add(aFlapL, aFlapR);

  // Plumes at +Z (aft), pointing +Z (unchanged)
  const plumeColors = [0xff8030, 0x40a0ff];
  const plumeGeo = new THREE.ConeGeometry(0.15, 0.5, 5, 1, true);
  plumeGeo.rotateX(-Math.PI / 2);
  plumeColors.forEach((color, i) => {
    const plume = new THREE.Mesh(
      plumeGeo,
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, transparent: true, opacity: 0.85, roughness: 0.4 })
    );
    plume.position.set((i - 0.5) * 0.28, -0.05, +1.8);
    ship.add(plume);
  });

  ship.scale.setScalar(scale);
  return ship;
}


// --- Hohmann-style transfer ellipse (Earth<->Mars), in the XZ plane ---

// Radii from your planet data (in world units)
const r1 = earth.userData.orbitR;   // ~ 1.0 AU * AU
const r2 = mars.userData.orbitR;    // ~ 1.52 AU * AU

// Ellipse params: periapsis=r1, apoapsis=r2, Sun at one focus (the origin)
const a = (r1 + r2) / 2;                            // semi-major axis
const e = (r2 - r1) / (r2 + r1);                    // eccentricity
const b = a * Math.sqrt(1 - e * e);                 // semi-minor axis
const p = a * (1 - e * e);                          // semi-latus rectum

// Angle along the ellipse (true anomaly). We'll speed up near periapsis using Kepler's 2nd law.
let theta = 0;              // 0 at periapsis on +X; pi at apoapsis on -X
const baseAngular = 0.18;   // base radians/sec; tune to taste

function hohmannPosition(t) {
  // r(θ) = p / (1 + e cos θ)
  const r = p / (1 + e * Math.cos(t));
  // Position in XZ plane (slight Y to float above grid)
  return new THREE.Vector3(r * Math.cos(t), 1.0, r * Math.sin(t));
}

const starship = makeSimpleStarship();
starship.up.set(0, 1, 0);
scene.add(starship);

function updateStarship(dt) {
  // Areal velocity: r^2 * dθ/dt = const  => dθ/dt ∝ 1/r^2
  const rNow = p / (1 + e * Math.cos(theta));
  const dtheta = baseAngular * dt * (a * a / (rNow * rNow));
  theta = (theta + dtheta) % (Math.PI * 2);

  const pos = hohmannPosition(theta);
  const posAhead = hohmannPosition(theta + 0.002); // small look-ahead

  // Move and orient: Three.js lookAt points -Z toward target.
  starship.position.copy(pos);
  const m = new THREE.Matrix4().lookAt(starship.position, posAhead, starship.up);
  starship.quaternion.setFromRotationMatrix(m);

  // Tiny style roll
  starship.rotateZ(Math.sin(performance.now() * 0.001) * 0.002);
}

// Planet spins
function updateOrbits(dt) {
  simTime += dt;

  for (const p of planets) {
      const { orbitR, omega, phase, selfSpin } = p.userData;
      const angle = omega * simTime + phase;
      p.position.set(
          Math.cos(angle) * orbitR,
          0,
          Math.sin(angle) * orbitR
      );
      p.rotation.y += selfSpin;      // slow spin
  }
}

// --- Animation loop ---
let last = performance.now();
let simTime = 0; // seconds in our "solar system time"
function tick(now = performance.now()) {
  const dt = Math.min((now - last) / 1000, 0.033); // clamp delta
  last = now;

  // Slow orbits to make the warp "breathe"
  updateOrbits(dt);

  // Mouse parallax
  updateParallax(dt);

  // Move Starship along its path through the orbiting planets
  updateStarship(dt);

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

// --- Helpers ---
function resize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
