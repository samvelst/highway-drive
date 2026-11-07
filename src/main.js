// Game setup, state flow and the main loop.
import * as THREE from 'three/webgpu';
import { Animals } from './animals.js';
import { GameAudio } from './audio.js';
import { buildPlayerCar, charPlayerCar, crumpleCar } from './cars.js';
import {
  CARS,
  CRASH_TIME,
  INVULNERABLE_TIME,
  MAX_SPEED,
  MIN_SPEED,
  MS_TO_MPH,
  PENGUIN_BONUS,
  PET_PENALTY,
  POINTS_PER_SECOND,
  RAIL_X,
  ROAD_EDGE,
  SHOULDER_SPEED,
  START_LIVES,
  START_SPEED,
  WOLF_BONUS,
  laneX,
  speedFeel,
} from './config.js';
import { Effects } from './effects.js';
import { Input } from './input.js';
import { Orcas } from './orcas.js';
import { Traffic } from './traffic.js';
import { World } from './world.js';

const $ = (id) => document.getElementById(id);
const BEST_KEY = 'highway-drive-best';

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}
function saveBest(value) {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Private windows may refuse storage; the best score just will not persist.
  }
}

// Lets the browser show progress before the next long step.
const nextPaint = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve));
    setTimeout(resolve, 150); // animation frames can stall while a page starts up
  });

const canvas = $('game');
// `?webgl=1` is compatibility mode for devices where WebGPU does not start.
const forceWebGL = new URLSearchParams(location.search).has('webgl');
bootStep(forceWebGL ? 'Starting graphics (WebGL compatibility mode)' : 'Starting graphics');
await nextPaint();
const renderer = new THREE.WebGPURenderer({ canvas, antialias: !forceWebGL, forceWebGL });
renderer.onDeviceLost = (info) => {
  $('boot').classList.remove('hidden');
  bootFail(`The graphics device was lost: ${info?.message ?? 'unknown reason'}`);
};
const coarsePointer = matchMedia('(pointer: coarse)').matches;
renderer.setPixelRatio(Math.min(devicePixelRatio, coarsePointer ? 1.5 : 2)); // lighter on phones and tablets
if (innerWidth && innerHeight) renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
await renderer.init();

const backendIsWebGPU = !!renderer.backend.isWebGPUBackend;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 3400);

