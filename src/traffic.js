// Vehicles travelling both ways. Each stays in its lane and brakes for
// whatever is ahead: other vehicles, animals, and the player.
import { LANES_PER_SIDE, SPAWN_AHEAD, SPAWN_BEHIND, laneX, sweepOverlaps } from './config.js';
import { buildTrafficCar, charTrafficCar, setHighBeams } from './cars.js';

const BASE_SAME = 14;
const BASE_ONCOMING = 18;
const MAX_EXTRA = 9; // extra vehicles per side as a run gets longer
const LANE_CATCH = 2.3;
const MIN_SPAWN_GAP = 34;
const VEER_RATE = 4.6; // sideways speed of a wrong-way car, in metres per second
const OFF_SCREEN_BEHIND = 10; // a car this far behind the player has passed the camera
const FLASH_PERIOD = 0.42; // seconds for one on-and-off flash of the high beams
const FLASH_ON = 0.22;
const WARNING_TIME = 3.5; // seconds before a wrong-way car would reach the player

const rand = (a, b) => a + Math.random() * (b - a);

export class Traffic {
  constructor(scene, effects) {
    this.scene = scene;
    this.effects = effects;
    this.cars = [];
    this.pool = [];
    this.veerTimer = 9;
  }

  acquire() {
    // Keep the pool shuffled so vehicle types do not repeat in a fixed order.
    if (this.pool.length && Math.random() < 0.8) {
      return this.pool.splice(Math.floor(Math.random() * this.pool.length), 1)[0];
    }
    return buildTrafficCar();
  }

  spawn(dir, lane, s, speed) {
    const v = this.acquire();
    const x = laneX(dir, lane);
    v.group.position.set(x, 0, 0);
    v.group.rotation.set(0, dir === 1 ? 0 : Math.PI, 0);
    v.dir = dir;
    v.lane = lane;
    v.s = s;
    v.x = x;
    v.speed = speed;
    v.cruise = speed;
    v.braking = false;
    v.veering = false;
    setHighBeams(v.group, false);
    this.scene.add(v.group);
    this.cars.push(v);
  }

  remove(i) {
    const v = this.cars[i];
    this.scene.remove(v.group);
    if (v.fire) this.effects.removeFire(v.fire);
    this.cars.splice(i, 1);
    if (!v.wrecked) this.pool.push(v);
  }

  clear() {
    while (this.cars.length) this.remove(this.cars.length - 1);
    this.veerTimer = 9;
  }

  /** Sends an oncoming car across the median toward the player's current lane. */
  startVeer(car, playerX) {
    const lane = Math.max(0, Math.min(LANES_PER_SIDE - 1, Math.round((playerX - laneX(1, 0)) / (laneX(1, 1) - laneX(1, 0)))));
    car.veering = true;
    car.veerX = laneX(1, lane);
    car.veerVx = 0;
    car.flashTime = 0;
  }

  /** Picks an oncoming car far enough ahead to give the player a fair warning. */
  pickVeerCar(playerS, playerX, playerSpeed) {
    const nearest = (car) => (playerSpeed + car.speed) * WARNING_TIME;
    const options = this.cars.filter((c) => {
      if (c.dir !== -1 || c.wrecked || c.veering || c.kind === 'truck') return false;
      const d = c.s - playerS;
      return d > Math.max(140, nearest(c)) && d < SPAWN_AHEAD;
    });
    if (!options.length) return false;
    this.startVeer(options[Math.floor(Math.random() * options.length)], playerX);
    return true;
  }

