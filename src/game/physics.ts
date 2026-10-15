import { Vector3 } from 'three'

/** Axis-aligned box. All level geometry is made of these. */
export interface Box {
  min: Vector3
  max: Vector3
}

/** Box centred on (cx, cz) with footprint w × d, from y0 up to y0 + h. */
export function box(cx: number, cz: number, w: number, d: number, h: number, y0 = 0): Box {
  return {
    min: new Vector3(cx - w / 2, y0, cz - d / 2),
    max: new Vector3(cx + w / 2, y0 + h, cz + d / 2),
  }
}

const AXES = ['x', 'y', 'z'] as const

/** Distance along a normalised ray to the first point inside the box, or null on a miss. */
export function rayBox(origin: Vector3, dir: Vector3, b: Box): number | null {
  let tMin = -Infinity
  let tMax = Infinity
  for (const axis of AXES) {
    const o = origin[axis]
    const d = dir[axis]
    if (Math.abs(d) < 1e-12) {
      if (o < b.min[axis] || o > b.max[axis]) return null
      continue
    }
    let t1 = (b.min[axis] - o) / d
    let t2 = (b.max[axis] - o) / d
    if (t1 > t2) [t1, t2] = [t2, t1]
    tMin = Math.max(tMin, t1)
    tMax = Math.min(tMax, t2)
    if (tMin > tMax) return null
  }
  if (tMax < 0) return null
  return Math.max(tMin, 0)
}

/** Nearest hit distance against a list of boxes, or Infinity if nothing is hit within maxDist. */
export function rayBoxes(origin: Vector3, dir: Vector3, boxes: Box[], maxDist: number): number {
  let best = Infinity
  for (const b of boxes) {
    const t = rayBox(origin, dir, b)
    if (t !== null && t <= maxDist && t < best) best = t
  }
  return best
}

/** Push a character (a circle on the XZ plane) out of any boxes it overlaps. Mutates pos. */
export function resolveCircleVsBoxes(pos: Vector3, radius: number, boxes: Box[]): void {
  for (const b of boxes) {
    const cx = Math.min(Math.max(pos.x, b.min.x), b.max.x)
    const cz = Math.min(Math.max(pos.z, b.min.z), b.max.z)
    const dx = pos.x - cx
    const dz = pos.z - cz
    const d2 = dx * dx + dz * dz
    if (d2 >= radius * radius) continue
    if (d2 > 1e-12) {
      const d = Math.sqrt(d2)
      pos.x += (dx / d) * (radius - d)
      pos.z += (dz / d) * (radius - d)
      continue
    }
    // Centre is inside the box: leave through the nearest face.
    const exits = [
      { pen: pos.x - b.min.x, apply: () => (pos.x = b.min.x - radius) },
      { pen: b.max.x - pos.x, apply: () => (pos.x = b.max.x + radius) },
      { pen: pos.z - b.min.z, apply: () => (pos.z = b.min.z - radius) },
      { pen: b.max.z - pos.z, apply: () => (pos.z = b.max.z + radius) },
    ]
    exits.reduce((a, e) => (e.pen < a.pen ? e : a)).apply()
  }
}

const d1 = new Vector3()
const d2 = new Vector3()
const r = new Vector3()
const c1 = new Vector3()
const c2 = new Vector3()
const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1)

/**
 * Does segment p0→p1 come within `radius` of the capsule axis a→b?
 * Returns the parameter (0..1) along p0→p1 of the closest approach, or null.
 * Bullets move a short distance per frame, so closest approach is a good stand-in for the entry point.
 */
export function segmentCapsule(p0: Vector3, p1: Vector3, a: Vector3, b: Vector3, radius: number): number | null {
  d1.subVectors(p1, p0)
  d2.subVectors(b, a)
  r.subVectors(p0, a)
  const aa = d1.dot(d1)
  const e = d2.dot(d2)
  const f = d2.dot(r)
  let s: number
  let t: number
  if (aa <= 1e-12 && e <= 1e-12) {
    s = 0
    t = 0
  } else if (aa <= 1e-12) {
    s = 0
    t = clamp01(f / e)
  } else {
    const c = d1.dot(r)
    if (e <= 1e-12) {
      t = 0
      s = clamp01(-c / aa)
    } else {
      const bb = d1.dot(d2)
      const denom = aa * e - bb * bb
      s = denom !== 0 ? clamp01((bb * f - c * e) / denom) : 0
      t = (bb * s + f) / e
      if (t < 0) {
        t = 0
        s = clamp01(-c / aa)
      } else if (t > 1) {
        t = 1
        s = clamp01((bb - c) / aa)
      }
    }
  }
  c1.copy(p0).addScaledVector(d1, s)
  c2.copy(a).addScaledVector(d2, t)
  return c1.distanceToSquared(c2) <= radius * radius ? s : null
}