addEventListener('resize', () => {
  if (!innerWidth || !innerHeight) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

bootStep('Building the highway');
await nextPaint();
const world = new World(scene);
const effects = new Effects(scene);
const traffic = new Traffic(scene, effects);
const animals = new Animals(scene);
const orcas = new Orcas(scene, effects);
const input = new Input();
const audio = new GameAudio();

const state = {
  mode: 'menu', // menu | driving | crashed | paused | gameover
  carIndex: 0,
  s: 0,
  x: laneX(1, 1),
  vx: 0,
  speed: 0,
  steerVisual: 0,
  score: 0,
  lives: START_LIVES,
  runTime: 0,
  invulnerable: 0,
  crashTimer: 0,
  crashSpin: 0,
  crashFire: null,
  scrapeTimer: 0,
  best: loadBest(),
  cameraX: 0,
  shake: 0,
  menuAngle: 0.65,
  petsHit: 0,
  wolvesHit: 0,
  penguinsHit: 0,
  pausedFrom: null,
};

let car = null;
let carSpec = CARS[0];

function setCar(index) {
  state.carIndex = (index + CARS.length) % CARS.length;
  carSpec = CARS[state.carIndex];
  placeNewCarModel();
  $('carName').textContent = carSpec.name;
  $('carBlurb').textContent = carSpec.blurb;
}

function placeNewCarModel() {
  if (car) scene.remove(car);
  car = buildPlayerCar(carSpec.id);
  scene.add(car);
}

const show = (id, on = true) => $(id).classList.toggle('hidden', !on);

function renderLives() {
  $('lives').innerHTML = '';
  for (let i = 0; i < START_LIVES; i++) {
    const pip = document.createElement('i');
    if (i >= state.lives) pip.className = 'lost';
    $('lives').append(pip);
  }
}

function popup(text, detail, cls) {
  const el = document.createElement('div');
  el.className = `popup ${cls}`;
  el.textContent = text;
  if (detail) {
    const small = document.createElement('small');
    small.textContent = detail;
    el.append(small);
  }
  $('popups').append(el);
  setTimeout(() => el.remove(), 1950);
}

function goToMenu() {
  traffic.clear();
  animals.clear();
  orcas.reset();
  effects.clearDebris();
  stopCrashFire();
  state.mode = 'menu';
  state.speed = 0;
  state.vx = 0;
  state.x = laneX(1, 1);
  placeNewCarModel();
  show('hud', false);
  show('menu');
  show('gameover', false);
  show('pause', false);
  $('fade').classList.remove('on');
}

function startRun() {
  audio.unlock();
  traffic.clear();
  animals.clear();
  orcas.reset();
  effects.clearDebris();
  stopCrashFire();
  Object.assign(state, {
    mode: 'driving',
    s: state.s + 1000,
    x: laneX(1, 1),
    vx: 0,
    speed: START_SPEED,
    score: 0,
    lives: START_LIVES,
    runTime: 0,
    invulnerable: 1.5,
    petsHit: 0,
    wolvesHit: 0,
    penguinsHit: 0,
    shake: 0,
    steerVisual: 0,
  });
  state.cameraX = state.x;
  placeNewCarModel();
  traffic.seed(state.s);
  renderLives();
  show('menu', false);
  show('gameover', false);
  show('pause', false);
  show('hud');
  $('fade').classList.remove('on');
}

function stopCrashFire() {
  if (state.crashFire) effects.removeFire(state.crashFire);
  state.crashFire = null;
  audio.setFire(0);
}

function breakCar(impactX, oncoming) {
  const { breakables, wheels } = car.userData;
  const world = new THREE.Vector3();
  for (const piece of breakables) {
    piece.getWorldPosition(world);
    const quaternion = new THREE.Quaternion();
    piece.getWorldQuaternion(quaternion);
    car.remove(piece);
    piece.quaternion.copy(quaternion);
    effects.addDebris(piece, {
      x: world.x,
      y: world.y,
      z: world.z - 0.3,
      vx: (Math.random() - 0.5) * 9,
      vy: 5 + Math.random() * 7,
      vz: -8 - Math.random() * 8 + (oncoming ? 6 : 0),
      life: 5,
      spin: 7,
    });
  }
  // One front wheel tears off and rolls away.
  const side = impactX >= 0 ? 0 : 1;
  const lost = wheels[side];
  lost.getWorldPosition(world);
  car.remove(lost);
  effects.addDebris(lost, {
    x: world.x,
    y: world.y,
    z: world.z,
    vx: impactX >= 0 ? 7 : -7,
    vy: 6,
    vz: -9,
    life: 5,
    spin: 13,
  });
  // The body crumples and settles on the missing corner.
  crumpleCar(car, carSpec.halfL);
  car.position.y = -0.03;
  car.userData.tilt = { x: 0.06, z: impactX >= 0 ? -0.07 : 0.07 };
}

function crash(other, { byOrca = false } = {}) {
  const impactX = other.x - state.x;
  const oncoming = other.dir === -1;
  const impact = byOrca ? 40 : oncoming ? state.speed + other.speed : Math.abs(state.speed - other.speed) + 12;

  state.mode = 'crashed';
  state.crashTimer = CRASH_TIME;
  state.crashSpin = (impactX >= 0 ? 1 : -1) * Math.min(2.2, 0.5 + impact * 0.03);
  state.lives -= 1;
  renderLives();
  state.shake = 1;
  state.vx = (impactX >= 0 ? -1 : 1) * 4;

  if (byOrca) {
    effects.splash(state.x, 1, 0);
    effects.explode(state.x, 0.9, -carSpec.halfL * 0.5);
    audio.orcaLand();
  } else {
    traffic.wreck(other, impact);
    effects.explode((state.x + other.x) / 2, 0.9, -carSpec.halfL);
  }
  breakCar(impactX, oncoming);
  audio.crash();
  audio.setFire(0.8);
  input.rumble(1, 700);

  const nose = -carSpec.halfL * 0.6;
  state.crashFire = effects.addFire(
    car,
    [
      [0, 0.75, nose, 1.35],
      [0.3, 0.75, nose + 0.5, 1.1],
      [-0.3, 0.75, nose + 0.2, 1.1],
      [0, 1.1, 0.3, 0.8],
    ],
    { lit: true }
  );
  const livesLeft = state.lives > 0 ? `${state.lives} ${state.lives === 1 ? 'life' : 'lives'} left` : 'Last car gone';
  popup(byOrca ? 'Hit by an orca!' : 'Crashed!', livesLeft, 'bad');
}

function respawn() {
  stopCrashFire();
  effects.clearDebris();
  // Return to the nearest lane on the player's own side.
  const lane = Math.max(0, Math.min(2, Math.round((Math.max(0, state.x) - 2.25) / 3.7)));
  state.x = laneX(1, lane);
  state.cameraX = state.x;
  state.vx = 0;
  state.speed = START_SPEED;
  state.steerVisual = 0;
  state.invulnerable = INVULNERABLE_TIME;
  state.mode = 'driving';
  traffic.clearAround(state.s, 70, 190);
  animals.clearAround(state.s, 30, 120);
  orcas.clear();
  placeNewCarModel();
}

function endRun() {
  state.mode = 'gameover';
  stopCrashFire();
  const final = Math.floor(state.score);
  const isBest = final > state.best;
  if (isBest) {
    state.best = final;
    saveBest(final);
  }
  $('finalScore').textContent = final.toLocaleString();
  const parts = [`${Math.floor(state.runTime)}s on the road`];
  if (state.wolvesHit) parts.push(`${state.wolvesHit} ${state.wolvesHit === 1 ? 'wolf' : 'wolves'}`);
  if (state.penguinsHit) parts.push(`${state.penguinsHit} ${state.penguinsHit === 1 ? 'penguin' : 'penguins'}`);
  if (state.petsHit) parts.push(`${state.petsHit} ${state.petsHit === 1 ? 'pet' : 'pets'} hit`);
  $('finalDetail').textContent = isBest ? `New best! ${parts.join(' · ')}` : `Best ${state.best.toLocaleString()} · ${parts.join(' · ')}`;
  show('gameover');
}

function hitAnimal(a) {
  animals.knock(a, state.speed, state.vx);
  const z = -(a.s - state.s);
  effects.dust(a.x, 0.5, z, 14, 1.4);
  if (a.kind === 'wolf') {
    state.score += WOLF_BONUS;
    state.wolvesHit += 1;
    audio.howl();
    popup(`+${WOLF_BONUS}`, 'Wolf', 'good');
    input.rumble(0.5, 180);
  } else if (a.kind === 'penguin') {
    state.score += PENGUIN_BONUS;
    state.penguinsHit += 1;
    audio.penguinHit();
    popup(`+${PENGUIN_BONUS}`, 'Penguin', 'good');
    input.rumble(0.4, 150);
  } else {
    const lost = Math.min(state.score, PET_PENALTY);
    state.score -= lost;
    state.petsHit += 1;
    audio.petHit(a.kind);
    popup(`−${PET_PENALTY}`, a.kind === 'dog' ? 'Oh no, a dog' : 'Oh no, a cat', 'bad');
    input.rumble(0.5, 180);
  }
}

function updateDriving(dt) {
  const { steer, throttle } = input;
  const onShoulder = Math.abs(state.x) > ROAD_EDGE;

  if (throttle > 0) {
    // Thrust builds with speed. A standard car reaches 10,000 mph in about 36 seconds.
    state.speed += carSpec.accel * (1 + state.speed * 0.01) * throttle * dt;
  } else if (throttle < 0) {
    state.speed += (carSpec.brake + state.speed * 0.8) * throttle * dt;
  }
  if (onShoulder && state.speed > SHOULDER_SPEED) state.speed = Math.max(SHOULDER_SPEED, state.speed - (15 + state.speed * 0.6) * dt);
  state.speed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, state.speed));

  // Lateral speed grows with road speed but is capped, so high speed still turns.
  const lateral = Math.min(24, 6 + state.speed * 0.25) * carSpec.grip;
  const targetVx = steer * lateral;
  state.vx += (targetVx - state.vx) * Math.min(1, 8 * dt);
  state.x += state.vx * dt;

  const limit = RAIL_X - carSpec.halfW - 0.08;
  if (Math.abs(state.x) > limit) {
    const side = Math.sign(state.x);
    state.x = side * limit;
    if (Math.abs(state.vx) > 1.5) state.vx *= 0.4;
    state.speed = Math.max(MIN_SPEED, state.speed - (9 + state.speed * 0.5) * dt);
    state.scrapeTimer -= dt;
    if (state.scrapeTimer <= 0) {
      state.scrapeTimer = 0.08;
      effects.sparks(side * (RAIL_X - 0.1), 0.65, -carSpec.halfL * 0.5 + Math.random() * 2, 6, 5);
      audio.scrape();
      input.rumble(0.3, 90);
    }
  }
  if (onShoulder && Math.random() < dt * state.speed * 0.8) {
    effects.dust(state.x + (Math.random() - 0.5) * 1.5, 0.15, carSpec.halfL, 1, 0.7);
  }

  state.score += POINTS_PER_SECOND * dt;
  state.runTime += dt;
  state.invulnerable = Math.max(0, state.invulnerable - dt);

  const halfW = carSpec.halfW * 0.92;
  const halfL = carSpec.halfL * 0.95;
  const toS = state.s + state.speed * dt; // the span this frame's movement will cover
  if (state.invulnerable <= 0) {
    const other = traffic.hit(state.x, state.s, toS, halfW, halfL, dt);
    if (other) {
      crash(other);
      return;
    }
    const orca = orcas.hit(state.x, state.s, toS, halfW, halfL);
    if (orca) {
      crash({ x: orca.x, dir: 1, speed: 0 }, { byOrca: true });
      return;
    }
  }
  const animal = animals.hit(state.x, state.s, toS, halfW, halfL);
  if (animal) hitAnimal(animal);
}

