import { Vector3 } from 'three'
import { ARENA_HALF } from './config'
import { box, type Box } from './physics'

export type SolidKind = 'wall' | 'crate' | 'pillar' | 'container' | 'car'

export interface Solid {
  kind: SolidKind
  box: Box
  color: string
}

const A = ARENA_HALF
const WALL_H = 6

/** A snowed-in back-alley courtyard. Every solid blocks movement, bullets and line of sight. */
export const SOLIDS: Solid[] = [
  // Perimeter
  { kind: 'wall', box: box(0, -A - 0.5, 2 * A + 2, 1, WALL_H), color: '#3b2a25' },
  { kind: 'wall', box: box(0, A + 0.5, 2 * A + 2, 1, WALL_H), color: '#3b2a25' },
  { kind: 'wall', box: box(-A - 0.5, 0, 1, 2 * A, WALL_H), color: '#33262a' },
  { kind: 'wall', box: box(A + 0.5, 0, 1, 2 * A, WALL_H), color: '#33262a' },

  // Shipping containers
  { kind: 'container', box: box(-10, -8, 6, 2.4, 2.6), color: '#2c4656' },
  { kind: 'container', box: box(11, 9, 2.4, 6, 2.6), color: '#5a2d2a' },
  { kind: 'container', box: box(9, -14, 6, 2.4, 2.6), color: '#3d4a2c' },

  // Pillars
  { kind: 'pillar', box: box(-5, 4, 1, 1, 5), color: '#585c63' },
  { kind: 'pillar', box: box(5, -4, 1, 1, 5), color: '#585c63' },
  { kind: 'pillar', box: box(-14, 12, 1, 1, 5), color: '#585c63' },
  { kind: 'pillar', box: box(15, -2, 1, 1, 5), color: '#585c63' },

  // Waist-high crates
  { kind: 'crate', box: box(0, 8, 1.4, 1.4, 1.1), color: '#5b452c' },
  { kind: 'crate', box: box(1.6, 8.3, 1.4, 1.4, 1.1), color: '#5b452c' },
  { kind: 'crate', box: box(-3, -12, 1.4, 1.4, 1.1), color: '#5b452c' },
  { kind: 'crate', box: box(-16, 0, 1.4, 1.4, 1.1), color: '#5b452c' },
  { kind: 'crate', box: box(17, 16, 1.4, 1.4, 1.1), color: '#5b452c' },
  { kind: 'crate', box: box(-6, 16, 1.4, 1.4, 1.1), color: '#5b452c' },

  // Abandoned car
  { kind: 'car', box: box(-1, -2, 4.2, 1.9, 1.3), color: '#1d1f24' },
]

export const LAMPS: Vector3[] = [
  new Vector3(-12, 0, 4),
  new Vector3(12, 0, -6),
  new Vector3(0, 0, -18),
  new Vector3(4, 0, 18),
]

/** Everything that blocks movement, bullets, sight and the camera. Lamp posts are drawn by Level but collide too. */
export const BOXES: Box[] = [...SOLIDS.map((s) => s.box), ...LAMPS.map((p) => box(p.x, p.z, 0.25, 0.25, 4.5))]

export const SPAWN_POINTS: Vector3[] = [
  new Vector3(-19, 0, -19),
  new Vector3(0, 0, -20),
  new Vector3(19, 0, -19),
  new Vector3(20, 0, 0),
  new Vector3(19, 0, 19),
  new Vector3(0, 0, 20),
  new Vector3(-19, 0, 19),
  new Vector3(-20, 0, 0),
]

export const PLAYER_START = new Vector3(0, 0, 14)
