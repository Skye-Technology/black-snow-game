'use client'

import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Color, Vector3, type Bone, type Group, type Mesh, type MeshStandardMaterial, type Object3D } from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { CharacterAnimator, type CharacterPose } from './animator'

export const ANIMATIONS_URL = '/models/animations.glb'
export const CHARACTER_URLS = {
  player: '/models/characters/player.glb',
  thugs: ['/models/characters/thug-1.glb', '/models/characters/thug-2.glb', '/models/characters/thug-3.glb'],
}

// No Draco in these files, so don't fetch its decoder. Meshopt is decoded locally.
const useModel = (url: string) => useGLTF(url, false, true)
for (const url of [ANIMATIONS_URL, CHARACTER_URLS.player, ...CHARACTER_URLS.thugs]) useGLTF.preload(url, false, true)

/** Kept subtle: a full-strength emissive turns the whole body skin-pink under the bullet-time filter. */
const HIT_RED = new Color(0.35, 0.02, 0.01)
const v = new Vector3()

interface AnimatedCharacterProps {
  url: string
  /** Called every frame to sample the character's state. */
  pose: () => CharacterPose
  /** 0..1 red emissive flash, sampled every frame. */
  hitFlash?: () => number
  /** Darken materials (1 = as authored). */
  tint?: number
  /** Optional element attached to the pistol's muzzle (e.g. a muzzle flash). */
  muzzle?: ReactNode
}

function Character({ url, pose, hitFlash, tint = 1, muzzle }: AnimatedCharacterProps) {
  const { scene } = useModel(url)
  const { animations } = useModel(ANIMATIONS_URL)
  const root = useRef<Group>(null)
  const gun = useRef<Group>(null)

  // Each instance needs its own skeleton (and materials, for the hit flash).
  const { model, materials, hand } = useMemo(() => {
    const model = cloneSkinned(scene)
    const materials: MeshStandardMaterial[] = []
    let hand: Bone | undefined
    model.traverse((o: Object3D) => {
      if ((o as Bone).isBone && o.name === 'hand_r') hand = o as Bone
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.frustumCulled = false
      const mat = (mesh.material as MeshStandardMaterial).clone()
      mat.color.multiplyScalar(tint)
      mesh.material = mat
      materials.push(mat)
    })
    return { model, materials, hand }
  }, [scene, tint])

  // Created per mount (not in useMemo) so StrictMode's mount/unmount/mount never reuses a disposed mixer.
  const animator = useRef<CharacterAnimator | null>(null)
  useEffect(() => {
    const a = new CharacterAnimator(model, animations)
    animator.current = a
    return () => {
      a.dispose()
      animator.current = null
    }
  }, [model, animations])

  useFrame(() => {
    const p = pose()
    animator.current?.update(p)

    const flash = hitFlash?.() ?? 0
    for (const m of materials) m.emissive.copy(HIT_RED).multiplyScalar(flash)

    // The pistol sits in the right hand but always points where the character aims.
    if (gun.current && root.current && hand) {
      gun.current.visible = !p.dead
      hand.getWorldPosition(v)
      gun.current.position.copy(root.current.worldToLocal(v))
      gun.current.rotation.set(p.aimPitch, 0, 0)
    }
  })

  return (
    <group ref={root}>
      {/* Quaternius models face +Z; the game's forward is -Z. */}
      <primitive object={model} rotation={[0, Math.PI, 0]} />
      <group ref={gun}>
        <mesh position={[0, 0.03, -0.08]} castShadow>
          <boxGeometry args={[0.035, 0.05, 0.2]} />
          <meshStandardMaterial color="#141414" metalness={0.8} roughness={0.35} />
        </mesh>
        <mesh position={[0, -0.03, -0.01]} rotation={[0.25, 0, 0]} castShadow>
          <boxGeometry args={[0.03, 0.09, 0.045]} />
          <meshStandardMaterial color="#1c1612" roughness={0.8} />
        </mesh>
        <group position={[0, 0.03, -0.2]}>{muzzle}</group>
      </group>
    </group>
  )
}

/** Shows `fallback` if the model files are missing or fail to load. */
class ModelErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.warn('Character model failed to load; using placeholder figure.', error)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** An animated character, or `fallback` while loading or if the models are unavailable. */
export function AnimatedCharacter(props: AnimatedCharacterProps & { fallback: ReactNode }) {
  const { fallback, ...rest } = props
  return (
    <ModelErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <Character {...rest} />
      </Suspense>
    </ModelErrorBoundary>
  )
}
