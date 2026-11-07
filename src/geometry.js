// Small geometry helpers used by the car, animal and scenery builders.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Lofts rounded cross-sections along Z into a smooth closed body.
 * Each station is { z, bot, top, w, topW?, exp? }.
 * topW narrows the upper half to give tumblehome. exp is the superellipse
 * exponent: 2 is an ellipse, higher values are boxier.
 */
export function loft(stations, { segments = 24, exp = 3.4 } = {}) {
  const positions = [];
  const indices = [];
  for (const st of stations) {
    const mid = (st.top + st.bot) / 2;
    const hh = (st.top - st.bot) / 2;
    const n = st.exp ?? exp;
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const sx = Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
      const sy = Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
      const t = (sy + 1) / 2;
      const hw = st.w + ((st.topW ?? st.w) - st.w) * t;
      positions.push(sx * hw, mid + sy * hh, st.z);
    }
  }
  const at = (i, j) => i * segments + ((j + segments) % segments);
  for (let i = 0; i < stations.length - 1; i++) {
    for (let j = 0; j < segments; j++) {
      indices.push(at(i, j), at(i, j + 1), at(i + 1, j));
      indices.push(at(i, j + 1), at(i + 1, j + 1), at(i + 1, j));
    }
  }
  // End caps.
  const cap = (st, ring, flip) => {
    const center = positions.length / 3;
    positions.push(0, (st.top + st.bot) / 2, st.z);
    for (let j = 0; j < segments; j++) {
      if (flip) indices.push(center, at(ring, j + 1), at(ring, j));
      else indices.push(center, at(ring, j), at(ring, j + 1));
    }
  };
  cap(stations[0], 0, true);
  cap(stations[stations.length - 1], stations.length - 1, false);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function box(w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  return g;
}

