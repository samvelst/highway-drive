// Procedural vehicles. Every vehicle faces -Z and stands on y = 0.
import * as THREE from 'three/webgpu';
import { beam, box, facePatch, faceted, loft, merge, polygon, shape2D, sideGlass, topGlass } from './geometry.js';

const shared = {
  glass: new THREE.MeshStandardMaterial({ color: 0x0c1418, roughness: 0.08, metalness: 0.75, side: THREE.DoubleSide }),
  black: new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.65, metalness: 0.2 }),
  plastic: new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.8 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.16, metalness: 1 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.92 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xbfc4c9, roughness: 0.3, metalness: 0.95 }),
  darkRim: new THREE.MeshStandardMaterial({ color: 0x45484d, roughness: 0.35, metalness: 0.9 }),
  plate: new THREE.MeshStandardMaterial({ color: 0xe8e8e0, roughness: 0.6 }),
  head: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdfeaff, emissiveIntensity: 1.6, roughness: 0.2 }),
  tail: new THREE.MeshStandardMaterial({ color: 0x7a0508, emissive: 0xff1208, emissiveIntensity: 1.1, roughness: 0.3 }),
  charred: new THREE.MeshStandardMaterial({ color: 0x141211, roughness: 1, metalness: 0.1 }),
};

function paint(color, { metalness = 0.75, roughness = 0.32 } = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

// Collects geometry by material, then merges each set into a single mesh.
class Parts {
  constructor() {
    this.sets = new Map();
  }
  add(material, ...geos) {
    if (!this.sets.has(material)) this.sets.set(material, []);
    this.sets.get(material).push(...geos);
  }
  build(parent, name) {
    for (const [material, geos] of this.sets) {
      const mesh = new THREE.Mesh(merge(geos), material);
      mesh.castShadow = true;
      if (name) mesh.name = name;
      parent.add(mesh);
    }
  }
}

function wheelGeo(radius, width, spokes, side, rimMat, parts) {
  const tire = new THREE.CylinderGeometry(radius, radius, width, 28);
  tire.rotateZ(Math.PI / 2);
  parts.add(shared.tire, tire);
  const rimR = radius * 0.68;
  const out = side * (width / 2 + 0.002);
  const barrel = new THREE.CylinderGeometry(rimR, rimR * 0.9, 0.02, 24);
  barrel.rotateZ(Math.PI / 2);
  barrel.translate(out, 0, 0);
  parts.add(shared.black, barrel);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    parts.add(
      rimMat,
      beam([out + side * 0.012, 0, 0], [out + side * 0.012, Math.sin(a) * rimR, Math.cos(a) * rimR], 0.012, rimR * 0.3)
    );
  }
  const hub = new THREE.CylinderGeometry(radius * 0.17, radius * 0.17, 0.02, 12);
  hub.rotateZ(Math.PI / 2);
  hub.translate(out + side * 0.02, 0, 0);
  parts.add(rimMat, hub);
  const lip = new THREE.TorusGeometry(rimR, 0.012, 6, 28);
  lip.rotateY(Math.PI / 2);
  lip.translate(out, 0, 0);
  parts.add(rimMat, lip);
}

/** Builds one spinning wheel. Returned group spins around its X axis. */
function makeWheel(radius, width, spokes, side, rimMat) {
  const group = new THREE.Group();
  const parts = new Parts();
  wheelGeo(radius, width, spokes, side, rimMat, parts);
  parts.build(group);
  return group;
}

/** Dark wheel-arch liner: a disc just outside the body behind the tire. */
function archGeo(radius, x, z, y, width = 0.05) {
  const g = new THREE.CylinderGeometry(radius, radius, width, 28);
  g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

/** Adds a matching left and right piece from a geometry factory. */
function mirrorX(fn) {
  return [fn(1), fn(-1)];
}

function finishVehicle(group, parts, opts) {
  const { paintMat, brakeMat, wheels = [], breakables = [] } = opts;
  group.userData.paintMat = paintMat;
  group.userData.brakeMat = brakeMat;
  group.userData.wheels = wheels;
  group.userData.breakables = breakables;
  parts.build(group);
  return group;
}

function addWheels(group, { radius, width, frontZ, rearZ, track, spokes, rimMat }) {
  const wheels = [];
  for (const z of [frontZ, rearZ]) {
    for (const side of [1, -1]) {
      const w = makeWheel(radius, width, spokes, side, rimMat);
      w.position.set(side * track, radius, z);
      group.add(w);
      wheels.push(w);
    }
  }
  return wheels;
}

function panel(group, material, geo, name) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.name = name;
  group.add(mesh);
  return mesh;
}

/* ------------------------------------------------------------------ */
/* Player: blue midsize sedan with a sloping roof and a wide low mouth */
/* ------------------------------------------------------------------ */
export function buildSedan() {
  const group = new THREE.Group();
  const parts = new Parts();
  const body = paint(0x123f9c, { metalness: 0.8, roughness: 0.26 });
  const brake = shared.tail.clone();
  const WR = 0.335;

  const shell = [
      { z: -2.44, bot: 0.34, top: 0.62, w: 0.6 },
      { z: -2.41, bot: 0.25, top: 0.68, w: 0.78 },
      { z: -2.28, bot: 0.2, top: 0.75, w: 0.86, topW: 0.8 },
      { z: -1.95, bot: 0.18, top: 0.83, w: 0.9, topW: 0.82 },
      { z: -1.45, bot: 0.17, top: 0.89, w: 0.915, topW: 0.83 },
      { z: -0.95, bot: 0.17, top: 0.95, w: 0.92, topW: 0.83 },
      { z: 0.4, bot: 0.17, top: 0.98, w: 0.92, topW: 0.82 },
      { z: 1.4, bot: 0.18, top: 1.02, w: 0.92, topW: 0.81 },
      { z: 1.95, bot: 0.21, top: 1.04, w: 0.905, topW: 0.79 },
      { z: 2.3, bot: 0.27, top: 1.02, w: 0.86, topW: 0.73 },
      { z: 2.41, bot: 0.34, top: 0.98, w: 0.79, topW: 0.66 },
      { z: 2.44, bot: 0.42, top: 0.9, w: 0.6 },
    ];
  parts.add(body, loft(shell));

  // Painted cabin shell with a long, sloping roofline. Glass lies on its surface.
  const cabin = [
    { z: -1.14, bot: 0.86, top: 0.93, w: 0.78, topW: 0.72 },
    { z: -0.75, bot: 0.86, top: 1.14, w: 0.79, topW: 0.66 },
    { z: -0.32, bot: 0.86, top: 1.37, w: 0.8, topW: 0.61 },
    { z: 0.15, bot: 0.86, top: 1.44, w: 0.8, topW: 0.6 },
    { z: 0.65, bot: 0.86, top: 1.42, w: 0.8, topW: 0.6 },
    { z: 1.15, bot: 0.86, top: 1.27, w: 0.79, topW: 0.61 },
    { z: 1.6, bot: 0.86, top: 1.09, w: 0.77, topW: 0.63 },
    { z: 1.94, bot: 0.86, top: 1.03, w: 0.73, topW: 0.63 },
  ];
  parts.add(body, loft(cabin, { exp: 5, segments: 36 }));
  parts.add(
    shared.glass,
    topGlass(cabin, { z0: -1.07, z1: -0.4, halfX0: 0.64, halfX1: 0.5 }),
    topGlass(cabin, { z0: 1.1, z1: 1.86, halfX0: 0.49, halfX1: 0.56 })
  );
  for (const s of [1, -1]) {
    parts.add(
      shared.glass,
      sideGlass(cabin, s, { z0: -0.66, z1: 0.24, yBot: 1.0, rake0: 0.22 }),
      sideGlass(cabin, s, { z0: 0.34, z1: 1.42, yBot: 1.0, rake1: -0.16 })
    );
  }

  // Subtle trunk lip.
  parts.add(body, box(1.08, 0.022, 0.09, 0, 1.052, 2.27, -0.12));

  const front = (corners, opts) => facePatch(shell, corners, { end: 'front', ...opts });
  const rear = (corners, opts) => facePatch(shell, corners, { end: 'rear', ...opts });
  const pair = (fn) => [fn(1), fn(-1)];

  // Thin swept headlights with a dark lower edge.
  parts.add(shared.black, ...pair((s) => front([[s * 0.34, 0.715], [s * 0.86, 0.8], [s * 0.86, 0.64], [s * 0.36, 0.625]], { lift: 0.005 })));
  parts.add(shared.head, ...pair((s) => front([[s * 0.42, 0.7], [s * 0.85, 0.785], [s * 0.85, 0.72], [s * 0.44, 0.66]], { lift: 0.01 })));
  // Slim upper grille and the wide lower mouth with horizontal slats.
  parts.add(shared.black, front([[-0.33, 0.655], [0.33, 0.655], [0.3, 0.6], [-0.3, 0.6]]));
  parts.add(shared.black, front([[-0.68, 0.53], [0.68, 0.53], [0.52, 0.29], [-0.52, 0.29]], { rows: 6 }));
  for (let i = 0; i < 4; i++) {
    const y = 0.34 + i * 0.05;
    const w = 0.54 + i * 0.04;
    parts.add(shared.plastic, front([[-w, y + 0.012], [w, y + 0.012], [w, y - 0.012], [-w, y - 0.012]], { lift: 0.012, rows: 1 }));
  }
  // Angled corner intakes.
  parts.add(shared.black, ...pair((s) => front([[s * 0.7, 0.54], [s * 0.86, 0.62], [s * 0.86, 0.42], [s * 0.6, 0.31]], { lift: 0.005 })));
  // Lower splitter, set back under the nose.
  parts.add(shared.plastic, box(1.2, 0.035, 0.2, 0, 0.215, -2.2));

  // Tail: a wide lamp band that wraps around the corners.
  parts.add(brake, ...pair((s) => rear([[s * 0.22, 0.95], [s * 0.88, 0.96], [s * 0.88, 0.85], [s * 0.22, 0.89]], { lift: 0.01 })));
  parts.add(shared.black, rear([[-0.22, 0.93], [0.22, 0.93], [0.22, 0.895], [-0.22, 0.895]]));
  parts.add(shared.plate, rear([[-0.21, 0.735], [0.21, 0.735], [0.21, 0.605], [-0.21, 0.605]], { lift: 0.008 }));
  parts.add(shared.plastic, rear([[-0.68, 0.51], [0.68, 0.51], [0.62, 0.4], [-0.62, 0.4]]));
  parts.add(shared.chrome, ...pair((s) => rear([[s * 0.4, 0.475], [s * 0.6, 0.475], [s * 0.6, 0.425], [s * 0.4, 0.425]], { lift: 0.012 })));

  // Door shuts, handles, sills and mirrors.
  for (const s of [1, -1]) {
    const x = s * 0.925;
    parts.add(shared.black, box(0.012, 0.56, 0.012, x, 0.59, -0.72));
    parts.add(shared.black, box(0.012, 0.6, 0.012, x, 0.58, 0.32));
    parts.add(shared.black, box(0.012, 0.5, 0.012, x, 0.6, 1.25));
    parts.add(shared.chrome, box(0.018, 0.024, 0.17, x, 0.84, -0.04));
    parts.add(shared.chrome, box(0.018, 0.024, 0.17, x, 0.85, 0.96));
    parts.add(shared.plastic, box(0.05, 0.08, 2.7, s * 0.915, 0.21, 0.1));
    parts.add(body, box(0.15, 0.075, 0.1, s * 0.94, 0.99, -0.66, 0, s * 0.14));
        parts.add(shared.black, archGeo(WR + 0.07, s * 0.905, -1.45, WR));
    parts.add(shared.black, archGeo(WR + 0.07, s * 0.905, 1.42, WR));
  }

  const hood = panel(
    group,
    body,
    loft(
      [
        { z: -2.27, bot: 0.71, top: 0.765, w: 0.72, topW: 0.66 },
        { z: -1.95, bot: 0.79, top: 0.845, w: 0.81, topW: 0.73 },
        { z: -1.45, bot: 0.85, top: 0.905, w: 0.83, topW: 0.74 },
        { z: -1.05, bot: 0.89, top: 0.945, w: 0.83, topW: 0.73 },
      ],
      { exp: 5 }
    ),
    'hood'
  );
  const bumper = panel(group, shared.plastic, box(1.0, 0.03, 0.14, 0, 0.25, -2.36), 'bumper');
  const trunk = panel(
    group,
    body,
    loft(
      [
        { z: 1.92, bot: 1.0, top: 1.052, w: 0.74, topW: 0.68 },
        { z: 2.28, bot: 0.99, top: 1.04, w: 0.72, topW: 0.64 },
      ],
      { exp: 5 }
    ),
    'trunk'
  );

  const wheels = addWheels(group, {
    radius: WR,
    width: 0.235,
    frontZ: -1.45,
    rearZ: 1.42,
    track: 0.835,
    spokes: 5,
    rimMat: shared.rim,
  });

  return finishVehicle(group, parts, {
    paintMat: body,
    brakeMat: brake,
    wheels,
    breakables: [hood, bumper, trunk],
  });
}

