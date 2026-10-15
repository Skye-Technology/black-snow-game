'use client'

import { Canvas } from '@react-three/fiber'
import { useCallback, useEffect, useRef } from 'react'
import { unlockAudio } from '@/game/audio'
import { attachInput, clearInput, isLocked } from '@/game/input'
import { initialHud, useHud, type Phase } from '@/game/store'
import { resetWorld, world } from '@/game/world'
import { Hud } from './Hud'
import { Scene } from './game/Scene'

const CONTROLS: [string, string][] = [
  ['Mouse', 'Aim'],
  ['W A S D', 'Move'],
  ['Left click', 'Fire (hold)'],
  ['Q / Right click', 'Bullet time'],
  ['Shift / Space', 'Shootdodge'],
  ['R', 'Reload'],
  ['Esc', 'Pause'],
]

export default function Game() {
  const rootRef = useRef<HTMLDivElement>(null)
  const phase = useHud((s) => s.phase)
  const bulletTime = useHud((s) => s.bulletTime)

  useEffect(() => attachInput(), [])

  // Dev builds only: inspect live state from the browser console with `__game.world`.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') Object.assign(window, { __game: { world, hud: useHud } })
  }, [])

  // Pointer lock decides whether we are playing: gaining it starts play, losing it pauses.
  useEffect(() => {
    const onChange = () => {
      const { phase, setPhase } = useHud.getState()
      clearInput()
      if (isLocked() && phase !== 'playing') setPhase('playing')
      else if (!isLocked() && phase === 'playing') setPhase('paused')
    }
    document.addEventListener('pointerlockchange', onChange)
    return () => document.removeEventListener('pointerlockchange', onChange)
  }, [])

  const start = useCallback(() => {
    unlockAudio()
    const { phase, patch, bump } = useHud.getState()
    if (phase === 'menu' || phase === 'dead') {
      resetWorld()
      patch(initialHud)
      bump('entityVersion')
    }
    const canvas = rootRef.current?.querySelector('canvas')
    // Browsers refuse to re-lock for about a second after Esc. The overlay stays up, so the player can click again.
    Promise.resolve(canvas?.requestPointerLock()).catch(() => {})
  }, [])

  return (
    <div ref={rootRef} className={`game${bulletTime ? ' slowmo' : ''}`}>
      <Canvas shadows="percentage" dpr={[1, 1.75]} camera={{ fov: 62, near: 0.05, far: 150, position: [0, 6, 17] }}>
        <Scene />
      </Canvas>
      <Hud />
      {phase !== 'playing' && <Overlay phase={phase} onStart={start} />}
    </div>
  )
}

function Overlay({ phase, onStart }: { phase: Exclude<Phase, 'playing'>; onStart: () => void }) {
  const wave = useHud((s) => s.wave)
  const kills = useHud((s) => s.kills)
  const copy = {
    menu: { title: 'Black Snow', sub: 'A bullet-time noir shooter', cta: 'Click to play' },
    paused: { title: 'Paused', sub: 'The snow can wait.', cta: 'Click to resume' },
    dead: { title: 'You died', sub: `Wave ${wave} · ${kills} kills`, cta: 'Click to try again' },
  }[phase]

  return (
    <div className={`overlay ${phase}`} onClick={onStart}>
      <h1>{copy.title}</h1>
      <p className="sub">{copy.sub}</p>
      {phase !== 'dead' && (
        <dl className="controls">
          {CONTROLS.map(([key, action]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
      )}
      <button type="button" className="cta">
        {copy.cta}
      </button>
    </div>
  )
}
