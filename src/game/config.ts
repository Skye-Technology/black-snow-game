/** Every gameplay tuning number lives here. */

export const ARENA_HALF = 22

export const PLAYER = {
  radius: 0.4,
  speed: 5.5,
  maxHealth: 100,
  lookSensitivity: 0.0022,
  minPitch: -0.55,
  maxPitch: 0.85,
}

/** The shootdodge: a dive with slow motion while airborne. */
export const DODGE = {
  speed: 9,
  airTime: 0.6,
  recoverTime: 0.35,
  cooldown: 0.5,
}

export const GUN = {
  magazine: 18,
  fireInterval: 0.11,
  reloadTime: 1.3,
  bulletSpeed: 75,
  damage: 34,
  headshotMultiplier: 3,
  spread: 0.006,
}

export const ENEMY = {
  radius: 0.4,
  speed: 3.2,
  health: 100,
  bulletSpeed: 26,
  damage: 8,
  fireMin: 0.9,
  fireMax: 2.1,
  firstShotDelay: 1.6,
  spread: 0.045,
  preferredRange: 9,
  sightRange: 32,
  removeAfter: 5,
}

export const BULLET_TIME = {
  /** World speed while bullet time is on. */
  worldScale: 0.25,
  /** The player moves and fires faster than the world while it is on. */
  playerScale: 0.55,
  max: 100,
  drainPerSec: 18,
  refillPerKill: 14,
  regenPerSec: 1.5,
}

export const PAINKILLER = {
  heal: 35,
  dropChance: 0.4,
  pickupRadius: 1.1,
}

export const WAVES = {
  firstDelay: 1.5,
  betweenDelay: 3,
  baseCount: 2,
  maxCount: 10,
}
