// Keyboard and gamepad input, reduced to one analog steer/throttle pair.
// Nintendo Switch Pro Controllers and paired Joy-Cons appear as regular gamepads.

import { TouchControls } from './touch.js';

const DEADZONE = 0.14;
const KEY_RAMP = 5; // how quickly digital keys sweep to full deflection

// Standard-mapping indices. On a Switch controller the labels are:
// 0 = B, 1 = A, 2 = Y, 3 = X, 9 = Plus.
const BTN_B = 0;
const BTN_A = 1;
const BTN_Y = 2;
const BTN_X = 3;
const BTN_PLUS = 9;

const CONFIRM_BUTTONS = [BTN_A, BTN_B, BTN_X, BTN_Y];

function applyRadialDeadzone(x, y) {
  const mag = Math.hypot(x, y);
  if (mag < DEADZONE) return [0, 0];
  const scaled = Math.min(1, (mag - DEADZONE) / (1 - DEADZONE));
  return [(x / mag) * scaled, (y / mag) * scaled];
}

export class Input {
  constructor() {
    this.touch = new TouchControls();
    this.keys = new Set();
    this.pressedKeys = new Set();
    this.keySteer = 0;
    this.keyThrottle = 0;
    this.steer = 0;
    this.throttle = 0;
    this.pad = null;
    this.prevButtons = [];
    this.prevStickX = 0;
    this.confirm = false;
    this.pause = false;
    this.menuMove = 0;

    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressedKeys.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  findPad() {
    const pads = [...(navigator.getGamepads?.() ?? [])].filter((p) => p && p.connected && p.axes.length >= 2);
    return pads.find((p) => /nintendo|pro controller|joy-?con|switch/i.test(p.id)) ?? pads[0] ?? null;
  }

  get padName() {
    return this.pad ? this.pad.id.replace(/\s*\(.*$/, '').trim() || 'Gamepad' : null;
  }

  update(dt) {
    const k = this.keys;
    const was = (...codes) => codes.some((c) => this.pressedKeys.has(c));
    const held = (...codes) => codes.some((c) => k.has(c));

    const wantSteer = (held('KeyD', 'ArrowRight') ? 1 : 0) - (held('KeyA', 'ArrowLeft') ? 1 : 0);
    const wantThrottle = (held('KeyW', 'ArrowUp') ? 1 : 0) - (held('KeyS', 'ArrowDown') ? 1 : 0);
    const step = KEY_RAMP * dt;
    this.keySteer += Math.max(-step, Math.min(step, wantSteer - this.keySteer));
    this.keyThrottle = wantThrottle; // pedals respond instantly

    this.confirm = was('Enter', 'Space');
    this.pause = was('KeyP', 'Escape');
    this.mute = was('KeyM');
    this.menuMove = (was('KeyD', 'ArrowRight') ? 1 : 0) - (was('KeyA', 'ArrowLeft') ? 1 : 0);
    this.pressedKeys.clear();

    let padX = 0;
    let padY = 0;
    this.pad = this.findPad();
    if (this.pad) {
      [padX, padY] = applyRadialDeadzone(this.pad.axes[0], this.pad.axes[1]);
      const buttons = this.pad.buttons.map((b) => b.pressed);
      const edge = (i) => buttons[i] && !this.prevButtons[i];
      if (CONFIRM_BUTTONS.some(edge)) this.confirm = true;
      if (edge(BTN_PLUS)) this.pause = true;
      this.prevButtons = buttons;

      const stickDir = padX > 0.6 ? 1 : padX < -0.6 ? -1 : 0;
      if (stickDir !== 0 && this.prevStickX === 0) this.menuMove = stickDir;
      this.prevStickX = stickDir;
    } else {
      this.prevButtons = [];
      this.prevStickX = 0;
    }

    // Whichever device is deflected furthest wins, so they can all stay connected.
    const strongest = (values) => values.reduce((best, v) => (Math.abs(v) > Math.abs(best) ? v : best), 0);
    const padThrottle = -padY; // stick up is a negative axis value
    this.steer = strongest([padX, this.keySteer, this.touch.steer]);
    this.throttle = strongest([padThrottle, this.keyThrottle, this.touch.throttle]);
    if (this.touch.consumePause()) this.pause = true;
    if (this.touch.consumeMute()) this.mute = true;
  }

  rumble(strength = 1, ms = 400) {
    const actuator = this.pad?.vibrationActuator;
    if (!actuator?.playEffect) return;
    actuator
      .playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.7 })
      .catch(() => {});
  }
}
