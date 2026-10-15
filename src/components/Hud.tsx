'use client'

import { BULLET_TIME, GUN, PLAYER } from '@/game/config'
import { useHud } from '@/game/store'

export function Hud() {
  const phase = useHud((s) => s.phase)
  const health = useHud((s) => s.health)
  const ammo = useHud((s) => s.ammo)
  const reloading = useHud((s) => s.reloading)
  const meter = useHud((s) => s.bulletTimeMeter)
  const bulletTime = useHud((s) => s.bulletTime)
  const wave = useHud((s) => s.wave)
  const kills = useHud((s) => s.kills)
  const hurtCount = useHud((s) => s.hurtCount)
  const hitMarkerCount = useHud((s) => s.hitMarkerCount)

  if (phase === 'menu') return null
  const healthPct = (health / PLAYER.maxHealth) * 100
  const meterPct = (meter / BULLET_TIME.max) * 100

  return (
    <div className="hud" aria-hidden>
      <div className="vignette" />
      {hurtCount > 0 && <div key={`hurt-${hurtCount}`} className="hurt-flash" />}

      <div className="crosshair" />
      {hitMarkerCount > 0 && <div key={`hit-${hitMarkerCount}`} className="hit-marker" />}

      {wave > 0 && (
        <div key={`wave-${wave}`} className="wave-banner">
          Wave {wave}
        </div>
      )}

      <div className="hud-top">
        <span>Wave {wave}</span>
        <span>Kills {kills}</span>
      </div>

      <div className="hud-left">
        <div className="meter-label">Health</div>
        <div className="meter">
          <div className={`meter-fill health${healthPct < 30 ? ' low' : ''}`} style={{ width: `${healthPct}%` }} />
        </div>
        <div className="meter-label">Bullet time {bulletTime && <em>· active</em>}</div>
        <div className="meter">
          <div className={`meter-fill bt${bulletTime ? ' active' : ''}`} style={{ width: `${meterPct}%` }} />
        </div>
      </div>

      <div className="hud-right">
        <div className="ammo">
          {reloading ? <span className="reloading">Reloading</span> : ammo}
          <small> / {GUN.magazine}</small>
        </div>
      </div>
    </div>
  )
}
