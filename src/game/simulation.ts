import { MathUtils, Vector3, type Camera } from 'three'
import { sfx } from './audio'
import { ARENA_HALF, BULLET_TIME, DODGE, ENEMY, GUN, PAINKILLER, PLAYER, WAVES } from './config'
import { consumeLook, consumePressed, input } from './input'
import { BOXES, SPAWN_POINTS } from './level'
import { rayBoxes, resolveCircleVsBoxes, segmentCapsule } from './physics'
import { useHud } from './store'
import { world, type Enemy } from './world'

const CAMERA_DISTANCE = 3.4
const SHOULDER_OFFSET = 0.95
const CAMERA_HEIGHT = 1.9
const BODY_RADIUS = 0.38
const MAX_PARTICLES = 400

// Scratch vectors, reused every frame to avoid garbage.
const fwd = new Vector3()
const right = new Vector3()
const look = new Vector3()
const wish = new Vector3()
const pivot = new Vector3()
const back = new Vector3()
const aimPoint = new Vector3()
const aimEnd = new Vector3()
const muzzle = new Vector3()
const dir = new Vector3()
const to = new Vector3()
const eye = new Vector3()
const chest = new Vector3()
const desired = new Vector3()
const capA = new Vector3()
const capB = new Vector3()
const hitPoint = new Vector3()
let cameraDip = 0

export const forwardFlat = (yaw: number, out: Vector3) => out.set(-Math.sin(yaw), 0, -Math.cos(yaw))
export const rightFlat = (yaw: number, out: Vector3) => out.set(Math.cos(yaw), 0, -Math.sin(yaw))
export const lookDirection = (yaw: number, pitch: number, out: Vector3) =>
  out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))

/** Vertical capsule around a character. Lying flat mid-dive presents a much lower target. */
function bodyCapsule(pos: Vector3, prone: boolean) {
  capA.set(pos.x, pos.y + (prone ? 0.25 : 0.35), pos.z)
  capB.set(pos.x, pos.y + (prone ? 0.55 : 1.6), pos.z)
}

function clampToArena(pos: Vector3, radius: number) {
  const limit = ARENA_HALF - radius
  pos.x = MathUtils.clamp(pos.x, -limit, limit)
  pos.z = MathUtils.clamp(pos.z, -limit, limit)
}

const isAirborne = () => world.player.dodgeTime >= 0 && world.player.dodgeTime < DODGE.airTime
const isRecovering = () => world.player.dodgeTime >= DODGE.airTime

/** Advances the game by one frame. `realDt` is wall-clock seconds. */
export function update(camera: Camera, realDt: number): void {
  const slowMo = updateBulletTime(realDt)
  const worldDt = realDt * MathUtils.lerp(1, BULLET_TIME.worldScale, world.slowMoBlend)
  const playerDt = realDt * MathUtils.lerp(1, BULLET_TIME.playerScale, world.slowMoBlend)
  world.worldDt = worldDt
  world.playerDt = playerDt

  updatePlayer(playerDt)
  updateCamera(camera, realDt)
  updateAim(camera)
  updateWeapon(playerDt, slowMo)
  updateEnemies(worldDt, realDt, slowMo)
  updateBullets(worldDt, slowMo)
  updateParticles(worldDt)
  updatePickups()
  updateWaves(realDt)
  world.muzzleFlash = Math.max(0, world.muzzleFlash - realDt * 14)
  syncHud(slowMo)
}

function setBulletTime(on: boolean) {
  if (on === world.bulletTime) return
  if (on && world.bulletTimeMeter < 10) return
  world.bulletTime = on
  sfx.bulletTime(on)
}

function updateBulletTime(realDt: number): boolean {
  if (consumePressed('KeyQ') || consumePressed('Mouse2')) setBulletTime(!world.bulletTime)

  // Diving also slows time, as long as there is meter left.
  const slowMo = (world.bulletTime || isAirborne()) && world.bulletTimeMeter > 0
  if (slowMo) {
    world.bulletTimeMeter = Math.max(0, world.bulletTimeMeter - BULLET_TIME.drainPerSec * realDt)
    if (world.bulletTimeMeter === 0) setBulletTime(false)
  } else {
    world.bulletTimeMeter = Math.min(BULLET_TIME.max, world.bulletTimeMeter + BULLET_TIME.regenPerSec * realDt)
  }
  // Ease in and out rather than snapping.
  world.slowMoBlend += ((slowMo ? 1 : 0) - world.slowMoBlend) * Math.min(1, realDt * 8)
  return slowMo
}