function updateCrashed(dt) {
  state.speed = Math.max(0, state.speed - (27 + state.speed * 2.2) * dt);
  state.vx *= Math.max(0, 1 - 2.5 * dt);
  state.x += state.vx * dt;
  state.crashSpin *= Math.max(0, 1 - 1.8 * dt);
  car.rotation.y += state.crashSpin * dt;
  state.crashTimer -= dt;
  charPlayerCar(car, Math.min(1, (CRASH_TIME - state.crashTimer) / 1.8));
  if (state.crashTimer <= 0.35) $('fade').classList.toggle('on', state.lives > 0);
  if (state.crashTimer <= 0) {
    if (state.lives > 0) {
      respawn();
      $('fade').classList.remove('on');
    } else {
      endRun();
    }
  }
}

function positionCar(dt) {
  car.position.x = state.x;
  if (state.mode === 'driving') {
    const ratio = state.speed > 0 ? state.vx / Math.max(state.speed, 12) : 0;
    const yawTarget = -Math.atan(ratio) * 1.15;
    state.steerVisual += (yawTarget - state.steerVisual) * Math.min(1, 10 * dt);
    car.rotation.y = state.steerVisual;
    car.rotation.z = -state.vx * 0.0065;
    car.rotation.x = input.throttle > 0.1 ? 0.012 : input.throttle < -0.1 ? -0.024 : 0;
    const blink = state.invulnerable > 0 && Math.floor(state.invulnerable * 9) % 2 === 0;
    car.visible = !blink;

    const onShoulder = Math.abs(state.x) > ROAD_EDGE;
    car.position.y = onShoulder ? Math.sin(performance.now() * 0.06) * 0.018 : 0;
    const brakeOn = input.throttle < -0.1;
    car.userData.brakeMat.emissiveIntensity = brakeOn ? 3.8 : 1.1;
  } else if (state.mode === 'crashed') {
    car.visible = true;
    const t = car.userData.tilt;
    if (t) {
      car.rotation.x += (t.x - car.rotation.x) * Math.min(1, 6 * dt);
      car.rotation.z += (t.z - car.rotation.z) * Math.min(1, 6 * dt);
    }
  } else if (state.mode === 'menu') {
    car.visible = true;
    car.position.set(state.x, 0, 0);
    car.rotation.set(0, 0, 0);
  }

  car.userData.animate?.(performance.now() / 1000);

  const spinAmount = state.speed * dt;
  for (const wheel of car.userData.wheels) {
    if (wheel.parent) wheel.rotation.x -= spinAmount / 0.35;
  }
  const { wheels } = car.userData;
  const steerAngle = state.mode === 'driving' ? -input.steer * 0.35 : 0;
  for (const i of [0, 1]) {
    if (wheels[i].parent) {
      wheels[i].rotation.order = 'YXZ';
      wheels[i].rotation.y = steerAngle;
    }
  }
}