/* ------------------------------------------------------------------ */
/* Player: gray full-size luxury SUV with an upright nose and long roof */
/* ------------------------------------------------------------------ */
export function buildSUV() {
  const group = new THREE.Group();
  const parts = new Parts();
  const body = paint(0x6b7076, { metalness: 0.75, roughness: 0.34 });
  const brake = shared.tail.clone();
  const WR = 0.415;

  const shell = [
      { z: -2.58, bot: 0.5, top: 0.95, w: 0.72 },
      { z: -2.56, bot: 0.36, top: 1.06, w: 0.86, topW: 0.8 },
      { z: -2.42, bot: 0.3, top: 1.14, w: 0.95, topW: 0.86 },
      { z: -2.1, bot: 0.28, top: 1.2, w: 0.99, topW: 0.89 },
      { z: -1.45, bot: 0.27, top: 1.26, w: 1.0, topW: 0.9 },
      { z: -1.0, bot: 0.27, top: 1.3, w: 1.0, topW: 0.91 },
      { z: 1.0, bot: 0.27, top: 1.33, w: 1.0, topW: 0.91 },
      { z: 2.2, bot: 0.3, top: 1.36, w: 0.99, topW: 0.9 },
      { z: 2.5, bot: 0.38, top: 1.36, w: 0.96, topW: 0.87 },
      { z: 2.58, bot: 0.5, top: 1.32, w: 0.84, topW: 0.78 },
    ];
  parts.add(body, loft(shell));
  const front = (corners, opts) => facePatch(shell, corners, { end: 'front', ...opts });
  const rear = (corners, opts) => facePatch(shell, corners, { end: 'rear', ...opts });

  // Tall painted cabin with a long roof and nearly vertical tailgate.
  const cabin = [
    { z: -1.34, bot: 1.2, top: 1.3, w: 0.87, topW: 0.83 },
    { z: -0.95, bot: 1.2, top: 1.56, w: 0.88, topW: 0.76 },
    { z: -0.62, bot: 1.2, top: 1.77, w: 0.88, topW: 0.73 },
    { z: 0, bot: 1.2, top: 1.82, w: 0.88, topW: 0.73 },
    { z: 1.4, bot: 1.2, top: 1.82, w: 0.88, topW: 0.73 },
    { z: 2.05, bot: 1.2, top: 1.79, w: 0.87, topW: 0.72 },
    { z: 2.36, bot: 1.2, top: 1.7, w: 0.83, topW: 0.7 },
    { z: 2.5, bot: 1.2, top: 1.36, w: 0.8, topW: 0.74 },
  ];
  parts.add(body, loft(cabin, { exp: 7, segments: 40 }));
  parts.add(
    shared.glass,
    topGlass(cabin, { z0: -1.27, z1: -0.68, halfX0: 0.72, halfX1: 0.62, n: 7 }),
    facePatch(cabin, [[-0.6, 1.66], [0.6, 1.66], [0.68, 1.41], [-0.68, 1.41]], { end: 'rear', n: 7, lift: 0.01 })
  );
  for (const s of [1, -1]) {
    parts.add(
      shared.glass,
      sideGlass(cabin, s, { z0: -0.92, z1: 0.14, yBot: 1.32, topGap: 0.09, rake0: 0.2, n: 7 }),
      sideGlass(cabin, s, { z0: 0.26, z1: 1.26, yBot: 1.32, topGap: 0.09, n: 7 }),
      sideGlass(cabin, s, { z0: 1.38, z1: 2.14, yBot: 1.32, topGap: 0.09, rake1: -0.12, n: 7 })
    );
    // Roof rail and chrome window surround.
    parts.add(shared.chrome, box(0.035, 0.03, 2.3, s * 0.63, 1.822, 0.85));
    parts.add(shared.chrome, box(0.02, 0.025, 3.25, s * 0.895, 1.3, 0.62));
  }

  // Large twin upright grilles with vertical slats and a bright surround.
  const FRONT_Z = -2.565;
  for (const s of [1, -1]) {
    const cx = s * 0.26;
    const hw = 0.215;
    const yb = 0.66;
    const yt = 1.09;
    parts.add(
      shared.chrome,
      shape2D(
        [
          [-hw - 0.028, yb - 0.018],
          [hw + 0.028, yb - 0.018],
          [hw + 0.04, yt - 0.02],
          [hw - 0.03, yt + 0.028],
          [-hw + 0.03, yt + 0.028],
          [-hw - 0.04, yt - 0.02],
        ],
        cx,
        0,
        FRONT_Z - 0.012
      )
    );
    parts.add(
      shared.black,
      shape2D(
        [
          [-hw, yb],
          [hw, yb],
          [hw + 0.012, yt - 0.03],
          [hw - 0.03, yt],
          [-hw + 0.03, yt],
          [-hw - 0.012, yt - 0.03],
        ],
        cx,
        0,
        FRONT_Z - 0.016
      )
    );
    for (let i = 0; i < 7; i++) {
      parts.add(shared.chrome, box(0.018, yt - yb - 0.05, 0.012, cx + (i - 3) * 0.06, (yb + yt) / 2, FRONT_Z - 0.022));
    }
    // Slim light unit above a darker lower lamp.
    parts.add(shared.head, front([[s * 0.52, 1.04], [s * 0.97, 1.09], [s * 0.97, 1.01], [s * 0.52, 0.985]], { lift: 0.01 }));
    parts.add(shared.black, front([[s * 0.52, 0.985], [s * 0.97, 1.01], [s * 0.97, 0.95], [s * 0.52, 0.945]]));
    parts.add(shared.black, front([[s * 0.6, 0.67], [s * 0.93, 0.74], [s * 0.93, 0.54], [s * 0.62, 0.5]]));
    parts.add(shared.chrome, front([[s * 0.62, 0.49], [s * 0.93, 0.53], [s * 0.93, 0.5], [s * 0.62, 0.46]], { lift: 0.01 }));
  }
  // Lower intake and bright skid plate.
  parts.add(shared.black, front([[-0.52, 0.61], [0.52, 0.61], [0.52, 0.4], [-0.52, 0.4]]));
  parts.add(shared.chrome, front([[-0.54, 0.63], [0.54, 0.63], [0.54, 0.605], [-0.54, 0.605]], { lift: 0.01 }));
  parts.add(shared.chrome, front([[-0.6, 0.385], [0.6, 0.385], [0.6, 0.34], [-0.6, 0.34]], { lift: 0.01 }));
  parts.add(shared.plate, front([[-0.21, 0.57], [0.21, 0.57], [0.21, 0.45], [-0.21, 0.45]], { lift: 0.012 }));

  // Tail: slim L-shaped lamps joined by a chrome bar, with a square lower bumper.
  for (const s of [1, -1]) {
    parts.add(brake, rear([[s * 0.46, 1.29], [s * 0.98, 1.28], [s * 0.98, 1.19], [s * 0.46, 1.21]], { lift: 0.01 }));
    parts.add(brake, rear([[s * 0.84, 1.19], [s * 0.98, 1.19], [s * 0.98, 1.07], [s * 0.87, 1.07]], { lift: 0.01 }));
    parts.add(shared.chrome, rear([[s * 0.42, 0.5], [s * 0.66, 0.5], [s * 0.66, 0.44], [s * 0.42, 0.44]], { lift: 0.014 }));
  }
  parts.add(shared.chrome, rear([[-0.46, 1.26], [0.46, 1.26], [0.46, 1.215], [-0.46, 1.215]], { lift: 0.008 }));
  parts.add(shared.plate, rear([[-0.21, 0.94], [0.21, 0.94], [0.21, 0.81], [-0.21, 0.81]], { lift: 0.008 }));
  parts.add(shared.black, rear([[-0.76, 0.735], [0.76, 0.735], [0.76, 0.72], [-0.76, 0.72]]));
  parts.add(shared.plastic, rear([[-0.78, 0.62], [0.78, 0.62], [0.74, 0.42], [-0.74, 0.42]]));

  // Door shuts, handles, running boards, mirrors, and wheel arches.
  for (const s of [1, -1]) {
    const x = s * 1.003;
    parts.add(shared.black, box(0.012, 0.86, 0.012, x, 0.76, -0.86));
    parts.add(shared.black, box(0.012, 0.92, 0.012, x, 0.75, 0.32));
    parts.add(shared.black, box(0.012, 0.8, 0.012, x, 0.78, 1.5));
    parts.add(shared.chrome, box(0.02, 0.028, 0.2, x, 1.13, -0.12));
    parts.add(shared.chrome, box(0.02, 0.028, 0.2, x, 1.14, 1.06));
    parts.add(shared.chrome, box(0.025, 0.06, 3.1, s * 1.005, 0.42, 0.04));
    parts.add(shared.plastic, box(0.16, 0.06, 2.3, s * 0.99, 0.26, 0.04));
    parts.add(body, box(0.17, 0.1, 0.12, s * 1.0, 1.36, -0.98, 0, s * 0.12));
    parts.add(shared.black, archGeo(WR + 0.085, s * 0.975, -1.62, WR, 0.06));
    parts.add(shared.black, archGeo(WR + 0.085, s * 0.975, 1.66, WR, 0.06));
  }

  const hood = panel(
    group,
    body,
    loft(
      [
        { z: -2.44, bot: 1.1, top: 1.155, w: 0.84, topW: 0.76 },
        { z: -2.1, bot: 1.16, top: 1.215, w: 0.87, topW: 0.79 },
        { z: -1.6, bot: 1.21, top: 1.265, w: 0.88, topW: 0.8 },
        { z: -1.22, bot: 1.25, top: 1.305, w: 0.88, topW: 0.8 },
      ],
      { exp: 5 }
    ),
    'hood'
  );
  const bumper = panel(group, shared.chrome, box(1.0, 0.03, 0.05, 0, 0.3, -2.42), 'bumper');
  const gate = panel(group, shared.chrome, box(0.7, 0.025, 0.03, 0, 1.31, 2.585), 'trim');

  const wheels = addWheels(group, {
    radius: WR,
    width: 0.275,
    frontZ: -1.62,
    rearZ: 1.66,
    track: 0.895,
    spokes: 6,
    rimMat: shared.rim,
  });

  return finishVehicle(group, parts, {
    paintMat: body,
    brakeMat: brake,
    wheels,
    breakables: [hood, bumper, gate],
  });
}

/* ------------------------------------------------------------------ */
/* Player: white electric sedan with a smooth nose and a dark glass roof */
/* ------------------------------------------------------------------ */
export function buildEV() {
  const group = new THREE.Group();
  const parts = new Parts();
  const body = paint(0xe9ebec, { metalness: 0.35, roughness: 0.24 });
  const brake = shared.tail.clone();
  const WR = 0.335;

  const shell = [
    { z: -2.35, bot: 0.38, top: 0.6, w: 0.52 },
    { z: -2.32, bot: 0.26, top: 0.67, w: 0.76 },
    { z: -2.18, bot: 0.19, top: 0.74, w: 0.87, topW: 0.8 },
    { z: -1.85, bot: 0.17, top: 0.82, w: 0.91, topW: 0.83 },
    { z: -1.35, bot: 0.16, top: 0.9, w: 0.925, topW: 0.84 },
    { z: -0.95, bot: 0.16, top: 0.95, w: 0.93, topW: 0.84 },
    { z: 0.4, bot: 0.16, top: 1.0, w: 0.93, topW: 0.83 },
    { z: 1.4, bot: 0.17, top: 1.03, w: 0.93, topW: 0.82 },
    { z: 1.9, bot: 0.2, top: 1.05, w: 0.91, topW: 0.8 },
    { z: 2.22, bot: 0.27, top: 1.04, w: 0.86, topW: 0.74 },
    { z: 2.32, bot: 0.35, top: 1.0, w: 0.78, topW: 0.66 },
    { z: 2.35, bot: 0.44, top: 0.92, w: 0.58 },
  ];
  parts.add(body, loft(shell));

  // One continuous arc from the nose over the roof to the tail.
  const cabin = [
    { z: -1.16, bot: 0.86, top: 0.93, w: 0.79, topW: 0.73 },
    { z: -0.7, bot: 0.86, top: 1.18, w: 0.8, topW: 0.66 },
    { z: -0.25, bot: 0.86, top: 1.38, w: 0.8, topW: 0.61 },
    { z: 0.2, bot: 0.86, top: 1.44, w: 0.8, topW: 0.6 },
    { z: 0.7, bot: 0.86, top: 1.42, w: 0.8, topW: 0.6 },
    { z: 1.2, bot: 0.86, top: 1.28, w: 0.79, topW: 0.62 },
    { z: 1.65, bot: 0.86, top: 1.12, w: 0.77, topW: 0.63 },
    { z: 2.0, bot: 0.86, top: 1.05, w: 0.72, topW: 0.62 },
  ];
  parts.add(body, loft(cabin, { exp: 5, segments: 36 }));
  // Windshield, roof and rear window read as one dark sheet of glass.
  parts.add(
    shared.glass,
    topGlass(cabin, { z0: -1.09, z1: -0.1, halfX0: 0.66, halfX1: 0.5 }),
    topGlass(cabin, { z0: -0.1, z1: 0.9, halfX0: 0.5, halfX1: 0.5 }),
    topGlass(cabin, { z0: 0.9, z1: 1.92, halfX0: 0.5, halfX1: 0.56 })
  );
  for (const s of [1, -1]) {
    parts.add(
      shared.glass,
      sideGlass(cabin, s, { z0: -0.62, z1: 0.22, yBot: 1.02, rake0: 0.24 }),
      sideGlass(cabin, s, { z0: 0.32, z1: 1.46, yBot: 1.02, rake1: -0.16 })
    );
  }
  const front = (corners, opts) => facePatch(shell, corners, { end: 'front', ...opts });
  const rear = (corners, opts) => facePatch(shell, corners, { end: 'rear', ...opts });
  const pair = (fn) => [fn(1), fn(-1)];

  // A smooth nose with no grille, narrow lamps and one small lower intake.
  parts.add(shared.black, ...pair((s) => front([[s * 0.4, 0.68], [s * 0.86, 0.77], [s * 0.86, 0.66], [s * 0.42, 0.62]], { lift: 0.004 })));
  parts.add(shared.head, ...pair((s) => front([[s * 0.5, 0.67], [s * 0.84, 0.75], [s * 0.84, 0.7], [s * 0.52, 0.64]], { lift: 0.01 })));
  parts.add(shared.black, front([[-0.42, 0.34], [0.42, 0.34], [0.36, 0.26], [-0.36, 0.26]]));
  parts.add(shared.plastic, box(1.1, 0.03, 0.2, 0, 0.2, -2.1));

  // Tail: compact lamps wrapping each corner, with a short lip on the trunk.
  parts.add(brake, ...pair((s) => rear([[s * 0.42, 0.97], [s * 0.88, 0.99], [s * 0.88, 0.87], [s * 0.42, 0.9]], { lift: 0.01 })));
  parts.add(body, box(1.0, 0.02, 0.08, 0, 1.06, 2.2, -0.1));
  parts.add(shared.plate, rear([[-0.21, 0.75], [0.21, 0.75], [0.21, 0.62], [-0.21, 0.62]], { lift: 0.008 }));
  parts.add(shared.black, rear([[-0.68, 0.5], [0.68, 0.5], [0.6, 0.4], [-0.6, 0.4]]));

  for (const s of [1, -1]) {
    const x = s * 0.935;
    parts.add(shared.black, box(0.012, 0.56, 0.012, x, 0.59, -0.74));
    parts.add(shared.black, box(0.012, 0.6, 0.012, x, 0.58, 0.28));
    parts.add(shared.black, box(0.012, 0.5, 0.012, x, 0.61, 1.28));
    parts.add(shared.plastic, box(0.05, 0.07, 2.7, s * 0.925, 0.19, 0.08));
    parts.add(body, box(0.14, 0.07, 0.09, s * 0.95, 1.0, -0.68, 0, s * 0.14));
    parts.add(shared.black, archGeo(WR + 0.06, s * 0.915, -1.42, WR));
    parts.add(shared.black, archGeo(WR + 0.06, s * 0.915, 1.42, WR));
  }

  const hood = panel(
    group,
    body,
    loft(
      [
        { z: -2.14, bot: 0.71, top: 0.76, w: 0.7, topW: 0.64 },
        { z: -1.85, bot: 0.78, top: 0.835, w: 0.81, topW: 0.73 },
        { z: -1.35, bot: 0.86, top: 0.915, w: 0.83, topW: 0.74 },
        { z: -1.08, bot: 0.89, top: 0.945, w: 0.83, topW: 0.73 },
      ],
      { exp: 5 }
    ),
    'hood'
  );
  const bumper = panel(group, shared.plastic, box(0.9, 0.03, 0.12, 0, 0.24, -2.28), 'bumper');

  const wheels = addWheels(group, {
    radius: WR,
    width: 0.235,
    frontZ: -1.42,
    rearZ: 1.42,
    track: 0.845,
    spokes: 7,
    rimMat: shared.darkRim,
  });

  return finishVehicle(group, parts, {
    paintMat: body,
    brakeMat: brake,
    wheels,
    breakables: [hood, bumper],
  });
}

