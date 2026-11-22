import { useEffect, useRef, useState } from 'react'
import { Icon } from './ui'
import './room-music.css'

// An original 16-bar tune in 6/8. Each row gives a bass note, the three
// upper lute strings, and six melody pulses. A dash sustains the last note.
const hold = -1
const lobbyBars = [
  [50, 57, 62, 66,  69,hold,66, 64,hold,62],
  [47, 54, 59, 62,  66,hold,69, 71,hold,hold],
  [43, 55, 59, 62,  71,hold,74, 69,67,66],
  [45, 57, 61, 64,  64,hold,hold, 0,64,67],
  [50, 57, 62, 66,  69,hold,66, 74,hold,73],
  [42, 54, 57, 61,  73,hold,69, 66,hold,64],
  [43, 55, 59, 62,  62,hold,66, 67,hold,71],
  [45, 57, 61, 64,  69,hold,hold, 0,hold,0],
  [47, 54, 59, 62,  66,hold,69, 71,hold,74],
  [43, 55, 59, 62,  74,hold,76, 74,71,69],
  [50, 54, 57, 62,  69,hold,66, 64,hold,66],
  [45, 52, 57, 61,  64,hold,hold, 0,61,64],
  [43, 55, 59, 62,  67,hold,71, 74,hold,69],
  [40, 55, 59, 64,  67,hold,64, 62,hold,64],
  [45, 52, 57, 61,  66,64,62, 61,hold,64],
  [50, 54, 57, 62,  62,hold,hold, hold,0,0],
] as const
// Bass, three plucked strings, then the melody for one bar.
const tableBars = [
  [50,57,62,66,  74,hold,69,66], [47,54,59,62,  71,hold,66,62],
  [43,55,59,62,  67,69,71,hold], [45,52,57,61,  69,hold,0,64],
  [50,57,62,66,  66,69,74,hold], [42,54,57,61,  73,hold,69,66],
  [43,55,59,62,  71,67,64,hold], [45,52,57,61,  61,hold,62,hold],
]
const endgameBars = [
  [47,54,59,62,  66,0,66,69,68,66], [43,55,59,62,  67,0,67,71,69,67],
  [40,52,55,59,  64,hold,67,69,67,64], [42,54,58,61,  66,hold,65,66,0,0],
]
const practiceBars = [
  [50,57,62,66,  66,hold,0,0], [43,55,59,62,  67,hold,0,0],
  [45,52,57,61,  64,hold,0,0], [50,54,57,62,  62,hold,hold,0],
]
// The two result cadences resolve once, leaving room for the next deal.
const victory = [[50,57,62,66,  66,69,74,hold], [43,55,59,62,  71,74,78,hold], [50,57,62,66,  81,hold,hold,hold]]
const defeat = [[47,54,59,62,  71,hold,69,66], [40,52,55,59,  67,hold,64,hold], [47,54,59,62,  62,hold,hold,hold]]
// A rising D-major fanfare closes a match win. The loss theme answers with
// a slower B-minor descent, ending on a sustained tonic in each arrangement.
const matchVictory = [
  [50,57,62,66,  62,66,69,74], [55,59,62,67,  71,hold,74,79],
  [54,57,62,66,  78,76,74,69], [45,57,61,64,  73,76,81,hold],
  [50,57,62,66,  78,76,74,hold], [50,57,62,66,  86,hold,hold,hold],
]
const matchDefeat = [
  [47,54,59,62,  74,hold,71,69], [43,55,59,62,  67,hold,66,62],
  [40,52,55,59,  64,67,66,hold], [42,54,58,61,  61,hold,58,hold],
  [47,54,59,62,  59,hold,hold,hold],
]
type Score = { bars: readonly (readonly number[])[], pulse: number, lead: OscillatorType, loop: boolean }
const themes = {
  lobby: {bars:lobbyBars,pulse:60/74/3,lead:'sine',loop:true},
  table: {bars:tableBars,pulse:.39,lead:'triangle',loop:true},
  endgame: {bars:endgameBars,pulse:.21,lead:'triangle',loop:true},
  practice: {bars:practiceBars,pulse:.52,lead:'sine',loop:true},
  win: {bars:victory,pulse:.29,lead:'triangle',loop:false},
  loss: {bars:defeat,pulse:.43,lead:'sine',loop:false},
  matchWin: {bars:matchVictory,pulse:.265,lead:'triangle',loop:false},
  matchLoss: {bars:matchDefeat,pulse:.40,lead:'sine',loop:false},
} satisfies Record<string,Score>
export type MusicScene = keyof typeof themes
const setting = 'guandan.roomMusic.enabled'
const volumeSetting = 'guandan.roomMusic.volume'
const fullGain = .26
const strings = [1,2,3,1,3,2]