/** A rectangular bar running between two points. */
export function beam(a, b, width, thickness = width) {
  const pa = new THREE.Vector3(...a);
  const pb = new THREE.Vector3(...b);
  const len = pa.distanceTo(pb);
  const g = new THREE.BoxGeometry(width, thickness, len);
  const m = new THREE.Matrix4().lookAt(pb, pa, new THREE.Vector3(0, 1, 0));
  g.applyMatrix4(m);
  const mid = pa.clone().add(pb).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

/** Flat shape in the XY plane, facing -Z or +Z, placed at x,y,z. */
export function shape2D(points, x, y, z, facing = -1) {
  const s = new THREE.Shape();
  points.forEach(([px, py], i) => (i === 0 ? s.moveTo(px, py) : s.lineTo(px, py)));
  s.closePath();
  const g = new THREE.ShapeGeometry(s);
  if (facing < 0) g.rotateY(Math.PI);
  g.translate(x, y, z);
  return g;
}

/** Merges geometries after reducing them to the same attributes. */
export function merge(list) {
  const cleaned = list.map((g) => {
    const out = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(out.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') out.deleteAttribute(name);
    }
    if (!out.attributes.normal) out.computeVertexNormals();
    if (!out.attributes.uv) {
      const count = out.attributes.position.count;
      out.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
    }
    return out;
  });
  return mergeGeometries(cleaned, false);
}

/** Paints a geometry with one color so it can share a vertex-colored mesh. */
export function tint(geo, color) {
  const c = new THREE.Color(color);
  const count = geo.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Interpolates a loft cross-section at any z. */
export function stationAt(stations, z) {
  let i = 0;
  while (i < stations.length - 2 && z > stations[i + 1].z) i++;
  const a = stations[i];
  const b = stations[i + 1];
  const t = Math.max(0, Math.min(1, (z - a.z) / (b.z - a.z)));
  const mix = (p, q) => p + (q - p) * t;
  return {
    bot: mix(a.bot, b.bot),
    top: mix(a.top, b.top),
    w: mix(a.w, b.w),
    topW: mix(a.topW ?? a.w, b.topW ?? b.w),
  };
}

const hwAt = (st, sy) => st.w + (st.topW - st.w) * ((sy + 1) / 2);

/** Surface height at lateral position x on the upper half of a cross-section. */
function surfaceY(st, x, n) {
  const mid = (st.top + st.bot) / 2;
  const hh = (st.top - st.bot) / 2;
  let sy = 1;
  for (let i = 0; i < 3; i++) {
    const sx = Math.min(0.999, Math.abs(x) / hwAt(st, sy));
    const s = Math.sqrt(1 - Math.pow(sx, n));
    sy = Math.pow(s, 2 / n);
  }
  return mid + sy * hh;
}

/** Lateral surface position at height y on a cross-section. */
function surfaceX(st, y, n) {
  const mid = (st.top + st.bot) / 2;
  const hh = (st.top - st.bot) / 2;
  const sy = Math.max(-0.999, Math.min(0.999, (y - mid) / hh));
  const sx = Math.pow(1 - Math.pow(Math.abs(sy), n), 1 / n);
  return sx * hwAt(st, sy);
}

function gridGeometry(rows, cols, pointFn) {
  const positions = [];
  const indices = [];
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) positions.push(...pointFn(c / cols, r / rows));
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * (cols + 1) + c;
      indices.push(i, i + 1, i + cols + 1, i + 1, i + cols + 2, i + cols + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Window lying on the top of a lofted cabin, such as a windshield or rear glass. */
export function topGlass(stations, { z0, z1, halfX0, halfX1, n = 5, lift = 0.008 }) {
  return gridGeometry(10, 12, (u, v) => {
    const z = z0 + (z1 - z0) * v;
    const x = (u * 2 - 1) * (halfX0 + (halfX1 - halfX0) * v);
    return [x, surfaceY(stationAt(stations, z), x, n) + lift, z];
  });
}

/** Window lying on the side of a lofted cabin. Its top edge follows the roofline. */
export function sideGlass(stations, side, { z0, z1, yBot, topGap = 0.07, rake0 = 0, rake1 = 0, n = 5, lift = 0.008 }) {
  return gridGeometry(14, 6, (u, v) => {
    const baseZ = z0 + (z1 - z0) * u;
    const roofTop = stationAt(stations, baseZ).top - topGap;
    const yTop = Math.max(yBot + 0.002, roofTop);
    const y = yBot + (yTop - yBot) * v;
    const z = baseZ + v * ((1 - u) * rake0 + u * rake1);
    const st = stationAt(stations, z);
    return [side * (surfaceX(st, Math.min(y, st.top - 0.004), n) + lift), Math.min(y, st.top - 0.004), z];
  });
}

function insideSection(st, x, y, n) {
  const mid = (st.top + st.bot) / 2;
  const hh = (st.top - st.bot) / 2;
  const sy = (y - mid) / hh;
  if (Math.abs(sy) >= 1) return false;
  return Math.pow(Math.abs(x) / hwAt(st, sy), n) + Math.pow(Math.abs(sy), n) <= 1;
}

/**
 * Panel wrapped over the front or rear of a loft, such as a lamp or grille.
 * corners are four [x, y] points in order around the panel.
 */
export function facePatch(stations, corners, { end = 'front', n = 3.4, lift = 0.006, rows = 6, cols = 20, depth = 0.38 } = {}) {
  const zFront = stations[0].z;
  const zRear = stations[stations.length - 1].z;
  const sign = end === 'front' ? 1 : -1;
  const start = end === 'front' ? zFront : zRear;
  const offset = lift + 0.008; // keeps coarse panels above the curved surface
  const place = (x, y) => {
    for (let d = 0; d < depth; d += 0.006) {
      const z = start + sign * d;
      if (insideSection(stationAt(stations, z), x, y, n)) return [x, y, z - sign * offset];
    }
    // Past the wrap limit, the panel rests against the side of the body.
    const z = start + sign * depth;
    const edge = surfaceX(stationAt(stations, z), y, n) + offset;
    return [Math.sign(x) * Math.min(Math.abs(x), edge), y, z];
  };
  const [a, b, c, d] = corners;
  const geo = gridGeometry(rows, cols, (u, v) => {
    const topX = a[0] + (b[0] - a[0]) * u;
    const topY = a[1] + (b[1] - a[1]) * u;
    const botX = d[0] + (c[0] - d[0]) * u;
    const botY = d[1] + (c[1] - d[1]) * u;
    return place(topX + (botX - topX) * v, topY + (botY - topY) * v);
  });
  // Make the panel face away from the body.
  const nz = geo.attributes.normal.getZ(0);
  if (nz * sign > 0) {
    const idx = geo.index.array;
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    geo.computeVertexNormals();
  }
  return geo;
}

/** Hard-edged body built from rings of matching [x, y, z] points. */
export function faceted(rings) {
  const positions = [];
  const tri = (a, b, c) => positions.push(...a, ...b, ...c);
  for (let i = 0; i < rings.length - 1; i++) {
    const r0 = rings[i];
    const r1 = rings[i + 1];
    for (let j = 0; j < r0.length; j++) {
      const k = (j + 1) % r0.length;
      tri(r0[j], r0[k], r1[j]);
      tri(r0[k], r1[k], r1[j]);
    }
  }
  for (const ring of [rings[0], rings[rings.length - 1]]) {
    for (let j = 1; j < ring.length - 1; j++) tri(ring[0], ring[j], ring[j + 1]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Flat polygon from [x, y, z] points, split as a fan. Use a double-sided material. */
export function polygon(points) {
  const positions = [];
  for (let j = 1; j < points.length - 1; j++) positions.push(...points[0], ...points[j], ...points[j + 1]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}