/* ------------------------------------------------------------------ */
/* Player: stainless wedge truck made entirely from flat panels        */
/* ------------------------------------------------------------------ */
export function buildSteelTruck() {
  const group = new THREE.Group();
  const parts = new Parts();
  const steel = paint(0xc3c8cc, { metalness: 0.92, roughness: 0.42 });
  steel.side = THREE.DoubleSide;
  const trim = new THREE.MeshStandardMaterial({ color: 0x151618, roughness: 0.75, side: THREE.DoubleSide });
  const brake = shared.tail.clone();
  const WR = 0.44;

  const stations = [
    { z: -2.84, bot: 0.58, belt: 0.8, top: 0.97, wl: 0.84, w: 0.98, wt: 0.82 },
    { z: -2.75, bot: 0.44, belt: 0.85, top: 1.02, wl: 0.92, w: 1.0, wt: 0.84 },
    { z: -0.25, bot: 0.4, belt: 1.13, top: 1.84, wl: 0.98, w: 1.0, wt: 0.66 },
    { z: 2.76, bot: 0.44, belt: 1.13, top: 1.21, wl: 0.96, w: 1.0, wt: 0.9 },
    { z: 2.84, bot: 0.62, belt: 1.09, top: 1.17, wl: 0.86, w: 0.96, wt: 0.85 },
  ];
  const ring = (st) => [
    [-st.wl, st.bot, st.z],
    [st.wl, st.bot, st.z],
    [st.w, st.belt, st.z],
    [st.wt, st.top, st.z],
    [-st.wt, st.top, st.z],
    [-st.w, st.belt, st.z],
  ];
  parts.add(steel, faceted(stations.map(ring)));

  const sectionAt = (z) => {
    let i = 0;
    while (i < stations.length - 2 && z > stations[i + 1].z) i++;
    const a = stations[i];
    const b = stations[i + 1];
    const t = (z - a.z) / (b.z - a.z);
    const mix = (key) => a[key] + (b[key] - a[key]) * t;
    return { top: mix('top'), belt: mix('belt'), bot: mix('bot'), w: mix('w'), wt: mix('wt'), wl: mix('wl') };
  };
  const onTop = (z, x) => [x, sectionAt(z).top + 0.012, z];
  const onSide = (s, z, v) => {
    const st = sectionAt(z);
    return [s * (st.w + (st.wt - st.w) * v + 0.012), st.belt + (st.top - st.belt) * v, z];
  };
  const onLower = (s, z, v) => {
    const st = sectionAt(z);
    return [s * (st.wl + (st.w - st.wl) * v + 0.014), st.bot + (st.belt - st.bot) * v, z];
  };

  // Enormous raked windshield and angular side glass.
  parts.add(shared.glass, polygon([onTop(-1.68, -0.68), onTop(-1.68, 0.68), onTop(-0.42, 0.55), onTop(-0.42, -0.55)]));
  parts.add(shared.glass, polygon([onTop(0.05, -0.55), onTop(0.05, 0.55), onTop(0.75, 0.6), onTop(0.75, -0.6)]));
  for (const s of [1, -1]) {
    parts.add(shared.glass, polygon([onSide(s, -1.32, 0.1), onSide(s, 0.28, 0.1), onSide(s, 0.28, 0.86), onSide(s, -0.32, 0.88)]));
    parts.add(shared.glass, polygon([onSide(s, 0.4, 0.1), onSide(s, 1.28, 0.1), onSide(s, 1.28, 0.52), onSide(s, 0.4, 0.86)]));

    // Hard-edged, unpainted wheel arches.
    for (const c of [-1.84, 1.94]) {
      parts.add(trim, polygon([
        onLower(s, c - 0.82, 0),
        onLower(s, c - 0.72, 0.5),
        onLower(s, c - 0.42, 0.98),
        onLower(s, c + 0.42, 0.98),
        onLower(s, c + 0.72, 0.5),
        onLower(s, c + 0.82, 0),
      ]));
    }
    // Rocker trim and door seams.
    parts.add(trim, polygon([onLower(s, -1.02, 0), onLower(s, 1.12, 0), onLower(s, 1.12, 0.18), onLower(s, -1.02, 0.18)]));
    parts.add(shared.black, beam(onLower(s, -1.0, 0.2), onSide(s, -1.0, 0.1), 0.014));
    parts.add(shared.black, beam(onLower(s, 0.33, 0.2), onSide(s, 0.33, 0.9), 0.014));
    parts.add(shared.black, beam(onLower(s, 1.32, 0.2), onSide(s, 1.32, 0.5), 0.014));
    parts.add(shared.black, beam(onSide(s, -2.65, 0.02), onSide(s, -1.32, 0.05), 0.012));
  }

  // Full-width light bars at the nose and tail.
  parts.add(shared.head, box(1.72, 0.035, 0.03, 0, 0.92, -2.83));
  parts.add(brake, box(1.74, 0.05, 0.03, 0, 1.12, 2.82));
  parts.add(trim, polygon([[-0.8, 0.66, -2.815], [0.8, 0.66, -2.815], [0.72, 0.5, -2.8], [-0.72, 0.5, -2.8]]));
  parts.add(shared.plate, box(0.42, 0.13, 0.015, 0, 0.84, 2.82));
  parts.add(trim, polygon([[-0.82, 0.68, 2.83], [0.82, 0.68, 2.83], [0.74, 0.54, 2.815], [-0.74, 0.54, 2.815]]));
  parts.add(shared.black, box(1.75, 0.012, 0.01, 0, 1.0, 2.83));

  const hood = panel(
    group,
    steel,
    polygon([onTop(-2.68, -0.78), onTop(-2.68, 0.78), onTop(-1.78, 0.71), onTop(-1.78, -0.71)]),
    'hood'
  );
  const cover = panel(
    group,
    steel,
    polygon([onTop(1.1, -0.74), onTop(1.1, 0.74), onTop(2.66, 0.84), onTop(2.66, -0.84)]),
    'bedCover'
  );
  const bumper = panel(group, trim, box(1.2, 0.05, 0.08, 0, 0.47, -2.76), 'bumper');

  const wheels = addWheels(group, {
    radius: WR,
    width: 0.3,
    frontZ: -1.84,
    rearZ: 1.94,
    track: 0.88,
    spokes: 6,
    rimMat: shared.darkRim,
  });

  return finishVehicle(group, parts, {
    paintMat: steel,
    brakeMat: brake,
    wheels,
    breakables: [hood, cover, bumper],
  });
}

/** Lookups for placing flat panels on a faceted body. */
function facetTools(stations) {
  const sectionAt = (z) => {
    let i = 0;
    while (i < stations.length - 2 && z > stations[i + 1].z) i++;
    const a = stations[i];
    const b = stations[i + 1];
    const t = (z - a.z) / (b.z - a.z);
    const mix = (key) => a[key] + (b[key] - a[key]) * t;
    return { top: mix('top'), belt: mix('belt'), bot: mix('bot'), w: mix('w'), wt: mix('wt'), wl: mix('wl') };
  };
  return {
    top: (z, x) => [x, sectionAt(z).top + 0.012, z],
    side: (s, z, y) => {
      const st = sectionAt(z);
      const x = y < st.belt
        ? st.wl + (st.w - st.wl) * ((y - st.bot) / (st.belt - st.bot))
        : st.w + (st.wt - st.w) * ((y - st.belt) / (st.top - st.belt));
      return [s * (x + 0.012), y, z];
    },
  };
}

const facetRing = (st) => [
  [-st.wl, st.bot, st.z],
  [st.wl, st.bot, st.z],
  [st.w, st.belt, st.z],
  [st.wt, st.top, st.z],
  [-st.wt, st.top, st.z],
  [-st.w, st.belt, st.z],
];

/* ------------------------------------------------------------------ */
/* Player: low yellow wedge supercar, all sharp creases and hexagons    */
/* ------------------------------------------------------------------ */
export function buildWedge() {
  const group = new THREE.Group();
  const parts = new Parts();
  const body = paint(0xffc400, { metalness: 0.15, roughness: 0.28 });
  body.side = THREE.DoubleSide;
  const dark = new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.6, side: THREE.DoubleSide });
  const brake = shared.tail.clone();
  brake.side = THREE.DoubleSide;
  const headFlat = shared.head.clone();
  headFlat.side = THREE.DoubleSide;
  const WR = 0.345;

  const stations = [
    { z: -2.39, bot: 0.22, belt: 0.34, top: 0.47, wl: 0.6, w: 0.8, wt: 0.56 },
    { z: -2.2, bot: 0.14, belt: 0.48, top: 0.55, wl: 0.8, w: 0.93, wt: 0.72 },
    { z: -1.2, bot: 0.13, belt: 0.66, top: 0.73, wl: 0.88, w: 0.98, wt: 0.78 },
    { z: -0.75, bot: 0.13, belt: 0.67, top: 0.78, wl: 0.9, w: 0.98, wt: 0.72 },
    { z: 0.0, bot: 0.13, belt: 0.7, top: 1.14, wl: 0.92, w: 1.0, wt: 0.5 },
    { z: 0.7, bot: 0.13, belt: 0.76, top: 1.12, wl: 0.94, w: 1.0, wt: 0.5 },
    { z: 1.6, bot: 0.14, belt: 0.82, top: 0.95, wl: 0.96, w: 1.0, wt: 0.7 },
    { z: 2.3, bot: 0.18, belt: 0.84, top: 0.89, wl: 0.88, w: 0.98, wt: 0.82 },
    { z: 2.39, bot: 0.3, belt: 0.82, top: 0.86, wl: 0.8, w: 0.92, wt: 0.8 },
  ];
  parts.add(body, faceted(stations.map(facetRing)));
  const { top, side } = facetTools(stations);

  parts.add(shared.glass, polygon([top(-0.72, -0.6), top(-0.72, 0.6), top(-0.04, 0.42), top(-0.04, -0.42)]));
  // A black engine cover with raised slats replaces the rear window.
  parts.add(dark, polygon([top(0.75, -0.4), top(0.75, 0.4), top(2.2, 0.62), top(2.2, -0.62)]));
  for (let i = 0; i < 4; i++) {
    const z = 1.05 + i * 0.3;
    parts.add(body, box(0.95 + i * 0.07, 0.018, 0.08, 0, 1.1 - z * 0.078 - (z - 0.7) * 0.11, z));
  }
  for (const s of [1, -1]) {
    parts.add(shared.glass, polygon([side(s, -0.52, 0.78), side(s, 0.5, 0.82), side(s, 0.5, 1.05), side(s, 0.02, 1.07)]));
    // Large hexagonal intake behind the door.
    parts.add(dark, polygon([side(s, 0.72, 0.42), side(s, 1.08, 0.36), side(s, 1.24, 0.54), side(s, 1.16, 0.76), side(s, 0.8, 0.74), side(s, 0.62, 0.58)]));
    // Hexagonal wheel arches.
    for (const c of [-1.42, 1.5]) {
      parts.add(dark, polygon([
        side(s, c - 0.5, 0.15),
        side(s, c - 0.48, 0.42),
        side(s, c - 0.26, 0.62),
        side(s, c + 0.26, 0.62),
        side(s, c + 0.48, 0.42),
        side(s, c + 0.5, 0.15),
      ]));
    }
    parts.add(dark, polygon([side(s, -0.9, 0.14), side(s, 0.98, 0.14), side(s, 0.98, 0.25), side(s, -0.9, 0.25)]));
    parts.add(shared.black, beam(side(s, -0.62, 0.27), side(s, -0.62, 0.68), 0.012));
    parts.add(shared.black, beam(side(s, 0.6, 0.27), side(s, 0.6, 0.72), 0.012));
    // Angular lamps set into the hood corners.
    parts.add(dark, polygon([top(-2.28, s * 0.3), top(-2.2, s * 0.7), top(-1.82, s * 0.74), top(-1.96, s * 0.46)]));
    parts.add(headFlat, polygon([top(-2.2, s * 0.44), top(-2.16, s * 0.68), top(-1.88, s * 0.72), top(-2.0, s * 0.54)]));
    // Front corner intakes.
    parts.add(dark, polygon([[s * 0.34, 0.38, -2.396], [s * 0.74, 0.42, -2.396], [s * 0.68, 0.24, -2.396], [s * 0.38, 0.24, -2.396]]));
    // Tail lamps with a Y-shaped drop.
    parts.add(brake, polygon([[s * 0.3, 0.78, 2.396], [s * 0.88, 0.8, 2.396], [s * 0.88, 0.74, 2.396], [s * 0.3, 0.73, 2.396]]));
    parts.add(brake, polygon([[s * 0.62, 0.74, 2.396], [s * 0.74, 0.74, 2.396], [s * 0.82, 0.62, 2.396], [s * 0.74, 0.62, 2.396]]));
    // Hood crease and low rear wing supports.
    parts.add(shared.black, box(0.04, 0.05, 0.1, s * 0.6, 0.96, 2.22));
  }
  parts.add(dark, polygon([[-0.3, 0.42, -2.397], [0.3, 0.42, -2.397], [0.26, 0.25, -2.397], [-0.26, 0.25, -2.397]]));
  parts.add(dark, polygon([[-0.74, 0.7, 2.395], [0.74, 0.7, 2.395], [0.62, 0.32, 2.395], [-0.62, 0.32, 2.395]]));
  parts.add(shared.chrome, new THREE.CylinderGeometry(0.11, 0.11, 0.05, 6).rotateX(Math.PI / 2).translate(0, 0.5, 2.41));
  parts.add(shared.plate, box(0.36, 0.1, 0.012, 0, 0.64, 2.402));
  parts.add(body, box(1.42, 0.022, 0.22, 0, 0.995, 2.24));

  const hood = panel(group, body, polygon([top(-1.9, -0.42), top(-1.9, 0.42), top(-0.95, 0.5), top(-0.95, -0.5)]), 'hood');
  const bumper = panel(group, dark, box(1.1, 0.03, 0.12, 0, 0.19, -2.3), 'bumper');

  const wheels = addWheels(group, {
    radius: WR,
    width: 0.3,
    frontZ: -1.42,
    rearZ: 1.5,
    track: 0.87,
    spokes: 5,
    rimMat: shared.darkRim,
  });
  return finishVehicle(group, parts, { paintMat: body, brakeMat: brake, wheels, breakables: [hood, bumper] });
}

