import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  AnimationUtils,
  LoopOnce,
  MathUtils,
  Quaternion,
  Vector3,
  type Bone,
  type Object3D,
} from 'three'

/** Everything the animator needs to know about a character this frame. */
export interface CharacterPose {
  /** Seconds to advance (already scaled for bullet time; 0 while paused). */
  dt: number
  /** Direction the character faces / aims, same convention as the simulation's yaw. */
  facingYaw: number
  /** World velocity in units per second. */
  vel: Vector3
  /** Aim pitch in radians, positive = up. */
  aimPitch: number
  airborne: boolean
  reloading: boolean
  dead: boolean
  /** Counters: when they increase, a recoil / flinch plays. */
  shots: number
  hits: number
}

const LOWER_BODY = /^(root|pelvis|thigh_|calf_|foot_|ball_)/
const boneOf = (trackName: string) => trackName.slice(0, trackName.lastIndexOf('.'))
const UP = new Vector3(0, 1, 0)
const MAX_HIP_TWIST = MathUtils.degToRad(60)
/** Aim poses in the library are authored for roughly ±45° of pitch. */
const AIM_POSE_RANGE = MathUtils.degToRad(45)
const JOG_SPEED = 4.5

const parentQ = new Quaternion()
const twistQ = new Quaternion()
const deltaQ = new Quaternion()

