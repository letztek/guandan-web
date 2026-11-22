import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { assetPath } from './assets'
import { FinaleScene } from './match-finale'
import type { PartnerId } from './partner-roster'
import { playMusicPreview, type MusicScene } from './room-music'
import { Icon } from './ui'
import './finale-preview.css'

const tracks: Record<MusicScene,string> = {
  lobby:'選角', practice:'教學', table:'對局', endgame:'殘局',
  win:'單副勝利', loss:'單副落敗', matchWin:'整場勝利', matchLoss:'整場落敗',
}
const listening: MusicScene[] = ['lobby','practice','table','endgame','win','loss']
const examples = { matchWin:[0,1,2,3], matchLoss:[1,3] }
type Outcome = keyof typeof examples

export function FinalePreview({partnerId}:{partnerId:PartnerId}) {
  const [outcome,setOutcome] = useState<Outcome>('matchWin')
  const [replay,setReplay] = useState(0)
  const [track,setTrack] = useState<MusicScene|null>(null)
  const playback = useRef<(() => void)|null>(null)
  const stop = useCallback(() => {
    playback.current?.()
    playback.current = null
    setTrack(null)
  },[])
  useEffect(() => {
    const hide = () => { if (document.hidden) stop() }
    document.addEventListener('visibilitychange',hide)
    return () => {
      document.removeEventListener('visibilitychange',hide)
      playback.current?.()
    }
  },[stop])
  function play(scene: MusicScene) {
    stop()
    playback.current = playMusicPreview(scene,stop)
    setTrack(scene)
  }
  function show(scene: Outcome) {
    setOutcome(scene)
    setReplay(value=>value+1)
    play(scene)
  }

  return <div className="room-home finale-preview" style={{'--home-inn':'url("'+assetPath('art/tavern.jpg')+'")'} as CSSProperties}>
    <div className="room-home-inner">
      <header className="home-mast">
        <span className="home-brand"><Icon name="cards" size={24}/> 水晶亭的休戰日</span>
        <a className="home-preview-link" href="#home"><Icon name="undo" size={17}/> 主選單</a>
      </header>
      <main className="preview-layout">
        <h1>勝敗與配樂</h1>
        <section className="preview-stage" aria-label="結算動畫預覽">
          <div className="preview-controls" role="group" aria-label="重播結算動畫與音樂">
            {(['matchWin','matchLoss'] as const).map(scene=><button type="button" key={scene}
              aria-pressed={scene===outcome} onClick={()=>show(scene)}><Icon name="flag" size={16}/> 播放{tracks[scene]}</button>)}
          </div>
          <div className={'preview-performance match-finale '+(outcome==='matchWin'?'finale-win':'finale-loss')}>
            <FinaleScene key={replay} finish={examples[outcome]} partnerId={partnerId} partnerHasCards={outcome==='matchLoss'}/>
          </div>
        </section>
        <section className="preview-rules" aria-label="勝敗規則">
          <h2>這一副怎麼贏？</h2>
          <p>最先出完手牌的人是頭游，所屬隊伍贏下這一副。搭檔的名次決定升幾級。</p>
          <table><thead><tr><th>頭游的搭檔</th><th>二游</th><th>三游</th><th>末游</th></tr></thead>
            <tbody><tr><th scope="row">該隊升級</th><td>3 級</td><td>2 級</td><td>1 級</td></tr></tbody></table>
          <h2>整場怎麼贏？</h2>
          <p>兩隊都從 2 級開始。贏下一副後，下一副就由該隊主打升級後的級牌，最高到 A。</p>
          <p>我方主打 A 時，拿下第一、第二或第一、第三，就贏得整場。第一、第四會留在 A，下副再挑戰。對方主打 A 並達成同樣條件，我方就整場落敗。</p>
        </section>
        <section className="preview-sound" aria-label="配樂試聽">
          <div className="preview-sound-head"><h2><Icon name="sound" size={19}/> 配樂試聽</h2>
            <button type="button" className="preview-stop" disabled={!track} onClick={stop}>停止播放</button></div>
          <div className="preview-tracks">{listening.map(scene=><button type="button" key={scene}
            aria-pressed={track===scene} onClick={()=>play(scene)}>{tracks[scene]}</button>)}</div>
          <output className="preview-status">{track?'播放中 · '+tracks[track]:'點選場景即可試聽'}</output>
        </section>
      </main>
    </div>
  </div>
}