/* ------------------------------------------------------------------ */
/* Player: red rear-engine coupe with round lamps and a sloping tail    */
/* ------------------------------------------------------------------ */
export function buildCoupe() {
  const group = new THREE.Group();
  const parts = new Parts();
  const body = paint(0xb8141a, { metalness: 0.45, roughness: 0.22 });
  const brake = shared.tail.clone();
  const WR = 0.34;

  const shell = [
    { z: -2.26, bot: 0.26, top: 0.48, w: 0.6 },
    { z: -2.22, bot: 0.2, top: 0.56, w: 0.78 },
    { z: -2.05, bot: 0.17, top: 0.64, w: 0.85, topW: 0.74 },
    { z: -1.5, bot: 0.16, top: 0.7, w: 0.88, topW: 0.74 },
    { z: -0.8, bot: 0.16, top: 0.79, w: 0.9, topW: 0.77 },
    { z: 0.4, bot: 0.16, top: 0.85, w: 0.92, topW: 0.8 },
    { z: 1.4, bot: 0.17, top: 0.89, w: 0.93, topW: 0.8 },
    { z: 1.95, bot: 0.2, top: 0.9, w: 0.9, topW: 0.78 },
    { z: 2.2, bot: 0.3, top: 0.86, w: 0.8, topW: 0.66 },
    { z: 2.26, bot: 0.42, top: 0.78, w: 0.58 },
  ];
  parts.add(body, loft(shell));

  // The roof flows in one unbroken slope down to the tail.
  const cabin = [
    { z: -0.98, bot: 0.72, top: 0.8, w: 0.72, topW: 0.66 },
    { z: -0.55, bot: 0.72, top: 1.04, w: 0.74, topW: 0.58 },
    { z: -0.15, bot: 0.72, top: 1.24, w: 0.75, topW: 0.53 },
    { z: 0.25, bot: 0.72, top: 1.3, w: 0.75, topW: 0.52 },
    { z: 0.7, bot: 0.72, top: 1.25, w: 0.75, topW: 0.54 },
    { z: 1.2, bot: 0.72, top: 1.12, w: 0.73, topW: 0.58 },
    { z: 1.7, bot: 0.72, top: 0.99, w: 0.7, topW: 0.6 },
    { z: 2.08, bot: 0.72, top: 0.91, w: 0.64, topW: 0.56 },
  ];
  parts.add(body, loft(cabin, { exp: 4, segments: 36 }));
  parts.add(
    shared.glass,
    topGlass(cabin, { z0: -0.9, z1: -0.22, halfX0: 0.56, halfX1: 0.44, n: 4 }),
    topGlass(cabin, { z0: 0.78, z1: 1.62, halfX0: 0.4, halfX1: 0.46, n: 4 })
  );

  const front = (corners, opts) => facePatch(shell, corners, { end: 'front', ...opts });
  const rear = (corners, opts) => facePatch(shell, corners, { end: 'rear', ...opts });

  for (const s of [1, -1]) {
    parts.add(
      shared.glass,
      sideGlass(cabin, s, { z0: -0.5, z1: 0.42, yBot: 0.89, topGap: 0.05, rake0: 0.2, n: 4 }),
      sideGlass(cabin, s, { z0: 0.5, z1: 1.2, yBot: 0.89, topGap: 0.05, rake1: -0.3, n: 4 })
    );
    // Raised front fenders with the round lamps set into them.
    const fender = loft(
      [
        { z: -2.14, bot: 0.5, top: 0.64, w: 0.1 },
        { z: -1.98, bot: 0.44, top: 0.745, w: 0.22 },
        { z: -1.4, bot: 0.45, top: 0.775, w: 0.25 },
        { z: -0.6, bot: 0.5, top: 0.81, w: 0.2 },
      ],
      { exp: 2.5, segments: 16 }
    );
    fender.translate(s * 0.64, 0, 0);
    parts.add(body, fender);
    const lamp = new THREE.SphereGeometry(1, 16, 12);
    lamp.scale(0.115, 0.1, 0.09);
    lamp.translate(s * 0.64, 0.615, -2.07);
    parts.add(shared.head, lamp);
    const ring = new THREE.TorusGeometry(0.112, 0.012, 6, 20);
    ring.translate(s * 0.64, 0.615, -2.135);
    parts.add(shared.black, ring);
    // Wide rear hips.
    const hip = loft(
      [
        { z: 0.42, bot: 0.45, top: 0.82, w: 0.1 },
        { z: 0.95, bot: 0.4, top: 0.92, w: 0.21 },
        { z: 1.65, bot: 0.4, top: 0.95, w: 0.23 },
        { z: 2.12, bot: 0.45, top: 0.88, w: 0.13 },
      ],
      { exp: 2.5, segments: 16 }
    );
    hip.translate(s * 0.76, 0, 0);
    parts.add(body, hip);

    parts.add(shared.black, front([[s * 0.42, 0.4], [s * 0.76, 0.42], [s * 0.72, 0.26], [s * 0.44, 0.26]]));
    parts.add(shared.black, box(0.012, 0.52, 0.012, s * 0.925, 0.5, -0.62));
    parts.add(shared.black, box(0.012, 0.55, 0.012, s * 0.935, 0.52, 0.5));
    parts.add(shared.chrome, box(0.018, 0.02, 0.15, s * 0.935, 0.74, 0.26));
    parts.add(shared.plastic, box(0.04, 0.06, 2.0, s * 0.915, 0.19, 0));
    parts.add(body, box(0.15, 0.07, 0.1, s * 0.82, 0.86, -0.56, 0, s * 0.12));
    parts.add(shared.black, archGeo(WR + 0.05, s * 0.875, -1.4, WR));
    parts.add(shared.black, archGeo(WR + 0.05, s * 0.955, 1.34, WR));
    parts.add(shared.chrome, rear([[s * 0.06, 0.4], [s * 0.28, 0.4], [s * 0.28, 0.33], [s * 0.06, 0.33]], { lift: 0.014 }));
  }
  parts.add(shared.black, front([[-0.34, 0.4], [0.34, 0.4], [0.3, 0.26], [-0.3, 0.26]]));
  parts.add(shared.plastic, box(1.2, 0.03, 0.14, 0, 0.19, -2.12));

  // Full-width tail lamp strip with a small rising lip.
  parts.add(brake, rear([[-0.84, 0.8], [0.84, 0.8], [0.84, 0.745], [-0.84, 0.745]], { lift: 0.012 }));
  parts.add(shared.plate, rear([[-0.2, 0.66], [0.2, 0.66], [0.2, 0.54], [-0.2, 0.54]], { lift: 0.008 }));
  parts.add(shared.plastic, rear([[-0.6, 0.47], [0.6, 0.47], [0.54, 0.31], [-0.54, 0.31]]));
  parts.add(body, box(1.16, 0.02, 0.18, 0, 0.93, 2.03, -0.12));
  for (let i = 0; i < 3; i++) parts.add(shared.black, box(0.74, 0.012, 0.04, 0, 0.945, 1.84 + i * 0.09));

  const hood = panel(
    group,
    body,
    loft(
      [
        { z: -2.05, bot: 0.61, top: 0.655, w: 0.42 },
        { z: -1.5, bot: 0.67, top: 0.715, w: 0.42 },
        { z: -1.04, bot: 0.73, top: 0.78, w: 0.44 },
      ],
      { exp: 5 }
    ),
    'hood'
  );
  const bumper = panel(group, shared.plastic, box(0.9, 0.03, 0.1, 0, 0.23, -2.2), 'bumper');

  const wheels = addWheels(group, {
    radius: WR,
    width: 0.27,
    frontZ: -1.4,
    rearZ: 1.34,
    track: 0.88,
    spokes: 5,
    rimMat: shared.rim,
  });
  return finishVehicle(group, parts, { paintMat: body, brakeMat: brake, wheels, breakables: [hood, bumper] });
}

