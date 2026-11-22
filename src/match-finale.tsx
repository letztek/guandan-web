import { useEffect, useState, type CSSProperties } from 'react'
import { assetPath } from './assets'
import { partner, places, teamOf, type Match } from './match'
import type { PartnerId } from './partner-roster'
import { characterName } from './table-seats'
import { Icon, Modal, PlayingCard } from './ui'
import './match-finale.css'

type Props = {
  game: Match
  partnerId: PartnerId
  available: boolean
  onReview: () => void
  onRematch: () => void
}

export function MatchFinale({game,partnerId,available,onReview,onRematch}: Props) {
  const [screen,setScreen] = useState<'arriving'|'open'|'closed'>('arriving')
  useEffect(()=>{
    if (!available || screen!=='arriving') return
    // Let the final play land on the table before revealing the match result.
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1050
    const timer = window.setTimeout(()=>setScreen('open'),delay)
    return ()=>window.clearTimeout(timer)
  },[available,screen])

  const won = teamOf(game.finish[0])===0
  const title = won?'整場勝利':'整場落敗'
  const close = ()=>setScreen('closed')

  return <>
    <button className="btn border finale-reopen" onClick={()=>setScreen('open')}>查看整場戰果</button>
    {screen==='open' && available && <Modal title={title} className={'match-finale '+(won?'finale-win':'finale-loss')} onClose={close}>
      <FinaleScene finish={game.finish} handNo={game.handNo} partnerId={partnerId} partnerHasCards={game.hands[2].length>0}/>
      <footer>
        <button className="btn border" onClick={()=>{close();onReview()}}><Icon name="history" size={16}/>本副牌譜</button>
        <button className="btn gold" onClick={()=>{close();onRematch()}}>再開一場</button>
      </footer>
    </Modal>}
  </>
}

type SceneProps = { finish: readonly number[]; handNo?: number; partnerId: PartnerId; partnerHasCards: boolean }

export function FinaleScene({finish,handNo,partnerId,partnerHasCards}: SceneProps) {
  const first = finish[0]
  const mate = partner(first)
  const won = teamOf(first)===0
  const team = won?'我方':'對方'
  const partnerPose = (won?'win':'lose')+(partnerHasCards?'-hand':'-rest')
  return <div className="finale-scene">
    <div className="finale-illustration" aria-hidden="true">
      <div className="finale-halo"/>
      <div className="finale-card left"><PlayingCard card={{id:'finale-spade',suit:'S',rank:'A'}} mini/></div>
      <div className="finale-card right"><PlayingCard card={{id:'finale-heart',suit:'H',rank:'A'}} mini/></div>
      <img className="finale-partner" src={assetPath('character/postures/'+partnerId+'-'+partnerPose+'.webp')} alt=""/>
      <div className="finale-motes">{[0,1,2,3,4,5,6].map(i=><i key={i} style={{'--n':i} as CSSProperties}/>)}</div>
    </div>
    <div className="finale-summary">
      <small>{handNo===undefined?'牌局範例':'第 '+handNo+' 副'} · 主打級牌 A</small>
      <h3>{team}過 A</h3>
      <p>主打 A 的隊伍拿下頭游，搭檔取得二游或三游，即可贏得整場。</p>
      <ul aria-label="過 A 隊伍名次">
        {[first,mate].map(seat=><li key={seat}><span>{places[finish.indexOf(seat)]}</span> {characterName(seat,partnerId)}</li>)}
      </ul>
    </div>
  </div>
}
