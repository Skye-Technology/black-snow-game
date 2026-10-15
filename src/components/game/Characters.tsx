'use client'

import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Vector3, type Group, type Mesh } from 'three'
import { DODGE } from '@/game/config'
import { useHud } from '@/game/store'
import { world, type Enemy } from '@/game/world'
import { AnimatedCharacter, CHARACTER_URLS } from './AnimatedCharacter'
import type { CharacterPose } from './animator'
import { Figure } from './Figure'

const axis = new Vector3()
const ENEMY_TINT = 0.6

export function PlayerModel() {
  const root = useRef<Group>(null)
  const tilt = useRef<Group>(null)
  const body = useRef<Group>(null)
  const arms = useRef<Group>(null)
  const pose = useRef<CharacterPose>({
    dt: 0, facingYaw: 0, vel: new Vector3(), aimPitch: 0,
    airborne: false, reloading: false, dead: false, shots: 0, hits: 0,
  })

  useFrame(() => {
    if (!root.current || !tilt.current || !body.current) return
    const p = world.player
    root.current.position.copy(p.pos)
    body.current.rotation.y = p.yaw
    if (arms.current) arms.current.rotation.x = p.pitch

    // Dive: lean the whole body over in the dodge direction, then get back up.
    let k = 0
    if (p.dodgeTime >= 0) {
      k = p.dodgeTime < DODGE.airTime
        ? Math.min(1, p.dodgeTime / 0.12)
        : Math.max(0, 1 - (p.dodgeTime - DODGE.airTime) / DODGE.recoverTime)
    }
    axis.set(p.dodgeDir.z, 0, -p.dodgeDir.x)
    if (axis.lengthSq() > 0) tilt.current.quaternion.setFromAxisAngle(axis.normalize(), k * Math.PI * 0.46)
    tilt.current.position.set(-p.dodgeDir.x * 0.8 * k, 0.3 * k, -p.dodgeDir.z * 0.8 * k)
  })

  const samplePose = () => {
    const p = world.player
    const s = pose.current
    s.dt = world.playerDt
    s.facingYaw = p.yaw
    s.vel.copy(p.vel)
    s.aimPitch = p.pitch
    s.airborne = p.dodgeTime >= 0 && p.dodgeTime < DODGE.airTime
    s.reloading = p.reloadTimer > 0
    s.dead = p.health <= 0
    s.shots = p.shots
    s.hits = p.hits
    return s
  }

  return (
    <group ref={root}>
      <group ref={tilt}>
        <group ref={body}>
          <AnimatedCharacter
            url={CHARACTER_URLS.player}
            pose={samplePose}
            fallback={<Figure coat="#2b211b" pants="#16161a" armsRef={arms} />}
          />
        </group>
      </group>
    </group>
  )
}

function EnemyMuzzleFlash({ enemy }: { enemy: Enemy }) {
  const ref = useRef<Mesh>(null)
  useFrame(() => {
    if (!ref.current) return
    ref.current.visible = enemy.muzzleFlash > 0.1
    ref.current.scale.setScalar(0.5 + enemy.muzzleFlash)
  })
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.09, 8, 8]} />
      <meshBasicMaterial color="#ffd27a" toneMapped={false} />
    </mesh>
  )
}

function EnemyModel({ enemy }: { enemy: Enemy }) {
  const root = useRef<Group>(null)
  const pose = useRef<CharacterPose>({
    dt: 0, facingYaw: 0, vel: new Vector3(), aimPitch: 0,
    airborne: false, reloading: false, dead: false, shots: 0, hits: 0,
  })

  useFrame(() => {
    if (!root.current) return
    root.current.position.copy(enemy.pos)
    root.current.rotation.y = enemy.yaw
    // Once the death animation has played out, sink the body away before it is removed.
    if (!enemy.alive) root.current.position.y = -Math.max(0, enemy.deadTime - 3) * 0.25
  })

  const samplePose = () => {
    const p = world.player
    const s = pose.current
    const dist = Math.hypot(p.pos.x - enemy.pos.x, p.pos.z - enemy.pos.z)
    s.dt = world.worldDt
    s.facingYaw = enemy.yaw
    s.vel.copy(enemy.vel)
    s.aimPitch = Math.atan2(1.15 - 1.45, Math.max(dist, 1))
    s.dead = !enemy.alive
    s.shots = enemy.shots
    s.hits = enemy.hits
    return s
  }

  return (
    <group ref={root}>
      <AnimatedCharacter
        url={CHARACTER_URLS.thugs[enemy.id % CHARACTER_URLS.thugs.length]}
        pose={samplePose}
        hitFlash={() => enemy.hitFlash}
        tint={ENEMY_TINT}
        muzzle={<EnemyMuzzleFlash enemy={enemy} />}
        fallback={<Figure coat="#3b3f47" pants="#202227" skin="#b08a70" />}
      />
    </group>
  )
}

export function Enemies() {
  useHud((s) => s.entityVersion)
  return (
    <>
      {world.enemies.map((e) => (
        <EnemyModel key={e.id} enemy={e} />
      ))}
    </>
  )
}

function Painkiller({ pos }: { pos: Vector3 }) {
  const ref = useRef<Group>(null)
  useFrame((state) => {
    if (!ref.current) return
    ref.current.rotation.y = state.clock.elapsedTime * 2
    ref.current.position.y = 0.35 + Math.sin(state.clock.elapsedTime * 3) * 0.08
  })
  return (
    <group position={[pos.x, 0, pos.z]}>
      <group ref={ref}>
        <mesh castShadow>
          <cylinderGeometry args={[0.12, 0.12, 0.3, 12]} />
          <meshStandardMaterial color="#f2efe6" emissive="#ffffff" emissiveIntensity={0.15} />
        </mesh>
        <mesh position={[0, 0.19, 0]}>
          <cylinderGeometry args={[0.13, 0.13, 0.08, 12]} />
          <meshStandardMaterial color="#b3261e" emissive="#b3261e" emissiveIntensity={0.4} />
        </mesh>
      </group>
      <pointLight position={[0, 0.6, 0]} color="#ff6a5a" intensity={2} distance={3} />
    </group>
  )
}

export function Pickups() {
  useHud((s) => s.entityVersion)
  return (
    <>
      {world.pickups.map((pk) => (
        <Painkiller key={pk.id} pos={pk.pos} />
      ))}
    </>
  )
}