/* ------------------------------------------------------------------ */
/* Player: two-tone hypercar with a horseshoe grille and a side curve   */
/* ------------------------------------------------------------------ */
export function buildHyper() {
  const group = new THREE.Group();
  const parts = new Parts();
  const body = paint(0x1558b8, { metalness: 0.65, roughness: 0.2 });
  const brake = shared.tail.clone();
  const flatChrome = shared.chrome.clone();
  flatChrome.side = THREE.DoubleSide;
  const flatBlack = shared.black.clone();
  flatBlack.side = THREE.DoubleSide;
  const WR = 0.35;

  const shell = [
    { z: -2.27, bot: 0.3, top: 0.5, w: 0.55 },
    { z: -2.24, bot: 0.2, top: 0.56, w: 0.78 },
    { z: -2.05, bot: 0.15, top: 0.63, w: 0.93, topW: 0.8 },
    { z: -1.5, bot: 0.14, top: 0.71, w: 0.99, topW: 0.84 },
    { z: -0.85, bot: 0.14, top: 0.78, w: 1.02, topW: 0.86 },
    { z: 0.3, bot: 0.14, top: 0.84, w: 1.02, topW: 0.85 },
    { z: 1.4, bot: 0.15, top: 0.88, w: 1.02, topW: 0.84 },
    { z: 1.95, bot: 0.18, top: 0.9, w: 1.0, topW: 0.82 },
    { z: 2.22, bot: 0.3, top: 0.9, w: 0.92, topW: 0.76 },
    { z: 2.27, bot: 0.42, top: 0.86, w: 0.76 },
  ];
  parts.add(body, loft(shell));

  // The contrasting black cabin and tail are the second tone.
  const cabin = [
    { z: -1.02, bot: 0.72, top: 0.79, w: 0.78, topW: 0.72 },
    { z: -0.55, bot: 0.72, top: 1.02, w: 0.8, topW: 0.62 },
    { z: -0.1, bot: 0.72, top: 1.19, w: 0.8, topW: 0.55 },
    { z: 0.3, bot: 0.72, top: 1.21, w: 0.8, topW: 0.54 },
    { z: 0.8, bot: 0.72, top: 1.12, w: 0.79, topW: 0.57 },
    { z: 1.35, bot: 0.72, top: 1.0, w: 0.76, topW: 0.62 },
    { z: 1.88, bot: 0.72, top: 0.92, w: 0.7, topW: 0.62 },
  ];
  parts.add(shared.black, loft(cabin, { exp: 4, segments: 36 }));
  parts.add(
    shared.glass,
    topGlass(cabin, { z0: -0.95, z1: -0.2, halfX0: 0.62, halfX1: 0.46, n: 4 }),
    topGlass(cabin, { z0: 0.75, z1: 1.3, halfX0: 0.36, halfX1: 0.4, n: 4 })
  );
  // A slim ridge runs down the middle of the car from roof to tail.
  parts.add(body, beam([0, 1.225, 0.3], [0, 0.94, 1.95], 0.035, 0.05));

  const front = (corners, opts) => facePatch(shell, corners, { end: 'front', ...opts });
  const rear = (corners, opts) => facePatch(shell, corners, { end: 'rear', ...opts });

  // Horseshoe grille: a rounded top over a tapered base.
  const horseshoe = (scale, z) => {
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const a = (i / 14) * Math.PI;
      pts.push([Math.cos(a) * 0.17 * scale, 0.42 + Math.sin(a) * 0.14 * scale, z]);
    }
    pts.push([-0.1 * scale, 0.42 - 0.17 * scale, z], [0.1 * scale, 0.42 - 0.17 * scale, z]);
    return polygon(pts);
  };
  parts.add(flatChrome, horseshoe(1.14, -2.282));
  parts.add(flatBlack, horseshoe(0.98, -2.288));
  for (let i = -3; i <= 3; i++) parts.add(shared.chrome, box(0.012, 0.25, 0.012, i * 0.04, 0.41, -2.292));

  for (const s of [1, -1]) {
    parts.add(
      shared.glass,
      sideGlass(cabin, s, { z0: -0.56, z1: 0.42, yBot: 0.9, topGap: 0.05, rake0: 0.2, n: 4 })
    );
    // Stacked quad headlamps.
    for (let i = 0; i < 4; i++) {
      const x = s * (0.46 + i * 0.1);
      const y = 0.53 + i * 0.012;
      parts.add(shared.head, front([[x - s * 0.04, y + 0.04], [x + s * 0.04, y + 0.04], [x + s * 0.04, y - 0.02], [x - s * 0.04, y - 0.02]], { lift: 0.012, rows: 2, cols: 4 }));
    }
    parts.add(shared.black, front([[s * 0.4, 0.42], [s * 0.86, 0.46], [s * 0.82, 0.26], [s * 0.42, 0.24]]));

    // The signature curve: over the door, down behind it and forward along the sill.
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 0.66, 1.1, -0.1),
      new THREE.Vector3(s * 0.67, 1.13, 0.5),
      new THREE.Vector3(s * 0.84, 0.97, 1.0),
      new THREE.Vector3(s * 1.03, 0.68, 1.14),
      new THREE.Vector3(s * 1.04, 0.38, 0.98),
      new THREE.Vector3(s * 1.04, 0.26, 0.45),
      new THREE.Vector3(s * 1.03, 0.24, -0.5),
    ]);
    parts.add(shared.chrome, new THREE.TubeGeometry(curve, 44, 0.02, 7, false));
    // Intake inside the curve.
    parts.add(flatBlack, polygon([[s * 1.03, 0.76, 0.58], [s * 1.03, 0.72, 0.98], [s * 1.03, 0.46, 0.94], [s * 1.03, 0.36, 0.56]]));

    parts.add(shared.black, box(0.012, 0.42, 0.012, s * 1.025, 0.5, -0.56));
    parts.add(body, box(0.16, 0.07, 0.11, s * 0.88, 0.87, -0.6, 0, s * 0.12));
    parts.add(shared.plastic, box(0.04, 0.05, 2.0, s * 1.0, 0.16, 0));
    parts.add(shared.black, archGeo(WR + 0.06, s * 1.0, -1.42, WR));
    parts.add(shared.black, archGeo(WR + 0.06, s * 1.0, 1.42, WR));
    parts.add(shared.black, box(0.04, 0.09, 0.12, s * 0.5, 0.95, 2.04));
  }
  parts.add(shared.plastic, box(1.3, 0.03, 0.14, 0, 0.17, -2.14));

  // Dark tail with one uninterrupted light bar, a wing and a central exhaust.
  parts.add(shared.black, rear([[-0.86, 0.88], [0.86, 0.88], [0.8, 0.34], [-0.8, 0.34]], { lift: 0.004, rows: 8 }));
  parts.add(brake, rear([[-0.84, 0.8], [0.84, 0.8], [0.84, 0.745], [-0.84, 0.745]], { lift: 0.014 }));
  parts.add(shared.plate, rear([[-0.2, 0.68], [0.2, 0.68], [0.2, 0.56], [-0.2, 0.56]], { lift: 0.012 }));
  parts.add(shared.chrome, rear([[-0.3, 0.46], [0.3, 0.46], [0.3, 0.37], [-0.3, 0.37]], { lift: 0.016 }));
  parts.add(body, box(1.56, 0.028, 0.32, 0, 1.0, 2.04, -0.08));

  const hood = panel(
    group,
    body,
    loft(
      [
        { z: -2.02, bot: 0.59, top: 0.64, w: 0.46 },
        { z: -1.5, bot: 0.68, top: 0.725, w: 0.5 },
        { z: -1.06, bot: 0.74, top: 0.785, w: 0.52 },
      ],
      { exp: 5 }
    ),
    'hood'
  );
  const bumper = panel(group, shared.plastic, box(0.9, 0.03, 0.1, 0, 0.21, -2.22), 'bumper');

  const wheels = addWheels(group, {
    radius: WR,
    width: 0.29,
    frontZ: -1.42,
    rearZ: 1.42,
    track: 0.915,
    spokes: 7,
    rimMat: shared.rim,
  });
  return finishVehicle(group, parts, { paintMat: body, brakeMat: brake, wheels, breakables: [hood, bumper] });
}

/* ------------------------------------------------------------------ */
/* Player: pink parade car with a glass canopy and a waving princess    */
/* ------------------------------------------------------------------ */
/** Builds the princess, seated facing -Z. Returns the figure and her waving arm. */
function buildPrincess() {
  const figure = new THREE.Group();
  const gown = new THREE.MeshStandardMaterial({ color: 0xff9ccd, roughness: 0.55 });
  const gownDark = new THREE.MeshStandardMaterial({ color: 0xf0619f, roughness: 0.55 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xf8d6bd, roughness: 0.7 });
  const hair = new THREE.MeshStandardMaterial({ color: 0xf6cf4f, roughness: 0.5 });
  const glove = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c4f8c, roughness: 0.3 });
  const lips = new THREE.MeshStandardMaterial({ color: 0xd9486e, roughness: 0.5 });
  const blush = new THREE.MeshStandardMaterial({ color: 0xf7b3b8, roughness: 0.8 });

  const add = (geo, material, x, y, z) => {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    figure.add(mesh);
    return mesh;
  };

  // Full bell-shaped gown with one ruffled hem.
  const gownProfile = [[0.001, 1.06], [0.43, 1.06], [0.42, 1.14], [0.36, 1.27], [0.25, 1.42], [0.15, 1.53], [0.115, 1.58]].map(
    ([r, y]) => new THREE.Vector2(r, y)
  );
  add(new THREE.LatheGeometry(gownProfile, 28), gown, 0, 0, 0);
  add(new THREE.TorusGeometry(0.415, 0.034, 8, 30).rotateX(Math.PI / 2), gownDark, 0, 1.13, 0);
  add(new THREE.CylinderGeometry(0.095, 0.125, 0.17, 16), gown, 0, 1.63, 0);
  add(new THREE.SphereGeometry(0.07, 10, 8), gownDark, 0, 1.6, -0.095);

  // Neck, head and face.
  add(new THREE.CylinderGeometry(0.04, 0.05, 0.08, 10), skin, 0, 1.74, 0);
  add(new THREE.SphereGeometry(0.125, 18, 14), skin, 0, 1.84, -0.005);
  for (const s of [1, -1]) {
    add(new THREE.SphereGeometry(0.02, 8, 6).scale(0.85, 1.25, 0.5), dark, s * 0.047, 1.855, -0.122);
    add(new THREE.SphereGeometry(0.035, 8, 6), blush, s * 0.075, 1.81, -0.09);
  }
  add(new THREE.SphereGeometry(0.022, 8, 6).scale(1.2, 0.45, 0.5), lips, 0, 1.79, -0.122);

  // Long golden hair: a full crown, a fringe, side waves and a fall down her back.
  add(new THREE.SphereGeometry(0.142, 18, 14).scale(1, 0.98, 1.02), hair, 0, 1.87, 0.03);
  add(new THREE.SphereGeometry(0.1, 12, 10).scale(1.15, 0.42, 0.55), hair, 0, 1.93, -0.09);
  add(new THREE.CapsuleGeometry(0.115, 0.26, 6, 14).scale(1.12, 1, 0.7), hair, 0, 1.68, 0.1);
  for (const s of [1, -1]) {
    add(new THREE.CapsuleGeometry(0.052, 0.2, 5, 10), hair, s * 0.125, 1.74, -0.015);
    // Puffed sleeves.
    add(new THREE.SphereGeometry(0.066, 12, 10), gownDark, s * 0.135, 1.665, 0);
  }

  // Her left arm rests on the gown.
  const restArm = add(new THREE.CapsuleGeometry(0.031, 0.2, 4, 8), glove, -0.17, 1.53, -0.04);
  restArm.rotation.x = 0.5;
  restArm.rotation.z = -0.25;

  // Her right arm waves from the shoulder.
  const waveArm = new THREE.Group();
  waveArm.position.set(0.14, 1.66, 0);
  const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.031, 0.2, 4, 8), glove);
  forearm.position.y = -0.14;
  forearm.castShadow = true;
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.039, 8, 6), glove);
  hand.position.y = -0.29;
  waveArm.add(forearm, hand);
  figure.add(waveArm);
  return { figure, waveArm };
}

/** Gold crown with points and small gems. It is thrown clear in a crash. */
function buildCrown(gold) {
  const parts = [new THREE.CylinderGeometry(0.083, 0.083, 0.045, 20, 1, true)];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const point = new THREE.ConeGeometry(0.027, 0.085, 6);
    point.translate(Math.sin(a) * 0.083, 0.06, Math.cos(a) * 0.083);
    parts.push(point);
  }
  const mesh = new THREE.Mesh(merge(parts), gold);
  mesh.castShadow = true;
  return mesh;
}