class RoomPlayer {
  private context: AudioContext|null = null
  private output: GainNode|null = null
  private instruments: GainNode|null = null
  private scene: MusicScene = 'lobby'
  private timer?: number
  private suspendTimer?: number
  private completionTimer?: number
  private lastNoteEnd = 0
  onComplete?: () => void
  private position = 0
  private next = 0
  private activated = false
  enabled = true
  volume = 100

  constructor() {
    try {
      this.enabled = localStorage.getItem(setting) !== 'false'
      const stored = localStorage.getItem(volumeSetting)
      if (stored !== null && /^\d{1,3}$/.test(stored) && Number(stored) <= 100) this.volume = Number(stored)
    } catch { /* optional storage */ }
  }

  setVolume(value: number) {
    if (!Number.isFinite(value)) return
    this.volume = Math.max(0,Math.min(100,Math.round(value)))
    try { localStorage.setItem(volumeSetting,String(this.volume)) } catch { /* optional storage */ }
    if (this.enabled && this.context && this.output && !document.hidden) {
      this.output.gain.setTargetAtTime(this.outputGain(),this.context.currentTime,.02)
    }
  }

  private outputGain() {
    return fullGain * this.volume / 100
  }

  setScene = (scene: MusicScene) => {
    if (scene === this.scene) return
    this.scene = scene
    this.position = 0
    this.next = (this.context?.currentTime ?? 0) + .09
    if (!this.context || !this.output) return
    const previous = this.instruments
    if (previous) {
      previous.gain.setTargetAtTime(0,this.context.currentTime,.045)
      window.setTimeout(()=>previous.disconnect(),350)
    }
    this.instruments = this.context.createGain()
    this.instruments.connect(this.output)
    if (this.activated && this.enabled && !document.hidden) this.start()
  }

