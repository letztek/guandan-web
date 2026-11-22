import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { assetPath } from './assets'
import { FinaleScene } from './match-finale'
import type { PartnerId } from './partner-roster'
import { playMusicPreview, type MusicScene } from './room-music'
import { Icon } from './ui'
import { translate as t, useLanguage } from './i18n'
import './finale-preview.css'

const tracks: Record<MusicScene,[string,string,string]> = {
  lobby:['選角','Character selection','キャラクター選択'], practice:['教學','Tutorial','チュートリアル'],
  table:['對局','In play','対戦中'], endgame:['殘局','Endgame','終盤'],
  win:['單副勝利','Deal won','局の勝利'], loss:['單副落敗','Deal lost','局の敗北'],
  matchWin:['整場勝利','Match won','マッチ勝利'], matchLoss:['整場落敗','Match lost','マッチ敗北'],
}
const listening: MusicScene[] = ['lobby','practice','table','endgame','win','loss']
const examples = { matchWin:[0,1,2,3], matchLoss:[1,3] }
type Outcome = keyof typeof examples

export function FinalePreview({partnerId}:{partnerId:PartnerId}) {
  useLanguage()
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
        <span className="home-brand"><Icon name="cards" size={24}/> {t('水晶亭的休戰日','Truce Day at the Crystal Pavilion','水晶亭の休戦日')}</span>
        <a className="home-preview-link" href="#home"><Icon name="undo" size={17}/> {t('主選單','Main menu','メインメニュー')}</a>
      </header>
      <main className="preview-layout">
        <h1>{t('勝敗與配樂','Results and music','勝敗とBGM')}</h1>
        <section className="preview-stage" aria-label={t('結算動畫預覽','Preview the result animation','結果アニメーションのプレビュー')}>
          <div className="preview-controls" role="group" aria-label={t('重播結算動畫與音樂','Replay result animation and music','結果アニメーションとBGMを再生')}>
            {(['matchWin','matchLoss'] as const).map(scene=><button type="button" key={scene}
              aria-pressed={scene===outcome} onClick={()=>show(scene)}><Icon name="flag" size={16}/> {t('播放'+tracks[scene][0],'Play '+tracks[scene][1].toLowerCase(),tracks[scene][2]+'を再生')}</button>)}
          </div>
          <div className={'preview-performance match-finale '+(outcome==='matchWin'?'finale-win':'finale-loss')}>
            <FinaleScene key={replay} finish={examples[outcome]} partnerId={partnerId} partnerHasCards={outcome==='matchLoss'}/>
          </div>
        </section>
        <section className="preview-rules" aria-label={t('勝敗規則','Winning conditions','勝敗条件')}>
          <h2>{t('這一副怎麼贏？','How do you win a deal?','局の勝利条件')}</h2>
          <p>{t('最先出完手牌的人是頭游，所屬隊伍贏下這一副。搭檔的名次決定升幾級。','The first player to empty their hand wins the deal for their team. Their partner’s place determines the level gain.','最初に手札を出し切った人が1位です。そのチームが局に勝ち、パートナーの順位で上がるレベル数が決まります。')}</p>
          <table><thead><tr><th>{t('頭游的搭檔','Partner’s place','1位のパートナー')}</th><th>{t('二游','2nd','2位')}</th><th>{t('三游','3rd','3位')}</th><th>{t('末游','4th','4位')}</th></tr></thead>
            <tbody><tr><th scope="row">{t('該隊升級','Team gain','昇級')}</th><td>{t('3 級','3 levels','3レベル')}</td><td>{t('2 級','2 levels','2レベル')}</td><td>{t('1 級','1 level','1レベル')}</td></tr></tbody></table>
          <h2>{t('整場怎麼贏？','How do you win a match?','マッチの勝利条件')}</h2>
          <p>{t('兩隊都從 2 級開始。贏下一副後，下一副就由該隊主打升級後的級牌，最高到 A。','Both teams start at level 2. The team that wins a deal sets the level for the next deal after advancing. A is the highest level.','両チームともレベル2で開始します。局に勝ったチームが昇級し、そのレベルが次の局の主レベルになります。最高はAです。')}</p>
          <p>{t('我方主打 A 時，拿下第一、第二或第一、第三，就贏得整場。第一、第四會留在 A，下副再挑戰。對方主打 A 並達成同樣條件，我方就整場落敗。','When your team sets the level to A, finish first and second or first and third to win the match. First and fourth keeps your team at A for another attempt. You lose if the opponents meet the same conditions.','自チームがAを主レベルとする局で、1位と2位または1位と3位になればマッチ勝利です。1位と4位ならAのまま再挑戦します。相手チームが同じ勝利条件を満たせば敗北です。')}</p>
        </section>
        <section className="preview-sound" aria-label={t('配樂試聽','Music preview','BGM試聴')}>
          <div className="preview-sound-head"><h2><Icon name="sound" size={19}/> {t('配樂試聽','Music preview','BGM試聴')}</h2>
            <button type="button" className="preview-stop" disabled={!track} onClick={stop}>{t('停止播放','Stop playback','停止')}</button></div>
          <div className="preview-tracks">{listening.map(scene=><button type="button" key={scene}
            aria-pressed={track===scene} onClick={()=>play(scene)}>{t(...tracks[scene])}</button>)}</div>
          <output className="preview-status">{track?t('播放中','Now playing','再生中')+' · '+t(...tracks[track]):t('點選場景即可試聽','Choose a scene to listen','場面を選んで試聴')}</output>
        </section>
      </main>
    </div>
  </div>
}