export function buildPrincessCar() {
  const group = new THREE.Group();
  const parts = new Parts();
  const body = paint(0xff4fa3, { metalness: 0.35, roughness: 0.24 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xf2c230, metalness: 0.9, roughness: 0.28, side: THREE.DoubleSide });
  const brake = shared.tail.clone();
  const clear = new THREE.MeshStandardMaterial({
    color: 0xe6f6ff,
    transparent: true,
    opacity: 0.16,
    roughness: 0.04,
    metalness: 0.1,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const WR = 0.385;

  const shell = [
    { z: -2.4, bot: 0.38, top: 0.7, w: 0.68 },
    { z: -2.36, bot: 0.29, top: 0.82, w: 0.84, topW: 0.78 },
    { z: -2.15, bot: 0.25, top: 0.92, w: 0.94, topW: 0.84 },
    { z: -1.3, bot: 0.24, top: 1.0, w: 0.97, topW: 0.87 },
    { z: -0.8, bot: 0.24, top: 1.03, w: 0.98, topW: 0.88 },
    { z: 2.15, bot: 0.25, top: 1.07, w: 0.98, topW: 0.88 },
    { z: 2.35, bot: 0.32, top: 1.05, w: 0.93, topW: 0.82 },
    { z: 2.4, bot: 0.44, top: 0.98, w: 0.76 },
  ];
  parts.add(body, loft(shell));

  // Short driver's cab, lower than the canopy behind it.
  const cab = [
    { z: -1.14, bot: 0.95, top: 1.04, w: 0.86, topW: 0.8 },
    { z: -0.62, bot: 0.95, top: 1.38, w: 0.87, topW: 0.72 },
    { z: -0.28, bot: 0.95, top: 1.55, w: 0.87, topW: 0.7 },
    { z: 0.02, bot: 0.95, top: 1.57, w: 0.87, topW: 0.7 },
    { z: 0.24, bot: 0.95, top: 1.5, w: 0.86, topW: 0.72 },
  ];
  parts.add(body, loft(cab, { exp: 5, segments: 32 }));
  parts.add(
    shared.glass,
    topGlass(cab, { z0: -1.06, z1: -0.34, halfX0: 0.68, halfX1: 0.54 }),
    ...mirrorX((s) => sideGlass(cab, s, { z0: -0.6, z1: 0.14, yBot: 1.12, topGap: 0.06, rake0: 0.2 }))
  );

  // Clear canopy, framed in gold with a rounded pink roof.
  const X0 = 0.8;
  const X1 = 0.63;
  const Y0 = 1.06;
  const Y1 = 2.04;
  const Z0 = 0.26;
  const Z1 = 2.14;
  const ZT0 = 0.44;
  const ZT1 = 2.0;
  const corners = (s) => ({
    frontLow: [s * X0, Y0, Z0],
    backLow: [s * X0, Y0, Z1],
    frontHigh: [s * X1, Y1, ZT0],
    backHigh: [s * X1, Y1, ZT1],
  });
  const R = corners(1);
  const L = corners(-1);
  parts.add(
    clear,
    polygon([R.frontLow, R.backLow, R.backHigh, R.frontHigh]),
    polygon([L.frontLow, L.backLow, L.backHigh, L.frontHigh]),
    polygon([L.frontLow, R.frontLow, R.frontHigh, L.frontHigh]),
    polygon([L.backLow, R.backLow, R.backHigh, L.backHigh])
  );
  for (const c of [R, L]) {
    parts.add(gold, beam(c.frontLow, c.frontHigh, 0.05), beam(c.backLow, c.backHigh, 0.05));
    parts.add(gold, beam(c.frontLow, c.backLow, 0.04), beam(c.frontHigh, c.backHigh, 0.04));
  }
  parts.add(gold, beam(L.frontHigh, R.frontHigh, 0.04), beam(L.backHigh, R.backHigh, 0.04));
  parts.add(gold, beam(L.backLow, R.backLow, 0.04));
  // The roof is clear too, so she stays visible from the chase camera.
  parts.add(clear, polygon([L.frontHigh, R.frontHigh, R.backHigh, L.backHigh]));
  parts.add(gold, beam([0, Y1, ZT0], [0, Y1, ZT1], 0.03));
  parts.add(body, beam(L.backLow, R.backLow, 0.07), beam(L.frontHigh, R.frontHigh, 0.06), beam(L.backHigh, R.backHigh, 0.06));

  // Lamps, trim and a gold stripe along each side.
  const front = (corners2, opts) => facePatch(shell, corners2, { end: 'front', ...opts });
  const rear = (corners2, opts) => facePatch(shell, corners2, { end: 'rear', ...opts });
  for (const s of [1, -1]) {
    parts.add(shared.black, front([[s * 0.38, 0.84], [s * 0.86, 0.88], [s * 0.86, 0.72], [s * 0.4, 0.7]], { lift: 0.004 }));
    parts.add(shared.head, front([[s * 0.48, 0.82], [s * 0.84, 0.86], [s * 0.84, 0.76], [s * 0.5, 0.73]], { lift: 0.012 }));
    parts.add(brake, rear([[s * 0.42, 0.98], [s * 0.88, 0.99], [s * 0.88, 0.87], [s * 0.42, 0.87]], { lift: 0.012 }));
    parts.add(gold, box(0.016, 0.04, 3.9, s * 0.985, 0.74, 0.05));
    parts.add(shared.black, box(0.012, 0.56, 0.012, s * 0.985, 0.62, -0.72));
    parts.add(shared.black, box(0.012, 0.56, 0.012, s * 0.985, 0.62, 0.26));
    parts.add(gold, box(0.018, 0.024, 0.16, s * 0.99, 0.92, 0.03));
    parts.add(body, box(0.16, 0.09, 0.11, s * 0.95, 1.2, -0.66, 0, s * 0.12));
    parts.add(shared.plastic, box(0.05, 0.08, 2.4, s * 0.965, 0.28, 0));
    parts.add(shared.black, archGeo(WR + 0.07, s * 0.955, -1.45, WR));
    parts.add(shared.black, archGeo(WR + 0.07, s * 0.955, 1.45, WR));
  }
  // Gold-framed grille.
  parts.add(gold, front([[-0.36, 0.72], [0.36, 0.72], [0.36, 0.46], [-0.36, 0.46]], { lift: 0.006 }));
  parts.add(shared.black, front([[-0.32, 0.69], [0.32, 0.69], [0.32, 0.49], [-0.32, 0.49]], { lift: 0.012 }));
  parts.add(shared.plate, rear([[-0.21, 0.76], [0.21, 0.76], [0.21, 0.63], [-0.21, 0.63]], { lift: 0.008 }));
  parts.add(shared.plastic, rear([[-0.72, 0.56], [0.72, 0.56], [0.68, 0.42], [-0.68, 0.42]]));

  const { figure, waveArm } = buildPrincess();
  figure.position.z = 1.2;
  group.add(figure);
  group.userData.animate = (t) => {
    waveArm.rotation.z = 2.45 + Math.sin(t * 7) * 0.32;
  };

  const crown = buildCrown(gold);
  crown.position.set(0, 2.0, 1.2);
  crown.name = 'crown';
  group.add(crown);

  const hood = panel(
    group,
    body,
    loft(
      [
        { z: -2.12, bot: 0.88, top: 0.935, w: 0.68, topW: 0.62 },
        { z: -1.3, bot: 0.97, top: 1.015, w: 0.74, topW: 0.68 },
        { z: -1.16, bot: 0.98, top: 1.03, w: 0.74, topW: 0.68 },
      ],
      { exp: 5 }
    ),
    'hood'
  );
  const bumper = panel(group, shared.plastic, box(1.1, 0.04, 0.12, 0, 0.32, -2.3), 'bumper');

  const wheels = addWheels(group, {
    radius: WR,
    width: 0.26,
    frontZ: -1.45,
    rearZ: 1.45,
    track: 0.875,
    spokes: 6,
    rimMat: gold,
  });
  return finishVehicle(group, parts, { paintMat: body, brakeMat: brake, wheels, breakables: [hood, bumper, crown] });
}

/* ------------------------------------------------------------------ */
/* Player: electric crossover, a taller take on the smooth glass-roof EV */
/* ------------------------------------------------------------------ */
export function buildEVCrossover() {
  const group = new THREE.Group();
  const parts = new Parts();
  const body = paint(0x4d6880, { metalness: 0.6, roughness: 0.26 });
  const brake = shared.tail.clone();
  const WR = 0.37;

  const shell = [
    { z: -2.38, bot: 0.4, top: 0.66, w: 0.54 },
    { z: -2.35, bot: 0.3, top: 0.74, w: 0.78 },
    { z: -2.2, bot: 0.24, top: 0.82, w: 0.9, topW: 0.82 },
    { z: -1.85, bot: 0.21, top: 0.9, w: 0.94, topW: 0.85 },
    { z: -1.3, bot: 0.2, top: 0.98, w: 0.955, topW: 0.86 },
    { z: -0.95, bot: 0.2, top: 1.03, w: 0.96, topW: 0.86 },
    { z: 0.4, bot: 0.2, top: 1.08, w: 0.96, topW: 0.86 },
    { z: 1.4, bot: 0.21, top: 1.11, w: 0.96, topW: 0.85 },
    { z: 1.95, bot: 0.24, top: 1.12, w: 0.94, topW: 0.82 },
    { z: 2.25, bot: 0.32, top: 1.1, w: 0.88, topW: 0.75 },
    { z: 2.35, bot: 0.4, top: 1.06, w: 0.8, topW: 0.68 },
    { z: 2.38, bot: 0.5, top: 0.98, w: 0.6 },
  ];
  parts.add(body, loft(shell));

  const cabin = [
    { z: -1.18, bot: 0.94, top: 1.03, w: 0.82, topW: 0.76 },
    { z: -0.72, bot: 0.94, top: 1.35, w: 0.83, topW: 0.68 },
    { z: -0.3, bot: 0.94, top: 1.59, w: 0.84, topW: 0.63 },
    { z: 0.2, bot: 0.94, top: 1.68, w: 0.84, topW: 0.62 },
    { z: 0.8, bot: 0.94, top: 1.67, w: 0.84, topW: 0.62 },
    { z: 1.35, bot: 0.94, top: 1.56, w: 0.82, topW: 0.64 },
    { z: 1.8, bot: 0.94, top: 1.38, w: 0.79, topW: 0.65 },
    { z: 2.14, bot: 0.94, top: 1.2, w: 0.74, topW: 0.64 },
  ];
  parts.add(body, loft(cabin, { exp: 5, segments: 36 }));
  // Windshield, roof and tailgate glass read as one dark sheet.
  parts.add(
    shared.glass,
    topGlass(cabin, { z0: -1.1, z1: -0.12, halfX0: 0.68, halfX1: 0.52 }),
    topGlass(cabin, { z0: -0.12, z1: 0.95, halfX0: 0.52, halfX1: 0.52 }),
    topGlass(cabin, { z0: 0.95, z1: 2.04, halfX0: 0.52, halfX1: 0.58 })
  );
  const front = (corners, opts) => facePatch(shell, corners, { end: 'front', ...opts });
  const rear = (corners, opts) => facePatch(shell, corners, { end: 'rear', ...opts });

  for (const s of [1, -1]) {
    parts.add(
      shared.glass,
      sideGlass(cabin, s, { z0: -0.62, z1: 0.26, yBot: 1.14, rake0: 0.24 }),
      sideGlass(cabin, s, { z0: 0.36, z1: 1.56, yBot: 1.14, rake1: -0.16 })
    );
    // A smooth nose with no grille and narrow lamps.
    parts.add(shared.black, front([[s * 0.42, 0.74], [s * 0.9, 0.85], [s * 0.9, 0.72], [s * 0.44, 0.67]], { lift: 0.004 }));
    parts.add(shared.head, front([[s * 0.52, 0.73], [s * 0.88, 0.83], [s * 0.88, 0.77], [s * 0.54, 0.7]], { lift: 0.01 }));
    parts.add(brake, rear([[s * 0.44, 1.05], [s * 0.92, 1.07], [s * 0.92, 0.95], [s * 0.44, 0.97]], { lift: 0.01 }));

    const x = s * 0.965;
    parts.add(shared.black, box(0.012, 0.6, 0.012, x, 0.68, -0.76));
    parts.add(shared.black, box(0.012, 0.66, 0.012, x, 0.66, 0.3));
    parts.add(shared.black, box(0.012, 0.56, 0.012, x, 0.7, 1.34));
    // Dark lower cladding gives it the crossover stance.
    parts.add(shared.plastic, box(0.04, 0.16, 2.3, s * 0.955, 0.3, 0.02));
    parts.add(body, box(0.15, 0.08, 0.1, s * 0.98, 1.14, -0.68, 0, s * 0.14));
    parts.add(shared.black, archGeo(WR + 0.07, s * 0.94, -1.45, WR));
    parts.add(shared.black, archGeo(WR + 0.07, s * 0.94, 1.47, WR));
  }
  parts.add(shared.black, front([[-0.44, 0.4], [0.44, 0.4], [0.38, 0.31], [-0.38, 0.31]]));
  parts.add(shared.plastic, box(1.15, 0.03, 0.2, 0, 0.25, -2.14));
  parts.add(body, box(1.1, 0.02, 0.08, 0, 1.14, 2.14, -0.1));
  parts.add(shared.plate, rear([[-0.21, 0.82], [0.21, 0.82], [0.21, 0.69], [-0.21, 0.69]], { lift: 0.008 }));
  parts.add(shared.plastic, rear([[-0.72, 0.58], [0.72, 0.58], [0.64, 0.45], [-0.64, 0.45]]));

  const hood = panel(
    group,
    body,
    loft(
      [
        { z: -2.16, bot: 0.8, top: 0.845, w: 0.72, topW: 0.66 },
        { z: -1.85, bot: 0.87, top: 0.915, w: 0.82, topW: 0.74 },
        { z: -1.3, bot: 0.94, top: 0.995, w: 0.84, topW: 0.75 },
        { z: -1.1, bot: 0.97, top: 1.025, w: 0.84, topW: 0.74 },
      ],
      { exp: 5 }
    ),
    'hood'
  );
  const bumper = panel(group, shared.plastic, box(0.9, 0.03, 0.12, 0, 0.29, -2.3), 'bumper');

  const wheels = addWheels(group, {
    radius: WR,
    width: 0.25,
    frontZ: -1.45,
    rearZ: 1.47,
    track: 0.875,
    spokes: 7,
    rimMat: shared.darkRim,
  });
  return finishVehicle(group, parts, { paintMat: body, brakeMat: brake, wheels, breakables: [hood, bumper] });
}

/* ------------------------------------------------------------------ */
/* Player: boxy red hatchback with real windows and rabbits inside      */
/* ------------------------------------------------------------------ */

/** A plush white rabbit sitting and facing -Z. */
function buildBunny() {
  const fur = new THREE.MeshStandardMaterial({ color: 0xf6f5f1, roughness: 0.95 });
  const inner = new THREE.MeshStandardMaterial({ color: 0xf2b6c0, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.25 });
  const root = new THREE.Group();
  const add = (geo, material, x, y, z, parent = root) => {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  add(new THREE.SphereGeometry(0.15, 12, 10).scale(1, 1.1, 0.95), fur, 0, 0.98, 0);

  const head = new THREE.Group();
  head.position.set(0, 1.15, -0.015);
  root.add(head);
  add(new THREE.SphereGeometry(0.128, 14, 12).scale(1.08, 0.96, 1), fur, 0, 0, 0, head);
  // Wide, slightly unhinged eyes and a tiny nose.
  for (const s of [1, -1]) {
    add(new THREE.SphereGeometry(0.03, 9, 7), dark, s * 0.052, 0.022, -0.112, head);
  }
  add(new THREE.SphereGeometry(0.017, 7, 5), inner, 0, -0.024, -0.126, head);

  const ears = [1, -1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.062, 0.095, 0);
    const ear = add(new THREE.CapsuleGeometry(0.032, 0.135, 4, 9), fur, 0, 0.09, 0, pivot);
    ear.scale.z = 0.7;
    const lining = add(new THREE.CapsuleGeometry(0.016, 0.1, 3, 7), inner, 0, 0.09, -0.021, pivot);
    lining.scale.z = 0.3;
    pivot.rotation.z = -s * 0.18;
    head.add(pivot);
    return pivot;
  });
  return { root, head, ears };
}

export function buildBunnyHatch() {
  const group = new THREE.Group();
  const parts = new Parts();
  const body = paint(0xb9442c, { metalness: 0.05, roughness: 0.68 });
  body.side = THREE.DoubleSide;
  const brake = shared.tail.clone();
  const clear = new THREE.MeshStandardMaterial({
    color: 0xdff0f4,
    transparent: true,
    opacity: 0.12,
    roughness: 0.05,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const trim = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.7, side: THREE.DoubleSide });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xe9ddad, emissive: 0xc9b56a, emissiveIntensity: 0.55, roughness: 0.3 });
  const marker = new THREE.MeshStandardMaterial({ color: 0xe8691f, emissive: 0x8a2c08, emissiveIntensity: 0.5, roughness: 0.4 });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x4a2c24, roughness: 0.9 });
  const WR = 0.315;

  const shell = [
    { z: -1.95, bot: 0.34, top: 0.74, w: 0.72 },
    { z: -1.92, bot: 0.27, top: 0.82, w: 0.8, topW: 0.76 },
    { z: -1.6, bot: 0.24, top: 0.87, w: 0.83, topW: 0.78 },
    { z: -0.85, bot: 0.23, top: 0.96, w: 0.84, topW: 0.79 },
    { z: 1.2, bot: 0.23, top: 0.98, w: 0.84, topW: 0.79 },
    { z: 1.86, bot: 0.27, top: 0.98, w: 0.83, topW: 0.77 },
    { z: 1.95, bot: 0.36, top: 0.92, w: 0.74, topW: 0.68 },
  ];
  parts.add(body, loft(shell, { exp: 6, segments: 32 }));

  // The cabin is an open frame with clear panes, so everyone inside shows.
  const YB = 0.96;
  const YT = 1.5;
  const baseX = 0.77;
  const topX = 0.65;
  const point = (s, z, v, zAtTop) => [s * (baseX + (topX - baseX) * v), YB + (YT - YB) * v, z + (zAtTop - z) * v];
  const frontPost = (s, v) => point(s, -0.82, v, -0.1);
  const rearPost = (s, v) => point(s, 1.82, v, 1.42);
  const R0 = frontPost(1, 0);
  const R1 = frontPost(1, 1);
  const R2 = rearPost(1, 1);
  const R3 = rearPost(1, 0);
  const L0 = frontPost(-1, 0);
  const L1 = frontPost(-1, 1);
  const L2 = rearPost(-1, 1);
  const L3 = rearPost(-1, 0);
  parts.add(
    clear,
    polygon([L0, R0, R1, L1]),
    polygon([R3, L3, L2, R2]),
    polygon([R0, R3, R2, R1]),
    polygon([L0, L3, L2, L1])
  );
  // Roof slab with a slight crown.
  parts.add(
    body,
    loft(
      [
        { z: -0.16, bot: 1.48, top: 1.515, w: 0.6, topW: 0.58 },
        { z: 0.0, bot: 1.48, top: 1.54, w: 0.68, topW: 0.62 },
        { z: 1.3, bot: 1.48, top: 1.54, w: 0.68, topW: 0.62 },
        { z: 1.46, bot: 1.48, top: 1.515, w: 0.6, topW: 0.58 },
      ],
      { exp: 5, segments: 20 }
    )
  );
  for (const s of [1, -1]) {
    // Corner posts, then door posts at set positions along each side.
    parts.add(body, beam(frontPost(s, 0), frontPost(s, 1), 0.05, 0.05), beam(rearPost(s, 0), rearPost(s, 1), 0.05, 0.05));
    parts.add(body, beam(point(s, 0.38, 0, 0.5), point(s, 0.38, 1, 0.5), 0.05, 0.05));
    // Wide painted panel behind the rear door, flush with the side glass.
    parts.add(body, polygon([point(s, 1.3, 0, 1.12), rearPost(s, 0), rearPost(s, 1), point(s, 1.3, 1, 1.12)]));
    parts.add(body, beam(frontPost(s, 0), rearPost(s, 0), 0.05, 0.06));

    // Big rectangular lamps in dark bezels, with an orange corner marker.
    const front = (corners, opts) => facePatch(shell, corners, { end: 'front', n: 6, ...opts });
    const rear = (corners, opts) => facePatch(shell, corners, { end: 'rear', n: 6, ...opts });
    parts.add(trim, front([[s * 0.32, 0.8], [s * 0.76, 0.8], [s * 0.76, 0.54], [s * 0.32, 0.54]], { lift: 0.004 }));
    parts.add(lamp, front([[s * 0.36, 0.77], [s * 0.72, 0.77], [s * 0.72, 0.57], [s * 0.36, 0.57]], { lift: 0.012 }));
    parts.add(brake, rear([[s * 0.42, 0.9], [s * 0.76, 0.9], [s * 0.76, 0.68], [s * 0.42, 0.68]], { lift: 0.012 }));
    const dot = new THREE.CylinderGeometry(0.038, 0.038, 0.012, 12);
    dot.rotateZ(Math.PI / 2);
    dot.translate(s * 0.845, 0.68, -1.3);
    parts.add(marker, dot);

    // Recessed black handles, door lines and an upright mirror.
    const x = s * 0.848;
    parts.add(trim, box(0.016, 0.055, 0.17, x, 0.82, 0.08));
    parts.add(trim, box(0.016, 0.055, 0.17, x, 0.83, 1.02));
    parts.add(shared.black, box(0.012, 0.56, 0.012, x, 0.6, -0.72));
    parts.add(shared.black, box(0.012, 0.6, 0.012, x, 0.6, 0.42));
    parts.add(shared.black, box(0.012, 0.56, 0.012, x, 0.62, 1.26));
    parts.add(trim, box(0.07, 0.14, 0.1, s * 0.86, 1.08, -0.52));
    parts.add(trim, box(0.09, 0.02, 0.02, s * 0.8, 1.04, -0.52));
    parts.add(shared.black, archGeo(WR + 0.08, s * 0.825, -1.18, WR));
    parts.add(shared.black, archGeo(WR + 0.08, s * 0.825, 1.2, WR));
  }
  const nose = (corners, opts) => facePatch(shell, corners, { end: 'front', n: 6, ...opts });
  const tail = (corners, opts) => facePatch(shell, corners, { end: 'rear', n: 6, ...opts });
  parts.add(trim, nose([[-0.3, 0.8], [0.3, 0.8], [0.3, 0.54], [-0.3, 0.54]], { lift: 0.006 }));
  parts.add(shared.black, nose([[-0.26, 0.77], [0.26, 0.77], [0.26, 0.57], [-0.26, 0.57]], { lift: 0.012 }));
  parts.add(shared.plate, nose([[-0.17, 0.46], [0.17, 0.46], [0.17, 0.37], [-0.17, 0.37]], { lift: 0.03 }));
  parts.add(shared.plate, tail([[-0.2, 0.68], [0.2, 0.68], [0.2, 0.56], [-0.2, 0.56]], { lift: 0.008 }));
  parts.add(body, box(1.62, 0.13, 0.11, 0, 0.42, 1.93));
  // Two wipers, resting on the windshield.
  parts.add(trim, beam([-0.18, 1.0, -0.74], [-0.56, 1.03, -0.66], 0.016), beam([0.28, 1.0, -0.74], [-0.1, 1.03, -0.66], 0.016));

  // Dark interior, seats and a steering wheel.
  parts.add(trim, box(1.42, 0.02, 2.5, 0, 0.965, 0.48));
  for (const s of [1, -1]) parts.add(seatMat, box(0.46, 0.14, 0.12, s * 0.34, 1.04, 0.2));
  parts.add(seatMat, box(1.26, 0.1, 0.14, 0, 1.02, 1.26));
  const wheelRing = new THREE.TorusGeometry(0.12, 0.016, 6, 16);
  wheelRing.rotateX(0.35);
  wheelRing.translate(-0.34, 1.13, -0.34);
  parts.add(shared.black, wheelRing);

  // Driver, passenger, and one on the back seat leaning forward.
  const bunnies = [
    [-0.34, 0.03],
    [0.34, 0.03],
    [-0.02, 1.02],
  ].map(([x, z], i) => {
    const bunny = buildBunny();
    bunny.root.position.set(x, 0, z);
    bunny.phase = i * 1.9;
    bunny.baseX = x;
    group.add(bunny.root);
    return bunny;
  });
  group.userData.animate = (t) => {
    for (const b of bunnies) {
      const p = t + b.phase;
      b.root.position.y = Math.abs(Math.sin(p * 5.5)) * 0.022;
      b.head.rotation.y = Math.sin(p * 1.7) * 0.5;
      b.head.rotation.z = Math.sin(p * 2.6) * 0.1;
      b.ears[0].rotation.x = Math.sin(p * 8) * 0.14;
      b.ears[1].rotation.x = Math.sin(p * 8 + 1) * 0.14;
    }
  };

  const hood = panel(
    group,
    body,
    loft(
      [
        { z: -1.6, bot: 0.84, top: 0.885, w: 0.72, topW: 0.68 },
        { z: -1.0, bot: 0.92, top: 0.965, w: 0.74, topW: 0.7 },
        { z: -0.86, bot: 0.93, top: 0.98, w: 0.74, topW: 0.7 },
      ],
      { exp: 6 }
    ),
    'hood'
  );
  // A long silver front bumper hangs off in a crash.
  const bumperMat = new THREE.MeshStandardMaterial({ color: 0x9b9d9c, metalness: 0.85, roughness: 0.35 });
  const bumper = panel(group, bumperMat, box(1.66, 0.11, 0.1, 0, 0.42, -1.95), 'bumper');

  const wheels = addWheels(group, {
    radius: WR,
    width: 0.2,
    frontZ: -1.18,
    rearZ: 1.2,
    track: 0.76,
    spokes: 12,
    rimMat: shared.rim,
  });
  return finishVehicle(group, parts, { paintMat: body, brakeMat: brake, wheels, breakables: [hood, bumper] });
}

