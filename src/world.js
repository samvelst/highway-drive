// Sky, lighting, road and scenery. The player stays at z = 0 and the world
// moves past, which keeps positions precise however far you drive.
import * as THREE from 'three/webgpu';
import { FOG_FAR, FOG_NEAR, LANE_WIDTH, MEDIAN_HALF, RAIL_X, ROAD_EDGE, SHOULDER_EDGE } from './config.js';
import { box, merge, tint } from './geometry.js';

const TILE = 24; // the road texture and rail posts repeat at this length
const ROAD_AHEAD = TILE * 42;
const ROAD_BEHIND = TILE * 6;
const HORIZON = 0xdcdcd2;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function makeSky() {
  const [c, g] = canvas(2048, 1024);
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#1f5fae');
  grad.addColorStop(0.5, '#4a8fd6');
  grad.addColorStop(0.82, '#8fc0e6');
  grad.addColorStop(0.95, '#cfe0e6');
  grad.addColorStop(1, '#e3dccf');
  g.fillStyle = grad;
  g.fillRect(0, 0, 2048, 512);
  g.fillStyle = '#7d7f73';
  g.fillRect(0, 512, 2048, 512);
  // Sun glow.
  const sunX = 1320;
  const sunY = 250;
  const glow = g.createRadialGradient(sunX, sunY, 4, sunX, sunY, 300);
  glow.addColorStop(0, 'rgba(255,250,230,1)');
  glow.addColorStop(0.05, 'rgba(255,240,200,.9)');
  glow.addColorStop(0.3, 'rgba(255,225,170,.28)');
  glow.addColorStop(1, 'rgba(255,220,170,0)');
  g.fillStyle = glow;
  g.fillRect(sunX - 300, sunY - 300, 600, 600);
  // Soft clouds built from clustered radial puffs.
  for (let i = 0; i < 46; i++) {
    const cx = Math.random() * 2048;
    const cy = 170 + Math.random() * 290;
    const scale = 0.5 + (cy / 460) * 0.9;
    const puffs = 7 + Math.floor(Math.random() * 12);
    for (let p = 0; p < puffs; p++) {
      const x = cx + (Math.random() - 0.5) * 210 * scale;
      const y = cy + (Math.random() - 0.5) * 20 * scale;
      const r = (14 + Math.random() * 38) * scale;
      const pg = g.createRadialGradient(x, y, 0, x, y, r);
      pg.addColorStop(0, 'rgba(255,252,246,.42)');
      pg.addColorStop(1, 'rgba(255,252,246,0)');
      g.fillStyle = pg;
      g.save();
      g.translate(x, y);
      g.scale(1.9, 0.62);
      g.translate(-x, -y);
      g.fillRect(x - r, y - r, r * 2, r * 2);
      g.restore();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRoadTexture() {
  const size = 2048;
  const [c, g] = canvas(size, size);
  const halfWidth = RAIL_X + 0.1;
  const toPx = (x) => ((x + halfWidth) / (halfWidth * 2)) * size;
  const perM = size / (halfWidth * 2);
  const zPerM = size / TILE;

  // Gravel shoulders.
  g.fillStyle = '#7a756b';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 90000; i++) {
    const shade = 80 + Math.random() * 90;
    g.fillStyle = `rgba(${shade},${shade * 0.96},${shade * 0.88},.5)`;
    g.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  // Asphalt.
  const edgeL = toPx(-ROAD_EDGE - 0.25);
  const edgeR = toPx(ROAD_EDGE + 0.25);
  g.fillStyle = '#3a3b3e';
  g.fillRect(edgeL, 0, edgeR - edgeL, size);
  for (let i = 0; i < 170000; i++) {
    const shade = 38 + Math.random() * 46;
    g.fillStyle = `rgba(${shade},${shade},${shade + 2},.55)`;
    g.fillRect(edgeL + Math.random() * (edgeR - edgeL), Math.random() * size, 1.6, 1.6);
  }
  // Worn wheel tracks within each lane.
  for (const side of [1, -1]) {
    for (let lane = 0; lane < 3; lane++) {
      const center = side * (MEDIAN_HALF + (lane + 0.5) * LANE_WIDTH);
      for (const off of [-0.8, 0.8]) {
        const x = toPx(center + off);
        const w = 0.55 * perM;
        const grad = g.createLinearGradient(x - w, 0, x + w, 0);
        grad.addColorStop(0, 'rgba(16,16,18,0)');
        grad.addColorStop(0.5, 'rgba(16,16,18,.3)');
        grad.addColorStop(1, 'rgba(16,16,18,0)');
        g.fillStyle = grad;
        g.fillRect(x - w, 0, w * 2, size);
      }
    }
  }
  // Tar repairs for a little irregularity.
  g.strokeStyle = 'rgba(14,14,15,.55)';
  g.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    let x = edgeL + Math.random() * (edgeR - edgeL);
    let y = Math.random() * size;
    g.lineWidth = 1.5 + Math.random() * 2.5;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (Math.random() - 0.5) * 60;
      y += Math.random() * 110;
      g.lineTo(x, y);
    }
    g.stroke();
  }

  const line = (x, width, color) => {
    g.fillStyle = color;
    g.fillRect(toPx(x) - (width * perM) / 2, 0, width * perM, size);
  };
  // Solid edge lines and double yellow center.
  line(ROAD_EDGE, 0.16, '#e6e4dc');
  line(-ROAD_EDGE, 0.16, '#e6e4dc');
  line(0.17, 0.13, '#d9a521');
  line(-0.17, 0.13, '#d9a521');
  // Dashed lane dividers: 3 m on, 9 m off.
  for (const side of [1, -1]) {
    for (let lane = 1; lane < 3; lane++) {
      const x = side * (MEDIAN_HALF + lane * LANE_WIDTH);
      for (let z = 0; z < TILE; z += 12) {
        g.fillStyle = '#e6e4dc';
        g.fillRect(toPx(x) - 0.07 * perM, z * zPerM, 0.14 * perM, 3 * zPerM);
      }
    }
  }
  // Rumble strips along each shoulder.
  g.fillStyle = 'rgba(15,15,15,.45)';
  for (const side of [1, -1]) {
    const x = toPx(side * (ROAD_EDGE + 0.5));
    for (let z = 0; z < size; z += 0.6 * zPerM) {
      g.fillRect(x - 0.17 * perM, z, 0.34 * perM, 0.22 * zPerM);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, (ROAD_AHEAD + ROAD_BEHIND) / TILE);
  tex.anisotropy = 16;
  return tex;
}

function makeGrassTexture() {
  const size = 1024;
  const [c, g] = canvas(size, size);
  g.fillStyle = '#6b7d3f';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 130; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 30 + Math.random() * 120;
    const colors = ['126,140,70', '88,108,50', '148,142,76', '76,98,48'];
    const col = colors[Math.floor(Math.random() * colors.length)];
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${col},.42)`);
    grad.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grad;
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        g.setTransform(1, 0, 0, 1, dx, dy);
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < 40000; i++) {
    const v = Math.random();
    g.fillStyle = v > 0.5 ? 'rgba(160,172,90,.28)' : 'rgba(46,62,28,.3)';
    g.fillRect(Math.random() * size, Math.random() * size, 1.5, 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function coneTree(height, radius, color) {
  const trunkH = height * 0.2;
  const parts = [tint(new THREE.CylinderGeometry(radius * 0.13, radius * 0.17, trunkH, 6).translate(0, trunkH / 2, 0), 0x4d3a2a)];
  const c = new THREE.Color(color);
  for (let i = 0; i < 3; i++) {
    const h = height * (0.52 - i * 0.07);
    const r = radius * (1 - i * 0.26);
    const y = trunkH * 0.7 + i * height * 0.24;
    const shade = c.clone().multiplyScalar(0.84 + i * 0.13);
    parts.push(tint(new THREE.ConeGeometry(r, h, 9).translate(0, y + h / 2, 0), shade));
  }
  return merge(parts);
}

function roundTree(height, radius, color) {
  const trunkH = height * 0.42;
  const parts = [tint(new THREE.CylinderGeometry(radius * 0.11, radius * 0.17, trunkH, 6).translate(0, trunkH / 2, 0), 0x57432f)];
  const c = new THREE.Color(color);
  const blobs = [
    [0, height * 0.66, 0, radius],
    [radius * 0.48, height * 0.58, radius * 0.18, radius * 0.66],
    [-radius * 0.44, height * 0.6, -radius * 0.24, radius * 0.72],
    [radius * 0.05, height * 0.84, -radius * 0.1, radius * 0.62],
  ];
  blobs.forEach(([x, y, z, r], i) => {
    const geo = new THREE.IcosahedronGeometry(r, 1);
    geo.translate(x, y, z);
    parts.push(tint(geo, c.clone().multiplyScalar(0.88 + i * 0.07)));
  });
  return merge(parts);
}

function bushGeo() {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  geo.scale(1.25, 0.8, 1.1);
  geo.translate(0, 0.48, 0);
  return merge([tint(geo, 0x5e7036)]);
}

function rockGeo() {
  const geo = new THREE.DodecahedronGeometry(1, 0);
  geo.scale(1.3, 0.72, 1);
  geo.translate(0, 0.3, 0);
  return merge([tint(geo, 0x8a8880)]);
}

function textSign(w, h, draw) {
  const [c, g] = canvas(w, h);
  draw(g, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const steel = new THREE.MeshStandardMaterial({ color: 0x8b9095, roughness: 0.5, metalness: 0.7 });

function makeGantry() {
  const group = new THREE.Group();
  const tex = textSign(1024, 256, (g, w, h) => {
    g.fillStyle = '#0f5a38';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#eef3ee';
    g.lineWidth = 8;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#eef3ee';
    g.textBaseline = 'middle';
    g.font = '700 84px "Avenir Next", Arial, sans-serif';
    g.fillText('Pine Valley', 54, 88);
    g.font = '600 62px "Avenir Next", Arial, sans-serif';
    g.fillText('Exit 41 · 2 km', 54, 176);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  sign.position.set(6, 7.2, 0.14);
  sign.castShadow = true;
  group.add(sign);
  const frame = merge([
    box(0.3, 8.6, 0.3, -RAIL_X - 0.6, 4.3, 0),
    box(0.3, 8.6, 0.3, RAIL_X + 0.6, 4.3, 0),
    box(RAIL_X * 2 + 1.5, 0.22, 0.22, 0, 8.45, 0),
    box(RAIL_X * 2 + 1.5, 0.22, 0.22, 0, 6.3, 0),
  ]);
  const mesh = new THREE.Mesh(frame, steel);
  mesh.castShadow = true;
  group.add(mesh);
  return group;
}

function makeOverpass() {
  const concrete = new THREE.MeshStandardMaterial({ color: 0xa8a59c, roughness: 0.9 });
  const span = 90;
  const geo = merge([
    box(span, 0.9, 10, 0, 7.4, 0),
    box(span, 0.75, 0.3, 0, 8.2, 4.85),
    box(span, 0.75, 0.3, 0, 8.2, -4.85),
    box(1.2, 7.2, 8, RAIL_X + 2, 3.6, 0),
    box(1.2, 7.2, 8, -RAIL_X - 2, 3.6, 0),
  ]);
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(geo, concrete);
  mesh.castShadow = true;
  group.add(mesh);
  return group;
}

const BILLBOARDS = [
  ['#f3b82b', '#20180a', 'SUNNY DINER', 'Pie at the next exit'],
  ['#1f6f8b', '#ffffff', 'BLUE LAKE', 'Camping and cabins'],
  ['#b5392e', '#fff3e0', 'MOTEL 88', 'Clean beds, free coffee'],
];

function makeBillboard(i) {
  const [bg, fg, title, sub] = BILLBOARDS[i % BILLBOARDS.length];
  const tex = textSign(1024, 400, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '800 124px "Avenir Next", Arial, sans-serif';
    g.fillText(title, w / 2, h * 0.4);
    g.font = '600 56px "Avenir Next", Arial, sans-serif';
    g.fillText(sub, w / 2, h * 0.74);
  });
  const group = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(12, 4.7), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  face.position.set(0, 7.5, 0.16);
  group.add(face);
  const back = merge([box(12.2, 4.9, 0.2, 0, 7.5, 0), box(0.4, 6, 0.4, -4, 2.8, -0.2), box(0.4, 6, 0.4, 4, 2.8, -0.2)]);
  const mesh = new THREE.Mesh(back, steel);
  mesh.castShadow = true;
  group.add(mesh);
  return group;
}

function makeMountains(scene) {
  const rng = (a, b) => a + Math.random() * (b - a);
  const list = [];
  for (let i = 0; i < 26; i++) {
    const near = i % 2 === 0;
    const h = near ? rng(70, 150) : rng(140, 280);
    const r = h * rng(1.5, 2.3);
    const geo = new THREE.ConeGeometry(r, h, 7 + (i % 3));
    geo.rotateY(Math.random() * 6);
    const dist = near ? rng(1250, 1450) : rng(1500, 1900);
    const side = (i / 26 - 0.5) * 2;
    geo.translate(side * 2100 + rng(-40, 40), h / 2 - 4, -dist);
    const shade = near ? 0x7f94a6 : 0x9fb1bf;
    list.push(tint(geo, new THREE.Color(shade).multiplyScalar(rng(0.92, 1.06))));
  }
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const mesh = new THREE.Mesh(merge(list), material);
  scene.add(mesh);
}

export class World {
  constructor(scene) {
    this.scene = scene;
    const sky = makeSky();
    scene.background = sky;
    scene.environment = sky;
    scene.environmentIntensity = 0.7;
    scene.fog = new THREE.Fog(HORIZON, FOG_NEAR, FOG_FAR);

    const sun = new THREE.DirectionalLight(0xfff0dc, 3.1);
    sun.position.set(38, 70, -44);
    sun.target.position.set(0, 0, -16);
    sun.castShadow = true;
    const shadowSize = matchMedia('(pointer: coarse)').matches ? 1024 : 2048;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    Object.assign(sun.shadow.camera, { left: -62, right: 62, top: 88, bottom: -60, near: 10, far: 240 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
    scene.add(new THREE.HemisphereLight(0xcfe2f4, 0x60613f, 0.55));

    makeMountains(scene);

    // Everything in this group loops every TILE metres.
    this.tiled = new THREE.Group();
    scene.add(this.tiled);
    const len = ROAD_AHEAD + ROAD_BEHIND;
    const centerZ = (ROAD_BEHIND - ROAD_AHEAD) / 2;

    const road = new THREE.Mesh(
      new THREE.PlaneGeometry((RAIL_X + 0.1) * 2, len).rotateX(-Math.PI / 2).translate(0, 0, centerZ),
      new THREE.MeshStandardMaterial({ map: makeRoadTexture(), roughness: 0.93 })
    );
    road.receiveShadow = true;
    this.tiled.add(road);

    const grassTex = makeGrassTexture();
    grassTex.repeat.set(2000 / TILE, len / TILE);
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, len).rotateX(-Math.PI / 2).translate(0, -0.03, centerZ),
      new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 })
    );
    grass.receiveShadow = true;
    this.tiled.add(grass);

    // Guardrails: a long static rail plus repeating posts.
    const railMat = new THREE.MeshStandardMaterial({ color: 0xa9adb0, roughness: 0.42, metalness: 0.75 });
    const rails = new THREE.Mesh(
      merge([
        box(0.08, 0.3, len, RAIL_X, 0.72, centerZ),
        box(0.08, 0.3, len, -RAIL_X, 0.72, centerZ),
      ]),
      railMat
    );
    rails.castShadow = true;
    scene.add(rails);
    const postGeo = box(0.12, 0.8, 0.12, 0, 0.4, 0);
    const postCount = Math.ceil(len / 4) * 2;
    const posts = new THREE.InstancedMesh(postGeo, steel, postCount);
    const m = new THREE.Matrix4();
    let idx = 0;
    for (let z = -ROAD_AHEAD; z < ROAD_BEHIND && idx < postCount - 1; z += 4) {
      m.makeTranslation(RAIL_X + 0.06, 0, z);
      posts.setMatrixAt(idx++, m);
      m.makeTranslation(-RAIL_X - 0.06, 0, z);
      posts.setMatrixAt(idx++, m);
    }
    posts.count = idx;
    posts.castShadow = true;
    posts.frustumCulled = false;
    this.tiled.add(posts);

    this.buildScenery();

    // Large landmarks each sit at their own distance along the road.
    this.landmarks = [
      { obj: makeOverpass(), s: 820, every: [1100, 1900] },
      { obj: makeGantry(), s: 420, every: [900, 1500] },
      ...[0, 1, 2].map((i) => {
        const obj = makeBillboard(i);
        const side = i % 2 === 0 ? 1 : -1;
        obj.position.x = side * (RAIL_X + 11);
        obj.rotation.y = side * -0.25;
        return { obj, s: 240 + i * 520, every: [900, 1700] };
      }),
    ];
    for (const lm of this.landmarks) scene.add(lm.obj);
  }

  buildScenery() {
    const materials = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    const types = [
      { geo: coneTree(15, 4, 0x2f5a35), count: 13, min: 8, spread: 150, scale: [0.7, 1.45], shadow: true },
      { geo: coneTree(11, 3.2, 0x3c6a3a), count: 9, min: 6, spread: 120, scale: [0.7, 1.3], shadow: true },
      { geo: roundTree(11, 3.6, 0x5c7f3c), count: 10, min: 7, spread: 130, scale: [0.7, 1.35], shadow: true },
      { geo: bushGeo(), count: 16, min: 2.5, spread: 55, scale: [0.6, 1.7], shadow: false },
      { geo: rockGeo(), count: 5, min: 1.8, spread: 50, scale: [0.45, 1.5], shadow: false },
    ];
    this.chunkLength = 80;
    this.chunks = [];
    const chunkCount = 15;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let c = 0; c < chunkCount; c++) {
      const group = new THREE.Group();
      for (const t of types) {
        const mesh = new THREE.InstancedMesh(t.geo, materials, t.count);
        for (let i = 0; i < t.count; i++) {
          const side = Math.random() < 0.5 ? 1 : -1;
          const offset = t.min + Math.pow(Math.random(), 1.5) * t.spread;
          dummy.position.set(side * (RAIL_X + offset), 0, -Math.random() * this.chunkLength);
          dummy.rotation.y = Math.random() * 6.28;
          dummy.scale.setScalar(t.scale[0] + Math.random() * (t.scale[1] - t.scale[0]));
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          mesh.setColorAt(i, color.setScalar(0.82 + Math.random() * 0.36));
        }
        mesh.castShadow = t.shadow;
        mesh.frustumCulled = false;
        group.add(mesh);
      }
      this.scene.add(group);
      this.chunks.push({ group, index: c - 2 });
    }
  }

  update(s) {
    this.tiled.position.z = s % TILE;

    for (const chunk of this.chunks) {
      // Chunks behind the camera hop to the far end of the loop.
      while (chunk.index * this.chunkLength + this.chunkLength < s - 80) chunk.index += this.chunks.length;
      chunk.group.position.z = -(chunk.index * this.chunkLength - s);
    }

    for (const lm of this.landmarks) {
      if (lm.s - s < -60) lm.s = s + FOG_FAR + 80 + lm.every[0] + Math.random() * (lm.every[1] - lm.every[0]);
      lm.obj.position.z = -(lm.s - s);
      lm.obj.visible = lm.s - s < FOG_FAR + 60;
    }
  }
}
