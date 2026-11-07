// On-screen controls for touchscreens: a floating analog stick and two pedals.
// Pointer events are tracked by id so both thumbs can be used at the same time.

const STICK_RADIUS = 62; // pixels of thumb travel for full deflection
const DEADZONE = 0.1;

const $ = (id) => document.getElementById(id);

function clampUnit(value) {
  const magnitude = Math.abs(value);
  if (magnitude < DEADZONE) return 0;
  return (Math.sign(value) * Math.min(1, (magnitude - DEADZONE) / (1 - DEADZONE)));
}

export class TouchControls {
  constructor() {
    this.enabled = false;
    this.active = false;
    this.steer = 0;
    this.stickThrottle = 0;
    this.stickId = null;
    this.gasId = null;
    this.brakeId = null;
    this.pausePressed = false;
    this.mutePressed = false;

    this.root = $('touch');
    this.zone = $('stickZone');
    this.base = $('stickBase');
    this.knob = $('stickKnob');
    this.gas = $('gasPedal');
    this.brake = $('brakePedal');

    if (navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches) this.enable();
    // Covers devices that only reveal a touchscreen on first use.
    addEventListener('touchstart', () => this.enable(), { passive: true, once: true });

    this.zone.addEventListener('pointerdown', (e) => this.startStick(e));
    this.bindPedal(this.gas, 'gasId');
    this.bindPedal(this.brake, 'brakeId');
    addEventListener('pointermove', (e) => this.moveStick(e));
    addEventListener('pointerup', (e) => this.release(e));
    addEventListener('pointercancel', (e) => this.release(e));

    $('touchPause').addEventListener('click', () => (this.pausePressed = true));
    $('touchMute').addEventListener('click', () => (this.mutePressed = true));
    // Stops long presses from opening the browser's context menu.
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  enable() {
    this.enabled = true;
    document.body.classList.add('touch-device');
  }

  /** Shows the controls only while driving, and drops any held input when hidden. */
  setActive(active) {
    const show = active && this.enabled;
    if (show === this.active) return;
    this.active = show;
    this.root.classList.toggle('hidden', !show);
    if (!show) this.releaseAll();
  }

  bindPedal(element, idKey) {
    element.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this[idKey] = e.pointerId;
      element.classList.add('held');
    });
  }

  startStick(e) {
    e.preventDefault();
    if (this.stickId !== null) return;
    this.stickId = e.pointerId;
    this.originX = e.clientX;
    this.originY = e.clientY;
    this.base.classList.add('held');
    // The stick appears under the thumb, wherever it lands in the zone.
    const zoneBox = this.zone.getBoundingClientRect();
    this.base.style.left = `${e.clientX - zoneBox.left}px`;
    this.base.style.top = `${e.clientY - zoneBox.top}px`;
    this.base.style.bottom = 'auto';
    this.placeKnob(0, 0);
  }

  moveStick(e) {
    if (e.pointerId !== this.stickId) return;
    let dx = (e.clientX - this.originX) / STICK_RADIUS;
    let dy = (e.clientY - this.originY) / STICK_RADIUS;
    const magnitude = Math.hypot(dx, dy);
    if (magnitude > 1) {
      dx /= magnitude;
      dy /= magnitude;
    }
    this.placeKnob(dx * STICK_RADIUS, dy * STICK_RADIUS);
    this.steer = clampUnit(dx);
    this.stickThrottle = clampUnit(-dy); // pushing up speeds up
  }

  placeKnob(x, y) {
    this.knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  }

  release(e) {
    if (e.pointerId === this.stickId) this.resetStick();
    if (e.pointerId === this.gasId) {
      this.gasId = null;
      this.gas.classList.remove('held');
    }
    if (e.pointerId === this.brakeId) {
      this.brakeId = null;
      this.brake.classList.remove('held');
    }
  }

  resetStick() {
    this.stickId = null;
    this.steer = 0;
    this.stickThrottle = 0;
    this.base.classList.remove('held');
    this.base.style.left = '';
    this.base.style.top = '';
    this.base.style.bottom = '';
    this.placeKnob(0, 0);
  }

  releaseAll() {
    this.resetStick();
    this.gasId = null;
    this.brakeId = null;
    this.gas.classList.remove('held');
    this.brake.classList.remove('held');
  }

  /** Pedals override the stick's up and down, and braking beats accelerating. */
  get throttle() {
    if (this.brakeId !== null) return -1;
    if (this.gasId !== null) return 1;
    return this.stickThrottle;
  }

  consumePause() {
    const pressed = this.pausePressed;
    this.pausePressed = false;
    return pressed;
  }

  consumeMute() {
    const pressed = this.mutePressed;
    this.mutePressed = false;
    return pressed;
  }
}