  private note(note: number, time: number, duration: number, volume: number, voice: OscillatorType, attack = .012) {
    const ctx = this.context
    if (!ctx || !this.instruments) return
    const oscillator = ctx.createOscillator()
    const envelope = ctx.createGain()
    oscillator.type = voice
    oscillator.frequency.value = 440 * 2 ** ((note - 69) / 12)
    envelope.gain.setValueAtTime(.0001,time)
    envelope.gain.exponentialRampToValueAtTime(volume,time + attack)
    envelope.gain.exponentialRampToValueAtTime(.0001,time + duration)
    oscillator.connect(envelope)
    envelope.connect(this.instruments)
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect() }
    oscillator.start(time)
    oscillator.stop(time + duration + .02)
    if (this.onComplete) this.lastNoteEnd = Math.max(this.lastNoteEnd,time + duration + .02)
  }

  private schedule = () => {
    if (!this.context || this.context.state !== 'running') return
    const now = this.context.currentTime
    const {bars,pulse,lead,loop} = themes[this.scene]
    const beats = bars[0].length - 4
    this.next = Math.max(this.next,now + .015)
    while (this.next < now + .2) {
      if (this.position >= bars.length * beats) {
        if (!loop) {
          window.clearInterval(this.timer)
          this.timer = undefined
          if (this.onComplete) this.completionTimer = window.setTimeout(this.onComplete,Math.max(0,this.lastNoteEnd-now)*1000)
          return
        }
        this.position = 0
      }
      const bar = bars[Math.floor(this.position / beats)]
      const beat = this.position % beats
      if (beat === 0) this.note(bar[0],this.next,1.3,.20,'sine',.04)
      this.note(bar[strings[beat]],this.next,.83,beat % 3 === 0 ? .15 : .10,'triangle')
      const melody = bar[4 + beat]
      if (melody > 0) {
        let length = 1
        while (beat + length < beats && bar[4 + beat + length] === hold) length++
        this.note(melody,this.next + .014,pulse * length + .27,.21,lead,.055)
      }
      this.position++
      this.next += pulse
    }
  }

  start = () => {
    this.activated = true
    if (!this.enabled || document.hidden) return
    try {
      window.clearTimeout(this.suspendTimer)
      if (!this.context) {
        this.context = new AudioContext()
        this.output = this.context.createGain()
        this.output.gain.value = this.outputGain()
        this.output.connect(this.context.destination)
        this.instruments = this.context.createGain()
        this.instruments.connect(this.output)
      }
      const ctx = this.context
      if (this.timer === undefined) this.output?.gain.setTargetAtTime(this.outputGain(),ctx.currentTime,.02)
      if (ctx.state !== 'running') void ctx.resume().then(() => {
        if (ctx !== this.context) return
        if (!this.enabled || document.hidden) this.pause()
        else this.schedule()
      }).catch(() => {})
      if (this.timer === undefined) {
        this.timer = window.setInterval(this.schedule,85)
        this.schedule()
      }
    } catch { /* Audio support is optional for playing cards. */ }
  }

  select = () => {
    this.start()
    if (!this.enabled || document.hidden || !this.context) return
    const time = this.context.currentTime + .025
    this.note(74,time,.26,.17,'sine')
    this.note(81,time + .09,.48,.12,'sine')
  }

  private pause() {
    window.clearInterval(this.timer)
    this.timer = undefined
    window.clearTimeout(this.suspendTimer)
    const ctx = this.context
    if (!ctx || ctx.state === 'closed') return
    this.output?.gain.setTargetAtTime(0,ctx.currentTime,.012)
    this.suspendTimer = window.setTimeout(() => {
      void ctx.suspend().then(() => {
        // A tab can return to the foreground while suspension is in flight.
        if (ctx === this.context && this.enabled && !document.hidden) this.start()
      }).catch(() => {})
    },65)
  }

  toggle() {
    this.enabled = !this.enabled
    try { localStorage.setItem(setting,String(this.enabled)) } catch { /* optional storage */ }
    if (this.enabled) this.start()
    else this.pause()
  }

  visibility = () => {
    if (document.hidden) this.pause()
    else if (this.activated) this.start()
  }

  dispose() {
    window.clearTimeout(this.completionTimer)
    window.clearInterval(this.timer)
    window.clearTimeout(this.suspendTimer)
    this.timer = undefined
    const ctx = this.context
    this.context = null
    this.instruments = null
    this.output = null
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {})
  }
}

export function playMusicPreview(scene: MusicScene, onComplete: () => void) {
  const player = new RoomPlayer()
  player.enabled = true
  player.onComplete = onComplete
  player.setScene(scene)
  player.start()
  return () => player.dispose()
}

export function useRoomMusic(active = true) {
  const ref = useRef<RoomPlayer|null>(null)
  if (!ref.current) ref.current = new RoomPlayer()
  const player = ref.current
  const [enabled,setEnabled] = useState(player.enabled)
  const [volume,setVolume] = useState(player.volume)
  useEffect(() => {
    if (!active) return
    const unlock = (event: Event) => { if (event.isTrusted) player.start() }
    window.addEventListener('pointerup',unlock)
    window.addEventListener('keydown',unlock)
    document.addEventListener('visibilitychange',player.visibility)
    return () => {
      window.removeEventListener('pointerup',unlock)
      window.removeEventListener('keydown',unlock)
      document.removeEventListener('visibilitychange',player.visibility)
      player.dispose()
    }
  },[active,player])
  return {enabled,volume,start:player.start,select:player.select,setScene:player.setScene,
    changeVolume:(value:number) => {player.setVolume(value); setVolume(player.volume)},
    toggle:() => {player.toggle(); setEnabled(player.enabled)}}
}

export function RoomMusicButton({enabled,onToggle}:{enabled:boolean,onToggle:()=>void}) {
  return <button type="button" className="room-music-button" aria-label="背景音樂" aria-pressed={enabled}
      title={enabled?'關閉背景音樂':'開啟背景音樂'} onClick={onToggle}>
    <Icon name={enabled?'sound':'mute'} size={17}/>
    <span className="room-music-label">背景音樂{enabled?'已開啟':'已關閉'}</span>
  </button>
}
