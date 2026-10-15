'use client'

import { ARENA_HALF } from '@/game/config'
import { LAMPS, SOLIDS } from '@/game/level'

const A = ARENA_HALF

/** Lit apartment windows on the inside faces of the perimeter walls. Deterministic, so no hydration drift. */
const WINDOWS = (() => {
  const out: { pos: [number, number, number]; rotY: number; lit: boolean }[] = []
  const sides = [
    { rotY: 0, place: (u: number): [number, number] => [u, -A + 0.01] },
    { rotY: Math.PI, place: (u: number): [number, number] => [u, A - 0.01] },
    { rotY: Math.PI / 2, place: (u: number): [number, number] => [-A + 0.01, u] },
    { rotY: -Math.PI / 2, place: (u: number): [number, number] => [A - 0.01, u] },
  ]
  sides.forEach((side, s) => {
    for (let u = -A + 3, i = 0; u < A - 2; u += 4.5, i++) {
      const [x, z] = side.place(u)
      out.push({ pos: [x, 4.2, z], rotY: side.rotY, lit: (i * 7 + s * 3) % 5 < 2 })
    }
  })
  return out
})()

export function Level() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[2 * A + 2, 2 * A + 2]} />
        <meshStandardMaterial color="#454c58" roughness={1} />
      </mesh>

      {SOLIDS.map((s, i) => {
        const size = s.box.max.clone().sub(s.box.min)
        const center = s.box.max.clone().add(s.box.min).multiplyScalar(0.5)
        return (
          <group key={i}>
            <mesh position={center} castShadow receiveShadow>
              <boxGeometry args={[size.x, size.y, size.z]} />
              <meshStandardMaterial color={s.color} roughness={s.kind === 'car' ? 0.35 : 0.9} metalness={s.kind === 'container' || s.kind === 'car' ? 0.4 : 0} />
            </mesh>
            {s.kind !== 'wall' && (
              <mesh position={[center.x, s.box.max.y + 0.03, center.z]} receiveShadow>
                <boxGeometry args={[size.x + 0.02, 0.06, size.z + 0.02]} />
                <meshStandardMaterial color="#d8dde8" roughness={1} />
              </mesh>
            )}
          </group>
        )
      })}

      {WINDOWS.map((w, i) => (
        <mesh key={i} position={w.pos} rotation={[0, w.rotY, 0]}>
          <planeGeometry args={[1.2, 1.6]} />
          <meshStandardMaterial
            color={w.lit ? '#2a1a08' : '#0c0f16'}
            emissive={w.lit ? '#ffb45e' : '#000000'}
            emissiveIntensity={w.lit ? 1.4 : 0}
          />
        </mesh>
      ))}

      {LAMPS.map((p, i) => (
        <group key={i} position={p}>
          <mesh position={[0, 2.25, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.09, 4.5, 8]} />
            <meshStandardMaterial color="#15171b" metalness={0.6} roughness={0.5} />
          </mesh>
          <mesh position={[0, 4.45, 0]}>
            <boxGeometry args={[0.35, 0.18, 0.35]} />
            <meshStandardMaterial color="#222" emissive="#ffc27a" emissiveIntensity={3} />
          </mesh>
          <pointLight position={[0, 4.2, 0]} color="#ffb46a" intensity={28} distance={15} decay={1.6} />
        </group>
      ))}
    </group>
  )
}