function updateCamera(dt) {
  if (state.mode === 'menu') {
    state.menuAngle += dt * 0.28;
    const r = carSpec.menuDistance;
    camera.position.set(state.x + Math.sin(state.menuAngle) * r, 1.5, Math.cos(state.menuAngle) * r);
    camera.lookAt(state.x, 0.1, 0);
    camera.fov = 44;
    camera.updateProjectionMatrix();
    return;
  }
  state.cameraX += (state.x - state.cameraX) * Math.min(1, 5.5 * dt);
  const feel = speedFeel(state.speed);
  const tall = carSpec.cameraLift;
  const back = 6.7 + feel * 1.6 + tall;
  const height = 2.75 + tall;

  let shakeX = 0;
  let shakeY = 0;
  state.shake = Math.max(0, state.shake - dt * 1.6);
  if (state.shake > 0) {
    shakeX += (Math.random() - 0.5) * state.shake * 0.8;
    shakeY += (Math.random() - 0.5) * state.shake * 0.55;
  }
  if (state.mode === 'driving' && Math.abs(state.x) > ROAD_EDGE) {
    shakeY += (Math.random() - 0.5) * 0.045;
    shakeX += (Math.random() - 0.5) * 0.03;
  }
  camera.position.set(state.cameraX + shakeX, height + shakeY, back);
  camera.lookAt(state.cameraX * 0.97 + state.x * 0.03, 1.15, -14);
  const fov = 59 + feel * feel * 38;
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov += (fov - camera.fov) * Math.min(1, 3 * dt);
    camera.updateProjectionMatrix();
  }
}

