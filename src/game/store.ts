import { create } from 'zustand'
import { BULLET_TIME, GUN, PLAYER } from './config'

export type Phase = 'menu' | 'playing' | 'paused' | 'dead'

/** React-facing state: the HUD and overlays. The simulation writes here only when a value changes. */
export interface HudState {
  phase: Phase
  health: number
  ammo: number
  reloading: boolean
  bulletTimeMeter: number
  bulletTime: boolean
  wave: number
  kills: number
  /** Bumped when the player takes damage; drives the red flash. */
  hurtCount: number
  /** Bumped when an enemy is hit; drives the hit marker. */
  hitMarkerCount: number
  /** Bumped when enemies or pickups are added or removed, so their lists re-render. */
  entityVersion: number
  setPhase: (phase: Phase) => void
  patch: (partial: Partial<HudState>) => void
  bump: (key: 'hurtCount' | 'hitMarkerCount' | 'entityVersion') => void
}

export const initialHud = {
  health: PLAYER.maxHealth,
  ammo: GUN.magazine,
  reloading: false,
  bulletTimeMeter: BULLET_TIME.max,
  bulletTime: false,
  wave: 0,
  kills: 0,
}

export const useHud = create<HudState>((set) => ({
  phase: 'menu',
  ...initialHud,
  hurtCount: 0,
  hitMarkerCount: 0,
  entityVersion: 0,
  setPhase: (phase) => set({ phase }),
  patch: (partial) => set(partial),
  bump: (key) => set((s) => ({ [key]: s[key] + 1 })),
}))
