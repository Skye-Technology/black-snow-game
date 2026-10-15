'use client'

import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { BufferAttribute, Color, Object3D, Vector3, type InstancedMesh, type PointLight, type Points } from 'three'
import { ARENA_HALF } from '@/game/config'
import { world } from '@/game/world'

const MAX_BULLETS = 256
const MAX_PARTICLES = 400
const TRACER_LENGTH = 0.9
const Z = new Vector3(0, 0, 1)
const dummy = new Object3D()
const color = new Color()
const PLAYER_TRACER = new Color('#ffe7a0').multiplyScalar(2)
const ENEMY_TRACER = new Color('#ff7a4a').multiplyScalar(2)

/** Fill every instance colour once so the shader is compiled with per-instance colours. */
function useInstanceColors(ref: React.RefObject<InstancedMesh | null>, count: number) {
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    for (let i = 0; i < count; i++) mesh.setColorAt(i, color.set('#ffffff'))
    mesh.count = 0
  }, [ref, count])
}

export function Bullets() {
  const ref = useRef<InstancedMesh>(null)
  useInstanceColors(ref, MAX_BULLETS)

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    let n = 0
    for (const b of world.bullets) {
      if (n >= MAX_BULLETS) break
      dummy.position.copy(b.pos).addScaledVector(b.dir, -TRACER_LENGTH / 2)
      dummy.quaternion.setFromUnitVectors(Z, b.dir)
      dummy.updateMatrix()
      mesh.setMatrixAt(n, dummy.matrix)
      mesh.setColorAt(n, b.fromPlayer ? PLAYER_TRACER : ENEMY_TRACER)
      n++
    }
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, MAX_BULLETS]} frustumCulled={false}>
      <boxGeometry args={[0.03, 0.03, TRACER_LENGTH]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  )
}

export function Particles() {
  const ref = useRef<InstancedMesh>(null)
  useInstanceColors(ref, MAX_PARTICLES)

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    let n = 0
    for (const p of world.particles) {
      if (n >= MAX_PARTICLES) break
      dummy.position.copy(p.pos)
      dummy.quaternion.identity()
      dummy.scale.setScalar(p.size * Math.max(0.2, p.life / p.maxLife))
      dummy.updateMatrix()
      mesh.setMatrixAt(n, dummy.matrix)
      mesh.setColorAt(n, color.set(p.color))
      n++
    }
    dummy.scale.setScalar(1)
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, MAX_PARTICLES]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial />
    </instancedMesh>
  )
}

export function MuzzleFlash() {
  const light = useRef<PointLight>(null)
  useFrame(() => {
    if (!light.current) return
    light.current.position.copy(world.muzzlePos)
    light.current.intensity = world.muzzleFlash * 12
  })
  return <pointLight ref={light} color="#ffcf7a" distance={8} decay={1.5} intensity={0} />
}

const SNOW_COUNT = 2500
const SNOW_HEIGHT = 14

/** Falling snow. It follows the world clock, so it hangs in the air during bullet time. */
export function Snow() {
  const ref = useRef<Points>(null)
  const positions = useMemo(() => {
    const arr = new Float32Array(SNOW_COUNT * 3)
    for (let i = 0; i < SNOW_COUNT; i++) {
      arr[i * 3] = (Math.random() * 2 - 1) * ARENA_HALF
      arr[i * 3 + 1] = Math.random() * SNOW_HEIGHT
      arr[i * 3 + 2] = (Math.random() * 2 - 1) * ARENA_HALF
    }
    return arr
  }, [])

  useFrame((state) => {
    const pts = ref.current
    const dt = world.worldDt
    if (!pts || dt === 0) return
    const t = state.clock.elapsedTime
    for (let i = 0; i < SNOW_COUNT; i++) {
      const y = i * 3 + 1
      positions[y] -= (1 + (i % 3) * 0.35) * dt
      positions[y - 1] += Math.sin(t * 0.7 + i) * 0.3 * dt
      if (positions[y] < 0) positions[y] += SNOW_HEIGHT
    }
    ;(pts.geometry.attributes.position as BufferAttribute).needsUpdate = true
  })

  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#e8eef8" size={0.07} transparent opacity={0.85} depthWrite={false} />
    </points>
  )
}
