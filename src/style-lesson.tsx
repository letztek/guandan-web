import { useMemo, useState, type CSSProperties } from 'react'
import { translate, useLanguage } from './i18n'
import { LessonGuide } from './lesson-guide'
import { publicTable, type Match } from './match'
import { adviceReason, cardCount, describeCards, displayName, rankName } from './match-l10n'
import { partners, type PartnerId } from './partner-roster'
import { playStyleLabels } from './play-style'
import { ranks, suitNames, symbols, uid } from './rules'
import { createStyleLessonGame, playStyleChoice, styleLessonAdvice, type StyleChoice } from './style-lesson-game'
import { StylePlayout } from './style-playout'
import { Icon, Modal, PlayingCard } from './ui'
import './style-lesson.css'

const choices = ['pass','nine','ace'] as const satisfies readonly StyleChoice[]
const suitCopy = {
  S:['Spades','スペード'], H:['Hearts','ハート'], C:['Clubs','クラブ'],
  D:['Diamonds','ダイヤ'], J:['Jokers','ジョーカー'],
} as const
const styleCopy = {
  support:['Support','サポート'], balanced:['Balanced','堅実'], attack:['Aggressive','攻め'],
} as const

function PlayedCards({table,onClose}:{table:ReturnType<typeof publicTable>;onClose:()=>void}) {
  const language=useLanguage()
  const t = (zh:string,en:string,ja:string) => translate(zh,en,ja,language)
  return <Modal title={t('已出牌','Played cards','出されたカード')+' · '+cardCount(table.played.length)} onClose={onClose}>
    <div className="style-lab-record">{(['S','H','C','D','J'] as const).map(suit=>{
      const played = table.played.filter(card=>card.suit===suit)
      const order = suit==='J'?['SJ','BJ']:ranks
      return <section key={suit}>
        <h3>{symbols[suit]} {t(suitNames[suit] || '王牌',suitCopy[suit][0],suitCopy[suit][1])}</h3>
        <p>{order.flatMap(rank=>{
          const count = played.filter(card=>card.rank===rank).length
          const name = rankName(rank)
          return count?[name+(count>1?'×'+count:'')]:[]
        }).join(t('、',', ','、')) || t('尚未打出','None played yet','まだありません')}</p>
      </section>
    })}</div>
  </Modal>
}

