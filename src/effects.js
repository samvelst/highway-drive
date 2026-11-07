// Pooled billboard particles for fire, smoke, sparks and dust, plus flying debris.
import * as THREE from 'three/webgpu';
import { attribute, texture, uv } from 'three/tsl';

function makeSoftDisc() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 1, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

class ParticlePool {
  constructor(scene, count, blending, disc) {
    const geo = new THREE.PlaneGeometry(1, 1);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    this.alpha.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAlpha', this.alpha);

    const mat = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending,
      fog: blending !== THREE.AdditiveBlending,
    });
    mat.opacityNode = texture(disc, uv()).a.mul(attribute('aAlpha', 'float'));

    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = blending === THREE.AdditiveBlending ? 6 : 5;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Touching setColorAt allocates the per-instance color buffer.
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    scene.add(this.mesh);

    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push({ life: 0, max: 1, x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, size: 1, grow: 0, rot: 0, spin: 0, drag: 0, kind: 0 });
    }
    this.next = 0;
    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();
    this.spinQ = new THREE.Quaternion();
    this.axisZ = new THREE.Vector3(0, 0, 1);
  }

  spawn(props) {
    const p = this.particles[this.next];
    this.next = (this.next + 1) % this.particles.length;
    Object.assign(p, { drag: 0, grow: 0, spin: 0, rot: Math.random() * 6.28 }, props);
    p.max = p.life;
  }

  update(dt, camera, worldMove, shade) {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.life <= 0) {
        this.dummy.position.set(0, -100, 0);
        this.dummy.scale.setScalar(0.001);
        this.dummy.quaternion.identity();
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        this.alpha.array[i] = 0;
        continue;
      }
      p.life -= dt;
      const damp = Math.max(0, 1 - p.drag * dt);
      p.vx *= damp;
      p.vy *= damp;
      p.vz *= damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt + worldMove;
      p.size += p.grow * dt;
      p.rot += p.spin * dt;
      if (p.gravity) {
        p.vy -= p.gravity * dt;
        if (p.y < 0.03) {
          p.y = 0.03;
          p.vy *= -0.35;
        }
      }
      const t = 1 - Math.max(0, p.life) / p.max;
      this.dummy.position.set(p.x, p.y, p.z);
      this.spinQ.setFromAxisAngle(this.axisZ, p.rot);
      this.dummy.quaternion.copy(camera.quaternion).multiply(this.spinQ);
      this.dummy.scale.setScalar(p.size);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      const a = shade(p, t, this.color);
      this.mesh.setColorAt(i, this.color);
      this.alpha.array[i] = a;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.alpha.needsUpdate = true;
  }
}

function shadeGlow(p, t, c) {
  if (p.kind === 1) {
    // Sparks stay bright and cool down to orange.
    c.setRGB(3.4, 2 - t * 1.4, 0.7 - t * 0.6);
    return 1 - t * t;
  }
  // Flame: yellow core, then orange, then deep red.
  if (t < 0.25) c.setRGB(1.9, 1.05 - t, 0.22 - t * 0.5);
  else if (t < 0.6) c.setRGB(1.6, 0.72 - (t - 0.25) * 1.1, 0.08);
  else c.setRGB(1.1 - (t - 0.6) * 1.6, 0.3 - (t - 0.6) * 0.6, 0.03);
  return Math.sin(Math.min(1, t * 5) * Math.PI * 0.5) * (1 - t) * 0.7;
}

function shadeHaze(p, t, c) {
  if (p.kind === 2) {
    // Sea spray.
    c.setRGB(0.78, 0.9, 1);
    return (1 - t) * 0.78;
  }
  if (p.kind === 1) {
    // Dust.
    c.setRGB(0.62, 0.56, 0.45);
    return (1 - t) * 0.55;
  }
  // Smoke darkens slightly as it climbs.
  const v = 0.07 + t * 0.14;
  c.setRGB(v, v, v);
  return Math.min(1, t * 6) * (1 - t) * 0.72;
}

