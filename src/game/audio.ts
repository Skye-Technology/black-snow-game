/**
 * Synthesised sound effects (Web Audio), so the game needs no audio files.
 * Everything is pitched down while bullet time is on.
 */

let ctx: AudioContext | null = null
let noise: AudioBuffer | null = null
let master: GainNode | null = null

/** Must be called from a user gesture (click) before sounds will play. */
export function unlockAudio(): void {
  if (typeof window === 'undefined') return
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = 0.5
    master.connect(ctx.destination)
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  if (ctx.state === 'suspended') void ctx.resume()
}

function burst(opts: { volume: number; cutoff: number; decay: number; rate: number; thump?: number }) {
  if (!ctx || !noise || !master) return
  const t = ctx.currentTime
  const src = ctx.createBufferSource()
  src.buffer = noise
  src.playbackRate.value = opts.rate
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = opts.cutoff * opts.rate
  const gain = ctx.createGain()
  const decay = opts.decay / opts.rate
  gain.gain.setValueAtTime(opts.volume, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + decay)
  src.connect(filter).connect(gain).connect(master)
  src.start(t)
  src.stop(t + decay + 0.05)

  if (opts.thump) {
    const osc = ctx.createOscillator()
    const og = ctx.createGain()
    osc.frequency.setValueAtTime(opts.thump * opts.rate, t)
    osc.frequency.exponentialRampToValueAtTime(30, t + decay)
    og.gain.setValueAtTime(opts.volume * 0.8, t)
    og.gain.exponentialRampToValueAtTime(0.001, t + decay)
    osc.connect(og).connect(master)
    osc.start(t)
    osc.stop(t + decay + 0.05)
  }
}

const rateFor = (slowMo: boolean) => (slowMo ? 0.45 : 1)

export const sfx = {
  playerShot: (slowMo: boolean) =>
    burst({ volume: 0.55, cutoff: 3500, decay: 0.18, rate: rateFor(slowMo) * (0.95 + Math.random() * 0.1), thump: 140 }),
  enemyShot: (slowMo: boolean, distance: number) =>
    burst({ volume: Math.max(0.08, 0.45 - distance * 0.012), cutoff: 2200, decay: 0.22, rate: rateFor(slowMo) * 0.85, thump: 110 }),
  impact: (slowMo: boolean) => burst({ volume: 0.12, cutoff: 6000, decay: 0.05, rate: rateFor(slowMo) * 1.5 }),
  hitEnemy: (slowMo: boolean) => burst({ volume: 0.3, cutoff: 900, decay: 0.08, rate: rateFor(slowMo), thump: 220 }),
  hurt: () => burst({ volume: 0.5, cutoff: 500, decay: 0.25, rate: 1, thump: 90 }),
  reload: () => {
    burst({ volume: 0.15, cutoff: 8000, decay: 0.03, rate: 2 })
    setTimeout(() => burst({ volume: 0.2, cutoff: 8000, decay: 0.04, rate: 2 }), 900)
  },
  pickup: () => burst({ volume: 0.2, cutoff: 9000, decay: 0.06, rate: 2.5, thump: 600 }),
  bulletTime: (on: boolean) => {
    if (!ctx || !master) return
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(on ? 400 : 60, t)
    osc.frequency.exponentialRampToValueAtTime(on ? 50 : 400, t + 0.5)
    g.gain.setValueAtTime(0.25, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6)
    osc.connect(g).connect(master)
    osc.start(t)
    osc.stop(t + 0.65)
  },
}
