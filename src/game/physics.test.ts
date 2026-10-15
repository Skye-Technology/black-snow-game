import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Vector3 } from 'three'
import { box, rayBox, rayBoxes, resolveCircleVsBoxes, segmentCapsule } from './physics'

const crate = box(0, 0, 2, 2, 2) // x,z in [-1,1], y in [0,2]

test('rayBox hits the near face of a box', () => {
  const t = rayBox(new Vector3(-5, 1, 0), new Vector3(1, 0, 0), crate)
  assert.equal(t, 4)
})

test('rayBox misses a box that is beside the ray', () => {
  assert.equal(rayBox(new Vector3(-5, 1, 5), new Vector3(1, 0, 0), crate), null)
})

test('rayBox misses a box behind the origin', () => {
  assert.equal(rayBox(new Vector3(5, 1, 0), new Vector3(1, 0, 0), crate), null)
})

test('rayBox passes over a box that is too low', () => {
  assert.equal(rayBox(new Vector3(-5, 3, 0), new Vector3(1, 0, 0), crate), null)
})

test('rayBoxes returns the nearest hit within range', () => {
  const far = box(10, 0, 2, 2, 2)
  const t = rayBoxes(new Vector3(-5, 1, 0), new Vector3(1, 0, 0), [far, crate], 100)
  assert.equal(t, 4)
  assert.equal(rayBoxes(new Vector3(-5, 1, 0), new Vector3(1, 0, 0), [far, crate], 3), Infinity)
})

test('resolveCircleVsBoxes pushes a circle out of a box side', () => {
  const p = new Vector3(1.2, 0, 0)
  resolveCircleVsBoxes(p, 0.4, [crate])
  assert.ok(Math.abs(p.x - 1.4) < 1e-9)
  assert.equal(p.z, 0)
})

test('resolveCircleVsBoxes pushes a centre that is inside the box out the nearest face', () => {
  const p = new Vector3(0.1, 0, 0.8)
  resolveCircleVsBoxes(p, 0.4, [crate])
  assert.ok(Math.abs(p.z - 1.4) < 1e-9)
})

test('resolveCircleVsBoxes leaves a free circle alone', () => {
  const p = new Vector3(3, 0, 3)
  resolveCircleVsBoxes(p, 0.4, [crate])
  assert.deepEqual([p.x, p.z], [3, 3])
})

test('segmentCapsule detects a bullet passing through a body', () => {
  const s = segmentCapsule(
    new Vector3(-2, 1, 0), new Vector3(2, 1, 0),
    new Vector3(0, 0.3, 0), new Vector3(0, 1.5, 0), 0.35,
  )
  assert.ok(s !== null && Math.abs(s - 0.5) < 1e-9)
})

test('segmentCapsule ignores a bullet passing over the head', () => {
  const s = segmentCapsule(
    new Vector3(-2, 2.5, 0), new Vector3(2, 2.5, 0),
    new Vector3(0, 0.3, 0), new Vector3(0, 1.5, 0), 0.35,
  )
  assert.equal(s, null)
})

test('segmentCapsule ignores a segment that stops short', () => {
  const s = segmentCapsule(
    new Vector3(-3, 1, 0), new Vector3(-1, 1, 0),
    new Vector3(0, 0.3, 0), new Vector3(0, 1.5, 0), 0.35,
  )
  assert.equal(s, null)
})