const PLAYER_BUILDERS = {
  sedan: buildSedan,
  suv: buildSUV,
  ev: buildEV,
  truck: buildSteelTruck,
  wedge: buildWedge,
  coupe: buildCoupe,
  hyper: buildHyper,
  princess: buildPrincessCar,
  evsuv: buildEVCrossover,
  hatch: buildBunnyHatch,
};

export function buildPlayerCar(id) {
  return PLAYER_BUILDERS[id]();
}

/* ------------------------------------------------------------------ */
/* Traffic: lightweight models that share merged geometry              */
/* ------------------------------------------------------------------ */

const WHEEL_CACHE = new Map();

function trafficWheelGeos(radius, width) {
  const key = `${radius}-${width}`;
  if (!WHEEL_CACHE.has(key)) {
    const t = new THREE.CylinderGeometry(radius, radius, width, 18);
    t.rotateZ(Math.PI / 2);
    const r = new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, width + 0.012, 14);
    r.rotateZ(Math.PI / 2);
    WHEEL_CACHE.set(key, { t, r });
  }
  return WHEEL_CACHE.get(key);
}

function addTrafficWheels(parts, radius, width, positions, track) {
  const { t, r } = trafficWheelGeos(radius, width);
  for (const z of positions) {
    for (const s of [1, -1]) {
      parts.add(shared.tire, t.clone().translate(s * track, radius, z));
      parts.add(shared.rim, r.clone().translate(s * track, radius, z));
    }
  }
}

/** Sedan, hatchback or crossover made from a few dimensions. */
function roadCarGeometry({ len, wid, belt, roof, hoodLen, tailLen, wheelR, bot = 0.2 }) {
  const L = len / 2;
  const W = wid / 2;
  const parts = new Parts();
  const P = 'paint';
  parts.add(
    P,
    loft([
      { z: -L, bot: bot + 0.14, top: belt * 0.68, w: W * 0.66 },
      { z: -L + 0.05, bot: bot + 0.05, top: belt * 0.76, w: W * 0.86 },
      { z: -L + 0.25, bot, top: belt * 0.84, w: W * 0.96, topW: W * 0.88 },
      { z: -L + hoodLen, bot, top: belt, w: W, topW: W * 0.9 },
      { z: L - tailLen, bot, top: belt * 1.05, w: W, topW: W * 0.9 },
      { z: L - 0.14, bot: bot + 0.06, top: belt * 1.03, w: W * 0.95, topW: W * 0.82 },
      { z: L, bot: bot + 0.18, top: belt * 0.92, w: W * 0.7 },
    ])
  );
  const roofFront = -L + hoodLen + 0.55;
  const roofRear = L - tailLen - 0.45;
  const cabin = [
    { z: -L + hoodLen - 0.12, bot: belt - 0.09, top: belt + 0.02, w: W * 0.84, topW: W * 0.78 },
    { z: roofFront, bot: belt - 0.09, top: roof - 0.02, w: W * 0.87, topW: W * 0.68 },
    { z: (roofFront + roofRear) / 2, bot: belt - 0.09, top: roof, w: W * 0.87, topW: W * 0.68 },
    { z: roofRear, bot: belt - 0.09, top: roof - 0.03, w: W * 0.87, topW: W * 0.68 },
    { z: L - tailLen + 0.05, bot: belt - 0.09, top: belt + 0.05, w: W * 0.82, topW: W * 0.72 },
  ];
  parts.add(P, loft(cabin, { exp: 5, segments: 24 }));
  parts.add(
    shared.glass,
    topGlass(cabin, { z0: -L + hoodLen - 0.04, z1: roofFront - 0.05, halfX0: W * 0.66, halfX1: W * 0.54 }),
    topGlass(cabin, { z0: roofRear + 0.05, z1: L - tailLen, halfX0: W * 0.54, halfX1: W * 0.58 }),
    ...mirrorX((s) => sideGlass(cabin, s, { z0: roofFront - 0.12, z1: roofRear + 0.1, yBot: belt + 0.05 }))
  );
  parts.add(shared.black, ...mirrorX((s) => box(0.03, roof - belt - 0.1, 0.07, s * W * 0.83, (roof + belt) / 2, (roofFront + roofRear) / 2)));
  parts.add(shared.black, box(wid * 0.56, 0.17, 0.05, 0, bot + 0.22, -L + 0.025));
  parts.add(shared.head, ...mirrorX((s) => box(W * 0.46, 0.09, 0.08, s * W * 0.64, belt * 0.72, -L + 0.14)));
  parts.add(shared.tail, ...mirrorX((s) => box(W * 0.56, 0.13, 0.05, s * W * 0.58, belt * 0.9, L - 0.03)));
  parts.add(shared.plate, box(0.4, 0.12, 0.02, 0, belt * 0.68, L));
  parts.add(shared.plastic, box(wid * 0.86, 0.14, 0.06, 0, bot + 0.1, L - 0.05));
  for (const s of [1, -1]) {
    parts.add(shared.black, archGeo(wheelR + 0.06, s * (W - 0.012), -L + hoodLen * 0.62, wheelR));
    parts.add(shared.black, archGeo(wheelR + 0.06, s * (W - 0.012), L - tailLen * 0.72 - 0.42, wheelR));
    parts.add(P, box(0.17, 0.08, 0.11, s * (W + 0.05), belt + 0.01, -L + hoodLen + 0.28));
  }
  addTrafficWheels(parts, wheelR, 0.2, [-L + hoodLen * 0.62, L - tailLen * 0.72 - 0.42], W - 0.06);
  return { parts, halfW: W, halfL: L, lamp: [W * 0.64, belt * 0.72, -L + 0.08] };
}