function updatePlayer(dt: number) {
  const p = world.player
  const [lx, ly] = consumeLook()
  p.yaw -= lx * PLAYER.lookSensitivity
  p.pitch = MathUtils.clamp(p.pitch - ly * PLAYER.lookSensitivity, PLAYER.minPitch, PLAYER.maxPitch)

  forwardFlat(p.yaw, fwd)
  rightFlat(p.yaw, right)
  wish.set(0, 0, 0)
  if (input.held.has('KeyW')) wish.add(fwd)
  if (input.held.has('KeyS')) wish.sub(fwd)
  if (input.held.has('KeyD')) wish.add(right)
  if (input.held.has('KeyA')) wish.sub(right)
  if (wish.lengthSq() > 0) wish.normalize()

  // Consume every dodge key so a press can't be buffered while on cooldown.
  const dodgePressed = [consumePressed('ShiftLeft'), consumePressed('ShiftRight'), consumePressed('Space')].some(Boolean)
  p.dodgeCooldown -= dt
  p.vel.set(0, 0, 0)

  if (p.dodgeTime >= 0) {
    p.dodgeTime += dt
    if (p.dodgeTime < DODGE.airTime) {
      p.vel.copy(p.dodgeDir).multiplyScalar(DODGE.speed)
    } else if (p.dodgeTime >= DODGE.airTime + DODGE.recoverTime) {
      p.dodgeTime = -1
      p.dodgeCooldown = DODGE.cooldown
    }
  } else if (dodgePressed && p.dodgeCooldown <= 0) {
    p.dodgeTime = 0
    p.dodgeDir.copy(wish.lengthSq() > 0 ? wish : fwd)
  } else {
    p.vel.copy(wish).multiplyScalar(PLAYER.speed)
  }
  p.pos.addScaledVector(p.vel, dt)

  resolveCircleVsBoxes(p.pos, PLAYER.radius, BOXES)
  clampToArena(p.pos, PLAYER.radius)
}

function updateCamera(camera: Camera, realDt: number) {
  const p = world.player
  lookDirection(p.yaw, p.pitch, look)
  rightFlat(p.yaw, right)

  cameraDip += ((p.dodgeTime >= 0 ? 1 : 0) - cameraDip) * Math.min(1, realDt * 10)
  pivot.copy(p.pos).addScaledVector(right, SHOULDER_OFFSET)
  pivot.y += CAMERA_HEIGHT - cameraDip * 0.9

  // Pull the camera in when a wall is between it and the player.
  back.copy(look).negate()
  const blocked = rayBoxes(pivot, back, BOXES, CAMERA_DISTANCE)
  const distance = Math.max(0.4, Math.min(CAMERA_DISTANCE, blocked - 0.25))
  camera.position.copy(pivot).addScaledVector(back, distance)
  camera.position.y = Math.max(0.2, camera.position.y)
  aimPoint.copy(pivot).addScaledVector(look, 20)
  camera.lookAt(aimPoint)
}

/** Finds what is under the crosshair and stores it in aimPoint. */
function updateAim(camera: Camera) {
  const origin = camera.position
  const maxDist = 150
  let t = rayBoxes(origin, look, BOXES, maxDist)
  if (look.y < -1e-4) t = Math.min(t, -origin.y / look.y)
  if (!Number.isFinite(t)) t = maxDist

  aimEnd.copy(origin).addScaledVector(look, t)
  for (const e of world.enemies) {
    if (!e.alive) continue
    bodyCapsule(e.pos, false)
    const s = segmentCapsule(origin, aimEnd, capA, capB, BODY_RADIUS)
    if (s !== null) t = Math.min(t, s * origin.distanceTo(aimEnd))
  }
  aimPoint.copy(origin).addScaledVector(look, t)
}

