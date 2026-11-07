// Shared tuning values. Distances are metres, speeds are metres per second.

export const LANE_WIDTH = 3.7;
export const MEDIAN_HALF = 0.4;
export const LANES_PER_SIDE = 3;
export const ROAD_EDGE = MEDIAN_HALF + LANES_PER_SIDE * LANE_WIDTH; // 11.5
export const SHOULDER_EDGE = ROAD_EDGE + 3;
export const RAIL_X = SHOULDER_EDGE + 0.4;

// dir +1 travels with the player (right-hand side, +x); dir -1 is oncoming.
export const laneX = (dir, lane) => dir * (MEDIAN_HALF + (lane + 0.5) * LANE_WIDTH);

export const FOG_NEAR = 260;
export const FOG_FAR = 930;
export const SPAWN_AHEAD = 960;
export const SPAWN_BEHIND = 170;

export const MIN_SPEED = 14; // the car never stops while driving
export const START_SPEED = 28;
export const MS_TO_MPH = 2.23694;
export const MAX_SPEED = 10000 / MS_TO_MPH; // 10,000 mph
export const SHOULDER_SPEED = 22; // gravel drags you down to this

export const START_LIVES = 3;
export const POINTS_PER_SECOND = 10;
export const PET_PENALTY = 100;
export const WOLF_BONUS = 150;
export const PENGUIN_BONUS = 200;

// Chance that each animal crossing the road is this kind. These add up to 1.
export const ANIMAL_CHANCES = { dog: 0.3, cat: 0.26, wolf: 0.24, penguin: 0.2 };
export const INVULNERABLE_TIME = 3;
export const CRASH_TIME = 3.6;

/** True if an object overlaps the span the player covered during this frame. */
export function sweepOverlaps(objectS, objectHalf, fromS, toS, halfL) {
  return objectS + objectHalf >= fromS - halfL && objectS - objectHalf <= toS + halfL;
}

// Speed effects use a log scale, so both highway and extreme speeds feel different.
export const speedFeel = (speed) => Math.min(1, Math.log(1 + speed / 20) / Math.log(1 + MAX_SPEED / 20));

// Every car shares one acceleration rate, except the two electric models at twice that.
const STANDARD_ACCEL = 10;
const ELECTRIC_ACCEL = STANDARD_ACCEL * 2;

export const CARS = [
  {
    id: 'sedan',
    name: 'Blue Sedan',
    blurb: 'Camry-style midsize. Easy to drive and nimble between lanes.',
    accel: STANDARD_ACCEL,
    brake: 20,
    grip: 1.1,
    halfW: 0.92,
    halfL: 2.44,
    cameraLift: 0,
    menuDistance: 7.8,
  },
  {
    id: 'suv',
    name: 'Gray SUV',
    blurb: 'X7-style full-size luxury. Heavier and wider, with a high seating position.',
    accel: STANDARD_ACCEL,
    brake: 18,
    grip: 0.92,
    halfW: 1.0,
    halfL: 2.58,
    cameraLift: 0.34,
    menuDistance: 8.2,
  },
  {
    id: 'ev',
    name: 'White EV Sedan',
    blurb: 'Model 3-style electric. Accelerates twice as hard as gas cars.',
    electric: true,
    accel: ELECTRIC_ACCEL,
    brake: 21,
    grip: 1.14,
    halfW: 0.93,
    halfL: 2.35,
    cameraLift: 0,
    menuDistance: 7.6,
  },
  {
    id: 'truck',
    name: 'Steel Electric Truck',
    blurb: 'Cybertruck-style wedge. Huge, hard-edged, and twice the acceleration.',
    electric: true,
    accel: ELECTRIC_ACCEL,
    brake: 17,
    grip: 0.9,
    halfW: 1.02,
    halfL: 2.84,
    cameraLift: 0.36,
    menuDistance: 9,
  },
  {
    id: 'wedge',
    name: 'Yellow Wedge Supercar',
    blurb: 'Lamborghini-style. Razor-edged, very low, and the sharpest steering here.',
    accel: STANDARD_ACCEL,
    brake: 24,
    grip: 1.22,
    halfW: 1.0,
    halfL: 2.39,
    cameraLift: -0.1,
    menuDistance: 7.4,
  },
  {
    id: 'coupe',
    name: 'Red Sports Coupe',
    blurb: 'Porsche 911-style. Round lamps, a sloping tail and wide rear hips.',
    accel: STANDARD_ACCEL,
    brake: 25,
    grip: 1.2,
    halfW: 0.95,
    halfL: 2.26,
    cameraLift: -0.05,
    menuDistance: 7.2,
  },
  {
    id: 'hyper',
    name: 'Two-Tone Hypercar',
    blurb: 'Bugatti-style. Horseshoe grille, a sweeping side curve and a full-width tail lamp.',
    accel: STANDARD_ACCEL,
    brake: 26,
    grip: 1.16,
    halfW: 1.02,
    halfL: 2.27,
    cameraLift: -0.05,
    menuDistance: 7.4,
  },
  {
    id: 'princess',
    name: 'Pink Princess Car',
    blurb: 'Popemobile-style clear canopy, with a waving princess riding on top.',
    accel: STANDARD_ACCEL,
    brake: 20,
    grip: 1.0,
    halfW: 0.98,
    halfL: 2.4,
    cameraLift: 0.5,
    menuDistance: 8.6,
  },
  {
    id: 'evsuv',
    name: 'Blue-Gray EV Crossover',
    blurb: 'Model Y-style electric. Silent, roomy, and twice the acceleration of gas cars.',
    electric: true,
    accel: ELECTRIC_ACCEL,
    brake: 20,
    grip: 1.04,
    halfW: 0.96,
    halfL: 2.38,
    cameraLift: 0.16,
    menuDistance: 8,
  },
  {
    id: 'hatch',
    name: 'Red Bunny Hatchback',
    blurb: 'A tired old hatchback, driven by a car full of mischievous white rabbits.',
    accel: STANDARD_ACCEL,
    brake: 16,
    grip: 1.0,
    halfW: 0.84,
    halfL: 1.95,
    cameraLift: 0.08,
    menuDistance: 7,
  },
];
