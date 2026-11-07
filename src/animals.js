// Dogs, cats and wolves that wander across the highway.
import * as THREE from 'three/webgpu';
import { ANIMAL_CHANCES, RAIL_X, ROAD_EDGE, sweepOverlaps } from './config.js';

const mat = (color, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness });
const eyeMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.2 });

const SPECIES = {
  dog: {
    coat: 0xc98d45,
    dark: 0x9c6831,
    belly: 0xe6c79a,
    len: 0.62,
    tall: 0.52,
    girth: 0.17,
    legLen: 0.31,
    headR: 0.13,
    snout: 0.13,
    earType: 'floppy',
    tail: [0.34, 0.035, 0.7],
    speed: 4.2,
    scale: 1.55,
  },
  cat: {
    coat: 0xe58a2e,
    dark: 0xb5641c,
    belly: 0xf6e3c8,
    len: 0.4,
    tall: 0.3,
    girth: 0.1,
    legLen: 0.19,
    headR: 0.092,
    snout: 0.035,
    earType: 'pointy',
    tail: [0.34, 0.019, 1.25],
    speed: 5.2,
    scale: 1.9,
  },
  wolf: {
    coat: 0x777a7d,
    dark: 0x45474a,
    belly: 0xc6c6c2,
    len: 0.92,
    tall: 0.72,
    girth: 0.2,
    legLen: 0.44,
    headR: 0.145,
    snout: 0.2,
    earType: 'wolf',
    tail: [0.5, 0.07, 0.4],
    speed: 5,
    scale: 1.5,
  },
  penguin: {
    len: 0.44,
    speed: 2.9,
    scale: 1.75,
  },
};

function part(geo, material, x, y, z, parent) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function buildPenguin() {
  const sp = SPECIES.penguin;
  const root = new THREE.Group();
  const model = new THREE.Group();
  root.add(model);
  const coat = mat(0x14171d, 0.5);
  const front = mat(0xf3f3ee, 0.65);
  const orange = mat(0xf0941d, 0.6);

  part(new THREE.CapsuleGeometry(0.2, 0.34, 6, 14), coat, 0, 0.42, 0, model);
  const belly = part(new THREE.SphereGeometry(0.175, 12, 10), front, 0, 0.39, -0.055, model);
  belly.scale.set(0.98, 1.72, 0.88);

  const head = new THREE.Group();
  head.position.set(0, 0.76, 0);
  model.add(head);
  part(new THREE.SphereGeometry(0.15, 12, 10), coat, 0, 0, 0, head);
  const face = part(new THREE.SphereGeometry(0.1, 10, 8), front, 0, -0.025, -0.075, head);
  face.scale.set(1.05, 0.9, 0.8);
  const beak = part(new THREE.ConeGeometry(0.045, 0.13, 7), orange, 0, -0.025, -0.185, head);
  beak.rotation.x = -Math.PI / 2;
  for (const s of [1, -1]) {
    part(new THREE.SphereGeometry(0.022, 6, 5), eyeMat, s * 0.062, 0.04, -0.13, head);
  }

  // Feet come first, then flippers, so the shared gait swings them in opposition.
  const legs = [];
  for (const s of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.1, 0.1, 0);
    const foot = part(new THREE.BoxGeometry(0.11, 0.035, 0.19), orange, 0, -0.08, -0.05, pivot);
    foot.rotation.y = s * 0.2;
    model.add(pivot);
    legs.push(pivot);
  }
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.21, 0.62, 0);
    const flipper = part(new THREE.CapsuleGeometry(0.035, 0.27, 3, 7), coat, s * 0.025, -0.16, 0, pivot);
    flipper.scale.z = 1.7;
    flipper.rotation.z = s * 0.14;
    model.add(pivot);
    legs.push(pivot);
  }

  const tail = new THREE.Group();
  tail.position.set(0, 0.13, 0.16);
  const tailTip = part(new THREE.ConeGeometry(0.07, 0.14, 5), coat, 0, 0, 0.03, tail);
  tailTip.rotation.x = 2.2;
  model.add(tail);

  root.scale.setScalar(sp.scale);
  return { root, model, legs, tail, head, sp };
}