function pickupGeometry() {
  const parts = new Parts();
  const P = 'paint';
  const L = 2.8;
  const W = 1.0;
  parts.add(
    P,
    loft([
      { z: -L, bot: 0.45, top: 1.05, w: 0.84 },
      { z: -L + 0.1, bot: 0.34, top: 1.2, w: 0.97, topW: 0.9 },
      { z: -1.2, bot: 0.34, top: 1.32, w: 1.0, topW: 0.92 },
      { z: L - 0.05, bot: 0.36, top: 1.3, w: 1.0, topW: 0.96 },
      { z: L, bot: 0.42, top: 1.26, w: 0.96 },
    ])
  );
  parts.add(
    shared.glass,
    loft(
      [
        { z: -1.25, bot: 1.25, top: 1.32, w: 0.86, topW: 0.82 },
        { z: -0.72, bot: 1.25, top: 1.86, w: 0.88, topW: 0.74 },
        { z: 0.5, bot: 1.25, top: 1.88, w: 0.88, topW: 0.74 },
        { z: 0.72, bot: 1.25, top: 1.32, w: 0.88, topW: 0.82 },
      ],
      { exp: 8, segments: 16 }
    )
  );
  parts.add(P, box(1.54, 0.07, 1.3, 0, 1.89, -0.08));
  parts.add(shared.black, box(1.62, 0.04, 1.86, 0, 1.31, 1.84)); // truck bed opening
  parts.add(shared.black, box(1.2, 0.34, 0.05, 0, 0.84, -L + 0.01));
  parts.add(shared.chrome, box(1.84, 0.13, 0.09, 0, 0.5, -L));
  parts.add(shared.chrome, box(1.84, 0.13, 0.09, 0, 0.5, L));
  parts.add(shared.head, ...mirrorX((s) => box(0.36, 0.18, 0.06, s * 0.76, 0.95, -L + 0.05)));
  parts.add(shared.tail, ...mirrorX((s) => box(0.14, 0.42, 0.04, s * 0.88, 1.03, L)));
  parts.add(shared.plate, box(0.4, 0.12, 0.02, 0, 0.84, L + 0.005));
  for (const s of [1, -1]) {
    parts.add(shared.black, archGeo(0.5, s * 0.99, -1.7, 0.42));
    parts.add(shared.black, archGeo(0.5, s * 0.99, 1.75, 0.42));
  }
  addTrafficWheels(parts, 0.42, 0.27, [-1.7, 1.75], 0.9);
  return { parts, halfW: W, halfL: L, lamp: [0.76, 0.95, -L] };
}

function vanGeometry() {
  const parts = new Parts();
  const P = 'paint';
  const L = 2.75;
  parts.add(
    P,
    loft([
      { z: -L, bot: 0.4, top: 1.0, w: 0.8 },
      { z: -L + 0.14, bot: 0.3, top: 1.1, w: 0.95, topW: 0.88 },
      { z: -1.75, bot: 0.3, top: 1.32, w: 1.0, topW: 0.93 },
      { z: -0.9, bot: 0.3, top: 2.3, w: 1.0, topW: 0.9, exp: 6 },
      { z: L - 0.06, bot: 0.3, top: 2.34, w: 1.0, topW: 0.9, exp: 6 },
      { z: L, bot: 0.36, top: 2.24, w: 0.92 },
    ])
  );
  parts.add(shared.glass, beam([0, 1.34, -1.72], [0, 2.1, -1.0], 1.64, 0.05));
  parts.add(shared.glass, ...mirrorX((s) => box(0.02, 0.56, 0.8, s * 0.97, 1.62, -0.92)));
  parts.add(shared.black, box(1.1, 0.22, 0.05, 0, 0.72, -L + 0.02));
  parts.add(shared.head, ...mirrorX((s) => box(0.3, 0.2, 0.06, s * 0.72, 0.96, -L + 0.12)));
  parts.add(shared.tail, ...mirrorX((s) => box(0.1, 0.5, 0.04, s * 0.84, 1.1, L)));
  parts.add(shared.black, ...mirrorX((s) => box(0.55, 0.6, 0.02, s * 0.33, 1.72, L + 0.002)));
  parts.add(shared.plate, box(0.4, 0.12, 0.02, 0, 0.8, L));
  parts.add(shared.plastic, box(1.9, 0.18, 0.06, 0, 0.45, L - 0.02));
  for (const s of [1, -1]) {
    parts.add(shared.black, archGeo(0.45, s * 0.99, -1.72, 0.37));
    parts.add(shared.black, archGeo(0.45, s * 0.99, 1.72, 0.37));
  }
  addTrafficWheels(parts, 0.37, 0.24, [-1.72, 1.72], 0.91);
  return { parts, halfW: 1.0, halfL: L, lamp: [0.72, 0.96, -L + 0.06] };
}

function truckGeometry() {
  const parts = new Parts();
  const P = 'paint';
  const L = 7.6;
  // Cab.
  parts.add(
    P,
    loft(
      [
        { z: -L, bot: 0.7, top: 1.9, w: 1.05 },
        { z: -L + 0.2, bot: 0.55, top: 3.1, w: 1.22, topW: 1.1 },
        { z: -L + 2.7, bot: 0.55, top: 3.5, w: 1.25, topW: 1.14, exp: 8 },
        { z: -L + 2.9, bot: 0.55, top: 3.5, w: 1.2, exp: 8 },
      ],
      { exp: 5, segments: 16 }
    )
  );
  parts.add(shared.glass, beam([0, 2.0, -L + 0.09], [0, 2.95, -L + 0.5], 2.1, 0.05));
  parts.add(shared.glass, ...mirrorX((s) => box(0.02, 0.8, 0.9, s * 1.22, 2.4, -L + 1.1)));
  parts.add(shared.black, box(1.75, 0.8, 0.05, 0, 1.15, -L + 0.03));
  parts.add(shared.chrome, box(2.25, 0.22, 0.14, 0, 0.62, -L + 0.02));
  parts.add(shared.head, ...mirrorX((s) => box(0.4, 0.17, 0.06, s * 0.88, 0.94, -L + 0.05)));
  parts.add(shared.chrome, ...mirrorX((s) => box(0.08, 1.8, 0.08, s * 1.15, 3.6, -L + 2.9)));
  // Trailer.
  parts.add('trailer', box(2.5, 2.9, 11.6, 0, 2.55, L - 5.8));
  parts.add(shared.plastic, box(2.3, 0.3, 11.2, 0, 0.92, L - 5.8));
  parts.add(shared.tail, ...mirrorX((s) => box(0.3, 0.13, 0.04, s * 1.0, 1.12, L + 0.01)));
  parts.add(shared.plastic, box(2.2, 0.13, 0.08, 0, 0.72, L - 0.1));
  parts.add(shared.black, box(0.03, 2.8, 0.02, 0, 2.55, L + 0.005));
  const rims = [-L + 1.3, -L + 3.4, -L + 4.5, L - 2.5, L - 1.2];
  addTrafficWheels(parts, 0.52, 0.32, rims, 1.02);
  return { parts, halfW: 1.25, halfL: L, lamp: [0.88, 0.94, -L] };
}

function buildTemplate(def) {
  const { parts, halfW, halfL, lamp } = def.make();
  const merged = [];
  for (const [mat, geos] of parts.sets) merged.push([mat, merge(geos)]);
  return { merged, halfW, halfL, lamp, palette: def.palette, weight: def.weight, kind: def.kind };
}

const COLORS = [0xd9dbdc, 0xf0f0ee, 0x23262b, 0x7c1f24, 0x8d9096, 0x2d4b3b, 0xb28a3c, 0x5a6d85];

const TEMPLATE_DEFS = [
  {
    kind: 'sedan',
    weight: 4,
    palette: COLORS,
    make: () => roadCarGeometry({ len: 4.6, wid: 1.8, belt: 0.92, roof: 1.42, hoodLen: 1.25, tailLen: 0.95, wheelR: 0.32 }),
  },
  {
    kind: 'hatch',
    weight: 3,
    palette: [0xc9352b, 0xf0f0ee, 0x2e6f95, 0xd9a22b, 0x23262b],
    make: () => roadCarGeometry({ len: 4.05, wid: 1.76, belt: 0.95, roof: 1.5, hoodLen: 0.95, tailLen: 0.25, wheelR: 0.31 }),
  },
  {
    kind: 'crossover',
    weight: 3,
    palette: COLORS,
    make: () => roadCarGeometry({ len: 4.65, wid: 1.9, belt: 1.13, roof: 1.72, hoodLen: 1.1, tailLen: 0.25, wheelR: 0.36, bot: 0.27 }),
  },
  { kind: 'pickup', weight: 2, palette: [0x23262b, 0xf0f0ee, 0x7c1f24, 0x33506e, 0x8d9096], make: pickupGeometry },
  { kind: 'van', weight: 1, palette: [0xf0f0ee, 0xf0f0ee, 0x8d9096, 0x33506e], make: vanGeometry },
  { kind: 'truck', weight: 1.2, palette: [0xc4382d, 0x2a4f85, 0xf0f0ee, 0x2d4b3b], make: truckGeometry },
];

let templates = null;
const paintCache = new Map();
const trailerMat = new THREE.MeshStandardMaterial({ color: 0xdedfd9, roughness: 0.7, metalness: 0.1 });

function paintFor(color) {
  if (!paintCache.has(color)) paintCache.set(color, paint(color, { metalness: 0.65, roughness: 0.38 }));
  return paintCache.get(color);
}

function pickTemplate() {
  if (!templates) templates = TEMPLATE_DEFS.map(buildTemplate);
  const total = templates.reduce((sum, t) => sum + t.weight, 0);
  let r = Math.random() * total;
  for (const t of templates) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return templates[0];
}

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.22, '#f4f7ff');
  grad.addColorStop(0.5, '#59606e');
  grad.addColorStop(1, '#000000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let glowParts = null;

function getGlowParts() {
  if (!glowParts) {
    const material = new THREE.MeshBasicMaterial({
      map: makeGlowTexture(),
      color: new THREE.Color(1.6, 1.6, 1.6),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    glowParts = {
      flare: new THREE.PlaneGeometry(1, 1).rotateY(Math.PI), // faces the way the car points
      pool: new THREE.PlaneGeometry(4.6, 19).rotateX(-Math.PI / 2),
      material,
    };
  }
  return glowParts;
}

/** Adds hidden high-beam flares and a light pool on the road ahead of the car. */
function addHighBeams(group, lamp) {
  const { flare, pool, material } = getGlowParts();
  const [x, y, z] = lamp;
  const beams = new THREE.Group();
  beams.visible = false;
  const flares = [1, -1].map((s) => {
    const mesh = new THREE.Mesh(flare, material);
    mesh.position.set(s * x, y, z - 0.05);
    mesh.renderOrder = 7;
    beams.add(mesh);
    return mesh;
  });
  const ground = new THREE.Mesh(pool, material);
  ground.position.set(0, 0.07, z - 9);
  ground.renderOrder = 3;
  beams.add(ground);
  group.add(beams);
  group.userData.beams = beams;
  group.userData.flares = flares;
}

/** Turns high beams on or off. Flares grow with distance so they read from far away. */
export function setHighBeams(group, on, distance = 0) {
  group.userData.beams.visible = on;
  if (!on) return;
  const size = 4.2 + distance * 0.032;
  for (const flare of group.userData.flares) flare.scale.set(size, size, 1);
}

/** Creates a traffic vehicle. Geometry is shared, so these are cheap to add. */
export function buildTrafficCar() {
  const t = pickTemplate();
  const group = new THREE.Group();
  const color = t.palette[Math.floor(Math.random() * t.palette.length)];
  const paintMat = paintFor(color);
  group.userData.paintMeshes = [];
  for (const [mat, geo] of t.merged) {
    const material = mat === 'paint' ? paintMat : mat === 'trailer' ? trailerMat : mat;
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    if (mat === 'paint' || mat === 'trailer') group.userData.paintMeshes.push(mesh);
    group.add(mesh);
  }
  addHighBeams(group, t.lamp);
  return { group, halfW: t.halfW, halfL: t.halfL, kind: t.kind };
}

/** Blackens a traffic vehicle after a collision. */
export function charTrafficCar(group) {
  for (const mesh of group.userData.paintMeshes) mesh.material = shared.charred;
}

/** Applies the burned look to a player car in stages (t runs from 0 to 1). */
export function charPlayerCar(group, t) {
  const m = group.userData.paintMat;
  if (!group.userData.baseColor) group.userData.baseColor = m.color.clone();
  m.color.copy(group.userData.baseColor).lerp(shared.charred.color, t);
  m.metalness = 0.75 * (1 - t);
  m.roughness = 0.3 + 0.7 * t;
  group.userData.brakeMat.emissiveIntensity = 0;
}

/** Stable pseudo-random value per position, so shared vertices stay welded. */
function bump(x, y, z) {
  const v = Math.sin(Math.round(x * 14) * 12.9898 + Math.round(y * 14) * 78.233 + Math.round(z * 14) * 37.719) * 43758.5453;
  return v - Math.floor(v) - 0.5;
}

/** Crushes the front of a player car and buckles its roof. The geometry is unique to this car. */
export function crumpleCar(group, halfL) {
  const start = -halfL * 0.3; // the crush fades out toward the middle of the car
  for (const mesh of group.children) {
    if (!mesh.isMesh) continue;
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const t = Math.max(0, Math.min(1, (start - z) / (halfL + start)));
      const hit = t * t * (3 - 2 * t);
      const noise = bump(x, y, z);
      const noise2 = bump(z, x, y);
      const roof = y > 1 && z < halfL * 0.6 ? 0.1 * (0.5 + noise) : 0;
      pos.setXYZ(
        i,
        x * (1 + hit * 0.08) + hit * noise2 * 0.2,
        y + hit * (noise * 0.28 + Math.max(0, 0.9 - y) * 0.1) - roof,
        z + hit * (0.62 + noise2 * 0.2)
      );
    }
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingSphere();
  }
}