function startReload() {
  const p = world.player
  if (p.reloadTimer > 0 || p.ammo === GUN.magazine) return
  p.reloadTimer = GUN.reloadTime
  sfx.reload()
}

function updateWeapon(dt: number, slowMo: boolean) {
  const p = world.player
  p.fireCooldown -= dt
  if (p.reloadTimer > 0) {
    p.reloadTimer -= dt
    if (p.reloadTimer <= 0) {
      p.reloadTimer = 0
      p.ammo = GUN.magazine
    }
  }
  if (consumePressed('KeyR')) startReload()
  if (!input.fireHeld || p.fireCooldown > 0 || p.reloadTimer > 0 || isRecovering()) return
  if (p.ammo === 0) {
    startReload()
    return
  }

  p.ammo--
  p.shots++
  p.fireCooldown = GUN.fireInterval
  forwardFlat(p.yaw, fwd)
  rightFlat(p.yaw, right)
  muzzle.copy(p.pos).addScaledVector(right, 0.15).addScaledVector(fwd, 0.7)
  muzzle.y += p.dodgeTime >= 0 ? 0.6 : 1.4

  dir.subVectors(aimPoint, muzzle).normalize()
  // If the aim point is behind the muzzle (target right beside the player), shoot straight down the crosshair.
  if (dir.dot(look) < 0.3) dir.copy(look)
  jitter(dir, GUN.spread)

  spawnBullet(muzzle, dir, GUN.bulletSpeed, true)
  world.muzzleFlash = 1
  world.muzzlePos.copy(muzzle)
  sfx.playerShot(slowMo)
}

function jitter(v: Vector3, amount: number) {
  v.x += (Math.random() - 0.5) * 2 * amount
  v.y += (Math.random() - 0.5) * 2 * amount
  v.z += (Math.random() - 0.5) * 2 * amount
  v.normalize()
}

function spawnBullet(origin: Vector3, direction: Vector3, speed: number, fromPlayer: boolean) {
  world.bullets.push({
    pos: origin.clone(),
    prev: origin.clone(),
    dir: direction.clone(),
    speed,
    fromPlayer,
    life: 3,
  })
}

function updateEnemies(dt: number, realDt: number, slowMo: boolean) {
  const p = world.player
  for (const e of world.enemies) {
    e.hitFlash = Math.max(0, e.hitFlash - realDt * 6)
    e.muzzleFlash = Math.max(0, e.muzzleFlash - realDt * 12)
    if (!e.alive) {
      e.deadTime += dt
      continue
    }

    to.subVectors(p.pos, e.pos).setY(0)
    const dist = to.length()
    to.divideScalar(dist || 1)
    e.yaw = Math.atan2(-to.x, -to.z)

    eye.copy(e.pos).setY(1.45)
    chest.copy(p.pos).setY(p.dodgeTime >= 0 ? 0.5 : 1.15)
    dir.subVectors(chest, eye)
    const losDist = dir.length()
    dir.divideScalar(losDist)
    const canSee = dist < ENEMY.sightRange && rayBoxes(eye, dir, BOXES, losDist) >= losDist

    // Close in until in range, back off when crowded, strafe while in a firefight.
    desired.set(0, 0, 0)
    if (!canSee || dist > ENEMY.preferredRange + 2) desired.add(to)
    else if (dist < ENEMY.preferredRange - 3) desired.sub(to)
    if (canSee) {
      e.strafeTimer -= dt
      if (e.strafeTimer <= 0) {
        e.strafeDir = [-1, 0, 1][Math.floor(Math.random() * 3)]
        e.strafeTimer = 1 + Math.random() * 2
      }
      desired.x += -to.z * e.strafeDir * 0.7
      desired.z += to.x * e.strafeDir * 0.7
    }
    for (const other of world.enemies) {
      if (other === e || !other.alive) continue
      const dx = e.pos.x - other.pos.x
      const dz = e.pos.z - other.pos.z
      const d = Math.hypot(dx, dz)
      if (d > 0 && d < 1.2) {
        desired.x += (dx / d) * (1.2 - d) * 2
        desired.z += (dz / d) * (1.2 - d) * 2
      }
    }
    if (desired.lengthSq() > 1) desired.normalize()
    desired.multiplyScalar(ENEMY.speed)
    e.vel.lerp(desired, Math.min(1, dt * 6))
    e.pos.addScaledVector(e.vel, dt)
    resolveCircleVsBoxes(e.pos, ENEMY.radius, BOXES)
    clampToArena(e.pos, ENEMY.radius)

    if (!canSee || p.health <= 0) {
      // A short reaction delay whenever an enemy re-acquires the player.
      e.fireCooldown = Math.max(e.fireCooldown, 0.5)
      continue
    }
    e.fireCooldown -= dt
    if (e.fireCooldown <= 0) {
      e.fireCooldown = MathUtils.randFloat(ENEMY.fireMin, ENEMY.fireMax)
      muzzle.copy(e.pos).addScaledVector(to, 0.6).setY(1.33)
      dir.subVectors(chest, muzzle).normalize()
      jitter(dir, ENEMY.spread)
      spawnBullet(muzzle, dir, ENEMY.bulletSpeed, false)
      e.muzzleFlash = 1
      e.shots++
      sfx.enemyShot(slowMo, dist)
    }
  }

  const before = world.enemies.length
  world.enemies = world.enemies.filter((e) => e.alive || e.deadTime < ENEMY.removeAfter)
  if (world.enemies.length !== before) useHud.getState().bump('entityVersion')
}

