import { useEffect, useState, type CSSProperties } from 'react'
import { assetPath } from './assets'
import { partner, teamOf, type Match } from './match'
import { translate as t } from './i18n'
import { displayName, handNumber, placeName } from './match-l10n'
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
  const title = won?t('整場勝利','Match won','マッチ勝利'):t('整場落敗','Match lost','マッチ敗北')
  const close = ()=>setScreen('closed')

  return <>
    <button className="btn border finale-reopen" onClick={()=>setScreen('open')}>{t('查看整場戰果','Match results','マッチ結果を見る')}</button>
    {screen==='open' && available && <Modal title={title} className={'match-finale '+(won?'finale-win':'finale-loss')} onClose={close}>
      <FinaleScene finish={game.finish} handNo={game.handNo} partnerId={partnerId} partnerHasCards={game.hands[2].length>0}/>
      <footer>
        <button className="btn border" onClick={()=>{close();onReview()}}><Icon name="history" size={16}/>{t('本副牌譜','Deal history','この局の履歴')}</button>
        <button className="btn gold" onClick={()=>{close();onRematch()}}>{t('再開一場','Play again','もう一戦')}</button>
      </footer>
    </Modal>}
  </>
}

type SceneProps = { finish: readonly number[]; handNo?: number; partnerId: PartnerId; partnerHasCards: boolean }

export function FinaleScene({finish,handNo,partnerId,partnerHasCards}: SceneProps) {
  const first = finish[0]
  const mate = partner(first)
  const won = teamOf(first)===0
  const team = won?t('我方','Your team','自チーム'):t('對方','Opponents','相手チーム')
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
      <small>{handNo===undefined?t('牌局範例','Example deal','対局例'):handNumber(handNo)} · {t('主打級牌 A','Level A','レベルA')}</small>
      <h3>{t(team+'過 A',team+' cleared A',team+'がAを突破')}</h3>
      <p>{t('主打 A 的隊伍拿下頭游，搭檔取得二游或三游，即可贏得整場。','The team playing at level A wins the match by finishing first and either second or third.','レベルAのチームが1位と2位、または1位と3位になればマッチに勝利します。')}</p>
      <ul aria-label={t('過 A 隊伍名次','Finishing places for the team that cleared A','Aを突破したチームの順位')}>
        {[first,mate].map(seat=><li key={seat}><span>{placeName(finish.indexOf(seat))}</span> {displayName(characterName(seat,partnerId))}</li>)}
      </ul>
    </div>
  </div>
}