function buildAnimal(kind) {
  if (kind === 'penguin') return buildPenguin();
  const sp = SPECIES[kind];
  const root = new THREE.Group();
  const model = new THREE.Group();
  root.add(model);
  const coat = mat(sp.coat);
  const dark = mat(sp.dark);
  const belly = mat(sp.belly);

  // Body faces -Z.
  const bodyY = sp.tall - sp.girth * 0.9;
  const body = part(new THREE.CapsuleGeometry(sp.girth, sp.len, 6, 12), coat, 0, bodyY, 0, model);
  body.rotation.x = Math.PI / 2;
  const under = part(new THREE.CapsuleGeometry(sp.girth * 0.82, sp.len * 0.8, 5, 10), belly, 0, bodyY - sp.girth * 0.3, 0, model);
  under.rotation.x = Math.PI / 2;
  if (kind === 'wolf') {
    // Thick dark ruff across the shoulders and a dark saddle.
    part(new THREE.SphereGeometry(sp.girth * 1.32, 10, 8), dark, 0, bodyY + 0.04, -sp.len * 0.36, model);
    const saddle = part(new THREE.CapsuleGeometry(sp.girth * 0.8, sp.len * 0.5, 4, 8), dark, 0, bodyY + sp.girth * 0.35, sp.len * 0.1, model);
    saddle.rotation.x = Math.PI / 2;
  }
  if (kind === 'cat') {
    // Tabby stripes.
    for (let i = -2; i <= 2; i++) {
      const stripe = part(new THREE.TorusGeometry(sp.girth * 1.02, 0.013, 5, 14, Math.PI), dark, 0, bodyY, i * sp.len * 0.17, model);
      stripe.rotation.y = 0;
    }
  }

  // Head.
  const head = new THREE.Group();
  head.position.set(0, sp.tall + sp.headR * (kind === 'wolf' ? 0.1 : 0.45), -(sp.len / 2 + sp.girth * 0.9));
  model.add(head);
  part(new THREE.SphereGeometry(sp.headR, 12, 10), coat, 0, 0, 0, head);
  if (sp.snout > 0.05) {
    const snout = part(new THREE.CapsuleGeometry(sp.headR * 0.5, sp.snout, 4, 8), kind === 'wolf' ? belly : belly, 0, -sp.headR * 0.22, -sp.headR - sp.snout * 0.25, head);
    snout.rotation.x = Math.PI / 2;
    part(new THREE.SphereGeometry(sp.headR * 0.2, 6, 5), eyeMat, 0, -sp.headR * 0.12, -sp.headR - sp.snout * 0.92, head);
  } else {
    part(new THREE.SphereGeometry(sp.headR * 0.42, 8, 6), belly, 0, -sp.headR * 0.32, -sp.headR * 0.78, head);
    part(new THREE.SphereGeometry(sp.headR * 0.13, 5, 4), mat(0xd77f86), 0, -sp.headR * 0.14, -sp.headR * 1.1, head);
  }
  for (const s of [1, -1]) {
    part(new THREE.SphereGeometry(sp.headR * 0.17, 6, 5), eyeMat, s * sp.headR * 0.52, sp.headR * 0.24, -sp.headR * 0.8, head);
    if (sp.earType === 'floppy') {
      const ear = part(new THREE.CapsuleGeometry(sp.headR * 0.27, sp.headR * 0.65, 4, 8), dark, s * sp.headR * 0.92, sp.headR * 0.08, 0, head);
      ear.rotation.z = s * 0.2;
    } else {
      const tall = sp.earType === 'wolf' ? 1.0 : 1.05;
      const ear = part(new THREE.ConeGeometry(sp.headR * 0.38, sp.headR * tall, 5), kind === 'wolf' ? dark : coat, s * sp.headR * 0.58, sp.headR * 1.13, 0, head);
      ear.rotation.z = -s * 0.2;
    }
  }

  // Legs swing from pivots at the hip.
  const legs = [];
  const legGeo = new THREE.CapsuleGeometry(sp.girth * (kind === 'cat' ? 0.3 : 0.27), sp.legLen * 0.72, 3, 7);
  for (const z of [-sp.len * 0.46, sp.len * 0.46]) {
    for (const s of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * sp.girth * 0.6, sp.legLen, z);
      part(legGeo, kind === 'wolf' ? dark : coat, 0, -sp.legLen / 2, 0, pivot);
      model.add(pivot);
      legs.push(pivot);
    }
  }

  // Tail.
  const tail = new THREE.Group();
  tail.position.set(0, bodyY + sp.girth * 0.45, sp.len / 2 + sp.girth * 0.8);
  tail.rotation.x = sp.tail[2];
  part(new THREE.CapsuleGeometry(sp.tail[1], sp.tail[0], 4, 8), kind === 'wolf' ? dark : coat, 0, sp.tail[0] / 2, 0, tail);
  model.add(tail);

  root.scale.setScalar(sp.scale);
  return { root, model, legs, tail, head, sp };
}

