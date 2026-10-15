import { Vector3 } from 'three'
import { BULLET_TIME, GUN, PLAYER, WAVES } from './config'
import { PLAYER_START } from './level'

/**
 * Mutable simulation state. It is updated every frame outside React so a frame never
 * triggers a re-render. Only the HUD store (store.ts) is reactive.
 */

export interface Player {
  pos: Vector3
  yaw: number
  pitch: number
  health: number
  ammo: number
  reloadTimer: number
  fireCooldown: number
  /** Seconds into the current dodge, or -1 when not dodging. */
  dodgeTime: number
  dodgeDir: Vector3
  dodgeCooldown: number
  /** Movement this frame, in units per second. Drives the leg animation. */
  vel: Vector3
  /** Counters that animations watch to trigger one-shot clips (recoil, flinch). */
  shots: number
  hits: number
}

export interface Enemy {
  id: number
  pos: Vector3
  vel: Vector3
  yaw: number
  health: number
  alive: boolean
  /** Seconds since death. */
  deadTime: number
  fireCooldown: number
  strafeDir: number
  strafeTimer: number
  hitFlash: number
  muzzleFlash: number
  shots: number
  hits: number
}

export interface Bullet {
  pos: Vector3
  prev: Vector3
  dir: Vector3
  speed: number
  fromPlayer: boolean
  life: number
}

export interface Particle {
  pos: Vector3
  vel: Vector3
  life: number
  maxLife: number
  color: string
  size: number
}

export interface Pickup {
  id: number
  pos: Vector3
}

export interface World {
  player: Player
  enemies: Enemy[]
  bullets: Bullet[]
  particles: Particle[]
  pickups: Pickup[]
  bulletTime: boolean
  bulletTimeMeter: number
  /** Scaled world delta of the last frame (0 while paused). Read by visual-only systems such as snow. */
  worldDt: number
  /** The player's delta of the last frame: slowed less than the world during bullet time. */
  playerDt: number
  /** 0..1, how far the visuals are into bullet time. Eases in and out. */
  slowMoBlend: number
  muzzleFlash: number
  muzzlePos: Vector3
  wave: number
  kills: number
  nextWaveIn: number
  nextId: number
}

export function createWorld(): World {
  return {
    player: {
      pos: PLAYER_START.clone(),
      yaw: 0,
      pitch: 0.05,
      health: PLAYER.maxHealth,
      ammo: GUN.magazine,
      reloadTimer: 0,
      fireCooldown: 0,
      dodgeTime: -1,
      dodgeDir: new Vector3(),
      dodgeCooldown: 0,
      vel: new Vector3(),
      shots: 0,
      hits: 0,
    },
    enemies: [],
    bullets: [],
    particles: [],
    pickups: [],
    bulletTime: false,
    bulletTimeMeter: BULLET_TIME.max,
    worldDt: 0,
    playerDt: 0,
    slowMoBlend: 0,
    muzzleFlash: 0,
    muzzlePos: new Vector3(),
    wave: 0,
    kills: 0,
    nextWaveIn: WAVES.firstDelay,
    nextId: 1,
  }
}

/** The single live world. Reset in place so components holding a reference stay valid. */
export const world: World = createWorld()

export function resetWorld(): void {
  Object.assign(world, createWorld())
}