function togglePause() {
  if (state.mode === 'driving' || state.mode === 'crashed') {
    state.pausedFrom = state.mode;
    state.mode = 'paused';
    show('pause');
  } else if (state.mode === 'paused') {
    state.mode = state.pausedFrom;
    show('pause', false);
  }
}

function hud() {
  $('score').textContent = Math.floor(state.score).toLocaleString();
  $('speed').textContent = Math.round(state.speed * MS_TO_MPH);
}

function padStatusText() {
  const backend = backendIsWebGPU ? 'WebGPU' : 'WebGL 2 fallback, this browser has no WebGPU';
  const best = state.best ? `Best ${state.best.toLocaleString()} · ` : '';
  const pad = input.pad ? `${input.padName} connected` : 'Press a button on your controller to connect it';
  return `${best}${pad} · ${backend}`;
}

function handleMenus() {
  input.touch.setActive(state.mode === 'driving' || state.mode === 'crashed');
  if (input.mute) popup(audio.toggleMute() ? 'Muted' : 'Sound on', '', 'info');
  if (state.mode === 'menu') {
    if (input.menuMove) setCar(state.carIndex + input.menuMove);
    if (input.confirm) startRun();
  } else if (state.mode === 'gameover') {
    if (input.confirm) startRun();
    if (input.menuMove) goToMenu();
  } else if (state.mode === 'paused') {
    if (input.pause || input.confirm) togglePause();
  } else if (input.pause) {
    togglePause();
  }
  const noticeOn = state.mode === 'driving' && input.pad && audio.blocked && !audio.muted;
  show('notice', !!noticeOn);
  if (noticeOn) $('notice').textContent = 'To enable sound, click or tap the game once';
}