const rand = (a, b) => a + Math.random() * (b - a);

export class Animals {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.pool = { dog: [], cat: [], wolf: [], penguin: [] };
    this.timer = 3.5;
  }

  acquire(kind) {
    return this.pool[kind].pop() ?? buildAnimal(kind);
  }

  clear() {
    for (const a of this.list) this.release(a);
    this.list.length = 0;
    this.timer = 3.5;
  }

  clearAround(playerS, back, front) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i].s - playerS;
      if (d > -back && d < front) {
        this.release(this.list[i]);
        this.list.splice(i, 1);
      }
    }
  }

  release(a) {
    this.scene.remove(a.root);
    a.model.rotation.set(0, 0, 0);
    a.root.position.y = 0;
    this.pool[a.kind].push(a);
  }

  /** Spawns one animal, timed to be on the road when the player gets there. */
  spawn(kind, playerS, playerX, playerSpeed) {
    const a = this.acquire(kind);
    const side = Math.random() < 0.5 ? 1 : -1;
    const startX = side * (RAIL_X + rand(2, 4));
    const dir = -side;
    const speed = a.sp.speed * rand(0.9, 1.15);
    // Aim for a point near the player's current line.
    const aimX = playerX + rand(-3.5, 3.5);
    const walk = Math.max(0, (aimX - startX) * dir);
    const lead = Math.min(1800, Math.max(95, (walk / speed) * playerSpeed));
    Object.assign(a, {
      kind,
      alive: true,
      s: playerS + lead,
      x: startX,
      dir,
      speed,
      phase: Math.random() * 6,
      pauseAt: Math.random() < 0.3 ? dir * rand(-ROAD_EDGE * 0.6, ROAD_EDGE * 0.6) : null,
      pauseTime: rand(0.6, 1.2),
      blocked: false,
      flying: false,
    });
    a.root.position.set(startX, 0, -lead);
    a.root.rotation.y = -dir * Math.PI * 0.5;
    this.scene.add(a.root);
    this.list.push(a);
  }

  pickKind() {
    let r = Math.random();
    for (const [kind, chance] of Object.entries(ANIMAL_CHANCES)) {
      r -= chance;
      if (r < 0) return kind;
    }
    return 'dog';
  }

  update(dt, { playerS, playerX, playerSpeed, spawning, traffic }) {
    if (spawning) {
      this.timer -= dt;
      if (this.timer <= 0 && this.list.length < 8) {
        this.spawn(this.pickKind(), playerS, playerX, playerSpeed);
        // Faster driving covers more road, so animals appear more often.
        this.timer = rand(4, 9) / (1 + playerSpeed / 120);
      }
    }

    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];
      if (a.flying) {
        a.vy -= 20 * dt;
        a.root.position.y = Math.max(0, a.root.position.y + a.vy * dt);
        a.s += a.vs * dt;
        a.x += a.vx * dt;
        a.model.rotation.x += a.spin * dt;
        a.model.rotation.z += a.spin * 0.6 * dt;
        a.flightTime -= dt;
        const shrink = Math.min(1, Math.max(0, a.flightTime / 0.35));
        a.root.scale.setScalar(a.sp.scale * shrink);
        a.root.position.x = a.x;
        a.root.position.z = -(a.s - playerS);
        if (a.flightTime <= 0) {
          a.root.scale.setScalar(a.sp.scale);
          this.release(a);
          this.list.splice(i, 1);
        }
        continue;
      }

      let moving = true;
      if (a.pauseAt !== null && (a.x - a.pauseAt) * a.dir > 0) {
        a.pauseTime -= dt;
        moving = false;
        if (a.pauseTime <= 0) a.pauseAt = null;
      }
      // Wait at the lane edge for moving traffic, as long as it is not on the road already.
      if (moving) {
        const nextX = a.x + a.dir * 2.4;
        for (const car of traffic.cars) {
          if (car.speed < 5 || car.wrecked) continue;
          if (Math.abs(car.x - nextX) > 1.9 || Math.abs(car.x - a.x) < 1.9) continue;
          const closing = (a.s - car.s) * car.dir;
          if (closing > -car.halfL - 2 && closing < car.speed * 1.0 + car.halfL) {
            moving = false;
            break;
          }
        }
      }
      if (moving) {
        a.x += a.dir * a.speed * dt;
        a.phase += dt * a.speed * 3.2;
      } else {
        a.phase += dt * 1.4;
      }
      const amp = moving ? 0.72 : 0.03;
      a.legs[0].rotation.x = Math.sin(a.phase) * amp;
      a.legs[3].rotation.x = Math.sin(a.phase) * amp;
      a.legs[1].rotation.x = Math.sin(a.phase + Math.PI) * amp;
      a.legs[2].rotation.x = Math.sin(a.phase + Math.PI) * amp;
      a.model.position.y = moving ? Math.abs(Math.sin(a.phase)) * 0.03 : 0;
      if (a.kind === 'penguin') a.model.rotation.z = moving ? Math.sin(a.phase) * 0.17 : 0;
      a.tail.rotation.z = Math.sin(a.phase * 1.3) * (a.kind === 'dog' ? 0.55 : 0.2);
      a.head.rotation.y = moving ? 0 : Math.sin(a.phase) * 0.7 * a.dir;

      a.root.position.x = a.x;
      a.root.position.z = -(a.s - playerS);

      const offRoad = a.dir > 0 ? a.x > RAIL_X + 5 : a.x < -RAIL_X - 5;
      if (offRoad || a.s - playerS < -30) {
        this.release(a);
        this.list.splice(i, 1);
      }
    }
  }

  /** Returns the animal reached during this frame's travel, if any. */
  hit(playerX, fromS, toS, halfW, halfL) {
    for (const a of this.list) {
      if (a.flying) continue;
      const reach = a.sp.len * a.sp.scale * 0.5 + 0.08;
      if (Math.abs(a.x - playerX) >= halfW + reach) continue;
      if (sweepOverlaps(a.s, 0.5, fromS, toS, halfL)) return a;
    }
    return null;
  }

  knock(a, playerSpeed, playerVx) {
    a.alive = false;
    a.flying = true;
    a.vy = 8 + Math.min(4, playerSpeed * 0.08);
    a.vs = playerSpeed * 0.9;
    a.vx = playerVx * 0.4 + (a.x > 0 ? 3 : -3);
    a.spin = 9;
    a.flightTime = 0.95;
  }
}
