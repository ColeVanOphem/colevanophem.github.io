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
camera.position.set(0, 18, 32);
camera.lookAt(0, 0, 0);

resize();

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

// --- Warped Grid (fake GR well): z-displacement = Σ strength / (distance^2 + softness) ---
/*
 We implement the warp on the CPU side by modifying the grid’s position attribute each frame.
 For a 160x160 grid this is still very fast and easy to read/tweak. If you want even smoother,
 we can switch to a custom vertex shader later.
*/
const GRID_SIZE = 100;      // world units across
const SUBDIV = 160;         // grid resolution (increase for smoother warp)
const gridGeom = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE, SUBDIV, SUBDIV);
gridGeom.rotateX(-Math.PI / 2); // lay flat (X-Z plane)
const gridMat = new THREE.MeshBasicMaterial({
  color: 0x8e99dd,
  wireframe: true,
  transparent: true,
  opacity: 0.25,
});
const grid = new THREE.Mesh(gridGeom, gridMat);
grid.position.y = -6;            // drop below content so warp dips downward
grid.rotation.y = Math.PI * 0.06; // angled a bit for perspective flair
scene.add(grid);

// Prepare original (unwarped) positions for fast updates
const basePos = gridGeom.attributes.position.array.slice();

// Simple warp function parameters
const wells = [
  // Optional: a *very* gentle Sun well so the mesh dips slightly at center
  { pos: () => new THREE.Vector2(0, 0), strength: 14.0 },

  // Planet wells (lighter than before so they don't crater the grid)
  { pos: () => new THREE.Vector2(mercury.position.x, mercury.position.z), strength: 9.0 },
  { pos: () => new THREE.Vector2(venus.position.x,   venus.position.z),   strength: 12.0 },
  { pos: () => new THREE.Vector2(earth.position.x,   earth.position.z),   strength: 14.0 },
  { pos: () => new THREE.Vector2(mars.position.x,    mars.position.z),    strength: 11.0 },
];

const softness = 18.0;  // gentler falloff
const maxDepth = 8.0;   // clamp displacement

function applyWarp(dt) {
  const arr = gridGeom.attributes.position.array;
  for (let i = 0; i < arr.length; i += 3) {
    const x = basePos[i + 0];
    const y = basePos[i + 1];
    const z = basePos[i + 2];

    // Only displace vertical (y) because plane is rotated to XZ; y is up
    // Compute displacement as the sum of wells based on X/Z distance
    const px = x;
    const pz = z;
    let disp = 0.0;
    for (const w of wells) {
      const dx = px - w.pos.x;
      const dz = pz - w.pos.y; // (y component of Vector2 holds Z)
      const r2 = dx * dx + dz * dz;
      disp -= w.strength / (r2 + softness); // negative to "dip" downward
    }
    // Clamp so it never gets too deep
    const yWarped = Math.max(y + disp, y - maxDepth);

    arr[i + 0] = x;
    arr[i + 1] = yWarped;
    arr[i + 2] = z;
  }
  gridGeom.attributes.position.needsUpdate = true;
  gridGeom.computeVertexNormals();
}

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

// --- Animation loop ---
let last = performance.now();
function tick(now = performance.now()) {
  const dt = Math.min((now - last) / 1000, 0.033); // clamp delta
  last = now;

  // Planet spins
  let simTime = 0; // seconds in our "solar system time"
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

  // Slow orbits to make the warp "breathe"
  updateOrbits(dt);

  // Update grid warp
  applyWarp(dt);

  // Mouse parallax
  updateParallax(dt);

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