function updateBullets(dt: number, slowMo: boolean) {
  const p = world.player
  const bullets = world.bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]
    const step = b.speed * dt
    b.prev.copy(b.pos)
    b.pos.addScaledVector(b.dir, step)
    b.life -= dt

    let wallT = rayBoxes(b.prev, b.dir, BOXES, step)
    if (b.pos.y < 0 && b.dir.y < 0) wallT = Math.min(wallT, b.prev.y / -b.dir.y)

    let bodyT = Infinity
    let victim: Enemy | 'player' | null = null
    if (b.fromPlayer) {
      for (const e of world.enemies) {
        if (!e.alive) continue
        bodyCapsule(e.pos, false)
        const s = segmentCapsule(b.prev, b.pos, capA, capB, BODY_RADIUS)
        if (s !== null && s * step < bodyT) {
          bodyT = s * step
          victim = e
        }
      }
    } else if (p.health > 0) {
      bodyCapsule(p.pos, isAirborne())
      const s = segmentCapsule(b.prev, b.pos, capA, capB, 0.32)
      if (s !== null) {
        bodyT = s * step
        victim = 'player'
      }
    }

    let remove = b.life <= 0
    if (victim && bodyT <= wallT) {
      hitPoint.copy(b.prev).addScaledVector(b.dir, bodyT)
      if (victim === 'player') hurtPlayer()
      else hitEnemy(victim, b.dir, slowMo)
      spawnParticles(hitPoint, 10, '#8a0d0d', 3, 0.07, 0.6)
      remove = true
    } else if (Number.isFinite(wallT)) {
      hitPoint.copy(b.prev).addScaledVector(b.dir, wallT)
      spawnParticles(hitPoint, 6, '#ffcc88', 4, 0.04, 0.35)
      spawnParticles(hitPoint, 3, '#9a9a9a', 1.2, 0.08, 0.8)
      if (b.fromPlayer) sfx.impact(slowMo)
      remove = true
    }
    if (remove) {
      bullets[i] = bullets[bullets.length - 1]
      bullets.pop()
    }
  }
}

function hitEnemy(e: Enemy, bulletDir: Vector3, slowMo: boolean) {
  const headshot = hitPoint.y > e.pos.y + 1.45
  e.health -= GUN.damage * (headshot ? GUN.headshotMultiplier : 1)
  e.hitFlash = 1
  e.hits++
  e.vel.x += bulletDir.x * 2.5
  e.vel.z += bulletDir.z * 2.5
  const hud = useHud.getState()
  hud.bump('hitMarkerCount')
  sfx.hitEnemy(slowMo)
  if (e.health > 0) return

  e.alive = false
  e.deadTime = 0
  world.kills++
  world.bulletTimeMeter = Math.min(BULLET_TIME.max, world.bulletTimeMeter + BULLET_TIME.refillPerKill)
  if (Math.random() < PAINKILLER.dropChance) {
    world.pickups.push({ id: world.nextId++, pos: e.pos.clone().setY(0) })
  }
  hud.bump('entityVersion')
}

