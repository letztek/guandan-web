import { useMemo, useState, type CSSProperties } from 'react'
import { LessonGuide } from './lesson-guide'
import { publicTable, type Match } from './match'
import { partners, type PartnerId } from './partner-roster'
import { playStyleLabels } from './play-style'
import { describe, ranks, suitNames, symbols, uid } from './rules'
import { createStyleLessonGame, playStyleChoice, styleLessonAdvice, type StyleChoice } from './style-lesson-game'
import { StylePlayout } from './style-playout'
import { Icon, Modal, PlayingCard } from './ui'
import './style-lesson.css'

const choices: {id: StyleChoice; label: string}[] = [
  {id:'pass', label:'過牌'}, {id:'nine', label:'出 9'}, {id:'ace', label:'出 A'},
]

function PlayedCards({table,onClose}:{table:ReturnType<typeof publicTable>;onClose:()=>void}) {
  return <Modal title={'已出牌 · '+table.played.length+' 張'} onClose={onClose}>
    <div className="style-lab-record">{['S','H','C','D','J'].map(suit=>{
      const played = table.played.filter(card=>card.suit===suit)
      const order = suit==='J'?['SJ','BJ']:ranks
      return <section key={suit}>
        <h3>{symbols[suit]} {suitNames[suit] || '王牌'}</h3>
        <p>{order.flatMap(rank=>{
          const count = played.filter(card=>card.rank===rank).length
          const name = rank==='BJ'?'大王':rank==='SJ'?'小王':rank
          return count?[name+(count>1?'×'+count:'')]:[]
        }).join('、') || '尚未打出'}</p>
      </section>
    })}</div>
  </Modal>
}

export function StyleLesson({onComplete,onNext}:{onComplete:()=>void;onNext:()=>void}) {
  const [opening] = useState(createStyleLessonGame)
  const [attempt,setAttempt] = useState<{choice: StyleChoice; game: Match}|null>(null)
  const [role,setRole] = useState<PartnerId>(partners[0].id)
  const [playing,setPlaying] = useState(false)
  const [showRecord,setShowRecord] = useState(false)
  const table = useMemo(()=>publicTable(opening),[opening])
  const advice = useMemo(()=>attempt ? styleLessonAdvice(opening,role) : null,[opening,role,attempt])
  const person = partners.find(person=>person.id===role)!
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

  const choiceLabel = choices.find(item=>item.id===attempt?.choice)?.label
  const suggestion = advice?.move?'出 '+describe(advice.move.cards):'過牌'
  const dialogue = advice?.reason ?? '換你坐我的位置。搭檔的 8 現在最大，但下家只剩一張。你會過牌、出 9，還是出 A？'
  const cutaway = <div className="lesson-table style-lab-cutaway">
    <div className="lesson-table-heading"><h3>搭檔目前最大</h3><span>級牌 <b>{opening.level}</b></span></div>
    <div className="lesson-trick">{opening.target?.cards.map(card=><PlayingCard key={uid(card)} card={card} level={opening.level} mini/>)}</div>
  </div>
  return <>
    <LessonGuide dialogue={{left:role,right:role,lines:[{speaker:'left',text:dialogue}]}}
      tone="guide" done={false} cue={'style-lab-'+(attempt?.choice??'opening')+'-'+role} table={cutaway}/>
    <section className="lesson-practice style-lab" aria-label="三種牌風比較">
      <div className="lesson-context">
        <div className="style-lab-heading"><h3><Icon name="cards" size={17}/>這一圈</h3>
          <button type="button" className="style-lab-history" onClick={()=>setShowRecord(true)}>查看已出牌</button>
        </div>
        <dl className="style-lab-seats">
          <div><dt>搭檔</dt><dd><b>{table.counts[0]}</b> 張</dd><dd>已出 ♠8</dd></div>
          <div><dt>上家對手</dt><dd><b>{table.counts[1]}</b> 張</dd><dd>已過牌</dd></div>
          <div><dt>下家對手</dt><dd><b>{table.counts[3]}</b> 張</dd><dd>在你之後</dd></div>
        </dl>
      </div>
      {attempt ? <div className="lesson-hand style-lab-compare">
        <div className="style-lab-personal"><span>你的選擇</span><strong>{choiceLabel}</strong></div>
        <h3>比較進階角色的出牌</h3>
        <div className="style-lab-switch" role="group" aria-label="切換進階角色">
          {partners.map(actor=><button key={actor.id} type="button" aria-pressed={role===actor.id}
            onClick={()=>setRole(actor.id)}>{actor.name}</button>)}
        </div>
        <div className="style-lab-verdict" aria-live="polite">
          <span>{person.name} · {playStyleLabels[person.playStyle]}</span><strong>{suggestion}</strong>
        </div>
        <div className="style-lab-handline" aria-label="出牌前的手牌">{hand.map(card=>
          <span key={uid(card)} data-play={advice?.move?.cards.some(played=>uid(played)===uid(card)) || undefined}>{describe([card])}</span>)}</div>
        <div className="lesson-actions">
          <button className="btn border" type="button" onClick={retry}>重新選擇</button>
          <button className="btn gold" type="button" onClick={()=>setPlaying(true)}>照我的選擇續打</button>
        </div>
      </div> : <div className="lesson-hand">
        <div className="lesson-hand-heading"><h3>你的手牌</h3><span>{hand.length} 張</span></div>
        <div className="lesson-rack" style={{'--hand-count':hand.length} as CSSProperties}>
          {hand.map(card=><PlayingCard key={uid(card)} card={card} level={opening.level}/>)}
        </div>
        <div className="lesson-actions style-lab-choices" role="group" aria-label="選擇這一手">
          {choices.map(item=><button type="button" className="btn border" key={item.id} onClick={()=>choose(item.id)}>{item.label}</button>)}
        </div>
      </div>}
    </section>
    {showRecord && <PlayedCards table={table} onClose={()=>setShowRecord(false)}/>}
  </>
}