const rand = (a, b) => a + Math.random() * (b - a);

export class Effects {
  constructor(scene) {
    this.scene = scene;
    const disc = makeSoftDisc();
    this.glow = new ParticlePool(scene, 340, THREE.AdditiveBlending, disc);
    this.haze = new ParticlePool(scene, 300, THREE.NormalBlending, disc);
    this.fires = [];
    this.debris = [];
    this.light = new THREE.PointLight(0xff7a22, 0, 34, 1.7);
    this.light.position.set(0, 2, 0);
    scene.add(this.light);
    this.debrisGeo = new THREE.BoxGeometry(1, 1, 1);
    this.debrisMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.6 });
    this.glassMat = new THREE.MeshStandardMaterial({ color: 0x9fc4d4, roughness: 0.15, metalness: 0.3 });
  }

  /** Starts a fire that follows the object. offsets is a list of [x, y, z, strength]. */
  addFire(object, offsets, { lit = false } = {}) {
    const fire = { object, offsets, lit, timer: 0, heat: 0 };
    this.fires.push(fire);
    return fire;
  }

  removeFire(fire) {
    const i = this.fires.indexOf(fire);
    if (i >= 0) this.fires.splice(i, 1);
  }

  sparks(x, y, z, count = 8, spread = 6) {
    for (let i = 0; i < count; i++) {
      this.glow.spawn({
        kind: 1,
        life: rand(0.25, 0.6),
        x,
        y,
        z,
        vx: rand(-spread, spread),
        vy: rand(1, spread),
        vz: rand(-spread, spread),
        size: rand(0.05, 0.13),
        gravity: 13,
      });
    }
  }

  dust(x, y, z, count = 10, strength = 1) {
    for (let i = 0; i < count; i++) {
      this.haze.spawn({
        kind: 1,
        life: rand(0.5, 1.1),
        x: x + rand(-0.4, 0.4),
        y: y + rand(0, 0.4),
        z: z + rand(-0.4, 0.4),
        vx: rand(-2, 2) * strength,
        vy: rand(0.4, 2.2) * strength,
        vz: rand(-2, 2) * strength,
        size: rand(0.5, 1.1),
        grow: 1.5,
        drag: 1.7,
      });
    }
  }

  /** Burst of sea spray for a landing orca. */
  splash(x, y, z) {
    for (let i = 0; i < 70; i++) {
      this.haze.spawn({
        kind: 2,
        life: rand(0.5, 1.3),
        x: x + rand(-1.3, 1.3),
        y: y + rand(0, 0.5),
        z: z + rand(-2, 2),
        vx: rand(-8, 8),
        vy: rand(2, 15),
        vz: rand(-8, 8),
        size: rand(0.25, 0.9),
        grow: 1.1,
        gravity: 17,
      });
    }
  }

  /** Explosion flash and flying shards at the moment of impact. */
  explode(x, y, z) {
    this.sparks(x, y, z, 54, 13);
    for (let i = 0; i < 30; i++) {
      this.glow.spawn({
        kind: 0,
        life: rand(0.35, 0.8),
        x: x + rand(-0.8, 0.8),
        y: y + rand(0, 0.9),
        z: z + rand(-0.8, 0.8),
        vx: rand(-5, 5),
        vy: rand(1, 8),
        vz: rand(-5, 5),
        size: rand(0.9, 2.2),
        grow: 2,
        drag: 2.5,
      });
    }
    for (let i = 0; i < 24; i++) {
      const isGlass = i % 2 === 0;
      const size = isGlass ? rand(0.04, 0.14) : rand(0.08, 0.3);
      this.addDebris(new THREE.Mesh(this.debrisGeo, isGlass ? this.glassMat : this.debrisMat), {
        x: x + rand(-0.7, 0.7),
        y: y + rand(0.2, 1),
        z: z + rand(-0.7, 0.7),
        vx: rand(-9, 9),
        vy: rand(2, 11),
        vz: rand(-9, 9),
        scale: [size, size * rand(0.2, 0.8), size * rand(0.5, 1.2)],
        life: rand(2.5, 4),
      });
    }
  }

  /** Throws any mesh as tumbling debris. owned pieces are removed from the scene afterwards. */
  addDebris(mesh, { x, y, z, vx, vy, vz, scale, life = 4, spin = 9, keep = false }) {
    mesh.position.set(x, y, z);
    if (scale) mesh.scale.set(...scale);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.debris.push({
      mesh,
      vx,
      vy,
      vz,
      ax: rand(-spin, spin),
      ay: rand(-spin, spin),
      az: rand(-spin, spin),
      life,
      keep,
    });
  }

  clearDebris() {
    for (const d of this.debris) this.scene.remove(d.mesh);
    this.debris.length = 0;
  }

  update(dt, camera, playerMove) {
    let lit = 0;
    for (const fire of this.fires) {
      fire.heat = Math.min(1, fire.heat + dt * 1.1);
      const o = fire.object;
      if (!o.parent) continue;
      if (Math.abs(o.position.z) > 260) continue; // too far away to see
      fire.timer += dt;
      const step = 1 / 48;
      while (fire.timer > step) {
        fire.timer -= step;
        const [ox, oy, oz, strength] = fire.offsets[Math.floor(Math.random() * fire.offsets.length)];
        const local = new THREE.Vector3(ox + rand(-0.3, 0.3), oy, oz + rand(-0.3, 0.3)).applyQuaternion(o.quaternion);
        const px = o.position.x + local.x;
        const py = o.position.y + local.y;
        const pz = o.position.z + local.z;
        const scale = strength * (0.45 + fire.heat * 0.55);
        this.glow.spawn({
          kind: 0,
          life: rand(0.45, 0.9),
          x: px,
          y: py,
          z: pz,
          vx: rand(-0.4, 0.4),
          vy: rand(2.4, 4.8) * scale,
          vz: rand(-0.4, 0.4),
          size: rand(0.7, 1.35) * scale,
          grow: -0.35,
        });
        if (Math.random() < 0.42) {
          this.haze.spawn({
            kind: 0,
            life: rand(1.6, 3),
            x: px,
            y: py + 1,
            z: pz,
            vx: rand(-0.6, 0.6) + 0.7,
            vy: rand(2.6, 4.2),
            vz: rand(-0.6, 0.6),
            size: rand(0.8, 1.3) * scale,
            grow: 1.5,
            drag: 0.1,
          });
        }
        if (Math.random() < 0.025) this.sparks(px, py + 0.4, pz, 2, 2.5);
      }
      if (fire.lit) {
        lit = fire.heat;
        this.light.position.set(o.position.x, o.position.y + 1.8, o.position.z);
      }
    }
    this.light.intensity = lit > 0 ? lit * (75 + Math.random() * 55) : 0;

    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        this.debris.splice(i, 1);
        continue;
      }
      d.vy -= 16 * dt;
      d.mesh.position.x += d.vx * dt;
      d.mesh.position.y += d.vy * dt;
      d.mesh.position.z += d.vz * dt + playerMove;
      d.mesh.rotation.x += d.ax * dt;
      d.mesh.rotation.y += d.ay * dt;
      d.mesh.rotation.z += d.az * dt;
      if (d.mesh.position.y < 0.05) {
        d.mesh.position.y = 0.05;
        d.vy = Math.abs(d.vy) * 0.3;
        d.vx *= 0.6;
        d.vz *= 0.6;
        d.ax *= 0.5;
        d.ay *= 0.5;
        d.az *= 0.5;
      }
    }
    this.glow.update(dt, camera, playerMove, shadeGlow);
    this.haze.update(dt, camera, playerMove, shadeHaze);
  }
}