function hurtPlayer() {
  const p = world.player
  p.health = Math.max(0, p.health - ENEMY.damage)
  p.hits++
  useHud.getState().bump('hurtCount')
  sfx.hurt()
  if (p.health > 0) return

  world.bulletTime = false
  useHud.getState().setPhase('dead')
  if (document.pointerLockElement) document.exitPointerLock()
}

function spawnParticles(at: Vector3, count: number, color: string, speed: number, size: number, life: number) {
  for (let i = 0; i < count; i++) {
    const vel = new Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.6))
    world.particles.push({ pos: at.clone(), vel, life, maxLife: life, color, size })
  }
  const extra = world.particles.length - MAX_PARTICLES
  if (extra > 0) world.particles.splice(0, extra)
}

function updateParticles(dt: number) {
  const parts = world.particles
  for (let i = parts.length - 1; i >= 0; i--) {
    const pt = parts[i]
    pt.vel.y -= 9 * dt
    pt.pos.addScaledVector(pt.vel, dt)
    if (pt.pos.y < 0.01) {
      pt.pos.y = 0.01
      pt.vel.set(0, 0, 0)
    }
    pt.life -= dt
    if (pt.life <= 0) {
      parts[i] = parts[parts.length - 1]
      parts.pop()
    }
  }
}

function updatePickups() {
  const p = world.player
  if (p.health >= PLAYER.maxHealth) return
  const before = world.pickups.length
  world.pickups = world.pickups.filter((pk) => {
    const near = Math.hypot(pk.pos.x - p.pos.x, pk.pos.z - p.pos.z) < PAINKILLER.pickupRadius
    if (near) p.health = Math.min(PLAYER.maxHealth, p.health + PAINKILLER.heal)
    return !near
  })
  if (world.pickups.length !== before) {
    sfx.pickup()
    useHud.getState().bump('entityVersion')
  }
}

function updateWaves(realDt: number) {
  if (world.enemies.some((e) => e.alive)) return
  world.nextWaveIn -= realDt
  if (world.nextWaveIn > 0) return
  world.nextWaveIn = WAVES.betweenDelay
  world.wave++

  // Spawn at the points furthest from the player so nobody appears on top of them.
  const p = world.player.pos
  const points = [...SPAWN_POINTS].sort((a, b) => b.distanceToSquared(p) - a.distanceToSquared(p)).slice(0, 5)
  const count = Math.min(WAVES.maxCount, WAVES.baseCount + world.wave)
  for (let i = 0; i < count; i++) {
    const pos = points[i % points.length].clone()
    pos.x += MathUtils.randFloatSpread(3)
    pos.z += MathUtils.randFloatSpread(3)
    clampToArena(pos, ENEMY.radius)
    world.enemies.push({
      id: world.nextId++,
      pos,
      vel: new Vector3(),
      yaw: 0,
      health: ENEMY.health,
      alive: true,
      deadTime: 0,
      fireCooldown: ENEMY.firstShotDelay + Math.random(),
      strafeDir: 0,
      strafeTimer: 0,
      hitFlash: 0,
      muzzleFlash: 0,
      shots: 0,
      hits: 0,
    })
  }
  useHud.getState().bump('entityVersion')
}

function syncHud(slowMo: boolean) {
  const p = world.player
  const hud = useHud.getState()
  const next = {
    health: Math.ceil(p.health),
    ammo: p.ammo,
    reloading: p.reloadTimer > 0,
    bulletTimeMeter: Math.round(world.bulletTimeMeter),
    bulletTime: slowMo,
    wave: world.wave,
    kills: world.kills,
  }
  const changed = (Object.keys(next) as (keyof typeof next)[]).some((k) => hud[k] !== next[k])
  if (changed) hud.patch(next)
}
