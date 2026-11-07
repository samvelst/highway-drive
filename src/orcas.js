// Orcas that fall out of the sky. A shadow on the road marks where each will land.
import * as THREE from 'three/webgpu';
import { SHOULDER_EDGE, sweepOverlaps } from './config.js';
import { loft, merge } from './geometry.js';

const GRAVITY = 24;
const FALL_TIME = 2.5;
const START_Y = 0.5 * GRAVITY * FALL_TIME * FALL_TIME;
const REST_Y = 0.95;
const GROUND_TIME = 1.7;
const HALF_LENGTH = 2.6;
const HALF_WIDTH = 0.95;
const STRIKE_HEIGHT = 2.9; // the orca's center must be this low to touch a car

const black = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.28, metalness: 0.1 });
const white = new THREE.MeshStandardMaterial({ color: 0xf1f2ee, roughness: 0.4 });

function ellipsoid(rx, ry, rz, x, y, z) {
  const g = new THREE.SphereGeometry(1, 14, 10);
  g.scale(rx, ry, rz);
  g.translate(x, y, z);
  return g;
}

function fin(points, width) {
  const shape = new THREE.Shape();
  points.forEach(([z, y], i) => (i === 0 ? shape.moveTo(z, y) : shape.lineTo(z, y)));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  g.translate(0, 0, -width / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

function buildOrca() {
  const group = new THREE.Group();
  const stations = [
    { z: -2.75, bot: -0.08, top: 0.1, w: 0.1 },
    { z: -2.55, bot: -0.3, top: 0.32, w: 0.42 },
    { z: -1.9, bot: -0.62, top: 0.62, w: 0.72 },
    { z: -0.9, bot: -0.84, top: 0.84, w: 0.92 },
    { z: 0.2, bot: -0.82, top: 0.82, w: 0.88 },
    { z: 1.2, bot: -0.56, top: 0.58, w: 0.6 },
    { z: 2.1, bot: -0.24, top: 0.28, w: 0.26 },
    { z: 2.7, bot: -0.08, top: 0.1, w: 0.08 },
  ];
  const blackParts = [loft(stations, { exp: 2.2, segments: 22 })];

  const dorsal = fin([[-0.45, 0.72], [0.45, 0.68], [0.05, 2.0]], 0.09);
  const flukeL = new THREE.ConeGeometry(0.42, 1.25, 4);
  flukeL.scale(1, 1, 0.14);
  flukeL.rotateX(Math.PI / 2);
  flukeL.rotateY(1.05);
  flukeL.rotateX(Math.PI / 2);
  flukeL.translate(0.56, 0.04, 2.84);
  const flukeR = flukeL.clone();
  flukeR.scale(-1, 1, 1);
  const flipper = (s) => {
    const g = new THREE.SphereGeometry(1, 10, 7);
    g.scale(0.72, 0.07, 0.34);
    g.rotateZ(s * -0.45);
    g.translate(s * 1.2, -0.52, -0.95);
    return g;
  };
  blackParts.push(dorsal, flukeL, flukeR, flipper(1), flipper(-1));
  const body = new THREE.Mesh(merge(blackParts), black);
  body.castShadow = true;
  group.add(body);

  const whiteParts = [
    ellipsoid(0.56, 0.48, 1.7, 0, -0.42, -1.05), // throat and belly
    ellipsoid(0.38, 0.24, 0.9, 0, -0.3, 1.18),
  ];
  for (const s of [1, -1]) {
    whiteParts.push(ellipsoid(0.1, 0.17, 0.32, s * 0.59, 0.27, -1.66)); // eye patch
    whiteParts.push(ellipsoid(0.1, 0.22, 0.48, s * 0.62, 0.32, 0.72)); // saddle patch
  }
  const patches = new THREE.Mesh(merge(whiteParts), white);
  group.add(patches);
  return group;
}

function makeShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 8, 64, 64, 62);
  // An alpha map reads brightness, so this is white on black.
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.7, '#cccccc');
  grad.addColorStop(1, '#000000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

const rand = (a, b) => a + Math.random() * (b - a);

export class Orcas {
  constructor(scene, effects) {
    this.scene = scene;
    this.effects = effects;
    this.list = [];
    this.pool = [];
    this.timer = 14;
    this.shadowTex = makeShadowTexture();
    this.shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  }

  reset() {
    for (const o of this.list) this.release(o);
    this.list.length = 0;
    this.timer = 14;
  }

  /** Removes orcas after a respawn so one cannot land on the returning car. */
  clear() {
    for (const o of this.list) this.release(o);
    this.list.length = 0;
    this.timer = Math.max(this.timer, 6);
  }

  release(o) {
    this.scene.remove(o.mesh, o.shadow);
    this.pool.push(o);
  }

  spawn(playerS, playerX, playerSpeed) {
    let o = this.pool.pop();
    if (!o) {
      o = {
        mesh: buildOrca(),
        shadow: new THREE.Mesh(
          this.shadowGeo,
          new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: this.shadowTex, transparent: true, depthWrite: false })
        ),
      };
      o.shadow.renderOrder = 2;
    }
    // Aims at where the player will be if nothing changes, so steering or a speed change dodges it.
    Object.assign(o, {
      state: 'falling',
      x: Math.max(-SHOULDER_EDGE, Math.min(SHOULDER_EDGE, playerX + rand(-1.1, 1.1))),
      s: playerS + playerSpeed * FALL_TIME + rand(-2, 2),
      y: START_Y,
      vy: 0,
      time: 0,
      roll: rand(-1, 1),
      flop: 0,
    });
    o.mesh.scale.setScalar(1);
    o.mesh.rotation.set(-1.25, rand(-0.4, 0.4), 0);
    o.mesh.position.set(o.x, o.y, 0);
    o.shadow.position.set(o.x, 0.05, 0);
    o.shadow.scale.set(0.1, 1, 0.1);
    o.shadow.material.opacity = 0;
    o.shadow.visible = true;
    this.scene.add(o.mesh, o.shadow);
    this.list.push(o);
    return FALL_TIME;
  }

  /** Returns true when a new orca started falling this frame. */
  update(dt, { playerS, playerX, playerSpeed, spawning, traffic, onLand }) {
    let started = false;
    if (spawning) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.spawn(playerS, playerX, playerSpeed);
        this.timer = rand(11, 24);
        started = true;
      }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const o = this.list[i];
      o.time += dt;
      const z = -(o.s - playerS);
      if (o.state === 'falling') {
        o.vy += GRAVITY * dt;
        o.y -= o.vy * dt;
        const progress = Math.min(1, o.time / FALL_TIME);
        o.mesh.rotation.x = -1.25 + progress * progress * 1.25;
        o.mesh.rotation.z = o.roll * progress * 1.4;
        const size = 2.6 + progress * 5;
        o.shadow.scale.set(size * 0.62, 1, size);
        o.shadow.material.opacity = 0.2 + progress * 0.55;
        if (o.y <= REST_Y) {
          o.y = REST_Y;
          o.state = 'landed';
          o.time = 0;
          o.mesh.rotation.z = o.roll * 0.3;
          this.effects.splash(o.x, 0.6, z);
          traffic.crushAt(o.x, o.s, HALF_WIDTH, HALF_LENGTH);
          onLand(Math.abs(z));
        }
      } else {
        // Flops on the road briefly, then disappears in a burst of spray.
        o.flop += dt * 9;
        o.mesh.rotation.x = Math.sin(o.flop) * 0.14;
        o.mesh.position.y = REST_Y + Math.abs(Math.sin(o.flop * 0.5)) * 0.3;
        o.shadow.material.opacity = 0.72;
        o.shadow.scale.set(4.8, 1, 7.6);
        if (o.time > GROUND_TIME) {
          this.effects.splash(o.x, 0.8, z);
          this.release(o);
          this.list.splice(i, 1);
          continue;
        }
      }
      if (o.state === 'falling') o.mesh.position.y = o.y;
      o.mesh.position.x = o.x;
      o.mesh.position.z = z;
      o.shadow.position.z = z;
      o.shadow.position.x = o.x;
      if (-z < -140) {
        this.release(o);
        this.list.splice(i, 1);
      }
    }
    return started;
  }

  /** Returns the orca touching the player's box during this frame's travel, if any. */
  hit(playerX, fromS, toS, halfW, halfL) {
    for (const o of this.list) {
      if (o.y > STRIKE_HEIGHT) continue;
      if (Math.abs(o.x - playerX) >= halfW + HALF_WIDTH) continue;
      if (sweepOverlaps(o.s, HALF_LENGTH, fromS, toS, halfL)) return o;
    }
    return null;
  }
}