  /** Clears vehicles near the player so a respawn is never an instant crash. */
  clearAround(playerS, back, front) {
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const d = this.cars[i].s - playerS;
      if (d > -back && d < front) this.remove(i);
    }
  }

  laneIsClear(dir, lane, s) {
    return !this.cars.some((c) => c.dir === dir && c.lane === lane && Math.abs(c.s - s) < MIN_SPAWN_GAP + c.halfL);
  }

  /** Fills the road at the start of a run. */
  seed(playerS) {
    for (let i = 0; i < BASE_SAME; i++) {
      const lane = Math.floor(Math.random() * LANES_PER_SIDE);
      const s = playerS + rand(90, SPAWN_AHEAD);
      if (this.laneIsClear(1, lane, s)) this.spawn(1, lane, s, this.cruiseFor(1, lane));
    }
    for (let i = 0; i < BASE_ONCOMING; i++) {
      const lane = Math.floor(Math.random() * LANES_PER_SIDE);
      const s = playerS + rand(170, SPAWN_AHEAD);
      if (this.laneIsClear(-1, lane, s)) this.spawn(-1, lane, s, this.cruiseFor(-1, lane));
    }
  }

  cruiseFor(dir, lane) {
    // The lane nearest the median is the fast lane on both sides.
    const base = 30 - lane * 3.2;
    return base + rand(-2.5, 2.5);
  }

  maintain(playerS, playerSpeed, runTime) {
    const extra = Math.min(MAX_EXTRA, Math.floor(runTime / 35));
    // At extreme speed the player passes traffic much faster, so refill faster
    // and over a deeper band, or the road would empty out.
    const attempts = 1 + Math.floor(playerSpeed / 100);
    const band = 90 + playerSpeed * 0.06;
    for (let i = 0; i < attempts; i++) {
      const same = this.cars.filter((c) => c.dir === 1).length;
      const oncoming = this.cars.length - same;
      if (oncoming < BASE_ONCOMING + extra && Math.random() < 0.3) {
        const lane = Math.floor(Math.random() * LANES_PER_SIDE);
        const s = playerS + SPAWN_AHEAD + rand(0, band);
        if (this.laneIsClear(-1, lane, s)) this.spawn(-1, lane, s, this.cruiseFor(-1, lane));
      }
      if (same < BASE_SAME + extra && Math.random() < 0.3) {
        const lane = Math.floor(Math.random() * LANES_PER_SIDE);
        const cruise = this.cruiseFor(1, lane);
        // Slower traffic comes into view ahead; faster traffic catches up from behind.
        const s = cruise < playerSpeed ? playerS + SPAWN_AHEAD + rand(0, band) : playerS - SPAWN_BEHIND - rand(0, 40);
        if (this.laneIsClear(1, lane, s)) this.spawn(1, lane, s, cruise);
      }
    }
  }

  update(dt, { playerS, playerSpeed, playerX, playerHalfL, playerSolid, playerStopped, animals, runTime, spawning, onVeer }) {
    if (spawning) {
      this.maintain(playerS, playerSpeed, runTime);
      this.veerTimer -= dt;
      if (this.veerTimer <= 0) {
        // Retries soon if no suitable car is available right now.
        const started = this.pickVeerCar(playerS, playerX, playerSpeed);
        this.veerTimer = started ? rand(11, 24) : 1;
        if (started) onVeer();
      }
    }

    for (const car of this.cars) {
      if (car.wrecked) {
        car.speed = Math.max(0, car.speed - 22 * dt);
        continue;
      }
      let target = car.cruise;
      const brakeFor = (gap, leadSpeed) => {
        const safe = 7 + car.speed * 1.1;
        if (gap < safe) {
          const limit = gap < 5 ? 0 : leadSpeed + Math.max(0, gap - 5) * 0.45;
          target = Math.min(target, limit);
        }
      };
      for (const other of car.veering ? [] : this.cars) {
        if (other === car || other.veering || other.dir !== car.dir || other.lane !== car.lane) continue;
        const gap = (other.s - car.s) * car.dir - other.halfL - car.halfL;
        if (gap > 0) brakeFor(gap, other.speed);
      }
      // Oncoming drivers only have time to react once the player has stopped.
      if (playerSolid && Math.abs(playerX - car.x) < LANE_CATCH && (car.dir === 1 || playerStopped)) {
        const gap = (playerS - car.s) * car.dir - playerHalfL - car.halfL;
        if (gap > 0) brakeFor(gap, car.dir === 1 ? playerSpeed : 0);
      }
      for (const a of animals) {
        if (!a.alive || Math.abs(a.x - car.x) > LANE_CATCH) continue;
        const gap = (a.s - car.s) * car.dir - car.halfL;
        if (gap > 0 && gap < 12 + car.speed * 1.5) target = Math.min(target, gap < 8 ? 0 : gap * 0.6);
      }
      car.braking = target < car.speed - 0.5;
      const rate = car.speed > target ? 15 : 3.2;
      car.speed += Math.max(-rate * dt, Math.min(rate * dt, target - car.speed));
    }

    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      car.s += car.dir * car.speed * dt;
      const d = car.s - playerS;
      if (car.veering && !car.wrecked) {
        this.updateVeer(car, dt);
        // It flashes its high beams until it has passed the player and left the screen.
        car.flashTime += dt;
        const flashing = !car.wrecked && d > -OFF_SCREEN_BEHIND && car.flashTime % FLASH_PERIOD < FLASH_ON;
        setHighBeams(car.group, flashing, Math.abs(d));
      }
      if (d > SPAWN_AHEAD + 130 + playerSpeed * 0.06 || d < -SPAWN_BEHIND - 60) {
        this.remove(i);
        continue;
      }
      car.group.position.z = -d;
    }
  }

  updateVeer(car, dt) {
    const remaining = car.veerX - car.x;
    const wanted = Math.max(-VEER_RATE, Math.min(VEER_RATE, remaining * 1.1));
    car.veerVx += (wanted - car.veerVx) * Math.min(1, 2.5 * dt);
    car.x += car.veerVx * dt;
    car.group.position.x = car.x;
    car.group.rotation.y = Math.PI + Math.atan2(car.veerVx, Math.max(car.speed, 8));

    // Head-on collisions with traffic going the right way wreck both vehicles.
    for (const other of this.cars) {
      if (other.dir !== 1 || other.wrecked) continue;
      if (Math.abs(other.x - car.x) >= other.halfW + car.halfW) continue;
      if (Math.abs(other.s - car.s) < other.halfL + car.halfL) {
        this.wreck(car, 40);
        this.wreck(other, 40);
        return;
      }
    }
  }

  /**
   * Returns the first vehicle touched during this frame's travel, if any. The
   * whole span is tested because a fast car can move several lengths per frame.
   */
  hit(playerX, fromS, toS, halfW, halfL, dt) {
    for (const car of this.cars) {
      if (car.wrecked || Math.abs(car.x - playerX) >= car.halfW + halfW) continue;
      if (sweepOverlaps(car.s, car.halfL + car.speed * dt, fromS, toS, halfL)) return car;
    }
    return null;
  }

  /** Wrecks any vehicle under a falling orca. */
  crushAt(x, s, halfW, halfL) {
    for (const car of this.cars) {
      if (car.wrecked || Math.abs(car.x - x) >= car.halfW + halfW) continue;
      if (Math.abs(car.s - s) < car.halfL + halfL) this.wreck(car, 20);
    }
  }

  wreck(car, impactSpeed) {
    car.wrecked = true;
    setHighBeams(car.group, false);
    car.speed = Math.min(car.speed, impactSpeed * 0.35);
    charTrafficCar(car.group);
    car.group.rotation.y += (Math.random() < 0.5 ? -1 : 1) * 0.3;
    car.group.rotation.z = (Math.random() < 0.5 ? -1 : 1) * 0.05;
    const f = car.dir === 1 ? car.halfL * 0.3 : -car.halfL * 0.3;
    car.fire = this.effects.addFire(car.group, [
      [0, 0.9, -Math.abs(f), 1],
      [0.3, 1, Math.abs(f) * 0.5, 0.75],
    ]);
  }
}
