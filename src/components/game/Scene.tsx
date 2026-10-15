'use client'

import { useFrame } from '@react-three/fiber'
import { ARENA_HALF } from '@/game/config'
import { update } from '@/game/simulation'
import { useHud } from '@/game/store'
import { world } from '@/game/world'
import { Enemies, Pickups, PlayerModel } from './Characters'
import { Bullets, MuzzleFlash, Particles, Snow } from './Effects'
import { Level } from './Level'

const MAX_FRAME_DT = 1 / 20

/** Drives the simulation. Mounted first so every other useFrame sees this frame's state. */
function Simulation() {
  useFrame((state, delta) => {
    const phase = useHud.getState().phase
    if (phase === 'playing') {
      update(state.camera, Math.min(delta, MAX_FRAME_DT))
      return
    }
    world.worldDt = phase === 'menu' ? delta * 0.6 : 0
    world.playerDt = world.worldDt
    if (phase === 'menu') {
      // Slow establishing orbit behind the title screen.
      const t = state.clock.elapsedTime * 0.06
      state.camera.position.set(Math.sin(t) * 17, 6.5, Math.cos(t) * 17)
      state.camera.lookAt(0, 1, 0)
    }
  })
  return null
}

export function Scene() {
  const S = ARENA_HALF + 6
  return (
    <>
      <Simulation />
      <color attach="background" args={['#0a0e18']} />
      <fog attach="fog" args={['#0a0e18', 14, 58]} />
      <hemisphereLight args={['#7686b0', '#2a2220', 1.6]} />
      <directionalLight
        position={[-15, 25, 10]}
        color="#a9bcff"
        intensity={1.7}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-S}
        shadow-camera-right={S}
        shadow-camera-top={S}
        shadow-camera-bottom={-S}
        shadow-bias={-0.0005}
      />
      <Level />
      <PlayerModel />
      <Enemies />
      <Pickups />
      <Bullets />
      <Particles />
      <MuzzleFlash />
      <Snow />
    </>
  )
}