/** Rotate a bone about the world up axis, whatever its local axes are. */
function twistAboutWorldUp(bone: Bone, angle: number) {
  if (!bone.parent) return
  bone.parent.updateWorldMatrix(true, false)
  bone.parent.getWorldQuaternion(parentQ)
  twistQ.setFromAxisAngle(UP, angle)
  deltaQ.copy(parentQ).invert().multiply(twistQ).multiply(parentQ)
  bone.quaternion.premultiply(deltaQ)
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/**
 * Layered animation for the Quaternius universal rig:
 *  - legs: idle / jog (reversed when backpedalling) / airborne, hips twisted toward travel
 *  - upper body: three aim poses blended by pitch, or the reload clip
 *  - additive recoil and hit flinch on top
 *  - a full-body death that takes over everything
 */
export class CharacterAnimator {
  private readonly mixer: AnimationMixer
  private readonly legs: Record<'idle' | 'jog' | 'air', AnimationAction>
  private readonly aim: Record<'up' | 'neutral' | 'down', AnimationAction>
  private readonly reload: AnimationAction
  private readonly recoil: AnimationAction
  private readonly flinch: AnimationAction
  private readonly death: AnimationAction
  private pelvis?: Bone
  private spine?: Bone
  private readonly weights = new Map<AnimationAction, number>()
  private hipTwist = 0
  private lastShots = 0
  private lastHits = 0
  private wasDead = false
  private wasReloading = false

  constructor(model: Object3D, clips: AnimationClip[]) {
    this.mixer = new AnimationMixer(model)
    const byName = new Map(clips.map((c) => [c.name, c]))
    const clip = (name: string, part: 'lower' | 'upper' | 'full') => {
      const source = byName.get(name)
      if (!source) throw new Error(`Animation clip ${name} not found`)
      const c = source.clone()
      c.name = `${name}:${part}`
      if (part !== 'full') c.tracks = c.tracks.filter((t) => LOWER_BODY.test(boneOf(t.name)) === (part === 'lower'))
      return c
    }
    const loop = (c: AnimationClip) => {
      const action = this.mixer.clipAction(c)
      action.play()
      action.setEffectiveWeight(0)
      this.weights.set(action, 0)
      return action
    }
    const once = (c: AnimationClip) => {
      const action = this.mixer.clipAction(c)
      action.setLoop(LoopOnce, 1)
      action.clampWhenFinished = true
      return action
    }

    this.legs = {
      idle: loop(clip('Idle_Loop', 'lower')),
      jog: loop(clip('Jog_Fwd_Loop', 'lower')),
      air: loop(clip('Jump_Loop', 'lower')),
    }
    this.aim = {
      up: loop(clip('Pistol_Aim_Up', 'upper')),
      neutral: loop(clip('Pistol_Aim_Neutral', 'upper')),
      down: loop(clip('Pistol_Aim_Down', 'upper')),
    }
    this.reload = loop(clip('Pistol_Reload', 'upper'))
    this.recoil = once(AnimationUtils.makeClipAdditive(clip('Pistol_Shoot', 'upper')))
    this.flinch = once(AnimationUtils.makeClipAdditive(clip('Hit_Chest', 'full')))
    this.death = once(clip('Death01', 'full'))

    model.traverse((o) => {
      if ((o as Bone).isBone && o.name === 'pelvis') this.pelvis = o as Bone
      if ((o as Bone).isBone && o.name === 'spine_01') this.spine = o as Bone
    })
    this.legs.idle.setEffectiveWeight(1)
    this.weights.set(this.legs.idle, 1)
    this.aim.neutral.setEffectiveWeight(1)
    this.weights.set(this.aim.neutral, 1)
  }

  /** Ease each looping action toward its target weight. */
  private blend(targets: Map<AnimationAction, number>, dt: number) {
    const k = Math.min(1, dt * 12)
    for (const [action, current] of this.weights) {
      const next = current + ((targets.get(action) ?? 0) - current) * k
      this.weights.set(action, next)
      action.setEffectiveWeight(next)
    }
  }

  update(pose: CharacterPose) {
    const { dt } = pose
    const targets = new Map<AnimationAction, number>()

    if (pose.dead) {
      if (!this.wasDead) this.death.reset().play()
      this.wasDead = true
      this.blend(targets, dt * 2)
      this.mixer.update(dt)
      return
    }
    if (this.wasDead) {
      this.death.stop()
      this.wasDead = false
    }

    // Legs
    const speed = Math.hypot(pose.vel.x, pose.vel.z)
    let twist = 0
    if (pose.airborne) {
      targets.set(this.legs.air, 1)
    } else if (speed > 0.4) {
      const travelYaw = Math.atan2(-pose.vel.x, -pose.vel.z)
      const rel = wrapAngle(travelYaw - pose.facingYaw)
      const backwards = Math.abs(rel) > MathUtils.degToRad(110)
      twist = MathUtils.clamp(backwards ? wrapAngle(rel - Math.PI) : rel, -MAX_HIP_TWIST, MAX_HIP_TWIST)
      this.legs.jog.timeScale = (backwards ? -1 : 1) * MathUtils.clamp(speed / JOG_SPEED, 0.6, 1.4)
      targets.set(this.legs.jog, 1)
    } else {
      targets.set(this.legs.idle, 1)
    }

    // Upper body
    if (pose.reloading) {
      if (!this.wasReloading) this.reload.reset()
      targets.set(this.reload, 1)
    } else {
      const p = MathUtils.clamp(pose.aimPitch / AIM_POSE_RANGE, -1, 1)
      targets.set(this.aim.up, Math.max(0, p))
      targets.set(this.aim.down, Math.max(0, -p))
      targets.set(this.aim.neutral, 1 - Math.abs(p))
    }
    this.wasReloading = pose.reloading

    // One-shots
    if (pose.shots > this.lastShots) this.recoil.reset().play()
    if (pose.hits > this.lastHits) this.flinch.reset().play()
    this.lastShots = pose.shots
    this.lastHits = pose.hits

    this.blend(targets, dt)
    this.mixer.update(dt)

    // Point the hips where we're going and the chest back where we're aiming.
    this.hipTwist += (twist - this.hipTwist) * Math.min(1, dt * 10)
    if (this.pelvis && this.spine && Math.abs(this.hipTwist) > 1e-3) {
      twistAboutWorldUp(this.pelvis, this.hipTwist)
      twistAboutWorldUp(this.spine, -this.hipTwist)
    }
  }

  dispose() {
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.mixer.getRoot())
  }
}