export function StyleLesson({onComplete,onNext}:{onComplete:()=>void;onNext:()=>void}) {
  const language=useLanguage()
  const t = (zh:string,en:string,ja:string) => translate(zh,en,ja,language)
  const choiceLabels = {pass:t('過牌','Pass','パス'),nine:t('出 9','Play 9','9を出す'),ace:t('出 A','Play A','Aを出す')}
  const [opening] = useState(createStyleLessonGame)
  const [attempt,setAttempt] = useState<{choice: StyleChoice; game: Match}|null>(null)
  const [role,setRole] = useState<PartnerId>(partners[0].id)
  const [playing,setPlaying] = useState(false)
  const [showRecord,setShowRecord] = useState(false)
  const table = useMemo(()=>publicTable(opening),[opening])
  const advice = useMemo(()=>attempt ? styleLessonAdvice(opening,role) : null,[opening,role,attempt])
  const person = partners.find(person=>person.id===role)!
  const [englishStyle,japaneseStyle]=styleCopy[person.playStyle]
  const hand = opening.hands[table.seat]
  function choose(choice:StyleChoice) {
    setAttempt({choice,game:playStyleChoice(opening,choice)})
  }
  function retry() {
    setPlaying(false)
    setAttempt(null)
    setRole(partners[0].id)
  }
  if (playing && attempt) return <StylePlayout initialGame={attempt.game} onFinish={onComplete} onRetry={retry} onNext={onNext}/>

  const choiceLabel = attempt && choiceLabels[attempt.choice]
  const suggestedCards = advice?.move ? describeCards(advice.move.cards) : ''
  const suggestion = suggestedCards ? t('出 '+suggestedCards,'Play '+suggestedCards,suggestedCards+'を出す') : choiceLabels.pass
  const dialogue = advice ? adviceReason(advice.reason) : t(
    '換你坐我的位置。搭檔的 8 現在最大，但下家只剩一張。你會過牌、出 9，還是出 A？',
    'Take my seat. Our partner’s 8 is highest and the next opponent has just one card left. Would you pass, play the 9, or play the ace?',
    '私の席で考えてみましょう。パートナーの8が一番強く、次の相手は残り1枚。パス、9、Aのどれを選びますか？',
  )
  const cutaway = <div className="lesson-table style-lab-cutaway">
    <div className="lesson-table-heading"><h3>{t('搭檔目前最大','Partner is ahead','パートナーが優勢')}</h3><span>{t('級牌','Level','レベル')} <b>{opening.level}</b></span></div>
    <div className="lesson-trick">{opening.target?.cards.map(card=><PlayingCard key={uid(card)} card={card} level={opening.level} mini/>)}</div>
  </div>
  const publicSeats = [
    {seat:0,name:t('搭檔','Partner','パートナー'),status:t('已出 ♠8','Played ♠8','♠8を出した')},
    {seat:1,name:t('上家對手','Previous opponent','前の相手'),status:t('已過牌','Passed','パス済み')},
    {seat:3,name:t('下家對手','Next opponent','次の相手'),status:t('在你之後','After you','あなたの次')},
  ]
  return <>
    <LessonGuide dialogue={{left:role,right:role,lines:[{speaker:'left',text:dialogue}]}}
      tone="guide" done={false} cue={'style-lab-'+(attempt?.choice??'opening')+'-'+role} table={cutaway}/>
    <section className="lesson-practice style-lab" aria-label={t('三種牌風比較','Compare three play styles','3つの打ち方を比較')}>
      <div className="lesson-context">
        <div className="style-lab-heading"><h3><Icon name="cards" size={17}/>{t('這一圈','This trick','このトリック')}</h3>
          <button type="button" className="style-lab-history" onClick={()=>setShowRecord(true)}>{t('查看已出牌','View played cards','出されたカードを見る')}</button>
        </div>
        <dl className="style-lab-seats">
          {publicSeats.map(({seat,name,status})=>{
            const count = table.counts[seat]
            return <div key={seat}><dt>{name}</dt><dd><b>{count}</b>{t(' 張',count===1?' card':' cards','枚')}</dd><dd>{status}</dd></div>
          })}
        </dl>
      </div>
      {attempt ? <div className="lesson-hand style-lab-compare">
        <div className="style-lab-personal"><span>{t('你的選擇','Your choice','あなたの選択')}</span><strong>{choiceLabel}</strong></div>
        <h3>{t('比較進階角色的出牌','Compare advanced players','上級キャラクターの手を比較')}</h3>
        <div className="style-lab-switch" role="group" aria-label={t('切換進階角色','Switch advanced player','上級キャラクターを切り替える')}>
          {partners.map(actor=><button key={actor.id} type="button" aria-pressed={role===actor.id}
            onClick={()=>setRole(actor.id)}>{displayName(actor.name)}</button>)}
        </div>
        <div className="style-lab-verdict" aria-live="polite">
          <span>{displayName(person.name)} · {t(playStyleLabels[person.playStyle],englishStyle,japaneseStyle)}</span><strong>{suggestion}</strong>
        </div>
        <div className="style-lab-handline" aria-label={t('出牌前的手牌','Hand before playing','出す前の手札')}>{hand.map(card=>
          <span key={uid(card)} data-play={advice?.move?.cards.some(played=>uid(played)===uid(card)) || undefined}>{describeCards([card])}</span>)}</div>
        <div className="lesson-actions">
          <button className="btn border" type="button" onClick={retry}>{t('重新選擇','Choose again','選び直す')}</button>
          <button className="btn gold" type="button" onClick={()=>setPlaying(true)}>{t('照我的選擇續打','Play out my choice','この選択で続ける')}</button>
        </div>
      </div> : <div className="lesson-hand">
        <div className="lesson-hand-heading"><h3>{t('你的手牌','Your hand','あなたの手札')}</h3><span>{cardCount(hand.length)}</span></div>
        <div className="lesson-rack" style={{'--hand-count':hand.length} as CSSProperties}>
          {hand.map(card=><PlayingCard key={uid(card)} card={card} level={opening.level}/>)}
        </div>
        <div className="lesson-actions style-lab-choices" role="group" aria-label={t('選擇這一手','Choose your play','この手を選ぶ')}>
          {choices.map(choice=><button type="button" className="btn border" key={choice} onClick={()=>choose(choice)}>{choiceLabels[choice]}</button>)}
        </div>
      </div>}
    </section>
    {showRecord && <PlayedCards table={table} onClose={()=>setShowRecord(false)}/>}
  </>
}
