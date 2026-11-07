# Highway Drive

A 3D highway driving game built with Three.js and WebGPU. Browsers without
WebGPU fall back to WebGL 2 automatically.

**Play it online:** https://samvelst.github.io/highway-drive/

Every push to `main` rebuilds the game and publishes it to GitHub Pages
through `.github/workflows/deploy.yml`.

## Run it

```bash
npm install
npm run dev
```

## Play on other devices on your network

```bash
npm run lan
```

Open the `Network:` address it prints, such as `http://192.168.1.20:4173`, on the
other device. Press Ctrl+C to stop the server.

This uses plain HTTP, so browsers on other devices use WebGL 2 instead of WebGPU
and may block controllers. Touch controls still work.

If a device has trouble starting the game, the loading screen shows how far it
got and any error. Adding `?webgl=1` to the address forces WebGL 2.

## Controls

| Action | Keyboard | Switch controller | Touchscreen |
| --- | --- | --- | --- |
| Steer | A / D or arrow keys | Left stick left and right | Thumb stick left and right |
| Speed up, slow down | W / S or arrow keys | Left stick up and down | Hold GO or BRAKE, or thumb stick up and down |
| Select | Enter or Space | A | Tap |
| Pause | P or Esc | + | Pause button |
| Mute | M | | Music note button |

Press a button on the controller once so the browser detects it. If the game
started from the controller and is silent, click the page or press a key,
because browsers can require that before they play sound.

## Scoring

- Driving: +10 points per second
- Wolf: +150, with a howl
- Penguin: +200 (1 in 5 animals is a penguin)
- Dog or cat: -100, with a sad sound
- Crash, wrong-way car or falling orca: lose one of three lives

## Project layout

- `src/main.js`: game states and main loop
- `src/config.js`: tuning values and the car list
- `src/cars.js`, `src/geometry.js`: vehicle models
- `src/traffic.js`, `src/animals.js`, `src/orcas.js`: road hazards
- `src/world.js`, `src/effects.js`, `src/audio.js`: scenery, particles and sound
- `src/input.js`: keyboard and gamepad input
