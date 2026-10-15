'use client'

import type { Ref } from 'react'
import type { Group, MeshStandardMaterial } from 'three'

interface FigureProps {
  coat: string
  pants: string
  skin?: string
  /** Material for torso and coat, so enemies can flash red when hit. */
  bodyMaterialRef?: Ref<MeshStandardMaterial>
  /** Group holding both arms, pivoting at the shoulders, so the player can aim up and down. */
  armsRef?: Ref<Group>
}

/** A blocky long-coated figure facing -Z, feet at the origin, about 1.8 units tall. */
export function Figure({ coat, pants, skin = '#c49a7c', bodyMaterialRef, armsRef }: FigureProps) {
  return (
    <group>
      {[-0.12, 0.12].map((x) => (
        <mesh key={x} position={[x, 0.4, 0]} castShadow>
          <boxGeometry args={[0.18, 0.8, 0.2]} />
          <meshStandardMaterial color={pants} roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 0.82, 0.02]} castShadow>
        <boxGeometry args={[0.54, 0.5, 0.32]} />
        <meshStandardMaterial ref={bodyMaterialRef} color={coat} roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.33, 0]} castShadow>
        <boxGeometry args={[0.52, 0.56, 0.3]} />
        <meshStandardMaterial color={coat} roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.73, 0]} castShadow>
        <boxGeometry args={[0.24, 0.28, 0.26]} />
        <meshStandardMaterial color={skin} roughness={0.7} />
      </mesh>
      <group ref={armsRef} position={[0, 1.5, 0]}>
        {[-0.24, 0.24].map((x) => (
          <group key={x} position={[x, 0, 0]}>
            <mesh position={[0, -0.04, -0.26]} castShadow>
              <boxGeometry args={[0.12, 0.12, 0.52]} />
              <meshStandardMaterial color={coat} roughness={0.8} />
            </mesh>
            <mesh position={[0, 0, -0.58]} castShadow>
              <boxGeometry args={[0.05, 0.1, 0.2]} />
              <meshStandardMaterial color="#111" metalness={0.8} roughness={0.3} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  )
}