$('prevCar').onclick = () => setCar(state.carIndex - 1);
$('nextCar').onclick = () => setCar(state.carIndex + 1);
$('startBtn').onclick = startRun;
$('resumeBtn').onclick = togglePause;
$('quitBtn').onclick = goToMenu;
$('againBtn').onclick = startRun;
$('garageBtn').onclick = goToMenu;
for (const button of document.querySelectorAll('button')) {
  // Keeps Space and Enter from re-triggering a clicked button during play.
  button.addEventListener('click', () => button.blur());
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && (state.mode === 'driving' || state.mode === 'crashed')) togglePause();
});

let last = performance.now();
let statusTimer = 0;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  input.update(dt);
  handleMenus();

  const before = state.s;
  if (state.mode === 'driving') updateDriving(dt);
  else if (state.mode === 'crashed') updateCrashed(dt);

  if (state.mode !== 'paused') {
    state.s += state.speed * dt;
    const moved = state.s - before;
    const active = state.mode === 'driving' || state.mode === 'crashed';
    traffic.update(dt, {
      playerS: state.s,
      playerSpeed: state.speed,
      playerX: state.x,
      playerHalfL: carSpec.halfL,
      playerSolid: active && state.invulnerable <= 0,
      playerStopped: state.mode === 'crashed',
      animals: animals.list,
      runTime: state.runTime,
      spawning: state.mode === 'driving',
      onVeer: () => popup('Wrong-way driver!', 'Oncoming car in your lanes', 'info'),
    });
    animals.update(dt, {
      playerS: state.s,
      playerX: state.x,
      playerSpeed: state.speed,
      spawning: state.mode === 'driving',
      traffic,
    });
    effects.update(dt, camera, moved);
    const orcaStarted = orcas.update(dt, {
      playerS: state.s,
      playerX: state.x,
      playerSpeed: state.speed,
      spawning: state.mode === 'driving',
      traffic,
      onLand: (distance) => audio.orcaLand(Math.max(0.15, 1 - distance / 300)),
    });
    if (orcaStarted) {
      audio.orcaFall(2.5);
      popup('Incoming orca!', 'Dodge the shadow', 'info');
    }
    positionCar(dt);
  }
  world.update(state.s);
  updateCamera(state.mode === 'paused' ? 0 : dt);

  audio.updateDriving({
    active: state.mode === 'driving',
    electric: !!carSpec.electric,
    speed: state.speed,
    speedRatio: speedFeel(state.speed),
    throttle: input.throttle,
    shoulder: state.mode === 'driving' && Math.abs(state.x) > ROAD_EDGE,
    dt,
  });

  hud();
  statusTimer -= dt;
  if (statusTimer <= 0) {
    statusTimer = 0.5;
    $('padStatus').textContent = padStatusText();
  }
  if (canvas.width && canvas.height) renderer.render(scene, camera); // a hidden window can be zero-sized
}

bootStep('Preparing the cars');
await nextPaint();
setCar(0);
renderLives();
world.update(state.s);
positionCar(0);
updateCamera(0);

bootStep('Compiling shaders');
await nextPaint();
await renderer.compileAsync(scene, camera);

bootStep('Drawing the first frame');
await nextPaint();
if (canvas.width && canvas.height) renderer.render(scene, camera);
bootStep('Ready');
await nextPaint();

clearTimeout(bootTimer);
$('boot').classList.add('hidden');
show('menu');
last = performance.now();
renderer.setAnimationLoop(frame);

if (import.meta.env.DEV) {
  window.__game = { state, traffic, animals, orcas, input, audio, effects, renderer, camera, popup, hitAnimal, startRun, get car() { return car; } };
}
